// module/drawing.js - 描画モードの画面まわり
//
// コード ⇄ ブロック ⇄ フローチャートの同期は module/workbench.js が受け持つ。
// このファイルは p5 の実行（1回だけ描く / アニメーション）と画面の切り替えを担当する。

import { P5_PYTHON_LIBRARY } from './p5lib.js';
import { createWorkbench } from './workbench.js';
import { P5_CALL_BLOCKS, P5_NAME_BLOCKS } from './blockdefs.js';
import {
  confirmDialog, toast, initSidebar, initTabs, initMaximize,
  takeCodeFromUrl, makeShareUrl, showShareDialog,
} from './ui.js';
import { callGemini, chatWithAI } from './ai.js';
import { PYODIDE_CONFIG } from './config.js';
import { runUserCode, explainError } from './pyrun.js';
import { toKtph } from './ktph.js';
import { setIconLabel } from './icons.js';

const STORAGE_KEY = 'easycode_drawing_workspace_v2';

/** 最初に置いておくコード（説明はサンプルパネルにまとめてある） */
const STARTER_CODE = `def setup():
    background(245, 246, 250)

def draw():
    x = 200 + 130 * cos(frameCount * 0.05)
    y = 200 + 130 * sin(frameCount * 0.05)
    circle(x, y, 26)
`;

let bench = null;
let pyodide = null;
let animating = false;
let animationId = null;

const $ = (id) => document.getElementById(id);

/* ============================================================
 * 1. サンプルと使い方（もとはエディタのコメントに書いてあった内容）
 * ========================================================== */

const SAMPLES = [
  {
    group: '基本のかたち',
    items: [
      ['円', 'circle(200, 200, 100)', '中心x, 中心y, 直径'],
      ['楕円', 'ellipse(200, 200, 160, 90)', '中心x, 中心y, 横の直径, 縦の直径'],
      ['四角形', 'rect(120, 120, 160, 100)', '左上x, 左上y, 幅, 高さ'],
      ['正方形', 'square(150, 150, 100)', '左上x, 左上y, 一辺'],
      ['三角形', 'triangle(200, 100, 140, 260, 260, 260)', '3つの頂点の x, y'],
      ['線', 'line(40, 40, 360, 360)', '始点x, 始点y, 終点x, 終点y'],
      ['弧', 'arc(200, 200, 160, 160, 0, PI)', '中心x, 中心y, 横径, 縦径, 開始角, 終了角'],
    ],
  },
  {
    group: '色と線',
    items: [
      ['背景色', 'background(245, 246, 250)', '赤, 緑, 青（0〜255）'],
      ['塗りつぶし', 'fill(255, 100, 100)', '赤, 緑, 青'],
      ['塗りつぶしなし', 'no_fill()', '引数なし'],
      ['線の色', 'stroke(40, 60, 120)', '赤, 緑, 青'],
      ['線の太さ', 'stroke_weight(4)', '太さ（ピクセル）'],
      ['輪郭なし', 'no_stroke()', '引数なし'],
    ],
  },
  {
    group: '文字',
    items: [
      ['文字を書く', "text_size(28)\ntext('Hello', 140, 200)", '文字サイズ／文字列, x, y'],
      ['文字の位置', "text_align('center', 'middle')", '横（left/center/right）, 縦（top/middle/bottom）'],
    ],
  },
  {
    group: '位置を動かす',
    items: [
      ['回転させる',
        "push()\ntranslate(200, 200)\nrotate(PI / 4)\nrect(-40, -40, 80, 80)\npop()",
        'push と pop ではさむと元の状態に戻せます'],
      ['大きくする',
        "push()\nscale(2, 2)\ncircle(100, 100, 40)\npop()",
        '横の倍率, 縦の倍率'],
    ],
  },
  {
    group: '数とランダム',
    items: [
      ['ランダムな位置', 'x = random(0, 400)\ny = random(0, 400)\ncircle(x, y, 30)', '最小値, 最大値'],
      ['値の変換', 'angle = map_value(100, 0, 400, 0, TWO_PI)', '値, 元の最小, 元の最大, 後の最小, 後の最大'],
      ['なめらかな乱数', 'n = noise(0.1, 0.2) * 100', 'x, y'],
    ],
  },
  {
    group: 'アニメーション',
    items: [
      ['円が回る', `def setup():
    background(245, 246, 250)

def draw():
    x = 200 + 130 * cos(frameCount * 0.05)
    y = 200 + 130 * sin(frameCount * 0.05)
    circle(x, y, 26)`, 'setup() は1回、draw() はくり返し呼ばれます'],
      ['四角が回転する', `def setup():
    background(20, 22, 34)

def draw():
    push()
    translate(200, 200)
    rotate(frameCount * 0.02)
    fill(255, 120, 120)
    rect(-40, -40, 80, 80)
    pop()`, 'frameCount を角度に使うと回り続けます'],
    ],
  },
];

