// module/pyrun.js
import { suggestSyntaxFix, pointOutFullWidth, scanLine } from './pyfix.js';
import { suggestName, closeTypo } from './namefix.js';
import { findIndentOutliers, reindent, describeIndent } from './indentcheck.js';
import { autoIndent } from './pyformat.js';
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

/** NameError の名前が、大文字・小文字だけちがう名前なら、押せば直る案内を作る */
function suggestNameFix(code, error) {
  const name = error.name || guessName(error);
  if (!name) return null;
  const right = suggestName(name, code);
  if (!right) return null;
  const lines = code.split('\n');
  const at = error.line - 1;
  if (at < 0 || at >= lines.length) return null;
  // その行の、同じ名前だけを置きかえる。文字列とコメントの中、. のうしろ（中身の名前）は触らない
  const text = lines[at];
  const kinds = scanLine(text);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(new RegExp(`(?<![\\w.])${escaped}(?!\\w)`, 'g'))) {
    if (kinds[m.index] !== 'code') continue;
    out += text.slice(last, m.index) + right;
    last = m.index + name.length;
  }
  if (!last) return null;
  const fixed = [...lines];
  fixed[at] = out + text.slice(last);
  return {
    label: `${name} を ${right} に直す`,
    why: right.toLowerCase().replace(/_/g, '') === name.toLowerCase().replace(/_/g, '')
      ? `「${name}」という名前はありません。「${right}」のことかもしれません。Python では大文字と小文字は別の字です。`
      : `「${name}」という名前はありません。「${right}」の打ちまちがいかもしれません。`,
    code: fixed.join('\n'),
    line: error.line,
  };
}

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

  // その行だけ字下げがちがう（エラーの行の 1 つ前が原因のことも多い）
  if (error.type === 'IndentationError') {
    const culprit = indentCulprit(error, code);
    if (culprit) {
      const lines = code.split('\n');
      const fixed = [...lines];
      fixed[culprit.line] = reindent(lines[culprit.line], culprit.lead);
      return {
        label: culprit.afterHeader ? `${culprit.line + 1} 行目を 4 文字下げる` : `${culprit.line + 1} 行目を ${culprit.expected} 文字にそろえる`,
        why: culprit.afterHeader
          ? `「:」で終わる行の次の行（${culprit.line + 1} 行目）は、中身なので 4 文字（Tab キー 1 回）下げて書きます。`
          : `${culprit.line + 1} 行目だけ字下げが ${describeIndent(culprit.indent)}で、前後の行（${describeIndent(culprit.expected)}）とそろっていません。`,
        code: fixed.join('\n'),
        line: culprit.line + 1,
      };
    }
  }
  // 上のどの行ともそろわない字下げ（Backspace を 1 回多く・少なく押した）は、いちばん近い深さにそろえる
  if (error.type === 'IndentationError' && /unindent does not match/.test(error.message || '')) {
    const lines = code.split('\n');
    const at = error.line - 1;
    const target = lines[at];
    if (target !== undefined && target.trim() && !/^\s*(else|elif|except|finally)\b/.test(target)) {
      const width = indentWidth(target);
      const levels = [...new Set(lines.slice(0, at).filter(l => l.trim()).map(indentWidth))];
      // 同じだけ離れているときは浅い方（外に出す方）にする
      const nearest = levels.sort((a, b) => Math.abs(a - width) - Math.abs(b - width) || a - b)[0];
      if (nearest !== undefined && nearest !== width) {
        const fixed = [...lines];
        fixed[at] = ' '.repeat(nearest) + target.trim();
        return {
          label: `${error.line} 行目を ${nearest} 文字にそろえる`,
          why: `${error.line} 行目の字下げ（${width} 文字）が、上のどの行ともそろっていません。いちばん近い ${nearest} 文字にそろえます（外に出したいときは、そのあと Backspace で 1 段もどします）。`,
          code: fixed.join('\n'),
          line: error.line,
        };
      }
    }
  }

  // それでも決まらない字下げのまちがいは、「字下げ」ボタンと同じ組み直しを出す（組み直して変わるときだけ）
  if (error.type === 'IndentationError' || error.type === 'TabError') {
    const rebuilt = autoIndent(code);
    if (rebuilt.trim() && rebuilt.replace(/\s+$/, '') !== code.replace(/\s+$/, '')) {
      return {
        label: '字下げをそろえる（「字下げ」ボタンと同じ）',
        why: '行のはじめの空白の数がそろっていません。「:」の次の行は 4 文字下げ、同じまとまりの行は同じだけ下げて、組み直します。',
        code: rebuilt,
        line: error.line,
      };
    }
  }

  // 大文字・小文字だけがちがう名前（Print → print、createcanvas → createCanvas）
  if (error.type === 'NameError') {
    const fix = suggestNameFix(code, error);
    if (fix) return fix;
  }

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
    '字下げ（行のはじめの空白）がそろっていません。if や for の中身は、空白 4 つ（Tab キー 1 回）下げます。',
  TabError:
    'タブと空白が混ざっています。「字下げ」ボタンを押すと、空白にそろえられます。',
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

  const hint = detailedHint(info, code) || HINTS[info.type];
  if (hint) {
    const name = info.name || guessName(info);
    lines.push(`→ ${hint.replaceAll('{name}', name || 'その名前')}`);
  }

  return lines.join('\n');
}

