// module/ai.js
import { currentProblem, editor, isFreeCodingMode } from './editor.js';

// Gemini APIの設定
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
let apiKey = localStorage.getItem('gemini_api_key') || '';

// チャット履歴
let chatHistory = [];

// APIキー保存処理の初期化
function initApiKeyForm() {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-api-key');
  const statusDiv = document.getElementById('api-key-status');
  
  // 保存済みのAPIキーがあれば表示
  if (apiKey) {
    apiKeyInput.value = apiKey;
    statusDiv.textContent = '✓ 設定済み';
    statusDiv.style.color = 'green';
  }
  
  // 保存ボタンのイベントリスナー
  saveButton.addEventListener('click', () => {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
      apiKey = newApiKey;
      localStorage.setItem('gemini_api_key', apiKey);
      statusDiv.textContent = '✓ 保存しました';
      statusDiv.style.color = 'green';
    } else {
      statusDiv.textContent = '⚠ 入力してください';
      statusDiv.style.color = 'red';
    }
  });
}

// ページ読み込み時にAPIキーフォームを初期化
window.addEventListener('DOMContentLoaded', initApiKeyForm);

async function callGemini(prompt, maxTokens = 500) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      const demoResponses = {
        'explain': `# ${currentProblem.title} の解説

この問題は${currentProblem.description}を解決します。

**ポイント:**
- 入力を正しく受け取る
- 適切な処理を行う
- 結果を出力する

シンプルに考えて実装しましょう！`,
        
        'review': `# コードレビュー

**良い点:**
- 基本的な構造ができています

**改善点:**
- エラー処理を追加しましょう
- コメントを追加すると良いでしょう

頑張ってください！`,

        'chat': 'わかりました。具体的にどの部分について質問がありますか？',

        'problem': `{
  "title": "数値の合計",
  "description": "2つの整数を入力し、その合計を出力してください。",
  "input": "3\\n5",
  "expected": "8",
  "template": "# 2つの数値を入力\\na = int(input())\\nb = int(input())\\n\\n# 合計を計算して出力\\n"
}`
      };

      // デモレスポンスを返す
      if (prompt.includes('解説')) {
        return demoResponses.explain;
      } else if (prompt.includes('レビュー')) {
        return demoResponses.review;
      } else if (prompt.includes('新しい問題')) {
        return demoResponses.problem;
      } else {
        return demoResponses.chat;
      }
    }

    // APIキーがある場合は実際にGemini APIを呼び出す
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || response.statusText);
    }
    
    // レスポンスからテキストを抽出
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error('予期しないレスポンス形式:', data);
      return 'APIからの応答を処理できませんでした。';
    }
  } catch (e) {
    console.error('AI呼び出しエラー', e);
    return `エラー: ${e.message}`;
  }
}

export async function explainProblem() {
  document.getElementById('explanation').textContent = '生成中...';
  const prompt = `次の問題を簡潔に解説してください。3-4文程度で要点をまとめてください。\nタイトル: ${currentProblem.title}\n説明: ${currentProblem.description}`;
  const text = await callGemini(prompt, 300);
  document.getElementById('explanation').innerHTML = markdownToHtml(text);
}

export async function reviewCode() {
  document.getElementById('review').textContent = '生成中...';
  const code = editor.getValue();
  
  let prompt;
  if (isFreeCodingMode) {
    prompt = `次のPythonコードをレビューしてください。フリーコーディングモードなので、コードの品質、構造、ベストプラクティスについてアドバイスしてください。\n\nコード:\n${code}`;
  } else {
    prompt = `次のPythonコードを簡潔にレビューしてください。良い点1つと改善点1つを短く指摘してください。\n${code}`;
  }
  
  const text = await callGemini(prompt, 300);
  document.getElementById('review').innerHTML = markdownToHtml(text);
}

