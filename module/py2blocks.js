// module/py2blocks.js
// Python のコードを読み取って Blockly のブロックに変換するモジュール。
//
// ブロック → Python は Blockly の標準ジェネレーターが担当し、
// Python → ブロック はこのファイルが担当する。これで両方向の変換がそろう。
//
// 対応できない書き方は「Python」ブロック（コードをそのまま持つブロック）になるので、
// どんなコードでも必ず往復できる。

import { CALL_BLOCK_INDEX, NAME_BLOCK_INDEX, DEF_BLOCK_INDEX, CONSTANT_NAMES } from './blockdefs.js';

/**
 * そのブロックが今の画面で登録されているか。
 * スケッチ用のブロック（mouseX や circle）は 03 スケッチでしか登録しないので、
 * ほかの画面で key や width という変数を、スケッチのブロックに読みかえないようにする。
 * @param {string} type
 */
function known(type) {
  return typeof Blockly === 'undefined' || !Blockly.Blocks || Boolean(Blockly.Blocks[type]);
}

/** Blockly が Python のコードを作るとき、ぶつからないよう名前を変える言葉か */
function isReservedName(name) {
  if (typeof Blockly === 'undefined' || !Blockly.Python) return false;
  const words = Blockly.Python.__easycodeReserved
    || (Blockly.Python.__easycodeReserved = new Set(String(Blockly.Python.RESERVED_WORDS_ || '').split(',').filter(Boolean)));
  return words.has(name);
}

/** 表から引いたブロック定義を、登録されているときだけ返す */
function lookup(index, key) {
  const def = index.get(key);
  return def && known(def.type) ? def : null;
}

/* ============================================================
 * 1. 行の切り出し（論理行への変換）
 * ========================================================== */

/**
 * 括弧や三重引用符の途中で改行されている行をつなぎ、
 * 「1文 = 1要素」の論理行に変換する。
 * @param {string} source Python のソースコード
 * @returns {{indent: number, text: string}[]}
 */
function toLogicalLines(source) {
  const result = [];
  const rawLines = source.split('\n');

  let buffer = null;
  let depth = 0;
  let triple = null;

  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index];
    if (!raw.trim() && !buffer) continue;

    if (buffer === null) {
      buffer = { indent: indentWidth(raw), text: raw.trim(), line: index + 1, raws: [raw], spansString: false };
    } else {
      buffer.text += ' ' + raw.trim();
      buffer.raws.push(raw);
    }

    // かっこの中で行をまたぐ文の途中にあるコメント（[1,  # 説明）は、つなぐと後ろの行まで
    // コメントになってしまうので、元の行のまま持つ
    if (buffer.raws.length > 1 || depth > 0) {
      if (splitComment(raw).comment !== null && triple === null) buffer.spansString = true;
    }
    const scan = scanLine(raw, depth, triple);
    depth = scan.depth;
    triple = scan.triple;
    if (triple !== null) buffer.spansString = true;

    const continues = depth > 0 || triple !== null || raw.trimEnd().endsWith('\\');
    if (!continues) {
      result.push(finishLogical(buffer));
      buffer = null;
    }
  }

  if (buffer) result.push(finishLogical(buffer));
  return result;
}

/**
 * 三重引用符の文字列が行をまたぐときは、空白でつながず元の行のまま持つ。
 * つないでしまうと、文字列の中の改行が空白に変わり、表示される文字が変わってしまう。
 * 2 行目からは、その文の字下げのぶんだけ左に寄せておく（ブロックが字下げをつけ直すため）。
 */
function finishLogical(buffer) {
  const { raws, spansString, ...line } = buffer;
  if (spansString && raws.length > 1) {
    line.rawLines = raws;
    const strip = (text) => {
      let i = 0;
      while (i < line.indent && (text[i] === ' ' || text[i] === '\t')) i++;
      return text.slice(i);
    };
    line.text = [raws[0].trim(), ...raws.slice(1).map(strip)].join('\n');
    // 文の字下げより左にある文字列の行は、ブロックに入れると字下げがつき、中身が変わってしまう
    // ブロックは 4 スペースずつ字下げをつけ直すので、2 スペースやタブで字下げした文の中の文字列も同じ。
    // どちらも、まるごとコードのまま持つ印にする
    line.underIndented = raws.slice(1).some(text => text.trim() && indentWidth(text) < line.indent)
      || line.indent % 4 !== 0
      || raws.some(text => /^[ ]*\t/.test(text));
  }
  return line;
}

/** 行頭の空白の幅（タブはスペース4つ換算） */
function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4;
    else break;
  }
  return width;
}

/**
 * 1行を走査して、行末時点の括弧の深さと三重引用符の状態を返す
 * @param {string} line
 * @param {number} depth 行頭時点の括弧の深さ
 * @param {string|null} triple 行頭時点で開いている三重引用符
 */
function scanLine(line, depth, triple) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const three = line.substr(i, 3);

    if (triple) {
      if (three === triple) { triple = null; i += 2; }
      continue;
    }
    if (quote) {
      if (line[i] === '\\') i++;
      else if (line[i] === quote) quote = null;
      continue;
    }
    if (three === '"""' || three === "'''") { triple = three; i += 2; continue; }

    const ch = line[i];
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') break;                       // 以降は行コメント
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
  }
  return { depth, triple };
}

/* ============================================================
 * 2. 文の解析（インデントによる入れ子）
 * ========================================================== */

const COMPOUND_RE = /^(if|elif|else|for|while|def|class|try|except|finally|with)\b\s*(.*)$/;

/**
 * 論理行の並びを文の木にする
 * @param {{indent: number, text: string}[]} lines
 * @param {number} start
 * @param {number} parentIndent
 * @returns {{stmts: object[], next: number}}
 */
function parseStatements(lines, start, parentIndent) {
  const stmts = [];
  let i = start;

  if (i >= lines.length || lines[i].indent <= parentIndent) return { stmts, next: i };
  const blockIndent = lines[i].indent;

  while (i < lines.length && lines[i].indent >= blockIndent) {
    if (lines[i].indent > blockIndent) { i++; continue; }

    const { text: fullText } = lines[i];
    // 見出しの行末コメントは切り分けて、ブロックに付ける
    const split = COMPOUND_RE.test(fullText) ? splitComment(fullText) : { code: fullText, comment: null };
    const text = split.comment !== null && split.code.endsWith(':') ? split.code : fullText;
    const match = text.endsWith(':') ? text.match(COMPOUND_RE) : null;

    if (!match) {
      stmts.push({ kind: 'simple', text: fullText, line: lines[i].line });
      i++;
      continue;
    }

    const keyword = match[1];
    const head = match[2].replace(/:\s*$/, '').trim();
    const headIndex = i;
    const { stmts: body, next } = parseStatements(lines, i + 1, blockIndent);
    i = next;

    const clause = {
      keyword, head, body, headIndex, endIndex: i, line: lines[headIndex].line,
      comment: text !== fullText ? split.comment : null,
    };

    if (['elif', 'else', 'except', 'finally'].includes(keyword)) {
      const prev = stmts[stmts.length - 1];
      if (prev && prev.kind === 'compound') {
        prev.clauses.push(clause);
        prev.endIndex = i;
        continue;
      }
    }

    stmts.push({
      kind: 'compound', keyword, clauses: [clause],
      startIndex: headIndex, endIndex: i, line: lines[headIndex].line,
    });
  }

  return { stmts, next: i };
}

/* ============================================================
 * 3. 式の解析
 *
 * Python の式の優先順位どおりに読む（弱い順）:
 *   lambda → 条件式（a if c else b）→ or → and → not → 比較（== < in is、つなげた比較）
 *   → + - → * / // % → 単項の - + → ** → うしろに続くもの（.名前 (呼び出し) [添字・切り出し]）→ 値
 * 読めた式には、元のコードの文字列（src）も持たせる。ブロックにできないときは
 * それをそのまま使うので、引用符やかっこの書き方が変わらない。
 * ========================================================== */