/** 「·」と、Tab キー・スペースの数の対応（字下げのエラーの説明にそえる） */
const INDENT_LEGEND = '   （字下げ＝行のはじめの空白。· はスペース 1 つ。4 文字 ＝ スペース 4 つ ＝ キーボード左はしの Tab キー 1 回。「:」のあと Enter を押すと自動で 4 文字下がり、Backspace 1 回で 1 段もどる）';

/** 行頭の空白を「·」（タブは「→」）にして見せる */
function showIndent(text) {
  const lead = text.match(/^[ \t]*/)[0];
  return lead.replace(/ /g, '·').replace(/\t/g, '→   ') + text.slice(lead.length);
}


/**
 * 字下げのエラーの、本当の原因らしい行（その行だけ字下げが前後とちがう行）
 * Python は、字下げを忘れた行の「次の行」をエラーにすることがあるので、エラーの行とその前の行を見る
 */
function indentCulprit(info, code) {
  const all = code.replace(/\r/g, '').split('\n');
  const at = info.line - 1;
  let prev = at - 1;
  while (prev >= 0 && !all[prev].trim()) prev--;
  return findIndentOutliers(code.replace(/\r/g, '')).find(o => o.line === at || o.line === prev) || null;
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
  const culprit = indentCulprit(info, code);
  if (culprit && culprit.line !== at) {
    // エラーの行ではなく、その前の行がずれている（字下げを忘れた行のあとで、中身が終わったとみなされた）
    const before = all[culprit.line - 1] !== undefined ? culprit.line - 1 : -1;
    const shown = [];
    if (before >= 0 && all[before].trim()) shown.push(`   ${before + 1} 行目｜${showIndent(all[before])}`);
    shown.push(`   ${culprit.line + 1} 行目｜${showIndent(all[culprit.line])}　← ここだけ字下げ ${culprit.indent} 文字`);
    shown.push(`   ${info.line} 行目｜${showIndent(target)}`);
    shown.push(INDENT_LEGEND);
    return {
      shown,
      hint: `エラーは ${info.line} 行目ですが、原因は ${culprit.line + 1} 行目です。${culprit.line + 1} 行目だけ字下げが ${describeIndent(culprit.indent)}で、前後の行は ${describeIndent(culprit.expected)}です。`
        + `Python は ${culprit.line + 1} 行目で上のまとまりが終わったと考えるので、次の ${info.line} 行目の字下げがおかしい、と言っています。`
        + `${culprit.line + 1} 行目の頭で ${culprit.expected % 4 === 0 && culprit.expected ? `Tab キーを ${culprit.expected / 4} 回押して` : `スペースを ${culprit.expected} つ入れて`}、前後の行とそろえましょう。`,
    };
  }
  let prev = at - 1;
  while (prev >= 0 && !all[prev].trim()) prev--;
  const shown = [];
  if (prev >= 0) shown.push(`   ${prev + 1} 行目｜${showIndent(all[prev])}`);
  shown.push(target.trim()
    ? `   ${info.line} 行目｜${showIndent(target)}　← 字下げ ${indentWidth(target)} 文字`
    : `   ${info.line} 行目｜（中身の行がありません）`);
  shown.push(INDENT_LEGEND);
  const message = info.message || '';
  const after = message.match(/after '?(\w+)'? statement on line (\d+)/)
    || (message.match(/after (function|class) definition on line (\d+)/) || []).slice(0, 3).map((v, i) => (i === 1 ? { function: 'def', class: 'class' }[v] : v));
  const realAfter = after && after.length >= 3 && after[1] ? after : null;
  let hint;
  if (info.type === 'TabError' || /\t/.test(target.match(/^[ \t]*/)[0])) {
    hint = 'タブ（→）と空白（·）がまざっています。字下げは空白 4 つずつにそろえましょう（「字下げ」ボタンでも直せます）。';
  } else if (realAfter || /expected an indented block/.test(message)) {
    const head = realAfter ? `${realAfter[2]} 行目の ${realAfter[1]} ` : '上の「:」で終わる行';
    hint = `${head}の中身は、その行より 4 文字（····、Tab キー 1 回）下げて書きます。中身が何も無いなら pass と書きます。`;
  } else if (/unexpected indent/.test(message)) {
    hint = `前の行より深く下げています（· の数をくらべましょう）。前の行が「:」で終わっていないなら、同じ深さにそろえます。`;
  } else if (/unindent does not match/.test(message)) {
    // 上にある行の字下げのうち、この行のすぐ浅い方と深い方を、選べる 2 つとして言う
    const width = indentWidth(target);
    const levels = [...new Set(all.slice(0, at).filter(l => l.trim()).map(indentWidth))].sort((a, b) => a - b);
    const lower = levels.filter(v => v < width).pop();
    const upper = levels.find(v => v > width);
    const choices = [lower, upper].filter(v => v !== undefined).map(v => `${v} 文字（· が ${v} 個）`).join(' か ');
    hint = `上のどの行の字下げともそろっていません（いまは · が ${width} 個）。`
      + (choices ? `前の中身に入れるなら上の行と同じだけ、外に出すなら浅い方にそろえて、${choices}にします。` : '· の数を 4 の倍数にそろえましょう。');
  } else {
    hint = '字下げ（行のはじめの空白）がずれています。· の数をそろえましょう。同じまとまりの行は、同じ数だけ下げます。';
  }
  return { shown, hint };
}

