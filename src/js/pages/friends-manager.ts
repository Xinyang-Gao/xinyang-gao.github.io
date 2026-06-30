// /js/pages/friends-manager.js
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';

export class FriendsPageManager extends PageManager {
  constructor() {
    super();
    this.twikooContainer = null;
    this.copyBtnHandler = null;
    // 新增：友链容器与定时器
    this.container = null;
    this.randomTimer = null;
  }

  async init() {
    this.initTwikooComments();
    this.setupCopyJson();
    this.setupRandomSort(); // 新增随机排序
    console.log('[FriendsPageManager] 友链页面初始化完成');
  }

  /**
   * 初始化 Twikoo 评论容器
   */
  initTwikooComments() {
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    this.twikooContainer = container;
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

  // ========== 新增：随机排序相关方法 ==========

  /**
   * 设置随机排序：首次打乱 + 每 10 秒轮换
   */
  setupRandomSort() {
    const container = document.getElementById('friends-list-container-inner');
    if (!container) {
      console.warn('[FriendsPageManager] 未找到友链容器，跳过随机排序');
      return;
    }
    this.container = container;

    // 首次随机
    this.applyRandomSort();

    // 启动定时轮换（10 秒）
    this.randomTimer = setInterval(() => {
      this.applyRandomSort();
    }, 10000);
  }

  /**
   * 执行一次随机排序（若鼠标悬停则跳过）
   */
  applyRandomSort() {
    if (!this.container) return;

    // 检查是否有任意友链卡片处于鼠标悬浮状态
    if (document.querySelector('.friend-card:hover')) {
      return; // 有悬浮，本次跳过
    }

    const children = Array.from(this.container.children);
    if (children.length <= 1) return;

    // Fisher–Yates 洗牌算法
    for (let i = children.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [children[i], children[j]] = [children[j], children[i]];
    }

    // 重新追加（移动 DOM 节点，保留所有事件与属性）
    children.forEach(child => this.container.appendChild(child));
  }

  /**
   * 销毁页面管理器，清理资源
   */
  destroy() {
    // 清理复制按钮事件
    if (this.copyBtnHandler) {
      const copyBtn = document.getElementById('copyJsonBtn');
      if (copyBtn) copyBtn.removeEventListener('click', this.copyBtnHandler);
      this.copyBtnHandler = null;
    }

    // 清理 Twikoo
    if (this.twikooContainer) {
      destroyTwikoo(this.twikooContainer);
      this.twikooContainer = null;
    }

    // 清理定时器
    if (this.randomTimer) {
      clearInterval(this.randomTimer);
      this.randomTimer = null;
    }
    this.container = null;

    console.log('[FriendsPageManager] 友链页面管理器已销毁');
  }
}

/**
 * 初始化友链页面（供 router 调用）
 */
export async function initFriendsPage() {
  const manager = new FriendsPageManager();
  await manager.init();
  return manager;
}