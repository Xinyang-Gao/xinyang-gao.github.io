// /js/pages/friends-manager.js
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';

export class FriendsPageManager extends PageManager {
  constructor() {
    super();
    this.twikooContainer = null;
    this.copyBtnHandler = null;
  }

  async init() {
    // 初始化 Twikoo 评论（使用通用管理器）
    this.initTwikooComments();
    // 设置复制 JSON 功能
    this.setupCopyJson();
    console.log('[FriendsPageManager] 友链页面初始化完成');
  }

  /**
   * 初始化 Twikoo 评论容器
   */
  initTwikooComments() {
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    this.twikooContainer = container;
    // 调用通用管理器进行初始化（内部处理库加载和容器标记）
    initTwikoo(container).catch(err => {
      console.warn('[FriendsPageManager] Twikoo 初始化失败:', err);
    });
  }

  /**
   * 设置复制 JSON 示例按钮
   */
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
        // 降级方案：使用 textarea
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

  /**
   * 销毁页面管理器，清理资源和 Twikoo 容器
   */
  destroy() {
    // 清理复制按钮事件
    if (this.copyBtnHandler) {
      const copyBtn = document.getElementById('copyJsonBtn');
      if (copyBtn) copyBtn.removeEventListener('click', this.copyBtnHandler);
      this.copyBtnHandler = null;
    }
    // 清理 Twikoo 容器
    if (this.twikooContainer) {
      destroyTwikoo(this.twikooContainer);
      this.twikooContainer = null;
    }
    console.log('[FriendsPageManager] 友链页面管理器已销毁');
  }
}

/**
 * 初始化友链页面（供 router 调用）
 * @returns {Promise<FriendsPageManager>}
 */
export async function initFriendsPage() {
  const manager = new FriendsPageManager();
  await manager.init();
  return manager;
}