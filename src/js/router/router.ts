// /js/router/router.ts
// 现代高性能无刷新导航：优化版SPA路由系统

import { CONFIG, storageController, Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';
import { initThemeToggle } from '/js/ui/theme.js';
import type { PageManager } from '/js/core/page-manager.js';

// ==================== 性能优化常量 ====================
const ROUTER_VIEW_ID = 'router-view';
const TRANSITION_DURATION = 300;
const MAX_CACHE_SIZE = 50;

// 全局状态管理
interface RouterState {
  currentPageManager: PageManager | null;
  loadedStyles: Set<string>;
  loadedScripts: Set<string>;
  pageCache: Map<string, PageCacheEntry>;
  pendingRequests: Map<string, Promise<PageResponse>>;
}

interface PageCacheEntry {
  content: ExtractedContent;
  timestamp: number;
  dependencies: string[];
}

interface PageResponse {
  html: string;
  url: string;
}

interface ExtractedContent {
  title: string;
  mainHtml: string;
  styles: (HTMLLinkElement | HTMLStyleElement)[];
  scripts: HTMLScriptElement[];
  navbarHtml: string;
  footerHtml: string;
  pageName: string;
}

// 全局路由器状态
const routerState: RouterState = {
  currentPageManager: null,
  loadedStyles: new Set(),
  loadedScripts: new Set(),
  pageCache: new Map(),
  pendingRequests: new Map()
};

// ==================== 缓存管理 ====================
class CacheManager {
  static cleanExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    for (const [key, entry] of routerState.pageCache.entries()) {
      if (now - entry.timestamp > 10 * 60 * 1000) expiredKeys.push(key);
    }
    expiredKeys.forEach(key => routerState.pageCache.delete(key));
  }

  static evictOldestEntries(): void {
    if (routerState.pageCache.size <= MAX_CACHE_SIZE) return;
    const entries = Array.from(routerState.pageCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (entries.length > MAX_CACHE_SIZE * 0.8) {
      const [key] = entries.shift()!;
      routerState.pageCache.delete(key);
    }
  }

  static async set(key: string, content: ExtractedContent): Promise<void> {
    this.cleanExpiredEntries();
    this.evictOldestEntries();
    const dependencies = [
      ...content.styles.map(s => s.getAttribute('href') || ''),
      ...content.scripts.map(s => s.src || '')
    ].filter(Boolean) as string[];
    routerState.pageCache.set(key, {
      content,
      timestamp: Date.now(),
      dependencies
    });
  }

  static get(key: string): ExtractedContent | null {
    const entry = routerState.pageCache.get(key);
    if (!entry) return null;
    routerState.pageCache.delete(key);
    entry.timestamp = Date.now();
    routerState.pageCache.set(key, entry);
    return entry.content;
  }
}

// ==================== 异步资源加载器 ====================
class ResourceLoader {
  static async loadStyles(styles: (HTMLLinkElement | HTMLStyleElement)[]): Promise<void> {
    const promises = styles.map(async (style) => {
      if (style.tagName.toLowerCase() === 'link') {
        const href = style.getAttribute('href') || (style as HTMLLinkElement).href;
        if (!href || routerState.loadedStyles.has(href)) return;
        const exists = document.querySelector(`link[href="${href}"]`);
        if (exists) {
          routerState.loadedStyles.add(href);
          return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        routerState.loadedStyles.add(href);
        return new Promise((resolve) => {
          link.onload = resolve;
          link.onerror = resolve;
        });
      } else {
        const text = (style.textContent || '').trim();
        if (!text) return;
        const styleId = `injected-style-${Math.random().toString(36).substr(2, 9)}`;
        if (document.getElementById(styleId)) return;
        const newStyle = document.createElement('style');
        newStyle.id = styleId;
        newStyle.textContent = text;
        document.head.appendChild(newStyle);
      }
    });
    await Promise.all(promises);
  }

  static async loadScripts(scripts: HTMLScriptElement[]): Promise<void> {
    for (const script of scripts) {
      if (script.src) {
        const src = script.getAttribute('src') || script.src;
        if (!src || routerState.loadedScripts.has(src)) continue;
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          routerState.loadedScripts.add(src);
          continue;
        }
        await this.loadExternalScript(src, script.type || '');
        routerState.loadedScripts.add(src);
      } else {
        this.runInlineScript(script);
      }
    }
  }

  private static loadExternalScript(src: string, type: string): Promise<void> {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      if (type) script.type = type;
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => {
        console.warn(`[Router] 脚本加载失败: ${src}`);
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  private static runInlineScript(script: HTMLScriptElement): void {
    try {
      const inline = document.createElement('script');
      if (script.type) inline.type = script.type;
      inline.textContent = script.textContent || '';
      const temp = document.createElement('div');
      temp.appendChild(inline);
      document.head.appendChild(temp);
      temp.remove();
    } catch (e) {
      console.error('[Router] 内联脚本执行失败:', e);
    }
  }
}

// ==================== 页面管理器生命周期 ====================
async function destroyCurrentPageManager(): Promise<void> {
  if (routerState.currentPageManager && typeof routerState.currentPageManager.destroy === 'function') {
    try {
      await routerState.currentPageManager.destroy();
    } catch (e) {
      console.warn('[Router] 销毁页面管理器时发生异常:', e);
    }
  }
  routerState.currentPageManager = null;
  (window as any).__currentPageManager = null;
}

function setCurrentPageManager(manager: PageManager | null): void {
  routerState.currentPageManager = manager;
  (window as any).__currentPageManager = manager;
}

// ==================== 页面内容提取 ====================
function extractPageContent(htmlText: string, url: string): ExtractedContent {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const title = doc.querySelector('title')?.textContent || document.title;
  const routerView = doc.querySelector(`#${ROUTER_VIEW_ID}`);
  const mainHtml = routerView ? routerView.outerHTML : '';
  const styles = Array.from(doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
    'head link[rel="stylesheet"], head style'
  ));
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('body script'));
  const navbarHtml = doc.getElementById('navbar-placeholder')?.innerHTML || '';
  const footerHtml = doc.getElementById('footer-placeholder')?.innerHTML || '';
  const pathname = new URL(url, window.location.href).pathname;
  const pageName = getPageNameFromPath(pathname);
  return { title, mainHtml, styles, scripts, navbarHtml, footerHtml, pageName };
}

// ==================== 高性能内容替换 ====================
function replaceMainContent(mainHtml: string): Promise<boolean> {
  const currentRouterView = document.getElementById(ROUTER_VIEW_ID);
  if (!currentRouterView || !mainHtml) return Promise.resolve(false);
  const newContainer = document.createElement('div');
  newContainer.innerHTML = mainHtml;
  const newRouterView = newContainer.querySelector(`#${ROUTER_VIEW_ID}`);
  if (!newRouterView) {
    console.warn('[Router] 新页面缺少 #router-view，无法替换');
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    currentRouterView.classList.add('page-transition-exit');
    const onExitComplete = () => {
      currentRouterView.removeEventListener('transitionend', onExitComplete);
      currentRouterView.replaceWith(newRouterView);
      newRouterView.classList.add('page-transition-enter');
      const onEnterComplete = () => {
        newRouterView.removeEventListener('transitionend', onEnterComplete);
        newRouterView.classList.remove('page-transition-enter');
        resolve(true);
      };
      newRouterView.addEventListener('transitionend', onEnterComplete);
      setTimeout(() => {
        if (newRouterView.classList.contains('page-transition-enter')) {
          newRouterView.classList.remove('page-transition-enter');
          resolve(true);
        }
      }, TRANSITION_DURATION * 1.5);
    };
    currentRouterView.addEventListener('transitionend', onExitComplete);
    setTimeout(() => {
      if (currentRouterView.parentNode) {
        currentRouterView.replaceWith(newRouterView);
        newRouterView.classList.add('page-transition-enter');
        setTimeout(() => {
          newRouterView.classList.remove('page-transition-enter');
          resolve(true);
        }, TRANSITION_DURATION);
      }
    }, TRANSITION_DURATION * 1.5);
  });
}

