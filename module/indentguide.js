// module/indentguide.js
// サイドバーに出す「字下げ（インデント）のしくみ」の説明。01・02・03 で同じものを使う。
//
// Python は、行のはじめの空白で「どこまでが中身か」を決める。
// 見た目には空白しかないので、エディタと同じ塗り分け（段の濃さ・朱の罫）で図にして見せ、
// 最後に 1 行だけ下げる／戻すを切りかえて、結果が変わることを確かめられるようにする。

/** 例のコードを、エディタと同じ見た目（段の濃さと朱の罫）で描く */
function demo(rows) {
  const box = document.createElement('div');
  box.className = 'indent-demo';
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = `indent-demo-line${row.scope ? ` is-scope is-${row.scope}` : ''}`;
    const code = document.createElement('code');
    const depth = row.depth || 0;
    for (let level = 0; level < depth; level++) {
      const step = document.createElement('span');
      step.className = `indent-demo-step lv${(level % 2) + 1}`;
      step.textContent = '····';
      // 読み上げでは「・」を 4 回読ませず、字下げは見た目だけで伝える
      step.setAttribute('aria-hidden', 'true');
      code.appendChild(step);
    }
    code.appendChild(document.createTextNode(row.code));
    line.appendChild(code);
    if (row.note) {
      const note = document.createElement('span');
      note.className = 'indent-demo-note';
      note.textContent = row.note;
      line.appendChild(note);
    }
    box.appendChild(line);
  }
  return box;
}

