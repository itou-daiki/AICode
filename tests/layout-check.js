// tests/layout-check.js
// レイアウト崩れを見つける道具。開いているページの中で動かす（開発用）。
//
//   const m = await import('/tests/layout-check.js');
//   await m.runAll()      // そのページで状態を切りかえながら調べる
//   m.check()             // いまの見た目だけ調べる
//
// 調べること
//   ・部品が、はみ出しを隠す親の外に出て切れていないか
//   ・横に並んだ部品どうしが重なっていないか
//   ・区画の中身（エディタ・ブロック・図）が潰れていないか、ブロック画面の大きさが区画と合っているか
//   ・スクロールできない画面で、下に押し出されて見えなくなった部品がないか
//   ・字が枠からあふれていないか（「…」で切る見出しは除く）

const visible = (el) => {
  if (!el || !el.isConnected) return false;
  if (el.closest('[hidden], .loader')) return false;
  // 閉じた <details> の中身は表示されていない（見出しの summary だけ見える）
  const closed = el.closest('details:not([open])');
  if (closed && !el.closest('summary')) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0.5 && r.height > 0.5;
};

const label = (el) => {
  const id = el.id ? `#${el.id}` : '';
  const cls = [...el.classList].slice(0, 2).map(c => `.${c}`).join('');
  const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
};

/** 表示を切る親（overflow: hidden / clip）。スクロールできる親に出会ったらそこで止める */
function clipParent(el) {
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const s = getComputedStyle(p);
    const ox = s.overflowX;
    const oy = s.overflowY;
    if (/(auto|scroll)/.test(ox) || /(auto|scroll)/.test(oy)) return { el: p, scroll: true };
    if (/(hidden|clip)/.test(ox) || /(hidden|clip)/.test(oy)) return { el: p, scroll: false };
  }
  return null;
}

/**
 * 下に押し出されても、スクロールで届くか
 * スクロールできる親があり、その親が画面の中に収まっていて、
 * あいだの「隠す」入れ物で切れていないときだけ届くとみなす
 */
function reachableByScroll(el, vh) {
  const r = el.getBoundingClientRect();
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY)) return p.getBoundingClientRect().bottom <= vh + 1;
    if (/(hidden|clip)/.test(s.overflowY) && p.getBoundingClientRect().bottom < r.bottom - 1) return false;
  }
  return false;
}

/** 閉じたサイドバーなど、わざと幅 0 にしている入れ物の中か */
function insideCollapsed(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const r = p.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return true;
  }
  return false;
}

const INTERACTIVE = 'button, a, input, select, textarea, .chip, .tool-btn, .btn, .tabs button, .panel-title, .brand, .mode-switch a';

/**
 * いまの見た目を調べる
 * @returns {string[]} 見つかった崩れ
 */
export function check() {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const root = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  const pageScrollsY = !/(hidden|clip)/.test(root.overflowY) && !/(hidden|clip)/.test(bodyStyle.overflowY);

  // 1. ページの横スクロール
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`ページが横にはみ出す（${document.documentElement.scrollWidth}px > ${vw}px）`);

  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el) || insideCollapsed(el)) continue;
    if (el.closest('.blocklyWidgetDiv, .blocklyDropDownDiv, .CodeMirror, .blocklyToolboxDiv, #flowchart svg')) continue;
    const r = el.getBoundingClientRect();

    // 2. 隠す親の外に出て切れている
    const clip = clipParent(el);
    if (clip && !clip.scroll) {
      const pr = clip.el.getBoundingClientRect();
      if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) {
        issues.push(`切れている: ${label(el)}（${label(clip.el)} の外）`);
      }
    }
    // 3. 画面の外（スクロールできないページで下に押し出された）
    if (r.right > vw + 1 || r.left < -1) issues.push(`画面の横の外: ${label(el)}`);
    if (!pageScrollsY && !reachableByScroll(el, vh) && r.bottom > vh + 1) issues.push(`画面の下の外（スクロールできない）: ${label(el)}`);

    // 4. 字があふれている（「…」で切る作りのものは除く）
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') {
      issues.push(`字があふれる: ${label(el)}（${el.clientWidth}/${el.scrollWidth}）`);
    }
  }

  // 5. 見出しの字が潰れて読めない
  for (const el of document.querySelectorAll('.panel-title, .brand-name')) {
    if (!visible(el) || insideCollapsed(el)) continue;
    if (el.clientWidth < 40 && el.scrollWidth > el.clientWidth) issues.push(`見出しが潰れている: ${label(el)}（${el.clientWidth}px）`);
  }

  // 6. 横に並ぶ部品どうしの重なり（同じ親の子どうし）
  const containers = document.querySelectorAll('.topbar, .topbar-tools, .panel-head, .panel-tools, .step-bar, .tabs, #stage-tabs, .mode-switch, .answer-row, .blank-row, #workspace, #workbench, .stage-column, .side-column');
  for (const box of containers) {
    if (!visible(box) || insideCollapsed(box)) continue;
    const kids = [...box.children].filter(k => visible(k) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) issues.push(`重なっている: ${label(kids[i])} と ${label(kids[j])}（${label(box)} の中）`);
      }
    }
  }

  // 6b. 並びの中の部品が、並びの外にはみ出していないか（隠されないぶん、となりに重なる）
  const rows = document.querySelectorAll('.topbar-tools, .panel-head, .panel-tools, .step-bar, .tabs, #stage-tabs, .mode-switch, .answer-row, .blank-row, .button-group');
  for (const row of rows) {
    if (!visible(row) || insideCollapsed(row)) continue;
    if (/(auto|scroll)/.test(getComputedStyle(row).overflowX)) continue;
    const rr = row.getBoundingClientRect();
    for (const kid of row.children) {
      if (!visible(kid) || getComputedStyle(kid).position === 'absolute') continue;
      const kr = kid.getBoundingClientRect();
      if (kr.right > rr.right + 2 || kr.left < rr.left - 2) issues.push(`並びからはみ出す: ${label(kid)}（${label(row)} の外）`);
    }
  }

  // 7. 区画の中身が潰れていないか
  for (const panel of document.querySelectorAll('.panel')) {
    if (!visible(panel) || insideCollapsed(panel)) continue;
    const body = panel.querySelector(':scope > .panel-body');
    if (body && visible(body) && body.getBoundingClientRect().height < 60) {
      issues.push(`中身が潰れている: ${label(panel)}（${Math.round(body.getBoundingClientRect().height)}px）`);
    }
  }
  // ブロック画面の大きさが区画と合っているか（合わないと、ブロックが切れたり空白が出たりする）
  for (const area of document.querySelectorAll('#blockly-area')) {
    if (!visible(area)) continue;
    const svg = area.querySelector('svg.blocklySvg');
    if (!svg) continue;
    const a = area.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    if (Math.abs(a.width - s.width) > 3 || Math.abs(a.height - s.height) > 3) {
      issues.push(`ブロック画面の大きさが区画と合わない（区画 ${Math.round(a.width)}×${Math.round(a.height)} / 画面 ${Math.round(s.width)}×${Math.round(s.height)}）`);
    }
  }
  for (const cm of document.querySelectorAll('.CodeMirror')) {
    if (!visible(cm) || insideCollapsed(cm)) continue;
    const r = cm.getBoundingClientRect();
    if (r.height < 60) issues.push(`エディタが潰れている: ${label(cm.parentElement)}（${Math.round(r.height)}px）`);
  }
  const canvas = document.getElementById('canvas');
  if (canvas && visible(canvas)) {
    const r = canvas.getBoundingClientRect();
    const holder = canvas.parentElement.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) issues.push(`キャンバスが小さすぎる（${Math.round(r.width)}×${Math.round(r.height)}）`);
    if (r.right > holder.right + 1 || r.bottom > holder.bottom + 1) issues.push('キャンバスが区画からはみ出す');
  }

  return [...new Set(issues)];
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const click = async (el, ms = 650) => { if (el) { el.click(); await sleep(ms); } };
const byText = (selector, text) => [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === text);

