// module/lessons-progress.js
// 進み具合と模試の成績を、この端末に残しておくところ。
//
// 保存できないとき（保存領域がいっぱいなど）は、黙って失わずに知らせる。

import { safeStorage } from './ui.js';

const PROGRESS_KEY = 'easycode_lessons_progress';
const RESULTS_KEY = 'easycode_lessons_results';

/** 下書きは 1 問あたりこの長さまで（保存領域を食いつぶさないように） */
const DRAFT_LIMIT = 20000;


/** 読めなければ空の形を返す */
function read(key, fallback) {
  try {
    const text = safeStorage.get(key);
    if (!text) return fallback;
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : fallback;
  } catch {
    return fallback;
  }
}

/** 書く。書けなければ safeStorage が一度だけ知らせ、ページを開いているあいだは覚えておく */
function write(key, data) {
  return safeStorage.set(key, JSON.stringify(data));
}

/** 進み具合をぜんぶ読む */
export function loadProgress() {
  const data = read(PROGRESS_KEY, {});
  // 壊れた記録や古い形でも止まらないよう、足りないところを補う
  const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  return {
    ...data,
    v: 1,
    solved: obj(data.solved),
    tried: obj(data.tried),
    drafts: obj(data.drafts),
    origins: obj(data.origins),
    last: typeof data.last === 'string' ? data.last : '',
  };
}

/**
 * 解けた印をつける
 * @param {string} ref 'kyotsu#bin-search'
 */
export function markSolved(ref) {
  const progress = loadProgress();
  const before = progress.solved[ref];
  progress.solved[ref] = { at: Date.now(), tries: (before && before.tries) || progress.tried[ref] || 1 };
  write(PROGRESS_KEY, progress);
}

/**
 * 挑んだ回数を数える
 * @param {string} ref
 */
export function markTried(ref) {
  const progress = loadProgress();
  progress.tried[ref] = (progress.tried[ref] || 0) + 1;
  write(PROGRESS_KEY, progress);
}

/**
 * 解けたか
 * @param {string} ref
 * @returns {boolean}
 */
export function isSolved(ref) {
  return Boolean(loadProgress().solved[ref]);
}

/** 最初のコードの指紋（問題が作り直されたかを見分ける） */
export function codeStamp(text) {
  let h = 5381;
  const str = String(text ?? '');
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return `${str.length}:${h.toString(36)}`;
}

/**
 * 書きかけを残す
 * @param {string} ref
 * @param {string} code
 * @param {string} [original] その問題の最初のコード。同じなら書きかけは消す
 */
export function saveDraft(ref, code, original) {
  const text = String(code ?? '');
  if (text.length > DRAFT_LIMIT) return;
  const progress = loadProgress();
  if (original !== undefined && text === original) {
    if (!(ref in progress.drafts)) return;
    delete progress.drafts[ref];
    delete progress.origins[ref];
  } else {
    progress.drafts[ref] = text;
    if (original !== undefined) progress.origins[ref] = codeStamp(original);
  }
  write(PROGRESS_KEY, progress);
}

/**
 * 書きかけを取り出す
 * @param {string} ref
 * @returns {string|null}
 */
export function getDraft(ref) {
  const draft = loadProgress().drafts[ref];
  return typeof draft === 'string' ? draft : null;
}

/**
 * 書きかけが、いまの問題とは別の（作り直す前の）最初のコードから書かれたものか
 * @param {string} ref
 * @param {string} original
 */
export function isDraftStale(ref, original) {
  const stamp = loadProgress().origins[ref];
  return typeof stamp === 'string' && stamp !== codeStamp(original);
}

/** 書きかけを消す */
export function clearDraft(ref) {
  const progress = loadProgress();
  if (!(ref in progress.drafts)) return;
  delete progress.drafts[ref];
  delete progress.origins[ref];
  write(PROGRESS_KEY, progress);
}

/**
 * 最後に開いていた問題を覚える
 * @param {string} ref
 */
export function rememberLast(ref) {
  const progress = loadProgress();
  progress.last = ref;
  write(PROGRESS_KEY, progress);
}

