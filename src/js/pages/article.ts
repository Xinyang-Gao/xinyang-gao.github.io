// /js/pages/article.js
import { PageManager } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';

export class ArticlePageManager extends PageManager {
    constructor() {
        super();
        this.imageObserver = null;
        this.progressHandler = null;
        this.scrollHandler = null;
        this.resizeHandler = null;
        this.intersectionObserver = null;
        this.mutationObserver = null;
        this.cleanupFns = [];
        this.twikooContainer = null;
    }

    init() {
        if (!document.getElementById('articleBody')) {
            console.warn('[Article] 缺少文章主体元素 #articleBody');
            return;
        }

        // 1. 构建 TOC 结构并渲染
        this.ensureTOCStructure();
        this.buildAndRenderTOC();

        // 2. 图片懒加载（保留，与全局查看器无关）
        this.initImageLazyLoad();

        // 3. 阅读进度条
        this.initReadingProgress();

        // 4. 代码块复制按钮
        this.initCodeBlocks();

        // 5. 移动端侧边栏
        this.initMobileSidebar();

        // 6. 滚动位置保存
        this.initScrollSave();

        // 7. 监听主题变化（如果需要）
        this.setupThemeListener();

        // 8. 触发一次滚动，激活高亮
        setTimeout(() => this.onScroll(), 100);

        this.renderMath();
        this.initTwikoo();
        this.refreshBusuanzi();
    }

