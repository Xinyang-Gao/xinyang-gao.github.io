// /js/ui/navbar-manager.ts
// 职责：DOM 生成、入场动画、标题替换、滚动状态、移动菜单无障碍、SPA 复用
// 移动菜单与导航高亮逻辑
// 资源清理统一走 DisposableStack

import { CONFIG, Utils, onNavigation } from '/js/core/core.js';
import { DisposableStack } from '/js/core/disposable-stack.js';
import { initThemeToggle } from '/js/ui/theme.js';
import { mountBrandLogo } from '/js/ui/brand-logo.js';
import type { BrandLogoHandle } from '/js/ui/brand-logo.js';

const SITE_NAME = 'GaoXinYang';
const CSS_PATH = '/css/components/navbar.css';
const SCROLL_THRESHOLD = 24;
const DESKTOP_BREAKPOINT = CONFIG.BREAKPOINTS.MOBILE;

const NAV_LINKS: ReadonlyArray<{ href: string; page: string; text: string }> = [
  { href: '/', page: 'index', text: '首页' },
  { href: '/about/', page: 'about', text: '关于' },
  { href: '/articles/', page: 'articles', text: '文章' },
  { href: '/works/', page: 'works', text: '作品' },
  { href: '/friends/', page: 'friends', text: '友链' },
  { href: '/contact/', page: 'contact', text: '留言板' },
  { href: '/timeline/', page: 'timeline', text: '时间线' },
];

interface NavbarElements {
  navbar: HTMLElement | null;
  nav: HTMLElement | null;
  navItems: HTMLElement | null;
  placeholder: HTMLElement | null;
  titlePlaceholder: HTMLElement | null;
  titleScroll: HTMLElement | null;
}

export class NavbarManager {
  private initialized = false;
  private entrancePlayed = false;
  private titleMode = false;
  private scrollTicking = false;
  private resizeTicking = false;
  private titleHoverTimer: number | undefined;

  /** 统一资源清理栈 */
  private stack = new DisposableStack();

  /** 品牌 LOGO 勾边动画句柄 */
  private logoDraw: BrandLogoHandle | null = null;

  private elements: NavbarElements = {
    navbar: null,
    nav: null,
    navItems: null,
    placeholder: null,
    titlePlaceholder: null,
    titleScroll: null,
  };

  /* ================= DOM 生成 ================= */

  static createNavbarDOM(): HTMLElement {
    const navbar = document.createElement('div');
    navbar.className = 'navbar initial';

    const logo = document.createElement('a');
    logo.href = '/';
    logo.className = 'nav-logo';
    logo.setAttribute('aria-label', '返回首页');

    // 品牌 SVG：默认隐藏，加载覆盖层消失后由 AppInitializer 触发勾边
    const logoMark = document.createElement('span');
    logoMark.className = 'nav-logo-mark';
    logoMark.setAttribute('aria-hidden', 'true');

    // SVG 未就绪时的降级文案（就绪后被视觉隐藏，仅供读屏器）
    const logoText = document.createElement('span');
    logoText.className = 'logo-text';
    logoText.textContent = SITE_NAME;
    logo.append(logoMark, logoText);
    navbar.appendChild(logo);

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', '主导航');
    const navItems = document.createElement('div');
    navItems.className = 'nav-items';
    navItems.id = 'navbarNav';
    for (const { href, page, text } of NAV_LINKS) {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'nav-item';
      a.dataset.page = page;
      a.textContent = text;
      navItems.appendChild(a);
    }
    nav.appendChild(navItems);
    navbar.appendChild(nav);

    const actions = document.createElement('div');
    actions.className = 'nav-actions';

    const themeSwitch = document.createElement('label');
    themeSwitch.className = 'theme-switch';
    const themeInput = document.createElement('input');
    themeInput.type = 'checkbox';
    themeInput.id = 'theme-toggle-checkbox';
    themeInput.setAttribute('aria-label', '切换明暗主题');
    const slider = document.createElement('span');
    slider.className = 'slider';
    themeSwitch.append(themeInput, slider);

    const mobileToggle = document.createElement('div');
    mobileToggle.className = 'mobile-toggle';
    mobileToggle.setAttribute('role', 'button');
    mobileToggle.setAttribute('tabindex', '0');
    mobileToggle.setAttribute('aria-controls', 'navbarNav');
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.setAttribute('aria-label', '打开导航菜单');
    for (let i = 0; i < 3; i++) mobileToggle.appendChild(document.createElement('span'));

    actions.append(themeSwitch, mobileToggle);
    navbar.appendChild(actions);
    return navbar;
  }

