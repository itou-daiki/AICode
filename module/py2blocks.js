// module/py2blocks.js
// Python のコードを読み取って Blockly のブロックに変換するモジュール。
//
// ブロック → Python は Blockly の標準ジェネレーターが担当し、
// Python → ブロック はこのファイルが担当する。これで両方向の変換がそろう。
//
// 対応できない書き方は「Python」ブロック（コードをそのまま持つブロック）になるので、
// どんなコードでも必ず往復できる。

import { CALL_BLOCK_INDEX, NAME_BLOCK_INDEX, DEF_BLOCK_INDEX } from './blockdefs.js';

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
      buffer = { indent: indentWidth(raw), text: raw.trim(), line: index + 1 };
    } else {
      buffer.text += ' ' + raw.trim();
    }

    const scan = scanLine(raw, depth, triple);
    depth = scan.depth;
    triple = scan.triple;

    const continues = depth > 0 || triple !== null || raw.trimEnd().endsWith('\\');
    if (!continues) {
      result.push(buffer);
      buffer = null;
    }
  }

  if (buffer) result.push(buffer);
  return result;
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

    const { text } = lines[i];
    const match = text.endsWith(':') ? text.match(COMPOUND_RE) : null;

    if (!match) {
      stmts.push({ kind: 'simple', text, line: lines[i].line });
      i++;
      continue;
    }

    const keyword = match[1];
    const head = match[2].replace(/:\s*$/, '').trim();
    const headIndex = i;
    const { stmts: body, next } = parseStatements(lines, i + 1, blockIndent);
    i = next;

    const clause = { keyword, head, body, headIndex, endIndex: i, line: lines[headIndex].line };

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
 * ========================================================== */

const TOKEN_RE = new RegExp([
  '\\s+',                                   // 空白
  '(?:\\d+\\.\\d+|\\.\\d+|\\d+)',           // 数値
  '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', // 文字列
  '[A-Za-z_][A-Za-z0-9_]*',                 // 名前
  '\\*\\*|//|==|!=|<=|>=',                  // 2文字演算子
  '[-+*/%<>=(),\\[\\]{}.:]',                // 1文字記号
].join('|'), 'g');

/**
 * 式を字句に分解する
 * @param {string} text
 * @returns {string[]|null} 解析できない文字が混ざっていたら null
 */
function tokenize(text) {
  const tokens = [];
  let pos = 0;
  TOKEN_RE.lastIndex = 0;

  let match;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index !== pos) return null; // 未知の文字があった
    pos = match.index + match[0].length;
    if (match[0].trim()) tokens.push(match[0]);
  }
  return pos === text.length ? tokens : null;
}

/**
 * 式を解析して AST を返す
 * @param {string} text
 * @returns {object|null} 解析できなければ null
 */
export function parseExpression(text) {
  const tokens = tokenize(text.trim());
  if (!tokens || !tokens.length) return null;

  const state = { tokens, pos: 0 };
  let node;
  try {
    node = parseOr(state);
  } catch (e) {
    return null;
  }
  return state.pos === tokens.length ? node : null;
}

const peek = (s) => s.tokens[s.pos];
const eat = (s, token) => (peek(s) === token ? (s.pos++, true) : false);
function expect(s, token) {
  if (!eat(s, token)) throw new Error(`'${token}' が見つかりません`);
}

function parseOr(s) {
  let left = parseAnd(s);
  while (peek(s) === 'or') { s.pos++; left = { type: 'logic', op: 'OR', a: left, b: parseAnd(s) }; }
  return left;
}

function parseAnd(s) {
  let left = parseNot(s);
  while (peek(s) === 'and') { s.pos++; left = { type: 'logic', op: 'AND', a: left, b: parseNot(s) }; }
  return left;
}

function parseNot(s) {
  if (peek(s) === 'not') { s.pos++; return { type: 'not', value: parseNot(s) }; }
  return parseComparison(s);
}

const COMPARE_OPS = { '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' };

function parseComparison(s) {
  let left = parseAdditive(s);
  while (COMPARE_OPS[peek(s)]) {
    const op = COMPARE_OPS[s.tokens[s.pos++]];
    left = { type: 'compare', op, a: left, b: parseAdditive(s) };
  }
  return left;
}

function parseAdditive(s) {
  let left = parseMultiplicative(s);
  while (peek(s) === '+' || peek(s) === '-') {
    const op = s.tokens[s.pos++] === '+' ? 'ADD' : 'MINUS';
    left = { type: 'arith', op, a: left, b: parseMultiplicative(s) };
  }
  return left;
}

