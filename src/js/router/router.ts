// /js/router/router.ts
// 无刷新导航（优化版：资源清理、错误恢复、性能增强）

import { CONFIG } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal, refreshScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';
import type { PageManager } from '/js/core/page-manager.js';
import { LazyImageLoader } from '/js/ui/image-manager.js';
import { friendLinkManager, initFriendsPage } from '/js/pages/friends-manager.js';

// ==================== 常量 ====================
const ROUTER_VIEW_ID = 'router-view';
const TRANSITION_DURATION = 300;
const MAX_CACHE_SIZE = 50;
const IDLE_TIMEOUT = 10000; // 请求超时（毫秒）
const RETRY_LIMIT = 2;      // 最大重试次数

// ==================== 类型 ====================
interface PageCacheEntry {
  content: ExtractedContent;
  timestamp: number;
}

interface ExtractedContent {
  title: string;
  mainHtml: string;
  styles: (HTMLLinkElement | HTMLStyleElement)[];
  scripts: HTMLScriptElement[];
  pageName: string;
  /** 用于清理的标记ID */
  styleIds: string[];
  scriptIds: string[];
}

interface PageResponse {
  html: string;
  url: string;
}

type PageManagerFactory = (refreshFn: () => void) => Promise<PageManager>;

// ==================== 状态（显式类型） ====================
interface RouterState {
  currentManager: PageManager | null;
  currentResources: { styleIds: string[]; scriptIds: string[] };
  loadedStyles: Set<string>;
  loadedScripts: Set<string>;
  cache: Map<string, PageCacheEntry>;
  pending: Map<string, Promise<PageResponse>>;
  navigationAborted: boolean;
}

const state: RouterState = {
  currentManager: null,
  currentResources: { styleIds: [], scriptIds: [] },
  loadedStyles: new Set<string>(),
  loadedScripts: new Set<string>(),
  cache: new Map<string, PageCacheEntry>(),
  pending: new Map<string, Promise<PageResponse>>(),
  navigationAborted: false,
};

// ==================== 页面管理器注册表 ====================
class PageManagerRegistry {
  private static factories = new Map<string, PageManagerFactory>();

  static register(pageName: string, factory: PageManagerFactory): void {
    this.factories.set(pageName, factory);
  }

  static async create(pageName: string, refreshFn: () => void): Promise<PageManager | null> {
    const factory = this.factories.get(pageName);
    if (!factory) return null;
    const manager = await factory(refreshFn);
    if (manager && typeof manager.init === 'function' && !(manager as any)._initialized) {
      await manager.init();
      (manager as any)._initialized = true;
    }
    return manager;
  }

  static has(pageName: string): boolean {
    return this.factories.has(pageName);
  }
}

// 导出注册函数供外部使用
export function registerPageManager(pageName: string, factory: PageManagerFactory): void {
  PageManagerRegistry.register(pageName, factory);
}

// ==================== 缓存工具 ====================
const cache = {
  get(key: string): ExtractedContent | null {
    const entry = state.cache.get(key);
    if (!entry) return null;
    // LRU 更新
    state.cache.delete(key);
    entry.timestamp = Date.now();
    state.cache.set(key, entry);
    return entry.content;
  },
  set(key: string, content: ExtractedContent): void {
    const now = Date.now();
    // 清理过期（10分钟）
    for (const [k, v] of state.cache) {
      if (now - v.timestamp > 600_000) state.cache.delete(k);
    }
    // 淘汰旧条目
    if (state.cache.size >= MAX_CACHE_SIZE) {
      const oldest = [...state.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) state.cache.delete(oldest[0]);
    }
    state.cache.set(key, { content, timestamp: now });
  },
};

// ==================== 资源加载与卸载 ====================
let currentAbortController: AbortController | null = null;

