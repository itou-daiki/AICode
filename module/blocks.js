// module/blocks.js - ブロックモードの画面まわり
//
// コード ⇄ ブロック ⇄ フローチャートの同期は module/workbench.js が受け持つ。
// このファイルは「実行」「ステップ実行」「画面の切り替え」を担当する。

import { createWorkbench } from './workbench.js';
import { recordTrace, namesInLine } from './stepper.js';
import {
  describeStep, renderStepCaption, renderStepOutput, markStepLines, renderVariables,
  explainLine, annotateStep, variableHistory,
} from './stepview.js';
import { showBlockAt } from './blockscope.js';
import {
  confirmDialog, toast, initSidebar, initTabs, initMaximize,
  takeCodeFromUrl, makeShareUrl, showShareDialog, showFix, safeStorage, bootPython,
  makeEditorFriendly, bindRunShortcut, addTextSizeControl,
} from './ui.js';
import { addHalfWidthControl } from './halfwidth.js';
import { addIndentGuide } from './indentguide.js';
import { runUserCode, explainError, suggestFix } from './pyrun.js';
import { toKtph } from './ktph.js';
import { setIconLabel } from './icons.js';
// AI は任意だが、キーの保存欄はこの画面にもあるので読みこんでおく
import './ai.js';

const STORAGE_KEY = 'easycode_blocks_workspace_v2';
const FIRST_VISIT_KEY = 'easycode_blocks_seen';
const LAYOUT_KEY = 'easycode_layout';

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
    typedInputs.push(value);
    updateStepInputs();
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
    updateStepInputs();
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
  typedInputs.length = 0;
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
      showFix(suggestFix(code, result.error), applyFix);
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
    // 実行で打った値を、ステップ実行の欄に写しておく（打ち直さなくてよい）
    const box = $('step-input-values');
    if (typedInputs.length && box && !box.value.trim()) box.value = typedInputs.join('\n');
    updateStepInputs();
  }
}

/**
 * 「直す」ボタンが押されたときの動き
 *
 * 学習者のコードに、直した内容を実際に入れる。押したあとの画面で、
 * 自分のコードが変わったのが見えるようにする。
 * @param {string} code 直したコード
 * @param {number} line 直した行
 */
function applyFix(code, line) {
  bench.setCode(code);
  const at = Math.max(0, Math.min(line - 1, bench.editor.lineCount() - 1));
  bench.editor.setCursor({ line: at, ch: bench.editor.getLine(at).length });
  bench.editor.focus();
  toast('コードを直しました。もう一度「実行」を押してみましょう', 3600);
}

/* ============================================================
 * 2. ステップ実行（Python Tutor 風）
 * ========================================================== */

/** 実行のときに打った値。次のステップ実行に引きつぐ */
const typedInputs = [];

/**
 * input() を使うコードのときだけ、ステップ実行用の欄を出す。
 * 実行中に値を聞いているあいだは、入力欄が 2 つ並んで
 * 「どちらに書くのか」が分からなくなるので引っこめる。
 */
