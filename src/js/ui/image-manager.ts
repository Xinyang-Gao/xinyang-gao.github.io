// /js/ui/image-manager.ts
// 图片延迟加载与全局图片查看器管理
// 仅加载外部 CSS，无内联样式

import { IS_DEV, onNavigation } from '/js/core/core.js';

type ImageViewerModule = typeof import('/js/ui/image-viewer.js');
type ImageViewerClass = ImageViewerModule['ImageViewer'];

/** 开发环境开启详细日志（IS_DEV 统一取自 core，避免多套判定） */
const log = (...args: unknown[]): void => {
  if (IS_DEV) console.log('[ImageManager]', ...args);
};

// ==================== 懒加载 ====================

export class LazyImageLoader {
  static #observer: IntersectionObserver | null = null;
  static #lazyImages = new WeakSet<HTMLImageElement>();

  static init(): void {
    if (!('IntersectionObserver' in window)) {
      console.warn('[LazyImageLoader] 浏览器不支持 IntersectionObserver，跳过懒加载');
      return;
    }

    this.#observer?.disconnect();
    this.#lazyImages = new WeakSet();
    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target as HTMLImageElement;
          if (!img.src && img.dataset.src) {
            img.src = img.dataset.src;
            img.classList.remove('lazy-loading');
            img.classList.add('loaded');
            delete img.dataset.src;
          }
          this.#observer!.unobserve(img);
          this.#lazyImages.delete(img);
        }
      },
      { rootMargin: '50px 0px', threshold: 0.01 }
    );

    this.#observeNew();
  }

  static refresh(): void {
    if (!this.#observer) {
      this.init();
      return;
    }
    this.#observeNew();
  }

  /** 只观察尚未注册过的 [data-src] 图片 */
  static #observeNew(): void {
    const imgs = document.querySelectorAll<HTMLImageElement>('img[data-src]:not(.loaded)');
    let count = 0;
    for (const img of imgs) {
      if (this.#lazyImages.has(img)) continue;
      this.#lazyImages.add(img);
      this.#observer!.observe(img);
      count++;
    }
    if (count > 0) log(`懒加载观察 ${count} 张图片`);
  }

  static destroy(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#lazyImages = new WeakSet();
  }
}

// ==================== 全局图片管理 ====================

export class GlobalImageManager {
  static #viewerClass: ImageViewerClass | null = null;
  static #viewerPromise: Promise<ImageViewerClass> | null = null;
  static #clickHandler: ((e: Event) => void) | null = null;

