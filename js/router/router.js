// /js/router/router.js
// 导航加载、无刷新页面替换、分页功能初始化（优化版：脚本执行器防重复、支持卸载）

import { Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';

// 全局当前页面管理器
let currentPageManager = null;

// 记录已动态加载过的样式表
const loadedStyles = new Set();

// ==================== 脚本执行器（防重复 + 支持卸载） ====================
class ScriptExecutor {
  static #loadedScripts = new Set();   // 已加载的外部脚本 URL

  /**
   * 执行脚本列表（串行）
   * @param {HTMLScriptElement[]} scripts - 待执行的脚本元素数组
   * @param {HTMLElement} container - 插入脚本的容器，默认为 document.body
   * @returns {Promise<void>}
   */
  static async execute(scripts, container = document.body) {
    for (const s of scripts) {
      if (s.src) {
        const src = s.getAttribute('src') || s.src;
        if (!src) continue;

        // 去重：已加载过的脚本不再重复加载
        if (this.#loadedScripts.has(src)) {
          console.log(`[ScriptExecutor] 跳过已加载脚本: ${src}`);
          continue;
        }

        // 检查 DOM 中是否已存在相同 src 的脚本
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          this.#loadedScripts.add(src);
          continue;
        }

        await this.#loadExternalScript(src, s.type, container);
        this.#loadedScripts.add(src);
      } else {
        // 内联脚本：执行后立即从 DOM 移除，避免污染
        this.#runInlineScript(s, container);
      }
    }
  }

  static #loadExternalScript(src, type, container) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      if (type) script.type = type;
      script.src = src;
      script.async = false; // 保证顺序
      script.onload = () => resolve();
      script.onerror = () => {
        console.warn(`[ScriptExecutor] 脚本加载失败: ${src}`);
        resolve(); // 失败不阻塞后续
      };
      container.appendChild(script);
    });
  }

  static #runInlineScript(script, container) {
    try {
      const inline = document.createElement('script');
      if (script.type) inline.type = script.type;
      inline.textContent = script.textContent;
      container.appendChild(inline);
      // 内联脚本执行后立即移除，避免重复累积
      setTimeout(() => inline.remove(), 0);
    } catch (e) {
      console.warn('[ScriptExecutor] 执行内联脚本失败', e);
    }
  }

  /** 重置已加载脚本记录（用于测试或强制重新加载） */
  static reset() {
    this.#loadedScripts.clear();
  }
}

// ==================== 原有辅助函数（保持兼容） ====================
async function destroyCurrentPageManager() {
  if (currentPageManager && typeof currentPageManager.destroy === 'function') {
    try {
      await currentPageManager.destroy();
    } catch (e) {
      console.warn('[Router] 销毁页面管理器时出错:', e);
    }
  }
  currentPageManager = null;
  window.__currentPageManager = null;
}

function setCurrentPageManager(manager) {
  currentPageManager = manager;
  window.__currentPageManager = manager;
}

export async function loadNavbar() {
  await initNavbar();
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
    if (!placeholder) {
      console.warn('[WARN] 页脚占位符未找到');
      return;
    }

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

    const tryInvokeRender = () => {
      if (typeof renderMathAndMermaid === 'function') {
        try {
          const container = document.getElementById('articleBody') || document.getElementById('mainContent') || document.body;
          renderMathAndMermaid(container);
        } catch (e) {
          console.warn('[WARN] 调用 renderMathAndMermaid 失败', e);
        }
      }
    };

    const loadNextScript = (index) => {
      if (index >= scripts.length) {
        tryInvokeRender();
        return;
      }
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
        newScript.onerror = () => {
          console.warn('[WARN] 脚本加载失败:', src);
          loadNextScript(index + 1);
        };
        document.body.appendChild(newScript);
      } else {
        try {
          const inline = document.createElement('script');
          if (s.hasAttribute('type')) inline.type = s.getAttribute('type');
          inline.text = s.textContent || s.innerText || '';
          document.body.appendChild(inline);
        } catch (e) {
          console.warn('[WARN] 执行内联脚本失败', e);
        }
        loadNextScript(index + 1);
      }
    };
    loadNextScript(0);
  } catch (error) {
    console.error('[ERROR] 加载页脚错误:', error);
  }
}

