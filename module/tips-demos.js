// module/tips-demos.js
// 「つまずき解説」の、動かして確かめる例。tips.html の <div data-demo="名前"> に入る。
//
// どの例も、生徒がやりがちな書き方と正しい書き方を並べて、切りかえて動かせるようにしてある。
// 記録は手で書いているので、Python の動きと合っているかを tests/run-node.mjs で確かめる。

import { record, createPlayer, createQuiz } from './tips-kit.js';

const r = (code, depth = 0, extra = {}) => ({ code, depth, ...extra });

/* ============================================================
 * 字下げ
 * ========================================================== */

/** for の中身と外（いちばん基本） */
export function indentBasicSteps() {
  return record(({ set, show, step }) => {
    for (const n of [1, 2, 3]) {
      set('n', n); step(0, `n に ${n} が入った（${n} 回目）→ 中身へ`);
      show(n); step(1, `${n} を表示した（中身なので、くり返すたびに動く）`);
    }
    step(0, 'もう入れる値が無い → くり返しを終えて、外へ');
    show('おわり'); step(2, '「おわり」を表示した（外なので、終わってから 1 回だけ）');
  });
}

/** if の中身は、条件が成り立たないと、とばされる */
export function indentIfSteps(x) {
  return record(({ set, show, step }) => {
    set('x', x); step(0, `x に ${x} を入れた`);
    if (x > 3) {
      step(1, `x > 3 は成り立つ（${x} > 3）→ 中身へ`);
      show('大きい'); step(2, '「大きい」を表示した（if の中身）');
    } else {
      step(1, `x > 3 は成り立たない（${x} > 3 ではない）→ 中身をとばす`);
    }
    show('おわり'); step(3, '「おわり」を表示した（外なので、条件に関係なく動く）');
  });
}

/** print(total) を for の中に入れるか外に置くか */
export function indentTrace(inside) {
  return record(({ set, show, step, get }) => {
    set('total', 0); step(0, 'total に 0 を入れた');
    for (const n of [1, 2, 3]) {
      set('n', n); step(1, `n に ${n} が入った（${n} 回目）→ 中身へ`);
      set('total', get('total') + n); step(2, `total が ${get('total') - n} + ${n} = ${get('total')} になった`);
      if (inside) { show(get('total')); step(3, `${get('total')} を表示した（中身なので、くり返すたびに動く）`); }
    }
    step(1, 'もう入れる値が無い → くり返しを終えて、外へ');
    if (!inside) { show(get('total')); step(3, `${get('total')} を表示した（外なので、終わってから 1 回だけ）`); }
  });
}

/** 入れ子の for。「---」をどの深さに置くかで、表示される回数が変わる */
export function indentNestedSteps(depth) {
  return record(({ set, show, step }) => {
    for (const i of [1, 2]) {
      set('i', i); step(0, `i に ${i} が入った（外側の ${i} 回目）`);
      for (const j of ['a', 'b']) {
        set('j', j); step(1, `j に '${j}' が入った（内側）`);
        show(`${i} ${j}`); step(2, `${i} ${j} を表示した`);
        if (depth === 2) { show('---'); step(3, '--- を表示した（内側の中身）'); }
      }
      step(1, '内側のくり返しを終えた → 外側の中身にもどる');
      if (depth === 1) { show('---'); step(3, '--- を表示した（外側の中身。内側が終わるたびに 1 回）'); }
    }
    step(0, '外側のくり返しも終えた');
    if (depth === 0) { show('---'); step(3, '--- を表示した（どちらの for の外。最後に 1 回だけ）'); }
  });
}

/** 関数の中身は、呼んだときだけ動く */
export function indentDefSteps(twice) {
  return record(({ show, step }) => {
    step(0, '関数 hello を作った（中身は、まだ動かない）');
    if (!twice) {
      show('はじめ'); step(2, '「はじめ」を表示した');
      step(3, 'hello() を呼んだ → 関数の中身へ移る');
      show('こんにちは'); step(1, '「こんにちは」を表示した（関数の中身）');
      step(3, '中身が終わった → 呼んだ行にもどる');
      show('おわり'); step(4, '「おわり」を表示した');
      return;
    }
    for (const line of [2, 3]) {
      step(line, 'hello() を呼んだ → 関数の中身へ移る');
      show('こんにちは'); step(1, '「こんにちは」を表示した（呼ぶたびに中身が動く）');
      step(line, '中身が終わった → 呼んだ行にもどる');
    }
  });
}

