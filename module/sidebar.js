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
  
  // サイドバーを初期状態で開く
  aside.classList.add('open', 'normal');
  
  toggle.addEventListener('click', () => {
    aside.classList.toggle('open');
    // サイドバーが閉じられたら、幅のクラスを保持しつつ、openクラスだけ削除
    if (!aside.classList.contains('open')) {
      aside.style.width = '0';
      aside.style.padding = '0';
    } else {
      aside.style.width = '';
      aside.style.padding = '';
    }
  });
  
  // サイドバーの幅変更機能
  initSidebarResize();
  
  // チャット機能の初期化
  initChat();
}

// サイドバーのリサイズ機能
function initSidebarResize() {
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');
  
  // リサイズハンドルを作成
  const resizeHandle = document.createElement('div');
  resizeHandle.id = 'sidebar-resize-handle';
  sidebar.appendChild(resizeHandle);
  
  let isResizing = false;
  let startX, startWidth;
  
  // マウスダウンでリサイズ開始
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).width, 10);
    
    // マウスカーソルをリサイズ中に変更
    document.body.style.cursor = 'ew-resize';
    
    // テキスト選択を防止
    document.body.style.userSelect = 'none';
  });
  
  // マウス移動でリサイズ
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const width = startWidth + (e.clientX - startX);
    
    // 最小幅と最大幅を設定
    if (width >= 150 && width <= 500) {
      sidebar.style.width = `${width}px`;
      
      // サイドバーが開いていることを確認
      if (!sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        sidebar.style.padding = '';
      }
    }
  });
  
  // マウスアップでリサイズ終了
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
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
    
    // 生成中メッセージを表示
    const loadingMessageId = addLoadingMessage();
    
    // AIの応答を取得して表示
    const response = await chatWithAI(message);
    
    // 生成中メッセージを削除
    removeLoadingMessage(loadingMessageId);
    
    // AIの応答を表示
    addMessage(response, 'ai');
  }
  
  // 生成中メッセージを追加
  function addLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('chat-message', 'ai-message', 'loading-message');
    loadingDiv.textContent = '生成中...';
    
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return loadingDiv.id = 'loading-' + Date.now();
  }
  
  // 生成中メッセージを削除
  function removeLoadingMessage(id) {
    const loadingMessage = document.getElementById(id);
    if (loadingMessage) {
      loadingMessage.remove();
    }
  }
  
  // メッセージをチャット画面に追加
  function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message');
    messageDiv.classList.add(sender + '-message');
    
    // 改行を適切に処理
    const formattedText = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
    
    messageDiv.textContent = formattedText;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', initSidebar);
