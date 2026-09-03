// module/ktph-mode.js
// 共通テスト用プログラム表記に、色をつけるための決まり（CodeMirror のモード）。
//
// 表記は Python ではないので、Python のモードだと「もし」「ならば」に色がつかない。
// 試験と同じ見た目で読めるように、専用の決まりを用意する。

/** 制御にあたる言葉（Python の if / for にあたる） */
const CONTROL = [
  'そうでなくもし', 'そうでなければ', 'ずつ増やしながら繰り返す', 'ずつ減らしながら繰り返す',
  'の間繰り返す', 'もし', 'ならば', 'から', 'まで', 'を',
];

/** はじめから使える関数 */
const BUILTIN = [
  '【外部からの入力】', '表示する', '要素数', '整数', '実数', '文字列', '乱数',
];

/**
 * CodeMirror に 'ktph' モードを登録する
 * @param {object} CodeMirror
 */
export function defineKtphMode(CodeMirror) {
  if (!CodeMirror || CodeMirror.modes.ktph) return;

  CodeMirror.defineMode('ktph', () => ({
    token(stream) {
      // 行のはじめの縦線（ブロックの範囲を示す印）
      if (stream.sol() && stream.match(/^[\s│｜|└⎿∟]+/)) return 'comment';

      if (stream.eatSpace()) return null;

      // コメント
      if (stream.peek() === '#') { stream.skipToEnd(); return 'comment'; }

      // 文字列
      if (stream.peek() === '"' || stream.peek() === "'") {
        const quote = stream.next();
        let escaped = false;
        while (!stream.eol()) {
          const ch = stream.next();
          if (ch === quote && !escaped) break;
          escaped = ch === '\\' && !escaped;
        }
        return 'string';
      }

      // 穴埋めの空欄（【ア】など）と、はじめから使える関数
      for (const word of BUILTIN) {
        if (stream.match(word)) return 'builtin';
      }
      if (stream.match(/^【[^】]*】/)) return 'variable-2';

      // 制御の言葉
      for (const word of CONTROL) {
        if (stream.match(word)) return 'keyword';
      }
      if (stream.match(/^(and|or|not)\b/)) return 'keyword';

      // 数
      if (stream.match(/^\d+(\.\d+)?/)) return 'number';

      // 名前（配列は先頭が大文字）
      if (stream.match(/^[A-Z]\w*/)) return 'def';
      if (stream.match(/^[A-Za-z_]\w*/)) return 'variable';

      stream.next();
      return null;
    },
  }));
}