    renderMath() {
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(document.getElementById('articleBody'), {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ]
            });
        }
    }

    async initTwikoo() {
        const container = document.getElementById('twikoo-comments');
        if (!container) return;
        this.twikooContainer = container;
        await initTwikoo(container, {
            path: window.location.pathname,
        });
    }

    refreshBusuanzi() {
        if (typeof busuanzi !== 'undefined' && busuanzi.fetch) {
            busuanzi.fetch();
        }
    }

    destroy() {
        if (this.progressHandler) window.removeEventListener('scroll', this.progressHandler);
        if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
        if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
        if (this.imageObserver) this.imageObserver.disconnect();
        if (this.intersectionObserver) this.intersectionObserver.disconnect();
        if (this.mutationObserver) this.mutationObserver.disconnect();
        this.cleanupFns.forEach(fn => fn());
        this.cleanupFns = [];

        const overlay = document.querySelector('.article-sidebar-overlay');
        if (overlay) overlay.remove();
        if (this.twikooContainer) {
            destroyTwikoo(this.twikooContainer);
            this.twikooContainer = null;
        }
    }

    // ---------- TOC ----------
    ensureTOCStructure() {
        const tocCard = document.querySelector('.sidebar-card.toc-card');
        if (!tocCard) return;

        let header = tocCard.querySelector('.toc-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'toc-header';
            header.innerHTML = '<i class="fas fa-list-ul"></i><span>目录</span>';
            tocCard.insertBefore(header, tocCard.firstChild);
        }

        let wrapper = tocCard.querySelector('.toc-list-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'toc-list-wrapper';
            const oldNav = tocCard.querySelector('.toc-nav');
            if (oldNav) {
                wrapper.appendChild(oldNav);
            } else {
                const newNav = document.createElement('nav');
                newNav.className = 'toc-nav';
                newNav.id = 'toc-list-container';
                wrapper.appendChild(newNav);
            }
            tocCard.appendChild(wrapper);
        }

        this.tocScrollWrapper = wrapper;
        this.tocListContainer = wrapper.querySelector('.toc-nav, #toc-list-container');
        if (this.tocListContainer && !this.tocListContainer.id) this.tocListContainer.id = 'toc-list-container';
    }

    buildAndRenderTOC() {
        const headings = window.ARTICLE_HEADINGS || [];
        if (!this.tocListContainer) return;

        if (!headings.length) {
            this.tocListContainer.innerHTML = '<p class="toc-empty">暂无目录</p>';
            return;
        }

        const tree = this.buildTree(headings);
        const html = this.renderTree(tree);
        this.tocListContainer.innerHTML = html;
        this.bindTocLinkEvents();

        this.initTocReadingProgress();

        this.scrollHandler = () => this.onScroll();
        window.addEventListener('scroll', this.scrollHandler);
    }

    buildTree(headings) {
        const root = { children: [] };
        const stack = [{ node: root, level: 0 }];
        for (const h of headings) {
            const newNode = { ...h, children: [] };
            while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
            const parent = stack[stack.length - 1].node;
            parent.children.push(newNode);
            stack.push({ node: newNode, level: h.level });
        }
        return root.children;
    }

    renderTree(children) {
        if (!children.length) return '';
        let html = '<ul class="toc-list">';
        for (const node of children) {
            html += `<li data-id="${node.id}" class="toc-depth-${node.level}">`;
            html += `<a href="#${node.id}" class="toc-link">${this.escapeHtml(node.text)}</a>`;
            if (node.children.length) html += this.renderTree(node.children);
            html += '</li>';
        }
        html += '</ul>';
        return html;
    }

    bindTocLinkEvents() {
        document.querySelectorAll('.toc-link').forEach(link => {
            link.removeEventListener('click', this._boundHandleTocClick);
            this._boundHandleTocClick = this.handleTocClick.bind(this);
            link.addEventListener('click', this._boundHandleTocClick);
        });
    }

    handleTocClick(e) {
        e.preventDefault();
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        if (!href) return;
        const targetId = href.slice(1);
        const target = document.getElementById(targetId);
        if (target) {
            this.smoothScrollTo(target, 90);
            history.pushState(null, null, href);
            this.updateActiveItem(targetId);
            this.scrollTocToItem(targetId);
        }
    }

    smoothScrollTo(element, offset = 90) {
        const pos = element.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: pos, behavior: 'smooth' });
    }

    updateActiveItem(activeId) {
        document.querySelectorAll('.toc-list li').forEach(li => li.classList.remove('active'));
        const activeLi = document.querySelector(`.toc-list li[data-id="${activeId}"]`);
        if (activeLi) activeLi.classList.add('active');
    }

    scrollTocToItem(itemId) {
        const li = document.querySelector(`.toc-list li[data-id="${itemId}"]`);
        if (li && this.tocScrollWrapper) {
            li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    onScroll() {
        if (this.scrollTimer) return;
        this.scrollTimer = setTimeout(() => {
            const activeId = this.getCurrentActiveHeading();
            if (activeId) this.updateActiveItem(activeId);
            this.updateTocReadingProgress();
            this.scrollTimer = null;
        }, 60);
    }

    getCurrentActiveHeading() {
        const headings = Array.from(document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4'))
            .filter(h => h.id);
        if (!headings.length) return null;
        const scrollTop = window.scrollY + 90;
        let active = null;
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

    initTocReadingProgress() {
        const header = document.querySelector('.toc-header');
        if (!header || header.querySelector('.reading-progress-wrapper')) return;
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

    updateTocReadingProgress() {
        if (!this.tocProgressFill) return;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        let percent = 0;
        if (docHeight > 0) percent = (window.scrollY / docHeight) * 100;
        this.tocProgressPercent.textContent = `${Math.round(percent)}%`;
        this.tocProgressFill.style.width = `${percent}%`;
    }

    // 图片懒加载（保留）
    initImageLazyLoad() {
        const images = document.querySelectorAll('#articleBody img');
        if (!images.length) return;
        if ('IntersectionObserver' in window) {
            this.imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadImage(entry.target);
                        this.imageObserver.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '100px 0px', threshold: 0.01 });
            images.forEach(img => this.imageObserver.observe(img));
        } else {
            images.forEach(img => this.loadImage(img));
        }
    }

    loadImage(img) {
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
        temp.onerror = () => img.classList.remove('lazy-loading');
        temp.src = src;
    }

    // 阅读进度条
    initReadingProgress() {
        const progressBar = document.getElementById('progress-bar');
        if (!progressBar) return;
        this.progressHandler = () => {
            const total = document.documentElement.scrollHeight - window.innerHeight;
            const percent = total > 0 ? (window.scrollY / total) * 100 : 0;
            progressBar.style.width = `${percent}%`;
        };
        window.addEventListener('scroll', this.progressHandler);
        this.progressHandler();
    }

    // 代码块复制
    initCodeBlocks() {
        document.querySelectorAll('#articleBody pre').forEach(pre => {
            if (pre.dataset.enhanced) return;
            const code = pre.querySelector('code');
            if (!code) return;
            const lang = code.className.match(/language-(\w+)/)?.[1] || '';
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
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
                    await navigator.clipboard.writeText(code.innerText);
                    copyBtn.textContent = '已复制';
                    setTimeout(() => copyBtn.textContent = '复制', 1500);
                } catch {
                    copyBtn.textContent = '失败';
                    setTimeout(() => copyBtn.textContent = '复制', 1500);
                }
            });
            toolbar.appendChild(copyBtn);
            pre.insertBefore(toolbar, pre.firstChild);
            pre.dataset.enhanced = 'true';
        });
    }

    // 移动端侧边栏
    initMobileSidebar() {
        const checkMobile = () => {
            const isMobile = window.innerWidth <= 768;
            const floating = document.querySelector('.floating-buttons');
            if (floating) floating.style.display = isMobile ? 'flex' : 'none';
            if (this.tocScrollWrapper) {
                this.tocScrollWrapper.style.maxHeight = isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 220px)';
            }
        };

        const toggleHandler = () => this.toggleMobileSidebar();
        window.addEventListener('article:toggleSidebar', toggleHandler);
        this._toggleSidebarHandler = toggleHandler;
        let overlay = document.querySelector('.article-sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'article-sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => this.closeMobileSidebar());
        }
        this.resizeHandler = checkMobile;
        window.addEventListener('resize', this.resizeHandler);
        checkMobile();
    }

    toggleMobileSidebar() {
        const sidebar = document.querySelector('.article-sidebar');
        const overlay = document.querySelector('.article-sidebar-overlay');
        if (!sidebar) return;
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('open');
    }

    closeMobileSidebar() {
        const sidebar = document.querySelector('.article-sidebar');
        const overlay = document.querySelector('.article-sidebar-overlay');
        sidebar?.classList.remove('open');
        overlay?.classList.remove('open');
        document.body.style.overflow = '';
    }

    // 滚动位置保存
    initScrollSave() {
        const key = `scroll_${window.location.pathname}`;
        const saved = sessionStorage.getItem(key);
        if (saved) setTimeout(() => window.scrollTo(0, parseInt(saved)), 50);
        const save = () => sessionStorage.setItem(key, window.scrollY);
        window.addEventListener('scroll', save);
        this.cleanupFns.push(() => window.removeEventListener('scroll', save));
    }

    setupThemeListener() {
        const handler = () => {
            if (this.tocProgressFill) this.updateTocReadingProgress();
        };
        window.addEventListener('themeChanged', handler);
        this.cleanupFns.push(() => window.removeEventListener('themeChanged', handler));
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }
}

// 导出一个简单的初始化函数，供 router 调用
export async function initArticlePage() {
    const manager = new ArticlePageManager();
    await manager.init();
    return manager;
}