// ==================== 组件初始化工厂 ====================
class ComponentFactory {
  static async initPageManager(pageName: string, isArticlePage: boolean, url: string): Promise<PageManager | null> {
    switch (pageName) {
      case 'index':
        return initHomePage() as any;
      case 'articles':
      case 'works': {
        const refreshCallback = () => {
          if ((window as any).scrollRevealInstance) {
            (window as any).scrollRevealInstance.refresh();
          } else {
            ensureScrollReveal();
            if ((window as any).scrollRevealInstance) {
              (window as any).scrollRevealInstance.refresh();
            }
          }
        };
        const { initSearchPage } = await import('/js/pages/search-render.js');
        return await initSearchPage(pageName as 'works' | 'articles', refreshCallback) as any;
      }
      case 'archive': {
        const archiveRefreshCallback = () => {
          if ((window as any).scrollRevealInstance) {
            (window as any).scrollRevealInstance.refresh();
          } else {
            ensureScrollReveal();
            if ((window as any).scrollRevealInstance) {
              (window as any).scrollRevealInstance.refresh();
            }
          }
        };
        const { initArchivePage } = await import('/js/pages/archive.js');
        return await initArchivePage(archiveRefreshCallback) as any;
      }
      case 'article-detail':
      case 'article':
        if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
          const { initArticlePage } = await import('/js/pages/article.js');
          return await initArticlePage() as any;
        }
        break;
      case 'stats': {
        const { initStatsPage } = await import('/js/pages/stats-init.js');
        return await initStatsPage() as any;
      }
      case 'friends': {
        const { initFriendsPage } = await import('/js/pages/friends-manager.js');
        return await initFriendsPage() as any;
      }
      case 'about': {
        const { initAboutPage } = await import('/js/pages/about.js');
        const manager: PageManager = {
          init: initAboutPage,
          destroy: () => {}
        };
        await manager.init();
        return manager;
      }
      case 'contact': {
        const { initTwikoo } = await import('/js/core/twikoo-manager.js');
        const container = document.querySelector('#twikoo-comments');
        if (container) {
          await initTwikoo(container);
        }
        return {
          init: () => {},
          destroy: () => {
            const { resetTwikooContainer } = import('/js/core/twikoo-manager.js');
            const container = document.querySelector('#twikoo-comments');
            if (container) resetTwikooContainer(container);
          }
        } as PageManager;
      }
    }
    return null;
  }
}

