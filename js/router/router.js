// /js/router/router.js
// 导航加载、无刷新页面替换、分页功能初始化

import { Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin } from '/js/core/page-utils.js';
import { ensureScrollReveal } from '/js/ui/ui-effects.js';
import { initNavbar, refreshNavbarTitle } from '/js/ui/navbar-manager.js';
import { initHomePage } from '/js/pages/home-manager.js';

// 全局当前页面管理器
let currentPageManager = null;

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
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
      if (!exists) {
        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.href = href;
        document.head.appendChild(newLink);
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
        const newScript = document.createElement('script');
        if (s.hasAttribute('type')) newScript.type = s.type;
        if (s.hasAttribute('async')) newScript.async = true;
        if (s.hasAttribute('defer')) newScript.defer = true;
        newScript.src = src;
        newScript.onload = () => loadNextScript(index + 1);
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

/**
 * 从获取的 HTML 字符串中提取页面各部分内容
 */
function extractPageContent(htmlText, baseUrl) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const title = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
  const mainElement = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
  const mainHtml = mainElement ? mainElement.outerHTML : '';

  // 提取样式
  const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
  // 提取脚本
  const scripts = Array.from(doc.body.querySelectorAll('script'));
  // 提取导航栏和页脚占位符内容
  const navbarHtml = doc.getElementById('navbar-placeholder')?.innerHTML || '';
  const footerHtml = doc.getElementById('footer-placeholder')?.innerHTML || '';
  // 判断是否为文章详情页
  const isArticlePage = !!(doc.querySelector('.article-page-container') || doc.getElementById('articleBody'));
  // 提取两栏布局（如果有）
  const twoColumnLayout = doc.querySelector('.two-column-layout');

  return { title, mainHtml, styles, scripts, navbarHtml, footerHtml, isArticlePage, twoColumnLayout, doc };
}

/**
 * 更新 DOM 中的主要内容区域，并处理两栏布局特殊逻辑
 */
function replaceMainContent(mainHtml, twoColumnLayout, currentUrl) {
  let currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');

  // 处理两栏布局替换（保持个人信息卡片）
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
    // 处理文章详情页等无 <main> 的情况
    const articleContainer = document.querySelector('.two-column-layout') || document.querySelector('.article-page-container') || document.getElementById('mainContent') || document.querySelector('main') || document.body;
    if (articleContainer) {
      articleContainer.innerHTML = mainHtml;
    }
  }
}

/**
 * 注入新页面的样式（避免重复）
 */
function injectStyles(styles) {
  styles.forEach(h => {
    if (h.tagName.toLowerCase() === 'link') {
      const href = h.getAttribute('href') || h.href;
      if (!href) return;
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
      if (exists) return;
      const nl = document.createElement('link');
      nl.rel = 'stylesheet';
      nl.href = href;
      document.head.appendChild(nl);
    } else if (h.tagName.toLowerCase() === 'style') {
      const text = (h.textContent || '').trim();
      if (!text) return;
      const already = Array.from(document.querySelectorAll('style')).some(s => (s.textContent || '').trim() === text);
      if (already) return;
      const ns = document.createElement('style');
      ns.textContent = text;
      document.head.appendChild(ns);
    }
  });
}

/**
 * 按顺序执行脚本（串行加载，确保依赖顺序）
 */
async function executeScripts(scripts) {
  const loadPromises = [];
  for (const s of scripts) {
    try {
      if (s.src) {
        const src = s.getAttribute('src') || s.src;
        if (!src) continue;
        const existsScript = document.querySelector(`script[src="${src}"]`);
        if (existsScript) continue;
        const newS = document.createElement('script');
        if (s.type) newS.type = s.type;
        newS.src = src;
        newS.async = false;
        const p = new Promise((resolve) => {
          newS.onload = () => resolve();
          newS.onerror = () => { console.warn('[WARN] 脚本加载失败:', src); resolve(); };
        });
        document.body.appendChild(newS);
        loadPromises.push(p);
      } else {
        const inline = document.createElement('script');
        if (s.type) inline.type = s.type;
        inline.textContent = s.textContent;
        document.body.appendChild(inline);
        setTimeout(() => inline.parentNode?.removeChild(inline), 0);
      }
    } catch (e) {
      console.warn('[WARN] 插入脚本时出错', e);
    }
  }
  if (loadPromises.length) {
    await Promise.all(loadPromises);
  }
}

/**
 * 确保页面必要的全局容器存在（.container、占位符等）
 */
