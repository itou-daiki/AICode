// tests/run-node.mjs
// ブラウザなしで確かめられるモジュールの検査。
//
//   node tests/run-node.mjs
//
// 対象: pyformat / humanize / flowchart / pycomplete
// ブラウザが要るもの（ブロック変換・ステップ実行・p5）は tests/browser.html で確かめる。

import { autoIndent, formatCode } from '../module/pyformat.js';
import { humanizeStatement, humanizeCondition, humanizeValue, humanizeDefHead, setSketchMode } from '../module/humanize.js';
import { pythonToMermaid, parsePython } from '../module/flowchart.js';
import { getCompletions, analyzeCode } from '../module/pycomplete.js';
import { explainError } from '../module/pyrun.js';
import { jsToPython, toHalfWidth, hasFullWidth, findFullWidth, pointOutFullWidth, suggestSyntaxFix, noticeSilentMistakes } from '../module/pyfix.js';
import { sameOutput } from '../module/grade.js';
import { toKtph } from '../module/ktph.js';
import { describeStep, explainLine, variableHistory } from '../module/stepview.js';
import { findBlock } from '../module/blockscope.js';
import { indentTrace } from '../module/indentguide.js';
import {
  normalizeAnswer, sameAnswer, gradeTrace, gradeBlanks, gradeTests, scoreMock,
} from '../module/grade.js';
import {
  normalizeProblem, findBlankKeys, fillBlanks, correctPicks, problemRef,
} from '../module/lessons-data.js';
import {
  loadProgress, saveDraft, getDraft, isDraftStale, clearDraft, markSolved, exportProgress, importProgress, clearProgress,
} from '../module/lessons-progress.js';

/* ============================================================
 * 小さな検査の道具
 * ========================================================== */

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) { passed++; return; }
  failures.push({ name, detail });
}

function equal(name, got, want) {
  check(name, got === want, `\n  期待: ${JSON.stringify(want)}\n  実際: ${JSON.stringify(got)}`);
}

function section(title) {
  process.stdout.write(`\n■ ${title}\n`);
}

/** 空白をすべて取り除く（中身が変わっていないかを見る） */
const squeeze = (text) => text.replace(/\s+/g, '');

/* ============================================================
 * 1. テスト用の Python コード集
 * ========================================================== */

const PROGRAMS = {
  'あいさつ': `name = input("名前は？")
print("こんにちは " + name)
`,
  'FizzBuzz': `for i in range(1, 101):
    if i % 15 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)
`,
  '合計と平均': `scores = [80, 92, 71]
total = 0
for s in scores:
    total += s
print(total, total / len(scores))
`,
  'while と break': `n = 0
while True:
    n = n + 1
    if n > 10:
        break
    if n % 2 == 0:
        continue
    print(n)
`,
  '関数': `def bmi(weight, height):
    """体重と身長から BMI を求める。"""
    return weight / (height ** 2)


print(bmi(60, 1.7))
`,
  'クラス': `class Dog:
    def __init__(self, name):
        self.name = name

    def bark(self):
        for i in range(2):
            print(self.name)


pochi = Dog("ポチ")
pochi.bark()
`,
  'try/except/finally': `try:
    x = int(input("数は？"))
    print(10 / x)
except ValueError:
    print("数字を入れてください")
except ZeroDivisionError:
    print("0 では割れません")
else:
    print("成功")
finally:
    print("おわり")
`,
  'for-else': `found = False
for i in range(5):
    if i == 10:
        found = True
        break
else:
    print("見つからなかった")
`,
  '辞書とリスト': `data = {"名前": "たろう", "点数": [80, 90]}
for key in data:
    print(key, data[key])
if "名前" in data:
    print(data["名前"])
`,
  '入れ子のループ': `for i in range(3):
    for j in range(3):
        if i == j:
            continue
        print(i, j)
`,
  '複数行にまたがる文': `values = [
    1,
    2,
    3,
]
result = sum(
    values
)
if (result > 3 and
        result < 10):
    print("ちょうどいい")
`,
  '説明文つきの関数': `def greet(name):
    """あいさつする。

    使い方:
        greet("たろう")
        x=1 は代入
    """
    print("やあ " + name)
`,
  '描画': `def setup():
    p5.background(245, 246, 250)


def draw():
    x = 200 + 130 * cos(frameCount * 0.05)
    p5.circle(x, 200, 26)
`,
  'import と数学': `import math
import random as rnd

angle = math.pi / 4
value = rnd.randint(1, 6)
print(math.sqrt(2), angle, value)
`,
  '内包表記と lambda': `squares = [x * x for x in range(10) if x % 2 == 0]
double = lambda y: y * 2
print(squares, double(3))
`,
  'with 文': `with open("data.txt") as f:
    for line in f:
        print(line.strip())
`,
};

/** 形が崩れたコード（自動インデントで直せるはず） */
const MESSY = {
  '字下げなし': `for i in range(1, 16):
if i % 3 == 0:
print("Fizz")
else:
print(i)
`,
  'タブ混在': `def f():
\tx = 1
\tif x > 0:
\t\treturn x
\treturn 0
`,
  '深すぎる字下げ': `x = 1
        y = 2
print(x, y)
`,
};

/* ============================================================
 * 2. pyformat の検査
 * ========================================================== */

section('pyformat（自動インデント・コード整形）');

for (const [name, code] of Object.entries(PROGRAMS)) {
  // 整ったコードは、自動インデントで変わらない
  equal(`autoIndent: ${name} は変わらない`, autoIndent(code), code);

  // 何度かけても同じ（冪等）
  const formatted = formatCode(code);
  equal(`formatCode: ${name} は2回目も同じ`, formatCode(formatted), formatted);

  // 中身（空白以外）は絶対に変わらない
  equal(`autoIndent: ${name} は中身を変えない`, squeeze(autoIndent(code)), squeeze(code));
  equal(`formatCode: ${name} は中身を変えない`, squeeze(formatted), squeeze(code));

  // 行の中身（前後の空白をのぞく）も変わらない
  const before = code.split('\n').map(l => l.trim()).filter(Boolean);
  const after = autoIndent(code).split('\n').map(l => l.trim()).filter(Boolean);
  equal(`autoIndent: ${name} は行の並びを保つ`, after.join('\n'), before.join('\n'));
}

for (const [name, code] of Object.entries(MESSY)) {
  const fixed = autoIndent(code);
  equal(`autoIndent: ${name} でも中身は変わらない`, squeeze(fixed), squeeze(code));
  equal(`autoIndent: ${name} は2回目も同じ`, autoIndent(fixed), fixed);
  check(`autoIndent: ${name} はタブを残さない`, !fixed.includes('\t'), `\n  実際:\n${fixed}`);
}

equal('autoIndent: 字下げなしの FizzBuzz を組み直す', autoIndent(MESSY['字下げなし']), `for i in range(1, 16):
    if i % 3 == 0:
        print("Fizz")
    else:
        print(i)
`);

equal('autoIndent: for-else は for と組になる', autoIndent(`for i in range(3):
    if i == 5:
        break
else:
    print("なし")
`), `for i in range(3):
    if i == 5:
        break
else:
    print("なし")
`);

equal('formatCode: 記号のまわりに空白を入れる', formatCode('x=1+2\n'), 'x = 1 + 2\n');
equal('formatCode: キーワード引数には空白を入れない', formatCode('f(a=1, b=2)\n'), 'f(a=1, b=2)\n');
equal('formatCode: 単項のマイナス', formatCode('y = -x\n'), 'y = -x\n');
equal('formatCode: スライスのコロン', formatCode('a = items[1:3]\n'), 'a = items[1:3]\n');
equal('formatCode: 行末コメント', formatCode('x=1 #メモ\n'), 'x = 1  # メモ\n');
equal('formatCode: 文字列の中はそのまま', formatCode('s = "x=1"\n'), 's = "x=1"\n');
equal('formatCode: f文字列の中はそのまま', formatCode('print(f"{a+b:.1f}")\n'), 'print(f"{a+b:.1f}")\n');

// 壊れた入力でも落ちない
const BROKEN = ['', '\n\n\n', '   ', 'x = "閉じてない', 'def f(:\n', '\t\t\n', 'a = [1,\n2\n', '"""開いたまま\n',
  'if:\n', 'else:\n    x=1\n', '#コメントだけ\n', 'x' .repeat(5000) + '\n'];
for (const code of BROKEN) {
  let ok = true;
  try { autoIndent(code); formatCode(code); } catch (e) { ok = false; failures.push({ name: '壊れた入力で例外', detail: `${JSON.stringify(code.slice(0, 30))}: ${e.message}` }); }
  if (ok) passed++;
}

