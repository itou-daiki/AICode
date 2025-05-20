// module/ai.js
import { currentProblem, editor } from './editor.js';

// Gemini APIの設定
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
let apiKey = localStorage.getItem('gemini_api_key') || '';

// チャット履歴
let chatHistory = [];

// APIキー保存処理の初期化
function initApiKeyForm() {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-api-key');
  const statusDiv = document.getElementById('api-key-status');
  
  // 保存済みのAPIキーがあれば表示
  if (apiKey) {
    apiKeyInput.value = apiKey;
    statusDiv.textContent = 'APIキーが設定されています';
    statusDiv.style.color = 'green';
  }
  
  // 保存ボタンのイベントリスナー
  saveButton.addEventListener('click', () => {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
      apiKey = newApiKey;
      localStorage.setItem('gemini_api_key', apiKey);
      statusDiv.textContent = 'APIキーを保存しました';
      statusDiv.style.color = 'green';
    } else {
      statusDiv.textContent = 'APIキーを入力してください';
      statusDiv.style.color = 'red';
    }
  });
}

// ページ読み込み時にAPIキーフォームを初期化
window.addEventListener('DOMContentLoaded', initApiKeyForm);

async function callGemini(prompt) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      const demoResponses = {
        'explain': `# ${currentProblem.title} の解説

${currentProblem.description}を解決するためのステップ:

1. 問題を理解する: ${currentProblem.description}
2. アルゴリズムを考える: 必要な処理を順番に考えましょう
3. コードを書く: Pythonの基本構文を使って実装します
4. テストする: 入力例で動作確認しましょう

このプログラムは基本的なPythonの知識で解決できます。頑張ってください！

※この解説はAIによって生成されました。より詳しい解説が必要な場合は、再度生成ボタンをクリックしてください。`,
        
        'review': `# コードレビュー

良い点:
- コードの構造が明確です
- 適切な変数名を使用しています

改善点:
- コメントを追加するとさらに読みやすくなります
- エラー処理を追加するとより堅牢になります

全体的に良いコードです。引き続き頑張ってください！

※このレビューはAIによって生成されました。より詳しいレビューが必要な場合は、再度生成ボタンをクリックしてください。`
      };

      // デモレスポンスを返す
      if (prompt.includes('解説')) {
        return demoResponses.explain;
      } else {
        return demoResponses.review;
      }
    }

    // APIキーがある場合は実際にGemini APIを呼び出す
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || response.statusText);
    }
    
    // レスポンスからテキストを抽出
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error('予期しないレスポンス形式:', data);
      return 'APIからの応答を処理できませんでした。';
    }
  } catch (e) {
    console.error('AI呼び出しエラー', e);
    return `エラー: ${e.message}`;
  }
}

export async function explainProblem() {
  document.getElementById('explanation').textContent = '生成中...';
  const prompt = `次の問題をステップで解説してください。詳細かつ教育的な解説を生成してください。\nタイトル: ${currentProblem.title}\n説明: ${currentProblem.description}`;
  const text = await callGemini(prompt);
  document.getElementById('explanation').innerHTML = markdownToHtml(text);
}

export async function reviewCode() {
  document.getElementById('review').textContent = '生成中...';
  const code = editor.getValue();
  const prompt = `次のPythonコードを詳細にレビューしてください。良い点と改善点を具体的に指摘し、教育的なフィードバックを提供してください。\n${code}`;
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

// チャット機能
export async function chatWithAI(message) {
  try {
    // APIキーがない場合はデモレスポンスを返す
    if (!apiKey) {
      return "APIキーが設定されていないため、チャット機能は利用できません。APIキーを設定してください。";
    }

    // チャット履歴に追加
    chatHistory.push({ role: 'user', parts: [{ text: message }] });
    
    // チャット履歴が長すぎる場合は古いものを削除
    if (chatHistory.length > 10) {
      chatHistory = chatHistory.slice(chatHistory.length - 10);
    }

    // APIリクエスト
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          ...chatHistory
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || response.statusText);
    }
    
    // レスポンスからテキストを抽出
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      const aiResponse = data.candidates[0].content.parts[0].text;
      
      // AIの応答をチャット履歴に追加
      chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
      
      return aiResponse;
    } else {
      console.error('予期しないレスポンス形式:', data);
      return 'APIからの応答を処理できませんでした。';
    }
  } catch (e) {
    console.error('チャットエラー', e);
    return `エラー: ${e.message}`;
  }
}
