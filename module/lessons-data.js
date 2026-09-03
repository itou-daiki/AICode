// module/lessons-data.js
// レッスンの読み込みと、問題の形をそろえるところ。
//
// 問題は 4 つの型がある。
//   read  … 説明を読んで、見本を動かしてみる（入門）
//   trace … プログラムを読んで、表示される値を答える（共通テストの主な形）
//   blank … 【ア】【イ】に入るものを選ぶ（共通テスト第3問の形）
//   code  … 自分で書いて、いくつかのテストで確かめる（二次試験・記述）
//
// プログラムはすべて Python で書く。共通テスト用の表記は module/ktph.js が作る。

/**
 * コースの一覧を読む
 * @param {string} [base] lessons/ の場所
 * @returns {Promise<{courses: object[]}>}
 */
export async function loadIndex(base = 'lessons/') {
  const response = await fetch(`${base}index.json`);
  if (!response.ok) throw new Error(`レッスンの一覧を読めませんでした（${response.status}）`);
  return response.json();
}

/**
 * コース 1 つ分を読んで、中の問題の形をそろえる
 * @param {object} entry index.json の 1 件
 * @param {string} [base]
 * @returns {Promise<object>} { id, title, lessons: [{ id, title, problems: [] }] }
 */
export async function loadCourse(entry, base = 'lessons/') {
  const response = await fetch(`${base}${entry.file}`);
  if (!response.ok) throw new Error(`${entry.title} を読めませんでした（${response.status}）`);
  const course = await response.json();

  const lessons = [];
  for (const lesson of course.lessons || []) {
    const problems = [];
    for (const raw of lesson.problems || []) {
      const problem = raw && raw.ref && String(raw.ref).endsWith('.json')
        ? await loadReferenced(raw.ref, base)
        : raw;
      if (problem) problems.push(normalizeProblem(problem, entry.id, lesson.id));
    }
    lessons.push({ ...lesson, problems });
  }

  return { ...course, id: course.id || entry.id, title: entry.title, lessons };
}

/**
 * 別ファイルの問題（既存の problems/*.json）を読む
 *
 * `problems/…` はサイトの根からの道すじで書いてある。
 * lessons/ の場所（base）から根を割り出して組み立てる。
 * こうしないと、tests/ の中から読んだときに 404 になり、
 * 「読めていないのに黙って飛ばされる」ことになる。
 */
async function loadReferenced(path, base) {
  const root = base.replace(/lessons\/?$/, '');
  const url = path.startsWith('problems/') ? `${root}${path}` : `${base}${path}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} を読めませんでした（${response.status}）`);

  const data = await response.json();
  if (!data.id) data.id = path.replace(/^.*\//, '').replace(/\.json$/, '');
  return data;
}

/**
 * 模試のセットを、参照先の問題に置きかえる
 * @param {object} set moshi.json の 1 セット
 * @param {object} courses { コースid: コース } の形
 * @returns {{id: string, title: string, entries: {ref: string, points: number, problem: object}[]}}
 */
export function loadMockSet(set, courses) {
  const entries = [];
  for (const entry of set.problems || []) {
    const problem = findByRef(courses, entry.ref);
    if (problem) entries.push({ ref: entry.ref, points: Number(entry.points) || 0, problem });
  }
  return { id: set.id, title: set.title, summary: set.summary, entries };
}

/**
 * 'kyotsu#bin-search' の形で問題を探す
 * @param {object} courses
 * @param {string} ref
 * @returns {object|null}
 */
export function findByRef(courses, ref) {
  const [courseId, problemId] = String(ref).split('#');
  const course = courses[courseId];
  if (!course) return null;
  for (const lesson of course.lessons || []) {
    const found = (lesson.problems || []).find(p => p.id === problemId);
    if (found) return found;
  }
  return null;
}

/**
 * 問題の形をそろえる（古い形の問題も受け取れるようにする）
 *
 * 既存の problems/*.json は { title, description, input, expected, template } なので、
 * それを code 型の問題に読みかえる。
 *
 * @param {object} raw
 * @param {string} [courseId]
 * @param {string} [lessonId]
 * @returns {object}
 */
export function normalizeProblem(raw, courseId = '', lessonId = '') {
  const problem = { ...raw };

  problem.courseId = courseId;
  problem.lessonId = lessonId;
  problem.id = problem.id || `${lessonId}-${problem.title || 'mondai'}`;

  // 型が書かれていなければ、中身から見わける
  if (!problem.type) {
    if (Array.isArray(problem.blanks)) problem.type = 'blank';
    else if (problem.question) problem.type = 'trace';
    else if (Array.isArray(problem.tasks) || (problem.program && !problem.template)) problem.type = 'read';
    else problem.type = 'code';
  }

  if (!problem.view) problem.view = courseId === 'kyotsu' ? 'ktph' : 'python';

  // 古い形（input / expected が 1 組だけ）を tests に読みかえる
  if (problem.type === 'code' && !Array.isArray(problem.tests)) {
    problem.tests = problem.expected === undefined
      ? []
      : [{ input: problem.input || '', expected: String(problem.expected) }];
  }

  if (problem.type === 'trace' && !problem.check) problem.check = { kind: 'output' };

  return problem;
}

/**
 * プログラムの中の【ア】【イ】を、出てくる順に拾う
 * @param {string} program
 * @returns {string[]}
 */
export function findBlankKeys(program) {
  const keys = [];
  for (const match of String(program ?? '').matchAll(/【([^】]+)】/g)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

/**
 * 【ア】を選んだ中身に置きかえる
 *
 * 選んでいない空欄は【ア】のまま残す（どこが空いているか分かるように）。
 * @param {string} program
 * @param {{key: string, choices: string[]}[]} blanks
 * @param {object} picks {ア: 選んだ番号}
 * @returns {string}
 */
export function fillBlanks(program, blanks, picks) {
  let filled = String(program ?? '');
  for (const blank of blanks || []) {
    const pick = picks ? picks[blank.key] : undefined;
    if (pick === undefined || pick === null || pick === '') continue;
    const choice = blank.choices[Number(pick)];
    if (choice === undefined) continue;
    filled = filled.split(`【${blank.key}】`).join(choice);
  }
  return filled;
}

/**
 * 正解で埋めたときの選びかた
 * @param {object} problem
 * @returns {object}
 */
export function correctPicks(problem) {
  const picks = {};
  for (const blank of problem.blanks || []) picks[blank.key] = blank.answer;
  return picks;
}

/**
 * 問題を指す文字列（'kyotsu#bin-search'）
 * @param {object} problem
 * @returns {string}
 */
export function problemRef(problem) {
  return `${problem.courseId}#${problem.id}`;
}
