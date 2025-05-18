// module/editor.js
// Pyodide のロード、CodeMirror 初期化、問題取得、実行ボタン処理
import { explainProblem, reviewCode } from './ai.js';

let editor, pyodide, problemFiles = [], currentProblem;

async function fetchProblemFiles() {
  try {
    const res = await fetch('problems/');
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return Array.from(doc.querySelectorAll('a'))
      .map(a => a.href.split('/').pop())
      .filter(f => f.endsWith('.json'))
      .map(f => 'problems/' + f);
  } catch (e) {
    console.error('問題ファイルの自動読み取りに失敗:', e);
    return [];
  }
}

async function loadProblem(index) {
  const res = await fetch(problemFiles[index]);
  const data = await res.json();
  currentProblem = data;
  document.getElementById('problem-content').innerHTML =
    `<h2>${data.title}</h2><p>${data.description}</p>`;
  editor.setValue(data.template || '');
}

async function runCode() {
  const outputEl = document.getElementById('output');
  outputEl.textContent = '実行中…';
  const code = editor.getValue();
  const wrapped = 
    `import sys, traceback\n` +
    `from io import StringIO\n` +
    `_out = StringIO()\n` +
    `_err = StringIO()\n` +
    `_orig_out, _orig_err = sys.stdout, sys.stderr\n` +
    `sys.stdout, sys.stderr = _out, _err\n` +
    `try:\n${code.split('\n').map(line => '    ' + line).join('\n')}\n` +
    `except Exception:\n    traceback.print_exc(file=_err)\n` +
    `finally:\n    sys.stdout, sys.stderr = _orig_out, _orig_err\n` +
    `res = _err.getvalue() + _out.getvalue()\nres`;
  try {
    const result = await pyodide.runPythonAsync(wrapped);
    outputEl.textContent = result || '(出力なし)';
  } catch (err) {
    outputEl.textContent = 'エラー: ' + err;
  }
}

export async function initEditor() {
  // Pyodide ロード
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/'
  });
  // CodeMirror 初期化
  editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'python',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4
  });
  // 問題ファイル取得
  problemFiles = await fetchProblemFiles();
  // セレクトに反映
  const select = document.getElementById('problem-select');
  select.innerHTML = '';
  problemFiles.forEach((path, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = path.split('/').pop();
    select.appendChild(opt);
  });
  select.addEventListener('change', () => loadProblem(select.value));
  // 最初の問題ロード
  if (problemFiles.length) await loadProblem(0);
  // 実行ボタン有効化
  const runBtn = document.getElementById('run');
  runBtn.disabled = false;
  runBtn.addEventListener('click', runCode);
}

// DOM が準備できたら初期化
window.addEventListener('DOMContentLoaded', async () => {
  await initEditor();
  // ローダーを隠して UI 表示
  document.getElementById('loader').style.display = 'none';
  document.getElementById('container').style.display = 'flex';
});
