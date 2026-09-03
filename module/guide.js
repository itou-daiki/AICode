// module/guide.js - Python ガイドのページまわり
//
// ・見出しから目次を作り、いま読んでいる場所を示す
// ・コードのかたまりに「コピー」と「試す」を付ける
//   （「試す」を押すと、そのコードが 01 実験で開く）

import { toast, urlWithCode } from './ui.js';
import { setIconLabel } from './icons.js';

/** 見出しから目次を作る */
function buildToc() {
  const links = document.getElementById('toc-links');
  const sections = [...document.querySelectorAll('.section[id]')];
  if (!links || !sections.length) return;

  for (const section of sections) {
    const heading = section.querySelector('h2');
    if (!heading) continue;

    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.textContent = heading.textContent.trim();
    link.addEventListener('click', (e) => {
      e.preventDefault();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${section.id}`);
    });
    links.appendChild(link);
  }

  // いま画面に入っている見出しを目次で光らせる
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.querySelectorAll('a').forEach(a => {
        a.classList.toggle('is-current', a.getAttribute('href') === `#${entry.target.id}`);
      });
    }
  }, { rootMargin: '-10% 0px -70% 0px' });

  sections.forEach(section => observer.observe(section));
}

/** コードのかたまりに「コピー」と「試す」を付ける */
function decorateCodeBlocks() {
  for (const block of document.querySelectorAll('.code-block')) {
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    block.parentNode.insertBefore(wrap, block);
    wrap.appendChild(block);

    const actions = document.createElement('div');
    actions.className = 'code-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    setIconLabel(copy, 'copy', 'コピー');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(block.textContent);
        toast('コードをコピーしました');
      } catch {
        toast('コピーできませんでした');
      }
    });

    const tryIt = document.createElement('button');
    tryIt.type = 'button';
    setIconLabel(tryIt, 'run', '試す');
    tryIt.title = 'このコードを 01 実験で開きます';
    tryIt.addEventListener('click', () => {
      location.href = urlWithCode('index.html', block.textContent.trim() + '\n');
    });

    actions.append(copy, tryIt);
    wrap.appendChild(actions);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  buildToc();
  decorateCodeBlocks();
});
