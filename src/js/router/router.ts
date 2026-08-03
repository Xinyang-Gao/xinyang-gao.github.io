// /js/router/router.ts
// 无刷新导航

import { CONFIG } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';
import type { PageManager } from '/js/core/page-manager.js';
import { LazyImageLoader } from '/js/ui/image-manager.js';
import { friendLinkManager } from '/js/pages/friends-manager.js';

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

type PageManagerFactory = (refreshFn: () => void) => Promise<PageManager>;

// ==================== 全局状态单例 ====================
class RouterState {
  currentManager: PageManager | null = null;
  loadedStyles: Set<string> = new Set(); // 存储 href 或 style id
  loadedScripts: Set<string> = new Set(); // 存储 src
  cache: Map<string, { content: ExtractedContent; timestamp: number }> = new Map();
  pendingRequests: Map<string, Promise<PageResponse>> = new Map();
  
  isProcessing: boolean = false;
  navigationId: number = 0; // 单调递增，用于竞态取消
  lastRenderedUrl: string | null = null;
  
  // 当前活跃的资源ID列表，用于卸载
  activeStyleIds: string[] = [];
  activeScriptIds: string[] = [];
}

const state = new RouterState();
let currentAbortController: AbortController | null = null;

// ==================== 滚动管理器 ====================
/**
 * 负责处理浏览器原生滚动行为的手动接管
 */
class ScrollManager {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // 核心：禁止浏览器自动恢复滚动，完全由我们控制
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // 监听滚动，持续更新当前历史记录的 scroll 数据
    window.addEventListener('scroll', () => this.debouncedSave(), { passive: true });
    
    // 页面卸载前兜底保存
    window.addEventListener('pagehide', () => this.saveImmediately());
  }

  private debouncedSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveImmediately(), SCROLL_DEBOUNCE_MS);
  }

  /** 同步保存当前滚动位置到 history.state */
  saveImmediately(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    
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
    } catch (e) {
      // 忽略跨域或特殊页面的错误
    }
  }

  /**
   * 恢复滚动位置
   * @param pos 目标位置
   * @param smooth 是否平滑滚动（popstate通常不需要平滑，直接跳转体验更好）
   */
  restore(pos: { x: number; y: number } | null | undefined, smooth: boolean = false): void {
    const targetY = pos?.y ?? 0;
    const targetX = pos?.x ?? 0;
    
    requestAnimationFrame(() => {
      window.scrollTo({
        top: targetY,
        left: targetX,
        behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior)
      });
    });
  }
}

const scrollManager = new ScrollManager();

// ==================== 资源管理器 ====================
/**
 * 负责动态加载和清理 CSS/JS 资源
 */
