// module/grade.js
// 答え合わせ。
//
// 期待される出力は問題ファイルに書いてあるので、AI は要らない。
// AI に判定させていたころは、APIキーが無いと答え合わせそのものができなかった。

/**
 * 期待される出力と、実際の出力を見くらべる
 *
 * 見た目だけのちがい（行末の空白・改行コード・末尾の空行）は同じとみなす。
 * 合っているのに「不正解」と言われるのが、いちばん学習の妨げになるため。
 *
 * @param {string} actual 実際の出力
 * @param {string} expected 期待される出力
 * @returns {boolean}
 */
export function sameOutput(actual, expected) {
  return tidy(actual) === tidy(expected);
}

/**
 * 見くらべる前に、出力の見た目をそろえる
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .trim();
}

/* ============================================================
 * 記述式・選択式の答え合わせ（レッスンモード）
 * ========================================================== */

/**
 * 書かれた答えを見くらべる形にそろえる
 *
 * 全角で打っても、前後に空白が入っても、同じ答えとみなす。
 * 「合っているのに不正解」と言われるのが、いちばん学習の妨げになる。
 * @param {string} text
 * @returns {string}
 */
export function normalizeAnswer(text) {
  return String(text ?? '')
    // 全角の英数字と記号を半角にする
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 2 つの答えが同じか
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameAnswer(a, b) {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

/**
 * トレース問題の答え合わせ
 * @param {object} problem 問題（answer か choices+answerIndex を持つ）
 * @param {string|number} given 書かれた答え、または選んだ番号
 * @returns {{ok: boolean, expected: string}}
 */
export function gradeTrace(problem, given) {
  if (Array.isArray(problem.choices)) {
    const expected = problem.choices[problem.answerIndex] ?? '';
    return { ok: Number(given) === Number(problem.answerIndex), expected };
  }
  const expected = String(problem.answer ?? '');
  return { ok: sameAnswer(given, expected), expected };
}

/**
 * 穴埋め問題の答え合わせ
 * @param {object} problem blanks:[{key, choices, answer}] を持つ問題
 * @param {object} picks {ア: 選んだ番号, …}
 * @returns {{ok: boolean, perBlank: object, unanswered: string[]}}
 */
export function gradeBlanks(problem, picks) {
  const perBlank = {};
  const unanswered = [];
  let ok = true;

  for (const blank of problem.blanks || []) {
    const pick = picks ? picks[blank.key] : undefined;
    if (pick === undefined || pick === null || pick === '') {
      unanswered.push(blank.key);
      perBlank[blank.key] = false;
      ok = false;
      continue;
    }
    const correct = Number(pick) === Number(blank.answer);
    perBlank[blank.key] = correct;
    if (!correct) ok = false;
  }

  return { ok, perBlank, unanswered };
}

/**
 * テストケースの結果をまとめる
 * @param {{ok: boolean}[]} results
 * @returns {{ok: boolean, passed: number, total: number}}
 */
export function gradeTests(results) {
  const list = results || [];
  const passed = list.filter(r => r.ok).length;
  return { ok: list.length > 0 && passed === list.length, passed, total: list.length };
}

/**
 * 模試の点数を出す
 * @param {{problems: {ref: string, points: number}[]}} set
 * @param {object} outcomes {ref: true/false}
 * @returns {{score: number, total: number, rows: object[]}}
 */
export function scoreMock(set, outcomes) {
  const rows = (set.problems || []).map(entry => {
    const points = Number(entry.points) || 0;
    const ok = Boolean(outcomes && outcomes[entry.ref]);
    return { ref: entry.ref, points, ok, got: ok ? points : 0 };
  });
  return {
    score: rows.reduce((sum, row) => sum + row.got, 0),
    total: rows.reduce((sum, row) => sum + row.points, 0),
    rows,
  };
}
