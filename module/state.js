// module/state.js
// 共有状態を管理するモジュール（循環依存を解消）

/**
 * アプリケーション全体で共有される状態を管理
 */
class AppState {
  constructor() {
    this.currentProblem = null;
    this.editor = null;
    this.isFreeCodingMode = false;
    this.pyodide = null;
  }

  // Getters
  getCurrentProblem() {
    return this.currentProblem;
  }

  getEditor() {
    return this.editor;
  }

  getIsFreeCodingMode() {
    return this.isFreeCodingMode;
  }

  getPyodide() {
    return this.pyodide;
  }

  // Setters
  setCurrentProblem(problem) {
    this.currentProblem = problem;
  }

  setEditor(editor) {
    this.editor = editor;
  }

  setFreeCodingMode(isFreeCoding) {
    this.isFreeCodingMode = isFreeCoding;
  }

  setPyodide(pyodide) {
    this.pyodide = pyodide;
  }
}

// シングルトンインスタンスをエクスポート
export const appState = new AppState();
