// /js/pages/article.ts
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';

interface Heading {
    id: string;
    level: number;
    text: string;
    children?: Heading[];
}

interface ArticleGlobals {
    ARTICLE_HEADINGS?: Heading[];
    renderMathInElement?: (element: Element, options: unknown) => void;
    vercount?: { fetch?: () => void };
}

declare global {
    interface Window {
        ARTICLE_HEADINGS?: Heading[];
        renderMathInElement?: (element: Element, options: unknown) => void;
        vercount?: { fetch?: () => void };
    }
}

export class ArticlePageManager extends PageManager {
    private imageObserver: IntersectionObserver | null = null;
    private progressHandler: (() => void) | null = null;
    private scrollHandler: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;
    private toggleSidebarHandler: (() => void) | null = null;
    private tocClickHandler: ((e: Event) => void) | null = null;
    private cleanupFns: (() => void)[] = [];
    private twikooContainer: HTMLElement | null = null;
    private tocScrollWrapper: HTMLElement | null = null;
    private tocListContainer: HTMLElement | null = null;
    private tocProgressPercent: HTMLElement | null = null;
    private tocProgressFill: HTMLElement | null = null;
    private scrollTimer: number | null = null;

    // ---------- 初始化 ----------
    init(): void {
        const articleBody = document.getElementById('articleBody');
        if (!articleBody) {
            console.warn('[Article] 缺少文章主体元素 #articleBody');
            return;
        }

        this.ensureTOCStructure();
        this.initTOC();
        this.initImageLazyLoad();
        this.initReadingProgress();
        this.initCodeBlocks();
        this.initMobileSidebar();
        this.initScrollSave();
        this.setupThemeListener();
        requestAnimationFrame(() => this.onScroll());
        this.renderMath();
        this.initTwikoo();
        this.refreshvercount();
    }

