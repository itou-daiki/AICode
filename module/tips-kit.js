// module/tips-kit.js
// 「つまずき解説」で使う、動かして確かめる部品。
//
//   record(fn)      … 例のプログラムを 1 行ずつ動かした記録を、手で書いた手順から作る
//   createPlayer()  … 記録を 1 行ずつ再生する（いまの行・まとまりの罫・変数・表示が動く）
//   createQuiz()    … まちがっている行を押して当てる問題
//
// 例のプログラムは、Pyodide を読まずに、決まった動きを手で書いておく（ページをすぐ開けるように）。
// そのぶん、記録の中身が Python の動きと食いちがわないよう、tests/run-node.mjs で確かめる。

import { findBlock } from './blockscope.js';

/* ============================================================
 * 1. 記録を作る
 * ========================================================== */

/**
 * 例のプログラムの動きを記録する
 *
 *   record(({ set, show, step, fail }) => {
 *     set('x', 0); step(0, 'x に 0 を入れた');
 *   })
 *
 * step(行, 説明) を呼ぶたびに、その時点の変数と表示を 1 コマとして残す。
 * 行は「いま実行した行」（0 から数える）。
 * @param {(api: object) => void} fn
 * @returns {{line: number, vars: object, out: string[], note: string, error: string}[]}
 */
export function record(fn) {
  const steps = [];
  const vars = {};
  const out = [];
  let error = '';
  const api = {
    set(name, value) { vars[name] = value; },
    remove(name) { delete vars[name]; },
    get: (name) => vars[name],
    show(text) { out.push(String(text)); },
    fail(message) { error = message; },
    step(line, note) { steps.push({ line, vars: { ...vars }, out: [...out], note, error }); },
  };
  fn(api);
  return steps;
}

/** Python の値の見せ方（文字列は ' ' で囲む） */
export function repr(value) {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value)) return `[${value.map(repr).join(', ')}]`;
  return String(value);
}

/* ============================================================
 * 2. コードの図（エディタと同じ塗り分け）
 * ========================================================== */

/**
 * 例のコードを描く
 * @param {{code: string, depth?: number, note?: string}[]} rows
 * @param {object} [mark]
 * @param {number} [mark.current] いまの行（0 から）
 * @param {boolean} [mark.scope] いまの行のまとまりに罫を引くか
 * @param {(line: number) => void} [mark.onPick] 行を押したとき（まちがい探し）
 */
export function codeView(rows, { current = -1, scope = true, onPick = null, picked = -1, verdict = '' } = {}) {
  const box = document.createElement('div');
  box.className = 'indent-demo';
  const lines = rows.map(r => '    '.repeat(r.depth || 0) + ' '.repeat(r.odd || 0) + r.code);
  const widthOf = (row) => (row.depth || 0) * 4 + (row.odd || 0);
  const block = scope && current >= 0 ? findBlock(lines, current) : null;

  rows.forEach((row, index) => {
    const line = document.createElement(onPick ? 'button' : 'div');
    if (onPick) {
      line.type = 'button';
      line.addEventListener('click', () => onPick(index));
      line.dataset.index = String(index);
      // 読み上げでも字下げの深さが分かるように、文字数を添える
      line.setAttribute('aria-label', `${index + 1} 行目（字下げ ${widthOf(row)} 文字）: ${row.code}`);
    }
    line.className = 'indent-demo-line';
    const inScope = block && block.end > block.head && index >= block.head && index <= block.end;
    if (inScope) {
      line.classList.add('is-scope', index === block.head ? 'is-head' : index === block.end ? 'is-end' : 'is-body');
    }
    if (index === current) line.classList.add('is-current');
    if (index === picked) line.classList.add(verdict === 'ok' ? 'is-picked-ok' : 'is-picked-ng');

    const number = document.createElement('span');
    number.className = 'indent-demo-no';
    number.textContent = String(index + 1);
    number.setAttribute('aria-hidden', 'true');
    line.appendChild(number);

    const code = document.createElement('code');
    // まとまりの罫は、見出しの字の頭（その深さ）に引く
    if (inScope) code.style.setProperty('--scope-x', `${block.depth * 4}ch`);
    if (widthOf(row)) {
      const hidden = document.createElement('span');
      hidden.className = 'sr-only';
      hidden.textContent = `（字下げ ${widthOf(row)} 文字）`;
      code.appendChild(hidden);
    }
    for (let level = 0; level < (row.depth || 0); level++) {
      const step = document.createElement('span');
      step.className = `indent-demo-step lv${(level % 2) + 1}`;
      step.textContent = '····';
      step.setAttribute('aria-hidden', 'true');
      code.appendChild(step);
    }
    if (row.odd) {
      const odd = document.createElement('span');
      odd.className = 'indent-demo-step is-odd';
      odd.textContent = '·'.repeat(row.odd);
      odd.setAttribute('aria-hidden', 'true');
      code.appendChild(odd);
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
  });
  return box;
}

/* ============================================================
 * 3. 再生する部品
 * ========================================================== */

function button(label, className = 'btn btn-sm') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
}

