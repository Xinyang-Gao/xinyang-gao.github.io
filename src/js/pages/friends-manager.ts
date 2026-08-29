// /js/pages/friends-manager.ts
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';
import { bindJumpTriggers } from '/js/ui/jump-dialog.js';

export class FriendsPageManager extends PageManager {
    private twikooContainer: HTMLElement | null = null;
    private container: HTMLElement | null = null;
    private randomTimer: number | null = null;
    private jumpUnbind: (() => void) | null = null;
    private _initialized = false;

    // ---- 事件处理器引用 ----
    private toggleHandler: ((e: Event) => void) | null = null;
    private copyInfoHandler: ((e: Event) => void) | null = null;
    private copyJsonHandler: ((e: Event) => Promise<void>) | null = null;

    async init(): Promise<void> {
        if (this._initialized) {
            console.log('[FriendsPageManager] 已初始化，跳过重复执行');
            return;
        }

        this.initTwikooComments();
        this.setupCopyJson();
        this.setupRandomSort();
        this.setupJumpTriggers();
        this.setupInfoCard();
        console.log('[FriendsPageManager] 友链页面初始化完成');

        this._initialized = true;
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

        if (this.copyJsonHandler) {
            copyBtn.removeEventListener('click', this.copyJsonHandler);
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
        this.copyJsonHandler = handler;
    }

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

    private setupJumpTriggers(): void {
        if (this.jumpUnbind) {
            this.jumpUnbind();
            this.jumpUnbind = null;
        }

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

    // ========================================================
    //  信息卡片交互（折叠 + 复制信息）
    // ========================================================
    private setupInfoCard(): void {
        const toggle = document.querySelector('.info-card-toggle') as HTMLElement | null;
        const content = document.querySelector('.info-card-content') as HTMLElement | null;

        // 1. 折叠切换
        if (toggle && content) {
            if (this.toggleHandler) {
                toggle.removeEventListener('click', this.toggleHandler);
            }
            this.toggleHandler = () => {
                const isOpen = toggle.classList.toggle('open');
                content.style.display = isOpen ? 'block' : 'none';
                toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            };
            toggle.addEventListener('click', this.toggleHandler);
        }

        // 2. 复制信息按钮（只复制主要信息）
        const copyInfoBtn = document.getElementById('copyInfoBtn') as HTMLButtonElement | null;
        if (copyInfoBtn) {
            if (this.copyInfoHandler) {
                copyInfoBtn.removeEventListener('click', this.copyInfoHandler);
            }
            this.copyInfoHandler = async () => {
                const infoText = document.getElementById('provideInfoText');
                if (!infoText) return;
                const mainItems = infoText.querySelectorAll(':scope > div:not(.info-secondary)');
                const lines: string[] = [];
                for (const item of mainItems) {
                    const text = item.textContent?.trim();
                    if (text) {
                        lines.push(text);
                    }
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
                } catch (_) {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    copyInfoBtn.textContent = '已复制';
                    setTimeout(() => { copyInfoBtn.textContent = '复制信息'; }, 1200);
                }
            };
            copyInfoBtn.addEventListener('click', this.copyInfoHandler);
        }
    }

    // ========================================================
    //  销毁方法（清理所有资源）
    // ========================================================
    destroy(): void {
        // 1. 清理复制 JSON 按钮
        if (this.copyJsonHandler) {
            const copyBtn = document.getElementById('copyJsonBtn');
            if (copyBtn) {
                copyBtn.removeEventListener('click', this.copyJsonHandler);
            }
            this.copyJsonHandler = null;
        }

        // 2. 清理折叠切换事件
        if (this.toggleHandler) {
            const toggle = document.querySelector('.info-card-toggle');
            if (toggle) {
                toggle.removeEventListener('click', this.toggleHandler);
            }
            this.toggleHandler = null;
        }

        // 3. 清理复制信息按钮事件
        if (this.copyInfoHandler) {
            const copyInfoBtn = document.getElementById('copyInfoBtn');
            if (copyInfoBtn) {
                copyInfoBtn.removeEventListener('click', this.copyInfoHandler);
            }
            this.copyInfoHandler = null;
        }

        // 4. 清理 Twikoo
        if (this.twikooContainer) {
            destroyTwikoo(this.twikooContainer);
            this.twikooContainer = null;
        }

        // 5. 清理随机排序定时器
        if (this.randomTimer !== null) {
            clearInterval(this.randomTimer);
            this.randomTimer = null;
        }
        this.container = null;

        // 6. 清理跳转弹窗
        if (this.jumpUnbind) {
            this.jumpUnbind();
            this.jumpUnbind = null;
        }

        this._initialized = false;
        console.log('[FriendsPageManager] 友链页面管理器已销毁');
    }
}

// ==================== 导出单例 ====================
export const friendLinkManager = new FriendsPageManager();

/**
 * 初始化友链页面（供 router 调用）
 */
export async function initFriendsPage(): Promise<FriendsPageManager> {
    const manager = new FriendsPageManager();
    await manager.init();
    return manager;
}