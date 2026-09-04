// module/workbench.js
// 「Python コード ⇄ ブロック ⇄ フローチャート」をつなぐ共通エンジン。
// ブロックモードと描画モードの両方がこれを使う。
//
// 速さのための工夫:
//   ・ブロックをドラッグしている間は同期しない（つかんでいる間は何もしない）
//   ・コード→ブロックの組み直しは、入力が止まってからまとめて1回
//   ・フローチャートは図の内容が変わったときだけ描き直す
//   ・保存はまとめ書き（連続で呼ばれても一定間隔に1回）

import { pythonToMermaid } from './flowchart.js';
import { renderFlowchart as drawFlowchart, fitFlowchart as fitFlowSvg } from './flowview.js';
import { pythonToBlocks } from './py2blocks.js';
import { defineBlocks, buildToolbox } from './blockdefs.js';
import { autoIndent, formatCode } from './pyformat.js';
import { CodeCompletionEngine } from './completion.js';
import { debounce, throttle, toast } from './ui.js';

const BLOCKS_TO_CODE_MS = 80;
const CODE_TO_BLOCKS_MS = 900;
const FLOWCHART_MS = 500;
const SAVE_MS = 1500;

/**
 * ワークベンチを作る
 * @param {object} options
 * @param {string} options.codeId        コード用 textarea の id
 * @param {string} options.blocklyId     ブロックを置く div の id
 * @param {string} options.flowchartId   フローチャートを描く div の id
 * @param {string} options.storageKey    ブロックの保存先キー
 * @param {string} [options.starterCode] 最初に置いておくコード
 * @param {boolean} [options.drawing]    描画モードのブロックを使うか
 * @param {object[]} [options.extraApi]  補完に足す候補
 * @param {(state: object) => void} [options.onStatus] 状態が変わったときの通知
 * @returns {object} ワークベンチ
 */