// MarkdownをシンプルなHTMLに変換する関数（改良版）
function markdownToHtml(markdown) {
  // まず、コードブロックを一時的に置換
  const codeBlocks = [];
  let processedMarkdown = markdown.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  
  // 通常の変換処理
  processedMarkdown = processedMarkdown
    .replace(/^# (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h4>$1</h4>')
    .replace(/^### (.*$)/gm, '<h5>$1</h5>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // リスト項目の処理
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/^\* (.*$)/gm, '<li>$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
    // 段落の処理（2つ以上の改行で段落を分ける）
    .replace(/\n\n+/g, '</p><p>')
    // 単一の改行は<br>に変換
    .replace(/\n/g, '<br>');
  
  // 段落タグで囲む
  processedMarkdown = '<p>' + processedMarkdown + '</p>';
  
  // リスト項目を<ul>で囲む
  processedMarkdown = processedMarkdown.replace(/(<li>.*?<\/li>)(<br>)?/g, (match) => {
    return match.replace(/<br>$/, '');
  });
  processedMarkdown = processedMarkdown.replace(/(<li>.*?<\/li>)+/g, (match) => {
    return '<ul>' + match + '</ul>';
  });
  
  // コードブロックを元に戻す
  codeBlocks.forEach((block, index) => {
    processedMarkdown = processedMarkdown.replace(`__CODE_BLOCK_${index}__`, block);
  });
  
  // 空の段落を削除
  processedMarkdown = processedMarkdown.replace(/<p><\/p>/g, '');
  
  return processedMarkdown;
}

// チャット機能
export async function chatWithAI(message) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      return "APIキーが設定されていません。上部のリンクからAPIキーを取得してください。";
    }

    // 現在のコードの内容を取得
    const currentCode = editor.getValue();
    
    let chatPrompt;
    if (isFreeCodingMode) {
      // フリーコーディングモードの場合
      chatPrompt = `あなたはプログラミング学習をサポートするアシスタントです。現在はフリーコーディングモードです。

現在のコード:
${currentCode}

質問: ${message}

フリーコーディングモードでは、以下の点に注意してサポートしてください：
- コードの改善提案
- Pythonのベストプラクティス
- より効率的な実装方法
- エラーの解決方法
- 新しい機能の実装アイデア

学習者が自由に探求できるよう、建設的なアドバイスを提供してください。`;
    } else {
      // 通常モードの場合
      const problemContext = `
現在の問題:
タイトル: ${currentProblem.title}
説明: ${currentProblem.description}
入力例: ${currentProblem.input}
期待出力: ${currentProblem.expected}

現在のコード:
${currentCode}
`;

      chatPrompt = `あなたはプログラミング学習をサポートするアシスタントです。学習者の成長のため、直接的な答えは教えず、考え方のヒントや方向性を示してください。

以下の問題とコードのコンテキストを理解した上で、適切なヒントを提供してください：

${problemContext}

質問: ${message}

重要な指示：
- 直接的な答えやコードは書かないでください
- 考え方のヒントや、注目すべきポイントを示してください
- エラーがある場合は、エラーの意味を説明し、どこを見直すべきかヒントを与えてください
- 学習者が自分で解決できるよう導いてください`;
    }

    // APIリクエスト
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: chatPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 150
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || response.statusText);
    }
    
    // レスポンスからテキストを抽出
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error('予期しないレスポンス形式:', data);
      return 'APIからの応答を処理できませんでした。';
    }
  } catch (e) {
    console.error('チャットエラー', e);
    return `エラー: ${e.message}`;
  }
}

// 新しい問題を生成する関数
export async function generateNewProblem() {
  const button = document.getElementById('btn-generate-problem');
  button.textContent = '生成中...';
  button.disabled = true;
  
  try {
    const prompt = `プログラミング初学者向けのPython問題を1つ生成してください。以下のJSON形式で出力してください：
{
  "title": "問題のタイトル",
  "description": "問題の説明文",
  "input": "入力例（改行は\\nで表現）",
  "expected": "期待される出力",
  "template": "初期コードテンプレート（コメント付き）"
}

基本的な入出力、条件分岐、ループなどの基礎的な内容にしてください。`;

    const text = await callGemini(prompt, 800);
    
    // JSON部分を抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const problemData = JSON.parse(jsonMatch[0]);
      
      // 生成された問題を表示
      document.getElementById('problem-content').innerHTML =
        `<h3>${problemData.title}</h3>
         <p>${problemData.description}</p>
         <h4>入力例</h4><pre>${problemData.input.replace(/\\n/g, '\n')}</pre>
         <h4>期待出力</h4><pre>${problemData.expected}</pre>`;
      
      // エディタを更新
      editor.setValue(problemData.template || '');
      
      // 現在の問題を更新
      currentProblem.title = problemData.title;
      currentProblem.description = problemData.description;
      currentProblem.input = problemData.input.replace(/\\n/g, '\n');
      currentProblem.expected = problemData.expected;
      currentProblem.template = problemData.template;
      
      // ラベルを更新
      document.getElementById('current-problem-label').textContent = 'AI生成問題';
    } else {
      throw new Error('問題の生成に失敗しました');
    }
  } catch (e) {
    console.error('問題生成エラー', e);
    alert('問題の生成に失敗しました: ' + e.message);
  } finally {
    button.textContent = 'AIで新しい問題を生成する';
    button.disabled = false;
  }
}

// 正誤判定機能
export async function checkAnswer() {
  const resultDiv = document.getElementById('check-result');
  resultDiv.textContent = '判定中...';
  
  // 実行結果を取得
  const actualOutput = document.getElementById('output').textContent.trim();
  const expectedOutput = currentProblem.expected.trim();
  const code = editor.getValue();
  
  const prompt = `次のPythonコードが問題の要求を満たしているか判定してください。

問題: ${currentProblem.title}
説明: ${currentProblem.description}
期待される出力: ${expectedOutput}

提出されたコード:
${code}

実際の出力:
${actualOutput}

以下の観点で評価してください：
1. 出力が期待される結果と一致しているか
2. コードが問題の要求を満たしているか
3. 良い点と改善点

簡潔に判定結果を出力してください。正解の場合は「✅ 正解です！」から始め、不正解の場合は「❌ 不正解です」から始めてください。`;

  const text = await callGemini(prompt, 400);
  resultDiv.innerHTML = markdownToHtml(text);
}

// 問題生成ボタンのイベントリスナーを追加
window.addEventListener('DOMContentLoaded', () => {
  const generateButton = document.getElementById('btn-generate-problem');
  if (generateButton) {
    generateButton.addEventListener('click', generateNewProblem);
  }
  
  const checkButton = document.getElementById('btn-check-answer');
  if (checkButton) {
    checkButton.addEventListener('click', checkAnswer);
  }
});
