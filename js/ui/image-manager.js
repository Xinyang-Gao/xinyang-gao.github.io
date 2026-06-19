// /js/ui/image-manager.js
// 图片延迟加载与全局图片查看器管理
// 仅加载外部 CSS，无内联样式

export class LazyImageLoader {
  static #observer = null;

  static init() {
    if (!('IntersectionObserver' in window)) {
      console.warn('[LazyImageLoader] 浏览器不支持 IntersectionObserver，跳过懒加载');
      return;
    }

    if (this.#observer) {
      this.#observer.disconnect();
      console.log('[LazyImageLoader] 已有 Observer 已断开');
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src && !img.src) {
              console.log('[LazyImageLoader] 加载懒加载图片:', src);
              img.src = src;
              img.classList.remove('lazy-loading');
              img.classList.add('loaded');
              delete img.dataset.src;
            }
            this.#observer.unobserve(img);
          }
        });
      },
      { rootMargin: '50px 0px', threshold: 0.01 }
    );

    const lazyImages = document.querySelectorAll('img[data-src]');
    console.log(`[LazyImageLoader] 发现 ${lazyImages.length} 张懒加载图片`);
    lazyImages.forEach(img => this.#observer.observe(img));
  }

  static refresh() {
    if (!this.#observer) {
      console.warn('[LazyImageLoader] refresh 调用时 observer 不存在，重新初始化');
      this.init();
      return;
    }
    const hidden = document.querySelectorAll('img[data-src]:not(.loaded)');
    if (hidden.length) {
      console.log(`[LazyImageLoader] 刷新，重新观察 ${hidden.length} 张图片`);
      hidden.forEach(img => this.#observer.observe(img));
    } else {
      console.log('[LazyImageLoader] 刷新，无新增懒加载图片');
    }
  }

  static destroy() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
      console.log('[LazyImageLoader] 已销毁');
    }
  }
}