const resourceLoader = {
  /** 加载样式，返回注入的ID列表 */
  async loadStyles(styles: (HTMLLinkElement | HTMLStyleElement)[]): Promise<string[]> {
    const injectedIds: string[] = [];
    const promises = styles.map(async (style) => {
      if (style.tagName === 'LINK') {
        const href = style.getAttribute('href') || (style as HTMLLinkElement).href;
        if (!href || state.loadedStyles.has(href)) return;
        if (document.querySelector(`link[href="${href}"]`)) {
          state.loadedStyles.add(href);
          return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        const id = `style-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        link.dataset.routerStyle = id;
        document.head.appendChild(link);
        state.loadedStyles.add(href);
        injectedIds.push(id);
        await new Promise(r => { link.onload = r; link.onerror = r; });
      } else {
        const text = (style.textContent || '').trim();
        if (!text) return;
        const id = `injected-style-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        if (document.getElementById(id)) return;
        const newStyle = document.createElement('style');
        newStyle.id = id;
        newStyle.dataset.routerStyle = id;
        newStyle.textContent = text;
        document.head.appendChild(newStyle);
        injectedIds.push(id);
      }
    });
    await Promise.all(promises);
    return injectedIds;
  },

  /** 加载脚本，返回注入的ID列表 */
  async loadScripts(scripts: HTMLScriptElement[]): Promise<string[]> {
    const injectedIds: string[] = [];
    for (const script of scripts) {
      if (script.src) {
        const src = script.getAttribute('src') || script.src;
        if (!src || state.loadedScripts.has(src)) continue;
        if (document.querySelector(`script[src="${src}"]`)) {
          state.loadedScripts.add(src);
          continue;
        }
        await new Promise<void>((resolve) => {
          const el = document.createElement('script');
          if (script.type) el.type = script.type;
          el.src = src;
          el.async = false;
          const id = `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          el.dataset.routerScript = id;
          el.onload = () => resolve();
          el.onerror = () => { console.warn('[Router] 脚本加载失败:', src); resolve(); };
          document.head.appendChild(el);
          injectedIds.push(id);
          state.loadedScripts.add(src);
        });
      } else {
        // 内联脚本：通过临时容器执行（不注入head）
        try {
          const inline = document.createElement('script');
          if (script.type) inline.type = script.type;
          inline.textContent = script.textContent || '';
          const id = `inline-script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          inline.dataset.routerScript = id;
          const temp = document.createElement('div');
          temp.appendChild(inline);
          document.head.appendChild(temp);
          temp.remove();
          injectedIds.push(id);
        } catch (e) { console.error('[Router] 内联脚本执行失败:', e); }
      }
    }
    return injectedIds;
  },

  /** 卸载指定ID的资源，并清理去重集合中的对应URL */
  unloadResources(styleIds: string[], scriptIds: string[]): void {
    // 移除样式
    styleIds.forEach(id => {
      const el = document.querySelector(`[data-router-style="${id}"]`) as HTMLElement;
      if (el) {
        if (el.tagName === 'LINK') {
          const href = el.getAttribute('href');
          if (href) state.loadedStyles.delete(href);
        }
        el.remove();
      }
      const byId = document.getElementById(id);
      if (byId && byId.tagName === 'STYLE') {
        byId.remove();
      }
    });

    // 移除脚本（仅限外部，内联已随temp移除）
    scriptIds.forEach(id => {
      const el = document.querySelector(`[data-router-script="${id}"]`) as HTMLElement;
      if (el) {
        if (el.tagName === 'SCRIPT' && el.hasAttribute('src')) {
          const src = el.getAttribute('src');
          if (src) state.loadedScripts.delete(src);
        }
        el.remove();
      }
    });
  },
};

// ==================== 页面内容提取 ====================
function extractPageContent(html: string, url: string): ExtractedContent {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const routerView = doc.querySelector(`#${ROUTER_VIEW_ID}`);
  const mainHtml = routerView?.outerHTML || '';
  const styles = Array.from(doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
    'head link[rel="stylesheet"], head style'
  ));
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('body script'));
  const pageName = getPageNameFromPath(new URL(url, location.href).pathname);
  return {
    title: doc.querySelector('title')?.textContent || document.title,
    mainHtml,
    styles,
    scripts,
    pageName,
    styleIds: [],
    scriptIds: [],
  };
}

// ==================== 内容替换（过渡动画） ====================
function replaceContent(mainHtml: string): Promise<boolean> {
  const current = document.getElementById(ROUTER_VIEW_ID);
  if (!current || !mainHtml) return Promise.resolve(false);
  const temp = document.createElement('div');
  temp.innerHTML = mainHtml;
  const newView = temp.querySelector(`#${ROUTER_VIEW_ID}`);
  if (!newView) return Promise.resolve(false);

  return new Promise((resolve) => {
    current.classList.add('page-transition-exit');
    const onExit = () => {
      current.removeEventListener('transitionend', onExit);
      current.replaceWith(newView);
      newView.classList.add('page-transition-enter');
      const onEnter = () => {
        newView.removeEventListener('transitionend', onEnter);
        newView.classList.remove('page-transition-enter');
        resolve(true);
      };
      newView.addEventListener('transitionend', onEnter);
      setTimeout(() => {
        if (newView.classList.contains('page-transition-enter')) {
          newView.classList.remove('page-transition-enter');
          resolve(true);
        }
      }, TRANSITION_DURATION * 1.5);
    };
    current.addEventListener('transitionend', onExit);
    setTimeout(() => {
      if (current.parentNode) {
        current.replaceWith(newView);
        newView.classList.add('page-transition-enter');
        setTimeout(() => {
          newView.classList.remove('page-transition-enter');
          resolve(true);
        }, TRANSITION_DURATION);
      }
    }, TRANSITION_DURATION * 1.5);
  });
}

