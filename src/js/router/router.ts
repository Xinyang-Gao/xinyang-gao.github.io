// /js/router/router.ts
// 无刷新导航

import { CONFIG, Utils } from '/js/core/core.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initHomePage } from '/js/pages/home-manager.js';
import type { PageManager } from '/js/core/page-manager.js';
import { LazyImageLoader } from '/js/ui/image-manager.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';
import {
  initNavbar,
  refreshNavbarTitle,
  initNavigation,
} from '/js/ui/navbar-manager.js';
import type { NavbarManager } from '/js/ui/navbar-manager.js';
import { initBrandLogos } from '/js/ui/brand-logo.js';

// 保持对外的兼容 API：导航栏相关工具函数实际定义在 navbar-manager。
// 通过 re-export 保证旧引用路径继续可用，同时打破 router 与 navbar-manager 循环依赖。
export { initNavigation, initMobileMenuToggle } from '/js/ui/navbar-manager.js';

// ==================== 全局类型声明 ====================
declare global {
  interface Window {
    __currentPageManager?: PageManager | null;
  }
}

// ==================== 常量定义 ====================
const ROUTER_VIEW_ID = 'router-view';
const TRANSITION_DURATION = 300;
const MAX_CACHE_SIZE = 50;
const CACHE_TTL = 600_000; // 10分钟
const SCROLL_DEBOUNCE_MS = 80;

// ==================== 类型定义 ====================
interface HistoryState {
  url: string;
  scroll: { x: number; y: number };
  timestamp: number;
  navId: number;
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

/**
 * 页面管理器工厂。
 * 约定：工厂内部需完成 init（无论同步或异步），返回值即为已初始化的 manager。
 */
type PageManagerFactory = (refreshFn: () => void) => Promise<PageManager>;

// ==================== 全局状态单例 ====================
class RouterState {
  currentManager: PageManager | null = null;
  loadedStyles: Set<string> = new Set();
  loadedScripts: Set<string> = new Set();
  cache: Map<string, { content: ExtractedContent; timestamp: number }> = new Map();
  pendingRequests: Map<string, Promise<PageResponse>> = new Map();

  isProcessing = false;
  navigationId = 0;
  lastRenderedUrl: string | null = null;

  activeStyleIds: string[] = [];
  activeScriptIds: string[] = [];
}

const state = new RouterState();
let currentAbortController: AbortController | null = null;

// ==================== 滚动管理器 ====================
class ScrollManager {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    window.addEventListener('scroll', () => this.debouncedSave(), { passive: true });
    window.addEventListener('pagehide', () => this.saveImmediately());
  }

  private debouncedSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveImmediately(), SCROLL_DEBOUNCE_MS);
  }

  saveImmediately(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const prev = history.state as Partial<HistoryState> | null;
    try {
      history.replaceState(
        {
          ...prev,
          url: location.href,
          scroll: { x: window.scrollX, y: window.scrollY },
          timestamp: Date.now(),
        } as HistoryState,
        document.title,
        location.href
      );
    } catch {
      // 忽略跨域或特殊页面的错误
    }
  }

  restore(pos: { x: number; y: number } | null | undefined, smooth = false): void {
    const targetY = pos?.y ?? 0;
    const targetX = pos?.x ?? 0;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: targetY,
        left: targetX,
        behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior),
      });
    });
  }
}

const scrollManager = new ScrollManager();

