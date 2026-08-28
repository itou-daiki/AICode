// module/blocks.js - ブロックモードの画面まわり
//
// コード ⇄ ブロック ⇄ フローチャートの同期は module/workbench.js が受け持つ。
// このファイルは「実行」「ステップ実行」「画面の切り替え」を担当する。

import { createWorkbench } from './workbench.js';
import { recordTrace, changedVariables, changedItems, namesInLine } from './stepper.js';
import {
  confirmDialog, toast, initSidebar, initTabs, initMaximize,
  takeCodeFromUrl, makeShareUrl, showShareDialog,
} from './ui.js';
import { appState } from './state.js';
import { PYODIDE_CONFIG } from './config.js';
import { runUserCode, explainError } from './pyrun.js';

const STORAGE_KEY = 'easycode_blocks_workspace_v2';
const LAYOUT_KEY = 'easycode_layout';
const THINK_KEY = 'easycode_think_mode';

const STARTER_CODE = `print("こんにちは、easyCode!")
name = input("名前は？")
for count in range(3):
    print("ようこそ " + name)
`;

let bench = null;
let pyodide = null;
let layout = '4';
let layoutBeforeStep = null;
let maximize = null;
let stageTabs = null;
let thinkMode = false;

let isWaitingForInput = false;
let inputCallback = null;

/** ステップ実行の状態 */
const step = { list: [], index: 0, active: false, error: null, truncated: false };

const $ = (id) => document.getElementById(id);



/* ============================================================
 * 1. 実行
 * ========================================================== */

/** 実行時の input() 用フォームを用意する */
function setupRuntimeInput() {
  const container = $('runtime-input-container');
  const input = $('runtime-input');

  const send = () => {
    if (!isWaitingForInput || !inputCallback) return;
    const value = input.value;
    input.value = '';
    container.style.display = 'none';
    isWaitingForInput = false;
    $('output').textContent += value + '\n';

    const callback = inputCallback;
    inputCallback = null;
    callback(value);
  };

  $('runtime-input-submit').addEventListener('click', send);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
}

/** Python の input() をブラウザの入力欄に置き換える */
function createCustomInput() {
  // input("名前は？") の「名前は？」を、出力と入力欄の両方に出す。
  // これが無いと、何を聞かれているのか分からないまま入力することになる。
  return (prompt = '') => new Promise((resolve) => {
    isWaitingForInput = true;
    inputCallback = resolve;

    const question = String(prompt ?? '');
    if (question) $('output').textContent += question;
    $('runtime-input-label').textContent = question || '値を入力';

    $('runtime-input-container').style.display = 'flex';
    $('runtime-input').focus();
  });
}