/**
 * 1 行ずつ再生する部品
 * @param {object} options
 * @param {{label: string, rows: object[], steps: object[]}[]} options.variants 切りかえられる書き方
 * @param {string} [options.hint] はじめに出す一言
 * @param {number} [options.speed] 自動で進める間隔（ミリ秒）
 * @returns {HTMLElement}
 */
export function createPlayer({ variants, hint = '「▶ 動かす」で、1 行ずつ動くようすを見られます。', speed = 900 }) {
  const wrap = document.createElement('div');
  wrap.className = 'player';

  const switcher = document.createElement('div');
  switcher.className = 'player-variants';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', '書き方を切りかえる');

  const area = document.createElement('div');
  const controls = document.createElement('div');
  controls.className = 'player-controls';
  const play = button('▶ 動かす', 'btn btn-sm btn-mark');
  const stepBtn = button('1 行すすむ');
  const back = button('1 行もどる');
  controls.append(play, stepBtn, back);

  const note = document.createElement('p');
  note.className = 'player-note';
  const vars = document.createElement('div');
  vars.className = 'player-vars';
  const output = document.createElement('pre');
  output.className = 'player-output';

  let variant = 0;
  let at = -1;
  let timer = null;
  const steps = () => variants[variant].steps;
  const last = () => steps().length - 1;

  const variantButtons = variants.map((v, index) => {
    const b = button(v.label, 'btn btn-sm player-variant');
    b.addEventListener('click', () => { stop(); variant = index; at = -1; draw(); });
    return b;
  });
  if (variants.length > 1) switcher.append(...variantButtons);

  function drawVars(step) {
    vars.replaceChildren();
    const previous = steps()[at - 1];
    const names = Object.keys(step ? step.vars : {});
    if (!names.length) {
      const empty = document.createElement('span');
      empty.className = 'player-var is-empty';
      empty.textContent = '変数はまだありません';
      vars.appendChild(empty);
      return;
    }
    for (const name of names) {
      const chip = document.createElement('span');
      chip.className = 'player-var';
      const before = previous ? previous.vars[name] : undefined;
      const changed = !previous || !(name in previous.vars) || repr(before) !== repr(step.vars[name]);
      if (changed) chip.classList.add('is-changed');
      const n = document.createElement('span');
      n.className = 'player-var-name';
      n.textContent = name;
      const v = document.createElement('span');
      v.className = 'player-var-value';
      v.textContent = repr(step.vars[name]);
      chip.append(n, v);
      vars.appendChild(chip);
    }
  }

  function draw() {
    const step = steps()[at];
    area.replaceChildren(codeView(variants[variant].rows, { current: step ? step.line : -1 }));
    variantButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === variant)));
    note.textContent = step ? `${step.line + 1} 行目：${step.note}` : hint;
    note.classList.toggle('is-error', Boolean(step && step.error));
    drawVars(step);
    const shown = step ? step.out.join('\n') : '';
    output.textContent = `表示\n${shown}${step && step.error ? `${shown ? '\n' : ''}${step.error}` : ''}`;
    output.classList.toggle('is-error', Boolean(step && step.error));
    play.textContent = timer ? '■ 止める' : (at >= last() ? '▶ もう一度' : '▶ 動かす');
    stepBtn.textContent = at >= last() ? '最初から 1 行ずつ' : '1 行すすむ';
    stepBtn.disabled = Boolean(timer);
    back.disabled = Boolean(timer) || at < 0;
    // 自動で動かしているあいだは読み上げない（毎秒読まれるとうるさい）
    note.setAttribute('aria-live', timer ? 'off' : 'polite');
  }

  function stop() { clearInterval(timer); timer = null; }
  function advance() {
    if (at >= last()) { stop(); draw(); return; }
    at++;
    if (at >= last()) stop();
    draw();
  }

  play.addEventListener('click', () => {
    if (timer) { stop(); draw(); return; }
    if (at >= last()) at = -1;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { advance(); return; }
    timer = setInterval(advance, speed);
    advance();
  });
  stepBtn.addEventListener('click', () => { if (at >= last()) at = -1; advance(); });
  back.addEventListener('click', () => { if (at >= 0) { at--; draw(); } });

  draw();
  wrap.append(switcher, area, controls, note, vars, output);
  return wrap;
}

