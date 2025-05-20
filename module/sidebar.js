// module/sidebar.js
import { chatWithAI } from './ai.js';

function setHeaderHeight() {
  const header = document.querySelector('header');
  document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
}

function initSidebar() {
  setHeaderHeight();
  const toggle = document.getElementById('toggle-sidebar');
  const aside = document.getElementById('sidebar');
  toggle.addEventListener('click', () => aside.classList.toggle('open'));
  
  // サイドバーの幅変更機能
  initSidebarResize();
  
  // チャット機能の初期化
  initChat();
}

// サイドバーの幅変更機能
function initSidebarResize() {
  const sidebar = document.getElementById('sidebar');
  const narrowBtn = document.getElementById('narrow-sidebar');
  const normalBtn = document.getElementById('normal-sidebar');
  const wideBtn = document.getElementById('wide-sidebar');
  
  // 幅変更ボタンのイベントリスナー
  narrowBtn.addEventListener('click', () => {
    sidebar.classList.remove('normal', 'wide');
    sidebar.classList.add('narrow', 'open');
    updateActiveButton(narrowBtn);
  });
  
  normalBtn.addEventListener('click', () => {
    sidebar.classList.remove('narrow', 'wide');
    sidebar.classList.add('normal', 'open');
    updateActiveButton(normalBtn);
  });
  
  wideBtn.addEventListener('click', () => {
    sidebar.classList.remove('narrow', 'normal');
    sidebar.classList.add('wide', 'open');
    updateActiveButton(wideBtn);
  });
}

// アクティブなボタンを更新
function updateActiveButton(activeBtn) {
  const buttons = document.querySelectorAll('#sidebar-resize button');
  buttons.forEach(btn => btn.classList.remove('active'));
  activeBtn.classList.add('active');
}

// チャット機能の初期化
function initChat() {
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatMessages = document.getElementById('chat-messages');
  
  // 送信ボタンのイベントリスナー
  chatSend.addEventListener('click', sendMessage);
  
  // Enterキーでも送信できるようにする
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // メッセージ送信処理
  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // ユーザーメッセージをチャット画面に追加
    addMessage(message, 'user');
    chatInput.value = '';
    
    // AIの応答を取得して表示
    const response = await chatWithAI(message);
    addMessage(response, 'ai');
  }
  
  // メッセージをチャット画面に追加
  function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message');
    messageDiv.classList.add(sender + '-message');
    messageDiv.textContent = text;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', initSidebar);