/** サンプルパネルを組み立てる */
function buildSamples() {
  const container = $('samples-body');

  const note = document.createElement('div');
  note.className = 'note';
  note.textContent =
    'キャンバスは 400 × 400 です。左上が (0, 0)、右下が (400, 400)。'
    + ' サンプルを押すと、コードの最後に追加されます。';
  container.appendChild(note);

  for (const section of SAMPLES) {
    const heading = document.createElement('h3');
    heading.textContent = section.group;
    container.appendChild(heading);

    for (const [name, code, hint] of section.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sample-item';
      button.title = hint;

      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = `${name}（${hint}）`;

      const sample = document.createElement('code');
      sample.textContent = code;

      button.append(label, sample);
      button.addEventListener('click', () => insertSample(code));
      container.appendChild(button);
    }
  }
}

/** サンプルをコードの最後に足す */
function insertSample(code) {
  const current = bench.getCode().replace(/\s*$/, '');
  bench.setCode(current ? `${current}\n${code}\n` : `${code}\n`);
  toast('コードに追加しました');
}

/* ============================================================
 * 2. 実行
 * ========================================================== */

/** キャンバスの状態表示を更新する */
function setCanvasState(text, live) {
  const chip = $('canvas-state');
  chip.textContent = text;
  chip.className = live ? 'chip is-live' : 'chip';
  $('stop-btn').disabled = !live;
}