/** メッセージの中身を見て、もっと近いヒントがあれば選ぶ（コードがあれば、名前や行を指して言う） */
function detailedHint(info, code = '') {
  const message = info.message || '';
  const lines = String(code).replace(/\r/g, '').split('\n');
  const line = info.line ? (lines[info.line - 1] || '') : '';
  const name = info.name || guessName(info);

  if (info.type === 'SyntaxError') {
    if (/Missing parentheses in call to 'print'/.test(message)) {
      return 'print のうしろの中身は ( ) で囲みます。print("こんにちは") のように書きます。';
    }
    if (/unterminated (triple-quoted )?string literal/.test(message)) {
      return '文字のおわりの引用符がありません。はじめと同じ引用符（" なら "、\' なら \'）で閉じます。'
        + '文字の中に \' が入るとき（It\'s など）は、外側を " " で囲みます。';
    }
    if (/was never closed/.test(message)) {
      return '開いたかっこを閉じていません。( の数と ) の数をそろえます（いちばん後ろの ) を忘れやすいところです）。';
    }
    if (/unmatched '[)\]}]'/.test(message)) {
      return '閉じるかっこが多すぎます。( の数と ) の数をそろえます。';
    }
    if (/'return' outside function/.test(message)) {
      return 'return は、def で作った関数の中身（4 文字下げた行）でだけ使えます。';
    }
    if (/f-string: empty expression/.test(message)) {
      return 'f"…" の { } の中が空です。{ } の中には、入れたい名前を書きます（f"{name}さん"）。';
    }
    if (/f-string/.test(message)) {
      return 'f"…" の中の { } が閉じていません。f"{名前}さん" のように、{ と } を組にして書きます。';
    }
    if (/Perhaps you forgot a comma/.test(message)) {
      return 'かっこの中のもののあいだに , （カンマ）を忘れていませんか。print("a", "b", 1) のように区切ります。';
    }
    if (/invalid decimal literal/.test(message)) {
      return '数のすぐうしろに文字が続いています。かけ算なら 2 * x と * を書きます。名前は数字から始められません。';
    }
    if (/expected ':'/.test(message)) {
      return 'if・for・while・def の行は、おわりに「:」（コロン）が要ります。: は『け』のキーです。';
    }
    const keyword = line.match(/^\s*(class|def|if|for|while|in|is|and|or|not|return|import|from|as|with|try|pass|break|continue|lambda|global|del|True|False|None)\s*=(?!=)/);
    if (keyword) {
      return `「${keyword[1]}」は Python が使う言葉なので、名前（変数）にはできません。ちがう名前にします。`;
    }
    if (/^\s*(elif|else)\b/.test(line)) {
      return 'elif や else は、すぐ上に同じ深さ（同じ列）の if が要ります。字下げがそろっているかを見ましょう。';
    }
  }

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
    if (/NoneType/.test(message)) {
      if (/=\s*[A-Za-z_]\w*\.(sort|append|reverse|insert|remove|extend|clear)\(/.test(code || '')) {
        return 'sort()・append()・reverse() などは、リストそのものを書きかえるだけで、値を返しません（None になります）。'
          + 'b = a.sort() ではなく、a.sort() のあとで a を使います。';
      }
      return '関数が値を返していません（None になっています）。関数の中で、print ではなく return で答えを返します。';
    }
    if (/'(int|float)' object is not iterable/.test(message)) {
      return '数そのものは、くり返しに使えません。10 回くり返すなら for i in range(10): と書きます。';
    }
    if (/has no len\(\)/.test(message)) {
      return 'len() は、文字列やリストの長さ（個数）を数えるものです。数には使えません。';
    }
    if (/can't multiply sequence by non-int/.test(message)) {
      return '文字（文字列）どうしはかけ算できません。数として計算するなら int() で数に直します。';
    }
    if (/can only concatenate str|unsupported operand type\(s\) for \+: ('(int|float)' and 'str'|'str' and '(int|float)')/.test(message)) {
      return concatHint(line, code, message);
    }
    if (/unsupported operand type\(s\) for [-*/%]+: ('str' and '(int|float)'|'(int|float)' and 'str')/.test(message)) {
      return '文字（文字列）と数では計算できません。input() で受け取った値なら、int() で数に直してから計算します。';
    }
    if (/not callable/.test(message)) {
      return 'これは呼び出せるものではありません。変数の名前と関数の名前が同じになっていませんか？';
    }
    if (/not subscriptable/.test(message)) {
      return 'これは [ ] で取り出せる種類ではありません。リストや文字列かどうか確かめましょう。';
    }
  }

  if (info.type === 'ValueError' && /invalid literal for int/.test(message)) {
    if (/: ''$/.test(message)) return '何も入力しないで Enter を押したようです。数を打ってから Enter を押します。';
    if (/: '-?\d+\.\d*'$/.test(message)) return '小数（3.5 など）は int() で整数にできません。小数のまま使うなら float() を使います。';
    return '数字でない文字を int() で数値にしようとしています。入力した中身に、文字や記号が入っていないかを確かめましょう。';
  }

  if (info.type === 'NameError' && name) {
    return nameHint(name, line, code);
  }

  if (info.type === 'AttributeError') {
    if (/'push'/.test(message)) return 'Python のリストに足すのは append です。a.append(4) のように書きます。';
    if (/'length'/.test(message)) return 'Python では、長さ（個数）は len(a) で調べます。';
  }

  if (info.type === 'ModuleNotFoundError' && name) {
    const near = closeTypo(name, ['math', 'random', 'time', 'statistics', 'datetime', 'itertools', 'collections', 'string']);
    if (near) return `「${name}」は「${near}」の打ちまちがいかもしれません。import ${near} と書きます。`;
  }

  return '';
}