// ==================== 资源管理器 ====================
class ResourceManager {
  async loadStyles(styles: (HTMLLinkElement | HTMLStyleElement)[]): Promise<string[]> {
    const ids: string[] = [];
    const promises = styles.map(async (s) => {
      if (s.tagName === 'LINK') {
        const href = s.getAttribute('href') || (s as HTMLLinkElement).href;
        if (!href || state.loadedStyles.has(href)) return;

        if (document.querySelector(`link[href="${CSS.escape(href)}"]`)) {
          state.loadedStyles.add(href);
          return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        const id = `dyn-style-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        link.dataset.routerId = id;

        document.head.appendChild(link);
        state.loadedStyles.add(href);
        ids.push(id);
      } else {
        const text = (s.textContent || '').trim();
        if (!text) return;

        const id = `dyn-inline-style-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        if (document.getElementById(id)) return;

        const el = document.createElement('style');
        el.id = id;
        el.dataset.routerId = id;
        el.textContent = text;
        document.head.appendChild(el);
        ids.push(id);
      }
    });

    await Promise.all(promises);
    return ids;
  }

  async loadScripts(scripts: HTMLScriptElement[]): Promise<string[]> {
    const ids: string[] = [];

    for (const script of scripts) {
      if (script.src) {
        const src = script.getAttribute('src') || script.src;
        if (!src || state.loadedScripts.has(src)) continue;

        if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) {
          state.loadedScripts.add(src);
          continue;
        }

        const el = document.createElement('script');
        if (script.type) el.type = script.type;
        el.src = src;
        el.async = true;

        const id = `dyn-script-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        el.dataset.routerId = id;
        el.onerror = () => console.warn('[Router] 脚本加载失败:', src);

        document.head.appendChild(el);
        ids.push(id);
        state.loadedScripts.add(src);
      } else {
        try {
          const inline = document.createElement('script');
          if (script.type) inline.type = script.type;
          inline.textContent = script.textContent || '';

          const id = `dyn-inline-script-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          inline.dataset.routerId = id;

          const tmp = document.createElement('div');
          tmp.appendChild(inline);
          document.head.appendChild(tmp);
          tmp.remove();

          ids.push(id);
        } catch (e) {
          console.error('[Router] 内联脚本执行异常:', e);
        }
      }
    }
    return ids;
  }

  unload(styleIds: string[], scriptIds: string[]): void {
    styleIds.forEach((id) => {
      const el = document.querySelector(`[data-router-id="${id}"]`) as HTMLElement;
      if (el) {
        if (el.tagName === 'LINK') {
          const href = el.getAttribute('href');
          if (href) state.loadedStyles.delete(href);
        }
        el.remove();
      }
    });

    scriptIds.forEach((id) => {
      const el = document.querySelector(`[data-router-id="${id}"]`) as HTMLElement;
      if (el) {
        if (el.tagName === 'SCRIPT' && el.hasAttribute('src')) {
          const src = el.getAttribute('src');
          if (src) state.loadedScripts.delete(src);
        }
        el.remove();
      }
    });
  }
}

const resourceManager = new ResourceManager();

// ==================== 页面管理器注册中心 ====================
class PageManagerRegistry {
  private static factories = new Map<string | RegExp, PageManagerFactory>();

  static register(pattern: string | RegExp, factory: PageManagerFactory): void {
    this.factories.set(pattern, factory);
  }

  /**
   * 按 name（字符串模式）或 pathname（正则模式）匹配工厂。
   * 字符串模式仅与 pageName 比较；正则模式与 location.pathname 匹配。
   * 遍历顺序即优先级，靠前注册者优先命中。
   *
   * 约定：factory 内部完成 init，create 不再额外调用 mgr.init()。
   */
  static async create(
    name: string,
    path: string,
    refreshFn: () => void
  ): Promise<PageManager | null> {
    for (const [pattern, factory] of this.factories) {
      const matched =
        typeof pattern === 'string' ? pattern === name : pattern.test(path);
      if (!matched) continue;

      try {
        return await factory(refreshFn);
      } catch (e) {
        console.error(`[Router] 页面管理器创建失败 [${String(pattern)}]:`, e);
        return null;
      }
    }
    return null;
  }
}

export function registerPageManager(
  pattern: string | RegExp,
  factory: PageManagerFactory
): void {
  PageManagerRegistry.register(pattern, factory);
}

