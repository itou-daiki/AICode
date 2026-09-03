// module/ktph.js
// Python → 共通テスト用プログラム表記（大学入試センターが公表している疑似言語）
//
// 学習者は Python で書き、このモジュールが試験と同じ見た目に言いかえる。
// 実行はあくまで Python のまま行うので、ここは「見せるための変換」だけを受け持つ。
//
// 守っていること
//   ・1 行は 1 行のまま（ステップ実行の光る行やエラーの行番号を、表記側でも同じ行にするため）
//   ・文字列の中身は変えない（"len(" や "%" が文字列の中にあっても触らない）
//   ・表記に無い書き方（def / return / for x in リスト など）はそのまま残し、warnings で知らせる
//
// 表記の根拠は大学入試センター「共通テスト用プログラム表記の例示」。
//   表示する(a, "は", b)   ← print(a, "は", b)
//   もし x < 3 ならば:       ← if x < 3:
//   x を 0 から 9 まで 1 ずつ増やしながら繰り返す:  ← for x in range(0, 10):  （終了値を含む）
//   n < 10 の間繰り返す:    ← while n < 10:
//   要素数(Data) 整数(x) 乱数()  ÷（整数商）  Data[2,4]（2 次元）  配列名は先頭大文字
//   ブロックは │ と └ で範囲を表し、└ は制御文の終わり

/** 表記のハイライト用（ktph-mode.js が使う） */
export const KTPH_KEYWORDS = {
  control: ['もし', 'ならば', 'そうでなくもし', 'そうでなければ', 'の間繰り返す', 'ずつ増やしながら繰り返す',
    'ずつ減らしながら繰り返す', 'を', 'から', 'まで', 'and', 'or', 'not'],
  builtin: ['表示する', '要素数', '整数', '実数', '文字列', '乱数', '【外部からの入力】'],
};

/** 表記に無い書き方の案内 */
const NOT_IN_KTPH = '共通テスト用の表記には無い書き方です。試験では問題文の中で説明される形になります。';

/**
 * Python のコードを共通テスト用プログラム表記に言いかえる
 * @param {string} python
 * @param {object} [options]
 * @param {boolean} [options.markers] ブロックの範囲を │ └ で示す（既定 true）
 * @returns {{ text: string, warnings: {line: number, message: string}[] }}
 */
export function toKtph(python, options = {}) {
  const { markers = true } = options;
  const lines = String(python ?? '').replace(/\r\n?/g, '\n').split('\n');
  const warnings = [];

  const arrays = collectArrayNames(lines);
  const parsed = lines.map(line => parseLine(line));
  const levels = computeLevels(parsed);

  const out = parsed.map((part, index) => {
    if (part.blank) return '';

    const { converted, warning } = convertBody(part, arrays);
    if (warning) warnings.push({ line: index + 1, message: warning });

    const prefix = markers ? markerPrefix(parsed, levels, index) : '    '.repeat(levels[index]);
    const comment = part.comment ? (converted ? ' ' + part.comment : part.comment) : '';
    return prefix + converted + comment;
  });

  return { text: out.join('\n'), warnings };
}

/* ============================================================
 * 1 行の分解（字下げ・本文・コメント・文字列の退避）
 * ========================================================== */

const MASK_OPEN = '';
const MASK_CLOSE = '';

/**
 * 1 行を { indent, body, comment, strings, blank } に分ける。
 * body の中の文字列は n に置きかえてある。
 */
function parseLine(line) {
  const match = /^(\s*)(.*)$/s.exec(line);
  const leading = match[1];
  const rest = match[2];

  const indent = [...leading].reduce((n, ch) => n + (ch === '\t' ? 4 : ch === '　' ? 2 : 1), 0);
  const strings = [];
  let body = '';
  let comment = '';

  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '#') { comment = rest.slice(i).trim(); break; }
    if (ch === '"' || ch === "'") {
      const end = findStringEnd(rest, i);
      strings.push(rest.slice(i, end + 1));
      body += `${MASK_OPEN}${strings.length - 1}${MASK_CLOSE}`;
      i = end;
      continue;
    }
    body += ch;
  }

  body = body.trim();
  return { indent, body, comment, strings, blank: !body && !comment };
}

