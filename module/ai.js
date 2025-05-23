// module/ai.js
import { currentProblem, editor } from './editor.js';

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
  const prompt = `次のPythonコードを簡潔にレビューしてください。良い点1つと改善点1つを短く指摘してください。\n${code}`;
  const text = await callGemini(prompt, 300);
  document.getElementById('review').innerHTML = markdownToHtml(text);
}

// MarkdownをシンプルなHTMLに変換する関数
function markdownToHtml(markdown) {
  return markdown
    .replace(/^# (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// チャット機能
export async function chatWithAI(message) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      return "APIキーが設定されていません。上部のリンクからAPIキーを取得してください。";
    }

    // チャット用のプロンプト（短い回答を促す）
    const chatPrompt = `あなたはプログラミング学習をサポートするアシスタントです。質問に対して簡潔に1-2文で答えてください。マークダウンは使わず、プレーンテキストで回答してください。\n\n質問: ${message}`;

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
      
      // エディタとstdinを更新
      editor.setValue(problemData.template || '');
      document.getElementById('stdin').value = problemData.input.replace(/\\n/g, '\n') || '';
      
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

// 問題生成ボタンのイベントリスナーを追加
window.addEventListener('DOMContentLoaded', () => {
  const generateButton = document.getElementById('btn-generate-problem');
  if (generateButton) {
    generateButton.addEventListener('click', generateNewProblem);
  }
});
