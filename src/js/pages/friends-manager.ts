// /js/pages/friends-manager.ts
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';
import { bindJumpTriggers } from '/js/ui/jump-dialog.js';

// 站长的真实信息（用于替换模板）
const MY_INFO = {
    name: "高新炀的小站",
    link: "https://xinyang-gao.github.io",
    desc: "一个装着些稀奇古怪东西的个人小站，欢迎来逛逛~",
    avatar: "https://xinyang-gao.github.io/assets/avatar.webp"
};

export class FriendsPageManager extends PageManager {
    private twikooContainer: HTMLElement | null = null;
    private container: HTMLElement | null = null;
    private randomTimer: number | null = null;
    private jumpUnbind: (() => void) | null = null;
    private _initialized = false;

    // ---- 信息卡片交互相关 ----
    private typewriterTimer: number | null = null;          // 改用 requestAnimationFrame ID
    private typewriterPhase: 'idle' | 'hiding' | 'showing' = 'idle';
    private infoValueElements: HTMLElement[] = [];
    private labelTexts: string[] = [];
    private templateTexts: string[] = [];
    private myInfoTexts: string[] = [];
    private isShowingMyInfo = false;

    // ---- 事件处理器引用 ----
    private toggleHandler: ((e: Event) => void) | null = null;
    private switchHandler: ((e: Event) => void) | null = null;
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
    //  信息卡片交互（折叠 + 双向打字机 + 复制）
    // ========================================================
    private setupInfoCard(): void {
        const toggle = document.querySelector('.info-card-toggle') as HTMLElement | null;
        const content = document.querySelector('.info-card-content') as HTMLElement | null;
        const infoTextContainer = document.getElementById('provideInfoText') as HTMLElement | null;

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

        if (!infoTextContainer) return;

        // 2. 捕获标签文本 和 值元素
        const labelSpans = infoTextContainer.querySelectorAll('.info-label');
        const valueSpans = infoTextContainer.querySelectorAll('.info-value');
        if (labelSpans.length === 4 && valueSpans.length === 4) {
            this.labelTexts = Array.from(labelSpans).map(el => el.textContent || '');
            this.infoValueElements = Array.from(valueSpans) as HTMLElement[];
            this.templateTexts = this.infoValueElements.map(el => el.textContent || '');
            this.myInfoTexts = [MY_INFO.name, MY_INFO.link, MY_INFO.desc, MY_INFO.avatar];
        } else {
            console.warn('[FriendsPageManager] .info-label 或 .info-value 数量不为4，无法初始化打字机');
            return;
        }

        // 3. “我的信息 / 显示模板” 切换按钮
        const switchBtn = document.getElementById('switchInfoBtn') as HTMLButtonElement | null;
        if (switchBtn) {
            if (this.switchHandler) {
                switchBtn.removeEventListener('click', this.switchHandler);
            }
            this.switchHandler = () => {
                this.isShowingMyInfo = !this.isShowingMyInfo;
                const targetTexts = this.isShowingMyInfo ? this.myInfoTexts : this.templateTexts;
                switchBtn.textContent = this.isShowingMyInfo ? '显示模板' : '我的信息';
                this.startTypewriterSequence(targetTexts);
            };
            switchBtn.addEventListener('click', this.switchHandler);
        }

        // 4. 复制按钮（复制完整的“标签: 值”，始终复制目标模式的完整内容）
        const copyInfoBtn = document.getElementById('copyInfoBtn') as HTMLButtonElement | null;
        if (copyInfoBtn) {
            if (this.copyInfoHandler) {
                copyInfoBtn.removeEventListener('click', this.copyInfoHandler);
            }
            this.copyInfoHandler = async () => {
                // 根据当前模式选择完整目标文本
                const targetTexts = this.isShowingMyInfo ? this.myInfoTexts : this.templateTexts;
                const lines = this.labelTexts.map((label, i) => label + targetTexts[i]);
                const text = lines.join('\n');

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
                    // fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    copyInfoBtn.textContent = '已复制';
                    setTimeout(() => { copyInfoBtn.textContent = '复制'; }, 1200);
                }
            };
            copyInfoBtn.addEventListener('click', this.copyInfoHandler);
        }
    }

    /**
     * 双向打字机：根据每行长度自适应速度，所有行同时完成动画
     * @param targetTexts 目标文本数组（4个字段）
     */
    private startTypewriterSequence(targetTexts: string[]): void {
        // 如果正在动画，立即停止
        if (this.typewriterTimer !== null) {
            cancelAnimationFrame(this.typewriterTimer);
            this.typewriterTimer = null;
            this.typewriterPhase = 'idle';
        }

        // 获取当前显示的文本
        const currentTexts = this.infoValueElements.map(el => el.textContent || '');
        // 如果目标和当前完全一样，则无需动画
        if (currentTexts.every((t, i) => t === targetTexts[i])) {
            return;
        }

        const duration = 400; // 总动画时间（毫秒），可调
        const halfDuration = duration / 2;
        const startTime = performance.now();
        const initialLengths = currentTexts.map(t => t.length);
        const targetLengths = targetTexts.map(t => t.length);

        // 隐藏阶段：从当前长度减到0；显示阶段：从0增到目标长度
        const animate = (timestamp: number) => {
            const elapsed = timestamp - startTime;
            if (elapsed >= duration) {
                for (let i = 0; i < this.infoValueElements.length; i++) {
                    this.infoValueElements[i].textContent = targetTexts[i];
                }
                this.typewriterTimer = null;
                this.typewriterPhase = 'idle';
                return;
            }

            const progress = elapsed / duration; // 0 ~ 1
            let phaseProgress: number;
            let isShowing: boolean;

            if (progress <= 0.5) {
                // 隐藏阶段
                phaseProgress = progress / 0.5; // 0 ~ 1
                isShowing = false;
            } else {
                // 显示阶段
                phaseProgress = (progress - 0.5) / 0.5; // 0 ~ 1
                isShowing = true;
            }

            for (let i = 0; i < this.infoValueElements.length; i++) {
                let len: number;
                if (!isShowing) {
                    // 从 initialLengths[i] 减少到 0
                    len = Math.round(initialLengths[i] * (1 - phaseProgress));
                    // 源文本为当前文本（即隐藏前的完整内容）
                    this.infoValueElements[i].textContent = currentTexts[i].substring(0, len);
                } else {
                    // 从 0 增加到 targetLengths[i]
                    len = Math.round(targetLengths[i] * phaseProgress);
                    this.infoValueElements[i].textContent = targetTexts[i].substring(0, len);
                }
            }

            this.typewriterTimer = requestAnimationFrame(animate);
        };

        this.typewriterPhase = 'hiding';
        this.typewriterTimer = requestAnimationFrame(animate);
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

        // 3. 清理“我的信息/显示模板”切换事件
        if (this.switchHandler) {
            const switchBtn = document.getElementById('switchInfoBtn');
            if (switchBtn) {
                switchBtn.removeEventListener('click', this.switchHandler);
            }
            this.switchHandler = null;
        }

        // 4. 清理复制信息按钮事件
        if (this.copyInfoHandler) {
            const copyInfoBtn = document.getElementById('copyInfoBtn');
            if (copyInfoBtn) {
                copyInfoBtn.removeEventListener('click', this.copyInfoHandler);
            }
            this.copyInfoHandler = null;
        }

        // 5. 清理打字机动画（使用 cancelAnimationFrame）
        if (this.typewriterTimer !== null) {
            cancelAnimationFrame(this.typewriterTimer);
            this.typewriterTimer = null;
        }
        this.typewriterPhase = 'idle';

        // 6. 清理 Twikoo
        if (this.twikooContainer) {
            destroyTwikoo(this.twikooContainer);
            this.twikooContainer = null;
        }

        // 7. 清理随机排序定时器
        if (this.randomTimer !== null) {
            clearInterval(this.randomTimer);
            this.randomTimer = null;
        }
        this.container = null;

        // 8. 清理跳转弹窗
        if (this.jumpUnbind) {
            this.jumpUnbind();
            this.jumpUnbind = null;
        }

        // 9. 清理引用
        this.infoValueElements = [];
        this.labelTexts = [];
        this.templateTexts = [];
        this.myInfoTexts = [];

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