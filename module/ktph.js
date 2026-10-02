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
//   ブロックは ｜ と ⎿ で範囲を表し、⎿ は制御文の終わり

/** 表記のハイライト用（ktph-mode.js が使う） */
export const KTPH_KEYWORDS = {
  control: ['もし', 'ならば', 'そうでなくもし', 'そうでなければ', 'の間繰り返す', 'ずつ増やしながら繰り返す',
    'ずつ減らしながら繰り返す', 'を', 'から', 'まで', 'and', 'or', 'not'],
  builtin: ['表示する', '要素数', '整数', '実数', '文字列', '乱数', '【外部からの入力】'],
};

/**
 * スケッチ（p5.js）の命令の、この画面だけの書き方。
 * 共通テスト用の表記には絵を描く命令が無いので、表記の「表示する」「要素数」と同じく
 * 日本語の関数名にそろえて読めるようにした。キーは snake_case。
 */
export const SKETCH_WORDS = {
  create_canvas: 'キャンバスを作る', size: 'キャンバスを作る',
  background: '背景色を決める', fill: '塗り色を決める', no_fill: '塗りをなしにする',
  stroke: '線の色を決める', no_stroke: '線をなしにする', stroke_weight: '線の太さを決める',
  circle: '円を描く', ellipse: '楕円を描く', rect: '長方形を描く', square: '正方形を描く',
  triangle: '三角形を描く', quad: '四角形を描く', line: '線を引く', point: '点を打つ', arc: '弧を描く',
  begin_shape: '形を始める', vertex: '頂点を加える', end_shape: '形を終える',
  text: '文字を描く', text_size: '文字の大きさを決める', text_align: '文字のそろえ方を決める',
  push: '設定を保存する', pop: '設定を戻す', translate: '原点を移す', rotate: '回転する', scale: '拡大する',
  reset_matrix: '移動と回転を戻す', clear: 'キャンバスを消す',
  frame_rate: 'コマ数を決める', no_loop: '繰り返しを止める', loop: '繰り返しを再開する',
  angle_mode: '角度の単位を決める', rect_mode: '長方形の置き方を決める', ellipse_mode: '楕円の置き方を決める',
  random: '乱数', noise: 'なめらかな乱数', dist: '距離',
};

/** setup / draw などの、p5.js が決まったときに呼ぶ関数（表記では行の終わりに説明を添える） */
const SKETCH_HANDLERS = {
  setup: '最初に 1 回だけ動く',
  draw: 'くり返し動く',
  mouse_pressed: 'マウスを押したときに動く',
  mouse_released: 'マウスをはなしたときに動く',
  key_pressed: 'キーを押したときに動く',
};

/** 表記に無い書き方の案内 */
const NOT_IN_KTPH = '共通テスト用の表記には無い書き方です。試験では問題文の中で説明される形になります。';

/**
 * Python のコードを共通テスト用プログラム表記に言いかえる
 * @param {string} python
 * @param {object} [options]
 * @param {boolean} [options.markers] ブロックの範囲を ｜ ⎿ で示す（既定 true）
 * @param {boolean} [options.sketch] スケッチ（p5.js）の命令も日本語にする（既定 false）
 * @returns {{ text: string, warnings: {line: number, message: string}[] }}
 */
export function toKtph(python, options = {}) {
  const { markers = true, sketch = false } = options;
  const lines = String(python ?? '').replace(/\r\n?/g, '\n').split('\n');
  const warnings = [];

  const arrays = collectArrayNames(lines);
  const parsed = lines.map(line => parseLine(line));
  const levels = computeLevels(parsed);

  const out = parsed.map((part, index) => {
    if (part.blank) return '';

    const { converted, warning } = convertBody(part, arrays, sketch);
    if (warning) warnings.push({ line: index + 1, message: warning });

    const prefix = markers ? markerPrefix(parsed, levels, index) : '    '.repeat(levels[index]);
    const comment = part.comment ? (converted ? ' ' + part.comment : part.comment) : '';
    return prefix + converted + comment;
  });

  return { text: out.join('\n'), warnings };
}