// 页面注册 
function registerDefaultPages(): void {
  PageManagerRegistry.register('index', async () => await initHomePage());

  PageManagerRegistry.register('articles', async (fn) => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('articles', fn) as any;
  });

  PageManagerRegistry.register('works', async (fn) => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('works', fn) as any;
  });

  PageManagerRegistry.register(/^\/articles\/[^/]+\/?$/, async () => {
    const { initArticlePage } = await import('/js/pages/article.js');
    return await initArticlePage();
  });

  PageManagerRegistry.register('timeline', async (fn) => {
    const { initTimelinePage } = await import('/js/pages/timeline.js');
    return initTimelinePage(fn) as any;
  });

  PageManagerRegistry.register('stats', async () => {
    const { StatsManager } = await import('/js/pages/stats-manager.js');
    const mgr = new StatsManager();
    await mgr.init();
    return mgr;
  });

  PageManagerRegistry.register('friends', async () => {
    const { FriendsPageManager } = await import('/js/pages/friends-manager.js');
    const mgr = new FriendsPageManager();
    await mgr.init();
    return mgr;
  });

  PageManagerRegistry.register('about', async () => {
    const { AboutPageManager } = await import('/js/pages/about.js');
    const mgr = new AboutPageManager();
    await mgr.init();
    return mgr;
  });

  PageManagerRegistry.register('contact', async () => {
    const { initTwikoo, resetTwikooContainer } = await import('/js/core/twikoo-manager.js');
    const c = document.querySelector('#twikoo-comments');
    if (c) await initTwikoo(c);

    return {
      init: () => {},
      destroy: () => {
        const el = document.querySelector('#twikoo-comments');
        if (el) resetTwikooContainer(el);
      },
    } as PageManager;
  });
}
registerDefaultPages();

// ==================== 核心工具函数 ====================

function extractPageContent(html: string, url: string): ExtractedContent {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const routerView = doc.querySelector(`#${ROUTER_VIEW_ID}`);

  return {
    title: doc.querySelector('title')?.textContent || document.title,
    mainHtml: routerView?.outerHTML || '',
    styles: Array.from(
      doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
        'head link[rel="stylesheet"], head style'
      )
    ),
    scripts: Array.from(doc.querySelectorAll<HTMLScriptElement>('body script')),
    pageName: Utils.getPageNameFromPath(new URL(url, location.href).pathname),
  };
}

function replaceContentWithTransition(mainHtml: string): Promise<boolean> {
  const currentView = document.getElementById(ROUTER_VIEW_ID);
  if (!currentView || !mainHtml) return Promise.resolve(false);

  const tmpDiv = document.createElement('div');
  tmpDiv.innerHTML = mainHtml;
  const newView = tmpDiv.querySelector(`#${ROUTER_VIEW_ID}`);
  if (!newView) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (success: boolean) => {
      if (!settled) {
        settled = true;
        resolve(success);
      }
    };

    currentView.classList.add('page-transition-exit');

    const performSwap = () => {
      if (!currentView.parentNode) {
        finish(false);
        return;
      }

      currentView.replaceWith(newView);
      newView.classList.add('page-transition-enter');

      const onEnterEnd = () => {
        newView.removeEventListener('transitionend', onEnterEnd);
        newView.classList.remove('page-transition-enter');
        finish(true);
      };
      newView.addEventListener('transitionend', onEnterEnd);

      setTimeout(() => {
        if (newView.classList.contains('page-transition-enter')) {
          newView.classList.remove('page-transition-enter');
          finish(true);
        }
      }, TRANSITION_DURATION * 1.5);
    };

    const onExitEnd = () => {
      currentView.removeEventListener('transitionend', onExitEnd);
      performSwap();
    };
    currentView.addEventListener('transitionend', onExitEnd);

    setTimeout(() => {
      if (!settled) {
        currentView.removeEventListener('transitionend', onExitEnd);
        performSwap();
      }
    }, TRANSITION_DURATION + 50);
  });
}

