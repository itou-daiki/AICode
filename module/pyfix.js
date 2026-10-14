// module/pyfix.js
// 生徒がつまずく「書き方」を見つけて、押せば直る形にする。
//
// 授業のスライドは JavaScript（p5.js）で書かれているので、
// 生徒はその癖のまま Python に打ち込む。また日本語入力のまま
// 打つと全角の（ ）や， や数字が混ざる。どちらも Python は
// 「invalid syntax」としか言わないので、ここで見分けて言葉にする。
//
// 直し方は「黙って書きかえない」。見つけたら理由を書き、
// 押されたときだけ学習者のコードに入れる（global と同じ流儀）。

/* ============================================================
 * 1. 文字列の中と外を分ける
 * ========================================================== */

/**
 * 1 行を「文字列の中」と「外」に分けて、外だけを置きかえる
 * @param {string} line
 * @param {(outside: string) => string} transform 外側にかける置きかえ
 * @returns {string}
 */
function outsideStrings(line, transform) {
  let out = '';
  let buffer = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < line.length) { out += line[++i]; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += transform(buffer);
      buffer = '';
      out += ch;
      quote = ch;
      continue;
    }
    if (ch === '#') {
      out += transform(buffer) + line.slice(i);
      return out;
    }
    buffer += ch;
  }
  return out + transform(buffer);
}

/* ============================================================
 * 2. 全角 → 半角
 * ========================================================== */

/**
 * 全角 → 半角にする字（1 字を 1 字に置きかえるので、行の長さは変わらない）
 *
 * ・全角の英数字と記号（！〜～）は、そのまま半角へ
 * ・日本語入力で打ちやすい「、。「」」は、Python の , . [ ] へ
 * ・長音の「ー」は、カタカナの後ろ（データー など名前の一部）では残し、それ以外は - にする
 */
const EXTRA_HALF = { '　': ' ', '、': ',', '。': '.', '「': '[', '」': ']' };
const JAPANESE = /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF]/;

function halfChar(ch, prev) {
  const code = ch.charCodeAt(0);
  if (code >= 0xFF01 && code <= 0xFF5E) return String.fromCharCode(code - 0xFEE0);
  if (EXTRA_HALF[ch]) return EXTRA_HALF[ch];
  if (ch === 'ー' && !(prev && JAPANESE.test(prev))) return '-';
  return ch;
}

const DOUBLE_QUOTES = '"“”＂';
const SINGLE_QUOTES = "'‘’＇";

/**
 * 1 行の字ごとに、コード・文字列・コメント・引用符のどれかを決める
 *
 * 全角の引用符（“ ” ‘ ’ ＂ ＇）も文字列の区切りとみなす。日本語入力では、開きは半角に直っても
 * 閉じを全角で打つことが多いので、半角の " で始まった文字列も ” で閉じられる。
 * ただし文字列の中に “ があれば、それと対になる ” は文字列の中身として残す（"彼は“はい”と" など）。
 * ＃ もコメントの始まりとみなす。
 * @param {string} line
 * @returns {('code'|'string'|'comment'|'quote')[]}
 */
