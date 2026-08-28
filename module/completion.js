// module/completion.js
// コード補完エンジン。
//
// 補完の中心は module/pycomplete.js のローカル解析なので、
// APIキーが無くても、書いているコードから変数・関数・メソッドを拾って候補を出せる。
// APIキーがあるときだけ、行の続きを提案する「AIの一言先読み」が上乗せされる。

import { getCompletions } from './pycomplete.js';
import { COMPLETION_CONFIG, STORAGE_KEYS } from './config.js';

/** モード名と説明（サイドバーの表示に使う） */
const MODE_TEXT = {
  'inline-only': ['インライン補完のみ', '続きを薄い文字で表示（Tabで確定）'],
  'popup-only': ['複数候補のみ', 'Ctrl+Space で候補一覧'],
  both: ['インライン + 複数候補', '薄い文字＋候補一覧（Ctrl+Space）'],
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
      const typed = change.text && change.text[0];
      if (!typed) return;
      // 記号のうち「.」だけは補完のきっかけにする
      if (!/[\w.]/.test(typed)) { this.dismiss(); return; }
      this.scheduleCompletion();
    });

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

      if (this.popup.style.display === 'block') {
        if (event.key === 'ArrowDown') { event.preventDefault(); this.moveSelection(1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); this.moveSelection(-1); return; }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          this.applyItem(this.items[this.selectedIndex]);
          return;
        }
        if (event.key === 'Escape') { event.preventDefault(); this.hidePopup(); return; }
      }

      if (this.inlineText) {
        if (event.key === 'Tab') { event.preventDefault(); this.acceptInline(); return; }
        if (event.key === 'Escape') { event.preventDefault(); this.hideInline(); return; }
      }
    });
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

    const { items, replaceLength } = getCompletions({
      code: this.editor.getValue(),
      lineIndex: cursor.line,
      beforeCursor,
      extraApi: this.extraApi,
      limit: COMPLETION_CONFIG.MAX_SUGGESTIONS * 3,
    });

    this.items = items;
    this.replaceLength = replaceLength;
    this.selectedIndex = 0;

    const showPopup = isManual ||
      (this.completionMode !== 'inline-only' && replaceLength >= COMPLETION_CONFIG.MIN_CONTEXT_LENGTH);
    const showInline = this.completionMode === 'inline-only' || this.completionMode === 'both';

    if (showPopup && items.length) {
      this.showPopup(cursor);
    } else {
      this.hidePopup();
    }

    if (!showPopup && showInline && items.length) {
      this.showInline(items[0], replaceLength, cursor);
    } else {
      this.hideInline();
    }

    if (this.useAI) this.scheduleAiHint(beforeCursor, cursor);
  }

  /* ---------------- 候補一覧（ポップアップ） ---------------- */

  showPopup(cursor) {
    this.hideInline();
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
  }

  moveSelection(delta) {
    const rows = this.popup.querySelectorAll('.completion-item');
    if (!rows.length) return;
    rows[this.selectedIndex]?.classList.remove('selected');
    this.selectedIndex = (this.selectedIndex + delta + rows.length) % rows.length;
    rows[this.selectedIndex].classList.add('selected');
    rows[this.selectedIndex].scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- インライン（薄い文字） ---------------- */

  showInline(entry, replaceLength, cursor) {
    this.hideInline();
    if (!entry || entry.insert.includes('\n')) return;

    const rest = entry.insert.slice(replaceLength);
    if (!rest) return;

    const widget = document.createElement('span');
    widget.className = 'inline-suggestion';
    widget.textContent = rest;

    this.inlineWidget = this.editor.addWidget(cursor, widget, false);
    this.inlineWidget = widget;
    this.inlineText = rest;
    this.inlineItem = entry;
    this.inlineCursor = cursor;
  }

  hideInline() {
    if (this.inlineWidget && this.inlineWidget.parentNode) {
      this.inlineWidget.parentNode.removeChild(this.inlineWidget);
    }
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
    const from = { line: cursor.line, ch: Math.max(0, cursor.ch - this.replaceLength) };

    // 複数行のひな形は、今の行の字下げに合わせる
    const indent = (this.editor.getLine(cursor.line) || '').match(/^\s*/)[0];
    const text = entry.insert.split('\n')
      .map((line, index) => (index === 0 ? line : indent + line))
      .join('\n');

    this.editor.replaceRange(text, from, cursor);

    // カーソルを括弧の中などへ移動する
    const lines = text.split('\n');
    const endLine = from.line + lines.length - 1;
    const endCh = lines.length === 1 ? from.ch + text.length : lines[lines.length - 1].length;
    const moveBack = entry.moveBack || 0;
    this.editor.setCursor({ line: endLine, ch: Math.max(0, endCh - moveBack) });
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
    if (!localStorage.getItem(STORAGE_KEYS.API_KEY)) return;
    if (this.completionMode === 'popup-only' || this.completionMode === 'none') return;
    if (beforeCursor.trim().length < 3) return;

    this.aiTimer = setTimeout(async () => {
      try {
        // ローカル候補を表示できているなら、AIで上書きしない
        if (this.inlineText || this.popup.style.display === 'block') return;

        const { callGemini } = await import('./ai.js');
        const code = this.editor.getValue();
        const prompt = `次のPythonコードで、カーソル位置（|）に続く1行を提案してください。
説明やコードブロック記号は書かず、続きの文字列だけを1行で出力してください。

${code.split('\n').slice(Math.max(0, cursor.line - 12), cursor.line).join('\n')}
${beforeCursor}|`;

        const response = await callGemini(prompt, 80);
        const suggestion = (response || '')
          .replace(/```[a-z]*\n?/g, '')
          .split('\n')[0]
          .trim();

        if (!suggestion) return;
        // 入力位置が変わっていたら出さない
        const now = this.editor.getCursor();
        if (now.line !== cursor.line || now.ch !== cursor.ch) return;

        this.showInline({ label: suggestion, insert: beforeCursor + suggestion }, beforeCursor.length, now);
      } catch (error) {
        // AI が使えなくてもローカル補完だけで動くので、静かに諦める
        console.debug('AI補完は利用できませんでした:', error.message);
      }
    }, COMPLETION_CONFIG.DEBOUNCE_DELAY);
  }
}
