// tests/run-browser.js
// ブラウザが必要な部分の検査。tests/browser.html から読み込まれる。
//
//   ・Python ⇄ ブロック の往復（意味が変わらないか）
//   ・ステップ実行の記録
//   ・p5 ライブラリ（描画・数学・色）
//   ・共有リンクの圧縮と復元

import { pythonToBlocks } from '../module/py2blocks.js';
import { defineBlocks, buildToolbox } from '../module/blockdefs.js';
import { P5_PYTHON_LIBRARY } from '../module/p5lib.js';
import { runUserCode, suggestFix } from '../module/pyrun.js';
import { toKtph } from '../module/ktph.js';
import { loadIndex, loadCourse, loadMockSet, findByRef, fillBlanks, correctPicks, problemRef } from '../module/lessons-data.js';
import { runProgram, runTests, traceGroundTruth, inputLines } from '../module/lessons-run.js';
import { sameOutput, sameAnswer, gradeTests } from '../module/grade.js';
import { recordTrace, changedVariables, changedItems, namesInLine } from '../module/stepper.js';
import { makeShareUrl, takeCodeFromUrl } from '../module/ui.js';
import { buildToolbox as buildToolboxAgain } from '../module/blockdefs.js';
import { pythonToMermaid } from '../module/flowchart.js';

/* ============================================================
 * 検査の道具
 * ========================================================== */

let passed = 0;
const failures = [];
const log = document.getElementById('log');
const summary = document.getElementById('summary');

function check(name, condition, detail = '') {
  if (condition) { passed++; return; }
  failures.push({ name, detail });
  const line = document.createElement('div');
  line.className = 'fail';
  line.textContent = `✗ ${name}${detail}`;
  log.appendChild(line);
}

function equal(name, got, want) {
  check(name, got === want, `\n  期待: ${JSON.stringify(want)}\n  実際: ${JSON.stringify(got)}`);
}

function group(title) {
  const line = document.createElement('div');
  line.className = 'group';
  line.textContent = `■ ${title}`;
  log.appendChild(line);
  summary.textContent = `検査中… ${title}（成功 ${passed} / 失敗 ${failures.length}）`;
}

const wait = () => new Promise(resolve => setTimeout(resolve, 0));

/* ============================================================
 * 検査に使う Python コード
 * ========================================================== */

/** 往復させて、実行結果が変わらないか確かめるプログラム（入力はあらかじめ用意する） */
const PROGRAMS = [
  { name: 'あいさつ', inputs: ['たろう'], code: `name = input("名前は？")\nprint("こんにちは " + name)\n` },
  { name: 'FizzBuzz', inputs: [], code: `for i in range(1, 21):\n    if i % 15 == 0:\n        print("FizzBuzz")\n    elif i % 3 == 0:\n        print("Fizz")\n    elif i % 5 == 0:\n        print("Buzz")\n    else:\n        print(i)\n` },
  { name: '合計と平均', inputs: [], code: `scores = [80, 92, 71]\ntotal = 0\nfor s in scores:\n    total = total + s\nprint(total)\nprint(total / len(scores))\n` },
  { name: 'while と break', inputs: [], code: `n = 0\nwhile True:\n    n = n + 1\n    if n > 10:\n        break\n    if n % 2 == 0:\n        continue\n    print(n)\n` },
  { name: '関数', inputs: [], code: `def bmi(weight, height):\n    return weight / (height ** 2)\n\nprint(bmi(60, 1.7))\n` },
  { name: 'try / except', inputs: ['0'], code: `x = int(input("数は？"))\ntry:\n    print(10 / x)\nexcept ZeroDivisionError:\n    print("0 では割れません")\n` },
  { name: '入れ子のループ', inputs: [], code: `for i in range(3):\n    for j in range(3):\n        if i == j:\n            continue\n        print(i, j)\n` },
  { name: '辞書', inputs: [], code: `data = {"名前": "たろう", "点数": 80}\nfor key in data:\n    print(key)\nprint(data["名前"])\n` },
  { name: '文字列のメソッド', inputs: [], code: `s = "  Hello World  "\nprint(s.strip().upper())\nparts = s.strip().split(" ")\nprint(len(parts))\n` },
  { name: '計算いろいろ', inputs: [], code: `a = 17\nb = 5\nprint(a + b, a - b, a * b, a / b, a % b, a ** 2)\nprint(a > b and b > 0)\nprint(not (a == b))\n` },
  { name: 'リストの操作', inputs: [], code: `items = []\nfor i in range(5):\n    items.append(i * i)\nitems.sort()\nprint(items)\nprint(items[0], items[-1])\n` },
  { name: '共通テストの二分探索', inputs: [], code: `Data = [3, 18, 29, 33, 48]\natai = 29\nhidari = 0\nmigi = len(Data) - 1\nowari = 0\nwhile hidari <= migi and owari == 0:\n    aida = (hidari + migi) // 2\n    if Data[aida] == atai:\n        print(aida)\n        owari = 1\n    elif Data[aida] < atai:\n        hidari = aida + 1\n    else:\n        migi = aida - 1\n` },
  { name: '複合代入と添字', inputs: [], code: `Data = [1, 2, 3]\ngokei = 0\nfor i in range(3):\n    gokei += Data[i]\nprint(gokei)\nprint(sum(Data), max(Data), min(Data))\n` },
  { name: 'クラス', inputs: [], code: `class Dog:\n    def __init__(self, name):\n        self.name = name\n\n    def bark(self):\n        print(self.name)\n\npochi = Dog("ポチ")\npochi.bark()\n` },
];

