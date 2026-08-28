// module/pyformat.js
// AI を使わない Python コードの整形。
//
//   autoIndent(code)  … 字下げだけをそろえる（タブ混在や崩れた字下げを直す）
//   formatCode(code)  … 字下げに加えて、記号まわりの空白や空行も整える
//
// 大事にしていること:
//   ・文字列（"""..."""）やコメントの中身は、ぜったいに書き換えない
//   ・括弧で複数行にまたがる文は、書いた人のそろえ方をこわさない
//   ・字下げがまったく無いコードを貼っても、正しい形に組み直せる

const INDENT = '    ';

/* ============================================================
 * 1. 行を「コード部分」と「文字列・コメント部分」に分ける
 * ========================================================== */

/**
 * 1行を [{text, code}] の並びに分ける。code が false の部分は書き換えない。
 * @param {string} line
 * @returns {{text: string, code: boolean}[]}
 */
function splitLine(line) {
  const parts = [];
  let buffer = '';
  let quote = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (quote) {
      buffer += ch;
      if (ch === '\\') {
        buffer += line[i + 1] ?? '';
        i++;
      } else if (ch === quote) {
        parts.push({ text: buffer, code: false });
        buffer = '';
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (buffer) parts.push({ text: buffer, code: true });
      buffer = ch;
      quote = ch;
      continue;
    }

    if (ch === '#') {
      if (buffer) parts.push({ text: buffer, code: true });
      parts.push({ text: line.slice(i), code: false });
      return parts;
    }

    buffer += ch;
  }

  if (buffer) parts.push({ text: buffer, code: quote === null });
  return parts;
}

/** コード部分だけを取り出してつなげる（構造の判定に使う） */
function codeOnly(line) {
  return splitLine(line).filter(part => part.code).map(part => part.text).join('');
}

/** 行頭の空白の幅（タブはスペース4つ換算） */
function indentWidth(line) {
  const match = line.match(/^[ \t]*/);
  return match ? match[0].replace(/\t/g, '    ').length : 0;
}

/**
 * 1行を走査して、行末時点の括弧の深さと三重引用符の状態を返す
 * @param {string} line
 * @param {number} depth 行頭時点の括弧の深さ
 * @param {string|null} triple 行頭時点で開いている三重引用符
 * @returns {{depth: number, triple: string|null}}
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
 * 2. ソースを「1文ずつ」に分ける
 * ========================================================== */

/**
 * @typedef {object} Statement
 * @property {boolean} blank    空行かどうか
 * @property {number}  indent   1行目の字下げ幅
 * @property {string[]} lines   この文をつくる原文の行
 * @property {boolean[]} inString 各行が「三重引用符の途中から始まる」かどうか
 * @property {string}  code     コード部分だけをつないだもの（文字列やコメントは除く）
 */

/**
 * ソースを1文ずつに分ける。
 * 括弧・三重引用符・行末の \\ でまたがる行は、1つの文にまとめる。
 * @param {string} source
 * @returns {Statement[]}
 */
function splitStatements(source) {
  const rawLines = source.split('\n');
  const statements = [];

  let current = null;
  let depth = 0;
  let triple = null;

  for (const line of rawLines) {
    const startedInString = triple !== null;

    if (!current) {
      if (!line.trim()) {
        statements.push({ blank: true, lines: [line], inString: [false], indent: 0, code: '' });
        continue;
      }
      current = { blank: false, indent: indentWidth(line), lines: [line], inString: [startedInString] };
    } else {
      current.lines.push(line);
      current.inString.push(startedInString);
    }

    const scan = scanLine(line, depth, triple);
    depth = scan.depth;
    triple = scan.triple;

    const continues = depth > 0 || triple !== null || line.trimEnd().endsWith('\\');
    if (!continues) {
      current.code = statementCode(current);
      statements.push(current);
      current = null;
    }
  }

  if (current) {
    current.code = statementCode(current);
    statements.push(current);
  }
  return statements;
}

/** 文のコード部分だけをつなぐ（`:` で終わるかの判定などに使う） */
function statementCode(statement) {
  return statement.lines
    .map((line, index) => (statement.inString[index] ? '' : codeOnly(line)))
    .join(' ')
    .replace(/\\\s*$/, '')
    .trim();
}

/* ============================================================
 * 3. 字下げをそろえる
 * ========================================================== */

const DEDENT_RE = /^(else|elif|except|finally|case)\b/;

/** else / except などが、どの見出しとペアになるか */
const PAIRS = {
  elif: ['if', 'elif'],
  else: ['if', 'elif', 'for', 'while', 'try', 'except'],
  except: ['try', 'except'],
  finally: ['try', 'except', 'else'],
  case: ['match', 'case'],
};

