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
    if (!next || prev.header || row.header) return;
    // 前と次の行は同じ深さなのに、その行だけ浅い・深い
    if (prev.indent === next.indent && row.indent !== prev.indent) {
      found.push({ line: row.line, indent: row.indent, expected: prev.indent, lead: prev.lead });
    }
  });
  return found;
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
    if (signature === shown) return;
    shown = signature;
    clear();
    for (const f of found) {
      const handle = cm.addLineClass(f.line, 'wrap', 'cm-indent-outlier');
      marks.push({ handle, cls: 'cm-indent-outlier' });

      const chip = document.createElement('span');
      chip.className = 'namefix-chip indent-chip';
      const note = document.createElement('span');
      note.className = 'indent-chip-note';
      // 行の後ろに出すので短く書く。くわしい数（空白いくつ・Tab 何回）はマウスを重ねたときに出す
      note.textContent = f.line === 0 && f.expected === 0
        ? '1 行目はインデントしない'
        : f.afterHeader ? '「:」の次は 1 段下げる' : 'インデントが前後と違う';
      chip.title = f.afterHeader
        ? '「:」の次の行は、スペース 4 つ（Tab キー 1 回）下げて書きます'
        : `この行のインデントは ${describeIndent(f.indent)}、前後は ${describeIndent(f.expected)}です`;
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'namefix-apply';
      fix.textContent = f.afterHeader ? '下げる' : '揃える';
      fix.title = '押すと、この行のインデントを前後の行と揃えます';
      fix.addEventListener('mousedown', (e) => e.preventDefault());
      fix.addEventListener('click', () => {
        const text = cm.getLine(f.line);
        if (text === undefined || indentOf(text) !== f.indent) { refresh(); return; }
        cm.replaceRange(reindent(text, f.lead), { line: f.line, ch: 0 }, { line: f.line, ch: text.length }, 'indentfix');
        cm.focus();
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
