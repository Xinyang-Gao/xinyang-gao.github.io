// ==================== /js/ui-effects.js ====================
// 自定义光标、外链管理器、滚动揭示效果（使用 requestIdleCallback 延迟初始化）

import { CONFIG, Utils } from '/js/core.js';

// ==================== 自定义光标 ====================
export class CustomCursor {
  constructor(options = {}) {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('[INFO] 触摸设备，跳过自定义光标');
      return;
    }
    this.config = { damping: 0.92, stiffness: 0.18, rotationSmoothing: 0.2, minSpeedForRotation: 0.5, ...options };
    this.targetX = 0; this.targetY = 0; this.currentX = 0; this.currentY = 0; this.fixedScale = 0.55; this.currentRotation = 0; this.targetRotation = 0;
    this.lastMouseX = 0; this.lastMouseY = 0; this.lastTimestamp = 0; this.velocityX = 0; this.velocityY = 0;
    this.snappedMode = false; this.snappedElement = null;
    this.rafId = null; this.visible = false;
    this.initDOM(); this.initEvents(); this.updateColors(); this.startAnimation();
    window.addEventListener('themeChanged', () => this.updateColors());
    const observer = new MutationObserver(() => this.updateColors()); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  
  initDOM() {
    this.container = document.createElement('div');
    this.container.className = 'custom-cursor';
    document.body.appendChild(this.container);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '54');
    svg.setAttribute('viewBox', '0 0 50 54');
    svg.style.width = '50px';
    svg.style.height = '54px';
    svg.style.display = 'block';
    this.fillPath = document.createElementNS(svgNS, 'path');
    this.fillPath.setAttribute('d', 'M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z');
    this.strokePath = document.createElementNS(svgNS, 'path');
    this.strokePath.setAttribute('d', 'M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z');
    this.strokePath.setAttribute('stroke-width', '2.5');
    this.strokePath.setAttribute('fill', 'none');
    svg.appendChild(this.fillPath);
    svg.appendChild(this.strokePath);
    this.container.appendChild(svg);
    this.svg = svg;
    this.dot = document.createElement('div');
    this.dot.className = 'custom-cursor-dot';
    document.body.appendChild(this.dot);
  }
  
  updateColors() {
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#a55860';
    this.fillPath.setAttribute('fill', accentColor);
    this.strokePath.setAttribute('stroke', '#ffffff');
  }
  
  initEvents() {
    window.addEventListener('mousemove', (e) => {
      if (!this.visible) {
        this.visible = true;
        this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }
      const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
      const isClickable = elemUnderCursor?.matches?.('a, button, .nav-item, .list-item, [role="button"], [data-clickable], .tag-button, .work-details-close, input, textarea, select, [contenteditable="true"]');
      if (isClickable) {
        if (!this.snappedMode || this.snappedElement !== elemUnderCursor) this.enterSnappedMode(elemUnderCursor);
        this.updateDotPosition(e.clientX, e.clientY);
      } else {
        if (this.snappedMode) this.exitSnappedMode();
      }
      const now = performance.now();
      if (this.lastTimestamp) {
        const dt = Math.min(50, Math.max(1, now - this.lastTimestamp));
        this.velocityX = (e.clientX - this.lastMouseX) / dt;
        this.velocityY = (e.clientY - this.lastMouseY) / dt;
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.lastTimestamp = now;
      if (!this.snappedMode) {
        this.targetX = e.clientX;
        this.targetY = e.clientY;
        let speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed > this.config.minSpeedForRotation) {
          let angle = Math.atan2(this.velocityY, this.velocityX) * 180 / Math.PI + 90;
          this.targetRotation = angle;
        } else this.targetRotation = 0;
      } else this.targetRotation = -45;
    });
    window.addEventListener('mouseleave', () => {
      this.visible = false;
      this.container.classList.remove('visible');
      document.body.classList.remove('custom-cursor-enabled');
      if (this.snappedMode) this.exitSnappedMode();
    });
    window.addEventListener('mouseenter', () => {
      if (this.targetX !== undefined) {
        this.visible = true;
        this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }
    });
    window.addEventListener('scroll', () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
    });
    window.addEventListener('resize', () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
    });
  }
  
  enterSnappedMode(element) {
    if (!element) return;
    this.snappedMode = true;
    this.snappedElement = element;
    this.dot.style.display = 'block';
    this.updateSnappedTargetPosition();
    this.targetRotation = 45;
  }
  
  exitSnappedMode() {
    this.snappedMode = false;
    this.snappedElement = null;
    this.dot.style.display = 'none';
    this.targetRotation = 0;
  }
  
  updateSnappedTargetPosition() {
    if (!this.snappedElement) return;
    const rect = this.snappedElement.getBoundingClientRect();
    this.targetX = rect.right;
    this.targetY = rect.bottom;
  }
  
  updateDotPosition(x, y) {
    if (!this.dot) return;
    this.dot.style.transform = `translate(${x}px, ${y}px)`;
  }
  
  startAnimation() {
    const animate = () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
      this.currentX += (this.targetX - this.currentX) * this.config.stiffness;
      this.currentY += (this.targetY - this.currentY) * this.config.stiffness;
      const dx = this.targetX - this.currentX;
      const dy = this.targetY - this.currentY;
      this.currentX += dx * 0.3;
      this.currentY += dy * 0.3;
      let diff = this.targetRotation - this.currentRotation;
      if (Math.abs(diff) > 180) diff -= Math.sign(diff) * 360;
      this.currentRotation += diff * this.config.rotationSmoothing;
      this.svg.style.transform = `translate(-50%, -50%) rotate(${this.currentRotation}deg) scale(${this.fixedScale})`;
      this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }
  
  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.container?.remove();
    this.dot?.remove();
    document.body.classList.remove('custom-cursor-enabled');
    document.body.style.cursor = '';
  }
}