/* ============================================================
 * 3. humanize の検査
 * ========================================================== */

section('humanize（やさしい日本語への言いかえ）');

const SAY = [
  ['print(i)', 'i を表示する'],
  ['print("こんにちは")', '「こんにちは」を表示する'],
  ['print(name, age)', 'name と age を表示する'],
  ['print()', '空の行を表示する'],
  ['x = 5', 'x に 5 を入れる'],
  ['x = x + 1', 'x を 1 増やす'],
  ['x = x - 2', 'x を 2 減らす'],
  ['total += n', 'total を n 増やす'],
  ['name = input("名前は？")', '「名前は？」と聞いて name に入れる'],
  ['age = int(input("年は？"))', '「年は？」と聞いて、整数にして age に入れる'],
  ['s = input()', 'キーボードから入力して s に入れる'],
  ['scores.append(80)', 'scores に 80 を追加する'],
  ['scores.sort()', 'scores を並べかえる'],
  ['return x', 'x を返す'],
  ['return', '呼び出し元にもどる'],
  ['pass', '何もしない'],
  ['break', 'くり返しを抜ける'],
  ['continue', '次のくり返しへ'],
  ['x = 200 + 130 * cos(t)', 'x に 200 + 130 * cos(t) を入れる'],
  ['p5.circle(200, 200, 50)', '中心 (200, 200) に直径 50 の円をかく'],
  ['p5.fill(255, 0, 0)', '塗り色を 赤255 緑0 青0 にする'],
  ['p5.no_stroke()', '輪郭をやめる'],
];
for (const [code, want] of SAY) equal(`言いかえ: ${code}`, humanizeStatement(code), want);

// 意味がずれていた言いかえ
const SAY_FIXED = [
  // 引くのは y だけなので「y + 1 減らす」ではない
  ['x = x - y + 1', 'x に x - y + 1 を入れる'],
  ['x = x + y - 1', 'x を y - 1 増やす'],
  // //= を代入と読みちがえて「x // に 2 を入れる」にならない
  ['x //= 2', 'x を 2 で割った商にする'],
  ['x %= 3', 'x を 3 で割ったあまりにする'],
  // 文字をつなぐのは「増やす」ではない
  ['s = s + "!"', 's のうしろに「!」をつなげる'],
  ['s += "!"', 's のうしろに「!」をつなげる'],
  // end= は表示するものではない
  ['print("*", end="")', '「*」を表示し、改行しない'],
  ['print(i, end=" ")', 'i を表示し、うしろに「 」をつける'],
  ['print(a, b, sep=",")', 'a と b を、あいだに「,」をはさんで表示する'],
  // 何を渡したかが消えない
  ['greet("たろう")', '関数 greet を呼び出す（「たろう」を渡す）'],
  ['x = round(3.14159, 2)', 'x に 3.14159 を小数第 2 位までに丸めた数 を入れる'],
  ['m = max(data)', 'm に data の最大値 を入れる'],
  ['import math', 'math を使えるようにする'],
  // 条件がまざる式は、(x - y) if c else z なので「減らす」と読まない
  ['x = x - y if c else z', 'x に x - y if c else z を入れる'],
  ['x = x + 1 if c else 0', 'x に x + 1 if c else 0 を入れる'],
  // 文字を作る式をつなぐのも「つなげる」
  ['s += str(n)', 's のうしろに n を文字にしたもの をつなげる'],
  ["s += 'a' + 'b'", 's のうしろに「a」と「b」をつなげる'],
  ["s = 'a' + 'b'", 's に「a」と「b」を入れる'],
  ['print(end="")', '何も表示しない'],
  ['print(a, file=sys.stderr)', 'a を表示する'],
];
for (const [code, want] of SAY_FIXED) equal(`言いかえ（直したもの）: ${code}`, humanizeStatement(code), want);
equal('条件: not in', humanizeCondition('x not in data'), 'x が data の中にない？');
equal('条件: is None', humanizeCondition('x is not None'), 'x は なし ではない？');
equal('条件: 空白が続いても is not', humanizeCondition('a is  not b'), 'a は b ではない？');
equal('値: range の歩幅', humanizeValue('range(0, 10, 2)'), '0 から 10 の手前まで（2 ずつ）');
equal('値: enumerate', humanizeValue('enumerate(Data)'), 'Data の番号と値');
check('値: sorted に key があっても null と出ない', !humanizeValue('sorted(Data, key=len)').includes('null'));

const ASK = [
  ['i % 15 == 0', 'i は 15 で割り切れる？'],
  ['x > 10', 'x は 10 より大きい？'],
  ['x <= 10', 'x は 10 以下？'],
  ['name == "たろう"', 'name は「たろう」と等しい？'],
  ['a != b', 'a は b と等しくない？'],
  ['x > 0 and y > 0', 'x は 0 より大きい かつ y は 0 より大きい？'],
  ['not found', 'found ではない？'],
  ['"a" in data', '「a」が data の中にある？'],
];
for (const [code, want] of ASK) equal(`条件: ${code}`, humanizeCondition(code), want);

equal('値: len(items)', humanizeValue('len(items)'), 'items の長さ');
// 文字列の中の空白はそのまま残るのが正しい
equal('値: 文字列のつなぎ', humanizeValue('"ようこそ " + name'), '「ようこそ 」と name');
equal('値: 計算式はそのまま', humanizeValue('a * b + c'), 'a * b + c');

// どんな入力でも落ちない
for (const code of ['', '   ', '((((', '"', 'f(', 'a[1:2]', 'x' .repeat(1000)]) {
  let ok = true;
  try { humanizeStatement(code); humanizeCondition(code); humanizeValue(code); }
  catch (e) { ok = false; failures.push({ name: 'humanize で例外', detail: `${JSON.stringify(code.slice(0, 20))}: ${e.message}` }); }
  if (ok) passed++;
}

/* ============================================================
 * 4. flowchart の検査
 * ========================================================== */

section('flowchart（フローチャートの組み立て）');

