// module/lessons-progress.js
// 進み具合と模試の成績を、この端末に残しておくところ。
//
// 保存できないとき（保存領域がいっぱいなど）は、黙って失わずに知らせる。

import { toast } from './ui.js';

const PROGRESS_KEY = 'easycode_lessons_progress';
const RESULTS_KEY = 'easycode_lessons_results';

/** 下書きは 1 問あたりこの長さまで（保存領域を食いつぶさないように） */
const DRAFT_LIMIT = 20000;

let warned = false;

/** 読めなければ空の形を返す */
function read(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    if (!text) return fallback;
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : fallback;
  } catch {
    return fallback;
  }
}

/** 書けなければ一度だけ知らせる */
function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('レッスンの記録を保存できませんでした:', e);
    if (!warned) {
      warned = true;
      toast('この端末に記録を保存できません。進み具合は、閉じると消えてしまいます。');
    }
    return false;
  }
}

/** 進み具合をぜんぶ読む */
export function loadProgress() {
  return read(PROGRESS_KEY, { v: 1, solved: {}, tried: {}, drafts: {}, last: '' });
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

/**
 * 書きかけを残す
 * @param {string} ref
 * @param {string} code
 */
export function saveDraft(ref, code) {
  const text = String(code ?? '');
  if (text.length > DRAFT_LIMIT) return;
  const progress = loadProgress();
  progress.drafts[ref] = text;
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
  return read(RESULTS_KEY, { v: 1, sets: {} });
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
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(RESULTS_KEY);
  } catch (e) {
    console.warn('記録を消せませんでした:', e);
  }
}