// ==================== 外链管理器 ====================
export class ExternalLinkManager {
  constructor() {
    this.WHITELIST = CONFIG.EXTERNAL_WHITELIST;
    this.currentModal = null;
    this.currentOverlay = null;
    this.countdownInterval = null;
    this.remainingSeconds = 3;
    this.pendingUrl = null;
    this.isSafe = false;
    this.redirectTriggered = false;
    this.internalDomains = CONFIG.INTERNAL_DOMAINS;
    this.init();
  }
  
  isWhitelistedDomain(hostname) {
    if (!hostname) return false;
    const lower = hostname.toLowerCase();
    if (this.WHITELIST.has(lower)) return true;
    for (let domain of this.WHITELIST) if (lower.endsWith('.' + domain)) return true;
    return false;
  }
  
  isExternalLink(url) {
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false;
    try {
      const linkUrl = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(linkUrl.protocol)) return false;
      return !this.internalDomains.includes(linkUrl.hostname);
    } catch (e) {
      return false;
    }
  }
  
  clearTimer() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
  
  closeModal() {
    if (!this.currentModal) return;
    this.clearTimer();
    if (this.currentModal.classList.contains('closing')) return;
    this.currentModal.classList.add('closing');
    if (this.currentOverlay) this.currentOverlay.classList.remove('active');
    setTimeout(() => {
      if (this.currentModal) this.currentModal.remove();
      if (this.currentOverlay) this.currentOverlay.remove();
      this.currentModal = null;
      this.currentOverlay = null;
      this.pendingUrl = null;
      this.redirectTriggered = false;
    }, 400);
  }
  
  doRedirect() {
    if (this.redirectTriggered) return;
    if (!this.pendingUrl) return;
    this.redirectTriggered = true;
    this.clearTimer();
    window.open(this.pendingUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => this.closeModal(), 300);
  }
  
  startCountdown(timerElement) {
    if (!this.isSafe) return;
    if (this.redirectTriggered) return;
    this.clearTimer();
    this.remainingSeconds = 3;
    if (timerElement) timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`;
    this.countdownInterval = setInterval(() => {
      if (this.redirectTriggered || !this.currentModal) {
        this.clearTimer();
        return;
      }
      this.remainingSeconds--;
      if (this.remainingSeconds <= 0) {
        this.clearTimer();
        if (!this.redirectTriggered && timerElement) timerElement.innerHTML = `✓ 正在跳转...`;
        this.doRedirect();
      } else if (!this.redirectTriggered && timerElement) timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`;
    }, 1000);
  }
  
  showExternalLinkModal(url, targetElement = null) {
    if (this.currentModal) this.closeModal();
    let hostname = '';
    let isValid = false;
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
        isValid = true;
        hostname = urlObj.hostname;
      } else {
        this.showErrorToast('不支持的协议，仅支持 HTTP/HTTPS');
        return false;
      }
    } catch (err) {
      this.showErrorToast('链接格式无效');
      return false;
    }
    if (!isValid) return false;
    this.isSafe = this.isWhitelistedDomain(hostname);
    this.pendingUrl = url;
    this.redirectTriggered = false;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    const modal = document.createElement('div');
    modal.className = 'external-modal';
    const safeClass = this.isSafe ? 'safe' : '';
    const subText = this.isSafe ? '安全站点' : '您即将访问外部网站';
    const messageHtml = this.isSafe ? '安全的网站<br>将自动为您跳转，您也可点击「立即前往」手动跳转。' : '本站不对第三方内容负责';
    const btnText = this.isSafe ? '立即前往' : '继续前往';
    const btnSafeClass = this.isSafe ? 'safe' : '';
    modal.innerHTML = `<div class="external-modal-close">✕</div><div class="external-modal-content"><div class="external-modal-header"><span class="external-modal-domain ${safeClass}">${Utils.escapeHtml(hostname)}</span></div><div class="external-modal-sub">${subText}</div><div class="external-modal-url">${Utils.escapeHtml(url)}</div><div class="external-modal-message">${messageHtml}</div><div id="external-timer-area" class="external-modal-timer" style="${this.isSafe ? '' : 'display: none;'}"></div><div class="external-modal-buttons"><button class="external-modal-btn" id="external-cancel-btn">取消</button><button class="external-modal-btn external-modal-btn-primary ${btnSafeClass}" id="external-confirm-btn">${btnText}</button></div></div>`;
    document.body.appendChild(modal);
    this.currentModal = modal;
    this.currentOverlay = overlay;
    const closeBtn = modal.querySelector('.external-modal-close');
    const cancelBtn = modal.querySelector('#external-cancel-btn');
    const confirmBtn = modal.querySelector('#external-confirm-btn');
    const timerArea = modal.querySelector('#external-timer-area');
    const handleClose = () => this.closeModal();
    const handleConfirm = () => {
      if (this.redirectTriggered) return;
      this.clearTimer();
      this.doRedirect();
    };
    closeBtn.addEventListener('click', handleClose);
    cancelBtn.addEventListener('click', handleClose);
    confirmBtn.addEventListener('click', handleConfirm);
    overlay.addEventListener('click', handleClose);
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    const originalClose = this.closeModal.bind(this);
    this.closeModal = () => {
      document.removeEventListener('keydown', escHandler);
      originalClose();
      this.closeModal = originalClose;
    };
    requestAnimationFrame(() => {
      modal.classList.add('active');
      overlay.classList.add('active');
    });
    if (this.isSafe) this.startCountdown(timerArea);
    return true;
  }
  
  showErrorToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: var(--accent-color); color: white; padding: 10px 20px; border-radius: 40px; font-size: 0.9rem; z-index: 10000; box-shadow: var(--shadow-md); animation: fadeInUp 0.3s ease;`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
  
  handleLinkClick(e) {
    let target = e.target.closest('a');
    if (!target) return;
    const href = target.getAttribute('href');
    if (!href) return;
    if (this.isExternalLink(href)) {
      e.preventDefault();
      e.stopPropagation();
      this.showExternalLinkModal(href, target);
    }
  }
  
  init() {
    document.addEventListener('click', (e) => this.handleLinkClick(e));
    console.log('[INFO] 外链跳转确认管理器已启动');
  }
}

// ==================== 滚动揭示效果 ====================
export class ScrollReveal {
  constructor() {
    this.observer = null;
    this.initObserver();
  }
  
  initObserver() {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -20px 0px' }
    );
    this.observeItems();
  }
  
  observeItems() {
    const items = document.querySelectorAll('.list-item');
    items.forEach(item => {
      if (!item.classList.contains('revealed')) this.observer.observe(item);
    });
  }
  
  refresh() {
    this.initObserver();
  }
  
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// 使用 requestIdleCallback 初始化所有 UI 特效
let uiEffectsInitialized = false;
let externalLinkManager = null;
let customCursor = null;
let scrollRevealInstance = null;

export function initUIEffects() {
  if (uiEffectsInitialized) return;
  uiEffectsInitialized = true;
  
  const initFn = () => {
    externalLinkManager = new ExternalLinkManager();
    customCursor = new CustomCursor();
    scrollRevealInstance = new ScrollReveal();
    window.scrollRevealInstance = scrollRevealInstance;
  };
  
  if ('requestIdleCallback' in window) {
    requestIdleCallback(initFn, { timeout: 3000 });
  } else {
    setTimeout(initFn, 500);
  }
}

export function getScrollReveal() {
  return scrollRevealInstance;
}

export function refreshScrollReveal() {
  if (scrollRevealInstance) {
    scrollRevealInstance.refresh();
  }
}