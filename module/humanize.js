// module/humanize.js
// Python のコードを、初学者向けのやさしい日本語に言いかえる。
//
//   print(i)        → i を表示する
//   x = 5           → x に 5 を入れる
//   i = i + 1       → i を 1 増やす
//   i % 15 == 0     → i は 15 で割り切れる？
//   name = input(…) → 「…」と聞いて name に入れる
//
// フローチャートのラベルに使う。言いかえられない書き方は、そのまま返す。

/** スケッチ（p5.js）のコードとして読むか */
let sketchMode = false;

/** プログラムの中で、自分で値を入れている名前（def bar(width) の width など） */
let ownNames = new Set();

/**
 * スケッチのコードとして読むかを切りかえる（フローチャートを描く前に呼ぶ）
 * @param {boolean} on
 * @param {string} [source] プログラム全体。自分で使っている width などを、p5.js の値と読みちがえないために使う
 */
export function setSketchMode(on, source = '') {
  sketchMode = Boolean(on);
  ownNames = new Set();
  const code = String(source);
  for (const m of code.matchAll(/\bdef\s+\w+\s*\(([^)]*)\)/g)) {
    for (const param of m[1].split(',')) {
      const name = param.split(/[=:]/)[0].replace(/\*/g, '').trim();
      if (name) ownNames.add(name);
    }
  }
  for (const m of code.matchAll(/^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:\*\*|\/\/|[-+*/%])?=(?!=)/gm)) {
    for (const name of m[1].split(',')) ownNames.add(name.trim());
  }
  for (const m of code.matchAll(/\bfor\s+([A-Za-z_][\w\s,]*?)\s+in\b/g)) {
    for (const name of m[1].split(',')) ownNames.add(name.trim());
  }
}

/** p5.js の値として日本語にしてよい名前か */
function isSketchName(name) {
  return sketchMode && Object.hasOwn(SKETCH_NAMES, name) && !ownNames.has(name);
}

/* ============================================================
 * 1. かっこの外にある演算子をさがす道具
 * ========================================================== */

/**
 * かっこや文字列の外にある演算子の位置をさがす
 * @param {string} text
 * @param {string} op さがす演算子
 * @returns {number} 見つからなければ -1
 */
function findTop(text, op) {
  let depth = 0;
  let quote = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if ('([{'.includes(ch)) { depth++; continue; }
    if (')]}'.includes(ch)) { depth--; continue; }

    if (depth === 0 && text.startsWith(op, i)) {
      // 「==」を「=」と読み違えないようにする
      if (op === '=' && (text[i - 1] === '=' || text[i - 1] === '!' ||
        text[i - 1] === '<' || text[i - 1] === '>' || text[i + 1] === '=')) continue;
      if (/^[a-z ]+$/.test(op)) {
        // and / or / not / in は単語として区切られているときだけ
        const before = text[i - 1];
        const after = text[i + op.length];
        if ((before && /\w/.test(before)) || (after && /\w/.test(after))) continue;
      }
      return i;
    }
  }
  return -1;
}

/** かっこの外でカンマ区切りにする */
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';

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
  return parts.map(part => part.trim()).filter(Boolean);
}

/** 「なにか(…)」の形なら、名前と中身を返す */
function matchCall(text) {
  const match = text.match(/^([A-Za-z_][\w.]*)\s*\((.*)\)$/s);
  if (!match) return null;
  // 「f(1) + g(2)」のように、閉じかっこが途中で終わっていないか確かめる
  if (findTop(match[2], ')') !== -1) return null;
  return { name: match[1], args: splitArgs(match[2]) };
}

