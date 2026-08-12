// /js/ui/navbar-manager.ts
// 职责：DOM 生成、入场动画、标题替换、滚动状态、移动菜单无障碍、SPA 复用

import { initThemeToggle } from '/js/ui/theme.js';
import { initMobileMenuToggle, initNavigation } from '/js/router/router.js';

const SITE_NAME = 'GaoXinYang';
const CSS_PATH = '/css/components/navbar.css';
const SCROLL_THRESHOLD = 24;
const DESKTOP_BREAKPOINT = 768;

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

class NavbarManager {
  private initialized = false;
  private entrancePlayed = false;
  private shellBound = false;
  private titleMode = false;
  private scrollTicking = false;
  private resizeObserver: ResizeObserver | null = null;
  private menuObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private resizeTicking = false;
  private titleHoverTimer: number | undefined;

  private elements: NavbarElements = {
    navbar: null, nav: null, navItems: null,
    placeholder: null, titlePlaceholder: null, titleScroll: null,
  };

  /* ================= DOM 生成 ================= */

  static createNavbarDOM(): HTMLElement {
    const navbar = document.createElement('div');
    navbar.className = 'navbar initial';

    // Logo（可点击回首页，走 SPA 导航）
    const logo = document.createElement('a');
    logo.href = '/';
    logo.className = 'nav-logo';
    logo.setAttribute('aria-label', '返回首页');
    const logoText = document.createElement('span');
    logoText.className = 'logo-text';
    logoText.textContent = SITE_NAME;
    logo.appendChild(logoText);
    navbar.appendChild(logo);

    // 导航菜单
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

    // 右侧操作区：主题切换 + 移动菜单按钮
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

  private bindShell(): void {
    if (this.shellBound) return;
    this.shellBound = true;
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    this.observeMenuToggle();
    this.onScroll(); // 同步初始状态
  }

  private unbindShell(): void {
    window.removeEventListener('scroll', this.onScroll);
    this.menuObserver?.disconnect();
    this.menuObserver = null;
    this.shellBound = false;
  }

  /** 移动菜单按钮：键盘可操作 + aria 状态同步 */
  private observeMenuToggle(): void {
    const toggle = this.elements.navbar?.querySelector('.mobile-toggle');
    if (!toggle) return;

    toggle.addEventListener('keydown', (event) => {
      const { key } = event as KeyboardEvent;
      if (key === 'Enter' || key === ' ') {
        (event as KeyboardEvent).preventDefault();
        (toggle as HTMLElement).click(); // 冒泡到 router 的委托处理器
      }
    });

    this.menuObserver = new MutationObserver(() => {
      const open = toggle.classList.contains('active');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    });
    this.menuObserver.observe(toggle, { attributes: true, attributeFilter: ['class'] });
  }

  /* ================= 标题替换（桌面无激活项时，导航中央显示页面标题） ================= */

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

    // 容器宽度变化（窗口缩放 / 字体加载）→ 重算溢出与滚动时长
    this.resizeObserver = new ResizeObserver(() => this.measureTitle());
    this.resizeObserver.observe(placeholder);
    this.bindTitleHover();
  }

  /** 读取当前页标题：优先页内 <h1>，其次 document.title（剥掉站点名后缀） */
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
      // SPA 跳转时鼠标可能仍停留在 nav 上 → 直接进入唤回态，避免闪一下标题
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
    const { titlePlaceholder } = this.elements;
    titlePlaceholder?.classList.remove('active', 'scrolling');
  }

  /** 标题超出容器 → 开启匀速滚动（marquee），速度恒定 ≈45px/s，悬停暂停（CSS 已处理） */
  private measureTitle(): void {
    const { titlePlaceholder, titleScroll } = this.elements;
    if (!titlePlaceholder || !titleScroll || !this.titleMode) return;

    const overflow = titleScroll.scrollWidth - titlePlaceholder.clientWidth;
    if (overflow > 8) {
      const distance = overflow + 48;                 // 首尾留 48px 呼吸
      const duration = Math.max(6, distance / 45);
      titlePlaceholder.style.setProperty('--scroll-distance', `-${distance}px`);
      titlePlaceholder.style.setProperty('--scroll-duration', `${duration.toFixed(1)}s`);
      titlePlaceholder.classList.add('scrolling');
    } else {
      titlePlaceholder.classList.remove('scrolling');
    }
  }

  /** 路由切换后刷新激活态与标题模式（内置 observer 也会自动触发，通常无需手动调用） */
  refreshNavbarTitle(): void {
    const { navItems } = this.elements;
    if (!navItems || !this.initialized) return;

    // 移动端不做标题替换，菜单入口必须始终可见
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
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

  /** 监听 .active 与 <title> 变化 → router.ts 零改动也能自动联动 */
  private observeNavState(): void {
    this.titleObserver?.disconnect();
    this.titleObserver = new MutationObserver(() => this.refreshNavbarTitle());

    // router.initNavigation 切换 .active → 自动进出标题模式
    if (this.elements.navItems) {
      this.titleObserver.observe(this.elements.navItems, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    // SPA 更新 document.title → 同步占位标题文本
    const titleEl = document.querySelector('title');
    if (titleEl) {
      this.titleObserver.observe(titleEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  private onResize = (): void => {
    if (this.resizeTicking) return;
    this.resizeTicking = true;
    requestAnimationFrame(() => {
      this.resizeTicking = false;
      this.refreshNavbarTitle();
    });
  };

  /** 标题模式下悬停 nav 中部 → 唤回菜单；离开 300ms 后恢复标题 */
  private bindTitleHover(): void {
    const nav = this.elements.nav;
    if (!nav) return;

    nav.addEventListener('mouseenter', () => {
      if (!this.titleMode) return;
      window.clearTimeout(this.titleHoverTimer);
      nav.classList.add('title-hovered');
    });

    nav.addEventListener('mouseleave', () => {
      if (!this.titleMode) return;
      this.titleHoverTimer = window.setTimeout(() => {
        nav.classList.remove('title-hovered');
      }, 300);
    });
  }

  /* ================= 初始化入口 ================= */

  async initNavbar(placeholderId = 'navbar-placeholder'): Promise<void> {
    // SPA 中重复调用：幂等，仅刷新标题模式
    if (this.initialized) {
      this.refreshNavbarTitle();
      return;
    }

    NavbarManager.ensureCSS();

    // 挂载点：复用已有 placeholder，否则自动创建于 body 顶部
    let placeholder = document.getElementById(placeholderId);
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = placeholderId;
      document.body.prepend(placeholder);
    }

    // 若页面已有静态 navbar（渐进增强 / 首屏 SSR），直接复用
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

    // theme.ts / router.ts 契约不变，均为幂等初始化
    initThemeToggle();
    initNavigation();
    initMobileMenuToggle();

    this.createTitlePlaceholder();

    // 入场动画：双 rAF 确保 .initial 已提交渲染，移除后 CSS animation 必然触发
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
}

/* ================= 单例导出 ================= */

export const navbarManager = new NavbarManager();

/** 挂载导航栏（幂等，SPA 中可安全重复调用） */
export function initNavbar(placeholderId?: string): Promise<void> {
  return navbarManager.initNavbar(placeholderId);
}

/** 手动刷新标题替换状态（一般用不到，内置 observer 自动处理） */
export function refreshNavbarTitle(): void {
  navbarManager.refreshNavbarTitle();
}