const TOKEN_RE = new RegExp([
  '\\s+',                                                     // 空白
  '0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+',               // 16 進・8 進・2 進
  '(?:\\d[\\d_]*\\.?[\\d_]*|\\.\\d[\\d_]*)(?:[eE][-+]?\\d+)?j?', // 数値（小数・指数）
  '(?:[rRbBfFuU]{1,2})?(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', // 文字列（f"" r"" も）
  '[\\p{L}_][\\p{L}\\p{N}_]*',                                  // 名前（日本語の名前も）
  '\\*\\*=|//=|[-+*/%]=|\\*\\*|//|==|!=|<=|>=|->',                // 複合代入と 2 文字の記号
  '[-+*/%<>=(),\\[\\]{}.:@~&|^]',                               // 1 文字の記号
].join('|'), 'gu');

/**
 * 式を字句に分ける
 * @param {string} text
 * @returns {{text: string, start: number, end: number}[]|null} 読めない文字があれば null
 */
function tokenize(text) {
  const tokens = [];
  let pos = 0;
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index !== pos) return null;
    pos = match.index + match[0].length;
    if (match[0].trim()) tokens.push({ text: match[0], start: match.index, end: pos });
  }
  return pos === text.length ? tokens : null;
}

/**
 * 式を解析して木にする
 * @param {string} text
 * @param {object} [options]
 * @param {boolean} [options.tuple] かっこの無いタプル（a, b）も読むか（代入の右辺・return）
 * @returns {object|null} 解析できなければ null
 */
export function parseExpression(text, { tuple = false } = {}) {
  const source = String(text).trim();
  const tokens = tokenize(source);
  if (!tokens || !tokens.length) return null;

  const state = { tokens, pos: 0, source };
  let node;
  try {
    node = tuple ? parseTupleOrTest(state) : parseTest(state);
  } catch (e) {
    return null;
  }
  return state.pos === tokens.length ? node : null;
}

const peek = (s, ahead = 0) => (s.tokens[s.pos + ahead] ? s.tokens[s.pos + ahead].text : undefined);
const eat = (s, token) => (peek(s) === token ? (s.pos++, true) : false);
function expect(s, token) {
  if (!eat(s, token)) throw new Error(`'${token}' が見つかりません`);
}
/** start 番目の字句から、いま読み終えたところまでの元の文字列を node に持たせる */
function mark(s, start, node) {
  node.src = s.source.slice(s.tokens[start].start, s.tokens[s.pos - 1].end);
  return node;
}
const isName = (token) => token !== undefined && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(token);
const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is', 'if', 'else', 'for', 'lambda', 'None', 'True', 'False']);

/** a, b, c（かっこの無いタプル）か、ふつうの式 */
function parseTupleOrTest(s) {
  const start = s.pos;
  const first = parseTest(s);
  if (peek(s) !== ',') return first;
  const items = [first];
  while (eat(s, ',')) {
    if (s.pos >= s.tokens.length) break;
    items.push(parseTest(s));
  }
  return mark(s, start, { type: 'tuple', items, bare: true });
}

/** lambda と、条件式 a if c else b */
function parseTest(s) {
  const start = s.pos;
  if (peek(s) === 'lambda') {
    s.pos++;
    const paramStart = s.pos;
    while (peek(s) !== ':' && s.pos < s.tokens.length) s.pos++;
    const params = s.pos > paramStart
      ? s.source.slice(s.tokens[paramStart].start, s.tokens[s.pos - 1].end) : '';
    expect(s, ':');
    const body = parseTest(s);
    return mark(s, start, { type: 'lambda', params, body });
  }
  const value = parseOr(s);
  if (peek(s) === 'if') {
    s.pos++;
    const cond = parseOr(s);
    expect(s, 'else');
    const other = parseTest(s);
    return mark(s, start, { type: 'ternary', a: value, cond, b: other });
  }
  return value;
}

function parseOr(s) {
  const start = s.pos;
  let left = parseAnd(s);
  while (peek(s) === 'or') { s.pos++; left = mark(s, start, { type: 'logic', op: 'OR', a: left, b: parseAnd(s) }); }
  return left;
}

function parseAnd(s) {
  const start = s.pos;
  let left = parseNot(s);
  while (peek(s) === 'and') { s.pos++; left = mark(s, start, { type: 'logic', op: 'AND', a: left, b: parseNot(s) }); }
  return left;
}

function parseNot(s) {
  const start = s.pos;
  if (peek(s) === 'not') { s.pos++; return mark(s, start, { type: 'not', value: parseNot(s) }); }
  return parseComparison(s);
}

const COMPARE_OPS = { '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' };

/** 比べる記号を 1 つ読む（in / not in / is / is not もふくむ）。無ければ null */
function readCompareOp(s) {
  const token = peek(s);
  if (COMPARE_OPS[token]) { s.pos++; return token; }
  if (token === 'in') { s.pos++; return 'in'; }
  if (token === 'not' && peek(s, 1) === 'in') { s.pos += 2; return 'not in'; }
  if (token === 'is') {
    s.pos++;
    if (eat(s, 'not')) return 'is not';
    return 'is';
  }
  return null;
}

/**
 * 比較。a < b < c のようにつなげた比較は、Python では (a < b) and (b < c) の意味なので、
 * 入れ子の比較にせず、まとめて 1 つ（chain）にする。
 */
function parseComparison(s) {
  const start = s.pos;
  const first = parseAdditive(s);
  const ops = [];
  const items = [first];
  let op;
  while ((op = readCompareOp(s)) !== null) {
    ops.push(op);
    items.push(parseAdditive(s));
  }
  if (!ops.length) return first;
  if (ops.length > 1) return mark(s, start, { type: 'chain', ops, items });
  const [a, b] = items;
  if (COMPARE_OPS[ops[0]]) return mark(s, start, { type: 'compare', op: COMPARE_OPS[ops[0]], a, b });
  if (ops[0] === 'in' || ops[0] === 'not in') return mark(s, start, { type: 'membership', op: ops[0], a, b });
  return mark(s, start, { type: 'identity', op: ops[0], a, b });
}

function parseAdditive(s) {
  const start = s.pos;
  let left = parseMultiplicative(s);
  while (peek(s) === '+' || peek(s) === '-') {
    const op = s.tokens[s.pos++].text === '+' ? 'ADD' : 'MINUS';
    left = mark(s, start, { type: 'arith', op, a: left, b: parseMultiplicative(s) });
  }
  return left;
}

function parseMultiplicative(s) {
  const start = s.pos;
  let left = parseUnary(s);
  while (['*', '/', '%', '//'].includes(peek(s))) {
    const token = s.tokens[s.pos++].text;
    const right = parseUnary(s);
    if (token === '%') left = mark(s, start, { type: 'modulo', a: left, b: right });
    else if (token === '//') left = mark(s, start, { type: 'floordiv', a: left, b: right });
    else left = mark(s, start, { type: 'arith', op: token === '*' ? 'MULTIPLY' : 'DIVIDE', a: left, b: right });
  }
  return left;
}

function parseUnary(s) {
  const start = s.pos;
  if (peek(s) === '-') { s.pos++; return mark(s, start, { type: 'negate', value: parseUnary(s) }); }
  if (peek(s) === '+') { s.pos++; return mark(s, start, { type: 'positive', value: parseUnary(s) }); }
  return parsePower(s);
}

function parsePower(s) {
  const start = s.pos;
  const base = parsePostfix(s);
  if (peek(s) === '**') { s.pos++; return mark(s, start, { type: 'arith', op: 'POWER', a: base, b: parseUnary(s) }); }
  return base;
}

/**
 * 値のうしろに続く .名前 (呼び出し) [添字] を読む
 * Data.append(x) や math.sqrt(2) のように、名前だけでつながる呼び出しは今までどおり
 * name に「Data.append」を持つ call にする（ブロックの表と照らし合わせるため）。
 * "a".join(x) や input().split() のように、値に続くメソッドは method にする。
 */
function parsePostfix(s) {
  const start = s.pos;
  let node = parseAtom(s);
  for (;;) {
    if (peek(s) === '.' && isName(peek(s, 1))) {
      s.pos++;
      const name = s.tokens[s.pos++].text;
      node = node.type === 'name'
        ? mark(s, start, { type: 'name', name: `${node.name}.${name}` })
        : mark(s, start, { type: 'attr', obj: node, name });
      continue;
    }
    if (peek(s) === '(') {
      s.pos++;
      const args = parseArguments(s);
      expect(s, ')');
      if (node.type === 'name') node = mark(s, start, { type: 'call', name: node.name, args });
      else if (node.type === 'attr') node = mark(s, start, { type: 'method', obj: node.obj, name: node.name, args });
      else node = mark(s, start, { type: 'callexpr', callee: node, args });
      continue;
    }
    if (peek(s) === '[') {
      s.pos++;
      node = mark(s, start, readSubscript(s, node));
      continue;
    }
    return node;
  }
}