/** mermaid の定義から、宣言された図形と線のつながりを取り出す */
function inspectMermaid(definition) {
  const declared = new Set();
  const edges = [];

  const invisible = [];
  for (const line of definition.split('\n').map(l => l.trim())) {
    if (!line || line === 'flowchart TD' || line.startsWith('classDef') ||
        line.startsWith('class ') || line.startsWith('subgraph') || line === 'end' ||
        line === 'direction TB') continue;

    const edge = line.match(/^(n\d+)\s*-->(?:\|[^|]*\|)?\s*(n\d+)$/);
    if (edge) { edges.push([edge[1], edge[2]]); continue; }

    // 見えない線（~~~）。図には出ないが、上下の順番を決めるために使う。
    // 流れの線ではないので、つながりの数には入れない。
    const rank = line.match(/^(n\d+)\s*~~~\s*(n\d+)$/);
    if (rank) { invisible.push([rank[1], rank[2]]); continue; }

    const node = line.match(/^(n\d+)[([{]/);
    if (node) { declared.add(node[1]); continue; }

    return { error: `読み取れない行: ${line}` };
  }
  return { declared, edges, invisible };
}

for (const [name, code] of Object.entries({ ...PROGRAMS, ...MESSY })) {
  for (const japanese of [true, false]) {
    const label = `${name}（${japanese ? 'やさしい日本語' : 'コードのまま'}）`;
    let result;
    try {
      result = pythonToMermaid(code, { japanese });
    } catch (e) {
      failures.push({ name: `flowchart: ${label} で例外`, detail: e.message });
      continue;
    }

    if (!result.definition) {
      failures.push({ name: `flowchart: ${label} が図にならない`, detail: result.message || '' });
      continue;
    }
    passed++;

    const info = inspectMermaid(result.definition);
    if (info.error) {
      failures.push({ name: `flowchart: ${label} の書き方が変`, detail: info.error });
      continue;
    }
    passed++;

    // 線の両端は、必ず宣言された図形であること（見えない線もふくむ）
    const missing = [...info.edges, ...info.invisible].flat().filter(id => !info.declared.has(id));
    check(`flowchart: ${label} の線がすべて図形につながる`, missing.length === 0,
      `\n  つながらない図形: ${[...new Set(missing)].join(', ')}`);

    // 「開始」から全部の図形にたどり着けること（孤立した図形が無いこと）
    const reachable = new Set(['n0']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [from, to] of info.edges) {
        if (reachable.has(from) && !reachable.has(to)) { reachable.add(to); grew = true; }
      }
    }
    // 関数定義は別のかたまりなので、そこは除いて数える
    const inSubgraph = new Set();
    let insideSub = false;
    for (const line of result.definition.split('\n').map(l => l.trim())) {
      if (line.startsWith('subgraph')) insideSub = true;
      else if (line === 'end') insideSub = false;
      else if (insideSub) {
        const node = line.match(/^(n\d+)/);
        if (node) inSubgraph.add(node[1]);
      }
    }
    const orphans = [...info.declared].filter(id => !reachable.has(id) && !inSubgraph.has(id));
    check(`flowchart: ${label} に迷子の図形が無い`, orphans.length === 0,
      `\n  たどり着けない図形: ${orphans.join(', ')}`);

    // 行番号は、実際の行の範囲におさまっていること
    const lineCount = code.split('\n').length;
    const badLines = Object.values(result.lineByNode).filter(n => n < 1 || n > lineCount);
    check(`flowchart: ${label} の行番号が正しい`, badLines.length === 0,
      `\n  範囲外: ${badLines.join(', ')}`);
  }
}

// for のばらし方（初期化 → 判断 → 更新）
{
  const def = pythonToMermaid('for i in range(1, 11):\n    print(i)\n', { japanese: false }).definition;
  check('flowchart: for を初期化に分ける', def.includes('"i = 1"'), `\n${def}`);
  check('flowchart: for の判断は i < 11', def.includes('"i #lt; 11"'), `\n${def}`);
  check('flowchart: for の更新は i = i + 1', def.includes('"i = i + 1"'), `\n${def}`);
  check('flowchart: ループの見出しはひし形', /n\d+\{"i #lt; 11"\}/.test(def), `\n${def}`);
}

// 分岐が1つの合流点にまとまること
{
  const def = pythonToMermaid(`if x > 0:
    print("+")
elif x < 0:
    print("-")
else:
    print("0")
`).definition;
  const junctions = (def.match(/n\d+\(\( \)\)/g) || []).length;
  equal('flowchart: 3つの分かれ道の合流点は1つ', junctions, 1);
}

// パースの確認
{
  const tree = parsePython('if x:\n    y = 1\nelse:\n    y = 2\n');
  equal('parsePython: if は1つの文にまとまる', tree.length, 1);
  equal('parsePython: if の節は2つ', tree[0].clauses.length, 2);
}

/* ============================================================
 * 5. pycomplete の検査
 * ========================================================== */

section('pycomplete（コード補完）');

const SAMPLE = `import math
name = "たろう"
scores = [80, 92]
counts = {"a": 1}


def greet(who):
    return who


class Dog:
    pass
`;

function labels(beforeCursor, extraApi = []) {
  return getCompletions({ code: SAMPLE, lineIndex: 12, beforeCursor, extraApi, limit: 40 })
    .items.map(item => item.label);
}

check('補完: 変数が出る', labels('na').includes('name'));
check('補完: リストの変数が出る', labels('sc').includes('scores'));
check('補完: 自分の関数が出る', labels('gr').includes('greet'));
check('補完: 自分のクラスが出る', labels('Do').includes('Dog'));
check('補完: モジュールが出る', labels('ma').includes('math'));
check('補完: 組み込み関数が出る', labels('pri').includes('print'));
check('補完: 文字列のメソッドが出る', labels('name.').includes('upper()'));
check('補完: リストのメソッドが出る', labels('scores.').includes('append()'));
check('補完: 辞書のメソッドが出る', labels('counts.').includes('keys()'));
check('補完: math の中身が出る', labels('math.').includes('sqrt()'));
check('補完: import のあとにモジュール名', labels('import ma').includes('math'));
check('補完: ひな形が出る', labels('for').some(l => l.includes('for')));
check('補完: 追加のAPIが出る（描画モード）',
  labels('p5.', [{ target: 'p5', label: 'circle()', insert: 'circle()', detail: '円' }]).includes('circle()'));

{
  const analysis = analyzeCode(SAMPLE);
  equal('解析: name は文字列', analysis.variables.name, 'str');
  equal('解析: scores はリスト', analysis.variables.scores, 'list');
  equal('解析: counts は辞書', analysis.variables.counts, 'dict');
  equal('解析: 関数を1つ見つける', analysis.functions.length, 1);
  equal('解析: クラスを1つ見つける', analysis.classes.length, 1);
  equal('解析: math を読み込んでいる', analysis.modules.math, 'math');
}

// どんな位置でも落ちない
for (const before of ['', ' ', '.', '..', 'a.b.c.', '(', '"', 'x' .repeat(500)]) {
  let ok = true;
  try { labels(before); } catch (e) { ok = false; failures.push({ name: '補完で例外', detail: `${JSON.stringify(before.slice(0, 20))}: ${e.message}` }); }
  if (ok) passed++;
}


/* ============================================================
 * 5.5 エラーの言いかえ
 *
 * ここが崩れると、学習者は生の Traceback を読むことになる。
 * ========================================================== */

section('pyrun（エラーの言いかえ）');
{
  const code = 'a = 1\nprint(kazu)';
  const text = explainError(
    { type: 'NameError', message: "name 'kazu' is not defined", line: 2, name: 'kazu' }, code);

  check('エラー: 何行目かを出す', text.includes('2 行目'), `\n  実際: ${text}`);
  check('エラー: その行のコードを見せる', text.includes('print(kazu)'), `\n  実際: ${text}`);
  check('エラー: 名前を日本語で説明する', text.includes('「kazu」'), `\n  実際: ${text}`);

  const zero = explainError({ type: 'ZeroDivisionError', message: 'division by zero', line: 1, name: null }, 'print(1 / 0)');
  check('エラー: 0 で割ったとき', zero.includes('0 で割る'), `\n  実際: ${zero}`);

  const few = explainError(
    { type: 'TypeError', message: "circle() missing 1 required positional argument: 'diameter'", line: 1, name: null },
    'circle(1, 2)');
  check('エラー: 引数が足りないとき', few.includes('値の数が足りて'), `\n  実際: ${few}`);

  const concat = explainError(
    { type: 'TypeError', message: 'can only concatenate str (not "int") to str', line: 1, name: null },
    'print("点" + 1)');
  check('エラー: 文字列と数値をつないだとき', concat.includes('str() や int()'), `\n  実際: ${concat}`);

  const timeout = explainError({ type: 'TimeoutError', message: '時間がかかりすぎたので止めました。', line: null, name: null });
  check('エラー: 時間切れはそのまま伝える', timeout.includes('時間がかかりすぎた'), `\n  実際: ${timeout}`);

  const many = explainError(
    { type: 'TypeError', message: 'f() takes 1 positional argument but 2 were given', line: 1, name: null },
    'f(1, 2)');
  check('エラー: 引数が多すぎるとき（"but 2 were given"）', many.includes('多すぎ') && !many.includes('足りて'), `\n  実際: ${many}`);

  for (const op of ['<', '>', '<=', '>=']) {
    const cmp = explainError(
      { type: 'TypeError', message: `'${op}' not supported between instances of 'str' and 'int'`, line: 1, name: null },
      'x = input()');
    check(`エラー: 文字列と数の比べ（${op}）には int(input()) を案内`, cmp.includes('int(input())'), `\n  実際: ${cmp}`);
  }
  const cmpRev = explainError(
    { type: 'TypeError', message: "'<' not supported between instances of 'int' and 'str'", line: 1, name: null }, '');
  check('エラー: int と str の順でも int(input()) を案内', cmpRev.includes('int(input())'), `\n  実際: ${cmpRev}`);

  // 行番号が無くても、コードが無くても落ちない
  for (const info of [
    { type: 'ValueError', message: '', line: null, name: null },
    { type: '知らないエラー', message: 'なにか', line: 3, name: null },
  ]) {
    let fine = true;
    try { explainError(info, ''); } catch (e) { fine = false; failures.push({ name: 'エラーの言いかえで例外', detail: e.message }); }
    if (fine) passed++;
  }
}

/* ============================================================
 * 5.55 描画の言いかえ（引数の数がいろいろある）
 * ========================================================== */

section('描画の言いかえ');
{
  // 描く命令の言いかえは、03 スケッチのコードとして読むときだけ（フローチャートが sketch を渡す）
  setSketchMode(true);
  const cases = [
    ['background(250)', '背景を 250（明るさ） にする'],
    ['background(250, 120)', '背景を 250（明るさ・すけ具合 120） にする'],
    ['background(30, 90, 200)', '背景を 赤30 緑90 青200 にする'],
    ['background(30, 90, 200, 120)', '背景を 赤30 緑90 青200（すけ具合 120） にする'],
    ['fill(200)', '塗り色を 200（明るさ） にする'],
    ['stroke(0)', '線の色を 0（明るさ） にする'],
    ['circle(200, 200, 100)', '中心 (200, 200) に直径 100 の円をかく'],
    ['p5.circle(200, 200, 100)', '中心 (200, 200) に直径 100 の円をかく'],
    ['strokeWeight(4)', '線の太さを 4 にする'],
    ['stroke_weight(4)', '線の太さを 4 にする'],
  ];
  for (const [code, want] of cases) {
    equal(`描画の言いかえ: ${code}`, humanizeStatement(code), want);
  }

  // 「create_canvas を実行する」のように、コードの名前が残らないこと
  setSketchMode(true);
  const sketch = [
    ['create_canvas(400, 400)', '横 400 縦 400 のキャンバスを作る'],
    ['createCanvas(400, 400)', '横 400 縦 400 のキャンバスを作る'],
    ['size(400, 400)', '横 400 縦 400 のキャンバスを作る'],
    ['frameRate(30)', '1 秒に 30 コマ描くようにする'],
    ['noLoop()', 'draw() のくり返しを止める'],
    ['ellipse(100, 100, 50)', '中心 (100, 100) に直径 50 の円をかく'],
    ['fill("red")', '塗り色を「red」にする'],
    ['fill(c)', '塗り色を c にする'],
    ['textAlign(CENTER, CENTER)', '文字のそろえ方を 横 中央 縦 中央 にする'],
    ['angleMode(DEGREES)', '角度の単位を 度 にする'],
    ['vertex(10, 20)', '頂点 (10, 20) を足す'],
    ['endShape(CLOSE)', '集めた頂点で、閉じた形をかく'],
    ['global x, d', '外の変数 x, d を使う'],
    ['x = random(400)', 'x に 0 以上 400 未満のランダムな数 を入れる'],
    ['x = random(10, 20)', 'x に 10 以上 20 未満のランダムな数 を入れる'],
    ['y = mouseX', 'y に マウスの x 座標 を入れる'],
  ];
  for (const [code, want] of sketch) equal(`スケッチの言いかえ: ${code}`, humanizeStatement(code), want);
  equal('スケッチの言いかえ: マウスの条件', humanizeCondition('mouseIsPressed'), 'マウスのボタンが押されている？');
  // 式の中の名前も日本語にする（式の形は変えない）
  equal('スケッチの言いかえ: 式の中の width', humanizeStatement('circle(width / 2, height / 2, 50)'),
    '中心 (キャンバスの幅 / 2, キャンバスの高さ / 2) に直径 50 の円をかく');
  equal('スケッチの言いかえ: 条件の中の式', humanizeCondition('mouseX > width / 2'), 'マウスの x 座標 は キャンバスの幅 / 2 より大きい？');
  equal('スケッチの言いかえ: 文字列の中は変えない', humanizeValue('"width" + 1'), '「width」と 1');
  // 自分で作った引数やループの名前は、p5.js の値と読みちがえない
  setSketchMode(true, 'def bar(x, height):\n    rect(x, 0, 10, height * 2)\nfor key in d:\n    t = d[key] + 1\n');
  equal('スケッチの言いかえ: 引数の height はそのまま', humanizeStatement('rect(x, 0, 10, height * 2)'),
    '(x, 0) から 幅 10 高さ height * 2 の四角をかく');
  equal('スケッチの言いかえ: ループの key はそのまま', humanizeValue('d[key] + 1'), 'd[key] + 1');
  equal('スケッチの言いかえ: 渡す引数の名前はそのまま', humanizeStatement('f(width=3)'), '関数 f を呼び出す（width=3 を渡す）');
  setSketchMode(true);
  equal('スケッチの言いかえ: setup の見出し', humanizeDefHead('setup()'), '関数 setup（最初に 1 回だけ動く）');
  equal('スケッチの言いかえ: draw の見出し', humanizeDefHead('draw()'), '関数 draw（くり返し動く）');
  setSketchMode(false);
  // ほかの画面では、push や size は自分で作った関数かもしれない
  equal('スケッチ以外: push は関数の呼び出し', humanizeStatement('push(stack, 3)'), '関数 push を呼び出す（stack、3 を渡す）');
  equal('スケッチ以外: math.sqrt は言いかえる', humanizeValue('math.sqrt(2)'), '2 の平方根');
  // key や width は、ふつうのプログラムでは変数名なので言いかえない
  equal('スケッチ以外: key はそのまま', humanizeCondition('key == "a"'), 'key は「a」と等しい？');
  equal('スケッチ以外: 式の中の width もそのまま', humanizeValue('width / 2'), 'width / 2');
  equal('スケッチ以外: setup はただの関数', humanizeDefHead('setup()'), '関数 setup');

  // undefined が文に混ざらないこと（これが出ると読めなくなる）
  setSketchMode(true);
  for (const code of ['background()', 'fill(1, 2)', 'circle(1)', 'rect(1, 2)']) {
    const text = humanizeStatement(code);
    check(`描画の言いかえ: ${code} に undefined が出ない`, !text.includes('undefined'), `\n  実際: ${text}`);
  }
  setSketchMode(false);
}

/* ============================================================
 * 5.6 答え合わせ
 *
 * 合っているのに「不正解」と言われるのが、いちばん学習の妨げになる。
 * ========================================================== */

section('答え合わせ');
{
  const same = [
    ['そのまま', 'Hello', 'Hello'],
    ['末尾の改行', 'Hello\n', 'Hello'],
    ['末尾の空行がいくつあっても', 'Hello\n\n\n', 'Hello'],
    ['行末の空白', 'Hello   \n7', 'Hello\n7'],
    ['改行コードのちがい', 'a\r\nb', 'a\nb'],
    ['前後の空白', '  8  ', '8'],
    ['複数行', '1\n2\n3\n', '1\n2\n3'],
  ];
  for (const [name, actual, expected] of same) {
    check(`答え合わせ: ${name} は同じとみなす`, sameOutput(actual, expected) === true,
      `\n  ${JSON.stringify(actual)} と ${JSON.stringify(expected)}`);
  }

  const different = [
    ['大文字小文字', 'hello', 'Hello'],
    ['行の中の空白', 'a b', 'ab'],
    ['行の数', '1\n2', '1'],
    ['からっぽ', '', '8'],
  ];
  for (const [name, actual, expected] of different) {
    check(`答え合わせ: ${name} はちがうとみなす`, sameOutput(actual, expected) === false,
      `\n  ${JSON.stringify(actual)} と ${JSON.stringify(expected)}`);
  }
}


/* ============================================================
 * 5.7 共通テスト用プログラム表記への言いかえ
 *
 * 大学入試センターが公表している表記に合わせる。
 * 1 行が 1 行のままであること（ステップ実行の光る行と、
 * エラーの行番号を、表記側でも同じ行にするため）が要。
 * ========================================================== */

section('ktph（共通テスト用プログラム表記）');
{
  const ktph = (code) => toKtph(code).text;

  const cases = [
    ['表示する', 'print("こんにちは")', '表示する("こんにちは")'],
    ['要素数', 'kazu = len(Data)', 'kazu = 要素数(Data)'],
    ['整数と入力', 'atai = int(input())', 'atai = 【外部からの入力】'],
    ['入力だけ', 'namae = input()', 'namae = 【外部からの入力】'],
    ['整数の商', 'aida = (a + b) // 2', 'aida = (a + b) ÷ 2'],
    ['あまり（例示どおり全角の ％）', 'amari = n % 3', 'amari = n ％ 3'],
    ['べき乗', 'x = 2 ** 10', 'x = 2 ** 10'],
    ['複数の文', 'x = 1; y = 2', 'x = 1 , y = 2'],
    ['乱数', 'atai = random.random()', 'atai = 乱数()'],
    ['文字列にする', 's = str(n)', 's = 文字列(n)'],
  ];
  for (const [name, code, want] of cases) {
    equal(`ktph: ${name}`, ktph(code), want);
  }

  // 制御構文（中身がある形で確かめる）
  equal('ktph: もし〜ならば', ktph('if x < 3:\n    x = x + 1'), 'もし x < 3 ならば:\n⎿ x = x + 1');
  equal('ktph: そうでなければ',
    ktph('if x < 3:\n    x = 1\nelse:\n    x = 2'),
    'もし x < 3 ならば:\n｜ x = 1\nそうでなければ:\n⎿ x = 2');
  equal('ktph: そうでなくもし',
    ktph('if x < 3:\n    x = 1\nelif x < 5:\n    x = 2\nelse:\n    x = 3'),
    'もし x < 3 ならば:\n｜ x = 1\nそうでなくもし x < 5 ならば:\n｜ x = 2\nそうでなければ:\n⎿ x = 3');
  equal('ktph: の間繰り返す', ktph('while n < 10:\n    n = n + 1'), 'n < 10 の間繰り返す:\n⎿ n = n + 1');

  // 繰り返しの終了値は「含む」形に直す
  const forCases = [
    ['range 1つ', 'for x in range(10):\n    s = s + x', 'x を 0 から 9 まで 1 ずつ増やしながら繰り返す:'],
    ['range 2つ', 'for i in range(1, 6):\n    s = s + i', 'i を 1 から 5 まで 1 ずつ増やしながら繰り返す:'],
    ['range 3つ', 'for i in range(0, 10, 2):\n    s = s + i', 'i を 0 から 9 まで 2 ずつ増やしながら繰り返す:'],
    ['変数 - 1', 'for i in range(0, kazu - 1):\n    s = s + i', 'i を 0 から kazu - 2 まで 1 ずつ増やしながら繰り返す:'],
    ['変数 + 1 は打ち消す', 'for i in range(0, n + 1):\n    s = s + i', 'i を 0 から n まで 1 ずつ増やしながら繰り返す:'],
    ['減らしながら', 'for i in range(9, -1, -1):\n    s = s + i', 'i を 9 から 0 まで 1 ずつ減らしながら繰り返す:'],
  ];
  for (const [name, code, wantHead] of forCases) {
    equal(`ktph: ${name}`, ktph(code).split('\n')[0], wantHead);
  }

  // 文字列の中身は変えない
  const strings = 'print("len( と // と % はそのまま")';
  equal('ktph: 文字列の中身は変えない', ktph(strings), '表示する("len( と // と % はそのまま")');

  // 配列名は先頭を大文字にし、あとの行でもそろえる
  equal('ktph: 配列名を大文字にする',
    ktph('data = [1, 2, 3]\nprint(data[0])'),
    'Data = [1, 2, 3]\n表示する(Data[0])');

  // 2 次元はカンマ区切り
  equal('ktph: 2次元の添字', ktph('Hyo = [[1, 2], [3, 4]]\nprint(Hyo[1][0])'),
    'Hyo = [[1, 2], [3, 4]]\n表示する(Hyo[1,0])');

  // 穴埋めのしるしは壊さない
  equal('ktph: 【ア】は壊れない', ktph('if Data[【ア】] == atai:\n    owari = 1'),
    'もし Data[【ア】] == atai ならば:\n⎿ owari = 1');

  // 表記に無い書き方は、そのまま残して知らせる
  {
    const result = toKtph('def tasu(a, b):\n    return a + b');
    check('ktph: def は警告が出る', result.warnings.length === 2, `\n  実際: ${JSON.stringify(result.warnings)}`);
    check('ktph: def はそのまま残る', result.text.includes('def tasu(a, b):'), `\n  実際: ${result.text}`);
  }
  {
    const result = toKtph('for x in Data:\n    print(x)');
    check('ktph: for x in リスト は警告が出る', result.warnings.some(w => w.line === 1),
      `\n  実際: ${JSON.stringify(result.warnings)}`);
  }

  // コメントと空行はそのまま
  equal('ktph: コメント', ktph('x = 1  # ここはコメント'), 'x = 1 # ここはコメント');
  equal('ktph: 空行', ktph('x = 1\n\ny = 2'), 'x = 1\n\ny = 2');

  // 行数が変わらない（これが崩れると光る行がずれる）
  const programs = [
    'print(1)',
    'if a:\n    b = 1\nelse:\n    b = 2',
    'for i in range(3):\n    for j in range(3):\n        print(i, j)',
    '# コメントだけ\n\nx = 1\n',
    'while True:\n    break',
  ];
  for (const code of programs) {
    const out = toKtph(code).text;
    check(`ktph: 行数が変わらない ${JSON.stringify(code.slice(0, 18))}`,
      out.split('\n').length === code.split('\n').length,
      `\n  ${code.split('\n').length} 行 → ${out.split('\n').length} 行`);
  }

  // 二分探索まるごと（公表資料の例と同じ形になること）
  {
    const python = [
      'Data = [3, 18, 29, 33, 48, 52, 62, 77, 89, 97]',
      'kazu = len(Data)',
      'atai = int(input())',
      'hidari = 0; migi = kazu - 1',
      'owari = 0',
      'while hidari <= migi and owari == 0:',
      '    aida = (hidari + migi) // 2',
      '    if Data[aida] == atai:',
      '        print(atai, "は", aida, "番目にありました")',
      '        owari = 1',
      '    elif Data[aida] < atai:',
      '        hidari = aida + 1',
      '    else:',
      '        migi = aida - 1',
    ].join('\n');
    const want = [
      'Data = [3, 18, 29, 33, 48, 52, 62, 77, 89, 97]',
      'kazu = 要素数(Data)',
      'atai = 【外部からの入力】',
      'hidari = 0 , migi = kazu - 1',
      'owari = 0',
      'hidari <= migi and owari == 0 の間繰り返す:',
      '｜ aida = (hidari + migi) ÷ 2',
      '｜ もし Data[aida] == atai ならば:',
      '｜ ｜ 表示する(atai, "は", aida, "番目にありました")',
      '｜ ｜ owari = 1',
      '｜ そうでなくもし Data[aida] < atai ならば:',
      '｜ ｜ hidari = aida + 1',
      '｜ そうでなければ:',
      '⎿ ⎿ migi = aida - 1',
    ].join('\n');
    equal('ktph: 二分探索まるごと', toKtph(python).text, want);
  }

  // 大学入試センターの例示と同じ書き方
  equal('ktph: さいころは 整数(乱数()*6)+1', ktph('saikoro = random.randint(1, 6)'), 'saikoro = 整数(乱数()*6)+1');
  equal('ktph: 0 からの乱数', ktph('x = random.randint(0, 9)'), 'x = 整数(乱数()*10)');
  equal('ktph: 変数の範囲の乱数', ktph('x = random.randint(1, n)'), 'x = 整数(乱数()*n)+1');
  equal('ktph: 文字列の中の % は変えない', ktph('print("100%")'), '表示する("100%")');
  equal('ktph: ブロックの印は ｜ と ⎿', ktph('while n < 3:\n    n = n + 1\n    print(n)'),
    'n < 3 の間繰り返す:\n｜ n = n + 1\n⎿ 表示する(n)');

  // 模試で使われている書き方
  equal('ktph: while True は ずっと繰り返す', ktph('while True:\n    break'), 'ずっと繰り返す:\n⎿ 繰り返しを抜ける');
  check('ktph: break に警告は出ない', toKtph('while True:\n    break').warnings.length === 0);
  equal('ktph: end="" は 改行なしで表示する', ktph('print("*", end="")'), '改行なしで表示する("*")');
  equal('ktph: print() は 改行する', ktph('print()'), '改行する');
  equal('ktph: append は 追加', ktph('kekka = []\nkekka.append(3)'), 'Kekka = []\nKekka に追加(3)');
  equal('ktph: [0] * 5 は値を並べる', ktph('Tokuten = [0] * 5'), 'Tokuten = [0,0,0,0,0]');
  equal('ktph: 数が多いときは並べない', ktph('T = [0] * 100'), 'T = [0] * 100');

  // x += 1 は表記に無いので、x = x + 1 にする
  equal('ktph: += は x = x + 1', ktph('x += 1'), 'x = x + 1');
  // 右がかたまりでなければ、かっこでくくる（x / a * b は (x / a) * b になってしまう）
  equal('ktph: /= はかっこでくくる', ktph('x /= a * b'), 'x = x / (a * b)');
  equal('ktph: %= はかっこでくくる', ktph('x %= a * b'), 'x = x ％ (a * b)');
  equal('ktph: //= もかっこでくくる', ktph('x //= a * b'), 'x = x ÷ (a * b)');
  equal('ktph: += でも if があればくくる', ktph('x += a if c else b'), 'x = x + (a if c else b)');
  equal('ktph: 呼び出し 1 つならくくらない', ktph('x *= f(a - 1)'), 'x = x * f(a - 1)');
  // in [ や return [ は配列の名前ではない
  equal('ktph: in のあとの [ で in を大文字にしない',
    ktph('if x in [1, 2]:\n    y = 1').split('\n')[0], 'もし x in [1, 2] ならば:');
  equal('ktph: -= は右をかっこでくくる', ktph('s -= a + b'), 's = s - (a + b)');
  equal('ktph: //= は ÷', ktph('x //= 2'), 'x = x ÷ 2');
  equal('ktph: 配列の要素の +=', ktph('data = [1]\ndata[0] += 1'), 'Data = [1]\nData[0] = Data[0] + 1');
  equal('ktph: 終わりの値をまとめる', ktph('for i in range(0, n - 3):\n    s = 1').split('\n')[0],
    'i を 0 から n - 4 まで 1 ずつ増やしながら繰り返す:');

  // スケッチ: 絵を描く命令も日本語の関数名にする
  {
    const sketch = (code) => toKtph(code, { sketch: true });
    const program = [
      'x = 0',
      'def setup():',
      '    createCanvas(400, 400)',
      'def draw():',
      '    global x',
      '    background(220)',
      '    p5.circle(x, 200, 50)',
      '    stroke_weight(4)',
      '    a = random(0, 400)',
    ].join('\n');
    const want = [
      'x = 0',
      '関数 setup():  # 最初に 1 回だけ動く',
      '⎿ キャンバスを作る(400, 400)',
      '関数 draw():  # くり返し動く',
      '｜ 外の変数 x を使う',
      '｜ 背景色を決める(220)',
      '｜ 円を描く(x, 200, 50)',
      '｜ 線の太さを決める(4)',
      '⎿ a = 乱数(0, 400)',
    ].join('\n');
    const result = sketch(program);
    equal('ktph スケッチ: まるごと', result.text, want);
    check('ktph スケッチ: setup / draw / global に警告は出ない', result.warnings.length === 0,
      `\n  実際: ${JSON.stringify(result.warnings)}`);
    equal('ktph スケッチ: 関数の引数のはじめの値', sketch("def greet(name='Bob'):\n    return name").text,
      '関数 greet(name="Bob"):\n⎿ name を返す');
    equal('ktph スケッチ: return [ も「を返す」', sketch('def f():\n    return [1]').text, '関数 f():\n⎿ [1] を返す');
    equal('ktph スケッチ: 名前の一部は変えない', sketch('textured = 1\nmyline(1)').text, 'textured = 1\nmyline(1)');
    equal('ktph スケッチ: ふだんは描く命令を変えない', toKtph('circle(1, 2, 3)').text, 'circle(1, 2, 3)');
  }

  // 壊れた入力でも落ちない
  for (const code of ['', '   ', '"閉じていない', 'if:', '(((', 'x'.repeat(500)]) {
    let fine = true;
    try { toKtph(code); } catch (e) { fine = false; failures.push({ name: 'ktph で例外', detail: `${JSON.stringify(code.slice(0, 20))}: ${e.message}` }); }
    if (fine) passed++;
  }
}


/* ============================================================
 * 5.8 レッスンの答え合わせとデータ
 * ========================================================== */

section('書き方の直し方（JavaScript の癖・全角・: と ==）');

// 授業のスライドどおりの JavaScript が、そのまま Python になること
const slideJs = `let x = 0;
let d = 1;
function setup() {
  createCanvas(400, 400);
}
function draw() {
  background(220);
  circle(x, 200, 50);
  x = x + d * 5;
  if (x > 400) {
    d = -1;
  } else if (x < 0) {
    d = 1;
  }
  // 色
  if (x > 200 && d === 1) {
    fill(255, 0, 0);
  }
  angle++;
}`;
const slidePy = jsToPython(slideJs);
for (const [name, want] of [
  ['let が消える', 'x = 0\n'],
  ['function → def', 'def setup():'],
  ['{ } → 字下げ', '    createCanvas(400, 400)\n'],
  ['} else if → elif', '    elif x < 0:'],
  ['// → #', '    # 色'],
  ['&& と === → and と ==', '    if x > 200 and d == 1:'],
  ['++ → += 1', '    angle += 1'],
]) {
  check(`JS→Python: ${name}`, slidePy.includes(want), `\n  ${JSON.stringify(slidePy)}`);
}
check('JS→Python: ; と } が残らない', !/[;{}]/.test(slidePy), `\n  ${JSON.stringify(slidePy)}`);
check('JS→Python: 文字列の中は触らない', jsToPython('print("a && b; // x");').trim() === 'print("a && b; // x")',
  `\n  ${JSON.stringify(jsToPython('print("a && b; // x");'))}`);

// 全角
equal('全角: 記号と数字が半角になる', toHalfWidth('circle（２００，200，50）：'), 'circle(200,200,50):');
equal('全角: 文字列の中は残る', toHalfWidth('print("（全角）")'), 'print("（全角）")');
equal('全角: 全角スペースの字下げ', toHalfWidth('　　circle(1, 2, 3)'), '  circle(1, 2, 3)');
check('全角: 見つける', hasFullWidth('circle（1, 2, 3）') && !hasFullWidth('print("（）")'));
equal('全角: 全角の引用符の中は残す', toHalfWidth('print（“こんにちは、世界”）'), 'print("こんにちは、世界")');
equal('全角: コメントの中は残す', toHalfWidth('x＝１　# 全角（メモ）'), 'x=1 # 全角（メモ）');
equal('全角: 全角の＃の後ろもコメント', toHalfWidth('x＝１＃ 合計（メモ）'), 'x=1# 合計（メモ）');
equal('全角: 「」と、はリストの記号に', toHalfWidth('a = 「1、2」'), 'a = [1,2]');
equal('全角: カタカナの長音は名前の一部として残す', toHalfWidth('データー ー １'), 'データー - 1');
equal('全角: 半角で開いて全角で閉じた文字列', toHalfWidth('print("こんにちは”)'), 'print("こんにちは")');
equal('全角: 正しい文字列の中のアポストロフィは残す', toHalfWidth("print('it’s ok')"), "print('it’s ok')");
equal('全角: 正しい文字列の中の ” は残す', toHalfWidth('print("5”の画面")'), 'print("5”の画面")');
equal('全角: 文字列の中の “” は残す', toHalfWidth('s = "彼は“はい、”と"'), 's = "彼は“はい、”と"');
equal('全角: 打っている途中の文章の句読点は直さない', toHalfWidth('print(こんにちは、世界)', { typing: true }), 'print(こんにちは、世界)');
equal('全角: 長さは変わらない', toHalfWidth('ｘ＝（１＋２）＊３').length, 'ｘ＝（１＋２）＊３'.length);
equal('全角: 場所を見つける', findFullWidth('print（x）').map(f => f.index).join(','), '5,7');
equal('全角: 【 】で囲んで見せる', pointOutFullWidth('print（x）').shown, 'print【（】x【）】');
equal('全角: 全角の空白は □ で見せる', pointOutFullWidth('　x = 1').shown, '【□】x = 1');
check('全角: 直し方の一覧', pointOutFullWidth('print（x）').list === '「（」→「(」、「）」→「)」');
check('全角: 文字列だけなら何もしない', pointOutFullWidth('print("（全角）")') === null);
check('全角: エラーの説明で【 】を使う', explainError({ type: 'SyntaxError', message: "invalid character '（' (U+FF08)", line: 1 }, 'print（1）').includes('print【（】1【）】'));

// エラーから直し方
const fw = suggestSyntaxFix('circle（200, 200, 50）', { type: 'SyntaxError', message: "invalid character '（' (U+FF08)", line: 1 });
check('直し方: 全角 → 半角のボタンが出る', fw !== null && fw.code === 'circle(200, 200, 50)', `\n  ${JSON.stringify(fw)}`);
const js = suggestSyntaxFix('function setup() {\n  createCanvas(400, 400);\n}', { type: 'SyntaxError', message: 'invalid syntax', line: 1 });
check('直し方: JavaScript → Python のボタンが出る', js !== null && js.code.startsWith('def setup():'), `\n  ${JSON.stringify(js)}`);
const colon = suggestSyntaxFix('def draw()\n    circle(1, 2, 3)', { type: 'SyntaxError', message: "expected ':'", line: 1 });
equal('直し方: : を足す', colon && colon.code, 'def draw():\n    circle(1, 2, 3)');
const eq = suggestSyntaxFix('x = 5\nif x = 5:\n    print(1)', { type: 'SyntaxError', message: "invalid syntax. Maybe you meant '==' or ':=' instead of '='?", line: 2 });
equal('直し方: = を == に', eq && eq.code, 'x = 5\nif x == 5:\n    print(1)');
check('直し方: ふつうの Python には出さない', suggestSyntaxFix('print(1', { type: 'SyntaxError', message: "'(' was never closed", line: 1 }) === null);

// エラーにならないが動かないもの
const silent = noticeSilentMistakes('def setup():\n    background(245)\n\ndef draw():\n    x = 0\n    circle(x, 200, 100)\n    x = x + 1\n');
check('気づき: draw() の中で毎回 0 に戻している', silent.some(n => n.includes('x を毎回同じ値に戻している')), `\n  ${JSON.stringify(silent)}`);
check('気づき: background が setup だけ', silent.some(n => n.includes('background()')), `\n  ${JSON.stringify(silent)}`);
check('気づき: 正しいコードには出ない',
  noticeSilentMistakes('x = 0\n\ndef draw():\n    global x\n    background(245)\n    circle(x, 200, 100)\n    x = x + 1\n').length === 0);

section('レッスン（答え合わせとデータ）');
{
  // 書き方のゆれは同じ答えとみなす
  equal('答え: 前後の空白', normalizeAnswer('  7  '), '7');
  equal('答え: 全角の数字', normalizeAnswer('７'), '7');
  equal('答え: 全角の空白', normalizeAnswer('a　b'), 'a b');
  check('答え: 7 と ７ は同じ', sameAnswer('7', '７'));
  check('答え: 7 と 8 はちがう', !sameAnswer('7', '8'));
  check('答え: リストの空白の有無は問わない', sameAnswer('[1,2, 3]', '[1, 2, 3]'));
  check('答え: 読点で区切っても同じ', sameAnswer('[1、2、3]', '[1, 2, 3]'));
  check('答え: 全角のマイナス', sameAnswer('−3', '-3'));
  check('答え: 長音記号のマイナス', sameAnswer('ー3', '-3'));
  check('答え: 見えない字は無視', sameAnswer('12\u200B', '12'));
  check('答え: 改行と空白は同じ', sameAnswer('2\n15', '2 15'));
  check('答え: 数のあいだの空白は残す', !sameAnswer('215', '2 15'));
  check('答え: 大文字小文字は区別する', !sameAnswer('fizzbuzz', 'FizzBuzz'));

  // トレース（記述）
  {
    const problem = { answer: '3' };
    check('トレース: 正解', gradeTrace(problem, '3').ok);
    check('トレース: 全角でも正解', gradeTrace(problem, '３').ok);
    check('トレース: 不正解', !gradeTrace(problem, '4').ok);
  }
  // トレース（選択）
  {
    const problem = { choices: ['2', '3', '4'], answerIndex: 1 };
    check('トレース: 選択の正解', gradeTrace(problem, 1).ok);
    check('トレース: 選択の不正解', !gradeTrace(problem, 0).ok);
    equal('トレース: 選択の正解の中身', gradeTrace(problem, 0).expected, '3');
  }

  // 穴埋め
  {
    const problem = { blanks: [
      { key: 'ア', choices: ['a', 'b'], answer: 1 },
      { key: 'イ', choices: ['x', 'y'], answer: 0 },
    ] };
    check('穴埋め: 全部正解', gradeBlanks(problem, { ア: 1, イ: 0 }).ok);
    const half = gradeBlanks(problem, { ア: 0, イ: 0 });
    check('穴埋め: 1つ間違い', !half.ok && half.perBlank['ア'] === false && half.perBlank['イ'] === true);
    const missing = gradeBlanks(problem, { ア: 1 });
    check('穴埋め: 選んでいない空欄が分かる', missing.unanswered.join(',') === 'イ',
      `\n  実際: ${JSON.stringify(missing.unanswered)}`);
  }

  // テストのまとめ
  {
    const all = gradeTests([{ ok: true }, { ok: true }]);
    check('テスト: 全部通れば正解', all.ok && all.passed === 2 && all.total === 2);
    check('テスト: 1つ落ちたら不正解', !gradeTests([{ ok: true }, { ok: false }]).ok);
    check('テスト: 0件は正解にしない', !gradeTests([]).ok);
  }

  // 模試の点数
  {
    const set = { problems: [
      { ref: 'a#1', points: 20 }, { ref: 'a#2', points: 30 }, { ref: 'b#1', points: 50 },
    ] };
    const result = scoreMock(set, { 'a#1': true, 'b#1': true });
    equal('模試: 点数', result.score, 70);
    equal('模試: 満点', result.total, 100);
    check('模試: 行ごとの正誤', result.rows[1].ok === false && result.rows[2].got === 50);
  }

  // 古い形の問題を読みかえる
  {
    const old = { title: 'Hello', description: '…', input: '', expected: 'Hello, World!', template: '# …\n' };
    const problem = normalizeProblem(old, 'basic', 'lesson1');
    equal('データ: 古い問題は code になる', problem.type, 'code');
    equal('データ: expected が tests になる', problem.tests[0].expected, 'Hello, World!');
    equal('データ: 見せかたは python', problem.view, 'python');
  }
  {
    const problem = normalizeProblem({ id: 'x', question: '何が出る？', program: 'print(1)' }, 'kyotsu', 'l1');
    equal('データ: question があれば trace', problem.type, 'trace');
    equal('データ: 共通テストは表記で見せる', problem.view, 'ktph');
    equal('データ: check の既定', problem.check.kind, 'output');
  }
  {
    const problem = normalizeProblem({ id: 'y', blanks: [{ key: 'ア', choices: ['a'], answer: 0 }] }, 'kyotsu', 'l1');
    equal('データ: blanks があれば blank', problem.type, 'blank');
  }
  {
    const problem = normalizeProblem({ id: 'z', program: 'print(1)', tasks: ['ためす'] }, 'intro', 'l1');
    equal('データ: tasks があれば read', problem.type, 'read');
  }
  equal('データ: 問題を指す文字列',
    problemRef(normalizeProblem({ id: 'bin-search' }, 'kyotsu', 'l1')), 'kyotsu#bin-search');

  // 穴埋めの展開
  {
    const program = 'if Data[【ア】] == atai:\n    print(【イ】)';
    equal('穴埋め: 空欄を出てくる順に拾う', findBlankKeys(program).join(','), 'ア,イ');

    const blanks = [
      { key: 'ア', choices: ['hidari', 'naka'], answer: 1 },
      { key: 'イ', choices: ['naka', 'atai'], answer: 0 },
    ];
    equal('穴埋め: 正解で埋める',
      fillBlanks(program, blanks, correctPicks({ blanks })),
      'if Data[naka] == atai:\n    print(naka)');
    equal('穴埋め: 選んでいない空欄は残る',
      fillBlanks(program, blanks, { ア: 1 }),
      'if Data[naka] == atai:\n    print(【イ】)');
  }

  // 埋めたプログラムが、表記に直しても壊れない
  {
    const filled = fillBlanks('if Data[【ア】] == atai:\n    owari = 1',
      [{ key: 'ア', choices: ['naka'], answer: 0 }], { ア: 0 });
    equal('穴埋め: 埋めたあと表記にできる',
      toKtph(filled).text, 'もし Data[naka] == atai ならば:\n⎿ owari = 1');
  }
}

/* ============================================================
 * 5.9 ステップ実行の「何が起きたか」
 * ========================================================== */

section('ステップ実行の説明');
{
  const S = (line, event, func, vars, output = '') => ({
    line, event, func, output,
    vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, { repr: String(v) }])),
  });
  // 1: def f(n):  2: return n * 2  3: x = f(3)  4: print(x)
  const steps = [
    S(1, 'line', '<module>', {}), S(3, 'line', '<module>', { f: 'fn' }),
    S(2, 'line', 'f', { n: 3 }), S(2, 'return', 'f', { n: 3 }),
    S(4, 'line', '<module>', { f: 'fn', x: 6 }), S(4, 'return', '<module>', { f: 'fn', x: 6 }, '6\n'),
    S(4, 'end', '<module>', { f: 'fn', x: 6 }, '6\n'),
  ];
  const at = (i, status) => describeStep(steps, i, status);
  equal('ステップ: はじめは「次」だけ', [at(0).doneKind, at(0).next].join(','), ',1');
  equal('ステップ: 関数に入ったら「呼び出しました」', [at(2).doneKind, at(2).done, at(2).callee].join(','), 'call,3,f');
  equal('ステップ: return の記録では次の行が無い', [at(3).nextKind, at(3).next].join(','), 'return,');
  equal('ステップ: 戻ったら、呼び出した行が終わった', [at(4).doneKind, at(4).done].join(','), 'back,3');
  check('ステップ: 戻ったときの変化は x', at(4).changes.map(c => c.name).join(',') === 'x');
  equal('ステップ: 最後の行のあとは「最後まで」', at(5).nextKind, 'module-end');
  equal('ステップ: end では同じ行をくり返さない', [at(6).doneKind, at(6).nextKind].join(','), ',end');
  const err = [S(1, 'line', '<module>', {}), S(2, 'line', '<module>', { a: 1 }), S(2, 'return', '<module>', { a: 1 }), S(2, 'end', '<module>', { a: 1 })];
  const e = (i) => describeStep(err, i, { error: 'ZeroDivisionError: division by zero' });
  equal('ステップ: エラーの行は「エラーになった」', [e(2).doneKind, e(2).done, e(2).nextKind].join(','), 'error,2,error');
  equal('ステップ: 上限で止めたときは、そう言う', describeStep(err.slice(0, 2).concat([S(2, 'end', '<module>', {})]), 2, { truncated: true }).nextKind, 'truncated');
}

