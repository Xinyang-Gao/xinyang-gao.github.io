// /js/router/router.ts
// 无刷新导航

import { CONFIG, storageController, Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';
import { initThemeToggle } from '/js/ui/theme.js';
import type { PageManager } from '/js/core/page-manager.js';

// ==================== 常量 ====================
const ROUTER_VIEW_ID = 'router-view';
const TRANSITION_DURATION = 300;
const MAX_CACHE_SIZE = 50;
const IDLE_TIMEOUT = 10000; // 请求超时

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
}

interface PageResponse {
  html: string;
  url: string;
}

// ==================== 状态 ====================
const state = {
  currentManager: null as PageManager | null,
  loadedStyles: new Set<string>(),
  loadedScripts: new Set<string>(),
  cache: new Map<string, PageCacheEntry>(),
  pending: new Map<string, Promise<PageResponse>>(),
};

// ==================== 缓存工具 ====================
const cache = {
  get(key: string): ExtractedContent | null {
    const entry = state.cache.get(key);
    if (!entry) return null;
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

// ==================== 资源加载 ====================
const resourceLoader = {
  async loadStyles(styles: (HTMLLinkElement | HTMLStyleElement)[]): Promise<void> {
    await Promise.all(styles.map(async (style) => {
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
        document.head.appendChild(link);
        state.loadedStyles.add(href);
        await new Promise(r => { link.onload = r; link.onerror = r; });
      } else {
        const text = (style.textContent || '').trim();
        if (!text) return;
        const id = `injected-style-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        if (document.getElementById(id)) return;
        const newStyle = document.createElement('style');
        newStyle.id = id;
        newStyle.textContent = text;
        document.head.appendChild(newStyle);
      }
    }));
  },

  async loadScripts(scripts: HTMLScriptElement[]): Promise<void> {
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
          el.onload = () => resolve();
          el.onerror = () => { console.warn('[Router] 脚本加载失败:', src); resolve(); };
          document.head.appendChild(el);
        });
        state.loadedScripts.add(src);
      } else {
        // 内联脚本：通过临时容器执行
        try {
          const inline = document.createElement('script');
          if (script.type) inline.type = script.type;
          inline.textContent = script.textContent || '';
          const temp = document.createElement('div');
          temp.appendChild(inline);
          document.head.appendChild(temp);
          temp.remove();
        } catch (e) { console.error('[Router] 内联脚本执行失败:', e); }
      }
    }
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

// ==================== 页面管理器工厂 ====================
const pageManagerMap: Record<string, () => Promise<PageManager>> = {
  index: () => Promise.resolve(initHomePage() as any),
  articles: async () => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('articles', refreshScrollReveal) as any;
  },
  works: async () => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('works', refreshScrollReveal) as any;
  },
  archive: async () => {
    const { initArchivePage } = await import('/js/pages/archive.js');
    return initArchivePage(refreshScrollReveal) as any;
  },
  stats: async () => {
    const { initStatsPage } = await import('/js/pages/stats-init.js');
    return initStatsPage() as any;
  },
  friends: async () => {
    const { initFriendsPage } = await import('/js/pages/friends-manager.js');
    return initFriendsPage() as any;
  },
  about: async () => {
    const { initAboutPage } = await import('/js/pages/about.js');
    const manager: PageManager = { init: initAboutPage, destroy: () => { } };
    await manager.init();
    return manager;
  },
  contact: async () => {
    const { initTwikoo } = await import('/js/core/twikoo-manager.js');
    const container = document.querySelector('#twikoo-comments');
    if (container) await initTwikoo(container);
    return {
      init: () => { },
      destroy: () => {
        const { resetTwikooContainer } = import('/js/core/twikoo-manager.js');
        const c = document.querySelector('#twikoo-comments');
        if (c) resetTwikooContainer(c);
      },
    } as PageManager;
  },
};

async function initPageManager(pageName: string): Promise<PageManager | null> {
  // 文章详情页特殊判断
  if (document.getElementById('articleBody')) {
    const { initArticlePage } = await import('/js/pages/article.js');
    return initArticlePage() as any;
  }
  const factory = pageManagerMap[pageName];
  if (!factory) return null;
  const manager = await factory();
  if (manager && typeof manager.init === 'function' && !(manager as any)._initialized) {
    await manager.init();
    (manager as any)._initialized = true;
  }
  return manager;
}

function refreshScrollReveal(): void {
  const instance = (window as any).scrollRevealInstance;
  if (instance) instance.refresh();
  else ensureScrollReveal()?.refresh();
}

// ==================== 核心导航函数 ====================
async function fetchPageContent(url: string): Promise<PageResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IDLE_TIMEOUT);
  try {
    const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    return { html: await res.text(), url };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAndReplaceContent(
  url: string,
  pushState = true,
  scrollData: { scrollX?: number; scrollY?: number } | null = null
): Promise<boolean> {
  try {
    // 取消重复请求
    if (state.pending.has(url)) await state.pending.get(url);
    // 检查缓存
    const cached = cache.get(url);
    if (cached) return await processContent(cached, url, pushState, scrollData);

    // 发起请求
    const promise = fetchPageContent(url);
    state.pending.set(url, promise);
    const response = await promise;
    state.pending.delete(url);

    const content = extractPageContent(response.html, url);
    cache.set(url, content);
    return await processContent(content, url, pushState, scrollData);
  } catch (e) {
    console.error('[Router] 导航失败:', e);
    await destroyCurrentManager();
    return false;
  }
}

async function processContent(
  content: ExtractedContent,
  url: string,
  pushState: boolean,
  scrollData: { scrollX?: number; scrollY?: number } | null
): Promise<boolean> {
  // 1. 销毁旧管理器
  await destroyCurrentManager();

  // 2. 保存当前滚动
  if (pushState) {
    history.replaceState(
      { ...history.state, scroll: { scrollX: window.scrollX, scrollY: window.scrollY } },
      document.title,
      location.href
    );
  }

  // 3. 替换内容
  await replaceContent(content.mainHtml);

  // 4. 更新标题和URL
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

  // 5. 更新导航栏
  refreshNavbarTitle();
  initNavigation();

  // 6. 加载资源
  await resourceLoader.loadStyles(content.styles);
  await resourceLoader.loadScripts(content.scripts);

  // 7. 初始化页面管理器
  const manager = await initPageManager(content.pageName);
  if (manager) {
    state.currentManager = manager;
    (window as any).__currentPageManager = manager;
  }

  // 8. 滚动揭示刷新
  refreshScrollReveal();

  // 9. 锚点滚动处理
  if (!pushState && !scrollData && !(history.state as any)?.scroll) {
    const targetUrl = new URL(url, location.href);
    if (targetUrl.hash) {
      const el = document.getElementById(targetUrl.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 0);
    } else {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    }
  }

  // 10. 触发事件
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
      !isSameOrigin(href)
    ) return;
    if (!href.endsWith('.html') && !href.includes('?') && !href.endsWith('/')) return;
    e.preventDefault();
    const fullUrl = new URL(href, location.href).href;
    if (fullUrl === location.href) return;
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
    fetchAndReplaceContent(location.href, false, scroll);
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
  return initPageManager(pageName);
}

// ==================== 性能监控 ====================
export function getRouterStats(): Record<string, any> {
  return {
    cacheSize: state.cache.size,
    loadedStyles: state.loadedStyles.size,
    loadedScripts: state.loadedScripts.size,
    activePageManager: !!state.currentManager,
    pendingRequests: state.pending.size,
  };
}