/* ============================================================
 * = と ==
 * ========================================================== */

export function assignSteps() {
  return record(({ set, show, step }) => {
    set('x', 3); step(0, 'x に 3 を入れた');
    set('x', 4); step(1, '右がわの x + 1 を先に計算した（3 + 1 = 4）。その 4 を x に入れなおした');
    show(4); step(2, '4 を表示した');
  });
}

export function equalSteps(mistake) {
  if (mistake) {
    return record(({ step, fail }) => {
      fail("SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='?");
      step(1, 'この行で書き方のまちがいが見つかった。見つかるのは動かす前なので、1 行目も動いていない');
    });
  }
  return record(({ set, show, step }) => {
    set('x', 3); step(0, 'x に 3 を入れた');
    step(1, 'x == 3 は成り立つ（x は 3 と同じ）→ 中身へ');
    show('3 です'); step(2, '「3 です」を表示した');
  });
}

/* ============================================================
 * 変数の入れかえ
 * ========================================================== */

export function swapSteps(kind) {
  return record(({ set, show, step }) => {
    set('a', 3); step(0, 'a に 3 を入れた');
    set('b', 5); step(1, 'b に 5 を入れた');
    if (kind === 'naive') {
      set('a', 5); step(2, 'a に b の値 5 を入れた。もとの 3 は上書きされて、もうどこにも無い');
      set('b', 5); step(3, 'b に a の値を入れた。a はもう 5 なので、b も 5 のまま');
      show('5 5'); step(4, '5 5 を表示した（入れかわっていない）');
    } else if (kind === 'temp') {
      set('t', 3); step(2, 't に a の値 3 を、とっておいた');
      set('a', 5); step(3, 'a に b の値 5 を入れた');
      set('b', 3); step(4, 'b に、とっておいた t の値 3 を入れた');
      show('5 3'); step(5, '5 3 を表示した（入れかわった）');
    } else {
      set('a', 5); set('b', 3);
      step(2, '右がわの b, a を先に読んで (5, 3) を作り、それを a と b に同時に入れた');
      show('5 3'); step(3, '5 3 を表示した（入れかわった）');
    }
  });
}

/* ============================================================
 * input() は文字列
 * ========================================================== */

export function inputSteps(kind) {
  return record(({ set, show, step, fail }) => {
    if (kind === 'plus1') {
      set('a', '5'); step(0, "入力された 5 を、文字列 '5' として a に入れた");
      fail('TypeError: can only concatenate str (not "int") to str');
      step(1, "文字列 '5' と数 1 は、+ でつなげることも足すこともできない → エラー");
      return;
    }
    const asNumber = kind === 'int';
    set('a', asNumber ? 5 : '5');
    step(0, asNumber ? '入力された 5 を、int() で数の 5 にしてから a に入れた' : "入力された 5 を、文字列 '5' として a に入れた（見た目は数でも文字列）");
    set('b', asNumber ? 3 : '3');
    step(1, asNumber ? '入力された 3 を、数の 3 にして b に入れた' : "入力された 3 を、文字列 '3' として b に入れた");
    show(asNumber ? 8 : 53);
    step(2, asNumber ? '数どうしの + は足し算。8 を表示した' : "文字列どうしの + は「つなげる」。'5' と '3' で 53 を表示した");
  });
}

/* ============================================================
 * 引用符の有無
 * ========================================================== */