class ResourceManager {
  /**
   * 加载样式表
   * @returns 生成的唯一ID列表，用于后续卸载
   */
  async loadStyles(styles: (HTMLLinkElement | HTMLStyleElement)[]): Promise<string[]> {
    const ids: string[] = [];
    const promises = styles.map(async (s) => {
      // 处理外部链接样式
      if (s.tagName === 'LINK') {
        const href = s.getAttribute('href') || (s as HTMLLinkElement).href;
        if (!href || state.loadedStyles.has(href)) return;
        
        // 检查 DOM 中是否已存在
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
      } 
      // 处理内联样式
      else {
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

  /**
   * 加载脚本
   * @returns 生成的唯一ID列表，用于后续卸载
   */
  async loadScripts(scripts: HTMLScriptElement[]): Promise<string[]> {
    const ids: string[] = [];
    
    for (const script of scripts) {
      // 处理外部脚本
      if (script.src) {
        const src = script.getAttribute('src') || script.src;
        if (!src || state.loadedScripts.has(src)) continue;
        
        // 避免重复加载
        if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) {
          state.loadedScripts.add(src);
          continue;
        }

        const el = document.createElement('script');
        if (script.type) el.type = script.type;
        el.src = src;
        el.async = true; // 异步加载不阻塞渲染
        
        const id = `dyn-script-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        el.dataset.routerId = id;
        el.onerror = () => console.warn('[Router] 脚本加载失败:', src);
        
        document.head.appendChild(el);
        ids.push(id);
        state.loadedScripts.add(src);
      } 
      // 处理内联脚本
      else {
        try {
          const inline = document.createElement('script');
          if (script.type) inline.type = script.type;
          inline.textContent = script.textContent || '';
          
          const id = `dyn-inline-script-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          inline.dataset.routerId = id;
          
          // 使用临时容器执行，确保上下文正确
          const tmp = document.createElement('div');
          tmp.appendChild(inline);
          document.head.appendChild(tmp);
          tmp.remove(); // 执行后移除节点，但代码已执行
          
          ids.push(id);
        } catch (e) {
          console.error('[Router] 内联脚本执行异常:', e);
        }
      }
    }
    return ids;
  }

  /**
   * 卸载指定ID的资源
   */
  unload(styleIds: string[], scriptIds: string[]): void {
    // 卸载样式
    styleIds.forEach(id => {
      const el = document.querySelector(`[data-router-id="${id}"]`) as HTMLElement;
      if (el) {
        if (el.tagName === 'LINK') {
          const href = el.getAttribute('href');
          if (href) state.loadedStyles.delete(href);
        }
        el.remove();
      }
    });

    // 卸载脚本 (注意：已执行的JS无法真正"卸载"，只能移除DOM节点防止重复执行标记)
    scriptIds.forEach(id => {
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
  private static factories = new Map<string, PageManagerFactory>();

  static register(name: string, factory: PageManagerFactory): void {
    this.factories.set(name, factory);
  }

  static async create(name: string, refreshFn: () => void): Promise<PageManager | null> {
    const factory = this.factories.get(name);
    if (!factory) return null;

    try {
      const mgr = await factory(refreshFn);
      // 自动初始化
      if (mgr && typeof mgr.init === 'function' && !(mgr as any)._initialized) {
        await mgr.init();
        (mgr as any)._initialized = true;
      }
      return mgr;
    } catch (e) {
      console.error(`[Router] 页面管理器创建失败 [${name}]:`, e);
      return null;
    }
  }
}

export function registerPageManager(name: string, factory: PageManagerFactory): void {
  PageManagerRegistry.register(name, factory);
}

// ==================== 默认页面注册 ====================
function registerDefaultPages(): void {
  PageManagerRegistry.register('index', async () => initHomePage() as any);
  
  PageManagerRegistry.register('articles', async (fn) => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('articles', fn) as any;
  });
  
  PageManagerRegistry.register('works', async (fn) => {
    const { initSearchPage } = await import('/js/pages/search-render.js');
    return initSearchPage('works', fn) as any;
  });
  
  PageManagerRegistry.register('archive', async (fn) => {
    const { initArchivePage } = await import('/js/pages/archive.js');
    return initArchivePage(fn) as any;
  });
  
  PageManagerRegistry.register('stats', async () => {
    const { initStatsPage } = await import('/js/pages/stats-init.js');
    return initStatsPage() as any;
  });
  
  PageManagerRegistry.register('friends', async () => {
    if ((friendLinkManager as any)._initialized) friendLinkManager.destroy();
    await friendLinkManager.init();
    return friendLinkManager;
  });
  
  PageManagerRegistry.register('about', async () => {
    const { initAboutPage } = await import('/js/pages/about.js');
    const mgr: PageManager = { init: initAboutPage, destroy: () => {} };
    await mgr.init();
    return mgr;
  });
  
  PageManagerRegistry.register('contact', async () => {
    const { initTwikoo } = await import('/js/core/twikoo-manager.js');
    const c = document.querySelector('#twikoo-comments');
    if (c) await initTwikoo(c);
    
    return {
      init: () => {},
      destroy: () => {
        import('/js/core/twikoo-manager.js').then(({ resetTwikooContainer }) => {
          const el = document.querySelector('#twikoo-comments');
          if (el) resetTwikooContainer(el);
        });
      },
    } as PageManager;
  });
}
registerDefaultPages();

// ==================== 核心工具函数 ====================

/**
 * 从HTML字符串中提取关键内容
 */
function extractPageContent(html: string, url: string): ExtractedContent {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const routerView = doc.querySelector(`#${ROUTER_VIEW_ID}`);
  
  return {
    title: doc.querySelector('title')?.textContent || document.title,
    mainHtml: routerView?.outerHTML || '',
    styles: Array.from(doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('head link[rel="stylesheet"], head style')),
    scripts: Array.from(doc.querySelectorAll<HTMLScriptElement>('body script')),
    pageName: getPageNameFromPath(new URL(url, location.href).pathname),
  };
}

/**
 * 带有过渡动画的内容替换
 */
function replaceContentWithTransition(mainHtml: string): Promise<boolean> {
  const currentView = document.getElementById(ROUTER_VIEW_ID);
  if (!currentView || !mainHtml) return Promise.resolve(false);

  // 解析新内容
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

    // 1. 旧视图退出动画
    currentView.classList.add('page-transition-exit');

    const performSwap = () => {
      if (!currentView.parentNode) { finish(false); return; }
      
      // 替换 DOM
      currentView.replaceWith(newView);
      newView.classList.add('page-transition-enter');

      // 2. 新视图进入动画结束监听
      const onEnterEnd = () => {
        newView.removeEventListener('transitionend', onEnterEnd);
        newView.classList.remove('page-transition-enter');
        finish(true);
      };
      newView.addEventListener('transitionend', onEnterEnd);

      // 兜底：防止动画未触发
      setTimeout(() => {
        if (newView.classList.contains('page-transition-enter')) {
          newView.classList.remove('page-transition-enter');
          finish(true);
        }
      }, TRANSITION_DURATION * 1.5);
    };

    // 监听旧视图退出结束
    const onExitEnd = () => {
      currentView.removeEventListener('transitionend', onExitEnd);
      performSwap();
    };
    currentView.addEventListener('transitionend', onExitEnd);

    // 兜底：防止退出动画未触发
    setTimeout(() => {
      if (!settled) {
        currentView.removeEventListener('transitionend', onExitEnd);
        performSwap();
      }
    }, TRANSITION_DURATION + 50);
  });
}

/**
 * 显示错误覆盖层
 */
function showErrorOverlay(msg: string, retryFn: () => void, fallbackUrl?: string): void {
  // 移除旧的
  document.querySelector('.router-error-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'router-error-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
    z-index: 99999; display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 1.2rem; transition: opacity 0.3s;
  `;
  
  overlay.innerHTML = `
    <div style="background: var(--surface-color, #1e1e1e); padding: 2rem 3rem; border-radius: 16px; max-width: 420px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <h2 style="margin-bottom: 1rem;">加载失败</h2>
      <p style="color: #ccc; margin-bottom: 1.5rem;">${msg}</p>
      <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <button id="router-retry-btn" style="padding: 0.6rem 2rem; border: none; border-radius: 30px; background: var(--accent-color, #a55860); color: #fff; font-weight: bold; cursor: pointer; transition: transform 0.1s;">重试</button>
        ${fallbackUrl ? `<button id="router-reload-btn" style="padding: 0.6rem 2rem; border: none; border-radius: 30px; background: #666; color: #fff; font-weight: bold; cursor: pointer;">刷新页面</button>` : ''}
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
      location.href = fallbackUrl;
    });
  }