/**
 * 穴埋めの選択肢のような、式や文の切れはしを表記にする（ブロックの印は付けない）
 * @param {string} fragment 例 'otsuri // Kingaku[i]'
 * @returns {string} 例 'otsuri ÷ Kingaku[i]'
 */
export function toKtphFragment(fragment) {
  return toKtph(String(fragment ?? ''), { markers: false }).text.trim();
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
 * 字下げの段と、｜ ⎿ の付けかた
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
 *   ｜ … その段の制御文がまだ続く
 *   ⎿ … その段の制御文がここで終わる（次の行が elif / else なら、まだ続いているので ｜）
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
    // 大学入試センターの例示と同じ記号（全角の縦線 ｜ と、終わりの ⎿）
    prefix += closes ? '⎿ ' : '｜ ';
  }
  return prefix;
}

/* ============================================================
 * 配列名（リストを入れた名前は先頭を大文字にする）
 * ========================================================== */

// in [1, 2] や return [1] のような、Python の決まった言葉のあとの [ は配列ではない
const NOT_ARRAY_NAMES = new Set(['range', 'print', 'input', 'len', 'int', 'str', 'float', 'list', 'dict', 'set',
  'in', 'not', 'and', 'or', 'is', 'return', 'if', 'elif', 'while', 'for', 'yield', 'lambda', 'else', 'del', 'assert']);

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
function convertBody(part, arrays, sketch = false) {
  let body = capitalizeArrays(part.body, arrays);
  let warning = null;

  if (!body) return { converted: '', warning };

  if (sketch) {
    const special = convertSketchLine(body, part, arrays);
    if (special !== null) return { converted: special, warning };
    body = replaceSketch(body);
  }

  // x += 1 は表記に無いので x = x + 1 にする（//= は ÷ にあとで直る）
  const augmented = /^([A-Za-z_][\w.]*(?:\[[^\]]*\])*)\s*(\*\*|\/\/|[-+*/%])=(?!=)\s*(.+)$/s.exec(body);
  if (augmented) {
    const [, target, op, rest] = augmented;
    // x /= a * b は x = x / (a * b)。右が 1 つのかたまり（名前・数・呼び出し・添字・文字）でなければ、
    // かっこでくくらないと計算の順番が変わってしまう。+ だけは、くくらなくても同じ意味になる
    // （ただし x += a if c else b は、くくらないと意味が変わる）。
    const single = /^-?[\w.]+(\([^()]*\)|\[[^\[\]]*\])*$/.test(rest.trim());
    const safeForPlus = op === '+' && !/\b(if|else|and|or|not|lambda)\b/.test(rest);
    body = `${target} = ${target} ${op} ${single || safeForPlus ? rest : `(${rest})`}`;
  }

  // 例示には無いが、模試で使われている書き方
  //   繰り返しを抜ける … 東京法令 模擬問題 第1回（Life is Tech は「繰り返しを終了する」）
  //   ずっと繰り返す   … Life is Tech 2024年度 第2回
  if (body === 'break') return { converted: '繰り返しを抜ける', warning };
  if (/^while\s+True\s*:$/.test(body)) return { converted: 'ずっと繰り返す:', warning };

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

  // Tokuten = [0] * 5 は、模試と同じく値を並べた形にする（数が多いときはそのまま）
  body = body.replace(/^([A-Za-z_]\w*)\s*=\s*\[([^\[\],]+)\]\s*\*\s*(\d+)$/, (whole, name, item, count) =>
    (Number(count) <= 20 ? `${name} = [${Array(Number(count)).fill(item.trim()).join(',')}]` : whole));

  // print(…, end="") は「改行なしで表示する」、print() は「改行する」（Pスタディ演習問題の書き方。
  // 進研模試は書き方を変えず「改行されないものとする」と注記する）
  body = body.replace(new RegExp(`^表示する\\((.*?)\\s*,\\s*end\\s*=\\s*${MASK_OPEN}(\\d+)${MASK_CLOSE}\\s*\\)$`), (whole, inner, mask) => {
    const raw = part.strings[Number(mask)] || '';
    return raw.length === 2 ? `改行なしで表示する(${inner})` : whole;
  });
  if (body === '表示する()') body = '改行する';

  // Data.append(x) は「Data に追加(x)」（Life is Tech 2024年度 第3回の書き方）
  body = body.replace(/^([A-Za-z_]\w*)\.append\((.*)\)$/, '$1 に追加($2)');

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
    // random.randint(1, 6) は、例示の「整数(乱数()*6)+1」の形にする
    .replace(/\b(?:random\.)?randint\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g, (_, a, b) => randintToKtph(a, b))
    .replace(/\brandom\.random\(\)/g, '乱数()')
    .replace(/\brandom\(\)/g, '乱数()')
    .replace(/\blen\(/g, '要素数(')
    .replace(/\bint\(/g, '整数(')
    .replace(/\bfloat\(/g, '実数(')
    .replace(/\bstr\(/g, '文字列(')
    .replace(/\bprint\(/g, '表示する(')
    .replace(/\/\//g, '÷')
    // 余りは、例示どおり全角の ％ で書く
    .replace(/%/g, '％');

  // Data[i][j] → Data[i,j]
  let previous;
  do {
    previous = result;
    result = result.replace(/(\w\[[^\[\]]*)\]\[/g, '$1,');
  } while (result !== previous);

  return result;
}

/**
 * スケッチだけの行（def setup(): / global x / return x）を、この画面の書き方にする
 * @returns {string|null} 当てはまらなければ null
 */
function convertSketchLine(body, part) {
  const def = /^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/.exec(body);
  if (def) {
    const role = SKETCH_HANDLERS[toSnake(def[1])];
    const head = unmask(`関数 ${def[1]}(${replaceExpressions(def[2])}):`, part.strings);
    // 説明は、もとのコメントが無いときだけ添える（行は増やさない）
    return role && !def[2].trim() && !part.comment ? `${head}  # ${role}` : head;
  }
  const global = /^global\s+(.+)$/.exec(body);
  if (global) return `外の変数 ${global[1].trim()} を使う`;
  const ret = /^return\b\s*(.*)$/.exec(body);
  if (ret) return ret[1] ? `${unmask(replaceSketch(replaceExpressions(ret[1])), part.strings)} を返す` : '呼び出し元に戻る';
  return null;
}

/** circle(...) / p5.circle(...) / strokeWeight(...) を、表 SKETCH_WORDS の日本語にする */
function replaceSketch(body) {
  return body.replace(/(?<![\w.])(?:p5\.)?([A-Za-z_]\w*)\s*\(/g, (whole, name) => {
    const word = SKETCH_WORDS[toSnake(name)];
    return word ? `${word}(` : whole;
  });
}

/** strokeWeight → stroke_weight */
function toSnake(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** randint(a, b)（a 以上 b 以下の整数）を、整数(乱数()*個数)+a にする */
function randintToKtph(a, b) {
  const lo = a.trim();
  const hi = b.trim();
  const count = /^-?\d+$/.test(lo) && /^-?\d+$/.test(hi) ? String(Number(hi) - Number(lo) + 1)
    : lo === '1' ? (/^\w+$/.test(hi) ? hi : `(${hi})`)
      : lo === '0' ? `(${hi}+1)` : `(${hi}-${lo}+1)`;
  const offset = lo === '0' ? '' : /^-/.test(lo) ? `-${lo.slice(1)}` : `+${lo}`;
  return `整数(乱数()*${count})${offset}`;
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
  const shift = decreasing ? 1 : -1;
  if (/^-?\d+$/.test(expr)) return String(Number(expr) + shift);

  // 「kazu - 1」なら「kazu - 2」、「n + 1」なら「n」のように、最後の数にまとめる。
  // 「kazu - 1-1」のように書くと、試験の表記と見くらべにくい。
  const tail = /^(.+?)\s*([-+])\s*(\d+)$/.exec(expr);
  if (tail && !/[-+*/%]\s*$/.test(tail[1])) {
    const value = (tail[2] === '-' ? -1 : 1) * Number(tail[3]) + shift;
    if (value === 0) return tail[1];
    return `${tail[1]} ${value < 0 ? '-' : '+'} ${Math.abs(value)}`;
  }
  return decreasing ? `${expr} + 1` : `${expr} - 1`;
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
