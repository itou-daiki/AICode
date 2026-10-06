// module/stepview.js
// ステップ実行の見せ方（01 コーディングと 02 レッスンで同じものを使う）。
//
// 記録（stepper.js）は「これから実行する行」ごとに、その時点の変数と出力を持っている。
// 変数の変化は 1 つ前の行がしたことなので、画面では 2 つの行を分けて見せる。
//   ・いま実行した行 … 墨の罫（変数の「変わった」印は、この行のしわざ）
//   ・次に実行する行 … 朱の罫と薄い面
// さらに「3 行目を実行しました。s が 80 → 92」と、何が起きたかを 1 行の文で添える。

import { changedVariables, changedItems } from './stepper.js';

/**
 * 1 つのステップで起きたことをまとめる
 *
 * 記録は「これから実行する行」ごとなので、ふつうは 1 つ前の行がしたことを見せればよい。
 * ただし関数の出入りでは、行と変数の持ち主（どの関数の中か）が入れかわるので分けて考える。
 *   ・関数に入った … 1 つ前の行（呼び出した行）はまだ終わっていない。「呼び出しました」と見せる
 *   ・関数から戻った … 呼び出した行がここで終わった。変数は、呼び出した行のときと比べる
 *   ・return の記録 … その関数の最後。次に実行する行は無く、呼び出し元にもどる
 *   ・エラーで止まった … 最後に実行しかけた行で止まった
 * @param {object[]} steps 記録
 * @param {number} index 今のステップ
 * @param {object} [status] { error, truncated } 記録全体の終わりかた
 */
export function describeStep(steps, index, { error = null, truncated = false } = {}) {
  const current = steps[index] || {};
  const previous = index > 0 ? steps[index - 1] : null;
  const isEnd = current.event === 'end';

  // エラーで止まったときは、最後の 'line' の記録のあとは「止まったところ」
  let lastLine = -1;
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].event === 'line') { lastLine = i; break; }
  const afterError = Boolean(error) && index > lastLine && lastLine >= 0;

  let doneKind = previous ? 'done' : null;
  let done = previous ? previous.line : null;
  let base = previous;      // 変数をくらべる相手
  let callee = null;

  if (previous && afterError) {
    doneKind = 'error';
    done = steps[lastLine].line;
  } else if (previous && previous.event === 'return' && previous.func !== '<module>' && current.event === 'line') {
    // 関数から戻った。呼び出した行（同じ関数の中で、いちばん新しい行）がここで終わった
    doneKind = 'back';
    callee = previous.func;
    for (let i = index - 1; i >= 0; i--) {
      if (steps[i].func === current.func && steps[i].event === 'line') { done = steps[i].line; base = steps[i]; break; }
    }
  } else if (previous && previous.event === 'line' && current.event === 'line' && current.func !== previous.func) {
    // 関数に入った。呼び出した行はまだ終わっていない
    doneKind = 'call';
    callee = current.func;
  } else if (previous && previous.event === 'return' && previous.func === '<module>') {
    // プログラムの最後の行は、1 つ前のステップで見せ終わっている
    doneKind = null;
    done = null;
  }

  const changes = [];
  if (base && doneKind) {
    const before = base.vars || {};
    const after = current.vars || {};
    for (const name of Object.keys(after).sort()) {
      if (!(name in before)) changes.push({ name, kind: 'new', after: after[name].repr });
      else if (before[name].repr !== after[name].repr) {
        changes.push({ name, kind: 'changed', before: before[name].repr, after: after[name].repr });
      }
    }
  }

  const output = current.output || '';
  const previousOutput = previous ? previous.output || '' : '';
  const newOutput = previous && output.startsWith(previousOutput) ? output.slice(previousOutput.length) : '';

  let nextKind = 'line';
  if (isEnd) nextKind = error ? 'error' : truncated ? 'truncated' : 'end';
  else if (afterError) nextKind = 'error';
  else if (current.event === 'return') nextKind = current.func === '<module>' ? 'module-end' : 'return';

  return {
    done,
    doneKind,
    callee,
    next: nextKind === 'line' ? current.line : null,
    nextKind,
    func: current.func,
    changes,
    newOutput,
    isEnd,
    error,
    baseVars: base ? base.vars : null,
  };
}

