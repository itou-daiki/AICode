// module/symbolbar.js - コードの区画の下に置く「記号ボタン」の列
//
// キーボードに慣れていない人は、: や ( や " がどのキーにあるのかで手が止まる。
// よく使う記号を大きなボタンにして、押せばカーソルの位置に入るようにする。
// 字下げ（1 段下げる・もどす）と改行もボタンにしておく。
// ボタンを押してもエディタからカーソルが外れないので、そのまま続けて打てる。
//
// 01 コーディング・03 スケッチで使う。02 レッスンからも同じ形で使える。
//   import { attachSymbolBar } from './symbolbar.js';
//   attachSymbolBar(editor, document.getElementById('code-symbols'));

/**
 * 記号ボタンの表
 * [見た目, 入れる字, 説明, 組の閉じ側（あれば、間にカーソルを置く）]
 */
const SYMBOLS = [
  [':', ':', 'コロン。if・for・def の行の終わりに付けます'],
  ['(', '(', 'かっこ。( ) の組で入り、間にカーソルが入ります', ')'],
  [')', ')', '閉じかっこ'],
  ['"', '"', 'ダブルクォート。" " の組で入り、間に文字を書けます', '"'],
  ["'", "'", "シングルクォート。' ' の組で入ります", "'"],
  ['[', '[', '角かっこ。[ ] の組で入ります（リスト）', ']'],
  [']', ']', '閉じ角かっこ'],
  ['_', '_', 'アンダーバー。名前の中で、ことばをつなぎます'],
  ['=', '=', 'イコール 1 つ。左の名前に右の値を入れます'],
  ['==', '==', 'イコール 2 つ。同じかどうかをくらべます'],
  ['+', '+', 'たす'],
  ['-', '-', 'ひく'],
  ['*', '*', 'かける'],
  ['/', '/', 'わる'],
  ['<', '<', 'より小さい'],
  ['>', '>', 'より大きい'],
  ['#', '#', 'コメント。ここから行の終わりまでは動きません'],
  [',', ',', 'カンマ。値と値の区切り'],
];

/** 字下げと改行のボタン [見た目, CodeMirror の命令, 説明] */
const ACTIONS = [
  ['→ 1 段下げる', 'indentMore', 'カーソルのある行を、4 文字ぶん右へ下げます'],
  ['← 1 段もどす', 'indentLess', 'カーソルのある行を、4 文字ぶん左へもどします'],
  ['↵ 改行', 'newlineAndIndent', '次の行へ進みます（: のあとなら、自動で 1 段下がります）'],
];

/** 日本語のキーボード（JIS 配列）での打ち方 */
const GUIDE = [
  [':', '「け」のキー'],
  ['"', 'Shift キーを押しながら 2'],
  ["'", 'Shift ＋ 7'],
  ['( )', 'Shift ＋ 8・9'],
  ['#', 'Shift ＋ 3'],
  ['_', 'Shift ＋「ろ」'],
  ['=', 'Shift ＋「ほ」'],
  ['+', 'Shift ＋「れ」'],
  ['[ ]', '「゜」「む」のキー'],
  ['< >', 'Shift ＋「ね」「る」'],
];

/**
 * 記号をカーソルの位置に入れる
 * 組になる記号は両側を入れて、間にカーソルを置く。範囲を選んでいたら、その範囲をはさむ。
 * @param {object} cm CodeMirror
 * @param {string} open 入れる字
 * @param {string} [close] 組の閉じ側
 */
function insertSymbol(cm, open, close) {
  if (!close) {
    cm.replaceSelection(open, 'end', '+input');
    return;
  }
  const selected = cm.getSelection();
  if (selected) {
    cm.replaceSelection(open + selected + close, 'around', '+input');
    return;
  }
  cm.replaceSelection(open + close, 'end', '+input');
  const at = cm.getCursor();
  cm.setCursor({ line: at.line, ch: at.ch - close.length });
}

/** ボタンを 1 つ作る */
function makeKey(text, title, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', `${text}：${title}`);
  // 押してもエディタからカーソルを外さない（外れると、続けて打てない）
  button.addEventListener('mousedown', (e) => e.preventDefault());
  return button;
}