  static ensureCSS(): void {
    if (document.querySelector(`link[href="${CSS_PATH}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_PATH;
    document.head.appendChild(link);
  }

  /* ================= 入场与滚动状态 ================= */

  playEntranceAnimation(): void {
    if (this.entrancePlayed || !this.elements.navbar) return;
    this.elements.navbar.classList.remove('initial');
    this.entrancePlayed = true;
  }

  /* ================= 品牌 LOGO ================= */

  /**
   * 挂载品牌 SVG（异步加载，挂载后保持隐藏）。
   * 幂等：多次调用只会触发一次挂载。
   */
  private mountLogo(): void {
    if (this.logoDraw) return;
    const mark = this.elements.navbar?.querySelector<HTMLElement>('.nav-logo-mark');
    if (!mark) return;

    const handle = mountBrandLogo(mark, { mode: 'manual' });
    this.logoDraw = handle;

    // SVG 就绪后再切到「LOGO 模式」（隐藏文字降级层）
    void handle.ready
      .then(() => this.elements.navbar?.classList.add('logo-ready'))
      .catch(() => {});

    this.stack.add(() => {
      this.logoDraw?.destroy();
      this.logoDraw = null;
      this.elements.navbar?.classList.remove('logo-ready');
    });
  }

  /** 加载覆盖层完全隐藏后：勾边（2s）→ 填充淡入 → 完整显示 */
  public playLogoDraw(): void {
    this.mountLogo();
    this.logoDraw?.play();
  }

  private onScroll = (): void => {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      this.elements.navbar?.classList.toggle(
        'scrolled',
        window.scrollY > SCROLL_THRESHOLD
      );
    });
  };

  private onResize = (): void => {
    if (this.resizeTicking) return;
    this.resizeTicking = true;
    requestAnimationFrame(() => {
      this.resizeTicking = false;
      this.refreshNavbarTitle();
    });
  };

  private bindShell(): void {
    this.stack.addEventListener(window, 'scroll', this.onScroll, { passive: true });
    this.stack.addEventListener(window, 'resize', this.onResize, { passive: true });
    this.observeMenuToggle();
    this.onScroll();
  }

  /** 移动菜单按钮：键盘可操作 + aria 状态同步 */
  private observeMenuToggle(): void {
    const toggle = this.elements.navbar?.querySelector('.mobile-toggle');
    if (!toggle) return;

    this.stack.addEventListener(toggle, 'keydown', ((event: KeyboardEvent) => {
      const { key } = event;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        (toggle as HTMLElement).click();
      }
    }) as EventListener);

    const observer = new MutationObserver(() => {
      const open = toggle.classList.contains('active');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    });
    observer.observe(toggle, { attributes: true, attributeFilter: ['class'] });
    this.stack.addObserver(observer);
  }

  /* ================= 标题替换 ================= */

  private createTitlePlaceholder(): void {
    const nav = this.elements.nav;
    if (!nav || this.elements.titlePlaceholder) return;

    const placeholder = document.createElement('div');
    placeholder.className = 'nav-title-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');

    const scroll = document.createElement('span');
    scroll.className = 'title-scroll-container';
    placeholder.appendChild(scroll);
    nav.appendChild(placeholder);

    this.elements.titlePlaceholder = placeholder;
    this.elements.titleScroll = scroll;

    const resizeObserver = new ResizeObserver(() => this.measureTitle());
    resizeObserver.observe(placeholder);
    this.stack.addObserver(resizeObserver);
    this.bindTitleHover();
  }

  private resolvePageTitle(): string {
    const h1 = document.querySelector<HTMLElement>('main h1, article h1, h1');
    const fromH1 = h1?.textContent?.trim() ?? '';
    if (fromH1) return fromH1;
    return document.title
      .replace(new RegExp(`\\s*[|｜–—-]\\s*${SITE_NAME}\\s*$`), '')
      .trim();
  }

  private enterTitleMode(title: string): void {
    const { navItems, nav } = this.elements;
    if (!navItems) return;

    if (!this.elements.titlePlaceholder || !this.elements.titleScroll) {
      this.createTitlePlaceholder();
    }
    const { titlePlaceholder, titleScroll } = this.elements;
    if (!titlePlaceholder || !titleScroll) return;

    if (titleScroll.textContent !== title) titleScroll.textContent = title;

    if (!this.titleMode) {
      this.titleMode = true;
      navItems.classList.add('title-mode-hidden');
      titlePlaceholder.classList.add('active');
      if (nav?.matches(':hover')) nav.classList.add('title-hovered');
    }
    this.measureTitle();
  }

  private exitTitleMode(): void {
    if (!this.titleMode) return;
    this.titleMode = false;
    window.clearTimeout(this.titleHoverTimer);
    this.elements.nav?.classList.remove('title-hovered');
    this.elements.navItems?.classList.remove('title-mode-hidden');
    this.elements.titlePlaceholder?.classList.remove('active', 'scrolling');
  }

  /** 标题超出容器 → 开启匀速 marquee，速度恒 ≈45px/s */
  private measureTitle(): void {
    const { titlePlaceholder, titleScroll } = this.elements;
    if (!titlePlaceholder || !titleScroll || !this.titleMode) return;

    const overflow = titleScroll.scrollWidth - titlePlaceholder.clientWidth;
    if (overflow > 8) {
      const distance = overflow + 48;
      const duration = Math.max(6, distance / 45);
      titlePlaceholder.style.setProperty('--scroll-distance', `-${distance}px`);
      titlePlaceholder.style.setProperty('--scroll-duration', `${duration.toFixed(1)}s`);
      titlePlaceholder.classList.add('scrolling');
    } else {
      titlePlaceholder.classList.remove('scrolling');
    }
  }

  /** 路由切换后刷新激活态与标题模式 */
  refreshNavbarTitle(): void {
    const { navItems } = this.elements;
    if (!navItems || !this.initialized) return;

    if (window.innerWidth <= DESKTOP_BREAKPOINT) {
      this.exitTitleMode();
      return;
    }
    if (navItems.querySelector('.nav-item.active')) {
      this.exitTitleMode();
      return;
    }
    const title = this.resolvePageTitle();
    if (title) this.enterTitleMode(title);
    else this.exitTitleMode();
  }

  /** 监听 .active 与 <title> 变化 → 自动进出标题模式 */
  private observeNavState(): void {
    const observer = new MutationObserver(() => this.refreshNavbarTitle());

    if (this.elements.navItems) {
      observer.observe(this.elements.navItems, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    const titleEl = document.querySelector('title');
    if (titleEl) {
      observer.observe(titleEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    this.stack.addObserver(observer);
  }

  /** 标题模式下悬停 nav 中部 → 唤回菜单；离开 300ms 后恢复标题 */
  private bindTitleHover(): void {
    const nav = this.elements.nav;
    if (!nav) return;

    this.stack.addEventListener(nav, 'mouseenter', () => {
      if (!this.titleMode) return;
      window.clearTimeout(this.titleHoverTimer);
      nav.classList.add('title-hovered');
    });

    this.stack.addEventListener(nav, 'mouseleave', () => {
      if (!this.titleMode) return;
      this.titleHoverTimer = window.setTimeout(() => {
        nav.classList.remove('title-hovered');
      }, 300);
    });
  }

  /* ================= 初始化入口 ================= */

  async initNavbar(placeholderId = 'navbar-placeholder'): Promise<void> {
    if (this.initialized) {
      this.refreshNavbarTitle();
      return;
    }

    NavbarManager.ensureCSS();

    let placeholder = document.getElementById(placeholderId);
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = placeholderId;
      document.body.prepend(placeholder);
    }

    let navbar = document.querySelector<HTMLElement>('.navbar');
    const fresh = !navbar;
    if (!navbar) {
      navbar = NavbarManager.createNavbarDOM();
      placeholder.appendChild(navbar);
    }

    this.elements = {
      navbar,
      nav: navbar.querySelector('nav'),
      navItems: navbar.querySelector('.nav-items'),
      placeholder,
      titlePlaceholder: null,
      titleScroll: null,
    };

    this.initialized = true;
    this.bindShell();
    this.observeNavState();

    initThemeToggle();
    initNavigation();
    initMobileMenuToggle();

    this.createTitlePlaceholder();
    this.mountLogo();

    if (fresh) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.playEntranceAnimation())
      );
    } else {
      this.entrancePlayed = true;
      navbar.classList.remove('initial');
    }

    this.refreshNavbarTitle();
  }

  /** 释放所有资源（一般只在测试或极端场景调用） */
  destroy(): void {
    this.stack.dispose();
    this.stack = new DisposableStack();
    window.clearTimeout(this.titleHoverTimer);
    this.initialized = false;
    this.entrancePlayed = false;
    this.titleMode = false;
  }
}

/* ================= 单例导出 ================= */

export const navbarManager = new NavbarManager();

export async function initNavbar(placeholderId?: string): Promise<NavbarManager> {
  await navbarManager.initNavbar(placeholderId);
  return navbarManager;
}

/** 手动刷新标题替换状态（一般用不到，内置 observer 自动处理） */
export function refreshNavbarTitle(): void {
  navbarManager.refreshNavbarTitle();
}

/* ================= 导航相关（自 router 迁入，消除循环依赖） ================= */

/** 高亮当前激活导航项 */
export function initNavigation(): void {
  const items = document.querySelectorAll<HTMLAnchorElement>('.nav-item[data-page]');
  const cur = Utils.getPageNameFromPath(location.pathname);
  items.forEach((el) => el.classList.toggle('active', el.dataset.page === cur));
}

let menuInit = false;

/** 移动端菜单开合（幂等） */
export function initMobileMenuToggle(): void {
  if (menuInit) return;
  menuInit = true;

  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.getElementById('navbarNav');

  const closeMenu = (): void => {
    nav?.classList.remove('active');
    toggle?.classList.remove('active');
  };

  document.addEventListener('click', (e) => {
    const t = e.target as Element;

    // 点击开关
    if (t.closest('.mobile-toggle')) {
      e.preventDefault();
      nav?.classList.toggle('active');
      toggle?.classList.toggle('active');
      return;
    }

    // 点击菜单项关闭
    if (t.closest('.nav-item') && nav?.classList.contains('active')) {
      closeMenu();
      return;
    }

    // 点击遮罩或外部关闭
    if (nav?.classList.contains('active') && !t.closest('.nav-items')) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (innerWidth > DESKTOP_BREAKPOINT) closeMenu();
  });

  onNavigation(closeMenu);
}