section('レッスンの記録（書きかけ・持ち運び）');
{
  // node には localStorage が無いので、ページを開いているあいだだけの記録で確かめる
  clearProgress();
  saveDraft('c#a', 'print(2)\n', 'print(1)\n');
  equal('記録: 書きかけを残す', getDraft('c#a'), 'print(2)\n');
  check('記録: 同じ最初のコードなら古くない', !isDraftStale('c#a', 'print(1)\n'));
  check('記録: 問題が作り直されたら古い', isDraftStale('c#a', 'print(9)\n'));
  saveDraft('c#a', 'print(1)\n', 'print(1)\n');
  equal('記録: 最初のコードと同じなら書きかけは消す', getDraft('c#a'), null);
  saveDraft('c#b', 'x', 'y');
  clearDraft('c#b');
  equal('記録: 書きかけを消す', getDraft('c#b'), null);

  markSolved('c#s');
  saveDraft('c#d', 'mine', 'orig');
  const file = exportProgress();
  clearProgress();
  saveDraft('c#d', 'here', 'orig');
  const added = importProgress(file);
  check('記録: 読みこむと解けた印が戻る', Boolean(loadProgress().solved['c#s']));
  equal('記録: この端末の書きかけは上書きしない', getDraft('c#d'), 'here');
  equal('記録: 増えた数を返す', added.solved, 1);
  let threw = '';
  try { importProgress('{"app":"other"}'); } catch (e) { threw = e.message; }
  check('記録: 別のファイルは断る', threw.includes('書き出した記録'));
  try { importProgress('not json'); } catch (e) { threw = e.message; }
  check('記録: 壊れたファイルは断る', threw.includes('読めませんでした'));
  clearProgress();
  equal('記録: 消すと空になる', Object.keys(loadProgress().solved).length, 0);
}