export function scanLine(line) {
  const kinds = new Array(line.length);
  let family = null;   // 文字列の中なら、その引用符のなかま
  let nested = 0;      // 文字列の中で開いた “ ‘ の数
  let openedBy = null; // 半角の引用符で始まった文字列なら、その引用符
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (family) {
      if (ch === '\\') { kinds[i] = 'string'; if (i + 1 < line.length) kinds[++i] = 'string'; continue; }
      if (family.includes(ch)) {
        const ascii = ch === '"' || ch === "'";
        // 半角の " で始まった文字列は、半角の " で閉じるのが本来の形。
        // 全角の ” で閉じたとみなすのは、この先にもう半角の " が無い（閉じわすれになる）ときだけ。
        // こうしないと 'it’s ok' のような正しい文字列まで壊してしまう
        if (!ascii && openedBy && line.indexOf(openedBy, i + 1) >= 0) { kinds[i] = 'string'; continue; }
        const opener = ch === '“' || ch === '‘';
        const closer = ch === '”' || ch === '’';
        if (!ascii && opener) { nested++; kinds[i] = 'string'; continue; }
        if (!ascii && closer && nested > 0) { nested--; kinds[i] = 'string'; continue; }
        kinds[i] = 'quote';
        family = null;
        continue;
      }
      kinds[i] = 'string';
      continue;
    }
    if (DOUBLE_QUOTES.includes(ch) || SINGLE_QUOTES.includes(ch)) {
      family = DOUBLE_QUOTES.includes(ch) ? DOUBLE_QUOTES : SINGLE_QUOTES;
      openedBy = ch === '"' || ch === "'" ? ch : null;
      nested = 0;
      kinds[i] = 'quote';
      continue;
    }
    if (ch === '#' || ch === '＃') {
      for (let k = i; k < line.length; k++) kinds[k] = 'comment';
      break;
    }
    kinds[i] = 'code';
  }
  return kinds;
}

/** 日本語の文章の中で使う句読点・かぎかっこ（打っている途中は、文章かもしれないので直さない） */
const PROSE_MARKS = '、。「」';

/**
 * 全角を半角にそろえた行を返す。文字列（' や " の中）とコメント（# の後ろ）は残す。
 *
 * 先に引用符と＃で文字列・コメントの範囲を決めてから、残りを半角にする。
 * こうしないと print（“こんにちは、世界”） の「、」まで , に変わってしまう。
 * @param {string} line
 * @param {object} [options]
 * @param {boolean} [options.typing] 打っている途中か。日本語のとなりの「、。「」」は直さない
 *   （引用符を後から打つつもりの文章を , . [ ] に変えてしまわないように）
 * @returns {string}
 */
export function toHalfWidth(line, { typing = false } = {}) {
  const kinds = scanLine(line);
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const kind = kinds[i];
    if (kind === 'quote') {
      out += DOUBLE_QUOTES.includes(ch) ? '"' : "'";
    } else if (kind === 'comment') {
      out += ch === '＃' && kinds[i - 1] !== 'comment' ? '#' : ch;
    } else if (kind === 'string') {
      out += ch;
    } else if (typing && PROSE_MARKS.includes(ch)
      && (JAPANESE.test(line[i - 1] || '') || JAPANESE.test(line[i + 1] || ''))) {
      out += ch;
    } else {
      out += halfChar(ch, line[i - 1]);
    }
  }
  return out;
}

/**
 * 文字列とコメントの外にある全角の字を探す
 * @param {string} line
 * @returns {{index: number, char: string, half: string}[]} 何文字目（0 から）に、何があり、何に直すか
 */
export function findFullWidth(line) {
  const fixed = toHalfWidth(line);
  const found = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== fixed[i]) found.push({ index: i, char: line[i], half: fixed[i] });
  }
  return found;
}

/** 行に全角の記号・数字・英字が混ざっているか（文字列とコメントの外で） */
export function hasFullWidth(line) {
  return findFullWidth(line).length > 0;
}

/**
 * 全角の字を【 】で囲んで見せる（エラーの説明で、どこが全角かを指す）
 * @param {string} line
 * @returns {{shown: string, list: string}|null} 囲んだ行と、「（」→「(」の一覧
 */
export function pointOutFullWidth(line) {
  const found = findFullWidth(line);
  if (!found.length) return null;
  const at = new Set(found.map(f => f.index));
  let shown = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] === '　' ? '□' : line[i];
    shown += at.has(i) ? `【${ch}】` : ch;
  }
  const seen = new Map();
  for (const f of found) if (!seen.has(f.char)) seen.set(f.char, f.half);
  // 「 と 」は、かぎかっこで囲むと読みにくいので二重かぎで囲む
  const quote = (c) => (c === '「' || c === '」' ? `『${c}』` : `「${c}」`);
  const list = [...seen].map(([full, half]) => (full === '　'
    ? '全角の空白「□」→ 半角の空白'
    : `${quote(full)}→「${half}」`)).join('、');
  return { shown, list };
}

