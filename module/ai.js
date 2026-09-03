// module/ai.js
import { API_CONFIG, STORAGE_KEYS } from './config.js';

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
 * 問題の解説をもらう
 * @param {object} problem 今の問題
 * @returns {Promise<string>}
 */
export async function explainProblem(problem) {
  if (!problem) return '問題が読み込まれていません。';
  const prompt = `次の問題を簡潔に解説してください。3-4文程度で要点をまとめてください。\n`
    + `タイトル: ${problem.title}\n説明: ${problem.description}`;
  return callGemini(prompt, 300);
}

/**
 * 書いたコードを見てもらう
 * @param {string} code
 * @param {object} [context] { problem, free }
 * @returns {Promise<string>}
 */
export async function reviewCode(code, context = {}) {
  const prompt = context.free
    ? `次のPythonコードをレビューしてください。コードの品質、構造、書き方についてアドバイスしてください。\n\nコード:\n${code}`
    : `次のPythonコードを簡潔にレビューしてください。良い点1つと改善点1つを短く指摘してください。\n${code}`;
  return callGemini(prompt, 300);
}

/** API キーが入っているか */
export function hasApiKey() {
  return Boolean(apiKey);
}

/**
 * Markdown をかんたんな HTML にする
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToHtml(markdown) {
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
export async function chatWithAI(message, context = {}) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      return "APIキーが設定されていません。上部のリンクからAPIキーを取得してください。";
    }

    // 現在のコードの内容を取得
    const currentCode = context.code || '';
    const isFreeCodingMode = Boolean(context.free);
    const currentProblem = context.problem || null;

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
 * コードを AI に直してもらう
 * @param {string} code
 * @param {object} [context] { problem, free }
 * @returns {Promise<string>} 直したコード（うまくいかなければ案内の文）
 */
export async function fixCode(code, context = {}) {
  if (!code.trim()) return '直すコードがありません。';
  if (!apiKey) return NO_KEY_MESSAGE;

  const problem = context.problem;
  const prompt = context.free || !problem
    ? `次の Python コードを、動くように直してください。説明は不要で、コードだけを出力してください。\n\n\`\`\`python\n${code}\n\`\`\``
    : `次の問題に合うように、Python コードを直してください。説明は不要で、コードだけを出力してください。\n`
      + `問題: ${problem.title}\n${problem.description}\n\n\`\`\`python\n${code}\n\`\`\``;

  const text = await callGemini(prompt, 500);
  const match = text.match(/\u0060\u0060\u0060(?:python)?\n([\s\S]*?)\u0060\u0060\u0060/);
  return (match ? match[1] : text).trim() + '\n';
}

// APIキーの入力欄は、どのページでも同じ id なので、ここで面倒を見る
window.addEventListener('DOMContentLoaded', initApiKeyForm);