export function quoteSteps(mistake) {
  return record(({ set, show, step, fail }) => {
    set('name', 'さくら'); step(0, "name に文字列 'さくら' を入れた");
    if (mistake) {
      fail("NameError: name 'さくら' is not defined");
      step(1, '引用符が無いので、さくら を「変数の名前」だと思って探したが、そんな変数は無い → エラー');
      return;
    }
    show('さくら'); step(1, '引用符が無い name は変数。中身の さくら を表示した');
    show('name'); step(2, '引用符でかこんだ "name" は文字そのもの。name と表示した');
  });
}

/* ============================================================
 * くり返しの中で 0 に戻す
 * ========================================================== */

export function resetSteps(inside) {
  return record(({ set, show, step, get }) => {
    if (inside) {
      for (const n of [2, 4, 6]) {
        set('n', n); step(0, `n に ${n} が入った → 中身へ`);
        set('total', 0); step(1, 'total を 0 に戻した（くり返すたびに、ここで消える）');
        set('total', n); step(2, `total が 0 + ${n} = ${n} になった`);
      }
      step(0, 'くり返しを終えた');
      show(get('total')); step(3, `${get('total')} を表示した（最後の 1 回分しか残っていない）`);
      return;
    }
    set('total', 0); step(0, 'total に 0 を入れた（くり返しの前に 1 回だけ）');
    for (const n of [2, 4, 6]) {
      set('n', n); step(1, `n に ${n} が入った → 中身へ`);
      set('total', get('total') + n); step(2, `total が ${get('total') - n} + ${n} = ${get('total')} になった`);
    }
    step(1, 'くり返しを終えた');
    show(get('total')); step(3, `${get('total')} を表示した（ぜんぶ足した合計）`);
  });
}

/* ============================================================
 * print と return
 * ========================================================== */

export function returnSteps(kind) {
  return record(({ set, show, step }) => {
    step(0, kind === 'forget'
      ? '関数 f を作った。プログラムはここで終わり。f() を呼んでいないので、中身は一度も動かない'
      : '関数 f を作った（中身は、まだ動かない）');
    if (kind === 'forget') return;
    step(2, 'f() を呼んだ → 関数の中身へ移る');
    if (kind === 'print') {
      show(3); step(1, '3 を表示した（表示しただけで、値は返していない）');
      set('y', null); step(2, '中身が終わった。何も返していないので、f() の値は None。y に None を入れた');
      show('None'); step(3, 'None を表示した');
    } else {
      step(1, 'return 3：3 を返して、すぐ呼んだところへもどる');
      set('y', 3); step(2, 'f() の値は 3。y に 3 を入れた');
      show(3); step(3, '3 を表示した');
    }
  });
}

/* ============================================================
 * 止まらないくり返し
 * ========================================================== */

export function loopSteps(kind) {
  return record(({ set, show, step, fail, get }) => {
    set('i', 0); step(0, 'i に 0 を入れた');
    if (kind === 'ok') {
      for (let k = 0; k < 3; k++) {
        step(1, `i < 3 は成り立つ（i は ${get('i')}）→ 中身へ`);
        show(get('i')); step(2, `${get('i')} を表示した`);
        set('i', get('i') + 1); step(3, `i を 1 ふやした（i が ${get('i')} になった）`);
      }
      step(1, 'i < 3 は成り立たない（i は 3）→ くり返しを終える');
      return;
    }
    for (let k = 0; k < 3; k++) {
      step(1, 'i < 3 は成り立つ（i は 0 のまま）→ 中身へ');
      show(0); step(2, '0 を表示した');
      if (kind === 'outside') step(1, 'i = i + 1 は while の外なので、ここでは動かない。条件にもどる');
    }
    fail('……i がずっと 0 なので、i < 3 がいつまでも成り立つ。この教材では 10 秒で止めます');
    step(1, 'i が変わらないので、くり返しが終わらない');
  });
}

/* ============================================================
 * ページに入れる例の一覧
 * ========================================================== */