// ==================== 主导航函数 ====================
export async function fetchAndReplaceContent(
  url: string,
  pushState = true,
  scrollData: { scrollX?: number; scrollY?: number } | null = null
): Promise<boolean> {
  try {
    if (routerState.pendingRequests.has(url)) {
      await routerState.pendingRequests.get(url);
    }
    const cachedContent = CacheManager.get(url);
    if (cachedContent) {
      return await processPageContent(cachedContent, url, pushState, scrollData);
    }
    const requestPromise = fetchPageContent(url);
    routerState.pendingRequests.set(url, requestPromise);
    try {
      const response = await requestPromise;
      const extractedContent = extractPageContent(response.html, url);
      await CacheManager.set(url, extractedContent);
      return await processPageContent(extractedContent, url, pushState, scrollData);
    } finally {
      routerState.pendingRequests.delete(url);
    }
  } catch (e) {
    console.error('[ERROR] 无刷新导航失败:', e);
    await destroyCurrentPageManager();
    return false;
  }
}

async function fetchPageContent(url: string): Promise<PageResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      credentials: 'same-origin',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status} ${res.statusText}`);
    const html = await res.text();
    return { html, url };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function processPageContent(
  content: ExtractedContent,
  url: string,
  pushState: boolean,
  scrollData: { scrollX?: number; scrollY?: number } | null
): Promise<boolean> {
  // 1. 销毁当前页面管理器
  await destroyCurrentPageManager();

  // 2. 保存当前滚动位置
  if (pushState) {
    const currentScroll = { scrollX: window.scrollX, scrollY: window.scrollY };
    history.replaceState({ ...history.state, scroll: currentScroll }, document.title, window.location.href);
  }

  // 3. 替换主内容
  await replaceMainContent(content.mainHtml);

  // 4. 更新标题和历史记录
  document.title = content.title;
  if (pushState) {
    const newScroll = scrollData || { scrollX: 0, scrollY: 0 };
    window.history.pushState({ ...history.state, scroll: newScroll }, content.title, url);
  } else {
    if (scrollData) {
      window.scrollTo(scrollData.scrollX || 0, scrollData.scrollY || 0);
    } else {
      const stateScroll = (history.state as any)?.scroll;
      if (stateScroll) {
        window.scrollTo(stateScroll.scrollX || 0, stateScroll.scrollY || 0);
      }
    }
  }

  // 5. 更新导航栏：标题占位 + 高亮
  refreshNavbarTitle();
  // 高亮更新（由 initNavigation 处理）
  // 导航栏的 initNavigation 已在 navbar-manager 的 rebindDynamicComponents 中绑定，
  // 但无刷新导航后需要重新执行高亮，所以我们在外部调用一次 initNavigation。
  // 导入 initNavigation 用于高亮更新
  const { initNavigation } = await import('/js/router/router.js');
  initNavigation();

  // 6. 加载样式和脚本
  await ResourceLoader.loadStyles(content.styles);
  await ResourceLoader.loadScripts(content.scripts);

  // 7. 初始化页面管理器
  const isArticlePage = !!document.querySelector('.article-page-container') || !!document.getElementById('articleBody');
  const manager = await ComponentFactory.initPageManager(content.pageName, isArticlePage, url);
  if (manager) setCurrentPageManager(manager);

  // 8. 处理滚动效果
  if ((window as any).scrollRevealInstance) {
    (window as any).scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
    if ((window as any).scrollRevealInstance) {
      (window as any).scrollRevealInstance.refresh();
    }
  }

  // 9. 处理锚点滚动
  if (!pushState && !scrollData && !(history.state as any)?.scroll) {
    const targetUrl = new URL(url, window.location.href);
    if (targetUrl.hash) {
      const element = document.getElementById(targetUrl.hash.slice(1));
      if (element) {
        setTimeout(() => element.scrollIntoView({ behavior: 'smooth' }), 0);
      }
    } else {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    }
  }

  // 10. 触发导航事件
  window.dispatchEvent(new CustomEvent('ajax:navigation', {
    detail: { url, page: content.pageName }
  }));

  return true;
}

// ==================== 公共API ====================
export function enableAjaxNavigation(): void {
  document.addEventListener('click', function (e) {
    const anchor = (e.target as Element).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (
      anchor.target === '_blank' ||
      anchor.hasAttribute('download') ||
      href.startsWith('#') ||
      anchor.hasAttribute('data-no-ajax') ||
      !isSameOrigin(href)
    ) return;
    const isHtml = href.endsWith('.html') || href.includes('?') || href.endsWith('/');
    if (!isHtml) return;
    e.preventDefault();
    const fullUrl = new URL(href, window.location.href).href;
    if (fullUrl === window.location.href) return;
    fetchAndReplaceContent(fullUrl, true);
  });
}

export async function initPageFeatures(pageName: string): Promise<any> {
  const manager = await ComponentFactory.initPageManager(pageName, false, window.location.href);
  if (manager && typeof manager.init === 'function' && !(manager as any)._initialized) {
    await manager.init();
    (manager as any)._initialized = true;
  }
  return manager;
}

// ==================== 导航栏与页脚管理 ====================
export async function loadNavbar(): Promise<any> {
  return await initNavbar();
}

export function refreshNavbarAfterNavigation(): void {
  refreshNavbarTitle();
}

export async function loadFooter(): Promise<void> {
  try {
    const response = await fetch('/footer.html');
    if (!response.ok) throw new Error('加载页脚失败');
    const footerHTML = await response.text();
    const placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return;
    placeholder.innerHTML = footerHTML;
  } catch (error) {
    console.error('[ERROR] 加载页脚错误:', error);
  }
}

// ==================== 移动端菜单管理 ====================
let mobileToggleInitialized = false;
export function initMobileMenuToggle(): void {
  if (mobileToggleInitialized) return;
  mobileToggleInitialized = true;
  const getNav = () => document.getElementById('navbarNav');
  const getToggle = () => document.querySelector('.mobile-toggle');
  const closeMenu = () => {
    const nav = getNav();
    const toggle = getToggle();
    if (nav && nav.classList.contains('active')) {
      nav.classList.remove('active');
      if (toggle) toggle.classList.remove('active');
    }
  };
  document.addEventListener('click', (e) => {
    const toggle = (e.target as Element).closest('.mobile-toggle');
    const nav = getNav();
    if (!nav) return;
    if (toggle) {
      e.preventDefault();
      const isActive = nav.classList.contains('active');
      nav.classList.toggle('active', !isActive);
      if (getToggle()) getToggle()!.classList.toggle('active', !isActive);
      return;
    }
    const isNavItem = (e.target as Element).closest('.nav-item');
    if (isNavItem && nav.classList.contains('active')) {
      closeMenu();
      return;
    }
    if (nav.classList.contains('active')) {
      const isInsideNav = (e.target as Element).closest('.nav-items');
      if (!isInsideNav) closeMenu();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      const nav = getNav();
      const toggle = getToggle();
      if (nav && nav.classList.contains('active')) {
        nav.classList.remove('active');
        if (toggle) toggle.classList.remove('active');
      }
    }
  });
  window.addEventListener('ajax:navigation', () => {
    const nav = getNav();
    const toggle = getToggle();
    if (nav && nav.classList.contains('active')) {
      nav.classList.remove('active');
      if (toggle) toggle.classList.remove('active');
    }
  });
}

// ==================== 导航链接绑定（已弃用，保留空函数以防兼容） ====================
export function bindNavLinks(): void {
  // 不再绑定导航点击，全局监听已处理
  // 仅保留该函数以避免破坏现有调用
  console.debug('[Router] bindNavLinks 已弃用，导航由全局点击监听处理');
}

// ==================== 导航高亮 ====================
export function initNavigation(): void {
  const navItems = document.querySelectorAll<HTMLAnchorElement>('.nav-item[data-page]');
  const urlParams = new URLSearchParams(window.location.search);
  let currentPage = urlParams.get('page');
  if (!currentPage) {
    currentPage = getPageNameFromPath(window.location.pathname);
  }
  navItems.forEach(item => {
    const page = item.dataset.page;
    if (page === currentPage) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// ==================== 浏览器历史管理 ====================
let popstateInitialized = false;
export function initPopstate(): void {
  if (popstateInitialized) return;
  popstateInitialized = true;
  window.addEventListener('popstate', (event) => {
    const scrollData = (event.state as any)?.scroll ?? null;
    fetchAndReplaceContent(window.location.href, false, scrollData);
  });
}

// ==================== 性能监控 ====================
export function getRouterStats(): Record<string, any> {
  return {
    cacheSize: routerState.pageCache.size,
    loadedStyles: routerState.loadedStyles.size,
    loadedScripts: routerState.loadedScripts.size,
    activePageManager: !!routerState.currentPageManager,
    pendingRequests: routerState.pendingRequests.size
  };
}