/** 長い値は途中で切って見せる（1 行の文が読めなくなるので） */
function short(text, limit = 24) {
  const value = String(text ?? '');
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/**
 * 「何が起きたか」の 1 行を作る
 * @param {HTMLElement} container
 * @param {ReturnType<typeof describeStep>} info
 * @param {(line: number) => string} lineText その行のコード
 */
export function renderStepCaption(container, info, lineText) {
  if (!container) return;
  container.replaceChildren();

  const row = (kind, mark, parts) => {
    const line = document.createElement('div');
    line.className = `step-caption-row is-${kind}`;
    const badge = document.createElement('span');
    badge.className = 'step-caption-mark';
    badge.textContent = mark;
    line.appendChild(badge);
    const text = document.createElement('span');
    text.className = 'step-caption-text';
    for (const part of parts) {
      if (typeof part === 'string') text.append(part);
      else text.appendChild(part);
    }
    line.appendChild(text);
    container.appendChild(line);
  };
  const code = (value) => {
    const el = document.createElement('code');
    el.textContent = value;
    return el;
  };

  const effectsOf = () => {
    const effects = [];
    for (const change of info.changes.slice(0, 3)) {
      effects.push(change.kind === 'new'
        ? `${change.name} ができました（${short(change.after)}）`
        : `${change.name} が ${short(change.before, 12)} → ${short(change.after, 12)}`);
    }
    if (info.changes.length > 3) effects.push(`ほか ${info.changes.length - 3} 個`);
    if (info.newOutput.trim()) effects.push(`「${short(info.newOutput.replace(/\n+$/, '').replace(/\n/g, ' / '), 30)}」を表示`);
    return effects.length ? [' ', effects.join('、')] : [];
  };

  // いま実行した行と、それで起きたこと
  if (info.doneKind === 'done' && info.done) {
    row('done', '済', [`${info.done} 行目 `, code(short(lineText(info.done).trim(), 40)), ' を実行しました。', ...effectsOf()]);
  } else if (info.doneKind === 'back' && info.done) {
    row('done', '済', [`${info.done} 行目 `, code(short(lineText(info.done).trim(), 40)),
      ` を実行しました（関数 ${info.callee} の結果を使いました）。`, ...effectsOf()]);
  } else if (info.doneKind === 'call' && info.done) {
    const params = info.changes.slice(0, 3).map(c => `${c.name} = ${short(c.after, 12)}`).join('、');
    row('done', '呼', [`${info.done} 行目で、関数 ${info.callee} を呼び出しました。`, params ? `（${params}）` : '']);
  } else if (info.doneKind === 'error' && info.done) {
    row('error', '誤', [`${info.done} 行目 `, code(short(lineText(info.done).trim(), 40)), ' でエラーになりました。']);
  }

  // 次に実行する行
  if (info.nextKind === 'line' && info.next) {
    row('next', '次', [`${info.next} 行目 `, code(short(lineText(info.next).trim(), 40)),
      info.doneKind ? ' をこれから実行します。' : ' から実行を始めます。']);
  } else if (info.nextKind === 'return') {
    row('end', '戻', [`関数 ${info.func} の最後です。呼び出した行にもどります。`]);
  } else if (info.nextKind === 'module-end') {
    row('end', '終', ['最後の行まで実行しました。']);
  } else if (info.nextKind === 'error') {
    row('error', '止', [`エラーで止まりました。${info.error ? `（${short(info.error, 60)}）` : ''}`]);
  } else if (info.nextKind === 'truncated') {
    row('end', '止', ['記録できる数の上限に達したので、ここで止めました。']);
  } else if (info.nextKind === 'end') {
    row('end', '終', ['プログラムが終わりました。']);
  }
}

/**
 * 出力を見せる。このステップで新しく出た部分には印をつける
 * @param {HTMLElement} element 出力の <pre>
 * @param {string} output そこまでの出力
 * @param {string} newOutput このステップで増えた部分
 * @param {object} [extra] 前と後ろに添える文（入力が足りない、エラー など）
 */
export function renderStepOutput(element, output, newOutput, { before = '', after = '' } = {}) {
  if (!element) return;
  element.replaceChildren();
  if (before) element.append(before);
  if (!output) {
    const empty = document.createElement('span');
    empty.className = 'step-output-empty';
    empty.textContent = '（まだ出力はありません）';
    element.appendChild(empty);
  } else if (newOutput && output.endsWith(newOutput)) {
    element.append(output.slice(0, output.length - newOutput.length));
    const mark = document.createElement('mark');
    mark.className = 'step-output-new';
    mark.textContent = newOutput;
    element.appendChild(mark);
  } else {
    element.append(output);
  }
  if (after) element.append(after);
}

/** エディタごとの、いま付けている行の印 */
const lineMarks = new WeakMap();

/**
 * エディタに「いま実行した行」と「次に実行する行」の印をつける
 * @param {object} editor CodeMirror
 * @param {{done: number|null, next: number|null}} lines 1 から数えた行。null なら付けない
 * @param {object} [options]
 * @param {boolean} [options.scroll] 次の行が見えるところまでスクロールするか
 */
export function markStepLines(editor, { done = null, next = null } = {}, { scroll = true } = {}) {
  if (!editor) return;
  const old = lineMarks.get(editor) || [];
  for (const [handle, where, cls] of old) editor.removeLineClass(handle, where, cls);
  const marks = [];
  const inRange = (line) => line && line >= 1 && line <= editor.lineCount();
  // 行の帯と、行番号の印の両方をつける（帯だけだと、いま実行した行が見分けにくい）
  const add = (line, cls) => {
    const handle = editor.addLineClass(line - 1, 'background', cls);
    editor.addLineClass(handle, 'gutter', `${cls}-gutter`);
    marks.push([handle, 'background', cls], [handle, 'gutter', `${cls}-gutter`]);
  };
  if (inRange(done) && done !== next) add(done, 'step-done');
  if (inRange(next)) add(next, 'step-line');
  lineMarks.set(editor, marks);
  const target = inRange(next) ? next : inRange(done) ? done : null;
  if (scroll && target) editor.scrollIntoView({ line: target - 1, ch: 0 }, 80);
}

/**
 * 変数の一覧を見せる。変わった値は「前 → 後」も書く
 * @param {HTMLElement} container
 * @param {object} variables 今の変数
 * @param {object|null} previousVariables 1 つ前の変数
 * @param {Set<string>} focusNames 次の行で使う名前
 */
export function renderVariables(container, variables, previousVariables, focusNames = new Set()) {
  if (!container) return;
  const names = Object.keys(variables || {}).sort();
  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'まだ変数はありません';
    container.replaceChildren(empty);
    return;
  }

  const changed = previousVariables ? changedVariables(previousVariables, variables) : new Set();
  const list = document.createElement('div');
  list.className = 'var-list';
  for (const name of names) {
    const before = previousVariables && previousVariables[name];
    list.appendChild(renderVariable(name, variables[name], before, {
      changed: changed.has(name),
      focused: focusNames.has(name),
    }));
  }
  container.replaceChildren(list);
}