/** 描画モードのコード（p5 のブロックに変換されるか確かめる） */
const DRAWING_PROGRAMS = [
  { name: '静止画', code: `p5.background(240, 240, 250)\np5.fill(255, 0, 0)\np5.circle(200, 200, 80)\np5.no_stroke()\np5.rect(50, 50, 100, 60)\n` },
  { name: 'アニメーション', code: `def setup():\n    p5.background(245, 246, 250)\n\ndef draw():\n    x = 200 + 130 * cos(frameCount * 0.05)\n    p5.circle(x, 200, 26)\n` },
];

/* ============================================================
 * 実行のしかけ
 * ========================================================== */

let pyodide = null;

/**
 * Python を動かして、表示された文字を返す
 * @param {string} code
 * @param {string[]} inputs input() が使う値
 * @returns {Promise<string>}
 */
async function runPython(code, inputs = []) {
  pyodide.globals.set('_test_code', code);
  pyodide.globals.set('_test_inputs', JSON.stringify(inputs));
  return pyodide.runPythonAsync(`
import io, json, sys, traceback

_values = iter(json.loads(_test_inputs))


def _fake_input(prompt=''):
    try:
        return next(_values)
    except StopIteration:
        return ''


_out = io.StringIO()
_orig = sys.stdout
sys.stdout = _out
try:
    exec(compile(_test_code, '<test>', 'exec'), {'__name__': '__main__', 'input': _fake_input})
except Exception:
    traceback.print_exc(file=_out)
finally:
    sys.stdout = _orig

_out.getvalue()
`);
}

/* ============================================================
 * 1. Python ⇄ ブロック の往復
 * ========================================================== */

async function testRoundTrip(workspace, programs, { behaviour }) {
  for (const program of programs) {
    await wait();

    const first = pythonToBlocks(program.code, workspace);
    check(`往復: ${program.name} が変換できる`, first.ok, `\n  ${first.error || ''}`);
    const generated = Blockly.Python.workspaceToCode(workspace);

    // もう一度往復させても、同じコードになること（安定していること）
    pythonToBlocks(generated, workspace);
    const again = Blockly.Python.workspaceToCode(workspace);
    equal(`往復: ${program.name} は2回目も同じコード`, again, generated);

    // ブロックが1つも作られていないのは、明らかにおかしい
    check(`往復: ${program.name} のブロックができている`,
      workspace.getAllBlocks(false).length > 0);

    // どのブロックにも「元は何行目か」の印が付いていること
    const tagged = workspace.getAllBlocks(false).filter(b => b.data).length;
    check(`往復: ${program.name} に行番号の印が付く`, tagged > 0,
      `\n  印のあるブロック: ${tagged} 個`);

    if (!behaviour) continue;

    // いちばん大事な確認: 往復させても、動かした結果が変わらないこと
    const before = await runPython(program.code, program.inputs);
    const after = await runPython(generated, program.inputs);
    equal(`往復: ${program.name} は実行結果が変わらない`, after, before);
  }
}

/* ============================================================
 * 2. ステップ実行
 * ========================================================== */

async function testStepper() {
  const code = `scores = [80, 92]
total = 0
for s in scores:
    total = total + s
info = {"合計": total}
print(info)
`;
  const trace = await recordTrace(pyodide, code, []);

  check('ステップ: 記録できる', trace.steps.length > 0);
  check('ステップ: エラーが無い', !trace.error, `\n  ${trace.error}`);
  check('ステップ: 途中で切れていない', !trace.truncated);

  const last = trace.steps[trace.steps.length - 1];
  equal('ステップ: 最後の出力', last.output.trim(), "{'合計': 172}");
  equal('ステップ: total の値', last.vars.total.repr, '172');
  equal('ステップ: total の型', last.vars.total.label, '整数');
  equal('ステップ: scores の型', last.vars.scores.label, 'リスト');
  equal('ステップ: scores の要素数', last.vars.scores.size, 2);
  equal('ステップ: scores の中身', JSON.stringify(last.vars.scores.items), '[["0","80"],["1","92"]]');
  equal('ステップ: info の型', last.vars.info.label, '辞書');
  equal('ステップ: info の中身', JSON.stringify(last.vars.info.items), '[["\'合計\'","172"]]');

  // 行番号が、実際の行の範囲におさまっていること
  const lineCount = code.split('\n').length;
  const badLines = trace.steps.filter(s => s.line < 1 || s.line > lineCount);
  check('ステップ: 行番号が正しい', badLines.length === 0, `\n  ${badLines.length} 件が範囲外`);

  // 変わった変数・要素の見つけ方
  const changedNames = changedVariables(
    { total: { repr: '80' } }, { total: { repr: '172' } });
  check('ステップ: 変わった変数が分かる', changedNames.has('total'));

  const changedKeys = changedItems({ items: [['0', '80']] }, { items: [['0', '80'], ['1', '92']] });
  check('ステップ: 増えた要素が分かる', changedKeys.has('1') && !changedKeys.has('0'));

  const names = namesInLine('total = total + s  # "コメントの中の x" は数えない');
  check('ステップ: 行の中の名前が拾える', names.has('total') && names.has('s'));
  check('ステップ: 文字列の中は拾わない', !names.has('コメントの中の'));

  // エラーで止まるコードも記録できること
  const broken = await recordTrace(pyodide, 'x = 1\nprint(y)\n', []);
  check('ステップ: エラーも記録できる', broken.steps.length > 0);
  check('ステップ: エラーの中身が分かる', String(broken.error).includes('NameError'),
    `\n  ${broken.error}`);

  // 文法エラーはやさしく伝えること
  const syntax = await recordTrace(pyodide, 'if x\n', []);
  check('ステップ: 文法エラーを伝える', String(syntax.error).includes('文法エラー'),
    `\n  ${syntax.error}`);

  // 入力を使うコード
  const withInput = await recordTrace(pyodide, 'name = input("名前は？")\nprint(name)\n', ['はなこ']);
  equal('ステップ: 入力を使える', withInput.steps[withInput.steps.length - 1].output.trim(),
    '名前は？はなこ\nはなこ');

  // 終わらないループでも止まること
  const endless = await recordTrace(pyodide, 'while True:\n    x = 1\n', []);
  check('ステップ: 終わらないループでも止まる', endless.truncated);
}