/** 記号の打ち方の説明を作る */
function makeGuide() {
  const guide = document.createElement('div');
  guide.className = 'symbol-guide';
  guide.hidden = true;

  const list = document.createElement('ul');
  for (const [symbol, how] of GUIDE) {
    const item = document.createElement('li');
    const key = document.createElement('code');
    key.textContent = symbol;
    item.append(key, ` は ${how}`);
    list.appendChild(item);
  }
  const note = document.createElement('p');
  note.textContent = '日本語入力がオンのときは「半角/全角」キー（Mac・Chromebook は「英数」）で切りかえます。';
  guide.append(list, note);
  return guide;
}

/**
 * エディタの下に記号ボタンの列を付ける
 * @param {object} cm CodeMirror
 * @param {HTMLElement} container ボタンを置く場所（コードの区画の、エディタのすぐ下）
 * @returns {HTMLElement|null} 作った列
 */
export function attachSymbolBar(cm, container) {
  if (!cm || !container) return null;

  const bar = document.createElement('div');
  bar.className = 'symbol-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '記号を入れるボタン');

  const keys = document.createElement('div');
  keys.className = 'symbol-bar-keys';

  const run = (action) => {
    if (cm.getOption('readOnly')) return;
    action();
    cm.focus();
  };

  for (const [text, insert, title, close] of SYMBOLS) {
    const button = makeKey(text, title, 'symbol-key');
    button.addEventListener('click', () => run(() => insertSymbol(cm, insert, close)));
    keys.appendChild(button);
  }
  for (const [text, command, title] of ACTIONS) {
    const button = makeKey(text, title, 'symbol-key is-wide');
    button.addEventListener('click', () => run(() => cm.execCommand(command)));
    keys.appendChild(button);
  }

  const guide = makeGuide();
  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'symbol-help';
  help.textContent = '？ 記号の打ち方';
  help.setAttribute('aria-expanded', 'false');
  help.addEventListener('mousedown', (e) => e.preventDefault());
  help.addEventListener('click', () => {
    guide.hidden = !guide.hidden;
    help.setAttribute('aria-expanded', String(!guide.hidden));
    // 説明の分だけエディタの高さが変わるので、測り直してもらう
    cm.refresh();
  });
  keys.appendChild(help);

  bar.append(keys, guide);
  container.appendChild(bar);
  dockAboveKeyboard(cm, bar, container, guide);
  cm.refresh();
  return bar;
}

/**
 * iPad などで画面のキーボードが出ているあいだは、記号ボタンの列をキーボードのすぐ上に出す。
 * そのままだとエディタの下にある列がキーボードに隠れて、打っている最中に使えない。
 * （キーボードの分だけ visualViewport が小さくなることで、出ているかどうかを知る）
 * @param {object} cm
 * @param {HTMLElement} bar
 * @param {HTMLElement} container
 * @param {HTMLElement} guide
 */
function dockAboveKeyboard(cm, bar, container, guide) {
  const view = window.visualViewport;
  if (!view) return;
  let docked = false;

  const place = () => {
    bar.style.left = `${view.offsetLeft}px`;
    bar.style.width = `${view.width}px`;
    bar.style.top = `${view.offsetTop + view.height - bar.offsetHeight}px`;
  };
  const undock = () => {
    if (!docked) return;
    docked = false;
    bar.classList.remove('is-docked');
    bar.style.left = bar.style.width = bar.style.top = '';
    container.style.minHeight = '';
    cm.refresh();
  };
  const update = () => {
    const keyboard = window.innerHeight - view.height > 120;
    if (!keyboard || !cm.hasFocus()) { undock(); return; }
    if (!docked) {
      docked = true;
      // 列が抜けた分だけ下の欄が上に詰まらないよう、元の高さを残しておく
      container.style.minHeight = `${container.offsetHeight}px`;
      guide.hidden = true;
      bar.classList.add('is-docked');
    }
    place();
  };

  view.addEventListener('resize', update);
  view.addEventListener('scroll', () => { if (docked) place(); });
  cm.on('focus', update);
  // ボタンを押した瞬間にもフォーカスが一瞬外れることがあるので、少し待ってから確かめる
  cm.on('blur', () => setTimeout(update, 150));
}
