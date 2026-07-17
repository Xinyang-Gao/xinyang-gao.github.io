// /js/router/router.ts
// 无刷新导航（优化版：资源清理、错误恢复、性能增强）

import { CONFIG, storageController, Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal, refreshScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';
import { initThemeToggle } from '/js/ui/theme.js';
import type { PageManager } from '/js/core/page-manager.js';
import { LazyImageLoader } from '/js/ui/image-manager.js';

// ==================== 常量 ====================
const ROUTER_VIEW_ID = 'router-view';
const TRANSITION_DURATION = 300;
const MAX_CACHE_SIZE = 50;
const IDLE_TIMEOUT = 10000; // 请求超时
const RETRY_DELAY = 2000;   // 重试间隔

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

// ==================== 状态 ====================
const state = {
  currentManager: null as PageManager | null,
  /** 当前页面注入的资源ID列表，用于卸载 */
  currentResources: { styleIds: string[]; scriptIds: string[] } = { styleIds: [], scriptIds: [] },
  /** 全局已加载的外部资源（仅用于去重） */
  loadedStyles: new Set<string>(),
  loadedScripts: new Set<string>(),
  cache: new Map<string, PageCacheEntry>(),
  pending: new Map<string, Promise<PageResponse>>(),
  /** 当前导航是否被取消 */
  navigationAborted: false,
};

// ==================== 页面管理器注册表 ====================
type PageManagerFactory = (refreshFn: () => void) => Promise<PageManager>;

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

// 注册内置页面（由外部调用）
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
    // 清理过期（10分钟）
    const now = Date.now();
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
  /** 加载样式，返回注入的ID列表用于清理 */
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
          injectedIds.push(id); // 记录ID用于清理（虽然元素已移除，但为了统一清理逻辑）
        } catch (e) { console.error('[Router] 内联脚本执行失败:', e); }
      }
    }
    return injectedIds;
  },

  /** 卸载指定ID的资源 */
  unloadResources(styleIds: string[], scriptIds: string[]): void {
    // 移除样式
    styleIds.forEach(id => {
      const el = document.querySelector(`[data-router-style="${id}"]`) as HTMLElement;
      if (el) el.remove();
      // 如果是内联样式，也可能用id直接查找
      const byId = document.getElementById(id);
      if (byId && byId.tagName === 'STYLE') byId.remove();
    });
    // 移除脚本（仅限外部，内联脚本已随temp移除，但为了保险清理标记）
    scriptIds.forEach(id => {
      const el = document.querySelector(`[data-router-script="${id}"]`) as HTMLElement;
      if (el) el.remove();
    });
    // 清理去重集合中已被移除的资源（可选）
    // 不清理去重集合，因为卸载后仍应避免重复加载（但若页面重新加载同一资源，还需重新注入，所以需要清空？）
    // 处理：如果资源被卸载，应从loaded集合中删除，以便再次加载
    // 但为了简单，我们不清除集合，因为资源可能被其他页面共享，若清除会导致重复加载
    // 更好的策略：记录每个资源属于哪个页面，但复杂度高，暂不处理
  }
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

// ==================== 页面管理器工厂（动态注册） ====================
// 预先注册默认页面
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
    const { initFriendsPage } = await import('/js/pages/friends-manager.js');
    return initFriendsPage() as any;
  });
  PageManagerRegistry.register('about', async () => {
    const { initAboutPage } = await import('/js/pages/about.js');
    const manager: PageManager = { init: initAboutPage, destroy: () => { /* 清理逻辑 */ } };
    await manager.init();
    return manager;
  });
  PageManagerRegistry.register('contact', async () => {
    const { initTwikoo } = await import('/js/core/twikoo-manager.js');
    const container = document.querySelector('#twikoo-comments');
    if (container) await initTwikoo(container);
    return {
      init: () => {},
      destroy: () => {
        const { resetTwikooContainer } = import('/js/core/twikoo-manager.js');
        const c = document.querySelector('#twikoo-comments');
        if (c) resetTwikooContainer(c);
      },
    } as PageManager;
  });
}

registerDefaultPages();

// 对于文章详情页，通过路径前缀匹配 /articles/xxx
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
  // 判断是否为文章详情页（路径匹配 /articles/ 且不是 /articles/）
  const path = window.location.pathname;
  if (path.startsWith('/articles/') && path !== '/articles/' && path !== '/articles') {
    return initArticlePage(refreshFn);
  }
  return PageManagerRegistry.create(pageName, refreshFn);
}

function refreshScrollReveal(): void {
  const instance = (window as any).scrollRevealInstance;
  if (instance) instance.refresh();
  else ensureScrollReveal()?.refresh();
  // 刷新懒加载图片
  LazyImageLoader.refresh();
}

// ==================== 核心导航函数 ====================
async function fetchPageContent(url: string, signal: AbortSignal): Promise<PageResponse> {
  const res = await fetch(url, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
  return { html: await res.text(), url };
}

// 显示错误覆盖层（可复用）
function showErrorOverlay(message: string, retryFn: () => void): void {
  // 移除旧错误覆盖
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
      <button id="router-retry-btn" style="margin-top: 1.5rem; padding: 0.6rem 2rem; border: none; border-radius: 30px; background: var(--accent-color, #a55860); color: white; font-weight: bold; cursor: pointer;">重试</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('router-retry-btn')?.addEventListener('click', () => {
    overlay.remove();
    retryFn();
  });
  // 点击背景也可重试
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
      // 如果仅有哈希变化，不重新请求
      const currentHash = window.location.hash;
      const newHash = new URL(url, location.href).hash;
      if (currentHash !== newHash) {
        // 仅哈希变化，直接滚动
        if (newHash) {
          const el = document.getElementById(newHash.slice(1));
          if (el) { el.scrollIntoView({ behavior: 'smooth' }); }
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // 更新URL
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

    // 检查是否被取消
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
    // 错误恢复：显示覆盖层，提供重试
    if (retryCount < 2) {
      showErrorOverlay(`加载失败 (${e.message || '未知错误'})，点击重试`, () => {
        fetchAndReplaceContent(url, pushState, scrollData, retryCount + 1);
      });
      // 保留当前内容，不销毁管理器
      return false;
    } else {
      // 重试次数耗尽，回退到传统刷新
      window.location.href = url;
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
  // 1. 卸载旧页面的资源（样式和脚本）
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

  // 6. 更新导航栏
  refreshNavbarTitle();
  initNavigation();

  // 7. 加载新资源（并行，但非阻塞）
  const styleIdsPromise = resourceLoader.loadStyles(content.styles);
  const scriptIdsPromise = resourceLoader.loadScripts(content.scripts);

  // 为了性能，不阻塞管理器初始化，但需要确保资源加载完成后再执行其他依赖
  // 使用 Promise.all 等待，但可以延迟到空闲
  const [styleIds, scriptIds] = await Promise.all([styleIdsPromise, scriptIdsPromise]);
  state.currentResources = { styleIds, scriptIds };

  // 8. 初始化页面管理器（在资源加载完成后）
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
// 判断是否为特殊协议链接
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

    // 拦截所有同源链接（不再局限于 .html 等）
    e.preventDefault();
    const fullUrl = new URL(href, location.href).href;
    if (fullUrl === location.href) return;
    // 检查是否仅哈希变化（仅当完整URL除hash外相同）
    const currentWithoutHash = location.href.split('#')[0];
    const targetWithoutHash = fullUrl.split('#')[0];
    if (currentWithoutHash === targetWithoutHash) {
      // 仅哈希变化，使用pushState并滚动
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
    // 检查是否仅哈希变化
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