/** サイドバーを開く・閉じる */
async function setSidebar(open) {
  const button = document.querySelector('.sidebar-toggle');
  if (!button) return;
  const isOpen = button.getAttribute('aria-expanded') === 'true';
  if (isOpen !== open) await click(button, 450);
}

/**
 * そのページで、状態を切りかえながら調べる
 * @returns {Promise<Object<string, string[]>>} 状態ごとの崩れ（崩れの無い状態は入れない）
 */
export async function runAll() {
  const results = {};
  const record = (state) => {
    const found = check();
    if (found.length) results[state] = found;
  };
  const page = location.pathname.split('/').pop() || 'index.html';

  for (const open of [false, true]) {
    await setSidebar(open);
    const side = open ? 'サイドバー開' : 'サイドバー閉';

    if (page === 'index.html') {
      for (const layout of ['4', '3', '2']) {
        await click(document.querySelector(`#layout-switch button[data-layout="${layout}"], .lane-switch button[data-layout="${layout}"]`) || byText('#layout-switch button, .lane-switch button', `${layout}面`));
        if (layout === '2') {
          for (const tab of document.querySelectorAll('#stage-tabs .tabs button')) {
            await click(tab);
            record(`${side} / 2面 / ${tab.textContent.trim()}`);
          }
        } else {
          record(`${side} / ${layout}面`);
        }
      }
      await click(byText('#layout-switch button, .lane-switch button', '4面'));
      for (const max of document.querySelectorAll('.panel-max')) {
        if (!visible(max)) continue;
        await click(max);
        record(`${side} / 拡大 ${max.dataset.panel}`);
        await click(document.querySelector('.panel.is-max .panel-max') || max);
      }
      const ktph = document.getElementById('flow-ktph');
      if (ktph && visible(ktph)) {
        await click(ktph);
        record(`${side} / 共通テスト表記`);
        await click(ktph);
      }
    }

    if (page === 'drawing.html') {
      for (const tab of document.querySelectorAll('#stage-tabs .tabs button')) {
        await click(tab, 500);
        record(`${side} / ${tab.textContent.trim()}`);
      }
      const first = document.querySelector('#stage-tabs .tabs button');
      await click(first);
      for (const max of document.querySelectorAll('.panel-max')) {
        if (!visible(max)) continue;
        await click(max);
        record(`${side} / 拡大 ${max.dataset.panel}`);
        await click(document.querySelector('.panel.is-max .panel-max') || max);
      }
    }

    if (page === 'lessons.html') {
      for (const tab of document.querySelectorAll('#program-tabs button')) {
        if (!visible(tab)) continue;
        await click(tab, 500);
        record(`${side} / ${tab.textContent.trim()}`);
      }
      await click(document.querySelector('#program-tabs button'));
    }

    if (page === 'python-guide.html' || page === 'tips.html') record(side);
  }
  return results;
}
