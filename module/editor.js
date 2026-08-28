// module/editor.js
import { CodeCompletionEngine } from './completion.js';
import { autoIndent, formatCode as formatPython } from './pyformat.js';
import { initSidebar, toast } from './ui.js';
import { chatWithAI } from './ai.js';
import { runUserCode, explainError } from './pyrun.js';
import { appState } from './state.js';
import { PYODIDE_CONFIG, EDITOR_CONFIG, UI_CONFIG } from './config.js';

// AIモジュールの関数を動的にインポート（循環依存を回避）
let aiModule = null;

let completionEngine;
let problemFiles = [];
let currentProblemIndex = 0;
let isWaitingForInput = false;
let inputCallback = null;

/**
 * コードを整形してエディタに書き戻す
 * @param {CodeMirror} cm CodeMirrorインスタンス
 * @param {(code: string) => string} transform 整形する関数
 */
function applyFormat(cm, transform) {
  const before = cm.getValue();
  const after = transform(before);
  if (before === after) return;

  const cursor = cm.getCursor();
  const scroll = cm.getScrollInfo();
  cm.setValue(after);
  cm.setCursor({ line: Math.min(cursor.line, cm.lineCount() - 1), ch: cursor.ch });
  cm.scrollTo(scroll.left, scroll.top);
}

/**
 * Pythonコードを整形する（字下げ・記号まわりの空白・空行）
 * @param {CodeMirror} cm CodeMirrorインスタンス
 */
function formatCode(cm) {
  applyFormat(cm, formatPython);
}

/**
 * 字下げだけをそろえる
 * @param {CodeMirror} cm CodeMirrorインスタンス
 */
function indentCode(cm) {
  applyFormat(cm, autoIndent);
}

/**
 * タブキーの動作を改善
 * 選択範囲がある場合はインデント、ない場合は通常のタブ
 * @param {CodeMirror} cm CodeMirrorインスタンス
 */
function betterTab(cm) {
  if (cm.somethingSelected()) {
    cm.indentSelection('add');
  } else {
    cm.replaceSelection('    ', 'end');
  }
}

/**
 * AIモジュールを遅延読み込み
 */
async function loadAIModule() {
  if (!aiModule) {
    aiModule = await import('./ai.js');
  }
  return aiModule;
}

/**
 * 問題一覧を index.json から取得
 * @returns {Promise<string[]>} 問題ファイルのパス配列
 */
async function fetchProblemFiles() {
  try {
    const res = await fetch(UI_CONFIG.PROBLEMS_INDEX_PATH);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const list = await res.json();
    return list.map(name => `${UI_CONFIG.PROBLEMS_DIR}/${name}`);
  } catch (e) {
    console.error('問題一覧の読み込みに失敗:', e);
    // ユーザーにエラーを通知
    const problemContent = document.getElementById('problem-content');
    if (problemContent) {
      problemContent.innerHTML = `<p style="color: red;">問題の読み込みに失敗しました: ${e.message}</p>`;
    }
    return [];
  }
}

/**
 * 問題を読み込み
 * @param {number} idx 問題のインデックス
 */
async function loadProblem(idx) {
  try {
    currentProblemIndex = idx;
    const res = await fetch(problemFiles[idx]);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    appState.setCurrentProblem(data);

    document.getElementById('problem-content').innerHTML =
      `<h3>${data.title}</h3>
       <div class="problem-layout">
         <div class="problem-description">
           <p>${data.description}</p>
         </div>
         <div class="problem-examples">
           <h4>入力例</h4><pre>${data.input}</pre>
           <h4>期待出力</h4><pre>${data.expected}</pre>
         </div>
       </div>`;
    appState.getEditor().setValue(data.template || '');

    // ナビゲーションボタンの状態を更新
    document.getElementById('prev-problem').disabled = idx === 0;
    document.getElementById('next-problem').disabled = idx === problemFiles.length - 1;
    document.getElementById('current-problem-label').textContent = `問題${idx + 1}`;
  } catch (e) {
    console.error('問題の読み込みに失敗:', e);
    document.getElementById('problem-content').innerHTML =
      `<p style="color: red;">問題の読み込みに失敗しました: ${e.message}</p>`;
  }
}

