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
  ['if', 'if 文', 'if __CURSOR__:', null],
  ['ifelse', 'if / else 文', 'if :\n    pass\nelse:\n    pass', null],
  ['for', 'for（回数を指定して繰り返す）', 'for i in range(10):\n    ', null],
  ['foreach', 'for（リストの要素ごとに繰り返す）', 'for item in items:\n    ', null],
  ['while', 'while（条件が成り立つ間くり返す）', 'while True:\n    ', null],
  ['def', 'def（関数を作る）', 'def name():\n    ', null],
  ['class', 'class（クラスを作る）', 'class Name:\n    def __init__(self):\n        ', null],
  ['try', 'try / except（エラーに備える）', 'try:\n    pass\nexcept Exception as e:\n    print(e)', null],
  ['with', 'with open（ファイルを読む）', 'with open("data.txt") as f:\n    ', null],
  ['main', 'if __name__ == "__main__"', 'if __name__ == "__main__":\n    ', null],
  ['random', 'import random（乱数を使う準備）', 'import random', null],
].map(([trigger, label, insert, moveBack]) => ({ trigger, label, insert, moveBack, detail: 'ひな形', kind: 'snippet' }));

/**
 * 日本語で探せるようにする言葉。
 * 「表示」と打つと print() が出るように、候補の label ごとに日本語の呼び名をつける。
 * 日本語入力の変換が終わってから探す（変換中は補完を出さない）。
 */
export const JAPANESE_ALIASES = {
  print: ['表示', '出力', 'ひょうじ'],
  input: ['入力', 'にゅうりょく'],
  if: ['もし'],
  'if 文': ['もし'],
  for: ['繰り返し', 'くりかえし', '繰返し'],
  'for（回数を指定して繰り返す）': ['繰り返し', 'くりかえし'],
  'for（リストの要素ごとに繰り返す）': ['繰り返し', 'くりかえし'],
  while: ['繰り返し', 'くりかえし'],
  'while（条件が成り立つ間くり返す）': ['繰り返し', 'くりかえし'],
  len: ['長さ', '要素数'],
  range: ['範囲'],
  def: ['関数'],
  'def（関数を作る）': ['関数'],
  return: ['戻り値', '返す', 'もどりち'],
  random: ['乱数'],
  'import random（乱数を使う準備）': ['乱数'],
  int: ['整数'],
  float: ['小数', '実数'],
  str: ['文字列'],
  sum: ['合計'],
  max: ['最大'],
  min: ['最小'],
  else: ['そうでなければ'],
  elif: ['そうでなくもし'],
};

for (const entry of [...KEYWORDS, ...BUILTINS, ...SNIPPETS]) {
  if (JAPANESE_ALIASES[entry.label]) entry.aliases = JAPANESE_ALIASES[entry.label];
}

// 授業でよく使う組み込み関数は、同じくらい合うときに少し上に（p → pow より print）
const COMMON_BUILTINS = { print: 6, input: 4, range: 3, len: 3, int: 3 };
for (const entry of BUILTINS) {
  if (COMMON_BUILTINS[entry.label]) entry.boost = COMMON_BUILTINS[entry.label];
}