/** コードをふつうに実行する */
async function runCode() {
  exitStepMode();

  const output = $('output');
  const button = $('run-btn');
  const code = bench.getCode();

  if (!code.trim()) {
    output.textContent = '実行するコードがありません。ブロックを置くか、コードを書いてみましょう。';
    return;
  }

  output.textContent = '';
  $('runtime-input-container').style.display = 'none';
  isWaitingForInput = false;
  inputCallback = null;
  button.disabled = true;

  try {
    // input() はブラウザの入力欄で受けるので、await に置きかえて動かす。
    // 行の数は変えないので、エラーの行番号はずれない。
    if (code.includes('input(')) {
      pyodide.globals.set('custom_input', createCustomInput());
    }
    const source = code.replace(/\binput\(/g, 'await custom_input(');

    const result = await runUserCode(pyodide, source, { element: output });
    if (result.error) {
      if (output.textContent) output.textContent += '\n';
      output.textContent += explainError(result.error, code);
    } else if (!output.textContent) {
      output.textContent = '(出力なし)';
    }
  } catch (error) {
    console.error('実行エラー:', error);
    output.textContent += '\nエラー: ' + error;
  } finally {
    button.disabled = false;
    $('runtime-input-container').style.display = 'none';
    isWaitingForInput = false;
    inputCallback = null;
    comparePrediction(output.textContent);
  }
}

/* ============================================================
 * 1-2. じっくりモード（考える時間をつくる）
 * ========================================================== */

/**
 * じっくりモードの入り切り。
 * 入れると補完は Ctrl+Space を押したときだけになり、
 * 実行の前に「出力はどうなる？」と予想を書く欄が出る。
 * （予想してから実行する進め方は PRIMM という学び方にもとづく）
 * @param {boolean} on
 * @param {boolean} [quiet] お知らせを出さない
 */
function setThinkMode(on, quiet = false) {
  thinkMode = on;
  localStorage.setItem(THINK_KEY, on ? '1' : '0');

  const button = $('think-btn');
  button.classList.toggle('btn-accent', on);
  button.textContent = on ? '🧠 じっくりモード：入' : '🧠 じっくりモード';

  // 補完のふるまいを切り替える（自動で答えを出さない）
  bench.completion.completionMode = on ? 'popup-only' : 'both';
  bench.completion.useAI = !on;
  bench.completion.updateStatusText();

  const select = $('completion-mode-select');
  if (select) select.value = bench.completion.completionMode;

  $('predict-panel').hidden = !on;
  if (!on) clearPrediction();
  if (!quiet) {
    toast(on ? '補完はひかえめに。まず自分で考えてみましょう' : 'ふだんのモードに戻しました');
  }
}

/** 予想の表示を消す */
function clearPrediction() {
  const result = $('predict-result');
  result.textContent = '';
  result.className = '';
}

/**
 * 書いた予想と、実際の出力を見くらべる
 * @param {string} actual
 */
function comparePrediction(actual) {
  if (!thinkMode) return;

  const input = $('predict-input');
  const result = $('predict-result');
  const guess = input.value.trim();

  if (!guess) {
    result.textContent = '次は、実行する前に予想を書いてみましょう。';
    result.className = '';
    return;
  }

  const tidy = (text) => text.replace(/\r/g, '').split('\n').map(l => l.trimEnd()).join('\n').trim();
  if (tidy(guess) === tidy(actual)) {
    result.textContent = '⭕ 予想どおりでした！ なぜそうなるのか、フローチャートでも確かめてみましょう。';
    result.className = 'is-hit';
  } else {
    result.textContent =
      '🤔 予想とちがいました。\n\nあなたの予想:\n' + guess + '\n\n実際の出力:\n' + actual.trim()
      + '\n\n⏯ ステップ実行で、どこで考えとちがったか見てみましょう。';
    result.className = 'is-miss';
  }
}

/* ============================================================
 * 2. ステップ実行（Python Tutor 風）
 * ========================================================== */

/** input() を使うコードのときだけ、値を入れる欄を出す */
function updateStepInputs() {
  $('step-inputs').classList.toggle('is-visible', bench.getCode().includes('input('));
}

/** ステップ実行を始める */
async function startStepMode() {
  const code = bench.getCode();
  const output = $('output');
  const button = $('step-btn');

  if (!code.trim()) {
    output.textContent = '実行するコードがありません。';
    return;
  }

  const inputs = $('step-input-values').value.split('\n');
  while (inputs.length && inputs[inputs.length - 1] === '') inputs.pop();

  button.disabled = true;
  output.textContent = '実行のようすを記録しています…';
  // ブロックの行番号タグを今のコードに合わせ直す（3つを同時に光らせるため）
  bench.retagBlocks();

  try {
    const trace = await recordTrace(pyodide, code, inputs);
    if (!trace.steps.length) {
      output.textContent = trace.error || '記録できる処理がありませんでした。';
      return;
    }

    step.list = trace.steps;
    step.index = 0;
    step.active = true;
    step.error = trace.error;
    step.truncated = trace.truncated;

    // ステップ実行の間は2画面にする（終わったら元の分け方にもどす）
    maximize.reset();
    layoutBeforeStep = layout;
    document.body.classList.add('step-mode');
    setLayout('2', false);
    stageTabs.select('panel-code');

    $('step-panel').hidden = false;
    const slider = $('step-slider');
    slider.max = String(trace.steps.length - 1);
    slider.value = '0';

    // 「戻り方」が分かるように、実行ボタン自体も終了ボタンに変える
    const stepButton = $('step-btn');
    stepButton.textContent = '⏹ ステップ実行を終わる';
    stepButton.classList.remove('btn-primary');
    stepButton.classList.add('btn-danger');

    showStep(0);
    // ← → で進めるように、キーを受け取れるボタンへフォーカスを移す。
    // （エディタにフォーカスが残っていると、矢印キーはカーソル移動になってしまう）
    $('step-next').focus();
    toast(`${trace.steps.length} ステップを記録しました。← → で移動、⏹ で終了`, 3200);
  } catch (error) {
    console.error('ステップ実行に失敗:', error);
    output.textContent = 'ステップ実行に失敗しました: ' + error.message;
  } finally {
    button.disabled = false;
  }
}

/** ステップ実行を終える */
function exitStepMode() {
  if (!step.active) return;
  step.active = false;
  step.list = [];
  document.body.classList.remove('step-mode');
  if (layoutBeforeStep) {
    setLayout(layoutBeforeStep, false);
    layoutBeforeStep = null;
  }

  const stepButton = $('step-btn');
  stepButton.textContent = '⏯ ステップ実行';
  stepButton.classList.remove('btn-danger');
  stepButton.classList.add('btn-primary');

  $('step-panel').hidden = true;
  $('step-vars').replaceChildren();
  bench.highlightLine(null);
  bench.highlightFlowLine(null);
  bench.highlightBlockLine(null);
  bench.refreshLayout();
}

/** 指定のステップを表示する */
function showStep(index) {
  if (!step.active) return;
  step.index = Math.max(0, Math.min(index, step.list.length - 1));
  const current = step.list[step.index];
  const previous = step.list[step.index - 1];
  const isLast = step.index === step.list.length - 1;

  $('step-label').textContent = `${step.index + 1} / ${step.list.length}`;
  $('step-slider').value = String(step.index);
  $('step-first').disabled = step.index === 0;
  $('step-prev').disabled = step.index === 0;
  $('step-next').disabled = isLast;

  let text = current.output || '（まだ出力はありません）';
  if (isLast) {
    if (step.error) text += `\nエラー: ${step.error}`;
    if (step.truncated) text += '\n（ステップ数が上限に達したため、記録を途中で止めました）';
  }
  $('output').textContent = text;

  const line = current.event === 'end' ? null : current.line;
  const lineText = line ? bench.editor.getLine(line - 1) : '';
  renderVariables(current.vars, previous && previous.vars, namesInLine(lineText));

  // コード・フローチャート・ブロックの3つを同時に光らせる
  bench.highlightLine(line);
  bench.highlightFlowLine(line);
  bench.highlightBlockLine(line);
}

/** 変数一覧を表示する（型と中身の要素まで見せる） */
function renderVariables(variables, previousVariables, focusNames) {
  const container = $('step-vars');
  const names = Object.keys(variables).sort();

  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'まだ変数はありません';
    container.replaceChildren(empty);
    return;
  }

  const changed = changedVariables(previousVariables, variables);
  const list = document.createElement('div');
  list.className = 'var-list';

  for (const name of names) {
    const info = variables[name];
    const before = previousVariables && previousVariables[name];
    list.appendChild(renderVariable(name, info, before, {
      changed: changed.has(name),
      focused: focusNames.has(name),
    }));
  }

  container.replaceChildren(list);
}

