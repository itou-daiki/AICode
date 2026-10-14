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
    // 見えない字（コピーで紛れこむ）を取る
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    // 全角の英数字と記号を半角にする
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    // 日本語の読点・まちがえやすいマイナスや引用符も、同じ記号とみなす
    .replace(/[、､]/g, ',')
    .replace(/[\u2212\u2010-\u2015\uFF70](?=\s*\d)/g, '-')
    .replace(/ー(?=\s*\d)/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    // [1, 2] と [1,2] のように、区切りまわりの空白の有無は問わない
    .replace(/\s*([,\[\](){}:])\s*/g, '$1')
    .trim();
}

/**
 * 2 つの答えが同じか
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameAnswer(a, b) {
  const given = normalizeAnswer(a);
  const expected = normalizeAnswer(b);
  if (given === expected) return true;
  return sameTokens(given, expected);
}

/** かぎかっこや引用符でまるごと囲んであれば外す */
function stripQuotes(text) {
  const pair = /^(「(.*)」|『(.*)』|"(.*)"|'(.*)')$/.exec(text);
  if (!pair) return text;
  return [pair[2], pair[3], pair[4], pair[5]].find(inner => inner !== undefined).trim();
}

/** 数として読める字か（80 と 80.0 を同じ値とみなすため） */
const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * 区切り方や書き方のゆれを許して見くらべる（normalizeAnswer をとおしたもの同士）
 *
 *   ・「5 5」に「5,5」「5、5」と答えても同じ（正解にかっこが無いとき、, は空白と同じ）
 *   ・80 と 80.0 のように、数は値で見くらべる
 *   ・正解に引用符が無いのに「」や "" で囲んで答えても同じ
 *   ・[2, 1, 3] に、かっこを付けずに 2 1 3 や 2,1,3 と答えても同じ
 *   ・True に true、False に false と答えても同じ（ほかの言葉の大文字小文字は区別する）
 * @param {string} given
 * @param {string} expected
 * @returns {boolean}
 */
function sameTokens(given, expected) {
  let mine = given;
  let want = expected;
  // 正解に引用符が無いのに、答えを「」や " " で囲んだときだけ、囲みを外す
  // ただし "5" と ' ' で囲んだ数は、文字列の '5' と答えたものとして、数の 5 とは区別する
  if (!/[「『"']/.test(want) && !/^("|')-?\d+(\.\d+)?\1$/.test(mine)) mine = stripQuotes(mine);

  // [2,1,3] にかっこなしで答えたら、正解のかっこを外して見くらべる（入れ子のリストは外さない）
  const list = /^\[([^\[\]]*)\]$/.exec(want);
  const unwrapped = Boolean(list) && !mine.startsWith('[');
  if (unwrapped) want = list[1];

  // かっこが残っていれば、, は区切りの意味を持つので、そのまま見くらべる
  if (/[\[\](){}]/.test(want)) return false;

  // , を区切りとみなすのは、正解が数だけの並び（5 5、[2, 1, 3]）のときだけ。
  // 文の中の , （Hello, World）や、sep="," で区切った答えは、そのまま見くらべる
  const numbersOnly = want.split(/[ ,]+/).filter(Boolean).every(t => NUMBER.test(t));
  const split = (text) => text.split(numbersOnly || unwrapped ? /[ ,]+/ : / +/).filter(Boolean);
  const mineTokens = split(mine);
  const wantTokens = split(want);
  if (!wantTokens.length || mineTokens.length !== wantTokens.length) return false;

  return wantTokens.every((token, index) => {
    // 数は書いたとおりに見くらべる（80 と 80.0、3 と 3.0 はちがう答え。/ と ÷ のちがいを問う問題があるため）。
    // リストの中の文字（'a'）は、引用符まで答えてもらう（数の '1' と 1 のちがいが消えないように）
    const w = token;
    const m = mineTokens[index];
    if (m === w) return true;
    return (w === 'True' && m === 'true') || (w === 'False' && m === 'false');
  });
}

/**
 * トレース問題の答え合わせ
 * @param {object} problem 問題（answer か choices+answerIndex を持つ。accept: [] で別の正解も書ける）
 * @param {string|number} given 書かれた答え、または選んだ番号
 * @returns {{ok: boolean, expected: string}}
 */
export function gradeTrace(problem, given) {
  if (Array.isArray(problem.choices)) {
    const expected = problem.choices[problem.answerIndex] ?? '';
    return { ok: Number(given) === Number(problem.answerIndex), expected };
  }
  const expected = String(problem.answer ?? '');
  // 別の書き方でも正しい答え（accept）があれば、それも正解にする
  const accept = Array.isArray(problem.accept) ? problem.accept : [];
  const ok = [expected, ...accept].some(answer => sameAnswer(given, String(answer)));
  return { ok, expected };
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
 * @param {object} outcomes {ref: true/false} または {ref: {ok, given, expected}}
 * @returns {{score: number, total: number, rows: object[]}}
 */
export function scoreMock(set, outcomes) {
  const rows = (set.problems || []).map(entry => {
    const points = Number(entry.points) || 0;
    // 答えは true/false か、{ ok, given, expected }（何と答えたかも残す形）
    const outcome = outcomes ? outcomes[entry.ref] : undefined;
    const detail = outcome && typeof outcome === 'object';
    const ok = Boolean(detail ? outcome.ok : outcome);
    const row = { ref: entry.ref, points, ok, got: ok ? points : 0 };
    if (detail) {
      row.given = String(outcome.given ?? '');
      row.expected = String(outcome.expected ?? '');
    }
    return row;
  });
  return {
    score: rows.reduce((sum, row) => sum + row.got, 0),
    total: rows.reduce((sum, row) => sum + row.points, 0),
    rows,
  };
}