function parseMultiplicative(s) {
  let left = parseUnary(s);
  while (['*', '/', '%', '//'].includes(peek(s))) {
    const token = s.tokens[s.pos++];
    const right = parseUnary(s);
    if (token === '%') left = { type: 'modulo', a: left, b: right };
    else if (token === '//') left = { type: 'floordiv', a: left, b: right };
    else left = { type: 'arith', op: token === '*' ? 'MULTIPLY' : 'DIVIDE', a: left, b: right };
  }
  return left;
}

function parseUnary(s) {
  if (peek(s) === '-') { s.pos++; return { type: 'negate', value: parseUnary(s) }; }
  return parsePower(s);
}

function parsePower(s) {
  const base = parseAtom(s);
  if (peek(s) === '**') { s.pos++; return { type: 'arith', op: 'POWER', a: base, b: parseUnary(s) }; }
  return base;
}

function parseAtom(s) {
  const token = peek(s);
  if (token === undefined) throw new Error('式が途中で終わっています');

  // 括弧
  if (token === '(') {
    s.pos++;
    const inner = parseOr(s);
    expect(s, ')');
    return inner;
  }

  // リスト
  if (token === '[') {
    s.pos++;
    const items = [];
    if (peek(s) !== ']') {
      do { items.push(parseOr(s)); } while (eat(s, ','));
    }
    expect(s, ']');
    return { type: 'list', items };
  }

  // 数値
  if (/^\d|^\.\d/.test(token)) { s.pos++; return { type: 'number', value: Number(token) }; }

  // 文字列
  if (/^['"]/.test(token)) { s.pos++; return { type: 'string', value: unquote(token) }; }

  // 名前・関数呼び出し
  if (/^[A-Za-z_]/.test(token)) {
    s.pos++;
    let name = token;
    while (peek(s) === '.' && /^[A-Za-z_]/.test(s.tokens[s.pos + 1] || '')) {
      s.pos++;
      name += '.' + s.tokens[s.pos++];
    }
    if (name === 'True' || name === 'False') return { type: 'boolean', value: name === 'True' };
    if (name === 'None') return { type: 'none' };

    if (peek(s) === '(') {
      s.pos++;
      const args = [];
      if (peek(s) !== ')') {
        do { args.push(parseOr(s)); } while (eat(s, ','));
      }
      expect(s, ')');
      return withIndex(s, { type: 'call', name, args });
    }
    return withIndex(s, { type: 'name', name });
  }

  throw new Error(`予期しない字句: ${token}`);
}

/**
 * うしろに続く [ ] を読み取る（a[i] や Data[i][j]）
 *
 * 共通テストの表記でも配列の添字は 0 から数えるので、そのまま持つ。
 * @param {object} s 読み取りの状態
 * @param {object} node ここまでの式
 * @returns {object}
 */
function withIndex(s, node) {
  let current = node;
  while (peek(s) === '[') {
    s.pos++;
    const index = parseOr(s);
    expect(s, ']');
    current = { type: 'index', target: current, index };
  }
  return current;
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
    case 'name': {
      const named = NAME_BLOCK_INDEX.get(node.name);
      if (named) return { type: named.type };
      // p5.width のようなドット付きの名前は変数にできないのでコードのまま
      if (node.name.includes('.')) return { type: 'py_raw_value', fields: { CODE: node.name } };
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
      // 文字列の連結は計算ブロックに入れられないので、コードのまま残す
      if (isStringy(node)) return rawValue(node);
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
      return rawValue(node);
  }
}

/** 関数呼び出しを対応するブロックに変換する */
function callBlock(node, ctx) {
  // まず、表で定義したブロック（描画モードの random など）を探す
  const mapped = CALL_BLOCK_INDEX.get(`${node.name}/${node.args.length}`);
  if (mapped && mapped.kind === 'value') return fromCallDef(mapped, node, ctx);

  const [a, b] = node.args;
  const one = () => input(valueBlock(a, ctx));

  switch (`${node.name}/${node.args.length}`) {
    case 'input/0':
      return { type: 'py_input', inputs: { PROMPT: input({ type: 'text', fields: { TEXT: '' } }) } };
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
      return { type: 'py_raw_value', fields: { CODE: unparse(node) } };
    case 'abs/1':
      return { type: 'math_single', fields: { OP: 'ABS' }, inputs: { NUM: one() } };
    case 'round/1':
      return { type: 'math_round', fields: { OP: 'ROUND' }, inputs: { NUM: one() } };
    case 'math.sqrt/1':
      return { type: 'math_single', fields: { OP: 'ROOT' }, inputs: { NUM: one() } };
    case 'random.randint/2':
      return {
        type: 'math_random_int',
        inputs: { FROM: one(), TO: input(valueBlock(b, ctx)) },
      };
    default:
      return rawValue(node);
  }
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
  return { type: 'py_raw_value', fields: { CODE: unparse(node) } };
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
  if (node.type === 'string') return true;
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

  switch (stmt.keyword) {
    case 'if':    return ifBlock(stmt.clauses, ctx);
    case 'while': return whileBlock(stmt.clauses[0], ctx);
    case 'for':   return forBlock(stmt.clauses[0], ctx);
    case 'def':   return defBlock(stmt, ctx);
    default:      return rawRange(stmt.startIndex, stmt.endIndex, ctx);
  }
}

/** 単純文 */
function simpleBlock(text, ctx) {
  // コメント
  if (text.startsWith('#')) {
    return { type: 'py_comment', fields: { TEXT: text.replace(/^#\s?/, '') } };
  }
  if (text === 'break' || text === 'continue') {
    return { type: 'controls_flow_statements', fields: { FLOW: text.toUpperCase() } };
  }

  // p5.circle(...) のような、表で定義した呼び出し
  const callNode = parseExpression(text);
  if (callNode && callNode.type === 'call') {
    const mapped = CALL_BLOCK_INDEX.get(`${callNode.name}/${callNode.args.length}`);
    if (mapped && mapped.kind === 'statement') return fromCallDef(mapped, callNode, ctx);
  }

  // print(式)
  const printMatch = text.match(/^print\s*\((.*)\)$/s);
  if (printMatch) {
    const arg = printMatch[1].trim();
    const node = arg ? parseExpression(arg) : null;
    if (arg === '' || node) {
      return {
        type: 'text_print',
        inputs: { TEXT: input(node ? valueBlock(node, ctx) : { type: 'text', fields: { TEXT: '' } }) },
      };
    }
  }

  // 変数 += 式（授業では「x += 1 は x = x + 1 と同じ」と教える形）
  const augMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\*\*|\/\/|[-+*/%])=\s*(.+)$/s);
  if (augMatch) {
    const [, name, op, rest] = augMatch;
    const node = parseExpression(rest);
    const OPS = { '+': 'ADD', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE', '**': 'POWER' };
    if (node && (OPS[op] || op === '%' || op === '//')) {
      const left = { type: 'variables_get', fields: { VAR: ctx.variable(name) } };
      const right = valueBlock(node, ctx);
      let value;
      if (op === '%') {
        value = { type: 'math_modulo', inputs: { DIVIDEND: input(left), DIVISOR: input(right) } };
      } else if (op === '//') {
        value = { type: 'py_floor_div', inputs: { A: input(left), B: input(right) } };
      } else {
        value = {
          type: 'math_arithmetic',
          fields: { OP: OPS[op] },
          inputs: { A: input(left), B: input(right) },
        };
      }
      return {
        type: 'variables_set',
        fields: { VAR: ctx.variable(name) },
        inputs: { VALUE: input(value) },
      };
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
          LIST: input({ type: 'variables_get', fields: { VAR: ctx.variable(appendMatch[1]) } }),
          ITEM: input(valueBlock(node, ctx)),
        },
      };
    }
  }

  // 変数 = 式
  const assignMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+)$/s);
  if (assignMatch) {
    const node = parseExpression(assignMatch[2]);
    if (node) {
      return {
        type: 'variables_set',
        fields: { VAR: ctx.variable(assignMatch[1]) },
        inputs: { VALUE: input(valueBlock(node, ctx)) },
      };
    }
  }

  return rawStatement(text);
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
  const match = clause.head.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/s);
  if (!match) return rawRange(clause.headIndex, clause.endIndex, ctx);

  const [, varName, iterableText] = match;
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
    if (args.length >= 1 && args.every(Boolean)) {
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
  const mapped = header && DEF_BLOCK_INDEX.get(header[1]);
  if (!mapped) return rawRange(stmt.startIndex, stmt.endIndex, ctx);

  const body = statementChain(clause.body, ctx);
  return { type: mapped.type, inputs: body ? { BODY: { block: body } } : {} };
}

/**
 * コードをそのまま持つ文ブロック。
 * 複数行のときは、1行につき1ブロックの連なりにする
 * （行頭の空白も残すので、元のコードにそのまま戻る）。
 * @param {string} code
 * @returns {object|null}
 */
function rawStatement(code, lineNumbers = []) {
  const lines = String(code).split('\n').filter(line => line.trim());
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

  const ctx = {
    /** 変数名から Blockly の変数 ID を得る（無ければ作る） */
    variable(name) {
      let variable = workspace.getVariable(name, '');
      if (!variable) variable = workspace.createVariable(name, '');
      return { id: variable.getId() };
    },
    /** 元のコードの一部（複数行）をそのまま取り出す */
    sourceRange(start, end) {
      const slice = lines.slice(start, end);
      if (!slice.length) return '';
      const base = slice[0].indent;
      return slice
        .map(line => ' '.repeat(Math.max(0, line.indent - base)) + line.text)
        .join('\n');
    },
    /** 上の範囲に対応する行番号 */
    sourceRangeLines(start, end) {
      return lines.slice(start, end).map(line => line.line);
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
