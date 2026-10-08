import { iconHtml, setIconLabel } from './icons.js';
import { PYODIDE_CONFIG } from './config.js';
// module/ui.js
// 画面まわりの共通部品。全モードで同じ操作感になるようにまとめている。
//
//   confirmDialog() … window.confirm の代わりになる自前のダイアログ
//   toast()         … 右下に一言だけ出すお知らせ
//   watchTopbarHeight() … 上の帯が 2 段になったとき、下の区画の高さを合わせる（読みこむと自動で動く）
//   initSidebar()   … 開閉できるサイドバー（既定は閉じた状態）
//   initTabs()      … ステージの切り替えタブ
//   initMaximize()  … パネルの拡大表示
//   bootPython()    … Python（Pyodide）を、時間切れと再挑戦つきで読みこむ
//   makeEditorFriendly() … コードエディタを、キーボードと読み上げでも使いやすくする
//   bindRunShortcut() … Ctrl/⌘+Enter で「実行」
//   initTextSize()  … 字の大きさ（後ろの席・投影向けに大きくできる）。読みこむと自動で戻す
//   safeStorage     … localStorage の代わり。保存が使えない端末（学校の設定・プライベート閲覧）でも止まらない

/* ============================================================
 * 0. 保存（localStorage が使えなくても止まらない）
 * ========================================================== */

// 使えないときは、ページを開いているあいだだけメモリに覚えておく。
const memoryStore = new Map();
let storageWarned = false;

function warnStorage() {
  if (storageWarned || typeof document === 'undefined') return;
  storageWarned = true;
  // toast はこのファイルの下で定義している（呼ばれるのは読みこみ後なので使える）
  setTimeout(() => toast('この端末では保存ができません。ページを閉じると、作ったものは消えます。', 5000), 0);
}

export const safeStorage = {
  get(key) {
    // 書けなかった新しい値はメモリにある。端末に残った古い値より先に見る
    if (memoryStore.has(key)) return memoryStore.get(key);
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  /** @returns {boolean} 端末に保存できたか */
  set(key, value) {
    memoryStore.set(key, String(value));
    try {
      localStorage.setItem(key, String(value));
      memoryStore.delete(key);
      return true;
    } catch {
      warnStorage();
      return false;
    }
  },
  remove(key) {
    memoryStore.delete(key);
    try { localStorage.removeItem(key); } catch { /* 使えないときは何もしない */ }
  },
};

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
    // close イベントは、裏に回ったタブなどで遅れて届くことがある。押したボタンでもすぐ決める
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('click', onClick);
      resolve(value);
    };
    const onClick = (e) => {
      const button = e.target.closest('button[value]');
      if (button) finish(button.value === 'ok');
    };
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', () => finish(dialog.returnValue === 'ok'), { once: true });
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
let pendingToast = null;

export function toast(message, duration = 2200, action = null) {
  if (typeof document === 'undefined') return;
  // ボタンつきのお知らせが出ているあいだは、ふつうのお知らせで消さずに後に回す
  if (!action && toastElement && toastElement.classList.contains('has-action')
      && toastElement.classList.contains('is-visible')) {
    pendingToast = [message, duration];
    return;
  }
  if (!toastElement) {
    toastElement = document.createElement('div');
    toastElement.className = 'toast';
    toastElement.setAttribute('role', 'status');
    document.body.appendChild(toastElement);
  }

  toastElement.textContent = message;
  // 押せるボタンを 1 つだけ添えられる（例: 「前のプログラムに戻す」）
  toastElement.classList.toggle('has-action', Boolean(action));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      hideToast();
      action.onClick();
    });
    toastElement.appendChild(button);
    // ボタンを押すまでの時間をとる
    duration = Math.max(duration, 8000);
  }
  toastElement.classList.add('is-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastElement.classList.remove('is-visible', 'has-action');
  if (pendingToast) {
    const [message, duration] = pendingToast;
    pendingToast = null;
    setTimeout(() => toast(message, duration), 300);
  }
}

/* ============================================================
 * 2.5 上の帯の高さ
 * ========================================================== */

/**
 * 上の帯が 2 段になったら、その高さを --topbar-h に入れる。
 * 下の区画は calc(100vh - var(--topbar-h)) で高さを決めているので、
 * これをしないと、帯が 2 段のとき画面の下が切れてしまう。
 */
export function watchTopbarHeight() {
  const bar = document.querySelector('.topbar');
  if (!bar || typeof ResizeObserver === 'undefined') return;
  const apply = () => {
    document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  };
  new ResizeObserver(apply).observe(bar);
  apply();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchTopbarHeight);
  else watchTopbarHeight();
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
/**
 * 「1 行足せば直る」ときに、押せば直るボタンを出す
 *
 * 黙って直さない。押すと、学習者のコードにその 1 行が本当に入る。
 * @param {{label: string, code: string, line: number}|null} fix pyrun.js の suggestFix の返り値
 * @param {(code: string, line: number) => void} apply 押されたときに、直したコードを入れる
 */
