// module/editor.js
import { explainProblem, reviewCode } from './ai.js';

export let currentProblem;
export let editor;
let pyodide;
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
  document.getElementById('stdin').value = data.input || '';
  updateInputArea();
  
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
  const inputText = document.getElementById('stdin').value;
  
  // 実行時入力フォームを非表示
  document.getElementById('runtime-input-container').style.display = 'none';
  isWaitingForInput = false;
  inputCallback = null;

  try {
    // input()を使用しているかチェック
    const usesInput = code.includes('input(');
    
    if (usesInput && inputText.trim()) {
      // 標準入力がある場合は従来の方法で実行
      const wrapped = `
import sys, traceback
from io import StringIO

_out = StringIO()
_err = StringIO()
_orig_stdout, _orig_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _out, _err

# 標準入力を設定
import io
sys.stdin = io.StringIO("""${inputText}""")

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
    } else if (usesInput) {
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

// 標準入力欄の表示/非表示
function updateInputArea() {
  const needsInput = editor.getValue().includes('input(');
  const hasPresetInput = document.getElementById('stdin').value.trim() !== '';
  // input()を使用していて、事前入力がある場合のみ標準入力欄を表示
  document.getElementById('input-area').style.display = (needsInput && hasPresetInput) ? 'block' : 'none';
}

// 初期化
export async function initEditor() {
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
  
  // pyodideにJavaScriptオブジェクトへのアクセスを提供
  pyodide.globals.set('js', window);
  
  editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4
  });
  editor.on('change', updateInputArea);

  problemFiles = await fetchProblemFiles();
  
  // 問題ナビゲーションボタンのイベントリスナーを設定
  document.getElementById('prev-problem').addEventListener('click', goToPrevProblem);
  document.getElementById('next-problem').addEventListener('click', goToNextProblem);

  if (problemFiles.length) await loadProblem(0);

  const runBtn = document.getElementById('run'); 
  runBtn.disabled = false;
  runBtn.addEventListener('click', runCode);

  document.getElementById('btn-explain').addEventListener('click', explainProblem);
  document.getElementById('btn-review').addEventListener('click', reviewCode);
  
  // 実行時入力フォームの設定
  setupRuntimeInput();

  document.getElementById('loader').style.display = 'none';
  document.getElementById('container').style.visibility = 'visible';
}

window.addEventListener('DOMContentLoaded', initEditor);