/** 最後に開いていた問題 */
export function lastOpened() {
  return loadProgress().last || '';
}

/** 模試の成績をぜんぶ読む */
export function loadResults() {
  const data = read(RESULTS_KEY, {});
  const sets = data.sets && typeof data.sets === 'object' && !Array.isArray(data.sets) ? data.sets : {};
  return { ...data, v: 1, sets };
}

/**
 * 模試の成績を残す
 * @param {string} setId
 * @param {{score: number, total: number, rows: object[]}} result
 */
export function recordMock(setId, result) {
  const results = loadResults();
  if (!Array.isArray(results.sets[setId])) results.sets[setId] = [];
  results.sets[setId].push({ at: Date.now(), score: result.score, total: result.total, rows: result.rows });
  // 直近 10 回だけ残す
  results.sets[setId] = results.sets[setId].slice(-10);
  write(RESULTS_KEY, results);
}

/**
 * その模試の最高点
 * @param {string} setId
 * @returns {{score: number, total: number}|null}
 */
export function bestMock(setId) {
  const history = loadResults().sets[setId] || [];
  if (!history.length) return null;
  return history.reduce((best, row) => (row.score > best.score ? row : best), history[0]);
}

/** 進み具合をぜんぶ消す */
export function clearProgress() {
  safeStorage.remove(PROGRESS_KEY);
  safeStorage.remove(RESULTS_KEY);
}

/* ============================================================
 * 記録の持ち運び（別の端末で続けるとき）
 * ========================================================== */

/** 記録をファイルにする中身 */
export function exportProgress() {
  return JSON.stringify({
    app: 'easycode-lessons',
    v: 1,
    at: new Date().toISOString(),
    progress: loadProgress(),
    results: loadResults(),
  }, null, 1);
}

/**
 * 書き出した記録を読みこんで、いまの記録に足しあわせる（消しはしない）
 * @param {string} text
 * @returns {{solved: number, drafts: number}} 新しく増えた数
 */
export function importProgress(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('記録のファイルとして読めませんでした。');
  }
  if (!data || data.app !== 'easycode-lessons' || !data.progress) {
    throw new Error('このアプリで書き出した記録のファイルではないようです。');
  }
  const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  const incoming = data.progress;
  const progress = loadProgress();
  let solved = 0;
  let drafts = 0;

  for (const [ref, row] of Object.entries(obj(incoming.solved))) {
    if (!row || typeof row !== 'object') continue;
    if (!progress.solved[ref]) solved++;
    const mine = progress.solved[ref];
    // 先に解けた方を残す
    if (!mine || (Number(row.at) && Number(row.at) < Number(mine.at))) {
      progress.solved[ref] = { at: Number(row.at) || Date.now(), tries: Number(row.tries) || 1 };
    }
  }
  for (const [ref, count] of Object.entries(obj(incoming.tried))) {
    progress.tried[ref] = Math.max(progress.tried[ref] || 0, Number(count) || 0);
  }
  // 書きかけは、この端末に無いものだけ入れる（今の端末で書いたものを上書きしない）
  for (const [ref, code] of Object.entries(obj(incoming.drafts))) {
    if (typeof code !== 'string' || code.length > DRAFT_LIMIT || ref in progress.drafts) continue;
    progress.drafts[ref] = code;
    const stamp = obj(incoming.origins)[ref];
    if (typeof stamp === 'string') progress.origins[ref] = stamp;
    drafts++;
  }
  write(PROGRESS_KEY, progress);

  const results = loadResults();
  for (const [setId, rows] of Object.entries(obj(obj(data.results).sets))) {
    if (!Array.isArray(rows)) continue;
    const list = Array.isArray(results.sets[setId]) ? results.sets[setId] : [];
    const seen = new Set(list.map(row => row.at));
    for (const row of rows) {
      if (row && typeof row.score === 'number' && !seen.has(row.at)) list.push(row);
    }
    results.sets[setId] = list.sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-10);
  }
  write(RESULTS_KEY, results);

  return { solved, drafts };
}
