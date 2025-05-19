// module/editor.js
import { explainProblem, reviewCode } from './ai.js';

export let currentProblem;
export let editor;
let pyodide;
let problemFiles = [];

// ディレクトリ内の JSON ファイルを取得
async function fetchProblemFiles() {
  try {
    const res = await fetch('problems/');
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return Array.from(doc.querySelectorAll('a'))
      .map(a => a.getAttribute('href'))
      .filter(f => f.endsWith('.json'))
      .map(f => 'problems/' + f);
  } catch (e) {
    console.error('問題ファイルの自動読み取りに失敗:', e);
    return [];
  }
}

// 問題を読み込み UI に反映
async function loadProblem(index) {
  const res = await fetch(problemFiles[index]);
  const data = await res.json();
  currentProblem = data;
  document.getElementById('problem-content').innerHTML =
    `<h2>${data.title}</h2>
     <p>${data.description}</p>
     <h3>入力例</h3><pre>${data.input}</pre>
     <h3>出力例</h3><pre>${data.expected}</pre>`;
  editor.setValue(data.template || '');
  document.getElementById('stdin').value = data.input || '';
}

// コード実行
async function runCode() {
  const outputEl = document.getElementById('output');
  outputEl.textContent = '実行中…';
  const code = editor.getValue();
  const inputText = document.getElementById('stdin').value;

  const wrapped =
    `import sys, traceback\n` +
    `from io import StringIO\n` +
    `_out = StringIO()\n` +
    `_err = StringIO()\n` +
    `_orig_out, _orig_err, _orig_in = sys.stdout, sys.stderr, sys.stdin\n` +
    `sys.stdout, sys.stderr,sys.stdin = _out, _err, StringIO(${JSON.stringify(inputText)})\n` +
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

// 初期化
export async function initEditor() {
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
  editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4
  });
  problemFiles = await fetchProblemFiles();

  // 問題一覧取得 & セレクト反映
  const select = document.getElementById('problem-select');
  select.innerHTML = '';
  problemFiles.forEach((path, i) => {
    const opt = document.createElement('option'); opt.value = i;
    opt.textContent = path.split('/').pop();
    select.appendChild(opt);
  });
  select.addEventListener('change', () => loadProblem(select.value));

  if (problemFiles.length) await loadProblem(0);

  document.getElementById('run').disabled = false;
  document.getElementById('run').addEventListener('click', runCode);

  // AI ボタン
  document.getElementById('btn-explain').addEventListener('click', async () => {
    await explainProblem();
    document.getElementById('sidebar').classList.add('open');
  });
  document.getElementById('btn-review').addEventListener('click', async () => {
    await reviewCode();
    document.getElementById('sidebar').classList.add('open');
  });

  // ローダーを隠して UI 表示
  document.getElementById('loader').style.display = 'none';
  document.getElementById('container').style.visibility = 'visible';
}

window.addEventListener('DOMContentLoaded', initEditor);