export class GlobalImageManager {
  static #viewerClass = null;
  static #isLoadingViewer = false;
  static #clickHandler = null;
  static #containerSelectors = [
    '#mainContent',
    '.article-body',
    '.post-content',
    '.list-item',
    'main',
    '.container',
    'body'
  ];
  static #cssLoaded = false;

  /**
   * 加载查看器外部 CSS
   */
  static #loadViewerCSS() {
    if (this.#cssLoaded) return;
    if (document.querySelector('link[href="/css/components/image-viewer.css"]')) {
      this.#cssLoaded = true;
      console.log('[GlobalImageManager] 外部 CSS 已存在，跳过加载');
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/components/image-viewer.css';
    link.onload = () => {
      console.log('[GlobalImageManager] 外部 CSS 加载成功');
      this.#cssLoaded = true;
    };
    link.onerror = () => {
      console.warn('[GlobalImageManager] 外部 CSS 加载失败，查看器可能样式异常');
      // 仍然标记为已尝试，避免重复请求
      this.#cssLoaded = true;
    };
    document.head.appendChild(link);
    console.log('[GlobalImageManager] 正在加载外部 CSS:', link.href);
  }

  /**
   * 初始化全局图片点击监听
   */
  static init() {
    this.#loadViewerCSS();

    if (this.#clickHandler) {
      document.removeEventListener('click', this.#clickHandler);
      console.log('[GlobalImageManager] 移除旧的事件监听');
    }

    this.#clickHandler = this.#handleImageClick.bind(this);
    document.addEventListener('click', this.#clickHandler);
    console.log('[GlobalImageManager] 已绑定图片点击监听');
  }

  /**
   * 图片点击处理
   */
  static async #handleImageClick(e) {
    const img = e.target.closest('img');
    if (!img) return;

    if (img.closest('.no-image-viewer') ||
        img.closest('.modern-image-viewer') ||
        img.classList.contains('no-image-viewer') ||
        img.dataset.viewerExclude === 'true') {
      console.log('[GlobalImageManager] 图片被排除，不打开查看器');
      return;
    }

    console.log('[GlobalImageManager] 检测到图片点击:', img.src || img.dataset.src || '（无 src）');
    e.preventDefault();
    e.stopPropagation();

    await this.#openViewer(img);
  }

  /**
   * 打开图片查看器
   */
  static async #openViewer(clickedImg) {
    console.log('[GlobalImageManager] 开始打开查看器');

    if (!this.#viewerClass) {
      if (this.#isLoadingViewer) {
        console.log('[GlobalImageManager] 等待查看器加载完成...');
        await new Promise(resolve => {
          const check = () => {
            if (this.#viewerClass) resolve();
            else setTimeout(check, 50);
          };
          check();
        });
      } else {
        this.#isLoadingViewer = true;
        try {
          console.log('[GlobalImageManager] 动态加载 image-viewer.js');
          const module = await import('/js/ui/image-viewer.js');
          this.#viewerClass = module.ImageViewer;
          console.log('[GlobalImageManager] 查看器加载成功');
        } catch (err) {
          console.error('[GlobalImageManager] 加载图片查看器失败:', err);
          this.#isLoadingViewer = false;
          return;
        }
        this.#isLoadingViewer = false;
      }
    }

    let container = null;
    for (const selector of this.#containerSelectors) {
      const el = clickedImg.closest(selector);
      if (el) {
        container = el;
        break;
      }
    }
    if (!container) {
      container = document.body;
      console.log('[GlobalImageManager] 未找到合适容器，使用 body');
    } else {
      console.log('[GlobalImageManager] 使用容器:', container.tagName, container.className);
    }

    const allImgs = container.querySelectorAll('img:not(.no-image-viewer):not(.modern-image-viewer img)');
    const gallery = [];
    let currentIndex = 0;

    allImgs.forEach((img, idx) => {
      if (img.dataset.viewerExclude === 'true') return;
      const src = img.dataset.src || img.src;
      if (!src || (src.startsWith('data:') && src.length < 100)) return;
      if (img === clickedImg) currentIndex = gallery.length;
      gallery.push({
        src,
        alt: img.alt || img.title || '',
        title: img.title || '',
      });
    });

    if (gallery.length === 0) {
      console.warn('[GlobalImageManager] 未找到可展示的图片');
      return;
    }
    console.log(`[GlobalImageManager] 收集到 ${gallery.length} 张图片，当前索引 ${currentIndex}`);

    if (clickedImg.dataset.src && !clickedImg.src) {
      if (!clickedImg.dataset.preloaded) {
        clickedImg.dataset.preloaded = 'true';
        console.log('[GlobalImageManager] 预加载点击图片:', clickedImg.dataset.src);
        try {
          await new Promise((resolve, reject) => {
            const temp = new Image();
            temp.onload = () => {
              clickedImg.src = clickedImg.dataset.src;
              clickedImg.classList.remove('lazy-loading');
              clickedImg.classList.add('loaded');
              delete clickedImg.dataset.src;
              console.log('[GlobalImageManager] 预加载完成');
              resolve();
            };
            temp.onerror = () => {
              reject(new Error('图片预加载失败'));
            };
            temp.src = clickedImg.dataset.src;
          });
        } catch (err) {
          console.warn('[GlobalImageManager] 图片预加载失败，仍尝试打开查看器', err);
        }
      }
    }

    const finalGallery = gallery.map(item => ({
      src: item.src,
      alt: item.alt,
      title: item.title,
    }));

    console.log('[GlobalImageManager] 创建 ImageViewer 实例');
    try {
      new this.#viewerClass(finalGallery, currentIndex);
    } catch (err) {
      console.error('[GlobalImageManager] 创建查看器失败:', err);
    }
  }

  static destroy() {
    if (this.#clickHandler) {
      document.removeEventListener('click', this.#clickHandler);
      this.#clickHandler = null;
      console.log('[GlobalImageManager] 已移除事件监听');
    }
    LazyImageLoader.destroy();
  }

  static refresh() {
    LazyImageLoader.refresh();
  }
}