export const DEMOS = {
  'indent-basic': () => createPlayer({
    variants: [{
      label: '',
      rows: [r('for n in [1, 2, 3]:'), r('print(n)', 1, { note: '← 中身' }), r('print("おわり")', 0, { note: '← 外' })],
      steps: indentBasicSteps(),
    }],
  }),
  'indent-if': () => createPlayer({
    variants: [5, 1].map(x => ({
      label: `x = ${x} で動かす`,
      rows: [r(`x = ${x}`), r('if x > 3:'), r('print("大きい")', 1, { note: '← if の中身' }), r('print("おわり")', 0, { note: '← 外' })],
      steps: indentIfSteps(x),
    })),
  }),
  'indent-compare': () => createPlayer({
    variants: [false, true].map(inside => ({
      label: inside ? 'print(total) を中に入れる' : 'print(total) を外に置く',
      rows: [
        r('total = 0'), r('for n in [1, 2, 3]:'), r('total = total + n', 1),
        inside ? r('print(total)', 1, { note: '← 中身' }) : r('print(total)', 0, { note: '← 外' }),
      ],
      steps: indentTrace(inside),
    })),
  }),
  'indent-nested': () => createPlayer({
    speed: 700,
    variants: [1, 2, 0].map(depth => ({
      label: { 1: '--- を外側の中身に', 2: '--- を内側の中身に', 0: '--- をいちばん外に' }[depth],
      rows: [
        r('for i in [1, 2]:'), r('for j in ["a", "b"]:', 1), r('print(i, j)', 2),
        r('print("---")', depth, { note: { 1: '← 外側の for の中身', 2: '← 内側の for の中身', 0: '← どちらの for の外' }[depth] }),
      ],
      steps: indentNestedSteps(depth),
    })),
  }),
  'indent-def': () => createPlayer({
    variants: [
      {
        label: '1 回呼ぶ',
        rows: [r('def hello():'), r('print("こんにちは")', 1, { note: '← 関数の中身' }), r('print("はじめ")'), r('hello()'), r('print("おわり")')],
        steps: indentDefSteps(false),
      },
      {
        label: '2 回呼ぶ',
        rows: [r('def hello():'), r('print("こんにちは")', 1, { note: '← 関数の中身' }), r('hello()'), r('hello()')],
        steps: indentDefSteps(true),
      },
    ],
  }),
  'indent-quiz': () => {
    const box = document.createElement('div');
    box.className = 'quiz-list';
    box.append(
      createQuiz({
        question: '1. 1 から 3 までを表示したい。',
        rows: [r('for n in [1, 2, 3]:'), r('print(n)')],
        answer: 1,
        explain: 'for の中身を下げわすれています。このままだと IndentationError になります。',
        fixed: 'for n in [1, 2, 3]:\n    print(n)',
      }),
      createQuiz({
        question: '2. 合計を、最後に 1 回だけ表示したい。',
        rows: [r('total = 0'), r('for n in [1, 2, 3]:'), r('total = total + n', 1), r('print(total)', 1)],
        answer: 3,
        explain: 'print(total) が for の中身になっているので、1・3・6 と毎回表示されます。字下げを戻して外に出します。',
        fixed: 'total = 0\nfor n in [1, 2, 3]:\n    total = total + n\nprint(total)',
      }),
      createQuiz({
        question: '3. x が正の数なら「正」と表示したい。',
        rows: [r('x = 5'), r('if x > 0'), r('print("正")', 1)],
        answer: 1,
        explain: 'if の行のおわりに「:」がありません。「:」が「ここから下が中身」の合図です。',
        fixed: 'x = 5\nif x > 0:\n    print("正")',
      }),
      createQuiz({
        question: '4. 正の数の合計を、最後に 1 回だけ表示したい。',
        rows: [r('total = 0'), r('for n in [3, -1, 2]:'), r('if n > 0:', 1), r('total = total + n', 2), r('print(total)', 0, { odd: 2 })],
        answer: 4,
        explain: 'print(total) が 2 文字下げで、0 文字（外）とも 4 文字（for の中身）ともそろっていません。'
          + '上のどの行ともそろわない字下げは IndentationError になります。外に出すなら 0 文字にします。',
        fixed: 'total = 0\nfor n in [3, -1, 2]:\n    if n > 0:\n        total = total + n\nprint(total)',
      }),
    );
    return box;
  },
  'assign': () => createPlayer({
    variants: [{ label: '', rows: [r('x = 3'), r('x = x + 1', 0, { note: '← 右を計算してから、左に入れる' }), r('print(x)')], steps: assignSteps() }],
  }),
  'equal': () => createPlayer({
    variants: [
      { label: '== で書く（正しい）', rows: [r('x = 3'), r('if x == 3:'), r('print("3 です")', 1)], steps: equalSteps(false) },
      { label: '= で書いてしまう', rows: [r('x = 3'), r('if x = 3:', 0, { note: '← = は「入れる」' }), r('print("3 です")', 1)], steps: equalSteps(true) },
    ],
  }),
  'swap': () => createPlayer({
    variants: [
      { label: 'そのまま入れかえる', rows: [r('a = 3'), r('b = 5'), r('a = b'), r('b = a'), r('print(a, b)')], steps: swapSteps('naive') },
      { label: 't にとっておく', rows: [r('a = 3'), r('b = 5'), r('t = a'), r('a = b'), r('b = t'), r('print(a, b)')], steps: swapSteps('temp') },
      { label: 'a, b = b, a', rows: [r('a = 3'), r('b = 5'), r('a, b = b, a'), r('print(a, b)')], steps: swapSteps('python') },
    ],
  }),
  'input': () => createPlayer({
    hint: '入力は 5 と 3 だとします。「▶ 動かす」で、1 行ずつ動くようすを見られます。',
    variants: [
      { label: 'input() のまま', rows: [r('a = input()'), r('b = input()'), r('print(a + b)')], steps: inputSteps('str') },
      { label: 'int() で数にする', rows: [r('a = int(input())'), r('b = int(input())'), r('print(a + b)')], steps: inputSteps('int') },
      { label: '文字列に 1 を足す', rows: [r('a = input()'), r('print(a + 1)')], steps: inputSteps('plus1') },
    ],
  }),
  'quote': () => createPlayer({
    variants: [
      { label: '引用符あり・なし', rows: [r('name = "さくら"'), r('print(name)'), r('print("name")')], steps: quoteSteps(false) },
      { label: '引用符をわすれる', rows: [r('name = "さくら"'), r('print(さくら)')], steps: quoteSteps(true) },
    ],
  }),
  'reset': () => createPlayer({
    speed: 750,
    variants: [
      { label: 'total = 0 が中にある', rows: [r('for n in [2, 4, 6]:'), r('total = 0', 1, { note: '← 毎回 0 に戻る' }), r('total = total + n', 1), r('print(total)')], steps: resetSteps(true) },
      { label: 'total = 0 を前に出す', rows: [r('total = 0', 0, { note: '← 1 回だけ' }), r('for n in [2, 4, 6]:'), r('total = total + n', 1), r('print(total)')], steps: resetSteps(false) },
    ],
  }),
  'return': () => createPlayer({
    variants: [
      { label: 'print で表示する', rows: [r('def f():'), r('print(3)', 1), r('y = f()'), r('print(y)')], steps: returnSteps('print') },
      { label: 'return で返す', rows: [r('def f():'), r('return 3', 1), r('y = f()'), r('print(y)')], steps: returnSteps('return') },
      { label: '呼ぶのをわすれる', rows: [r('def f():'), r('print(3)', 1)], steps: returnSteps('forget') },
    ],
  }),
  'loop': () => createPlayer({
    speed: 700,
    variants: [
      { label: 'i を ふやさない', rows: [r('i = 0'), r('while i < 3:'), r('print(i)', 1)], steps: loopSteps('none') },
      { label: 'ふやす行が外にある', rows: [r('i = 0'), r('while i < 3:'), r('print(i)', 1), r('i = i + 1', 0, { note: '← 字下げが無い' })], steps: loopSteps('outside') },
      { label: '中で i をふやす', rows: [r('i = 0'), r('while i < 3:'), r('print(i)', 1), r('i = i + 1', 1)], steps: loopSteps('ok') },
    ],
  }),
};
