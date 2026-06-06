/**
 * 导航标题替换功能 – 重构版
 * – 未匹配导航项时，导航区显示页面标题
 * – 鼠标移入显示原始导航按钮，移出恢复标题
 * – 导航栏宽度始终保持不变（由原始按钮组决定）
 * – 标题过长时自动滚动显示（跑马灯效果）
 * – 桌面端专用（宽 > 768px），移动端自动禁用
 */
import { Utils } from '/js/core/core.js';

class NavTitleReplacer {
  constructor() {
    this.initialized = false;
    this.enabled = false;
    this.isTitleMode = false;
    this.elements = {
      navbar: null,
      nav: null,
      navItems: null,
      placeholder: null,
      scrollContainer: null,
    };
    this.handlers = {
      mouseEnter: null,
      mouseLeave: null,
      resize: null,
      ajaxComplete: null,
    };
    this.resizeObserver = null;
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
    
    // 监听导航栏大小变化（如窗口缩放导致按钮组宽度变化）
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.enabled && !this.isTitleMode) {
          // 当按钮组宽度变化时，确保标题模式下的占位符能正确继承宽度
          this.updateTitleText();
        }
      });
      this.resizeObserver.observe(this.elements.navItems);
    }

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
    
    // 创建滚动容器
    const scrollContainer = document.createElement('span');
    scrollContainer.className = 'title-scroll-container';
    placeholder.appendChild(scrollContainer);
    
    this.elements.placeholder = placeholder;
    this.elements.scrollContainer = scrollContainer;
    this.elements.nav.appendChild(placeholder);
    
    // 初始隐藏
    placeholder.style.display = 'none';
  }

  getPageTitle() {
    let title = document.title || '页面';
    const siteName = 'GaoXinYang';
    if (title.endsWith(` - ${siteName}`)) {
      title = title.slice(0, -(` - ${siteName}`).length);
    }
    return title || '首页';
  }

  updateTitleText() {
    if (!this.elements.scrollContainer) return;
    
    const title = this.getPageTitle();
    this.elements.scrollContainer.textContent = title;
    
    // 重新检测溢出并应用滚动动画
    this.checkAndApplyScrollAnimation();
  }

  /**
   * 检测标题是否溢出，并应用滚动动画
   */
  checkAndApplyScrollAnimation() {
    if (!this.elements.placeholder || !this.elements.scrollContainer) return;
    
    // 重置滚动状态
    this.elements.placeholder.classList.remove('scrolling');
    this.elements.scrollContainer.style.animation = 'none';
    this.elements.scrollContainer.style.transform = '';
    
    // 强制重排以获取准确尺寸
    void this.elements.scrollContainer.offsetWidth;
    
    const container = this.elements.placeholder;
    const textSpan = this.elements.scrollContainer;
    const containerWidth = container.clientWidth;
    const textWidth = textSpan.scrollWidth;
    
    if (textWidth > containerWidth && containerWidth > 0) {
      // 计算滚动距离：需要向左移动 (文本宽度 - 容器宽度)
      const scrollDistance = textWidth - containerWidth;
      // 设置 CSS 自定义属性，用于动画
      container.style.setProperty('--scroll-distance', `-${scrollDistance}px`);
      // 计算动画时长：基于文本长度，约 50px/秒，最少 3 秒，最多 15 秒
      const duration = Math.min(15, Math.max(3, scrollDistance / 50));
      container.classList.add('scrolling');
      textSpan.style.animation = `scrollText ${duration}s linear infinite`;
    } else {
      container.classList.remove('scrolling');
      textSpan.style.animation = '';
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
      // 更新标题内容（可能页面标题变化）
      this.updateTitleText();
      // 当窗口大小改变时，重新检查滚动动画
      if (this.isTitleMode) {
        this.checkAndApplyScrollAnimation();
      }
      // 重新评估当前状态（防止鼠标状态异常）
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

    // 确保占位符存在且可见性正确
    if (this.elements.placeholder) {
      this.elements.placeholder.style.display = '';
    }
    
    // 更新标题文本
    this.updateTitleText();

    this.handlers.mouseEnter = () => this.onMouseEnter();
    this.handlers.mouseLeave = () => this.onMouseLeave();
    this.elements.navbar.addEventListener('mouseenter', this.handlers.mouseEnter);
    this.elements.navbar.addEventListener('mouseleave', this.handlers.mouseLeave);

    // 初始状态：如果鼠标不在导航栏内，显示标题
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

    // 恢复导航按钮完全可见
    this.setNavItemsVisible(true);
    // 隐藏占位符
    if (this.elements.placeholder) {
      this.elements.placeholder.style.display = 'none';
    }
    
    this.isTitleMode = false;
  }

  onMouseEnter() {
    if (!this.enabled) return;
    if (this.isTitleMode) this.switchToNavButtons();
  }

  onMouseLeave() {
    if (!this.enabled) return;
    if (!this.isTitleMode) this.switchToTitle();
  }

  isMouseInsideNavbar() {
    return this.elements.navbar && this.elements.navbar.matches(':hover');
  }

  /**
   * 切换到标题模式
   * 隐藏导航按钮（但保持占位），显示标题占位符
   */
  switchToTitle() {
    if (!this.enabled || this.isTitleMode) return;
    
    // 隐藏导航按钮（不可见但仍占位）
    this.setNavItemsVisible(false);
    // 显示标题占位符
    if (this.elements.placeholder) {
      this.elements.placeholder.style.display = 'flex';
      // 重新检测滚动动画（确保显示时正确应用）
      this.checkAndApplyScrollAnimation();
    }
    
    this.isTitleMode = true;
  }

  /**
   * 切换到导航按钮模式
   * 显示导航按钮，隐藏标题占位符
   */
  switchToNavButtons() {
    if (!this.enabled || !this.isTitleMode) return;
    
    // 显示导航按钮
    this.setNavItemsVisible(true);
    // 隐藏标题占位符
    if (this.elements.placeholder) {
      this.elements.placeholder.style.display = 'none';
    }
    
    this.isTitleMode = false;
  }

  /**
   * 控制导航按钮的可见性（保持占位）
   * @param {boolean} visible true=可见，false=不可见但仍占位
   */
  setNavItemsVisible(visible) {
    if (!this.elements.navItems) return;
    if (visible) {
      this.elements.navItems.classList.remove('title-mode-hidden');
    } else {
      this.elements.navItems.classList.add('title-mode-hidden');
    }
  }

  destroy() {
    this.disable();
    if (this.handlers.resize) window.removeEventListener('resize', this.handlers.resize);
    if (this.handlers.ajaxComplete) {
      window.removeEventListener('ajax:navigation', this.handlers.ajaxComplete);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.elements.placeholder && this.elements.placeholder.parentNode) {
      this.elements.placeholder.parentNode.removeChild(this.elements.placeholder);
    }
    this.elements = { navbar: null, nav: null, navItems: null, placeholder: null, scrollContainer: null };
    this.initialized = false;
    this.enabled = false;
    this.isTitleMode = false;
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