// module/pyrun.js
import { suggestSyntaxFix, pointOutFullWidth } from './pyfix.js';
// 学習者のコードを走らせて、結果とエラーを受け取るところ。
//
// ここに集めたのには理由がある。
// 以前はページごとに「コードを try: の中へ字下げして貼りつける」方式だったので、
//   ・エラーの行番号が、貼りつけた分だけずれて出ていた（1行目なのに「31行目」など）
//   ・Traceback がそのまま出て、初学者には読めなかった
// という問題があった。
//
// いまは compile() にコードをそのまま渡すので行番号が合い、
// エラーは日本語のヒントに直してから見せている。

/** 何秒で打ち切るか */
export const RUN_LIMIT_SECONDS = 10;

/** 時間切れのときのメッセージ */
export const TIMEOUT_MESSAGE =
  '時間がかかりすぎたので止めました。終わらないくり返し（while True など）になっていませんか？';

/** エラーの中でこの名前が出たら、学習者のコードの行だとわかる */
export const USER_FILE = '<あなたのコード>';

/** 画面に出す出力の上限（文字数）。これを超えたぶんは画面に出さない */
const DISPLAY_LIMIT = 200000;

/** 画面に出す出力が上限を超えたときの案内 */
const OUTPUT_OMITTED_NOTE = '\n（出力が多すぎるので、ここから先は省略しました）\n';

/** 答え合わせ用に残す出力の上限（文字数）。ふつうの量では切れない */
const OUTPUT_KEEP_LIMIT = 2000000;

/** 画面への書きこみをまとめる間隔（秒） */
const FLUSH_INTERVAL_SECONDS = 0.05;

