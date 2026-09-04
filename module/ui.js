import { iconHtml, setIconLabel } from './icons.js';
// module/ui.js
// 画面まわりの共通部品。全モードで同じ操作感になるようにまとめている。
//
//   confirmDialog() … window.confirm の代わりになる自前のダイアログ
//   toast()         … 右下に一言だけ出すお知らせ
//   initSidebar()   … 開閉できるサイドバー（既定は閉じた状態）
//   initTabs()      … ステージの切り替えタブ
//   initMaximize()  … パネルの拡大表示

/* ============================================================
 * 1. ダイアログ
 * ========================================================== */

let dialogElement = null;

/** ダイアログの土台を1つだけ作る */
function ensureDialog() {
  if (dialogElement) return dialogElement;

  dialogElement = document.createElement('dialog');
  dialogElement.className = 'dialog';
  dialogElement.innerHTML = `
    <form method="dialog">
      <div class="dialog-body">
        <h3 data-role="title"></h3>
        <p data-role="message"></p>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-quiet" value="cancel" data-role="cancel">取り消し</button>
        <button class="btn btn-danger" value="ok" data-role="ok">実行する</button>
      </div>
    </form>`;
  document.body.appendChild(dialogElement);
  return dialogElement;
}

/**
 * 確認ダイアログを出す
 * @param {object} options
 * @param {string} options.title 見出し
 * @param {string} [options.message] 説明
 * @param {string} [options.okLabel] 実行ボタンの文言
 * @param {string} [options.tone] 'danger'（既定）か 'primary'
 * @returns {Promise<boolean>} OK が押されたか
 */
export function confirmDialog({ title, message = '', okLabel = '実行', tone = 'danger' }) {
  const dialog = ensureDialog();
  dialog.querySelector('[data-role="title"]').textContent = title;
  dialog.querySelector('[data-role="message"]').textContent = message;

  const ok = dialog.querySelector('[data-role="ok"]');
  ok.textContent = okLabel;
  ok.className = `btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`;

  dialog.showModal();
  ok.focus();

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

/* ============================================================
 * 2. お知らせ（トースト）
 * ========================================================== */

let toastElement = null;
let toastTimer = null;

/**
 * 右下に短いお知らせを出す
 * @param {string} message
 * @param {number} [duration] 表示時間（ミリ秒）
 */
export function toast(message, duration = 2200) {
  if (!toastElement) {
    toastElement = document.createElement('div');
    toastElement.className = 'toast';
    toastElement.setAttribute('role', 'status');
    document.body.appendChild(toastElement);
  }

  toastElement.textContent = message;
  toastElement.classList.add('is-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove('is-visible'), duration);
}

/* ============================================================
 * 3. サイドバー
 * ========================================================== */

/**
 * サイドバーの開閉を用意する（既定は閉じた状態）
 * @param {object} options
 * @param {string} options.sidebarId
 * @param {string} options.toggleId
 * @param {string} [options.storageKey] 開閉状態を覚えるキー
 * @param {() => void} [options.onToggle] 開閉のたびに呼ばれる
 * @returns {{ toggle: (open?: boolean) => void, isOpen: () => boolean }}
 */
export function initSidebar({ sidebarId, toggleId, storageKey, onToggle, defaultOpen = false }) {
  const sidebar = document.getElementById(sidebarId);
  const button = document.getElementById(toggleId);
  if (!sidebar || !button) return { toggle() {}, isOpen: () => false };

  // 前に開いていたかを覚えておく。はじめて開いたときは defaultOpen にしたがう。
  const saved = storageKey ? localStorage.getItem(storageKey) : null;
  const remembered = saved === null ? defaultOpen : saved === '1';

  const apply = (open) => {
    sidebar.classList.toggle('is-open', open);
    button.classList.toggle('is-on', open);
    button.setAttribute('aria-expanded', String(open));
    button.title = open ? 'パネルを閉じる' : 'ヒントとAIサポートを開く';
    if (storageKey) localStorage.setItem(storageKey, open ? '1' : '0');
    if (onToggle) onToggle(open);
  };

  apply(remembered);
  button.addEventListener('click', () => apply(!sidebar.classList.contains('is-open')));

  return {
    toggle: (open) => apply(open ?? !sidebar.classList.contains('is-open')),
    isOpen: () => sidebar.classList.contains('is-open'),
  };
}

/* ============================================================
 * 4. タブ（ステージの切り替え）
 * ========================================================== */

/**
 * タブの切り替えを用意する
 * @param {object} options
 * @param {string} options.tabsId タブの入れ物（button[data-stage] を並べておく）
 * @param {(stage: string) => void} [options.onChange]
 * @param {string} [options.initial]
 * @returns {{ select: (stage: string) => void, current: () => string }}
 */
export function initTabs({ tabsId, onChange, initial }) {
  const container = document.getElementById(tabsId);
  if (!container) return { select() {}, current: () => '' };

  const buttons = [...container.querySelectorAll('button[data-stage]')];
  let current = initial || buttons[0]?.dataset.stage || '';

  const select = (stage) => {
    current = stage;
    for (const button of buttons) {
      button.setAttribute('aria-selected', String(button.dataset.stage === stage));
    }
    if (onChange) onChange(stage);
  };

  for (const button of buttons) {
    button.addEventListener('click', () => select(button.dataset.stage));
  }

  select(current);
  return { select, current: () => current };
}

/* ============================================================
 * 5. パネルの拡大
 * ========================================================== */

/**
 * パネルの拡大表示を用意する（button.panel-max[data-panel] を押すと拡大）
 * @param {() => void} [onChange] レイアウトが変わったときに呼ばれる
 * @returns {{ toggle: (panelId: string) => void, reset: () => void }}
 */
export function initMaximize(onChange) {
  const apply = (panelId, maximize) => {
    document.querySelectorAll('.panel.is-max').forEach(p => p.classList.remove('is-max'));
    document.querySelectorAll('.holds-max').forEach(p => p.classList.remove('holds-max'));

    const panel = maximize && panelId ? document.getElementById(panelId) : null;
    if (panel) {
      panel.classList.add('is-max');
      // 拡大したパネルが入っている列にも印を付ける（:has() を使わずに済ませるため）
      panel.closest('.stage-column, .side-column')?.classList.add('holds-max');
    }
    document.body.classList.toggle('has-max', Boolean(panel));

    document.querySelectorAll('.panel-max').forEach(button => {
      const on = maximize && button.dataset.panel === panelId;
      button.innerHTML = iconHtml(on ? 'cross' : 'maximize');
      button.title = on ? '元の大きさに戻す' : 'このパネルを大きく表示';
      button.classList.toggle('is-on', Boolean(on));
    });

    if (onChange) onChange();
  };

  const toggle = (panelId) => {
    const panel = document.getElementById(panelId);
    apply(panelId, panel && !panel.classList.contains('is-max'));
  };

  document.querySelectorAll('.panel-max').forEach(button => {
    button.addEventListener('click', () => toggle(button.dataset.panel));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('has-max')) {
      apply(null, false);
    }
  });

  return { toggle, reset: () => apply(null, false) };
}

/* ============================================================
 * 6. こまごました道具
 * ========================================================== */

/**
 * 続けて呼ばれても、最後の1回だけ実行する
 * @param {Function} fn
 * @param {number} wait ミリ秒
 */
export function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => { clearTimeout(timer); fn(...args); };
  return wrapped;
}

