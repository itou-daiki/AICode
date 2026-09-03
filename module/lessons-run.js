// module/lessons-run.js
// レッスンでプログラムを走らせるところ。
//
// 走らせ方は 2 とおりある。
//   ・学習者が「実行」を押したとき … input() は画面の入力欄で受ける
//   ・答え合わせや検査のとき         … input() は用意した値を上から順に使う（台本入力）
//
// どちらも同じ pyrun.js を通すので、エラーの行番号は学習者のコードと 1 対 1 のまま。

import { runUserCode, withBrowserInput } from './pyrun.js';

/**
 * 台本の入力（決めた値を上から順に返す）
 * @param {string[]} values
 * @returns {(prompt?: string) => Promise<string>}
 */
export function createScriptedInput(values) {
  const queue = [...(values || [])];
  return () => Promise.resolve(queue.length ? String(queue.shift()) : '');
}

/**
 * 画面の入力欄で受け取る input()
 *
 * input("名前は？") の問いかけを、出力と入力欄の両方に出す。
 * これが無いと、何を聞かれているのか分からないまま入力することになる。
 *
 * @param {object} parts { outputEl, containerEl, inputEl, labelEl }
 * @param {object} state { waiting: boolean, resolve: function|null } を持つ入れ物
 * @returns {(prompt?: string) => Promise<string>}
 */
export function createInteractiveInput(parts, state) {
  return (prompt = '') => new Promise((resolve) => {
    state.waiting = true;
    state.resolve = resolve;

    const question = String(prompt ?? '');
    if (question && parts.outputEl) parts.outputEl.textContent += question;
    if (parts.labelEl) parts.labelEl.textContent = question || '値を入力';

    if (parts.containerEl) parts.containerEl.style.display = 'flex';
    if (parts.inputEl) parts.inputEl.focus();
  });
}

/**
 * 入力の台本を、行ごとの配列にする
 * @param {string|string[]} input
 * @returns {string[]}
 */
export function inputLines(input) {
  if (Array.isArray(input)) return input.map(String);
  const text = String(input ?? '');
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * プログラムを 1 回走らせる
 * @param {object} pyodide
 * @param {object} options
 * @param {string} options.code Python のコード
 * @param {string} [options.prelude] 先に読みこむ Python
 * @param {string|string[]} [options.inputs] 台本の入力（省略すると対話入力のまま）
 * @param {function} [options.inputHandler] 対話入力のときに使う関数
 * @param {HTMLElement} [options.element] 出力をその場で書き足したい要素
 * @param {string[]} [options.capture] あとで値を見たい変数
 * @param {number} [options.seconds]
 * @returns {Promise<{output: string, error: object|null, variables: object}>}
 */
export async function runProgram(pyodide, options) {
  const { code, prelude = null, inputs, inputHandler, element = null, capture = null, seconds = 10 } = options;

  // input() の受け口は、実行のたびに必ず置きかえる。
  // 前の実行の受け口が残っていると、答え合わせが画面の入力を待って止まってしまう。
  const handler = inputHandler || createScriptedInput(inputLines(inputs));
  pyodide.globals.set('custom_input', handler);

  return runUserCode(pyodide, withBrowserInput(code), { element, prelude, capture, seconds });
}

/**
 * テストをまとめて走らせる
 * @param {object} pyodide
 * @param {object} options { code, prelude, tests: [{input, expected}] }
 * @returns {Promise<{input: string, expected: string, actual: string, error: object|null, ok: boolean}[]>}
 */
export async function runTests(pyodide, { code, prelude = null, tests = [] }) {
  const { sameOutput } = await import('./grade.js');
  const results = [];

  for (const test of tests) {
    const run = await runProgram(pyodide, { code, prelude, inputs: test.input, seconds: 6 });
    const actual = run.output;
    results.push({
      input: String(test.input ?? ''),
      expected: String(test.expected ?? ''),
      actual,
      error: run.error,
      ok: !run.error && sameOutput(actual, test.expected),
    });
  }

  return results;
}

/**
 * トレース問題の正解を、実際に走らせて求める
 *
 * 問題文に書いた答えが合っているかを、検査で機械的に確かめるために使う。
 * 学習者が「実行して確かめる」を押したときにも同じ道を通る。
 *
 * @param {object} pyodide
 * @param {object} problem
 * @returns {Promise<{value: string, output: string, error: object|null}>}
 */
export async function traceGroundTruth(pyodide, problem) {
  const check = problem.check || { kind: 'output' };
  const capture = check.kind === 'variable' && check.name ? [check.name] : null;

  const run = await runProgram(pyodide, {
    code: problem.program || '',
    prelude: problem.prelude || null,
    inputs: problem.input,
    capture,
    seconds: 6,
  });

  if (run.error) return { value: '', output: run.output, error: run.error };

  let value = run.output;
  if (check.kind === 'lastLine') {
    const lines = run.output.replace(/\n+$/, '').split('\n');
    value = lines[lines.length - 1] || '';
  } else if (check.kind === 'variable') {
    value = run.variables[check.name] ?? '';
  }

  return { value: String(value).trim(), output: run.output, error: null };
}
