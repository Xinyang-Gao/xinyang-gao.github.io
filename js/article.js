// article.js
class ArticlePageManager {
    constructor() {
        this.scrollPositionKey = `scrollPosition_${window.location.pathname}${window.location.search}`;
        this.scrollTicking = false;
        this.observer = null;
        
        this.galleryImages = [];
        this.currentIndex = 0;
        
        // 移动端目录浮窗相关属性
        this.isMobileMode = false;
        this.mobileTOCActive = false;
        this.tocFloatBtn = null;
        this.tocCloseBtn = null;
        this.resizeTimer = null;
        
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.restoreScrollPosition();
            this.setupScrollListener();
            this.generateTOC();
            this.initImageFeatures();
            this.initReadingProgress();
            this.initScrollSpy();
            this.addFloatingButtons();
            this.addImageAltCaptions();
            this.initCodeBlocks();
            this.setupMobileTOC(); // 初始化移动端目录浮窗功能
        });
        // 页面关闭前保存滚动位置
        window.addEventListener('beforeunload', () => {
            sessionStorage.setItem(this.scrollPositionKey, window.scrollY);
        });
    }

    restoreScrollPosition() {
        const savedPosition = sessionStorage.getItem(this.scrollPositionKey);
        if (savedPosition) {
            requestAnimationFrame(() => {
                window.scrollTo(0, parseInt(savedPosition));
            });
        }
    }

    setupScrollListener() {
        window.addEventListener('scroll', () => {
            if (!this.scrollTicking) {
                requestAnimationFrame(() => {
                    sessionStorage.setItem(this.scrollPositionKey, window.scrollY);
                    this.scrollTicking = false;
                });
                this.scrollTicking = true;
            }
        }, { passive: true });
    }

    generateTOC() {
        const container = document.getElementById('toc-list-container');
        if (!container) return;

        const headings = window.ARTICLE_HEADINGS || [];
        
        if (headings.length === 0) {
            container.innerHTML = '<p class="no-toc">暂无目录</p>';
            return;
        }

        const tocHTML = this.buildTOCHTML(headings);
        container.innerHTML = tocHTML;
        this.bindTOCEvents(container);
    }

    buildTOCHTML(headings) {
        let tocHTML = '<ul class="toc-list">';
        headings.forEach(heading => {
            const levelClass = `toc-h${heading.level}`;
            tocHTML += `
                <li class="${levelClass}" data-target-id="${heading.id}">
                    <a href="#${heading.id}">${this.escapeHtml(heading.text)}</a>
                </li>
            `;
        });
        tocHTML += '</ul>';
        return tocHTML;
    }

    bindTOCEvents(container) {
        container.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = this.extractTargetId(link.getAttribute('href'));
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    this.smoothScrollTo(targetElement);
                    this.updateActiveTOCItem(targetId);
                    // 移动端模式下点击跳转后关闭浮窗
                    if (this.isMobileMode && this.mobileTOCActive) {
                        this.closeMobileTOC();
                    }
                }
            });
        });
    }

    extractTargetId(href) {
        return href.substring(1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initScrollSpy() {
        const options = {
            root: null,
            rootMargin: '-100px 0px -70% 0px',
            threshold: [0, 0.1, 0.5, 1]
        };

        this.observer = new IntersectionObserver((entries) => {
            let mostVisible = null;
            let highestRatio = 0;
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > highestRatio) {
                    highestRatio = entry.intersectionRatio;
                    mostVisible = entry.target.id;
                }
            });
            if (mostVisible) this.updateActiveTOCItem(mostVisible);
        }, options);

        document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4')
            .forEach(heading => this.observer.observe(heading));
    }

    updateActiveTOCItem(activeId) {
        const tocItems = document.querySelectorAll('#toc-list-container li');
        tocItems.forEach(item => item.classList.remove('active'));
        const activeItem = document.querySelector(`#toc-list-container li[data-target-id="${activeId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            // 仅在移动端浮窗打开时考虑滚动可见性，避免PC端干扰
            if (this.isMobileMode && this.mobileTOCActive) {
                this.ensureTOCItemVisibility(activeItem);
            } else if (!this.isMobileMode) {
                // PC端保持原有滚动可见性逻辑
                this.ensureTOCItemVisibility(activeItem);
            }
        }
    }

    ensureTOCItemVisibility(activeItem) {
        const tocContainer = document.querySelector('.toc-container');
        if (!tocContainer) return;
        const containerRect = tocContainer.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        const relativeTop = itemRect.top - containerRect.top + tocContainer.scrollTop;
        if (relativeTop > tocContainer.clientHeight - 50 || relativeTop < 0) {
            tocContainer.scrollTo({ top: relativeTop - 50, behavior: 'smooth' });
        }
    }

    smoothScrollTo(element, offset = 90) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }

    initImageFeatures() {
        const images = document.querySelectorAll('#articleBody img');
        if (!images.length) return;

        images.forEach(img => {
            if (!img.classList.contains('lazy-image')) img.classList.add('lazy-image');
            if (img.src && img.src !== '' && !img.dataset.src) img.classList.add('loaded');
        });

        this.galleryImages = Array.from(images).map(img => ({
            src: img.dataset.src || img.src,
            alt: img.alt || img.title || ''
        }));
        
        this.lazyLoadImages(images);
    }

    lazyLoadImages(images) {
        if (!images.length) return;
        if (!window.IntersectionObserver) {
            images.forEach(img => this.loadImage(img));
            return;
        }
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        }, { rootMargin: '100px 0px', threshold: 0.01 });
        images.forEach(img => observer.observe(img));
    }

    loadImage(img, onLoadCallback) {
        const src = img.dataset.src;
        if (!src) {
            if (onLoadCallback) onLoadCallback();
            return;
        }
        const toAbs = (url) => {
            try {
                return new URL(url, window.location.href).href;
            } catch(e) {
                return url;
            }
        };
        if (toAbs(img.src) === toAbs(src) && img.classList.contains('loaded')) {
            if (onLoadCallback) onLoadCallback();
            return;
        }
        img.classList.add('lazy-loading');
        const tempImage = new Image();
        tempImage.onload = () => {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('loaded');
            img.removeAttribute('data-src');
            if (onLoadCallback) onLoadCallback();
        };
        tempImage.onerror = () => {
            img.classList.remove('lazy-loading');
            if (onLoadCallback) onLoadCallback();
        };
        tempImage.src = src;
    }

    // 保留以备将来使用，若没有 ImageViewer 则静默忽略
    openImageViewer(index) {
        if (!this.galleryImages.length) return;
        if (typeof window.ImageViewer !== 'undefined') {
            this.currentIndex = Math.min(Math.max(0, index), this.galleryImages.length - 1);
            new window.ImageViewer(this.galleryImages, this.currentIndex, {
                onClose: () => {}
            });
        } else {
            // fallback: 在新窗口打开图片
            const img = this.galleryImages[index];
            if (img && img.src) window.open(img.src, '_blank');
        }
    }

    initReadingProgress() {
        const progressBar = document.getElementById('progress-bar');
        const updateProgress = () => {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollTop = window.pageYOffset;
            const progress = Math.max(0, Math.min(100, (scrollTop / totalHeight) * 100));
            if (progressBar) progressBar.style.width = `${progress}%`;
        };
        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress();
    }

    addFloatingButtons() {
        if (document.getElementById('floating-buttons')) return;
        const buttonContainer = this.createButtonContainer();
        document.body.appendChild(buttonContainer);
    }

    createButtonContainer() {
        const container = document.createElement('div');
        container.id = 'floating-buttons';
        container.className = 'floating-buttons';

        const commentBtn = document.createElement('button');
        commentBtn.id = 'goto-comments';
        commentBtn.className = 'floating-btn comment-btn';
        commentBtn.innerHTML = '评论';
        commentBtn.title = '跳转到评论区';
        commentBtn.addEventListener('click', () => {
            const commentsSection = document.querySelector('.comments-card');
            if (commentsSection) this.smoothScrollTo(commentsSection, 20);
        });

        const topBtn = document.createElement('button');
        topBtn.id = 'back-to-top';
        topBtn.className = 'floating-btn top-btn';
        topBtn.innerHTML = '↑';
        topBtn.title = '返回页面顶部';
        topBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        container.appendChild(commentBtn);
        container.appendChild(topBtn);
        return container;
    }

    // 为图片添加 alt 文本作为说明
    addImageAltCaptions() {
        const articleBody = document.querySelector('.article-body');
        if (!articleBody) return;
        const images = articleBody.querySelectorAll('img');
        images.forEach(img => {
            const nextSibling = img.nextElementSibling;
            if (nextSibling && nextSibling.classList && nextSibling.classList.contains('image-alt-text')) return;
            const altText = img.getAttribute('alt');
            if (!altText || altText.trim() === '') return;
            const caption = document.createElement('span');
            caption.className = 'image-alt-text';
            caption.textContent = altText.trim();
            img.insertAdjacentElement('afterend', caption);
        });
    }

    // 代码块增强（复制按钮等）
    initCodeBlocks() {
        const pres = document.querySelectorAll('.article-content-wrapper pre');
        if (!pres || pres.length === 0) return;
        pres.forEach(pre => {
            if (pre.dataset.codeEnhanced === '1') return;
            const code = pre.querySelector('code');
            if (!code) return;
            const toolbar = document.createElement('div');
            toolbar.className = 'code-toolbar';
            let lang = '';
            if (code.classList && code.classList.length) {
                code.classList.forEach(cl => {
                    if (cl.startsWith('language-')) lang = cl.replace('language-', '').trim();
                });
            }
            if (lang) {
                const ft = document.createElement('span');
                ft.className = 'code-filetype';
                ft.textContent = lang.toUpperCase();
                toolbar.appendChild(ft);
            }
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'code-copy-btn';
            copyBtn.title = '复制代码';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', async () => {
                const text = code.innerText || code.textContent || '';
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        ta.remove();
                    }
                    const prev = copyBtn.textContent;
                    copyBtn.textContent = '已复制';
                    setTimeout(() => { copyBtn.textContent = prev; }, 1400);
                } catch (err) {
                    copyBtn.textContent = '复制失败';
                    setTimeout(() => { copyBtn.textContent = '复制'; }, 1600);
                }
            });
            toolbar.appendChild(copyBtn);
            pre.insertBefore(toolbar, pre.firstChild);
            pre.dataset.codeEnhanced = '1';
        });
    }

    // ========== 移动端目录浮窗功能 ==========
    setupMobileTOC() {
        this.checkMobileMode();
        window.addEventListener('resize', () => {
            if (this.resizeTimer) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.checkMobileMode();
            }, 200);
        });
    }

    checkMobileMode() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile && !this.isMobileMode) {
            this.enableMobileMode();
        } else if (!isMobile && this.isMobileMode) {
            this.disableMobileMode();
        }
    }

    enableMobileMode() {
        this.isMobileMode = true;
        const tocContainer = document.querySelector('.toc-container');
        if (!tocContainer) return;

        // 隐藏原始目录（浮窗样式默认隐藏）
        tocContainer.classList.add('mobile-float-toc');
        tocContainer.style.display = 'none';
        
        // 添加目录浮动按钮
        this.addMobileTOCButton();
        
        // 添加关闭按钮到浮窗内
        this.addCloseButtonToTOC();
        
        // 绑定打开/关闭事件
        this.bindMobileTOCEvents();
        
        // 如果目录已经生成，确保浮窗内内容正常
        this.refreshMobileTOCContent();
    }

    disableMobileMode() {
        this.isMobileMode = false;
        const tocContainer = document.querySelector('.toc-container');
        if (tocContainer) {
            tocContainer.classList.remove('mobile-float-toc');
            tocContainer.style.display = '';
            // 移除关闭按钮
            if (this.tocCloseBtn && this.tocCloseBtn.parentNode) {
                this.tocCloseBtn.parentNode.removeChild(this.tocCloseBtn);
                this.tocCloseBtn = null;
            }
        }
        // 移除浮动按钮
        if (this.tocFloatBtn && this.tocFloatBtn.parentNode) {
            this.tocFloatBtn.parentNode.removeChild(this.tocFloatBtn);
            this.tocFloatBtn = null;
        }
        // 关闭浮窗状态重置
        this.mobileTOCActive = false;
    }

    addMobileTOCButton() {
        if (this.tocFloatBtn) return;
        const floatingContainer = document.getElementById('floating-buttons');
        if (!floatingContainer) return;
        
        const tocBtn = document.createElement('button');
        tocBtn.id = 'mobile-toc-btn';
        tocBtn.className = 'floating-btn toc-float-btn';
        tocBtn.innerHTML = '📑';
        tocBtn.title = '显示目录';
        tocBtn.setAttribute('aria-label', '显示文章目录');
        tocBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMobileTOC();
        });
        
        // 插入到评论按钮之前，保持合适顺序
        const commentBtn = document.getElementById('goto-comments');
        if (commentBtn) {
            floatingContainer.insertBefore(tocBtn, commentBtn);
        } else {
            floatingContainer.appendChild(tocBtn);
        }
        this.tocFloatBtn = tocBtn;
    }

    addCloseButtonToTOC() {
        if (this.tocCloseBtn) return;
        const tocContainer = document.querySelector('.toc-container');
        if (!tocContainer) return;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-toc-close';
        closeBtn.innerHTML = '✕';
        closeBtn.setAttribute('aria-label', '关闭目录');
        closeBtn.title = '关闭目录';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeMobileTOC();
        });
        tocContainer.insertBefore(closeBtn, tocContainer.firstChild);
        this.tocCloseBtn = closeBtn;
    }

    bindMobileTOCEvents() {
        // 点击文档其他区域关闭浮窗（可选）
        document.addEventListener('click', (e) => {
            if (!this.isMobileMode || !this.mobileTOCActive) return;
            const tocContainer = document.querySelector('.toc-container');
            const tocBtn = this.tocFloatBtn;
            if (tocContainer && !tocContainer.contains(e.target) && tocBtn && !tocBtn.contains(e.target)) {
                this.closeMobileTOC();
            }
        });
    }

    toggleMobileTOC() {
        if (this.mobileTOCActive) {
            this.closeMobileTOC();
        } else {
            this.openMobileTOC();
        }
    }

    openMobileTOC() {
        if (!this.isMobileMode) return;
        const tocContainer = document.querySelector('.toc-container');
        if (!tocContainer) return;
        
        tocContainer.style.display = 'flex';
        this.mobileTOCActive = true;
        
        // 打开时更新活动目录项并滚动到可视区域
        this.updateActiveTOCItemForVisible();
        
        // 避免页面滚动穿透（简单处理，添加类）
        document.body.style.overflow = 'hidden';
        tocContainer.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: false });
        
        // 更新按钮样式（可选）
        if (this.tocFloatBtn) {
            this.tocFloatBtn.classList.add('active');
        }
    }

    closeMobileTOC() {
        if (!this.isMobileMode) return;
        const tocContainer = document.querySelector('.toc-container');
        if (tocContainer) {
            tocContainer.style.display = 'none';
        }
        this.mobileTOCActive = false;
        document.body.style.overflow = '';
        if (this.tocFloatBtn) {
            this.tocFloatBtn.classList.remove('active');
        }
    }

    updateActiveTOCItemForVisible() {
        // 获取当前滚动位置最可见的标题
        const headings = document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4');
        let bestMatch = null;
        let bestPosition = Infinity;
        const scrollPos = window.scrollY + 120; // 偏移量
        
        headings.forEach(heading => {
            const offsetTop = heading.offsetTop;
            if (offsetTop <= scrollPos && (scrollPos - offsetTop) < bestPosition) {
                bestPosition = scrollPos - offsetTop;
                bestMatch = heading;
            }
        });
        
        if (bestMatch && bestMatch.id) {
            this.updateActiveTOCItem(bestMatch.id);
        }
    }

    refreshMobileTOCContent() {
        // 确保目录内容已经存在，不需要重新生成，但若丢失则重新生成
        const tocListContainer = document.getElementById('toc-list-container');
        if (tocListContainer && (!tocListContainer.querySelector('.toc-list') || tocListContainer.querySelector('.toc-list')?.children.length === 0)) {
            // 如果目录为空，尝试重新生成（一般不会发生）
            this.generateTOC();
        }
    }
}

// 启动管理器
new ArticlePageManager();