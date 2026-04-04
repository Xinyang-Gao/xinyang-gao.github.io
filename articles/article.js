class ArticlePageManager {
    constructor() {
        this.scrollPositionKey = `scrollPosition_${window.location.pathname}${window.location.search}`;
        this.scrollTimer = null;
        this.observer = null;
        
        this.init();
    }

    /**
     * 初始化所有功能模块
     */
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

    /**
     * 恢复页面滚动位置
     */
    restoreScrollPosition() {
        const savedPosition = sessionStorage.getItem(this.scrollPositionKey);
        if (savedPosition) {
            requestAnimationFrame(() => {
                window.scrollTo(0, parseInt(savedPosition));
            });
        }
    }

    /**
     * 设置滚动位置监听器
     */
    setupScrollListener() {
        window.addEventListener('scroll', () => {
            clearTimeout(this.scrollTimer);
            this.scrollTimer = setTimeout(() => {
                sessionStorage.setItem(this.scrollPositionKey, window.scrollY);
            }, 250);
        }, { passive: true });
    }

    /**
     * 生成文章目录
     */
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

    /**
     * 构建目录HTML结构
     */
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

    /**
     * 绑定目录点击事件
     */
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

    /**
     * 提取目标ID
     */
    extractTargetId(href) {
        return href.substring(1);
    }

    /**
     * HTML转义，防XSS攻击
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 初始化滚动监听和高亮功能
     */
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
            
            if (mostVisible) {
                this.updateActiveTOCItem(mostVisible);
            }
        }, options);

        // 观察所有标题元素
        document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4')
            .forEach(heading => {
                this.observer.observe(heading);
            });
    }

    /**
     * 更新活动目录项
     */
    updateActiveTOCItem(activeId) {
        const tocItems = document.querySelectorAll('#toc-list-container li');
        tocItems.forEach(item => item.classList.remove('active'));

        const activeItem = document.querySelector(`#toc-list-container li[data-target-id="${activeId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            this.ensureTOCItemVisibility(activeItem);
        }
    }

    /**
     * 确保目录项在容器中可见
     */
    ensureTOCItemVisibility(activeItem) {
        const tocContainer = document.querySelector('.toc-container');
        if (!tocContainer) return;

        const itemTop = activeItem.offsetTop;
        const containerHeight = tocContainer.clientHeight;
        
        if (itemTop > tocContainer.scrollTop + containerHeight - 50 || itemTop < tocContainer.scrollTop) {
            tocContainer.scrollTo({
                top: itemTop - 50,
                behavior: 'smooth'
            });
        }
    }

    /**
     * 平滑滚动到指定元素
     */
    smoothScrollTo(element, offset = 90) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }

    /**
     * 初始化图片功能
     */
    initImageFeatures() {
        const images = document.querySelectorAll('#articleBody img');
        images.forEach(img => {
            img.classList.add('lazy-image', 'loaded');
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showImageModal(img);
            });
        });
        
        this.setupImageModal();
    }

    /**
     * 设置图片预览模态框
     */
    setupImageModal() {
        const modal = document.getElementById('imageModal');
        const closeBtn = document.querySelector('.close');
        
        if (!modal) return;
        
        closeBtn?.addEventListener('click', () => this.hideImageModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideImageModal();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                this.hideImageModal();
            }
        });
    }

    /**
     * 显示图片模态框
     */
    showImageModal(imgElement) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const captionText = document.getElementById('imageCaption');
        
        modal.style.display = 'block';
        modalImg.src = imgElement.src;
        captionText.textContent = imgElement.alt || imgElement.title || '';
        
        sessionStorage.setItem('scrollPositionBeforeModal', window.scrollY);
    }

    /**
     * 隐藏图片模态框
     */
    hideImageModal() {
        const modal = document.getElementById('imageModal');
        modal.style.display = 'none';
        
        const savedPosition = sessionStorage.getItem('scrollPositionBeforeModal');
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition));
            sessionStorage.removeItem('scrollPositionBeforeModal');
        }
    }

    /**
     * 初始化阅读进度条
     */
    initReadingProgress() {
        const progressBar = document.getElementById('progress-bar');
        
        const updateProgress = () => {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollTop = window.pageYOffset;
            const progress = Math.max(0, Math.min(100, (scrollTop / totalHeight) * 100));
            
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
        };
        
        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress();
    }

    /**
     * 重置动画
     */
    resetAnimations() {
        const elements = [
            document.getElementById('articleTitle'),
            document.getElementById('articleMeta'),
            document.getElementById('articleBody')
        ];
        
        elements.forEach(el => {
            if (el) {
                el.style.animation = 'none';
                void el.offsetWidth; // 强制重排
                el.style.animation = '';
            }
        });

        // 为目录项设置动画
        setTimeout(() => {
            const tocItems = document.querySelectorAll('.toc-list li');
            tocItems.forEach((item, index) => {
                item.style.animation = 'none';
                void item.offsetWidth;
                item.style.animation = '';
                
                // 设置动画延迟
                if (index < 5) {
                    item.style.animationDelay = `${0.1 + index * 0.1}s`;
                } else {
                    item.style.animationDelay = '0.6s';
                }
            });
        }, 100);
    }

    /**
     * 添加浮动按钮
     */
    addFloatingButtons() {
        if (document.getElementById('floating-buttons')) return;

        const buttonContainer = this.createButtonContainer();
        document.body.appendChild(buttonContainer);
    }

    /**
     * 创建按钮容器
     */
    createButtonContainer() {
        const container = document.createElement('div');
        container.id = 'floating-buttons';
        container.className = 'floating-buttons';

        // 评论按钮
        const commentBtn = document.createElement('button');
        commentBtn.id = 'goto-comments';
        commentBtn.className = 'floating-btn comment-btn';
        commentBtn.innerHTML = '评论';
        commentBtn.title = '跳转到评论区';
        commentBtn.addEventListener('click', () => {
            const commentsSection = document.querySelector('.comments-card');
            if (commentsSection) {
                this.smoothScrollTo(commentsSection, 20);
            } else {
                console.warn('未找到评论区卡片');
            }
        });

        // 返回顶部按钮
        const topBtn = document.createElement('button');
        topBtn.id = 'back-to-top';
        topBtn.className = 'floating-btn top-btn';
        topBtn.innerHTML = '↑';
        topBtn.title = '返回页面顶部';
        topBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        container.appendChild(commentBtn);
        container.appendChild(topBtn);
        return container;
    }
}

// 初始化文章页面管理器
new ArticlePageManager();