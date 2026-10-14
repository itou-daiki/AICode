// module/indentcheck.js
// 「その行だけ字下げがちがう」行を見つけて、知らせる。
//
//   findIndentOutliers(code) … 前後の行はそろっているのに、その行だけ浅い・深い行を探す
//   attachIndentCheck(cm)   … エディタで、その行に朱の帯をつけ、行の後ろに「そろえる」ボタンを出す
//
// 例：def draw(): の中身の途中に、1 行だけ字下げを忘れた行があると、
// Python は「そこで中身が終わった」と考え、エラーは次の行（unexpected indent）として出る。
// 生徒はエラーの出た行を見て悩むので、本当の原因の行を先に示す。

import { scanLine } from './pyfix.js';

const indentOf = (text) => String(text ?? '').match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
/** 「:」で終わる見出しの行か（コメントは除く） */
const isHeader = (text, kinds) => {
  let end = text.length;
  const at = kinds.indexOf('comment');
  if (at >= 0) end = at;
  return /:\s*$/.test(text.slice(0, end));
};

/**
 * 字下げが前後とちがう行を探す
 * @param {string} code
 * @returns {{line: number, indent: number, expected: number, lead: string}[]}
 *   行（0 から）、いまの字下げ、そろえる字下げ（文字数）、そろえる字下げの字（前の行のタブ・空白をそのまま使う）
 */