export function showFix(fix, apply) {
  const old = document.getElementById('fix-note');
  if (old) old.remove();
  if (!fix) return;

  const output = document.getElementById('output');
  if (!output || !output.parentElement) return;

  const note = document.createElement('div');
  note.id = 'fix-note';
  note.className = 'note is-warn';
  note.style.margin = 'var(--sp-2)';

  const button = document.createElement('button');
  button.className = 'btn btn-sm btn-mark';
  button.textContent = fix.label;
  button.addEventListener('click', () => {
    apply(fix.code, fix.line);
    note.remove();
  });

  const text = document.createElement('p');
  text.textContent = fix.why || 'この 1 行を入れると直ります。';
  note.append(text, button);
  output.parentElement.insertBefore(note, output.nextSibling);
}

export function initSidebar({ sidebarId, toggleId, storageKey, onToggle, defaultOpen = false }) {
  const sidebar = document.getElementById(sidebarId);
  const button = document.getElementById(toggleId);
  if (!sidebar || !button) return { toggle() {}, isOpen: () => false };
  const label = button.dataset.label || 'パネル';
  const labelEl = button.querySelector('.sidebar-toggle-label');

  // 前に開いていたかを覚えておく。はじめて開いたときは defaultOpen にしたがう。
  const saved = storageKey ? safeStorage.get(storageKey) : null;
  const remembered = saved === null ? defaultOpen : saved === '1';

  const apply = (open) => {
    sidebar.classList.toggle('is-open', open);
    button.classList.toggle('is-on', open);
    button.setAttribute('aria-expanded', String(open));
    // 図だけだと押して何が起きるか分からないので、「〇〇を開く／閉じる」と字でも書く。
    const text = `${label}を${open ? '閉じる' : '開く'}`;
    if (labelEl) labelEl.textContent = text;
    button.title = text;
    if (storageKey) safeStorage.set(storageKey, open ? '1' : '0');
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
    // 黙って無視すると「リンクを開いたのに何も起きない」になる
    toast('共有リンクが途中で切れているため、コードを開けませんでした。リンクをもう一度コピーしてもらいましょう。', 5200);
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

/* ============================================================
 * 9. Python の読みこみ
 * ========================================================== */

/** 学校の回線では、はじめの読みこみに時間がかかることがある */
const PYTHON_TIMEOUT_MS = 120000;

export const PYTHON_LOAD_FAILED =
  'Python の実行環境を読みこめませんでした。インターネットにつながっているか、'
  + '学校のネットワークで cdn.jsdelivr.net への接続が止められていないかを確かめてください。';

/**
 * Pyodide を読みこむ。画面はこれを待たずに使えるようにしておき、終わったら実行ボタンを開ける。
 * @param {object} [options]
 * @param {(pyodide: object) => Promise<void>} [options.prepare] 読みこんだあとの下ごしらえ
 * @param {HTMLElement} [options.statusEl] 準備中・失敗を書く場所（ふつうは出力欄）
 * @returns {Promise<object>} pyodide
 */
export async function bootPython({ prepare, statusEl } = {}) {
  const waiting = 'Python を準備しています…（はじめは 10〜30 秒ほどかかります。そのあいだもコードは書けます）';
  // 出力欄にもとの案内があれば、読みこめたあとに戻す
  const before = statusEl ? statusEl.textContent : '';
  if (statusEl) statusEl.textContent = waiting;

  const wait = (promise, ms) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('時間切れ'), { timeout: true })), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };
  const start = () => {
    if (typeof loadPyodide !== 'function') return Promise.reject(new Error('pyodide.js を読みこめていません'));
    return loadPyodide({ indexURL: PYODIDE_CONFIG.INDEX_URL });
  };

  let lastError = null;
  let pyodide = null;
  let loading = start();
  for (let attempt = 0; attempt < 2 && !pyodide; attempt++) {
    try {
      pyodide = await wait(loading, PYTHON_TIMEOUT_MS);
    } catch (e) {
      lastError = e;
      console.warn(`Python の読みこみに失敗（${attempt + 1} 回目）:`, e);
      if (typeof loadPyodide !== 'function') break;
      if (e.timeout) {
        // 遅いだけなら、同じ読みこみをもう少し待つ（二重に読みこむと、回線がもっと詰まる）
        if (statusEl && statusEl.textContent === waiting) {
          statusEl.textContent = 'Python の読みこみに時間がかかっています。もう少し待ちます…';
        }
      } else {
        // 途中で切れたときだけ、読みこみをやり直す
        loading = start();
      }
    }
  }

  if (pyodide) {
    try {
      pyodide.globals.set('js', window);
      if (prepare) await prepare(pyodide);
      if (statusEl && statusEl.textContent !== before
          && /^Python (を準備|の読みこみに時間)/.test(statusEl.textContent)) statusEl.textContent = before;
      return pyodide;
    } catch (e) {
      lastError = e;
      console.warn('Python の下ごしらえに失敗:', e);
    }
  }

  if (statusEl) {
    statusEl.textContent = `${PYTHON_LOAD_FAILED}\n（${lastError ? lastError.message : '原因不明'}）\n`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm';
    button.textContent = 'ページを読み直す';
    button.addEventListener('click', () => location.reload());
    statusEl.appendChild(button);
  }
  throw new Error(PYTHON_LOAD_FAILED);
}

