// module/sidebar.js
// サイドバーの開閉トグル制御

export function initSidebar() {
  const toggle = document.getElementById('toggle-sidebar');
  const aside  = document.getElementById('sidebar');
  toggle.addEventListener('click', () => {
    aside.classList.toggle('open');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initSidebar();
});