function ensureGlobalElements() {
  // 确保 .container 存在
  if (!document.querySelector('.container')) {
    const mainEl = document.querySelector('main') || document.getElementById('mainContent');
    if (mainEl && !mainEl.closest('.container')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'container';
      while (mainEl.firstChild) wrapper.appendChild(mainEl.firstChild);
      mainEl.appendChild(wrapper);
    }
  }
  // 确保占位符存在
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

/**
 * 尝试初始化 Twikoo 评论（如果存在且未初始化）
 */
function tryInitTwikoo() {
  try {
    const twikooEl = document.querySelector('#twikoo-comments');
    if (twikooEl && typeof twikoo !== 'undefined' && twikoo && typeof twikoo.init === 'function' && !twikooEl.getAttribute('data-init')) {
      twikoo.init({
        envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
        el: '#twikoo-comments',
        lang: 'zh-CN',
        enableComment: true
      }).then(() => { twikooEl.setAttribute('data-init', 'true'); })
        .catch(err => console.warn('[WARN] Twikoo 自动初始化失败:', err));
    }
  } catch (e) {
    console.warn('[WARN] 尝试初始化 Twikoo 时出错', e);
  }
}

/**
 * 重新初始化导航栏、页脚、移动菜单等全局组件
 */
async function reinitializeGlobalComponents(navbarHtml, footerHtml) {
  // ==================== 导航栏处理 ====================
  const navbarPlaceholder = document.getElementById('navbar-placeholder');
  const currentNavbar = navbarPlaceholder?.querySelector('.navbar');

  // 如果新页面提供了导航栏 HTML 且当前占位符存在，直接替换并重新绑定
  if (navbarHtml && navbarPlaceholder) {
    // 避免重复替换相同内容（可选优化）
    const newNavbarDiv = document.createElement('div');
    newNavbarDiv.innerHTML = navbarHtml;
    const newNavbar = newNavbarDiv.querySelector('.navbar');
    if (newNavbar && (!currentNavbar || currentNavbar.outerHTML !== newNavbar.outerHTML)) {
      navbarPlaceholder.innerHTML = navbarHtml;
      // 重新绑定导航栏交互（移动菜单、导航链接、主题切换等）
      if (typeof bindNavLinks === 'function') bindNavLinks();
      if (typeof initMobileMenuToggle === 'function') initMobileMenuToggle();
      if (typeof initThemeToggle === 'function') initThemeToggle(); // 确保主题切换正常
      console.log('[Router] 导航栏已更新（来自新页面）');
    }
  }
  // 如果新页面没有提供导航栏 HTML，但当前导航栏为空或无效，则回退加载默认导航栏
  else if ((!currentNavbar || !navbarPlaceholder?.innerHTML.trim()) && typeof loadNavbar === 'function') {
    await loadNavbar();
    console.log('[Router] 导航栏已加载（默认回退）');
  }

  // ==================== 页脚处理 ====================
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
  }
  else if ((!currentFooter || !footerPlaceholder?.innerHTML.trim()) && typeof loadFooter === 'function') {
    await loadFooter();
    console.log('[Router] 页脚已加载（默认回退）');
  }

  // ==================== 全局导航状态刷新 ====================
  // 更新当前激活的导航项样式（基于当前页面路径）
  if (typeof initNavigation === 'function') initNavigation();

  // 确保移动端菜单交互可用（即使未重新加载导航栏，也要重新绑定，因为 DOM 可能被替换）
  if (typeof initMobileMenuToggle === 'function') initMobileMenuToggle();

  // 确保回到顶部按钮存在且可用（可能已被新页面替换掉）
  if (typeof initBackToTopButton === 'function') initBackToTopButton();

  // 重新绑定主题切换（如果导航栏中的主题开关被重新创建）
  if (typeof initThemeToggle === 'function') initThemeToggle();
}

/**
 * 渲染个人信息卡片（仅在根级 HTML 页面）
 */
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

/**
 * 根据页面类型初始化对应的页面管理器
 */
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
    // 文章详情页需要检测当前路径是否为文章页面
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
  // 其他页面（about, contact, settings, privacy 等）没有特殊管理器，返回 null
  return manager;
}

/**
 * 处理页面滚动（恢复保存位置或跳转锚点）
 */
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

/**
 * 刷新滚动揭示效果
 */
function refreshScrollRevealEffect() {
  if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
    if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
  }
}

// ==================== 主函数：无刷新导航 ====================
export async function fetchAndReplaceContent(url, pushState = true) {
  try {
    // 1. 销毁当前页面管理器
    await destroyCurrentPageManager();

    // 2. 获取新页面内容
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    const text = await res.text();

    // 3. 提取页面各部分内容
    const { title, mainHtml, styles, scripts, navbarHtml, footerHtml, isArticlePage, twoColumnLayout, doc } = extractPageContent(text, url);

    // 4. 更新 DOM 主要内容
    replaceMainContent(mainHtml, twoColumnLayout, url);

    // 5. 更新页面标题和 pushState
    document.title = title;
    if (pushState) {
      try { window.history.pushState({ ajax: true }, title, url); } catch (err) { console.warn('[WARN] pushState 失败:', err); }
    }

    // 6. 刷新导航栏标题（如果标题替换模式启用）
    refreshNavbarAfterNavigation();

    // 7. 注入新样式
    injectStyles(styles);

    // 8. 执行脚本（串行）
    await executeScripts(scripts);

    // 9. 确保全局容器存在
    ensureGlobalElements();

    // 10. 尝试初始化 Twikoo
    tryInitTwikoo();

    // 11. 重新初始化全局组件（导航栏、页脚等）
    await reinitializeGlobalComponents(navbarHtml, footerHtml);

    // 12. 渲染个人信息卡片
    await renderPersonalCardIfNeeded(url);

    // 13. 初始化新页面的管理器
    const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
    const finalPageName = isArticlePage ? 'article-detail' : pageName;
    const manager = await initPageManagerByPageName(finalPageName, isArticlePage, url);
    if (manager) {
      setCurrentPageManager(manager);
    }

    // 14. 刷新滚动揭示效果
    refreshScrollRevealEffect();

    // 15. 处理页面滚动（锚点或顶部）
    handlePageScroll(url);

    // 16. 触发导航完成事件
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