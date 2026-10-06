// module/ai.js
import { API_CONFIG, STORAGE_KEYS } from './config.js';

// APIキーの管理
// 共有の学校 PC では localStorage が使えない（管理された Chromebook などで禁止）ことがあり、
// import した時点で例外になると、このファイルを読み込む全ページが動かなくなる。
// そのため読み書きはすべて try/catch で包み、キーは使う時に読む（import 時には触らない）。
// 保存できないときは、このタブを開いている間だけ覚えておく。
let memoryKey = '';

function readStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
  } catch (e) {
    return memoryKey;
  }
}

/** API キーを返す（なければ空文字） */
export function getApiKey() {
  return readStoredKey();
}

/** API キーを保存する。空なら削除する。 */
export function setApiKey(key) {
  const value = String(key || '').trim();
  if (!value) {
    clearApiKey();
    return;
  }
  memoryKey = value;
  try {
    localStorage.setItem(STORAGE_KEYS.API_KEY, value);
  } catch (e) {
    // 保存できなくても、このタブの間は使える
  }
}

/** API キーを消す（共有 PC で使い終わったときに） */
export function clearApiKey() {
  memoryKey = '';
  try {
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
  } catch (e) {
    // 消せるものが無いだけなので、何もしない
  }
}

// チャット履歴
let chatHistory = [];

/**
 * APIキー保存処理の初期化
 */
function initApiKeyForm() {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-api-key');
  const statusDiv = document.getElementById('api-key-status');

  // このページに入力欄が無いこともある（置いていない画面がある）
  if (!apiKeyInput || !saveButton || !statusDiv) return;

  // 保存済みのAPIキーがあれば表示
  const saved = getApiKey();
  if (saved) {
    apiKeyInput.value = saved;
    statusDiv.textContent = '設定ずみ';
    statusDiv.className = 'muted';
  }

  // 保存ボタンのイベントリスナー。空で保存すると、キーを消す。
  saveButton.addEventListener('click', () => {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
      setApiKey(newApiKey);
      statusDiv.textContent = '保存しました';
    } else {
      clearApiKey();
      apiKeyInput.value = '';
      statusDiv.textContent = 'キーを消しました';
    }
    statusDiv.className = 'muted';
  });
}

export const NO_KEY_MESSAGE =
  'AI を使うには Gemini の API キーが必要です。\n'
  + '左の「設定」（03 スケッチでは「AI にきく」）でキーを入れると使えるようになります。\n'
  + '（キーが無くても、実行・ブロック・フローチャート・コード補完はすべて使えます）';

/** AI の呼び出しに失敗したときの例外。message は生徒にそのまま見せてよい日本語。 */
export class AiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

// 直近の失敗理由。null を返す関数（fixCode）の呼び出し側が、理由を見せるために使う
let lastError = '';
export function getLastAiError() {
  return lastError;
}

/** HTTP の状態から、生徒向けの説明を作る */
function messageForStatus(status, apiMessage) {
  if (status === 429) return 'AI の利用回数の上限に達しました。しばらく待ってから、もう一度ためしてください。';
  if (status === 403 || (status === 400 && /api key|API_KEY/i.test(apiMessage))) {
    return 'API キーが正しくないようです。設定でキーを確かめてください。';
  }
  if (status === 404) return 'AI のモデルが見つかりません（設定の更新が必要です）。先生に伝えてください。';
  if (status >= 500) return 'AI のサーバーが混み合っているようです。しばらく待ってから、もう一度ためしてください。';
  return 'AI にうまく伝わりませんでした。もう一度ためしてください。';
}

const BLOCKED_MESSAGE = '学校のネットワークで AI への接続が止められている可能性があります。';

/**
 * Gemini API に 1 回問い合わせる（callGemini と chatWithAI の共通部分）。
 * 失敗したら AiError を投げる。成功したときだけ { text, truncated } を返す。
 * キーは URL ではなくヘッダーで送る（学校のプロキシは URL を記録することがあるため）。
 */
