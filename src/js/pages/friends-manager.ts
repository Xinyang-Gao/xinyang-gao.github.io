// /js/pages/friends-manager.ts
import { PageBase } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';
import { bindJumpTriggers } from '/js/ui/jump-dialog.js';

export class FriendsPageManager extends PageBase {
  private twikooContainer: HTMLElement | null = null;
  private container: HTMLElement | null = null;

  protected async mount(): Promise<void> {
    this.initTwikooComments();
    this.setupCopyJson();
    this.setupRandomSort();
    this.setupJumpTriggers();
    this.setupInfoCard();
    console.log('[FriendsPageManager] 友链页面初始化完成');
  }

  protected unmount(): void {
    if (this.twikooContainer) {
      destroyTwikoo(this.twikooContainer);
      this.twikooContainer = null;
    }
    this.container = null;
    console.log('[FriendsPageManager] 友链页面管理器已销毁');
  }

  private initTwikooComments(): void {
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    this.twikooContainer = container;
    initTwikoo(container).catch((err: unknown) => {
      console.warn('[FriendsPageManager] Twikoo 初始化失败:', err);
    });
  }

  private setupCopyJson(): void {
    const copyBtn = document.getElementById('copyJsonBtn') as HTMLButtonElement | null;
    if (!copyBtn) return;

    const codeElement = document.getElementById('friendJsonExample');
    const originalText = codeElement?.innerText || '';

    const handler = async function (this: HTMLElement): Promise<void> {
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
        setTimeout(() => {
          this.innerText = '复制';
        }, 1200);
      }
    };

    this.stack.addEventListener(copyBtn, 'click', handler as EventListener);
  }

  private setupRandomSort(): void {
    const container = document.getElementById('friends-list-container-inner');
    if (!container) {
      console.warn('[FriendsPageManager] 未找到友链容器，跳过随机排序');
      return;
    }
    this.container = container;

    this.applyRandomSort();

    const timer = window.setInterval(() => this.applyRandomSort(), 10000);
    this.stack.addInterval(timer);
  }

  private applyRandomSort(): void {
    if (!this.container) return;

    if (document.querySelector('.friend-card:hover')) return;

    const children = Array.from(this.container.children) as HTMLElement[];
    if (children.length <= 1) return;

    const first = children[0];
    const rest = children.slice(1);

    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    this.container.replaceChildren(first, ...rest);
  }

  private setupJumpTriggers(): void {
    const container =
      document.getElementById('friends-list-container-inner') || document.body;

    const unbind = bindJumpTriggers(container, {
      triggerSelector: '.friend-card',
      nameSelector: '.friend-name',
      descSelector: '.friend-desc',
      avatarSelector: '.avatar-img, .avatar-placeholder',
      urlAttr: 'href',
      dialogDefaults: {
        countdown: 3,
        redirectTarget: '_blank',
      },
    });

    this.stack.add(unbind);
  }

  // ========================================================
  //  信息卡片交互（折叠 + 复制信息）
  // ========================================================
  private setupInfoCard(): void {
    const toggle = document.querySelector('.info-card-toggle') as HTMLElement | null;
    const content = document.querySelector('.info-card-content') as HTMLElement | null;

    // 1. 折叠切换
    if (toggle && content) {
      this.stack.addEventListener(toggle, 'click', () => {
        const isOpen = toggle.classList.toggle('open');
        content.style.display = isOpen ? 'block' : 'none';
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }

    // 2. 复制信息按钮（只复制主要信息）
    const copyInfoBtn = document.getElementById('copyInfoBtn') as HTMLButtonElement | null;
    if (copyInfoBtn) {
      this.stack.addEventListener(copyInfoBtn, 'click', async () => {
        const infoText = document.getElementById('provideInfoText');
        if (!infoText) return;

        const mainItems = infoText.querySelectorAll(':scope > div:not(.info-secondary)');
        const lines: string[] = [];
        for (const item of mainItems) {
          const text = item.textContent?.trim();
          if (text) lines.push(text);
        }
        const text = lines.join('\n');
        if (!text) {
          console.warn('[FriendsPageManager] 没有可复制的主要信息');
          return;
        }

        try {
          await navigator.clipboard.writeText(text);
          const original = copyInfoBtn.textContent;
          copyInfoBtn.textContent = '已复制';
          copyInfoBtn.style.background = 'var(--accent-color)';
          copyInfoBtn.style.color = '#fff';
          setTimeout(() => {
            copyInfoBtn.textContent = original;
            copyInfoBtn.style.background = '';
            copyInfoBtn.style.color = '';
          }, 1500);
        } catch {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          copyInfoBtn.textContent = '已复制';
          setTimeout(() => {
            copyInfoBtn.textContent = '复制信息';
          }, 1200);
        }
      });
    }
  }
}

// ==================== 导出单例 ====================
export const friendLinkManager = new FriendsPageManager();

/**
 * 初始化友链页面（供 router 调用）
 * 注意：每次导航进入 friends 页面应 new 一个新实例；
 * 但历史代码曾用单例，这里保留单例语义（其 mount 内部会重新注册监听，
 * PageBase 会保证每次 init 前 stack 都是全新的）。
 */
export async function initFriendsPage(): Promise<FriendsPageManager> {
  // 如单例已初始化过，destroy 一次清掉旧资源，再重新 init
  friendLinkManager.destroy();
  await friendLinkManager.init();
  return friendLinkManager;
}