// ==================== 页面管理器工厂（默认注册） ====================
function registerDefaultPages(): void {
  PageManagerRegistry.register('index', async () => {
    const manager = initHomePage() as any;
    return manager;
  });
  PageManagerRegistry.register('articles', async (refreshFn) => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('articles', refreshFn) as any;
  });
  PageManagerRegistry.register('works', async (refreshFn) => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('works', refreshFn) as any;
  });
  PageManagerRegistry.register('archive', async (refreshFn) => {
    const { initArchivePage } = await import('/js/pages/archive.js');
    return initArchivePage(refreshFn) as any;
  });
  PageManagerRegistry.register('stats', async () => {
    const { initStatsPage } = await import('/js/pages/stats-init.js');
    return initStatsPage() as any;
  });
  PageManagerRegistry.register('friends', async () => {
    // 如果已初始化则先销毁，避免事件重复绑定
    if ((friendLinkManager as any)._initialized) {
      friendLinkManager.destroy();
    }
    await friendLinkManager.init();
    return friendLinkManager;
  });
  PageManagerRegistry.register('about', async () => {
    const { initAboutPage } = await import('/js/pages/about.js');
    const manager: PageManager = {
      init: initAboutPage,
      destroy: () => { /* 清理逻辑（若有） */ }
    };
    await manager.init();
    return manager;
  });
  PageManagerRegistry.register('contact', async () => {
    const { initTwikoo } = await import('/js/core/twikoo-manager.js');
    const container = document.querySelector('#twikoo-comments');
    if (container) await initTwikoo(container);
    return {
      init: () => { },
      destroy: () => {
        import('/js/core/twikoo-manager.js').then(({ resetTwikooContainer }) => {
          const c = document.querySelector('#twikoo-comments');
          if (c) resetTwikooContainer(c);
        });
      },
    } as PageManager;
  });
}
registerDefaultPages();

// 文章详情页初始化（路径匹配 /articles/xxx 且不是列表页）
async function initArticlePage(refreshFn: () => void): Promise<PageManager | null> {
  const { initArticlePage } = await import('/js/pages/article.js');
  const manager = initArticlePage() as any;
  if (manager && typeof manager.init === 'function' && !(manager as any)._initialized) {
    await manager.init();
    (manager as any)._initialized = true;
  }
  return manager;
}

async function initPageManager(pageName: string, refreshFn: () => void): Promise<PageManager | null> {
  const path = window.location.pathname;
  // 精确匹配 /articles/xxx（且不是 /articles/ 或 /articles）
  if (/^\/articles\/[^/]+$/.test(path)) {
    return initArticlePage(refreshFn);
  }
  return PageManagerRegistry.create(pageName, refreshFn);
}

function refreshScrollReveal(): void {
  const instance = (window as any).scrollRevealInstance;
  if (instance) instance.refresh();
  else ensureScrollReveal()?.refresh();
  LazyImageLoader.refresh();
}

