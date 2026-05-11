/**
 * 导航标题替换功能 – 优化版
 * – 未匹配导航项时，导航区显示页面标题
 * – 鼠标移入显示原始导航按钮，移出恢复标题
 * – 宽度先平滑过渡，内容再渐显（无抖动）
 * – 桌面端专用（宽 > 768px），移动端自动禁用
 */
import { Utils } from '/js/core.js';

class NavTitleReplacer {
  constructor() {
    this.initialized = false;
    this.enabled = false;
    this.isTitleMode = false;
    this.animationPending = false;
    this.elements = {
      navbar: null,
      nav: null,
      navItems: null,
      placeholder: null,
    };
    this.handlers = {
      mouseEnter: null,
      mouseLeave: null,
      resize: null,
      ajaxComplete: null,
    };
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.elements.navbar = document.querySelector('.navbar');
    if (!this.elements.navbar) return;

    this.elements.nav = this.elements.navbar.querySelector('nav');
    this.elements.navItems = this.elements.navbar.querySelector('.nav-items');
    if (!this.elements.nav || !this.elements.navItems) return;

    this.createPlaceholder();
    this.handlers.resize = () => this.handleResize();
    this.handlers.ajaxComplete = () => this.reload();
    window.addEventListener('resize', this.handlers.resize);
    window.addEventListener('ajax:navigation', this.handlers.ajaxComplete);
    window.addEventListener('popstate', this.handlers.ajaxComplete);

    this.handleResize();
  }

  reload() {
    this.destroy();
    this.initialized = false;
    this.init();
  }

  createPlaceholder() {
    if (this.elements.placeholder) return;
    const placeholder = document.createElement('div');
    placeholder.className = 'nav-title-placeholder';
    placeholder.textContent = this.getPageTitle();
    this.elements.placeholder = placeholder;
  }

  getPageTitle() {
    let title = document.title || '页面';
    const siteName = 'GaoXinYang';
    if (title.endsWith(` - ${siteName}`)) {
      title = title.slice(0, -(` - ${siteName}`).length);
    }
    return title;
  }

  updateTitleText() {
    if (this.elements.placeholder) {
      this.elements.placeholder.textContent = this.getPageTitle();
    }
  }

  hasActiveNavItem() {
    return this.elements.navItems && 
           this.elements.navItems.querySelector('.nav-item.active') !== null;
  }

  handleResize() {
    const isDesktop = window.innerWidth > 768;
    const hasActive = this.hasActiveNavItem();
    const shouldEnable = isDesktop && !hasActive;

    if (shouldEnable && !this.enabled) {
      this.enable();
    } else if (!shouldEnable && this.enabled) {
      this.disable();
    } else if (shouldEnable && this.enabled) {
      this.updateTitleText();
      if (!this.isMouseInsideNavbar() && !this.isTitleMode) {
        this.switchToTitle();
      } else if (this.isMouseInsideNavbar() && this.isTitleMode) {
        this.switchToNavButtons();
      }
    }
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;

    if (!this.elements.placeholder.parentNode) {
      this.elements.nav.appendChild(this.elements.placeholder);
    }

    this.handlers.mouseEnter = () => this.onMouseEnter();
    this.handlers.mouseLeave = () => this.onMouseLeave();
    this.elements.navbar.addEventListener('mouseenter', this.handlers.mouseEnter);
    this.elements.navbar.addEventListener('mouseleave', this.handlers.mouseLeave);

    if (!this.isMouseInsideNavbar()) {
      this.switchToTitle();
    } else {
      this.switchToNavButtons();
    }
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.handlers.mouseEnter) {
      this.elements.navbar.removeEventListener('mouseenter', this.handlers.mouseEnter);
      this.handlers.mouseEnter = null;
    }
    if (this.handlers.mouseLeave) {
      this.elements.navbar.removeEventListener('mouseleave', this.handlers.mouseLeave);
      this.handlers.mouseLeave = null;
    }

    if (this.elements.placeholder && this.elements.placeholder.parentNode) {
      this.elements.placeholder.parentNode.removeChild(this.elements.placeholder);
    }

