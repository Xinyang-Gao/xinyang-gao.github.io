class ArticlePageManager {
    constructor() {
        this.scrollPositionKey = `scrollPosition_${window.location.pathname}${window.location.search}`;
        this.scrollTimer = null;
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
            this.resetAnimations();
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
            clearTimeout(this.scrollTimer);
            this.scrollTimer = setTimeout(() => {
                sessionStorage.setItem(this.scrollPositionKey, window.scrollY);
            }, 250);
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
        const itemTop = activeItem.offsetTop;
        const containerHeight = tocContainer.clientHeight;
        if (itemTop > tocContainer.scrollTop + containerHeight - 50 || itemTop < tocContainer.scrollTop) {
            tocContainer.scrollTo({ top: itemTop - 50, behavior: 'smooth' });
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
        if (!src || (img.src === src && img.classList.contains('loaded'))) {
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

    openImageViewer(index) {
        if (!this.galleryImages.length || typeof window.ImageViewer === 'undefined') return;
        this.currentIndex = Math.min(Math.max(0, index), this.galleryImages.length - 1);
        new window.ImageViewer(this.galleryImages, this.currentIndex, {
            onClose: () => { /* 可在此添加关闭后的回调 */ }
        });
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

    resetAnimations() {
        const elements = [
            document.getElementById('articleTitle'),
            document.getElementById('articleMeta'),
            document.getElementById('articleBody')
        ];
        elements.forEach(el => {
            if (el) {
                el.style.animation = 'none';
                void el.offsetWidth;
                el.style.animation = '';
            }
        });
        setTimeout(() => {
            const tocItems = document.querySelectorAll('.toc-list li');
            tocItems.forEach((item, index) => {
                item.style.animation = 'none';
                void item.offsetWidth;
                item.style.animation = '';
                item.style.animationDelay = `${index < 5 ? 0.1 + index * 0.1 : 0.6}s`;
            });
        }, 100);
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
}

function addImageAltCaptions() {
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addImageAltCaptions);
} else {
    addImageAltCaptions();
}

new ArticlePageManager();

function initCodeBlocks() {
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeBlocks);
} else {
    initCodeBlocks();
}

function initMermaidAndMath() {
    const articleBody = document.getElementById('articleBody');
    if (!articleBody) return;

    const mermaidSelectors = ['pre code.language-mermaid', 'pre code.mermaid', 'code.language-mermaid'];
    const mermaidNodes = articleBody.querySelectorAll(mermaidSelectors.join(','));
    mermaidNodes.forEach(code => {
        const pre = code.closest('pre');
        const text = code.textContent || '';
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = text.trim();
        if (pre && pre.parentNode) pre.parentNode.replaceChild(div, pre);
        else if (code.parentNode) code.parentNode.replaceChild(div, code);
    });

    function runMermaid() {
        try {
            if (window.mermaid && window.mermaid.initialize) {
                window.mermaid.initialize({ startOnLoad: false });
                window.mermaid.init(undefined, articleBody.querySelectorAll('.mermaid'));
            }
        } catch (e) { console.warn('Mermaid 渲染失败', e); }
    }

    if (document.querySelector('.mermaid')) {
        if (window.mermaid) runMermaid();
        else {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.4.0/dist/mermaid.min.js';
            s.defer = true;
            s.onload = runMermaid;
            s.onerror = () => console.warn('无法加载 Mermaid 脚本');
            document.head.appendChild(s);
        }
    }

    function runMath() {
        try {
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(articleBody, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ]
                });
            } else if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([articleBody]).catch(() => {});
            } else if (window.katex && !window.renderMathInElement) {
                const s2 = document.createElement('script');
                s2.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js';
                s2.defer = true;
                s2.onload = () => {
                    try {
                        renderMathInElement(articleBody, {
                            delimiters: [
                                { left: '$$', right: '$$', display: true },
                                { left: '$', right: '$', display: false }
                            ]
                        });
                    } catch (e) { console.warn('KaTeX auto-render 执行失败', e); }
                };
                s2.onerror = () => console.warn('无法加载 KaTeX auto-render 脚本');
                document.head.appendChild(s2);
            }
        } catch (e) { console.warn('数学公式渲染异常', e); }
    }
    runMath();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMermaidAndMath);
} else {
    initMermaidAndMath();
}