function updateStepInputs() {
  const asking = $('runtime-input-container').style.display === 'flex';
  const needed = bench.getCode().includes('input(') && !asking;
  $('step-inputs').classList.toggle('is-visible', needed);
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

  // ステップ実行は「先に最後まで走らせて記録する」しくみなので、
  // 途中で入力を聞くことができない。input() の値はこの欄に先に書いてもらう。
  // 書かずに始めると空文字で進んでしまい、いちばん分かりにくいつまずきになる。
  const inputCount = (code.match(/\binput\(/g) || []).length;
  if (inputCount > 0 && inputs.length === 0) {
    updateStepInputs();
    const box = $('step-input-values');
    box.focus();
    toast('input() が使われています。使う値を先にこの欄へ書いてから、もう一度押してください。');
    return;
  }

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
    showFix(null);
    // ステップ実行のあいだは、まとまりの罫をカーソルではなく「次に動く行」に合わせる
    bench.blockScope.pause(true);
    step.error = trace.error;
    step.truncated = trace.truncated;

    step.missingInput = Boolean(trace.missing_input);

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
    setIconLabel(stepButton, 'stop', 'ステップ終了');
    stepButton.classList.remove('btn-mark');
    stepButton.classList.add('btn-danger');

    showStep(0);
    // ← → で進めるように、キーを受け取れるボタンへフォーカスを移す。
    // （エディタにフォーカスが残っていると、矢印キーはカーソル移動になってしまう）
    $('step-next').focus();
    toast(`${trace.steps.length} ステップを記録しました。← → で移動、Esc で終了`, 3200);
  } catch (error) {
    console.error('ステップ実行に失敗:', error);
    output.textContent = 'ステップ実行にしくじりました: ' + error.message;
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
  setIconLabel(stepButton, 'step', 'ステップ実行');
  stepButton.classList.remove('btn-danger');
  stepButton.classList.add('btn-mark');

  $('step-panel').hidden = true;
  $('step-vars').replaceChildren();
  $('step-caption').replaceChildren();
  markStepLines(bench.editor, {}, { scroll: false });
  annotateStep(bench.editor, null);
  bench.blockScope.pause(false);
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

  const info = describeStep(step.list, step.index, { error: step.error, truncated: step.truncated });
  // 値が足りないと、input() は空文字のまま進む。
  // 「なぜか変数がからっぽ」に見えるので、理由を出力といっしょに見せる。
  const before = step.missingInput
    ? '入力の値が足りませんでした。足りない分は空文字で進んでいます。\n'
      + '   左下の欄に値を書き足して、もう一度ステップ実行してください。\n\n'
    : '';
  let after = '';
  if (isLast) {
    if (step.error) after += `\nエラー: ${step.error}`;
    if (step.truncated) after += '\n（ステップ数が上限に達したため、記録を途中で止めました）';
  }
  renderStepOutput($('output'), current.output || '', info.newOutput, { before, after });
  renderStepCaption($('step-caption'), info, (n) => bench.editor.getLine(n - 1) || '');

  const line = info.next;
  const lineText = line ? bench.editor.getLine(line - 1) : '';
  const { order, history } = variableHistory(step.list, step.index);
  renderVariables($('step-vars'), current.vars, info.baseVars, namesInLine(lineText), { order, history });
  // いま実行した行の後ろに、その行がしたことを書く。次に動く行のまとまりには罫を引く
  annotateStep(bench.editor, info.done, explainLine(step.list, step.index, info, (n) => bench.editor.getLine(n - 1) || ''));
  showBlockAt(bench.editor, line || info.done);

  // コードには「いま実行した行」と「次に実行する行」を、フローチャートとブロックには次の行を光らせる。
  // 関数を呼び出したところでは、呼び出した行はまだ終わっていないので「実行した行」の印はつけない
  markStepLines(bench.editor, { done: info.doneKind === 'call' ? null : info.done, next: line });
  bench.highlightFlowLine(line);
  bench.highlightBlockLine(line);
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
  if (remember) safeStorage.set(LAYOUT_KEY, next);

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
  for (const button of document.querySelectorAll('#layout-switch button')) {
    button.addEventListener('click', () => setLayout(button.dataset.layout));
  }

  $('clear-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'すべて消しますか？',
      message: 'ブロックとコードの両方が消えます。この操作は元に戻せません。',
      okLabel: '全消去',
    });
    if (!ok) return;
    exitStepMode();
    bench.clearAll();
    $('output').textContent = '';
    toast('すべて消しました');
  });

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

  // いま書いているコードを、共通テストの表記で見せる。
  // ふだんの Python が、試験ではどう書かれるのかを見くらべられる。
  $('flow-ktph').addEventListener('click', () => {
    const button = $('flow-ktph');
    const showing = button.classList.toggle('is-on');
    const container = $('flowchart');

    if (!showing) { bench.renderFlowchart(true); return; }

    // コードを直した直後は、図の描き直しが控えている。
    // それが後から走ると、せっかく出した表記を上書きしてしまうので、
    // 先に済ませてから差しかえる。
    if (bench.scheduleFlowchart && bench.scheduleFlowchart.cancel) {
      bench.scheduleFlowchart.cancel();
    }

    const { text, warnings } = toKtph(bench.getCode());
    container.innerHTML = '';
    const box = document.createElement('pre');
    box.className = 'console';
    box.style.margin = '0';
    box.style.width = '100%';
    box.textContent = text || 'コードを書くと、ここに共通テストの表記で出ます';
    container.appendChild(box);

    if (warnings.length) {
      const note = document.createElement('div');
      note.className = 'note is-warn';
      const lines = [...new Set(warnings.map(w => w.line))].join(', ');
      note.textContent = `${lines} 行目は、共通テスト用の表記には無い書き方です。`;
      container.appendChild(note);
    }
  });