/** 文字列の終わりの位置（三重引用符とエスケープに対応） */
function findStringEnd(text, start) {
  const quote = text[start];
  const triple = text.slice(start, start + 3) === quote.repeat(3);
  const closer = triple ? quote.repeat(3) : quote;
  let i = start + closer.length;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text.startsWith(closer, i)) return i + closer.length - 1;
    i++;
  }
  return text.length - 1;
}

/** 退避した文字列を戻す。' で囲んだものは表記にならって " にする */
function unmask(body, strings) {
  return body.replace(new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, 'g'), (_, n) => {
    const raw = strings[Number(n)];
    if (raw.startsWith("'") && !raw.startsWith("'''") && !raw.slice(1, -1).includes('"')) {
      return '"' + raw.slice(1, -1) + '"';
    }
    return raw;
  });
}

/* ============================================================
 * 字下げの段と、│ └ の付けかた
 * ========================================================== */

/** 各行が何段目にあるか（2 スペースでも 4 スペースでも段として数える） */
function computeLevels(parsed) {
  const stack = [0];
  return parsed.map(part => {
    if (part.blank) return 0;
    while (stack.length > 1 && part.indent < stack[stack.length - 1]) stack.pop();
    if (part.indent > stack[stack.length - 1]) stack.push(part.indent);
    return stack.length - 1;
  });
}

/**
 * 公式資料と同じ付けかた:
 *   │ … その段の制御文がまだ続く
 *   └ … その段の制御文がここで終わる（次の行が elif / else なら、まだ続いているので │）
 */
function markerPrefix(parsed, levels, index) {
  const level = levels[index];
  if (level === 0) return '';

  let next = index + 1;
  while (next < parsed.length && parsed[next].blank) next++;
  const nextLevel = next < parsed.length ? levels[next] : -1;
  const nextIsBranch = next < parsed.length && /^(elif\b|else\s*:)/.test(parsed[next].body);

  let prefix = '';
  for (let depth = 1; depth <= level; depth++) {
    const closes = nextLevel < depth && !(nextIsBranch && nextLevel === depth - 1);
    prefix += closes ? '└ ' : '│ ';
  }
  return prefix;
}

/* ============================================================
 * 配列名（リストを入れた名前は先頭を大文字にする）
 * ========================================================== */

const NOT_ARRAY_NAMES = new Set(['range', 'print', 'input', 'len', 'int', 'str', 'float', 'list', 'dict', 'set']);