  /** 容器选择器，按 DOM 结构由内向外尝试 */
  static #containerSelectors = [
    '#mainContent',
    '.article-body',
    '.post-content',
    '.list-item',
    'main',
    '.container',
  ];

  static #cssLoaded = false;
  static #cssLoadPromise: Promise<void> | null = null;
  static #navUnsub: (() => void) | null = null;

  /* ---------- 外部 CSS 加载（幂等） ---------- */
  static #loadViewerCSS(): Promise<void> {
    if (this.#cssLoaded) return Promise.resolve();
    if (this.#cssLoadPromise) return this.#cssLoadPromise;

    if (document.querySelector('link[href="/css/components/image-viewer.css"]')) {
      this.#cssLoaded = true;
      return Promise.resolve();
    }

    this.#cssLoadPromise = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/components/image-viewer.css';
      const finish = () => {
        this.#cssLoaded = true;
        this.#cssLoadPromise = null;
        resolve();
      };
      link.onload = finish;
      link.onerror = () => {
        console.warn('[ImageManager] 查看器 CSS 加载失败，可能样式异常');
        finish();
      };
      document.head.appendChild(link);
    });
    return this.#cssLoadPromise;
  }

  /* ---------- 查看器模块加载（Promise 缓存，替代轮询） ---------- */
  static #loadViewerModule(): Promise<ImageViewerClass> {
    if (this.#viewerClass) return Promise.resolve(this.#viewerClass);
    if (this.#viewerPromise) return this.#viewerPromise;

    this.#viewerPromise = import('/js/ui/image-viewer.js')
      .then((mod) => {
        this.#viewerClass = mod.ImageViewer;
        return mod.ImageViewer;
      })
      .catch((err) => {
        this.#viewerPromise = null; // 允许下次重试
        throw err;
      });
    return this.#viewerPromise;
  }

  /* ---------- 初始化 ---------- */

  static async init(): Promise<void> {
    await this.#loadViewerCSS();

    if (this.#clickHandler) {
      document.removeEventListener('click', this.#clickHandler, { capture: true });
    }
    this.#clickHandler = this.#handleImageClick;
    document.addEventListener('click', this.#clickHandler, { capture: true });

    // 订阅路由导航，自动刷新懒加载
    this.#navUnsub?.();
    this.#navUnsub = onNavigation(() => LazyImageLoader.refresh());

    log('已绑定图片点击监听');
  }

  /* ---------- 点击处理 ---------- */

  static #handleImageClick = (e: Event): void => {
    const img = (e.target as Element | null)?.closest?.('img') as HTMLImageElement | null;
    if (!img) return;

    // 排除特定类或属性的图片
    if (
      img.closest('.no-image-viewer') ||
      img.closest('.modern-image-viewer') ||
      img.classList.contains('no-image-viewer') ||
      img.dataset.viewerExclude === 'true'
    ) {
      return;
    }

    /**
     * 图片被 <a href> 包裹时不要劫持点击。
     * 这里用了 capture + stopPropagation，一旦拦截就会整条吞掉事件，
     * 外链跳转确认（jump-dialog）、SPA 路由导航全部失效。
     */
    if (img.closest('a[href]')) return;

    e.preventDefault();
    e.stopPropagation();

    this.#openViewer(img).catch((err) => {
      console.warn('[ImageManager] 打开查看器失败:', err);
    });
  };

  /* ---------- 打开查看器 ---------- */

  static async #openViewer(clickedImg: HTMLImageElement): Promise<void> {
    const ViewerClass = await this.#loadViewerModule();

    // 选择容器
    const container =
      this.#containerSelectors
        .map((sel) => clickedImg.closest<HTMLElement>(sel))
        .find((el): el is HTMLElement => el !== null) ?? document.body;

    // 收集画廊
    const gallery = this.#collectGallery(container, clickedImg);
    if (gallery.items.length === 0 || gallery.currentIndex < 0) {
      log('未找到可展示的图片或当前图片不在画廊中');
      return;
    }

    // ★ 关键：在提升懒加载前捕获矩形，避免 src 变更影响布局
    const originRect = clickedImg.getBoundingClientRect();

    if (clickedImg.dataset.src && !clickedImg.src) {
      this.#promoteLazyImage(clickedImg);
    }

    // 把矩形作为打开/关闭动画起点传入
    new ViewerClass(gallery.items, gallery.currentIndex, { originRect });
  }

  /** 遍历容器收集所有可展示图片，返回 { items, currentIndex } */
  static #collectGallery(
    container: HTMLElement,
    clickedImg: HTMLImageElement
  ): {
    items: Array<{ src: string; alt: string; title: string }>;
    currentIndex: number;
  } {
    const items: Array<{ src: string; alt: string; title: string }> = [];
    let currentIndex = -1;

    const imgs = container.querySelectorAll<HTMLImageElement>('img');
    for (const img of imgs) {
      if (img.dataset.viewerExclude === 'true') continue;
      if (img.closest('.no-image-viewer')) continue;

      const src = img.dataset.src || img.src;
      if (!src) continue;
      // 过滤占位 data URL
      if (src.startsWith('data:') && src.length < 100) continue;

      if (img === clickedImg) currentIndex = items.length;
      items.push({
        src,
        alt: img.alt || img.title || '',
        title: img.title || '',
      });
    }
    return { items, currentIndex };
  }

  /** 把懒加载图片的 data-src 提升为真实 src，让页面同步显示 */
  static #promoteLazyImage(img: HTMLImageElement): void {
    const src = img.dataset.src;
    if (!src) return;
    const temp = new Image();
    temp.onload = () => {
      // 若期间已经被懒加载观察器处理，则跳过
      if (!img.dataset.src) return;
      img.src = src;
      img.classList.remove('lazy-loading');
      img.classList.add('loaded');
      delete img.dataset.src;
    };
    temp.onerror = () => {};
    temp.src = src;
  }

  /* ---------- 生命周期 ---------- */

  static destroy(): void {
    if (this.#clickHandler) {
      document.removeEventListener('click', this.#clickHandler, { capture: true });
      this.#clickHandler = null;
    }
    this.#navUnsub?.();
    this.#navUnsub = null;
    LazyImageLoader.destroy();
    log('已销毁');
  }

  static refresh(): void {
    LazyImageLoader.refresh();
  }
}