/* ============================================================
 * 3. p5 ライブラリ
 * ========================================================== */

/** p5 の点検（Python 側で一気に確かめる） */
const P5_CHECK = String.raw`
import json, math

results = []


def check(name, fn, expect=None, tol=1e-9):
    try:
        got = fn()
    except Exception as e:
        results.append([name, False, '{}: {}'.format(type(e).__name__, e)])
        return
    if expect is None:
        results.append([name, True, ''])
        return
    ok = (abs(got - expect) <= tol) if isinstance(expect, (int, float)) and isinstance(got, (int, float)) else (got == expect)
    results.append([name, bool(ok), '' if ok else '期待 {} / 実際 {}'.format(expect, got)])


def px(x, y):
    d = p5.ctx.getImageData(x, y, 1, 1).data
    return [d[0], d[1], d[2], d[3]]


# --- 定数 ---
check('PI', lambda: PI, math.pi)
check('TWO_PI', lambda: TWO_PI, math.pi * 2)
check('HALF_PI', lambda: HALF_PI, math.pi / 2)
check('QUARTER_PI', lambda: QUARTER_PI, math.pi / 4)

# --- 面と色 ---
for name, fn in [
    ('clear', lambda: p5.clear()),
    ('background(3)', lambda: p5.background(240, 240, 250)),
    ('background(1)', lambda: p5.background(200)),
    ('fill(3)', lambda: p5.fill(255, 0, 0)),
    ('fill(4)', lambda: p5.fill(255, 0, 0, 128)),
    ('fill(1)', lambda: p5.fill(120)),
    ('no_fill', lambda: p5.no_fill()),
    ('stroke(3)', lambda: p5.stroke(0, 255, 0)),
    ('no_stroke', lambda: p5.no_stroke()),
    ('stroke_weight', lambda: p5.stroke_weight(3)),
    ('stroke_cap', lambda: p5.stroke_cap('round')),
    ('stroke_join', lambda: p5.stroke_join('round')),
    ('color_mode', lambda: p5.color_mode('rgb')),
]:
    check('p5.' + name, fn)

# --- かたち ---
p5.fill(200, 200, 255)
p5.stroke(0, 0, 0)
for name, fn in [
    ('circle', lambda: p5.circle(200, 200, 80)),
    ('ellipse(4)', lambda: p5.ellipse(200, 200, 120, 80)),
    ('ellipse(3)', lambda: p5.ellipse(200, 200, 100)),
    ('rect(4)', lambda: p5.rect(100, 100, 80, 60)),
    ('rect(角丸)', lambda: p5.rect(100, 100, 80, 60, 10, 10, 10, 10)),
    ('rect(3)', lambda: p5.rect(100, 100, 60)),
    ('square', lambda: p5.square(150, 150, 50)),
    ('line', lambda: p5.line(0, 0, 400, 400)),
    ('point', lambda: p5.point(200, 200)),
    ('triangle', lambda: p5.triangle(200, 100, 150, 200, 250, 200)),
    ('quad', lambda: p5.quad(50, 50, 150, 60, 140, 150, 40, 140)),
    ('arc', lambda: p5.arc(200, 200, 100, 100, 0, PI)),
    ('text', lambda: p5.text('Hello', 100, 100)),
    ('text_size', lambda: p5.text_size(24)),
    ('text_align(2)', lambda: p5.text_align('center', 'middle')),
    ('text_align(1)', lambda: p5.text_align('left')),
    ('text_leading', lambda: p5.text_leading(20)),
    ('push', lambda: p5.push()),
    ('translate', lambda: p5.translate(200, 200)),
    ('rotate', lambda: p5.rotate(PI / 4)),
    ('scale(2)', lambda: p5.scale(2, 2)),
    ('scale(1)', lambda: p5.scale(0.5)),
    ('pop', lambda: p5.pop()),
    ('reset_matrix', lambda: p5.reset_matrix()),
    ('begin_frame', lambda: p5.begin_frame()),
    ('frame_rate（設定）', lambda: frame_rate(30)),
    ('frameRate（p5.js のつづり）', lambda: frameRate(60)),
    ('frame_rate（読み取り）', lambda: frame_rate()),
    ('erase', lambda: p5.erase()),
    ('no_erase', lambda: p5.no_erase()),
    ('blend_mode(multiply)', lambda: p5.blend_mode('multiply')),
    ('blend_mode(BLEND)', lambda: p5.blend_mode('BLEND')),
    ('bezier', lambda: p5.bezier(50, 50, 100, 100, 300, 100, 350, 350)),
    ('curve', lambda: p5.curve(50, 50, 100, 100, 300, 100, 350, 350)),
    ('polygon', lambda: p5.polygon(100, 100, 200, 100, 150, 200)),
]:
    check('p5.' + name, fn)

check('p5.text_width', lambda: p5.text_width('Hello') > 0, True)
check('p5.get_pixel', lambda: len(p5.get_pixel(10, 10)) == 4, True)
check('p5.width', lambda: p5.width, 400)
check('p5.height', lambda: p5.height, 400)


def shape():
    p5.begin_shape()
    p5.vertex(100, 100)
    p5.vertex(200, 50)
    p5.vertex(300, 100)
    p5.end_shape('CLOSE')


def vertex_curves():
    p5.begin_shape()
    p5.vertex(50, 50)
    p5.quadratic_vertex(100, 20, 150, 50)
    p5.bezier_vertex(200, 20, 250, 80, 300, 50)
    p5.curve_vertex(320, 60)
    p5.end_shape()


check('p5.begin_shape / vertex / end_shape', shape)
check('p5.quadratic_vertex / bezier_vertex / curve_vertex', vertex_curves)

# --- モード（前は呼べなかったところ）---
check('p5.angle_mode(degrees)', lambda: p5.angle_mode('degrees'))
check('角度モードが変わる', lambda: p5._angle_mode, 'degrees')
check('p5.angle_mode(radians)', lambda: p5.angle_mode('radians'))
check('p5.rect_mode(center)', lambda: p5.rect_mode('center'))
check('矩形モードが変わる', lambda: p5._rect_mode, 'center')
check('p5.rect_mode(corner)', lambda: p5.rect_mode('corner'))
check('p5.ellipse_mode(corner)', lambda: p5.ellipse_mode('corner'))
check('楕円モードが変わる', lambda: p5._ellipse_mode, 'corner')
check('p5.ellipse_mode(center)', lambda: p5.ellipse_mode('center'))


def bad_mode():
    try:
        p5.angle_mode('でたらめ')
        return 'エラーが出なかった'
    except ValueError:
        return 'エラーが出た'


check('知らない値はエラーになる', bad_mode, 'エラーが出た')


def bad_blend():
    try:
        p5.blend_mode('でたらめ')
        return 'エラーが出なかった'
    except ValueError:
        return 'エラーが出た'


check('知らない重ね方もエラーになる', bad_blend, 'エラーが出た')

# --- 数・三角関数・色・時刻 ---
check('random()', lambda: 0 <= random() < 1, True)
check('random(10)', lambda: 0 <= random(10) < 10, True)
check('random(5,10)', lambda: 5 <= random(5, 10) < 10, True)
check('random_seed', lambda: random_seed(1))
check('random_gaussian', lambda: isinstance(random_gaussian(), float), True)
check('noise', lambda: 0 <= noise(0.1, 0.2) <= 1, True)
check('noise_seed', lambda: noise_seed(3))
check('map_value', lambda: map_value(50, 0, 100, 0, 10), 5)
check('constrain(上)', lambda: constrain(5, 0, 3), 3)
check('constrain(下)', lambda: constrain(-5, 0, 3), 0)
check('lerp', lambda: lerp(0, 100, 0.5), 50)
check('norm', lambda: norm(50, 0, 100), 0.5)
check('dist', lambda: dist(0, 0, 3, 4), 5)
check('sq', lambda: sq(4), 16)
check('sqrt', lambda: sqrt(9), 3)
check('pow', lambda: pow(2, 10), 1024)
check('exp', lambda: exp(0), 1)
check('log', lambda: log(math.e), 1)
check('abs', lambda: abs(-3), 3)
check('ceil', lambda: ceil(1.2), 2)
check('floor', lambda: floor(1.8), 1)
check('round', lambda: round(1.6), 2)
check('round(2桁)', lambda: round(1.2345, 2), 1.23)
check('min', lambda: min(3, 1, 2), 1)
check('max', lambda: max(3, 1, 2), 3)
check('sin', lambda: sin(0), 0)
check('cos', lambda: cos(0), 1)
check('tan', lambda: tan(0), 0)
check('asin', lambda: asin(0), 0)
check('acos', lambda: acos(1), 0)
check('atan', lambda: atan(0), 0)
check('atan2', lambda: atan2(0, 1), 0)
check('degrees', lambda: degrees(math.pi), 180)
check('radians', lambda: radians(180), math.pi)
check('color', lambda: color(10, 20, 30) is not None, True)
check('red', lambda: red(color(10, 20, 30)), 10)
check('green', lambda: green(color(10, 20, 30)), 20)
check('blue', lambda: blue(color(10, 20, 30)), 30)
check('alpha', lambda: alpha(color(10, 20, 30, 128)), 128)
check('lerp_color', lambda: lerp_color(color(0, 0, 0), color(100, 100, 100), 0.5) is not None, True)
check('millis', lambda: millis() >= 0, True)
check('second', lambda: 0 <= second() <= 60, True)
check('minute', lambda: 0 <= minute() <= 60, True)
check('hour', lambda: 0 <= hour() <= 23, True)
check('day', lambda: 1 <= day() <= 31, True)
check('month', lambda: 1 <= month() <= 12, True)
check('year', lambda: year() >= 2000, True)

# --- 実際に描けているか（画素で確かめる）---
p5.begin_frame()
p5.background(255, 255, 255)
p5.fill(255, 0, 0)
p5.no_stroke()
p5.rect(150, 150, 100, 100)
check('四角が塗られる', lambda: px(200, 200)[:3], [255, 0, 0])
check('外側は塗られない', lambda: px(50, 50)[:3], [255, 255, 255])

p5.begin_frame()
p5.background(255, 255, 255)
p5.fill(255, 0, 0)
p5.push()
p5.translate(200, 200)
p5.rotate(PI / 4)
p5.rect(-50, -50, 100, 100)
p5.pop()
check('回転すると真上が塗られる', lambda: px(200, 140)[:3], [255, 0, 0])

p5.begin_frame()
p5.background(255, 255, 255)
p5.fill(255, 0, 0)
p5.rect(150, 150, 100, 100)
check('回転しないと真上は塗られない', lambda: px(200, 140)[:3], [255, 255, 255])

p5.begin_frame()
p5.background(255, 255, 255)
p5.angle_mode('degrees')
p5.fill(255, 140, 0)
p5.push()
p5.translate(200, 200)
p5.rotate(45)
p5.rect(-50, -50, 100, 100)
p5.pop()
p5.angle_mode('radians')
check('度でも回転できる', lambda: px(200, 140)[:3], [255, 140, 0])

p5.begin_frame()
p5.background(255, 255, 255)
p5.fill(0, 0, 255)
p5.push()
p5.translate(100, 100)
p5.rect(0, 0, 50, 50)
p5.pop()
check('移動先が塗られる', lambda: px(120, 120)[:3], [0, 0, 255])
check('移動元は塗られない', lambda: px(20, 20)[:3], [255, 255, 255])

p5.begin_frame()
p5.background(255, 255, 255)
p5.fill(0, 150, 0)
p5.push()
p5.scale(2, 2)
p5.rect(10, 10, 20, 20)
p5.pop()
check('拡大した内側が塗られる', lambda: px(50, 50)[:3], [0, 150, 0])
check('拡大した外側は塗られない', lambda: px(70, 70)[:3], [255, 255, 255])

p5.begin_frame()
p5.ctx.clearRect(0, 0, 400, 400)
p5.fill(0, 0, 0)
p5.no_stroke()
p5.rect(100, 100, 200, 200)
p5.erase()
p5.circle(200, 200, 100)
p5.no_erase()
check('消しゴムで透明になる', lambda: px(200, 200)[3], 0)
check('消していないところは残る', lambda: px(110, 110)[3], 255)

p5.begin_frame()
p5.ctx.clearRect(0, 0, 400, 400)
p5.fill(0, 0, 0)
p5.rect(100, 100, 200, 200)
p5.erase(128)
p5.circle(200, 200, 100)
p5.no_erase()
check('半分だけ消せる', lambda: 100 <= px(200, 200)[3] <= 160, True)

p5.begin_frame()
p5.background(255, 255, 255)
p5.no_stroke()
p5.fill(0, 0, 0)
p5.circle(200, 200, 50)
check('no_stroke のあと点は描かれない', lambda: (p5.point(10, 10), px(10, 10)[:3])[1], [255, 255, 255])

p5.begin_frame()
p5.background(255, 255, 255)
p5.stroke(0, 0, 255)
p5.stroke_weight(9)
p5.point(50, 50)
check('点は線の太さで描かれる', lambda: px(50, 50)[:3], [0, 0, 255])

json.dumps({'total': len(results), 'failed': [r for r in results if not r[1]]}, ensure_ascii=False)
`;

