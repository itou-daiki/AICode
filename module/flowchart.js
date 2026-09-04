// module/flowchart.js
// Python のソースコードを解析して Mermaid のフローチャート定義を生成するモジュール。
//
// ブロックから生成したコードでも、手で書いたコードでも、
// 「Python コード → フローチャート」という同じ経路を通る。
// あわせて「どの図形が何行目か」も返すので、ステップ実行中に現在位置を光らせられる。

import { humanizeStatement, humanizeCondition, humanizeValue, humanizeDefHead } from './humanize.js';

const MAX_LABEL_LENGTH = 62;
const MAX_NODES = 250;

/* ============================================================
 * 1. パース: インデントを手がかりに Python を木構造にする
 * ========================================================== */

/**
 * 行末コメントを取り除く（文字列リテラル内の # は残す）
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * 行頭の空白の幅（タブはスペース4つ換算）
 * @param {string} line
 * @returns {number}
 */
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
 * 複合文のキーワードを判定
 * @param {string} text インデントを除いた行
 * @returns {{keyword: string, head: string}|null}
 */
function matchCompound(text) {
  if (!text.endsWith(':')) return null;
  const m = text.match(/^(if|elif|else|for|while|def|class|try|except|finally|with)\b\s*(.*)$/);
  if (!m) return null;
  return { keyword: m[1], head: m[2].replace(/:\s*$/, '').trim() };
}

/**
 * ソースコードを行の配列（インデントと行番号つき）に変換
 * @param {string} source
 * @returns {{indent: number, text: string, line: number}[]}
 */
function toLines(source) {
  const lines = [];
  source.split('\n').forEach((raw, index) => {
    const stripped = stripComment(raw);
    if (!stripped.trim()) return;
    lines.push({ indent: indentWidth(stripped), text: stripped.trim(), line: index + 1 });
  });
  return lines;
}

/**
 * インデントに従って文の木を構築する
 * @param {{indent: number, text: string, line: number}[]} lines
 * @param {number} start 開始位置
 * @param {number} parentIndent 親ブロックのインデント幅
 * @returns {{nodes: object[], next: number}}
 */
function parseBlock(lines, start, parentIndent) {
  const nodes = [];
  let i = start;

  if (i >= lines.length || lines[i].indent <= parentIndent) return { nodes, next: i };
  const blockIndent = lines[i].indent;

  while (i < lines.length && lines[i].indent >= blockIndent) {
    // より深いインデントは（構文的におかしいので）読み飛ばす
    if (lines[i].indent > blockIndent) { i++; continue; }

    const current = lines[i];
    const compound = matchCompound(current.text);

    if (!compound) {
      nodes.push({ type: 'simple', text: current.text, line: current.line });
      i++;
      continue;
    }

    const { nodes: body, next } = parseBlock(lines, i + 1, blockIndent);
    i = next;

    const clause = { ...compound, body, line: current.line };

    if (['elif', 'else', 'except', 'finally'].includes(compound.keyword)) {
      const prev = nodes[nodes.length - 1];
      if (prev && prev.type === 'compound') {
        prev.clauses.push(clause);
        continue;
      }
    }

    nodes.push({ type: 'compound', keyword: compound.keyword, clauses: [clause] });
  }

  return { nodes, next: i };
}

/**
 * Python ソースを解析する
 * @param {string} source
 * @returns {object[]} 文のリスト
 */
export function parsePython(source) {
  const lines = toLines(source);
  if (!lines.length) return [];
  return parseBlock(lines, 0, lines[0].indent - 1).nodes;
}

/* ============================================================
 * 2. Mermaid 定義の生成
 * ========================================================== */

/** 今の言いかえ設定（true ならやさしい日本語で書く） */
let useJapanese = true;

/** 文のラベル */
const say = (text) => (useJapanese ? humanizeStatement(text) : text);
/** 条件のラベル */
const ask = (text) => (useJapanese ? humanizeCondition(text) : text);
/** 値のラベル */
const val = (text) => (useJapanese ? humanizeValue(text) : text);