/** 文字列と数を + でつなごうとしたときの、名前を指した案内 */
function concatHint(line, code, message) {
  const around = [...new Set([...line.matchAll(/([A-Za-z_\p{L}][\w\p{L}]*)\s*\+|\+\s*([A-Za-z_\p{L}][\w\p{L}]*)/gu)]
    .map(m => m[1] || m[2]))].filter(n => !['str', 'int', 'float', 'print'].includes(n));
  const fromInput = around.find(n => new RegExp(`^\\s*${n}\\s*=\\s*input\\(`, 'mu').test(code));
  if (fromInput) {
    return `${fromInput} は input() で受け取った文字です。数として計算するなら int(${fromInput}) にします（はじめから ${fromInput} = int(input()) と書いてもよい）。`;
  }
  const number = around.find(n => !new RegExp(`^\\s*${n}\\s*=\\s*(input\\(|["'f])`, 'mu').test(code));
  if (number && /can only concatenate str/.test(message)) {
    return `文字と数は + でつなげません。${number} が数なら、str(${number}) で文字に直してからつなぎます。print("a", ${number}) のように , で区切る書き方もあります。`;
  }
  return '文字と数は + でつなげません。数を文字に直すなら str()、文字を数に直すなら int() を使います。';
}

/** 「その名前はない」ときの、場面に合わせた案内 */
function nameHint(name, line, code) {
  // // のうしろの名前：// は Python では割り算なので、コメントのつもりの字が名前になった
  {
    const at = line.indexOf(name);
    const kinds = scanLine(line);
    const slashes = line.indexOf('//');
    // 10 // x のような本当の割り算は除く。// のうしろが日本語や、言葉が並んだ文のときだけ
    const rest = slashes >= 0 ? line.slice(slashes + 2).trim() : '';
    const looksLikeNote = /[^\x00-\x7f]/.test(rest)
      || /^[A-Za-z_]\w*\s+[A-Za-z_]/.test(rest.replace(/\b(and|or|not|in|is|if|else)\b/g, '+'))
      || !line.slice(0, slashes).trim();
    if (at > 0 && slashes >= 0 && slashes < at && kinds[slashes] === 'code' && looksLikeNote) {
      return '// は Python では割り算（切り捨て）です。メモ（コメント）は # で書きます。';
    }
  }
  // 日本語の名前：文字として出したかった（引用符をわすれた）か、日本語入力のまま打った
  if (/[぀-ヿ㐀-鿿]/.test(name)) {
    if (/^[぀-ゟ]+[a-z]+$/.test(name)) {
      return `「${name}」と打たれています。日本語入力がオンのまま打ったかもしれません。キーボードの『半角/全角』（Mac・Chromebook は『英数』）で切りかえてから打ち直しましょう。`
        + `文字として出したいなら、print("${name}") のように " " で囲みます。`;
    }
    return `「${name}」を文字として出したいなら、" " で囲みます。print("${name}") のように書きます。`;
  }
  const typo = suggestName(name, code);
  if (typo) return `「${name}」という名前はありません。「${typo}」の打ちまちがいかもしれません（下のボタンで直せます）。`;
  const js = { console: 'Python では、表示は print( ) です。', null: 'Python では、何もないことを None と書きます。',
    undefined: 'Python では、何もないことを None と書きます。', Math: 'Math.random() などは Python では random()、Math.max は max() のように書きます。',
    let: 'Python では let を書かずに、x = 0 のように名前に入れるだけです。', var: 'Python では var を書かずに、x = 0 のように名前に入れるだけです。' };
  if (js[name]) return js[name];
  if (name === 'mousePressed' || name === 'keyPressed') {
    return `押されているかどうかは ${name === 'mousePressed' ? 'mouseIsPressed' : 'keyIsPressed'} で調べます。${name} は「押した瞬間に呼ばれる関数」の名前です。`;
  }
  // ほかのどこにも出てこない英字の名前：文字として出したかったのかもしれない
  const count = (String(code).match(new RegExp(`(?<![\\w"'])${name}(?![\\w"'])`, 'g')) || []).length;
  const tail = count <= 1 ? `文字をそのまま出したいなら、print("${name}") のように " " で囲みます。` : '';
  return `「${name}」という名前は、まだ作られていません。打ちまちがいがないか、使う行より上で「${name} = …」と作っているかを見ましょう。${tail}`;
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