  // 点击背景关闭并重试
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      retryFn();
    }
  });
}

/**
 * 获取页面内容（带缓存和并发控制）
 */
async function fetchPageContent(url: string, signal: AbortSignal): Promise<PageResponse> {
  const res = await fetch(url, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return { html: await res.text(), url };
}

/**
 * 销毁当前页面管理器
 */
async function destroyCurrentManager(): Promise<void> {
  if (state.currentManager?.destroy) {
    try {
      await state.currentManager.destroy();
    } catch (e) {
      console.warn('[Router] 页面销毁过程出错:', e);
    }
  }
  state.currentManager = null;
  (window as any).__currentPageManager = null;
}

/**
 * 刷新滚动揭示动画和懒加载图片
 */
function refreshUIEffects(): void {
  // 尝试获取现有的 ScrollReveal 实例
  const inst = (window as any).scrollRevealInstance;
  if (inst) {
    inst.refresh();
  } else {
    ensureScrollReveal()?.refresh();
  }
  LazyImageLoader.refresh();
}

// ==================== 核心导航逻辑 ====================

/**
 * 处理页面内容的最终渲染流程
 */
async function processContent(
  content: ExtractedContent,
  url: string,
  pushState: boolean,
  scrollData: { x: number; y: number } | null,
  ac: AbortController,
  isPopState: boolean,
  navId: number
): Promise<boolean> {
  
  // 竞态检查辅助函数
  const isStale = () => ac.signal.aborted || navId !== state.navigationId;

  // 1. 清理旧资源
  resourceManager.unload(state.activeStyleIds, state.activeScriptIds);
  state.activeStyleIds = [];
  state.activeScriptIds = [];

  // 2. 销毁旧页面逻辑
  await destroyCurrentManager();
  if (isStale()) return false;

  // 3. 历史记录处理
  // 只有在用户主动点击链接时才 pushState
  // popstate 时浏览器已经改变了 URL 和历史栈指针，我们只需要渲染内容
  if (pushState && !isPopState) {
    scrollManager.saveImmediately(); // 保存离开前的滚动位置
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
  initNavigation(); // 更新导航栏高亮

  // 6. 滚动位置恢复
  if (isPopState) {
    // 浏览器前进/后退：使用保存的位置，瞬间恢复
    const savedPos = scrollData ?? (history.state as HistoryState)?.scroll;
    scrollManager.restore(savedPos, false);
  } else {
    // 普通点击导航
    const targetUrl = new URL(url, location.href);
    if (targetUrl.hash) {
      // 如果有锚点，滚动到锚点
      const el = document.getElementById(targetUrl.hash.slice(1));
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }));
      } else {
        scrollManager.restore({ x: 0, y: 0 });
      }
    } else {
      // 否则回到顶部
      scrollManager.restore({ x: 0, y: 0 });
    }
  }

  // 7. 异步加载新资源 (不阻塞渲染)
  resourceManager.loadStyles(content.styles).then(ids => {
    if (!isStale()) state.activeStyleIds = ids;
  }).catch(e => console.error('[Router] 样式加载失败:', e));

  resourceManager.loadScripts(content.scripts).then(ids => {
    if (!isStale()) state.activeScriptIds = ids;
  }).catch(e => console.error('[Router] 脚本加载失败:', e));

  // 8. 初始化新页面管理器
  const mgr = await initPageManager(content.pageName, refreshUIEffects);
  if (isStale()) {
    if (mgr?.destroy) try { await mgr.destroy(); } catch {}
    return false;
  }

  if (mgr) {
    state.currentManager = mgr;
    (window as any).__currentPageManager = mgr;
  }

  // 9. 触发动画刷新
  refreshUIEffects();

  // 10. 派发事件
  window.dispatchEvent(new CustomEvent('ajax:navigation', { 
    detail: { url, page: content.pageName } 
  }));

  state.lastRenderedUrl = url;
  return true;
}

