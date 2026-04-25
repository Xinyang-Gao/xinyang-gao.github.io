// image-viewer.js
class ImageViewer {
  constructor(images, startIndex = 0, options = {}) {
    this.galleryImages = images;
    this.currentIndex = Math.min(Math.max(0, startIndex), this.galleryImages.length - 1);
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.rotateDeg = 0; // 旋转角度
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.viewerElement = null;
    this.viewerImage = null;
    this.viewerWrapper = null;
    this.active = false;
    this.dragHandlers = null;
    this.keydownHandler = this.handleKeydown.bind(this);
    this.onCloseCallback = options.onClose || null;
    this.loadingEl = null;
    this.errorEl = null;
    this.imageLoadError = false;
    this.currentLoadId = 0;
    // 按钮元素引用
    this.zoomInBtn = null;
    this.zoomOutBtn = null;
    this.resetBtn = null;
    this.reloadBtn = null;
    this.rotateBtn = null; // 旋转按钮
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
          <button class="viewer-reset" aria-label="重置">重置</button>
          <button class="viewer-rotate" aria-label="旋转">旋转</button>
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
    this.viewerElement = viewer;
    this.viewerImage = viewer.querySelector('.viewer-image');
    this.viewerWrapper = viewer.querySelector('.viewer-image-wrapper');
    this.loadingEl = viewer.querySelector('.viewer-loading');
    this.errorEl = viewer.querySelector('.viewer-error');
    
    // 获取工具栏按钮引用
    this.zoomInBtn = viewer.querySelector('.viewer-zoom-in');
    this.zoomOutBtn = viewer.querySelector('.viewer-zoom-out');
    this.resetBtn = viewer.querySelector('.viewer-reset');
    this.reloadBtn = viewer.querySelector('.viewer-reload');
    this.rotateBtn = viewer.querySelector('.viewer-rotate');
  }

  // 控制工具栏按钮状态（错误时禁用缩放/重置/旋转，高亮重载按钮）
  setControlsState(isError) {
    if (!this.zoomInBtn || !this.zoomOutBtn || !this.resetBtn || !this.reloadBtn || !this.rotateBtn) return;
    
    if (isError) {
      // 图片出错：禁用放大、缩小、重置、旋转按钮，高亮重载按钮
      this.zoomInBtn.disabled = true;
      this.zoomOutBtn.disabled = true;
      this.resetBtn.disabled = true;
      this.rotateBtn.disabled = true;
      this.reloadBtn.disabled = false;
      this.reloadBtn.classList.add('highlight');
    } else {
      // 正常状态：启用所有按钮，移除重载按钮高亮
      this.zoomInBtn.disabled = false;
      this.zoomOutBtn.disabled = false;
      this.resetBtn.disabled = false;
      this.rotateBtn.disabled = false;
      this.reloadBtn.disabled = false;
      this.reloadBtn.classList.remove('highlight');
    }
  }

  showLoading() {
    if (this.loadingEl) {
      this.loadingEl.style.display = 'flex';
    }
    if (this.viewerImage) {
      this.viewerImage.style.display = 'none';
    }
    if (this.errorEl) {
      this.errorEl.style.display = 'none';
    }
  }

  hideLoading() {
    if (this.loadingEl) {
      this.loadingEl.style.display = 'none';
    }
  }

