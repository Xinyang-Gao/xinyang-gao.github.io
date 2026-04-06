class ArticlePageManager {
    constructor() {
        this.scrollPositionKey = `scrollPosition_${window.location.pathname}${window.location.search}`;
        this.scrollTimer = null;
        this.observer = null;
        
    this.viewerActive = false;
    this.currentIndex = 0;
    this.galleryImages = [];
    this.viewerElement = null;
    this.viewerImage = null;
    this.viewerWrapper = null;
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.currentTransform = { x: 0, y: 0, scale: 1 };
    
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
    // 收集图片信息（真实 URL 优先从 data-src 获取）
    this.galleryImages = Array.from(images).map(img => ({
        src: img.dataset.src || img.src,
        alt: img.alt || img.title || ''
    }));
    
    // 为每个图片设置懒加载
    this.lazyLoadImages(images);
    
    // 绑定点击事件（打开查看器）
    images.forEach((img, index) => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openImageViewer(index);
        });
    });
}

lazyLoadImages(images) {
    if (!images.length) return;
    
    // 检查浏览器是否支持 Intersection Observer
    if (!window.IntersectionObserver) {
        // 降级：直接加载所有图片
        images.forEach(img => this.loadImage(img));
        return;
    }
    
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                this.loadImage(img);
                obs.unobserve(img); // 加载后停止观察
            }
        });
    }, {
        rootMargin: '100px 0px', // 提前 100px 开始加载
        threshold: 0.01
    });
    
    images.forEach(img => observer.observe(img));
}

loadImage(img) {
    const src = img.dataset.src;
    if (!src || img.src === src) return;
    
    // 添加加载状态类
    img.classList.add('lazy-loading');
    
    // 创建一个新的 Image 对象预加载
    const tempImage = new Image();
    tempImage.onload = () => {
        img.src = src;
        img.classList.remove('lazy-loading');
        img.classList.add('lazy-loaded');
        // 移除 data-src 属性
        img.removeAttribute('data-src');
    };
    tempImage.onerror = () => {
        img.classList.remove('lazy-loading');
        // 可设置一张错误占位图
    };
    tempImage.src = src;
}

/**
 * 打开图片查看器
 */
openImageViewer(index) {
    this.currentIndex = index;
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.currentTransform = { x: 0, y: 0, scale: 1 };
    
    this.createViewerDOM();
    this.updateViewerImage();
    this.bindViewerEvents();
    this.updateCounter();
    
    document.body.style.overflow = 'hidden';
    this.viewerActive = true;
    // 添加显示动画
    setTimeout(() => {
        if (this.viewerElement) {
            this.viewerElement.classList.add('active');
        }
    }, 10);
}

/**
 * 创建查看器DOM结构
 */
createViewerDOM() {
    // 如果已存在则移除
    if (this.viewerElement) {
        this.viewerElement.remove();
    }
    
    const viewer = document.createElement('div');
    viewer.className = 'modern-image-viewer';
    viewer.innerHTML = `
        <div class="viewer-overlay"></div>
        <div class="viewer-container">
            <button class="viewer-close" aria-label="关闭">&times;</button>
            <button class="viewer-prev" aria-label="上一张">‹</button>
            <button class="viewer-next" aria-label="下一张">›</button>
            <div class="viewer-toolbar">
                <button class="viewer-zoom-in" aria-label="放大">+</button>
                <button class="viewer-zoom-out" aria-label="缩小">-</button>
                <button class="viewer-reset" aria-label="重置">⟳</button>
                <span class="viewer-counter">1 / 1</span>
            </div>
            <div class="viewer-image-wrapper">
                <img class="viewer-image" alt="" draggable="false">
            </div>
        </div>
    `;
    
    document.body.appendChild(viewer);
    this.viewerElement = viewer;
    this.viewerImage = viewer.querySelector('.viewer-image');
    this.viewerWrapper = viewer.querySelector('.viewer-image-wrapper');
}

/**
 * 更新当前显示的图片
 */
