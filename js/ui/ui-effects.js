// /js/ui/ui-effects.js
// 自定义光标、外链管理器、滚动揭示效果（支持设置动态开关，滚动揭示复用 observer）

import { CONFIG, Utils, storageController } from '/js/core/core.js';

// ========== 设置键名（与 settings.js 保持一致） ==========
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled'
};

function isFeatureEnabled(key, defaultValue = true) {
  if (storageController && storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) return stored === 'true';
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === 'true';
  } catch (e) { }
  return defaultValue;
}

// ==================== 自定义光标（保持不变，略作格式统一） ====================
export class CustomCursor {
  constructor(options = {}) {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('[INFO] 触摸设备，跳过自定义光标');
      return;
    }
    this.config = {
      damping: 0.92,
      stiffness: 0.18,
      rotationSmoothing: 0.2,
      minSpeedForRotation: 0.5,
      idleDecayFactor: 0.98,
      angleFilter: 0.2,
      clickScale: 0.8,
      idleResetDelay: 100,
      ...options
    };
    this.targetX = 0; this.targetY = 0; this.currentX = 0; this.currentY = 0;
    this.fixedScale = 0.55;
    this.currentRotation = 0; this.targetRotation = 0;
    this.lastMouseX = 0; this.lastMouseY = 0; this.lastTimestamp = 0;
    this.velocityX = 0; this.velocityY = 0;
    this.snappedMode = false; this.snappedElement = null;
    this.rafId = null; this.visible = false;
    this.speedThreshold = 0.5;
    this.currentFillOpacity = 1;
    this.targetFillOpacity = 1;
    this.lastMoveTime = performance.now();
    this.filteredAngle = 0;
    this.clickScaleMultiplier = 1;
    this.clickTargetMultiplier = 1;
    this.clickFillMultiplier = 1;
    this.clickFillTarget = 1;

    this.initDOM();
    this.initEvents();
    this.updateColors();
    this.startAnimation();
    this._hideNativeCursor();

    window.addEventListener('themeChanged', () => this.updateColors());
    const observer = new MutationObserver(() => this.updateColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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
    this.fillPath.setAttribute('fill-opacity', '1');
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
      this.lastMoveTime = performance.now();

      const clickableSelector = `
        a, button, .nav-item, .list-item, [role="button"], [data-clickable],
        .tag-button, .work-details-close, input, textarea, select, [contenteditable="true"],
        .theme-switch, .stat-card, .tag, .stat-card[data-stat-type], #theme-toggle-checkbox
      `;
      const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
      const clickableTarget = elemUnderCursor?.closest(clickableSelector);
      const isClickable = !!clickableTarget;

      if (isClickable) {
        if (!this.snappedMode || this.snappedElement !== clickableTarget) {
          this.enterSnappedMode(clickableTarget);
        }
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
          let rawAngle = Math.atan2(this.velocityY, this.velocityX) * 180 / Math.PI + 90;
          let angleDiff = rawAngle - this.filteredAngle;
          if (Math.abs(angleDiff) > 180) angleDiff -= Math.sign(angleDiff) * 360;
          this.filteredAngle += angleDiff * this.config.angleFilter;
          this.targetRotation = this.filteredAngle;
        }
      } else {
        this.targetRotation = -45;
      }
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

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.clickTargetMultiplier = this.config.clickScale;
      this.clickFillTarget = 1;
    };
    const onMouseUp = (e) => {
      if (e.button !== 0) return;
      this.clickTargetMultiplier = 1;
      this.clickFillTarget = 1;
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this._clickHandlers = { onMouseDown, onMouseUp };
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
    let lastIdleCheck = performance.now();
    let isIdle = false;

    const animate = () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
      this.currentX += (this.targetX - this.currentX) * this.config.stiffness;
      this.currentY += (this.targetY - this.currentY) * this.config.stiffness;
      const dx = this.targetX - this.currentX;
      const dy = this.targetY - this.currentY;
      this.currentX += dx * 0.3;
      this.currentY += dy * 0.3;

      if (!this.snappedMode) {
        const now = performance.now();
        const speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed > this.config.minSpeedForRotation) {
          this.lastMoveTime = now;
          isIdle = false;
        } else {
          const idleDuration = now - this.lastMoveTime;
          if (idleDuration >= this.config.idleResetDelay) {
            if (!isIdle) isIdle = true;
            this.targetRotation *= this.config.idleDecayFactor;
            if (Math.abs(this.targetRotation) < 0.5) this.targetRotation = 0;
          } else {
            isIdle = false;
          }
        }
      } else {
        this.targetRotation = -45;
      }

      let diff = this.targetRotation - this.currentRotation;
      if (Math.abs(diff) > 180) diff -= Math.sign(diff) * 360;
      this.currentRotation += diff * this.config.rotationSmoothing;

      const speed = Math.hypot(this.velocityX, this.velocityY);
      this.targetFillOpacity = speed > this.speedThreshold ? 1 : 0;
      this.currentFillOpacity += (this.targetFillOpacity - this.currentFillOpacity) * 0.25;

      this.clickScaleMultiplier += (this.clickTargetMultiplier - this.clickScaleMultiplier) * 0.3;
      this.clickFillMultiplier += (this.clickFillTarget - this.clickFillMultiplier) * 0.3;
      const finalScale = this.fixedScale * this.clickScaleMultiplier;
      let finalFillOpacity = this.currentFillOpacity * this.clickFillMultiplier;
      if (finalFillOpacity > 1) finalFillOpacity = 1;
      this.fillPath.setAttribute('fill-opacity', finalFillOpacity);

      this.svg.style.transform = `translate(-50%, -50%) rotate(${this.currentRotation}deg) scale(${finalScale})`;
      this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  _hideNativeCursor() {
    if (!document.getElementById('custom-cursor-style')) {
      const style = document.createElement('style');
      style.id = 'custom-cursor-style';
      style.textContent = `body.custom-cursor-enabled, body.custom-cursor-enabled * { cursor: none !important; }`;
      document.head.appendChild(style);
    }
  }

  _restoreNativeCursor() {
    const styleEl = document.getElementById('custom-cursor-style');
    if (styleEl) styleEl.remove();
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._clickHandlers) {
      window.removeEventListener('mousedown', this._clickHandlers.onMouseDown);
      window.removeEventListener('mouseup', this._clickHandlers.onMouseUp);
    }
    this.container?.remove();
    this.dot?.remove();
    document.body.classList.remove('custom-cursor-enabled');
    this._restoreNativeCursor();
  }
}

