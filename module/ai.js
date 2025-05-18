// module/ai.js
// OpenAI API を用いた問題解説・コードレビュー

const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(prompt, apiKey) {
  const res = await fetch(openaiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content
    || '応答が得られませんでした。';
}

export async function explainProblem() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) {
    alert('APIキーを入力してください');
    return;
  }
  const prompt =
    `次の問題をステップで解説してください。\n` +
    `タイトル: ${currentProblem.title}\n` +
    `説明: ${currentProblem.description}`;
  const explanation = await callOpenAI(prompt, apiKey);
  document.getElementById('explanation').textContent = explanation;
}

export async function reviewCode() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) {
    alert('APIキーを入力してください');
    return;
  }
  const code = editor.getValue();
  const prompt = `次のPythonコードをレビューしてください。\n${code}`;
  const review = await callOpenAI(prompt, apiKey);
  document.getElementById('review').textContent = review;
}
