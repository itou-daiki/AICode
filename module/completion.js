// module/completion.js
import { callGemini } from './ai.js';

export class CodeCompletionEngine {
  constructor(editor) {
    this.editor = editor;
    this.isEnabled = true;
    this.autoCompletionEnabled = true;
    this.debounceTimer = null;
    this.cache = new Map();
    this.popup = null;
    this.currentSuggestions = [];
    this.selectedIndex = -1;
    this.inlineWidget = null;
    this.currentInlineSuggestion = null;
    
    this.initPopup();
    this.bindEvents();
  }

  initPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'code-completion-popup';
    document.body.appendChild(this.popup);
  }

  bindEvents() {
    // コード補完トグルスイッチのイベント
    const toggle = document.getElementById('code-completion-toggle');
    const status = document.getElementById('completion-status');
    
    toggle.addEventListener('change', (e) => {
      this.isEnabled = e.target.checked;
      this.autoCompletionEnabled = e.target.checked; // 一つのボタンで両方制御
      status.textContent = this.isEnabled ? '有効' : '無効';
      if (!this.isEnabled) {
        this.hidePopup();
        this.hideInlineSuggestion();
      }
      
      // AIコード修正ボタンの状態も更新
      const aiFixBtn = document.getElementById('ai-fix-code');
      if (aiFixBtn) {
        aiFixBtn.disabled = !this.isEnabled;
        aiFixBtn.style.opacity = this.isEnabled ? '1' : '0.5';
        aiFixBtn.title = this.isEnabled ? 'AIがコードを最適化します' : 'コード補完をONにしてください';
      }
    });

    // エディタイベント
    this.editor.on('inputRead', (cm, event) => {
      if (!this.isEnabled || !this.autoCompletionEnabled) return;
      
      // 特定の文字での自動補完トリガー
      const triggerChars = ['.', '(', '[', ' '];
      const lastChar = event.text[0];
      
      if (triggerChars.includes(lastChar) || event.text[0].length > 1) {
        this.debouncedCompletion();
      }
    });

    // キーボードイベント
    this.editor.on('keydown', (cm, event) => {
      if (!this.isEnabled) return;

      // Ctrl+I で手動補完（IntelliSenseのI）
      if (event.ctrlKey && event.code === 'KeyI') {
        event.preventDefault();
        this.requestCompletion();
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

    // エディタのカーソル移動でインライン補完を隠す
    this.editor.on('cursorActivity', () => {
      if (this.currentInlineSuggestion) {
        this.hideInlineSuggestion();
      }
    });
  }

  debouncedCompletion() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.requestCompletion();
    }, 500); // 500ms デバウンス（高速化のため短縮）
  }

  async requestCompletion() {
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
      this.showSuggestions(this.cache.get(cacheKey), cursor);
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
      
      // 候補が1つの場合はインライン表示、複数の場合はポップアップ表示
      if (suggestions.length === 1) {
        this.showInlineSuggestion(suggestions[0], cursor);
      } else if (suggestions.length > 1) {
        this.showSuggestions(suggestions, cursor);
      }
    } catch (error) {
      console.error('補完生成エラー:', error);
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
    if (lastWord === 'print') {
      completions.push('print()', 'print("")');
    } else if (lastWord === 'input') {
      completions.push('input()', 'input("")');
    } else if (lastWord === 'if') {
      completions.push('if True:', 'if __name__ == "__main__":');
    } else if (lastWord === 'for') {
      completions.push('for i in range():', 'for item in ');
    } else if (lastWord === 'def') {
      completions.push('def function_name():', 'def main():');
    } else if (beforeCursor.includes('.')) {
      completions.push('append()', 'split()', 'strip()', 'replace()', 'join()');
    } else {
      // 一般的なPythonキーワード
      completions.push('print()', 'input()', 'len()', 'range()', 'str()', 'int()', 'float()');
    }
    
    return completions.slice(0, 5);
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
    
    const line = this.editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    
    // 補完テキストを表示
    this.currentInlineSuggestion = suggestion;
    
    // CodeMirrorのマーカーを使用してインライン表示
    const from = { line: cursor.line, ch: cursor.ch };
    const to = { line: cursor.line, ch: cursor.ch };
    
    // 薄い色のテキストを挿入
    const widget = document.createElement('span');
    widget.className = 'inline-suggestion';
    widget.textContent = suggestion;
    widget.style.color = '#666';
    widget.style.fontStyle = 'italic';
    widget.style.opacity = '0.8';
    
    this.inlineWidget = this.editor.setBookmark(from, {
      widget: widget,
      insertLeft: false
    });
  }

  hideInlineSuggestion() {
    if (this.inlineWidget) {
      this.inlineWidget.clear();
      this.inlineWidget = null;
    }
    this.currentInlineSuggestion = null;
  }

  acceptInlineSuggestion() {
    if (this.currentInlineSuggestion) {
      const cursor = this.editor.getCursor();
      this.editor.replaceRange(this.currentInlineSuggestion, cursor);
      this.hideInlineSuggestion();
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