// ==================== 外链管理器（保持不变） ====================
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
    this._boundHandleClick = null;
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
    this._boundHandleClick = this.handleLinkClick.bind(this);
    document.addEventListener('click', this._boundHandleClick);
    console.log('[INFO] 外链跳转确认管理器已启动');
  }

  destroy() {
    if (this._boundHandleClick) {
      document.removeEventListener('click', this._boundHandleClick);
      this._boundHandleClick = null;
    }
    if (this.currentModal) this.closeModal();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = null;
  }
}

// ==================== 滚动揭示效果（优化版：复用 observer） ====================
export class ScrollReveal {
  #observer = null;
  #targetSelector = '.list-item';   // 可配置

  constructor(selector = '.list-item') {
    this.#targetSelector = selector;
    this.#initObserver();
    this.observe();
  }

  #initObserver() {
    if (this.#observer) this.#observer.disconnect();
    this.#observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.#observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -20px 0px' }
    );
  }

  /** 观察所有未 reveal 的目标元素 */
  observe(targets = document.querySelectorAll(this.#targetSelector)) {
    if (!this.#observer) return;
    targets.forEach(el => {
      if (!el.classList.contains('revealed')) {
        this.#observer.observe(el);
      }
    });
  }

  /** 刷新：重新观察当前文档中所有未 reveal 的元素（不重建 observer） */
  refresh() {
    const hidden = document.querySelectorAll(`${this.#targetSelector}:not(.revealed)`);
    if (hidden.length) {
      hidden.forEach(el => this.#observer.observe(el));
    }
  }

  /** 完全销毁 observer */
  destroy() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }
  }
}

// ==================== 全局滚动揭示单例管理 ====================
let globalScrollRevealInstance = null;

export function ensureScrollReveal() {
  if (!globalScrollRevealInstance) {
    globalScrollRevealInstance = new ScrollReveal();
  }
  window.scrollRevealInstance = globalScrollRevealInstance;
  return globalScrollRevealInstance;
}

export function refreshScrollReveal() {
  if (globalScrollRevealInstance) {
    globalScrollRevealInstance.refresh();
  } else if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
  }
}

export function getScrollReveal() {
  return globalScrollRevealInstance || window.scrollRevealInstance;
}

// ==================== 光标和外链管理器（按需初始化） ====================
let uiEffectsInitialized = false;
let customCursorInstance = null;
let externalLinkManagerInstance = null;

export function initUIEffects() {
  if (uiEffectsInitialized) return;
  uiEffectsInitialized = true;

  const initFn = () => {
    const cursorEnabled = isFeatureEnabled(SETTINGS_KEYS.CURSOR_ENABLED, true);
    const linkWarningEnabled = isFeatureEnabled(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);

    if (cursorEnabled && !customCursorInstance) {
      customCursorInstance = new CustomCursor();
    } else if (!cursorEnabled && customCursorInstance) {
      customCursorInstance.destroy();
      customCursorInstance = null;
    }

    if (linkWarningEnabled && !externalLinkManagerInstance) {
      externalLinkManagerInstance = new ExternalLinkManager();
    } else if (!linkWarningEnabled && externalLinkManagerInstance) {
      externalLinkManagerInstance.destroy();
      externalLinkManagerInstance = null;
    }
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(initFn, { timeout: 3000 });
  } else {
    setTimeout(initFn, 500);
  }
}

export { customCursorInstance, externalLinkManagerInstance };