// /js/ui/image-manager.js
// 图片延迟加载与全局图片查看器管理
// 仅加载外部 CSS，无内联样式

export class LazyImageLoader {
  static #observer = null;
  static #lazyImages = new WeakSet(); // 跟踪已观察的图片，避免重复观察

  static init() {
    if (!('IntersectionObserver' in window)) {
      console.warn('[LazyImageLoader] 浏览器不支持 IntersectionObserver，跳过懒加载');
      return;
    }

    if (this.#observer) {
      this.#observer.disconnect();
      this.#lazyImages = new WeakSet(); // 重置跟踪集合
      console.log('[LazyImageLoader] 已有 Observer 已断开并重置');
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            // 双重检查，确保 src 尚未设置且 data-src 存在
            if (!img.src && img.dataset.src) {
              const src = img.dataset.src;
              console.log('[LazyImageLoader] 加载懒加载图片:', src);
              
              // 先设置 src，再移除属性，避免闪烁
              img.src = src;
              img.classList.remove('lazy-loading');
              img.classList.add('loaded');
              delete img.dataset.src;
            }
            this.#observer.unobserve(img);
            this.#lazyImages.delete(img);
          }
        });
      },
      { rootMargin: '50px 0px', threshold: 0.01 }
    );

    const lazyImages = document.querySelectorAll('img[data-src]:not(.loaded)');
    console.log(`[LazyImageLoader] 发现 ${lazyImages.length} 张待加载图片`);
    lazyImages.forEach(img => {
      if (!this.#lazyImages.has(img)) {
        this.#lazyImages.add(img);
        this.#observer.observe(img);
      }
    });
  }

  static refresh() {
    if (!this.#observer) {
      console.warn('[LazyImageLoader] refresh 调用时 observer 不存在，重新初始化');
      this.init();
      return;
    }
    
    // 只寻找那些有 data-src 但尚未加载且未被观察的图片
    const hidden = document.querySelectorAll('img[data-src]:not(.loaded)');
    let count = 0;
    hidden.forEach(img => {
      if (!this.#lazyImages.has(img)) {
        this.#lazyImages.add(img);
        this.#observer.observe(img);
        count++;
      }
    });

    if (count > 0) {
      console.log(`[LazyImageLoader] 刷新，重新观察 ${count} 张图片`);
    } else {
      console.log('[LazyImageLoader] 刷新，无新增待加载图片');
    }
  }

  static destroy() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
      this.#lazyImages = new WeakSet();
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
  static #cssLoadPromise = null;

  /**
   * 加载查看器外部 CSS
   * 返回 Promise 以便等待加载完成
   */
  static #loadViewerCSS() {
    if (this.#cssLoaded) return Promise.resolve();
    if (this.#cssLoadPromise) return this.#cssLoadPromise;

    // 检查是否已存在 link 标签
    if (document.querySelector('link[href="/css/components/image-viewer.css"]')) {
      this.#cssLoaded = true;
      console.log('[GlobalImageManager] 外部 CSS 已存在，跳过加载');
      return Promise.resolve();
    }

    this.#cssLoadPromise = new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/components/image-viewer.css';
      
      const onLoad = () => {
        console.log('[GlobalImageManager] 外部 CSS 加载成功');
        this.#cssLoaded = true;
        this.#cssLoadPromise = null;
        resolve();
      };

      const onError = () => {
        console.warn('[GlobalImageManager] 外部 CSS 加载失败，查看器可能样式异常');
        this.#cssLoaded = true; // 标记为已尝试，避免无限重试
        this.#cssLoadPromise = null;
        resolve(); // 即使失败也 resolve，让程序继续运行
      };

      link.onload = onLoad;
      link.onerror = onError;
      document.head.appendChild(link);
    });

    return this.#cssLoadPromise;
  }

  /**
   * 初始化全局图片点击监听
   */
  static async init() {
    await this.#loadViewerCSS();

    if (this.#clickHandler) {
      document.removeEventListener('click', this.#clickHandler);
      console.log('[GlobalImageManager] 移除旧的事件监听');
    }

    this.#clickHandler = this.#handleImageClick.bind(this);
    // 使用 capture: true 确保在图片被其他事件拦截前捕获
    document.addEventListener('click', this.#clickHandler, { capture: true });
    console.log('[GlobalImageManager] 已绑定图片点击监听');
  }

  /**
   * 图片点击处理
   */
  static #handleImageClick(e) {
    // 使用 closest 查找最近的 img 标签
    const img = e.target.closest('img');
    if (!img) return;

    // 排除特定类或属性的图片
    if (img.closest('.no-image-viewer') ||
        img.closest('.modern-image-viewer') ||
        img.classList.contains('no-image-viewer') ||
        img.dataset.viewerExclude === 'true') {
      return;
    }

    console.log('[GlobalImageManager] 检测到图片点击:', img.src || img.dataset.src || '（无 src）');
    e.preventDefault();
    e.stopPropagation();

    // 异步打开查看器，不阻塞主线程
    this.#openViewer(img).catch(err => {
      console.error('[GlobalImageManager] 打开查看器失败:', err);
    });
  }

  /**
   * 打开图片查看器
   */
  static async #openViewer(clickedImg) {
    console.log('[GlobalImageManager] 开始打开查看器');

    // 动态加载查看器模块
    if (!this.#viewerClass) {
      if (this.#isLoadingViewer) {
        console.log('[GlobalImageManager] 等待查看器加载完成...');
        // 简单的轮询等待，实际项目中可使用更复杂的 Promise 链
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
          throw err;
        }
        this.#isLoadingViewer = false;
      }
    }

    // 确定容器
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
    }

    // 收集画廊图片
    const allImgs = container.querySelectorAll('img:not(.no-image-viewer):not(.modern-image-viewer img)');
    const gallery = [];
    let currentIndex = -1;

    allImgs.forEach((img) => {
      if (img.dataset.viewerExclude === 'true') return;
      
      const src = img.dataset.src || img.src;
      // 过滤无效 src
      if (!src || (src.startsWith('data:') && src.length < 100)) return;

      const item = {
        src,
        alt: img.alt || img.title || '',
        title: img.title || '',
      };
      
      gallery.push(item);

      if (img === clickedImg) {
        currentIndex = gallery.length - 1;
      }
    });

    if (gallery.length === 0 || currentIndex === -1) {
      console.warn('[GlobalImageManager] 未找到可展示的图片或当前图片不在画廊中');
      return;
    }

    console.log(`[GlobalImageManager] 收集到 ${gallery.length} 张图片，当前索引 ${currentIndex}`);

    // 如果点击图片是懒加载且未加载，先预加载
    if (clickedImg.dataset.src && !clickedImg.src) {
      if (!clickedImg.dataset.preloaded) {
        clickedImg.dataset.preloaded = 'true';
        console.log('[GlobalImageManager] 预加载点击图片:', clickedImg.dataset.src);
        try {
          await new Promise((resolve, reject) => {
            const temp = new Image();
            temp.onload = () => {
              // 更新 DOM 中的图片 src，确保查看器获取的是真实 URL
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

    // 创建查看器实例
    console.log('[GlobalImageManager] 创建 ImageViewer 实例');
    try {
      new this.#viewerClass(gallery, currentIndex);
    } catch (err) {
      console.error('[GlobalImageManager] 创建查看器失败:', err);
    }
  }

  static destroy() {
    if (this.#clickHandler) {
      document.removeEventListener('click', this.#clickHandler, { capture: true });
      this.#clickHandler = null;
      console.log('[GlobalImageManager] 已移除事件监听');
    }
    LazyImageLoader.destroy();
  }

  static refresh() {
    LazyImageLoader.refresh();
  }
}