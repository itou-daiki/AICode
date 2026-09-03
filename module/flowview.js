// module/flowview.js
// フローチャートを描いて、パネルの大きさに合わせるところ。
//
// もとは workbench.js の中にあったが、レッスンモードでも同じものが要るので分けた。
// workbench.js は Blockly が無いと動かないので、そのまま使いまわせない。

import { pythonToMermaid } from './flowchart.js';

let mermaidReady = false;

/** Mermaid の初期設定（1回だけ） */
export function setupMermaid() {
  if (mermaidReady) return;
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
    flowchart: { htmlLabels: true, curve: 'linear', useMaxWidth: true, padding: 10 },
  });
  mermaidReady = true;
}

let renderCount = 0;

/**
 * Python のコードからフローチャートを描く
 * @param {HTMLElement} container 描く場所
 * @param {string} python
 * @param {object} [options]
 * @param {boolean} [options.japanese] やさしい日本語にするか
 * @param {boolean} [options.fit] パネルに収めるか
 * @returns {Promise<{lineByNode: object, message: string|null}>}
 */
export async function renderFlowchart(container, python, options = {}) {
  const { japanese = true, fit = true } = options;
  if (!container) return { lineByNode: {}, message: null };

  setupMermaid();
  const result = pythonToMermaid(python, { japanese });

  if (!result.definition) {
    // 文章は textContent で入れる（HTML として解釈させない）
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('span');
    icon.className = 'big';
    icon.textContent = '';
    empty.append(icon, document.createTextNode(result.message || 'コードを書くと流れが図になります'));
    container.appendChild(empty);
    return { lineByNode: {}, message: result.message };
  }

  const id = `lesson-flow-${++renderCount}`;
  try {
    const { svg } = await mermaid.render(id, result.definition);
    container.innerHTML = svg;
    fitFlowchart(container, { fit });

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
    const failed = document.createElement('div');
    failed.className = 'empty-state';
    const icon = document.createElement('span');
    icon.className = 'big';
    icon.textContent = '';
    failed.append(icon, document.createTextNode('このコードは図にできませんでした'));
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
 */
export function fitFlowchart(container, options = {}) {
  const { fit = true, minScale = 0.75 } = options;
  const svg = container && container.querySelector('svg');
  if (!svg) return;

  const box = svg.viewBox && svg.viewBox.baseVal;
  if (!box || !box.width || !box.height) return;

  if (!fit) {
    svg.style.width = `${Math.round(box.width)}px`;
    svg.style.height = `${Math.round(box.height)}px`;
    svg.style.maxWidth = 'none';
    return;
  }

  const host = container.parentElement || container;
  const style = getComputedStyle(container);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availableWidth = host.clientWidth - padX;
  const availableHeight = host.clientHeight - padY;
  if (availableWidth <= 0 || availableHeight <= 0) return;

  // 大きくはしない。小さくするのにも下限を置く（読めなくなるくらいなら、
  // 読める大きさを保って縦スクロールで見てもらう）。横は必ず収める。
  let scale = Math.min(availableWidth / box.width, availableHeight / box.height, 1);
  if (scale < minScale) scale = Math.min(minScale, availableWidth / box.width);

  svg.style.width = `${Math.round(box.width * scale)}px`;
  svg.style.height = `${Math.round(box.height * scale)}px`;
  svg.style.maxWidth = 'none';
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