/** 挿入したあとのカーソルの位置を表す印（ひな形の中に書く） */
export const CURSOR_MARK = '__CURSOR__';
/** ブロックの中身の字下げを表す印（今の行の字下げ ＋ 4 文字になる） */
export const BODY_MARK = '__BODY__';
const INDENT_UNIT = '    ';

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
      int: 'int', len: 'int', ord: 'int',
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
  const assigned = new Set(); // for 以外で値を入れた名前（ループ変数の名前を選ぶときに避ける）
  const loopNames = new Set(); // for の数え役・取り出し役にした名前
  // range() に渡せる「回数」の変数。int(...)・len(...)・整数で決めて、あとで += などで足しこんでいないもの
  const counts = new Set();

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
            assigned.add(name);
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
        loopNames.add(clean);
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
      assigned.add(assignMatch[1]);
      if (/^(?:int|len)\s*\(|^\d+$/.test(assignMatch[2].trim())) counts.add(assignMatch[1]);
      else counts.delete(assignMatch[1]);
      return;
    }

    // a, b = 1, 2
    const tupleMatch = text.match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=(?!=)/);
    if (tupleMatch) {
      for (const name of tupleMatch[1].split(',')) {
        const clean = name.trim();
        if (!(clean in variables)) variables[clean] = null;
        assigned.add(clean);
      }
      return;
    }

    // total += x は数として使っている
    // （足しこむ変数は合計なので、range() の回数にはしない。小数を足せば小数）
    const augMatch = text.match(/^([A-Za-z_]\w*)\s*(\+|-|\*|\/\/|\/|%)=\s*(.*)$/);
    if (augMatch && augMatch[1] in variables) {
      const [, name, op, rhs] = augMatch;
      counts.delete(name);
      if (op === '/' || /\d\.\d|\.\d|float\s*\(/.test(rhs) || variables[rhs.trim()] === 'float') variables[name] = 'float';
      else if (!variables[name]) variables[name] = 'int';
    }

    // scores.append(...) はリストとして使っている
    const appendMatch = text.match(/^([A-Za-z_]\w*)\.append\s*\(/);
    if (appendMatch && appendMatch[1] in variables && !variables[appendMatch[1]]) {
      variables[appendMatch[1]] = 'list';
    }
  });

  // カーソルの行から、それぞれの変数を最後に使った行までの近さ（行数）
  const near = {};
  lines.forEach((raw, index) => {
    if (index === lineIndex) return;
    for (const match of raw.split('#')[0].matchAll(/[A-Za-z_]\w*/g)) {
      const name = match[0];
      if (!(name in variables)) continue;
      const distance = Math.abs(index - lineIndex);
      if (near[name] === undefined || distance < near[name]) near[name] = distance;
    }
  });

  return { variables, functions, classes, modules, imported, near, assigned, loopNames, counts, lines };
}

/* ============================================================
 * 3. 候補の組み立て
 * ========================================================== */


/** 候補を作るときの共通形 */
const item = (label, insert, detail, kind, moveBack, extra = {}) =>
  ({ label, insert: insert ?? label, detail, kind, moveBack, ...extra });

// 日本語の字（ひらがな・カタカナ・漢字）。「表示」のように日本語で探すときに使う
const JP = '\\u3040-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff々ー';
const WORD_AT_END = new RegExp(`[A-Za-z_${JP}][\\w${JP}]*$`);
const ONE_WORD = new RegExp(`^[A-Za-z_${JP}][\\w${JP}]*$`);
const HAS_JAPANESE = new RegExp(`[${JP}]`);

/** この言葉で始まる行では、行まるごとの候補（for score in scores: など）を出す */
const LINE_HEAD = /^(for|if|elif|while)\s[\w\s%=+\-*<>!.,]*$/;

/** 行まるごとの候補は、多くてもこの数まで（多すぎると選べない） */
export const MAX_LINE_ITEMS = 5;

/** 変数名として使えない名前（キーワード・組み込み関数） */
const RESERVED = new Set([...KEYWORDS, ...BUILTINS].map(entry => entry.label));

/**
 * カーソルが文字列やコメントの中にあるか（その行の、カーソルより前だけで判断する）
 * @param {string} beforeCursor
 * @returns {boolean}
 */
export function isInStringOrComment(beforeCursor) {
  let quote = '';
  for (let i = 0; i < beforeCursor.length; i++) {
    const ch = beforeCursor[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '#') return true;
    if (ch === '"' || ch === "'") quote = ch;
  }
  return Boolean(quote);
}

/**
 * リストの名前から、1つ分の名前を作る（scores → score、cities → city）。
 * 複数形でない・使えない名前になるときは item にする。
 * @param {string} name
 * @param {Set<string>} [taken] すでに使っている名前
 */
