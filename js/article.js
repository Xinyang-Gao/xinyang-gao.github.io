class ArticlePageManager {
    constructor() {
        this.scrollPositionKey = `scrollPosition_${window.location.pathname}${window.location.search}`;
        this.scrollTicking = false;
        this.observer = null;
        
        this.galleryImages = [];
        this.currentIndex = 0;
        
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
            this.ensureTOCItemVisibility(activeItem);
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

    // 新增：为图片添加 alt 文本作为说明
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

    // 新增：代码块增强（复制按钮等）
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
}

// 启动管理器
new ArticlePageManager();