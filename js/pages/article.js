/**
 * article.js - 文章页面完整脚本（重构版）
 * 功能：TOC目录（静态展开、无折叠）、图片懒加载与模态框、阅读进度、代码块复制、移动端侧边栏
 * 重构重点：严格分离 TOC 标题区与滚动容器，确保目录项独立滚动。
 */

(function() {
    'use strict';

    // ==================== 全局配置 ====================
    const CONFIG = {
        SCROLL_OFFSET: 90,
        SCROLL_THROTTLE_MS: 60,
        TOC_SCROLL_OFFSET: 80,
        TOC_MAX_HEIGHT: 'calc(100vh - 220px)',
        LAZY_IMAGE_CLASS: 'lazy-image',
        IMAGE_OBSERVER_ROOT_MARGIN: '100px 0px',
        PROGRESS_BAR_ID: 'progress-bar'
    };

    // ==================== DOM 元素 ====================
    let tocListContainer = null;        // 目录列表容器（滚动容器内的 ul）
    let tocScrollWrapper = null;        // 目录滚动容器（.toc-list-wrapper）
    let tocHeader = null;               // 目录头部（固定不滚动）
    let headingsData = null;
    let headingsMap = new Map();
    let currentActiveId = null;
    let scrollTimer = null;
    
    // 阅读进度组件
    let tocProgressPercentElem = null;
    let tocProgressBarElem = null;
    
    // 其他功能实例
    let imageObserver = null;
    let progressHandler = null;
    let isMobile = false;
    
    // ==================== 辅助函数 ====================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function getHeadingElements() {
        const articleBody = document.getElementById('articleBody');
        if (!articleBody) return [];
        return articleBody.querySelectorAll('h1, h2, h3, h4');
    }
    
    function refreshHeadingsMap() {
        headingsMap.clear();
        getHeadingElements().forEach(h => {
            if (h.id) headingsMap.set(h.id, h);
        });
    }
    
    // ==================== TOC 树构建（静态无折叠） ====================
    function buildTree(headings) {
        const root = { children: [] };
        const stack = [{ node: root, level: 0 }];
        for (const heading of headings) {
            const { id, text, level } = heading;
            const newNode = { id, text, level, children: [] };
            while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
            const parent = stack[stack.length - 1].node;
            parent.children.push(newNode);
            stack.push({ node: newNode, level });
        }
        return root.children;
    }
    
    function renderTree(children) {
        if (!children || children.length === 0) return '';
        let html = '<ul class="toc-list">';
        for (const node of children) {
            const hasChildren = node.children && node.children.length > 0;
            html += `<li data-id="${node.id}" class="toc-depth-${node.level}">`;
            html += `<a href="#${node.id}" class="toc-link">${escapeHtml(node.text)}</a>`;
            if (hasChildren) html += renderTree(node.children);
            html += `</li>`;
        }
        html += '</ul>';
        return html;
    }
    
    function renderFullTOC() {
        if (!tocListContainer || !headingsData || headingsData.length === 0) {
            if (tocListContainer) tocListContainer.innerHTML = '<p class="toc-empty">暂无目录</p>';
            return;
        }
        const tree = buildTree(headingsData);
        const html = renderTree(tree);
        tocListContainer.innerHTML = html;
        bindTocLinkEvents();
    }
    
    function bindTocLinkEvents() {
        document.querySelectorAll('.toc-link').forEach(link => {
            link.removeEventListener('click', handleTocLinkClick);
            link.addEventListener('click', handleTocLinkClick);
        });
    }
    
    function handleTocLinkClick(e) {
        e.preventDefault();
        const href = this.getAttribute('href');
        if (!href) return;
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);
        if (!targetElement) return;
        
        smoothScrollToElement(targetElement, CONFIG.SCROLL_OFFSET);
        if (history.pushState) {
            history.pushState(null, null, href);
        } else {
            location.hash = href;
        }
        updateActiveItem(targetId);
        scrollTocToItem(targetId, true);
        if (isMobile) closeMobileSidebar();
    }
    
    function smoothScrollToElement(element, offset = CONFIG.SCROLL_OFFSET) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
    
    /**
     * 滚动目录容器，使指定 id 的目录项可见
     */
    function scrollTocToItem(itemId, smooth = false) {
        if (!tocScrollWrapper) return;
        const targetLi = document.querySelector(`.toc-list li[data-id="${itemId}"]`);
        if (!targetLi) return;
        
        targetLi.scrollIntoView({
            behavior: smooth ? 'smooth' : 'auto',
            block: 'nearest',
        });
    }
    
    function updateActiveItem(activeId) {
        if (!activeId || activeId === currentActiveId) return;
        document.querySelectorAll('.toc-list li').forEach(li => li.classList.remove('active'));
        const activeLi = document.querySelector(`.toc-list li[data-id="${activeId}"]`);
        if (activeLi) {
            activeLi.classList.add('active');
            scrollTocToItem(activeId, true);
        }
        currentActiveId = activeId;
    }
    
    function getCurrentActiveHeading() {
        const headings = Array.from(headingsMap.values());
        if (headings.length === 0) return null;
        const scrollTop = window.scrollY + CONFIG.SCROLL_OFFSET;
        let activeId = null;
        let minDistance = Infinity;
        for (const heading of headings) {
            const rect = heading.getBoundingClientRect();
            const offsetTop = rect.top + window.scrollY;
            const distance = Math.abs(offsetTop - scrollTop);
            if (distance < minDistance && offsetTop <= scrollTop + 80) {
                minDistance = distance;
                activeId = heading.id;
            }
        }
        return activeId;
    }
    
    function onScrollHandler() {
        if (scrollTimer) return;
        scrollTimer = setTimeout(() => {
            const activeId = getCurrentActiveHeading();
            if (activeId) updateActiveItem(activeId);
            updateTocReadingProgress();
            scrollTimer = null;
        }, CONFIG.SCROLL_THROTTLE_MS);
    }
    
    // ==================== 阅读进度组件（添加到固定标题区） ====================
    function initTocReadingProgress() {
        const tocHeaderElem = document.querySelector('.toc-header');
        if (!tocHeaderElem) return;
        tocHeader = tocHeaderElem;
        if (tocHeader.querySelector('.reading-progress-wrapper')) return;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'reading-progress-wrapper';
        const percentSpan = document.createElement('span');
        percentSpan.className = 'reading-percent';
        percentSpan.textContent = '0%';
        const progressContainer = document.createElement('div');
        progressContainer.className = 'reading-progress-container';
        const progressFill = document.createElement('div');
        progressFill.className = 'reading-progress-fill';
        progressFill.style.width = '0%';
        progressContainer.appendChild(progressFill);
        wrapper.appendChild(percentSpan);
        wrapper.appendChild(progressContainer);
        tocHeader.appendChild(wrapper);
        
        tocProgressPercentElem = percentSpan;
        tocProgressBarElem = progressFill;
        updateTocReadingProgress();
    }
    
    function updateTocReadingProgress() {
        if (!tocProgressPercentElem || !tocProgressBarElem) return;
        const scrollTop = window.pageYOffset;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        let percent = 0;
        if (docHeight > 0) percent = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
        tocProgressPercentElem.textContent = `${Math.round(percent)}%`;
        tocProgressBarElem.style.width = `${percent}%`;
    }
    
    // ==================== 重构核心：确保 TOC 结构严格分离 ====================
    function ensureTOCStructure() {
        const tocCard = document.querySelector('.sidebar-card.toc-card');
        if (!tocCard) return;
        
        // 检查是否已经存在正确的结构：.toc-header 和 .toc-list-wrapper 是兄弟
        let header = tocCard.querySelector('.toc-header');
        let wrapper = tocCard.querySelector('.toc-list-wrapper');
        
        if (!header) {
            // 如果没有标题区，创建一个
            header = document.createElement('div');
            header.className = 'toc-header';
            header.innerHTML = '<i class="fas fa-list-ul"></i><span>目录</span>';
            tocCard.insertBefore(header, tocCard.firstChild);
        }
        
        if (!wrapper) {
            // 如果没有滚动容器，创建一个
            wrapper = document.createElement('div');
            wrapper.className = 'toc-list-wrapper';
            // 将现有的 .toc-nav 或直接生成的列表移入 wrapper
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
        
        // 更新全局引用
        tocScrollWrapper = wrapper;
        const navElem = wrapper.querySelector('.toc-nav');
        tocListContainer = navElem || wrapper.querySelector('#toc-list-container');
        if (tocListContainer && !tocListContainer.id) tocListContainer.id = 'toc-list-container';
        
        // 确保滚动样式
        if (tocScrollWrapper) {
            tocScrollWrapper.style.overflowY = 'auto';
            tocScrollWrapper.style.flex = '1';
            tocScrollWrapper.style.minHeight = '0';
        }
    }
    
    // ==================== 图片懒加载、模态框、代码块、进度条等（保留原功能） ====================
    function initImageLazyLoad() { /* 原有代码不变，略写 */ 
        const images = document.querySelectorAll('#articleBody img');
        if (!images.length) return;
        images.forEach(img => {
            if (img.src && img.src !== '' && !img.dataset.src) img.classList.add('loaded');
        });
        if (!window.IntersectionObserver) {
            images.forEach(img => loadImage(img));
            return;
        }
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadImage(entry.target);
                    imageObserver.unobserve(entry.target);
                }
            });
        }, { rootMargin: CONFIG.IMAGE_OBSERVER_ROOT_MARGIN, threshold: 0.01 });
        images.forEach(img => imageObserver.observe(img));
    }
    function loadImage(img) {
        const src = img.dataset.src;
        if (!src) return;
        if (img.src === src && img.classList.contains('loaded')) return;
        img.classList.add('lazy-loading');
        const tempImg = new Image();
        tempImg.onload = () => {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('loaded');
            img.removeAttribute('data-src');
        };
        tempImg.onerror = () => img.classList.remove('lazy-loading');
        tempImg.src = src;
    }
    
    function initImageModal() { /* 原有代码不变，略写 */ 
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const closeBtn = modal?.querySelector('.close');
        if (!modal || !modalImg) return;
        function openModal(imgSrc) {
            modalImg.src = imgSrc;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        function closeModal() {
            modal.classList.remove('active');
            modalImg.src = '';
            document.body.style.overflow = '';
        }
        document.querySelectorAll('#articleBody img').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const src = img.dataset.src || img.src;
                if (src) openModal(src);
            });
        });
        closeBtn?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });
    }
    
    function initReadingProgress() {
        const progressBar = document.getElementById(CONFIG.PROGRESS_BAR_ID);
        if (!progressBar) return;
        progressHandler = () => {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollTop = window.pageYOffset;
            const progress = totalHeight > 0 ? (scrollTop / totalHeight) * 100 : 0;
            progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        };
        window.addEventListener('scroll', progressHandler, { passive: true });
        progressHandler();
    }
    
    function initCodeBlocks() { /* 原有代码不变，略写 */ 
        const pres = document.querySelectorAll('#articleBody pre');
        pres.forEach(pre => {
            if (pre.dataset.enhanced) return;
            const code = pre.querySelector('code');
            if (!code) return;
            let lang = '';
            if (code.className) {
                const match = code.className.match(/language-(\w+)/);
                if (match) lang = match[1];
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            const toolbar = document.createElement('div');
            toolbar.className = 'code-toolbar';
            if (lang) {
                const langSpan = document.createElement('span');
                langSpan.className = 'code-filetype';
                langSpan.textContent = lang.toUpperCase();
                toolbar.appendChild(langSpan);
            }
            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', async () => {
                const text = code.innerText;
                try {
                    await navigator.clipboard.writeText(text);
                    copyBtn.textContent = '已复制';
                    setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
                } catch {
                    copyBtn.textContent = '失败';
                    setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
                }
            });
            toolbar.appendChild(copyBtn);
            pre.insertBefore(toolbar, pre.firstChild);
            pre.dataset.enhanced = 'true';
        });
    }
    
    function initMobileSidebar() { /* 原有代码不变，略写，但需保证移动端滚动容器高度自适应 */
        checkMobile();
        window.addEventListener('resize', () => {
            checkMobile();
            updateTocReadingProgress();
        });
        createFloatingButtons();
        let overlay = document.querySelector('.article-sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'article-sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => closeMobileSidebar());
        }
        const sidebar = document.querySelector('.article-sidebar');
        if (sidebar) {
            const observer = new MutationObserver(() => {
                if (sidebar.classList.contains('open')) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            });
            observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        }
    }
    
    function checkMobile() {
        isMobile = window.innerWidth <= 768;
        const floating = document.querySelector('.floating-buttons');
        if (floating) floating.style.display = isMobile ? 'flex' : 'none';
        if (tocScrollWrapper) {
            if (isMobile) {
                tocScrollWrapper.style.maxHeight = 'calc(100vh - 160px)';
            } else {
                tocScrollWrapper.style.maxHeight = CONFIG.TOC_MAX_HEIGHT;
            }
        }
    }
    
    function createFloatingButtons() {
        if (document.querySelector('.floating-buttons')) return;
        const container = document.createElement('div');
        container.className = 'floating-buttons';
        const tocBtn = document.createElement('button');
        tocBtn.className = 'floating-btn';
        tocBtn.innerHTML = '📑';
        tocBtn.title = '目录';
        tocBtn.addEventListener('click', () => toggleMobileSidebar());
        const topBtn = document.createElement('button');
        topBtn.className = 'floating-btn';
        topBtn.innerHTML = '↑';
        topBtn.title = '返回顶部';
        topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        container.appendChild(tocBtn);
        container.appendChild(topBtn);
        document.body.appendChild(container);
        container.style.display = isMobile ? 'flex' : 'none';
        window.addEventListener('scroll', () => {
            topBtn.style.opacity = window.scrollY > 300 ? '1' : '0.6';
        });
        topBtn.style.opacity = window.scrollY > 300 ? '1' : '0.6';
    }
    
    function toggleMobileSidebar() {
        const sidebar = document.querySelector('.article-sidebar');
        const overlay = document.querySelector('.article-sidebar-overlay');
        if (!sidebar) return;
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay?.classList.remove('open');
        } else {
            sidebar.classList.add('open');
            overlay?.classList.add('open');
        }
    }
    
    function closeMobileSidebar() {
        const sidebar = document.querySelector('.article-sidebar');
        const overlay = document.querySelector('.article-sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
    
    function initScrollSave() {
        const key = `scroll_${window.location.pathname}`;
        const saved = sessionStorage.getItem(key);
        if (saved) setTimeout(() => window.scrollTo(0, parseInt(saved)), 50);
        const saveScroll = () => sessionStorage.setItem(key, window.scrollY);
        window.addEventListener('scroll', saveScroll, { passive: true });
        window.addEventListener('beforeunload', saveScroll);
    }
    
    // ==================== 主初始化 ====================
    function init() {
        // 1. 确保 DOM 结构完全符合 “标题固定 + 滚动容器独立”
        ensureTOCStructure();
        
        // 2. 获取核心元素引用
        tocListContainer = document.getElementById('toc-list-container');
        headingsData = window.ARTICLE_HEADINGS;
        refreshHeadingsMap();
        
        // 3. 渲染目录
        if (tocListContainer && headingsData && headingsData.length > 0) {
            renderFullTOC();
            initTocReadingProgress();
            
            window.addEventListener('scroll', onScrollHandler);
            
            setTimeout(() => {
                if (tocScrollWrapper) tocScrollWrapper.scrollTop = 0;
                let activeId = getCurrentActiveHeading();
                if (!activeId && headingsData.length > 0) activeId = headingsData[0].id;
                if (activeId) updateActiveItem(activeId);
                if (window.location.hash) {
                    const targetId = window.location.hash.substring(1);
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        smoothScrollToElement(targetEl);
                        updateActiveItem(targetId);
                        scrollTocToItem(targetId, true);
                    }
                }
            }, 100);
            
            const articleBody = document.getElementById('articleBody');
            if (articleBody && window.ResizeObserver) {
                const resizeObserver = new ResizeObserver(() => {
                    const activeId = getCurrentActiveHeading();
                    if (activeId) updateActiveItem(activeId);
                    updateTocReadingProgress();
                });
                resizeObserver.observe(articleBody);
            }
        } else if (tocListContainer) {
            tocListContainer.innerHTML = '<p class="toc-empty">暂无目录</p>';
        }
        
        // 设置滚动容器样式
        if (tocScrollWrapper && !isMobile) {
            tocScrollWrapper.style.maxHeight = CONFIG.TOC_MAX_HEIGHT;
            tocScrollWrapper.style.overflowY = 'auto';
            tocScrollWrapper.style.overflowX = 'hidden';
        }
        
        // 启动其他功能
        initImageLazyLoad();
        initImageModal();
        initReadingProgress();
        initCodeBlocks();
        initMobileSidebar();
        initScrollSave();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();