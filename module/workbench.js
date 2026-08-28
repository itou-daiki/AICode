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
import { pythonToBlocks } from './py2blocks.js';
import { defineBlocks, buildToolbox } from './blockdefs.js';
import { autoIndent, formatCode } from './pyformat.js';
import { CodeCompletionEngine } from './completion.js';
import { debounce, throttle, toast } from './ui.js';

const BLOCKS_TO_CODE_MS = 80;
const CODE_TO_BLOCKS_MS = 900;
const FLOWCHART_MS = 500;
const SAVE_MS = 1500;

let mermaidReady = false;

/** Mermaid の初期設定（1回だけ） */
function setupMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: 'Inter, "Hiragino Sans", "Noto Sans JP", sans-serif',
    themeVariables: {
      primaryColor: '#ffffff',
      primaryBorderColor: '#c4ccdd',
      primaryTextColor: '#10162a',
      lineColor: '#69738c',
      fontSize: '13px',
    },
    flowchart: { htmlLabels: true, curve: 'linear', useMaxWidth: true, padding: 10 },
  });
  mermaidReady = true;
}

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

  setupMermaid();

  /* ---------- 状態 ---------- */
  let syncing = false;      // 変換が往復しないようにする鍵
  let syncedCode = '';      // コードとブロックが一致していると確認済みの内容
  let lastDefinition = '';  // 直近に描いたフローチャートの定義
  let lineByNode = {};
  let renderCount = 0;
  let stepLineHandle = null;
  // フローチャートの書き方（やさしい日本語 / コードのまま）
  let flowJapanese = localStorage.getItem('easycode_flow_japanese') !== '0';

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
  const workspace = Blockly.inject(blocklyId, {
    toolbox: buildToolbox({ drawing }),
    renderer: 'zelos',
    theme: Blockly.Themes.Zelos,
    grid: { spacing: 26, length: 3, colour: '#e3e8f2', snap: true },
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
        toast('このブラウザに保存できません。書いたものは、閉じると消えてしまいます。「🔗 共有」でリンクにして控えておきましょう。');
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

    const result = pythonToMermaid(editor.getValue(), { japanese: flowJapanese });
    lineByNode = result.lineByNode || {};

    if (!result.definition) {
      lastDefinition = '';
      container.innerHTML =
        `<div class="empty-state"><span class="big">🔀</span>${(result.message || '').replace(/\n/g, '<br>')}</div>`;
      return;
    }

    // 図が同じなら描き直さない（ここが一番重い処理）
    if (!force && result.definition === lastDefinition) return;
    lastDefinition = result.definition;

    const id = `flow-${++renderCount}`;
    try {
      const { svg } = await mermaid.render(id, result.definition);
      container.innerHTML = svg;
      if (result.message) {
        const note = document.createElement('div');
        note.className = 'empty-state';
        note.textContent = result.message;
        container.appendChild(note);
      }
    } catch (e) {
      console.error('フローチャートの描画に失敗:', e);
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      lastDefinition = '';
      container.innerHTML =
        '<div class="empty-state"><span class="big">🤔</span>このコードは図にできませんでした<br>' +
        'Python の書き方を確認してみましょう</div>';
    }
  }

  /* ---------- 表示の調整 ---------- */

  /** ブロックを整列させ、画面に収める */
  function fitBlocks() {
    if (!workspace.getTopBlocks(false).length) return;
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
      else if (scale < 0.6) workspace.setScale(0.6);
      workspace.scrollCenter();
    } catch (e) {
      console.warn('ブロックの表示調整に失敗:', e);
    }
  }

  /** レイアウトが変わったときに呼ぶ */
  function refreshLayout() {
    requestAnimationFrame(() => {
      editor.refresh();
      Blockly.svgResize(workspace);
    });
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