async function fetchPageContent(url: string, signal: AbortSignal): Promise<PageResponse> {
  const res = await fetch(url, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return { html: await res.text(), url };
}

async function destroyCurrentManager(): Promise<void> {
  if (state.currentManager?.destroy) {
    try {
      await state.currentManager.destroy();
    } catch (e) {
      console.warn('[Router] 页面销毁过程出错:', e);
    }
  }
  state.currentManager = null;
  window.__currentPageManager = null;
}

function refreshUIEffects(): void {
  const inst = (window as any).scrollRevealInstance;
  if (inst) {
    inst.refresh();
  } else {
    ensureScrollReveal()?.refresh();
  }
  LazyImageLoader.refresh();
}

// ==================== 核心导航逻辑 ====================

async function processContent(
  content: ExtractedContent,
  url: string,
  pushState: boolean,
  scrollData: { x: number; y: number } | null,
  ac: AbortController,
  isPopState: boolean,
  navId: number
): Promise<boolean> {
  const isStale = () => ac.signal.aborted || navId !== state.navigationId;

  // 1. 清理旧资源
  resourceManager.unload(state.activeStyleIds, state.activeScriptIds);
  state.activeStyleIds = [];
  state.activeScriptIds = [];

  // 2. 销毁旧页面逻辑
  await destroyCurrentManager();
  if (isStale()) return false;

  // 3. 历史记录处理
  if (pushState && !isPopState) {
    scrollManager.saveImmediately();
    history.pushState(
      { url, scroll: { x: 0, y: 0 }, timestamp: Date.now(), navId } as HistoryState,
      content.title,
      url
    );
  }

  // 4. DOM 替换与动画
  await replaceContentWithTransition(content.mainHtml);
  if (isStale()) return false;

  // 5. 更新元数据
  document.title = content.title;
  refreshNavbarTitle();
  initNavigation();

  // 6. 滚动位置恢复
  if (isPopState) {
    const savedPos = scrollData ?? (history.state as HistoryState)?.scroll;
    scrollManager.restore(savedPos, false);
  } else {
    const targetUrl = new URL(url, location.href);
    if (targetUrl.hash) {
      const el = document.getElementById(targetUrl.hash.slice(1));
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }));
      } else {
        scrollManager.restore({ x: 0, y: 0 });
      }
    } else {
      scrollManager.restore({ x: 0, y: 0 });
    }
  }

  // 7. 异步加载新资源
  // 注意：即使本次导航已被判为 stale，已经插入 DOM 的 link/script 也必须登记到
  // activeStyleIds / activeScriptIds。原来用 `if (!isStale())` 直接丢弃 ids，
  // 下一次导航的 unload() 就找不到它们 → 样式与脚本永久泄漏在 head 里。
  resourceManager
    .loadStyles(content.styles)
    .then((ids) => {
      if (ids.length) state.activeStyleIds = state.activeStyleIds.concat(ids);
    })
    .catch((e) => console.error('[Router] 样式加载失败:', e));

  resourceManager
    .loadScripts(content.scripts)
    .then((ids) => {
      if (ids.length) state.activeScriptIds = state.activeScriptIds.concat(ids);
    })
    .catch((e) => console.error('[Router] 脚本加载失败:', e));

  // 8. 初始化新页面管理器
  const mgr = await initPageManager(content.pageName, refreshUIEffects);
  if (isStale()) {
    if (mgr?.destroy)
      try {
        await mgr.destroy();
      } catch {
        /* ignore */
      }
    return false;
  }

  if (mgr) {
    state.currentManager = mgr;
    window.__currentPageManager = mgr;
  }

  // 9. 触发动画刷新
  refreshUIEffects();

  // 10. 派发事件
  window.dispatchEvent(
    new CustomEvent('ajax:navigation', {
      detail: { url, page: content.pageName },
    })
  );

  state.lastRenderedUrl = url;
  return true;
}

