// module/completion.js
// コード補完エンジン。
//
// 補完の中心は module/pycomplete.js のローカル解析なので、
// APIキーが無くても、書いているコードから変数・関数・メソッドを拾って候補を出せる。
// APIキーがあるときだけ、行の続きを提案する「AIの一言先読み」が上乗せされる。

import { getCompletions, prepareInsert, ghostText, isInStringOrComment } from './pycomplete.js';
import { COMPLETION_CONFIG } from './config.js';
import { callGemini, hasApiKey } from './ai.js';

// AI の先読みが失敗したら、この時間は AI に問い合わせない。
// 回数制限・オフライン・学校のネットワークの遮断のときに、打つたびに失敗を重ねないため。
// 補完エンジンは画面ごとに作られるが、失敗の理由は共通なので、時刻はモジュールで共有する。
const AI_BACKOFF_MS = 5 * 60 * 1000;
let aiBlockedUntil = 0;

/** モード名と説明（サイドバーの表示に使う） */
const MODE_TEXT = {
  'inline-only': ['インライン補完のみ', '続きを薄い文字で表示（Tabで確定）'],
  'popup-only': ['複数候補のみ', '2文字打つと候補一覧（Tabで確定。↑↓で選んで Enter）'],
  both: ['インライン + 複数候補', '薄い文字＋候補一覧（Tabで確定。↑↓で選んで Enter）'],
  none: ['補完なし', '補完機能は無効'],
};

export class CodeCompletionEngine {
  /**
   * @param {CodeMirror} editor
   * @param {object} [options]
   * @param {object[]} [options.extraApi] そのモードだけの候補（描画モードの p5 など）
   * @param {boolean} [options.useAI] AI による続きの提案を使うか（既定: true）
   * @param {string} [options.mode] 初期の補完モード
   */
  constructor(editor, options = {}) {
    this.editor = editor;
    this.extraApi = options.extraApi || [];
    this.useAI = options.useAI !== false;

    this.completionMode = options.mode || COMPLETION_CONFIG.DEFAULT_MODE;
    this.debounceTimer = null;
    this.aiTimer = null;

    this.items = [];
    this.replaceLength = 0;
    this.selectedIndex = 0;
    // 候補一覧を矢印キーで選んだか。選んでいなければ Enter は通常の改行にする
    this.navigated = false;

    this.inlineWidget = null;
    this.inlineText = '';
    this.inlineItem = null;

    this.initPopup();
    this.bindModeSelect();
    this.bindEditor();
  }

  /* ---------------- 画面の準備 ---------------- */

  initPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'code-completion-popup';
    this.popup.style.display = 'none';
    document.body.appendChild(this.popup);
  }

  bindModeSelect() {
    const select = document.getElementById('completion-mode-select');
    if (!select) return;

    select.value = this.completionMode;
    select.addEventListener('change', (e) => {
      this.completionMode = e.target.value;
      this.updateStatusText();
      if (this.completionMode === 'none') this.dismiss();
    });
    this.updateStatusText();
  }

  /** 補完の説明表示を今のモードに合わせる（外から切り替えたときにも呼ぶ） */
  updateStatusText() {
    const [name, description] = MODE_TEXT[this.completionMode] || MODE_TEXT.none;
    const status = document.getElementById('completion-status');
    const detail = document.getElementById('completion-description');
    if (status) status.textContent = name;
    if (detail) detail.textContent = description;
  }

  bindEditor() {
    this.editor.on('inputRead', (cm, change) => {
      if (this.completionMode === 'none') return;
      // 日本語入力の変換中は出さない（変換が終わったら compositionend で探す）
      if (change.origin === '*compose' || this.isComposing()) return;
      const typed = change.text && change.text[0];
      if (!typed || change.text.length > 1) { this.dismiss(); return; }
      // 英数字・日本語・「.」と、値を書きはじめる記号（( = , と空白）を補完のきっかけにする
      if (!/[\w.(=, \u3040-\u30ff\u3400-\u9fff々ー]/.test(typed)) { this.dismiss(); return; }
      this.scheduleCompletion();
    });

    // 日本語入力で「表示」などを確定したら、print() などを探す
    const input = this.editor.getInputField && this.editor.getInputField();
    if (input) {
      input.addEventListener('compositionend', () => {
        if (this.completionMode === 'none') return;
        clearTimeout(this.debounceTimer);
        // 確定した字がエディタに届くのを待つ（タブレットでは少し遅れる）
        this.debounceTimer = setTimeout(() => this.requestCompletion(false), 160);
      });
    }

    this.editor.on('cursorActivity', () => {
      if (this.popup.style.display === 'block') this.hidePopup();
      this.hideInline();
    });

    this.editor.on('blur', () => this.dismiss());

    this.editor.on('keydown', (cm, event) => {
      if (this.completionMode === 'none') return;

      // Ctrl+Space / Ctrl+I で候補一覧
      if ((event.ctrlKey || event.metaKey) && (event.code === 'Space' || event.code === 'KeyI')) {
        event.preventDefault();
        this.requestCompletion(true);
        return;
      }

      // 行のはじめの空白の中（字下げをしたいところ）では、Tab は字下げに使う
      const inIndent = event.key === 'Tab' && this.cursorInIndent();

      if (this.popup.style.display === 'block') {
        if (event.key === 'ArrowDown') { event.preventDefault(); this.moveSelection(1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); this.moveSelection(-1); return; }
        // Enter で候補を入れるのは、矢印キーで候補を選んだときだけ。
        // 改行のつもりで押した Enter が、知らない名前を勝手に入れてしまわないように。
        if (event.key === 'Enter' && !this.navigated) { this.hidePopup(); return; }
        // 何も打っていないところ（x = のあと など）に自分から出た一覧は、Tab でも ↑↓ で選んだときだけ入れる
        if (event.key === 'Tab' && !this.navigated && this.context === 'expr' && this.replaceLength === 0) {
          this.dismiss();
          return;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && !inIndent) {
          event.preventDefault();
          this.applyItem(this.items[this.selectedIndex]);
          return;
        }
        if (event.key === 'Escape') { event.preventDefault(); this.hidePopup(); return; }
      }

      if (this.inlineText) {
        if (event.key === 'Tab' && !inIndent) { event.preventDefault(); this.acceptInline(); return; }
        if (event.key === 'Tab') { this.hideInline(); return; }
        if (event.key === 'Escape') { event.preventDefault(); this.hideInline(); return; }
      }
    });
  }

  /** カーソルが行のはじめの空白の中（左に空白しかない）にあるか */
  cursorInIndent() {
    const cursor = this.editor.getCursor();
    const before = (this.editor.getLine(cursor.line) || '').slice(0, cursor.ch);
    return !before.trim();
  }

  /** 日本語入力の変換中か */
  isComposing() {
    const input = this.editor.display && this.editor.display.input;
    return Boolean(input && input.composing);
  }

  /** カーソルが文字列やコメントの中にあるか（3 重引用符の複数行の文字列も CodeMirror の色分けで分かる） */
  inStringOrComment(cursor, beforeCursor) {
    if (isInStringOrComment(beforeCursor)) return true;
    const token = this.editor.getTokenAt ? this.editor.getTokenAt(cursor) : null;
    const type = (token && token.type) || '';
    if (/\bcomment\b/.test(type)) return true;
    // 閉じた直後（"abc"| ）は文字列の外
    return /\bstring\b/.test(type) && !/["']$/.test(beforeCursor);
  }

  /* ---------------- 候補の取得 ---------------- */

  scheduleCompletion() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.requestCompletion(false), 120);
  }

  /**
   * 補完候補を計算して表示する
   * @param {boolean} isManual Ctrl+Space などで明示的に呼ばれたか
   */
  requestCompletion(isManual) {
    if (this.completionMode === 'none') return;

    const cursor = this.editor.getCursor();
    const line = this.editor.getLine(cursor.line) || '';
    const beforeCursor = line.slice(0, cursor.ch);

    // 文字列・コメントの中や、日本語の変換中は出さない
    if (this.isComposing() || this.inStringOrComment(cursor, beforeCursor)) {
      this.hidePopup();
      this.hideInline();
      return;
    }

    const { items, replaceLength, context } = getCompletions({
      code: this.editor.getValue(),
      lineIndex: cursor.line,
      beforeCursor,
      extraApi: this.extraApi,
      limit: COMPLETION_CONFIG.MAX_SUGGESTIONS * 3,
      manual: isManual,
    });

    this.items = items;
    this.replaceLength = replaceLength;
    this.context = context;
    this.selectedIndex = 0;

    // 一覧を自分から出すのは、2 文字以上打ったとき・「.」のあと・( = , のあと・for / if のあと
    const autoOpen = context === 'expr' || context === 'head' || context === 'member' ||
      replaceLength >= COMPLETION_CONFIG.MIN_CONTEXT_LENGTH;
    const showPopup = isManual || (this.completionMode !== 'inline-only' && autoOpen);
    const showInline = this.completionMode === 'inline-only' || this.completionMode === 'both';

    if (showPopup && items.length) {
      this.showPopup(cursor);
    } else {
      this.hidePopup();
    }

    // 薄い文字は、字を打ったとき（または「.」のあと）だけ。何も打っていないところには出さない
    const typedSomething = replaceLength > 0 || context === 'member';
    if (showInline && typedSomething && items.length) {
      this.showInline(items[this.selectedIndex], cursor);
    } else {
      this.hideInline();
    }

    if (this.useAI) this.scheduleAiHint(beforeCursor, cursor);
  }

  /* ---------------- 候補一覧（ポップアップ） ---------------- */

  showPopup(cursor) {
    this.navigated = false;
    this.popup.replaceChildren();

    this.items.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'completion-item' + (index === 0 ? ' selected' : '');

      const label = document.createElement('span');
      label.className = 'completion-label';
      label.textContent = entry.label;

      const detail = document.createElement('span');
      detail.className = 'completion-detail';
      detail.textContent = entry.detail || '';

      row.append(label, detail);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.applyItem(entry);
      });
      this.popup.appendChild(row);
    });

    const coords = this.editor.cursorCoords(cursor, 'page');
    this.popup.style.display = 'block';
    this.popup.style.left = `${coords.left}px`;
    this.popup.style.top = `${coords.bottom + 4}px`;

    // 画面の下にはみ出すときは、カーソルの上に出す
    const box = this.popup.getBoundingClientRect();
    if (box.bottom > window.innerHeight) {
      this.popup.style.top = `${coords.top - box.height - 4}px`;
    }
  }

  hidePopup() {
    this.popup.style.display = 'none';
    this.navigated = false;
  }

  moveSelection(delta) {
    const rows = this.popup.querySelectorAll('.completion-item');
    if (!rows.length) return;
    this.navigated = true;
    rows[this.selectedIndex]?.classList.remove('selected');
    this.selectedIndex = (this.selectedIndex + delta + rows.length) % rows.length;
    rows[this.selectedIndex].classList.add('selected');
    rows[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    // 薄い文字も、選んでいる候補に合わせる
    if (this.completionMode === 'both' && (this.inlineText || this.replaceLength > 0)) {
      this.showInline(this.items[this.selectedIndex], this.editor.getCursor());
    }
  }

  /* ---------------- インライン（薄い文字） ---------------- */

  /** 候補で置きかえる字数（行まるごとの候補は、行の字下げより後ろ全部） */
  replaceLengthOf(entry) {
    return entry && entry.replaceLength !== undefined ? entry.replaceLength : this.replaceLength;
  }

  /**
   * 候補の続きを薄い文字で見せる
   * @param {object} entry 候補
   * @param {object} cursor カーソル位置
   * @param {number} [replaceLength] 置きかえる字数（AI の提案のときだけ渡す）
   */
  showInline(entry, cursor, replaceLength = this.replaceLengthOf(entry)) {
    this.hideInline();
    if (!entry) return;
    // 日本語入力の変換中は出さない（行を描きなおすと、変換が途切れることがある）
    if (this.isComposing()) return;

    const before = (this.editor.getLine(cursor.line) || '').slice(0, cursor.ch);
    const rest = ghostText(entry, before.slice(before.length - replaceLength));
    if (!rest) return;

    const widget = document.createElement('span');
    widget.className = 'inline-suggestion';
    widget.textContent = rest;

    // カーソルのところに、文の中の字として差しこむ（addWidget は字の流れの外に重ねるので、ずれて見えていた）
    this.inlineMark = this.editor.setBookmark(cursor, { widget, insertLeft: true, handleMouseEvents: false });
    this.inlineWidget = widget;
    this.inlineText = rest;
    this.inlineItem = entry;
    this.inlineCursor = cursor;
  }

  hideInline() {
    if (this.inlineMark) this.inlineMark.clear();
    this.inlineMark = null;
    this.inlineWidget = null;
    this.inlineText = '';
    this.inlineItem = null;
  }

  acceptInline() {
    const entry = this.inlineItem;
    this.hideInline();
    if (entry) this.applyItem(entry);
  }

  /* ---------------- 候補の適用 ---------------- */

  /**
   * 候補をエディタに挿入する
   * @param {object} entry {label, insert, moveBack}
   */
  applyItem(entry) {
    if (!entry) return;
    this.hidePopup();
    this.hideInline();

    const cursor = this.editor.getCursor();
    const from = { line: cursor.line, ch: Math.max(0, cursor.ch - this.replaceLengthOf(entry)) };

    // 複数行のひな形は、今の行の字下げに合わせる。「:」で終わる行なら、次の行の中身の位置へ
    const indent = (this.editor.getLine(cursor.line) || '').match(/^\s*/)[0];
    const unit = this.editor.getOption('indentWithTabs') ? '\t' : ' '.repeat(this.editor.getOption('indentUnit') || 4);
    const { text, line, ch } = prepareInsert(entry, indent, unit);

    this.editor.replaceRange(text, from, cursor, '+complete');

    // カーソルを括弧の中や、ブロックの中身の行へ移動する
    this.editor.setCursor({ line: from.line + line, ch: line === 0 ? from.ch + ch : ch });
    this.editor.focus();
  }

  dismiss() {
    this.hidePopup();
    this.hideInline();
    clearTimeout(this.debounceTimer);
    clearTimeout(this.aiTimer);
  }

  /* ---------------- AI による続きの提案（任意） ---------------- */

  /**
   * APIキーが設定されているときだけ、行の続きを提案する。
   * 補完の本体はローカル解析なので、これは無くても困らない上乗せ機能。
   */
  scheduleAiHint(beforeCursor, cursor) {
    clearTimeout(this.aiTimer);
    if (Date.now() < aiBlockedUntil) return;
    if (!hasApiKey()) return;
    if (this.completionMode === 'popup-only' || this.completionMode === 'none') return;
    if (beforeCursor.trim().length < 3) return;

    this.aiTimer = setTimeout(async () => {
      try {
        // ローカル候補を表示できているなら、AIで上書きしない
        if (this.inlineText || this.popup.style.display === 'block') return;

        const code = this.editor.getValue();
        const prompt = `次のPythonコードで、カーソル位置（|）に続く1行を提案してください。
説明やコードブロック記号は書かず、続きの文字列だけを1行で出力してください。

${code.split('\n').slice(Math.max(0, cursor.line - 12), cursor.line).join('\n')}
${beforeCursor}|`;

        // 失敗すると callGemini は例外を投げる。その文章を候補として出さないよう、
        // 成功した返事だけを使う（失敗は下の catch で休み時間に入る）。
        const response = await callGemini(prompt, 80);
        const suggestion = (response || '')
          .replace(/```[a-z]*\n?/g, '')
          .split('\n')[0]
          .trim();

        if (!suggestion) return;
        // 入力位置が変わっていたら出さない
        const now = this.editor.getCursor();
        if (now.line !== cursor.line || now.ch !== cursor.ch) return;

        this.showInline({ label: suggestion, insert: beforeCursor + suggestion, replaceLength: beforeCursor.length }, now);
      } catch (error) {
        // AI が使えなくてもローカル補完だけで動くので、候補は出さず、しばらく休む
        aiBlockedUntil = Date.now() + AI_BACKOFF_MS;
        console.debug('AI補完は利用できませんでした:', error.message);
      }
    }, COMPLETION_CONFIG.DEBOUNCE_DELAY);
  }
}