/** キャンバスを白紙に戻す */
function clearCanvas() {
  const canvas = $('canvas');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/** アニメーションを止める */
function stopAnimation(message = '停止しました') {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  animating = false;
  setCanvasState('停止中', false);
  if (message) $('output').textContent += `\n${message}\n`;
}

/** コードを実行する */
async function runCode() {
  const output = $('output');
  const code = bench.getCode();

  stopAnimation(null);
  clearCanvas();

  if (!code.trim()) {
    output.textContent = '実行するコードがありません。サンプルから選んでみましょう。';
    return;
  }

  output.textContent = '実行中…\n';
  // コードは Python の変数として渡す（""" を含むコードでも安全に実行できる）
  pyodide.globals.set('_user_code', code);
  // 前回の回転や拡大が残らないように、まっさらから始める
  await pyodide.runPythonAsync('begin_frame()');

  try {
    if (/def\s+(setup|draw)\s*\(/.test(code)) {
      await runAnimation(code);
    } else {
      const result = await runUserCode(pyodide, code, { useGlobals: true });
      output.textContent = result.error
        ? explainError(result.error, code)
        : (result.output || '描きました（出力はありません）');
      setCanvasState(result.error ? '停止中' : '描画ずみ', false);
    }
  } catch (error) {
    console.error('描画エラー:', error);
    output.textContent = 'エラー: ' + error.message;
    setCanvasState('停止中', false);
  }
}

/**
 * setup() / draw() を使うアニメーションを動かす
 * @param {string} code 学習者が書いたコード
 */
async function runAnimation(code) {
  const output = $('output');

  await pyodide.runPythonAsync(`
import time
frameCount = 0
deltaTime = 0
p5.frame_count = 0
p5.start_time = time.time()
p5._last_time = time.time()
# 前に動かしたプログラムの frameRate() が残らないよう、p5.js の既定にもどす
p5._target_fps = 60
p5._recent_fps = 0
`);

  // 学習者のコードを読みこんで、setup() があれば一度だけ呼ぶ。
  // 末尾に足しているだけなので、エラーの行番号はずれない。
  const setupRun = await runUserCode(
    pyodide,
    code + "\nif 'setup' in globals():\n    setup()\n",
    { useGlobals: true },
  );

  if (setupRun.error) {
    output.textContent = explainError(setupRun.error, code);
    setCanvasState('停止中', false);
    return;
  }
  output.textContent = setupRun.output || '';

  const hasDraw = await pyodide.runPythonAsync(`'draw' in globals()`);
  if (!hasDraw) {
    output.textContent += 'setup() だけ実行しました。\n';
    setCanvasState('描画ずみ', false);
    return;
  }

  animating = true;
  setCanvasState('アニメーション中', true);
  output.textContent += 'アニメーション実行中…（停止 で止まります）\n';

  // p5.js と同じく、1 秒あたりのコマ数をそろえる。
  // そろえないと、図形の少ないプログラムは速く、多いプログラムは遅く動いてしまい、
  // 同じコードでも見え方が変わってしまう。frameRate(30) で変えられる。
  let nextFrameAt = 0;
  let targetFps = 60;

  // 画面の書きかえの合間にわずかな時間しかないと、1コマ飛ばしてしまい
  // 60 のつもりが 30 になる。少し早めでも描くようにして取りこぼしを防ぐ。
  const TOLERANCE_MS = 4;

  const loop = async () => {
    if (!animating) return;
    try {
      const now = performance.now();
      if (targetFps > 0 && now < nextFrameAt - TOLERANCE_MS) {
        animationId = requestAnimationFrame(loop);
        return;
      }
      // 間隔ぶん進める。遅れが積もったときは、今を起点にして追いつこうとしない
      const interval = targetFps > 0 ? 1000 / targetFps : 0;
      nextFrameAt = Math.max(now + interval, nextFrameAt + interval);

      // 1コマぶんの下ごしらえ（座標系をもどし、frameCount を進める）。
      // 目標のコマ数も、この 1 回のやりとりで受け取る
      // （毎コマ 2 回 Python を呼ぶと、それだけで遅くなってしまう）
      const reported = await pyodide.runPythonAsync(`
import time

# p5.js と同じく、毎フレーム座標系をもどしてから draw() を呼ぶ
begin_frame()

frameCount = frameCount + 1
p5.frame_count = frameCount
_now = time.time()
deltaTime = (_now - p5._last_time) * 1000 if p5._last_time else 0
p5._last_time = _now
p5._recent_fps = (1000 / deltaTime) if deltaTime > 0 else 0
p5._target_fps
`);
      targetFps = Number(reported) || 0;

      const frame = await runUserCode(pyodide, 'draw()', { useGlobals: true, seconds: 3 });

      if (frame.error) {
        output.textContent = 'アニメーションでエラーが起きました\n' + explainError(frame.error, code);
        stopAnimation(null);
        return;
      }
      if (frame.output) output.textContent = frame.output;
      animationId = requestAnimationFrame(loop);
    } catch (e) {
      console.error('アニメーションエラー:', e);
      output.textContent = 'エラー: ' + e.message;
      stopAnimation(null);
    }
  };

  animationId = requestAnimationFrame(loop);
}

/* ============================================================
 * 3. AI サポート（APIキーがあるときだけ使う）
 * ========================================================== */

/** コードレビューをもらう */
async function reviewDrawing() {
  const target = $('review');
  const code = bench.getCode();
  if (!code.trim()) { target.textContent = 'レビューするコードがありません。'; return; }

  target.textContent = '生成中…';
  try {
    target.textContent = await callGemini(
      '次の Python 描画コード（p5.js に似たライブラリ）を、初学者向けに3〜4文でレビューしてください。\n'
      + 'よい点と、次に試すとよいことを書いてください。\n\n```python\n' + code + '\n```',
      400
    );
  } catch (error) {
    target.textContent = 'レビューを取得できませんでした: ' + error.message;
  }
}

/** コードを改善してもらう */
async function improveDrawing() {
  const button = $('ai-fix-code');
  const code = bench.getCode();
  if (!code.trim()) { toast('改善するコードがありません'); return; }

  const label = button.textContent;
  button.textContent = '改善中…';
  button.disabled = true;

  try {
    const response = await callGemini(
      '次の Python 描画コード（p5.js に似たライブラリ）を、より見ばえがよくなるように書き直してください。\n'
      + '説明は不要で、コードだけを出力してください。\n\n```python\n' + code + '\n```',
      700
    );
    const match = response.match(/```(?:python)?\n([\s\S]*?)```/);
    bench.setCode((match ? match[1] : response).trim() + '\n');
    toast('AIがコードを書き直しました');
  } catch (error) {
    toast('改善できませんでした: ' + error.message);
  } finally {
    button.textContent = label;
    button.disabled = false;
  }
}

/** サイドバーのチャット */
function setupChat() {
  const input = $('chat-input');
  const messages = $('chat-messages');

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

  $('chat-send').addEventListener('click', send);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
}

/* ============================================================
 * 4. 初期化
 * ========================================================== */

/** 補完に足す p5 の候補（ブロックの表から作る） */
function completionApi() {
  const split = (name) => (name.includes('.') ? name.split('.') : [null, name]);

  // 書き方は 2 とおりある。p5.js のリファレンスと同じ circle(...) と、
  // これまでどおりの p5.circle(...)。どちらでも候補に出す。
  const calls = P5_CALL_BLOCKS.flatMap(def => {
    const [target, name] = split(def.call);
    const args = def.args.map(a => a.name).join(', ') || '引数なし';
    const entry = {
      label: `${name}()`, insert: `${name}()`,
      detail: `${def.tooltip}（${args}）`, moveBack: 1,
    };
    return target ? [{ ...entry, target: null }, { ...entry, target }] : [entry];
  });

  const names = P5_NAME_BLOCKS.map(def => {
    const [target, name] = split(def.name);
    return { target, label: name, insert: name, detail: def.tooltip };
  });

  const extras = [
    { label: 'p5', insert: 'p5', detail: '描画のためのオブジェクト' },
    { label: 'PI', insert: 'PI', detail: '円周率' },
    { label: 'TWO_PI', insert: 'TWO_PI', detail: '円周率の2倍' },
    { label: 'noise()', insert: 'noise()', detail: 'なめらかな乱数（x, y）', moveBack: 1 },
    { label: 'lerp()', insert: 'lerp()', detail: '線形補間（開始, 終了, 割合）', moveBack: 1 },
    { label: 'text_align()', insert: 'text_align()', detail: '文字の位置（横, 縦）', moveBack: 1 },
    { label: 'begin_shape()', insert: 'begin_shape()', detail: '自由な形を描き始める', moveBack: 1 },
    { label: 'vertex()', insert: 'vertex()', detail: '頂点を足す（x, y）', moveBack: 1 },
    { label: 'end_shape()', insert: "end_shape('CLOSE')", detail: '形を閉じる', moveBack: 1 },
    { label: 'bezier()', insert: 'bezier()', detail: 'ベジェ曲線（8つの座標）', moveBack: 1 },
  ];

  return [...calls, ...names, ...extras];
}

function setupControls() {
  $('run-btn').addEventListener('click', runCode);
  $('stop-btn').addEventListener('click', () => stopAnimation());

  $('clear-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'すべて消しますか？',
      message: 'コード・ブロック・キャンバスがすべて消えます。この操作は元に戻せません。',
      okLabel: 'すべて消す',
    });
    if (!ok) return;
    stopAnimation(null);
    clearCanvas();
    bench.clearAll();
    $('output').textContent = '';
    setCanvasState('停止中', false);
    toast('すべて消しました');
  });

  $('share-btn').addEventListener('click', async () => {
    const code = bench.getCode();
    if (!code.trim()) { toast('共有するコードがありません'); return; }
    showShareDialog(await makeShareUrl('drawing.html', code));
  });

  $('save-png').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'easycode-drawing.png';
    link.href = $('canvas').toDataURL('image/png');
    link.click();
    toast('画像を保存しました');
  });

  $('code-indent').addEventListener('click', () => {
    toast(bench.autoIndent() ? '字下げをそろえました' : 'すでに字下げは整っています');
  });
  $('code-format').addEventListener('click', () => {
    toast(bench.formatCode() ? 'コードを整えました' : 'すでに整っています');
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

  $('flow-fit').addEventListener('click', (e) => {
    const fit = !bench.isFlowFit();
    bench.setFlowFit(fit);
    setIconLabel(e.currentTarget, 'maximize', fit ? '見やすい大きさ' : '実物大');
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

  $('btn-review').addEventListener('click', reviewDrawing);
  $('ai-fix-code').addEventListener('click', improveDrawing);

  window.addEventListener('resize', () => bench.refreshLayout());
}

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
    clearCanvas();
    buildSamples();

    bench = createWorkbench({
      codeId: 'code',
      blocklyId: 'blockly-area',
      flowchartId: 'flowchart',
      storageKey: STORAGE_KEY,
      starterCode: STARTER_CODE,
      drawing: true,
      extraApi: completionApi(),
      onStatus: showSyncState,
    });
    const shared = await takeCodeFromUrl();
    bench.restore(shared);
    if (shared) toast('共有されたコードを読み込みました');

    // すでにこのページを開いたまま共有リンクを開くと、
    // ブラウザはページを読み直さない（# から後ろが変わるだけ）。
    // その場合もコードを受け取れるように、変化を見張っておく。
    window.addEventListener('hashchange', async () => {
      const late = await takeCodeFromUrl();
      if (!late) return;
      bench.setCode(late);
      toast('共有されたコードを読み込みました');
    });

    initSidebar({
      sidebarId: 'sidebar',
      toggleId: 'toggle-sidebar',
      storageKey: 'easycode_drawing_sidebar',
      onToggle: () => bench.refreshLayout(),
    });
    initMaximize(() => bench.refreshLayout());
    initTabs({
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
    setupChat();

    bench.fitBlocks();
    bench.refreshLayout();
    await bench.renderFlowchart(true);

    pyodide = await loadPyodide({ indexURL: PYODIDE_CONFIG.INDEX_URL });
    pyodide.globals.set('js', window);
    await pyodide.runPythonAsync(P5_PYTHON_LIBRARY);

    $('run-btn').disabled = false;
    loader.style.display = 'none';
  } catch (error) {
    console.error('03 スケッチの初期化に失敗:', error);
    loader.innerHTML =
      `<p style="color:var(--c-bad);">読み込みに失敗しました: ${error.message}<br>ページを再読み込みしてください。</p>`;
  }
}

window.addEventListener('DOMContentLoaded', init);