/* ============================================================
 * 10. キーボードで使いやすく
 * ========================================================== */

/**
 * コードエディタを、キーボードと読み上げでも使いやすくする
 *
 * Tab は字下げに使うので、そのままではエディタから出られない。
 * Esc を押してから Tab を押すと、次の部品へ移れるようにする。
 * @param {object} cm CodeMirror
 * @param {string} label 読み上げで伝える名前
 */
export function makeEditorFriendly(cm, label) {
  if (label) cm.setOption('screenReaderLabel', label);
  // コードを書きかえたら、前のエラーに向けた「押せば直る」案内は合わなくなるので消す
  // （読むだけの表記のように、プログラムが書きかえる setValue では消さない）
  cm.on('change', (_, change) => {
    if (change.origin === 'setValue') return;
    const note = document.getElementById('fix-note');
    if (note) note.remove();
  });
  let escaped = false;
  cm.on('keydown', (_, e) => {
    if (e.key === 'Escape') { escaped = true; return; }
    if (e.key === 'Tab' && escaped && !e.shiftKey) {
      // CodeMirror に字下げさせず、ブラウザの「次の部品へ」に任せる
      e.codemirrorIgnore = true;
    }
    escaped = false;
  });
}

/**
 * Ctrl+Enter（Mac は ⌘+Enter）で、実行ボタンを押す
 * @param {HTMLButtonElement} button
 */
export function bindRunShortcut(button) {
  if (!button) return;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const hint = mac ? '⌘+Enter' : 'Ctrl+Enter';
  button.title = button.title ? `${button.title}（${hint}）` : `実行（${hint}）`;
  // 状態に合わせて title を書きかえる画面が、もとの説明に戻せるように
  button.dataset.hint = button.title;
  button.setAttribute('aria-keyshortcuts', mac ? 'Meta+Enter' : 'Control+Enter');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.repeat || e.defaultPrevented) return;
    if (document.querySelector('dialog[open]')) return;
    // 答えやチャットの欄では、その欄の Enter に任せる（コードエディタの中は対象にする）
    const target = e.target;
    if (target && target.closest && target.closest('input, textarea, select')
        && !target.closest('.CodeMirror')) return;
    e.preventDefault();
    if (!button.disabled) button.click();
  });
}

/* ============================================================
 * 11. 字の大きさ
 * ========================================================== */

const TEXT_SIZE_KEY = 'easycode_text_size';
const TEXT_SIZES = [
  ['normal', 'ふつう'],
  ['large', '大きめ'],
  ['xlarge', 'とても大きい（投影向け）'],
];

function applyTextSize(size) {
  const value = TEXT_SIZES.some(([key]) => key === size) ? size : 'normal';
  if (value === 'normal') delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = value;
  // エディタやブロックの大きさを測り直してもらう
  window.dispatchEvent(new Event('resize'));
  return value;
}

/**
 * 字の大きさを選ぶ欄を作る（全ページで同じ設定を使う）
 * @param {HTMLElement} container ここに足す
 */
export function addTextSizeControl(container) {
  if (!container) return;
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'text-size-select';
  label.textContent = '字の大きさ';
  const select = document.createElement('select');
  select.id = 'text-size-select';
  for (const [key, name] of TEXT_SIZES) select.add(new Option(name, key));
  select.value = document.documentElement.dataset.textSize || 'normal';
  select.addEventListener('change', () => {
    safeStorage.set(TEXT_SIZE_KEY, applyTextSize(select.value));
  });
  field.append(label, select);
  container.appendChild(field);
}

if (typeof document !== 'undefined') {
  const saved = safeStorage.get(TEXT_SIZE_KEY);
  if (saved && saved !== 'normal') applyTextSize(saved);
}
