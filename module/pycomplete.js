// module/pycomplete.js
// AI を使わないローカルのコード補完エンジン。
//
// 書いているコードそのものを読み取って、
//   ・自分で作った変数 / 関数 / クラス / 引数
//   ・import したモジュールの中身
//   ・変数の型から分かるメソッド（文字列なら .upper() など）
//   ・Python のキーワード・組み込み関数・よく使う書き方のひな形
// を候補として返す。APIキーがなくても補完が効くようにするのが目的。

/* ============================================================
 * 1. Python の知識（辞書）
 * ========================================================== */

/** キーワード */
export const KEYWORDS = [
  ['if', 'もし〜なら'], ['elif', 'そうでなくて、もし〜なら'], ['else', 'そうでなければ'],
  ['for', '繰り返し（回数・要素ごと）'], ['while', '条件が成り立つ間くり返す'],
  ['break', '繰り返しを抜ける'], ['continue', '次の繰り返しへ'],
  ['def', '関数を作る'], ['return', '関数から値を返す'], ['lambda', 'その場で作る小さな関数'],
  ['class', 'クラスを作る'], ['import', 'モジュールを読み込む'], ['from', '〜から読み込む'],
  ['as', '別名をつける'], ['try', 'エラーが起きるかもしれない処理'], ['except', 'エラーが起きたとき'],
  ['finally', '最後に必ず実行する'], ['raise', 'エラーを起こす'], ['with', '後始末つきで使う'],
  ['in', '〜の中にある'], ['not', '〜でない'], ['and', 'かつ'], ['or', 'または'],
  ['is', '同じものか'], ['None', '値がないことを表す'], ['True', '真'], ['False', '偽'],
  ['pass', '何もしない'], ['global', 'グローバル変数として使う'], ['assert', '条件を確かめる'],
  ['yield', '値を1つずつ返す'], ['del', '削除する'],
].map(([label, detail]) => ({ label, insert: label, detail, kind: 'keyword' }));

/** 組み込み関数 */
export const BUILTINS = [
  ['print', 'print()', '画面に表示する', 1],
  ['input', 'input()', 'キーボードから文字列を受け取る', 1],
  ['len', 'len()', '長さ・要素数を返す', 1],
  ['range', 'range()', '連続した数を作る', 1],
  ['int', 'int()', '整数に変換する', 1],
  ['float', 'float()', '小数に変換する', 1],
  ['str', 'str()', '文字列に変換する', 1],
  ['bool', 'bool()', '真偽値に変換する', 1],
  ['list', 'list()', 'リストに変換する', 1],
  ['dict', 'dict()', '辞書を作る', 1],
  ['set', 'set()', '集合を作る', 1],
  ['tuple', 'tuple()', 'タプルに変換する', 1],
  ['sum', 'sum()', '合計を求める', 1],
  ['min', 'min()', '最小値を求める', 1],
  ['max', 'max()', '最大値を求める', 1],
  ['abs', 'abs()', '絶対値を求める', 1],
  ['round', 'round()', '四捨五入する', 1],
  ['sorted', 'sorted()', '並べ替えた新しいリストを返す', 1],
  ['reversed', 'reversed()', '逆順にする', 1],
  ['enumerate', 'enumerate()', '番号つきで取り出す', 1],
  ['zip', 'zip()', '複数のリストをまとめて取り出す', 1],
  ['map', 'map()', 'すべての要素に関数を適用する', 1],
  ['filter', 'filter()', '条件に合う要素だけ残す', 1],
  ['any', 'any()', 'どれか1つでも真か', 1],
  ['all', 'all()', 'すべて真か', 1],
  ['type', 'type()', '型を調べる', 1],
  ['isinstance', 'isinstance()', '型が一致するか調べる', 1],
  ['open', 'open()', 'ファイルを開く', 1],
  ['chr', 'chr()', '文字コードから文字へ', 1],
  ['ord', 'ord()', '文字から文字コードへ', 1],
  ['divmod', 'divmod()', '商と余りを同時に求める', 1],
  ['pow', 'pow()', 'べき乗を求める', 1],
  ['repr', 'repr()', '内部表現の文字列にする', 1],
].map(([label, insert, detail, moveBack]) => ({ label, insert, detail, moveBack, kind: 'builtin' }));

