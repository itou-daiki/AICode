// module/editor.js
import { explainProblem, reviewCode, fixCode } from './ai.js';
import { CodeCompletionEngine } from './completion.js';

export let currentProblem;
export let editor;
export let isFreeCodingMode = false;  // フリーコーディングモードの状態を追加
let pyodide;
let completionEngine;
let problemFiles = [];
let currentProblemIndex = 0;
let isWaitingForInput = false;
let inputCallback = null;

// 問題一覧を index.json から取得
async function fetchProblemFiles() {
  try {
    const res = await fetch('problems/index.json');
    const list = await res.json();
    return list.map(name => `problems/${name}`);
  } catch (e) {
    console.error('問題一覧の読み込みに失敗:', e);
    return [];
  }
}

// 問題を読み込み
async function loadProblem(idx) {
  currentProblemIndex = idx;
  const res = await fetch(problemFiles[idx]);
  const data = await res.json();
  currentProblem = data;
  document.getElementById('problem-content').innerHTML =
    `<h3>${data.title}</h3>
     <p>${data.description}</p>
     <h4>入力例</h4><pre>${data.input}</pre>
     <h4>期待出力</h4><pre>${data.expected}</pre>`;
  editor.setValue(data.template || '');
  
  // ナビゲーションボタンの状態を更新
  document.getElementById('prev-problem').disabled = idx === 0;
  document.getElementById('next-problem').disabled = idx === problemFiles.length - 1;
  document.getElementById('current-problem-label').textContent = `問題${idx + 1}`;
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

// コード実行
async function runCode() {
  const outputEl = document.getElementById('output');
  outputEl.textContent = '実行中…\n';
  const code = editor.getValue();
  
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


// フリーコーディングモード
function enterFreeCodingMode() {
  isFreeCodingMode = true;  // フラグを設定
  
  // 問題エリアを非表示
  document.getElementById('problem-area').style.display = 'none';
  
  // ナビゲーションボタンを無効化
  document.getElementById('prev-problem').disabled = true;
  document.getElementById('next-problem').disabled = true;
  document.getElementById('current-problem-label').textContent = 'フリーコーディング';
  
  // エディタをクリア
  editor.setValue('# フリーコーディングモード\n# 自由にPythonコードを書いてみましょう！\n\n');
  
  // 現在の問題をフリーコーディング用に設定
  currentProblem = {
    title: 'フリーコーディング',
    description: '自由にコードを書いて実行できます',
    input: '',
    expected: '',
    template: ''
  };
  
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
}

// 通常モードに戻る
async function exitFreeCodingMode() {
  isFreeCodingMode = false;  // フラグをリセット
  
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
}

// 初期化
export async function initEditor() {
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
  
  // pyodideにJavaScriptオブジェクトへのアクセスを提供
  pyodide.globals.set('js', window);
  
  editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'python', 
    lineNumbers: true, 
    indentUnit: 4, 
    tabSize: 4,
    extraKeys: {
      'Ctrl-Space': 'autocomplete'
    }
  });

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

  // AIコード修正ボタンの初期化
  const aiFixBtn = document.getElementById('ai-fix-code');
  aiFixBtn.addEventListener('click', fixCode);
  
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

  document.getElementById('btn-explain').addEventListener('click', explainProblem);
  document.getElementById('btn-review').addEventListener('click', reviewCode);
  
  // 実行時入力フォームの設定
  setupRuntimeInput();

  document.getElementById('loader').style.display = 'none';
  document.getElementById('container').style.visibility = 'visible';
}

window.addEventListener('DOMContentLoaded', initEditor);
