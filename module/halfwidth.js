// module/halfwidth.js
// 日本語入力のまま打った全角の記号・数字を、エディタの中で扱うところ。
//
//   attachHalfWidth(cm) … 打ったそばから半角に直す（文字列とコメントの中は残す）。
//                         直した字は一瞬光らせ、残っている全角には印をつける
//   addHalfWidthControl() … 「自動で半角にする」を切りかえる欄
//
// Python は全角の（ ）や ： を「invalid character」としか言わない。
// 生徒はどこが悪いのか見つけられないので、打った時点で直し、直せないものは目に見える形で示す。

import { toHalfWidth } from './pyfix.js';
import { toast, safeStorage } from './ui.js';

const AUTO_KEY = 'easycode_auto_halfwidth';
let autoOn = safeStorage.get(AUTO_KEY) !== '0';
let told = false;

/**
 * 全角に印をつける重ね書き。半角に直したときに変わる字だけに印をつける
 * （直し方と印のつけ方を同じ toHalfWidth で決めるので、食いちがわない）。
 * CodeMirror の重ね書きは状態を持てないので、行ごとの結果を 1 つだけ覚えて使い回す。
 */
let memoLine = null;
let memoFixed = '';
function fixedOf(line) {
  if (line !== memoLine) { memoLine = line; memoFixed = toHalfWidth(line); }
  return memoFixed;
}

const fullWidthOverlay = {
  token(stream) {
    const line = stream.string;
    const fixed = fixedOf(line);
    if (line[stream.pos] !== fixed[stream.pos]) {
      stream.next();
      return 'fullwidth';
    }
    // 次に印をつける字の手前まで、まとめて進める
    let next = stream.pos + 1;
    while (next < line.length && line[next] === fixed[next]) next++;
    stream.pos = next;
    return null;
  },
};

/** 直したところを一瞬光らせる */
function flash(cm, line, indexes) {
  const marks = indexes.map(ch => cm.markText(
    { line, ch }, { line, ch: ch + 1 }, { className: 'cm-halfwidth-flash' },
  ));
  setTimeout(() => marks.forEach(mark => mark.clear()), 1200);
}

/** 1 行を半角にそろえる。置きかえは 1 字ずつなので、カーソルの位置は動かない */
function fixLine(cm, line) {
  const text = cm.getLine(line);
  if (text === undefined || !/[^\x00-\x7F]/.test(text)) return [];
  // 何行にもわたる文字列（""" … """）の中の行は、文章なので直さない
  const before = line > 0 ? cm.getStateAfter(line - 1, true) : null;
  if (before && before.tokenize && before.tokenize.isString) return [];
  const fixed = toHalfWidth(text, { typing: true });
  if (fixed === text) return [];
  const changed = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== fixed[i]) changed.push(i);
  }
  cm.operation(() => {
    for (const i of changed) {
      // '+input' にしておくと、打った字と一緒に「元に戻す」1 回で戻る
      cm.replaceRange(fixed[i], { line, ch: i }, { line, ch: i + 1 }, '+input');
    }
  });
  flash(cm, line, changed);
  return changed.map(i => text[i]);
}

function fixLines(cm, from, to) {
  if (!autoOn) return;
  const fixed = [];
  for (let line = from; line <= to; line++) fixed.push(...fixLine(cm, line));
  if (fixed.length && !told) {
    told = true;
    const shown = [...new Set(fixed)].slice(0, 4).map(c => (c === '　' ? '全角の空白' : `「${c}」`)).join('');
    toast(`全角の ${shown} を半角に直しました。プログラムの記号・数字は半角で書きます（文字列とコメントの中はそのまま）。`, 5200);
  }
}

/**
 * エディタに付ける
 * @param {object} cm CodeMirror
 */
export function attachHalfWidth(cm) {
  cm.addOverlay(fullWidthOverlay);

  // 打った字・貼りつけた字を直す。日本語入力の変換中（*compose）は待つ
  cm.on('inputRead', (_, change) => {
    if (change.origin === '*compose' || cm.display.input.composing) return;
    fixLines(cm, change.from.line, change.from.line + change.text.length - 1);
  });
  // 変換を確定したとき。確定の字は inputRead に来ないことがあるので、ここでも直す
  // タブレット（contenteditable の入力）では、確定した字が届くのが少し遅れるので待つ
  cm.getInputField().addEventListener('compositionend', () => {
    // 待っているあいだに Enter で次の行へ移っても、確定した行を直す
    const line = cm.getCursor().line;
    setTimeout(() => fixLines(cm, line, line), 120);
  });

  // 印の上に指を置くと、何が悪いのかを出す
  cm.getWrapperElement().addEventListener('mouseover', (e) => {
    const mark = e.target.closest && e.target.closest('.cm-fullwidth');
    if (mark && !mark.title) mark.title = '全角の字です。プログラムでは半角で書きます。';
  });
}

/**
 * 「全角を自動で半角にする」を切りかえる欄を作る
 * @param {HTMLElement} container
 */
export function addHalfWidthControl(container) {
  if (!container) return;
  const label = document.createElement('label');
  label.className = 'check-field';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = autoOn;
  box.addEventListener('change', () => {
    autoOn = box.checked;
    safeStorage.set(AUTO_KEY, autoOn ? '1' : '0');
  });
  label.append(box, document.createTextNode('全角の記号・数字を、打ったそばから半角にする'));
  container.appendChild(label);
}
