// module/editor.js
import { explainProblem, reviewCode } from './ai.js';

export let currentProblem;
export let editor;
let pyodide;
let problemFiles = [];

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
  const res = await fetch(problemFiles[idx]);
  const data = await res.json();
  currentProblem = data;
  document.getElementById('problem-content').innerHTML =
    `<h2>${data.title}</h2>
     <p>${data.description}</p>
     <h3>入力例</h3><pre>${data.input}</pre>
     <h3>期待出力</h3><pre>${data.expected}</pre>`;
  editor.setValue(data.template || '');
  document.getElementById('stdin').value = data.input || '';
  updateInputArea();
}

// コード実行
async function runCode() {
  const outputEl = document.getElementById('output');
  outputEl.textContent = '実行中…';
  const code = editor.getValue();
  const inputText = document.getElementById('stdin').value;

  // 標準入出力リダイレクト
  const wrapped =
    `import sys, traceback\n` +
    `from io import StringIO\n` +
    `_out = StringIO()\n` +
    `_err = StringIO()\n` +
    `_orig_out, _orig_err, _orig_in = sys.stdout, sys.stderr, sys.stdin\n` +
    `sys.stdout, sys.stderr, sys.stdin = _out, _err, StringIO(${JSON.stringify(inputText)})\n` +
    `try:\n${code.split('\n').map(l=>'    '+l).join('\n')}\n` +
    `except Exception:\n    traceback.print_exc(file=_err)\n` +
    `finally:\n    sys.stdout, sys.stderr, sys.stdin = _orig_out, _orig_err, _orig_in\n` +
    `res = _err.getvalue() + _out.getvalue()\nres`;

  try {
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
  const select = document.getElementById('problem-select');
  select.innerHTML = '';
  problemFiles.forEach((path, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = path.split('/').pop();
    select.appendChild(opt);
  });
  select.addEventListener('change', () => loadProblem(select.value));

  if (problemFiles.length) await loadProblem(0);

  const runBtn = document.getElementById('run');
  runBtn.disabled = false;
  runBtn.addEventListener('click', runCode);

  // AI コメントボタン
  document.getElementById('btn-explain').addEventListener('click', explainProblem);
  document.getElementById('btn-review').addEventListener('click', reviewCode);

  // ローダー非表示＆UI表示
  document.getElementById('loader').style.display = 'none';
  document.getElementById('container').style.visibility = 'visible';
}

window.addEventListener('DOMContentLoaded', initEditor);