/**
 * 字下げをそろえる。
 * 「: で終わる行の次」は必ず1段深くし、else / elif などは対応する見出しにそろえる。
 * 複数行にまたがる文の2行目以降は、1行目と同じだけ横にずらすので、
 * 書いた人のそろえ方（閉じ括弧の位置など）はそのまま残る。
 * @param {string} code
 * @returns {string}
 */
export function autoIndent(code) {
  return layout(code).map(row => row.text).join('\n');
}

/**
 * 字下げをそろえた結果を、行ごとの情報つきで返す
 * @param {string} code
 * @returns {{text: string, inString: boolean, blank: boolean, level: number}[]}
 */
function layout(code) {
  const statements = splitStatements(code);
  const result = [];

  const stack = [0];        // もとの字下げ幅の並び。長さ - 1 が深さ。
  const openers = [];       // 開いたままのブロックの見出し {level, keyword}
  let expectDeeper = false; // 直前の文が : で終わっていたか

  /** 深さを指定の値にそろえる */
  const setLevel = (level) => {
    while (stack.length - 1 > level) stack.pop();
    while (stack.length - 1 < level) stack.push(stack[stack.length - 1] + 1);
  };

  for (const statement of statements) {
    if (statement.blank) {
      result.push({ text: '', inString: false, blank: true, level: 0 });
      continue;
    }

    const text = statement.code;
    const width = statement.indent;

    if (expectDeeper) {
      // Python では「: で終わる行の次」だけが1段深くなれる
      stack.push(Math.max(width, stack[stack.length - 1] + 1));
    } else {
      // それ以外で字下げが深くなっていても、それは書き間違いなので深くしない
      while (stack.length > 1 && width < stack[stack.length - 1]) stack.pop();
    }

    let level = stack.length - 1;
    const keyword = text.match(/^(\w+)/)?.[1] ?? '';

    if (DEDENT_RE.test(text)) {
      // 対応する見出しと同じ深さにそろえる。
      // Python と同じで「同じ列にある見出し」と組にするのが正しいので、
      // まず、もとの字下げがぴったり同じ見出しを内側から探す。
      //   （for ... else の else は、内側の if ではなく for と組になる）
      // 見つからなければ（字下げが無いコードを貼った場合など）いちばん内側の見出しに合わせる。
      const pairs = PAIRS[keyword] || [];
      const match = findOpener(openers, pairs, width) ?? findOpener(openers, pairs, null);
      if (match !== null) {
        level = openers[match].level;
        openers.length = match;
        setLevel(level);
      }
    } else {
      // この行より深いブロックは閉じたとみなす
      while (openers.length && openers[openers.length - 1].level >= level) openers.pop();
    }

    // 1行目を新しい深さに置き、2行目以降は同じだけ横にずらす
    const shift = level * INDENT.length - statement.indent;
    statement.lines.forEach((line, index) => {
      if (index === 0) {
        result.push({ text: INDENT.repeat(level) + line.trim(), inString: false, blank: false, level });
        return;
      }
      if (statement.inString[index]) {
        // 文字列の中身は、1文字も変えない
        result.push({ text: line, inString: true, blank: false, level });
        return;
      }
      const body = line.trim();
      let text;
      if (/^[)\]}]/.test(body)) {
        // 閉じ括弧だけの行は、文の先頭とそろえる
        text = INDENT.repeat(level) + body;
      } else if (indentWidth(line) > statement.indent) {
        // もともと字下げしてあるなら、書いた人のそろえ方を保つ
        text = shiftLine(line, shift);
      } else {
        // 字下げが無い続きの行は、1段深くして読みやすくする
        text = INDENT.repeat(level + 1) + body;
      }
      result.push({ text, inString: false, blank: false, level });
    });

    expectDeeper = text.endsWith(':');
    if (expectDeeper) openers.push({ level, keyword, width });
  }

  return result;
}

/**
 * else / except などと対になる見出しを、内側から探す
 * @param {{level: number, keyword: string, width: number}[]} openers
 * @param {string[]} pairs 対になれる見出しの種類
 * @param {number|null} width この字下げ幅と同じものだけを見る（null なら幅を問わない）
 * @returns {number|null} 見つかった位置
 */
function findOpener(openers, pairs, width) {
  for (let i = openers.length - 1; i >= 0; i--) {
    const opener = openers[i];
    if (width !== null && opener.width !== width) continue;
    if (pairs.includes(opener.keyword)) return i;
  }
  return null;
}

/** 行の字下げだけを、指定の分だけ横にずらす */
function shiftLine(line, shift) {
  if (!line.trim()) return '';
  const width = Math.max(0, indentWidth(line) + shift);
  return ' '.repeat(width) + line.trim();
}

/* ============================================================
 * 4. 記号まわりの空白をそろえる
 * ========================================================== */