/**
 * 主导航入口
 */
export async function fetchAndReplaceContent(
  url: string,
  pushState: boolean = true,
  scrollData: { x: number; y: number } | null = null,
  retryCount: number = 0,
  isPopState: boolean = false
): Promise<boolean> {
  
  const navId = ++state.navigationId;
  
  // 取消之前的请求
  if (currentAbortController) currentAbortController.abort();
  const ac = new AbortController();
  currentAbortController = ac;
  const signal = ac.signal;

  state.isProcessing = true;

  try {
    // 1. 获取内容 (缓存策略)
    const cacheKey = url.split('#')[0];
    let content = state.cache.get(cacheKey)?.content;

    if (!content) {
      let resp: PageResponse;
      
      // 防止重复请求
      if (state.pendingRequests.has(cacheKey)) {
        resp = await state.pendingRequests.get(cacheKey)!;
      } else {
        const p = fetchPageContent(cacheKey, signal);
        state.pendingRequests.set(cacheKey, p);
        try {
          resp = await p;
        } finally {
          state.pendingRequests.delete(cacheKey);
        }
      }

      if (signal.aborted || navId !== state.navigationId) return false;
      
      content = extractPageContent(resp.html, url);
      
      // 写入缓存
      state.cache.set(cacheKey, { content, timestamp: Date.now() });
      // 清理过期缓存
      cleanupCache();
    }

    if (signal.aborted || navId !== state.navigationId) return false;

    // 2. 同页锚点处理
    const target = new URL(url, location.href);
    const currentBase = location.href.split('#')[0];
    const targetBase = target.href.split('#')[0];

    if (currentBase === targetBase && target.hash) {
      if (pushState) {
        scrollManager.saveImmediately();
        history.pushState(
          { url: target.href, scroll: { x: 0, y: 0 }, timestamp: Date.now(), navId } as HistoryState,
          document.title,
          target.href
        );
      }
      const el = document.getElementById(target.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      state.isProcessing = false;
      return true;
    }

    // 3. 执行渲染
    return await processContent(content, url, pushState, scrollData, ac, isPopState, navId);

  } catch (e: any) {
    if (e.name === 'AbortError' || navId !== state.navigationId) return false;
    
    console.error('[Router] 导航异常:', e);
    
    // 错误重试机制
    if (retryCount < 2) {
      console.log(`[Router] 正在重试 (${retryCount + 1}/2)...`);
      return fetchAndReplaceContent(url, pushState, scrollData, retryCount + 1, isPopState);
    }

    showErrorOverlay(
      `加载失败: ${e.message || '未知网络错误'}`,
      () => fetchAndReplaceContent(url, pushState, scrollData, 0, isPopState),
      url
    );
    return false;
  } finally {
    if (currentAbortController === ac) currentAbortController = null;
    if (navId === state.navigationId) state.isProcessing = false;
  }
}

/**
 * 缓存清理
 */
function cleanupCache(): void {
  const now = Date.now();
  // 删除过期条目
  for (const [k, v] of state.cache) {
    if (now - v.timestamp > CACHE_TTL) state.cache.delete(k);
  }
  // 如果仍然过大，删除最旧的
  if (state.cache.size >= MAX_CACHE_SIZE) {
    const oldest = [...state.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) state.cache.delete(oldest[0]);
  }
}

/**
 * 根据页面名称初始化对应的管理器
 */
async function initPageManager(pageName: string, refreshFn: () => void): Promise<PageManager | null> {
  // 特殊处理文章详情页
  if (/^\/articles\/[^/]+$/.test(location.pathname)) {
    const { initArticlePage } = await import('/js/pages/article.js');
    const mgr = initArticlePage() as any;
    if (mgr && typeof mgr.init === 'function' && !mgr._initialized) {
      await mgr.init();
      mgr._initialized = true;
    }
    return mgr;
  }
  
  return PageManagerRegistry.create(pageName, refreshFn);
}

// ==================== 导航栏与交互 ====================

export function initNavigation(): void {
  const items = document.querySelectorAll<HTMLAnchorElement>('.nav-item[data-page]');
  const cur = getPageNameFromPath(location.pathname);
  items.forEach(el => el.classList.toggle('active', el.dataset.page === cur));
}

export function enableAjaxNavigation(): void {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element).closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // 排除不需要 AJAX 处理的链接
    if (
      link.target === '_blank' ||
      link.hasAttribute('download') ||
      href.startsWith('#') ||
      link.hasAttribute('data-no-ajax') ||
      !isSameOrigin(href) ||
      /^(mailto|tel|javascript|data):/i.test(href)
    ) {
      return;
    }

    e.preventDefault();
    const fullUrl = new URL(href, location.href).href;
    
    // 如果是当前页面，不做处理
    if (fullUrl === location.href) return;

    // 同页 Hash 跳转
    if (location.href.split('#')[0] === fullUrl.split('#')[0]) {
      scrollManager.saveImmediately();
      history.pushState(
        { url: fullUrl, scroll: { x: 0, y: 0 }, timestamp: Date.now(), navId: state.navigationId } as HistoryState,
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

  // 确保初始状态有数据
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

    // 如果没有状态数据，说明是首次加载或非 SPA 入口，强制刷新
    if (!targetState?.url) {
      window.location.reload();
      return;
    }

    // 同页 Hash 变化处理
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

    // 真正的页面切换
    fetchAndReplaceContent(
      currentUrl,
      false,              // pushState = false (不新增历史)
      targetState.scroll, // 使用保存的滚动位置
      0,                  // retryCount
      true                // isPopState = true
    );
  });
}

// ==================== 辅助功能 ====================

export async function loadNavbar(): Promise<any> { 
  return initNavbar(); 
}

export async function loadFooter(): Promise<void> {
  try {
    const res = await fetch('/footer.html');
    if (!res.ok) throw new Error('Footer load failed');
    const html = await res.text();
    const ph = document.getElementById('footer-placeholder');
    if (ph) ph.innerHTML = html;
  } catch (e) { 
    console.error('[Router] 页脚加载失败:', e); 
  }
}

let menuInit = false;
export function initMobileMenuToggle(): void {
  if (menuInit) return;
  menuInit = true;

  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.getElementById('navbarNav');
  
  const closeMenu = () => {
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
    if (innerWidth > 768) closeMenu();
  });
  
  window.addEventListener('ajax:navigation', closeMenu);
}

export async function initPageFeatures(pageName: string): Promise<any> {
  return initPageManager(pageName, refreshUIEffects);
}

export function getRouterStats(): Record<string, any> {
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