$('flow-zoom-in').addEventListener('click', () => bench.zoomFlowchart(1.25));
  $('flow-zoom-out').addEventListener('click', () => bench.zoomFlowchart(0.8));

  $('flow-fit').addEventListener('click', (e) => {
    const fit = !bench.isFlowFit();
    bench.setFlowFit(fit);
    setIconLabel(e.currentTarget, 'maximize', fit ? '全体を表示' : '実物大');
    e.currentTarget.classList.toggle('is-on', fit);
    toast(fit ? 'パネルに合わせた大きさにしました' : '実物大にしました（スクロールで見られます）');
  });

  $('flow-language').addEventListener('click', (e) => {
    const japanese = !bench.isFlowJapanese();
    bench.setFlowJapanese(japanese);
    setIconLabel(e.currentTarget, 'notation', japanese ? 'やさしい日本語' : 'コードのまま');
    e.currentTarget.classList.toggle('is-on', japanese);
    toast(japanese ? 'やさしい日本語で書きます' : 'コードのまま書きます');
  });
  $('output-clear').addEventListener('click', () => { $('output').textContent = ''; });

  // コードの「元に戻す」「やり直す」。ブロックの側には、もとからボタンがある
  const historyButton = (id, redo) => $(id).addEventListener('click', () => {
    const editor = bench.editor;
    const left = editor.historySize()[redo ? 'redo' : 'undo'];
    if (!left) { toast(redo ? 'やり直せる変更はありません' : '戻せる変更はありません'); return; }
    if (redo) editor.redo(); else editor.undo();
    editor.focus();
  });
  historyButton('code-undo', false);
  historyButton('code-redo', true);
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
    // ダイアログを開いているときは、ダイアログに任せる
    if (document.querySelector('dialog[open]')) return;
    // 拡大表示を戻す Esc とぶつからないように、拡大していないときだけ終了する
    // エディタの中の Esc は「Tab で外へ出る」準備に使うので、ステップ実行は終えない
    if (e.key === 'Escape' && !document.body.classList.contains('has-max') && !e.target.closest?.('.CodeMirror')) {
      exitStepMode();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.closest?.('.CodeMirror')) return;
    if (e.key === 'ArrowRight') { showStep(step.index + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { showStep(step.index - 1); e.preventDefault(); }
    if (e.key === 'Home') { showStep(0); e.preventDefault(); }
    if (e.key === 'End') { showStep(step.list.length - 1); e.preventDefault(); }
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
    makeEditorFriendly(bench.editor, 'Python のコード');
    bindRunShortcut($('run-btn'));

    // はじめて開いた人には、何から始めればよいかを出力欄で一言だけ伝える
    if (!safeStorage.get(FIRST_VISIT_KEY)) {
      $('output').textContent =
        'ようこそ。ブロックの区画の道具箱からブロックを置くと、Python のコードが同時にできあがります。\n'
        + '①「実行」で動かす　②「ステップ実行」で 1 行ずつ確かめる　③ 図の区画で流れを見る\n'
        + '書いたものは、このブラウザに自動で保存されます。';
      safeStorage.set(FIRST_VISIT_KEY, '1');
    }

    // ガイドの「試す」や共有リンクから渡ってきたコードがあれば、それを開く
    const shared = await takeCodeFromUrl();
    // 共有リンクで開いたときは、前のプログラムを控えてから上書きする（知らせも restore が出す）
    bench.restore(shared);

    // すでにこのページを開いたまま共有リンクを開くと、
    // ブラウザはページを読み直さない（# から後ろが変わるだけ）。
    // その場合もコードを受け取れるように、変化を見張っておく。
    window.addEventListener('hashchange', async () => {
      const late = await takeCodeFromUrl();
      if (!late) return;
      bench.loadShared(late);
    });
    bench.editor.on('change', updateStepInputs);

    addTextSizeControl($('display-settings'));
    addHalfWidthControl($('display-settings'));
    // 字下げのしくみの説明（「表示」の前に入れる）
    addIndentGuide($('sidebar'), $('display-settings').closest('details'));
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
    const fitButton = $('flow-fit');
    if (!bench.isFlowFit()) {
      setIconLabel(fitButton, 'maximize', '実物大');
      fitButton.classList.remove('is-on');
    }
    const flowButton = $('flow-language');
    setIconLabel(flowButton, 'notation', bench.isFlowJapanese() ? 'やさしい日本語' : 'コードのまま');
    flowButton.classList.toggle('is-on', bench.isFlowJapanese());
    setupRuntimeInput();

    setLayout(safeStorage.get(LAYOUT_KEY) || '4', false);

    updateStepInputs();
    bench.fitBlocks();
    bench.refreshLayout();
    await bench.renderFlowchart(true);
  } catch (error) {
    console.error('01 コーディングの初期化に失敗:', error);
    loader.innerHTML =
      `<p style="color:var(--c-bad);">読み込みに失敗しました: ${error.message}<br>ページを再読み込みしてください。</p>`;
    return;
  }

  // 画面は先に使えるようにして、Python は後ろで読みこむ（そのあいだもブロックやコードは書ける）
  loader.style.display = 'none';
  try {
    pyodide = await bootPython({ statusEl: $('output') });
    $('run-btn').disabled = false;
    $('step-btn').disabled = false;
  } catch (error) {
    console.error('Python を読みこめませんでした:', error);
  }
}

window.addEventListener('DOMContentLoaded', init);