/* ============================================================
 * 4. まちがい探し
 * ========================================================== */

/**
 * まちがっている行を当てる問題
 * @param {object} options
 * @param {string} options.question 問い（何をしたいプログラムか）
 * @param {object[]} options.rows コード
 * @param {number} options.answer まちがっている行（0 から）
 * @param {string} options.explain 当てたときの説明
 * @param {string} [options.fixed] 直したあとのコード（説明のあとに見せる）
 */
export function createQuiz({ question, rows, answer, explain, fixed = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'quiz';
  const q = document.createElement('p');
  q.className = 'quiz-question';
  q.textContent = question;
  const area = document.createElement('div');
  const feedback = document.createElement('div');
  feedback.className = 'quiz-feedback';
  feedback.setAttribute('aria-live', 'polite');

  let picked = -1;
  let solved = false;
  feedback.tabIndex = -1;
  const draw = () => {
    area.replaceChildren(codeView(rows, {
      scope: false,
      onPick: solved ? null : pick,
      picked,
      verdict: picked === answer ? 'ok' : 'ng',
    }));
  };
  function pick(index) {
    picked = index;
    // 正解のときは説明へ移って読ませるので、知らせる読み上げは止める（2 回読まれないように）
    feedback.setAttribute('aria-live', index === answer ? 'off' : 'polite');
    feedback.replaceChildren();
    const p = document.createElement('p');
    if (index === answer) {
      solved = true;
      p.className = 'quiz-ok';
      p.textContent = `正解です。${explain}`;
      feedback.appendChild(p);
      if (fixed) {
        const pre = document.createElement('pre');
        pre.className = 'quiz-fixed';
        pre.textContent = `直したコード\n${fixed}`;
        feedback.appendChild(pre);
      }
    } else {
      p.className = 'quiz-ng';
      p.textContent = `${index + 1} 行目は、このままで正しい行です。ほかの行を見てみましょう。`;
      feedback.appendChild(p);
    }
    draw();
    // 作りなおしたあともキーボードの位置を保つ（当てたら説明へ、外れたら押した行へ）
    if (solved) feedback.focus();
    else area.querySelector(`[data-index="${index}"]`)?.focus();
  }
  draw();
  const how = document.createElement('p');
  how.className = 'quiz-how';
  how.textContent = 'まちがっていると思う行を押してください。';
  wrap.append(q, how, area, feedback);
  return wrap;
}