/** よく使う書き方のひな形 */
export const SNIPPETS = [
  ['if', 'if 文', 'if :', 1],
  ['ifelse', 'if / else 文', 'if :\n    pass\nelse:\n    pass', null],
  ['for', 'for（回数を指定して繰り返す）', 'for i in range(10):\n    ', null],
  ['foreach', 'for（リストの要素ごとに繰り返す）', 'for item in items:\n    ', null],
  ['while', 'while（条件が成り立つ間くり返す）', 'while True:\n    ', null],
  ['def', 'def（関数を作る）', 'def name():\n    ', null],
  ['class', 'class（クラスを作る）', 'class Name:\n    def __init__(self):\n        ', null],
  ['try', 'try / except（エラーに備える）', 'try:\n    pass\nexcept Exception as e:\n    print(e)', null],
  ['with', 'with open（ファイルを読む）', 'with open("data.txt") as f:\n    ', null],
  ['main', 'if __name__ == "__main__"', 'if __name__ == "__main__":\n    ', null],
].map(([trigger, label, insert, moveBack]) => ({ trigger, label, insert, moveBack, detail: 'ひな形', kind: 'snippet' }));

/** 型ごとのメソッド */
export const TYPE_METHODS = {
  str: [
    ['upper()', '大文字にする'], ['lower()', '小文字にする'], ['capitalize()', '先頭だけ大文字にする'],
    ['title()', '単語の先頭を大文字にする'], ['strip()', '前後の空白を取る'],
    ['lstrip()', '左の空白を取る'], ['rstrip()', '右の空白を取る'],
    ['split()', '区切って リストにする'], ['splitlines()', '行ごとに分ける'],
    ['join()', 'リストを1つの文字列につなぐ'], ['replace()', '置き換える'],
    ['find()', '位置を探す（無ければ -1）'], ['index()', '位置を探す（無ければエラー）'],
    ['count()', '個数を数える'], ['startswith()', '〜で始まるか'], ['endswith()', '〜で終わるか'],
    ['format()', '書式を当てはめる'], ['zfill()', '0 で桁を埋める'],
    ['center()', '中央ぞろえにする'], ['ljust()', '左ぞろえにする'], ['rjust()', '右ぞろえにする'],
    ['isdigit()', '数字だけか'], ['isalpha()', '文字だけか'], ['isalnum()', '英数字だけか'],
  ],
  list: [
    ['append()', '末尾に1つ加える'], ['extend()', 'まとめて加える'], ['insert()', '位置を指定して加える'],
    ['remove()', '値を指定して取り除く'], ['pop()', '取り出して削除する'], ['clear()', '全部消す'],
    ['index()', '位置を探す'], ['count()', '個数を数える'], ['sort()', '並べ替える'],
    ['reverse()', '逆順にする'], ['copy()', 'コピーを作る'],
  ],
  dict: [
    ['keys()', 'キーの一覧'], ['values()', '値の一覧'], ['items()', 'キーと値の組の一覧'],
    ['get()', '値を取り出す（無ければ既定値）'], ['pop()', '取り出して削除する'],
    ['update()', 'まとめて更新する'], ['clear()', '全部消す'],
    ['setdefault()', '無ければ入れて取り出す'], ['copy()', 'コピーを作る'],
  ],
  set: [
    ['add()', '1つ加える'], ['remove()', '取り除く（無ければエラー）'], ['discard()', '取り除く（無くてもよい）'],
    ['pop()', '1つ取り出す'], ['clear()', '全部消す'], ['union()', '和集合'],
    ['intersection()', '積集合'], ['difference()', '差集合'],
    ['issubset()', '部分集合か'], ['update()', 'まとめて加える'],
  ],
  tuple: [['count()', '個数を数える'], ['index()', '位置を探す']],
  int: [['bit_length()', 'ビット数'], ['to_bytes()', 'バイト列にする']],
  float: [['is_integer()', '整数とみなせるか'], ['hex()', '16進表記にする']],
  file: [
    ['read()', '全部読む'], ['readline()', '1行読む'], ['readlines()', '行のリストにする'],
    ['write()', '書き込む'], ['writelines()', 'まとめて書き込む'], ['close()', '閉じる'],
  ],
};