async function requestGemini(prompt, maxTokens) {
  const apiKey = getApiKey();
  // APIキーがないときは、それをそのまま伝える。
  // 以前はもっともらしい作り話（デモ）を返していたが、
  // 学習者が「AI が自分のコードを読んで言った」と受け取ってしまうため、やめた。
  if (!apiKey) throw new AiError(NO_KEY_MESSAGE, 'no-key');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);

  try {
    let response;
    try {
      response = await fetch(API_CONFIG.GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          // 新しいモデルは、考える分の字数もここから使う。少なすぎると返事が空になるので下限を設ける
          generationConfig: { temperature: 0.7, maxOutputTokens: Math.max(maxTokens, 2048) }
        }),
        signal: controller.signal
      });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new AiError('AI の返事が遅いため、待つのをやめました。もう一度ためしてください。', 'timeout');
      }
      throw new AiError('インターネットにつながっていないようです。', 'offline');
    }

    // 学校のプロキシなどが HTML を返すと JSON として読めない
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      if (!data) throw new AiError(BLOCKED_MESSAGE, 'blocked');
      throw new AiError(messageForStatus(response.status, data.error?.message || ''), 'http-' + response.status);
    }
    if (!data) throw new AiError(BLOCKED_MESSAGE, 'blocked');

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('予期しないレスポンス形式:', data);
      throw new AiError('AI からの返事を読み取れませんでした。もう一度ためしてください。', 'empty');
    }
    return { text, truncated: candidate.finishReason === 'MAX_TOKENS' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Gemini APIを呼び出す
 * 失敗したときは、生徒向けの日本語メッセージをもった AiError を投げる。
 * （以前は「エラー: …」という文字列を返していたため、呼び出し側がそれを
 *  コードや補完の候補として使ってしまう事故があった）
 * @param {string} prompt プロンプト
 * @param {number} maxTokens 最大トークン数
 * @returns {Promise<string>} AIの返事（成功したときだけ）
 */
export async function callGemini(prompt, maxTokens = 500) {
  try {
    const { text } = await requestGemini(prompt, maxTokens);
    lastError = '';
    return text;
  } catch (e) {
    lastError = e.message;
    console.error('AI呼び出しエラー', e);
    throw e;
  }
}

/** 画面に文章として見せる関数用: 失敗しても投げず、メッセージの文章を返す */
async function askForDisplay(prompt, maxTokens) {
  try {
    return await callGemini(prompt, maxTokens);
  } catch (e) {
    return e.message;
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
  return askForDisplay(prompt, 300);
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
  return askForDisplay(prompt, 300);
}

/** API キーが入っているか */
export function hasApiKey() {
  return Boolean(getApiKey());
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
  // 画面に見せる文章を返す関数なので、失敗しても投げず、理由の文章を返す
  if (!hasApiKey()) return NO_KEY_MESSAGE;

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

  return askForDisplay(chatPrompt, 150);
}

/**
 * コードを AI に直してもらう
 * 戻り値はエディタに書きこまれる。そのため、失敗したときは文章を返さず null を返す
 * （失敗の理由は getLastAiError() で読める）。
 * コードとして返すのは、``` で囲まれたコードを受け取れたときだけ。
 * @param {string} code
 * @param {object} [context] { problem, free }
 * @returns {Promise<string|null>} 直したコード。うまくいかなければ null
 */
export async function fixCode(code, context = {}) {
  if (!code.trim()) { lastError = '直すコードがありません。'; return null; }

  const problem = context.problem;
  const prompt = context.free || !problem
    ? `次の Python コードを、動くように直してください。説明は不要で、コードだけを出力してください。\n\n\`\`\`python\n${code}\n\`\`\``
    : `次の問題に合うように、Python コードを直してください。説明は不要で、コードだけを出力してください。\n`
      + `問題: ${problem.title}\n${problem.description}\n\n\`\`\`python\n${code}\n\`\`\``;

  try {
    // 長いコードが途中で切れたまま書きこまれないよう、余裕をもたせる
    const { text, truncated } = await requestGemini(prompt, 1500);
    const match = text.match(/\u0060\u0060\u0060[\w+-]*[ \t]*\r?\n([\s\S]*?)\u0060\u0060\u0060/);
    if (truncated || !match || !match[1].trim()) {
      lastError = 'AI がコードをうまく返せませんでした。もう一度ためしてください。';
      return null;
    }
    lastError = '';
    return match[1].trim() + '\n';
  } catch (e) {
    lastError = e.message;
    console.error('AI呼び出しエラー', e);
    return null;
  }
}

// APIキーの入力欄は、どのページでも同じ id なので、ここで面倒を見る。
// このファイルが後から読みこまれることもあるので、その場合はすぐ動かす。
if (typeof document === 'undefined') {
  // DOM が無い環境（node のテスト）では何もしない
} else if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApiKeyForm);
} else {
  initApiKeyForm();
}
