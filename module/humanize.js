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
      if (/^[a-z]+$/.test(op)) {
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
  return /^(['"])[\s\S]*\1$/.test(String(text).trim());
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
  const string = text.match(/^(['"])([\s\S]*)\1$/);
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
    return text;
  }
  if (findTop(text, '-') > 0 || findTop(text, '*') > 0 ||
      findTop(text, '/') > 0 || findTop(text, '%') > 0) {
    return text;
  }

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
      case 'max': return `${args.join(' と ')} の大きいほう`;
      case 'min': return `${args.join(' と ')} の小さいほう`;
      case 'abs': return `${args[0]} の絶対値`;
      case 'round': return `${args[0]} を四捨五入した数`;
      case 'range': return args.length === 1
        ? `0 から ${args[0]} の手前まで`
        : `${args[0]} から ${args[1]} の手前まで`;
      // 描画モードでよく使うもの
      case 'cos': return `${args[0]} のコサイン`;
      case 'sin': return `${args[0]} のサイン`;
      case 'tan': return `${args[0]} のタンジェント`;
      case 'random': return args.length >= 2
        ? `${args[0]} から ${args[1]} のランダムな数`
        : 'ランダムな数';
      case 'noise': return `(${args.join(', ')}) のなめらかな乱数`;
      case 'lerp': return `${args[0]} と ${args[1]} の間の ${args[2]} の位置`;
      case 'map_value': return `${args[0]} を ${args[1]}〜${args[2]} から ${args[3]}〜${args[4]} に変換した数`;
      default: return `${call.name}(${call.args.join(', ')}) の結果`;
    }
  }

  return text;
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
  return tidy(`${conditionBody(String(expr).trim())}？`);
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
  if (call && call.name === 'print') {
    if (!call.args.length) return '空の行を表示する';
    return `${call.args.map(humanizeValue).join(' と ')} を表示する`;
  }

  // x += 1 のような書き方
  const compound = text.match(/^([A-Za-z_][\w.[\]'"]*)\s*([+\-*/])=\s*(.+)$/s);
  if (compound) {
    const [, name, op, rest] = compound;
    const amount = humanizeValue(rest);
    if (op === '+') return `${name} を ${amount} 増やす`;
    if (op === '-') return `${name} を ${amount} 減らす`;
    if (op === '*') return `${name} を ${amount} 倍にする`;
    return `${name} を ${amount} で割る`;
  }

  // 代入
  const assign = findTop(text, '=');
  if (assign > 0) {
    const name = text.slice(0, assign).trim();
    const rest = text.slice(assign + 1).trim();

    // x = x + 1 は「x を 1 増やす」
    const selfAdd = rest.match(/^([A-Za-z_][\w.]*)\s*([+\-])\s*(.+)$/s);
    if (selfAdd && selfAdd[1] === name && findTop(rest, selfAdd[2]) > 0) {
      const amount = humanizeValue(selfAdd[3]);
      return selfAdd[2] === '+' ? `${name} を ${amount} 増やす` : `${name} を ${amount} 減らす`;
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
  // p5.circle(...) でも circle(...) でも strokeWeight(...) でも同じように言いかえる
  if (call) {
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
        default: return `${target} の ${action} を実行する`;
      }
    }
    return `${call.name} を実行する`;
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
  if (a.length === 1) return `${a[0]}（明るさ）`;
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
    circle: 3, ellipse: 4, rect: 4, square: 3, triangle: 6, line: 4, point: 2, arc: 2,
    background: 1, fill: 1, stroke: 1, stroke_weight: 1,
    text: 3, text_size: 1, translate: 2, rotate: 1, scale: 1,
  };
  if (a.length < (NEEDS[action] ?? 0)) return null;
  if (action === 'scale' && a.length < 2) return `${a[0]} 倍にする`;

  switch (action) {
    case 'circle': return `中心 (${a[0]}, ${a[1]}) に直径 ${a[2]} の円をかく`;
    case 'ellipse': return `中心 (${a[0]}, ${a[1]}) に 横 ${a[2]} 縦 ${a[3]} の楕円をかく`;
    case 'rect': return `(${a[0]}, ${a[1]}) から 幅 ${a[2]} 高さ ${a[3]} の四角をかく`;
    case 'square': return `(${a[0]}, ${a[1]}) から 一辺 ${a[2]} の正方形をかく`;
    case 'triangle': return `(${a[0]}, ${a[1]}) (${a[2]}, ${a[3]}) (${a[4]}, ${a[5]}) の三角形をかく`;
    case 'line': return `(${a[0]}, ${a[1]}) から (${a[2]}, ${a[3]}) へ線をひく`;
    case 'point': return `(${a[0]}, ${a[1]}) に点をうつ`;
    case 'arc': return `中心 (${a[0]}, ${a[1]}) に弧をかく`;
    case 'background': return `背景を ${colourWords(a)} にする`;
    case 'fill': return `塗り色を ${colourWords(a)} にする`;
    case 'no_fill': return '塗りつぶしをやめる';
    case 'stroke': return `線の色を ${colourWords(a)} にする`;
    case 'no_stroke': return '輪郭をやめる';
    case 'stroke_weight': return `線の太さを ${a[0]} にする`;
    case 'text': return `(${a[1]}, ${a[2]}) に ${a[0]} を書く`;
    case 'text_size': return `文字の大きさを ${a[0]} にする`;
    case 'push': return '今の状態を保存する';
    case 'pop': return '保存した状態にもどす';
    case 'translate': return `原点を (${a[0]}, ${a[1]}) に動かす`;
    case 'rotate': return `${a[0]} だけ回転する`;
    case 'scale': return `横 ${a[0]} 倍 縦 ${a[1]} 倍にする`;
    case 'clear': return 'キャンバスを消す';
    case 'reset_matrix': return '移動・回転・拡大を元にもどす';
    default: return null;
  }
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
  return args.length ? `関数 ${match[1]}（${args.join('、')} を受け取る）` : `関数 ${match[1]}`;
}
