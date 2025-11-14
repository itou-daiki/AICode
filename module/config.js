// module/config.js
// アプリケーション全体の設定を管理

/**
 * API関連の設定
 */
export const API_CONFIG = {
  // Gemini APIのエンドポイント
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent',

  // APIリクエストのタイムアウト（ミリ秒）
  REQUEST_TIMEOUT: 30000,

  // リトライ設定
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 初回リトライまでの待機時間（ms）
};

/**
 * Pyodide関連の設定
 */
export const PYODIDE_CONFIG = {
  INDEX_URL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/',
  VERSION: 'v0.23.4',
};

/**
 * エディタ関連の設定
 */
export const EDITOR_CONFIG = {
  MODE: 'python',
  LINE_NUMBERS: true,
  INDENT_UNIT: 4,
  TAB_SIZE: 4,
  LINE_WRAPPING: false,
};

/**
 * コード補完関連の設定
 */
export const COMPLETION_CONFIG = {
  // デバウンス時間（ミリ秒）
  DEBOUNCE_DELAY: 500,

  // キャッシュサイズ
  CACHE_SIZE: 50,

  // デフォルトの補完モード
  DEFAULT_MODE: 'inline-only',

  // 最小コンテキスト文字数
  MIN_CONTEXT_LENGTH: 2,

  // 最大候補数
  MAX_SUGGESTIONS: 5,
};

/**
 * ローカルストレージのキー
 */
export const STORAGE_KEYS = {
  API_KEY: 'gemini_api_key',
};

/**
 * UI関連の設定
 */
export const UI_CONFIG = {
  // 問題読み込みのパス
  PROBLEMS_INDEX_PATH: 'problems/index.json',
  PROBLEMS_DIR: 'problems',

  // アニメーション時間
  ANIMATION_DURATION: 100,
};
