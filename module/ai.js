// module/ai.js
import { appState } from './state.js';
import { API_CONFIG, STORAGE_KEYS } from './config.js';
import { sameOutput } from './grade.js';

// APIキーの管理
let apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';

// チャット履歴
let chatHistory = [];

/**
 * APIキー保存処理の初期化
 */
function initApiKeyForm() {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-api-key');
  const statusDiv = document.getElementById('api-key-status');

  if (!apiKeyInput || !saveButton || !statusDiv) {
    console.warn('APIキーフォームの要素が見つかりません');
    return;
  }

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
      localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
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

/**
 * Gemini APIを呼び出す
 * @param {string} prompt プロンプト
 * @param {number} maxTokens 最大トークン数
 * @returns {Promise<string>} APIレスポンス
 */
export const NO_KEY_MESSAGE =
  'AI を使うには Gemini の API キーが必要です。\n'
  + 'サイドバーの「AI 設定」でキーを入れると使えるようになります。\n'
  + '（キーが無くても、実行・ブロック・フローチャート・コード補完はすべて使えます）';

export async function callGemini(prompt, maxTokens = 500) {
  try {
    // APIキーがないときは、それをそのまま伝える。
    // 以前はもっともらしい作り話（デモ）を返していたが、
    // 学習者が「AI が自分のコードを読んで言った」と受け取ってしまうため、やめた。
    if (!apiKey) {
      return NO_KEY_MESSAGE;
    }

    // APIキーがある場合は実際にGemini APIを呼び出す
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${API_CONFIG.GEMINI_API_URL}?key=${apiKey}`, {
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
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error?.message || response.statusText;
        throw new Error(`API Error (${response.status}): ${errorMessage}`);
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
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('リクエストがタイムアウトしました');
      }
      throw fetchError;
    }
  } catch (e) {
    console.error('AI呼び出しエラー', e);
    return `エラー: ${e.message}`;
  }
}

/**
 * 問題の解説を生成
 */
export async function explainProblem() {
  const currentProblem = appState.getCurrentProblem();
  if (!currentProblem) {
    alert('問題が読み込まれていません');
    return;
  }

  document.getElementById('explanation').textContent = '生成中...';
  const prompt = `次の問題を簡潔に解説してください。3-4文程度で要点をまとめてください。\nタイトル: ${currentProblem.title}\n説明: ${currentProblem.description}`;
  const text = await callGemini(prompt, 300);
  document.getElementById('explanation').innerHTML = markdownToHtml(text);
}

/**
 * コードをレビュー
 */
export async function reviewCode() {
  document.getElementById('review').textContent = '生成中...';
  const code = appState.getEditor().getValue();
  const isFreeCodingMode = appState.getIsFreeCodingMode();

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

/**
 * チャット機能
 * @param {string} message ユーザーからのメッセージ
 * @returns {Promise<string>} AIの応答
 */
export async function chatWithAI(message) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      return "APIキーが設定されていません。上部のリンクからAPIキーを取得してください。";
    }

    // 現在のコードの内容を取得
    const currentCode = appState.getEditor().getValue();
    const isFreeCodingMode = appState.getIsFreeCodingMode();
    const currentProblem = appState.getCurrentProblem();

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
タイトル: ${currentProblem?.title || 'なし'}
説明: ${currentProblem?.description || 'なし'}
入力例: ${currentProblem?.input || 'なし'}
期待出力: ${currentProblem?.expected || 'なし'}

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

    // APIリクエスト（タイムアウト付き）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${API_CONFIG.GEMINI_API_URL}?key=${apiKey}`, {
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
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

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
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('リクエストがタイムアウトしました');
      }
      throw fetchError;
    }
  } catch (e) {
    console.error('チャットエラー', e);
    return `エラー: ${e.message}`;
  }
}

/**
 * 新しい問題を生成する関数
 */
