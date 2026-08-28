// module/grade.js
// 答え合わせ。
//
// 期待される出力は問題ファイルに書いてあるので、AI は要らない。
// AI に判定させていたころは、APIキーが無いと答え合わせそのものができなかった。

/**
 * 期待される出力と、実際の出力を見くらべる
 *
 * 見た目だけのちがい（行末の空白・改行コード・末尾の空行）は同じとみなす。
 * 合っているのに「不正解」と言われるのが、いちばん学習の妨げになるため。
 *
 * @param {string} actual 実際の出力
 * @param {string} expected 期待される出力
 * @returns {boolean}
 */
export function sameOutput(actual, expected) {
  return tidy(actual) === tidy(expected);
}

/**
 * 見くらべる前に、出力の見た目をそろえる
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .trim();
}
