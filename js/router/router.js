// /js/router/router.js
// 无刷新导航：替换整个 #router-view 容器，支持浏览器回退/前进和平滑过渡

import { CONFIG, storageController, Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';
import { initThemeToggle } from '/js/ui/theme.js';

// ==================== 常量定义 ====================
const ROUTER_VIEW_ID = 'router-view';

// 全局当前页面管理器
let currentPageManager = null;

// 记录已动态加载过的样式表和脚本
const loadedStyles = new Set();
const loadedScripts = new Set();

// ==================== 脚本执行器（防重复） ====================
class ScriptExecutor {
  static async execute(scripts, container = document.body) {
    for (const s of scripts) {
      if (s.src) {
        const src = s.getAttribute('src') || s.src;
        if (!src) continue;
        if (loadedScripts.has(src)) continue;
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          loadedScripts.add(src);
          continue;
        }
        await this.#loadExternalScript(src, s.type, container);
        loadedScripts.add(src);
      } else {
        this.#runInlineScript(s, container);
      }
    }
  }

  static #loadExternalScript(src, type, container) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      if (type) script.type = type;
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      container.appendChild(script);
    });
  }

  static #runInlineScript(script, container) {
    try {
      const inline = document.createElement('script');
      if (script.type) inline.type = script.type;
      inline.textContent = script.textContent;
      container.appendChild(inline);
      setTimeout(() => inline.remove(), 0);
    } catch (e) {}
  }
}

// ==================== 页面管理器生命周期 ====================
async function destroyCurrentPageManager() {
  if (currentPageManager && typeof currentPageManager.destroy === 'function') {
    try {
      await currentPageManager.destroy();
    } catch (e) {}
  }
  currentPageManager = null;
  window.__currentPageManager = null;
}

function setCurrentPageManager(manager) {
  currentPageManager = manager;
  window.__currentPageManager = manager;
}

// ==================== 导航栏与页脚加载 ====================
export async function loadNavbar() {
  return await initNavbar();
}

export function refreshNavbarAfterNavigation() {
  refreshNavbarTitle();
}

export async function loadFooter() {
  try {
    const response = await fetch('/footer.html');
    if (!response.ok) throw new Error('加载页脚失败');
    const footerHTML = await response.text();
    const placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return;

    const tmp = document.createElement('div');
    tmp.innerHTML = footerHTML;
    tmp.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      if (!loadedStyles.has(href)) {
        const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
        if (!exists) {
          const newLink = document.createElement('link');
          newLink.rel = 'stylesheet';
          newLink.href = href;
          document.head.appendChild(newLink);
          loadedStyles.add(href);
        }
      }
    });
    tmp.querySelectorAll('script').forEach(s => s.remove());
    placeholder.innerHTML = tmp.innerHTML;

    const tmp2 = document.createElement('div');
    tmp2.innerHTML = footerHTML;
    const scripts = Array.from(tmp2.querySelectorAll('script'));
    if (!scripts.length) return;

    const loadNextScript = (index) => {
      if (index >= scripts.length) return;
      const s = scripts[index];
      const src = s.getAttribute('src');
      if (src) {
        if (loadedScripts.has(src)) {
          loadNextScript(index + 1);
          return;
        }
        const newScript = document.createElement('script');
        if (s.hasAttribute('type')) newScript.type = s.type;
        if (s.hasAttribute('async')) newScript.async = true;
        if (s.hasAttribute('defer')) newScript.defer = true;
        newScript.src = src;
        newScript.onload = () => {
          loadedScripts.add(src);
          loadNextScript(index + 1);
        };
        newScript.onerror = () => loadNextScript(index + 1);
        document.body.appendChild(newScript);
      } else {
        try {
          const inline = document.createElement('script');
          if (s.hasAttribute('type')) inline.type = s.getAttribute('type');
          inline.text = s.textContent || s.innerText || '';
          document.body.appendChild(inline);
        } catch (e) {}
        loadNextScript(index + 1);
      }
    };
    loadNextScript(0);
  } catch (error) {
    console.error('[ERROR] 加载页脚错误:', error);
  }
}

