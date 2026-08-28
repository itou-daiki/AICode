// module/pyrun.js
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

/** Pyodide に一度だけ流し込む実行係 */
const RUNNER_SOURCE = `
import ast, io, json, sys, time

_EASYCODE_FILE = ${JSON.stringify(USER_FILE)}
_EASYCODE_TIMEOUT_MESSAGE = ${JSON.stringify(TIMEOUT_MESSAGE)}
_easycode_state = {'deadline': 0.0, 'ticks': 0}


def _easycode_watchdog(frame, event, arg):
    """終わらないコードを打ち切るための見張り"""
    _easycode_state['ticks'] += 1
    if _easycode_state['ticks'] % 200 == 0 and time.time() > _easycode_state['deadline']:
        raise TimeoutError(_EASYCODE_TIMEOUT_MESSAGE)
    return _easycode_watchdog


class _EasycodeOut:
    """print() の行き先。画面にも出しつつ、あとで使えるようにためておく"""

    def __init__(self, element=None):
        self.buffer = io.StringIO()
        self.element = element

    def write(self, text):
        self.buffer.write(text)
        if self.element is not None:
            self.element.textContent += text
        return len(text)

    def flush(self):
        pass


def _easycode_error_info(exc):
    """例外から「種類・メッセージ・何行目か」を取り出す"""
    info = {'type': type(exc).__name__, 'message': str(exc), 'line': None, 'name': None}

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


async def _easycode_run(code, element=None, seconds=10.0, use_globals=False):
    out = _EasycodeOut(element)
    info = None
    orig_out, orig_err = sys.stdout, sys.stderr

    try:
        compiled = compile(code, _EASYCODE_FILE, 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    except SyntaxError as exc:
        return json.dumps({'output': '', 'error': _easycode_error_info(exc)})

    # 描画モードは p5 の関数や setup() / draw() を残したいので、
    # そのときだけ共通の globals をそのまま使う。
    if use_globals:
        namespace = globals()
    else:
        namespace = {'__name__': '__main__'}
        helper = globals().get('custom_input')
        if helper is not None:
            namespace['custom_input'] = helper

    _easycode_state['deadline'] = time.time() + seconds
    _easycode_state['ticks'] = 0

    sys.stdout = sys.stderr = out
    sys.settrace(_easycode_watchdog)
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
        sys.settrace(None)
        sys.stdout, sys.stderr = orig_out, orig_err

    return json.dumps({'output': out.buffer.getvalue(), 'error': info})
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
 * @returns {Promise<{output: string, error: object|null}>}
 */
export async function runUserCode(pyodide, code, options = {}) {
  ensureRunner(pyodide);
  const { element = null, seconds = RUN_LIMIT_SECONDS, useGlobals = false } = options;
  const run = pyodide.globals.get('_easycode_run');
  try {
    const json = await run(code, element, seconds, useGlobals);
    return JSON.parse(json);
  } finally {
    if (run && run.destroy) run.destroy();
  }
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
  UnboundLocalError: '関数の中で、その変数を作る前に使っています。',
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
  if (info.type === 'TimeoutError') return `⏱ ${info.message}`;

  const lines = [];
  lines.push(info.line ? `❌ ${info.line} 行目でエラーが起きました` : '❌ エラーが起きました');

  if (info.line && code) {
    const target = code.split('\n')[info.line - 1];
    if (target && target.trim()) lines.push(`   ${target.trim()}`);
  }

  lines.push(`${info.type}: ${info.message}`);

  const hint = detailedHint(info) || HINTS[info.type];
  if (hint) {
    const name = info.name || guessName(info);
    lines.push(`👉 ${hint.replace('{name}', name || 'その名前')}`);
  }

  return lines.join('\n');
}

/** メッセージの中身を見て、もっと近いヒントがあれば選ぶ */
function detailedHint(info) {
  const message = info.message || '';

  if (info.type === 'TypeError') {
    if (/missing \d+ required|takes \d+ positional|expected \d+ argument/.test(message)) {
      return 'かっこの中に書く値の数が足りていません。circle(x, y, 大きさ) のように、いくつ必要か確かめましょう。';
    }
    if (/takes from|but \d+ were given|positional arguments? but/.test(message)) {
      return 'かっこの中に書いた値が多すぎます。いくつ必要か確かめましょう。';
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
