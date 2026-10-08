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

/** 範囲の罫を消す */
function clearScope(cm) {
  const old = scopes.get(cm);
  if (!old) return;
  for (const [handle, cls] of old) cm.removeLineClass(handle, 'wrap', cls);
  scopes.delete(cm);
}

/**
 * 指定した行のまとまりに、朱の罫を引く
 * @param {object} cm CodeMirror
 * @param {number|null} line 1 から数えた行。null なら消す
 */
export function showBlockAt(cm, line) {
  if (!cm) return;
  clearScope(cm);
  if (!line) return;
  const lines = cm.getValue().split('\n');
  const block = findBlock(lines, line - 1);
  if (!block || block.end === block.head) return;
  const marks = [];
  const depth = Math.min(block.depth, 7);
  const add = (i, cls) => {
    const handle = cm.addLineClass(i, 'wrap', cls);
    marks.push([handle, cls]);
  };
  add(block.head, 'cm-scope-head');
  add(block.head, `cm-scope-d${depth}`);
  for (let i = block.head + 1; i <= block.end; i++) {
    add(i, 'cm-scope-body');
    add(i, `cm-scope-d${depth}`);
  }
  add(block.end, 'cm-scope-end');
  scopes.set(cm, marks);
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