// ==================== 移动端菜单切换 ====================
let mobileToggleInitialized = false;
export function initMobileMenuToggle() {
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
    const toggle = e.target.closest('.mobile-toggle');
    const nav = getNav();
    if (!nav) return;
    if (toggle) {
      e.preventDefault();
      const isActive = nav.classList.contains('active');
      nav.classList.toggle('active', !isActive);
      if (getToggle()) getToggle().classList.toggle('active', !isActive);
      return;
    }
    const isNavItem = e.target.closest('.nav-item');
    if (isNavItem && nav.classList.contains('active')) {
      closeMenu();
      return;
    }
    if (nav.classList.contains('active')) {
      const isInsideNav = e.target.closest('.nav-items');
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

// ==================== 导航链接绑定 ====================
export function bindNavLinks() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  if (!navItems.length) return;
  navItems.forEach(item => {
    if (item._navHandler) item.removeEventListener('click', item._navHandler);
    const handler = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const href = item.getAttribute('href');
      fetchAndReplaceContent(href || `/${item.dataset.page}.html`, true);
    };
    item.addEventListener('click', handler);
    item._navHandler = handler;
  });
}

// ==================== 导航高亮 ====================
export function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const urlParams = new URLSearchParams(window.location.search);
  let currentPage = urlParams.get('page');
  if (!currentPage) currentPage = getPageNameFromPath(window.location.pathname);
  navItems.forEach(item => {
    const page = item.dataset.page;
    if (page === currentPage) item.classList.add('active');
    else item.classList.remove('active');
  });
}

// ==================== Popstate 支持（回退/前进） ====================
let popstateInitialized = false;
export function initPopstate() {
  if (popstateInitialized) return;
  popstateInitialized = true;
  window.addEventListener('popstate', (event) => {
    // 从 state 中取出滚动位置（若有），交给 fetchAndReplaceContent 恢复
    const scrollData = event.state?.scroll ?? null;
    fetchAndReplaceContent(window.location.href, false, scrollData);
  });
}

// ==================== 页面内容提取 ====================
function extractPageContent(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const title = doc.querySelector('title')?.textContent || document.title;
  const routerView = doc.querySelector(`#${ROUTER_VIEW_ID}`);
  const mainHtml = routerView ? routerView.outerHTML : '';
  const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
  const scripts = Array.from(doc.body.querySelectorAll('script'));
  const navbarHtml = doc.getElementById('navbar-placeholder')?.innerHTML || '';
  const footerHtml = doc.getElementById('footer-placeholder')?.innerHTML || '';
  return { title, mainHtml, styles, scripts, navbarHtml, footerHtml };
}

// ==================== 替换整个 #router-view（带过渡效果） ====================
function replaceMainContent(mainHtml) {
  const currentRouterView = document.getElementById(ROUTER_VIEW_ID);
  if (!currentRouterView || !mainHtml) return false;

  // 创建新容器并提取新的 #router-view
  const newContainer = document.createElement('div');
  newContainer.innerHTML = mainHtml;
  const newRouterView = newContainer.querySelector(`#${ROUTER_VIEW_ID}`);
  if (!newRouterView) {
    console.warn('[Router] 新页面缺少 #router-view，无法替换');
    return false;
  }

  return new Promise((resolve) => {
    // 1. 旧内容执行退出动画
    currentRouterView.classList.add('page-transition-exit');

    // 2. 等待退出动画结束 (0.3s)
    const onExitEnd = () => {
      currentRouterView.removeEventListener('animationend', onExitEnd);
      // 替换节点
      currentRouterView.replaceWith(newRouterView);
      
      // 3. 新内容入场（先确保没有多余类）
      newRouterView.classList.remove('page-transition-enter');
      // 强制回流以重新触发动画
      void newRouterView.offsetWidth;
      newRouterView.classList.add('page-transition-enter');

      // 4. 入场动画结束后清除类（可选）
      const onEnterEnd = () => {
        newRouterView.removeEventListener('animationend', onEnterEnd);
        newRouterView.classList.remove('page-transition-enter');
        resolve(true);
      };
      newRouterView.addEventListener('animationend', onEnterEnd);
      // 安全回退
      setTimeout(() => {
        if (newRouterView.classList.contains('page-transition-enter')) {
          newRouterView.classList.remove('page-transition-enter');
          resolve(true);
        }
      }, 400);
    };
    currentRouterView.addEventListener('animationend', onExitEnd);
    // 安全回退
    setTimeout(() => {
      if (currentRouterView.parentNode) {
        currentRouterView.replaceWith(newRouterView);
        newRouterView.classList.add('page-transition-enter');
        setTimeout(() => {
          newRouterView.classList.remove('page-transition-enter');
          resolve(true);
        }, 400);
      }
    }, 500);
  });
}