// 前の問題に移動
async function goToPrevProblem() {
  if (currentProblemIndex > 0) {
    await loadProblem(currentProblemIndex - 1);
  }
}

// 次の問題に移動
async function goToNextProblem() {
  if (currentProblemIndex < problemFiles.length - 1) {
    await loadProblem(currentProblemIndex + 1);
  }
}

// 実行時入力フォームの処理
function setupRuntimeInput() {
  const container = document.getElementById('runtime-input-container');
  const input = document.getElementById('runtime-input');
  const submit = document.getElementById('runtime-input-submit');
  
  submit.addEventListener('click', () => {
    if (isWaitingForInput && inputCallback) {
      const value = input.value;
      input.value = '';
      container.style.display = 'none';
      isWaitingForInput = false;
      
      // 入力値を出力に追加
      const outputEl = document.getElementById('output');
      outputEl.textContent += value + '\n';
      
      // コールバックを実行
      inputCallback(value);
      inputCallback = null;
    }
  });
  
  // Enterキーでも送信
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submit.click();
    }
  });
}

// Python の input() を、ブラウザの入力欄に置きかえる
function createCustomInput(outputEl) {
  // input("名前は？") の「名前は？」を、出力と入力欄の両方に出す。
  // これが無いと、何を聞かれているのか分からないまま入力することになる。
  return function (prompt = '') {
    return new Promise((resolve) => {
      isWaitingForInput = true;
      inputCallback = resolve;

      const question = String(prompt ?? '');
      if (question) outputEl.textContent += question;
      const label = document.getElementById('runtime-input-label');
      if (label) label.textContent = question || '値を入力';

      document.getElementById('runtime-input-container').style.display = 'block';
      document.getElementById('runtime-input').focus();
    });
  };
}

/**
 * コードを実行
 */