/** 文字列のかたまりかどうか */
function isString(text) {
  const t = String(text).trim();
  if (!/^(['"])[\s\S]*\1$/.test(t)) return false;
  // 'a' + 'b' は、はじめの ' と終わりの ' が別の文字列のもの。1 つの文字列ではない
  return closingQuote(t) === t.length - 1;
}

/** 先頭の引用符が閉じる位置（エスケープを飛ばす） */
function closingQuote(text) {
  const quote = text[0];
  for (let i = 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === quote) return i;
  }
  return -1;
}

/** 文字を作る式か（"…" / f"…" / str(…)）。つなぐ（+）を「増やす」と読まないために使う */
function isTextValue(text) {
  const t = String(text).trim();
  if (isString(t) || /^[fFrRbB]{1,2}(['"])[\s\S]*\1$/.test(t) || /^str\s*\(/.test(t)) return true;
  // 'a' + 'b' や "点: " + str(n) のような、文字どうしのつなぎ
  // 'a' + 'b' や "点: " + str(n)、'a' * 3 のような、文字を作る計算
  for (const op of ['+', '*']) {
    const at = findTop(t, op);
    if (at > 0 && (isTextValue(t.slice(0, at)) || isTextValue(t.slice(at + 1)))) return true;
  }
  return false;
}

/** かっこの外に、条件や三項演算子（if / else / and / or / not / 比較）があるか */
function hasLogic(text) {
  return ['if', 'else', 'and', 'or', 'not', '==', '!=', '<', '>'].some(op => findTop(text, op) !== -1);
}

/** かぎかっこの前後に余分な空白が入らないようにする */
function tidy(text) {
  return String(text).replace(/」\s+/g, '」').replace(/\s+「/g, '「').trim();
}

/* ============================================================
 * 2. 値の言いかえ
 * ========================================================== */

/**
 * 式をやさしい日本語にする
 * @param {string} expr
 * @returns {string}
 */
export function humanizeValue(expr) {
  return tidy(valueBody(expr));
}

/** 値の言いかえ本体 */
function valueBody(expr) {
  const text = String(expr).trim();
  if (!text) return '';

  // 文字列は「かぎかっこ」で見せる
  const string = isString(text) && text.match(/^(['"])([\s\S]*)\1$/);
  if (string) return `「${string[2]}」`;

  // 真偽値・なし
  if (text === 'True') return '正しい';
  if (text === 'False') return '正しくない';
  if (text === 'None') return 'なし';

  // かっこ全体を包んでいるだけなら中身を見る
  if (text.startsWith('(') && text.endsWith(')') && findTop(text.slice(1, -1), ')') === -1) {
    return valueBody(text.slice(1, -1));
  }

  // 文字どうしのつなぎ（「こんにちは」＋ name）だけは日本語にする。
  // 計算式は、日本語にすると計算の順番が分かりにくくなるので、式のまま見せる。
  const plus = findTop(text, '+');
  if (plus > 0) {
    const left = text.slice(0, plus).trim();
    const right = text.slice(plus + 1).trim();
    if (isString(left) || isString(right)) return `${valueBody(left)} と ${valueBody(right)}`;
    return sketchNamesIn(text);
  }
  if (findTop(text, '-') > 0 || findTop(text, '*') > 0 ||
      findTop(text, '/') > 0 || findTop(text, '%') > 0) {
    return sketchNamesIn(text);
  }

  // スケッチでよく使う名前は、それだけで書かれていれば日本語にする。
  // key や width はふつうのプログラムでも変数名に使うので、スケッチのときだけ。
  if (isSketchName(text)) return SKETCH_NAMES[text];

  // 関数の呼び出し
  const call = matchCall(text);
  if (call) {
    const args = call.args.map(valueBody);
    switch (call.name) {
      case 'input': return args.length ? `${args[0]} と聞いて受け取った文字` : 'キーボードから受け取った文字';
      case 'int': return `${args[0]} を整数にした数`;
      case 'float': return `${args[0]} を小数にした数`;
      case 'str': return `${args[0]} を文字にしたもの`;
      case 'len': return `${args[0]} の長さ`;
      case 'sum': return `${args[0]} の合計`;
      // max(リスト) は「最大値」、max(a, b) は「大きいほう」、3 つ以上なら「いちばん大きいもの」
      case 'max': return args.length === 1 ? `${args[0]} の最大値`
        : args.length === 2 ? `${args.join(' と ')} の大きいほう` : `${args.join(' と ')} でいちばん大きいもの`;
      case 'min': return args.length === 1 ? `${args[0]} の最小値`
        : args.length === 2 ? `${args.join(' と ')} の小さいほう` : `${args.join(' と ')} でいちばん小さいもの`;
      case 'abs': return `${args[0]} の絶対値`;
      // Python の round は「偶数への丸め」（round(2.5) は 2）なので、四捨五入とは書かない
      case 'round': return args.length >= 2
        ? `${args[0]} を小数第 ${args[1]} 位までに丸めた数`
        : `${args[0]} を整数に丸めた数`;
      case 'range': {
        if (args.length === 1) return `0 から ${args[0]} の手前まで`;
        const range = `${args[0]} から ${args[1]} の手前まで`;
        return args.length >= 3 ? `${range}（${args[2]} ずつ）` : range;
      }
    }
    // math.sqrt や random.randint は、どの画面でも同じ意味なので言いかえる。
    // 前置きの無い dist(...) や noise(...) は、スケッチのときだけ p5.js の関数として読む。
    const module = call.name.match(/^(p5|math|random)\.(.+)$/);
    if (module || sketchMode) {
      const drawn = valueOfSketch(toSnake(module ? module[2] : call.name), args);
      if (drawn) return drawn;
    }
    return `${call.name}(${call.args.join(', ')}) の結果`;
  }

  return text;
}

/**
 * 計算式の中の mouseX や width を日本語にする（スケッチのときだけ）。
 * 式の形（+ や / の順番）はそのまま残すので、計算の順番は変わらない。
 *   width / 2 → キャンバスの幅 / 2
 * @param {string} text
 * @returns {string}
 */
function sketchNamesIn(text) {
  if (!sketchMode) return text;
  // 文字列の中は変えない。関数の名前（うしろに「(」が続くもの）も変えない
  return text.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/).map((part, i) => (i % 2
    ? part
    // f(width=3) の width は、渡す相手の引数の名前なので変えない
    : part.replace(/(?<![\w.])((?:p5\.)?[A-Za-z_]\w*)(?![\w.(])(?!\s*=(?!=))/g,
      (name) => (isSketchName(name) ? SKETCH_NAMES[name] : name)))).join('');
}

/** p5.js の変数を、それだけで使ったときの言いかえ（共通テスト表記の説明にも使う） */
export const SKETCH_NAMES = {
  mouseX: 'マウスの x 座標', mouse_x: 'マウスの x 座標',
  mouseY: 'マウスの y 座標', mouse_y: 'マウスの y 座標',
  pmouseX: '1 コマ前のマウスの x 座標', pmouseY: '1 コマ前のマウスの y 座標',
  mouseIsPressed: 'マウスのボタンが押されている', mouse_is_pressed: 'マウスのボタンが押されている',
  keyIsPressed: 'キーが押されている', key_is_pressed: 'キーが押されている',
  key: '押されたキー', keyCode: '押されたキーの番号',
  width: 'キャンバスの幅', 'p5.width': 'キャンバスの幅',
  height: 'キャンバスの高さ', 'p5.height': 'キャンバスの高さ',
  frameCount: 'コマ数', frame_count: 'コマ数',
  PI: 'π', TWO_PI: '2π', HALF_PI: 'π/2', QUARTER_PI: 'π/4',
};

/**
 * スケッチで使う「値を返す関数」の言いかえ
 * @param {string} name snake_case にした名前
 * @param {string[]} a 引数（言いかえ済み）
 * @returns {string|null}
 */
function valueOfSketch(name, a) {
  switch (name) {
    case 'cos': return `${a[0]} のコサイン`;
    case 'sin': return `${a[0]} のサイン`;
    case 'tan': return `${a[0]} のタンジェント`;
    case 'atan2': return a.length >= 2 ? `(${a[1]}, ${a[0]}) の向きの角度` : null;
    case 'sqrt': return `${a[0]} の平方根`;
    case 'sq': return `${a[0]} の 2 乗`;
    case 'floor': return `${a[0]} の小数点以下を切り捨てた数`;
    case 'ceil': return `${a[0]} の小数点以下を切り上げた数`;
    case 'radians': return `${a[0]} 度をラジアンにした数`;
    case 'degrees': return `${a[0]} ラジアンを度にした数`;
    // p5.js の random(a, b) は a 以上 b 未満、random(n) は 0 以上 n 未満
    case 'random':
      if (a.length >= 2) return `${a[0]} 以上 ${a[1]} 未満のランダムな数`;
      if (a.length === 1) return `0 以上 ${a[0]} 未満のランダムな数`;
      return '0 以上 1 未満のランダムな数';
    case 'randint': return a.length >= 2 ? `${a[0]} 以上 ${a[1]} 以下のランダムな整数` : null;
    case 'noise': return `(${a.join(', ')}) のなめらかな乱数`;
    case 'lerp': return a.length >= 3 ? `${a[0]} から ${a[1]} へ ${a[2]} の割合だけ進んだ数` : null;
    case 'map':
    case 'map_value': return a.length >= 5
      ? `${a[0]} を ${a[1]}〜${a[2]} から ${a[3]}〜${a[4]} に置きかえた数` : null;
    case 'constrain': return a.length >= 3 ? `${a[0]} を ${a[1]} 以上 ${a[2]} 以下におさめた数` : null;
    case 'dist': return a.length >= 4 ? `(${a[0]}, ${a[1]}) と (${a[2]}, ${a[3]}) の距離` : null;
    case 'millis': return '始めてからのミリ秒';
    case 'color': return `色 ${colourWords(a)}`;
    case 'frame_rate': return a.length ? null : '今の 1 秒あたりのコマ数';
    case 'text_width': return `${a[0]} の幅`;
    default: return null;
  }
}

/* ============================================================
 * 3. 条件の言いかえ
 * ========================================================== */

const COMPARE = [
  ['==', 'と等しい'],
  ['!=', 'と等しくない'],
  ['<=', '以下'],
  ['>=', '以上'],
  ['<', 'より小さい'],
  ['>', 'より大きい'],
];

/**
 * 条件をやさしい日本語にする（末尾に「？」が付く形）
 * @param {string} expr
 * @returns {string}
 */
export function humanizeCondition(expr) {
  return tidy(`${conditionBody(squeezeSpaces(String(expr).trim()))}？`);
}

/** 文字列の外にある、続いた空白を 1 つにする（a is  not b を is not として読むため） */
function squeezeSpaces(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += text[++i] ?? ''; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (/\s/.test(ch) && /\s$/.test(out)) continue;
    out += /\s/.test(ch) ? ' ' : ch;
  }
  return out;
}

/** 「？」を付けない条件の本文 */
function conditionBody(text) {
  if (!text) return '';

  // かっこ全体を包んでいるだけなら中身を見る
  if (text.startsWith('(') && text.endsWith(')') && findTop(text.slice(1, -1), ')') === -1) {
    return conditionBody(text.slice(1, -1));
  }

  // かつ / または
  const or = findTop(text, 'or');
  if (or > 0) return `${conditionBody(text.slice(0, or))} または ${conditionBody(text.slice(or + 2))}`;
  const and = findTop(text, 'and');
  if (and > 0) return `${conditionBody(text.slice(0, and))} かつ ${conditionBody(text.slice(and + 3))}`;

  // 〜でない
  if (/^not\b/.test(text)) return `${conditionBody(text.slice(3))} ではない`;

  // 「a not in b」は、in より先に見ないと「a not が b の中にある」になってしまう
  const notIn = findTop(text, 'not in');
  if (notIn > 0) {
    return `${humanizeValue(text.slice(0, notIn))} が ${humanizeValue(text.slice(notIn + 6))} の中にない`;
  }
  const isNot = findTop(text, 'is not');
  if (isNot > 0) {
    return `${humanizeValue(text.slice(0, isNot))} は ${humanizeValue(text.slice(isNot + 6))} ではない`;
  }
  const is = findTop(text, 'is');
  if (is > 0) return `${humanizeValue(text.slice(0, is))} は ${humanizeValue(text.slice(is + 2))}`;

  // 「〜で割り切れる」は、あまりの比較としてよく出るので特別あつかい
  const divisible = text.match(/^(.+?)\s*%\s*(.+?)\s*==\s*0$/s);
  if (divisible && findTop(text, '==') > 0) {
    return `${humanizeValue(divisible[1])} は ${humanizeValue(divisible[2])} で割り切れる`;
  }

  // 比べる
  for (const [op, label] of COMPARE) {
    const at = findTop(text, op);
    if (at > 0) {
      const left = humanizeValue(text.slice(0, at));
      const right = humanizeValue(text.slice(at + op.length));
      return `${left} は ${right} ${label}`;
    }
  }

  // 〜の中にある
  const inAt = findTop(text, 'in');
  if (inAt > 0) {
    return `${humanizeValue(text.slice(0, inAt))} が ${humanizeValue(text.slice(inAt + 2))} の中にある`;
  }

  return humanizeValue(text);
}

/* ============================================================
 * 4. 文の言いかえ
 * ========================================================== */

/**
 * 1行の文をやさしい日本語にする
 * @param {string} statement
 * @returns {string}
 */
export function humanizeStatement(statement) {
  return tidy(statementBody(statement));
}

/** 文の言いかえ本体 */
function statementBody(statement) {
  const text = String(statement).trim();
  if (!text) return '';

  // print(...) は「表示する」
  const call = matchCall(text);
  if (call && call.name === 'print') return humanizePrint(call.args);

  // global x, y … 関数の中から、外の変数を書きかえられるようにする
  const global = text.match(/^global\s+(.+)$/s);
  if (global) return `外の変数 ${global[1].trim()} を使う`;

  // import math / from random import randint
  const importMatch = text.match(/^import\s+(.+)$/s);
  if (importMatch) return `${importMatch[1].trim()} を使えるようにする`;
  const fromMatch = text.match(/^from\s+(\S+)\s+import\s+(.+)$/s);
  if (fromMatch) return `${fromMatch[1]} から ${fromMatch[2].trim()} を使えるようにする`;

  // x += 1 のような書き方（//= %= **= も、= の前の 2 文字までを演算子として読む）
  const compound = text.match(/^([A-Za-z_][\w.[\]'"]*)\s*(\*\*|\/\/|[+\-*/%])=(?!=)\s*(.+)$/s);
  if (compound) {
    const [, name, op, rest] = compound;
    const amount = humanizeValue(rest);
    if (op === '+') return isTextValue(rest) ? `${name} のうしろに ${amount} をつなげる` : `${name} を ${amount} 増やす`;
    if (op === '-') return `${name} を ${amount} 減らす`;
    if (op === '*') return `${name} を ${amount} 倍にする`;
    if (op === '/') return `${name} を ${amount} で割る`;
    if (op === '//') return `${name} を ${amount} で割った商にする`;
    if (op === '%') return `${name} を ${amount} で割ったあまりにする`;
    return `${name} を ${amount} 乗する`;
  }

  // 代入
  const assign = findTop(text, '=');
  if (assign > 0) {
    const name = text.slice(0, assign).trim();
    const rest = text.slice(assign + 1).trim();

    // x = x + 1 は「x を 1 増やす」
    // ただし x = x - y + 1 は「x を y + 1 減らす」ではない（引く数は y だけ）。
    // 引き算のときは、うしろに + や - が続かないものだけ言いかえる。
    // x = x - y if c else z も「(x - y) if c else z」なので、条件がまざるときは言いかえない。
    const selfAdd = rest.match(/^([A-Za-z_][\w.]*)\s*([+\-])\s*(.+)$/s);
    if (selfAdd && selfAdd[1] === name && findTop(rest, selfAdd[2]) > 0 && !hasLogic(selfAdd[3])) {
      const tail = selfAdd[3];
      const plain = findTop(tail, '+') === -1 && findTop(tail, '-') <= 0;
      if (selfAdd[2] === '+' && isTextValue(tail)) return `${name} のうしろに ${humanizeValue(tail)} をつなげる`;
      if (selfAdd[2] === '+') return `${name} を ${humanizeValue(tail)} 増やす`;
      if (plain) return `${name} を ${humanizeValue(tail)} 減らす`;
    }

    // x = input(...) は「聞いて入れる」
    const source = matchCall(rest);
    if (source && source.name === 'input') {
      const prompt = source.args.length ? humanizeValue(source.args[0]) : null;
      return prompt ? `${prompt} と聞いて ${name} に入れる` : `キーボードから入力して ${name} に入れる`;
    }
    if (source && ['int', 'float'].includes(source.name)) {
      const inner = matchCall(source.args[0] || '');
      if (inner && inner.name === 'input') {
        const prompt = inner.args.length ? humanizeValue(inner.args[0]) : 'キーボードから入力';
        const kind = source.name === 'int' ? '整数' : '小数';
        return `${prompt} と聞いて、${kind}にして ${name} に入れる`;
      }
    }

    return `${name} に ${humanizeValue(rest)} を入れる`;
  }

  // p5 の描画（描画モード）
  // p5.circle(...) でも circle(...) でも strokeWeight(...) でも同じように言いかえる。
  // ほかの画面では push(stack, 3) や size(3, 4) が自分で作った関数のこともあるので、p5. つきだけ。
  if (call && (sketchMode || call.name.startsWith('p5.'))) {
    const action = call.name.startsWith('p5.') ? call.name.slice(3) : call.name;
    if (!action.includes('.')) {
      const drawn = humanizeDrawing(toSnake(action), call.args.map(humanizeValue));
      if (drawn) return drawn;
    }
  }

  // メソッドの呼び出し
  if (call) {
    const method = call.name.match(/^(.+)\.(\w+)$/);
    if (method) {
      const [, target, action] = method;
      const args = call.args.map(humanizeValue);
      switch (action) {
        case 'append': return `${target} に ${args[0]} を追加する`;
        case 'remove': return `${target} から ${args[0]} を取り除く`;
        case 'insert': return `${target} の ${args[0]} 番目に ${args[1]} を入れる`;
        case 'sort': return `${target} を並べかえる`;
        case 'reverse': return `${target} を逆順にする`;
        case 'clear': return `${target} を空にする`;
        case 'pop': return args.length ? `${target} から ${args[0]} 番目を取り出す` : `${target} の最後を取り出す`;
        case 'extend': return `${target} のうしろに ${args[0]} をつなげる`;
        default: return `${target}.${action}(${call.args.join(', ')}) を呼び出す`;
      }
    }
    // 自分で作った関数。何を渡したかが消えないよう、引数も書く
    return call.args.length
      ? `関数 ${call.name} を呼び出す（${call.args.map(humanizeValue).join('、')} を渡す）`
      : `関数 ${call.name} を呼び出す`;
  }

  if (/^return\b/.test(text)) {
    const value = text.slice(6).trim();
    return value ? `${humanizeValue(value)} を返す` : '呼び出し元にもどる';
  }
  if (text === 'pass') return '何もしない';
  if (text === 'break') return 'くり返しを抜ける';
  if (text === 'continue') return '次のくり返しへ';

  return text;
}

/**
 * print(...) を言いかえる。end= と sep= は「表示するもの」ではないので分けて読む。
 * @param {string[]} rawArgs
 * @returns {string}
 */
function humanizePrint(rawArgs) {
  const shown = [];
  let end = null;
  let sep = null;
  for (const arg of rawArgs) {
    const keyword = arg.match(/^(end|sep|file|flush)\s*=(?!=)\s*(.+)$/s);
    if (!keyword) { shown.push(humanizeValue(arg)); continue; }
    if (keyword[1] === 'end') end = keyword[2].trim();
    else if (keyword[1] === 'sep') sep = keyword[2].trim();
  }

  // print(end='') は何も出さない
  if (!shown.length && end !== null && /^(['"])\1$/.test(end)) return '何も表示しない';
  let text = shown.length ? `${shown.join(' と ')} を表示する` : '空の行を表示する';
  if (sep !== null && shown.length > 1) {
    text = `${shown.join(' と ')} を、あいだに ${humanizeValue(sep)} をはさんで表示する`;
  }
  if (end !== null) {
    if (/^(['"])\1$/.test(end)) return `${text.replace(/する$/, '')}し、改行しない`;
    return `${text.replace(/する$/, '')}し、うしろに ${humanizeValue(end)} をつける`;
  }
  return text;
}

/**
 * 色の指定を言いかえる
 *
 * p5.js の色は書き方がいくつもある。
 *   background(250)            … 明るさだけ（白黒）
 *   background(250, 120)       … 明るさと、すけ具合
 *   background(30, 90, 200)    … 赤・緑・青
 *   background(30, 90, 200, 120) … 赤・緑・青と、すけ具合
 *   background('#ff0000')      … 色の名前や記号
 * 3つ決めうちで書くと「緑undefined」のような文になってしまうので、数で分ける。
 *
 * @param {string[]} a 引数（すでに言いかえ済み）
 * @returns {string}
 */
function colourWords(a) {
  // 数 1 つなら明るさ。'red' や '#ff0000'、color(...) を入れた変数なら、そのまま色として読む
  if (a.length === 1) return /^-?[\d.]+$/.test(a[0]) ? `${a[0]}（明るさ）` : a[0];
  if (a.length === 2) return `${a[0]}（明るさ・すけ具合 ${a[1]}）`;
  if (a.length === 3) return `赤${a[0]} 緑${a[1]} 青${a[2]}`;
  if (a.length >= 4) return `赤${a[0]} 緑${a[1]} 青${a[2]}（すけ具合 ${a[3]}）`;
  return 'もとの色';
}

/**
 * strokeWeight -> stroke_weight（この中では snake_case でそろえて見る）
 * @param {string} name
 * @returns {string}
 */
function toSnake(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * p5 の描画命令を言いかえる
 * @param {string} action p5. のあとの名前
 * @param {string[]} a 引数（すでに言いかえ済み）
 * @returns {string|null} 対応していなければ null
 */
function humanizeDrawing(action, a) {
  // 引数がそろっていないと「幅 undefined」のような文になってしまう。
  // 書きかけのコードでもフローチャートは動きつづけるので、
  // 足りないときは言いかえをあきらめ、コードのまま見せる。
  const NEEDS = {
    circle: 3, ellipse: 3, rect: 4, square: 3, triangle: 6, quad: 8, line: 4, point: 2, arc: 2,
    background: 1, fill: 1, stroke: 1, stroke_weight: 1,
    text: 3, text_size: 1, text_align: 1, text_leading: 1, translate: 2, rotate: 1, scale: 1,
    create_canvas: 2, size: 2, frame_rate: 1, vertex: 2, curve_vertex: 2, bezier: 8, curve: 8,
    angle_mode: 1, rect_mode: 1, ellipse_mode: 1, color_mode: 1, stroke_cap: 1, stroke_join: 1,
    random_seed: 1, noise_seed: 1, blend_mode: 1,
  };
  if (a.length < (NEEDS[action] ?? 0)) return null;
  if (action === 'scale' && a.length < 2) return `${a[0]} 倍に拡大する`;
  // CENTER や 'degrees' のような決まった言葉は、日本語にしてから文に入れる
  if (/_(mode|align|cap|join)$/.test(action)) a = a.map(modeWord);

  switch (action) {
    // --- キャンバスとアニメーション ---
    case 'create_canvas':
    case 'size': return `横 ${a[0]} 縦 ${a[1]} のキャンバスを作る`;
    case 'frame_rate': return `1 秒に ${a[0]} コマ描くようにする`;
    case 'no_loop': return 'draw() のくり返しを止める';
    case 'loop': return 'draw() のくり返しを再開する';
    case 'redraw': return 'draw() を 1 回だけ動かす';
    case 'clear': return 'キャンバスを消す';
    case 'save_canvas': return 'キャンバスを画像で保存する';
    // --- かたち ---
    case 'circle': return `中心 (${a[0]}, ${a[1]}) に直径 ${a[2]} の円をかく`;
    case 'ellipse': return a.length === 3
      ? `中心 (${a[0]}, ${a[1]}) に直径 ${a[2]} の円をかく`
      : `中心 (${a[0]}, ${a[1]}) に 横 ${a[2]} 縦 ${a[3]} の楕円をかく`;
    case 'rect': return `(${a[0]}, ${a[1]}) から 幅 ${a[2]} 高さ ${a[3]} の四角をかく`;
    case 'square': return `(${a[0]}, ${a[1]}) から 一辺 ${a[2]} の正方形をかく`;
    case 'triangle': return `(${a[0]}, ${a[1]}) (${a[2]}, ${a[3]}) (${a[4]}, ${a[5]}) の三角形をかく`;
    case 'quad': return `(${a[0]}, ${a[1]}) (${a[2]}, ${a[3]}) (${a[4]}, ${a[5]}) (${a[6]}, ${a[7]}) の四角形をかく`;
    case 'line': return `(${a[0]}, ${a[1]}) から (${a[2]}, ${a[3]}) へ線をひく`;
    case 'point': return `(${a[0]}, ${a[1]}) に点をうつ`;
    case 'arc': return a.length >= 6
      ? `中心 (${a[0]}, ${a[1]}) に 横 ${a[2]} 縦 ${a[3]} の弧を 角度 ${a[4]} から ${a[5]} までかく`
      : `中心 (${a[0]}, ${a[1]}) に弧をかく`;
    case 'bezier': return `(${a[0]}, ${a[1]}) から (${a[6]}, ${a[7]}) へベジェ曲線をひく`;
    case 'curve': return `(${a[2]}, ${a[3]}) から (${a[4]}, ${a[5]}) へ曲線をひく`;
    case 'polygon': return '多角形をかく';
    case 'begin_shape': return '形の頂点を集めはじめる';
    case 'vertex': return `頂点 (${a[0]}, ${a[1]}) を足す`;
    case 'curve_vertex': return `曲線の頂点 (${a[0]}, ${a[1]}) を足す`;
    case 'bezier_vertex': return 'ベジェ曲線の頂点を足す';
    case 'quadratic_vertex': return '2 次曲線の頂点を足す';
    case 'end_shape': return a.length && /CLOSE/i.test(a[0]) ? '集めた頂点で、閉じた形をかく' : '集めた頂点で形をかく';
    // --- いろと線 ---
    case 'background': return `背景を ${colourWords(a)} にする`;
    case 'fill': return `塗り色を ${colourWords(a)} にする`;
    case 'no_fill': return '塗りつぶしをやめる';
    case 'stroke': return `線の色を ${colourWords(a)} にする`;
    case 'no_stroke': return '輪郭をやめる';
    case 'stroke_weight': return `線の太さを ${a[0]} にする`;
    case 'stroke_cap': return `線の端の形を ${a[0]} にする`;
    case 'stroke_join': return `線のつなぎ目の形を ${a[0]} にする`;
    case 'color_mode': return `色の決め方を ${a[0]} にする`;
    case 'blend_mode': return `色の重ね方を ${a[0]} にする`;
    case 'erase': return '消しゴムで描くようにする';
    case 'no_erase': return '消しゴムをやめる';
    // --- もじ ---
    case 'text': return `(${a[1]}, ${a[2]}) に ${a[0]} を書く`;
    case 'text_size': return `文字の大きさを ${a[0]} にする`;
    case 'text_align': return a.length >= 2
      ? `文字のそろえ方を 横 ${a[0]} 縦 ${a[1]} にする`
      : `文字のそろえ方を ${a[0]} にする`;
    case 'text_leading': return `文字の行の間を ${a[0]} にする`;
    // --- 位置と向き ---
    case 'push': return '今の状態を保存する';
    case 'pop': return '保存した状態にもどす';
    case 'translate': return `原点を (${a[0]}, ${a[1]}) に動かす`;
    case 'rotate': return `${a[0]} だけ回転する`;
    case 'scale': return `横 ${a[0]} 倍 縦 ${a[1]} 倍に拡大する`;
    case 'reset_matrix': return '移動・回転・拡大を元にもどす';
    case 'angle_mode': return `角度の単位を ${a[0]} にする`;
    case 'rect_mode': return `四角の位置の決め方を ${a[0]} にする`;
    case 'ellipse_mode': return `円の位置の決め方を ${a[0]} にする`;
    // --- 乱数 ---
    case 'random_seed': return `乱数のたねを ${a[0]} にする`;
    case 'noise_seed': return `なめらかな乱数のたねを ${a[0]} にする`;
    default: return null;
  }
}

/** textAlign(CENTER) や angleMode(DEGREES) の言葉 */
const MODE_WORDS = {
  center: '中央', left: '左', right: '右', top: '上', bottom: '下', middle: '中央', baseline: 'ベースライン',
  corner: '左上の角', corners: '2 つの角', radius: '半径',
  degrees: '度', radians: 'ラジアン', rgb: 'RGB', hsb: 'HSB',
  round: '丸', square: '平ら', butt: '平ら', project: '四角くはみ出す形', miter: 'とがった形', bevel: '面取り',
};

/** 言いかえ済みの引数（「center」や CENTER）を、決まった言葉の日本語にする */
function modeWord(arg) {
  const literal = /^「.*」$/.test(String(arg));
  const word = String(arg).replace(/^「|」$/g, '').toLowerCase();
  // 定数 SQUARE は「平ら」、文字の 'square' は canvas のまま「はみ出す」（p5.js の PROJECT）
  if (word === 'square' && literal) return MODE_WORDS.project;
  return Object.hasOwn(MODE_WORDS, word) ? MODE_WORDS[word] : arg;
}

/**
 * 関数定義の見出しを言いかえる
 * @param {string} head 例 'greet(name)'
 * @returns {string}
 */
export function humanizeDefHead(head) {
  const match = String(head).match(/^([A-Za-z_]\w*)\s*\((.*)\)$/s);
  if (!match) return head;
  const args = splitArgs(match[2]);
  // setup / draw などは、いつ動くのかを添える（何をする関数かが名前だけでは分からないため）
  const role = sketchMode ? SKETCH_HANDLERS[match[1]] : null;
  if (role && !args.length) return `関数 ${match[1]}（${role}）`;
  return args.length ? `関数 ${match[1]}（${args.join('、')} を受け取る）` : `関数 ${match[1]}`;
}

/** p5.js が決まったときに呼ぶ関数と、呼ばれるとき */
const SKETCH_HANDLERS = {
  setup: '最初に 1 回だけ動く',
  draw: 'くり返し動く',
  mousePressed: 'マウスを押したときに動く', mouse_pressed: 'マウスを押したときに動く',
  mouseReleased: 'マウスをはなしたときに動く', mouse_released: 'マウスをはなしたときに動く',
  keyPressed: 'キーを押したときに動く', key_pressed: 'キーを押したときに動く',
};
