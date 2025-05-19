// module/ai.js
import { currentProblem, editor } from './editor.js';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(prompt, apiKey) {
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [ { role: 'user', content: prompt } ]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || res.statusText);
    return data.choices?.[0]?.message?.content || '応答が得られませんでした。';
  } catch (e) {
    console.error('OpenAI呼び出しエラー', e);
    return `エラー: ${e.message}`;
  }
}

export async function explainProblem() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) return alert('APIキーを入力してください');
  const prompt = `次の問題をステップで解説してください。\nタイトル: ${currentProblem.title}\n説明: ${currentProblem.description}`;
  const text = await callOpenAI(prompt, apiKey);
  document.getElementById('explanation').textContent = text;
}

export async function reviewCode() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) return alert('APIキーを入力してください');
  const code = editor.getValue();
  const prompt = `次のPythonコードをレビューしてください。\n${code}`;
  const text = await callOpenAI(prompt, apiKey);
  document.getElementById('review').textContent = text;
}