/** モジュールごとの中身 */
export const MODULE_MEMBERS = {
  math: [
    ['pi', '円周率'], ['e', '自然対数の底'], ['tau', '円周率の2倍'], ['inf', '無限大'],
    ['sqrt()', '平方根'], ['pow()', 'べき乗'], ['ceil()', '切り上げ'], ['floor()', '切り捨て'],
    ['fabs()', '絶対値'], ['factorial()', '階乗'], ['gcd()', '最大公約数'],
    ['log()', '対数'], ['log2()', '2を底とする対数'], ['log10()', '常用対数'], ['exp()', '指数関数'],
    ['sin()', 'サイン'], ['cos()', 'コサイン'], ['tan()', 'タンジェント'],
    ['atan2()', '座標から角度'], ['degrees()', 'ラジアン→度'], ['radians()', '度→ラジアン'],
    ['hypot()', '斜辺の長さ'], ['isclose()', 'ほぼ等しいか'],
  ],
  random: [
    ['random()', '0以上1未満の乱数'], ['randint()', '整数の乱数（両端を含む）'],
    ['randrange()', '整数の乱数（終わりを含まない）'], ['uniform()', '小数の乱数'],
    ['choice()', '1つランダムに選ぶ'], ['choices()', '重複ありで複数選ぶ'],
    ['sample()', '重複なしで複数選ぶ'], ['shuffle()', 'ランダムに並べ替える'], ['seed()', '乱数の種を決める'],
  ],
  os: [
    ['getcwd()', '今いるフォルダ'], ['listdir()', 'フォルダの中身一覧'], ['mkdir()', 'フォルダを作る'],
    ['makedirs()', '階層ごとフォルダを作る'], ['remove()', 'ファイルを消す'], ['rename()', '名前を変える'],
    ['path', 'パス操作のまとまり'], ['environ', '環境変数'], ['sep', 'パスの区切り文字'],
  ],
  sys: [
    ['argv', 'コマンドライン引数'], ['exit()', 'プログラムを終える'], ['path', 'モジュール検索パス'],
    ['version', 'Python のバージョン'], ['stdout', '標準出力'], ['stdin', '標準入力'], ['maxsize', '最大の整数'],
  ],
  json: [
    ['dumps()', 'オブジェクト→JSON文字列'], ['loads()', 'JSON文字列→オブジェクト'],
    ['dump()', 'ファイルへ書き出す'], ['load()', 'ファイルから読み込む'],
  ],
  time: [
    ['time()', '現在時刻（秒）'], ['sleep()', '一定時間待つ'], ['ctime()', '読みやすい日時'],
    ['localtime()', '現地時刻'], ['strftime()', '日時を書式化'], ['perf_counter()', '高精度な計測用時刻'],
  ],
  datetime: [
    ['datetime', '日付と時刻'], ['date', '日付'], ['time', '時刻'], ['timedelta', '時間の差'],
  ],
  statistics: [
    ['mean()', '平均'], ['median()', '中央値'], ['mode()', '最頻値'],
    ['stdev()', '標準偏差'], ['variance()', '分散'],
  ],
  collections: [
    ['Counter', '個数を数える'], ['defaultdict', '既定値つき辞書'], ['deque', '両端キュー'],
    ['OrderedDict', '順序つき辞書'], ['namedtuple', '名前つきタプル'],
  ],
  re: [
    ['match()', '先頭から照合'], ['search()', '最初に見つかる箇所'], ['findall()', 'すべて探す'],
    ['sub()', '置き換える'], ['split()', '正規表現で分割'], ['compile()', 'パターンを用意する'],
  ],
  string: [
    ['ascii_lowercase', 'a〜z'], ['ascii_uppercase', 'A〜Z'], ['digits', '0〜9'], ['punctuation', '記号'],
  ],
  itertools: [
    ['count()', '数え上げ'], ['cycle()', '繰り返す'], ['chain()', 'つなげる'],
    ['combinations()', '組み合わせ'], ['permutations()', '順列'], ['product()', '直積'],
  ],
};

