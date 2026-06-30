// /js/ui/image-viewer.js
// 现代化的图片查看器，支持缩放、旋转、拖拽、键盘快捷键
// 样式由外部 CSS (/css/components/image-viewer.css) 提供

export class ImageViewer {
  #images = [];
  #currentIndex = 0;
  #transform = { scale: 1, translateX: 0, translateY: 0 };
  #rotateDeg = 0;
  #isDragging = false;
  #dragStart = { x: 0, y: 0 };
  #viewerElement = null;
  #viewerImage = null;
  #viewerWrapper = null;
  #loadingEl = null;
  #errorEl = null;
  #imageLoadError = false;
  #currentLoadId = 0;
  #keydownHandler = null;
  #onClose = null;
  #buttons = {};
  #dragHandlers = null;

  constructor(images, startIndex = 0, options = {}) {
    console.log('[ImageViewer] 构造函数调用', {
      imageCount: images.length,
      startIndex,
      options
    });

    this.#images = images;
    this.#currentIndex = Math.min(Math.max(0, startIndex), this.#images.length - 1);
    this.#onClose = options.onClose || null;
    this.#init();
  }

  #init() {
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

  #createDOM() {
    console.log('[ImageViewer] 创建 DOM 结构');
    if (this.#viewerElement) {
      console.log('[ImageViewer] 移除旧的查看器元素');
      this.#viewerElement.remove();
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

  // ---------- 图片加载与错误处理 ----------
  #showLoading() {
    if (this.#loadingEl) {
      this.#loadingEl.style.display = 'flex';
      console.log('[ImageViewer] 显示加载中');
    }
    if (this.#viewerImage) this.#viewerImage.style.display = 'none';
    if (this.#errorEl) this.#errorEl.style.display = 'none';
  }

  #hideLoading() {
    if (this.#loadingEl) this.#loadingEl.style.display = 'none';
  }

  #showError(message) {
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

  #hideError() {
    if (this.#errorEl) this.#errorEl.style.display = 'none';
  }

  #showImage() {
    console.log('[ImageViewer] 图片显示成功');
    if (this.#viewerImage) this.#viewerImage.style.display = 'block';
    this.#hideLoading();
    this.#hideError();
    this.#setControlsDisabled(false);
    this.#imageLoadError = false;
  }

  #setControlsDisabled(disabled) {
    const keys = ['zoomIn', 'zoomOut', 'reset', 'rotate'];
    keys.forEach(key => {
      if (this.#buttons[key]) {
        this.#buttons[key].disabled = disabled;
      }
    });
    if (this.#buttons.reload) {
      this.#buttons.reload.disabled = false;
      this.#buttons.reload.classList.toggle('highlight', disabled);
    }
  }

  // ---------- 图片切换与更新 ----------
  #updateImage() {
    console.log('[ImageViewer] 更新图片，索引:', this.#currentIndex);
    if (!this.#viewerImage) {
      console.warn('[ImageViewer] viewerImage 不存在，无法更新');
      return;
    }
    if (!this.#images[this.#currentIndex]) {
      console.warn('[ImageViewer] 当前索引无图片数据');
      return;
    }

    this.#imageLoadError = false;
    this.#rotateDeg = 0;
    this.#setControlsDisabled(false);

    const loadId = ++this.#currentLoadId;
    const imgData = this.#images[this.#currentIndex];
    console.log('[ImageViewer] 加载图片:', imgData.src);

    this.#showLoading();
    this.#viewerImage.style.opacity = '0';
    this.#viewerImage.src = '';

    const tempImg = new Image();
    tempImg.onload = () => {
      if (loadId !== this.#currentLoadId) {
        console.log('[ImageViewer] 加载已过期 (loadId mismatch)');
        return;
      }
      console.log('[ImageViewer] 图片预加载成功，设置到 img 元素');
      this.#viewerImage.src = imgData.src;
      this.#viewerImage.onload = () => {
        if (loadId !== this.#currentLoadId) return;
        console.log('[ImageViewer] 图片实际渲染成功');
        this.#viewerImage.style.opacity = '1';
        this.#showImage();
        this.#resetTransform();
        this.#applyTransform();
      };
      this.#viewerImage.onerror = () => {
        if (loadId !== this.#currentLoadId) return;
        console.warn('[ImageViewer] 图片渲染失败（onerror）');
        this.#handleLoadError(imgData);
      };
    };
    tempImg.onerror = () => {
      if (loadId !== this.#currentLoadId) return;
      console.warn('[ImageViewer] 图片预加载失败（onerror）');
      this.#handleLoadError(imgData);
    };
    tempImg.src = imgData.src;
    this.#updateCounter();
  }

  #handleLoadError(imgData) {
    console.error('[ImageViewer] 图片加载失败:', imgData.src);
    this.#showError('诶呀…图片好像找不到了…');
  }

  #switchImage(direction) {
    const newIndex = (this.#currentIndex + direction + this.#images.length) % this.#images.length;
    if (newIndex === this.#currentIndex) return;
    this.#currentIndex = newIndex;
    console.log('[ImageViewer] 切换到图片索引:', this.#currentIndex);
    this.#updateImage();
  }

  #reloadCurrentImage() {
    console.log('[ImageViewer] 手动重载当前图片');
    if (this.#imageLoadError) {
      this.#imageLoadError = false;
    }
    this.#updateImage();
  }

  // ---------- 变换操作 ----------
  #resetTransform() {
    this.#transform = { scale: 1, translateX: 0, translateY: 0 };
    this.#rotateDeg = 0;
    this.#applyTransform();
  }

  #applyTransform() {
    if (!this.#viewerImage || this.#imageLoadError) return;
    const { translateX, translateY, scale } = this.#transform;
    this.#viewerImage.style.transform =
      `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${this.#rotateDeg}deg)`;
  }

  #zoom(delta) {
    if (this.#imageLoadError) return;
    let newScale = Math.min(Math.max(0.5, this.#transform.scale + delta), 5);
    if (newScale !== this.#transform.scale) {
      const maxTranslate = Math.max(200, (newScale - 1) * 400);
      this.#transform.translateX = Math.min(Math.max(this.#transform.translateX, -maxTranslate), maxTranslate);
      this.#transform.translateY = Math.min(Math.max(this.#transform.translateY, -maxTranslate), maxTranslate);
      this.#transform.scale = newScale;
      this.#applyTransform();
    }
  }

  #rotateImage() {
    if (this.#imageLoadError) return;
    this.#rotateDeg = (this.#rotateDeg + 90) % 360;
    this.#transform.translateX = 0;
    this.#transform.translateY = 0;
    this.#applyTransform();
  }

  // ---------- 拖拽支持 ----------
  #initDragEvents() {
    if (!this.#viewerImage) return;
    const onPointerDown = (e) => {
      if (this.#imageLoadError || this.#transform.scale <= 1) return;
      e.preventDefault();
      this.#isDragging = true;
      this.#dragStart = {
        x: e.clientX - this.#transform.translateX,
        y: e.clientY - this.#transform.translateY,
      };
      this.#viewerImage.style.cursor = 'grabbing';
    };
    const onPointerMove = (e) => {
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

  #cleanupDragEvents() {
    if (!this.#dragHandlers) return;
    if (this.#viewerImage) {
      this.#viewerImage.removeEventListener('pointerdown', this.#dragHandlers.onPointerDown);
    }
    window.removeEventListener('pointermove', this.#dragHandlers.onPointerMove);
    window.removeEventListener('pointerup', this.#dragHandlers.onPointerUp);
  }

  // ---------- UI 更新 ----------
  #updateCounter() {
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
  #bindEvents() {
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
    this.#keydownHandler = (e) => this.#handleKeydown(e);
    document.addEventListener('keydown', this.#keydownHandler);

    // 拖拽
    this.#initDragEvents();
  }

  #handleKeydown(e) {
    if (!this.#viewerElement) return;
    switch (e.key) {
      case 'Escape': this.close(); break;
      case 'ArrowLeft': this.#switchImage(-1); break;
      case 'ArrowRight': this.#switchImage(1); break;
      case '+':
      case '=': this.#zoom(0.2); break;
      case '-': this.#zoom(-0.2); break;
      case 'r':
      case 'R': this.#rotateImage(); break;
    }
  }

  // ---------- 关闭与清理 ----------
  close() {
    console.log('[ImageViewer] 关闭查看器');
    if (!this.#viewerElement) return;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this.#keydownHandler);
    this.#cleanupDragEvents();
    this.#viewerElement.classList.remove('active');
    setTimeout(() => {
      this.#viewerElement?.remove();
      this.#viewerElement = null;
      if (this.#onClose) this.#onClose();
      console.log('[ImageViewer] 查看器已完全移除');
    }, 300);
  }

  // ---------- 工具方法 ----------
  #escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, (m) => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  #truncateUrl(url, maxLength = 80) {
    if (!url) return '';
    if (url.length <= maxLength) return this.#escapeHtml(url);
    const start = url.substring(0, maxLength / 2 - 3);
    const end = url.substring(url.length - maxLength / 2 + 3);
    return this.#escapeHtml(`${start}...${end}`);
  }
}