export async function fetchAndReplaceContent(
  url: string,
  pushState: boolean = true,
  scrollData: { x: number; y: number } | null = null,
  retryCount: number = 0,
  isPopState: boolean = false
): Promise<boolean> {
  const navId = ++state.navigationId;
  const cacheKey = url.split('#')[0];

  /**
   * 目标页面已有在途请求时不要 abort。
   * 下面会复用 `state.pendingRequests` 里的 Promise，而它绑定的是**上一次导航**的
   * AbortController——先 abort 再复用，等于自己把自己取消掉，
   * 本次导航会收到 AbortError 并触发无意义的重试。
   */
  if (currentAbortController && !state.pendingRequests.has(cacheKey)) {
    currentAbortController.abort();
  }
  const ac = new AbortController();
  currentAbortController = ac;
  const signal = ac.signal;

  state.isProcessing = true;

  try {
    let content = state.cache.get(cacheKey)?.content;

    if (!content) {
      let resp: PageResponse;

      const pending = state.pendingRequests.get(cacheKey);
      if (pending) {
        resp = await pending;
      } else {
        const p = fetchPageContent(cacheKey, signal);
        state.pendingRequests.set(cacheKey, p);
        try {
          resp = await p;
        } finally {
          // 只有仍属于自己的登记时才删除：
          // 并发导航可能已经用同一个 cacheKey 覆盖了条目，无条件删会把别人的请求抹掉。
          if (state.pendingRequests.get(cacheKey) === p) {
            state.pendingRequests.delete(cacheKey);
          }
        }
      }

      if (signal.aborted || navId !== state.navigationId) return false;

      content = extractPageContent(resp.html, url);

      state.cache.set(cacheKey, { content, timestamp: Date.now() });
      cleanupCache();
    }

    if (signal.aborted || navId !== state.navigationId) return false;

    const target = new URL(url, location.href);
    const currentBase = location.href.split('#')[0];
    const targetBase = target.href.split('#')[0];

    if (currentBase === targetBase && target.hash) {
      if (pushState) {
        scrollManager.saveImmediately();
        history.pushState(
          {
            url: target.href,
            scroll: { x: 0, y: 0 },
            timestamp: Date.now(),
            navId,
          } as HistoryState,
          document.title,
          target.href
        );
      }
      const el = document.getElementById(target.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      state.isProcessing = false;
      return true;
    }

    return await processContent(content, url, pushState, scrollData, ac, isPopState, navId);
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError' || navId !== state.navigationId) return false;

    console.error('[Router] 导航异常:', err);

    if (retryCount < 2) {
      console.log(`[Router] 正在重试 (${retryCount + 1}/2)...`);
      return fetchAndReplaceContent(url, pushState, scrollData, retryCount + 1, isPopState);
    }

    const { close } = showDetailDialog({
      title: '呜呜，好像出了点小问题…',
      htmlContent: `
      <p style="color: var(--text-secondary, #ccc); margin-bottom: 1.5rem;">
        ${Utils.escapeHtml(err.message || '未知网络错误')}
      </p>
      <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <button id="router-retry-btn" style="padding: 0.6rem 2rem; border: none; border-radius: 30px; background: var(--accent-color, #a55860); color: #fff; font-weight: bold; cursor: pointer;">重试</button>
        <button id="router-reload-btn" style="padding: 0.6rem 2rem; border: none; border-radius: 30px; background: #666; color: #fff; font-weight: bold; cursor: pointer;">刷新页面</button>
      </div>
    `,
      source: 'router',
    });

    const retryBtn = document.querySelector('#router-retry-btn');
    const reloadBtn = document.querySelector('#router-reload-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        close();
        fetchAndReplaceContent(url, pushState, scrollData, 0, isPopState);
      });
    }
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        location.href = url;
      });
    }

    return false;
  } finally {
    if (currentAbortController === ac) currentAbortController = null;
    if (navId === state.navigationId) state.isProcessing = false;
  }
}