// ==================== 核心导航函数 ====================
async function fetchPageContent(url: string, signal: AbortSignal): Promise<PageResponse> {
  const res = await fetch(url, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
  return { html: await res.text(), url };
}

// 显示错误覆盖层（可复用）
function showErrorOverlay(message: string, retryFn: () => void, fallbackUrl?: string): void {
  const old = document.querySelector('.router-error-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'router-error-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.2rem;
  `;
  overlay.innerHTML = `
    <div style="background: var(--surface-color, #1e1e1e); padding: 2rem 3rem; border-radius: 16px; max-width: 400px; text-align: center;">
      <h2>加载失败</h2>
      <p style="color: #ccc;">${message}</p>
      <div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <button id="router-retry-btn" style="padding: 0.6rem 2rem; border: none; border-radius: 30px; background: var(--accent-color, #a55860); color: white; font-weight: bold; cursor: pointer;">重试</button>
        ${fallbackUrl ? `<button id="router-reload-btn" style="padding: 0.6rem 2rem; border: none; border-radius: 30px; background: #666; color: white; font-weight: bold; cursor: pointer;">刷新页面</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('router-retry-btn')?.addEventListener('click', () => {
    overlay.remove();
    retryFn();
  });
  if (fallbackUrl) {
    document.getElementById('router-reload-btn')?.addEventListener('click', () => {
      window.location.href = fallbackUrl;
    });
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      retryFn();
    }
  });
}

export async function fetchAndReplaceContent(
  url: string,
  pushState = true,
  scrollData: { scrollX?: number; scrollY?: number } | null = null,
  retryCount = 0
): Promise<boolean> {
  // 取消之前的导航
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  state.navigationAborted = false;
  const abortController = new AbortController();
  currentAbortController = abortController;
  const signal = abortController.signal;

  try {
    // 取消重复请求
    if (state.pending.has(url)) await state.pending.get(url);
    // 检查缓存
    const cached = cache.get(url);
    if (cached) {
      // 仅哈希变化不重新请求
      const currentHash = window.location.hash;
      const newHash = new URL(url, location.href).hash;
      if (currentHash !== newHash) {
        if (newHash) {
          const el = document.getElementById(newHash.slice(1));
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (pushState) {
          history.pushState({ ...history.state, scroll: { scrollX: window.scrollX, scrollY: window.scrollY } }, document.title, url);
        }
        return true;
      }
      return await processContent(cached, url, pushState, scrollData);
    }

    // 发起请求
    const promise = fetchPageContent(url, signal);
    state.pending.set(url, promise);
    const response = await promise;
    state.pending.delete(url);

    if (signal.aborted) {
      state.navigationAborted = true;
      return false;
    }

    const content = extractPageContent(response.html, url);
    cache.set(url, content);
    return await processContent(content, url, pushState, scrollData);
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.log('[Router] 导航已取消');
      state.navigationAborted = true;
      return false;
    }
    console.error('[Router] 导航失败:', e);
    if (retryCount < RETRY_LIMIT) {
      showErrorOverlay(
        `加载失败 (${e.message || '未知错误'})，点击重试`,
        () => fetchAndReplaceContent(url, pushState, scrollData, retryCount + 1),
        url
      );
      return false;
    } else {
      showErrorOverlay(
        `加载失败 (${e.message || '未知错误'})，请手动刷新`,
        () => fetchAndReplaceContent(url, pushState, scrollData, retryCount + 1),
        url
      );
      return false;
    }
  } finally {
    if (currentAbortController === abortController) {
      currentAbortController = null;
    }
  }
}

async function processContent(
  content: ExtractedContent,
  url: string,
  pushState: boolean,
  scrollData: { scrollX?: number; scrollY?: number } | null
): Promise<boolean> {
  // 1. 卸载旧页面的资源
  const { styleIds: oldStyles, scriptIds: oldScripts } = state.currentResources;
  resourceLoader.unloadResources(oldStyles, oldScripts);
  state.currentResources = { styleIds: [], scriptIds: [] };

  // 2. 销毁旧管理器
  await destroyCurrentManager();

  // 3. 保存当前滚动（如果 pushState）
  if (pushState) {
    history.replaceState(
      { ...history.state, scroll: { scrollX: window.scrollX, scrollY: window.scrollY } },
      document.title,
      location.href
    );
  }

  // 4. 替换内容
  await replaceContent(content.mainHtml);

  // 5. 更新标题和URL
  document.title = content.title;
  if (pushState) {
    const newScroll = scrollData || { scrollX: 0, scrollY: 0 };
    history.pushState({ ...history.state, scroll: newScroll }, content.title, url);
  } else if (scrollData) {
    window.scrollTo(scrollData.scrollX || 0, scrollData.scrollY || 0);
  } else {
    const stateScroll = (history.state as any)?.scroll;
    if (stateScroll) window.scrollTo(stateScroll.scrollX || 0, stateScroll.scrollY || 0);
  }

  // 6. 更新导航栏高亮
  refreshNavbarTitle();
  initNavigation();

  // 7. 加载新资源（并行）
  const [styleIds, scriptIds] = await Promise.all([
    resourceLoader.loadStyles(content.styles),
    resourceLoader.loadScripts(content.scripts),
  ]);
  state.currentResources = { styleIds, scriptIds };

  // 8. 初始化页面管理器
  const refreshFn = refreshScrollReveal;
  const manager = await initPageManager(content.pageName, refreshFn);
  if (manager) {
    state.currentManager = manager;
    (window as any).__currentPageManager = manager;
  }

  // 9. 滚动揭示刷新 + 懒加载
  refreshScrollReveal();

  // 10. 锚点滚动处理
  if (!pushState && !scrollData && !(history.state as any)?.scroll) {
    const targetUrl = new URL(url, location.href);
    if (targetUrl.hash) {
      const el = document.getElementById(targetUrl.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 0);
    } else {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    }
  }

  // 11. 触发事件
  window.dispatchEvent(new CustomEvent('ajax:navigation', {
    detail: { url, page: content.pageName }
  }));

  return true;
}

async function destroyCurrentManager(): Promise<void> {
  if (state.currentManager && typeof state.currentManager.destroy === 'function') {
    try { await state.currentManager.destroy(); } catch (e) { /* ignore */ }
  }
  state.currentManager = null;
  (window as any).__currentPageManager = null;
}

// ==================== 导航高亮 ====================
export function initNavigation(): void {
  const items = document.querySelectorAll<HTMLAnchorElement>('.nav-item[data-page]');
  const current = getPageNameFromPath(location.pathname);
  items.forEach(el => {
    el.classList.toggle('active', el.dataset.page === current);
  });
}

// ==================== 无刷新导航启用 ====================
function isSpecialProtocol(href: string): boolean {
  return /^(mailto|tel|javascript|data):/i.test(href);
}

export function enableAjaxNavigation(): void {
  document.addEventListener('click', (e) => {
    const anchor = (e.target as Element).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (
      anchor.target === '_blank' ||
      anchor.hasAttribute('download') ||
      href.startsWith('#') ||
      anchor.hasAttribute('data-no-ajax') ||
      !isSameOrigin(href) ||
      isSpecialProtocol(href)
    ) return;

    e.preventDefault();
    const fullUrl = new URL(href, location.href).href;
    if (fullUrl === location.href) return;

    // 仅哈希变化
    const currentWithoutHash = location.href.split('#')[0];
    const targetWithoutHash = fullUrl.split('#')[0];
    if (currentWithoutHash === targetWithoutHash) {
      const hash = new URL(fullUrl).hash;
      if (hash) {
        const el = document.getElementById(hash.slice(1));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      history.pushState({ ...history.state, scroll: { scrollX: window.scrollX, scrollY: window.scrollY } }, document.title, fullUrl);
      return;
    }
    fetchAndReplaceContent(fullUrl, true);
  });
}

// ==================== 浏览器历史 ====================
let popstateBound = false;
export function initPopstate(): void {
  if (popstateBound) return;
  popstateBound = true;
  window.addEventListener('popstate', (event) => {
    const scroll = (event.state as any)?.scroll ?? null;
    const currentUrl = location.href;
    const stateUrl = event.state?.url || currentUrl;
    if (stateUrl.split('#')[0] === currentUrl.split('#')[0]) {
      // 仅哈希变化，只滚动
      const hash = new URL(currentUrl).hash;
      if (hash) {
        const el = document.getElementById(hash.slice(1));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    fetchAndReplaceContent(currentUrl, false, scroll);
  });
}

// ==================== 导航栏与页脚 ====================
export async function loadNavbar(): Promise<any> {
  return initNavbar();
}

export async function loadFooter(): Promise<void> {
  try {
    const res = await fetch('/footer.html');
    if (!res.ok) throw new Error('加载页脚失败');
    const html = await res.text();
    const placeholder = document.getElementById('footer-placeholder');
    if (placeholder) placeholder.innerHTML = html;
  } catch (e) {
    console.error('[Router] 页脚加载失败:', e);
  }
}

// ==================== 移动端菜单 ====================
let menuInitialized = false;
export function initMobileMenuToggle(): void {
  if (menuInitialized) return;
  menuInitialized = true;

  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.getElementById('navbarNav');

  const closeMenu = () => {
    nav?.classList.remove('active');
    toggle?.classList.remove('active');
  };

  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target.closest('.mobile-toggle')) {
      e.preventDefault();
      nav?.classList.toggle('active');
      toggle?.classList.toggle('active');
      return;
    }
    if (target.closest('.nav-item') && nav?.classList.contains('active')) {
      closeMenu();
      return;
    }
    if (nav?.classList.contains('active') && !target.closest('.nav-items')) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMenu();
  });

  window.addEventListener('ajax:navigation', closeMenu);
}

// ==================== 页面特性初始化（兼容） ====================
export async function initPageFeatures(pageName: string): Promise<any> {
  return initPageManager(pageName, refreshScrollReveal);
}

// ==================== 性能监控 ====================
export function getRouterStats(): Record<string, any> {
  return {
    cacheSize: state.cache.size,
    loadedStyles: state.loadedStyles.size,
    loadedScripts: state.loadedScripts.size,
    activePageManager: !!state.currentManager,
    pendingRequests: state.pending.size,
    currentResources: state.currentResources,
  };
}