/** 呼び出しの引数。key=値 と *値 もふくむ */
function parseArguments(s) {
  const args = [];
  while (peek(s) !== ')') {
    const start = s.pos;
    if (peek(s) === '*' || peek(s) === '**') {
      const stars = s.tokens[s.pos++].text;
      args.push(mark(s, start, { type: 'star', stars, value: parseTest(s) }));
    } else if (isName(peek(s)) && !KEYWORDS.has(peek(s)) && peek(s, 1) === '=') {
      const name = s.tokens[s.pos].text;
      s.pos += 2;
      args.push(mark(s, start, { type: 'kwarg', name, value: parseTest(s) }));
    } else {
      const value = parseTest(s);
      // f(x for x in Data) のような書き方は読まない
      if (peek(s) === 'for') throw new Error('引数の中の for は読みません');
      args.push(value);
    }
    if (!eat(s, ',')) break;
  }
  return args;
}

/** [ ] の中。添字（Data[i]）か、切り出し（s[1:3]、s[::-1]） */
function readSubscript(s, target) {
  const part = () => (peek(s) === ':' || peek(s) === ']' ? null : parseTest(s));
  const first = part();
  if (peek(s) !== ':') {
    if (first === null) throw new Error('添字がありません');
    expect(s, ']');
    return { type: 'index', target, index: first };
  }
  s.pos++;
  const stop = part();
  let step = null;
  let hasStep = false;
  if (eat(s, ':')) { hasStep = true; step = part(); }
  expect(s, ']');
  return { type: 'slice', target, start: first, stop, step, hasStep };
}

