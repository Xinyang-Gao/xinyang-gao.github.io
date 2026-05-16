// ==================== /js/router.js ====================
// 导航加载、无刷新页面替换、分页功能初始化

import { Utils } from '/js/core.js';
import { getPageNameFromPath, isArticleDetailOr404Page, isSameOrigin, updateDynamicGreeting, applyRandomBackgroundImage } from '/js/page-utils.js';
import { ensureScrollReveal, refreshScrollReveal } from '/js/ui-effects.js';
import { initNavTitleReplacer, refreshNavTitleReplacer } from '/js/nav-title-replacer.js';
import { initThemeToggle } from '/js/theme.js';

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
      if (isArticleDetailOr404Page()) return;
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
    if (window._currentSearchController) {
      window._currentSearchController.destroy();
      window._currentSearchController = null;
    }
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const fetchedTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
    const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
    const currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');
    if (fetchedMain && currentMain) currentMain.innerHTML = fetchedMain.innerHTML;
    else if (fetchedMain && !currentMain) {
      const container = document.querySelector('.container') || document.body;
      container.innerHTML = fetchedMain.innerHTML;
    }
    document.title = fetchedTitle;
    if (pushState) {
      try { window.history.pushState({ ajax: true }, fetchedTitle, url); } catch (err) { console.warn('[WARN] pushState 失败:', err); }
    }

    try {
      const headStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
      headStyles.forEach(h => {
        if (h.tagName.toLowerCase() === 'link') {
          const href = h.getAttribute('href') || h.href;
          if (!href) return;
          const nl = document.createElement('link');
          nl.rel = 'stylesheet';
          nl.href = href;
          document.head.appendChild(nl);
        } else if (h.tagName.toLowerCase() === 'style') {
          const ns = document.createElement('style');
          ns.textContent = h.textContent;
          document.head.appendChild(ns);
        }
      });
    } catch (e) {
      console.warn('[WARN] 注入样式时出错', e);
    }

    const bodyScripts = Array.from(doc.body.querySelectorAll('script'));
    const loadPromises = [];
    bodyScripts.forEach(s => {
      try {
        if (s.src) {
          const newS = document.createElement('script');
          if (s.type) newS.type = s.type;
          newS.src = s.src;
          newS.async = false;
          const p = new Promise(resolve => {
            newS.onload = () => resolve();
            newS.onerror = () => {
              console.warn('[WARN] 脚本加载失败:', s.src);
              resolve();
            };
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
      } catch (e) {
        console.warn('[WARN] 插入脚本时出错', e);
      }
    });
    if (loadPromises.length) {
      try { await Promise.all(loadPromises); } catch (e) { console.warn('[WARN] 等待脚本加载时发生错误', e); }
    }

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
    } catch (e) {
      console.warn('[WARN] 修复缺失 .container 时出错', e);
    }

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
          console.log('[INFO] Twikoo 初始化（自动）成功');
        }).catch(err => {
          console.warn('[WARN] Twikoo 自动初始化失败:', err);
        });
      }
    } catch (e) {
      console.warn('[WARN] 尝试初始化 Twikoo 时出错', e);
    }

    initNavigation();
    initMobileMenuToggle();
    initBackToTopButton();

    const personalCardContainer = document.getElementById('personal-card-container');
    if (personalCardContainer) {
      const { UIRenderer } = await import('/js/search-render.js');
      personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
    }

    const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
    await initPageFeatures(pageName);

    const currentPath = window.location.pathname;
    const newPath = new URL(url, window.location.href).pathname;
    if (currentPath !== newPath) {
      applyRandomBackgroundImage();
    }

    if (window.scrollRevealInstance) {
      window.scrollRevealInstance.refresh();
    } else {
      ensureScrollReveal();
      if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
    }

    refreshNavTitleReplacer();
    window.dispatchEvent(new CustomEvent('ajax:navigation', { detail: { url, page: pageName } }));
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
    if (isArticleDetailOr404Page()) return;
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

  window.addEventListener('popstate', function () {
    fetchAndReplaceContent(window.location.href, false);
  });
}

export async function initPageFeatures(pageName) {
  if (pageName === 'index') {
    updateDynamicGreeting();
    if (!window.greetingInterval) {
      window.greetingInterval = setInterval(updateDynamicGreeting, 60000);
    }
  } else if (pageName === 'articles' || pageName === 'works') {
    ensureScrollReveal();
    const { initSearchPage } = await import('/js/search-render.js');
    const refreshCallback = () => {
      if (window.scrollRevealInstance) {
        window.scrollRevealInstance.refresh();
      } else {
        ensureScrollReveal();
        if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
      }
    };
    await initSearchPage(pageName, refreshCallback);
  }

  if (typeof renderMathAndMermaid === 'function') {
    try {
      const container = document.getElementById('mainContent') || document.querySelector('main') || document.body;
      renderMathAndMermaid(container);
    } catch (e) {
      console.warn('[WARN] renderMathAndMermaid 执行失败', e);
    }
  }
}
