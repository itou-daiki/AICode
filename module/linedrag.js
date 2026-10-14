// module/linedrag.js
// 行番号の左の「つまみ」（⇅）をドラッグして、行を動かす。
//
//   attachLineDrag(cm) … つまみを付ける。Alt + ↑ / ↓ でも 1 行ずつ動かせる
//   moveLines(lines, from, to, before) … 行の並べかえ（画面に関係なく確かめられる形）
//
// if・for などの見出しの行をつかんだときは、その中身もいっしょに動かす（見出しだけ動くとこわれるため）。
// 行の字下げは変えない。動かした先でまとまりに入れたいときは、字下げで決める。

import { findBlock } from './blockscope.js';

/**
 * 行を並べかえる
 * @param {string[]} lines すべての行
 * @param {number} from 動かす最初の行（0 から）
 * @param {number} to 動かす最後の行（0 から）
 * @param {number} before この行の前に入れる（0〜lines.length。lines.length なら最後）
 * @returns {{lines: string[], start: number}|null} 並べかえた行と、動かした行の新しい最初の位置（動かないときは null）
 */
export function moveLines(lines, from, to, before) {
  if (before >= from && before <= to + 1) return null;
  const moving = lines.slice(from, to + 1);
  const rest = [...lines.slice(0, from), ...lines.slice(to + 1)];
  const at = before > to ? before - moving.length : before;
  rest.splice(at, 0, ...moving);
  return { lines: rest, start: at };
}

