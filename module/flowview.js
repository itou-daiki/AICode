// module/flowview.js
// フローチャートを描いて、パネルの大きさに合わせるところ。
//
// もとは workbench.js の中にあったが、レッスンモードでも同じものが要るので分けた。
// workbench.js は Blockly が無いと動かないので、そのまま使いまわせない。

import { pythonToMermaid } from './flowchart.js';
import { icon } from './icons.js';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
let mermaidLoading = null;

/**
 * Mermaid を読みこんで、初期設定する（1回だけ）
 *
 * はじめの画面を早く出すため、ページを開いたときには読まず、図が要るときに読む。
 * @returns {Promise<void>}
 */
export function setupMermaid() {
  if (!mermaidLoading) {
    mermaidLoading = (window.mermaid ? Promise.resolve() : new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MERMAID_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error('フローチャートを描く部品を読みこめませんでした（ネットワークを確かめてください）'));
      document.head.appendChild(script);
    })).then(configureMermaid).catch((e) => { mermaidLoading = null; throw e; });
  }
  return mermaidLoading;
}

function configureMermaid(htmlLabels = true) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: '"BIZ UDPGothic", "Hiragino Sans", sans-serif',
    themeVariables: {
      primaryColor: '#FCFCFA',
      primaryBorderColor: '#4A4E52',
      primaryTextColor: '#16181A',
      lineColor: '#4A4E52',
      fontSize: '13px',
    },
    flowchart: {
      htmlLabels,
      // 教科書のフローチャートは線を必ず直角に曲げる。
      // linear のままだと斜めに走って、見なれた図と別物になる。
      curve: 'step',
      useMaxWidth: true,
      padding: 8,
      // 段の間隔。mermaid の既定（50）だと、5 行のプログラムでも縦に 700px を超えて
      // 横長のパネルからはみ出す。字を小さくせずに収めるため、ここをつめる。
      rankSpacing: 20,
      nodeSpacing: 34,
      // ひし形はラベルの幅の 2 倍近くまで広がる。折り返して小さく収める
      wrappingWidth: 110,
    },
  });
}

let renderCount = 0;
// 図ごとの Mermaid 定義（画像保存で、文字をふつうの SVG 文字として描き直すのに使う）
const definitions = new WeakMap();

// Mermaid の設定は全体で 1 つなので、描く処理は 1 つずつ順番に行う
// （画像保存が一時的に設定を変えている間に、ふつうの描画が割りこまないように）
let renderLock = Promise.resolve();
function exclusive(task) {
  const run = renderLock.then(task, task);
  renderLock = run.catch(() => {});
  return run;
}

/**
 * Python のコードからフローチャートを描く
 * @param {HTMLElement} container 描く場所
 * @param {string} python
 * @param {object} [options]
 * @param {boolean} [options.japanese] やさしい日本語にするか
 * @param {boolean} [options.fit] パネルに収めるか
 * @param {boolean} [options.sketch] スケッチのコードとして読むか
 * @returns {Promise<{lineByNode: object, message: string|null}>}
 */
export async function renderFlowchart(container, python, options = {}) {
  const { japanese = true, fit = true, sketch = false } = options;
  if (!container) return { lineByNode: {}, message: null };

  const result = pythonToMermaid(python, { japanese, sketch });

  if (!result.definition) {
    // 文章は textContent で入れる（HTML として解釈させない）
    container.innerHTML = '';
    definitions.delete(container);
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const mark = document.createElement('span');
    mark.className = 'big';
    mark.appendChild(icon('flow'));
    empty.append(mark, document.createTextNode(result.message || 'コードを書くと流れが図になります'));
    container.appendChild(empty);
    return { lineByNode: {}, message: result.message };
  }

  const id = `lesson-flow-${++renderCount}`;
  try {
    await setupMermaid();
    const { svg } = await exclusive(() => mermaid.render(id, result.definition));
    container.innerHTML = svg;
    definitions.set(container, result.definition);
    fitFlowchart(container, { fit });
    scrollToTop(container);

    if (result.message) {
      const note = document.createElement('div');
      note.className = 'empty-state';
      note.textContent = result.message;
      container.appendChild(note);
    }
    return { lineByNode: result.lineByNode || {}, message: result.message };
  } catch (e) {
    console.error('フローチャートの描画に失敗:', e);
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    container.innerHTML = '';
    definitions.delete(container);
    const failed = document.createElement('div');
    failed.className = 'empty-state';
    const mark = document.createElement('span');
    mark.className = 'big';
    mark.appendChild(icon('cross'));
    failed.append(mark, document.createTextNode(window.mermaid ? 'このコードは図にできませんでした' : e.message));
    container.appendChild(failed);
    return { lineByNode: {}, message: null };
  }
}