section('字下げのまとまりと、ステップの注釈');
{
  const code = ['total = 0', 'for n in nums:', '    if n > 2:', '        total += n', '', '    print(n)', 'print(total)'];
  const b = (line) => { const r = findBlock(code, line); return r ? `${r.head}-${r.end}` : 'none'; };
  equal('まとまり: for の見出しの行', b(1), '1-5');
  equal('まとまり: if の中身の行', b(3), '2-3');
  equal('まとまり: for の中で if の外の行', b(5), '1-5');
  equal('まとまり: 中の空行は、下の行のまとまり', b(4), '1-5');
  equal('まとまり: 外の行は、まとまりなし', b(6), 'none');

  const V = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { repr: String(v) }]));
  const S = (line, vars, output = '') => ({ line, event: 'line', func: '<module>', vars: V(vars), output });
  const steps = [
    S(1, {}), S(2, { total: 0 }), S(3, { total: 0, n: 3 }), S(4, { total: 0, n: 3 }),
    S(2, { total: 3, n: 3 }), S(3, { total: 3, n: 1 }), S(2, { total: 3, n: 1 }), S(7, { total: 3, n: 1 }),
  ];
  const lines = ['total = 0', 'for n in nums:', '    if n > 2:', '        total += n', '', '', 'print(total)'];
  const get = (n) => lines[n - 1] || '';
  const note = (i) => explainLine(steps, i, describeStep(steps, i), get);
  equal('注釈: 代入', note(1), 'total に 0 が入った');
  equal('注釈: for の 1 回目', note(2), 'n に 3 が入った（1 回目）');
  equal('注釈: 条件が成り立つ', note(3), 'n > 2 は 成り立つ → 中を実行');
  equal('注釈: 値が変わった', note(4), 'total が 0 → 3 になった');
  equal('注釈: for の 2 回目', note(5), 'n に 1 が入った（2 回目）');
  equal('注釈: 条件が成り立たない', note(6), 'n > 2 は 成り立たない → とばす');
  equal('注釈: くり返しの終わり', note(7), 'くり返しを終えた → for の外へ');
  // if が成り立たず else に進む（else の行は記録に出てこない）
  {
    const L = ['a = 0', 'if a:', '    x = 1', 'else:', '    y = 2'];
    const st = [S(1, {}), S(2, { a: 0 }), S(5, { a: 0 }), S(5, { a: 0, y: 2 })];
    equal('注釈: else に進むときは成り立たない', explainLine(st, 2, describeStep(st, 2), (n) => L[n - 1]), 'a は 成り立たない → else の中へ');
  }
  // 条件の中で自分の関数を呼んで、戻ってきてから中へ進む
  {
    const L = ['def f(v):', '    return v', 'if f(1):', '    print(1)'];
    const F = (line, ev = 'line') => ({ line, event: ev, func: 'f', vars: V({ v: 1 }), output: '' });
    const st = [S(1, {}), S(3, {}), F(2), F(2, 'return'), S(4, {})];
    equal('注釈: 関数を呼ぶ条件でも、成り立てば中へ', explainLine(st, 4, describeStep(st, 4), (n) => L[n - 1]).endsWith('成り立つ → 中を実行'), true);
  }
  // 同じ値がくり返し入っても、くり返しは続いている
  {
    const L = ['for x in [1, 1]:', '    print(x)', 'print(0)'];
    const st = [S(1, {}), S(2, { x: 1 }), S(1, { x: 1 }), S(2, { x: 1 }), S(1, { x: 1 }), S(3, { x: 1 })];
    equal('注釈: 値が同じでも 2 回目', explainLine(st, 3, describeStep(st, 3), (n) => L[n - 1]), 'x に 1 が入った（2 回目）');
  }
  // 入れ子の for は、外が回るたびに 1 回目から数えなおす
  {
    const L = ['for i in [0, 1]:', '    for j in [0, 1]:', '        pass', 'print(0)'];
    const st = [
      S(1, {}), S(2, { i: 0 }), S(3, { i: 0, j: 0 }), S(2, { i: 0, j: 0 }), S(3, { i: 0, j: 1 }), S(2, { i: 0, j: 1 }),
      S(1, { i: 0, j: 1 }), S(2, { i: 1, j: 1 }), S(3, { i: 1, j: 0 }),
    ];
    equal('注釈: 内側の for は数えなおす', explainLine(st, 8, describeStep(st, 8), (n) => L[n - 1]), 'j に 0 が入った（1 回目）');
  }
  // サイドバーの字下げの例: 外の print は 1 回、中の print はくり返すたび
  const outside = indentTrace(false);
  const inside = indentTrace(true);
  equal('字下げの例: 外なら最後に 1 回だけ表示', outside[outside.length - 1].out.join(','), '6');
  equal('字下げの例: 中ならくり返すたびに表示', inside[inside.length - 1].out.join(','), '1,3,6');
  equal('字下げの例: 外の print は最後の行', outside[outside.length - 1].line, 3);
  const h = variableHistory(steps, 7);
  equal('変数: 出てきた順', h.order.join(','), 'total,n');
  equal('変数: 値の移りかわり', h.history.total.join('→'), '0→3');
  equal('変数: 同じ値はまとめる', h.history.n.join('→'), '3→1');
}

/* ============================================================
 * 6. まとめ
 * ========================================================== */

process.stdout.write('\n' + '='.repeat(56) + '\n');
if (!failures.length) {
  process.stdout.write(`すべて成功しました（${passed} 件）\n`);
  process.exit(0);
}

process.stdout.write(`成功 ${passed} 件 / 失敗 ${failures.length} 件\n\n`);
for (const failure of failures) {
  process.stdout.write(`✗ ${failure.name}${failure.detail}\n`);
}
process.exit(1);