/** プログラム全体を見て、配列として使われている名前を集める */
function collectArrayNames(lines) {
  const names = new Set();
  for (const line of lines) {
    const { body } = parseLine(line);
    const assigned = /^([A-Za-z_]\w*)\s*=\s*(\[|list\()/.exec(body);
    if (assigned) names.add(assigned[1]);
    for (const m of body.matchAll(/\b([A-Za-z_]\w*)\s*\[/g)) {
      if (!NOT_ARRAY_NAMES.has(m[1])) names.add(m[1]);
    }
  }
  return [...names].filter(name => /^[a-z]/.test(name));
}

function capitalizeArrays(body, arrays) {
  let result = body;
  for (const name of arrays) {
    result = result.replace(new RegExp(`\\b${name}\\b`, 'g'), name[0].toUpperCase() + name.slice(1));
  }
  return result;
}

/* ============================================================
 * 本文の言いかえ
 * ========================================================== */

/**
 * @returns {{ converted: string, warning: string|null }}
 */
function convertBody(part, arrays) {
  let body = capitalizeArrays(part.body, arrays);
  let warning = null;

  if (!body) return { converted: '', warning };

  // 表記に無い書き方は、そのまま残して知らせる
  if (/^(def|return|import|from|class|try|except|finally|with|lambda|global|nonlocal|pass|break|continue)\b/.test(body)
      || /^for\s+.+\s+in\s+(?!range\()/.test(body)) {
    warning = NOT_IN_KTPH;
    return { converted: unmask(replaceExpressions(body), part.strings), warning };
  }

  // 入力: int(input("…")) / input() → 【外部からの入力】
  const hadPrompt = /\binput\(\s*\d+\s*\)/.test(body);
  body = body
    .replace(/\b(?:int|float|str)\(\s*input\([^()]*\)\s*\)/g, '【外部からの入力】')
    .replace(/\binput\([^()]*\)/g, '【外部からの入力】');
  if (hadPrompt) warning = 'input() の中の文字は、表記では 表示する() で別の行に書きます。';

  body = replaceExpressions(body);

  // 制御構文
  let m;
  if ((m = /^if\s+(.+?)\s*:$/.exec(body))) body = `もし ${m[1]} ならば:`;
  else if ((m = /^elif\s+(.+?)\s*:$/.exec(body))) body = `そうでなくもし ${m[1]} ならば:`;
  else if (/^else\s*:$/.test(body)) body = 'そうでなければ:';
  else if ((m = /^while\s+(.+?)\s*:$/.exec(body))) body = `${m[1]} の間繰り返す:`;
  else if ((m = /^for\s+([A-Za-z_]\w*)\s+in\s+range\((.*)\)\s*:$/.exec(body))) body = convertRange(m[1], m[2]);
  else body = body.replace(/\s*;\s*/g, ' , ');

  return { converted: unmask(body, part.strings), warning };
}

/** 関数名と演算子の言いかえ（文字列は退避済みなので安全） */
function replaceExpressions(body) {
  let result = body
    .replace(/\brandom\.random\(\)/g, '乱数()')
    .replace(/\brandom\(\)/g, '乱数()')
    .replace(/\blen\(/g, '要素数(')
    .replace(/\bint\(/g, '整数(')
    .replace(/\bfloat\(/g, '実数(')
    .replace(/\bstr\(/g, '文字列(')
    .replace(/\bprint\(/g, '表示する(')
    .replace(/\/\//g, '÷');

  // Data[i][j] → Data[i,j]
  let previous;
  do {
    previous = result;
    result = result.replace(/(\w\[[^\[\]]*)\]\[/g, '$1,');
  } while (result !== previous);

  return result;
}

/** for v in range(...) → v を A から B まで C ずつ増やしながら繰り返す: */
function convertRange(variable, argText) {
  const args = splitTopLevel(argText).map(s => s.trim());
  let start = '0';
  let end = args[0];
  let step = '1';
  if (args.length >= 2) { start = args[0]; end = args[1]; }
  if (args.length >= 3) step = args[2];

  const stepNumber = /^-?\d+$/.test(step) ? Number(step) : null;
  const decreasing = stepNumber !== null ? stepNumber < 0 : /^-/.test(step);
  const stepText = decreasing ? step.replace(/^-\s*/, '') : step;
  const last = inclusiveEnd(end, decreasing);
  const verb = decreasing ? '減らしながら' : '増やしながら';

  return `${variable} を ${start} から ${last} まで ${stepText} ずつ${verb}繰り返す:`;
}

/** range の終了値（含まない）を、表記の終了値（含む）に直す */
function inclusiveEnd(expr, decreasing) {
  if (/^-?\d+$/.test(expr)) return String(Number(expr) + (decreasing ? 1 : -1));
  const plusOne = /^(.+?)\s*\+\s*1$/.exec(expr);
  if (!decreasing && plusOne) return plusOne[1];
  const minusOne = /^(.+?)\s*-\s*1$/.exec(expr);
  if (decreasing && minusOne) return minusOne[1];
  return decreasing ? `${expr}+1` : `${expr}-1`;
}

/** かっこの外側にあるカンマで分ける */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}