function para(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function heading(text) {
  const h = document.createElement('p');
  h.className = 'indent-guide-head';
  h.textContent = text;
  return h;
}

/**
 * 例のプログラムを 1 行ずつ動かしたときの記録を作る
 * @param {boolean} inside print(total) を for の中に入れるか
 * @returns {{line: number, n: number|null, total: number|null, out: string[], note: string}[]}
 */
export function indentTrace(inside) {
  const steps = [];
  let total = null;
  let n = null;
  const out = [];
  const push = (line, note) => steps.push({ line, n, total, out: [...out], note });
  total = 0;
  push(0, 'total に 0 を入れた');
  for (const value of [1, 2, 3]) {
    n = value;
    push(1, `n に ${value} が入った（${value} 回目）→ 中身へ`);
    total += value;
    push(2, `total が ${total} になった`);
    if (inside) {
      out.push(String(total));
      push(3, `${total} を表示した（中身なので、くり返すたびに動く）`);
    }
  }
  push(1, 'もう入れる値が無い → くり返しを終えて外へ');
  if (!inside) {
    out.push(String(total));
    push(3, `${total} を表示した（外なので、終わってから 1 回だけ）`);
  }
  return steps;
}

/** print(total) を下げる／戻すで、動き方がどう変わるかを、1 行ずつ動かして見せる */
function compare() {
  const wrap = document.createElement('div');
  wrap.className = 'indent-compare';
  const area = document.createElement('div');
  const state = document.createElement('div');
  state.className = 'indent-compare-state';
  // 自動で動かしているあいだは読み上げない（1 秒ごとに読まれると、うるさくなる）
  state.setAttribute('aria-live', 'polite');
  const result = document.createElement('pre');
  result.className = 'indent-compare-result';

  const controls = document.createElement('div');
  controls.className = 'indent-compare-controls';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'btn btn-sm btn-mark';
  const stepBtn = document.createElement('button');
  stepBtn.type = 'button';
  stepBtn.className = 'btn btn-sm';
  stepBtn.textContent = '1 行すすむ';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-sm';
  controls.append(play, stepBtn, toggle);

  let inside = false;
  let trace = indentTrace(inside);
  let at = -1;        // まだ動かしていないときは -1
  let timer = null;

  const rows = () => [
    { code: 'total = 0' },
    { code: 'for n in [1, 2, 3]:', scope: 'head' },
    { code: 'total = total + n', depth: 1, scope: inside ? 'body' : 'end' },
    inside
      ? { code: 'print(total)', depth: 1, scope: 'end', note: '← 中身' }
      : { code: 'print(total)', note: '← 外' },
  ];

  const draw = () => {
    const box = demo(rows());
    const step = trace[at];
    if (step) box.children[step.line].classList.add('is-current');
    area.replaceChildren(box);
    if (step) {
      state.textContent = `${step.note}　｜　n = ${step.n ?? '（まだ無い）'}　total = ${step.total ?? '（まだ無い）'}`;
      result.textContent = `結果\n${step.out.join('\n')}`;
    } else {
      state.textContent = '「▶ 動かす」で、1 行ずつ動くようすを見られます。';
      result.textContent = '結果\n';
    }
    play.textContent = timer ? '■ 止める' : (at >= trace.length - 1 ? '▶ もう一度' : '▶ 動かす');
    // 最後まで進んでも押せるままにする（押すと最初から。無効にするとキーボードの位置が迷子になる）
    stepBtn.disabled = Boolean(timer);
    stepBtn.textContent = at >= trace.length - 1 ? '最初から 1 行ずつ' : '1 行すすむ';
    state.setAttribute('aria-live', timer ? 'off' : 'polite');
    toggle.textContent = inside ? 'print(total) の字下げを戻す' : 'print(total) を 4 文字下げる';
  };

  const stop = () => { clearInterval(timer); timer = null; };
  const advance = () => {
    if (at >= trace.length - 1) { stop(); draw(); return; }
    at++;
    if (at >= trace.length - 1) stop();
    draw();
  };

  play.addEventListener('click', () => {
    if (timer) { stop(); draw(); return; }
    if (at >= trace.length - 1) at = -1;
    // 動きを減らす設定の人には、自動では進めず 1 行ずつ進めてもらう
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { advance(); return; }
    timer = setInterval(advance, 900);
    advance();
  });
  stepBtn.addEventListener('click', () => { if (at >= trace.length - 1) at = -1; advance(); });
  toggle.addEventListener('click', () => {
    stop();
    inside = !inside;
    trace = indentTrace(inside);
    at = -1;
    draw();
  });
  draw();
  wrap.append(area, controls, state, result);
  // 説明を閉じたら止める（見えないところで動きつづけないように）
  wrap.stopAnimation = () => { stop(); draw(); };
  return wrap;
}

/**
 * 説明をサイドバーに足す
 * @param {HTMLElement} sidebar ここに足す
 * @param {HTMLElement|null} [before] この部品の前に入れる（無ければ最後に足す）
 */
export function addIndentGuide(sidebar, before = null) {
  if (!sidebar) return;
  const details = document.createElement('details');
  details.className = 'expander indent-guide';
  const summary = document.createElement('summary');
  summary.innerHTML = '<svg viewBox="0 0 20 20" class="icon" aria-hidden="true"><path d="M3 4h14"/><path d="M7 8h10M7 12h10"/><path d="M3 16h14"/><path d="M3 7.5l2 2-2 2"/></svg>字下げ（インデント）のしくみ';
  const body = document.createElement('div');
  body.className = 'expander-body stack';
  const comparison = compare();
  details.addEventListener('toggle', () => { if (!details.open) comparison.stopAnimation(); });

  body.append(
    heading('1. 「:」で終わる行が見出し'),
    para('if・for・while・def の行は「:」で終わります。この行を「見出し」（まとまりの頭）と呼ぶことにします。その下で 4 文字下げた行が、見出しの「中身」です。'),
    demo([
      { code: 'for n in [1, 2, 3]:', scope: 'head', note: '← 見出し' },
      { code: 'print(n)', depth: 1, scope: 'end', note: '← 中身' },
    ]),

    heading('2. 中身は、字下げを戻すまで'),
    para('同じ深さで下げた行が続くあいだは、ぜんぶ中身です。下げていない行が出てきたら、そこから外です。'),
    demo([
      { code: 'for n in [1, 2, 3]:', scope: 'head' },
      { code: 'a = n * 2', depth: 1, scope: 'body', note: '← 中身' },
      { code: 'print(a)', depth: 1, scope: 'end', note: '← 中身' },
      { code: 'print("おわり")', note: '← 外（1 回だけ）' },
    ]),

    heading('3. 中にまた見出しがあれば、さらに 4 文字'),
    para('for の中の if の中身は、合わせて 8 文字下げます。段が深いほど、内側のまとまりです。'),
    demo([
      { code: 'for n in [3, 5, 2]:', scope: 'head' },
      { code: 'if n > 2:', depth: 1, scope: 'body', note: '← for の中身' },
      { code: 'print(n)', depth: 2, scope: 'end', note: '← if の中身' },
    ]),

    heading('4. 1 行の字下げで、動き方が変わる'),
    para('「▶ 動かす」で 1 行ずつ動かしてみましょう。次に print(total) を 4 文字下げて、もう一度動かすと、表示される回数が変わります。'),
    comparison,

    heading('よくあるまちがい'),
  );

  const mistakes = document.createElement('ul');
  mistakes.className = 'indent-guide-list';
  for (const text of [
    '「:」の書きわすれ … 見出しの行のおわりに「:」が要ります。',
    '中身を下げわすれる … IndentationError になります。中身が無いときは pass と書きます。',
    '同じまとまりの中で、4 文字の行と 2 文字の行をまぜる … IndentationError になります。この教材では 4 文字ずつにそろえます（ずれた字下げは、エディタで朱色になります）。',
    '全角の空白で下げる … 全角の空白は使えません（打つと半角に直ります）。',
  ]) {
    const li = document.createElement('li');
    li.textContent = text;
    mistakes.appendChild(li);
  }

  const howto = document.createElement('ul');
  howto.className = 'indent-guide-list';
  for (const text of [
    'Tab キーで 4 文字下げ、Shift + Tab で 4 文字戻します。',
    '段ごとに色の濃さが変わります。濃いほど内側です。',
    'カーソルのあるまとまりには、見出しから中身の最後まで朱の線が引かれます。',
    '「字下げ」ボタンを押すと、ずれた字下げをそろえます。',
  ]) {
    const li = document.createElement('li');
    li.textContent = text;
    howto.appendChild(li);
  }

  body.append(mistakes, heading('このエディタでは'), howto);
  details.append(summary, body);
  sidebar.insertBefore(details, before && before.parentElement === sidebar ? before : null);
}