export function initMobileMenuToggle() {
  if (window._mobileToggleBound) return;
  window._mobileToggleBound = true;

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

export function initPopstate() {
  if (window._popstateInitialized) return;
  window._popstateInitialized = true;
  window.addEventListener('popstate', () => {
    if (typeof fetchAndReplaceContent === 'function') fetchAndReplaceContent(window.location.href, false);
  });
}

export function initBackToTopButton() {
  const btn = document.getElementById('backToTopBtn');
  if (!btn) return;
  const threshold = 300;
  window.addEventListener('scroll', Utils.throttle(() => {
    btn.classList.toggle('show', window.scrollY > threshold);
  }, 100), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ==================== 页面内容提取与替换（保持不变） ====================
function extractPageContent(htmlText, baseUrl) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const title = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
  const mainElement = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
  const mainHtml = mainElement ? mainElement.outerHTML : '';

  const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
  const scripts = Array.from(doc.body.querySelectorAll('script'));
  const navbarHtml = doc.getElementById('navbar-placeholder')?.innerHTML || '';
  const footerHtml = doc.getElementById('footer-placeholder')?.innerHTML || '';
  const isArticlePage = !!(doc.querySelector('.article-page-container') || doc.getElementById('articleBody'));
  const twoColumnLayout = doc.querySelector('.two-column-layout');

  return { title, mainHtml, styles, scripts, navbarHtml, footerHtml, isArticlePage, twoColumnLayout, doc };
}

function replaceMainContent(mainHtml, twoColumnLayout, currentUrl) {
  let currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');

  if (twoColumnLayout) {
    const existingTwoCol = document.querySelector('.two-column-layout');
    const newTwoCol = twoColumnLayout.cloneNode(true);
    const existingPersonal = document.getElementById('personal-card-container');
    if (existingPersonal) {
      const newPersonal = newTwoCol.querySelector('#personal-card-container');
      if (newPersonal) newPersonal.innerHTML = existingPersonal.innerHTML;
    }
    if (existingTwoCol) {
      existingTwoCol.replaceWith(newTwoCol);
    } else {
      const container = document.querySelector('.container') || document.body;
      container.insertAdjacentElement('afterbegin', newTwoCol);
    }
    currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area') || document.querySelector('.two-column-layout');
  }

  if (mainHtml && currentMain) {
    currentMain.innerHTML = mainHtml;
  } else if (mainHtml && !currentMain) {
    const container = document.querySelector('.container') || document.body;
    container.innerHTML = mainHtml;
  } else {
    const articleContainer = document.querySelector('.two-column-layout') || document.querySelector('.article-page-container') || document.getElementById('mainContent') || document.querySelector('main') || document.body;
    if (articleContainer) {
      articleContainer.innerHTML = mainHtml;
    }
  }
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
  if (!document.querySelector('.container')) {
    const mainEl = document.querySelector('main') || document.getElementById('mainContent');
    if (mainEl && !mainEl.closest('.container')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'container';
      while (mainEl.firstChild) wrapper.appendChild(mainEl.firstChild);
      mainEl.appendChild(wrapper);
    }
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
  if (!document.getElementById('personal-card-container')) {
    const aside = document.querySelector('.sidebar-profile') || document.querySelector('aside');
    if (aside) {
      const el = document.createElement('div');
      el.id = 'personal-card-container';
      aside.insertBefore(el, aside.firstChild);
    }
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
      }).then(() => {
        twikooEl.setAttribute('data-init', 'true');
        console.log('[Twikoo] 评论组件初始化成功');
      }).catch(err => console.warn('[WARN] Twikoo 自动初始化失败:', err));
    }
  } catch (e) {
    console.warn('[WARN] 尝试初始化 Twikoo 时出错', e);
  }
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
      console.log('[Router] 导航栏已更新（来自新页面）');
    }
  } else if ((!currentNavbar || !navbarPlaceholder?.innerHTML.trim()) && typeof loadNavbar === 'function') {
    await loadNavbar();
    console.log('[Router] 导航栏已加载（默认回退）');
  }

  const footerPlaceholder = document.getElementById('footer-placeholder');
  const currentFooter = footerPlaceholder?.querySelector('.footer');

  if (footerHtml && footerPlaceholder) {
    const newFooterDiv = document.createElement('div');
    newFooterDiv.innerHTML = footerHtml;
    const newFooter = newFooterDiv.querySelector('.footer');
    if (newFooter && (!currentFooter || currentFooter.outerHTML !== newFooter.outerHTML)) {
      footerPlaceholder.innerHTML = footerHtml;
      console.log('[Router] 页脚已更新（来自新页面）');
    }
  } else if ((!currentFooter || !footerPlaceholder?.innerHTML.trim()) && typeof loadFooter === 'function') {
    await loadFooter();
    console.log('[Router] 页脚已加载（默认回退）');
  }

  if (typeof initNavigation === 'function') initNavigation();
  if (typeof initMobileMenuToggle === 'function') initMobileMenuToggle();
  if (typeof initBackToTopButton === 'function') initBackToTopButton();
  if (typeof initThemeToggle === 'function') initThemeToggle();
}