  // 辅助方法：简单的HTML转义，防止XSS
  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
      return c;
    });
  }

  // 辅助方法：截断过长的URL，保留头尾
  truncateUrl(url, maxLength = 80) {
    if (!url) return '';
    if (url.length <= maxLength) return this.escapeHtml(url);
    const start = url.substring(0, maxLength / 2 - 3);
    const end = url.substring(url.length - maxLength / 2 + 3);
    return this.escapeHtml(`${start}...${end}`);
  }

  // 增强的错误显示：包含详细图片信息、完整地址（不再内嵌重新加载按钮）
  showError(message, fallbackInfo = '') {
    if (!this.errorEl) return;
    
    const imgData = this.galleryImages[this.currentIndex];
    const src = imgData ? imgData.src : '未知地址';
    const alt = imgData && imgData.alt ? imgData.alt : '';
    const title = imgData && imgData.title ? imgData.title : '';
    
    // 构建详细信息
    const detailsHtml = `
      <div class="error-title" style="font-weight: 600; margin-bottom: 8px;">${this.escapeHtml(message)}</div>
      <div class="error-details" style="font-size: 13px; word-break: break-all; line-height: 1.5;">
        <div style="margin: 4px 0;"><strong>来源：</strong><span title="${this.escapeHtml(src)}">${this.truncateUrl(src, 70)}</span></div>
        ${alt ? `<div style="margin: 4px 0;"><strong>描述：</strong>${this.escapeHtml(alt)}</div>` : ''}
        ${title ? `<div style="margin: 4px 0;"><strong>标题：</strong>${this.escapeHtml(title)}</div>` : ''}
        <div style="margin: 8px 0 4px 0; color: #ffaa00;">可能原因：网络中断、图片不存在、跨域限制或服务器拒绝访问</div>
        <div style="margin: 4px 0; font-size: 12px; color: #aaa;">建议：检查网络连接，或点击底部工具栏重载按钮重试</div>
      </div>
    `;
    
    this.errorEl.innerHTML = detailsHtml;
    this.errorEl.style.display = 'flex';
    this.errorEl.style.flexDirection = 'column';
    this.errorEl.style.alignItems = 'center';
    this.errorEl.style.justifyContent = 'center';
    
    if (this.viewerImage) this.viewerImage.style.display = 'none';
    this.hideLoading();
    
    // 出错时禁用缩放/重置/旋转按钮，高亮重载按钮
    this.setControlsState(true);
  }

  hideError() {
    if (this.errorEl) {
      this.errorEl.style.display = 'none';
    }
  }

  showImage() {
    if (this.viewerImage) {
      this.viewerImage.style.display = 'block';
    }
    this.hideLoading();
    this.hideError();
    // 图片加载成功后，确保所有控制按钮恢复正常状态
    this.setControlsState(false);
  }

  // 重新加载当前图片（供重载按钮调用）
  reloadCurrentImage() {
    if (this.imageLoadError) {
      // 清除错误标志，重新尝试加载
      this.imageLoadError = false;
    }
    this.updateImage();
  }

  // 旋转图片（顺时针90度）
  rotateImage() {
    if (this.imageLoadError) return;
    // 每次点击顺时针旋转90度
    this.rotateDeg = (this.rotateDeg + 90) % 360;
    // 旋转时重置平移偏移，让图片居中显示，避免坐标系错乱
    this.transform.translateX = 0;
    this.transform.translateY = 0;
    this.applyTransform();
  }

  updateImage() {
    if (!this.viewerImage || !this.galleryImages[this.currentIndex]) return;
    
    // 重置错误标志和UI状态（先恢复正常按钮，加载失败后再重新禁用）
    this.imageLoadError = false;
    // 切换图片时重置旋转角度和变换
    this.rotateDeg = 0;
    this.setControlsState(false);
    
    const loadId = ++this.currentLoadId;
    const imgData = this.galleryImages[this.currentIndex];
    
    this.imageLoadError = false;
    this.showLoading();
    this.viewerImage.style.opacity = '0';
    this.viewerImage.src = '';
    
    const tempImg = new Image();
    
    tempImg.onload = () => {
      if (loadId !== this.currentLoadId) return;
      this.viewerImage.src = imgData.src;
      this.viewerImage.onload = () => {
        if (loadId !== this.currentLoadId) return;
        this.viewerImage.style.opacity = '1';
        this.showImage();
        this.imageLoadError = false;
        this.resetTransform();
        // 确保启用所有控件
        this.setControlsState(false);
      };
      this.viewerImage.onerror = () => {
        if (loadId !== this.currentLoadId) return;
        this.handleImageError(imgData);
      };
    };
    
    tempImg.onerror = () => {
      if (loadId !== this.currentLoadId) return;
      this.handleImageError(imgData);
    };
    
    tempImg.src = imgData.src;
    this.updateCounter();
  }

  handleImageError(imgData) {
    this.imageLoadError = true;
    const errorMessage = '诶呀…图片好像找不到了…';
    // showError内部会利用 imgData 展示详细信息，并自动禁用缩放/旋转按钮和高亮重载按钮
    this.showError(errorMessage, '');
  }

  resetTransform() {
    if (this.imageLoadError) return;
    this.transform = { scale: 1, translateX: 0, translateY: 0 };
    this.rotateDeg = 0; // 重置旋转角度
    this.applyTransform();
  }

  applyTransform() {
    if (!this.viewerImage) return;
    if (this.imageLoadError) return;
    const { translateX, translateY, scale } = this.transform;
    // 组合变换：平移 → 缩放 → 旋转
    this.viewerImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${this.rotateDeg}deg)`;
  }

  zoom(delta) {
    if (this.imageLoadError) return;
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
    const reloadBtn = this.viewerElement.querySelector('.viewer-reload');
    const rotateBtn = this.viewerElement.querySelector('.viewer-rotate');

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (overlay) overlay.addEventListener('click', () => this.close());
    if (prevBtn) prevBtn.addEventListener('click', () => this.switchImage(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => this.switchImage(1));
    if (zoomIn) zoomIn.addEventListener('click', () => this.zoom(0.2));
    if (zoomOut) zoomOut.addEventListener('click', () => this.zoom(-0.2));
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetTransform());
    if (reloadBtn) reloadBtn.addEventListener('click', () => this.reloadCurrentImage());
    if (rotateBtn) rotateBtn.addEventListener('click', () => this.rotateImage());
    if (this.viewerImage) this.viewerImage.addEventListener('dblclick', () => this.resetTransform());

    this.initDragEvents();
  }

  initDragEvents() {
    if (!this.viewerImage) return;
    const onPointerDown = (e) => {
      if (this.imageLoadError) return;
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
      if (this.imageLoadError) return;
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
      case 'r': case 'R': this.rotateImage(); break;
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