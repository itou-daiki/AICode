// tests/run-node.mjs
// ブラウザなしで確かめられるモジュールの検査。
//
//   node tests/run-node.mjs
//
// 対象: pyformat / humanize / flowchart / pycomplete
// ブラウザが要るもの（ブロック変換・ステップ実行・p5）は tests/browser.html で確かめる。

import { autoIndent, formatCode } from '../module/pyformat.js';
import { humanizeStatement, humanizeCondition, humanizeValue } from '../module/humanize.js';
import { pythonToMermaid, parsePython } from '../module/flowchart.js';
import { getCompletions, analyzeCode } from '../module/pycomplete.js';
import { explainError } from '../module/pyrun.js';
import { sameOutput } from '../module/grade.js';

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

  for (const line of definition.split('\n').map(l => l.trim())) {
    if (!line || line === 'flowchart TD' || line.startsWith('classDef') ||
        line.startsWith('class ') || line.startsWith('subgraph') || line === 'end' ||
        line === 'direction TB') continue;

    const edge = line.match(/^(n\d+)\s*-->(?:\|[^|]*\|)?\s*(n\d+)$/);
    if (edge) { edges.push([edge[1], edge[2]]); continue; }

    const node = line.match(/^(n\d+)[([{]/);
    if (node) { declared.add(node[1]); continue; }

    return { error: `読み取れない行: ${line}` };
  }
  return { declared, edges };
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

    // 線の両端は、必ず宣言された図形であること
    const missing = info.edges.flat().filter(id => !info.declared.has(id));
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

  // undefined が文に混ざらないこと（これが出ると読めなくなる）
  for (const code of ['background()', 'fill(1, 2)', 'circle(1)', 'rect(1, 2)']) {
    const text = humanizeStatement(code);
    check(`描画の言いかえ: ${code} に undefined が出ない`, !text.includes('undefined'), `\n  実際: ${text}`);
  }
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
