// module/stepper.js
// Python Tutor のような「1行ずつ実行を追える」機能。
//
// 仕組みは記録＋再生。まず sys.settrace でプログラムを最後まで一気に走らせ、
// 各行での「行番号・変数・そこまでの出力」を記録しておく。
// あとはその記録を前後にたどるだけなので、戻る操作も一瞬でできる。
//
// 変数は「型」と「中身の要素」まで記録するので、
// リストや辞書がどう変わっていくかを目で追える。

/** 記録するステップ数の上限。ここに達したら実行そのものを打ち切る */
export const MAX_STEPS = 3000;

/** 記録にかけてよい時間の上限（秒）。終わらないコードで画面が固まらないようにする */
export const MAX_SECONDS = 6;

/** Pyodide 側に一度だけ流し込むトレーサーの定義 */
const TRACER_SOURCE = `
import io, json, sys, time, types


class _EasycodeStop(BaseException):
    """記録の上限に達したので実行を打ち切る合図。

    BaseException にしているのは、学習者のコードに
    「except Exception:」があっても、そこで止まらずに抜けるため。
    """
    pass


_EASYCODE_FILE = '<easycode>'
_EASYCODE_MAX_ITEMS = 60

_EASYCODE_TYPE_LABELS = {
    'int': '整数', 'float': '小数', 'str': '文字列', 'bool': '真偽値',
    'list': 'リスト', 'dict': '辞書', 'tuple': 'タプル', 'set': '集合',
    'range': '範囲', 'NoneType': 'なし',
}


def _easycode_repr(value, limit=120):
    try:
        text = repr(value)
    except Exception:
        return '<表示できません>'
    return text if len(text) <= limit else text[:limit] + '…'


def _easycode_visible(name, value):
    """学習者に見せたい変数だけを残す"""
    if name.startswith('_'):
        return False
    if isinstance(value, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType)):
        return False
    if isinstance(value, type):
        return False
    return True


def _easycode_items(value):
    """リストや辞書の中身を [[キー, 表示], ...] の形で取り出す"""
    try:
        if isinstance(value, dict):
            pairs = list(value.items())[:_EASYCODE_MAX_ITEMS]
            return [[_easycode_repr(k, 40), _easycode_repr(v, 60)] for k, v in pairs]
        if isinstance(value, (list, tuple)):
            return [[str(i), _easycode_repr(v, 60)] for i, v in enumerate(value[:_EASYCODE_MAX_ITEMS])]
        if isinstance(value, (set, frozenset)):
            return [['', _easycode_repr(v, 60)] for v in list(value)[:_EASYCODE_MAX_ITEMS]]
    except Exception:
        return None
    return None


def _easycode_describe(value):
    kind = type(value).__name__
    info = {
        'type': kind,
        'label': _EASYCODE_TYPE_LABELS.get(kind, kind),
        'repr': _easycode_repr(value),
    }
    try:
        if isinstance(value, (list, tuple, dict, set, frozenset, str)):
            info['size'] = len(value)
    except Exception:
        pass
    items = _easycode_items(value)
    if items is not None:
        info['items'] = items
    return info


def _easycode_scope(frame):
    variables = {}
    scopes = [frame.f_globals]
    if frame.f_locals is not frame.f_globals:
        scopes.append(frame.f_locals)
    for scope in scopes:
        for name, value in scope.items():
            if _easycode_visible(name, value):
                variables[name] = _easycode_describe(value)
    return variables


def _easycode_trace(source, inputs_json, max_steps, max_seconds=6.0):
    values = iter(json.loads(inputs_json))
    out = io.StringIO()
    steps = []
    state = {'stopped': False, 'start': time.time(), 'missing_input': False}

    def fake_input(prompt=''):
        try:
            value = next(values)
        except StopIteration:
            # 用意された値が足りない。空文字のまま黙って続けると
            # 「なぜか変数がからっぽ」という一番わかりにくい形で現れるので、
            # 足りなかったことを覚えておいて、あとで画面に出す。
            state['missing_input'] = True
            value = ''
        out.write(str(prompt) + str(value) + '\\n')
        return value

    namespace = {'__name__': '__main__', 'input': fake_input}

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != _EASYCODE_FILE:
            return None
        # いちど上限に達したら、実行そのものを打ち切る。
        # ここで止めないと「while True:」のようなコードで画面が固まってしまう。
        if state['stopped']:
            raise _EasycodeStop()
        if event in ('line', 'return'):
            if len(steps) >= max_steps or (time.time() - state['start']) > max_seconds:
                state['stopped'] = True
                raise _EasycodeStop()
            steps.append({
                'line': frame.f_lineno,
                'event': event,
                'func': frame.f_code.co_name,
                'vars': _easycode_scope(frame),
                'output': out.getvalue(),
            })
        return tracer

    error = None
    stdout = sys.stdout
    try:
        compiled = compile(source, _EASYCODE_FILE, 'exec')
    except SyntaxError as e:
        return json.dumps({
            'steps': [],
            'error': '文法エラー: {} ({} 行目)'.format(e.msg, e.lineno),
            'truncated': False,
        })

    sys.stdout = out
    sys.settrace(tracer)
    try:
        exec(compiled, namespace)
    except _EasycodeStop:
        pass
    except Exception as e:
        error = '{}: {}'.format(type(e).__name__, e)
    finally:
        sys.settrace(None)
        sys.stdout = stdout

    steps.append({
        'line': steps[-1]['line'] if steps else 1,
        'event': 'end',
        'func': '<module>',
        'vars': {k: _easycode_describe(v) for k, v in namespace.items() if _easycode_visible(k, v)},
        'output': out.getvalue(),
    })

    return json.dumps({'steps': steps, 'error': error, 'truncated': state['stopped'], 'missing_input': state['missing_input']})
`;