/** 変数 1 つ分 */
function renderVariable(name, info, before, { changed, focused }) {
  const card = document.createElement('div');
  card.className = 'var-card';
  if (changed) card.classList.add('is-changed');
  if (focused) card.classList.add('is-focus');

  const head = document.createElement('div');
  head.className = 'var-head';
  const label = document.createElement('span');
  label.className = 'var-name';
  label.textContent = name;
  const type = document.createElement('span');
  type.className = `var-type is-${info.type}`;
  type.textContent = info.size === undefined ? info.label : `${info.label}（${info.size}）`;
  head.append(label, type);
  if (changed) {
    const tag = document.createElement('span');
    tag.className = 'var-tag';
    tag.textContent = before ? '変わった' : 'できた';
    head.appendChild(tag);
  }
  card.appendChild(head);

  if (info.items && info.items.length) {
    card.appendChild(renderItems(info, before));
  } else {
    const value = document.createElement('div');
    value.className = 'var-value';
    // 変わった値は、前の値も消し線で残す（何がどう変わったかを目で追える）
    if (changed && before && !before.items && before.repr !== info.repr) {
      const old = document.createElement('s');
      old.className = 'var-old';
      old.textContent = before.repr;
      value.append(old, ' → ');
    }
    value.append(info.repr);
    card.appendChild(value);
  }
  return card;
}

/** リスト・辞書・集合の中身 */
function renderItems(info, before) {
  const changed = changedItems(before, info);
  const table = document.createElement('div');
  table.className = 'var-items';
  for (const [key, value] of info.items) {
    const cell = document.createElement('div');
    cell.className = 'var-item';
    if (changed.has(key)) cell.classList.add('is-changed');
    if (key !== '') {
      const keyEl = document.createElement('span');
      keyEl.className = 'var-key';
      keyEl.textContent = key;
      cell.appendChild(keyEl);
    }
    const valueEl = document.createElement('span');
    valueEl.className = 'var-item-value';
    valueEl.textContent = value;
    cell.appendChild(valueEl);
    table.appendChild(cell);
  }
  if (info.size !== undefined && info.items.length < info.size) {
    const more = document.createElement('div');
    more.className = 'var-item is-more';
    more.textContent = `… 残り ${info.size - info.items.length} 個`;
    table.appendChild(more);
  }
  return table;
}