/** import 候補に出すモジュール名 */
export const KNOWN_MODULES = Object.keys(MODULE_MEMBERS);

/* ============================================================
 * 2. 書いているコードの解析
 * ========================================================== */

/** 行頭の空白の幅 */
function indentWidth(line) {
  const match = line.match(/^[ \t]*/);
  return match ? match[0].replace(/\t/g, '    ').length : 0;
}

/**
 * 代入されている式から型を推測する
 * @param {string} expr
 * @param {Object<string, string>} known すでに分かっている変数の型
 * @returns {string|null}
 */
function inferType(expr, known) {
  const text = expr.trim();
  if (!text) return null;

  if (/^['"]/.test(text)) return 'str';
  if (/^f['"]/.test(text)) return 'str';
  if (/^\[/.test(text)) return 'list';
  if (/^\{.*:.*\}$/s.test(text)) return 'dict';
  if (/^\{/.test(text)) return 'set';
  if (/^\(.*,.*\)$/s.test(text)) return 'tuple';
  if (/^-?\d+$/.test(text)) return 'int';
  if (/^-?\d*\.\d+$/.test(text)) return 'float';
  if (/^(True|False)$/.test(text)) return 'bool';

  const call = text.match(/^([A-Za-z_][\w.]*)\s*\(/);
  if (call) {
    const byCall = {
      input: 'str', str: 'str', repr: 'str', format: 'str',
      int: 'int', len: 'int', ord: 'int', sum: 'int', round: 'int',
      float: 'float', abs: 'float',
      list: 'list', sorted: 'list', split: 'list',
      dict: 'dict', set: 'set', tuple: 'tuple', open: 'file',
      range: 'range', bool: 'bool',
    };
    if (byCall[call[1]]) return byCall[call[1]];
  }

  // 「変数.メソッド()」から分かるもの
  const method = text.match(/^([A-Za-z_]\w*)\.(\w+)\s*\(/);
  if (method) {
    const returns = {
      split: 'list', splitlines: 'list', keys: 'list', values: 'list', items: 'list', copy: null,
      upper: 'str', lower: 'str', strip: 'str', replace: 'str', join: 'str',
      find: 'int', index: 'int', count: 'int', read: 'str', readline: 'str', readlines: 'list',
    };
    if (returns[method[2]]) return returns[method[2]];
    if (method[2] === 'copy' && known[method[1]]) return known[method[1]];
  }

  // 「他の変数そのもの」なら型を引き継ぐ
  if (/^[A-Za-z_]\w*$/.test(text) && known[text]) return known[text];

  return null;
}

/**
 * コード全体を読み取って、使える名前を集める
 * @param {string} code
 * @param {number} lineIndex カーソルのある行（0始まり）
 * @returns {{variables: object, functions: object[], classes: string[], modules: object, names: object}}
 */
export function analyzeCode(code, lineIndex = Number.MAX_SAFE_INTEGER) {
  const lines = code.split('\n');
  const variables = {};   // 変数名 → 型（分からなければ null）
  const functions = [];   // {name, params}
  const classes = [];
  const modules = {};     // 使える名前 → モジュール名
  const imported = {};    // from ... import した名前 → 説明

  lines.forEach((raw, index) => {
    const line = raw.split('#')[0];
    const text = line.trim();
    if (!text) return;

    // import math / import numpy as np
    const importMatch = text.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      const name = importMatch[2] || importMatch[1].split('.')[0];
      modules[name] = importMatch[1].split('.')[0];
      return;
    }

    // from math import sqrt, pi
    const fromMatch = text.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
    if (fromMatch) {
      const moduleName = fromMatch[1].split('.')[0];
      for (const part of fromMatch[2].split(',')) {
        const alias = part.trim().split(/\s+as\s+/);
        const name = (alias[1] || alias[0]).trim().replace(/[()]/g, '');
        if (name && name !== '*') imported[name] = `${moduleName} から読み込んだもの`;
      }
      return;
    }

    // def name(params)
    const defMatch = text.match(/^def\s+(\w+)\s*\(([^)]*)\)/);
    if (defMatch) {
      functions.push({ name: defMatch[1], params: defMatch[2].trim() });
      // 関数の引数は、その関数の中でだけ使える
      if (index <= lineIndex) {
        for (const param of defMatch[2].split(',')) {
          const name = param.trim().split(/[:=]/)[0].trim();
          if (name && name !== 'self' && /^[A-Za-z_]\w*$/.test(name)) {
            variables[name] = variables[name] || null;
          }
        }
      }
      return;
    }

    const classMatch = text.match(/^class\s+(\w+)/);
    if (classMatch) {
      classes.push(classMatch[1]);
      return;
    }

    // for i in ... / for a, b in ...
    const forMatch = text.match(/^for\s+([\w,\s]+?)\s+in\s+(.+?):/);
    if (forMatch) {
      const iterable = forMatch[2].trim();
      for (const name of forMatch[1].split(',')) {
        const clean = name.trim();
        if (!/^[A-Za-z_]\w*$/.test(clean)) continue;
        variables[clean] = /^range\s*\(/.test(iterable) ? 'int' : null;
      }
      return;
    }

    // with open(...) as f:
    const withMatch = text.match(/^with\s+(.+?)\s+as\s+(\w+)\s*:/);
    if (withMatch) {
      variables[withMatch[2]] = /^open\s*\(/.test(withMatch[1]) ? 'file' : null;
      return;
    }

    // 変数 = 式
    const assignMatch = text.match(/^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)\s*(.+)$/);
    if (assignMatch) {
      variables[assignMatch[1]] = inferType(assignMatch[2], variables);
    }
  });

  return { variables, functions, classes, modules, imported };
}

/* ============================================================
 * 3. 候補の組み立て
 * ========================================================== */

/** 候補を作るときの共通形 */
const item = (label, insert, detail, kind, moveBack) =>
  ({ label, insert: insert ?? label, detail, kind, moveBack });

/**
 * カーソル位置に合う補完候補を返す
 * @param {object} options
 * @param {string} options.code エディタ全体のコード
 * @param {number} options.lineIndex カーソルのある行（0始まり）
 * @param {string} options.beforeCursor カーソルより前の同じ行のテキスト
 * @param {object[]} [options.extraApi] そのモードだけの追加候補（描画モードの p5 など）
 * @param {number} [options.limit] 最大件数
 * @returns {{items: object[], replaceLength: number}}
 */
export function getCompletions({ code, lineIndex, beforeCursor, extraApi = [], limit = 12 }) {
  const analysis = analyzeCode(code, lineIndex);

  // --- import 文の途中 ---
  const importPrefix = beforeCursor.match(/^\s*(?:import|from)\s+(\w*)$/);
  if (importPrefix) {
    const prefix = importPrefix[1];
    const items = KNOWN_MODULES
      .filter(name => name.startsWith(prefix))
      .map(name => item(name, name, 'モジュール', 'module'));
    return { items: items.slice(0, limit), replaceLength: prefix.length };
  }

  // --- 「なにか . なにか」の形（メンバー補完） ---
  const memberMatch = beforeCursor.match(/([A-Za-z_][\w.]*)\.(\w*)$/);
  if (memberMatch) {
    const [, target, prefix] = memberMatch;
    const items = memberCompletions(target, analysis, extraApi)
      .filter(entry => entry.label.toLowerCase().startsWith(prefix.toLowerCase()));
    return { items: items.slice(0, limit), replaceLength: prefix.length };
  }

  // --- ふつうの単語 ---
  const wordMatch = beforeCursor.match(/([A-Za-z_]\w*)$/);
  const prefix = wordMatch ? wordMatch[1] : '';
  const candidates = wordCompletions(analysis, extraApi);

  const lower = prefix.toLowerCase();
  const scored = candidates
    .map(entry => ({ entry, score: score(entry, lower) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .map(row => row.entry);

  return { items: scored.slice(0, limit), replaceLength: prefix.length };
}

/** 「.」のあとに出す候補 */
function memberCompletions(target, analysis, extraApi) {
  // モジュール（import math → math.）
  const moduleName = analysis.modules[target];
  if (moduleName && MODULE_MEMBERS[moduleName]) {
    return MODULE_MEMBERS[moduleName].map(([label, detail]) =>
      item(label, label, detail, 'member', label.endsWith('()') ? 1 : 0));
  }

  // そのモードだけの API（描画モードの p5 など）
  const api = extraApi.filter(entry => entry.target === target);
  if (api.length) {
    return api.map(entry => item(entry.label, entry.insert, entry.detail, 'api', entry.moveBack));
  }

  // 変数の型から分かるメソッド
  const type = analysis.variables[target];
  if (type && TYPE_METHODS[type]) {
    return TYPE_METHODS[type].map(([label, detail]) =>
      item(label, label, `${type} のメソッド: ${detail}`, 'method', 1));
  }

  // 型が分からないときは、よく使うメソッドをまとめて出す
  const seen = new Set();
  const all = [];
  for (const [typeName, methods] of Object.entries(TYPE_METHODS)) {
    if (typeName === 'file') continue;
    for (const [label, detail] of methods) {
      if (seen.has(label)) continue;
      seen.add(label);
      all.push(item(label, label, `${typeName} のメソッド: ${detail}`, 'method', 1));
    }
  }
  return all;
}

/** ふつうの位置で出す候補 */
function wordCompletions(analysis, extraApi) {
  const items = [];

  // 自分で作ったもの（いちばん役に立つので先に）
  for (const [name, type] of Object.entries(analysis.variables)) {
    items.push(item(name, name, type ? `変数（${type}）` : '変数', 'variable'));
  }
  for (const fn of analysis.functions) {
    items.push(item(fn.name, `${fn.name}()`, `自分で作った関数(${fn.params})`, 'function', 1));
  }
  for (const name of analysis.classes) {
    items.push(item(name, `${name}()`, '自分で作ったクラス', 'class', 1));
  }
  for (const name of Object.keys(analysis.modules)) {
    items.push(item(name, name, 'モジュール', 'module'));
  }
  for (const [name, detail] of Object.entries(analysis.imported)) {
    items.push(item(name, name, detail, 'member'));
  }

  // モード固有の API（描画モードの p5 など）
  for (const entry of extraApi) {
    if (!entry.target) items.push(item(entry.label, entry.insert, entry.detail, 'api', entry.moveBack));
  }

  items.push(...BUILTINS, ...KEYWORDS, ...SNIPPETS);
  return items;
}

/** 並び順を決める点数（0 なら候補から外す） */
function score(entry, prefix) {
  const label = entry.label.toLowerCase();
  const trigger = (entry.trigger || '').toLowerCase();

  const kindBonus = {
    variable: 60, function: 58, class: 56, module: 54, member: 52,
    api: 50, builtin: 40, snippet: 30, keyword: 28, method: 20,
  }[entry.kind] || 10;

  if (!prefix) return entry.kind === 'method' ? 0 : kindBonus;
  if (label.startsWith(prefix)) return 1000 + kindBonus - label.length;
  if (trigger && trigger.startsWith(prefix)) return 900 + kindBonus;
  if (label.includes(prefix)) return 400 + kindBonus - label.length;
  return 0;
}