/** Pyodide に一度だけ流し込む実行係 */
// 学習者のコードは、描画モードでは この実行係と同じ globals で動く。
// 学習者が time / json / sys / io という名前の変数を作っても壊れないよう、
// 実行係が使うモジュールは _ec_ から始まる別名で取りこむ。
const RUNNER_SOURCE = `
import ast as _ec_ast, io as _ec_io, json as _ec_json, sys as _ec_sys, time as _ec_time

_EASYCODE_FILE = ${JSON.stringify(USER_FILE)}
_EASYCODE_TIMEOUT_MESSAGE = ${JSON.stringify(TIMEOUT_MESSAGE)}
_EASYCODE_DISPLAY_LIMIT = ${DISPLAY_LIMIT}
_EASYCODE_OMITTED_NOTE = ${JSON.stringify(OUTPUT_OMITTED_NOTE)}
_EASYCODE_KEEP_LIMIT = ${OUTPUT_KEEP_LIMIT}
_EASYCODE_FLUSH_INTERVAL = ${FLUSH_INTERVAL_SECONDS}
_easycode_state = {'deadline': 0.0, 'ticks': 0, 'expired': False}


class _EasycodeTimeout(BaseException):
    """時間切れ。BaseException にしてあるのは、学習者の except Exception: で
    握りつぶされて、終わらないコードが止まらなくなるのを防ぐため"""


def _easycode_watchdog(frame, event, arg):
    """終わらないコードを打ち切るための見張り"""
    state = _easycode_state
    # 期限を過ぎたあとは、200 回に 1 回ではなく毎回しらべずに投げる
    if state['expired']:
        raise _EasycodeTimeout(_EASYCODE_TIMEOUT_MESSAGE)
    state['ticks'] += 1
    if state['ticks'] % 200 == 0 and _ec_time.time() > state['deadline']:
        state['expired'] = True
        raise _EasycodeTimeout(_EASYCODE_TIMEOUT_MESSAGE)
    return _easycode_watchdog


class _EasycodeOut:
    """print() の行き先。画面にも出しつつ、あとで使えるようにためておく"""

    def __init__(self, element=None):
        self.buffer = _ec_io.StringIO()
        self.kept = 0
        self.element = element
        # 1 回ずつ textContent に足すと、出力が増えるほど遅くなる（全文の作りなおし）。
        # ためておいて、短い間隔でまとめて書く
        self.pending = []
        self.shown = 0
        self.last_flush = 0.0

    def write(self, text):
        if self.kept < _EASYCODE_KEEP_LIMIT:
            self.buffer.write(text[:_EASYCODE_KEEP_LIMIT - self.kept])
            self.kept += len(text)
        if self.element is not None and self.shown <= _EASYCODE_DISPLAY_LIMIT:
            self.pending.append(text)
            self.shown += len(text)
            if _ec_time.time() - self.last_flush >= _EASYCODE_FLUSH_INTERVAL:
                self.flush()
        return len(text)

    def flush(self):
        if self.element is None or not self.pending:
            return
        text = ''.join(self.pending)
        self.pending = []
        if self.shown > _EASYCODE_DISPLAY_LIMIT:
            over = self.shown - _EASYCODE_DISPLAY_LIMIT
            text = text[:max(0, len(text) - over)] + _EASYCODE_OMITTED_NOTE
            self.shown = _EASYCODE_DISPLAY_LIMIT + 1  # もう書かない
        self.element.textContent += text
        self.last_flush = _ec_time.time()


def _easycode_error_info(exc):
    """例外から「種類・メッセージ・何行目か」を取り出す"""
    info = {'type': type(exc).__name__, 'message': str(exc), 'line': None, 'name': None}
    # 時間切れは、これまでどおり TimeoutError として知らせる（画面側の判定を変えないため）
    if isinstance(exc, _EasycodeTimeout):
        info['type'] = 'TimeoutError'
        info['message'] = _EASYCODE_TIMEOUT_MESSAGE

    if isinstance(exc, SyntaxError):
        info['message'] = exc.msg or str(exc)
        info['line'] = exc.lineno
        return info

    # 学習者のコードの中で、いちばん深い行を採る
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == _EASYCODE_FILE:
            info['line'] = tb.tb_lineno
        tb = tb.tb_next

    # NameError などは「どの名前か」がわかると助けになる
    info['name'] = getattr(exc, 'name', None)
    return info


def _easycode_describe(value):
    """変数の値を、画面に出せる短い文字にする"""
    try:
        text = repr(value)
    except Exception:
        return '<表示できません>'
    return text if len(text) <= 200 else text[:200] + '…'


def _easycode_timed_input(helper, out):
    """input() で人が考えている時間は、制限時間に数えない。
    待った長さだけ期限をのばすので、入力のあるプログラムが
    「終わらないくり返し」と間違われて止められることがない"""
    async def timed_input(*args):
        out.flush()  # 問いかけが画面に出るより先に、これまでの出力を出しておく
        started = _ec_time.time()
        try:
            return await helper(*args)
        finally:
            _easycode_state['deadline'] += _ec_time.time() - started
    return timed_input


async def _easycode_run(code, element=None, seconds=10.0, use_globals=False,
                        prelude=None, capture=None):
    out = _EasycodeOut(element)
    info = None
    orig_out, orig_err = _ec_sys.stdout, _ec_sys.stderr

    try:
        compiled = compile(code, _EASYCODE_FILE, 'exec', flags=_ec_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    except SyntaxError as exc:
        return _ec_json.dumps({'output': '', 'error': _easycode_error_info(exc)})

    # 描画モードは p5 の関数や setup() / draw() を残したいので、
    # そのときだけ共通の globals をそのまま使う。
    if use_globals:
        namespace = globals()
    else:
        namespace = {'__name__': '__main__'}
        helper = globals().get('custom_input')
        if helper is not None:
            namespace['custom_input'] = _easycode_timed_input(helper, out)

    # 前置き（乱数の種を固定する、問題文で説明される関数を用意する など）。
    # 学習者のコードとは別のファイル名で読みこむので、
    # エラーの行番号がずれることはない。
    if prelude:
        try:
            exec(compile(prelude, '<easycode-prelude>', 'exec'), namespace)
        except BaseException as exc:
            return _ec_json.dumps({
                'output': '',
                'error': {'type': 'PreludeError', 'message': str(exc), 'line': None, 'name': None},
            })

    _easycode_state['deadline'] = _ec_time.time() + seconds
    _easycode_state['ticks'] = 0
    _easycode_state['expired'] = False

    _ec_sys.stdout = _ec_sys.stderr = out
    _ec_sys.settrace(_easycode_watchdog)
    try:
        # eval なのは、input() を await に置きかえたコードを動かすため。
        # PyCF_ALLOW_TOP_LEVEL_AWAIT でコンパイルすると、
        # ここはコルーチンを返すので、下で await する。
        # 動かす中身は学習者が自分のブラウザで書いたコードなので、
        # 外から来た文字列を動かしているわけではない。
        result = eval(compiled, namespace)
        if result is not None:
            await result
    except BaseException as exc:
        info = _easycode_error_info(exc)
    finally:
        _ec_sys.settrace(None)
        _ec_sys.stdout, _ec_sys.stderr = orig_out, orig_err
        out.flush()

    # 「変数の最終値」を問う問題のために、名指しされた変数だけ取り出す
    variables = {}
    if capture:
        for name in _ec_json.loads(capture):
            if name in namespace:
                variables[name] = _easycode_describe(namespace[name])

    return _ec_json.dumps({
        'output': out.buffer.getvalue(),
        'error': info,
        'variables': variables,
    })
`;