function parseAtom(s) {
  const start = s.pos;
  const token = peek(s);
  if (token === undefined) throw new Error('式が途中で終わっています');

  // かっこ（中が 1 つならただのかっこ、カンマがあればタプル）
  if (token === '(') {
    s.pos++;
    if (eat(s, ')')) return mark(s, start, { type: 'tuple', items: [] });
    const first = parseTest(s);
    if (peek(s) === 'for') throw new Error('ジェネレーター式は読みません');
    if (eat(s, ')')) return mark(s, start, { type: 'paren', value: first });
    const items = [first];
    while (eat(s, ',')) {
      if (peek(s) === ')') break;
      items.push(parseTest(s));
    }
    expect(s, ')');
    return mark(s, start, { type: 'tuple', items });
  }

  // リスト・リスト内包
  if (token === '[') {
    s.pos++;
    if (eat(s, ']')) return mark(s, start, { type: 'list', items: [] });
    const first = parseTest(s);
    if (peek(s) === 'for') {
      s.pos++;
      const varStart = s.pos;
      while (peek(s) !== 'in' && s.pos < s.tokens.length) s.pos++;
      const vars = s.source.slice(s.tokens[varStart].start, s.tokens[s.pos - 1].end);
      expect(s, 'in');
      const iter = parseOr(s);
      const cond = eat(s, 'if') ? parseOr(s) : null;
      if (peek(s) === 'for' || peek(s) === 'if') throw new Error('入れ子の内包は読みません');
      expect(s, ']');
      return mark(s, start, { type: 'comp', value: first, vars, iter, cond });
    }
    const items = [first];
    while (eat(s, ',')) {
      if (peek(s) === ']') break;
      items.push(parseTest(s));
    }
    expect(s, ']');
    return mark(s, start, { type: 'list', items });
  }

  // 辞書 {キー: 値, …}（集合 {1, 2} は読まない）
  if (token === '{') {
    s.pos++;
    const pairs = [];
    while (peek(s) !== '}') {
      const key = parseTest(s);
      expect(s, ':');
      pairs.push([key, parseTest(s)]);
      if (!eat(s, ',')) break;
    }
    expect(s, '}');
    return mark(s, start, { type: 'dict', pairs });
  }

  // 数。ふつうの整数と小数は数のブロックに、0x10 や 1e3 は書いたままにする
  if (/^\d|^\.\d/.test(token)) {
    s.pos++;
    // 3.0 や 007 のように、数のブロックにすると書き方が変わるものは書いたまま持つ（3.0 が 3 になると int になる）
    if (/^(\d+|\d+\.\d+)$/.test(token) && String(Number(token)) === token) {
      return mark(s, start, { type: 'number', value: Number(token) });
    }
    return mark(s, start, { type: 'literal' });
  }

  // 文字列。f"…" は値を埋めこむ文字列、"a" "b" と並べた書き方や、\n 以外の \ をふくむものは書いたまま
  if (/^[rRbBfFuU]{0,2}['"]/.test(token)) {
    s.pos++;
    if (/^['"]/.test(peek(s) || '')) throw new Error('並べた文字列は読みません');
    const prefix = token.match(/^[rRbBfFuU]*/)[0];
    if (/^[fF]$/.test(prefix)) return mark(s, start, { type: 'fstring' });
    // \n などをふくむ文字列は、Blockly の文字ブロックだと書き戻すときに崩れるので、書いたまま持つ
    if (prefix || token.includes('\\')) return mark(s, start, { type: 'literal' });
    return mark(s, start, { type: 'string', value: unquote(token) });
  }

  if (isName(token) && !['and', 'or', 'not', 'in', 'is', 'if', 'else', 'for', 'lambda'].includes(token)) {
    s.pos++;
    if (token === 'True' || token === 'False') return mark(s, start, { type: 'boolean', value: token === 'True' });
    if (token === 'None') return mark(s, start, { type: 'none' });
    return mark(s, start, { type: 'name', name: token });
  }

  throw new Error(`予期しない字句: ${token}`);
}

/** クオートを外して中身を取り出す */
function unquote(token) {
  const body = token.slice(1, -1);
  return body.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

/* ============================================================
 * 4. AST → Blockly のブロック定義（JSON）
 * ========================================================== */

/** 値の入力を包む */
const input = (block) => (block ? { block } : undefined);

/**
 * 式の AST を値ブロックに変換する
 * @param {object|null} node
 * @param {object} ctx 変数を作るためのコンテキスト
 * @returns {object|null}
 */
function valueBlock(node, ctx) {
  if (!node) return null;

  switch (node.type) {
    case 'number':
      return { type: 'math_number', fields: { NUM: node.value } };
    case 'string':
      return { type: 'text', fields: { TEXT: node.value } };
    case 'boolean':
      return { type: 'logic_boolean', fields: { BOOL: node.value ? 'TRUE' : 'FALSE' } };
    case 'none':
      return { type: 'logic_null' };
    case 'floordiv':
      return {
        type: 'py_floor_div',
        inputs: { A: input(valueBlock(node.a, ctx)), B: input(valueBlock(node.b, ctx)) },
      };
    case 'index':
      return {
        type: 'py_index',
        inputs: {
          LIST: input(valueBlock(node.target, ctx)),
          INDEX: input(valueBlock(node.index, ctx)),
        },
      };
    case 'paren':
      return valueBlock(node.value, ctx);
    case 'name': {
      // int や list のような Python の名前を値として使うとき（map(int, …)）は、変数にすると
      // Blockly が int2 と名前を変えてしまうので、名前のブロックにする
      if (isReservedName(node.name) && known('py_dotted') && !lookup(NAME_BLOCK_INDEX, node.name)) {
        return { type: 'py_dotted', fields: { NAME: node.name } };
      }
      const named = lookup(NAME_BLOCK_INDEX, node.name);
      if (named) return { type: named.type };
      if (CONSTANT_NAMES.has(node.name) && known('p5_constant')) {
        return { type: 'p5_constant', fields: { NAME: node.name } };
      }
      // math.pi のようなドット付きの名前は変数にできないので、名前のブロックにする
      if (node.name.includes('.')) {
        return known('py_dotted') ? { type: 'py_dotted', fields: { NAME: node.name } } : rawValue(node);
      }
      return { type: 'variables_get', fields: { VAR: ctx.variable(node.name) } };
    }
    case 'logic':
      return {
        type: 'logic_operation',
        fields: { OP: node.op },
        inputs: { A: input(valueBlock(node.a, ctx)), B: input(valueBlock(node.b, ctx)) },
      };
    case 'not':
      return { type: 'logic_negate', inputs: { BOOL: input(valueBlock(node.value, ctx)) } };
    case 'compare':
      return {
        type: 'logic_compare',
        fields: { OP: node.op },
        inputs: { A: input(valueBlock(node.a, ctx)), B: input(valueBlock(node.b, ctx)) },
      };
    case 'arith':
      // [0] * 10 はリストのくり返し、"*" * 5 は文字のくり返し
      if (node.op === 'MULTIPLY' && (isStringy(node.a) || isCollection(node.a))) {
        if (node.a.type === 'list' && node.a.items.length === 1 && known('lists_repeat')) {
          return { type: 'lists_repeat', inputs: { ITEM: input(valueBlock(node.a.items[0], ctx)), NUM: input(valueBlock(node.b, ctx)) } };
        }
        if (!known('py_repeat')) return rawValue(node);
        return { type: 'py_repeat', inputs: { VALUE: input(valueBlock(node.a, ctx)), TIMES: input(valueBlock(node.b, ctx)) } };
      }
      // リストどうしの + も「つなぐ」
      if (node.op === 'ADD' && (isCollection(node.a) || isCollection(node.b))) {
        return { type: 'py_join', inputs: { A: input(valueBlock(node.a, ctx)), B: input(valueBlock(node.b, ctx)) } };
      }
      if (isCollection(node.a) || isCollection(node.b)) return rawValue(node);
      // 文字列の連結は計算ブロックに入れられないので、「つなぐ」ブロックにする
      if (isStringy(node)) {
        if (node.op !== 'ADD') return rawValue(node);
        return {
          type: 'py_join',
          inputs: { A: input(valueBlock(node.a, ctx)), B: input(valueBlock(node.b, ctx)) },
        };
      }
      return {
        type: 'math_arithmetic',
        fields: { OP: node.op },
        inputs: { A: input(valueBlock(node.a, ctx)), B: input(valueBlock(node.b, ctx)) },
      };
    case 'modulo':
      if (isStringy(node.a) || isStringy(node.b)) return rawValue(node);
      return {
        type: 'math_modulo',
        inputs: {
          DIVIDEND: input(valueBlock(node.a, ctx)),
          DIVISOR: input(valueBlock(node.b, ctx)),
        },
      };
    case 'negate':
      if (node.value.type === 'number') {
        return { type: 'math_number', fields: { NUM: -node.value.value } };
      }
      return {
        type: 'math_single',
        fields: { OP: 'NEG' },
        inputs: { NUM: input(valueBlock(node.value, ctx)) },
      };
    case 'list':
      return {
        type: 'lists_create_with',
        extraState: { itemCount: node.items.length },
        inputs: Object.fromEntries(
          node.items.map((item, i) => [`ADD${i}`, input(valueBlock(item, ctx))])
        ),
      };
    case 'call':
      return callBlock(node, ctx);
    default:
      return extraValueBlock(node, ctx) || rawValue(node);
  }
}

/**
 * 新しく読めるようになった式のブロック（in・is・つなげた比較・条件式・切り出し・メソッド など）
 * @returns {object|null} ブロックにできなければ null
 */
function extraValueBlock(node, ctx) {
  const v = (child) => input(valueBlock(child, ctx));
  const ok = (type) => known(type);
  switch (node.type) {
    case 'attr':
      return ok('py_attr') ? { type: 'py_attr', fields: { NAME: node.name }, inputs: { OBJ: v(node.obj) } } : null;
    case 'method':
      return ok(`py_method_${node.args.length}`) ? methodBlock(node, ctx, 'py_method') : null;
    case 'callexpr':
      return node.args.length === 1 && ok('py_callexpr')
        ? { type: 'py_callexpr', inputs: { CALLEE: v(node.callee), ARG0: v(node.args[0]) } } : null;
    case 'kwarg':
      return ok('py_kwarg') ? { type: 'py_kwarg', fields: { NAME: node.name }, inputs: { VALUE: v(node.value) } } : null;
    case 'star':
      return ok('py_star') ? { type: 'py_star', fields: { STARS: node.stars }, inputs: { VALUE: v(node.value) } } : null;
    case 'slice': {
      const type = node.hasStep ? 'py_slice' : 'py_slice2';
      if (!ok(type)) return null;
      const inputs = { LIST: v(node.target) };
      if (node.start) inputs.START = v(node.start);
      if (node.stop) inputs.STOP = v(node.stop);
      if (node.step) inputs.STEP = v(node.step);
      return { type, inputs };
    }
    case 'membership':
      return ok('py_membership') ? { type: 'py_membership', fields: { OP: node.op }, inputs: { A: v(node.a), B: v(node.b) } } : null;
    case 'identity':
      return ok('py_identity') ? { type: 'py_identity', fields: { OP: node.op }, inputs: { A: v(node.a), B: v(node.b) } } : null;
    case 'chain': {
      const relational = ['<', '<=', '>', '>=', '==', '!='];
      if (node.ops.length !== 2 || !node.ops.every(op => relational.includes(op)) || !ok('py_chain')) return null;
      return {
        type: 'py_chain', fields: { OP1: node.ops[0], OP2: node.ops[1] },
        inputs: { A: v(node.items[0]), B: v(node.items[1]), C: v(node.items[2]) },
      };
    }
    case 'ternary':
      return ok('logic_ternary') ? { type: 'logic_ternary', inputs: { IF: v(node.cond), THEN: v(node.a), ELSE: v(node.b) } } : null;
    case 'tuple': {
      const type = `py_tuple_${node.items.length}`;
      if (!ok(type)) return null;
      const inputs = {};
      node.items.forEach((item, i) => { inputs[`I${i}`] = v(item); });
      return { type, inputs };
    }
    case 'dict': {
      const type = `py_dict_${node.pairs.length}`;
      if (!ok(type)) return null;
      const inputs = {};
      node.pairs.forEach(([key, value], i) => { inputs[`K${i}`] = v(key); inputs[`V${i}`] = v(value); });
      return { type, inputs };
    }
    case 'comp': {
      const type = node.cond ? 'py_comp_if' : 'py_comp';
      if (!ok(type)) return null;
      const inputs = { VALUE: v(node.value), ITER: v(node.iter) };
      if (node.cond) inputs.COND = v(node.cond);
      return { type, fields: { VARS: node.vars }, inputs };
    }
    case 'lambda':
      return ok('py_lambda') ? { type: 'py_lambda', fields: { PARAMS: node.params }, inputs: { VALUE: v(node.body) } } : null;
    case 'literal':
      return ok('py_literal') ? { type: 'py_literal', fields: { TEXT: node.src } } : null;
    case 'fstring': {
      const body = node.src.replace(/^[fF]/, '');
      const quote = body[0];
      // 中の書き方（\ や引用符）がそのまま戻せるときだけブロックにする
      if (body.includes('\\') || body.slice(1, -1).includes(quote === '"' ? "'" : '"')) return null;
      return ok('py_fstring') ? { type: 'py_fstring', fields: { TEXT: body.slice(1, -1) } } : null;
    }
    default:
      return null;
  }
}

/** リスト・タプル・辞書・内包 */
function isCollection(node) {
  return Boolean(node) && ['list', 'tuple', 'dict', 'comp'].includes(node.type);
}

/** 関数呼び出しを対応するブロックに変換する */
function callBlock(node, ctx) {
  // まず、表で定義したブロック（描画モードの random など）を探す
  const mapped = lookup(CALL_BLOCK_INDEX, `${node.name}/${node.args.length}`);
  if (mapped && mapped.kind === 'value') return fromCallDef(mapped, node, ctx);

  const [a, b] = node.args;
  const one = () => input(valueBlock(a, ctx));

  switch (`${node.name}/${node.args.length}`) {
    case 'input/0':
      // 何も聞かない input() は、穴を空けたままにする（input('') にならないように）
      return { type: 'py_input' };
    case 'input/1':
      return { type: 'py_input', inputs: { PROMPT: one() } };
    case 'int/1':
      return { type: 'py_to_int', inputs: { VALUE: one() } };
    case 'float/1':
      return { type: 'py_to_float', inputs: { VALUE: one() } };
    case 'str/1':
      return { type: 'py_to_text', inputs: { VALUE: one() } };
    case 'len/1':
      return { type: 'text_length', inputs: { VALUE: one() } };
    case 'sum/1':
      return { type: 'math_on_list', fields: { OP: 'SUM' }, inputs: { LIST: one() } };
    case 'max/1':
      return { type: 'math_on_list', fields: { OP: 'MAX' }, inputs: { LIST: one() } };
    case 'min/1':
      return { type: 'math_on_list', fields: { OP: 'MIN' }, inputs: { LIST: one() } };
    case 'round/2':
      return userCall(node, ctx, 'py_callv') || rawValue(node);
    // abs と round は、Blockly の計算ブロックにすると math.fabs や import math に変わってしまうので、
    // 書いたままの呼び出しにする
    case 'abs/1':
    case 'round/1':
      return userCall(node, ctx, 'py_callv') || rawValue(node);
    case 'math.sqrt/1':
      return { type: 'math_single', fields: { OP: 'ROOT' }, inputs: { NUM: one() } };
    case 'random.randint/2':
      return {
        type: 'math_random_int',
        inputs: { FROM: one(), TO: input(valueBlock(b, ctx)) },
      };
    default:
      return userCall(node, ctx, 'py_callv') || rawValue(node);
  }
}

/**
 * 自分で作った関数（や、ブロックの無い関数）の呼び出しを「〜を呼ぶ」ブロックにする
 * @param {object} node 呼び出しの AST
 * @param {object} ctx
 * @param {'py_call'|'py_callv'} kind 文として置くか、値として使うか
 * @returns {object|null} 引数が多すぎるなど、ブロックにできなければ null
 */
function userCall(node, ctx, kind) {
  const type = `${kind}_${node.args.length}`;
  if (!known(type)) return null;
  const inputs = {};
  node.args.forEach((arg, i) => { inputs[`ARG${i}`] = input(valueBlock(arg, ctx)); });
  return { type, fields: { NAME: node.name }, inputs };
}

/**
 * 表で定義したブロックを、引数つきで組み立てる
 * @param {object} def blockdefs.js の定義
 * @param {object} node 呼び出しの AST
 * @param {object} ctx
 */
function fromCallDef(def, node, ctx) {
  const inputs = {};
  def.args.forEach((arg, index) => {
    inputs[arg.name] = input(valueBlock(node.args[index], ctx));
  });
  return { type: def.type, inputs };
}

/** ブロックにできない式は、コードをそのまま持つブロックにする */
function rawValue(node) {
  // 元のコードの文字列があれば、それをそのまま使う（引用符やかっこが変わらない）
  return { type: 'py_raw_value', fields: { CODE: node.src || unparse(node) } };
}

/**
 * 解析済みの式を Python のコードに書き戻す
 * @param {object|null} node
 * @returns {string}
 */
function unparse(node, nested = false) {
  const wrap = (text) => (nested ? `(${text})` : text);

  if (!node) return 'None';
  switch (node.type) {
    case 'number':  return String(node.value);
    case 'string':  return JSON.stringify(node.value);
    case 'boolean': return node.value ? 'True' : 'False';
    case 'none':    return 'None';
    case 'name':    return node.name;
    case 'index':   return `${unparse(node.target, true)}[${unparse(node.index)}]`;
    case 'floordiv': return wrap(`${unparse(node.a, true)} // ${unparse(node.b, true)}`);
    case 'call':    return `${node.name}(${node.args.map(a => unparse(a)).join(', ')})`;
    case 'list':    return `[${node.items.map(a => unparse(a)).join(', ')}]`;
    case 'not':     return wrap(`not ${unparse(node.value, true)}`);
    case 'negate':  return wrap(`-${unparse(node.value, true)}`);
    case 'modulo':  return wrap(`${unparse(node.a, true)} % ${unparse(node.b, true)}`);
    case 'logic':
      return wrap(`${unparse(node.a, true)} ${node.op === 'AND' ? 'and' : 'or'} ${unparse(node.b, true)}`);
    case 'compare':
      return wrap(`${unparse(node.a, true)} ${COMPARE_SYMBOLS[node.op]} ${unparse(node.b, true)}`);
    case 'arith':
      return wrap(`${unparse(node.a, true)} ${ARITH_SYMBOLS[node.op]} ${unparse(node.b, true)}`);
    default:        return 'None';
  }
}

/**
 * 文字列を扱う式かどうか。
 * Blockly の計算ブロックは数値しか受け取らないので、
 * 文字列の足し算（連結）はブロックにせず、コードのまま持たせる。
 * @param {object|null} node
 * @returns {boolean}
 */
function isStringy(node) {
  if (!node) return false;
  if (node.type === 'string' || node.type === 'fstring') return true;
  if (node.type === 'literal' && /^[rRbBuU]*['"]/.test(node.src || '')) return true;
  if (node.type === 'paren') return isStringy(node.value);
  if (node.type === 'call') return node.name === 'str' || node.name === 'input';
  if (node.type === 'arith') return isStringy(node.a) || isStringy(node.b);
  return false;
}

const COMPARE_SYMBOLS = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
const ARITH_SYMBOLS = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '**' };

/* ============================================================
 * 5. 文 → ブロック
 * ========================================================== */

/**
 * 文の並びをブロックの連結（next で数珠つなぎ）に変換する
 * @param {object[]} stmts
 * @param {object} ctx
 * @returns {object|null} 先頭のブロック
 */
function statementChain(stmts, ctx) {
  const blocks = [];
  for (const stmt of stmts) {
    const block = statementBlock(stmt, ctx);
    if (!block) continue;
    // ステップ実行で「今どのブロックを動いているか」を示すために行番号を持たせる
    if (stmt.line && !block.data) block.data = String(stmt.line);
    blocks.push(block);
  }
  if (!blocks.length) return null;

  // 1つの文が複数ブロックの連なりになることもあるので、末尾を探してつなぐ
  for (let i = 1; i < blocks.length; i++) {
    tailOf(blocks[i - 1]).next = { block: blocks[i] };
  }
  return blocks[0];
}

/** 連なりの最後のブロックを返す */
function tailOf(block) {
  let current = block;
  while (current.next && current.next.block) current = current.next.block;
  return current;
}

/** 1つの文をブロックに変換する */
function statementBlock(stmt, ctx) {
  if (stmt.kind === 'simple') return simpleBlock(stmt.text, ctx);

  // 中に、字下げより左に書いた文字列の行があるときは、まるごとコードのまま持つ（中身を変えないため）
  if (ctx.hasUnderIndented(stmt.startIndex, stmt.endIndex)) return rawRange(stmt.startIndex, stmt.endIndex, ctx);

  // ほかの節（else: など）の見出しにコメントがあるときは、コメントが消えないようコードのまま持つ
  if (stmt.clauses.slice(1).some(c => c.comment)) return rawRange(stmt.startIndex, stmt.endIndex, ctx);

  let block;
  switch (stmt.keyword) {
    case 'if':    block = ifBlock(stmt.clauses, ctx); break;
    // for … else / while … else の else は、ブロックでは表せないのでコードのまま持つ
    case 'while':
    case 'for':
      if (stmt.clauses.length > 1) return rawRange(stmt.startIndex, stmt.endIndex, ctx);
      block = stmt.keyword === 'for' ? forBlock(stmt.clauses[0], ctx) : whileBlock(stmt.clauses[0], ctx);
      break;
    case 'def':   block = defBlock(stmt, ctx); break;
    case 'try':   block = tryBlock(stmt, ctx); break;
    default:      return rawRange(stmt.startIndex, stmt.endIndex, ctx);
  }
  const comment = stmt.clauses[0].comment;
  if (!comment || !block) return block;
  // コードのままのブロックになったときは、コメントも元の行に残っているので付けない
  return block.type === 'py_raw' ? block : withComment(block, comment);
}

/**
 * try / except（except が 1 つで、else / finally の無いもの）
 * @param {object} stmt
 * @param {object} ctx
 */
function tryBlock(stmt, ctx) {
  const [tryClause, ...rest] = stmt.clauses;
  if (rest.length !== 1 || rest[0].keyword !== 'except' || !known('py_try')) {
    return rawRange(stmt.startIndex, stmt.endIndex, ctx);
  }
  const body = statementChain(tryClause.body, ctx);
  const handler = statementChain(rest[0].body, ctx);
  const inputs = {};
  if (body) inputs.BODY = { block: body };
  if (handler) inputs.HANDLER = { block: handler };
  return { type: 'py_try', fields: { EXC: rest[0].head }, inputs };
}

/** 単純文 */
function simpleBlock(text, ctx) {
  // 行をまたぐ三重引用符の文字列をふくむ文は、元のコードのまま持つ
  if (text.includes('\n')) return rawStatement(text);

  // 行末のコメント（x = 1  # 説明）は、ブロックに付けて持つ。コードに戻すときは同じ行の末尾に書く
  if (!text.startsWith('#')) {
    const { code, comment } = splitComment(text);
    if (comment !== null) {
      const block = simpleBlock(code, ctx);
      return block ? withComment(block, comment) : null;
    }
  }

  // コメント
  if (text.startsWith('#')) {
    return { type: 'py_comment', fields: { TEXT: text.replace(/^#\s?/, '') } };
  }
  if (text === 'break' || text === 'continue') {
    return { type: 'controls_flow_statements', fields: { FLOW: text.toUpperCase() } };
  }

  // return / pass
  if (text === 'pass' && known('py_pass')) return { type: 'py_pass' };
  if (text === 'return' && known('py_return_none')) return { type: 'py_return_none' };
  const returnMatch = text.match(/^return\s+(.+)$/s);
  if (returnMatch && known('py_return')) {
    const node = parseExpression(returnMatch[1], { tuple: true });
    if (node) return { type: 'py_return', inputs: { VALUE: input(valueBlock(node, ctx)) } };
  }

  // import / from … import / assert / del
  const importMatch = text.match(/^import\s+(.+)$/s);
  if (importMatch && known('py_import')) return { type: 'py_import', fields: { NAME: importMatch[1].trim() } };
  const fromMatch = text.match(/^from\s+(\S+)\s+import\s+(.+)$/s);
  if (fromMatch && known('py_from')) return { type: 'py_from', fields: { MODULE: fromMatch[1], NAMES: fromMatch[2].trim() } };
  const assertMatch = text.match(/^assert\s+(.+)$/s);
  if (assertMatch && known('py_assert')) {
    const node = parseExpression(assertMatch[1]);
    if (node) return { type: 'py_assert', inputs: { VALUE: input(valueBlock(node, ctx)) } };
  }
  const delMatch = text.match(/^del\s+(.+)$/s);
  if (delMatch && known('py_del')) {
    const node = parseExpression(delMatch[1]);
    if (node) return { type: 'py_del', inputs: { VALUE: input(valueBlock(node, ctx)) } };
  }

  // global x, y（関数の中から外の変数を書きかえる）
  const globalMatch = text.match(/^global\s+([\p{L}_][\p{L}\p{N}_]*(?:\s*,\s*[\p{L}_][\p{L}\p{N}_]*)*)$/u);
  if (globalMatch) {
    return { type: 'py_global', fields: { NAMES: globalMatch[1].split(',').map(n => n.trim()).join(', ') } };
  }

  // p5.circle(...) のような、表で定義した呼び出し
  const callNode = parseExpression(text);
  if (callNode && callNode.type === 'call') {
    const mapped = lookup(CALL_BLOCK_INDEX, `${callNode.name}/${callNode.args.length}`);
    if (mapped && mapped.kind === 'statement') return fromCallDef(mapped, callNode, ctx);
  }

  // print(…)
  const printMatch = text.match(/^print\s*\((.*)\)$/s);
  if (printMatch) {
    const inside = printMatch[1].trim();

    // print() だけなら「改行する」
    if (inside === '') return { type: 'py_newline' };

    const parts = splitArguments(inside).map(part => part.trim());

    // 最後が end="…" なら「改行せずに表示」
    const endMatch = parts.length >= 1 && parts[parts.length - 1].match(/^end\s*=\s*(.+)$/s);
    if (endMatch && parts.length === 2) {
      const value = parseExpression(parts[0]);
      const tail = parseExpression(endMatch[1]);
      // end="\n" のように \ をふくむ書き方は、文字の欄では書き戻せないので、呼び出しのブロックにまかせる
      if (value && tail && tail.type === 'string' && !(tail.src || '').includes('\\')) {
        return {
          type: 'py_print_end',
          fields: { END: tail.value },
          inputs: { TEXT: input(valueBlock(value, ctx)) },
        };
      }
    }

    // print(a, b) は「空白で区切って表示」
    if (!endMatch && parts.length === 2) {
      const a = parseExpression(parts[0]);
      const b = parseExpression(parts[1]);
      if (a && b) {
        return {
          type: 'py_print_two',
          inputs: { A: input(valueBlock(a, ctx)), B: input(valueBlock(b, ctx)) },
        };
      }
    }

    if (!endMatch && parts.length === 1) {
      const node = parseExpression(inside);
      if (node) {
        return { type: 'text_print', inputs: { TEXT: input(valueBlock(node, ctx)) } };
      }
    }
  }

  // リスト.append(式)
  const appendMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\.append\s*\((.*)\)$/s);
  if (appendMatch) {
    const node = parseExpression(appendMatch[2]);
    if (node) {
      return {
        type: 'py_append',
        inputs: {
          LIST: input(valueBlock({ type: 'name', name: appendMatch[1] }, ctx)),
          ITEM: input(valueBlock(node, ctx)),
        },
      };
    }
  }

  // 代入（x = 式、Data[i] = 式、a, b = b, a、x = y = 0、x += 1 など）
  const assigned = assignmentBlock(text, ctx);
  if (assigned) return assigned;

  // ブロックの無い関数の呼び出し（自分で作った関数 move(1, 2) や、items.sort() など）
  if (callNode && callNode.type === 'call') {
    const called = userCall(callNode, ctx, 'py_call');
    if (called) return called;
  }
  // 値に続けて呼ぶメソッド（input().strip() など）と、そのほかの式だけの文
  if (callNode && callNode.type === 'method' && known(`py_methods_${callNode.args.length}`)) {
    return methodBlock(callNode, ctx, 'py_methods');
  }
  if (callNode && known('py_expr') && callNode.type !== 'call') {
    return { type: 'py_expr', inputs: { VALUE: input(valueBlock(callNode, ctx)) } };
  }

  return rawStatement(text);
}

/** 複合代入の記号 */
const AUG_OPS = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=']);

/**
 * 代入の文をブロックにする。代入でなければ null
 * 字句に分けて、かっこの外にある = と += などを探す（f(x=1) の = や == は数えない）。
 * @param {string} text
 * @param {object} ctx
 */
function assignmentBlock(text, ctx) {
  const tokens = tokenize(text);
  if (!tokens) return null;
  const cuts = [];
  let depth = 0;
  tokens.forEach((token, i) => {
    if ('([{'.includes(token.text)) depth++;
    else if (')]}'.includes(token.text)) depth--;
    else if (depth === 0 && (token.text === '=' || AUG_OPS.has(token.text))) cuts.push(i);
  });
  if (!cuts.length) return null;
  const slice = (from, to) => text.slice(tokens[from].start, tokens[to].end);
  const last = cuts[cuts.length - 1];
  if (last === tokens.length - 1) return null;
  const rightText = slice(last + 1, tokens.length - 1);
  const op = tokens[last].text;

  // x = y = 0（同じ値をいくつかの変数に入れる）
  if (cuts.length > 1) {
    if (cuts.some(i => tokens[i].text !== '=')) return null;
    const names = [0, ...cuts.slice(0, -1).map(i => i + 1)].map((from, k) => slice(from, cuts[k] - 1).trim());
    if (!names.every(name => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) || !known('py_chain_assign')) return null;
    const value = parseExpression(rightText, { tuple: true });
    if (!value) return null;
    return { type: 'py_chain_assign', fields: { TARGETS: names.join(' = ') }, inputs: { VALUE: input(valueBlock(value, ctx)) } };
  }

  const leftText = slice(0, last - 1).trim();
  const target = parseExpression(leftText, { tuple: true });
  const value = parseExpression(rightText, { tuple: true });
  if (!target || !value) return null;

  // x = 式 / x += 式
  if (target.type === 'name' && !target.name.includes('.')) {
    // list = … のように Python の名前に入れるときも、Blockly に名前を変えられないようにする
    if (op === '=' && isReservedName(target.name) && known('py_chain_assign')) {
      return { type: 'py_chain_assign', fields: { TARGETS: target.name }, inputs: { VALUE: input(valueBlock(value, ctx)) } };
    }
    if (op === '=') {
      return { type: 'variables_set', fields: { VAR: ctx.variable(target.name) }, inputs: { VALUE: input(valueBlock(value, ctx)) } };
    }
    if (!known('py_aug')) return null;
    return { type: 'py_aug', fields: { TARGET: target.name, OP: op }, inputs: { VALUE: input(valueBlock(value, ctx)) } };
  }

  // Data[i] = 式 / Data[i] += 式 / d["a"] = 式
  if (target.type === 'index' && known('py_set_index')) {
    return {
      type: 'py_set_index',
      fields: { OP: op },
      inputs: {
        LIST: input(valueBlock(target.target, ctx)),
        INDEX: input(valueBlock(target.index, ctx)),
        VALUE: input(valueBlock(value, ctx)),
      },
    };
  }

  // obj.x = 式（self.name = name など）
  if ((target.type === 'attr' || (target.type === 'name' && target.name.includes('.'))) && known('py_set_attr')) {
    const obj = target.type === 'attr' ? valueBlock(target.obj, ctx)
      : valueBlock(parseExpression(target.name.slice(0, target.name.lastIndexOf('.'))), ctx);
    const name = target.type === 'attr' ? target.name : target.name.slice(target.name.lastIndexOf('.') + 1);
    return { type: 'py_set_attr', fields: { NAME: name, OP: op }, inputs: { OBJ: input(obj), VALUE: input(valueBlock(value, ctx)) } };
  }

  // a, b = b, a / Data[0], Data[2] = Data[2], Data[0]（まとめて代入）
  const assignable = (t) => ['index', 'attr'].includes(t.type) || (t.type === 'name' && !isReservedName(t.name));
  if (target.type === 'tuple' && target.bare && op === '=' && target.items.every(assignable)) {
    const values = value.type === 'tuple' && value.bare ? value.items : [value];
    const type = `py_multi_${values.length}`;
    if (!known(type)) return null;
    const inputs = {};
    values.forEach((v, i) => { inputs[`V${i}`] = input(valueBlock(v, ctx)); });
    return { type, fields: { TARGETS: leftText }, inputs };
  }
  return null;
}

/**
 * 値に続けて呼ぶメソッドのブロック
 * @param {object} node method の木
 * @param {object} ctx
 * @param {'py_method'|'py_methods'} kind 値として使うか、文として置くか
 */
function methodBlock(node, ctx, kind) {
  const inputs = { OBJ: input(valueBlock(node.obj, ctx)) };
  node.args.forEach((arg, i) => { inputs[`ARG${i}`] = input(valueBlock(arg, ctx)); });
  return { type: `${kind}_${node.args.length}`, fields: { NAME: node.name }, inputs };
}

/**
 * 行末のコメントを切り分ける（文字列の中の # は数えない）
 * @param {string} text
 * @returns {{code: string, comment: string|null}}
 */
function splitComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return { code: text.slice(0, i).trimEnd(), comment: text.slice(i + 1).trim() };
  }
  return { code: text, comment: null };
}

/** ブロックにコメントを付ける（コードに戻すとき、その行の末尾に # で書かれる） */
function withComment(block, comment) {
  if (!comment) return block;
  return { ...block, icons: { ...(block.icons || {}), comment: { text: comment, pinned: false } } };
}

/** if / elif / else */
function ifBlock(clauses, ctx) {
  const conditions = clauses.filter(c => c.keyword === 'if' || c.keyword === 'elif');
  const elseClause = clauses.find(c => c.keyword === 'else');

  const inputs = {};
  conditions.forEach((clause, i) => {
    const node = parseExpression(clause.head);
    inputs[`IF${i}`] = input(node
      ? valueBlock(node, ctx)
      : { type: 'py_raw_value', fields: { CODE: clause.head } });
    const body = statementChain(clause.body, ctx);
    if (body) inputs[`DO${i}`] = { block: body };
  });

  if (elseClause) {
    const body = statementChain(elseClause.body, ctx);
    if (body) inputs.ELSE = { block: body };
  }

  return {
    type: 'controls_if',
    extraState: { elseIfCount: conditions.length - 1, hasElse: !!elseClause },
    inputs,
  };
}

/** while */
function whileBlock(clause, ctx) {
  const node = parseExpression(clause.head);
  const body = statementChain(clause.body, ctx);
  const inputs = {
    BOOL: input(node
      ? valueBlock(node, ctx)
      : { type: 'py_raw_value', fields: { CODE: clause.head } }),
  };
  if (body) inputs.DO = { block: body };
  return { type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, inputs };
}

/** for（回数繰り返し / カウンター / リストの要素ごと） */
function forBlock(clause, ctx) {
  const match = clause.head.match(/^([\p{L}_][\p{L}\p{N}_]*)\s+in\s+(.+)$/su);
  if (!match) {
    // for i, x in enumerate(Data): のように、変数がいくつかあるとき
    const multi = clause.head.match(/^(\(?\s*[\p{L}_][\p{L}\p{N}_]*(?:\s*,\s*[\p{L}_][\p{L}\p{N}_]*)+\s*\)?)\s+in\s+(.+)$/su);
    const iter = multi && parseExpression(multi[2]);
    if (!iter || !known('py_for_vars')) return rawRange(clause.headIndex, clause.endIndex, ctx);
    const body = statementChain(clause.body, ctx);
    const inputs = { ITER: input(valueBlock(iter, ctx)) };
    if (body) inputs.DO = { block: body };
    return { type: 'py_for_vars', fields: { VARS: multi[1].trim() }, inputs };
  }

  const [, varName, iterableText] = match;
  if (isReservedName(varName) && known('py_for_vars')) {
    const iter = parseExpression(iterableText);
    if (!iter) return rawRange(clause.headIndex, clause.endIndex, ctx);
    const body = statementChain(clause.body, ctx);
    const inputs = { ITER: input(valueBlock(iter, ctx)) };
    if (body) inputs.DO = { block: body };
    return { type: 'py_for_vars', fields: { VARS: varName }, inputs };
  }
  const body = statementChain(clause.body, ctx);
  const withBody = (inputs) => {
    if (body) inputs.DO = { block: body };
    return inputs;
  };

  const rangeMatch = iterableText.match(/^range\s*\((.*)\)$/s);
  if (rangeMatch) {
    const args = splitArguments(rangeMatch[1]).map(a => parseExpression(a));
    const numbers = args.map(a => (a && a.type === 'number' ? a.value : null));

    // range(n) かつ Blockly が作る変数名なら「n 回繰り返す」ブロックに戻す
    if (args.length === 1 && /^count\d*$/.test(varName)) {
      return {
        type: 'controls_repeat_ext',
        inputs: withBody({ TIMES: input(valueBlock(args[0], ctx)) }),
      };
    }
    // range(n) / range(a, b) / range(a, b, c) は「a から b まで」ブロックに戻す。
    // 終わりの値は range が「含まない」ので、1 引いた形にする。
    // Blockly の「a から b まで」は、数がすべて決まっていて 1 ずつ以上増えるときしか
    // range(…) のままのコードにならない（変数が入ると upRange などの長いコードになり、
    // 減らしながらのときは終わりがずれる）。それ以外は「range(…) の中を順に」にする。
    const plainNumbers = args.length >= 1 && numbers.every(n => n !== null && Number.isInteger(n))
      && (args.length < 3 || numbers[2] > 0)
      && (args.length === 1 ? numbers[0] > 0 : numbers[0] < numbers[1]);
    if (plainNumbers) {
      const endNode = args.length === 1 ? args[0] : args[1];
      const to = endNode.type === 'number'
        ? { type: 'math_number', fields: { NUM: endNode.value - 1 } }
        : {
          type: 'math_arithmetic',
          fields: { OP: 'MINUS' },
          inputs: {
            A: input(valueBlock(endNode, ctx)),
            B: input({ type: 'math_number', fields: { NUM: 1 } }),
          },
        };
      return {
        type: 'controls_for',
        fields: { VAR: ctx.variable(varName) },
        inputs: withBody({
          FROM: input(args.length === 1
            ? { type: 'math_number', fields: { NUM: 0 } }
            : valueBlock(args[0], ctx)),
          TO: input(to),
          BY: input(args[2] ? valueBlock(args[2], ctx) : { type: 'math_number', fields: { NUM: 1 } }),
        }),
      };
    }
  }

  const iterable = parseExpression(iterableText);
  return {
    type: 'controls_forEach',
    fields: { VAR: ctx.variable(varName) },
    inputs: withBody({
      LIST: input(iterable
        ? valueBlock(iterable, ctx)
        : { type: 'py_raw_value', fields: { CODE: iterableText } }),
    }),
  };
}

/** 元のコードの範囲を、行番号つきの Python ブロックにする */
function rawRange(start, end, ctx) {
  return rawStatement(ctx.sourceRange(start, end), ctx.sourceRangeLines(start, end));
}

/**
 * def setup(): / def draw(): は専用ブロックにする。
 * それ以外の関数定義はコードのまま残す。
 * @param {object} stmt
 * @param {object} ctx
 * @returns {object|null}
 */
function defBlock(stmt, ctx) {
  const clause = stmt.clauses[0];
  const header = clause.head.match(/^(\w+)\s*\(\s*\)$/);
  const mapped = header && lookup(DEF_BLOCK_INDEX, header[1]);
  if (mapped) {
    const body = statementChain(clause.body, ctx);
    return { type: mapped.type, inputs: body ? { BODY: { block: body } } : {} };
  }

  // 自分で作る関数。受け取るものは、そのままの書き方（a, b=1）で持つ。
  // *args や型の注釈（a: int）、-> のような書き方は、コードのまま残す
  const own = clause.head.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(([^()]*)\)$/u);
  const params = own ? own[2].split(',').map(p => p.trim()).filter(Boolean) : null;
  const simple = params && params.every(p => /^[\p{L}_][\p{L}\p{N}_]*(\s*=\s*[^,:*]+)?$/u.test(p));
  // 受け取るものの名前が list や sum のような Python の名前だと、Blockly は中身の側だけ
  // list2 と名前を変えてしまう（見出しはそのままなので動かなくなる）。
  // Data と data のように大文字小文字だけちがう名前も、Blockly は同じ変数とみなす。
  // どちらも、関数をコードのまま残して、意味が変わらないようにする。
  const names = params ? params.map(p => p.split('=')[0].trim()) : [];
  const risky = names.some(name => isReservedName(name) || ctx.caseClash(name));
  if (!own || !simple || risky || !known('py_def')) return rawRange(stmt.startIndex, stmt.endIndex, ctx);

  const body = statementChain(clause.body, ctx);
  return {
    type: 'py_def',
    fields: { NAME: own[1], PARAMS: params.join(', ') },
    inputs: body ? { BODY: { block: body } } : {},
  };
}

/**
 * コードをそのまま持つ文ブロック。
 * 複数行のときは、1行につき1ブロックの連なりにする
 * （行頭の空白も残すので、元のコードにそのまま戻る）。
 * @param {string} code
 * @returns {object|null}
 */
function rawStatement(code, lineNumbers = []) {
  // 空行は捨てる。ただし三重引用符の文字列の中の空行は、文字列の一部なので残す
  let triple = null;
  const lines = String(code).split('\n').filter(line => {
    const keep = Boolean(line.trim()) || triple !== null;
    triple = scanLine(line, 0, triple).triple;
    return keep;
  });
  if (!lines.length) return null;

  const blocks = lines.map((line, index) => {
    const block = { type: 'py_raw', fields: { CODE: line } };
    if (lineNumbers[index]) block.data = String(lineNumbers[index]);
    return block;
  });
  for (let i = 1; i < blocks.length; i++) blocks[i - 1].next = { block: blocks[i] };
  return blocks[0];
}

/** 括弧の深さを見ながら引数をカンマで分割する */
function splitArguments(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  let quote = null;

  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/* ============================================================
 * 6. 入口
 * ========================================================== */

/**
 * Python のコードを Blockly のワークスペースに反映する
 * @param {string} source Python のソースコード
 * @param {Blockly.WorkspaceSvg} workspace
 * @returns {{ok: boolean, rawCount: number, error?: string}}
 */
export function pythonToBlocks(source, workspace) {
  const lines = toLogicalLines(source);

  // 使われている名前を、小文字にしたものごとに集める（文字列とコメントの中は数えない）
  const identifiers = new Map();
  const bare = String(source).replace(/("""|''')[\s\S]*?\1|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#.*$/gm, ' ');
  for (const [name] of bare.matchAll(/[A-Za-z_]\w*/g)) {
    const key = name.toLowerCase();
    if (!identifiers.has(key)) identifiers.set(key, new Set());
    identifiers.get(key).add(name);
  }

  const ctx = {
    /** 変数名から Blockly の変数 ID を得る（無ければ作る） */
    variable(name) {
      let variable = workspace.getVariable(name, '');
      if (!variable) variable = workspace.createVariable(name, '');
      return { id: variable.getId() };
    },
    /** プログラムの中に、大文字小文字だけちがう別の名前があるか（Data と data） */
    caseClash(name) {
      const spellings = identifiers.get(name.toLowerCase());
      return Boolean(spellings && spellings.size > 1);
    },
    /** 元のコードの一部（複数行）をそのまま取り出す */
    sourceRange(start, end) {
      const slice = lines.slice(start, end);
      if (!slice.length) return '';
      const base = slice[0].indent;
      // 行をまたぐ文字列の 2 行目からは、元の行から範囲の字下げ（base）ぶんだけ取りのぞく
      const dedent = (text) => {
        let i = 0;
        while (i < base && (text[i] === ' ' || text[i] === '\t')) i++;
        return text.slice(i);
      };
      return slice
        .map(line => {
          const head = ' '.repeat(Math.max(0, line.indent - base));
          if (!line.rawLines) return head + line.text;
          return [head + line.rawLines[0].trim(), ...line.rawLines.slice(1).map(dedent)].join('\n');
        })
        .join('\n');
    },
    /** 範囲の中に、字下げより左に書いた文字列の行があるか */
    hasUnderIndented(start, end) {
      return lines.slice(start, end).some(line => line.underIndented);
    },
    /** 上の範囲に対応する行番号（行をまたぐ文は、またいだ行の数だけ） */
    sourceRangeLines(start, end) {
      return lines.slice(start, end)
        .flatMap(line => line.text.split('\n').map((_, i) => line.line + i));
    },
  };

  const { stmts } = parseStatements(lines, 0, lines.length ? lines[0].indent - 1 : -1);

  try {
    Blockly.Events.disable();
    workspace.clear();

    const head = statementChain(stmts, ctx);
    if (head) {
      head.x = 24;
      head.y = 24;
      Blockly.serialization.blocks.append(head, workspace, { recordUndo: false });
    }
    return { ok: true, rawCount: countRaw(head) };
  } catch (e) {
    // 途中で失敗したときはブロックが壊れた状態で残るので、
    // いったん全部消してコードをそのまま1つのブロックに入れ直す
    console.warn('ブロックへの変換に失敗したので、コードをそのまま1つのブロックにします:', e);
    try {
      workspace.clear();
      const fallback = rawStatement(source, source.split('\n').map((_, i) => i + 1));
      if (fallback) {
        fallback.x = 24;
        fallback.y = 24;
        Blockly.serialization.blocks.append(fallback, workspace, { recordUndo: false });
      }
      return { ok: true, rawCount: countRaw(fallback) };
    } catch (fallbackError) {
      console.error('Python からブロックへの変換に失敗:', fallbackError);
      return { ok: false, rawCount: 0, error: fallbackError.message };
    }
  } finally {
    Blockly.Events.enable();
  }
}

/** 「Python コード」ブロックがいくつ含まれるか数える */
function countRaw(block) {
  if (!block || typeof block !== 'object') return 0;
  let count = block.type === 'py_raw' || block.type === 'py_raw_value' ? 1 : 0;
  for (const value of Object.values(block.inputs || {})) {
    count += countRaw(value && value.block);
  }
  count += countRaw(block.next && block.next.block);
  return count;
}