/* ============================================================
 * 1.5 ツールボックスの全ブロックが、正しい Python を作れるか
 * ========================================================== */

/** ツールボックスの中から、置けるブロックの種類をすべて集める */
function collectToolboxBlocks(toolbox) {
  const types = [];
  const walk = (items) => {
    for (const item of items || []) {
      if (item.kind === 'category') walk(item.contents);
      else if (item.kind === 'block') types.push(item);
    }
  };
  walk(toolbox.contents);
  return types;
}

async function testEveryBlock(workspace) {
  const toolbox = buildToolboxAgain({ drawing: true });
  const entries = collectToolboxBlocks(toolbox);
  check('全ブロック: ツールボックスから集められる', entries.length > 30,
    `\n  集まった数: ${entries.length}`);

  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.type)) continue;
    seen.add(entry.type);
    await wait();

    workspace.clear();
    let block;
    try {
      block = Blockly.serialization.blocks.append({ ...entry, kind: undefined }, workspace,
        { recordUndo: false });
    } catch (e) {
      failures.push({ name: `全ブロック: ${entry.type} が置けない`, detail: `\n  ${e.message}` });
      continue;
    }
    passed++;

    // 値ブロックは単体ではコードにならないので、変数に入れて確かめる
    let code;
    try {
      if (block.outputConnection) {
        const holder = Blockly.serialization.blocks.append(
          { type: 'variables_set', fields: { VAR: { name: 'x' } } }, workspace, { recordUndo: false });
        holder.getInput('VALUE').connection.connect(block.outputConnection);
        code = Blockly.Python.workspaceToCode(workspace);
      } else {
        code = Blockly.Python.workspaceToCode(workspace);
      }
    } catch (e) {
      failures.push({ name: `全ブロック: ${entry.type} のコードが作れない`, detail: `\n  ${e.message}` });
      continue;
    }

    check(`全ブロック: ${entry.type} がコードになる`, code.trim().length > 0, `\n  空でした`);

    // できたコードが Python として読めるか、実際に確かめる。
    // break / continue はループの中でしか使えないので、ループに入れてから見る。
    const needsLoop = entry.type === 'controls_flow_statements';
    const testable = needsLoop
      ? 'while True:\n' + code.split('\n').map(l => '    ' + l).join('\n')
      : code;
    pyodide.globals.set('_block_code', testable);
    const problem = pyodide.runPython(`
try:
    compile(_block_code, '<block>', 'exec')
    _result = ''
except SyntaxError as e:
    _result = '{} ({} 行目)'.format(e.msg, e.lineno)
_result
`);
    check(`全ブロック: ${entry.type} が読める Python になる`, problem === '',
      `\n  ${problem}\n  作られたコード:\n${code}`);
  }

  workspace.clear();
}

