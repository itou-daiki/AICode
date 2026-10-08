// module/blockscope.js
// 字下げと「どこからどこまでが中身か」を、コードエディタの上で見えるようにする。
//
//   attachBlockScope(cm) … 字下げの深さを段ごとの濃さで塗り、カーソルのいるまとまりに朱の罫を引く
//   showBlockAt(cm, line) … 指定した行のまとまりに罫を引く（ステップ実行で、次に動く行に合わせる）
//   findBlock(lines, line) … その行をふくむまとまり（if・for・def などの見出しと、中身の範囲）を探す
//
// Python は字下げで中身を決める。見た目には空白しかないので、
// 「どこまでが for の中か」「この行はどの if に入っているか」で生徒はつまずく。
// 段の濃さで深さを、朱の罫で範囲を見せる。

import { scanLine } from './pyfix.js';

const UNIT = 4;

const indentOf = (text) => {
  const lead = String(text ?? '').match(/^[ \t]*/)[0];
  return lead.replace(/\t/g, ' '.repeat(UNIT)).length;
};
const isBlank = (text) => !String(text ?? '').trim() || /^\s*#/.test(text);
/** コメントを除いた行（文字列の中の # はコメントではない） */
const codePart = (text) => {
  const line = String(text ?? '');
  const kinds = scanLine(line);
  const at = kinds.indexOf('comment');
  return at < 0 ? line : line.slice(0, at);
};
/** 「:」で終わる見出しの行か */
const isHeader = (text) => /:\s*$/.test(codePart(text))
  && /^\s*(async\s+)?(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b/.test(text);

/**
 * その行をふくむまとまりを探す
 *
 * 見出しの行そのものなら、その見出しのまとまり。中身の行なら、いちばん内側の見出しのまとまり。
 * @param {string[]} lines すべての行（0 から数える）
 * @param {number} line 調べる行（0 から数える）
 * @returns {{head: number, end: number, depth: number}|null} 見出しの行・中身の最後の行・見出しの深さ（段）
 */
export function findBlock(lines, line) {
  if (line < 0 || line >= lines.length) return null;
  let head = -1;
  if (isHeader(lines[line])) {
    head = line;
  } else {
    // 空行のときは、下の行の深さで考える（まとまりの途中の空行も中身にふくめる）
    let probe = line;
    while (probe < lines.length && isBlank(lines[probe])) probe++;
    if (probe >= lines.length) return null;
    const depth = indentOf(lines[probe]);
    if (depth === 0) return null;
    let need = depth;
    for (let i = line - 1; i >= 0; i--) {
      if (isBlank(lines[i])) continue;
      const d = indentOf(lines[i]);
      if (d >= need) continue;
      if (isHeader(lines[i])) { head = i; break; }
      // かっこの続きの行など、見出しではない浅い行に出会ったら、その行のまとまりを探しつづける
      if (d === 0) return null;
      need = d;
    }
  }
  if (head < 0) return null;
  const base = indentOf(lines[head]);
  let end = head;
  for (let i = head + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (indentOf(lines[i]) <= base) break;
    end = i;
  }
  return { head, end, depth: Math.round(base / UNIT) };
}

/**
 * その行を外から順にかこんでいる見出しの行を、外側から並べて返す
 * （「for の中身 › if の中身」のように、いまどこにいるかを言うのに使う）
 * @param {string[]} lines
 * @param {number} line 0 から数えた行
 * @returns {number[]} 見出しの行（0 から）。外側が先
 */
export function enclosingHeaders(lines, line) {
  if (line < 0 || line >= lines.length) return [];
  let probe = line;
  while (probe < lines.length && isBlank(lines[probe])) probe++;
  if (probe >= lines.length) return [];
  let need = indentOf(lines[probe]);
  const chain = [];
  for (let i = line - 1; i >= 0 && need > 0; i--) {
    if (isBlank(lines[i])) continue;
    const d = indentOf(lines[i]);
    if (d >= need) continue;
    if (isHeader(lines[i])) chain.unshift(i);
    need = d;
  }
  return chain;
}

/**
 * 字下げの段を塗る重ね書き。行頭の空白を 4 文字ずつに区切って、段ごとに濃さを変える
 * （CodeMirror の重ね書きは状態を持てないので、行頭からの位置だけで決める）
 */
const indentOverlay = {
  token(stream) {
    if (stream.pos === 0 || /^[ \t]*$/.test(stream.string.slice(0, stream.pos))) {
      const lead = stream.string.match(/^[ \t]*/)[0].length;
      if (stream.pos < lead) {
        const level = Math.floor(stream.pos / UNIT);
        const stop = Math.min(lead, (level + 1) * UNIT);
        stream.pos = Math.max(stream.pos + 1, stop);
        // 4 文字にそろっていない半端な字下げは、別の印にする（ずれの見つけ方）
        const odd = stop - level * UNIT < UNIT && stop === lead;
        // タブがまざった字下げも、ずれのもとなので同じ印にする
        const tab = stream.string.slice(0, lead).includes('\t');
        return odd || tab ? 'indent-odd' : `indent-${(level % 2) + 1}`;
      }
    }
    stream.skipToEnd();
    return null;
  },
};

const scopes = new WeakMap();

/** 罫を引ける字下げの最大（文字数）。これより深い見出しは、この位置に引く */
const MAX_COLUMN = 40;
let positionStylesReady = false;

/**
 * 字下げの文字数ごとに、見出しの字の頭（--head-x）と罫の位置（--scope-x）を決める
 * （0〜40 文字分の決まりを、1 度だけページに足す）
 */
function ensurePositionStyles() {
  if (positionStylesReady || typeof document === 'undefined') return;
  positionStylesReady = true;
  const rules = [];
  for (let c = 0; c <= MAX_COLUMN; c++) {
    rules.push(`.cm-scope-c${c}{--head-x:calc(4px + ${c}ch);--scope-x:calc(4px + ${c + 1.5}ch)}`);
  }
  const style = document.createElement('style');
  style.dataset.from = 'blockscope';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

/** 範囲の罫と、見出しの行の「中身：〜行目」を消す */
function clearScope(cm) {
  const old = scopes.get(cm);
  if (!old) return;
  for (const [handle, cls] of old.lines) cm.removeLineClass(handle, 'wrap', cls);
  if (old.label) old.label.clear();
  scopes.delete(cm);
}

/**
 * 指定した行のまとまりを見せる
 *
 * ・見出しの行 … 見出しの字の頭から右を薄く塗り、行の後ろに「中身：4〜5 行目」と書く
 * ・中身の行   … 見出しの字と中身の字のあいだ（字下げの空白）に、[ の形の罫を引き、中身を塗る
 * 罫を空白の中に引くので、字には重ならない。
 * @param {object} cm CodeMirror
 * @param {number|null} line 1 から数えた行。null なら消す
 * @param {object} [options]
 * @param {number|null} [options.busyLine] 行の後ろに別の注釈を書く行（1 から）。そこには「中身：」を書かない
 */
export function showBlockAt(cm, line, { busyLine = null } = {}) {
  if (!cm) return;
  clearScope(cm);
  if (!line) return;
  const lines = cm.getValue().split('\n');
  const block = findBlock(lines, line - 1);
  if (!block || block.end === block.head) return;
  ensurePositionStyles();
  const marks = [];
  // 罫の位置は、見出しの実際の字下げ（文字数）から決める（4 の倍数でなくても字に重ならない）
  const column = Math.min(indentOf(lines[block.head]), MAX_COLUMN);
  const add = (i, cls) => {
    const handle = cm.addLineClass(i, 'wrap', cls);
    marks.push([handle, cls]);
  };
  add(block.head, 'cm-scope-head');
  add(block.head, `cm-scope-c${column}`);
  // 中身の最初の行（見出しのすぐ下の、空でない行）。[ の上の横線もここに引く
  let first = block.head + 1;
  while (first < block.end && isBlank(lines[first])) first++;
  for (let i = block.head + 1; i <= block.end; i++) {
    add(i, 'cm-scope-body');
    add(i, `cm-scope-c${column}`);
  }
  add(first, 'cm-scope-first');
  add(block.end, 'cm-scope-last');
  if (busyLine === block.head + 1) { scopes.set(cm, { lines: marks, label: null }); return; }

  const label = document.createElement('span');
  label.className = 'cm-scope-label';
  label.textContent = first === block.end ? `中身：${block.end + 1} 行目` : `中身：${first + 1}〜${block.end + 1} 行目`;
  const bookmark = cm.setBookmark({ line: block.head, ch: lines[block.head].length }, { widget: label, insertLeft: true });
  scopes.set(cm, { lines: marks, label: bookmark });
}

/**
 * エディタに付ける
 * @param {object} cm CodeMirror
 * @param {object} [options]
 * @param {boolean} [options.followCursor] カーソルのいるまとまりに罫を引くか（読むだけのエディタでは false）
 * @returns {{pause(on: boolean): void}} ステップ実行のあいだは、カーソルに合わせるのを止める
 */
export function attachBlockScope(cm, { followCursor = true } = {}) {
  cm.addOverlay(indentOverlay);
  let paused = false;
  if (followCursor) {
    let timer = null;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!paused) showBlockAt(cm, cm.getCursor().line + 1);
      }, 60);
    };
    cm.on('cursorActivity', update);
    cm.on('change', update);
    cm.on('blur', () => { if (!paused) { clearTimeout(timer); clearScope(cm); } });
  }
  return {
    pause(on) {
      paused = on;
      if (!on && cm.hasFocus()) showBlockAt(cm, cm.getCursor().line + 1);
      else if (!on) clearScope(cm);
    },
  };
}