/**
 * Mermaid のラベル用にテキストを安全化する
 * @param {string} text
 * @returns {string}
 */
function escapeLabel(text) {
  let label = String(text).trim();
  if (label.length > MAX_LABEL_LENGTH) {
    label = label.slice(0, MAX_LABEL_LENGTH - 1) + '…';
  }
  return label
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;');
}

/** フローチャートを組み立てるビルダー */
class FlowBuilder {
  constructor() {
    this.lines = [];
    this.counter = 0;
    this.truncated = false;
    this.byShape = { terminator: [], decision: [], io: [], loop: [], junction: [] };
    /** 図形 ID → ソースの行番号 */
    this.lineByNode = {};
  }

  /**
   * ノードを1つ追加して ID を返す
   * @param {string} shape terminator / process / decision / io / loop
   * @param {string} text ラベル
   * @param {number} [line] 対応するソースの行番号
   * @returns {string|null}
   */
  addNode(shape, text, line) {
    if (this.counter >= MAX_NODES) {
      this.truncated = true;
      return null;
    }
    const id = `n${this.counter++}`;
    const label = escapeLabel(text);
    const shapes = {
      terminator: `${id}(["${label}"])`,
      process: `${id}["${label}"]`,
      decision: `${id}{"${label}"}`,
      io: `${id}[/"${label}"/]`,
      loop: `${id}{{"${label}"}}`,
      junction: `${id}(( ))`,
    };
    this.lines.push('  ' + (shapes[shape] || shapes.process));
    if (this.byShape[shape]) this.byShape[shape].push(id);
    if (line) this.lineByNode[id] = line;
    return id;
  }

  /**
   * 保留中の出口を指定ノードにつなぐ
   *
   * 出口に rankAfter があるときは、そのノードより下に置かれるよう、
   * 見えない線（~~~）を足す。こうしないと、繰り返しを抜けた先が
   * 判断のすぐ横に並んでしまい、教科書の流れ図と形が変わってしまう。
   */
  connect(from, toId) {
    if (!toId) return;
    for (const edge of from) {
      if (!edge.id) continue;
      const label = edge.label ? `|${escapeLabel(edge.label)}|` : '';
      this.lines.push(`  ${edge.id} -->${label} ${toId}`);
      for (const below of edge.rankAfter || []) {
        if (below && below !== toId) this.lines.push(`  ${below} ~~~ ${toId}`);
      }
    }
  }

  toString() {
    return ['flowchart TD', ...this.lines].join('\n');
  }
}

/**
 * 分かれた流れを1つの合流点にまとめる。
 * こうしないと、分岐のたびに線が何本も先の図形へ伸びて読みにくくなる。
 * @param {FlowBuilder} b
 * @param {{id: string, label?: string}[]} outs
 * @returns {{id: string, label?: string}[]}
 */
function merge(b, outs) {
  const real = outs.filter(edge => edge.id);
  if (real.length <= 1) return real;

  const id = b.addNode('junction', ' ');
  if (!id) return real;
  b.connect(real, id);
  return [{ id }];
}