export function singularName(name, taken = new Set()) {
  let base = name;
  const stripped = name.replace(/_?list$/i, '');
  if (stripped !== name) {
    // name_list → name。my_list のように残りが短い・意味のない名前なら item
    base = stripped.length >= 3 && !/^(my|the|new|old|tmp)$/i.test(stripped) ? stripped : '';
  } else if (/ies$/.test(name)) {
    base = `${name.slice(0, -3)}y`;                 // cities → city
  } else if (/(ss|x|ch|sh)es$/.test(name)) {
    base = name.slice(0, -2);                        // classes → class, boxes → box
  } else if (/(ss|us|is)$/.test(name)) {
    base = '';                                       // status, class, axis は複数形ではない
  } else if (/s$/.test(name)) {
    base = name.slice(0, -1);                        // scores → score
  } else {
    base = '';
  }
  if (!base || base === name || base.length < 2 || taken.has(base) || RESERVED.has(base) || !/^[A-Za-z_]\w*$/.test(base)) return 'item';
  return base;
}

/**
 * for の数え役の名前を選ぶ。外側の for や、ほかの変数で使っていない i / j / k にする。
 * @param {object} analysis analyzeCode の結果
 * @param {number} lineIndex カーソルのある行
 * @param {number} indent カーソルのある行の字下げの幅
 */
export function loopVarName(analysis, lineIndex, indent) {
  const used = new Set([...analysis.assigned, ...analysis.loopNames]);
  let limit = indent;
  for (let i = Math.min(lineIndex, analysis.lines.length) - 1; i >= 0 && limit > 0; i--) {
    const raw = analysis.lines[i];
    if (!raw.trim()) continue;
    const width = indentWidth(raw);
    if (width >= limit) continue;
    limit = width;
    const head = raw.trim().match(/^for\s+([\w,\s]+?)\s+in\s/);
    if (head) head[1].split(',').forEach(name => used.add(name.trim()));
  }
  return ['i', 'j', 'k'].find(name => !used.has(name)) || 'i';
}

/**
 * 生徒が作った変数から、その場で使えそうな書き方を作る。
 *   リスト scores → for score in scores: / scores.append() / len(scores)
 *   数 n          → for i in range(n): / for i in range(1, n + 1): / if n % 2 == 0:
 *   どの変数でも  → print(x)
 * 行まるごとの候補（kind: 'line'）は、行のはじめのときだけ作る。
 */
function contextItems(analysis, { lineIndex, indent, lineStart }) {
  const items = [];
  const names = Object.keys(analysis.variables)
    .sort((a, b) => (analysis.near[a] ?? 1e9) - (analysis.near[b] ?? 1e9));
  const taken = new Set(names);
  const loopVar = loopVarName(analysis, lineIndex, indent);
  const body = `\n${BODY_MARK}${CURSOR_MARK}`;

  for (const name of names) {
    const type = analysis.variables[name];
    const line = (label, insert, detail, aliases, extra = {}) =>
      items.push(item(label, insert, detail, 'line', 0, { varName: name, aliases: [name, ...aliases], ...extra }));

    if (type === 'list' || type === 'str') {
      items.push(item(`len(${name})`, `len(${name})`, `${name} の${type === 'list' ? '要素数' : '文字数'}`, 'expr', 0,
        { varName: name, aliases: [name, '長さ', '要素数'] }));
    }
    if (!lineStart) continue;

    if (type === 'list') {
      const one = singularName(name, taken);
      line(`for ${one} in ${name}:`, `for ${one} in ${name}:${body}`, `${name} の要素を1つずつ取り出して繰り返す`, ['繰り返し', 'くりかえし']);
      line(`${name}.append()`, `${name}.append(${CURSOR_MARK})`, `${name} の最後に1つ加える`, ['追加']);
    }
    const preferred = /^(n|num|count|cnt|times|size|kaisu)/i.test(name) ? { boost: 8 } : {};
    if (analysis.counts.has(name) && !analysis.loopNames.has(name)) {
      line(`for ${loopVar} in range(${name}):`, `for ${loopVar} in range(${name}):${body}`, `${name} 回繰り返す`, ['繰り返し', 'くりかえし', '範囲'], preferred);
      line(`for ${loopVar} in range(1, ${name} + 1):`, `for ${loopVar} in range(1, ${name} + 1):${body}`,
        `${loopVar} を 1 から ${name} まで変えて繰り返す`, ['繰り返し', 'くりかえし', '範囲'], preferred);
    }
    if (type === 'int' && !analysis.loopNames.has(name)) {
      line(`if ${name} % 2 == 0:`, `if ${name} % 2 == 0:${body}`, `${name} が偶数のとき`, ['もし', '偶数']);
    }
    line(`print(${name})`, `print(${name})`, `${name} を表示する`, ['表示', '出力']);
  }
  return items;
}

