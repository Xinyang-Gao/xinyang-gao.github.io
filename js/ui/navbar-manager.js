// /js/ui/navbar-manager.js
// 完全 JS 驱动的导航栏模块，整合标题替换功能

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme, getPageNameFromPath } from '/js/core/page-utils.js';
import { initThemeToggle } from '/js/ui/theme.js';
import { initMobileMenuToggle, bindNavLinks, initNavigation } from '/js/router/router.js';

class NavbarManager {
  constructor() {
    this.initialized = false;
    this.elements = {
      navbar: null,
      nav: null,
      navItems: null,
      placeholder: null,
      titlePlaceholder: null,
      titleScrollContainer: null,
    };
    this.titleMode = false;
    this.titleHandlers = {
      mouseEnter: null,
      mouseLeave: null,
      resize: null,
    };
    this.resizeObserver = null;
    this.idleTimeout = null;
    this.isIdle = false;
  }

  // 生成导航栏 DOM 结构（与原始 navbar.html 完全一致）
  static createNavbarDOM() {
    const navbar = document.createElement('div');
    navbar.className = 'navbar';

    // Logo
    const logoDiv = document.createElement('div');
    logoDiv.className = 'nav-logo';
    logoDiv.innerHTML = '<span class="logo-text">GaoXinYang</span>';
    navbar.appendChild(logoDiv);

    // 导航菜单容器
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', '主导航');
    const navItems = document.createElement('div');
    navItems.className = 'nav-items';
    navItems.id = 'navbarNav';

    const links = [
      { href: '/index.html', page: 'index', text: '首页' },
      { href: '/about.html', page: 'about', text: '关于' },
      { href: '/articles.html', page: 'articles', text: '文章' },
      { href: '/archive.html', page: 'archive', text: '归档' },
      { href: '/works.html', page: 'works', text: '作品' },
      { href: '/friends.html', page: 'friends', text: '友链' },
      { href: '/contact.html', page: 'contact', text: '留言板' }
    ];

    links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.href;
      a.className = 'nav-item';
      a.setAttribute('data-page', link.page);
      a.textContent = link.text;
      navItems.appendChild(a);
    });

    nav.appendChild(navItems);
    navbar.appendChild(nav);

    // 右侧操作区
    const navActions = document.createElement('div');
    navActions.className = 'nav-actions';

    const themeLabel = document.createElement('label');
    themeLabel.className = 'theme-switch';
    themeLabel.setAttribute('aria-label', '切换明暗主题');
    const themeCheckbox = document.createElement('input');
    themeCheckbox.type = 'checkbox';
    themeCheckbox.id = 'theme-toggle-checkbox';
    const sliderSpan = document.createElement('span');
    sliderSpan.className = 'slider';
    themeLabel.appendChild(themeCheckbox);
    themeLabel.appendChild(sliderSpan);

    const mobileToggle = document.createElement('div');
    mobileToggle.className = 'mobile-toggle';
    for (let i = 0; i < 3; i++) mobileToggle.appendChild(document.createElement('span'));

    navActions.appendChild(themeLabel);
    navActions.appendChild(mobileToggle);
    navbar.appendChild(navActions);

    return navbar;
  }

  // 确保导航栏样式已加载
  static ensureCSS() {
    if (document.querySelector('link[href="/css/navbar.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/navbar.css';
    document.head.appendChild(link);
  }

  // ---------- 标题替换功能（原 nav-title-replacer 核心） ----------
  createTitlePlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'nav-title-placeholder';
    const scrollContainer = document.createElement('span');
    scrollContainer.className = 'title-scroll-container';
    placeholder.appendChild(scrollContainer);
    this.elements.titlePlaceholder = placeholder;
    this.elements.titleScrollContainer = scrollContainer;
    this.elements.nav.appendChild(placeholder);
    placeholder.style.display = 'none';
  }

  getPageTitle() {
    let title = document.title || '页面';
    const siteName = 'GaoXinYang';
    if (title.endsWith(` - ${siteName}`)) title = title.slice(0, -(` - ${siteName}`).length);
    return title || '首页';
  }

  updateTitleText() {
    if (!this.elements.titleScrollContainer) return;
    const title = this.getPageTitle();
    this.elements.titleScrollContainer.textContent = title;
    this.checkTitleOverflow();
  }

  checkTitleOverflow() {
    const placeholder = this.elements.titlePlaceholder;
    const textSpan = this.elements.titleScrollContainer;
    if (!placeholder || !textSpan) return;

    placeholder.classList.remove('scrolling');
    textSpan.style.animation = 'none';
    textSpan.style.transform = '';
    void textSpan.offsetWidth;

    const containerWidth = placeholder.clientWidth;
    const textWidth = textSpan.scrollWidth;
    if (textWidth > containerWidth && containerWidth > 0) {
      const scrollDistance = textWidth - containerWidth;
      placeholder.style.setProperty('--scroll-distance', `-${scrollDistance}px`);
      const duration = Math.min(15, Math.max(3, scrollDistance / 50));
      placeholder.classList.add('scrolling');
      textSpan.style.animation = `scrollText ${duration}s linear infinite`;
    } else {
      placeholder.classList.remove('scrolling');
      textSpan.style.animation = '';
    }
  }

  hasActiveNavItem() {
    return this.elements.navItems && this.elements.navItems.querySelector('.nav-item.active') !== null;
  }

  isDesktop() {
    return window.innerWidth > 768;
  }

  shouldEnableTitleMode() {
    return this.isDesktop() && !this.hasActiveNavItem();
  }

  switchToTitleMode() {
    if (this.titleMode) return;
    if (!this.elements.titlePlaceholder) return;
    this.setNavItemsVisible(false);
    this.elements.titlePlaceholder.style.display = 'flex';
    this.updateTitleText();
    this.titleMode = true;
  }

  switchToNavMode() {
    if (!this.titleMode) return;
    if (!this.elements.titlePlaceholder) return;
    this.setNavItemsVisible(true);
    this.elements.titlePlaceholder.style.display = 'none';
    this.titleMode = false;
  }

  setNavItemsVisible(visible) {
    if (!this.elements.navItems) return;
    if (visible) {
      this.elements.navItems.classList.remove('title-mode-hidden');
    } else {
      this.elements.navItems.classList.add('title-mode-hidden');
    }
  }

  onMouseEnter() {
    if (this.shouldEnableTitleMode() && this.titleMode) {
      this.switchToNavMode();
    }
  }

  onMouseLeave() {
    if (this.shouldEnableTitleMode() && !this.titleMode) {
      this.switchToTitleMode();
    }
  }

  onResize() {
    const shouldEnable = this.shouldEnableTitleMode();
    if (shouldEnable && !this.titleMode && !this.isDesktop() === false) {
      this.switchToTitleMode();
    } else if (!shouldEnable && this.titleMode) {
      this.switchToNavMode();
    } else if (shouldEnable && this.titleMode) {
      this.updateTitleText();
    }
  }

  // 监听导航栏大小变化（如窗口缩放）
  observeNavItemsResize() {
    if (!window.ResizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.shouldEnableTitleMode() && this.titleMode) {
        this.updateTitleText();
      }
    });
    if (this.elements.navItems) this.resizeObserver.observe(this.elements.navItems);
  }

  // 初始化标题替换事件
  initTitleReplacer() {
    if (!this.elements.navbar || !this.elements.nav || !this.elements.navItems) return;
    this.createTitlePlaceholder();

    this.titleHandlers.mouseEnter = () => this.onMouseEnter();
    this.titleHandlers.mouseLeave = () => this.onMouseLeave();
    this.titleHandlers.resize = () => this.onResize();

    this.elements.navbar.addEventListener('mouseenter', this.titleHandlers.mouseEnter);
    this.elements.navbar.addEventListener('mouseleave', this.titleHandlers.mouseLeave);
    window.addEventListener('resize', this.titleHandlers.resize);
    window.addEventListener('ajax:navigation', () => this.onResize());
    this.observeNavItemsResize();

    // 初始状态
    if (this.shouldEnableTitleMode()) this.switchToTitleMode();
  }

  // 销毁标题替换功能
  destroyTitleReplacer() {
    if (this.titleHandlers.mouseEnter) {
      this.elements.navbar?.removeEventListener('mouseenter', this.titleHandlers.mouseEnter);
      this.elements.navbar?.removeEventListener('mouseleave', this.titleHandlers.mouseLeave);
    }
    if (this.titleHandlers.resize) window.removeEventListener('resize', this.titleHandlers.resize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.elements.titlePlaceholder?.parentNode) {
      this.elements.titlePlaceholder.parentNode.removeChild(this.elements.titlePlaceholder);
    }
    this.setNavItemsVisible(true);
    this.titleMode = false;
  }

  // ---------- 公共初始化入口 ----------
  async init(placeholderId = 'navbar-placeholder') {
    if (this.initialized) return;
    const placeholder = document.getElementById(placeholderId);
    if (!placeholder) {
      console.warn(`[NavbarManager] 占位符 #${placeholderId} 未找到`);
      return;
    }

    // 已经存在导航栏则复用
    if (placeholder.querySelector('.navbar')) {
      this.elements.navbar = placeholder.querySelector('.navbar');
      this.elements.nav = this.elements.navbar.querySelector('nav');
      this.elements.navItems = this.elements.navbar.querySelector('.nav-items');
      // 重新绑定动态组件
      this.rebindDynamicComponents();
      this.initialized = true;
      return;
    }

    NavbarManager.ensureCSS();
    const navbarElement = NavbarManager.createNavbarDOM();
    placeholder.innerHTML = '';
    placeholder.appendChild(navbarElement);

    this.elements.navbar = navbarElement;
    this.elements.nav = navbarElement.querySelector('nav');
    this.elements.navItems = navbarElement.querySelector('.nav-items');
    this.elements.placeholder = placeholder;

    // 初始化所有依赖组件
    this.rebindDynamicComponents();

    // 启动标题替换功能（合并 nav-title-replacer）
    this.initTitleReplacer();

    this.initialized = true;
    console.log('[NavbarManager] 导航栏初始化完成');
  }

  // 重新绑定动态行为（无刷新导航后或首次加载时调用）
  rebindDynamicComponents() {
    // 复用现有全局函数（保持与原有代码一致）
    if (typeof initThemeToggle === 'function') initThemeToggle();
    if (typeof initMobileMenuToggle === 'function') initMobileMenuToggle();
    if (typeof bindNavLinks === 'function') bindNavLinks();
    if (typeof initNavigation === 'function') initNavigation();
  }

  // 刷新标题内容（无刷新导航后调用）
  refreshTitle() {
    if (this.titleMode && this.elements.titlePlaceholder) {
      this.updateTitleText();
    }
  }

  // 完全销毁导航栏（用于测试或动态卸载）
  destroy() {
    this.destroyTitleReplacer();
    if (this.elements.placeholder) this.elements.placeholder.innerHTML = '';
    this.initialized = false;
  }
}

// 单例模式
let navbarManagerInstance = null;

export async function initNavbar(placeholderId = 'navbar-placeholder') {
  if (!navbarManagerInstance) {
    navbarManagerInstance = new NavbarManager();
  }
  await navbarManagerInstance.init(placeholderId);
  return navbarManagerInstance;
}

export function refreshNavbarTitle() {
  if (navbarManagerInstance) navbarManagerInstance.refreshTitle();
}