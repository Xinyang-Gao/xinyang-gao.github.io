// /js/pages/friends-manager.ts
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';
import { bindJumpTriggers } from '/js/ui/jump-dialog.js';

export class FriendsPageManager extends PageManager {
  private twikooContainer: HTMLElement | null = null;
  private copyBtnHandler: ((this: HTMLElement, ev: MouseEvent) => Promise<void>) | null = null;
  private container: HTMLElement | null = null;
  private randomTimer: number | null = null;
  private jumpUnbind: (() => void) | null = null;

  async init(): Promise<void> {
    this.initTwikooComments();
    this.setupCopyJson();
    this.setupRandomSort();
    this.setupJumpTriggers(); // 绑定跳转弹窗
    console.log('[FriendsPageManager] 友链页面初始化完成');
  }

  /**
   * 初始化 Twikoo 评论容器
   */
  private initTwikooComments(): void {
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    this.twikooContainer = container;
    initTwikoo(container).catch((err: unknown) => {
      console.warn('[FriendsPageManager] Twikoo 初始化失败:', err);
    });
  }

  /**
   * 设置复制 JSON 示例按钮
   */
  private setupCopyJson(): void {
    const copyBtn = document.getElementById('copyJsonBtn') as HTMLButtonElement | null;
    if (!copyBtn) return;

    const codeElement = document.getElementById('friendJsonExample');
    const originalText = codeElement?.innerText || '';

    if (this.copyBtnHandler) {
      copyBtn.removeEventListener('click', this.copyBtnHandler);
    }

    const handler = async function(this: HTMLElement, _ev: MouseEvent): Promise<void> {
      try {
        await navigator.clipboard.writeText(originalText);
        const originalBtnText = this.innerText;
        this.innerText = '已复制';
        this.style.background = 'var(--accent-color)';
        this.style.color = 'white';
        setTimeout(() => {
          this.innerText = originalBtnText;
          this.style.background = '';
          this.style.color = '';
        }, 1800);
      } catch (err) {
        console.error('复制失败', err);
        const textarea = document.createElement('textarea');
        textarea.value = originalText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.innerText = '已复制';
        setTimeout(() => { this.innerText = '复制'; }, 1200);
      }
    };

    copyBtn.addEventListener('click', handler);
    this.copyBtnHandler = handler;
  }

  /**
   * 设置随机排序：首次打乱 + 每 10 秒轮换
   */
  private setupRandomSort(): void {
    const container = document.getElementById('friends-list-container-inner');
    if (!container) {
      console.warn('[FriendsPageManager] 未找到友链容器，跳过随机排序');
      return;
    }
    this.container = container;

    this.applyRandomSort();

    this.randomTimer = window.setInterval(() => {
      this.applyRandomSort();
    }, 10000);
  }

  /**
   * 执行一次随机排序（若鼠标悬停则跳过）
   */
  private applyRandomSort(): void {
    if (!this.container) return;

    if (document.querySelector('.friend-card:hover')) {
      return;
    }

    const children = Array.from(this.container.children) as HTMLElement[];
    if (children.length <= 1) return;

    const first = children[0];
    const rest = children.slice(1);

    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    this.container.appendChild(first);
    for (const child of rest) {
      this.container.appendChild(child);
    }
  }

  /**
   * 设置友链卡片点击跳转弹窗（使用 jump-dialog）
   */
  private setupJumpTriggers(): void {
    if (this.jumpUnbind) {
      this.jumpUnbind();
      this.jumpUnbind = null;
    }

    // 限定容器为友链列表，提高性能
    const container = document.getElementById('friends-list-container-inner') || document.body;
    this.jumpUnbind = bindJumpTriggers(container, {
      triggerSelector: '.friend-card',
      nameSelector: '.friend-name',
      descSelector: '.friend-desc',
      avatarSelector: '.avatar-img, .avatar-placeholder',
      urlAttr: 'href',
      dialogDefaults: {
        countdown: 3,
        redirectTarget: '_blank',
      }
    });
  }

  /**
   * 销毁页面管理器，清理资源
   */
  destroy(): void {
    if (this.copyBtnHandler) {
      const copyBtn = document.getElementById('copyJsonBtn');
      if (copyBtn) {
        copyBtn.removeEventListener('click', this.copyBtnHandler);
      }
      this.copyBtnHandler = null;
    }

    if (this.twikooContainer) {
      destroyTwikoo(this.twikooContainer);
      this.twikooContainer = null;
    }

    if (this.randomTimer !== null) {
      clearInterval(this.randomTimer);
      this.randomTimer = null;
    }
    this.container = null;

    if (this.jumpUnbind) {
      this.jumpUnbind();
      this.jumpUnbind = null;
    }

    console.log('[FriendsPageManager] 友链页面管理器已销毁');
  }
}

/**
 * 初始化友链页面（供 router 调用）
 */
export async function initFriendsPage(): Promise<FriendsPageManager> {
  const manager = new FriendsPageManager();
  await manager.init();
  return manager;
}