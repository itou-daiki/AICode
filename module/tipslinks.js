// module/tipslinks.js
// サイドバーに出す「つまずき解説」へのリンク。01・02・03 で同じものを使う。
//
// 説明そのものは tips.html にまとめ、動かして確かめられるようにしてある。
// サイドバーは狭いので、ここでは入口だけを置く。作業中のコードを残したまま読めるよう、別のタブで開く。

const LINKS = [
  ['indent', '字下げ（インデント）とまとまり', true],
  ['assign', '「=」と「==」のちがい'],
  ['input', 'input() は文字列（5 と 3 で 53）'],
  ['range', 'range と番号（1 つずれる）'],
  ['reset', '合計が合わない（0 に戻している）'],
  ['return', 'print と return のちがい'],
  ['loop', '止まらないくり返し'],
  ['errors', 'エラーメッセージの読み方'],
  ['finder', 'こんなときは（困りごとから探す）'],
];

/**
 * リストをサイドバーに足す
 * @param {HTMLElement} sidebar ここに足す
 * @param {HTMLElement|null} [before] この部品の前に入れる（無ければ最後に足す）
 */
export function addTipsLinks(sidebar, before = null) {
  if (!sidebar) return;
  const details = document.createElement('details');
  details.className = 'expander';
  const summary = document.createElement('summary');
  summary.innerHTML = '<svg viewBox="0 0 20 20" class="icon" aria-hidden="true"><path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9z"/><path d="M8 17h4"/></svg>つまずき解説（動かして学ぶ）';
  const body = document.createElement('div');
  body.className = 'expander-body stack';
  const lead = document.createElement('p');
  lead.className = 'muted';
  lead.textContent = 'よくつまずくところを、1 行ずつ動く例で説明しています（別のタブで開きます）。';
  const list = document.createElement('nav');
  list.className = 'tips-links';
  list.setAttribute('aria-label', 'つまずき解説');
  for (const [id, label, main] of LINKS) {
    const a = document.createElement('a');
    a.href = `tips.html#${id}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    if (main) a.classList.add('is-main');
    list.appendChild(a);
  }
  body.append(lead, list);
  details.append(summary, body);
  sidebar.insertBefore(details, before && before.parentElement === sidebar ? before : null);
}