const indentOf = (text) => String(text ?? '').match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
const isBlank = (text) => !String(text ?? '').trim();
/** if の続き（elif / else）や try の続き（except / else / finally）、for・while の else の見出しか */
const isFollower = (text) => /^\s*(elif\b.*|else|except\b.*|finally)\s*:/.test(String(text ?? '').replace(/\s+#.*$/, ''));
const isLeader = (text) => /^\s*(if|try|for|while|async\s+for)\b/.test(String(text ?? ''));

/**
 * つかんだ行から、いっしょに動かす範囲を決める
 *
 * ・ふつうの行 … その 1 行
 * ・見出しの行 … 中身まで。if に elif / else が続くとき（try の except、for の else も）は、その連なりぜんぶ
 *   （else だけ残ると、こわれてしまうため。else の行をつかんだときも、if からまとめて動かす）
 * @param {string[]} lines
 * @param {number} line 0 から
 * @returns {{from: number, to: number}}
 */
export function blockRange(lines, line) {
  const own = findBlock(lines, line);
  if (!own || own.head !== line) return { from: line, to: line };
  const base = indentOf(lines[line]);
  // 連なりの先頭（else などをつかんだときは、上の if / try までさかのぼる）
  let from = line;
  if (isFollower(lines[line])) {
    for (let i = line - 1; i >= 0; i--) {
      if (isBlank(lines[i]) || indentOf(lines[i]) > base) continue;
      if (indentOf(lines[i]) < base) break;
      if (isFollower(lines[i])) { from = i; continue; }
      if (isLeader(lines[i])) from = i;
      break;
    }
  }
  // 連なりの最後（下に同じ深さの elif / else / except / finally が続くかぎり）
  let to = (findBlock(lines, from) || own).end;
  for (let i = to + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (indentOf(lines[i]) !== base || !isFollower(lines[i])) break;
    const next = findBlock(lines, i);
    to = next && next.head === i ? next.end : i;
    i = to;
  }
  return { from, to };
}

function rangeFor(cm, line) {
  return blockRange(cm.getValue().split('\n'), line);
}

/**
 * 並べかえを 1 回の変更としてエディタに入れる（「元に戻す」1 回で戻る）
 * @returns {boolean} 動かしたか
 */
function applyMove(cm, from, to, before) {
  const lines = cm.getValue().split('\n');
  const moved = moveLines(lines, from, to, before);
  if (!moved) return false;
  const start = Math.min(from, before);
  const end = Math.max(to, before - 1);
  const text = moved.lines.slice(start, end + 1).join('\n');
  cm.operation(() => {
    // 「+」を付けない名前にする（続けて動かしても、元に戻すは 1 回ずつ）
    cm.replaceRange(text, { line: start, ch: 0 }, { line: end, ch: lines[end].length }, 'linemove');
    const count = to - from;
    cm.setSelection({ line: moved.start, ch: 0 }, { line: moved.start + count, ch: cm.getLine(moved.start + count).length });
  });
  cm.scrollIntoView({ line: moved.start, ch: 0 }, 40);
  return true;
}

/**
 * エディタに付ける
 * @param {object} cm CodeMirror
 */
export function attachLineDrag(cm) {
  // 行番号の左に、つまみ用の細い列を足す
  const gutters = cm.getOption('gutters') || [];
  if (!gutters.includes('cm-drag-gutter')) {
    const rest = gutters.filter(g => g !== 'CodeMirror-linenumbers');
    cm.setOption('gutters', ['cm-drag-gutter', 'CodeMirror-linenumbers', ...rest]);
  }

  const makeHandle = () => {
    const handle = document.createElement('span');
    handle.className = 'cm-drag-handle';
    // 上下に動かせることが一目でわかるよう、上下の矢印にする
    handle.textContent = '⇅';
    handle.title = 'ここをつかんで上下に動かすと、この行を動かせます（「:」の行は中身ごと）。Alt + ↑ / ↓ でも動かせます';
    handle.setAttribute('aria-hidden', 'true');
    return handle;
  };
  const markAll = () => {
    cm.operation(() => {
      cm.eachLine((handle) => {
        if (!handle.gutterMarkers || !handle.gutterMarkers['cm-drag-gutter']) cm.setGutterMarker(handle, 'cm-drag-gutter', makeHandle());
      });
    });
  };
  markAll();
  cm.on('change', markAll);

  // つまみは、カーソルのある行にだけはっきり出す（全部の行に並ぶと、何の印かわからない）
  let current = null;
  const showCurrent = () => {
    const line = cm.getLineHandle(cm.getCursor().line);
    if (line === current) return;
    if (current) cm.removeLineClass(current, 'wrap', 'cm-drag-current');
    current = line;
    if (current) cm.addLineClass(current, 'wrap', 'cm-drag-current');
  };
  showCurrent();
  cm.on('cursorActivity', showCurrent);

  /* ---------- ドラッグ ---------- */
  let drag = null;   // { from, to, before, marks: [] }

  const clearMarks = () => {
    if (!drag) return;
    for (const [handle, where, cls] of drag.marks) cm.removeLineClass(handle, where, cls);
    drag.marks = [];
  };
  const mark = (line, where, cls) => {
    const handle = cm.addLineClass(line, where, cls);
    drag.marks.push([handle, where, cls]);
  };
  const showDrag = () => {
    clearMarks();
    for (let i = drag.from; i <= drag.to; i++) mark(i, 'background', 'cm-drag-source');
    // 入れる場所に朱の線（その行の上か、最後の行の下）
    if (drag.before !== null && !(drag.before >= drag.from && drag.before <= drag.to + 1)) {
      if (drag.before < cm.lineCount()) mark(drag.before, 'wrap', 'cm-drop-before');
      else mark(cm.lineCount() - 1, 'wrap', 'cm-drop-after');
    }
  };

  /** マウスの高さから、どの行の前に入れるかを決める */
  const boundaryAt = (clientY) => {
    const line = cm.lineAtHeight(clientY, 'window');
    const top = cm.heightAtLine(line, 'window');
    const bottom = cm.heightAtLine(line + 1, 'window');
    const below = line >= cm.lineCount() - 1 && clientY > bottom;
    if (below) return cm.lineCount();
    return clientY > (top + bottom) / 2 ? line + 1 : line;
  };

  let scrollTimer = null;
  const autoScroll = (clientY) => {
    clearInterval(scrollTimer);
    const box = cm.getScrollerElement().getBoundingClientRect();
    const speed = clientY < box.top + 24 ? -12 : clientY > box.bottom - 24 ? 12 : 0;
    if (speed) scrollTimer = setInterval(() => cm.scrollTo(null, cm.getScrollInfo().top + speed), 30);
  };

  const wrapper = cm.getWrapperElement();
  // ステップ実行のあいだは動かさない（行の印・変数の表と、コードの行がずれるため）
  const locked = () => cm.getOption('readOnly') || document.body.classList.contains('step-mode');

  /** 動かさずにやめる（マウスがエディタの外で離された・Esc・別のところへ移った） */
  const cancel = () => {
    if (!drag) return;
    try { wrapper.releasePointerCapture(drag.pointerId); } catch { /* もう離れている */ }
    clearInterval(scrollTimer);
    clearMarks();
    drag = null;
    wrapper.classList.remove('is-line-dragging');
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { from, to, before, generation, hadFocus, started, line, onNumber } = drag;
    cancel();
    if (!started) {
      // 行番号を押しただけなら、その行を選ぶ（CodeMirror のふだんの動きと同じ）
      if (onNumber) {
        const end = line + 1 < cm.lineCount() ? { line: line + 1, ch: 0 } : { line, ch: cm.getLine(line).length };
        cm.setSelection({ line, ch: 0 }, end);
        cm.focus();
      }
      return;
    }
    // つかんでいるあいだにコードが変わったら（ブロックからの同期など）、古い行番号では動かさない
    if (before !== null && cm.changeGeneration() === generation) applyMove(cm, from, to, before);
    // 書いている途中だったときだけエディタに戻る（タブレットで画面のキーボードが出ないように）
    if (hadFocus) cm.focus();
  };

  // つまみ（⇅）と行番号の列をつかめる。押しただけでは動かさず、少し動かしてから行を運びはじめる
  const START_DISTANCE = 4;
  wrapper.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest && e.target.closest('.cm-drag-handle, .CodeMirror-linenumber');
    if (!grip || locked() || e.button !== 0 || !e.isPrimary) return;
    // 指で触るときは、つまみ（⇅）だけでつかむ。行番号の上から始めた指の動きは、ふつうのスクロールにする
    const onNumber = grip.classList.contains('CodeMirror-linenumber');
    if (onNumber && e.pointerType === 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    const line = cm.lineAtHeight(e.clientY, 'window');
    const { from, to } = rangeFor(cm, line);
    drag = {
      from, to, before: null, marks: [], pointerId: e.pointerId, startY: e.clientY, started: false, line, onNumber,
      generation: cm.changeGeneration(), hadFocus: cm.hasFocus(),
    };
    // つかんだ印は、行を描きなおすと消えてしまう（指で触ったときは、そこで追えなくなる）。
    // 消えないエディタ全体で追いかける
    try { wrapper.setPointerCapture(e.pointerId); } catch { /* 取れなくても、window で受け取る */ }
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKey, true);
  }, true);
  // CodeMirror の「行番号を押すと行を選ぶ」を、つかめるところでは起こさない
  wrapper.addEventListener('mousedown', (e) => {
    if (locked()) return;
    if (e.target.closest && e.target.closest('.cm-drag-handle, .CodeMirror-linenumber')) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      if (Math.abs(e.clientY - drag.startY) < START_DISTANCE) return;
      drag.started = true;
      wrapper.classList.add('is-line-dragging');
    }
    drag.before = boundaryAt(e.clientY);
    autoScroll(e.clientY);
    showDrag();
  }

  /* ---------- キーボード（Alt + ↑ / ↓） ---------- */
  const step = (direction) => (editor) => {
    if (locked()) return;
    const head = editor.getCursor('from');
    const tail = editor.getCursor('to');
    const first = head.line;
    // 行頭で終わる選択（行番号を押して選んだときなど）は、その行を含めない
    const last = tail.ch === 0 && tail.line > head.line ? tail.line - 1 : tail.line;
    const { from, to } = first === last ? rangeFor(editor, first) : { from: first, to: last };
    if (direction < 0 && from > 0) applyMove(editor, from, to, from - 1);
    if (direction > 0 && to < editor.lineCount() - 1) applyMove(editor, from, to, to + 2);
  };
  cm.addKeyMap({ 'Alt-Up': step(-1), 'Alt-Down': step(1) });
}