/**
 * 一定時間に1回までしか実行しない
 * @param {Function} fn
 * @param {number} wait ミリ秒
 */
export function throttle(fn, wait) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = performance.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = performance.now();
        fn(...args);
      }, remaining);
    }
  };
}

/* ============================================================
 * 7. 共有リンク
 * ========================================================== */

/** バイト列を URL に入れられる文字列にする */
function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 上の逆 */
function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

/**
 * コードを URL に載せられる形にする。
 * 圧縮できるブラウザでは縮めてから載せる（長いコードでもリンクが短くなる）。
 * @param {string} code
 * @returns {Promise<string>}
 */
async function packCode(code) {
  const bytes = new TextEncoder().encode(code);
  if (typeof CompressionStream === 'undefined') return 'p' + toBase64Url(bytes);

  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return 'z' + toBase64Url(new Uint8Array(buffer));
}

/**
 * packCode で作った文字列をコードに戻す
 * @param {string} packed
 * @returns {Promise<string|null>}
 */
async function unpackCode(packed) {
  try {
    const bytes = fromBase64Url(packed.slice(1));
    if (packed[0] === 'p') return new TextDecoder().decode(bytes);
    if (packed[0] !== 'z' || typeof DecompressionStream === 'undefined') return null;

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

/**
 * 共有用の URL を作る
 * @param {string} page 開きたいページ（例 'index.html'）
 * @param {string} code
 * @returns {Promise<string>}
 */
export async function makeShareUrl(page, code) {
  const base = location.href.replace(/[^/]*(\?.*)?(#.*)?$/, '');
  return `${base}${page}#s=${await packCode(code)}`;
}

/**
 * URL に載っているコードを取り出す（取り出したら URL からは消す）
 * `#code=...`（そのまま）と `#s=...`（圧縮）の両方に対応する。
 * @returns {Promise<string|null>}
 */
export async function takeCodeFromUrl() {
  const packed = location.hash.match(/[#&]s=([^&]+)/);
  const plain = location.hash.match(/[#&]code=([^&]+)/);
  if (!packed && !plain) return null;

  history.replaceState(null, '', location.pathname + location.search);
  try {
    if (packed) return await unpackCode(decodeURIComponent(packed[1]));
    return decodeURIComponent(plain[1]);
  } catch {
    return null;
  }
}

/**
 * コードを渡してページを開くための URL を作る（短いコード向け）
 * @param {string} page
 * @param {string} code
 * @returns {string}
 */
export function urlWithCode(page, code) {
  return `${page}#code=${encodeURIComponent(code)}`;
}

/* ============================================================
 * 8. 共有リンクのダイアログ
 * ========================================================== */

let shareElement = null;

/**
 * 共有リンクを見せて、コピーできるようにする
 * @param {string} url
 */
export function showShareDialog(url) {
  if (!shareElement) {
    shareElement = document.createElement('dialog');
    shareElement.className = 'dialog';
    shareElement.innerHTML = `
      <div class="dialog-body">
        <h3>共有リンク</h3>
        <p>このリンクを開くと、今のコードがそのまま入った状態で始められます。</p>
        <input type="text" data-role="url" readonly style="margin-top:0.75rem;font-family:var(--font-mono);font-size:var(--text-xs);">
      </div>
      <div class="dialog-actions">
        <button class="btn btn-quiet" data-role="close">閉じる</button>
        <button class="btn btn-mark" data-role="copy">${iconHtml('copy')}コピー</button>
      </div>`;
    document.body.appendChild(shareElement);

    shareElement.querySelector('[data-role="close"]').addEventListener('click', () => shareElement.close());
    shareElement.querySelector('[data-role="copy"]').addEventListener('click', async () => {
      const field = shareElement.querySelector('[data-role="url"]');
      try {
        await navigator.clipboard.writeText(field.value);
        toast('共有リンクをコピーしました');
      } catch {
        field.select();
        toast('リンクを選択しました。Ctrl+C でコピーしてください');
      }
    });
  }

  const field = shareElement.querySelector('[data-role="url"]');
  field.value = url;
  shareElement.showModal();
  field.select();
}
