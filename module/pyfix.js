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

/** 全角の記号・数字・英字 → 半角。文字列の中は触らない */
const FULL_WIDTH = {
  '（': '(', '）': ')', '［': '[', '］': ']', '｛': '{', '｝': '}',
  '，': ',', '、': ',', '．': '.', '：': ':', '；': ';',
  '＋': '+', '－': '-', 'ー': '-', '＊': '*', '／': '/', '％': '%',
  '＝': '=', '＜': '<', '＞': '>', '！': '!',
  '“': '"', '”': '"', '‘': "'", '’': "'",
  '　': ' ',
};

/** 行に全角の記号・数字・英字が混ざっているか（文字列の外で） */
export function hasFullWidth(line) {
  let found = false;
  outsideStrings(line, (part) => {
    if (/[（）［］｛｝，、．：；＋－＊／％＝＜＞！“”‘’　０-９Ａ-Ｚａ-ｚ]/.test(part)) found = true;
    return part;
  });
  return found;
}

/** 全角を半角にそろえた行を返す（文字列の中は残す） */
export function toHalfWidth(line) {
  return outsideStrings(line, (part) => part
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[（）［］｛｝，、．：；＋－ー＊／％＝＜＞！“”‘’　]/g, (c) => FULL_WIDTH[c] || c));
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

  // --- 全角文字 ---
  if (/invalid (non-printable )?character|invalid decimal literal/.test(message) && hasFullWidth(line)) {
    const fixed = [...lines];
    fixed[at] = toHalfWidth(line);
    const bad = [...new Set([...line].filter(c => /[（）［］｛｝，、．：；＋－＊／％＝＜＞！“”‘’　０-９Ａ-Ｚａ-ｚ]/.test(c)))];
    return {
      label: '全角を半角に直す',
      why: `全角の「${bad.slice(0, 3).join('」「')}」が混ざっています。プログラムの記号と数字は半角で書きます。`,
      code: fixed.join('\n'),
      line: error.line,
    };
  }

  // --- JavaScript の書き方（プログラムぜんぶを直す） ---
  const jsLines = lines.filter(looksLikeJavaScript).length;
  if (error.type === 'SyntaxError' && (looksLikeJavaScript(line) || jsLines >= 2)) {
    const converted = jsToPython(code);
    if (converted.trim() !== code.trim()) {
      return {
        label: 'JavaScript の書き方を Python に直す',
        why: 'これは JavaScript（p5.js）の書き方です。Python では { } と ; を使わず、function は def、'
          + '// は #、true は True、&& は and と書きます。',
        code: converted,
        line: error.line,
      };
    }
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
  for (const [name] of resets) {
    const moved = body.some(l => new RegExp(`^\\s+${name}\\s*(\\+=|-=|\\*=|=\\s*${name}\\b)`).test(l));
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
  return notes;
}
