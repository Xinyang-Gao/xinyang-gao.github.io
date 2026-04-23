class ImageViewer {
  constructor(images, startIndex = 0, options = {}) {
    this.galleryImages = images;
    this.currentIndex = Math.min(Math.max(0, startIndex), this.galleryImages.length - 1);
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.viewerElement = null;
    this.viewerImage = null;
    this.viewerWrapper = null;
    this.active = false;
    this.dragHandlers = null;
    this.keydownHandler = this.handleKeydown.bind(this);
    this.onCloseCallback = options.onClose || null;
    this.init();
  }

  init() {
    this.createDOM();
    this.updateImage();
    this.bindEvents();
    this.updateCounter();
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      if (this.viewerElement) this.viewerElement.classList.add('active');
    }, 10);
    document.addEventListener('keydown', this.keydownHandler);
  }

  createDOM() {
    if (this.viewerElement) this.viewerElement.remove();
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

  updateImage() {
    if (!this.viewerImage || !this.galleryImages[this.currentIndex]) return;
    const imgData = this.galleryImages[this.currentIndex];
    this.viewerImage.alt = imgData.alt || '';
    this.viewerImage.style.opacity = '0.5';
    const tempImg = new Image();
    tempImg.onload = () => {
      this.viewerImage.src = imgData.src;
      this.viewerImage.style.opacity = '1';
    };
    tempImg.onerror = () => {
      this.viewerImage.src = '';
      this.viewerImage.alt = '图片加载失败';
      this.viewerImage.style.opacity = '1';
    };
    tempImg.src = imgData.src;
    this.resetTransform();
    this.updateCounter();
  }

  resetTransform() {
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.applyTransform();
  }

  applyTransform() {
    if (!this.viewerImage) return;
    const { translateX, translateY, scale } = this.transform;
    this.viewerImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  zoom(delta) {
    let newScale = this.transform.scale + delta;
    newScale = Math.min(Math.max(0.5, newScale), 5);
    if (newScale !== this.transform.scale) {
      const maxTranslate = Math.max(200, (newScale - 1) * 300);
      this.transform.translateX = Math.min(Math.max(this.transform.translateX, -maxTranslate), maxTranslate);
      this.transform.translateY = Math.min(Math.max(this.transform.translateY, -maxTranslate), maxTranslate);
      this.transform.scale = newScale;
      this.applyTransform();
    }
  }

  switchImage(direction) {
    let newIndex = this.currentIndex + direction;
    if (newIndex < 0) newIndex = this.galleryImages.length - 1;
    if (newIndex >= this.galleryImages.length) newIndex = 0;
    if (newIndex === this.currentIndex) return;
    this.currentIndex = newIndex;
    this.updateImage();
  }

  updateCounter() {
    const counter = this.viewerElement?.querySelector('.viewer-counter');
    if (counter) {
      counter.textContent = `${this.currentIndex + 1} / ${this.galleryImages.length}`;
    }
    const prevBtn = this.viewerElement?.querySelector('.viewer-prev');
    const nextBtn = this.viewerElement?.querySelector('.viewer-next');
    if (this.galleryImages.length <= 1) {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    } else {
      if (prevBtn) prevBtn.style.display = 'flex';
      if (nextBtn) nextBtn.style.display = 'flex';
    }
  }

  bindEvents() {
    if (!this.viewerElement) return;
    const closeBtn = this.viewerElement.querySelector('.viewer-close');
    const overlay = this.viewerElement.querySelector('.viewer-overlay');
    const prevBtn = this.viewerElement.querySelector('.viewer-prev');
    const nextBtn = this.viewerElement.querySelector('.viewer-next');
    const zoomIn = this.viewerElement.querySelector('.viewer-zoom-in');
    const zoomOut = this.viewerElement.querySelector('.viewer-zoom-out');
    const resetBtn = this.viewerElement.querySelector('.viewer-reset');

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (overlay) overlay.addEventListener('click', () => this.close());
    if (prevBtn) prevBtn.addEventListener('click', () => this.switchImage(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => this.switchImage(1));
    if (zoomIn) zoomIn.addEventListener('click', () => this.zoom(0.2));
    if (zoomOut) zoomOut.addEventListener('click', () => this.zoom(-0.2));
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetTransform());
    if (this.viewerImage) this.viewerImage.addEventListener('dblclick', () => this.resetTransform());

    this.initDragEvents();
  }

  initDragEvents() {
    if (!this.viewerImage) return;
    const onPointerDown = (e) => {
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
      const maxTranslate = Math.max(200, (this.transform.scale - 1) * 400);
      this.transform.translateX = Math.min(Math.max(newX, -maxTranslate), maxTranslate);
      this.transform.translateY = Math.min(Math.max(newY, -maxTranslate), maxTranslate);
      this.applyTransform();
    };
    const onPointerUp = () => {
      this.isDragging = false;
      if (this.viewerImage) this.viewerImage.style.cursor = 'grab';
    };
    this.viewerImage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    this.dragHandlers = { onPointerDown, onPointerMove, onPointerUp };
  }

  handleKeydown(e) {
    if (!this.viewerElement) return;
    switch(e.key) {
      case 'Escape': this.close(); break;
      case 'ArrowLeft': this.switchImage(-1); break;
      case 'ArrowRight': this.switchImage(1); break;
      case '+': case '=': this.zoom(0.2); break;
      case '-': this.zoom(-0.2); break;
      default: break;
    }
  }

  close() {
    if (!this.viewerElement) return;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this.keydownHandler);
    if (this.dragHandlers && this.viewerImage) {
      this.viewerImage.removeEventListener('pointerdown', this.dragHandlers.onPointerDown);
      window.removeEventListener('pointermove', this.dragHandlers.onPointerMove);
      window.removeEventListener('pointerup', this.dragHandlers.onPointerUp);
    }
    this.viewerElement.classList.remove('active');
    setTimeout(() => {
      if (this.viewerElement) this.viewerElement.remove();
      this.viewerElement = null;
      if (this.onCloseCallback) this.onCloseCallback();
    }, 300);
  }
}

window.ImageViewer = ImageViewer;