async function renderPersonalCardIfNeeded(url) {
  try {
    const personalCardContainer = document.getElementById('personal-card-container');
    const targetPath = new URL(url, window.location.href).pathname;
    const isRootHtml = targetPath === '/' || targetPath === '/index.html' || (/^\/[^\/]+\.html$/.test(targetPath) && targetPath !== '/404.html');
    if (personalCardContainer) {
      if (isRootHtml) {
        const { UIRenderer } = await import('/js/pages/search-render.js');
        personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
      } else {
        personalCardContainer.innerHTML = '';
      }
    }
  } catch (e) {
    console.warn('[WARN] 渲染个人信息卡片时出错', e);
  }
}

async function initPageManagerByPageName(pageName, isArticlePage, url) {
  let manager = null;
  if (pageName === 'index') {
    manager = initHomePage();
  } else if (pageName === 'articles' || pageName === 'works') {
    const refreshCallback = () => {
      if (window.scrollRevealInstance) {
        window.scrollRevealInstance.refresh();
      } else {
        ensureScrollReveal();
        if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
      }
    };
    const { initSearchPage } = await import('/js/pages/search-render.js');
    manager = await initSearchPage(pageName, refreshCallback);
  } else if (pageName === 'archive') {
    const refreshCallback = () => {
      if (window.scrollRevealInstance) {
        window.scrollRevealInstance.refresh();
      } else {
        ensureScrollReveal();
        if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
      }
    };
    const { initArchivePage } = await import('/js/pages/archive.js');
    manager = await initArchivePage(refreshCallback);
  } else if (pageName === 'article-detail' || isArticlePage) {
    if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
      const { initArticlePage } = await import('/js/pages/article.js');
      manager = initArticlePage();
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

function handlePageScroll(url) {
  try {
    const targetUrl = new URL(url, window.location.href);
    const scrollKey = `scrollPosition_${targetUrl.pathname}${targetUrl.search}`;
    const hasSaved = !!sessionStorage.getItem(scrollKey);
    if (!hasSaved) {
      if (targetUrl.hash) {
        const targetId = targetUrl.hash.slice(1);
        const el = document.getElementById(targetId);
        if (el) {
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 0);
        } else {
          setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
        }
      } else {
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
      }
    }
  } catch (e) {
    console.warn('[WARN] 自动滚动处理失败', e);
  }
}

function refreshScrollRevealEffect() {
  if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
    if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
  }
}

// ==================== 主函数：无刷新导航（使用优化后的脚本执行器） ====================
export async function fetchAndReplaceContent(url, pushState = true) {
  try {
    await destroyCurrentPageManager();

    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    const text = await res.text();

    const { title, mainHtml, styles, scripts, navbarHtml, footerHtml, isArticlePage, twoColumnLayout } = extractPageContent(text, url);

    replaceMainContent(mainHtml, twoColumnLayout, url);

    document.title = title;
    if (pushState) {
      try { window.history.pushState({ ajax: true }, title, url); } catch (err) { console.warn('[WARN] pushState 失败:', err); }
    }

    refreshNavbarAfterNavigation();

    injectStyles(styles);

    // ★ 使用优化后的脚本执行器（防重复 + 卸载支持）
    await ScriptExecutor.execute(scripts, document.body);

    ensureGlobalElements();
    tryInitTwikoo();
    await reinitializeGlobalComponents(navbarHtml, footerHtml);
    await renderPersonalCardIfNeeded(url);

    const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
    const finalPageName = isArticlePage ? 'article-detail' : pageName;
    const manager = await initPageManagerByPageName(finalPageName, isArticlePage, url);
    if (manager) setCurrentPageManager(manager);

    refreshScrollRevealEffect();
    handlePageScroll(url);

    window.dispatchEvent(new CustomEvent('ajax:navigation', { detail: { url, page: finalPageName } }));
    return true;
  } catch (e) {
    console.error('[ERROR] 无刷新导航加载失败:', e);
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
  }, { passive: false });
}

export async function initPageFeatures(pageName) {
  const manager = await initPageManagerByPageName(pageName, false, window.location.href);
  if (manager && typeof manager.init === 'function' && !manager._initialized) {
    await manager.init();
    manager._initialized = true;
  }
  return manager;
}

import { initThemeToggle } from '/js/ui/theme.js';