function injectStyles(styles) {
  styles.forEach(h => {
    if (h.tagName.toLowerCase() === 'link') {
      const href = h.getAttribute('href') || h.href;
      if (!href) return;
      if (loadedStyles.has(href)) return;
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
      if (exists) {
        loadedStyles.add(href);
        return;
      }
      const nl = document.createElement('link');
      nl.rel = 'stylesheet';
      nl.href = href;
      document.head.appendChild(nl);
      loadedStyles.add(href);
    } else if (h.tagName.toLowerCase() === 'style') {
      const text = (h.textContent || '').trim();
      if (!text) return;
      const hash = text.length > 200 ? text.substring(0, 200) : text;
      const styleId = `injected-style-${hash.replace(/[^a-zA-Z0-9]/g, '')}`;
      if (document.getElementById(styleId)) return;
      const ns = document.createElement('style');
      ns.id = styleId;
      ns.textContent = text;
      document.head.appendChild(ns);
    }
  });
}

function ensureGlobalElements() {
  if (!document.getElementById(ROUTER_VIEW_ID)) {
    const container = document.createElement('div');
    container.id = ROUTER_VIEW_ID;
    document.body.insertBefore(container, document.getElementById('footer-placeholder'));
  }
  if (!document.getElementById('navbar-placeholder')) {
    const el = document.createElement('div');
    el.id = 'navbar-placeholder';
    document.body.insertBefore(el, document.body.firstChild);
  }
  if (!document.getElementById('footer-placeholder')) {
    const el = document.createElement('div');
    el.id = 'footer-placeholder';
    document.body.appendChild(el);
  }
}

function tryInitTwikoo() {
  try {
    const twikooEl = document.querySelector('#twikoo-comments');
    if (twikooEl && typeof twikoo !== 'undefined' && twikoo && typeof twikoo.init === 'function' && !twikooEl.getAttribute('data-init')) {
      twikoo.init({
        envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
        el: '#twikoo-comments',
        lang: 'zh-CN',
        enableComment: true
      }).then(() => twikooEl.setAttribute('data-init', 'true'))
        .catch(err => console.warn('[WARN] Twikoo 初始化失败:', err));
    }
  } catch (e) {}
}

async function reinitializeGlobalComponents(navbarHtml, footerHtml) {
  const navbarPlaceholder = document.getElementById('navbar-placeholder');
  const currentNavbar = navbarPlaceholder?.querySelector('.navbar');
  if (navbarHtml && navbarPlaceholder) {
    const newNavbarDiv = document.createElement('div');
    newNavbarDiv.innerHTML = navbarHtml;
    const newNavbar = newNavbarDiv.querySelector('.navbar');
    if (newNavbar && (!currentNavbar || currentNavbar.outerHTML !== newNavbar.outerHTML)) {
      navbarPlaceholder.innerHTML = navbarHtml;
      if (typeof bindNavLinks === 'function') bindNavLinks();
      if (typeof initMobileMenuToggle === 'function') initMobileMenuToggle();
      if (typeof initThemeToggle === 'function') initThemeToggle();
    }
  } else if ((!currentNavbar || !navbarPlaceholder?.innerHTML.trim()) && typeof loadNavbar === 'function') {
    await loadNavbar();
  }

  const footerPlaceholder = document.getElementById('footer-placeholder');
  const currentFooter = footerPlaceholder?.querySelector('.footer');
  if (footerHtml && footerPlaceholder) {
    const newFooterDiv = document.createElement('div');
    newFooterDiv.innerHTML = footerHtml;
    const newFooter = newFooterDiv.querySelector('.footer');
    if (newFooter && (!currentFooter || currentFooter.outerHTML !== newFooter.outerHTML)) {
      footerPlaceholder.innerHTML = footerHtml;
    }
  } else if ((!currentFooter || !footerPlaceholder?.innerHTML.trim()) && typeof loadFooter === 'function') {
    await loadFooter();
  }

  if (typeof initNavigation === 'function') initNavigation();
  if (typeof initMobileMenuToggle === 'function') initMobileMenuToggle();
  if (typeof initThemeToggle === 'function') initThemeToggle();
}

// ==================== 页面管理器按需加载 ====================
async function initPageManagerByPageName(pageName, isArticlePage, url) {
  let manager = null;
  if (pageName === 'index') {
    manager = initHomePage();
  } else if (pageName === 'articles' || pageName === 'works') {
    const refreshCallback = () => {
      if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
      else { ensureScrollReveal(); if (window.scrollRevealInstance) window.scrollRevealInstance.refresh(); }
    };
    const { initSearchPage } = await import('/js/pages/search-render.js');
    manager = await initSearchPage(pageName, refreshCallback, { forceRefresh: true });
  } else if (pageName === 'archive') {
    const refreshCallback = () => {
      if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
      else { ensureScrollReveal(); if (window.scrollRevealInstance) window.scrollRevealInstance.refresh(); }
    };
    const { initArchivePage } = await import('/js/pages/archive.js');
    manager = await initArchivePage(refreshCallback);
  } else if (pageName === 'article-detail' || isArticlePage) {
    if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
      const { initArticlePage } = await import('/js/pages/article.js');
      manager = await initArticlePage();
    }
  } else if (pageName === 'stats') {
    const { initStatsPage } = await import('/js/pages/stats-init.js');
    manager = await initStatsPage();
  } else if (pageName === 'friends') {
    const { initFriendsPage } = await import('/js/pages/friends-manager.js');
    manager = await initFriendsPage();
  }
  return manager;
}