const installed = new WeakSet();

/**
 * 実行係を Pyodide に登録する（そのインスタンスにつき一度だけ）
 * @param {object} pyodide
 */
function ensureRunner(pyodide) {
  if (installed.has(pyodide)) return;
  pyodide.runPython(RUNNER_SOURCE);
  installed.add(pyodide);
}

/**
 * 学習者のコードを走らせる
 * @param {object} pyodide Pyodide インスタンス
 * @param {string} code Python のソースコード（そのまま渡す。字下げしないこと）
 * @param {object} [options]
 * @param {HTMLElement} [options.element] 出力をその場で書き足したい要素
 * @param {number} [options.seconds] 打ち切りまでの秒数
 * @param {boolean} [options.useGlobals] 定義したものを次の実行にも残す（描画モード用）
 * @param {string} [options.prelude] 先に読みこむ Python（乱数の種の固定など）
 * @param {string[]} [options.capture] 実行のあと値を見たい変数の名前
 * @returns {Promise<{output: string, error: object|null, variables: object}>}
 */
export async function runUserCode(pyodide, code, options = {}) {
  ensureRunner(pyodide);
  const {
    element = null, seconds = RUN_LIMIT_SECONDS, useGlobals = false,
    prelude = null, capture = null,
  } = options;

  const run = pyodide.globals.get('_easycode_run');
  try {
    const json = await run(code, element, seconds, useGlobals, prelude,
      capture ? JSON.stringify(capture) : null);
    const result = JSON.parse(json);
    if (!result.variables) result.variables = {};
    return result;
  } finally {
    if (run && run.destroy) run.destroy();
  }
}

/**
 * input() を、ブラウザの入力欄で受け取れる形に置きかえる
 *
 * 行の数は変えないので、エラーの行番号はずれない。
 * @param {string} code
 * @returns {string}
 */
