// /js/ui/image-viewer.ts
// 现代化的图片查看器，支持缩放、旋转、拖拽、键盘快捷键
// 样式由外部 CSS (/css/components/image-viewer.css) 提供

export interface ImageItem {
  src: string;
  alt?: string;
  title?: string;
}

export interface ImageViewerOptions {
  onClose?: () => void;
}

export class ImageViewer {
  // 单例管理，确保同时只有一个查看器
  static #currentInstance: ImageViewer | null = null;

  // 私有字段
  #images: ImageItem[];
  #currentIndex: number;
  #transform: { scale: number; translateX: number; translateY: number };
  #rotateDeg: number;
  #isDragging: boolean;
  #dragStart: { x: number; y: number };
  #viewerElement: HTMLElement | null;
  #viewerImage: HTMLImageElement | null;
  #viewerWrapper: HTMLElement | null;
  #loadingEl: HTMLElement | null;
  #errorEl: HTMLElement | null;
  #imageLoadError: boolean;
  #currentLoadId: number;
  #abortController: AbortController | null;
  #keydownHandler: ((e: KeyboardEvent) => void) | null;
  #onClose: (() => void) | null;
  #buttons: { [key: string]: HTMLElement | null };
  #dragHandlers: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: () => void;
  } | null;
  #rafId: number | null;

  constructor(images: ImageItem[], startIndex: number = 0, options: ImageViewerOptions = {}) {
    console.log('[ImageViewer] 构造函数调用', {
      imageCount: images.length,
      startIndex,
      options,
    });

    // 关闭已存在的查看器，确保单例
    if (ImageViewer.#currentInstance) {
      ImageViewer.#currentInstance.close(true);
    }
    ImageViewer.#currentInstance = this;

    this.#images = images;
    this.#currentIndex = Math.min(Math.max(0, startIndex), this.#images.length - 1);
    this.#onClose = options.onClose || null;
    this.#transform = { scale: 1, translateX: 0, translateY: 0 };
    this.#rotateDeg = 0;
    this.#isDragging = false;
    this.#dragStart = { x: 0, y: 0 };
    this.#viewerElement = null;
    this.#viewerImage = null;
    this.#viewerWrapper = null;
    this.#loadingEl = null;
    this.#errorEl = null;
    this.#imageLoadError = false;
    this.#currentLoadId = 0;
    this.#abortController = null;
    this.#keydownHandler = null;
    this.#buttons = {};
    this.#dragHandlers = null;
    this.#rafId = null;

    this.#init();
  }

  // ---------- 初始化 ----------
  #init(): void {
    console.log('[ImageViewer] 初始化开始');
    this.#createDOM();
    this.#updateImage();
    this.#bindEvents();
    this.#updateCounter();
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      if (this.#viewerElement) {
        this.#viewerElement.classList.add('active');
        console.log('[ImageViewer] 激活类已添加，查看器应可见');
      } else {
        console.warn('[ImageViewer] viewerElement 不存在，无法激活');
      }
    });
  }

  // ---------- DOM 创建 ----------
  #createDOM(): void {
    console.log('[ImageViewer] 创建 DOM 结构');

    // 移除可能遗留的旧查看器 DOM（以防万一）
    const existingViewer = document.querySelector('.modern-image-viewer');
    if (existingViewer) {
      existingViewer.remove();
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
          <button class="viewer-reset" aria-label="重置">重置</button>
          <button class="viewer-rotate" aria-label="旋转">⟳</button>
          <button class="viewer-reload" aria-label="重新加载">↻</button>
          <span class="viewer-counter">1 / 1</span>
        </div>
        <div class="viewer-image-wrapper">
          <img class="viewer-image" alt="" draggable="false">
          <div class="viewer-loading" style="display: none;">加载中</div>
          <div class="viewer-error" style="display: none;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(viewer);
    this.#viewerElement = viewer;
    this.#viewerImage = viewer.querySelector('.viewer-image');
    this.#viewerWrapper = viewer.querySelector('.viewer-image-wrapper');
    this.#loadingEl = viewer.querySelector('.viewer-loading');
    this.#errorEl = viewer.querySelector('.viewer-error');

    this.#buttons = {
      zoomIn: viewer.querySelector('.viewer-zoom-in'),
      zoomOut: viewer.querySelector('.viewer-zoom-out'),
      reset: viewer.querySelector('.viewer-reset'),
      rotate: viewer.querySelector('.viewer-rotate'),
      reload: viewer.querySelector('.viewer-reload'),
      prev: viewer.querySelector('.viewer-prev'),
      next: viewer.querySelector('.viewer-next'),
      close: viewer.querySelector('.viewer-close'),
      overlay: viewer.querySelector('.viewer-overlay'),
    };

    console.log('[ImageViewer] DOM 创建完成，元素已追加到 body');
  }

  // ---------- 加载状态控制 ----------
  #showLoading(): void {
    if (this.#loadingEl) {
      this.#loadingEl.style.display = 'flex';
      console.log('[ImageViewer] 显示加载中');
    }
    if (this.#viewerImage) this.#viewerImage.style.display = 'none';
    if (this.#errorEl) this.#errorEl.style.display = 'none';
  }

  #hideLoading(): void {
    if (this.#loadingEl) this.#loadingEl.style.display = 'none';
  }

  #showError(message: string): void {
    console.warn('[ImageViewer] 显示错误:', message);
    if (!this.#errorEl) return;
    const imgData = this.#images[this.#currentIndex];
    const src = imgData?.src || '未知地址';
    const alt = imgData?.alt || '';
    const title = imgData?.title || '';

    this.#errorEl.innerHTML = `
      <div style="font-weight:600; margin-bottom:8px;">${this.#escapeHtml(message)}</div>
      <div style="font-size:13px; word-break:break-all; line-height:1.5;">
        <div><strong>来源：</strong><span title="${this.#escapeHtml(src)}">${this.#truncateUrl(src)}</span></div>
        ${alt ? `<div><strong>描述：</strong>${this.#escapeHtml(alt)}</div>` : ''}
        ${title ? `<div><strong>标题：</strong>${this.#escapeHtml(title)}</div>` : ''}
        <div style="margin-top:8px; color:#ffaa00;">可能原因：网络中断、图片不存在、跨域限制</div>
        <div style="font-size:12px; color:#aaa;">请检查网络或点击重载按钮重试</div>
      </div>
    `;
    this.#errorEl.style.display = 'flex';
    if (this.#viewerImage) this.#viewerImage.style.display = 'none';
    this.#hideLoading();
    this.#setControlsDisabled(true);
    this.#imageLoadError = true;
  }

  #hideError(): void {
    if (this.#errorEl) this.#errorEl.style.display = 'none';
  }

  #showImage(): void {
    console.log('[ImageViewer] 图片显示成功');
    if (this.#viewerImage) this.#viewerImage.style.display = 'block';
    this.#hideLoading();
    this.#hideError();
    this.#setControlsDisabled(false);
    this.#imageLoadError = false;
  }

  #setControlsDisabled(disabled: boolean): void {
    const keys = ['zoomIn', 'zoomOut', 'reset', 'rotate'] as const;
    for (const key of keys) {
      const btn = this.#buttons[key];
      if (btn) {
        (btn as HTMLButtonElement).disabled = disabled;
      }
    }
    const reloadBtn = this.#buttons.reload;
    if (reloadBtn) {
      (reloadBtn as HTMLButtonElement).disabled = false;
      reloadBtn.classList.toggle('highlight', disabled);
    }
  }

  // ---------- 图片切换与更新 ----------
  #updateImage(): void {
    console.log('[ImageViewer] 更新图片，索引:', this.#currentIndex);
    if (!this.#viewerImage) {
      console.warn('[ImageViewer] viewerImage 不存在，无法更新');
      return;
    }
    const imgData = this.#images[this.#currentIndex];
    if (!imgData) {
      console.warn('[ImageViewer] 当前索引无图片数据');
      return;
    }

    // 取消之前的加载
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    this.#imageLoadError = false;
    this.#rotateDeg = 0;
    this.#setControlsDisabled(false);

    const loadId = ++this.#currentLoadId;
    console.log('[ImageViewer] 加载图片:', imgData.src);

    this.#showLoading();
    this.#viewerImage.style.opacity = '0';
    // 清空旧图片，取消正在进行的加载
    this.#viewerImage.src = '';

    // 使用 AbortController 监听中止
    const signal = this.#abortController.signal;

    // 直接使用 viewerImage 加载
    this.#viewerImage.onload = () => {
      if (signal.aborted || loadId !== this.#currentLoadId) return;
      console.log('[ImageViewer] 图片加载成功');
      this.#viewerImage.style.opacity = '1';
      this.#showImage();
      this.#resetTransform();
      this.#applyTransform();
    };

    this.#viewerImage.onerror = () => {
      if (signal.aborted || loadId !== this.#currentLoadId) return;
      console.warn('[ImageViewer] 图片加载失败（onerror）');
      this.#handleLoadError(imgData);
    };

    this.#viewerImage.src = imgData.src;
    this.#updateCounter();
  }

  #handleLoadError(imgData: ImageItem): void {
    console.error('[ImageViewer] 图片加载失败:', imgData.src);
    this.#showError('诶呀…图片好像找不到了…');
  }

  #switchImage(direction: number): void {
    const newIndex =
      (this.#currentIndex + direction + this.#images.length) % this.#images.length;
    if (newIndex === this.#currentIndex) return;
    this.#currentIndex = newIndex;
    console.log('[ImageViewer] 切换到图片索引:', this.#currentIndex);
    this.#updateImage();
  }

  #reloadCurrentImage(): void {
    console.log('[ImageViewer] 手动重载当前图片');
    if (this.#imageLoadError) {
      this.#imageLoadError = false;
    }
    this.#updateImage();
  }

  // ---------- 变换操作 ----------
  #resetTransform(): void {
    this.#transform = { scale: 1, translateX: 0, translateY: 0 };
    this.#rotateDeg = 0;
    this.#applyTransform();
  }

  #applyTransform(): void {
    if (!this.#viewerImage || this.#imageLoadError) return;
    // 使用 requestAnimationFrame 合并更新
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#rafId = requestAnimationFrame(() => {
      const { translateX, translateY, scale } = this.#transform;
      this.#viewerImage!.style.transform =
        `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${this.#rotateDeg}deg)`;
      this.#rafId = null;
    });
  }

  #zoom(delta: number): void {
    if (this.#imageLoadError) return;
    let newScale = Math.min(Math.max(0.5, this.#transform.scale + delta), 5);
    if (newScale !== this.#transform.scale) {
      const maxTranslate = Math.max(200, (newScale - 1) * 400);
      this.#transform.translateX = Math.min(
        Math.max(this.#transform.translateX, -maxTranslate),
        maxTranslate
      );
      this.#transform.translateY = Math.min(
        Math.max(this.#transform.translateY, -maxTranslate),
        maxTranslate
      );
      this.#transform.scale = newScale;
      this.#applyTransform();
    }
  }

  #rotateImage(): void {
    if (this.#imageLoadError) return;
    this.#rotateDeg = (this.#rotateDeg + 90) % 360;
    this.#transform.translateX = 0;
    this.#transform.translateY = 0;
    this.#applyTransform();
  }

  // ---------- 拖拽支持 ----------
  #initDragEvents(): void {
    if (!this.#viewerImage) return;

    const onPointerDown = (e: PointerEvent) => {
      if (this.#imageLoadError || this.#transform.scale <= 1) return;
      e.preventDefault();
      this.#isDragging = true;
      this.#dragStart = {
        x: e.clientX - this.#transform.translateX,
        y: e.clientY - this.#transform.translateY,
      };
      this.#viewerImage!.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.#isDragging || this.#imageLoadError) return;
      const newX = e.clientX - this.#dragStart.x;
      const newY = e.clientY - this.#dragStart.y;
      const maxTranslate = Math.max(200, (this.#transform.scale - 1) * 400);
      this.#transform.translateX = Math.min(Math.max(newX, -maxTranslate), maxTranslate);
      this.#transform.translateY = Math.min(Math.max(newY, -maxTranslate), maxTranslate);
      this.#applyTransform();
    };

    const onPointerUp = () => {
      this.#isDragging = false;
      if (this.#viewerImage) this.#viewerImage.style.cursor = 'grab';
    };

    this.#viewerImage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    this.#dragHandlers = { onPointerDown, onPointerMove, onPointerUp };
  }

  #cleanupDragEvents(): void {
    if (!this.#dragHandlers) return;
    const { onPointerDown, onPointerMove, onPointerUp } = this.#dragHandlers;
    if (this.#viewerImage) {
      this.#viewerImage.removeEventListener('pointerdown', onPointerDown);
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    this.#dragHandlers = null;
  }

  // ---------- UI 更新 ----------
  #updateCounter(): void {
    const counter = this.#viewerElement?.querySelector('.viewer-counter');
    if (counter) {
      counter.textContent = `${this.#currentIndex + 1} / ${this.#images.length}`;
    }
    const prev = this.#buttons.prev;
    const next = this.#buttons.next;
    if (this.#images.length <= 1) {
      if (prev) prev.style.display = 'none';
      if (next) next.style.display = 'none';
    } else {
      if (prev) prev.style.display = 'flex';
      if (next) next.style.display = 'flex';
    }
  }

  // ---------- 事件绑定 ----------
  #bindEvents(): void {
    if (!this.#viewerElement) return;
    console.log('[ImageViewer] 绑定事件');

    // 按钮事件
    this.#buttons.close?.addEventListener('click', () => this.close());
    this.#buttons.overlay?.addEventListener('click', () => this.close());
    this.#buttons.prev?.addEventListener('click', () => this.#switchImage(-1));
    this.#buttons.next?.addEventListener('click', () => this.#switchImage(1));
    this.#buttons.zoomIn?.addEventListener('click', () => this.#zoom(0.2));
    this.#buttons.zoomOut?.addEventListener('click', () => this.#zoom(-0.2));
    this.#buttons.reset?.addEventListener('click', () => this.#resetTransform());
    this.#buttons.reload?.addEventListener('click', () => this.#reloadCurrentImage());
    this.#buttons.rotate?.addEventListener('click', () => this.#rotateImage());

    // 双击重置
    this.#viewerImage?.addEventListener('dblclick', () => this.#resetTransform());

    // 键盘事件
    this.#keydownHandler = (e: KeyboardEvent) => this.#handleKeydown(e);
    document.addEventListener('keydown', this.#keydownHandler);

    // 拖拽
    this.#initDragEvents();
  }

  #handleKeydown(e: KeyboardEvent): void {
    if (!this.#viewerElement) return;
    switch (e.key) {
      case 'Escape':
        this.close();
        break;
      case 'ArrowLeft':
        this.#switchImage(-1);
        break;
      case 'ArrowRight':
        this.#switchImage(1);
        break;
      case '+':
      case '=':
        this.#zoom(0.2);
        break;
      case '-':
        this.#zoom(-0.2);
        break;
      case 'r':
      case 'R':
        this.#rotateImage();
        break;
    }
  }

  // ---------- 关闭与清理 ----------
  close(immediate: boolean = false): void {
    console.log('[ImageViewer] 关闭查看器', immediate ? '立即' : '动画');
    if (!this.#viewerElement) return;

    // 解绑事件（立即执行）
    document.removeEventListener('keydown', this.#keydownHandler!);
    this.#cleanupDragEvents();
    this.#keydownHandler = null;

    // 取消正在进行的图片加载
    this.#abortController?.abort();
    this.#abortController = null;

    // 清空图片引用，释放内存
    if (this.#viewerImage) {
      this.#viewerImage.onload = null;
      this.#viewerImage.onerror = null;
      this.#viewerImage.src = '';
    }

    // 取消待执行的动画帧
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }

    // 从静态引用中移除
    if (ImageViewer.#currentInstance === this) {
      ImageViewer.#currentInstance = null;
    }

    if (immediate) {
      // 立即移除 DOM
      this.#viewerElement.remove();
      this.#viewerElement = null;
      document.body.style.overflow = '';
      if (this.#onClose) this.#onClose();
      console.log('[ImageViewer] 查看器已立即移除');
    } else {
      // 动画关闭
      this.#viewerElement.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => {
        this.#viewerElement?.remove();
        this.#viewerElement = null;
        if (this.#onClose) this.#onClose();
        console.log('[ImageViewer] 查看器已完全移除');
      }, 300);
    }
  }

  // ---------- 工具方法 ----------
  #escapeHtml(str: string): string {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, (m) => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  #truncateUrl(url: string, maxLength: number = 80): string {
    if (!url) return '';
    if (url.length <= maxLength) return this.#escapeHtml(url);
    const start = url.substring(0, maxLength / 2 - 3);
    const end = url.substring(url.length - maxLength / 2 + 3);
    return this.#escapeHtml(`${start}...${end}`);
  }
}