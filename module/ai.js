// module/ai.js
import { currentProblem, editor } from './editor.js';

// Geminiを使用した無料のAI統合
// 注: このデモでは、サーバーサイドプロキシを使用してAPIキーを隠すことを想定しています
const GEMINI_PROXY_ENDPOINT = '/api/gemini';

async function callGemini(prompt) {
  try {
    // 実際の実装では、サーバーサイドプロキシを使用してAPIキーを保護します
    // このデモでは、ローカルでの動作を想定して簡易的な実装をしています
    const demoResponses = {
      'explain': `# ${currentProblem.title} の解説

${currentProblem.description}を解決するためのステップ:

1. 問題を理解する: ${currentProblem.description}
2. アルゴリズムを考える: 必要な処理を順番に考えましょう
3. コードを書く: Pythonの基本構文を使って実装します
4. テストする: 入力例で動作確認しましょう

このプログラムは基本的なPythonの知識で解決できます。頑張ってください！`,
      
      'review': `# コードレビュー

良い点:
- コードの構造が明確です
- 適切な変数名を使用しています

改善点:
- コメントを追加するとさらに読みやすくなります
- エラー処理を追加するとより堅牢になります

全体的に良いコードです。引き続き頑張ってください！`
    };

    // 実際のAPIコールの代わりにデモレスポンスを返す
    if (prompt.includes('解説')) {
      return demoResponses.explain;
    } else {
      return demoResponses.review;
    }

    /* 実際のGemini API呼び出しは以下のようになります（サーバーサイドプロキシ経由）
    const res = await fetch(GEMINI_PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data.response || '応答が得られませんでした。';
    */
  } catch (e) {
    console.error('AI呼び出しエラー', e);
    return `エラー: ${e.message}`;
  }
}

export async function explainProblem() {
  document.getElementById('explanation').textContent = '生成中...';
  const prompt = `次の問題をステップで解説してください。\nタイトル: ${currentProblem.title}\n説明: ${currentProblem.description}`;
  const text = await callGemini(prompt);
  document.getElementById('explanation').innerHTML = markdownToHtml(text);
}

export async function reviewCode() {
  document.getElementById('review').textContent = '生成中...';
  const code = editor.getValue();
  const prompt = `次のPythonコードをレビューしてください。\n${code}`;
  const text = await callGemini(prompt);
  document.getElementById('review').innerHTML = markdownToHtml(text);
}

// MarkdownをシンプルなHTMLに変換する関数
function markdownToHtml(markdown) {
  return markdown
    .replace(/^# (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