export function withBrowserInput(code) {
  return code.replace(/\binput\(/g, 'await custom_input(');
}

/* ============================================================
 * エラーを、押せば直せる形にする
 * ========================================================== */

/**
 * エラーから「1 行足せば直る」直し方を探す
 *
 * いまのところ UnboundLocalError だけ。
 * 関数の中で外の変数を書きかえたときに出るもので、
 * p5.js から写してきたプログラムで必ず引っかかる。
 *
 * 黙って直さず、学習者のコードに本物の「global x」を入れる。
 * どのモードでも同じように動き、覚えたことがそのまま使える。
 *
 * @param {string} code 学習者のコード
 * @param {object|null} error runUserCode が返したエラー
 * @returns {{label: string, name: string, line: number, code: string}|null}
 */
export function suggestFix(code, error) {
  if (!error || !error.line) return null;

  // 書き方のまちがい（JavaScript の癖・全角・: の書きわすれ・= と ==）
  if (error.type !== 'UnboundLocalError') return suggestSyntaxFix(code, error);

  // UnboundLocalError は name を持たないことがある。メッセージの 'なまえ' から拾う
  const name = error.name || guessName(error);
  if (!name) return null;
  const lines = code.split('\n');
  const at = error.line - 1;
  if (at < 0 || at >= lines.length) return null;

  // エラーの行から上にたどって、その行を含んでいる def を探す
  let defAt = -1;
  for (let i = at; i >= 0; i--) {
    if (/^\s*(async\s+)?def\s+\w+\s*\(/.test(lines[i])) { defAt = i; break; }
  }
  if (defAt < 0) return null;

  // すでに書いてあるなら、足すものはない。
  // ほかの名前で global の行があるなら、その行に足す（行を増やさない）
  const bodyIndent = indentOf(lines, defAt);
  if (bodyIndent === null) return null;
  let globalAt = -1;
  for (let i = defAt + 1; i < lines.length; i++) {
    if (lines[i].trim() && indentWidth(lines[i]) < bodyIndent) break;
    if (new RegExp(`^\\s*global\\b[^#]*\\b${name}\\b`).test(lines[i])) return null;
    if (globalAt < 0 && /^\s*global\s+\w/.test(lines[i])) globalAt = i;
  }

  // その名前が、関数の外で作られていること（そうでなければ打ちまちがい）
  const outside = lines.some((line, i) => (i < defAt || indentWidth(line) === 0)
    && new RegExp(`^${name}\\s*(=[^=]|[-+*/]=)`).test(line.trim()) && indentWidth(line) === 0);
  if (!outside) return null;

  const fixed = [...lines];
  let placed;
  if (globalAt >= 0) {
    fixed[globalAt] = `${fixed[globalAt].replace(/\s+$/, '')}, ${name}`;
    placed = globalAt + 1;
  } else {
    placed = defAt + 2;
    fixed.splice(defAt + 1, 0, ' '.repeat(bodyIndent) + `global ${name}`);
  }
  return {
    label: `global ${name} を書き入れる`,
    name,
    line: placed,
    code: fixed.join('\n'),
  };
}

/** その行の字下げの深さ */
function indentWidth(line) {
  const m = /^[ \t]*/.exec(line);
  return m ? m[0].replace(/\t/g, '    ').length : 0;
}

/** def の中身が、どれだけ下げて書かれているか */
function indentOf(lines, defAt) {
  const head = indentWidth(lines[defAt]);
  for (let i = defAt + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const width = indentWidth(lines[i]);
    return width > head ? width : head + 4;
  }
  return head + 4;
}

/* ============================================================
 * エラーを日本語のヒントに直す
 * ========================================================== */

/** よくあるエラーの説明。{name} はエラーが指す名前に置きかわる */
const HINTS = {
  NameError:
    '「{name}」という名前は、まだ作られていません。打ちまちがいがないか、使う前に代入しているかを見てみましょう。',
  SyntaxError:
    '書き方のまちがいです。かっこ ( ) や引用符 \' \' の閉じわすれ、行のおわりの : を確かめましょう。',
  IndentationError:
    '行の先頭の空白（インデント）がそろっていません。if や for の中身は 4 つ分下げます。',
  TabError:
    'タブと空白が混ざっています。「コード整形」ボタンを押すと空白にそろえられます。',
  TypeError:
    'ちがう種類のもの同士を使おうとしています。文字列と数値は + でつなげないので、str() や int() で種類をそろえます。',
  ZeroDivisionError: '0 で割ることはできません。割る数が 0 になっていないか確かめましょう。',
  IndexError:
    'リストの範囲の外を見ています。番号は 0 から始まり、最後は len(リスト) - 1 です。',
  KeyError: '辞書に「{name}」というキーがありません。キーの名前を確かめましょう。',
  ValueError:
    '中身が合っていません。int("あ") のように、数字でない文字を数値にしようとしていませんか？',
  AttributeError: 'その種類のものには、その名前のはたらきがありません。つづりを確かめましょう。',
  ModuleNotFoundError: 'そのライブラリはこの画面では使えません。',
  ImportError: 'そのライブラリはこの画面では使えません。',
  UnboundLocalError:
    '関数の中で「{name}」を書きかえています。'
    + '関数の外にある「{name}」を使うには、関数のはじめに「global {name}」と書きます。',
  RecursionError: '関数が自分自身を呼びすぎました。止まる条件を入れましょう。',
  OverflowError: '数が大きくなりすぎました。',
  StopIteration: '取り出すものがもうありません。',
  KeyboardInterrupt: '実行を止めました。',
};

/**
 * エラー情報を、画面に出す文にする
 * @param {{type: string, message: string, line: number|null, name: string|null}} info
 * @param {string} [code] 学習者のコード（その行を見せるために使う）
 * @returns {string}
 */
export function explainError(info, code = '') {
  if (!info) return '';

  // 時間切れは、それ自体がすでに日本語の案内
  if (info.type === 'TimeoutError') return `× ${info.message}`;

  const lines = [];
  lines.push(info.line ? `× ${info.line} 行目でエラーが起きました` : '× エラーが起きました');

  // 全角の字が混ざっていたら、どれが全角かを【 】で囲んで見せる
  // （全角の字は Python の名前にも使えてしまうので、書き方のエラーのときだけ全角を疑う）
  let fullWidth = null;
  let targetShown = false;
  if (info.line && code) {
    const target = code.split('\n')[info.line - 1];
    fullWidth = target && info.type === 'SyntaxError' ? pointOutFullWidth(target) : null;
    if (fullWidth) lines.push(`   ${fullWidth.shown.trim()}`);
    else if (target && target.trim()) lines.push(`   ${target.trim()}`);
    targetShown = Boolean(fullWidth || (target && target.trim()));
  }

  lines.push(`${info.type}: ${info.message}`);

  if (fullWidth) {
    lines.push(`→ 【 】で囲んだところが全角です（${fullWidth.list}）。プログラムの記号・数字・空白は半角で書きます。`);
    return lines.join('\n');
  }

  // 字下げのまちがいは、空白を「·」にして数えられるようにする（空白は目に見えないので）
  if ((info.type === 'IndentationError' || info.type === 'TabError') && info.line && code) {
    const indentNote = explainIndent(info, code);
    if (indentNote) {
      lines.splice(1, targetShown ? 1 : 0, ...indentNote.shown);
      lines.push(`→ ${indentNote.hint}`);
      return lines.join('\n');
    }
  }

  const hint = detailedHint(info) || HINTS[info.type];
  if (hint) {
    const name = info.name || guessName(info);
    lines.push(`→ ${hint.replaceAll('{name}', name || 'その名前')}`);
  }

  return lines.join('\n');
}

/** 行頭の空白を「·」（タブは「→」）にして見せる */
function showIndent(text) {
  const lead = text.match(/^[ \t]*/)[0];
  return lead.replace(/ /g, '·').replace(/\t/g, '→   ') + text.slice(lead.length);
}


/**
 * 字下げのエラーを、空白の数が見える形で説明する
 * @returns {{shown: string[], hint: string}|null}
 */
function explainIndent(info, code) {
  const all = code.replace(/\r/g, '').split('\n');
  const at = info.line - 1;
  const target = all[at];
  if (target === undefined) return null;
  let prev = at - 1;
  while (prev >= 0 && !all[prev].trim()) prev--;
  const shown = [];
  if (prev >= 0) shown.push(`   ${prev + 1} 行目｜${showIndent(all[prev])}`);
  shown.push(target.trim()
    ? `   ${info.line} 行目｜${showIndent(target)}　← 字下げ ${indentWidth(target)} 文字`
    : `   ${info.line} 行目｜（中身の行がありません）`);
  const message = info.message || '';
  const after = message.match(/after '?(\w+)'? statement on line (\d+)/);
  let hint;
  if (info.type === 'TabError' || /\t/.test(target.match(/^[ \t]*/)[0])) {
    hint = 'タブ（→）と空白（·）がまざっています。字下げは空白 4 つずつにそろえましょう（「字下げ」ボタンでも直せます）。';
  } else if (after || /expected an indented block/.test(message)) {
    const head = after ? `${after[2]} 行目の ${after[1]} ` : '上の「:」で終わる行';
    hint = `${head}の中身は、その行より 4 文字（····）下げて書きます。中身が何も無いなら pass と書きます。`;
  } else if (/unexpected indent/.test(message)) {
    hint = `前の行より深く下げています（· の数をくらべましょう）。前の行が「:」で終わっていないなら、同じ深さにそろえます。`;
  } else if (/unindent does not match/.test(message)) {
    hint = '上のどの行の字下げ（0・4・8 … 文字）ともそろっていません。· の数を 4 の倍数にそろえましょう。';
  } else {
    hint = '字下げ（行のはじめの空白）がずれています。· の数をそろえましょう。同じまとまりの行は、同じ数だけ下げます。';
  }
  return { shown, hint };
}

/** メッセージの中身を見て、もっと近いヒントがあれば選ぶ */
function detailedHint(info) {
  const message = info.message || '';

  if (info.type === 'TypeError') {
    // 「多すぎる」を先に調べる。"takes 1 positional argument but 2 were given" は
    // "takes \d+ positional" にも当てはまるので、後ろに回すと「足りない」と誤って案内してしまう
    if (/but \d+ (were|was) given|takes from \d+ to \d+ positional|positional arguments? but/.test(message)) {
      return 'かっこの中に書いた値が多すぎます。いくつ必要か確かめましょう。';
    }
    if (/missing \d+ required|takes \d+ positional|expected \d+ argument/.test(message)) {
      return 'かっこの中に書く値の数が足りていません。circle(x, y, 大きさ) のように、いくつ必要か確かめましょう。';
    }
    // input() は文字列を返すので、数と比べるには int() が要る
    if (/'(<|>|<=|>=)' not supported between instances of '(str' and '(int|float)|(int|float)' and 'str)'/.test(message)) {
      return 'input() で受け取った値は文字列です。数と比べるときは int(input()) のように、数に直してから比べましょう。';
    }
    if (/not callable/.test(message)) {
      return 'これは呼び出せるものではありません。変数の名前と関数の名前が同じになっていませんか？';
    }
    if (/not subscriptable/.test(message)) {
      return 'これは [ ] で取り出せる種類ではありません。リストや文字列かどうか確かめましょう。';
    }
  }

  if (info.type === 'ValueError' && /invalid literal for int/.test(message)) {
    return '数字でない文字を int() で数値にしようとしています。input() の中身を確かめましょう。';
  }

  return '';
}

/**
 * メッセージの中の 'なまえ' から、エラーが指す名前を拾う
 * （NameError: name 'kazu' is not defined のような形）
 * @param {{message: string}} info
 * @returns {string}
 */
function guessName(info) {
  const match = /'([^']+)'/.exec(info.message || '');
  return match ? match[1] : '';
}