updateViewerImage() {
    if (!this.viewerImage || !this.galleryImages[this.currentIndex]) return;
    
    const imgData = this.galleryImages[this.currentIndex];
    this.viewerImage.alt = imgData.alt;
    this.viewerImage.src = imgData.src;
    
    // 重置变换
    this.resetImageTransform();
    this.updateCounter();
}

/**
 * 重置图片缩放和位置
 */
resetImageTransform() {
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.currentTransform = { x: 0, y: 0, scale: 1 };
    this.applyTransform();
}

/**
 * 应用CSS变换
 */
applyTransform() {
    if (!this.viewerImage) return;
    const { translateX, translateY, scale } = this.transform;
    this.viewerImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

/**
 * 缩放图片
 */
zoomImage(delta) {
    let newScale = this.transform.scale + delta;
    newScale = Math.min(Math.max(0.5, newScale), 5);
    
    if (newScale !== this.transform.scale) {
        this.transform.scale = newScale;
        // 如果缩放为1，重置位置
        if (newScale === 1) {
            this.transform.translateX = 0;
            this.transform.translateY = 0;
            this.currentTransform = { x: 0, y: 0, scale: 1 };
        } else {
            // 边界限制（简化处理）
            this.transform.translateX = Math.min(Math.max(this.transform.translateX, -300), 300);
            this.transform.translateY = Math.min(Math.max(this.transform.translateY, -300), 300);
        }
        this.applyTransform();
    }
}

/**
 * 切换上一张/下一张
 */
switchImage(direction) {
    let newIndex = this.currentIndex + direction;
    if (newIndex < 0) newIndex = this.galleryImages.length - 1;
    if (newIndex >= this.galleryImages.length) newIndex = 0;
    
    if (newIndex === this.currentIndex) return;
    
    this.currentIndex = newIndex;
    this.updateViewerImage();
}

/**
 * 更新计数器显示
 */
updateCounter() {
    const counter = this.viewerElement?.querySelector('.viewer-counter');
    if (counter) {
        counter.textContent = `${this.currentIndex + 1} / ${this.galleryImages.length}`;
    }
    
    // 根据图片数量显示/隐藏导航按钮
    const prevBtn = this.viewerElement?.querySelector('.viewer-prev');
    const nextBtn = this.viewerElement?.querySelector('.viewer-next');
    if (this.galleryImages.length <= 1) {
        prevBtn?.style.setProperty('display', 'none');
        nextBtn?.style.setProperty('display', 'none');
    } else {
        prevBtn?.style.setProperty('display', 'flex');
        nextBtn?.style.setProperty('display', 'flex');
    }
}

/**
 * 绑定查看器事件
 */
bindViewerEvents() {
    if (!this.viewerElement) return;
    
    // 关闭按钮
    const closeBtn = this.viewerElement.querySelector('.viewer-close');
    closeBtn?.addEventListener('click', () => this.closeImageViewer());
    
    // 背景点击关闭
    const overlay = this.viewerElement.querySelector('.viewer-overlay');
    overlay?.addEventListener('click', () => this.closeImageViewer());
    
    // 上一张/下一张
    const prevBtn = this.viewerElement.querySelector('.viewer-prev');
    const nextBtn = this.viewerElement.querySelector('.viewer-next');
    prevBtn?.addEventListener('click', () => this.switchImage(-1));
    nextBtn?.addEventListener('click', () => this.switchImage(1));
    
    // 缩放按钮
    const zoomInBtn = this.viewerElement.querySelector('.viewer-zoom-in');
    const zoomOutBtn = this.viewerElement.querySelector('.viewer-zoom-out');
    const resetBtn = this.viewerElement.querySelector('.viewer-reset');
    zoomInBtn?.addEventListener('click', () => this.zoomImage(0.2));
    zoomOutBtn?.addEventListener('click', () => this.zoomImage(-0.2));
    resetBtn?.addEventListener('click', () => this.resetImageTransform());
    
    // 双击重置
    this.viewerImage?.addEventListener('dblclick', () => this.resetImageTransform());
    
    // 鼠标/触摸拖拽平移
    this.initDragEvents();
    
    // 键盘事件
    document.addEventListener('keydown', this.handleViewerKeydown);
}

/**
 * 初始化拖拽平移事件
 */
initDragEvents() {
    if (!this.viewerImage) return;
    
    const onPointerDown = (e) => {
        // 只在缩放大于1时允许拖拽
        if (this.transform.scale <= 1) return;
        
        e.preventDefault();
        this.isDragging = true;
        this.dragStart = {
            x: e.clientX - this.transform.translateX,
            y: e.clientY - this.transform.translateY
        };
        this.viewerImage.style.cursor = 'grabbing';
    };
    
    const onPointerMove = (e) => {
        if (!this.isDragging) return;
        
        const newX = e.clientX - this.dragStart.x;
        const newY = e.clientY - this.dragStart.y;
        
        // 边界限制（可调整）
        const maxTranslate = 200;
        this.transform.translateX = Math.min(Math.max(newX, -maxTranslate), maxTranslate);
        this.transform.translateY = Math.min(Math.max(newY, -maxTranslate), maxTranslate);
        this.applyTransform();
    };
    
    const onPointerUp = () => {
        this.isDragging = false;
        if (this.viewerImage) {
            this.viewerImage.style.cursor = 'grab';
        }
    };
    
    this.viewerImage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    
    // 保存以便移除
    this.viewerDragHandlers = { onPointerDown, onPointerMove, onPointerUp };
}

/**
 * 键盘事件处理
 */
handleViewerKeydown = (e) => {
    if (!this.viewerActive) return;
    
    switch(e.key) {
        case 'Escape':
            this.closeImageViewer();
            break;
        case 'ArrowLeft':
            this.switchImage(-1);
            break;
        case 'ArrowRight':
            this.switchImage(1);
            break;
        case '+':
        case '=':
            this.zoomImage(0.2);
            break;
        case '-':
            this.zoomImage(-0.2);
            break;
        default:
            break;
    }
};

/**
 * 关闭图片查看器
 */
closeImageViewer() {
    if (!this.viewerActive) return;
    
    document.body.style.overflow = '';
    this.viewerActive = false;
    
    // 移除键盘事件
    document.removeEventListener('keydown', this.handleViewerKeydown);
    
    // 移除拖拽事件
    if (this.viewerDragHandlers && this.viewerImage) {
        this.viewerImage.removeEventListener('pointerdown', this.viewerDragHandlers.onPointerDown);
        window.removeEventListener('pointermove', this.viewerDragHandlers.onPointerMove);
        window.removeEventListener('pointerup', this.viewerDragHandlers.onPointerUp);
    }
    
    if (this.viewerElement) {
        this.viewerElement.classList.remove('active');
        setTimeout(() => {
            if (this.viewerElement) {
                this.viewerElement.remove();
                this.viewerElement = null;
            }
        }, 300);
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

// 在 article.js 中添加（DOMContentLoaded 内部或直接执行）
function addImageAltCaptions() {
  const articleBody = document.querySelector('.article-body');
  if (!articleBody) return;

  const images = articleBody.querySelectorAll('img');
  images.forEach(img => {
    // 避免重复添加（检查下一个兄弟元素是否已经是 caption）
    const nextSibling = img.nextElementSibling;
    if (nextSibling && nextSibling.classList && nextSibling.classList.contains('image-alt-text')) {
      return;
    }

    const altText = img.getAttribute('alt');
    // 如果 alt 为空或仅为空格，则不显示
    if (!altText || altText.trim() === '') return;

    // 创建描述元素
    const caption = document.createElement('span');
    caption.className = 'image-alt-text';
    caption.textContent = altText.trim();

    // 插入到图片后面
    img.insertAdjacentElement('afterend', caption);
  });
}

// 执行时机：文章主体内容已渲染
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addImageAltCaptions);
} else {
  addImageAltCaptions();
}

// 初始化文章页面管理器
new ArticlePageManager();