let tracerReady = false;

/**
 * トレーサーを Pyodide に登録する（初回のみ）
 * @param {object} pyodide
 */
function ensureTracer(pyodide) {
  if (tracerReady) return;
  pyodide.runPython(TRACER_SOURCE);
  tracerReady = true;
}

/**
 * コードを最後まで走らせて、1行ごとの記録を作る
 * @param {object} pyodide Pyodide インスタンス
 * @param {string} code Python のソースコード
 * @param {string[]} inputs input() が使う値（上から順に使われる）
 * @returns {Promise<{steps: object[], error: string|null, truncated: boolean}>}
 */
export async function recordTrace(pyodide, code, inputs = []) {
  ensureTracer(pyodide);
  const trace = pyodide.globals.get('_easycode_trace');
  try {
    return JSON.parse(trace(code, JSON.stringify(inputs), MAX_STEPS, MAX_SECONDS));
  } finally {
    if (trace && trace.destroy) trace.destroy();
  }
}

/**
 * ステップ間で値が変わった変数の名前を返す
 * @param {object|undefined} previous 前のステップの変数
 * @param {object} current 今のステップの変数
 * @returns {Set<string>}
 */
export function changedVariables(previous, current) {
  const changed = new Set();
  if (!previous) {
    Object.keys(current).forEach(name => changed.add(name));
    return changed;
  }
  for (const [name, info] of Object.entries(current)) {
    if (!previous[name] || previous[name].repr !== info.repr) changed.add(name);
  }
  return changed;
}

/**
 * リストや辞書のうち、値が変わった要素のキーを返す
 * @param {object|undefined} previousInfo
 * @param {object} info
 * @returns {Set<string>}
 */
export function changedItems(previousInfo, info) {
  const changed = new Set();
  if (!info.items) return changed;
  const before = new Map((previousInfo && previousInfo.items) || []);

  for (const [key, value] of info.items) {
    if (!before.has(key) || before.get(key) !== value) changed.add(key);
  }
  return changed;
}

/**
 * その行で使われている名前を拾う（表示を光らせるために使う）
 * @param {string} lineText ソースコードの1行
 * @returns {Set<string>}
 */
export function namesInLine(lineText) {
  const names = new Set();
  if (!lineText) return names;
  // 文字列の中身は見ない
  const withoutStrings = lineText.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, ' ');
  for (const match of withoutStrings.matchAll(/[A-Za-z_]\w*/g)) {
    names.add(match[0]);
  }
  return names;
}
