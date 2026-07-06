// /js/ui/navbar-manager.ts
// 完全 JS 驱动的导航栏模块，整合标题替换、入场动画与 SPA 适配

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme, getPageNameFromPath } from '/js/core/page-utils.js';
import { initThemeToggle } from '/js/ui/theme.js';
import { initMobileMenuToggle, initNavigation } from '/js/router/router.js';

class NavbarManager {
  private initialized = false;
  private elements: {
    navbar: HTMLElement | null;
    nav: HTMLElement | null;
    navItems: HTMLElement | null;
    placeholder: HTMLElement | null;
    titlePlaceholder: HTMLElement | null;
    titleScrollContainer: HTMLElement | null;
  } = {
    navbar: null,
    nav: null,
    navItems: null,
    placeholder: null,
    titlePlaceholder: null,
    titleScrollContainer: null,
  };

  private titleMode = false;
  private titleHandlers = {
    mouseEnter: null as (() => void) | null,
    mouseLeave: null as (() => void) | null,
    resize: null as (() => void) | null,
  };
  private resizeObserver: ResizeObserver | null = null;
  private _entrancePlayed = false;

  // ---------- 静态方法：生成导航栏 DOM ----------
  static createNavbarDOM(): HTMLElement {
    const navbar = document.createElement('div');
    navbar.className = 'navbar initial';

    // Logo
    const logoDiv = document.createElement('div');
    logoDiv.className = 'nav-logo';
    logoDiv.innerHTML = '<span class="logo-text">GaoXinYang</span>';
    navbar.appendChild(logoDiv);

    // 导航菜单
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', '主导航');
    const navItems = document.createElement('div');
    navItems.className = 'nav-items';
    navItems.id = 'navbarNav';

    const links = [
      { href: '/', page: 'index', text: '首页' },
      { href: '/about/', page: 'about', text: '关于' },
      { href: '/articles/', page: 'articles', text: '文章' },
      { href: '/archive/', page: 'archive', text: '归档' },
      { href: '/works/', page: 'works', text: '作品' },
      { href: '/friends/', page: 'friends', text: '友链' },
      { href: '/contact/', page: 'contact', text: '留言板' },
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

  static ensureCSS(): void {
    if (document.querySelector('link[href="/css/components/navbar.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/components/navbar.css';
    document.head.appendChild(link);
  }

  // ---------- 入场动画控制 ----------
  playEntranceAnimation(): void {
    if (this._entrancePlayed || !this.elements.navbar) return;
    this.elements.navbar.classList.remove('initial');
    this._entrancePlayed = true;
    console.log('[NavbarManager] 入场动画已播放');
  }

  // ---------- 标题替换功能 ----------
  private createTitlePlaceholder(): void {
    const placeholder = document.createElement('div');
    placeholder.className = 'nav-title-placeholder';
    const scrollContainer = document.createElement('span');
    scrollContainer.className = 'title-scroll-container';
    placeholder.appendChild(scrollContainer);
    this.elements.titlePlaceholder = placeholder;
    this.elements.titleScrollContainer = scrollContainer;
    this.elements.nav?.appendChild(placeholder);
    placeholder.style.display = 'none';
  }

  private getPageTitle(): string {
    let title = document.title || '页面';
    const siteName = 'GaoXinYang';
    if (title.endsWith(` - ${siteName}`)) title = title.slice(0, -(` - ${siteName}`).length);
    return title || '首页';
  }

  private updateTitleText(): void {
    if (!this.elements.titleScrollContainer) return;
    const title = this.getPageTitle();
    this.elements.titleScrollContainer.textContent = title;
    this.checkTitleOverflow();
  }

  private checkTitleOverflow(): void {
    const placeholder = this.elements.titlePlaceholder;
    const textSpan = this.elements.titleScrollContainer;
    if (!placeholder || !textSpan) return;

    placeholder.classList.remove('scrolling');
    textSpan.style.animation = 'none';
    textSpan.style.transform = '';
    void textSpan.offsetWidth; // 强制回流

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

  private hasActiveNavItem(): boolean {
    return !!this.elements.navItems?.querySelector('.nav-item.active');
  }

  private isDesktop(): boolean {
    return window.innerWidth > 768;
  }

  private shouldEnableTitleMode(): boolean {
    return this.isDesktop() && !this.hasActiveNavItem();
  }

  private switchToTitleMode(): void {
    if (this.titleMode || !this.elements.titlePlaceholder) return;
    this.setNavItemsVisible(false);
    this.elements.titlePlaceholder.style.display = 'flex';
    this.updateTitleText();
    this.titleMode = true;
  }

  private switchToNavMode(): void {
    if (!this.titleMode || !this.elements.titlePlaceholder) return;
    this.setNavItemsVisible(true);
    this.elements.titlePlaceholder.style.display = 'none';
    this.titleMode = false;
  }

  private setNavItemsVisible(visible: boolean): void {
    if (!this.elements.navItems) return;
    if (visible) {
      this.elements.navItems.classList.remove('title-mode-hidden');
    } else {
      this.elements.navItems.classList.add('title-mode-hidden');
    }
  }

  private onMouseEnter = (): void => {
    if (this.shouldEnableTitleMode() && this.titleMode) {
      this.switchToNavMode();
    }
  };

  private onMouseLeave = (): void => {
    if (this.shouldEnableTitleMode() && !this.titleMode) {
      this.switchToTitleMode();
    }
  };

  private onResize = (): void => {
    const shouldEnable = this.shouldEnableTitleMode();
    if (shouldEnable && !this.titleMode && this.isDesktop()) {
      this.switchToTitleMode();
    } else if (!shouldEnable && this.titleMode) {
      this.switchToNavMode();
    } else if (shouldEnable && this.titleMode) {
      this.updateTitleText();
    }
  };

  private observeNavItemsResize(): void {
    if (!window.ResizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.shouldEnableTitleMode() && this.titleMode) {
        this.updateTitleText();
      }
    });
    if (this.elements.navItems) this.resizeObserver.observe(this.elements.navItems);
  }

  private initTitleReplacer(): void {
    if (!this.elements.navbar || !this.elements.nav || !this.elements.navItems) return;
    this.createTitlePlaceholder();

    this.elements.navbar.addEventListener('mouseenter', this.onMouseEnter);
    this.elements.navbar.addEventListener('mouseleave', this.onMouseLeave);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('ajax:navigation', this.onResize);
    this.observeNavItemsResize();

    // 初始状态
    if (this.shouldEnableTitleMode()) this.switchToTitleMode();
  }

  private destroyTitleReplacer(): void {
    if (this.elements.navbar) {
      this.elements.navbar.removeEventListener('mouseenter', this.onMouseEnter);
      this.elements.navbar.removeEventListener('mouseleave', this.onMouseLeave);
    }
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('ajax:navigation', this.onResize);
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

  // ---------- 重新绑定动态组件（无刷新导航后复用） ----------
  private rebindDynamicComponents(): void {
    // 主题切换、移动菜单、高亮更新（不重复绑定导航点击）
    initThemeToggle();
    initMobileMenuToggle();
    initNavigation(); // 仅更新高亮，不绑定点击
  }

  // ---------- 公共初始化入口 ----------
  async init(placeholderId = 'navbar-placeholder'): Promise<void> {
    if (this.initialized) return;
    const placeholder = document.getElementById(placeholderId);
    if (!placeholder) {
      console.warn(`[NavbarManager] 占位符 #${placeholderId} 未找到`);
      return;
    }

    // 如果占位符中已存在导航栏（无刷新导航复用）
    const existingNavbar = placeholder.querySelector('.navbar') as HTMLElement | null;
    if (existingNavbar) {
      this.elements.navbar = existingNavbar;
      this.elements.nav = existingNavbar.querySelector('nav');
      this.elements.navItems = existingNavbar.querySelector('.nav-items');
      this.elements.placeholder = placeholder;
      // 确保移除 initial 类（避免动画干扰）
      existingNavbar.classList.remove('initial');
      this._entrancePlayed = true;
      // 重新绑定组件（高亮、菜单、主题）
      this.rebindDynamicComponents();
      // 重新初始化标题替换（因为 DOM 可能变化）
      this.destroyTitleReplacer();
      this.initTitleReplacer();
      this.initialized = true;
      console.log('[NavbarManager] 导航栏复用完成');
      return;
    }

    // 首次加载：创建导航栏
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

    // 启动标题替换功能
    this.initTitleReplacer();

    // 首次创建后自动播放入场动画
    this.playEntranceAnimation();

    this.initialized = true;
    console.log('[NavbarManager] 导航栏初始化完成（首次）');
  }

  // 刷新标题内容（无刷新导航后调用）
  refreshTitle(): void {
    if (this.titleMode && this.elements.titlePlaceholder) {
      this.updateTitleText();
    }
  }

  // 完全销毁导航栏（用于测试或动态卸载）
  destroy(): void {
    this.destroyTitleReplacer();
    if (this.elements.placeholder) this.elements.placeholder.innerHTML = '';
    this.initialized = false;
  }
}

// 单例模式
let navbarManagerInstance: NavbarManager | null = null;

export async function initNavbar(placeholderId = 'navbar-placeholder'): Promise<NavbarManager> {
  if (!navbarManagerInstance) {
    navbarManagerInstance = new NavbarManager();
  }
  await navbarManagerInstance.init(placeholderId);
  return navbarManagerInstance;
}

export function refreshNavbarTitle(): void {
  navbarManagerInstance?.refreshTitle();
}