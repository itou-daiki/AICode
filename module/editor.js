// module/editor.js
import { explainProblem, reviewCode } from './ai.js';

export let currentProblem;
export let editor;
let pyodide;
let problemFiles = [];
let currentProblemIndex = 0;

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

// コード実行
async function runCode() {
  const outputEl = document.getElementById('output');
  outputEl.textContent = '実行中…';
  const code = editor.getValue();
  const inputText = document.getElementById('stdin').value;

  try {
    // シンプルな実行方法
    const wrapped = `
import sys, traceback
from io import StringIO

_out = StringIO()
_err = StringIO()
_orig_stdout, _orig_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _out, _err

# 標準入力を設定
if len("""${inputText}""".strip()) > 0:
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
  } catch (err) {
    outputEl.textContent = 'エラー: ' + err;
  }
}

// 標準入力欄の表示/非表示
function updateInputArea() {
  const needsInput = editor.getValue().includes('input(');
  document.getElementById('input-area').style.display = needsInput ? 'block' : 'none';
}

// 初期化
export async function initEditor() {
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
  editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4
  });
  editor.on('change', updateInputArea);

  problemFiles = await fetchProblemFiles();
  
  // 問題ナビゲーションボタンのイベントリスナーを設定
  document.getElementById('prev-problem').addEventListener('click', goToPrevProblem);
  document.getElementById('next-problem').addEventListener('click', goToNextProblem);

  if (problemFiles.length) await loadProblem(0);

  const runBtn = document.getElementById('run'); runBtn.disabled = false;
  runBtn.addEventListener('click', runCode);

  document.getElementById('btn-explain').addEventListener('click', explainProblem);
  document.getElementById('btn-review').addEventListener('click', reviewCode);

  document.getElementById('loader').style.display = 'none';
  document.getElementById('container').style.visibility = 'visible';
}

window.addEventListener('DOMContentLoaded', initEditor);
