// module/completion.js
import { callGemini } from './ai.js';

export class CodeCompletionEngine {
  constructor(editor) {
    try {
      console.log('CodeCompletionEngine コンストラクタ呼び出し', editor);
      this.editor = editor;
      this.completionMode = 'both'; // 'inline-only', 'popup-only', 'both', 'none'
      this.debounceTimer = null;
      this.cache = new Map();
      this.popup = null;
      this.currentSuggestions = [];
      this.selectedIndex = -1;
      this.inlineWidget = null;
      this.currentInlineSuggestion = null;
      this.isShowingInline = false; // インライン表示中フラグ
      
      this.initPopup();
      this.bindEvents();
      
      console.log('CodeCompletionEngine 初期化完了');
    } catch (error) {
      console.error('CodeCompletionEngine 初期化エラー:', error);
    }
  }

  initPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'code-completion-popup';
    document.body.appendChild(this.popup);
  }

  bindEvents() {
    try {
      console.log('bindEvents 開始');
      
      // コード補完モード選択のイベント
      const modeSelect = document.getElementById('completion-mode-select');
      const status = document.getElementById('completion-status');
      const description = document.getElementById('completion-description');
      
      console.log('モード選択要素:', modeSelect);
      
      if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
          try {
            const mode = e.target.value;
            console.log('補完モード変更:', mode);
            this.completionMode = mode;
            
            // ステータス表示を更新
            const modeTexts = {
              'inline-only': 'インライン補完のみ',
              'popup-only': '複数候補のみ',
              'both': 'インライン + 複数候補',
              'none': '補完なし'
            };
            
            const descriptions = {
              'inline-only': '単一候補を薄い色で表示',
              'popup-only': 'Ctrl+I で複数候補表示',
              'both': '単一候補: 薄い色表示、複数候補: Ctrl+I',
              'none': '補完機能は無効'
            };
            
            if (status) status.textContent = modeTexts[mode];
            if (description) description.textContent = descriptions[mode];
            
            // 現在の補完を隠す
            if (mode === 'none') {
              this.hidePopup();
              this.hideInlineSuggestion();
            }
            
            // AIコード修正ボタンの状態も更新
            const aiFixBtn = document.getElementById('ai-fix-code');
            if (aiFixBtn) {
              const isEnabled = mode !== 'none';
              aiFixBtn.disabled = !isEnabled;
              aiFixBtn.style.opacity = isEnabled ? '1' : '0.5';
              aiFixBtn.title = isEnabled ? 'AIがコードを最適化します' : 'コード補完をONにしてください';
            }
          } catch (error) {
            console.error('モード変更エラー:', error);
          }
        });
      }
    } catch (error) {
      console.error('bindEvents エラー:', error);
    }

    // エディタイベント（デバッグログ簡素化）
    this.editor.on('inputRead', (cm, event) => {
      if (this.completionMode === 'none') return;
      
      // 文字入力の場合は自動補完をトリガー
      if (event.text && event.text[0] && event.text[0].trim() !== '') {
        this.debouncedCompletion();
      }
    });

    // キーボードイベント
    this.editor.on('keydown', (cm, event) => {
      if (this.completionMode === 'none') return;

      // Ctrl+I で手動補完（IntelliSenseのI）
      if (event.ctrlKey && event.code === 'KeyI') {
        event.preventDefault();
        this.requestCompletion(true); // 手動フラグを追加
        return;
      }

      // ポップアップが表示されている場合のキー操作
      if (this.popup.style.display === 'block') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.selectNext();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.selectPrevious();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          this.applySelected();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this.applySelected();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.hidePopup();
          this.hideInlineSuggestion();
        }
      }

      // インライン補完の処理
      if (this.currentInlineSuggestion) {
        if (event.key === 'Tab') {
          event.preventDefault();
          this.acceptInlineSuggestion();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.hideInlineSuggestion();
        }
      }
    });

    // エディタ外クリックでポップアップとインライン補完を隠す
    document.addEventListener('click', (e) => {
      if (!this.editor.getWrapperElement().contains(e.target) && 
          !this.popup.contains(e.target)) {
        this.hidePopup();
        this.hideInlineSuggestion();
      }
    });

    // エディタのカーソル移動でインライン補完を隠す（テスト用に一時的に無効化）
    /*
    this.editor.on('cursorActivity', (cm) => {
      // インライン補完表示中の自動カーソル移動は無視
      if (this.currentInlineSuggestion && !this.isShowingInline) {
        console.log('cursorActivity でインライン補完を隠す');
        this.hideInlineSuggestion();
      }
    });
    */
  }

  debouncedCompletion() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.requestCompletion();
    }, 500); // 500ms デバウンス（高速化のため短縮）
  }

  async requestCompletion(isManual = false) {
    const cursor = this.editor.getCursor();
    const line = this.editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    const afterCursor = line.substring(cursor.ch);
    
    // 現在のコード全体を取得
    const fullCode = this.editor.getValue();
    
    // キャッシュキーを生成（より効率的）
    const cacheKey = `${beforeCursor}|${fullCode.slice(-50)}`;
    
    // キャッシュから確認
    if (this.cache.has(cacheKey)) {
      this.handleSuggestions(this.cache.get(cacheKey), cursor, isManual);
      return;
    }

    // AIに補完を要求
    try {
      const suggestions = await this.generateCompletions(fullCode, beforeCursor, afterCursor, cursor.line);
      
      // キャッシュに保存（最大50件）
      if (this.cache.size >= 50) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, suggestions);
      
      this.handleSuggestions(suggestions, cursor, isManual);
    } catch (error) {
      console.error('補完生成エラー:', error);
    }
  }

  handleSuggestions(suggestions, cursor, isManual = false) {
    if (!suggestions || suggestions.length === 0) return;

    switch (this.completionMode) {
      case 'inline-only':
        // インライン補完のみ
        if (suggestions.length >= 1) {
          this.showInlineSuggestion(suggestions[0], cursor);
        }
        break;
        
      case 'popup-only':
        // 複数候補のみ（手動時またはCtrl+I）
        if (isManual && suggestions.length > 0) {
          this.showSuggestions(suggestions, cursor);
        }
        break;
        
      case 'both':
        // 両方対応
        if (suggestions.length === 1 && !isManual) {
          this.showInlineSuggestion(suggestions[0], cursor);
        } else if (suggestions.length > 1 || isManual) {
          this.showSuggestions(suggestions, cursor);
        }
        break;
        
      case 'none':
      default:
        // 何もしない
        break;
    }
  }

  async generateCompletions(fullCode, beforeCursor, afterCursor, lineNumber) {
    // 短すぎるコンテキストの場合は基本補完のみ
    if (beforeCursor.trim().length < 2) {
      return this.getBasicCompletions(beforeCursor);
    }

    const prompt = `Python code completion. Current context:
CODE: ${fullCode.slice(-200)}
LINE: "${beforeCursor}"

Provide 3-5 short completions. Format: COMPLETION:code
Examples:
COMPLETION:print()
COMPLETION:input()

Only output COMPLETION: lines.`;

    try {
      const response = await callGemini(prompt, 150);
      
      // レスポンスから補完候補を抽出
      const suggestions = [];
      const lines = response.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('COMPLETION:')) {
          const completion = line.substring(11).trim();
          if (completion && suggestions.length < 5) {
            suggestions.push(completion);
          }
        }
      }
      
      // フォールバック: 基本的なPython補完
      if (suggestions.length === 0) {
        suggestions.push(...this.getBasicCompletions(beforeCursor));
      }
      
      return suggestions;
    } catch (error) {
      console.error('AI補完エラー:', error);
      return this.getBasicCompletions(beforeCursor);
    }
  }

  getBasicCompletions(beforeCursor) {
    const completions = [];
    const lastWord = beforeCursor.trim().split(/\s+/).pop();
    
    // 基本的なPython補完
    if (lastWord.startsWith('prin')) {
      completions.push('print()', 'print("")', 'print(f"")');
    } else if (lastWord.startsWith('inpu')) {
      completions.push('input()', 'input("")');
    } else if (lastWord === 'if') {
      completions.push('if True:', 'if __name__ == "__main__":');
    } else if (lastWord === 'for') {
      completions.push('for i in range():', 'for item in list:');
    } else if (lastWord === 'def') {
      completions.push('def function():', 'def main():');
    } else if (beforeCursor.includes('.')) {
      completions.push('append()', 'split()', 'strip()', 'replace()');
    } else {
      // 一般的なPython候補
      completions.push('print()', 'input()', 'len()', 'range()', 'str()');
    }
    
    // モードに応じて返す候補数を調整
    if (this.completionMode === 'inline-only') {
      return completions.slice(0, 1); // インライン用に1つだけ
    } else {
      return completions.slice(0, 5); // 複数候補用に最大5つ
    }
  }

  showSuggestions(suggestions, cursor) {
    if (!suggestions || suggestions.length === 0) {
      this.hidePopup();
      return;
    }

    this.currentSuggestions = suggestions;
    this.selectedIndex = -1;
    
    // ポップアップの内容を更新
    this.popup.innerHTML = '';
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'completion-item';
      item.textContent = suggestion;
      item.addEventListener('click', () => {
        this.applySuggestion(suggestion);
      });
      this.popup.appendChild(item);
    });

    // ポップアップの位置を計算
    const coords = this.editor.cursorCoords(cursor, 'page');
    this.popup.style.left = `${coords.left}px`;
    this.popup.style.top = `${coords.bottom + 5}px`;
    this.popup.style.display = 'block';
  }

  hidePopup() {
    this.popup.style.display = 'none';
    this.selectedIndex = -1;
  }

  showInlineSuggestion(suggestion, cursor) {
    this.hidePopup(); // ポップアップを隠す
    this.hideInlineSuggestion(); // 既存のインライン補完を隠す
    
    // インライン表示中フラグを設定
    this.isShowingInline = true;
    
    // 補完テキストを保存
    this.currentInlineSuggestion = suggestion;
    this.originalCursorPos = cursor;
    
    // 現在のカーソル位置に一時的にテキストを挿入
    this.editor.replaceRange(suggestion, cursor);
    
    // 挿入したテキストの範囲
    const from = cursor;
    const to = { line: cursor.line, ch: cursor.ch + suggestion.length };
    
    // マーカーでグレーアウト表示
    this.inlineWidget = this.editor.markText(from, to, {
      className: 'inline-suggestion-highlight',
      css: 'color: #666 !important; opacity: 0.7 !important; font-style: italic !important;'
    });
    
    // カーソルを元の位置に戻す
    this.editor.setCursor(cursor);
    
    // フラグをリセット
    this.isShowingInline = false;
  }

  hideInlineSuggestion() {
    if (this.inlineWidget) {
      this.inlineWidget.clear();
      this.inlineWidget = null;
    }
    if (this.currentInlineSuggestion && this.originalCursorPos) {
      // 挿入した補完テキストを削除
      const from = this.originalCursorPos;
      const to = { line: from.line, ch: from.ch + this.currentInlineSuggestion.length };
      this.editor.replaceRange('', from, to);
    }
    this.currentInlineSuggestion = null;
    this.originalCursorPos = null;
  }

  acceptInlineSuggestion() {
    if (this.currentInlineSuggestion && this.inlineWidget) {
      // マーカーをクリアして、補完を確定
      this.inlineWidget.clear();
      this.inlineWidget = null;
      
      // カーソルを補完の終端に移動
      const cursor = this.editor.getCursor();
      const newCursor = { line: cursor.line, ch: cursor.ch + this.currentInlineSuggestion.length };
      this.editor.setCursor(newCursor);
      
      this.currentInlineSuggestion = null;
      this.editor.focus();
    }
  }

  selectNext() {
    const items = this.popup.querySelectorAll('.completion-item');
    if (items.length === 0) return;

    if (this.selectedIndex >= 0) {
      items[this.selectedIndex].classList.remove('selected');
    }
    
    this.selectedIndex = (this.selectedIndex + 1) % items.length;
    items[this.selectedIndex].classList.add('selected');
  }

  selectPrevious() {
    const items = this.popup.querySelectorAll('.completion-item');
    if (items.length === 0) return;

    if (this.selectedIndex >= 0) {
      items[this.selectedIndex].classList.remove('selected');
    }
    
    this.selectedIndex = this.selectedIndex <= 0 ? items.length - 1 : this.selectedIndex - 1;
    items[this.selectedIndex].classList.add('selected');
  }

  applySelected() {
    if (this.selectedIndex >= 0 && this.currentSuggestions[this.selectedIndex]) {
      this.applySuggestion(this.currentSuggestions[this.selectedIndex]);
    }
  }

  applySuggestion(suggestion) {
    const cursor = this.editor.getCursor();
    this.editor.replaceRange(suggestion, cursor);
    this.hidePopup();
    this.editor.focus();
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    const toggle = document.getElementById('code-completion-toggle');
    const status = document.getElementById('completion-status');
    
    if (toggle) toggle.checked = enabled;
    if (status) status.textContent = enabled ? '有効' : '無効';
    
    if (!enabled) {
      this.hidePopup();
    }
  }
}