    this.clearWidthTransition();
    this.setFinalVisibility(this.elements.navItems, true);
    this.setFinalVisibility(this.elements.placeholder, false);
    this.isTitleMode = false;
  }

  onMouseEnter() {
    if (!this.enabled || this.animationPending) return;
    if (this.isTitleMode) this.switchToNavButtons();
  }

  onMouseLeave() {
    if (!this.enabled || this.animationPending) return;
    if (!this.isTitleMode) this.switchToTitle();
  }

  isMouseInsideNavbar() {
    return this.elements.navbar && this.elements.navbar.matches(':hover');
  }

  /**
   * 核心切换逻辑：先控制宽度过渡，最后更新可见性
   * @param {boolean} toTitle true=切换到标题，false=切换到导航按钮
   */
  switchTo(toTitle) {
    if (this.animationPending) return;
    this.animationPending = true;

    const currentModeIsTitle = this.isTitleMode;
    if (toTitle === currentModeIsTitle) {
      this.animationPending = false;
      return;
    }

    // 1. 准备测量目标内容的自然宽度
    // 暂时将目标内容设置为“保留占位但透明”，旧内容保持可见（也保留占位）
    const targetElem = toTitle ? this.elements.placeholder : this.elements.navItems;
    const sourceElem = toTitle ? this.elements.navItems : this.elements.placeholder;

    // 移除 final hide 类，保证元素参与布局
    sourceElem.classList.remove('hide');
    targetElem.classList.remove('hide');
    // 设置为半透明占位模式
    sourceElem.classList.add('hide-for-width');
    targetElem.classList.remove('hide-for-width');

    // 强制浏览器重排，确保宽度测量准确
    void this.elements.navbar.offsetWidth;

    // 测量目标元素完全可见时的自然宽度
    const targetWidth = this.elements.navbar.scrollWidth;

    // 2. 开始宽度过渡
    const navbar = this.elements.navbar;
    const currentWidth = navbar.offsetWidth;
    navbar.style.width = currentWidth + 'px';
    navbar.classList.add('width-transition');
    navbar.style.width = targetWidth + 'px';

    // 3. 宽度过渡结束后，切换内容的最终可见性（display 切换，彻底隐藏源内容）
    const onTransitionEnd = () => {
      navbar.removeEventListener('transitionend', onTransitionEnd);
      this.clearWidthTransition();

      // 设置最终可见性（源内容完全隐藏，目标内容完全显示）
      this.setFinalVisibility(sourceElem, false);
      this.setFinalVisibility(targetElem, true);
      this.isTitleMode = toTitle;

      // 清除半透明占位类
      sourceElem.classList.remove('hide-for-width');
      targetElem.classList.remove('hide-for-width');

      this.animationPending = false;
    };
    navbar.addEventListener('transitionend', onTransitionEnd, { once: true });

    // 保险：200ms 后如果过渡未触发则强制结束
    setTimeout(() => {
      if (this.animationPending) {
        navbar.removeEventListener('transitionend', onTransitionEnd);
        this.clearWidthTransition();
        this.setFinalVisibility(sourceElem, false);
        this.setFinalVisibility(targetElem, true);
        sourceElem.classList.remove('hide-for-width');
        targetElem.classList.remove('hide-for-width');
        this.isTitleMode = toTitle;
        this.animationPending = false;
      }
    }, 400);
  }

  switchToTitle() {
    this.switchTo(true);
  }

  switchToNavButtons() {
    this.switchTo(false);
  }

  /**
   * 设置元素的最终可见性（display 控制）
   * @param {HTMLElement} el 
   * @param {boolean} visible 
   */
  setFinalVisibility(el, visible) {
    if (!el) return;
    if (visible) {
      el.classList.remove('hide');
      el.style.display = '';
      // 确保有正确的 display 值
      if (el === this.elements.navItems) el.style.display = 'flex';
      else if (el === this.elements.placeholder) el.style.display = 'flex';
    } else {
      el.classList.add('hide');
      el.style.display = 'none';
    }
  }

  clearWidthTransition() {
    const navbar = this.elements.navbar;
    if (navbar) {
      navbar.classList.remove('width-transition');
      navbar.style.width = '';
    }
  }

  destroy() {
    this.disable();
    if (this.handlers.resize) window.removeEventListener('resize', this.handlers.resize);
    if (this.handlers.ajaxComplete) {
      window.removeEventListener('ajax:navigation', this.handlers.ajaxComplete);
      window.removeEventListener('popstate', this.handlers.ajaxComplete);
    }
    this.elements = { navbar: null, nav: null, navItems: null, placeholder: null };
    this.initialized = false;
    this.enabled = false;
    this.isTitleMode = false;
    this.animationPending = false;
  }
}

// 单例
let instance = null;

export function initNavTitleReplacer() {
  if (instance) instance.reload();
  else instance = new NavTitleReplacer().init();
}

export function refreshNavTitleReplacer() {
  if (instance && instance.initialized) instance.handleResize();
  else initNavTitleReplacer();
}

export function destroyNavTitleReplacer() {
  if (instance) { instance.destroy(); instance = null; }
}