/** 値を書くところで使ってよいキーワード */
const VALUE_KEYWORDS = new Set(['True', 'False', 'None', 'not', 'lambda']);

/** 「=」「(」「,」の直後に出す候補（値として使えるもの） */
const VALUE_BUILTINS = new Set(['input', 'int', 'float', 'str', 'len']);

/**
 * カーソル位置に合う補完候補を返す
 * @param {object} options
 * @param {string} options.code エディタ全体のコード
 * @param {number} options.lineIndex カーソルのある行（0始まり）
 * @param {string} options.beforeCursor カーソルより前の同じ行のテキスト
 * @param {object[]} [options.extraApi] そのモードだけの追加候補（描画モードの p5 など）
 * @param {number} [options.limit] 最大件数
 * @param {boolean} [options.manual] Ctrl+Space などで呼ばれたか（何も打っていなくても全部出す）
 * @returns {{items: object[], replaceLength: number, context: string}}
 *   context: 'import' | 'member' | 'word'（単語を打っている）| 'expr'（= ( , の直後）| 'head'（for / if の直後）| 'empty' | 'none'
 */
export function getCompletions({ code, lineIndex, beforeCursor, extraApi = [], limit = 12, manual = true }) {
  // 文字列やコメントの中では補完しない
  if (isInStringOrComment(beforeCursor)) return { items: [], replaceLength: 0, context: 'none' };

  const analysis = analyzeCode(code, lineIndex);

  // --- import 文の途中 ---
  const importPrefix = beforeCursor.match(/^\s*(?:import|from)\s+(\w*)$/);
  if (importPrefix) {
    const prefix = importPrefix[1];
    const items = KNOWN_MODULES
      .filter(name => name.startsWith(prefix))
      .map(name => item(name, name, 'モジュール', 'module'));
    return { items: items.slice(0, limit), replaceLength: prefix.length, context: 'import' };
  }

  // --- 「なにか . なにか」の形（メンバー補完） ---
  const memberMatch = beforeCursor.match(/([A-Za-z_][\w.]*)\.(\w*)$/);
  if (memberMatch) {
    const [, target, prefix] = memberMatch;
    const items = memberCompletions(target, analysis, extraApi)
      .filter(entry => entry.label.toLowerCase().startsWith(prefix.toLowerCase()));
    return { items: items.slice(0, limit), replaceLength: prefix.length, context: 'member' };
  }

  // --- ふつうの位置 ---
  const indent = beforeCursor.match(/^\s*/)[0];
  const body = beforeCursor.slice(indent.length);
  const wordMatch = beforeCursor.match(WORD_AT_END);
  const prefix = wordMatch ? wordMatch[0] : '';
  const headMatch = body.match(LINE_HEAD);
  const lineStart = body === '' || ONE_WORD.test(body) || Boolean(headMatch);

  let context = 'word';
  if (!prefix) {
    // def f( の引数名は新しく決める名前なので、自分からは出さない
    // 自分から出すのは「代入の =」と「(」のあとだけ（== や += 、「,」のあとは Ctrl+Space で）
    const autoValue = /(?:^|[^=!<>+\-*/%&|^:])=\s*$|\(\s*$/.test(body) && !/^(def|class)\s/.test(body);
    if (autoValue || (manual && /[(=,]\s*$/.test(body))) context = 'expr';
    // for / if を打った直後だけ。if x == のあとなどでは自分からは出さない
    else if (headMatch && (manual || /^\w+\s+$/.test(body))) context = 'head';
    else if (manual) context = 'empty';
    else return { items: [], replaceLength: 0, context: 'none' };
  }

  const extras = contextItems(analysis, { lineIndex, indent: indentWidth(indent), lineStart: lineStart && context !== 'expr' });
  let candidates;
  if (context === 'expr') {
    candidates = [
      ...wordCompletions(analysis, extraApi).filter(entry =>
        ['variable', 'function'].includes(entry.kind) || VALUE_BUILTINS.has(entry.label)),
      ...extras,
      item('int(input())', 'int(input())', 'キーボードから整数を受け取る', 'builtin', 2, { aliases: ['入力', '整数'] }),
    ];
  } else if (context === 'head') {
    candidates = [
      ...extras.filter(entry => entry.kind === 'line'),
      ...wordCompletions(analysis, extraApi).filter(entry => entry.kind === 'variable'),
    ];
  } else {
    candidates = [...wordCompletions(analysis, extraApi), ...extras];
  }

  const ctx = {
    near: analysis.near,
    head: headMatch ? headMatch[1] : '',
    lineStart: lineStart && context !== 'expr',
    // 値を書くところ（x = in のとき、キーワード in より int・input を上に）
    valuePos: context === 'expr' || /(?:(?:^|[^=!<>])=|[(,])\s*[A-Za-z_]\w*$/.test(body),
  };
  const lowerPrefix = prefix.toLowerCase();
  const lowerBody = body.toLowerCase();

  const scored = candidates
    .map(entry => {
      // 行まるごとの候補は、行の字下げより後ろ全体を打ちかえる
      const isLine = entry.kind === 'line';
      const query = isLine ? lowerBody : lowerPrefix;
      const target = isLine ? { ...entry, replaceLength: body.length } : entry;
      return { entry: target, score: score(target, query, ctx) };
    })
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));

  const seen = new Set();
  let lineCount = 0;
  const items = [];
  for (const { entry } of scored) {
    if (seen.has(entry.label)) continue;
    if (entry.kind === 'line' && ++lineCount > MAX_LINE_ITEMS) continue;
    seen.add(entry.label);
    items.push(entry);
    if (items.length >= limit) break;
  }

  return { items, replaceLength: prefix.length, context };
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
  const names = Object.keys(analysis.variables)
    .sort((a, b) => (analysis.near[a] ?? 1e9) - (analysis.near[b] ?? 1e9));
  for (const name of names) {
    const type = analysis.variables[name];
    items.push(item(name, name, type ? `変数（${type}）` : '変数', 'variable', 0, { varName: name }));
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

  // 乱数は import random を書いてから使う
  if (analysis.modules.random) {
    items.push(item('random.randint()', `random.randint(${CURSOR_MARK})`, '整数の乱数（両端を含む）', 'member', 0, { aliases: ['乱数'] }));
  }

  items.push(...BUILTINS, ...KEYWORDS, ...SNIPPETS);
  return items;
}

/** 単語の頭文字（total_score → ts、for score in scores: → fsis） */
function initials(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toLowerCase();
}

/** query の字が、text の中に順番どおりに出てくるか（あいまい一致） */
function inOrder(text, query) {
  let at = 0;
  for (const ch of text) {
    if (ch === query[at]) at++;
    if (at === query.length) return true;
  }
  return false;
}

/**
 * どのくらいよく合うか。4: 完全一致 / 3: 前方一致 / 2: 頭文字・途中に含む / 1: 順番どおり / 0: 合わない
 * @param {string} text 候補の名前（小文字）
 * @param {string} query 打った字（小文字）
 */
export function matchTier(text, query) {
  if (!text || !query) return 0;
  if (text === query) return 4;
  if (text.startsWith(query)) return 3;
  if (HAS_JAPANESE.test(query)) return text.includes(query) ? 2 : 0;
  if (query.length >= 2 && initials(text).startsWith(query)) return 2;
  if (text.includes(query)) return 2;
  if (query.length >= 2 && inOrder(text, query)) return 1;
  return 0;
}

/** 並び順を決める点数（0 なら候補から外す） */
function score(entry, query, ctx = {}) {
  const kindBonus = {
    variable: 60, function: 58, class: 56, module: 54, member: 52,
    api: 50, expr: 48, builtin: 40, line: 32, snippet: 30, keyword: 28, method: 20,
  }[entry.kind] || 10;
  // 行のはじめに len(scores) だけを書くことはまずないので、行まるごとの候補より下に
  const bonus = entry.kind === 'expr' && ctx.lineStart ? 25 : kindBonus;

  let points;
  if (!query.trim()) {
    if (entry.kind === 'method') return 0;
    points = bonus;
  } else {
    const fields = [entry.label, entry.trigger, ...(entry.aliases || [])]
      .filter(Boolean)
      .map(text => text.toLowerCase());
    const tier = Math.max(0, ...fields.map(text => matchTier(text, query.trim())));
    if (!tier) return 0;
    points = tier * 1000 + bonus - Math.min(entry.label.length, 30) / 2;
  }

  // カーソルの近くで使った変数ほど上に。
  // 行まるごとの候補は、同じ強さで合う組み込み関数（pr → print）を追い越さない程度にとどめる
  const distance = entry.varName ? ctx.near?.[entry.varName] : undefined;
  if (distance !== undefined) {
    points += entry.kind === 'line' || entry.kind === 'expr' ? Math.max(0, 6 - distance) : Math.max(0, 30 - distance * 3);
  }
  if (entry.boost) points += entry.boost;

  // 値を書くところでは、True / False / None / not / lambda 以外のキーワードは下に
  if (ctx.valuePos && entry.kind === 'keyword' && !VALUE_KEYWORDS.has(entry.label)) points -= 2500;

  // 「for 」「if 」と打った行では、その言葉で始まる書き方を上に
  if (ctx.head && entry.label.toLowerCase().startsWith(`${ctx.head} `)) points += 200;

  return points;
}

/**
 * 候補を、エディタに入れる文字列とカーソルの位置に直す。
 *   __CURSOR__ … 入れたあとのカーソルの位置
 *   __BODY__   … ブロックの中身の字下げ（今の行の字下げ ＋ 4 文字）
 * 2 行目からは、今の行の字下げをつける。
 * @param {object} entry 候補
 * @param {string} [indent] 今の行の字下げ
 * @param {string} [unit] 1 段の字下げ（エディタの設定。既定は空白 4 つ、行がタブならタブ）
 * @returns {{text: string, line: number, ch: number}} line はいくつ下の行か。
 *   ch は、line が 0 なら入れはじめからの字数、1 以上ならその行の頭からの字数
 */
export function prepareInsert(entry, indent = '', unit = indent.includes('\t') ? '\t' : INDENT_UNIT) {
  const raw = entry.insert
    .split('\n')
    // ひな形の中の 4 文字の字下げも、エディタの字下げ（タブ・空白）にそろえる
    .map((line, index) => (index === 0 ? line : indent + line.replace(/^(?: {4})+/, m => unit.repeat(m.length / 4))))
    .join('\n')
    .split(BODY_MARK).join(unit);

  const mark = raw.indexOf(CURSOR_MARK);
  const text = raw.split(CURSOR_MARK).join('');
  const before = mark >= 0 ? raw.slice(0, mark) : text.slice(0, text.length - (entry.moveBack || 0));
  const lines = before.split('\n');
  return { text, line: lines.length - 1, ch: lines[lines.length - 1].length };
}

/**
 * 薄い文字で見せる「続き」。打った字で始まらない候補（日本語で探したときなど）は出さない。
 * @param {object} entry 候補
 * @param {string} typed すでに打ってある字（置きかえる部分）
 */
export function ghostText(entry, typed) {
  if (!entry) return '';
  const first = entry.insert.split('\n')[0].split(CURSOR_MARK).join('');
  if (!first.toLowerCase().startsWith(typed.toLowerCase())) return '';
  return first.slice(typed.length);
}
