// module/editor.js
import { CodeCompletionEngine } from './completion.js';
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
 * Pythonコードを自動フォーマット
 * @param {CodeMirror} cm CodeMirrorインスタンス
 */
function formatCode(cm) {
  const code = cm.getValue();
  const lines = code.split('\n');
  const formattedLines = [];
  let indentLevel = 0;
  const indentUnit = cm.getOption('indentUnit') || 4;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 空行はそのまま
    if (trimmedLine === '') {
      formattedLines.push('');
      continue;
    }

    // dedentが必要な行（else, elif, except, finally等）
    const dedentKeywords = /^(else|elif|except|finally|case)/;
    if (dedentKeywords.test(trimmedLine) && indentLevel > 0) {
      indentLevel--;
    }

    // インデントを適用
    const indent = ' '.repeat(indentLevel * indentUnit);
    formattedLines.push(indent + trimmedLine);

    // インデントを増やす必要がある行（コロンで終わる行）
    if (trimmedLine.endsWith(':')) {
      indentLevel++;
    }

    // returnやbreakなど、ブロックを終了するキーワード
    // ただし、次の行がdedentキーワードでない場合のみ
    const blockEndKeywords = /^(return|break|continue|pass|raise)\b/;
    if (blockEndKeywords.test(trimmedLine)) {
      // 次の行をチェック
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (!dedentKeywords.test(nextLine) && nextLine !== '' && indentLevel > 0) {
          // 次の行がdedentキーワードでもなく、空行でもない場合は何もしない
        }
      }
    }

    // dedentが必要な行の後処理
    if (dedentKeywords.test(trimmedLine) && trimmedLine.endsWith(':')) {
      indentLevel++;
    }
  }

  // コードを置き換え
  const cursor = cm.getCursor();
  cm.setValue(formattedLines.join('\n'));
  cm.setCursor(cursor);
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

// カスタムinput関数
function createCustomInput(outputEl) {
  return function() {
    return new Promise((resolve) => {
      isWaitingForInput = true;
      inputCallback = resolve;
      
      // 実行時入力フォームを表示
      const container = document.getElementById('runtime-input-container');
      const input = document.getElementById('runtime-input');
      container.style.display = 'block';
      input.focus();
    });
  };
}

/**
 * コードを実行
 */
async function runCode() {
  const outputEl = document.getElementById('output');
  outputEl.textContent = '実行中…\n';
  const code = appState.getEditor().getValue();
  const pyodide = appState.getPyodide();
  
  // 実行時入力フォームを非表示
  document.getElementById('runtime-input-container').style.display = 'none';
  isWaitingForInput = false;
  inputCallback = null;

  try {
    // input()を使用しているかチェック
    const usesInput = code.includes('input(');
    
    if (usesInput) {
      // インタラクティブな入力が必要な場合
      outputEl.textContent = '';
      
      // カスタムinput関数を設定
      pyodide.globals.set('custom_input', createCustomInput(outputEl));
      
      // コードを修正してカスタムinput関数を使用
      const modifiedCode = code.replace(/input\(/g, 'await custom_input(');
      
      const wrapped = `
import sys, traceback
from io import StringIO
import asyncio

_out = StringIO()
_orig_stdout = sys.stdout

class OutputCapture:
    def __init__(self, output_element):
        self.output_element = output_element
        
    def write(self, text):
        self.output_element.textContent += text
        
    def flush(self):
        pass

sys.stdout = OutputCapture(js.document.getElementById('output'))

async def main():
    try:
${modifiedCode.split('\n').map(l => '        '+l).join('\n')}
    except Exception:
        import traceback
        traceback.print_exc()

await main()
`;
      
      await pyodide.runPythonAsync(wrapped);
      
    } else {
      // input()を使用していない場合
      const wrapped = `
import sys, traceback
from io import StringIO

_out = StringIO()
_err = StringIO()
_orig_stdout, _orig_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _out, _err

try:
${code.split('\n').map(l => '    '+l).join('\n')}
except Exception:
    traceback.print_exc(file=_err)
finally:
    sys.stdout, sys.stderr = _orig_stdout, _orig_stderr

_out.getvalue() + _err.getvalue()
`;
      const result = await pyodide.runPythonAsync(wrapped);
      outputEl.textContent = result || '(出力なし)';
    }
  } catch (err) {
    outputEl.textContent += '\nエラー: ' + err;
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

  // 正誤判定ボタンを非表示
  const checkButton = document.getElementById('btn-check-answer');
  if (checkButton) {
    checkButton.style.display = 'none';
  }

  // 問題の解説ボタンを非表示
  const explainButton = document.getElementById('btn-explain');
  if (explainButton) {
    explainButton.style.display = 'none';
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

  // 正誤判定ボタンを表示
  const checkButton = document.getElementById('btn-check-answer');
  if (checkButton) {
    checkButton.style.display = 'block';
  }

  // 問題の解説ボタンを表示
  const explainButton = document.getElementById('btn-explain');
  if (explainButton) {
    explainButton.style.display = 'block';
  }

  // 最初の問題に戻る
  await loadProblem(0);

  // CodeMirrorのサイズをリフレッシュ
  setTimeout(() => {
    appState.getEditor().refresh();
  }, UI_CONFIG.ANIMATION_DURATION);
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
      extraKeys: {
        'Ctrl-Space': 'autocomplete',
        'Ctrl-/': 'toggleComment',
        'Cmd-/': 'toggleComment',
        'Ctrl-Shift-F': formatCode,
        'Cmd-Shift-F': formatCode,
        'Ctrl-B': formatCode,
        'Cmd-B': formatCode,
        'Tab': betterTab,
        'Shift-Tab': 'indentLess'
      }
    });
    appState.setEditor(editor);

  // コード補完エンジンを初期化
  console.log('エディタ初期化完了、CodeCompletionEngineを作成中...');
  completionEngine = new CodeCompletionEngine(editor);
  console.log('CodeCompletionEngine作成完了:', completionEngine);
  
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
      if (freeCodingBtn.textContent === 'フリーコーディング') {
        enterFreeCodingMode();
        freeCodingBtn.textContent = '問題に戻る';
        freeCodingBtn.style.background = '#27ae60';
      } else {
        exitFreeCodingMode();
        freeCodingBtn.textContent = 'フリーコーディング';
        freeCodingBtn.style.background = '#e74c3c';
      }
    });
  }

  if (problemFiles.length) await loadProblem(0);

  const runBtn = document.getElementById('run');
  runBtn.disabled = false;
  runBtn.addEventListener('click', runCode);

  // フォーマットボタンの初期化
  const formatBtn = document.getElementById('format-code');
  formatBtn.addEventListener('click', () => {
    formatCode(appState.getEditor());
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