export function findIndentOutliers(code) {
  // 何行にもわたる文字列の中と、かっこの続きの行は、字下げを自由に書けるので調べない
  const rows = [];
  let depth = 0;
  let triple = null;
  let backslash = false;
  code.split('\n').forEach((text, line) => {
    // かっこの中・何行にもわたる文字列の中・行末の \ の続きの行
    const startsInside = depth > 0 || triple !== null || backslash;
    backslash = /\\\s*$/.test(text);
    const kinds = scanLine(text);
    // 何行にもわたる文字列の出入り（ふつうの文字列やコメントの中の """ は数えない）
    for (const m of text.matchAll(/"""|'''/g)) {
      if ((triple === null && kinds[m.index] === 'string') || kinds[m.index] === 'comment') continue;
      triple = triple === null ? m[0] : (triple === m[0] ? null : triple);
    }
    for (let i = 0; i < text.length; i++) {
      if (kinds[i] !== 'code') continue;
      if ('([{'.includes(text[i])) depth++;
      if (')]}'.includes(text[i])) depth = Math.max(0, depth - 1);
    }
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    if (startsInside) {
      // 何行にもわたる見出し（def f(a,\n b): など）は、最後の行の「:」で見出しかどうかが決まる
      if (rows.length && triple === null) rows[rows.length - 1].header = isHeader(text, kinds);
      return;
    }
    rows.push({ line, indent: indentOf(text), lead: text.match(/^[ \t]*/)[0], header: isHeader(text, kinds) });
  });

  const found = [];
  rows.forEach((row, k) => {
    const prev = rows[k - 1];
    const next = rows[k + 1];
    // 「:」で終わる行のすぐ下なのに、下げていない（中身を左端に書いた）。かならずエラーになる
    if (prev && prev.header && row.indent <= prev.indent) {
      const lead = `${prev.lead}${prev.lead.includes('\t') ? '\t' : '    '}`;
      found.push({ line: row.line, indent: row.indent, expected: prev.indent + 4, lead, afterHeader: true });
      return;
    }
    // 1 行目からいきなり字下げしている
    if (!prev) {
      if (row.indent > 0) found.push({ line: row.line, indent: row.indent, expected: 0, lead: '' });
      return;
    }
    // 前と次の行は同じ深さなのに、その行だけ浅い・深い
    if (next && !prev.header && !row.header && prev.indent === next.indent && row.indent !== prev.indent) {
      found.push({ line: row.line, indent: row.indent, expected: prev.indent, lead: prev.lead });
      return;
    }
    // インデントが 4 の倍数になっていない（2 文字・3 文字など中途半端）。動いても読みにくく、あとでずれの元になる
    if (row.indent % 4) {
      // 同じ半端な深さの行が続くときは、1 つ目と同じ深さに揃える（同じまとまりの行がばらばらにならないように）
      const before = found[found.length - 1];
      const same = before && before.partial && before.line === prev.line && prev.indent === row.indent;
      // 上の行も半端で直す予定なら、直したあとの深さを基準にする（「:」の次は、その深さ + 4）
      const prevFixed = before && before.partial && before.line === prev.line ? { ...prev, indent: before.expected } : prev;
      const expected = same ? before.expected : partialTarget(row.indent, prevFixed);
      const lead = row.lead.includes('\t') ? '\t'.repeat(expected / 4) : ' '.repeat(expected);
      found.push({ line: row.line, indent: row.indent, expected, lead, partial: true });
    }
  });
  return found;
}

/**
 * 中途半端なインデントを、どの深さ（4 の倍数）に揃えるか
 * 「:」の行の次ならその中身の深さ、ほかは近い方。ちょうど真ん中なら、上の行の深さに近い方にする
 * @param {number} indent
 * @param {{indent: number, header: boolean}} prev
 */
function partialTarget(indent, prev) {
  if (prev.header) return prev.indent + 4;
  const lower = Math.floor(indent / 4) * 4;
  // 「:」の行の次でなければ、上の行より深くはできない（深くすると unexpected indent になる）
  const upper = Math.min(lower + 4, prev.indent);
  if (upper <= lower) return upper;
  if (indent - lower !== upper - indent) return indent - lower < upper - indent ? lower : upper;
  return Math.abs(prev.indent - lower) <= Math.abs(prev.indent - upper) ? lower : upper;
}

/**
 * 字下げの文字数を、キーの押し方といっしょに言う
 *   0 → 「0 文字（字下げなし）」、4 → 「4 文字（スペース 4 つ＝Tab キー 1 回）」、2 → 「2 文字（スペース 2 つ）」
 * @param {number} n
 */
export function describeIndent(n) {
  if (!n) return '0 文字（インデントなし）';
  if (n % 4 === 0) return `${n} 文字（スペース ${n} つ＝Tab キー ${n / 4} 回）`;
  return `${n} 文字（スペース ${n} つ）`;
}

/**
 * その行の字下げを、そろえた行にする
 * @param {string} text
 * @param {number|string} expected 字下げの文字数、または字下げの字そのもの（前の行のタブ・空白）
 */
export function reindent(text, expected) {
  const lead = typeof expected === 'string' ? expected : ' '.repeat(expected);
  return lead + text.replace(/^[ \t]*/, '');
}

/**
 * エディタに付ける
 * @param {object} cm CodeMirror
 */
export function attachIndentCheck(cm) {
  let marks = [];
  let shown = '';
  let timer = null;

  const clear = () => {
    for (const m of marks) (m.clear ? m.clear() : cm.removeLineClass(m.handle, 'wrap', m.cls));
    marks = [];
  };

  function refresh() {
    const cursor = cm.getCursor();
    // いま字下げを打っている行（カーソルが行頭の空白の中）には、まだ出さない
    const found = findIndentOutliers(cm.getValue())
      .filter(f => !(f.line === cursor.line && cursor.ch <= f.indent));
    const signature = JSON.stringify(found);
    // 同じ中身で書き直されると（ブロックとの同期など）、付けた印は消えてしまう。印が残っているときだけ省く
    const alive = marks.every(m => !m.clear || m.find());
    if (signature === shown && alive) return;
    shown = signature;
    clear();
    // 半端なインデントの行が 2 つ以上あるときは、印は最初の行にだけ出し、まとめて揃えられるようにする
    // （行ごとに印が並ぶと、画面がごちゃごちゃして読めない）
    const partials = found.filter(f => f.partial);
    // まとめた印は、いちばん短い行の後ろに出す（狭い画面でも、ボタンが右で切れにくい）
    const anchor = partials.reduce((best, f) => (
      !best || cm.getLine(f.line).length < cm.getLine(best.line).length ? f : best), null);
    const fixLines = (items) => {
      cm.operation(() => {
        for (const f of items) {
          const text = cm.getLine(f.line);
          if (text === undefined || indentOf(text) !== f.indent) continue;
          cm.replaceRange(reindent(text, f.lead), { line: f.line, ch: 0 }, { line: f.line, ch: text.length }, 'indentfix');
        }
      });
      cm.focus();
    };
    for (const f of found) {
      const handle = cm.addLineClass(f.line, 'wrap', 'cm-indent-outlier');
      marks.push({ handle, cls: 'cm-indent-outlier' });
      const group = f.partial && partials.length > 1;
      if (group && f !== anchor) continue;

      const chip = document.createElement('span');
      chip.className = 'namefix-chip indent-chip';
      const note = document.createElement('span');
      note.className = 'indent-chip-note';
      // 行の後ろに出すので短く書く。くわしい数（空白いくつ・Tab 何回）はマウスを重ねたときに出す
      note.textContent = f.line === 0 && f.expected === 0
        ? '1 行目はインデントしない'
        : f.afterHeader ? '「:」の次は 1 段下げる'
          : group ? `インデント半端 ×${partials.length}`
            : f.partial ? `インデント半端（${f.indent} 文字）` : 'インデントが前後と違う';
      chip.title = f.afterHeader
        ? '「:」の次の行は、スペース 4 つ（Tab キー 1 回）下げて書きます'
        : group
          ? `インデントはスペース 4 つ（Tab キー 1 回）単位で揃えます。色の付いた ${partials.length} 行を、まとめて 4 文字単位に揃えます`
        : f.partial
          ? `インデントはスペース 4 つ（Tab キー 1 回）単位で揃えます。この行は ${f.indent} 文字なので、${f.expected} 文字に揃えます`
          : `この行のインデントは ${describeIndent(f.indent)}、前後は ${describeIndent(f.expected)}です`;
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'namefix-apply';
      fix.textContent = f.afterHeader ? '下げる' : '揃える';
      fix.title = group ? `押すと、色の付いた ${partials.length} 行をまとめて 4 文字単位に揃えます`
        : f.partial ? `押すと、この行のインデントを ${f.expected} 文字に揃えます` : '押すと、この行のインデントを前後の行と揃えます';
      fix.addEventListener('mousedown', (e) => e.preventDefault());
      fix.addEventListener('click', () => {
        if (group) { fixLines(partials); return; }
        const text = cm.getLine(f.line);
        if (text === undefined || indentOf(text) !== f.indent) { refresh(); return; }
        fixLines([f]);
      });
      chip.append(note, fix);
      const box = document.createElement('span');
      box.className = 'namefix-box';
      box.appendChild(chip);
      marks.push(cm.setBookmark({ line: f.line, ch: cm.getLine(f.line).length }, { widget: box, insertLeft: true }));
    }
  }

  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
  cm.on('change', later);
  cm.on('cursorActivity', later);
  refresh();
}