/* ============================================================
 * 3. JavaScript の書き方 → Python
 * ========================================================== */

/** JavaScript らしい印が行にあるか */
export function looksLikeJavaScript(line) {
  const t = line.trim();
  return /^(function|let|var|const)\s/.test(t)
    || /;\s*$/.test(t)
    || /^\/\//.test(t)
    || /\+\+|--/.test(t)
    || /^\}/.test(t) || /\{\s*$/.test(t)
    || /^else\s+if\b/.test(t)
    || /\b(true|false|null)\b/.test(outsideStrings(t, s => s))
    || /&&|\|\||===|!==/.test(outsideStrings(t, s => s))
    || /\bMath\.|\bconsole\.log\(/.test(t);
}

/**
 * 1 行の中の JavaScript の書き方を Python に直す（字下げと { } はここでは扱わない）
 * @param {string} line
 * @returns {string}
 */
function jsLineToPython(line) {
  const indent = (line.match(/^\s*/) || [''])[0];
  let t = line.trim();

  // コメント
  if (t.startsWith('//')) return `${indent}# ${t.slice(2).trim()}`;

  t = outsideStrings(t, (s) => s
    .replace(/;\s*$/, '')
    .replace(/^(let|var|const)\s+/, '')
    .replace(/\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/, 'def $1($2):')
    .replace(/^else\s+if\b/, 'elif')
    .replace(/^\}\s*else\s*\{?$/, 'else:')
    .replace(/^\}\s*elif\b/, 'elif')
    .replace(/^(if|elif|while)\s*\((.*)\)\s*\{?\s*$/, '$1 $2:')
    .replace(/^else\s*\{?\s*$/, 'else:')
    .replace(/(\w+)\+\+/g, '$1 += 1')
    .replace(/(\w+)--/g, '$1 -= 1')
    .replace(/===/g, '==').replace(/!==/g, '!=')
    .replace(/&&/g, ' and ').replace(/\|\|/g, ' or ')
    .replace(/!\s*(?=[\w(])/g, 'not ')
    .replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')
    .replace(/\bconsole\.log\(/g, 'print(')
    .replace(/\bMath\.random\(\)/g, 'random()')
    .replace(/\bMath\.(floor|round|abs|sqrt|sin|cos|PI)\b/g, (m, f) => (f === 'PI' ? 'PI' : f))
    .replace(/\s{2,}/g, ' ')
    .trim());

  return `${indent}${t}`;
}

/**
 * プログラムぜんぶを JavaScript の書き方から Python に直す
 *
 * 授業で使う p5.js の範囲（function / let / if / else / for(…;…;…) は扱わない）に
 * しぼっている。{ } は字下げに置きかえ、} だけの行は消す。
 * @param {string} code
 * @returns {string}
 */
export function jsToPython(code) {
  const lines = code.replace(/\r/g, '').split('\n');
  const out = [];
  let depth = 0;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { out.push(''); continue; }

    // 閉じかっこだけの行は字下げを戻すだけ
    if (/^\}\s*;?\s*$/.test(t)) { depth = Math.max(0, depth - 1); continue; }

    // } else { / } else if (…) { は、いったん戻してから書く
    const closesFirst = /^\}/.test(t);
    if (closesFirst) depth = Math.max(0, depth - 1);

    const opens = /\{\s*$/.test(t);
    const converted = jsLineToPython(t.replace(/^\}\s*/, ''));
    out.push('    '.repeat(depth) + converted.trim());
    if (opens) depth++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/** その行の JavaScript の書き方を、何をどう直すか一言で言う */
function jsWhy(line) {
  const t = line.trim();
  if (/\+\+|--/.test(t)) return 'x++ のような書き方は、Python では使えません。x += 1 と書きます。';
  if (/^else\s+if\b/.test(t)) return 'else if は、Python では elif と書きます。';
  if (/;\s*$/.test(t)) return 'Python では、行のおわりに ; は書きません。';
  if (/\b(true|false|null)\b/.test(t)) return 'Python では、True・False・None のように最初を大文字で書きます。';
  if (/&&|\|\|/.test(t)) return '「かつ」は and、「または」は or と書きます。';
  if (/===|!==/.test(t)) return '「同じか」は ==、「ちがうか」は != と書きます。';
  if (/^\/\//.test(t)) return 'Python のメモ（コメント）は # で書きます。';
  if (/console\.log/.test(t)) return '画面に出すのは print( ) です。';
  return 'これはほかの言語（JavaScript）の書き方です。Python の書き方に直します。';
}

/** 「…」で囲んだ文字を "…" にする（数とカンマだけの「1, 2」はリストのつもりなので、そのまま） */
function quoteBrackets(line) {
  const kinds = scanLine(line);
  return line.replace(/「([^「」]*)」/g, (whole, inner, at) => (
    // 文字列やコメントの中の「」はそのまま。数とカンマだけの「1, 2」はリストのつもりなので触らない
    kinds[at] !== 'code' || /^[\d\s,.、，]*$/.test(inner) ? whole : `"${inner}"`));
}

/** 閉じていない文字に、はじめと同じ引用符を足す（行のおわりの ) や : の手前に入れる） */
function closeString(line) {
  const kinds = scanLine(line);
  let open = -1;
  for (let i = 0; i < line.length; i++) {
    if (kinds[i] === 'quote') open = open < 0 ? i : -1;
  }
  if (open < 0) return null;
  // It's のように、文字の中の ' で切れたものは、どこで閉じるか決められないので直さない（説明だけ出す）
  if (/\w/.test(line[open - 1] || '')) return null;
  const quote = /["“”＂]/.test(line[open]) ? '"' : "'";
  const rest = line.slice(open + 1);
  // 行のおわりの : は、if・for などの見出しの行のときだけ文字の外に出す（input("名前:" の : は文字の中）
  const header = /^\s*(if|elif|else|for|while|def|class|try|except|with)\b/.test(line);
  const tail = rest.match(header ? /[)\]:\s]*$/ : /[)\]\s]*$/)[0];
  const body = rest.slice(0, rest.length - tail.length);
  // 閉じるつもりで打った、種類のちがう引用符（"こんにちは'）は置きかえる
  const cleaned = body.replace(/["'“”‘’]$/, '');
  return line.slice(0, open) + quote + cleaned + quote + tail;
}

/* ============================================================
 * 4. エラーから直し方を決める
 * ========================================================== */

/**
 * SyntaxError などから「押せば直る」直し方を探す
 * @param {string} code 学習者のコード
 * @param {{type: string, message: string, line: number|null}} error
 * @returns {{label: string, why: string, code: string, line: number}|null}
 */
export function suggestSyntaxFix(code, error) {
  if (!error || !error.line) return null;
  const lines = code.replace(/\r/g, '').split('\n');
  const at = error.line - 1;
  if (at < 0 || at >= lines.length) return null;
  const line = lines[at];
  const message = error.message || '';

  // --- 「」で文字を囲んだ（日本語のかぎかっこは、文字を囲む記号には使えない） ---
  if (error.type === 'SyntaxError' && /invalid character '「'/.test(message) && /「[^「」]*」/.test(line)) {
    const fixed = [...lines];
    fixed[at] = quoteBrackets(line);
    if (fixed[at] !== line) {
      return {
        label: '「 」を " " に直す',
        why: '「 」は、プログラムでは文字を囲む記号に使えません。文字は半角の " " で囲みます（" は Shift キーを押しながら 2）。',
        code: fixed.join('\n'),
        line: error.line,
      };
    }
  }

  // --- 全角文字 ---
  if (/invalid (non-printable )?character|invalid decimal literal/.test(message) && hasFullWidth(line)) {
    const fixed = [...lines];
    fixed[at] = toHalfWidth(line);
    const { list } = pointOutFullWidth(line);
    return {
      label: '全角を半角に直す',
      why: `全角の字が混ざっています（${list}）。プログラムの記号と数字は半角で書きます。`,
      code: fixed.join('\n'),
      line: error.line,
    };
  }

  // --- JavaScript の書き方 ---
  // { } や function・let がある、ほんとうに JavaScript のプログラムなら、ぜんぶを直す。
  // そうでなければ（x++ や else if を 1 行だけ書いたなど）、その行だけを直す（字下げをこわさない）
  const jsProgram = /^\s*(function|let|var|const)\s/m.test(code) || /(\)|\belse)\s*\{\s*$/m.test(code);
  if (error.type === 'SyntaxError' && jsProgram && looksLikeJavaScript(line)) {
    const converted = jsToPython(code);
    if (converted.trim() !== code.trim()) {
      return {
        label: 'Python の書き方に直す',
        why: 'これはほかの言語（JavaScript）の書き方です。Python では { } と ; を使わず、function は def、'
          + '// は #、true は True、&& は and と書きます。',
        code: converted,
        line: error.line,
      };
    }
  }
  if (error.type === 'SyntaxError' && looksLikeJavaScript(line)) {
    const fixedLine = jsLineToPython(line);
    if (fixedLine !== line) {
      const fixed = [...lines];
      fixed[at] = fixedLine;
      return {
        label: 'この行を Python の書き方に直す',
        why: jsWhy(line),
        code: fixed.join('\n'),
        line: error.line,
      };
    }
  }

  // --- else / elif / except の字下げが、中身と同じ深さになっている ---
  const follower = line.match(/^(\s*)(else|elif|except|finally)\b/);
  if (follower && error.type === 'SyntaxError' && /invalid syntax|expected an indented block/.test(message)
    && /:\s*(#.*)?$/.test(line)) {
    const own = follower[1].replace(/\t/g, '    ').length;
    const partner = { else: /^\s*(if|elif|for|while|try|except)\b/, elif: /^\s*(if|elif)\b/, except: /^\s*(try|except)\b/, finally: /^\s*(try|except|else)\b/ }[follower[2]];
    for (let i = at - 1; i >= 0; i--) {
      const lead = lines[i].match(/^\s*/)[0].replace(/\t/g, '    ').length;
      // 同じ深さにもう組になる見出しがあるなら、else の位置は正しい（ほかのまちがい）
      if (lines[i].trim() && lead === own && partner.test(lines[i])) break;
      if (!lines[i].trim() || lead >= own) continue;
      if (lead < own && partner.test(lines[i])) {
        const fixed = [...lines];
        fixed[at] = lines[i].match(/^\s*/)[0] + line.trim();
        return {
          label: `${follower[2]} の字下げを ${i + 1} 行目にそろえる`,
          why: `${follower[2]} は、組になる ${lines[i].trim().split(/\s|:/)[0]} と同じ深さ（同じ列）に書きます。中身と同じだけ下げると、どれと組か分からなくなります。`,
          code: fixed.join('\n'),
          line: error.line,
        };
      }
      break;
    }
  }

  // --- print のかっこを書いていない（print "x"） ---
  if (/Missing parentheses in call to 'print'/.test(message)) {
    const commentAt = scanLine(line).indexOf('comment');
    const body = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const comment = commentAt >= 0 ? `  ${line.slice(commentAt).trim()}` : '';
    const m = body.match(/^(\s*)print\s+(.+?)\s*$/);
    if (m) {
      const fixed = [...lines];
      fixed[at] = `${m[1]}print(${m[2]})${comment}`;
      return {
        label: 'print の中身を ( ) で囲む',
        why: 'print のうしろの中身は ( ) で囲みます。print("こんにちは") のように書きます。',
        code: fixed.join('\n'),
        line: error.line,
      };
    }
  }

  // --- 文字のおわりの引用符がない ---
  if (/unterminated string literal/.test(message)) {
    const fixedLine = closeString(line);
    if (fixedLine) {
      const fixed = [...lines];
      fixed[at] = fixedLine;
      return {
        label: '文字のおわりに引用符を足す',
        why: '文字のおわりの引用符がありません。はじめと同じ引用符（" なら "、\' なら \'）で閉じます。',
        code: fixed.join('\n'),
        line: error.line,
      };
    }
  }

  // --- ( を閉じていない / ) が多い ---
  const opened = message.match(/'([(\[{])' was never closed/);
  if (opened) {
    const close = { '(': ')', '[': ']', '{': '}' }[opened[1]];
    const fixed = [...lines];
    const commentAt = scanLine(line).indexOf('comment');
    const body = (commentAt >= 0 ? line.slice(0, commentAt) : line).replace(/\s+$/, '');
    const comment = commentAt >= 0 ? `  ${line.slice(commentAt).trim()}` : '';
    // 行のおわりの : の手前に入れる（if (x > 0: なら if (x > 0):）
    fixed[at] = body.endsWith(':') ? `${body.slice(0, -1)}${close}:${comment}` : `${body}${close}${comment}`;
    return {
      label: `行のおわりに ${close} を足す`,
      why: `${opened[1]} を閉じる ${close} がありません。開いた数と閉じた数をそろえます。`,
      code: fixed.join('\n'),
      line: error.line,
    };
  }
  const extra = message.match(/unmatched '([)\]}])'/);
  if (extra) {
    const kinds = scanLine(line);
    let index = -1;
    for (let i = line.length - 1; i >= 0; i--) if (line[i] === extra[1] && kinds[i] === 'code') { index = i; break; }
    if (index >= 0) {
      const fixed = [...lines];
      fixed[at] = line.slice(0, index) + line.slice(index + 1);
      return {
        label: `多い ${extra[1]} を 1 つ消す`,
        why: `${extra[1]} が多すぎます。開いた ( の数と、閉じた ) の数をそろえます。`,
        code: fixed.join('\n'),
        line: error.line,
      };
    }
  }

  // --- => や =< と書いた ---
  const codeOnly = (() => { const k = scanLine(line); return [...line].map((c, i) => (k[i] === 'code' ? c : ' ')).join(''); })();
  if (error.type === 'SyntaxError' && /=>|=</.test(codeOnly)) {
    const fixed = [...lines];
    const kinds = scanLine(line);
    fixed[at] = line.replace(/=>|=</g, (m, i) => (kinds[i] === 'code' ? (m === '=>' ? '>=' : '<=') : m));
    if (fixed[at] === line) return null;
    return {
      label: /=>/.test(codeOnly) ? '=> を >= に直す' : '=< を <= に直す',
      why: '「以上」は >=、「以下」は <= と書きます（= はあと）。',
      code: fixed.join('\n'),
      line: error.line,
    };
  }

  // --- : の書きわすれ ---
  if (/expected ':'/.test(message) && /^\s*(def|if|elif|else|for|while|class|try|except|finally|with)\b/.test(line) && !/:\s*(#.*)?$/.test(line)) {
    const fixed = [...lines];
    fixed[at] = line.replace(/\s*$/, ':');
    return {
      label: '行のおわりに : を足す',
      why: 'def や if、for の行は、おわりに「:」（コロン）が要ります。',
      code: fixed.join('\n'),
      line: error.line,
    };
  }

  // --- if に = を書いた ---
  if (/Maybe you meant '=='/.test(message) && /^\s*(if|elif|while)\b/.test(line)) {
    const fixed = [...lines];
    fixed[at] = outsideStrings(line, s => s.replace(/(?<![=!<>])=(?!=)/, '=='));
    return {
      label: '= を == に直す',
      why: '「同じか」をくらべるときは == です。= は「入れる」の意味になります。',
      code: fixed.join('\n'),
      line: error.line,
    };
  }

  return null;
}

/* ============================================================
 * 5. エラーにならないが、動かないもの
 * ========================================================== */

/**
 * draw() の中で、外の変数を毎回同じ値に戻していないか
 *
 * 例）x = 0 を draw() の中に書くと、毎コマ 0 に戻るので動かない。
 * エラーにはならないので、実行のあとに知らせる。
 * @param {string} code
 * @returns {string[]} 気づいたことの文
 */
export function noticeSilentMistakes(code) {
  const notes = [];
  const lines = code.replace(/\r/g, '').split('\n');

  // draw() の中身を取り出す
  const start = lines.findIndex(l => /^def\s+draw\s*\(\s*\)\s*:/.test(l));
  if (start < 0) return notes;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() && !/^\s/.test(lines[i])) break;
    body.push(lines[i]);
  }

  // 「名前 = 数」で始めて、あとで同じ名前を「名前 = 名前 …」と書きかえている
  const resets = new Map();
  for (const l of body) {
    const m = l.match(/^\s+([A-Za-z_]\w*)\s*=\s*-?\d+(\.\d+)?\s*$/);
    if (m && !resets.has(m[1])) resets.set(m[1], true);
  }
  const depthOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;
  for (const [name] of resets) {
    const resetAt = body.findIndex(l => new RegExp(`^\\s+${name}\\s*=\\s*-?\\d`).test(l));
    const top = Math.min(...body.filter(l => l.trim()).map(depthOf));
    // 0 にするのが draw() のいちばん外の深さで、そのあと同じ深さで書きかえているときだけ知らせる
    // （その下のくり返しの中で数える・はみ出したら 0 に戻す、は正しい使い方）
    const moved = resetAt >= 0 && depthOf(body[resetAt]) === top
      && body.slice(resetAt + 1).some(l => new RegExp(`^\\s+${name}\\s*(\\+=|-=|\\*=|=\\s*${name}\\b)`).test(l) && depthOf(l) === top);
    if (moved) {
      notes.push(`draw() の中で ${name} を毎回同じ値に戻しているので、${name} は動きません。`
        + `「${name} = …」の最初の 1 行は、draw() の外（いちばん上）に置きます。`);
    }
  }

  // background() が setup() だけにある（跡が残る）
  const hasBgInDraw = body.some(l => /\bbackground\s*\(/.test(l));
  const hasSetupBg = /def\s+setup[\s\S]*?\bbackground\s*\(/.test(code.split(/def\s+draw/)[0] || '');
  const movesSomething = body.some(l => /\+=|-=|=\s*\w+\s*[-+]/.test(l)) || /\bframeCount\b|\bmouseX\b/.test(body.join('\n'));
  if (!hasBgInDraw && hasSetupBg && movesSomething) {
    notes.push('background() が setup() にしかないので、前のコマの絵が消えず、跡が残ります。'
      + '図形だけを動かしたいときは background() を draw() のはじめに置きます。');
  }

  // setup()・draw() の外に描く命令がある（最初に 1 回だけ動き、すぐ消されてしまう）
  const drawCall = /^(circle|rect|ellipse|line|square|triangle|point|text|arc|quad|fill|stroke|noFill|noStroke|no_fill|no_stroke)\s*\(/;
  const outside = lines.find(l => drawCall.test(l));
  if (outside) {
    notes.push(`${outside.trim().split('(')[0]}() が setup()・draw() の外にあります。外の行は最初に 1 回だけ動き、そのあと background() などで消えてしまいます。`
      + 'draw() の中（4 文字下げた行）に入れましょう。');
  }

  // setup() の中でマウスやキーの値を使っている（最初の 1 回しか読まれない）
  const setupStart = lines.findIndex(l => /^def\s+setup\s*\(\s*\)\s*:/.test(l));
  if (setupStart >= 0) {
    const setupBody = [];
    for (let i = setupStart + 1; i < lines.length; i++) {
      if (lines[i].trim() && !/^\s/.test(lines[i])) break;
      setupBody.push(lines[i]);
    }
    if (setupBody.some(l => /\b(mouseX|mouseY|mouse_x|mouse_y|mouseIsPressed|keyIsPressed)\b/.test(l))) {
      notes.push('setup() は最初に 1 回だけ動くので、マウスやキーの値はそのときのもの（はじめは 0）しか使われません。動かしたいときは draw() に書きます。');
    }
  }
  return notes;
}

/**
 * 03 スケッチの関数名の、大文字・小文字のまちがい（def Draw() など。呼ばれないので何も起きない）
 * @param {string} code
 * @returns {string[]}
 */
export function noticeSketchNames(code) {
  const notes = [];
  const names = ['setup', 'draw', 'mousePressed', 'mouseReleased', 'keyPressed', 'mouseClicked', 'mouseDragged', 'mouseMoved', 'keyReleased'];
  // mouse_pressed のような _ のつづりも呼ばれるので、まちがいにしない
  const snake = names.map(n => n.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`));
  for (const m of String(code).matchAll(/^def\s+([A-Za-z_]\w*)\s*\(/gm)) {
    if (names.includes(m[1]) || snake.includes(m[1])) continue;
    const right = names.find(n => n.toLowerCase() === m[1].toLowerCase().replace(/_/g, ''));
    if (right) notes.push(`def ${m[1]}() は ${right}() とは別の名前なので、自動では呼ばれません。${right} と書きます（大文字と小文字は別の字です）。`);
  }
  return notes;
}

/**
 * エラーにはならないが、思ったとおりに動かない書き方（01・02・03 で共通）
 * @param {string} code
 * @returns {string[]} 気づいたことの文
 */
export function noticeCommonMistakes(code) {
  const notes = [];
  const lines = String(code).replace(/\r/g, '').split('\n');
  const plain = lines.map((l) => {
    const kinds = scanLine(l);
    return [...l].map((ch, i) => (kinds[i] === 'code' ? ch : ' ')).join('');
  });
  const defined = new Set([...String(code).matchAll(/^\s*def\s+([A-Za-z_]\w*)/gm)].map(m => m[1]));
  const variables = new Set([...String(code).matchAll(/^\s*([A-Za-z_]\w*)\s*=(?!=)/gm)].map(m => m[1]));
  plain.forEach((l, i) => {
    const no = i + 1;
    // 「x =+ 1」：= の前に空白があり、= のすぐあとに + か -（x = -1 のように = のあとに空白があるのは、ふつうの負の数）
    const flip = l.match(/^\s*([A-Za-z_]\w*)\s+=([+-])(?!=)/);
    if (flip) {
      notes.push(`${no} 行目：「${flip[1]} =${flip[2]} …」は「${flip[1]} に ${flip[2]}… を入れる」の意味です。ふやす・へらすなら「${flip[1]} ${flip[2]}= …」と書きます。`);
    }
    const bare = l.trim();
    if (defined.has(bare)) {
      notes.push(`${no} 行目：関数 ${bare} を動かすには、うしろに ( ) をつけて「${bare}()」と書きます。`);
    }
    const raw = lines[i].slice(0, (() => { const k = scanLine(lines[i]).indexOf('comment'); return k < 0 ? lines[i].length : k; })());
    const or = raw.match(/([A-Za-z_]\w*)\s*==\s*([^\s]+)\s+or\s+(-?\d+(?![\d.\w])|"[^"]*"|'[^']*')(?!\s*[=!<>])/);
    if (or) {
      notes.push(`${no} 行目：「${or[1]} == ${or[2]} or ${or[3]}」は、いつも成り立ってしまいます。「${or[1]} == ${or[2]} or ${or[1]} == ${or[3]}」と、両方に ${or[1]} == を書きます。`);
    }
  });
  // f をつけ忘れた f 文字列："{name}さん" のように、作った名前を { } で囲んでいる
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/(^|[^fFrRbB\w])(["'])([^"']*\{([A-Za-z_]\w*)\}[^"']*)\2(?!\s*\.format\()/g)) {
      if (variables.has(m[4])) notes.push(`${i + 1} 行目：文字の中の {${m[4]}} に中身を入れるには、" の前に f をつけて f"…" と書きます。`);
    }
  });
  return notes;
}
