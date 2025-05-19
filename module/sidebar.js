// module/sidebar.js
export function initSidebar() {
  // ヘッダー高さをCSS変数に設定
  const header = document.querySelector('header');
  document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
  const toggle = document.getElementById('toggle-sidebar');
  const aside = document.getElementById('sidebar');
  toggle.addEventListener('click', () => aside.classList.toggle('open'));
}

window.addEventListener('DOMContentLoaded', initSidebar);