function cleanupCache(): void {
  const now = Date.now();
  for (const [k, v] of state.cache) {
    if (now - v.timestamp > CACHE_TTL) state.cache.delete(k);
  }
  if (state.cache.size >= MAX_CACHE_SIZE) {
    const oldest = [...state.cache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    )[0];
    if (oldest) state.cache.delete(oldest[0]);
  }
}

/**
 * 按 pageName + 当前 pathname 匹配页面管理器。
 * 页面识别（含文章详情路径）全部由注册表 pattern 完成。
 */
async function initPageManager(
  pageName: string,
  refreshFn: () => void
): Promise<PageManager | null> {
  return PageManagerRegistry.create(pageName, location.pathname, refreshFn);
}

// ==================== 导航栏与交互 ====================

export function enableAjaxNavigation(): void {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element).closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    if (
      link.target === '_blank' ||
      link.hasAttribute('download') ||
      href.startsWith('#') ||
      link.hasAttribute('data-no-ajax') ||
      !Utils.isSameOrigin(href) ||
      /^(mailto|tel|javascript|data):/i.test(href)
    ) {
      return;
    }

    e.preventDefault();
    const fullUrl = new URL(href, location.href).href;

    if (fullUrl === location.href) return;

    if (location.href.split('#')[0] === fullUrl.split('#')[0]) {
      scrollManager.saveImmediately();
      history.pushState(
        {
          url: fullUrl,
          scroll: { x: 0, y: 0 },
          timestamp: Date.now(),
          navId: state.navigationId,
        } as HistoryState,
        document.title,
        fullUrl
      );
      const hash = new URL(fullUrl).hash;
      if (hash) {
        const el = document.getElementById(hash.slice(1));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    fetchAndReplaceContent(fullUrl, true, null, 0, false);
  });
}

// ==================== 浏览器历史监听 (Popstate) ====================

let popstateBound = false;

export function initPopstate(): void {
  if (popstateBound) return;
  popstateBound = true;

  if (!history.state || !(history.state as HistoryState).url) {
    history.replaceState(
      {
        url: location.href,
        scroll: { x: window.scrollX, y: window.scrollY },
        timestamp: Date.now(),
        navId: 0,
      } as HistoryState,
      document.title,
      location.href
    );
  }

  window.addEventListener('popstate', (event: PopStateEvent) => {
    const targetState = event.state as HistoryState | null;
    const currentUrl = location.href;

    if (!targetState?.url) {
      window.location.reload();
      return;
    }

    if (currentUrl.split('#')[0] === targetState.url.split('#')[0]) {
      const hash = new URL(currentUrl).hash;
      if (hash) {
        const el = document.getElementById(hash.slice(1));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        scrollManager.restore(targetState.scroll, false);
      }
      return;
    }

    fetchAndReplaceContent(
      currentUrl,
      false,
      targetState.scroll,
      0,
      true
    );
  });
}

// ==================== 辅助功能 ====================

export async function loadNavbar(): Promise<NavbarManager> {
  return initNavbar();
}

export async function loadFooter(): Promise<void> {
  try {
    const res = await fetch('/footer.html');
    if (!res.ok) throw new Error('Footer load failed');
    const html = await res.text();
    const ph = document.getElementById('footer-placeholder');
    if (!ph) return;
    ph.innerHTML = html;
    // 页脚品牌 LOGO：滚动进入视口后勾边并显示
    initBrandLogos(ph);
  } catch (e) {
    console.error('[Router] 页脚加载失败:', e);
  }
}

export async function initPageFeatures(pageName: string): Promise<unknown> {
  return initPageManager(pageName, refreshUIEffects);
}

export function getRouterStats(): Record<string, unknown> {
  return {
    cacheSize: state.cache.size,
    loadedStyles: state.loadedStyles.size,
    loadedScripts: state.loadedScripts.size,
    activePageManager: !!state.currentManager,
    pendingRequests: state.pendingRequests.size,
    isProcessing: state.isProcessing,
    navigationId: state.navigationId,
    lastRenderedUrl: state.lastRenderedUrl,
  };
}