export async function generateNewProblem() {
  const button = document.getElementById('btn-generate-problem');
  if (!button) return;

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
      const problemContent = document.getElementById('problem-content');
      if (problemContent) {
        problemContent.innerHTML =
          `<h3>${problemData.title}</h3>
           <div class="problem-layout">
             <div class="problem-description">
               <p>${problemData.description}</p>
             </div>
             <div class="problem-examples">
               <h4>入力例</h4><pre>${problemData.input.replace(/\\n/g, '\n')}</pre>
               <h4>期待出力</h4><pre>${problemData.expected}</pre>
             </div>
           </div>`;
      }

      // エディタを更新
      appState.getEditor().setValue(problemData.template || '');

      // 現在の問題を更新
      const newProblem = {
        title: problemData.title,
        description: problemData.description,
        input: problemData.input.replace(/\\n/g, '\n'),
        expected: problemData.expected,
        template: problemData.template
      };
      appState.setCurrentProblem(newProblem);

      // ラベルを更新
      const label = document.getElementById('current-problem-label');
      if (label) {
        label.textContent = 'AI生成問題';
      }
    } else if (text === NO_KEY_MESSAGE) {
      alert(NO_KEY_MESSAGE);
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

/**
 * AIコード修正機能
 */
export async function fixCode() {
  const button = document.getElementById('ai-fix-code');
  if (!button) return;

  const originalText = button.textContent;
  button.textContent = '修正中...';
  button.disabled = true;

  try {
    const code = appState.getEditor().getValue();
    const isFreeCodingMode = appState.getIsFreeCodingMode();
    const currentProblem = appState.getCurrentProblem();

    if (!code.trim()) {
      alert('修正するコードを入力してください。');
      return;
    }

    let prompt;
    if (isFreeCodingMode) {
      // フリーコーディングモードの場合
      prompt = `以下のPythonコードを分析し、より良いコードに修正してください。コードの意図を保ちながら、以下の観点で改善してください：

1. 可読性の向上
2. 効率性の改善
3. Pythonらしい書き方（Pythonic）
4. エラー処理の追加
5. コメントの改善

元のコード:
\`\`\`python
${code}
\`\`\`

修正版のコードのみを出力してください（説明は不要）。`;
    } else {
      // 問題解決モードの場合
      if (!currentProblem) {
        alert('問題が読み込まれていません。');
        return;
      }

      prompt = `以下は「${currentProblem.title}」の問題を解くPythonコードです。コードの意図を理解し、より効率的で読みやすく、正確な解答に修正してください。

問題: ${currentProblem.description}
入力例: ${currentProblem.input}
期待出力: ${currentProblem.expected}

現在のコード:
\`\`\`python
${code}
\`\`\`

修正版のコードのみを出力してください（説明は不要）。問題の要求を満たすことを最優先にしてください。`;
    }

    const fixedCode = await callGemini(prompt, 500);

    // コードブロックから実際のコードを抽出
    let cleanedCode = fixedCode;
    const codeMatch = fixedCode.match(/```python\n([\s\S]*?)\n```/);
    if (codeMatch) {
      cleanedCode = codeMatch[1];
    } else {
      // ```で囲まれていない場合は、そのまま使用
      cleanedCode = fixedCode.replace(/```/g, '').trim();
    }

    // エディタに修正されたコードを設定
    appState.getEditor().setValue(cleanedCode);

  } catch (error) {
    console.error('コード修正エラー:', error);
    alert('コードの修正中にエラーが発生しました: ' + error.message);
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

/**
 * 正誤判定
 *
 * 期待される出力は問題ファイルに書いてあるので、AI を使わずに判定する。
 * APIキーがあるときだけ、そのあとに一言コメントを足す。
 */
export async function checkAnswer() {
  const resultDiv = document.getElementById('check-result');
  if (!resultDiv) return;

  const currentProblem = appState.getCurrentProblem();
  if (!currentProblem) {
    alert('問題が読み込まれていません。');
    return;
  }

  resultDiv.style.display = 'block';

  const outputEl = document.getElementById('output');
  const actualOutput = outputEl ? outputEl.textContent.trim() : '';
  const expectedOutput = String(currentProblem.expected ?? '').trim();

  if (!actualOutput) {
    resultDiv.innerHTML = '<p>まず「▶ 実行」を押して、出力を出してから答え合わせをしましょう。</p>';
    return;
  }

  const correct = sameOutput(actualOutput, expectedOutput);
  const escape = (text) => String(text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  resultDiv.innerHTML = correct
    ? '<p><strong>✅ 正解です！</strong></p>'
    : `<p><strong>❌ もう少しです</strong></p>
       <p>期待される出力</p><pre>${escape(expectedOutput)}</pre>
       <p>あなたの出力</p><pre>${escape(actualOutput)}</pre>`;

  // ここから先は、あってもなくてもよい助言。キーが無ければ何も足さない。
  if (!apiKey) return;

  const note = document.createElement('div');
  note.textContent = 'ひとことコメントをもらっています…';
  resultDiv.appendChild(note);

  try {
    const text = await callGemini(
      `Python を学びはじめた人へ、2文までの短い助言をください。説明は日本語で。\n`
      + `問題: ${currentProblem.title}\n`
      + `${correct ? '正解しています。次に試すとよいことを1つ。' : 'まだ正解ではありません。どこを見直すとよいかを1つ。'}\n\n`
      + `提出されたコード:\n${appState.getEditor().getValue()}\n\n実際の出力:\n${actualOutput}`,
      200,
    );
    note.innerHTML = markdownToHtml(text);
  } catch (error) {
    note.remove();
  }
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
