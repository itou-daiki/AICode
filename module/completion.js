// module/completion.js
import { callGemini } from './ai.js';

export class CodeCompletionEngine {
  constructor(editor) {
    try {
      console.log('CodeCompletionEngine コンストラクタ呼び出し', editor);
      this.editor = editor;
      this.completionMode = 'inline-only'; // デフォルトをインライン補完のみに変更
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
    const words = beforeCursor.trim().split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    const secondLastWord = words.length > 1 ? words[words.length - 2] : '';
    
    // 基本的なPython補完 - 部分マッチをより細かく
    if (lastWord.startsWith('p') && 'print'.startsWith(lastWord)) {
      completions.push('print()', 'print("")', 'print(f"")');
    } else if (lastWord.startsWith('i') && 'input'.startsWith(lastWord)) {
      completions.push('input()', 'input("")');
    } else if (lastWord.startsWith('l') && 'len'.startsWith(lastWord)) {
      completions.push('len()');
    } else if (lastWord.startsWith('r') && 'range'.startsWith(lastWord)) {
      completions.push('range()', 'range(10)');
    } else if (lastWord.startsWith('s') && 'str'.startsWith(lastWord)) {
      completions.push('str()');
    } else if (lastWord === 'if' || (lastWord.startsWith('i') && 'if'.startsWith(lastWord))) {
      completions.push('if', 'if True:', 'if __name__ == "__main__":');
    } else if (lastWord === 'for' || (lastWord.startsWith('f') && 'for'.startsWith(lastWord))) {
      // forの場合は完全な文として提供
      completions.push('for', 'for i in range(10):', 'for item in list:');
    } else if (lastWord === 'def' || (lastWord.startsWith('d') && 'def'.startsWith(lastWord))) {
      completions.push('def', 'def function():', 'def main():');
    } else if (lastWord === 'class' || (lastWord.startsWith('c') && 'class'.startsWith(lastWord))) {
      completions.push('class', 'class MyClass:');
    } else if (lastWord === 'import' || (lastWord.startsWith('i') && 'import'.startsWith(lastWord) && lastWord.length > 1)) {
      completions.push('import', 'import os', 'import sys');
    } else if (lastWord === 'from' || (lastWord.startsWith('f') && 'from'.startsWith(lastWord) && lastWord !== 'for')) {
      completions.push('from', 'from os import', 'from sys import');
    } else if (secondLastWord === 'import' || beforeCursor.includes('from ')) {
      // import文の補完
      completions.push('os', 'sys', 'math', 'random', 'json', 'datetime');
    } else if (lastWord === 'try' || (lastWord.startsWith('t') && 'try'.startsWith(lastWord))) {
      completions.push('try:');
    } else if (lastWord === 'except' || (lastWord.startsWith('e') && 'except'.startsWith(lastWord))) {
      completions.push('except:', 'except Exception:');
    } else if (lastWord === 'while' || (lastWord.startsWith('w') && 'while'.startsWith(lastWord))) {
      completions.push('while', 'while True:');
    } else if (lastWord === 'with' || (lastWord.startsWith('w') && 'with'.startsWith(lastWord) && lastWord !== 'while')) {
      completions.push('with', 'with open() as f:');
    } else if (beforeCursor.includes('.')) {
      // メソッド補完
      completions.push('append()', 'split()', 'strip()', 'replace()', 'join()', 'lower()', 'upper()');
    } else if (lastWord.length === 0) {
      // 何も入力されていない場合の一般的なPython候補
      completions.push('print()', 'input()', 'len()', 'range()', 'str()', 'if', 'for', 'def');
    }
    
    // モードに応じて返す候補数を調整
    if (this.completionMode === 'inline-only') {
      return completions.slice(0, 1); // インライン用に1つだけ
    } else {
      return completions.slice(0, 5); // 複数候補用に最大5つ
    }
  }

  // スペースが必要かどうかを判断するヘルパーメソッド
  needsSpaceAfter(suggestion, beforeCursor, afterCursor) {
    // Python キーワードでスペースが必要なもの
    const keywordsNeedingSpace = [
      'if', 'elif', 'else:', 'for', 'while', 'def', 'class', 
      'import', 'from', 'try:', 'except:', 'finally:', 'with',
      'lambda', 'return', 'yield', 'raise', 'assert', 'del',
      'global', 'nonlocal', 'pass', 'break', 'continue'
    ];
    
    // 関数呼び出しや演算子でスペースが不要なもの
    const noSpacePatterns = [
      /.*\(\)$/,        // 関数呼び出し: print(), input()
      /.*\[\]$/,        // リストアクセス: list[]
      /.*\.\w+$/,       // メソッド呼び出し: str.split
      /.*[+\-*/=%<>!]=?$/, // 演算子
      /.*[,;:]$/,       // 区切り文字
      /.*["'].*["']$/   // 文字列リテラル
    ];
    
    // カーソル直後の文字を確認
    const nextChar = afterCursor.charAt(0);
    
    // 1. 既に適切な文字が続いている場合はスペース不要
    if (nextChar && /[(),[\];:.]/.test(nextChar)) {
      return false;
    }
    
    // 2. 関数呼び出しや演算子パターンの場合はスペース不要
    for (const pattern of noSpacePatterns) {
      if (pattern.test(suggestion)) {
        return false;
      }
    }
    
    // 3. Pythonキーワードの場合はスペース必要
    const trimmedSuggestion = suggestion.replace(/:$/, ''); // コロンを除去して判定
    if (keywordsNeedingSpace.includes(trimmedSuggestion) || keywordsNeedingSpace.includes(suggestion)) {
      return true;
    }
    
    // 4. コロンで終わる場合（制御構文）はスペース不要（改行が適切）
    if (suggestion.endsWith(':')) {
      return false;
    }
    
    // 5. デフォルトは前後の文脈から判断
    const wordBefore = beforeCursor.trim().split(/\s+/).pop();
    
    // import文の場合はスペース必要
    if (wordBefore === 'import' || wordBefore === 'from') {
      return true;
    }
    
    // その他の場合はスペース不要
    return false;
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
    
    // カーソル位置前のテキストを取得
    const line = this.editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1] || '';
    
    // インライン表示する部分を計算
    let completionPart = '';
    
    if (currentWord.length > 0) {
      if (suggestion.startsWith(currentWord)) {
        // 候補が現在の単語で始まる場合 -> 残りの部分を表示
        completionPart = suggestion.substring(currentWord.length);
      } else if (suggestion.includes(currentWord)) {
        // 候補に現在の単語が含まれる場合 -> 全体を表示
        // この場合は、現在の単語を置換する必要があることを示すため、
        // 特別な表示をする（例：全体を表示）
        completionPart = suggestion;
        // 現在の単語を保存して後で置換に使用
        this.wordToReplace = currentWord;
      } else {
        // 関係ない場合は全体を表示
        completionPart = suggestion;
      }
    } else {
      // 現在の単語がない場合は全体を表示
      completionPart = suggestion;
    }
    
    // 補完部分がない場合は表示しない
    if (!completionPart) {
      return;
    }
    
    // 補完テキストを保存
    this.currentInlineSuggestion = completionPart;
    this.originalCursorPos = cursor;
    this.fullSuggestion = suggestion; // 完全な候補も保存
    
    // インライン補完要素を作成
    const inlineElement = document.createElement('span');
    inlineElement.textContent = completionPart;
    inlineElement.style.cssText = 'color: #999; opacity: 0.7; font-style: italic; pointer-events: none;';
    inlineElement.className = 'inline-suggestion-highlight';
    
    // カーソル位置にウィジェットとして挿入
    this.inlineWidget = this.editor.setBookmark(cursor, {
      widget: inlineElement,
      insertLeft: false
    });
  }

  hideInlineSuggestion() {
    if (this.inlineWidget) {
      this.inlineWidget.clear();
      this.inlineWidget = null;
    }
    this.currentInlineSuggestion = null;
    this.originalCursorPos = null;
  }

  acceptInlineSuggestion() {
    if (this.currentInlineSuggestion && this.inlineWidget) {
      // ウィジェットをクリア
      this.inlineWidget.clear();
      this.inlineWidget = null;
      
      // 現在のカーソル位置と前後のテキストを取得
      const cursor = this.editor.getCursor();
      const line = this.editor.getLine(cursor.line);
      const beforeCursor = line.substring(0, cursor.ch);
      const afterCursor = line.substring(cursor.ch);
      const words = beforeCursor.split(/\s+/);
      const currentWord = words[words.length - 1] || '';
      
      // 使用する候補を決定
      const suggestionToUse = this.fullSuggestion || (currentWord + this.currentInlineSuggestion);
      
      // 置換範囲を決定
      let replaceFrom = cursor;
      let replaceTo = cursor;
      let textToInsert = this.currentInlineSuggestion;
      
      if (this.wordToReplace || (currentWord.length > 0 && this.fullSuggestion && this.fullSuggestion.includes(currentWord))) {
        // 単語を置換する必要がある場合
        const wordStart = cursor.ch - currentWord.length;
        replaceFrom = { line: cursor.line, ch: wordStart };
        replaceTo = cursor;
        textToInsert = suggestionToUse;
      }
      
      // スペースが必要かどうかを判断
      const needsSpace = this.needsSpaceAfter(suggestionToUse, beforeCursor, afterCursor);
      if (needsSpace) {
        textToInsert += ' ';
      }
      
      // テキストを置換/挿入
      this.editor.replaceRange(textToInsert, replaceFrom, replaceTo);
      
      // カーソルを適切な位置に移動
      const newCursor = { line: replaceFrom.line, ch: replaceFrom.ch + textToInsert.length };
      this.editor.setCursor(newCursor);
      
      // クリーンアップ
      this.currentInlineSuggestion = null;
      this.fullSuggestion = null;
      this.wordToReplace = null;
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
    
    // カーソル位置前後のテキストを取得
    const line = this.editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    const afterCursor = line.substring(cursor.ch);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1] || '';
    
    // 挿入するテキストを準備
    let textToInsert = suggestion;
    let replaceFrom, replaceTo;
    
    // 置換範囲を決定するロジック
    if (currentWord.length > 0) {
      // 現在の単語がある場合の判定
      if (suggestion.startsWith(currentWord)) {
        // 候補が現在の単語で始まる場合 -> 拡張（例: "p" -> "print()"）
        const wordStart = cursor.ch - currentWord.length;
        replaceFrom = { line: cursor.line, ch: wordStart };
        replaceTo = cursor;
      } else if (suggestion.includes(currentWord)) {
        // 候補に現在の単語が含まれる場合 -> 置換（例: "for" -> "for i in range(10):"）
        const wordStart = cursor.ch - currentWord.length;
        replaceFrom = { line: cursor.line, ch: wordStart };
        replaceTo = cursor;
      } else {
        // 候補が現在の単語と関係ない場合 -> 追加
        replaceFrom = cursor;
        replaceTo = cursor;
      }
    } else {
      // 現在の単語がない場合 -> 追加
      replaceFrom = cursor;
      replaceTo = cursor;
    }
    
    // スペースが必要かどうかを判断
    const needsSpace = this.needsSpaceAfter(suggestion, beforeCursor, afterCursor);
    if (needsSpace) {
      textToInsert += ' ';
    }
    
    // テキストを置換
    this.editor.replaceRange(textToInsert, replaceFrom, replaceTo);
    
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