/** 変数1つ分の表示 */
function renderVariable(name, info, before, { changed, focused }) {
  const card = document.createElement('div');
  card.className = 'var-card';
  if (changed) card.classList.add('is-changed');
  if (focused) card.classList.add('is-focus');

  const head = document.createElement('div');
  head.className = 'var-head';

  const label = document.createElement('span');
  label.className = 'var-name';
  label.textContent = name;

  const type = document.createElement('span');
  type.className = `var-type is-${info.type}`;
  type.textContent = info.size === undefined ? info.label : `${info.label}（${info.size}）`;

  head.append(label, type);
  card.appendChild(head);

  if (info.items && info.items.length) {
    card.appendChild(renderItems(info, before));
  } else {
    const value = document.createElement('div');
    value.className = 'var-value';
    value.textContent = info.repr;
    card.appendChild(value);
  }

  return card;
}

/** リスト・辞書・集合の中身をならべる */
function renderItems(info, before) {
  const changed = changedItems(before, info);
  const table = document.createElement('div');
  table.className = 'var-items';

  for (const [key, value] of info.items) {
    const cell = document.createElement('div');
    cell.className = 'var-item';
    if (changed.has(key)) cell.classList.add('is-changed');

    if (key !== '') {
      const keyEl = document.createElement('span');
      keyEl.className = 'var-key';
      keyEl.textContent = key;
      cell.appendChild(keyEl);
    }

    const valueEl = document.createElement('span');
    valueEl.className = 'var-item-value';
    valueEl.textContent = value;
    cell.appendChild(valueEl);

    table.appendChild(cell);
  }

  if (info.size !== undefined && info.items.length < info.size) {
    const more = document.createElement('div');
    more.className = 'var-item is-more';
    more.textContent = `… 残り ${info.size - info.items.length} 個`;
    table.appendChild(more);
  }

  return table;
}