    // ---------- 数学公式渲染 ----------
    renderMath(): void {
        const articleBody = document.getElementById('articleBody');
        if (!articleBody) return;
        const global = window as Window & ArticleGlobals;
        if (typeof global.renderMathInElement === 'function') {
            try {
                global.renderMathInElement(articleBody, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ]
                });
            } catch (e) {
                console.warn('[Article] 数学渲染失败:', e);
            }
        }
    }

    // ---------- Twikoo 评论 ----------
    async initTwikoo(): Promise<void> {
        const container = document.getElementById('twikoo-comments');
        if (!container) return;
        this.twikooContainer = container;
        await initTwikoo(container, {
            path: window.location.pathname,
        });
    }

    refreshvercount(): void {
        const global = window as Window & ArticleGlobals;
        if (global.vercount?.fetch) {
            try {
                global.vercount.fetch();
            } catch (e) {
                // ignore
            }
        }
    }

    // ---------- 销毁 ----------
    destroy(): void {
        // 移除事件监听
        if (this.progressHandler) {
            window.removeEventListener('scroll', this.progressHandler);
            this.progressHandler = null;
        }
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        if (this.toggleSidebarHandler) {
            window.removeEventListener('article:toggleSidebar', this.toggleSidebarHandler);
            this.toggleSidebarHandler = null;
        }
        // 断开观察器
        if (this.imageObserver) {
            this.imageObserver.disconnect();
            this.imageObserver = null;
        }
        // 清理自定义清理函数
        this.cleanupFns.forEach(fn => fn());
        this.cleanupFns = [];

        // 移除移动端遮罩
        const overlay = document.querySelector('.article-sidebar-overlay');
        if (overlay) overlay.remove();

        // 销毁 Twikoo
        if (this.twikooContainer) {
            destroyTwikoo(this.twikooContainer);
            this.twikooContainer = null;
        }

        // 重置 TOC 相关状态
        this.tocScrollWrapper = null;
        this.tocListContainer = null;
        this.tocProgressPercent = null;
        this.tocProgressFill = null;
        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
            this.scrollTimer = null;
        }
    }

    // ---------- TOC 交互（基于后端预渲染的 DOM） ----------
    private ensureTOCStructure(): void {
        const tocCard = document.querySelector('.sidebar-card.toc-card');
        if (!tocCard) return;

        // 确保 header 存在
        let header = tocCard.querySelector('.toc-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'toc-header';
            header.innerHTML = '<i class="fas fa-list-ul"></i><span>目录</span>';
            tocCard.prepend(header);
        }

        // 确保 wrapper 存在，但不要覆盖已有内容（后端已渲染）
        let wrapper = tocCard.querySelector('.toc-list-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'toc-list-wrapper';
            const existingNav = tocCard.querySelector('.toc-nav');
            if (existingNav) {
                wrapper.appendChild(existingNav);
            } else {
                // 如果没有 nav，创建一个（但后端渲染应该已包含）
                const newNav = document.createElement('nav');
                newNav.className = 'toc-nav';
                newNav.id = 'toc-list-container';
                wrapper.appendChild(newNav);
            }
            tocCard.appendChild(wrapper);
        }

        this.tocScrollWrapper = wrapper as HTMLElement;
        this.tocListContainer = wrapper.querySelector('.toc-nav, #toc-list-container') as HTMLElement;
        if (this.tocListContainer && !this.tocListContainer.id) {
            this.tocListContainer.id = 'toc-list-container';
        }
    }

    private initTOC(): void {
        // 获取已存在的 TOC 容器（由后端渲染）
        this.tocListContainer = document.getElementById('toc-list-container');
        if (!this.tocListContainer) {
            console.warn('[Article] TOC 容器不存在，可能页面未包含目录');
            return;
        }

        // 绑定链接点击事件
        this.bindTocLinkEvents();

        // 初始化阅读进度条（如果尚未添加）
        this.initTocReadingProgress();

        // 滚动监听更新高亮
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
        }
        this.scrollHandler = () => this.onScroll();
        window.addEventListener('scroll', this.scrollHandler);
        this.cleanupFns.push(() => {
            if (this.scrollHandler) {
                window.removeEventListener('scroll', this.scrollHandler);
                this.scrollHandler = null;
            }
        });

        // 首次更新高亮
        this.onScroll();
    }

    private bindTocLinkEvents(): void {
        // 移除旧的监听器（如果有）
        if (this.tocClickHandler) {
            document.querySelectorAll('.toc-link').forEach(link => {
                link.removeEventListener('click', this.tocClickHandler!);
            });
        }
        this.tocClickHandler = this.handleTocClick.bind(this);
        document.querySelectorAll('.toc-link').forEach(link => {
            link.addEventListener('click', this.tocClickHandler!);
        });
        // 清理时移除
        this.cleanupFns.push(() => {
            if (this.tocClickHandler) {
                document.querySelectorAll('.toc-link').forEach(link => {
                    link.removeEventListener('click', this.tocClickHandler!);
                });
                this.tocClickHandler = null;
            }
        });
    }

    private handleTocClick(e: Event): void {
        e.preventDefault();
        const link = e.currentTarget as HTMLAnchorElement;
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        const targetId = href.slice(1);
        const target = document.getElementById(targetId);
        if (target) {
            this.smoothScrollTo(target, 90);
            // 更新 URL hash 但不触发滚动
            history.pushState(null, '', href);
            this.updateActiveItem(targetId);
            this.scrollTocToItem(targetId);
        }
    }

    private smoothScrollTo(element: HTMLElement, offset = 90): void {
        const pos = element.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, pos), behavior: 'smooth' });
    }

    private updateActiveItem(activeId: string): void {
        document.querySelectorAll('.toc-list li').forEach(li => li.classList.remove('active'));
        const activeLi = document.querySelector(`.toc-list li[data-id="${activeId}"]`);
        if (activeLi) activeLi.classList.add('active');
    }

    private scrollTocToItem(itemId: string): void {
        const li = document.querySelector(`.toc-list li[data-id="${itemId}"]`);
        if (li && this.tocScrollWrapper) {
            li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    private onScroll(): void {
        if (this.scrollTimer) return;
        this.scrollTimer = window.setTimeout(() => {
            const activeId = this.getCurrentActiveHeading();
            if (activeId) this.updateActiveItem(activeId);
            this.updateTocReadingProgress();
            this.scrollTimer = null;
        }, 60);
    }

    private getCurrentActiveHeading(): string | null {
        const headings = Array.from(
            document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4')
        ).filter(h => h.id);
        if (!headings.length) return null;
        const scrollTop = window.scrollY + 90;
        let active: string | null = null;
        let minDist = Infinity;
        for (const h of headings) {
            const offset = h.getBoundingClientRect().top + window.scrollY;
            if (offset <= scrollTop && scrollTop - offset < minDist) {
                minDist = scrollTop - offset;
                active = h.id;
            }
        }
        return active;
    }

    private initTocReadingProgress(): void {
        const header = document.querySelector('.toc-header');
        if (!header) return;
        if (header.querySelector('.reading-progress-wrapper')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'reading-progress-wrapper';
        wrapper.innerHTML = `
            <span class="reading-percent">0%</span>
            <div class="reading-progress-container"><div class="reading-progress-fill"></div></div>
        `;
        header.appendChild(wrapper);
        this.tocProgressPercent = wrapper.querySelector('.reading-percent');
        this.tocProgressFill = wrapper.querySelector('.reading-progress-fill');
        this.updateTocReadingProgress();
    }

    private updateTocReadingProgress(): void {
        if (!this.tocProgressFill) return;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        let percent = 0;
        if (docHeight > 0) percent = (window.scrollY / docHeight) * 100;
        if (this.tocProgressPercent) {
            this.tocProgressPercent.textContent = `${Math.round(percent)}%`;
        }
        this.tocProgressFill.style.width = `${percent}%`;
    }

    // ---------- 图片懒加载 ----------
    private initImageLazyLoad(): void {
        const images = document.querySelectorAll('#articleBody img[data-src]');
        if (!images.length) return;
        if ('IntersectionObserver' in window) {
            this.imageObserver = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (entry.isIntersecting) {
                            this.loadImage(entry.target as HTMLImageElement);
                            this.imageObserver!.unobserve(entry.target);
                        }
                    }
                },
                { rootMargin: '100px 0px', threshold: 0.01 }
            );
            images.forEach(img => this.imageObserver!.observe(img));
        } else {
            // 降级：直接加载
            images.forEach(img => this.loadImage(img as HTMLImageElement));
        }
        // 清理观察器
        this.cleanupFns.push(() => {
            if (this.imageObserver) {
                this.imageObserver.disconnect();
                this.imageObserver = null;
            }
        });
    }

    private loadImage(img: HTMLImageElement): void {
        const src = img.dataset.src;
        if (!src) return;
        img.classList.add('lazy-loading');
        const temp = new Image();
        temp.onload = () => {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('loaded');
            delete img.dataset.src;
        };
        temp.onerror = () => {
            img.classList.remove('lazy-loading');
        };
        temp.src = src;
    }

    // ---------- 阅读进度条 ----------
    private initReadingProgress(): void {
        const progressBar = document.getElementById('progress-bar');
        if (!progressBar) return;
        this.progressHandler = () => {
            const total = document.documentElement.scrollHeight - window.innerHeight;
            const percent = total > 0 ? (window.scrollY / total) * 100 : 0;
            progressBar.style.width = `${percent}%`;
        };
        window.addEventListener('scroll', this.progressHandler);
        this.progressHandler(); // 初始更新
        this.cleanupFns.push(() => {
            if (this.progressHandler) {
                window.removeEventListener('scroll', this.progressHandler);
                this.progressHandler = null;
            }
        });
    }

    // ---------- 代码块复制 ----------
    private initCodeBlocks(): void {
        document.querySelectorAll('#articleBody pre').forEach(pre => {
            if ((pre as HTMLElement).dataset.enhanced) return;
            const code = pre.querySelector('code');
            if (!code) return;
            const langMatch = code.className.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] : '';

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode!.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            const toolbar = document.createElement('div');
            toolbar.className = 'code-toolbar';
            if (lang) {
                const span = document.createElement('span');
                span.className = 'code-filetype';
                span.textContent = lang.toUpperCase();
                toolbar.appendChild(span);
            }
            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(code.textContent!);
                    copyBtn.textContent = '已复制';
                    setTimeout(() => copyBtn.textContent = '复制', 1500);
                } catch {
                    copyBtn.textContent = '失败';
                    setTimeout(() => copyBtn.textContent = '复制', 1500);
                }
            });
            toolbar.appendChild(copyBtn);
            pre.prepend(toolbar);
            (pre as HTMLElement).dataset.enhanced = 'true';
        });
    }

    // ---------- 移动端侧边栏 ----------
    private initMobileSidebar(): void {
        const checkMobile = () => {
            const isMobile = window.innerWidth <= 768;
            const floating = document.querySelector('.floating-buttons') as HTMLElement;
            if (floating) floating.style.display = isMobile ? 'flex' : 'none';
            if (this.tocScrollWrapper) {
                this.tocScrollWrapper.style.maxHeight = isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 220px)';
            }
        };

        this.toggleSidebarHandler = () => this.toggleMobileSidebar();
        window.addEventListener('article:toggleSidebar', this.toggleSidebarHandler);
        this.cleanupFns.push(() => {
            if (this.toggleSidebarHandler) {
                window.removeEventListener('article:toggleSidebar', this.toggleSidebarHandler);
                this.toggleSidebarHandler = null;
            }
        });

        // 创建遮罩（只创建一次）
        let overlay = document.querySelector('.article-sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'article-sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => this.closeMobileSidebar());
        }

        this.resizeHandler = checkMobile;
        window.addEventListener('resize', this.resizeHandler);
        this.cleanupFns.push(() => {
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
                this.resizeHandler = null;
            }
        });
        checkMobile();
    }

    private toggleMobileSidebar(): void {
        const sidebar = document.querySelector('.article-sidebar');
        const overlay = document.querySelector('.article-sidebar-overlay');
        if (!sidebar) return;
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('open');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
    }

    private closeMobileSidebar(): void {
        const sidebar = document.querySelector('.article-sidebar');
        const overlay = document.querySelector('.article-sidebar-overlay');
        sidebar?.classList.remove('open');
        overlay?.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ---------- 滚动位置保存（支持锚点优先） ----------
    private initScrollSave(): void {
        const key = `scroll_${window.location.pathname}`;
        const hash = window.location.hash;

        if (hash) {
            // 有 hash：滚动到锚点，并清除保存的滚动位置，避免覆盖
            const targetId = hash.slice(1);
            setTimeout(() => {
                const el = document.getElementById(targetId);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    sessionStorage.removeItem(key);
                } else {
                    // 元素不存在，尝试恢复保存的位置
                    this.restoreScrollPosition(key);
                }
            }, 50);
        } else {
            // 无 hash：恢复保存的位置
            this.restoreScrollPosition(key);
        }

        // 滚动时保存位置（防抖）
        let saveTimer: number | null = null;
        const saveHandler = () => {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => {
                sessionStorage.setItem(key, String(window.scrollY));
                saveTimer = null;
            }, 200);
        };
        window.addEventListener('scroll', saveHandler);
        this.cleanupFns.push(() => {
            window.removeEventListener('scroll', saveHandler);
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
        });
    }

    private restoreScrollPosition(key: string): void {
        const saved = sessionStorage.getItem(key);
        if (saved) {
            const scrollY = parseInt(saved, 10);
            if (!isNaN(scrollY)) {
                setTimeout(() => window.scrollTo(0, scrollY), 50);
            }
        }
    }

    // ---------- 主题变化刷新进度 ----------
    private setupThemeListener(): void {
        const handler = () => {
            this.updateTocReadingProgress();
        };
        window.addEventListener('themeChanged', handler);
        this.cleanupFns.push(() => {
            window.removeEventListener('themeChanged', handler);
        });
    }

    // ---------- 辅助方法 ----------
    private escapeHtml(str: string): string {
        if (!str) return '';
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
        return str.replace(/[&<>]/g, m => map[m] || m);
    }
}

// ---------- 导出初始化函数供 router 调用 ----------
export async function initArticlePage(): Promise<ArticlePageManager> {
    const manager = new ArticlePageManager();
    await manager.init();
    return manager;
}