/* ============================================================
 * 1.6 大きなコードでもフローチャートが壊れないこと
 * ========================================================== */

function testBigFlowchart() {
  // 図形の上限（250）を超える大きさのコードを作る
  const lines = [];
  for (let i = 0; i < 200; i++) {
    lines.push(`x${i} = ${i}`);
    lines.push(`if x${i} > 10:`);
    lines.push(`    print(x${i})`);
  }
  const big = lines.join('\n') + '\n';

  const started = performance.now();
  const result = pythonToMermaid(big);
  const elapsed = performance.now() - started;

  check('大きなコード: 図がとちゅうまで作られる', Boolean(result.definition));
  check('大きなコード: 上限を伝えるメッセージが出る',
    String(result.message).includes('途中まで'), `\n  ${result.message}`);
  check('大きなコード: 図形が上限を超えない',
    (result.definition.match(/^\s*n\d+[([{]/gm) || []).length <= 251);
  check('大きなコード: 作るのに時間がかかりすぎない', elapsed < 3000,
    `\n  ${elapsed.toFixed(0)} ミリ秒`);
}

/* ============================================================
 * 3.6 コードの実行とエラーの見せかた
 * ========================================================== */

async function testRunner() {
  const cases = [
    { code: 'print("こんにちは")', 出力: 'こんにちは\n', エラー: null },
    { code: 'a = 1\nb = 2\nprint(kazu)', 行: 3, 種類: 'NameError' },
    { code: 'print(1', 行: 1, 種類: 'SyntaxError' },
    { code: 'x = 10\nprint(x / 0)', 行: 2, 種類: 'ZeroDivisionError' },
    { code: 'nums = [1, 2]\nfor n in nums:\n    print(nums[5])', 行: 3, 種類: 'IndexError' },
  ];

  for (const c of cases) {
    const result = await runUserCode(pyodide, c.code, { seconds: 5 });
    if (c.エラー === null) {
      equal(`実行: ${c.code.slice(0, 16)} の出力`, result.output, c.出力);
      check(`実行: ${c.code.slice(0, 16)} はエラーにならない`, result.error === null);
      continue;
    }
    check(`実行: ${c.種類} が返る`, result.error && result.error.type === c.種類,
      `\n  実際: ${JSON.stringify(result.error)}`);
    check(`実行: ${c.種類} の行番号が ${c.行} 行目`, result.error && result.error.line === c.行,
      `\n  実際: ${result.error && result.error.line} 行目`);
  }

  // 終わらないコードは、決めた時間で止まること
  const started = performance.now();
  const stuck = await runUserCode(pyodide, 'while True:\n    pass', { seconds: 2 });
  const seconds = (performance.now() - started) / 1000;
  check('実行: 終わらないコードが止まる', stuck.error && stuck.error.type === 'TimeoutError',
    `\n  実際: ${JSON.stringify(stuck.error)}`);
  check('実行: 決めた時間のあたりで止まる', seconds < 8, `\n  ${seconds.toFixed(1)} 秒`);
}

/* ============================================================
 * 3.7 描画は p5.js のリファレンスどおりに書ける
 * ========================================================== */

async function testP5BareNames() {
  const cases = [
    ['前置きなし', 'background(240)\nfill(255, 0, 0)\ncircle(200, 200, 100)'],
    ['camelCase', 'strokeWeight(4)\nnoFill()\nrect(10, 10, 50, 50)'],
    ['snake_case', 'stroke_weight(4)\nno_fill()\nrect(10, 10, 50, 50)'],
    ['p5. つき', 'p5.background(0)\np5.circle(10, 10, 5)'],
  ];
  for (const [name, code] of cases) {
    const result = await runUserCode(pyodide, code, { useGlobals: true, seconds: 5 });
    check(`描画: ${name} で書ける`, result.error === null, `\n  ${JSON.stringify(result.error)}`);
  }

  // Python にもとからある関数は、上書きされていないこと
  const builtins = await runUserCode(
    pyodide,
    'print(abs(-5), round(3.14159, 2), min(3, 1), max([4, 9]), pow(2, 10))',
    { useGlobals: true, seconds: 5 },
  );
  equal('描画: Python の関数がそのまま使える', builtins.output.trim(), '5 3.14 1 9 1024');

  // 外の変数を関数の中で書きかえたときは、Python のきまりどおり止まること。
  // 黙って直さないので、3 つのモードで同じように動く。
  const unbound = await runUserCode(pyodide, `n = 1

def bump():
    n = n + 1

bump()
`, { seconds: 5 });
  check('描画: 外の変数の書きかえは Python のきまりどおり止まる',
    unbound.error !== null && unbound.error.type === 'UnboundLocalError',
    `\n  ${JSON.stringify(unbound.error)}`);

  // その場で「global を書き入れる」直し方が出せること
  const source = `x = 0
d = 1

def draw():
    circle(x, 200, 50)
    x = x + d
`;
  const first = suggestFix(source, { type: 'UnboundLocalError', line: 5, message: "cannot access local variable 'x' where it is not associated with a value" });
  check('直し方: global x を足す形が出る', first !== null && first.name === 'x',
    `\n  ${JSON.stringify(first)}`);
  check('直し方: def のすぐ下に入る',
    first !== null && first.code.split('\n')[4].trim() === 'global x',
    `\n  ${first ? JSON.stringify(first.code.split('\n')[4]) : 'なし'}`);

  const second = suggestFix(first.code, { type: 'UnboundLocalError', line: 7, message: "cannot access local variable 'd' where it is not associated with a value" });
  check('直し方: 2 つめは同じ行にまとめる',
    second !== null && second.code.split('\n')[4].trim() === 'global x, d',
    `\n  ${second ? JSON.stringify(second.code.split('\n')[4]) : 'なし'}`);

  // 直したあとは、本当に動くこと
  const fixed = await runUserCode(pyodide, `${second.code}
draw()
draw()
print(x, d)
`, { useGlobals: true, seconds: 5 });
  equal('直し方: 直したコードは動く', fixed.output.trim(), '2 1');

  // 打ちまちがい（外に無い名前）には、直し方を出さないこと
  const typo = suggestFix(`def draw():
    kazu = kazu + 1
`, { type: 'UnboundLocalError', line: 2, message: "cannot access local variable 'kazu' where it is not associated with a value" });
  check('直し方: 外に無い名前には出さない', typo === null, `\n  ${JSON.stringify(typo)}`);
}


/* ============================================================
 * 3.8 レッスンの中身が、実際の実行結果と合っているか
 *
 * 問題文に書いた答えを人が手で計算すると、まちがいが混ざる。
 * すべて実際に走らせて照らし合わせる。
 * ========================================================== */

async function testLessonContent() {
  const index = await loadIndex('../lessons/');
  const courses = {};
  for (const entry of index.courses) {
    if (entry.kind === 'mock') continue;
    courses[entry.id] = await loadCourse(entry, '../lessons/');
  }

  const seen = new Set();
  let checked = 0;

  for (const [courseId, course] of Object.entries(courses)) {
    for (const lesson of course.lessons) {
      for (const problem of lesson.problems) {
        const ref = problemRef(problem);
        check(`レッスン: ${ref} の id が重ならない`, !seen.has(ref));
        seen.add(ref);
        checked++;

        const prelude = problem.prelude || null;

        // 乱数を使うのに種を決めていないと、実行のたびに答えが変わってしまう
        const usesRandom = /random\s*\(|random\./.test(problem.program || problem.solution || '');
        if (usesRandom) {
          check(`レッスン: ${ref} は乱数の種を決めている`,
            Boolean(prelude && prelude.includes('seed')),
            '\n  乱数を使う問題は prelude で seed を決めてください');
        }

        if (problem.type === 'read') {
          const run = await runProgram(pyodide, {
            code: problem.program || '', prelude, inputs: problem.input, seconds: 6,
          });
          check(`レッスン: ${ref} の見本が動く`, !run.error,
            `\n  ${run.error ? run.error.type + ': ' + run.error.message : ''}`);
          if (problem.expectedOutput !== undefined) {
            check(`レッスン: ${ref} の見本の出力が合う`, sameOutput(run.output, problem.expectedOutput),
              `\n  実際: ${JSON.stringify(run.output)}\n  期待: ${JSON.stringify(problem.expectedOutput)}`);
          }
        }

        if (problem.type === 'trace') {
          const truth = await traceGroundTruth(pyodide, problem);
          check(`レッスン: ${ref} が動く`, !truth.error,
            `\n  ${truth.error ? truth.error.type + ': ' + truth.error.message : ''}`);
          const want = Array.isArray(problem.choices)
            ? problem.choices[problem.answerIndex] : problem.answer;
          check(`レッスン: ${ref} の答えが実行結果と合う`, sameAnswer(truth.value, want),
            `\n  実行: ${JSON.stringify(truth.value)}\n  答え: ${JSON.stringify(want)}`);
        }

        if (problem.type === 'blank') {
          const filled = fillBlanks(problem.program, problem.blanks, correctPicks(problem));
          const run = await runProgram(pyodide, {
            code: filled, prelude, inputs: problem.input, seconds: 6,
          });
          check(`レッスン: ${ref} は正解で埋めると動く`, !run.error,
            `\n  ${run.error ? run.error.type + ': ' + run.error.message : ''}`);
          check(`レッスン: ${ref} の正解の出力が合う`, sameOutput(run.output, problem.expectedOutput),
            `\n  実際: ${JSON.stringify(run.output)}\n  期待: ${JSON.stringify(problem.expectedOutput)}`);
        }

        if (problem.type === 'code' && problem.solution) {
          const results = await runTests(pyodide, {
            code: problem.solution, prelude, tests: problem.tests || [],
          });
          const summary = gradeTests(results);
          check(`レッスン: ${ref} の解答例が全部通る`, summary.ok,
            `\n  ${summary.passed} / ${summary.total}` +
            results.filter(r => !r.ok).map(r =>
              `\n  入力 ${JSON.stringify(r.input)}: 実際 ${JSON.stringify(r.actual)} / 期待 ${JSON.stringify(r.expected)}`).join(''));
        }

        // 共通テスト対策の問題は、表記に直せる書き方だけで書く
        if (courseId === 'kyotsu' && problem.program) {
          const { warnings } = toKtph(problem.program);
          check(`レッスン: ${ref} は共通テスト表記に直せる`, warnings.length === 0,
            `\n  ${JSON.stringify(warnings)}`);
        }
      }
    }
  }

  // 模試の参照が、すべて実在するか
  const mockEntry = index.courses.find(c => c.kind === 'mock');
  const file = await fetch(`../lessons/${mockEntry.file}`).then(r => r.json());
  for (const set of file.sets) {
    const built = loadMockSet(set, courses);
    check(`模試: ${set.id} の問題がすべて見つかる`,
      built.entries.length === set.problems.length,
      `\n  ${built.entries.length} / ${set.problems.length}`);
    const total = set.problems.reduce((sum, p) => sum + p.points, 0);
    check(`模試: ${set.id} の配点が 100 点`, total === 100, `\n  ${total} 点`);
  }

  const line = document.createElement('div');
  line.textContent = `レッスンの問題 ${checked} 問を実行して照合`;
  log.appendChild(line);
}

/* ============================================================
 * 4. 共有リンク
 * ========================================================== */

async function testShareLink() {
  const samples = [
    'print("hi")\n',
    'for i in range(1, 101):\n    print(i)\n'.repeat(20),
    '# 日本語のコメント\nname = "たろう"\nprint(f"{name}さん")\n',
  ];

  for (const code of samples) {
    const url = await makeShareUrl('index.html', code);
    check(`共有リンク: 作れる（${code.length} 文字）`, url.includes('#s='));

    // リンクを開いたときと同じ状態にして、取り出せるか確かめる
    const hash = url.slice(url.indexOf('#'));
    history.replaceState(null, '', location.pathname + hash);
    const restored = await takeCodeFromUrl();
    equal(`共有リンク: 元のコードに戻る（${code.length} 文字）`, restored, code);
  }

  // 長いコードは、圧縮でリンクが短くなること
  const long = 'print("こんにちは")\n'.repeat(60);
  const url = await makeShareUrl('index.html', long);
  check('共有リンク: 圧縮で短くなる', url.length < long.length,
    `\n  コード ${long.length} 文字 → リンク ${url.length} 文字`);

  // 圧縮を使えないブラウザ（Safari 16.3 以前など）でも動くこと
  const savedCompression = window.CompressionStream;
  const savedDecompression = window.DecompressionStream;
  try {
    delete window.CompressionStream;
    delete window.DecompressionStream;
    const plainCode = 'print("圧縮なし")\n';
    const plainUrl = await makeShareUrl('index.html', plainCode);
    history.replaceState(null, '', location.pathname + plainUrl.slice(plainUrl.indexOf('#')));
    equal('共有リンク: 圧縮が使えなくても往復できる', await takeCodeFromUrl(), plainCode);
  } finally {
    window.CompressionStream = savedCompression;
    window.DecompressionStream = savedDecompression;
  }
}

/* ============================================================
 * 実行
 * ========================================================== */

async function main() {
  try {
    group('準備');
    defineBlocks({ drawing: true });
    const workspace = Blockly.inject('blockly-area', { toolbox: buildToolbox({ drawing: true }) });
    check('ブロックの土台ができる', Boolean(workspace));

    summary.textContent = 'Python の準備をしています…（30秒ほどかかります）';
    pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
    pyodide.globals.set('js', window);
    check('Python が動く', Boolean(pyodide));

    group('Python ⇄ ブロック の往復（ふつうのコード）');
    await testRoundTrip(workspace, PROGRAMS, { behaviour: true });

    group('Python ⇄ ブロック の往復（描画のコード）');
    await pyodide.runPythonAsync(P5_PYTHON_LIBRARY);
    await testRoundTrip(workspace, DRAWING_PROGRAMS, { behaviour: false });

    group('ツールボックスの全ブロック');
    await testEveryBlock(workspace);

    group('大きなコードのフローチャート');
    testBigFlowchart();

    group('ステップ実行');
    await testStepper();

    group('p5 ライブラリ');
    const report = JSON.parse(pyodide.runPython(P5_CHECK));
    passed += report.total - report.failed.length;
    for (const [name, , why] of report.failed) {
      failures.push({ name: `p5: ${name}`, detail: `\n  ${why}` });
      const line = document.createElement('div');
      line.className = 'fail';
      line.textContent = `✗ p5: ${name}\n  ${why}`;
      log.appendChild(line);
    }
    const p5line = document.createElement('div');
    p5line.textContent = `p5 の点検 ${report.total} 項目（失敗 ${report.failed.length}）`;
    log.appendChild(p5line);

    group('コードの実行とエラーの見せかた');
    await testRunner();

    group('p5.js のリファレンスどおりの書き方');
    await testP5BareNames();

    group('レッスンの中身');
    await testLessonContent();

    group('共有リンク');
    await testShareLink();
  } catch (error) {
    failures.push({ name: '検査そのものが止まった', detail: `\n  ${error.message}` });
    console.error(error);
  }

  summary.textContent = failures.length
    ? `失敗 ${failures.length} 件 / 成功 ${passed} 件`
    : `すべて成功しました（${passed} 件）`;
  summary.style.color = failures.length ? 'var(--c-bad)' : 'var(--c-ok)';
  window.__testResult = { passed, failed: failures.length, failures };
}

main();
