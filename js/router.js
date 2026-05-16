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
    let currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');
    // 优先处理两栏布局：如果远端页面包含 .two-column-layout，则用远端的整个节点替换当前页面的对应节点
    try {
      const fetchedTwoCol = doc.querySelector('.two-column-layout');
      if (fetchedTwoCol) {
        const existingTwoCol = document.querySelector('.two-column-layout');
        const newTwoCol = fetchedTwoCol.cloneNode(true);
        try {
          // 如果当前页面已有个人信息卡片，优先将其 HTML 注入到新节点中，避免在替换时出现空白闪烁
          const existingPersonal = document.getElementById('personal-card-container');
          if (existingPersonal) {
            const newPersonal = newTwoCol.querySelector('#personal-card-container');
            if (newPersonal) {
              newPersonal.innerHTML = existingPersonal.innerHTML;
            }
          }
        } catch (e) {
          console.warn('[WARN] 复制个人信息卡片到新两栏节点时出错', e);
        }

        if (existingTwoCol) {
          existingTwoCol.replaceWith(newTwoCol);
        } else {
          const container = document.querySelector('.container') || document.body;
          container.insertAdjacentElement('afterbegin', newTwoCol);
        }
        // 更新 currentMain 指向新插入/替换后的主要内容区域，以便后续逻辑使用正确节点
        currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area') || document.querySelector('.two-column-layout');
      }
    } catch (err) {
      console.warn('[WARN] 处理两栏布局替换时出错', err);
    }

    if (fetchedMain && currentMain) {
      currentMain.innerHTML = fetchedMain.innerHTML;
    } else if (fetchedMain && !currentMain) {
      const container = document.querySelector('.container') || document.body;
      container.innerHTML = fetchedMain.innerHTML;
    } else {
      // 处理文章详情页（site 的文章页面通常没有 <main>，而是使用 .article-page-container / #articleBody）
      const fetchedArticle = doc.querySelector('.article-page-container') || doc.getElementById('articleBody') || doc.querySelector('.article-content-wrapper') || doc.querySelector('.article-page');
      if (fetchedArticle) {
        const replaceTarget = document.querySelector('.two-column-layout') || document.querySelector('.article-page-container') || document.getElementById('mainContent') || document.querySelector('main') || document.body;
        try {
          if (replaceTarget) {
            // 若当前页为两栏布局（如首页），用文章容器替换右侧内容区域或整个两栏节点
            if (replaceTarget.classList && replaceTarget.classList.contains('two-column-layout')) {
              // 将两栏布局整体替换为文章页的容器结构
              replaceTarget.innerHTML = fetchedArticle.outerHTML;
            } else {
              // 否则尝试替换 target 的内容为文章容器的 HTML
              replaceTarget.innerHTML = fetchedArticle.outerHTML || fetchedArticle.innerHTML;
            }
          }
        } catch (err) {
          console.warn('[WARN] 替换文章容器时出错', err);
        }
      }
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
          const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
          if (exists) return;
          const nl = document.createElement('link');
          nl.rel = 'stylesheet';
          nl.href = href;
          document.head.appendChild(nl);
        } else if (h.tagName.toLowerCase() === 'style') {
          // 比较样式文本避免重复注入（简单检测）
          const text = (h.textContent || '').trim();
          if (!text) return;
          const already = Array.from(document.querySelectorAll('style')).some(s => (s.textContent || '').trim() === text);
          if (already) return;
          const ns = document.createElement('style');
          ns.textContent = text;
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
          const src = s.getAttribute('src') || s.src;
          if (!src) return;
          // 若页面已存在相同 src 的 script，则跳过重复插入
          const existsScript = document.querySelector(`script[src="${src}"]`);
          if (existsScript) return;
          const newS = document.createElement('script');
          if (s.type) newS.type = s.type;
          newS.src = src;
          newS.async = false;
          const p = new Promise(resolve => {
            newS.onload = () => resolve();
            newS.onerror = () => {
              console.warn('[WARN] 脚本加载失败:', src);
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

    // 确保导航、侧边个人卡、页脚占位元素存在并在需要时加载它们
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

      // 如果目标页面中包含导航/页脚预填内容，则用远端文档的内容替换；否则调用加载函数确保内容存在
      const fetchedNavbar = doc.getElementById('navbar-placeholder');
      const currentNavbar = document.getElementById('navbar-placeholder');
      if (fetchedNavbar && fetchedNavbar.innerHTML && currentNavbar) {
        currentNavbar.innerHTML = fetchedNavbar.innerHTML;
        try {
          bindNavLinks();
          initMobileMenuToggle();
          initNavTitleReplacer();
        } catch (e) {
          console.warn('[WARN] 初始化导航交互时出错', e);
        }
      } else if (currentNavbar && currentNavbar.innerHTML && currentNavbar.innerHTML.trim()) {
        // 已存在导航内容，跳过重复加载
      } else {
        await loadNavbar();
      }

      const fetchedFooter = doc.getElementById('footer-placeholder');
      const currentFooter = document.getElementById('footer-placeholder');
      if (fetchedFooter && fetchedFooter.innerHTML && currentFooter) {
        currentFooter.innerHTML = fetchedFooter.innerHTML;
      } else {
        await loadFooter();
      }

      // 个人信息卡片将在下方统一渲染（避免重复渲染）
    } catch (e) {
      console.warn('[WARN] 处理全局占位元素时出错', e);
    }

    initNavigation();
    initMobileMenuToggle();
    initBackToTopButton();

    const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);

    // 在根目录的 HTML 文件（包括 /、/index.html、以及 /xxx.html），但排除 /404.html，渲染个人信息卡片
    try {
      const personalCardContainer = document.getElementById('personal-card-container');
      const targetPath = new URL(url, window.location.href).pathname;
      const isRootHtml = targetPath === '/' || targetPath === '/index.html' || (/^\/[^\/]+\.html$/.test(targetPath) && targetPath !== '/404.html');
      if (personalCardContainer) {
        if (isRootHtml) {
          const { UIRenderer } = await import('/js/search-render.js');
          personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
        } else {
          personalCardContainer.innerHTML = '';
        }
      }
    } catch (e) {
      console.warn('[WARN] 渲染个人信息卡片时出错', e);
    }
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
  } else if (pageName === 'archive') {
    ensureScrollReveal();
    const { initArchivePage } = await import('/js/archive.js');
    const refreshCallback = () => {
      if (window.scrollRevealInstance) {
        window.scrollRevealInstance.refresh();
      } else {
        ensureScrollReveal();
        if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
      }
    };
    await initArchivePage(refreshCallback);
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
