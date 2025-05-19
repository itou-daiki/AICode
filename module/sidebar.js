// module/sidebar.js

// ヘッダー高さを取得してCSS変数に設定
function setHeaderHeight() {
  const header = document.querySelector('header');
  document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
}

// サイドバー開閉トグル
function initSidebar() {
  setHeaderHeight();
  const toggle = document.getElementById('toggle-sidebar');
  const aside = document.getElementById('sidebar');
  toggle.addEventListener('click', () => {
    aside.classList.toggle('open');
  });
}

window.addEventListener('DOMContentLoaded', initSidebar);