/** 文の見た目（形）を決める */
function shapeForStatement(text) {
  return /\b(print|input)\s*\(/.test(text) ? 'io' : 'process';
}

/**
 * 文のリストを描画する
 * @returns {{id: string, label?: string}[]} このブロックの出口
 */
function renderSequence(b, stmts, incoming, ctx) {
  let current = incoming;
  for (const stmt of stmts) {
    if (b.truncated) break;
    current = renderStatement(b, stmt, current, ctx);
    if (!current.length) break; // return / break / continue で流れが途切れた
  }
  return current;
}

/** 1つの文を描画する */
function renderStatement(b, stmt, incoming, ctx) {
  if (stmt.type === 'simple') return renderSimple(b, stmt, incoming, ctx);

  switch (stmt.keyword) {
    case 'if':
      return renderIf(b, stmt.clauses, incoming, ctx);
    case 'while':
    case 'for':
      return renderLoop(b, stmt, incoming, ctx);
    case 'try':
      return renderTry(b, stmt.clauses, incoming, ctx);
    case 'def':
    case 'class':
      // 関数・クラス定義は本流から外して別グラフに積む
      ctx.definitions.push(stmt);
      return incoming;
    case 'with': {
      const clause = stmt.clauses[0];
      const id = b.addNode('process', `${val(clause.head)} を使う`, clause.line);
      b.connect(incoming, id);
      return renderSequence(b, clause.body, [{ id }], ctx);
    }
    default: {
      const clause = stmt.clauses[0];
      const id = b.addNode('process', `${stmt.keyword} ${clause.head}`, clause.line);
      b.connect(incoming, id);
      return renderSequence(b, clause.body, [{ id }], ctx);
    }
  }
}

/** 単純文（代入・呼び出し・return / break / continue など） */
function renderSimple(b, stmt, incoming, ctx) {
  const { text, line } = stmt;

  if (/^return\b/.test(text)) {
    const id = b.addNode('terminator', text === 'return' ? '呼び出し元にもどる' : say(text), line);
    b.connect(incoming, id);
    ctx.returns.push({ id });
    return [];
  }
  if (text === 'break') {
    const id = b.addNode('process', 'ループを抜ける', line);
    b.connect(incoming, id);
    if (ctx.loop) ctx.loop.breaks.push({ id });
    return [];
  }
  if (text === 'continue') {
    const id = b.addNode('process', '次の繰り返しへ', line);
    b.connect(incoming, id);
    if (ctx.loop) b.connect([{ id }], ctx.loop.continueTarget || ctx.loop.head);
    return [];
  }
  if (text === 'pass') {
    const id = b.addNode('process', '何もしない', line);
    b.connect(incoming, id);
    return [{ id }];
  }

  const id = b.addNode(shapeForStatement(text), say(text), line);
  b.connect(incoming, id);
  return [{ id }];
}

/** if / elif / else */
function renderIf(b, clauses, incoming, ctx, nested = false) {
  const [head, ...rest] = clauses;
  const decision = b.addNode('decision', ask(head.head), head.line);
  b.connect(incoming, decision);

  const outs = renderSequence(b, head.body, [{ id: decision, label: 'はい' }], ctx);

  const joinHere = (edges) => (nested ? edges : merge(b, edges));

  const next = rest[0];
  if (!next) return joinHere([...outs, { id: decision, label: 'いいえ' }]);

  const falseBranch = [{ id: decision, label: 'いいえ' }];
  if (next.keyword === 'elif') {
    // elif は「いいえ」側にネストした if として描く（合流は外側で1回だけ）
    return joinHere([...outs, ...renderIf(b, rest, falseBranch, ctx, true)]);
  }
  return joinHere([...outs, ...renderSequence(b, next.body, falseBranch, ctx)]);
}

/**
 * for / while を、教科書どおりのフローチャートで描く。
 *
 *   while  … 判断（ひし形）→ はい: 本体 → 判断にもどる ／ いいえ: 抜ける
 *   for(range) … 初期化 → 判断 → はい: 本体 → 更新 → 判断にもどる
 *   for(その他) … 判断「次の要素がある？」→ はい: 取り出し → 本体 → 判断にもどる
 */
function renderLoop(b, stmt, incoming, ctx) {
  const clause = stmt.clauses[0];
  const isFor = stmt.keyword === 'for';
  // 繰り返しの本体の終わり（ここから判断にもどる節点）。
  // 抜けた先を、この下に置くために使う。
  let tail = [];
  const exits = (cond, loopCtx) => {
    const normal = [{ id: cond, label: 'いいえ', rankAfter: tail.filter(Boolean) }];
    const elseClause = stmt.clauses.find(c => c.keyword === 'else');
    const after = elseClause ? renderSequence(b, elseClause.body, normal, ctx) : normal;
    return [...after, ...loopCtx.loop.breaks];
  };

  // --- while ---
  if (!isFor) {
    const cond = b.addNode('decision', ask(clause.head), clause.line);
    b.connect(incoming, cond);

    const loopCtx = { ...ctx, loop: { head: cond, continueTarget: cond, breaks: [] } };
    const outs = renderSequence(b, clause.body, [{ id: cond, label: 'はい' }], loopCtx);
    b.connect(outs, cond);
    tail = outs.map(e => e.id);

    return exits(cond, loopCtx);
  }

  // --- for i in range(...) ---
  const range = parseRangeHeader(clause.head);
  if (range) {
    const init = b.addNode('process', say(`${range.name} = ${range.from}`), clause.line);
    b.connect(incoming, init);

    const cond = b.addNode('decision', ask(`${range.name} ${range.compare} ${range.to}`), clause.line);
    b.connect([{ id: init }], cond);

    const update = b.addNode('process', say(`${range.name} = ${range.name} + ${range.step}`), clause.line);

    const loopCtx = { ...ctx, loop: { head: cond, continueTarget: update, breaks: [] } };
    const outs = renderSequence(b, clause.body, [{ id: cond, label: 'はい' }], loopCtx);
    b.connect(outs, update);
    b.connect([{ id: update }], cond);
    tail = [update];

    return exits(cond, loopCtx);
  }

  // --- for x in リスト など ---
  const parts = clause.head.match(/^(.+?)\s+in\s+(.+)$/);
  const target = parts ? parts[1].trim() : '要素';
  const iterable = parts ? parts[2].trim() : clause.head;

  const cond = b.addNode('decision', `${val(iterable)} に次の要素がある？`, clause.line);
  b.connect(incoming, cond);

  const take = b.addNode('process', `${target} = 次の要素`, clause.line);
  b.connect([{ id: cond, label: 'はい' }], take);

  const loopCtx = { ...ctx, loop: { head: cond, continueTarget: cond, breaks: [] } };
  const outs = renderSequence(b, clause.body, [{ id: take }], loopCtx);
  b.connect(outs, cond);
  tail = outs.map(e => e.id);

  return exits(cond, loopCtx);
}

/**
 * 「i in range(...)」を読み取って、初期値・終了条件・増分に分ける
 * @param {string} head for の見出し（例 'i in range(1, 101)'）
 * @returns {{name: string, from: string, to: string, step: string, compare: string}|null}
 */
function parseRangeHeader(head) {
  const match = head.match(/^([A-Za-z_]\w*)\s+in\s+range\s*\((.*)\)$/s);
  if (!match) return null;

  const args = splitTopLevel(match[2]);
  if (!args.length || args.length > 3) return null;

  const [a, b, c] = args;
  const step = (c || '1').trim();
  const negative = /^-/.test(step);

  return {
    name: match[1],
    from: args.length === 1 ? '0' : a.trim(),
    to: args.length === 1 ? a.trim() : b.trim(),
    step,
    compare: negative ? '>' : '<',
  };
}

/** 括弧の深さを見ながらカンマで分ける */
function splitTopLevel(text) {
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
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.filter(part => part.trim());
}

/** try / except / finally */
function renderTry(b, clauses, incoming, ctx) {
  const tryClause = clauses[0];
  const decision = b.addNode('decision', 'エラーが起きた？', tryClause.line);
  b.connect(incoming, decision);

  let outs = renderSequence(b, tryClause.body, [{ id: decision, label: 'いいえ' }], ctx);

  const handlers = clauses.filter(c => c.keyword === 'except');
  if (handlers.length) {
    for (const handler of handlers) {
      const label = handler.head ? `はい（${handler.head}）` : 'はい';
      outs = [...outs, ...renderSequence(b, handler.body, [{ id: decision, label }], ctx)];
    }
  } else {
    outs = [...outs, { id: decision, label: 'はい' }];
  }

  const finallyClause = clauses.find(c => c.keyword === 'finally');
  if (finallyClause) return renderSequence(b, finallyClause.body, merge(b, outs), ctx);

  return merge(b, outs);
}

/**
 * 関数定義を1つのサブグラフとして描画する
 * @returns {object[]} 内側で見つかった定義
 */
function renderDefinition(b, stmt, index) {
  const clause = stmt.clauses[0];
  const isClass = stmt.keyword === 'class';
  const title = isClass
    ? `クラス ${clause.head}`
    : (useJapanese ? humanizeDefHead(clause.head) : `関数 ${clause.head}`);

  b.lines.push(`  subgraph sub${index}["${escapeLabel(title)}"]`);
  b.lines.push('  direction TB');

  const start = b.addNode('terminator', `${title} 開始`, clause.line);
  const ctx = { definitions: [], returns: [], loop: null };
  const outs = renderSequence(b, clause.body, [{ id: start }], ctx);

  const end = b.addNode('terminator', `${title} 終了`);
  b.connect([...outs, ...ctx.returns], end);

  b.lines.push('  end');
  return ctx.definitions;
}

/**
 * Python ソースから Mermaid のフローチャート定義を作る
 * @param {string} source Python のソースコード
 * @param {object} [options]
 * @param {boolean} [options.japanese] やさしい日本語に言いかえるか（既定 true）
 * @returns {{definition: string|null, message: string|null, lineByNode: object}}
 */
export function pythonToMermaid(source, { japanese = true } = {}) {
  useJapanese = japanese;

  if (!source || !source.trim()) {
    return {
      definition: null,
      message: 'コードを書くと\nフローチャートが表示されます',
      lineByNode: {},
    };
  }

  const stmts = parsePython(source);
  if (!stmts.length) {
    return { definition: null, message: '処理が見つかりませんでした', lineByNode: {} };
  }

  const b = new FlowBuilder();
  const ctx = { definitions: [], returns: [], loop: null };

  const start = b.addNode('terminator', '開始');
  const outs = renderSequence(b, stmts, [{ id: start }], ctx);
  const end = b.addNode('terminator', '終了');
  b.connect([...outs, ...ctx.returns], end);

  // 関数・クラス定義をサブグラフとして追加（入れ子の定義も展開する）
  const queue = [...ctx.definitions];
  let index = 0;
  while (queue.length && !b.truncated) {
    queue.push(...renderDefinition(b, queue.shift(), index++));
  }

  // 見た目の調整。教科書（JIS）のフローチャートに合わせる。
  // 記号の意味は「形」で表し、面は塗らない。
  //   端子（開始・終了）＝角丸の長方形／処理＝長方形／判断＝ひし形／入出力＝平行四辺形
  // 端子を朱で塗ると、見なれた図と別物になるうえ、朱の面が増えてしまう。
  b.lines.push('  classDef terminator fill:#FCFCFA,stroke:#16181A,stroke-width:2px,color:#16181A;');
  b.lines.push('  classDef decision fill:#FCFCFA,stroke:#16181A,stroke-width:2px,color:#16181A;');
  b.lines.push('  classDef io fill:#F4F5F2,stroke:#4A4E52,color:#16181A;');
  b.lines.push('  classDef junction fill:#D8DAD3,stroke:#D8DAD3,color:#D8DAD3,width:10px;');
  for (const [shape, ids] of Object.entries(b.byShape)) {
    if (ids.length) b.lines.push(`  class ${ids.join(',')} ${shape};`);
  }

  return {
    definition: b.toString(),
    message: b.truncated ? 'コードが大きいため、フローチャートを途中まで表示しています' : null,
    lineByNode: b.lineByNode,
  };
}
