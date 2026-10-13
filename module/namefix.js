// module/namefix.js
// 大文字・小文字（と _ の有無）だけがちがう名前を見つけて、押せば直る候補を出す。
//
//   findNameMistakes(code) … createcanvas → createCanvas、Print → print、true → True のような食いちがいを探す
//   suggestName(name, code) … 1 つの名前の直し方（NameError のときに使う）
//   registerNames(names)   … そのモードだけの名前（03 スケッチの createCanvas など）を足す
//   attachNameFix(cm)      … エディタで、食いちがった名前に下線を引き、行の後ろに「→ 正しい名前」の候補を出す
//
// Python は大文字と小文字を別の字として扱うので、Print や createcanvas は「知らない名前」になる。
// 生徒はどこがちがうのか見つけにくいので、見つけた時点で候補を出し、押されたときだけ直す（黙って直さない）。

import { KEYWORDS, BUILTINS, TYPE_METHODS, MODULE_MEMBERS, KNOWN_MODULES, analyzeCode } from './pycomplete.js';
import { scanLine } from './pyfix.js';

/* ============================================================
 * 1. 知っている名前
 * ========================================================== */

const bare = (label) => String(label).replace(/\(.*$/, '').trim();

/** いつでも使える名前（キーワード・組み込み・メソッド・モジュール） */
const BASE_NAMES = new Set([
  ...KEYWORDS.map(k => k.label),
  ...BUILTINS.map(b => (Array.isArray(b) ? b[0] : b.label)),
  ...Object.values(TYPE_METHODS).flat().map(m => bare(Array.isArray(m) ? m[0] : m.label)),
  ...Object.values(MODULE_MEMBERS).flat().map(m => bare(Array.isArray(m) ? m[0] : m.label)),
  ...KNOWN_MODULES,
  'self', 'math', 'random',
].filter(Boolean));

const extraNames = new Set();

/**
 * そのモードだけの名前を足す（補完の候補と同じもの）
 * @param {(string|{label: string})[]} names
 */
export function registerNames(names) {
  for (const n of names || []) {
    const name = bare(typeof n === 'string' ? n : n.label);
    if (!/^[A-Za-z_]\w*$/.test(name)) continue;
    extraNames.add(name);
    // 03 スケッチでは create_canvas を createCanvas とも書ける（p5lib.js が両方の名前を作る）
    if (name.includes('_')) extraNames.add(name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
  }
}

/** 何行にもわたる文字列（""" … """）の中身を、同じ長さの空白にする（行と位置は変えない） */
function blankTripleStrings(code) {
  return code.replace(/("""|''')[\s\S]*?(\1|$)/g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * コードの中で作られている名前を、広めに集める
 * （ここに入った名前には候補を出さない。多めに入っても、候補が減るだけで害はない）
 */
function definedNames(code) {
  const names = new Set();
  const addAll = (text) => { for (const m of String(text).matchAll(/[A-Za-z_]\w*/g)) names.add(m[0]); };
  const info = analyzeCode(code);
  [Object.keys(info.variables), info.functions.map(f => f.name), info.classes,
    Object.keys(info.modules), Object.keys(info.imported)].forEach(list => list.forEach(n => names.add(n)));
  // 文字列とコメントは空白にしてから調べる
  const plain = blankTripleStrings(code).split('\n').map((line) => {
    const kinds = scanLine(line);
    return [...line].map((ch, k) => (kinds[k] === 'code' ? ch : ' ')).join('');
  }).join('\n');
  for (const m of plain.matchAll(/\bfor\s+([^:\n]+?)\s+in\b/g)) addAll(m[1]);              // for X in（内包表記も）
  for (const m of plain.matchAll(/\blambda\b([^:\n]*):/g)) addAll(m[1]);                    // lambda X, Y:
  for (const m of plain.matchAll(/\bas\s+([A-Za-z_]\w*)/g)) names.add(m[1]);               // import/with/except … as X
  for (const m of plain.matchAll(/([A-Za-z_]\w*)\s*:=/g)) names.add(m[1]);                 // X := …
  for (const m of plain.matchAll(/\b(?:global|nonlocal)\s+([^\n;]+)/g)) addAll(m[1]);
  for (const m of plain.matchAll(/\b(?:def|class)\s+[A-Za-z_]\w*\s*\(([^)]*)\)/g)) addAll(m[1]); // 何行にもわたる引数も
  for (const m of plain.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*(?:\/\/|\*\*|<<|>>|[-+*/%&|^@])=/g)) names.add(m[1]);
  // 代入の左がわ（a, b = …、a = b = 0、; のあとの文も）。f(x=1) のようなキーワード引数は除く
  for (const statement of plain.split(/[\n;]/)) {
    const parts = statement.split(/(?<![=!<>:])=(?!=)/);
    for (const left of parts.slice(0, -1)) {
      if (/[(\[,]\s*[A-Za-z_]\w*\s*$/.test(left) && /[(]/.test(left)) continue;
      for (const m of left.matchAll(/(?<![\w.])([A-Za-z_]\w*)/g)) names.add(m[1]);
    }
  }
  return names;
}

/** くらべるための形（小文字にして _ を取る） */
const fold = (name) => name.toLowerCase().replace(/_/g, '');

/**
 * 1 つの名前の直し方を探す
 * @param {string} name 書かれた名前
 * @param {Set<string>} targets 直す先にしてよい名前
 * @returns {string|null} 直した名前（1 つに決まらないときは null）
 */
function closest(name, targets) {
  if (targets.has(name) || name.length < 2) return null;
  const key = fold(name);
  let hits = [...targets].filter(k => fold(k) === key);
  // 組み込み・キーワード・スケッチの名前と、自分で作った名前の両方に当たるなら、組み込みの方を選ぶ
  if (hits.length > 1) {
    const base = hits.filter(k => BASE_NAMES.has(k) || extraNames.has(k));
    if (base.length) hits = base;
  }
  if (hits.length === 1) return hits[0];
  // 小文字にしただけで 1 つに決まるなら、それを選ぶ（nofill → noFill と no_fill のとき）
  const exact = hits.filter(k => k.toLowerCase() === name.toLowerCase());
  return exact.length === 1 ? exact[0] : null;
}

/**
 * 1 つの名前の直し方（NameError のとき。Python が「無い名前」だと確かめたので、自分で作った名前にも合わせる）
 * @param {string} name
 * @param {string} code
 * @returns {string|null}
 */
export function suggestName(name, code) {
  const targets = new Set([...BASE_NAMES, ...extraNames, ...definedNames(code)]);
  // Python が「無い」と言った名前なので、Total = Total + 1 のように作ったように見えても候補から外す
  targets.delete(name);
  return closest(name, targets);
}

/* ============================================================
 * 2. コードの中から探す
 * ========================================================== */

/** モジュールの中にある、大文字で始まる本物の名前（候補の一覧に無くても、直さない） */
const REAL_MEMBERS = new Set([
  'random.Random', 'random.SystemRandom', 're.Match', 're.Pattern', 're.RegexFlag',
  'datetime.MINYEAR', 'datetime.MAXYEAR', 'math.e', 'collections.OrderedDict',
  'collections.Counter', 'collections.ChainMap', 'collections.UserDict', 'collections.UserList',
]);

/** モジュールの中の名前（math.Pi → math.pi のときに使う） */
const MEMBERS = Object.fromEntries(Object.entries(MODULE_MEMBERS)
  .map(([mod, list]) => [mod, new Set(list.map(m => bare(Array.isArray(m) ? m[0] : m.label)))]));

/**
 * 大文字・小文字（と _）だけがちがう名前を探す。文字列とコメントの中は見ない
 *
 * 打っている途中に出す候補なので、直す先は「Python やスケッチがもともと知っている名前」だけにする。
 * 自分で作った名前どうしの食いちがいは、動かして NameError になったときに suggestName で直す
 * （作り方が多くて見落としやすく、まちがえて直すと動くコードを壊してしまうため）。
 * @param {string} code
 * @returns {{line: number, from: number, to: number, word: string, suggestion: string}[]}
 */
export function findNameMistakes(code) {
  const defined = definedNames(code);
  const targets = new Set([...BASE_NAMES, ...extraNames]);
  const found = [];
  blankTripleStrings(code).split('\n').forEach((text, line) => {
    const kinds = scanLine(text);
    const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
    let match;
    while ((match = pattern.exec(text))) {
      const word = match[0];
      const from = match.index;
      if (kinds[from] !== 'code' || defined.has(word)) continue;
      const before = text.slice(0, from);
      // 数のうしろ（1e5 など）や、キーワード引数の名前（end= など）は名前としてくらべない
      if (/[0-9]$/.test(before)) continue;
      if (/^\s*=(?!=)/.test(text.slice(from + word.length)) && /[(,]\s*$/.test(before)) continue;
      let suggestion = null;
      const dot = before.match(/([A-Za-z_]\w*)\s*\.\s*$/);
      if (dot) {
        // . のうしろは、p5. とモジュール（math. など）のときだけ見る。自分の値の中身は分からないので見ない
        const owner = dot[1];
        if (owner === 'p5') suggestion = closest(word, extraNames);
        else if (MEMBERS[owner] && !REAL_MEMBERS.has(`${owner}.${word}`)) suggestion = closest(word, MEMBERS[owner]);
      } else if (!/\.\s*$/.test(before)) {
        suggestion = closest(word, targets);
      }
      if (suggestion) found.push({ line, from, to: from + word.length, word, suggestion });
    }
  });
  return found;
}

/* ============================================================
 * 3. エディタに出す
 * ========================================================== */

/** 「そのままにする」を押した組（「名前>直す先」。ページを開いているあいだだけ覚える） */
const ignored = new Set();
const ignoreKey = (m) => `${m.word}>${m.suggestion}`;

/**
 * エディタに付ける
 * @param {object} cm CodeMirror
 */
export function attachNameFix(cm) {
  let marks = [];
  let timer = null;
  let shown = '';   // いま出している候補（同じなら作りなおさない。カーソルを動かすたびに部品が並び替わらないように）

  const clear = () => {
    for (const m of marks) m.clear();
    marks = [];
  };

  const apply = (item) => {
    // 押したときに、まだ同じ字が同じところにあるか確かめてから直す
    const now = cm.getRange({ line: item.line, ch: item.from }, { line: item.line, ch: item.to });
    if (now !== item.word) { refresh(); return; }
    cm.replaceRange(item.suggestion, { line: item.line, ch: item.from }, { line: item.line, ch: item.to }, '+namefix');
    cm.focus();
  };

  function refresh() {
    const cursor = cm.getCursor();
    const found = findNameMistakes(cm.getValue())
      // 打っている途中の名前には出さない（カーソルがその名前のすぐ後ろ・中にあるとき）
      .filter(m => !(m.line === cursor.line && cursor.ch >= m.from && cursor.ch <= m.to))
      .filter(m => !ignored.has(ignoreKey(m)));
    const signature = JSON.stringify(found);
    if (signature === shown && marks.length) return;
    shown = signature;
    clear();
    const byLine = new Map();
    for (const m of found) {
      marks.push(cm.markText({ line: m.line, ch: m.from }, { line: m.line, ch: m.to }, {
        className: 'cm-namefix', title: `${m.suggestion} のことかもしれません`,
      }));
      if (!byLine.has(m.line)) byLine.set(m.line, []);
      byLine.get(m.line).push(m);
    }
    // 候補は行の後ろにまとめて出す（コードの字の位置を動かさない）
    for (const [line, items] of byLine) {
      const box = document.createElement('span');
      box.className = 'namefix-box';
      for (const item of items.slice(0, 3)) {
        const chip = document.createElement('span');
        chip.className = 'namefix-chip';
        const fix = document.createElement('button');
        fix.type = 'button';
        fix.className = 'namefix-apply';
        fix.title = `押すと ${item.word} を ${item.suggestion} に直します（大文字と小文字は別の字です）`;
        const was = document.createElement('s');
        was.textContent = item.word;
        const to = document.createElement('b');
        to.textContent = item.suggestion;
        fix.append(was, ' → ', to);
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'namefix-skip';
        skip.textContent = '×';
        skip.title = 'このままにする';
        skip.setAttribute('aria-label', `${item.word} はこのままにする`);
        // 押してもエディタのカーソルを動かさない
        for (const b of [fix, skip]) b.addEventListener('mousedown', (e) => e.preventDefault());
        fix.addEventListener('click', () => apply(item));
        skip.addEventListener('click', () => { ignored.add(ignoreKey(item)); refresh(); });
        chip.append(fix, skip);
        box.appendChild(chip);
      }
      marks.push(cm.setBookmark({ line, ch: cm.getLine(line).length }, { widget: box, insertLeft: true }));
    }
  }

  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 350); };
  cm.on('change', later);
  cm.on('cursorActivity', later);
  refresh();
  return { refresh };
}