/**
 * 図をパネルの大きさに合わせる
 *
 * mermaid は横幅にだけ合わせるので、縦に長い図は下が見切れてしまう。
 * 縦も見て、全体が入る大きさに縮める。
 *
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {boolean} [options.fit] false なら実物大
 * @param {number} [options.minScale] これより小さくはしない（字が読めなくなるため）
 * @param {number} [options.scale] 倍率を自分で決める（＋ − ボタンで使う）
 * @returns {number} 実際に使った倍率
 */
export function fitFlowchart(container, options = {}) {
  const { fit = true, minScale = 0.6, scale: forced = 0 } = options;
  const svg = container && container.querySelector('svg');
  if (!svg) return 0;

  const box = svg.viewBox && svg.viewBox.baseVal;
  if (!box || !box.width || !box.height) return 0;

  // ＋ − で倍率を決めているときは、そのとおりに描く
  if (forced > 0) {
    svg.style.width = `${Math.round(box.width * forced)}px`;
    svg.style.height = `${Math.round(box.height * forced)}px`;
    svg.style.maxWidth = 'none';
    return forced;
  }

  if (!fit) {
    svg.style.width = `${Math.round(box.width)}px`;
    svg.style.height = `${Math.round(box.height)}px`;
    svg.style.maxWidth = 'none';
    return 1;
  }

  const host = container.parentElement || container;
  const style = getComputedStyle(container);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availableWidth = host.clientWidth - padX;
  const availableHeight = host.clientHeight - padY;
  if (availableWidth <= 0 || availableHeight <= 0) return 0;

  // 大きくはしない。小さくするのにも下限を置く（読めなくなるくらいなら、
  // 読める大きさを保って縦スクロールで見てもらう）。横は必ず収める。
  let scale = Math.min(availableWidth / box.width, availableHeight / box.height, 1);
  if (scale < minScale) scale = Math.min(minScale, availableWidth / box.width);

  svg.style.width = `${Math.round(box.width * scale)}px`;
  svg.style.height = `${Math.round(box.height * scale)}px`;
  svg.style.maxWidth = 'none';
  return scale;
}

/**
 * 図の頭（開始）が見えるところまで戻す
 *
 * 図は描き終わってから大きさが決まるので、ブラウザが「見えていたものを
 * 動かさない」ようにスクロール位置をずらす。そのままだと、開いた瞬間に
 * 図の途中から表示されて、開始が見えない。
 * @param {HTMLElement} container
 */
function scrollToTop(container) {
  for (let node = container; node; node = node.parentElement) {
    if (node.scrollTop) node.scrollTop = 0;
    if (node === document.body) break;
  }
}

/**
 * 今いる行にあたる図形を光らせる
 * @param {HTMLElement} container
 * @param {object} lineByNode { ノードid: 行番号 }
 * @param {number} line
 */
export function highlightFlowLine(container, lineByNode, line) {
  if (!container) return;
  for (const node of container.querySelectorAll('g.node.step-active')) {
    node.classList.remove('step-active');
  }
  if (!line) return;

  for (const [nodeId, nodeLine] of Object.entries(lineByNode || {})) {
    if (nodeLine !== line) continue;
    const node = container.querySelector(`g.node[id*="${nodeId}"]`);
    if (node) node.classList.add('step-active');
  }
}

/**
 * 今の図を PNG にして保存する
 *
 * 画面の図は文字を HTML（foreignObject）で描いていて、そのまま画像にすると
 * ブラウザによっては保存できない。そこで、文字を SVG の文字にした図を
 * 見えないところで描き直し、白い背景に 2 倍の大きさで書き出す。
 * @param {HTMLElement} container 図が入っている場所
 * @param {string} [filename]
 * @returns {Promise<Blob>} 保存した PNG
 */
export async function saveFlowchartPng(container, filename = 'flowchart.png') {
  const definition = container && definitions.get(container);
  if (!definition || !container.querySelector('svg[id^="lesson-flow-"]')) {
    const empty = new Error('保存できる図がありません');
    empty.noDiagram = true;
    throw empty;
  }

  await setupMermaid();
  const id = `export-flow-${++renderCount}`;
  const svgText = await exclusive(async () => {
    try {
      configureMermaid(false);
      return (await mermaid.render(id, definition)).svg;
    } finally {
      configureMermaid(true);
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  const box = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (!(box[2] > 0) || !(box[3] > 0)) throw new Error('図の大きさを調べられませんでした');
  // 保存時は画面と別のフォントで描かれることがあるので、ふちに少し余白をとって文字の欠けを防ぐ
  const pad = 10;
  const width = box[2] + pad * 2;
  const height = box[3] + pad * 2;
  svg.setAttribute('viewBox', `${box[0] - pad} ${box[1] - pad} ${width} ${height}`);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.removeAttribute('style');
  // 日本語が出るように、フォントを図そのものに書きこむ
  svg.setAttribute('font-family', '"BIZ UDPGothic", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif');

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('図を画像にできませんでした'));
      image.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG を作れませんでした');
    if (filename) downloadBlob(blob, filename);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
