// /js/router/router.js
// 导航加载、无刷新页面替换、分页功能初始化

import { Utils } from '/js/core/core.js';
import { getPageNameFromPath, isSameOrigin} from '/js/core/page-utils.js';
import { ensureScrollReveal} from '/js/ui/ui-effects.js';
import { initNavTitleReplacer, refreshNavTitleReplacer} from '/js/router/nav-title-replacer.js';
import { initThemeToggle } from '/js/ui/theme.js';
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
  try {
    const response = await fetch('/navbar.html');
    if (!response.ok) throw new Error('加载导航栏失败');
    const navbarHTML = await response.text();
    const placeholder = document.getElementById('navbar-placeholder');
    if (!placeholder) {
      console.warn('[WARN] 导航栏占位符未找到');
      return;
    }
    placeholder.innerHTML = navbarHTML;
    initThemeToggle();
    initMobileMenuToggle();
    bindNavLinks();
    initNavigation();
    initPopstate();
    initNavTitleReplacer();
  } catch (error) {
    console.error('[ERROR] 加载导航栏出错:', error);
  }
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

export async function fetchAndReplaceContent(url, pushState = true) {
  try {
    // 1. 销毁当前页面管理器，清理所有资源
    await destroyCurrentPageManager();

    // 2. 获取新页面内容
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');

    // 3. 提取标题和主要内容
    const fetchedTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
    const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
    let currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');

    // 4. 处理两栏布局替换（保持个人信息卡片）
    try {
      const fetchedTwoCol = doc.querySelector('.two-column-layout');
      if (fetchedTwoCol) {
        const existingTwoCol = document.querySelector('.two-column-layout');
        const newTwoCol = fetchedTwoCol.cloneNode(true);
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
    } catch (err) { console.warn('[WARN] 处理两栏布局替换时出错', err); }

    // 5. 替换主要内容
    if (fetchedMain && currentMain) {
      currentMain.innerHTML = fetchedMain.innerHTML;
    } else if (fetchedMain && !currentMain) {
      const container = document.querySelector('.container') || document.body;
      container.innerHTML = fetchedMain.innerHTML;
    } else {
      // 处理文章详情页等无 <main> 的情况
      const fetchedArticle = doc.querySelector('.article-page-container') || doc.getElementById('articleBody') || doc.querySelector('.article-content-wrapper');
      if (fetchedArticle) {
        const replaceTarget = document.querySelector('.two-column-layout') || document.querySelector('.article-page-container') || document.getElementById('mainContent') || document.querySelector('main') || document.body;
        if (replaceTarget) {
          if (replaceTarget.classList && replaceTarget.classList.contains('two-column-layout')) {
            replaceTarget.innerHTML = fetchedArticle.outerHTML;
          } else {
            replaceTarget.innerHTML = fetchedArticle.outerHTML || fetchedArticle.innerHTML;
          }
        }
      }
    }

    // 6. 更新页面标题
    document.title = fetchedTitle;
    if (pushState) {
      try { window.history.pushState({ ajax: true }, fetchedTitle, url); } catch (err) { console.warn('[WARN] pushState 失败:', err); }
    }

    // 7. 注入新页面的样式（避免重复）
    try {
      const headStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
      headStyles.forEach(h => {
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
    } catch (e) { console.warn('[WARN] 注入样式时出错', e); }

    // 8. 执行新页面中的脚本（按顺序加载）
    const bodyScripts = Array.from(doc.body.querySelectorAll('script'));
    const loadPromises = [];
    bodyScripts.forEach(s => {
      try {
        if (s.src) {
          const src = s.getAttribute('src') || s.src;
          if (!src) return;
          const existsScript = document.querySelector(`script[src="${src}"]`);
          if (existsScript) return;
          const newS = document.createElement('script');
          if (s.type) newS.type = s.type;
          newS.src = src;
          newS.async = false;
          const p = new Promise(resolve => {
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
          setTimeout(() => inline.parentNode && inline.parentNode.removeChild(inline), 0);
        }
      } catch (e) { console.warn('[WARN] 插入脚本时出错', e); }
    });
    if (loadPromises.length) {
      try { await Promise.all(loadPromises); } catch (e) { console.warn('[WARN] 等待脚本加载时发生错误', e); }
    }

    // 9. 确保全局容器存在（.container 等）
    try {
      if (!document.querySelector('.container')) {
        const mainEl = document.querySelector('main') || document.getElementById('mainContent');
        if (mainEl && !mainEl.closest('.container')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'container';
          while (mainEl.firstChild) wrapper.appendChild(mainEl.firstChild);
          mainEl.appendChild(wrapper);
        }
      }
    } catch (e) { console.warn('[WARN] 修复缺失 .container 时出错', e); }

    // 10. 尝试自动初始化 Twikoo
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
    } catch (e) { console.warn('[WARN] 尝试初始化 Twikoo 时出错', e); }

    // 11. 确保导航栏、页脚、个人卡片等占位符存在
    try {
      const ensurePlaceholders = () => {
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
      };
      ensurePlaceholders();

      const fetchedNavbar = doc.getElementById('navbar-placeholder');
      const currentNavbar = document.getElementById('navbar-placeholder');
      if (fetchedNavbar && fetchedNavbar.innerHTML && currentNavbar) {
        currentNavbar.innerHTML = fetchedNavbar.innerHTML;
        try {
          bindNavLinks();
          initMobileMenuToggle();
          initNavTitleReplacer();
        } catch (e) { console.warn('[WARN] 初始化导航交互时出错', e); }
      } else if (!currentNavbar || !currentNavbar.innerHTML.trim()) {
        await loadNavbar();
      }

      const fetchedFooter = doc.getElementById('footer-placeholder');
      const currentFooter = document.getElementById('footer-placeholder');
      if (fetchedFooter && fetchedFooter.innerHTML && currentFooter) {
        currentFooter.innerHTML = fetchedFooter.innerHTML;
      } else {
        await loadFooter();
      }
    } catch (e) { console.warn('[WARN] 处理全局占位元素时出错', e); }

    // 12. 重新初始化导航激活状态、移动端菜单、返回顶部等
    initNavigation();
    initMobileMenuToggle();
    initBackToTopButton();

    // 13. 渲染个人信息卡片（仅在根级 HTML 页面）
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
    } catch (e) { console.warn('[WARN] 渲染个人信息卡片时出错', e); }

    // 14. 初始化新页面的管理器（根据页面类型）
    const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
    let finalPageName = pageName;
    if (doc.querySelector('.article-page-container') || doc.getElementById('articleBody')) {
      finalPageName = 'article-detail';
    }
    const manager = await initPageFeatures(finalPageName);
    if (manager) {
      setCurrentPageManager(manager);
    }

    // 15. 刷新滚动揭示效果
    if (window.scrollRevealInstance) {
      window.scrollRevealInstance.refresh();
    } else {
      ensureScrollReveal();
      if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
    }
    refreshNavTitleReplacer();

    // 16. 滚动处理（锚点或顶部）
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
    } catch (e) { console.warn('[WARN] 自动滚动处理失败', e); }

    // 17. 触发导航完成事件
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
    const url = new URL(href, window.location.href).href;
    if (url === window.location.href) return;
    fetchAndReplaceContent(url, true);
  }, { passive: false });
}

export async function initPageFeatures(pageName) {
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
  } else if (pageName === 'article-detail') {
    // 文章详情页需要检测当前路径是否为文章页面
    if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
      const { initArticlePage } = await import('/js/pages/article.js');
      manager = initArticlePage();
    }
} else if (pageName === 'stats') {
    const { initStatsPage } = await import('/js/pages/stats-init.js');
    manager = await initStatsPage();
}

  // 其他页面（about, contact, friends, settings, privacy 等）可能没有特殊管理器，返回 null

  if (manager && typeof manager.init === 'function' && !manager._initialized) {
    // 避免重复初始化
    await manager.init();
    manager._initialized = true;
  }

  return manager;
}