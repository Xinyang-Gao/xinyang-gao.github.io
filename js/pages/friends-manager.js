// /js/pages/friends-manager.js
import { PageManager } from '/js/core/page-manager.js';

export class FriendsPageManager extends PageManager {
  constructor() {
    super();
    this.twikooInitialized = false;
    this.copyBtnHandler = null;
  }

  async init() {
    // 等待 Twikoo 库加载（如果尚未加载）
    await this.waitForTwikoo();
    this.initTwikooComments();
    this.setupCopyJson();
    console.log('[FriendsPageManager] 友链页面初始化完成');
  }

  waitForTwikoo() {
    if (typeof twikoo !== 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (typeof twikoo !== 'undefined') {
          clearInterval(check);
          resolve();
        }
      }, 100);
      // 超时 5 秒后放弃
      setTimeout(() => {
        clearInterval(check);
        console.warn('[FriendsPageManager] Twikoo 加载超时');
        resolve();
      }, 5000);
    });
  }

  initTwikooComments() {
    const container = document.getElementById('twikoo-comments');
    if (!container || this.twikooInitialized) return;
    if (container.getAttribute('data-init') === 'true') return;
    container.setAttribute('data-init', 'true');
    twikoo.init({
      envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
      el: '#twikoo-comments',
      lang: 'zh-CN',
      enableComment: true,
    }).then(() => {
      console.log('Twikoo 留言板初始化成功 (friends页面)');
      this.twikooInitialized = true;
    }).catch(err => {
      console.error('Twikoo 初始化失败:', err);
    });
  }

  setupCopyJson() {
    const copyBtn = document.getElementById('copyJsonBtn');
    if (!copyBtn) return;
    const codeElement = document.getElementById('friendJsonExample');
    const originalText = codeElement?.innerText || '';
    const handler = async () => {
      try {
        await navigator.clipboard.writeText(originalText);
        const originalBtnText = copyBtn.innerText;
        copyBtn.innerText = '已复制';
        copyBtn.style.background = 'var(--accent-color)';
        copyBtn.style.color = 'white';
        setTimeout(() => {
          copyBtn.innerText = originalBtnText;
          copyBtn.style.background = '';
          copyBtn.style.color = '';
        }, 1800);
      } catch (err) {
        console.error('复制失败', err);
        const textarea = document.createElement('textarea');
        textarea.value = originalText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.innerText = '已复制';
        setTimeout(() => { copyBtn.innerText = '复制'; }, 1200);
      }
    };
    if (this.copyBtnHandler) copyBtn.removeEventListener('click', this.copyBtnHandler);
    copyBtn.addEventListener('click', handler);
    this.copyBtnHandler = handler;
  }

  destroy() {
    if (this.copyBtnHandler) {
      const copyBtn = document.getElementById('copyJsonBtn');
      if (copyBtn) copyBtn.removeEventListener('click', this.copyBtnHandler);
      this.copyBtnHandler = null;
    }
    this.twikooInitialized = false;
  }
}

export async function initFriendsPage() {
  const manager = new FriendsPageManager();
  await manager.init();
  return manager;
}