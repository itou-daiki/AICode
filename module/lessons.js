// module/lessons.js - レッスンモードの画面
//
// 4 つのコース（入門・基礎練習・共通テスト対策・二次試験対策）と模試を出す。
// 学習者は Python で書き、共通テスト用の表記は自動で作って横に見せる。
//
// 問題の型ごとに、答え方と答え合わせが変わる。
//   read  … 説明を読んで見本を動かす（答え合わせなし）
//   trace … 表示される値を答える（答えてから実行できる＝先に予想する）
//   blank … 【ア】に入るものを選ぶ
//   code  … 自分で書いて、いくつかのテストで確かめる

import { CodeCompletionEngine } from './completion.js';
import { autoIndent, formatCode } from './pyformat.js';
import {
  initSidebar, initTabs, initMaximize, toast, confirmDialog, debounce, showFix, bootPython,
  makeEditorFriendly, bindRunShortcut, addTextSizeControl, safeStorage,
} from './ui.js';
import { EDITOR_CONFIG } from './config.js';
import { attachHalfWidth, addHalfWidthControl } from './halfwidth.js';
import { addIndentGuide } from './indentguide.js';
import { toKtph, toKtphFragment } from './ktph.js';
import { defineKtphMode } from './ktph-mode.js';
import { renderFlowchart, fitFlowchart, highlightFlowLine } from './flowview.js';
import { explainError, suggestFix } from './pyrun.js';
import {
  runProgram, runTests, traceGroundTruth, createInteractiveInput, createScriptedInput, inputLines,
} from './lessons-run.js';
import { gradeTrace, gradeBlanks, gradeTests, scoreMock, sameOutput } from './grade.js';
import {
  loadIndex, loadCourse, loadMockSet, findByRef, findBlankKeys, fillBlanks, correctPicks, problemRef,
} from './lessons-data.js';
import {
  markSolved, markTried, isSolved, saveDraft, getDraft, isDraftStale, clearDraft, rememberLast, lastOpened,
  recordMock, bestMock, clearProgress, exportProgress, importProgress,
} from './lessons-progress.js';
import { recordTrace, namesInLine } from './stepper.js';
import {
  describeStep, renderStepCaption, renderStepOutput, markStepLines, renderVariables,
  explainLine, annotateStep, variableHistory,
} from './stepview.js';
import { attachBlockScope, showBlockAt } from './blockscope.js';
import * as ai from './ai.js';
import { icon, iconHtml, setIconLabel } from './icons.js';

const $ = (id) => document.getElementById(id);

/* ============================================================
 * 状態
 * ========================================================== */

let pyodide = null;
let editorPy = null;
let editorKtph = null;
let completion = null;
let tabs = null;
/** 左の一覧の開け閉め。狭い画面で問題を開くときに閉じる */
let nav = null;

/** コース一覧とその中身 */
const courses = {};
let courseOrder = [];
let mockSets = [];

/** 今開いている問題 */
let current = null;
/** trace 問題で「答え合わせ」を一度でも押したか（押すまで実行できない） */
let answered = false;
/** 今の選択・記入 */
let picks = {};
/** フローチャートの行 → 図形の対応 */
let flowLines = {};

/** 模試の進行 */
let mock = null;

/** 入力欄の受けわたし */
const inputState = { waiting: false, resolve: null };
/** 実行中か（入力待ちのあいだも true） */
let running = false;
/** 問題を開くときの書きかえ中か（このあいだは書きかけを保存しない） */
let loadingProblem = false;
/** コードの字下げとまとまりの見せ方（blockscope.js） */
let pyScope = null;
/** いまの問題で、続けてまちがえた回数（2 回でヒントを開く） */
let wrongInRow = 0;
/** 一覧で、まだ解けていない問題だけを見せるか */
const UNSOLVED_KEY = 'easycode_lessons_unsolved_only';
let unsolvedOnly = safeStorage.get(UNSOLVED_KEY) === '1';

/** ステップ実行 */
const step = { list: [], index: 0, active: false, error: null };

/* ============================================================
 * 1. かんたんな文章の組み立て
 * ========================================================== */

/**
 * 軽いマークダウン（`コード` と **太字** と改行）を HTML にする
 *
 * 問題文は自分たちで書くものだが、HTML をそのまま入れると
 * 事故のもとになるので、文字は必ず逃がしてから組み立てる。
 * @param {string} text
 * @returns {string}
 */