async function runCode() {
  const outputEl = document.getElementById('output');
  const runBtn = document.getElementById('run');
  if (runBtn.disabled) return;
  runBtn.disabled = true;
  const code = appState.getEditor().getValue();
  const pyodide = appState.getPyodide();
  
  // 実行時入力フォームを非表示
  document.getElementById('runtime-input-container').style.display = 'none';
  isWaitingForInput = false;
  inputCallback = null;

  try {
    // input() はブラウザの入力欄で受けるので、await に置きかえて動かす。
    // 行を増やさないので、エラーの行番号は学習者のコードと同じになる。
    outputEl.textContent = '';
    if (code.includes('input(')) {
      pyodide.globals.set('custom_input', createCustomInput(outputEl));
    }
    const source = code.replace(/\binput\(/g, 'await custom_input(');

    const result = await runUserCode(pyodide, source, { element: outputEl });
    if (result.error) {
      if (outputEl.textContent) outputEl.textContent += '\n';
      outputEl.textContent += explainError(result.error, code);
    } else if (!outputEl.textContent) {
      outputEl.textContent = '(出力なし)';
    }
  } catch (err) {
    outputEl.textContent += '\nエラー: ' + err;
  } finally {
    runBtn.disabled = false;
  }
}


/**
 * フリーコーディングモードに入る
 */
function enterFreeCodingMode() {
  appState.setFreeCodingMode(true);

  // フリーコーディングモードのクラスを追加
  document.body.classList.add('free-coding-mode');

  // 問題エリアを非表示
  document.getElementById('problem-area').style.display = 'none';

  // ナビゲーションボタンを無効化
  document.getElementById('prev-problem').disabled = true;
  document.getElementById('next-problem').disabled = true;
  document.getElementById('current-problem-label').textContent = 'フリーコーディング';

  // エディタをクリア
  appState.getEditor().setValue('# フリーコーディングモード\n# 自由にPythonコードを書いてみましょう！\n\n');

  // 現在の問題をフリーコーディング用に設定
  appState.setCurrentProblem({
    title: 'フリーコーディング',
    description: '自由にコードを書いて実行できます',
    input: '',
    expected: '',
    template: ''
  });

  // 問題がないので、正誤判定と解説は隠す
  for (const id of ['btn-check-answer', 'btn-explain']) {
    const button = document.getElementById(id);
    if (button) button.style.display = 'none';
  }

  // CodeMirrorのサイズをリフレッシュ
  setTimeout(() => {
    appState.getEditor().refresh();
  }, UI_CONFIG.ANIMATION_DURATION);
}

/**
 * 通常モードに戻る
 */
async function exitFreeCodingMode() {
  appState.setFreeCodingMode(false);

  // フリーコーディングモードのクラスを削除
  document.body.classList.remove('free-coding-mode');

  // 問題エリアを表示
  document.getElementById('problem-area').style.display = 'block';

  // 正誤判定と解説を表示に戻す
  for (const id of ['btn-check-answer', 'btn-explain']) {
    const button = document.getElementById(id);
    if (button) button.style.display = '';
  }

  // 最初の問題に戻る
  await loadProblem(0);

  // CodeMirrorのサイズをリフレッシュ
  setTimeout(() => {
    appState.getEditor().refresh();
  }, UI_CONFIG.ANIMATION_DURATION);
}

/** サイドバーのAIチャット */
function setupChat() {
  const input = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');
  if (!input || !messages) return;

  const add = (text, who) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-message ${who}-message`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };

  const send = async () => {
    const message = input.value.trim();
    if (!message) return;
    add(message, 'user');
    input.value = '';
    const pending = add('考えています…', 'ai');
    pending.textContent = await chatWithAI(message);
    messages.scrollTop = messages.scrollHeight;
  };

  document.getElementById('chat-send').addEventListener('click', send);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
}

/**
 * エディタとPyodideを初期化
 */
export async function initEditor() {
  try {
    // Pyodideを読み込み
    const pyodide = await loadPyodide({ indexURL: PYODIDE_CONFIG.INDEX_URL });

    // pyodideにJavaScriptオブジェクトへのアクセスを提供
    pyodide.globals.set('js', window);
    appState.setPyodide(pyodide);

    // CodeMirrorエディタを初期化
    const editor = CodeMirror.fromTextArea(document.getElementById('code'), {
      mode: EDITOR_CONFIG.MODE,
      lineNumbers: EDITOR_CONFIG.LINE_NUMBERS,
      indentUnit: EDITOR_CONFIG.INDENT_UNIT,
      tabSize: EDITOR_CONFIG.TAB_SIZE,
      lineWrapping: EDITOR_CONFIG.LINE_WRAPPING,
      smartIndent: true,
      electricChars: true,
      indentWithTabs: false,
      rulers: [4, 8, 12, 16, 20, 24, 28, 32].map(column => ({
        column, className: 'cm-indent-guide', lineStyle: 'solid',
      })),
      extraKeys: {
        'Ctrl-Space': 'autocomplete',
        'Ctrl-/': 'toggleComment',
        'Cmd-/': 'toggleComment',
        // CodeMirror はキー名を Shift-Ctrl-… の順に正規化するので、その順で書く
        'Shift-Ctrl-F': formatCode,
        'Shift-Cmd-F': formatCode,
        'Shift-Alt-F': formatCode,
        'Shift-Ctrl-I': indentCode,
        'Shift-Cmd-I': indentCode,
        'Shift-Alt-I': indentCode,
        'Tab': betterTab,
        'Shift-Tab': 'indentLess'
      }
    });
    appState.setEditor(editor);

  // コード補完エンジンを初期化
  completionEngine = new CodeCompletionEngine(editor);
  
  // テスト用デバッグを無効化（パフォーマンス改善）
  /*
  editor.on('change', (cm, change) => {
    console.log('エディタ change イベント:', change);
  });
  
  editor.on('inputRead', (cm, event) => {
    console.log('エディタ inputRead イベント（直接）:', event);
    
    // 手動で補完エンジンのメソッドを呼び出してテスト
    if (completionEngine && completionEngine.completionMode !== 'none') {
      console.log('手動で補完処理を呼び出し');
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const beforeCursor = line.substring(0, cursor.ch);
      
      if (beforeCursor.trim().length > 0) {
        console.log('手動補完テスト - beforeCursor:', beforeCursor);
        // 基本補完をテスト
        const suggestions = completionEngine.getBasicCompletions(beforeCursor);
        console.log('手動補完結果:', suggestions);
        
        if (suggestions.length === 1) {
          console.log('インライン表示テスト');
          completionEngine.showInlineSuggestion(suggestions[0], cursor);
        }
      }
    }
  });
  */

  problemFiles = await fetchProblemFiles();
  
  // 問題ナビゲーションボタンのイベントリスナーを設定
  document.getElementById('prev-problem').addEventListener('click', goToPrevProblem);
  document.getElementById('next-problem').addEventListener('click', goToNextProblem);
  
  // フリーコーディングボタンのイベントリスナー
  const freeCodingBtn = document.getElementById('free-coding');
  if (freeCodingBtn) {
    freeCodingBtn.addEventListener('click', () => {
      if (!appState.getIsFreeCodingMode()) {
        enterFreeCodingMode();
        freeCodingBtn.textContent = '📚 問題に戻る';
        freeCodingBtn.classList.add('btn-primary');
      } else {
        exitFreeCodingMode();
        freeCodingBtn.textContent = '✏️ フリーコーディング';
        freeCodingBtn.classList.remove('btn-primary');
      }
    });
  }

  if (problemFiles.length) await loadProblem(0);

  const runBtn = document.getElementById('run');
  runBtn.disabled = false;
  runBtn.addEventListener('click', runCode);

  // 整形ボタンの初期化
  document.getElementById('format-code').addEventListener('click', () => {
    formatCode(appState.getEditor());
    toast('コードを整えました');
  });
  document.getElementById('auto-indent').addEventListener('click', () => {
    indentCode(appState.getEditor());
    toast('字下げをそろえました');
  });

  // AIコード修正ボタンの初期化
  const aiFixBtn = document.getElementById('ai-fix-code');
  aiFixBtn.addEventListener('click', async () => {
    const ai = await loadAIModule();
    ai.fixCode();
  });

  // コード補完状態に応じてAIコード修正ボタンを制御
  function updateAIFixButtonState() {
    const completionEnabled = completionEngine && completionEngine.completionMode !== 'none';
    aiFixBtn.disabled = !completionEnabled;
    aiFixBtn.style.opacity = completionEnabled ? '1' : '0.5';
    aiFixBtn.title = completionEnabled ? 'AIがコードを最適化します' : 'コード補完をONにしてください';
  }

  // 初期状態を設定
  updateAIFixButtonState();

  // コード補完の状態変更を監視（新しいselect要素）
  const completionModeSelect = document.getElementById('completion-mode-select');
  if (completionModeSelect) {
    completionModeSelect.addEventListener('change', updateAIFixButtonState);
  }

  // AI関数を動的にインポートしてイベントリスナーを設定
  document.getElementById('btn-explain').addEventListener('click', async () => {
    const ai = await loadAIModule();
    ai.explainProblem();
  });
  document.getElementById('btn-review').addEventListener('click', async () => {
    const ai = await loadAIModule();
    ai.reviewCode();
  });
  
  // 実行時入力フォームの設定
  setupRuntimeInput();

  // サイドバー（既定は閉じた状態）
  initSidebar({
    sidebarId: 'sidebar',
    toggleId: 'toggle-sidebar',
    storageKey: 'easycode_problems_sidebar',
    onToggle: () => setTimeout(() => appState.getEditor().refresh(), 220),
  });
  setupChat();

  document.getElementById('output-clear').addEventListener('click', () => {
    document.getElementById('output').textContent = '';
    document.getElementById('check-result').textContent = '';
  });

    document.getElementById('loader').style.display = 'none';
    document.getElementById('container').style.visibility = 'visible';
  } catch (error) {
    console.error('エディタの初期化に失敗:', error);
    const loader = document.getElementById('loader');
    if (loader) {
      loader.innerHTML = `<p style="color: red;">初期化に失敗しました: ${error.message}<br>ページを再読み込みしてください。</p>`;
    }
  }
}

window.addEventListener('DOMContentLoaded', initEditor);