/** 演算子（長いものから順に見る） */
const OPERATORS = [
  '//=', '**=', '>>=', '<<=',
  '==', '!=', '<=', '>=', '//', '**', '+=', '-=', '*=', '/=', '%=', '->',
  '+', '-', '*', '/', '%', '<', '>', '=',
];

/** 単項の + / - とみなす直前の文字 */
const UNARY_BEFORE = new Set(['', '(', '[', '{', ',', ':', '=', '+', '-', '*', '/', '%', '<', '>', '!']);

/**
 * コード部分の空白を整える
 * @param {string} text 文字列やコメントを含まないコード片
 * @param {number} startDepth 行頭時点の括弧の深さ
 * @returns {{text: string, depth: number}}
 */
function spaceOperators(text, startDepth) {
  let out = '';
  let depth = startDepth;

  const lastChar = () => {
    const trimmed = out.trimEnd();
    return trimmed ? trimmed[trimmed.length - 1] : '';
  };

  for (let i = 0; i < text.length;) {
    const ch = text[i];

    if (ch === ' ' || ch === '\t') {
      if (out && !out.endsWith(' ')) out += ' ';
      i++;
      continue;
    }

    if ('([{'.includes(ch)) { depth++; out += ch; i++; continue; }
    if (')]}'.includes(ch)) { depth--; out = out.trimEnd() + ch; i++; continue; }
    if (ch === ',') { out = out.trimEnd() + ', '; i++; continue; }
    // スライスや辞書、型注釈のコロンはそのまま
    if (ch === ':') { out = out.trimEnd() + ':'; i++; continue; }

    const op = OPERATORS.find(candidate => text.startsWith(candidate, i));
    if (op) {
      // 関数呼び出しの中の「=」（キーワード引数）は空白を入れない
      if (op === '=' && depth > 0) { out = out.trimEnd() + '='; i += 1; continue; }

      // 単項の + / - と「*args」「**kwargs」は、前後に空白を入れない
      if ('+-*/'.includes(op[0]) && op.length <= 2 && UNARY_BEFORE.has(lastChar())) {
        out += op;
        i += op.length;
        continue;
      }

      out = out.trimEnd() + ' ' + op + ' ';
      i += op.length;
      continue;
    }

    out += ch;
    i++;
  }

  return { text: out, depth };
}

/**
 * コードを整形する（字下げ＋記号まわりの空白＋空行）。
 * 文字列やコメントの中身は変えない。
 * @param {string} code
 * @returns {string}
 */
export function formatCode(code) {
  // まず字下げをそろえ、そのうえで「文字列の途中の行」を避けて空白を整える
  const rows = layout(code);
  const source = rows.map(row => row.text).join('\n');
  const statements = splitStatements(source);

  const formatted = [];

  for (const statement of statements) {
    if (statement.blank) {
      formatted.push({ text: '', inString: false });
      continue;
    }

    let depth = 0;
    statement.lines.forEach((line, index) => {
      if (statement.inString[index]) {
        formatted.push({ text: line, inString: true });
        return;
      }

      const leading = line.match(/^ */)[0];
      let out = '';

      for (const part of splitLine(line.slice(leading.length))) {
        if (part.code) {
          const spaced = spaceOperators(part.text, depth);
          out += spaced.text;
          depth = spaced.depth;
        } else if (part.text.startsWith('#')) {
          // 行末コメントは前に空白2つ、「#」の後ろに空白1つ
          const body = part.text.replace(/^#\s*/, '');
          out = out.trimEnd();
          out += (out ? '  ' : '') + (body ? `# ${body}` : '#');
        } else {
          out += part.text;
        }
      }

      formatted.push({ text: (leading + out.trim()).trimEnd(), inString: false });
    });
  }

  return tidyBlankLines(formatted).join('\n');
}

/**
 * 空行を整える。
 * 続けて3行以上の空行は2行までにし、トップレベルの def / class の前に空行を入れる。
 * 文字列の途中の行はさわらない。
 * @param {{text: string, inString: boolean}[]} rows
 * @returns {string[]}
 */
function tidyBlankLines(rows) {
  const result = [];

  for (const row of rows) {
    if (row.inString) { result.push(row.text); continue; }

    if (!row.text.trim()) {
      if (countTrailingBlanks(result) < 2) result.push('');
      continue;
    }

    // トップレベルの def / class の前は1行あける
    if (/^(def|class)\b/.test(row.text) && result.length && result[result.length - 1].trim()) {
      result.push('');
    }

    result.push(row.text);
  }

  while (result.length && !result[result.length - 1].trim()) result.pop();
  return [...result, ''];
}

/** 末尾にいくつ空行が続いているか */
function countTrailingBlanks(lines) {
  let count = 0;
  for (let i = lines.length - 1; i >= 0 && !lines[i].trim(); i--) count++;
  return count;
}
