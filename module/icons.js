// module/icons.js
// 画面で使う線画。
//
// 絵文字はやめて、ここで描いたものだけを使う。
// 絵文字は端末ごとに形も色も変わるうえ、太さがそろわず、
// 「とりあえず置いた印」に見える。ここは線の太さと角の処理をそろえてある。
//
// 20×20 の升目に、1.6 の線で描く。角は落とさない（製図の線と同じ）。

/** 名前 → 中身（20×20 の座標系） */
const PATHS = {
  /* --- モード --- */
  // コーディング：フラスコ
  flask: '<path d="M8 3v5L4 16h12L12 8V3"/><path d="M7 3h6"/><path d="M6.5 12h7"/>',
  // 課題：番号つきの行
  lanes: '<path d="M3 5h3M3 10h3M3 15h3"/><path d="M9 5h8M9 10h8M9 15h8"/>',
  // 作図：コンパスで引いた弧
  compass: '<path d="M10 3v3"/><path d="M10 6 5 17M10 6l5 11"/><path d="M6.5 13.5h7"/>',
  // 資料：綴じた紙
  sheets: '<path d="M5 3h7l3 3v11H5z"/><path d="M12 3v3h3"/><path d="M7.5 10h5M7.5 13h5"/>',

  /* --- 操作 --- */
  run: '<path d="M6 4l10 6-10 6z"/>',
  stop: '<path d="M5 5h10v10H5z"/>',
  step: '<path d="M5 4l7 6-7 6z"/><path d="M15 4v12"/>',
  first: '<path d="M15 4l-7 6 7 6z"/><path d="M5 4v12"/>',
  prev: '<path d="M13 4l-7 6 7 6z"/>',
  next: '<path d="M7 4l7 6-7 6z"/>',
  check: '<path d="M4 10l4 4 8-9"/>',
  cross: '<path d="M5 5l10 10M15 5L5 15"/>',
  eraser: '<path d="M3 16h14"/><path d="M6 13 12 4l4 3-6 9z"/>',
  share: '<path d="M6 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M18 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M18 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="m6 9 8-3M6 11l8 3"/>',
  trash: '<path d="M4 6h12"/><path d="M7 6V4h6v2"/><path d="M6 6l1 11h6l1-11"/>',
  copy: '<path d="M7 3h8v10H7z"/><path d="M4 7v10h8"/>',
  indent: '<path d="M3 5h14M7 10h10M7 15h10"/><path d="M3 8l2 2-2 2"/>',
  format: '<path d="M3 5h14M3 10h9M3 15h12"/>',
  undo: '<path d="M4 9h8a4 4 0 1 1 0 8H8"/><path d="M7 6 4 9l3 3"/>',
  redo: '<path d="M16 9H8a4 4 0 1 0 0 8h4"/><path d="m13 6 3 3-3 3"/>',
  tidy: '<path d="M3 4h14M3 10h14M3 16h14"/><path d="M6 4v12M14 4v12"/>',
  refresh: '<path d="M16 8A6 6 0 1 0 16 12"/><path d="M16 4v4h-4"/>',
  save: '<path d="M4 4h9l3 3v9H4z"/><path d="M7 4v4h5V4"/><path d="M7 16v-4h6v4"/>',
  maximize: '<path d="M4 8V4h4M16 12v4h-4"/>',
  menu: '<path d="M3 5h14M3 10h14M3 15h14"/>',
  book: '<path d="M4 4h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H4z"/><path d="M16 4h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z"/>',
  pencil: '<path d="M4 16v-3l9-9 3 3-9 9z"/><path d="M11 6l3 3"/>',
  bulb: '<path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9z"/><path d="M8 17h4"/>',
  chat: '<path d="M3 4h14v9H8l-5 4z"/>',
  robot: '<path d="M5 8h10v7H5z"/><path d="M10 5v3"/><path d="M7.5 11h1M11.5 11h1"/>',
  gear: '<path d="M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.5 4.5l1.8 1.8M13.7 13.7l1.8 1.8M15.5 4.5l-1.8 1.8M6.3 13.7l-1.8 1.8"/>',
  flow: '<path d="M7 3h6v3H7z"/><path d="M10 6v3"/><path d="M10 9l3 2.5-3 2.5-3-2.5z"/><path d="M10 14v3"/>',
  blocks: '<path d="M3 4h6v4H3z"/><path d="M5 8v3h8V8"/><path d="M11 11h6v4h-6z"/>',
  code: '<path d="M7 6 3 10l4 4"/><path d="m13 6 4 4-4 4"/>',
  notation: '<path d="M4 4h12"/><path d="M6 4v12"/><path d="M9 8h7M9 12h5"/>',
  // 絵を描く面。コンパスの線画は小さくすると「A」に見えて、
  // すぐ左のレーン記号（A〜F）と紛らわしいので、別の形にしてある。
  canvas: '<path d="M3 4h14v12H3z"/><path d="M6 13l3-4 2 2.5 2-3 1 1.5"/><path d="M7 7.5h.01"/>',
};

/**
 * 線画を作る
 * @param {string} name PATHS の名前
 * @param {object} [options]
 * @param {string} [options.className] 足したい class
 * @param {string} [options.title] 読み上げ用の名前（省くと飾り扱い）
 * @returns {SVGElement|null}
 */
export function icon(name, options = {}) {
  const path = PATHS[name];
  if (!path) return null;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', `icon ${options.className || ''}`.trim());
  svg.innerHTML = path;

  if (options.title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}

/**
 * 文字列として欲しいとき（innerHTML に混ぜる場合）
 * @param {string} name
 * @param {string} [className]
 * @returns {string}
 */
export function iconHtml(name, className = '') {
  const path = PATHS[name];
  if (!path) return '';
  return `<svg viewBox="0 0 20 20" class="icon ${className}" aria-hidden="true">${path}</svg>`;
}

/**
 * ボタンなどの中身を「線画＋文字」に置きかえる
 * @param {HTMLElement} element
 * @param {string} name
 * @param {string} label
 */
export function setIconLabel(element, name, label) {
  if (!element) return;
  element.textContent = '';
  const graphic = icon(name);
  if (graphic) element.appendChild(graphic);
  if (label) {
    const text = document.createElement('span');
    text.textContent = label;
    element.appendChild(text);
  }
}

/** 使える名前の一覧（検査で使う） */
export const ICON_NAMES = Object.keys(PATHS);