function toSafeHtml(text) {
  const escape = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const blocks = String(text ?? '').split('\n\n');

  return blocks.map((block) => {
    // ```〜``` はコードのかたまり
    const fenced = /^```[a-z]*\n([\s\S]*?)```$/.exec(block.trim());
    if (fenced) return `<pre><code>${escape(fenced[1].replace(/\n$/, ''))}</code></pre>`;

    const lines = block.split('\n');
    const isList = lines.every(line => /^\s*[-・]\s+/.test(line));
    const inline = (s) => escape(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    if (isList) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-・]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

/** 結果の知らせを出す */
function showNote(target, tone, html) {
  const box = typeof target === 'string' ? $(target) : target;
  if (!box) return;
  box.innerHTML = '';
  if (!html) return;
  const note = document.createElement('div');
  note.className = `note is-${tone}`;
  note.innerHTML = html;
  box.appendChild(note);
}

/* ============================================================
 * 2. エディタと表示の切り替え
 * ========================================================== */

/** CodeMirror の共通の設定 */
function editorOptions(mode, readOnly) {
  return {
    mode,
    lineNumbers: true,
    indentUnit: EDITOR_CONFIG.INDENT_UNIT,
    tabSize: EDITOR_CONFIG.TAB_SIZE,
    lineWrapping: EDITOR_CONFIG.LINE_WRAPPING,
    smartIndent: true,
    electricChars: true,
    indentWithTabs: false,
    readOnly: readOnly ? 'nocursor' : false,
    rulers: [4, 8, 12, 16, 20, 24, 28, 32].map(column => ({
      column, className: 'cm-indent-guide', lineStyle: 'solid',
    })),
    extraKeys: readOnly ? {} : {
      Tab: (cm) => {
        if (cm.somethingSelected()) { cm.indentSelection('add'); return; }
        cm.replaceSelection(' '.repeat(cm.getOption('indentUnit') || 4), 'end');
      },
      'Shift-Tab': 'indentLess',
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
      // CodeMirror はキー名を Shift-Ctrl-… の順に正規化するので、その順で書く
      'Shift-Ctrl-F': () => applyTransform(formatCode),
      'Shift-Cmd-F': () => applyTransform(formatCode),
      'Shift-Alt-F': () => applyTransform(formatCode),
      'Shift-Ctrl-I': () => applyTransform(autoIndent),
      'Shift-Cmd-I': () => applyTransform(autoIndent),
      'Shift-Alt-I': () => applyTransform(autoIndent),
    },
  };
}

/** 整形して書きもどす（カーソルとスクロールは保つ） */
function applyTransform(transform) {
  const before = editorPy.getValue();
  const after = transform(before);
  if (before === after) return;
  const cursor = editorPy.getCursor();
  const scroll = editorPy.getScrollInfo();
  editorPy.setValue(after);
  editorPy.setCursor({ line: Math.min(cursor.line, editorPy.lineCount() - 1), ch: cursor.ch });
  editorPy.scrollTo(scroll.left, scroll.top);
}

/** 今のコード（Python） */
function currentCode() {
  return editorPy ? editorPy.getValue() : '';
}

/** 表記のビューとフローチャートを、今のコードに合わせる */
const syncViews = debounce(() => {
  const code = currentCode();

  const { text, warnings } = toKtph(code);
  if (editorKtph && editorKtph.getValue() !== text) editorKtph.setValue(text);

  const warnBox = $('ktph-warning');
  if (warnings.length) {
    const lines = [...new Set(warnings.map(w => w.line))].join(', ');
    warnBox.textContent = `${lines} 行目は、共通テスト用の表記には無い書き方です（試験では問題文の中で説明されます）。`;
    const showing = tabs && (tabs.current() === 'ktph' || tabs.current() === 'pair');
    warnBox.style.display = showing ? '' : 'none';
  } else {
    warnBox.style.display = 'none';
  }

  if (tabs && tabs.current() === 'flow') {
    renderFlowchart($('flowchart'), code).then((result) => { flowLines = result.lineByNode; });
  }
}, 250);

/* ============================================================
 * 3. 一覧を描く
 * ========================================================== */

function renderNav() {
  const body = $('nav-body');
  body.innerHTML = '';

  // 試験前に「まだのところ」だけ回せるように
  const filter = document.createElement('label');
  filter.className = 'nav-filter';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = unsolvedOnly;
  box.addEventListener('change', () => {
    unsolvedOnly = box.checked;
    safeStorage.set(UNSOLVED_KEY, unsolvedOnly ? '1' : '0');
    renderNav();
  });
  filter.append(box, document.createTextNode('まだ解けていない問題だけ'));
  body.appendChild(filter);

  for (const entry of courseOrder) {
    const course = courses[entry.id];
    const block = document.createElement('div');
    block.className = 'course-block';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'course-head';
    // STORY:「左の凡例で今どこにいるかを知り」。開いている問題のコースを示す
    if (current && current.courseId === entry.id) head.setAttribute('aria-current', 'true');
    head.innerHTML = `<span class="lane">${entry.lane || ''}</span><span>${entry.title}</span>`;

    if (entry.kind === 'mock') {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${mockSets.length} 回`;
      head.appendChild(count);
      block.appendChild(head);

      const summary = document.createElement('p');
      summary.className = 'course-summary';
      summary.textContent = entry.summary;
      block.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'lesson-list';
      for (const set of mockSets) {
        const best = bestMock(set.id);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lesson-item';
        item.innerHTML =
          `<span class="mark" data-state="mock"></span><span class="name">${set.title}</span>` +
          `<span class="kind">${best ? `最高 ${best.score}点` : '未受験'}</span>`;
        item.addEventListener('click', () => startMock(set.id));
        list.appendChild(item);
      }
      block.appendChild(list);
      body.appendChild(block);
      continue;
    }

    const solvedCount = (course.lessons || [])
      .flatMap(l => l.problems).filter(p => isSolved(problemRef(p))).length;
    const total = (course.lessons || []).flatMap(l => l.problems).length;

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${solvedCount}/${total}`;
    head.appendChild(count);
    block.appendChild(head);

    const summary = document.createElement('p');
    summary.className = 'course-summary';
    summary.textContent = entry.summary;
    block.appendChild(summary);

    for (const lesson of course.lessons || []) {
      const lessonSolved = lesson.problems.filter(p => isSolved(problemRef(p))).length;
      const shown = lesson.problems.filter(p => !unsolvedOnly || !isSolved(problemRef(p))
        || (current && problemRef(current) === problemRef(p)));
      // 「未解決だけ」で、この課がぜんぶ解けていたら、課ごと畳む
      if (!shown.length) continue;
      const title = document.createElement('p');
      title.className = 'lesson-title';
      title.textContent = lesson.title;
      const lessonCount = document.createElement('span');
      lessonCount.className = 'lesson-count';
      lessonCount.textContent = ` ${lessonSolved}/${lesson.problems.length}`;
      title.appendChild(lessonCount);
      block.appendChild(title);

      const list = document.createElement('div');
      list.className = 'lesson-list';
      for (const problem of shown) {
        const ref = problemRef(problem);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lesson-item';
        item.dataset.ref = ref;
        if (current && problemRef(current) === ref) {
          item.setAttribute('aria-current', 'true');
          // 凡例は長い。今いる場所が畳まれた外にあると「どこにいるか」が分からない
          requestAnimationFrame(() => item.scrollIntoView({ block: 'nearest' }));
        }
        item.innerHTML =
          `<span class="mark" data-state="${isSolved(ref) ? 'done' : 'todo'}"></span>` +
          `<span class="name"></span>` +
          `<span class="kind">${kindLabel(problem.type)}</span>`;
        item.querySelector('.name').textContent = problem.title || problem.id;
        item.addEventListener('click', () => openProblem(ref));
        list.appendChild(item);
      }
      block.appendChild(list);
    }

    body.appendChild(block);
  }
}

function kindLabel(type) {
  return { read: '読む', trace: '追う', blank: '埋める', code: '書く' }[type] || '';
}

/* ============================================================
 * 4. 問題を開く
 * ========================================================== */

/** 自由記述のはじめのコード */
const FREE_START = '# 好きなように書いてみましょう\nprint("こんにちは")\n';

/** その問題の最初のコード（書きかけが無いときに開くもの） */
function originalCode(problem) {
  if (!problem) return '';
  if (problem.id === 'free') return FREE_START;
  return problem.type === 'code' ? (problem.template || '') : (problem.program || '');
}

/** ref から問題を探す */
function problemByRef(ref) {
  return findByRef(courses, ref);
}

/**
 * 問題を開く
 * @param {string} ref 'kyotsu#bin-search'
 */
function openProblem(ref) {
  const problem = problemByRef(ref);
  if (!problem || busyNotice()) return;

  current = problem;
  answered = false;
  picks = {};
  wrongInRow = 0;
  exitStepMode();

  // 書きかけがあれば、それを開く
  const original = originalCode(problem);
  const draft = getDraft(ref);
  const stale = draft !== null && draft !== original && isDraftStale(ref, original);
  // 開くための書きかえでは保存しない。古い書きかけは、手を入れるまで消さずに残す
  loadingProblem = true;
  try {
    editorPy.setValue(draft !== null ? draft : original);
    // 別の問題を開いたら、前の問題のコードには「元に戻す」で戻らないようにする
    editorPy.clearHistory();
    if (stale) {
      // 問題が作り直されていたら、新しい最初のコードを開く。
      // 前の書きかけは「元に戻す」で取り出せる（ここで書きはじめるまでは、記録にも残っている）
      editorPy.setValue(original);
      toast('この問題は新しくなりました。前の書きかけは「元に戻す」で戻せます。', 5200);
    }
  } finally {
    loadingProblem = false;
  }

  // 共通テスト対策は、試験と同じ見た目（表記）から見せる
  tabs.select(problem.view === 'ktph' ? 'ktph' : 'python');

  // 狭い画面では一覧が第一画面を占めてしまうので、開いたら閉じる
  if (window.matchMedia('(max-width: 1000px)').matches && nav) nav.toggle(false);

  renderProblem(problem);
  renderNav();
  rememberLast(ref);
  if (!mock) history.replaceState(null, '', `#${ref}`);
  syncViews.flush ? syncViews.flush() : syncViews();
  syncViews();
}

/** 問題の中身を画面に出す */
function renderProblem(problem) {
  $('problem-title').textContent = problem.title || '';

  const kind = $('problem-kind');
  kind.textContent = kindLabel(problem.type);
  kind.style.display = problem.type ? '' : 'none';

  const level = $('problem-level');
  const difficulty = Math.max(1, Math.min(5, problem.difficulty || 1));
  level.innerHTML = `難しさ ${difficulty}<span class="of"> / 5</span>`;
  level.style.display = problem.difficulty ? '' : 'none';

  $('current-label').textContent = mock
    ? `模試 ${mock.index + 1} / ${mock.entries.length}`
    : (problem.title || 'レッスン');

  // 共通テスト表記のきまりを、その課だけ出す
  const note = $('ktph-note');
  const courseNote = courses[problem.courseId] && courses[problem.courseId].note;
  if (problem.view === 'ktph' && courseNote) {
    note.textContent = courseNote;
    note.style.display = '';
  } else {
    note.style.display = 'none';
  }

  $('problem-text').innerHTML = toSafeHtml(problem.description || '');
  showNote('check-result', 'ok', '');

  renderAnswerArea(problem);

  // ヒントと解説（模試の間は出さない）
  renderHints(problem);

  const explainBox = $('explain-box');
  explainBox.style.display = !mock && problem.explanation ? '' : 'none';
  explainBox.open = false;
  $('explain-text').innerHTML = toSafeHtml(problem.explanation || '');

  $('ai-box').style.display = mock ? 'none' : '';
  $('chat-box').style.display = mock ? 'none' : '';
  $('explanation').textContent = '';
  $('review').textContent = '';

  // ボタンの見せ方
  $('check-btn').style.display = problem.type === 'read' ? 'none' : '';
  if (mock) { setIconLabel($('check-btn'), 'next', '記録して次へ'); }
  else { setIconLabel($('check-btn'), 'check', '答え合わせ'); }
  updateRunAvailability();

  $('output').textContent = '「実行」で動かせます';
  $('runtime-input-container').style.display = 'none';
}

/**
 * ヒントを出す
 *
 * ヒントは 1 つずつ出す。はじめから全部見せると、
 * 「少しだけ助けがほしい人」にも答えに近いところまで見せてしまう。
 * 1 つ目は着眼点、2 つ目でやり方まで踏みこむ、という順に書いてある。
 */
function renderHints(problem) {
  const box = $('hint-box');
  const body = $('hint-text');
  const steps = Array.isArray(problem.hint) ? problem.hint
    : (problem.hint ? [problem.hint] : []);

  box.style.display = !mock && steps.length ? '' : 'none';
  box.open = false;
  body.innerHTML = '';
  if (!steps.length) return;

  let shown = 0;

  const more = document.createElement('button');
  more.className = 'btn btn-sm';
  more.type = 'button';

  const reveal = () => {
    const step = document.createElement('div');
    step.className = 'hint-step';
    if (steps.length > 1) {
      const mark = document.createElement('span');
      mark.className = 'lane';
      mark.textContent = String(shown + 1);
      step.appendChild(mark);
    }
    const text = document.createElement('div');
    text.innerHTML = toSafeHtml(steps[shown]);
    step.appendChild(text);
    body.insertBefore(step, more);
    shown += 1;

    if (shown >= steps.length) {
      more.remove();
    } else {
      more.textContent = `もう少し詳しく（あと ${steps.length - shown}）`;
    }
  };

  body.appendChild(more);
  more.addEventListener('click', reveal);
  reveal();
}

/** 型ごとの答え方を出す */
function renderAnswerArea(problem) {
  const area = $('answer-area');
  area.innerHTML = '';

  if (problem.type === 'read') {
    if (Array.isArray(problem.tasks) && problem.tasks.length) {
      const title = document.createElement('p');
      title.className = 'answer-question';
      title.textContent = 'やってみよう';
      const list = document.createElement('ul');
      list.className = 'task-list';
      for (const task of problem.tasks) {
        const li = document.createElement('li');
        li.textContent = task;
        list.appendChild(li);
      }
      area.append(title, list);
    }
    return;
  }

  if (problem.type === 'trace') {
    const question = document.createElement('p');
    question.className = 'answer-question';
    question.textContent = problem.question || '答えを書きなさい。';
    area.appendChild(question);

    if (Array.isArray(problem.choices)) {
      const list = document.createElement('div');
      list.className = 'choice-list';
      problem.choices.forEach((choice, index) => {
        const label = document.createElement('label');
        label.className = 'choice-item';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'trace-choice';
        radio.value = String(index);
        radio.addEventListener('change', () => { picks.choice = index; });
        const code = document.createElement('code');
        code.textContent = choice;
        label.append(radio, code);
        list.appendChild(label);
      });
      area.appendChild(list);
    } else {
      const row = document.createElement('div');
      row.className = 'answer-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'trace-answer';
      input.placeholder = '答えを書く';
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkCurrent(); });
      row.appendChild(input);
      area.appendChild(row);
    }
    return;
  }

  if (problem.type === 'blank') {
    const question = document.createElement('p');
    question.className = 'answer-question';
    question.textContent = '空欄に入るものを選びなさい。';
    area.appendChild(question);

    for (const blank of problem.blanks || []) {
      const row = document.createElement('div');
      row.className = 'blank-row';

      const key = document.createElement('span');
      key.className = 'blank-key';
      key.textContent = `【${blank.key}】`;

      const select = document.createElement('select');
      select.dataset.key = blank.key;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '選んでください';
      select.appendChild(empty);
      blank.choices.forEach((choice, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        // 共通テスト対策では、プログラムと同じ表記で選択肢を見せる（// ではなく ÷ など）
        option.textContent = problem.courseId === 'kyotsu' ? toKtphFragment(choice) : choice;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        picks[blank.key] = select.value === '' ? undefined : Number(select.value);
      });

      const judge = document.createElement('span');
      judge.className = 'judge';
      judge.dataset.key = blank.key;

      row.append(key, select, judge);
      area.appendChild(row);
    }

    const apply = document.createElement('button');
    apply.className = 'btn btn-sm';
    apply.textContent = '空欄をエディタへ';
    apply.addEventListener('click', () => {
      editorPy.setValue(fillBlanks(problem.program, problem.blanks, picks));
      syncViews();
      toast('選んだもので埋めました');
    });
    area.appendChild(apply);
    return;
  }

  if (problem.type === 'code' && Array.isArray(problem.tests) && problem.tests.length) {
    const question = document.createElement('p');
    question.className = 'answer-question';
    question.textContent = `${problem.tests.length} つの入力で確かめます。`;
    area.appendChild(question);
  }
}

/** trace は答えるまで実行できない（先に予想してもらう） */
function updateRunAvailability() {
  const locked = current && current.type === 'trace' && !answered && !mock;
  const title = running ? '実行が終わるまでお待ちください'
    : (locked ? 'まず答えを書いてから実行できます' : '');
  for (const id of ['run-btn', 'step-btn']) {
    const button = $(id);
    button.disabled = running || locked || !pyodide;
    button.title = title || button.dataset.hint || '';
  }
  $('check-btn').disabled = running;
}

/** 実行中（入力待ちを含む）なら知らせて true を返す。途中で問題を替えると、入力が迷子になる */
function busyNotice() {
  if (!running) return false;
  if (inputState.waiting) {
    toast('プログラムが入力を待っています。下の入力欄に打ちこんで Enter を押すと続きます。', 4200);
    $('runtime-input').focus();
  } else {
    toast('いま実行中です。終わるまでお待ちください。');
  }
  return true;
}

/* ============================================================
 * 5. 実行
 * ========================================================== */

/** 実行に使うコード（穴埋めは選んだもので埋める） */
function codeToRun() {
  if (current && current.type === 'blank') {
    const filled = fillBlanks(current.program, current.blanks, picks);
    // 埋めていない空欄が残っていたら、エディタの中身をそのまま使う
    return filled.includes('【') ? currentCode() : filled;
  }
  return currentCode();
}

async function runCurrent() {
  if (!pyodide || !current || busyNotice()) return;

  if (current.type === 'blank') {
    const missing = (current.blanks || []).filter(b => picks[b.key] === undefined).map(b => b.key);
    if (missing.length) {
      showNote('check-result', 'warn', `【${missing.join('】【')}】を選んでから実行してください。`);
      return;
    }
  }

  const code = codeToRun();
  if (!code.trim()) {
    $('output').textContent = '実行するコードがありません。';
    return;
  }

  // 実行のあいだに問題が替わっても、動かした問題で判定する
  const problem = current;
  running = true;
  updateRunAvailability();
  $('output').textContent = '';

  try {
    const handler = current.input
      ? createScriptedInput(inputLines(current.input))
      : createInteractiveInput({
        outputEl: $('output'),
        containerEl: $('runtime-input-container'),
        inputEl: $('runtime-input'),
        labelEl: $('runtime-input-label'),
      }, inputState);

    const capture = current.check && current.check.kind === 'variable' && current.check.name
      ? [current.check.name] : null;

    const result = await runProgram(pyodide, {
      code,
      prelude: current.prelude || null,
      inputHandler: handler,
      element: $('output'),
      capture,
    });

    if (result.error) {
      if ($('output').textContent) $('output').textContent += '\n';
      $('output').textContent += explainError(result.error, code);
      showFix(suggestFix(code, result.error), applyFix);
    } else if (!$('output').textContent) {
      $('output').textContent = '(出力なし)';
    }

    if (capture && result.variables[capture[0]] !== undefined) {
      $('output').textContent += `\n\n実行のあと ${capture[0]} = ${result.variables[capture[0]]}`;
    }

    // 読むだけの課は、動かしたら終わり
    if (problem === current && problem.type === 'read' && !result.error) {
      const ok = !problem.expectedOutput || sameOutput(result.output, problem.expectedOutput);
      if (ok) {
        markSolved(problemRef(problem));
        renderNav();
        showNote('check-result', 'ok', '動かせました。次に進みましょう。');
      }
    }
  } catch (e) {
    console.error('実行エラー:', e);
    $('output').textContent += '\nエラー: ' + e.message;
  } finally {
    running = false;
    $('runtime-input-container').style.display = 'none';
    inputState.waiting = false;
    inputState.resolve = null;
    updateRunAvailability();
  }
}

/* ============================================================
 * 6. 答え合わせ
 * ========================================================== */

async function checkCurrent() {
  if (!current || current.type === 'read' || busyNotice()) return;
  const ref = problemRef(current);

  if (current.type === 'trace') {
    const given = Array.isArray(current.choices)
      ? picks.choice
      : ($('trace-answer') ? $('trace-answer').value : '');
    if (given === undefined || given === '') {
      showNote('check-result', 'warn', '答えを書いてから押しましょう。');
      return;
    }
    answered = true;
    updateRunAvailability();

    const result = gradeTrace(current, given);
    finishAnswer(ref, result.ok,
      result.ok ? '正解です。' :
        'ちがいます。「実行」で実際に動かして、どこがちがうか確かめてみましょう。');
    return;
  }

  if (current.type === 'blank') {
    const result = gradeBlanks(current, picks);
    if (result.unanswered.length) {
      showNote('check-result', 'warn', `【${result.unanswered.join('】【')}】を選んでください。`);
      return;
    }
    for (const [key, ok] of Object.entries(result.perBlank)) {
      const judge = document.querySelector(`.judge[data-key="${key}"]`);
      if (judge) judge.innerHTML = mock ? '' : iconHtml(ok ? 'check' : 'cross');
    }
    finishAnswer(ref, result.ok, result.ok
      ? '正解です。'
      : '✕ のところを選び直しましょう。「実行」で埋めたプログラムを動かすと、どこがちがうか分かります。');
    return;
  }

  // code: テストをまとめて走らせる
  if (!pyodide) { toast('Python を準備しています。少し待ってから、もう一度押してください。'); return; }
  running = true;
  updateRunAvailability();
  showNote('check-result', 'ok', '確かめています…');

  try {
    const results = await runTests(pyodide, {
      code: currentCode(),
      prelude: current.prelude || null,
      tests: current.tests || [],
    });
    const summary = gradeTests(results);

    if (mock) {
      finishAnswer(ref, summary.ok, '');
      return;
    }

    const rows = results.map((row, index) => `
      <tr class="${row.ok ? '' : 'is-ng'}">
        <td>${index + 1}</td>
        <td class="mono">${escapeHtml(row.input || '(なし)')}</td>
        <td class="mono">${escapeHtml(row.expected)}</td>
        <td class="mono">${escapeHtml(row.error ? row.error.type + ': ' + row.error.message : row.actual)}</td>
        <td>${iconHtml(row.ok ? 'check' : 'cross')}</td>
      </tr>`).join('');

    showNote('check-result', summary.ok ? 'ok' : 'bad', `
      <p><strong>${summary.ok ? '全部通りました。' : `${summary.passed} / ${summary.total} 通りました`}</strong></p>
      <table class="test-table">
        <tr><th>#</th><th>入力</th><th>期待</th><th>実際</th><th>判定</th></tr>
        ${rows}
      </table>`);

    finishAnswer(ref, summary.ok, null);
  } finally {
    running = false;
    updateRunAvailability();
  }
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** 答え合わせのあとの共通の処理 */
function finishAnswer(ref, ok, message) {
  markTried(ref);
  if (ok) markSolved(ref);
  renderNav();

  if (mock) {
    mock.outcomes[ref] = ok;
    nextMockProblem();
    return;
  }

  if (message !== null) showNote('check-result', ok ? 'ok' : 'bad', message);
  if (ok && current.explanation) $('explain-box').open = true;

  // 2 回続けてまちがえたら、ヒントを開いてあげる（ひとりで抱えこまないように）
  wrongInRow = ok ? 0 : wrongInRow + 1;
  const hintBox = $('hint-box');
  if (wrongInRow >= 2 && hintBox.style.display !== 'none' && !hintBox.open) {
    hintBox.open = true;
    const box = $('check-result').querySelector('.note');
    if (box) {
      const tip = document.createElement('p');
      tip.className = 'muted';
      tip.style.margin = 'var(--sp-1) 0 0';
      tip.textContent = '下の「ヒント」を開きました。1 つずつ読んでみましょう。';
      box.appendChild(tip);
    }
    hintBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // 正解したら、その場から次へ進めるようにする（上のボタンを探させない）
  if (ok && !mock) {
    const box = $('check-result').querySelector('.note');
    const next = nextRef();
    if (box && next) {
      const button = document.createElement('button');
      button.className = 'btn btn-sm btn-mark';
      button.style.marginTop = 'var(--sp-2)';
      button.textContent = '次の問題 ›';
      button.addEventListener('click', () => openProblem(next));
      box.appendChild(button);
    }
  }
  // 作り直す前の書きかけが残っていたら、手を入れていないまま確かめても消さない
  const original = originalCode(current);
  if (!(currentCode() === original && isDraftStale(ref, original))) saveDraft(ref, currentCode(), original);
}

/**
 * 「global x を書き入れる」が押されたときの動き
 *
 * 学習者のコードに、その 1 行を実際に足す。
 * @param {string} code 直したコード
 * @param {number} line 足した行
 */
function applyFix(code, line) {
  editorPy.setValue(code);
  editorPy.setCursor({ line: line - 1, ch: editorPy.getLine(line - 1).length });
  editorPy.focus();
  toast('コードを直しました。もう一度「実行」を押してみましょう', 3600);
}

/* ============================================================
 * 7. ステップ実行
 * ========================================================== */

async function startStepMode() {
  if (busyNotice()) return;
  if (!pyodide || !current) return;
  const code = codeToRun();
  if (!code.trim()) return;

  $('output').textContent = '実行のようすを記録しています…';
  const problem = current;
  running = true;
  updateRunAvailability();
  try {
    const trace = await recordTrace(pyodide, code, inputLines(current.input));
    // 記録のあいだに問題が替わったら、古い記録は見せない
    if (problem !== current) return;
    if (!trace.steps.length) {
      $('output').textContent = trace.error || '記録できる処理がありませんでした。';
      return;
    }
    step.list = trace.steps;
    step.index = 0;
    step.active = true;
    showFix(null);
    if (pyScope) pyScope.pause(true);
    step.error = trace.error;
    step.truncated = trace.truncated;

    $('step-panel').style.display = '';
    $('step-slider').max = String(trace.steps.length - 1);
    showStep(0);
    $('step-next').focus();
  } catch (e) {
    $('output').textContent = 'ステップ実行にしくじりました: ' + e.message;
  } finally {
    running = false;
    updateRunAvailability();
  }
}

/* ------------------------------------------------------------
 * 並べて結ぶ（THESIS：同じ 1 本のプログラムを、同じ行番号で結ぶ）
 *
 * エディタは 1 つずつしか無いので、並べるときは stage の箱ごと
 * 左右の枠に移し、離れるときは元の場所へ戻す。
 * ---------------------------------------------------------- */

/** 並べる／戻す */
function layoutPair(on) {
  const body = $('program-body');
  const py = $('stage-python');
  const kt = $('stage-ktph');
  if (!body || !py || !kt) return;

  if (on) {
    $('pair-left').appendChild(py);
    $('pair-right').appendChild(kt);
    py.classList.add('is-shown');
    kt.classList.add('is-shown');
  } else if (py.parentElement !== body) {
    body.insertBefore(kt, body.firstChild);
    body.insertBefore(py, kt.nextSibling);
  }
}

/**
 * 左右の同じ行を朱の 1 本でつなぐ。
 * 2 つのエディタは同じ行の高さなので、上からの距離も必ず一致する。
 * @param {number} [line] 1 から数えた行。省くと線を消す
 */
function drawPairMark(line = step.active ? (step.list[step.index] || {}).line : 0) {
  const rail = $('pair-rail');
  const mark = $('pair-mark');
  if (!rail || !mark || !editorPy) return;

  // 罫の間隔を、実際の行の高さから取る（書体が変わっても崩れない）
  const height = editorPy.defaultTextHeight();
  const top = editorPy.charCoords({ line: 0, ch: 0 }, 'local').top;
  // まだ並べ替えた直後で寸法が出ていないことがある。次の描画で測り直す
  if (height <= 2) {
    requestAnimationFrame(() => drawPairMark(line));
    return;
  }
  rail.style.setProperty('--pair-line', `${height}px`);
  rail.style.setProperty('--pair-top', `${top}px`);

  if (!line || line < 1 || line > editorPy.lineCount()) {
    mark.hidden = true;
    return;
  }
  const y = editorPy.charCoords({ line: line - 1, ch: 0 }, 'local').top
    - editorPy.getScrollInfo().top + height / 2;
  mark.hidden = false;
  mark.style.top = `${Math.round(y)}px`;
}

function showStep(index) {
  if (!step.active) return;
  step.index = Math.max(0, Math.min(index, step.list.length - 1));
  const state = step.list[step.index];
  const previous = step.index > 0 ? step.list[step.index - 1] : null;

  $('step-slider').value = String(step.index);
  $('step-label').textContent = `${step.index + 1} / ${step.list.length}`;
  $('step-first').disabled = step.index === 0;
  $('step-prev').disabled = step.index === 0;
  $('step-next').disabled = step.index === step.list.length - 1;

  const info = describeStep(step.list, step.index, { error: step.error, truncated: step.truncated });
  const after = step.index === step.list.length - 1 && step.error ? `\n${step.error}` : '';
  renderStepOutput($('output'), state.output || '', info.newOutput, { after });
  // 文に引くコードは、いま見ている方（共通テスト表記か Python か）にそろえる
  const showingKtph = tabs.current() === 'ktph' && editorKtph;
  renderStepCaption($('step-caption'), info, (n) => (showingKtph
    ? (editorKtph.getLine(n - 1) || '').replace(/^[\s｜⎿]+/, '')
    : editorPy.getLine(n - 1) || ''));

  // コードと表記の両方に、同じ 2 つの行の印をつける（表記の行は Python と 1 対 1）
  const doneLine = info.doneKind === 'call' ? null : info.done;
  markStepLines(editorPy, { done: doneLine, next: info.next });
  markStepLines(editorKtph, { done: doneLine, next: info.next });
  if (tabs.current() === 'flow') highlightFlowLine($('flowchart'), flowLines, info.next);
  drawPairMark(info.next);

  const lineText = info.next ? editorPy.getLine(info.next - 1) || '' : '';
  const { order, history } = variableHistory(step.list, step.index);
  renderVariables($('step-vars'), state.vars, info.baseVars, namesInLine(lineText), { order, history });
  // いま実行した行の後ろに、その行がしたことを書く（表記の方にも同じ注釈）
  const note = explainLine(step.list, step.index, info, (n) => editorPy.getLine(n - 1) || '');
  annotateStep(editorPy, info.done, note);
  annotateStep(editorKtph, info.done, note);
  showBlockAt(editorPy, info.next || info.done);
}

function exitStepMode() {
  step.active = false;
  step.list = [];
  $('step-panel').style.display = 'none';
  markStepLines(editorPy, {}, { scroll: false });
  markStepLines(editorKtph, {}, { scroll: false });
  annotateStep(editorPy, null);
  annotateStep(editorKtph, null);
  if (pyScope) pyScope.pause(false);
  if ($('step-caption')) $('step-caption').replaceChildren();
  highlightFlowLine($('flowchart'), flowLines, 0);
  drawPairMark(0);
}

/* ============================================================
 * 8. 模試
 * ========================================================== */

function startMock(setId) {
  const set = mockSets.find(s => s.id === setId);
  if (!set || busyNotice()) return;

  const best = bestMock(setId);
  showMockIntro(set, best);
}

function showMockIntro(set, best) {
  mock = null;
  $('mock-chip').style.display = 'none';
  $('problem-title').textContent = set.title;
  $('problem-kind').style.display = 'none';
  $('problem-level').style.display = 'none';
  $('ktph-note').style.display = 'none';
  $('problem-text').innerHTML = toSafeHtml(
    `${set.summary}\n\n問題は ${set.entries.length} 問です。制限時間はありません。\n\n`
    + '途中では正誤を見せません。すべて答えたあとに点数と解説が出ます。'
    + (best ? `\n\n前回までの最高点は ${best.score} / ${best.total} 点です。` : ''));

  const area = $('answer-area');
  area.innerHTML = '';
  const start = document.createElement('button');
  start.className = 'btn btn-primary';
  setIconLabel(start, 'run', '始める');
  start.addEventListener('click', () => beginMock(set));
  area.appendChild(start);

  showNote('check-result', 'ok', '');
  $('check-btn').style.display = 'none';
  for (const id of ['hint-box', 'explain-box', 'ai-box', 'chat-box']) $(id).style.display = 'none';
}

function beginMock(set) {
  if (busyNotice()) return;
  mock = { set, entries: set.entries, index: 0, outcomes: {} };
  $('mock-chip').style.display = '';
  openMockProblem();
}

function openMockProblem() {
  const entry = mock.entries[mock.index];
  current = entry.problem;
  answered = false;
  picks = {};
  exitStepMode();

  editorPy.setValue(current.type === 'code' ? (current.template || '') : (current.program || ''));
  // 別の問題を開いたら、前の問題のコードには「元に戻す」で戻らないようにする
  editorPy.clearHistory();
  tabs.select(current.view === 'ktph' ? 'ktph' : 'python');
  renderProblem(current);
  syncViews();
}

function nextMockProblem() {
  mock.index += 1;
  if (mock.index >= mock.entries.length) { finishMock(); return; }
  openMockProblem();
}

function finishMock() {
  const set = { problems: mock.entries.map(e => ({ ref: e.ref, points: e.points })) };
  const result = scoreMock(set, mock.outcomes);
  recordMock(mock.set.id, result);

  const rows = result.rows.map((row) => {
    const problem = problemByRef(row.ref);
    return `<tr>
      <td>${escapeHtml(problem ? problem.title : row.ref)}</td>
      <td>${row.points} 点</td>
      <td>${iconHtml(row.ok ? 'check' : 'cross')}</td>
      <td><button class="btn btn-sm" data-open="${escapeHtml(row.ref)}">解説を見る</button></td>
    </tr>`;
  }).join('');

  const setId = mock.set.id;
  mock = null;
  $('mock-chip').style.display = 'none';

  $('problem-title').textContent = '結果';
  $('problem-kind').style.display = 'none';
  $('problem-level').style.display = 'none';
  $('ktph-note').style.display = 'none';
  $('problem-text').innerHTML =
    `<p class="mock-score">${result.score} / ${result.total} 点</p>` +
    `<table class="mock-table"><tr><th>問題</th><th>配点</th><th>正誤</th><th></th></tr>${rows}</table>`;

  $('problem-text').querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openProblem(button.dataset.open));
  });

  $('answer-area').innerHTML = '';
  $('check-btn').style.display = 'none';
  showNote('check-result', result.score === result.total ? 'ok' : 'warn',
    result.score === result.total ? '全問正解です。' : 'まちがえた問題の解説を読んでみましょう。');
  renderNav();
  toast(`${setId} の結果を記録しました`);
}

/* ============================================================
 * 9. 前後の移動
 * ========================================================== */

/** すべての問題を、一覧の順に並べたもの */
function allRefs() {
  const refs = [];
  for (const entry of courseOrder) {
    if (entry.kind === 'mock') continue;
    for (const lesson of courses[entry.id].lessons || []) {
      for (const problem of lesson.problems) refs.push(problemRef(problem));
    }
  }
  return refs;
}

/** 次の問題の ref（無ければ null） */
function nextRef() {
  const refs = allRefs();
  const index = current ? refs.indexOf(problemRef(current)) : -1;
  return index >= 0 && index + 1 < refs.length ? refs[index + 1] : null;
}

function move(step) {
  if (mock) return;
  const refs = allRefs();
  const index = current ? refs.indexOf(problemRef(current)) : -1;
  const next = index + step;
  if (next < 0 || next >= refs.length) {
    toast(step > 0 ? 'ここが最後の問題です' : 'ここが最初の問題です');
    return;
  }
  openProblem(refs[next]);
}

/* ============================================================
 * 10. 立ち上げ
 * ========================================================== */

function setupRuntimeInput() {
  const send = () => {
    if (!inputState.waiting || !inputState.resolve) return;
    const input = $('runtime-input');
    const value = input.value;
    input.value = '';
    $('runtime-input-container').style.display = 'none';
    inputState.waiting = false;
    $('output').textContent += value + '\n';
    const resolve = inputState.resolve;
    inputState.resolve = null;
    resolve(value);
  };
  $('runtime-input-submit').addEventListener('click', send);
  $('runtime-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
}

function setupChat() {
  const send = async () => {
    const input = $('chat-input');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    const box = $('chat-messages');
    const mine = document.createElement('p');
    mine.textContent = 'あなた: ' + message;
    box.appendChild(mine);

    const reply = document.createElement('p');
    reply.textContent = 'AI: …';
    box.appendChild(reply);

    try {
      reply.textContent = 'AI: ' + await ai.chatWithAI(message, {
        code: currentCode(), problem: current, free: false,
      });
    } catch (e) {
      reply.textContent = 'AI: ' + e.message;
    }
  };
  $('chat-send').addEventListener('click', send);
  $('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
}

function setupAiButtons() {
  $('btn-explain').addEventListener('click', async () => {
    $('explanation').textContent = '聞いています…';
    $('explanation').textContent = await ai.explainProblem(current);
  });
  $('btn-review').addEventListener('click', async () => {
    $('review').textContent = '見てもらっています…';
    $('review').textContent = await ai.reviewCode(currentCode(), { problem: current, free: false });
  });
  $('ai-fix-code').addEventListener('click', async () => {
    const button = $('ai-fix-code');
    button.disabled = true;
    try {
      const fixed = await ai.fixCode(currentCode(), { problem: current, free: false });
      if (fixed) {
        editorPy.setValue(fixed);
        syncViews();
        toast('AI がコードを書き直しました。「元に戻す」で前のコードに戻せます', 3600);
      } else {
        showNote('check-result', 'warn', escapeHtml(ai.getLastAiError() || 'AI に直してもらえませんでした。'));
      }
    } finally {
      button.disabled = false;
    }
  });
}

async function enterFreeCoding() {
  if (busyNotice()) return;
  // 模試の途中なら、黙って抜けない
  if (mock) {
    const ok = await confirmDialog({
      title: '模試をやめますか？',
      message: 'ここまでの答えは残りません。',
      okLabel: '中止',
    });
    if (!ok) return;
    mock = null;
    $('mock-chip').style.display = 'none';
    renderNav();
  }
  current = {
    id: 'free', courseId: 'free', type: 'code', title: '自由記述',
    description: '好きなプログラムを書いて動かせます。答え合わせはありません。',
    view: 'python', tests: [],
  };
  answered = true;
  // 前に書いていたものがあれば、そこから続ける
  const draft = getDraft(problemRef(current));
  editorPy.setValue(draft !== null ? draft : FREE_START);
  // 別の問題を開いたら、前の問題のコードには「元に戻す」で戻らないようにする
  editorPy.clearHistory();
  tabs.select('python');
  renderProblem(current);
  // URL に前の問題が残っていると、読み直したときに戻ってしまう
  history.replaceState(null, '', location.pathname + location.search);
  syncViews();
}

async function init() {
  try {
    defineKtphMode(window.CodeMirror);
    editorPy = CodeMirror.fromTextArea($('code'), editorOptions('python', false));
    editorKtph = CodeMirror.fromTextArea($('code-ktph'), editorOptions('ktph', true));
    completion = new CodeCompletionEngine(editorPy, { useAI: false });
    makeEditorFriendly(editorPy, 'Python のコード');
    attachHalfWidth(editorPy);
    pyScope = attachBlockScope(editorPy);
    makeEditorFriendly(editorKtph, '共通テスト用プログラム表記（読むだけ）');

    editorPy.on('change', () => {
      // コードを書きかえたら、記録と合わなくなるのでステップ実行を終える
      if (step.active) exitStepMode();
      syncViews();
      if (current && !mock && !loadingProblem) saveDraft(problemRef(current), editorPy.getValue(), originalCode(current));
    });

    tabs = initTabs({
      tabsId: 'program-tabs',
      initial: 'python',
      onChange: (stage) => {
        layoutPair(stage === 'pair');
        for (const name of ['ktph', 'python', 'flow', 'pair']) {
          $(`stage-${name}`).classList.toggle('is-shown', name === stage);
        }
        $('ktph-warning').style.display =
          (stage === 'ktph' || stage === 'pair') && $('ktph-warning').textContent ? '' : 'none';
        requestAnimationFrame(() => {
          if (stage === 'python' || stage === 'pair') editorPy.refresh();
          if (stage === 'ktph' || stage === 'pair') editorKtph.refresh();
          if (stage === 'pair') drawPairMark();
          if (stage === 'flow') syncViews();
          // ステップ実行中なら、文に引くコードと行の印を、いま見ている方に合わせ直す
          if (step.active) showStep(step.index);
        });
      },
    });

    nav = initSidebar({
      sidebarId: 'course-nav',
      toggleId: 'toggle-nav',
      storageKey: 'easycode_lessons_sidebar',
      // 広い画面では、どんな問題があるか見えた方がよいので開いておく。
      // 狭い画面では一覧だけで第一画面が埋まるので、閉じた状態から始める。
      defaultOpen: !window.matchMedia('(max-width: 1000px)').matches,
      onToggle: () => requestAnimationFrame(() => {
        editorPy.refresh();
        fitFlowchart($('flowchart'));
        drawPairMark();
      }),
    });

    initMaximize(() => requestAnimationFrame(() => {
      editorPy.refresh();
      editorKtph.refresh();
      fitFlowchart($('flowchart'));
    }));

    // レッスンを読む
    const index = await loadIndex();
    courseOrder = index.courses;
    for (const entry of index.courses) {
      if (entry.kind === 'mock') continue;
      courses[entry.id] = await loadCourse(entry, 'lessons/');
    }
    const mockEntry = index.courses.find(c => c.kind === 'mock');
    if (mockEntry) {
      const file = await fetch(`lessons/${mockEntry.file}`).then(r => r.json());
      mockSets = (file.sets || []).map(set => loadMockSet(set, courses));
    }

    renderNav();

    // ボタン
    $('run-btn').addEventListener('click', runCurrent);
    bindRunShortcut($('run-btn'));
    $('step-btn').addEventListener('click', startStepMode);
    $('check-btn').addEventListener('click', checkCurrent);
    $('prev-problem').addEventListener('click', () => move(-1));
    $('next-problem').addEventListener('click', () => move(1));
    $('free-coding').addEventListener('click', enterFreeCoding);
    $('output-clear').addEventListener('click', () => { $('output').textContent = ''; });
    // コードの「元に戻す」「やり直す」。ブロックの側には、もとからボタンがある
    const historyButton = (id, redo) => $(id).addEventListener('click', () => {
      const editor = editorPy;
      const left = editor.historySize()[redo ? 'redo' : 'undo'];
      if (!left) { toast(redo ? 'やり直せる変更はありません' : '戻せる変更はありません'); return; }
      if (redo) editor.redo(); else editor.undo();
      editor.focus();
    });
    historyButton('code-undo', false);
    historyButton('code-redo', true);
    $('code-restore').addEventListener('click', async () => {
      if (!current) return;
      const original = originalCode(current);
      if (currentCode() === original) { toast('いまは最初のコードのままです'); return; }
      const ok = await confirmDialog({
        title: '最初のコードに戻しますか？',
        message: '書きかけは消えますが、すぐなら「元に戻す」で取り出せます。',
        okLabel: '戻す',
      });
      if (!ok) return;
      editorPy.setValue(original);
      if (!mock) clearDraft(problemRef(current));
      editorPy.focus();
      toast('最初のコードに戻しました');
    });
    $('code-indent').addEventListener('click', () => { applyTransform(autoIndent); toast('字下げをそろえました'); });
    $('code-format').addEventListener('click', () => { applyTransform(formatCode); toast('コードを整えました'); });

    $('step-first').addEventListener('click', () => showStep(0));
    $('step-prev').addEventListener('click', () => showStep(step.index - 1));
    $('step-next').addEventListener('click', () => showStep(step.index + 1));
    $('step-slider').addEventListener('input', (e) => showStep(Number(e.target.value)));
    $('step-exit').addEventListener('click', exitStepMode);
    document.addEventListener('keydown', (e) => {
      if (!step.active) return;
      // ダイアログを開いているときは、ダイアログに任せる
      if (document.querySelector('dialog[open]')) return;
      // エディタの中の Esc は「Tab で外へ出る」準備に使うので、ステップ実行は終えない
      if (e.key === 'Escape') {
        if (!(e.target.closest && e.target.closest('.CodeMirror'))) exitStepMode();
        return;
      }
      // 字を打つ欄・スライダーにいるときは、矢印をその部品に任せる（二重に進まないように）
      if (e.target.closest && e.target.closest('input, textarea, select, .CodeMirror')) return;
      if (e.key === 'ArrowRight') { showStep(step.index + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { showStep(step.index - 1); e.preventDefault(); }
      if (e.key === 'Home') { showStep(0); e.preventDefault(); }
      if (e.key === 'End') { showStep(step.list.length - 1); e.preventDefault(); }
    });

    $('reset-progress').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '記録を消しますか？',
        message: '解けた印・模試の成績・書きかけのコードが、すべて消えます。元にはもどせません。',
        okLabel: '全消去',
      });
      if (!ok) return;
      clearProgress();
      // 開いている問題も、最初のコードに戻す（書きかけが消えたのと見た目をそろえる）
      if (current) { editorPy.setValue(originalCode(current)); editorPy.clearHistory(); }
      renderNav();
      toast('記録を消しました');
    });

    addTextSizeControl($('display-settings'));
    addHalfWidthControl($('display-settings'));
    // 字下げのしくみの説明（「設定」の前に入れる）
    addIndentGuide($('course-nav'), $('display-settings').closest('details'));
    $('export-progress').addEventListener('click', () => {
      const blob = new Blob([exportProgress()], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `easycode-lessons-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast('記録をファイルに書き出しました。別の端末の「ファイルから読みこむ」で続けられます', 4200);
    });
    $('import-progress').addEventListener('click', () => $('import-progress-file').click());
    $('import-progress-file').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { solved, drafts } = importProgress(await file.text());
        renderNav();
        toast(`記録を読みこみました（解けた印 ${solved} 個・書きかけ ${drafts} 個が増えました）`, 4200);
      } catch (error) {
        toast(error.message, 4200);
      }
    });

    setupRuntimeInput();
    setupChat();
    setupAiButtons();

    // 最初に開く問題を決める
    const fromHash = location.hash.slice(1);
    const first = allRefs()[0];
    const resume = !problemByRef(fromHash) && problemByRef(lastOpened()) ? lastOpened() : null;
    openProblem(problemByRef(fromHash) ? fromHash : (resume || first));
    // 前の時間のつづきから始めたことを伝える（どこから再開したか迷わないように）
    if (resume && resume !== first) {
      toast(`前回のつづき「${problemByRef(resume).title || ''}」から始めます`, 3600);
    }

    // ページを開いたまま共有リンクを受け取ったときと、
    // ブラウザの「戻る」で URL だけ変わったときに、その問題へ移る
    window.addEventListener('hashchange', () => {
      const ref = location.hash.slice(1);
      if (!ref || mock) return;
      if (current && problemRef(current) === ref) return;
      if (!problemByRef(ref)) return;
      // 実行中で開けなかったら、URL を今の問題に戻す（読み直したときに食いちがわないように）
      if (running && current) { busyNotice(); history.replaceState(null, '', `#${problemRef(current)}`); return; }
      openProblem(ref);
    });

    updateRunAvailability();
    $('loader').style.display = 'none';
  } catch (e) {
    console.error('レッスンモードの立ち上げに失敗:', e);
    $('loader').innerHTML =
      `<p>読み込みにしくじりました。<br>${escapeHtml(e.message)}</p>`;
    return;
  }

  // 問題は先に読めるようにして、Python は後ろで読みこむ
  try {
    pyodide = await bootPython({ statusEl: $('output') });
    updateRunAvailability();
  } catch (e) {
    console.error('Python を読みこめませんでした:', e);
  }
}

window.addEventListener('DOMContentLoaded', init);