/* ============================================================
 * 3. 画面の切り替え
 * ========================================================== */

/**
 * 画面の分け方を切り替える
 *   4 … コード / フローチャート / ブロック / 実行結果
 *   3 … コード（縦長） / フローチャート / 実行結果
 *   2 … 左はタブで切り替え / 右は実行結果
 * @param {'2'|'3'|'4'} next
 * @param {boolean} [remember] 選んだ状態を覚えるか
 */
function setLayout(next, remember = true) {
  layout = next;
  document.body.classList.remove('layout-2', 'layout-3', 'layout-4');
  document.body.classList.add(`layout-${next}`);
  if (remember) localStorage.setItem(LAYOUT_KEY, next);

  for (const button of document.querySelectorAll('#layout-switch button')) {
    button.setAttribute('aria-selected', String(button.dataset.layout === next));
  }

  // 2画面のときは、左に出すものをタブで選ぶ
  if (next === '2' && stageTabs) stageTabs.select(stageTabs.current() || 'panel-code');
  bench.refreshLayout();
}

/* ============================================================
 * 4. ボタンの配線
 * ========================================================== */

function setupControls() {
  $('run-btn').addEventListener('click', runCode);
  $('step-btn').addEventListener('click', () => {
    if (step.active) exitStepMode();
    else startStepMode();
  });
  $('stage-exit').addEventListener('click', exitStepMode);
  for (const button of document.querySelectorAll('#layout-switch button')) {
    button.addEventListener('click', () => setLayout(button.dataset.layout));
  }

  $('clear-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'すべて消しますか？',
      message: 'ブロックとコードの両方が消えます。この操作は元に戻せません。',
      okLabel: 'すべて消す',
    });
    if (!ok) return;
    exitStepMode();
    bench.clearAll();
    $('output').textContent = '';
    toast('すべて消しました');
  });

  $('think-btn').addEventListener('click', () => setThinkMode(!thinkMode));

  $('share-btn').addEventListener('click', async () => {
    const code = bench.getCode();
    if (!code.trim()) { toast('共有するコードがありません'); return; }
    showShareDialog(await makeShareUrl('index.html', code));
  });

  $('blocks-undo').addEventListener('click', () => bench.workspace.undo(false));
  $('blocks-redo').addEventListener('click', () => bench.workspace.undo(true));
  $('blocks-tidy').addEventListener('click', () => {
    bench.fitBlocks();
    toast('ブロックを整列しました');
  });

  $('flow-refresh').addEventListener('click', () => bench.renderFlowchart(true));

  $('flow-language').addEventListener('click', (e) => {
    const japanese = !bench.isFlowJapanese();
    bench.setFlowJapanese(japanese);
    e.currentTarget.textContent = japanese ? '🈁 やさしい日本語' : '🔤 コードのまま';
    e.currentTarget.classList.toggle('is-on', japanese);
    toast(japanese ? 'やさしい日本語で書きます' : 'コードのまま書きます');
  });
  $('output-clear').addEventListener('click', () => { $('output').textContent = ''; });

  $('code-indent').addEventListener('click', () => {
    toast(bench.autoIndent() ? '字下げをそろえました' : 'すでに字下げは整っています');
  });
  $('code-format').addEventListener('click', () => {
    toast(bench.formatCode() ? 'コードを整えました' : 'すでに整っています');
  });
  $('code-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bench.getCode());
      toast('コードをコピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  });

  // ステップ実行の操作
  $('step-first').addEventListener('click', () => showStep(0));
  $('step-prev').addEventListener('click', () => showStep(step.index - 1));
  $('step-next').addEventListener('click', () => showStep(step.index + 1));
  $('step-exit').addEventListener('click', exitStepMode);
  $('step-slider').addEventListener('input', (e) => showStep(Number(e.target.value)));

  document.addEventListener('keydown', (e) => {
    if (!step.active) return;
    // 拡大表示を戻す Esc とぶつからないように、拡大していないときだけ終了する
    if (e.key === 'Escape' && !document.body.classList.contains('has-max')) {
      exitStepMode();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.closest?.('.CodeMirror')) return;
    if (e.key === 'ArrowRight') { showStep(step.index + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { showStep(step.index - 1); e.preventDefault(); }
  });

  window.addEventListener('resize', () => bench.refreshLayout());
}

/* ============================================================
 * 5. 初期化
 * ========================================================== */

/** 同期の状態をコードパネルのラベルに出す */
function showSyncState({ rawCount }) {
  const chip = $('sync-chip');
  if (!chip) return;
  if (rawCount < 0) {
    chip.textContent = 'ブロックにできませんでした';
    chip.className = 'chip is-warn';
  } else if (rawCount > 0) {
    chip.textContent = `同期中（${rawCount} か所は Python ブロック）`;
    chip.className = 'chip is-warn';
  } else {
    chip.textContent = 'ブロックと同期中';
    chip.className = 'chip is-live';
  }
}

async function init() {
  const loader = $('loader');

  try {
    bench = createWorkbench({
      codeId: 'code',
      blocklyId: 'blockly-area',
      flowchartId: 'flowchart',
      storageKey: STORAGE_KEY,
      starterCode: STARTER_CODE,
      onStatus: showSyncState,
    });
    appState.setEditor(bench.editor);

    // ガイドの「試す」や共有リンクから渡ってきたコードがあれば、それを開く
    const shared = await takeCodeFromUrl();
    bench.restore(shared);
    if (shared) toast('共有されたコードを読み込みました');
    bench.editor.on('change', updateStepInputs);

    initSidebar({
      sidebarId: 'sidebar',
      toggleId: 'toggle-sidebar',
      storageKey: 'easycode_blocks_sidebar',
      onToggle: () => bench.refreshLayout(),
    });
    maximize = initMaximize(() => bench.refreshLayout());
    stageTabs = initTabs({
      tabsId: 'stage-tabs',
      initial: 'panel-code',
      onChange: (stage) => {
        document.querySelectorAll('.panel[data-stage]').forEach(panel => {
          panel.classList.toggle('is-stage', panel.id === stage);
        });
        bench.refreshLayout();
      },
    });

    setupControls();
    // フローチャートのラベル表示を、覚えている設定に合わせる
    const flowButton = $('flow-language');
    flowButton.textContent = bench.isFlowJapanese() ? '🈁 やさしい日本語' : '🔤 コードのまま';
    flowButton.classList.toggle('is-on', bench.isFlowJapanese());
    setupRuntimeInput();

    setLayout(localStorage.getItem(LAYOUT_KEY) || '4', false);
    setThinkMode(localStorage.getItem(THINK_KEY) === '1', true);

    updateStepInputs();
    bench.fitBlocks();
    bench.refreshLayout();
    await bench.renderFlowchart(true);

    pyodide = await loadPyodide({ indexURL: PYODIDE_CONFIG.INDEX_URL });
    pyodide.globals.set('js', window);
    appState.setPyodide(pyodide);

    $('run-btn').disabled = false;
    $('step-btn').disabled = false;
    loader.style.display = 'none';
  } catch (error) {
    console.error('ブロックモードの初期化に失敗:', error);
    loader.innerHTML =
      `<p style="color:var(--c-bad);">読み込みに失敗しました: ${error.message}<br>ページを再読み込みしてください。</p>`;
  }
}

window.addEventListener('DOMContentLoaded', init);