function refreshScrollRevealEffect() {
  if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
  else { ensureScrollReveal(); if (window.scrollRevealInstance) window.scrollRevealInstance.refresh(); }
}

function clearDataCacheForPage(pageName) {
  if (!storageController.isAllowed()) return;
  if (pageName === 'articles') storageController.removeItem(CONFIG.STORAGE_KEYS.ARTICLES_DATA);
  else if (pageName === 'works') storageController.removeItem(CONFIG.STORAGE_KEYS.WORKS_DATA);
}

// ==================== 主函数：无刷新导航（支持滚动恢复） ====================
export async function fetchAndReplaceContent(url, pushState = true, scrollData = null) {
  try {
    await destroyCurrentPageManager();

    // 保存当前滚动位置（仅在 pushState 时保存到 state）
    if (pushState) {
      const currentScroll = { scrollX: window.scrollX, scrollY: window.scrollY };
      history.replaceState({ ...history.state, scroll: currentScroll }, document.title);
    }

    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    const text = await res.text();

    const { title, mainHtml, styles, scripts, navbarHtml, footerHtml } = extractPageContent(text);

    // 替换内容（带过渡）
    await replaceMainContent(mainHtml);

    document.title = title;
    if (pushState) {
      // 新 state 中保存滚动位置（初始为 0,0 或之前的 scrollData）
      const newScroll = scrollData || { scrollX: 0, scrollY: 0 };
      window.history.pushState({ ...history.state, scroll: newScroll }, title, url);
    } else {
      // popstate 时，使用传入的 scrollData 恢复滚动
      if (scrollData) {
        window.scrollTo(scrollData.scrollX || 0, scrollData.scrollY || 0);
      } else {
        // 尝试从 history.state 读取
        const stateScroll = history.state?.scroll;
        if (stateScroll) {
          window.scrollTo(stateScroll.scrollX || 0, stateScroll.scrollY || 0);
        }
      }
    }

    refreshNavbarAfterNavigation();

    injectStyles(styles);
    await ScriptExecutor.execute(scripts, document.body);

    ensureGlobalElements();
    tryInitTwikoo();
    await reinitializeGlobalComponents(navbarHtml, footerHtml);

    const pathname = new URL(url, window.location.href).pathname;
    const pageName = getPageNameFromPath(pathname);
    const isArticlePage = !!document.querySelector('.article-page-container') || !!document.getElementById('articleBody');
    const finalPageName = isArticlePage ? 'article-detail' : pageName;

    if (pageName === 'articles' || pageName === 'works') clearDataCacheForPage(pageName);

    const manager = await initPageManagerByPageName(finalPageName, isArticlePage, url);
    if (manager) setCurrentPageManager(manager);

    refreshScrollRevealEffect();

    // 如果未恢复滚动（popstate 没有 scrollData），则按默认行为滚动到顶部或 hash
    if (!pushState && !scrollData && !history.state?.scroll) {
      // 处理 hash
      const targetUrl = new URL(url, window.location.href);
      if (targetUrl.hash) {
        const el = document.getElementById(targetUrl.hash.slice(1));
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 0);
      } else {
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
      }
    }

    window.dispatchEvent(new CustomEvent('ajax:navigation', { detail: { url, page: finalPageName } }));
    return true;
  } catch (e) {
    console.error('[ERROR] 无刷新导航失败:', e);
    return false;
  }
}

export function enableAjaxNavigation() {
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (href.startsWith('#')) return;
    if (a.hasAttribute('data-no-ajax')) return;
    if (!isSameOrigin(href)) return;
    const isHtml = href.endsWith('.html') || href.indexOf('?') > -1 || href.endsWith('/');
    if (!isHtml) return;
    e.preventDefault();
    const fullUrl = new URL(href, window.location.href).href;
    if (fullUrl === window.location.href) return;
    fetchAndReplaceContent(fullUrl, true);
  });
}

export async function initPageFeatures(pageName) {
  const manager = await initPageManagerByPageName(pageName, false, window.location.href);
  if (manager && typeof manager.init === 'function' && !manager._initialized) {
    await manager.init();
    manager._initialized = true;
  }
  return manager;
}