export function createWorkbench(options) {
  const {
    codeId, blocklyId, flowchartId, storageKey,
    starterCode = '', drawing = false, extraApi = [], onStatus,
  } = options;

  /* ---------- 状態 ---------- */
  let syncing = false;      // 変換が往復しないようにする鍵
  let syncedCode = '';      // コードとブロックが一致していると確認済みの内容
  let lastDefinition = '';  // 直近に描いたフローチャートの定義
  let lineByNode = {};
  let renderCount = 0;
  let stepLineHandle = null;
  // フローチャートの書き方（やさしい日本語 / コードのまま）
  let flowJapanese = localStorage.getItem('easycode_flow_japanese') !== '0';
  // フローチャートを「全体が入る大きさ」にするか、「実物大」にするか
  let flowFit = localStorage.getItem('easycode_flow_fit') !== '0';

  /* ---------- コードエディタ ---------- */
  const editor = CodeMirror.fromTextArea(document.getElementById(codeId), {
    mode: 'python',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    smartIndent: true,
    electricChars: true,
    lineWrapping: false,
    rulers: [4, 8, 12, 16, 20, 24, 28, 32].map(column => ({
      column, className: 'cm-indent-guide', lineStyle: 'solid',
    })),
    extraKeys: {
      Tab: indentOrSpaces,
      'Shift-Tab': 'indentLess',
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
      // CodeMirror はキー名を Shift-Ctrl-… の順に正規化するので、その順で書く。
      // Alt の組み合わせも用意しておく（Ctrl+Shift+I はブラウザに横取りされることがある）
      'Shift-Ctrl-F': () => applyTransform(formatCode),
      'Shift-Cmd-F': () => applyTransform(formatCode),
      'Shift-Alt-F': () => applyTransform(formatCode),
      'Shift-Ctrl-I': () => applyTransform(autoIndent),
      'Shift-Cmd-I': () => applyTransform(autoIndent),
      'Shift-Alt-I': () => applyTransform(autoIndent),
    },
  });

  /* ---------- ブロックエディタ ---------- */
  defineBlocks({ drawing });
  // ブロックの色は、画面ぜんぶの世界（紙と墨と朱）にそろえる。
  // Blockly のままだと原色のプラスチックに見えて、まわりから浮いてしまう。
  // 種類の見分けは残したいので、色相は保ったまま、彩度を落として紙になじませる。
  const inkTheme = Blockly.Theme.defineTheme('easycode-ink', {
    base: Blockly.Themes.Zelos,
    componentStyles: {
      workspaceBackgroundColour: '#FCFCFA',
      toolboxBackgroundColour: '#F4F5F2',
      toolboxForegroundColour: '#16181A',
      flyoutBackgroundColour: '#F4F5F2',
      flyoutForegroundColour: '#4A4E52',
      flyoutOpacity: 1,
      scrollbarColour: '#6E7378',
      insertionMarkerColour: '#C0392B',
      insertionMarkerOpacity: 0.5,
      markerColour: '#C0392B',
      cursorColour: '#C0392B',
      selectedGlowColour: '#C0392B',
      selectedGlowOpacity: 0.6,
    },
    blockStyles: {
      // 種類ごとに、刷り分けた 1 色の面（原色にしない）
      logic_blocks:      { colourPrimary: '#5B7C8D', colourTertiary: '#415B68' },
      loop_blocks:       { colourPrimary: '#6B8E6B', colourTertiary: '#4E6B4E' },
      math_blocks:       { colourPrimary: '#7A7A96', colourTertiary: '#5A5A72' },
      text_blocks:       { colourPrimary: '#9A7B5A', colourTertiary: '#775E44' },
      list_blocks:       { colourPrimary: '#8A7391', colourTertiary: '#68566E' },
      variable_blocks:   { colourPrimary: '#B07A4E', colourTertiary: '#8A5D3B' },
      procedure_blocks:  { colourPrimary: '#4E7A8A', colourTertiary: '#3B5D68' },
      hat_blocks:        { colourPrimary: '#C0392B', colourTertiary: '#9C2C20' },
    },
  });

  const workspace = Blockly.inject(blocklyId, {
    toolbox: buildToolbox({ drawing }),
    renderer: 'zelos',
    theme: inkTheme,
    grid: { spacing: 8, length: 1, colour: '#E9EAE5', snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.8, minScale: 0.3, maxScale: 2 },
    trashcan: true,
    move: { scrollbars: true, drag: true, wheel: true },
  });

  /* ---------- 補完 ---------- */
  const completion = new CodeCompletionEngine(editor, { mode: 'both', extraApi });

  /* ---------- 保存 ---------- */
  // 保存できないことを黙って見すごすと、
  // 学習者は「保存されている」と思ったまま書いたものを失ってしまう。
  // だから一度だけ、はっきり知らせる。
  let warnedAboutSaving = false;

  const save = throttle(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
    } catch (e) {
      console.warn('ブロックの保存に失敗:', e);
      if (!warnedAboutSaving) {
        warnedAboutSaving = true;
        toast('このブラウザに保存できません。書いたものは、閉じると消えてしまいます。「共有」でリンクにして控えておきましょう。');
      }
    }
  }, SAVE_MS);

  /* ---------- 同期 ---------- */

  /** ブロックから Python を作る */
  function generateCode() {
    try {
      return Blockly.Python.workspaceToCode(workspace);
    } catch (e) {
      console.error('コード生成に失敗:', e);
      return `# コードを作れませんでした: ${e.message}\n`;
    }
  }

  /** ブロック → コード */
  const blocksToCode = debounce(() => {
    if (syncing) return;
    const code = generateCode();
    if (editor.getValue() !== code) {
      syncing = true;
      const cursor = editor.getCursor();
      editor.setValue(code);
      editor.setCursor(cursor);
      syncing = false;
    }
    syncedCode = code;
    report({ rawCount: 0 });
    scheduleFlowchart();
    save();
  }, BLOCKS_TO_CODE_MS);

  /** コード → ブロック */
  const codeToBlocks = debounce(() => {
    const code = editor.getValue();
    if (syncing || code === syncedCode) return;

    syncing = true;
    try {
      const result = pythonToBlocks(code, workspace);
      syncedCode = code;
      report({ rawCount: result.ok ? result.rawCount : -1 });
      fitBlocks();
    } finally {
      syncing = false;
    }
    save();
  }, CODE_TO_BLOCKS_MS);

  workspace.addChangeListener((event) => {
    if (syncing) return;
    if (event && event.isUiEvent) return;
    // つかんでいる間は動かさない（重くなるのを防ぐ）
    if (workspace.isDragging()) return;
    blocksToCode();
  });

  editor.on('change', () => {
    scheduleFlowchart();
    if (syncing) return;
    codeToBlocks();
  });

  /** 状態を外に伝える */
  function report(state) {
    if (onStatus) onStatus(state);
  }

  /* ---------- フローチャート ---------- */

  const scheduleFlowchart = debounce(() => { renderFlowchart(); }, FLOWCHART_MS);

  /** 今のコードからフローチャートを描く */
  async function renderFlowchart(force = false) {
    const container = document.getElementById(flowchartId);
    if (!container) return;

    // 図が同じなら描き直さない（ここが一番重い処理）。
    // 中身の判定だけ先にして、描くのは flowview.js にまかせる。
    const preview = pythonToMermaid(editor.getValue(), { japanese: flowJapanese });
    if (!force && preview.definition && preview.definition === lastDefinition) return;
    lastDefinition = preview.definition || '';

    const result = await drawFlowchart(container, editor.getValue(), {
      japanese: flowJapanese,
      fit: flowFit,
    });
    lineByNode = result.lineByNode || {};
    if (!preview.definition) lastDefinition = '';
  }

  /* ---------- 表示の調整 ---------- */

  /** フローチャートをパネルの大きさに合わせる（中身は flowview.js） */
  function fitFlowchart() {
    fitFlowSvg(document.getElementById(flowchartId), { fit: flowFit });
  }

  // 隠れている間に整えようとしても、Blockly は大きさを測れず
  // でたらめな位置になる。見えるようになったときにやり直す。
  let blocksFitPending = false;

  /** ブロックを整列させ、画面に収める */
  function fitBlocks() {
    if (!workspace.getTopBlocks(false).length) return;

    const host = document.getElementById(blocklyId);
    if (!host || !host.offsetWidth || !host.offsetHeight) {
      blocksFitPending = true;
      return;
    }
    blocksFitPending = false;
    try {
      Blockly.Events.disable();
      workspace.cleanUp();
    } catch (e) {
      console.warn('ブロックの整列に失敗:', e);
    } finally {
      Blockly.Events.enable();
    }
    try {
      workspace.zoomToFit();
      // 小さくなりすぎても大きくなりすぎても読みにくいので、ほどよい範囲に収める
      const scale = workspace.getScale();
      if (scale > 1) workspace.setScale(1);
      else if (scale < 0.5) workspace.setScale(0.5);

      const metrics = workspace.getMetricsManager();
      const content = metrics.getContentMetrics(true);
      const view = metrics.getViewMetrics(true);
      const margin = 16;

      if (content.width <= view.width && content.height <= view.height) {
        workspace.scrollCenter();
      } else {
        // 入りきらないときに真ん中へ寄せると、左はし（ブロックの始まり）が
        // 画面の外に出て切れてしまう。読む順に合わせて左上をそろえる。
        workspace.scroll(margin - content.left, margin - content.top);
      }
    } catch (e) {
      console.warn('ブロックの表示調整に失敗:', e);
    }
  }

  /** レイアウトが変わったときに呼ぶ */
  function refreshLayout() {
    requestAnimationFrame(() => {
      editor.refresh();
      Blockly.svgResize(workspace);
      fitFlowchart();
      // 隠れていて整えられなかったブロックを、見えた今のタイミングで整える
      if (blocksFitPending) fitBlocks();
    });
  }

  // パネルの大きさが変わったら（拡大・画面の分けかた・窓の大きさ）合わせ直す
  const flowHost = document.getElementById(flowchartId)?.parentElement;
  if (flowHost && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(debounce(() => fitFlowchart(), 120)).observe(flowHost);
  }

  /* ---------- 整形 ---------- */

  function indentOrSpaces(cm) {
    if (cm.somethingSelected()) { cm.indentSelection('add'); return; }
    cm.replaceSelection(' '.repeat(cm.getOption('indentUnit') || 4), 'end');
  }

  /**
   * コードを整形して書き戻す
   * @param {(code: string) => string} transform
   * @returns {boolean} 変わったか
   */
  function applyTransform(transform) {
    const before = editor.getValue();
    const after = transform(before);
    if (before === after) return false;

    const cursor = editor.getCursor();
    const scroll = editor.getScrollInfo();
    editor.setValue(after);
    editor.setCursor({ line: Math.min(cursor.line, editor.lineCount() - 1), ch: cursor.ch });
    editor.scrollTo(scroll.left, scroll.top);
    editor.focus();
    return true;
  }

  /* ---------- ステップ実行のハイライト ---------- */

  /** コードの現在行を光らせる */
  function highlightLine(line) {
    if (stepLineHandle) {
      editor.removeLineClass(stepLineHandle, 'background', 'step-line');
      stepLineHandle = null;
    }
    if (!line || line > editor.lineCount()) return;
    stepLineHandle = editor.addLineClass(line - 1, 'background', 'step-line');
    editor.scrollIntoView({ line: line - 1, ch: 0 }, 80);
  }

  /**
   * ブロックエディタの現在位置を光らせる。
   * ブロックには「元のコードの何行目から作ったか」を持たせてあるので、それで探す。
   * @param {number|null} line
   */
  function highlightBlockLine(line) {
    for (const block of workspace.getAllBlocks(false)) {
      block.getSvgRoot()?.classList.remove('step-block');
    }
    if (!line) return;

    let first = null;
    for (const block of workspace.getAllBlocks(false)) {
      if (block.data === String(line)) {
        block.getSvgRoot()?.classList.add('step-block');
        first = first || block;
      }
    }
    if (first) {
      try {
        workspace.centerOnBlock(first.id);
      } catch {
        // 画面に無いときは何もしない
      }
    }
  }

  /**
   * 今のコードからブロックを作り直して、行番号のタグを最新にする。
   * ステップ実行を始める前に呼ぶ。
   */
  function retagBlocks() {
    const code = editor.getValue();
    syncing = true;
    try {
      pythonToBlocks(code, workspace);
      syncedCode = code;
      fitBlocks();
    } finally {
      syncing = false;
    }
  }

  /** フローチャートの現在位置を光らせる */
  function highlightFlowLine(line) {
    const container = document.getElementById(flowchartId);
    if (!container) return;
    container.querySelectorAll('g.node.step-active').forEach(n => n.classList.remove('step-active'));
    if (!line) return;

    let active = null;
    for (const node of container.querySelectorAll('g.node')) {
      const match = /-(n\d+)-/.exec(node.id || '');
      if (match && lineByNode[match[1]] === line) {
        node.classList.add('step-active');
        active = active || node;
      }
    }

    if (active && container.parentElement) {
      const scroller = container.parentElement;
      const nodeBox = active.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      if (nodeBox.top < box.top || nodeBox.bottom > box.bottom) {
        scroller.scrollTop += nodeBox.top - box.top - box.height / 2 + nodeBox.height / 2;
      }
    }
  }

  /* ---------- 読み込み ---------- */

  /** 保存済みのブロックを戻す。無ければ最初のコードを置く */
  function restore(initialCode) {
    syncing = true;
    try {
      if (initialCode) {
        pythonToBlocks(initialCode, workspace);
        editor.setValue(initialCode);
        syncedCode = initialCode;
        return;
      }
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        Blockly.serialization.workspaces.load(JSON.parse(saved), workspace);
      } else if (starterCode) {
        pythonToBlocks(starterCode, workspace);
      }
      const code = generateCode();
      editor.setValue(code);
      syncedCode = code;
    } catch (e) {
      console.warn('復元に失敗したので、はじめの状態にします:', e);
      workspace.clear();
      if (starterCode) pythonToBlocks(starterCode, workspace);
      const code = generateCode();
      editor.setValue(code);
      syncedCode = code;
    } finally {
      syncing = false;
    }
  }

  /** コードを差し替える（ブロックも作り直す） */
  function setCode(code) {
    syncing = true;
    try {
      editor.setValue(code);
      pythonToBlocks(code, workspace);
      syncedCode = code;
      fitBlocks();
    } finally {
      syncing = false;
    }
    renderFlowchart(true);
    save();
  }

  /** すべて消す */
  function clearAll() {
    syncing = true;
    try {
      workspace.clear();
      editor.setValue('');
      syncedCode = '';
    } finally {
      syncing = false;
    }
    renderFlowchart(true);
    save();
  }

  return {
    editor,
    workspace,
    completion,
    getCode: () => editor.getValue(),
    setCode,
    clearAll,
    restore,
    generateCode,
    applyTransform,
    autoIndent: () => applyTransform(autoIndent),
    formatCode: () => applyTransform(formatCode),
    renderFlowchart,
    scheduleFlowchart,
    fitFlowchart,
    isFlowFit: () => flowFit,
    /** 「全体が入る大きさ」と「実物大」を切り替える */
    setFlowFit(on) {
      flowFit = on;
      localStorage.setItem('easycode_flow_fit', on ? '1' : '0');
      fitFlowchart();
    },
    fitBlocks,
    refreshLayout,
    highlightLine,
    highlightFlowLine,
    highlightBlockLine,
    retagBlocks,
    isFlowJapanese: () => flowJapanese,
    /** フローチャートの書き方を切り替える */
    setFlowJapanese(on) {
      flowJapanese = on;
      localStorage.setItem('easycode_flow_japanese', on ? '1' : '0');
      renderFlowchart(true);
    },
  };
}
