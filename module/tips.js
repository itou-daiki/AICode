// module/tips.js - 「つまずき解説」のページまわり
//
// ・目次を作り、いま読んでいる章を示す
// ・<div data-demo="名前"> に、動かして確かめる例を入れる（tips-demos.js）
// ・range の例と、「自分で書いて確かめる」エディタを作る

import { DEMOS } from './tips-demos.js';
import { attachBlockScope, enclosingHeaders } from './blockscope.js';
import { attachHalfWidth } from './halfwidth.js';
import { urlWithCode, makeEditorFriendly } from './ui.js';

/* ============================================================
 * 1. 目次
 * ========================================================== */

function buildToc() {
  const links = document.getElementById('toc-links');
  const topics = [...document.querySelectorAll('.topic[id]')];
  for (const topic of topics) {
    const link = document.createElement('a');
    link.href = `#${topic.id}`;
    link.textContent = topic.querySelector('h2').textContent.replace(/^\d+/, '').trim();
    links.appendChild(link);
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.querySelectorAll('a').forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${entry.target.id}`));
    }
  }, { rootMargin: '-15% 0px -70% 0px' });
  topics.forEach(t => observer.observe(t));
}

/* ============================================================
 * 2. range の例
 * ========================================================== */

function rangeLab() {
  const wrap = document.createElement('div');
  wrap.className = 'range-lab';
  const controls = document.createElement('div');
  controls.className = 'range-controls';
  const make = (label, values, initial) => {
    const field = document.createElement('label');
    const select = document.createElement('select');
    for (const v of values) select.add(new Option(String(v), String(v)));
    select.value = String(initial);
    field.append(document.createTextNode(label), select);
    controls.appendChild(field);
    return select;
  };
  const start = make('はじめ', [0, 1, 2, 3], 1);
  const stop = make('おわり', [1, 2, 3, 4, 5, 6, 7, 8], 5);
  const step = make('とび', [1, 2, 3], 1);
  const code = document.createElement('p');
  code.className = 'range-code';
  const line = document.createElement('div');
  line.className = 'range-line';
  const result = document.createElement('p');
  result.className = 'range-result';

  const draw = () => {
    const a = Number(start.value);
    const b = Number(stop.value);
    const c = Number(step.value);
    code.textContent = c === 1 ? (a === 0 ? `range(${b})` : `range(${a}, ${b})`) : `range(${a}, ${b}, ${c})`;
    const picked = [];
    for (let v = a; v < b; v += c) picked.push(v);
    line.replaceChildren();
    for (let v = 0; v <= 9; v++) {
      const cell = document.createElement('div');
      cell.className = 'range-cell';
      cell.textContent = String(v);
      const tag = document.createElement('small');
      if (picked.includes(v)) { cell.classList.add('is-in'); tag.textContent = '入る'; }
      if (v === b) { cell.classList.add('is-stop'); tag.textContent = 'おわり'; }
      cell.appendChild(tag);
      line.appendChild(cell);
    }
    result.textContent = picked.length
      ? `list(${code.textContent}) → [${picked.join(', ')}]（${picked.length} 個）。おわりの ${b} は入らない`
      : `${code.textContent} は空っぽ（はじめ ${a} が、おわり ${b} より小さくない）`;
  };
  [start, stop, step].forEach(s => s.addEventListener('change', draw));
  draw();

  // リストの番号
  const list = document.createElement('div');
  list.innerHTML = '<p class="demo-label">リストの番号（a = ["あ", "い", "う"]）</p>';
  const cells = document.createElement('div');
  cells.className = 'range-line';
  ['あ', 'い', 'う'].forEach((v, i) => {
    const cell = document.createElement('div');
    cell.className = 'range-cell is-in';
    cell.textContent = v;
    const tag = document.createElement('small');
    tag.textContent = `a[${i}]`;
    cell.appendChild(tag);
    cells.appendChild(cell);
  });
  const missing = document.createElement('div');
  missing.className = 'range-cell is-stop';
  missing.textContent = '×';
  const tag = document.createElement('small');
  tag.textContent = 'a[3]';
  missing.appendChild(tag);
  cells.appendChild(missing);
  const note = document.createElement('p');
  note.className = 'range-result';
  note.textContent = 'len(a) は 3。番号は 0, 1, 2 で、a[3] は無い（IndexError）。最後は a[len(a) - 1]。';
  list.append(cells, note);

  wrap.append(controls, code, line, result, list);
  return wrap;
}

/* ============================================================
 * 3. 自分で書いて確かめるエディタ
 * ========================================================== */

const PLAYGROUND_CODE = `total = 0
for n in [3, -1, 2]:
    if n > 0:
        total = total + n
        print(n)
print(total)
`;

function playground(slot) {
  slot.classList.add('playground');
  const textarea = document.createElement('textarea');
  slot.appendChild(textarea);
  const where = document.createElement('p');
  where.className = 'playground-where';
  where.setAttribute('aria-live', 'polite');
  const tools = document.createElement('div');
  tools.className = 'playground-tools';
  const open = document.createElement('a');
  open.className = 'btn btn-sm';
  open.textContent = '01 コーディングで動かす';
  open.target = '_blank';
  open.rel = 'noopener';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-sm';
  reset.textContent = '最初の例に戻す';
  tools.append(open, reset);
  slot.append(where, tools);

  if (typeof CodeMirror === 'undefined') {
    // 部品が読めないときは、使えない欄やボタンを出さずに、理由だけを書く
    textarea.remove();
    tools.remove();
    where.textContent = 'エディタを読みこめませんでした（ネットワークを確かめてください）。01 コーディングでも同じように確かめられます。';
    return;
  }
  const cm = CodeMirror.fromTextArea(textarea, {
    mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
    extraKeys: {
      Tab: (editor) => {
        if (editor.somethingSelected()) editor.indentSelection('add');
        else editor.replaceSelection('    ', 'end');
      },
      'Shift-Tab': 'indentLess',
    },
  });
  cm.setValue(PLAYGROUND_CODE);
  attachBlockScope(cm);
  attachHalfWidth(cm);
  makeEditorFriendly(cm, '字下げを確かめるエディタ');

  const describe = () => {
    const lines = cm.getValue().split('\n');
    const line = cm.getCursor().line;
    const text = lines[line] || '';
    where.replaceChildren();
    if (!text.trim()) { where.textContent = `${line + 1} 行目：空の行`; return; }
    const chain = enclosingHeaders(lines, line);
    const indent = text.match(/^ */)[0].length;
    where.append(document.createTextNode(`${line + 1} 行目（字下げ ${indent} 文字）：`));
    if (!chain.length) {
      where.append(document.createTextNode('どのまとまりにも入っていない（いちばん外）'));
    } else {
      chain.forEach((head, i) => {
        if (i) where.append(document.createTextNode(' › '));
        const crumb = document.createElement('span');
        crumb.className = 'crumb';
        crumb.textContent = `${lines[head].trim()} の中身`;
        where.appendChild(crumb);
      });
    }
    if (indent % 4) where.append(document.createTextNode('　※ 4 文字ずつにそろっていません'));
  };
  const updateLink = () => { open.href = urlWithCode('index.html', cm.getValue()); };
  cm.on('cursorActivity', describe);
  cm.on('change', updateLink);
  reset.addEventListener('click', () => { cm.setValue(PLAYGROUND_CODE); cm.focus(); });
  cm.setCursor({ line: 4, ch: 8 });
  describe();
  updateLink();
}

/* ============================================================
 * 4. 例を入れる
 * ========================================================== */

function fillDemos() {
  for (const slot of document.querySelectorAll('[data-demo]')) {
    const name = slot.dataset.demo;
    if (name === 'range') slot.appendChild(rangeLab());
    else if (name === 'playground') playground(slot);
    else if (DEMOS[name]) slot.appendChild(DEMOS[name]());
  }
}

buildToc();
fillDemos();
