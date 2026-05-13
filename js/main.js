// ==================== /js/main.js ====================
// 主入口文件：加载导航/页脚、应用主题、启动空闲任务，并按需加载模块
// 现已支持文章详情页的无刷新导航

import { CONFIG, storageController, perf, CookieConsentManager, Utils } from '/js/core.js';
import { initUIEffects, refreshScrollReveal, getScrollReveal, ensureScrollReveal } from '/js/ui-effects.js';
import { initNavTitleReplacer, refreshNavTitleReplacer } from '/js/nav-title-replacer.js';

// ==================== 全局变量和工具函数 ====================
let cookieConsentManager = null;
let siteAgeInterval = null;
let scrollRevealInstance = null;
let currentArticleManager = null; // 保存当前文章管理实例

function getTimeBasedTheme() {
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 18) ? 'light' : 'dark';
}

function getPageNameFromPath(pathname) { 
  const name = pathname.split('/').pop() || 'index'; 
  return name.replace('.html', '') || 'index'; 
}

function isArticleDetailPage(url) { 
  try { 
    const path = new URL(url, window.location.href).pathname;
    const name = path.split('/').pop() || ''; 
    if (path.includes('/articles/') && name && name !== 'articles.html') return true; 
    return false; 
  } catch (e) { 
    return false; 
  } 
}

function isCurrentArticleDetailPage() {
  try { 
    const path = window.location.pathname || ''; 
    const name = path.split('/').pop() || ''; 
    if (path.includes('/articles/') && name && name !== 'articles.html') return true; 
    return false; 
  } catch (e) { 
    return false; 
  } 
}

function isSameOrigin(href) { 
  try { 
    const url = new URL(href, window.location.href); 
    return url.origin === window.location.origin; 
  } catch { 
    return false; 
  } 
}

function updateDynamicGreeting() {
  const greetingEl = document.getElementById('dynamic-greeting');
  if (!greetingEl) return;
  const msg = Utils.getGreetingMessage();
  greetingEl.textContent = msg;
  greetingEl.style.fontWeight = 'bold';
}

function applyRandomBackgroundImage({ force = false } = {}) {
  if (!Array.isArray(CONFIG.BACKGROUND_IMAGES) || CONFIG.BACKGROUND_IMAGES.length === 0) return;
  const randomIndex = Math.floor(Math.random() * CONFIG.BACKGROUND_IMAGES.length);
  const imageUrl = CONFIG.BACKGROUND_IMAGES[randomIndex];
  if (!force && document.body.style.backgroundImage.includes(imageUrl)) return;

  const apply = (url) => {
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.classList.remove('background-loading');
  };

  const handleError = (error) => {
    document.body.classList.remove('background-loading');
    console.warn('[WARN] 背景图片加载失败:', error);
  };

  const load = () => {
    const img = new Image();
    img.onload = () => apply(imageUrl);
    img.onerror = () => handleError(new Error(`背景图加载失败：${imageUrl}`));
    img.src = imageUrl;
  };

  document.body.classList.add('background-loading');
  if ('requestIdleCallback' in window) {
    requestIdleCallback(load, { timeout: 1000 });
  } else {
    setTimeout(load, 200);
  }
}

function startSiteAgeUpdater() {
  if (siteAgeInterval) {
    clearInterval(siteAgeInterval);
    siteAgeInterval = null;
  }
  const BIRTH_DATE = CONFIG.SITE_BIRTH;
  function updateAge() {
    const ageSpan = document.getElementById('site-age');
    if (!ageSpan) return;
    const now = Date.now();
    const diff = now - BIRTH_DATE.getTime();
    if (diff < 0) {
      ageSpan.innerText = '……等等，结果是负数？？！';
      return;
    }
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const ageStr = `${days}天${hours.toString().padStart(2, '0')}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒`;
    ageSpan.innerText = ageStr;
  }
  updateAge();
  siteAgeInterval = setInterval(updateAge, 1000);
}

async function updateFooterUpdateTime() {
  const updateSpan = document.getElementById('footer-update-date'); 
  if (!updateSpan) return;
  try { 
    const response = await fetch(CONFIG.API.STATISTICS); 
    if (!response.ok) throw new Error('无法获取统计信息'); 
    const stats = await response.json(); 
    let fullTime = stats.last_updated_full; 
    let dateOnly = stats.last_updated; 
    if (fullTime) { 
      const relative = Utils.formatRelativeTime(fullTime); 
      updateSpan.textContent = relative; 
      const absDate = new Date(fullTime); 
      const formatted = `${absDate.getFullYear()}年${(absDate.getMonth() + 1).toString().padStart(2, '0')}月${absDate.getDate().toString().padStart(2, '0')}日 ${absDate.getHours().toString().padStart(2, '0')}:${absDate.getMinutes().toString().padStart(2, '0')}:${absDate.getSeconds().toString().padStart(2, '0')}`;
      updateSpan.setAttribute('title', `最后统计时间：${formatted}`);
    } else if (dateOnly) { 
      updateSpan.textContent = dateOnly; 
      updateSpan.setAttribute('title', '数据最后更新日期'); 
    } else { 
      updateSpan.textContent = '未知'; 
    } 
  } catch (error) { 
    console.warn('[WARN] 加载统计时间失败:', error); 
    updateSpan.textContent = '获取失败'; 
    updateSpan.setAttribute('title', '无法加载 statistics.json'); 
  }
}

// ==================== 导航相关函数 ====================
async function loadNavbar() {
  try {
    const response = await fetch('/navbar.html');
    if (!response.ok) throw new Error('加载导航栏失败');
    const navbarHTML = await response.text();
    const placeholder = document.getElementById('navbar-placeholder');
    if (placeholder) {
      placeholder.innerHTML = navbarHTML;
      initThemeToggle();
      initMobileMenuToggle();
      bindNavLinks();
      initNavigation();
      initPopstate();
      initNavTitleReplacer();
    } else console.warn('[WARN] 导航栏占位符未找到');
  } catch (error) { console.error('[ERROR] 加载导航栏出错:', error); }
}

async function loadFooter() {
  try {
    const response = await fetch('/footer.html');
    if (!response.ok) throw new Error('加载页脚失败');
    const footerHTML = await response.text();
    const placeholder = document.getElementById('footer-placeholder');
    if (placeholder) {
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
      if (scripts.length === 0) return;
      let loadedCount = 0;
      const tryInvokeRender = () => {
        if (typeof renderMathAndMermaid === 'function') try {
          const container = document.getElementById('articleBody') || document.getElementById('mainContent') || document.body;
          renderMathAndMermaid(container);
        } catch (e) { console.warn('[WARN] 调用 renderMathAndMermaid 失败', e); }
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
          newScript.onload = () => {
            loadedCount++;
            loadNextScript(index + 1);
          };
          newScript.onerror = () => {
            console.warn('[WARN] 脚本加载失败:', src);
            loadedCount++;
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
    } else {
      console.warn('[WARN] 页脚占位符未找到');
    }
  } catch (error) { console.error('[ERROR] 加载页脚错误:', error); }
}

function initThemeToggle() {
  const checkbox = document.getElementById('theme-toggle-checkbox');
  if (!checkbox) return;
  const setTheme = (theme, updateCheckbox = true) => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    if (currentTheme === theme) return;
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${theme === 'dark' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    setTimeout(() => {
      overlay.remove();
      document.body.style.transition = '';
    }, 400);
    root.setAttribute('data-theme', theme);
    if (storageController.isAllowed()) {
      storageController.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
    }
    if (updateCheckbox) checkbox.checked = (theme === 'dark');
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  };
  const handleChange = (e) => { setTheme(e.target.checked ? 'dark' : 'light', false); };
  checkbox.addEventListener('change', handleChange);
  let savedTheme = null;
  if (storageController.isAllowed()) {
    savedTheme = storageController.getItem(CONFIG.STORAGE_KEYS.THEME);
  }
  let initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  checkbox.checked = (initialTheme === 'dark');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!savedTheme) setTheme(getTimeBasedTheme(), true);
  });
}

function initMobileMenuToggle() {
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
      if (isActive) {
        nav.classList.remove('active');
        toggle.classList.remove('active');
      } else {
        nav.classList.add('active');
        toggle.classList.add('active');
      }
      return;
    }
    const isNavItem = e.target.closest('.nav-item');
    if (isNavItem && nav.classList.contains('active')) { closeMenu(); return; }
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

function bindNavLinks() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  if (!navItems || navItems.length === 0) return;
  navItems.forEach(item => {
    if (item._navHandler) item.removeEventListener('click', item._navHandler);
    const handler = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const href = item.getAttribute('href');
      if (typeof fetchAndReplaceContent === 'function') fetchAndReplaceContent(href || `/${item.dataset.page}.html`, true);
    };
    item.addEventListener('click', handler);
    item._navHandler = handler;
  });
}

function initNavigation() {
  bindNavLinks();
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  let currentPage = getPageNameFromPath(window.location.pathname);
  if (isCurrentArticleDetailPage()) currentPage = 'articles';
  navItems.forEach(item => {
    const page = item.dataset.page;
    if (page === currentPage) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function initPopstate() {
  if (window._popstateInitialized) return;
  window._popstateInitialized = true;
  window.addEventListener('popstate', () => {
    if (typeof fetchAndReplaceContent === 'function') fetchAndReplaceContent(window.location.href, false);
  });
}

function initBackToTopButton() {
  const btn = document.getElementById('backToTopBtn');
  if (!btn) return;
  const threshold = 300;
  window.addEventListener('scroll', Utils.throttle(() => { btn.classList.toggle('show', window.scrollY > threshold); }, 100), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ==================== 文章详情页专用替换与初始化 ====================
function destroyCurrentArticleManager() {
  if (currentArticleManager && typeof currentArticleManager.destroy === 'function') {
    currentArticleManager.destroy();
  }
  currentArticleManager = null;
}

async function initArticlePageFromDOM(doc, targetUrl) {
  // 获取新页面的文章容器
  const newArticleContainer = doc.querySelector('.article-page-container');
  if (!newArticleContainer) {
    console.warn('[WARN] 目标页面不包含文章容器，降级为普通替换');
    return false;
  }

  // 查找或创建当前页面的文章容器
  let currentArticleContainer = document.querySelector('.article-page-container');
  const twoColumnLayout = document.querySelector('.two-column-layout');
  
  if (!currentArticleContainer) {
    // 当前页面不是文章页，需要将文章容器插入到合适位置（替换双栏布局）
    if (twoColumnLayout) {
      twoColumnLayout.replaceWith(newArticleContainer.cloneNode(true));
    } else {
      const mainArea = document.querySelector('.main-content-area') || document.querySelector('main');
      if (mainArea) {
        mainArea.innerHTML = '';
        mainArea.appendChild(newArticleContainer.cloneNode(true));
      } else {
        document.body.appendChild(newArticleContainer.cloneNode(true));
      }
    }
    currentArticleContainer = document.querySelector('.article-page-container');
  } else {
    // 直接替换内部内容，保留容器
    currentArticleContainer.innerHTML = newArticleContainer.innerHTML;
  }

  // 更新页面标题
  const fetchedTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
  document.title = fetchedTitle;

  // 销毁旧的文章管理器
  destroyCurrentArticleManager();
  
  // 确保全局变量 ARTICLE_HEADINGS 被重新生成（如果有）
  if (window.ARTICLE_HEADINGS) delete window.ARTICLE_HEADINGS;
  
  // 重新初始化文章特有功能（使用改进后的 ArticlePageManager）
  if (window.ArticlePageManager) {
    currentArticleManager = new window.ArticlePageManager();
    // 确保在文章内容完全渲染后执行额外初始化
    if (currentArticleManager.initImageFeatures) currentArticleManager.initImageFeatures();
    if (currentArticleManager.initCodeBlocks) currentArticleManager.initCodeBlocks();
    if (currentArticleManager.addImageAltCaptions) currentArticleManager.addImageAltCaptions();
  } else {
    console.warn('[WARN] ArticlePageManager 未加载，将尝试动态导入');
    // 回退：手动触发常见功能
    if (typeof window.generateArticleTOC === 'function') window.generateArticleTOC();
    document.querySelectorAll('pre code').forEach(block => {
      // 简单复制按钮
      if (!block.parentElement.querySelector('.code-copy-btn')) {
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.textContent = '复制';
        btn.onclick = () => {
          navigator.clipboard.writeText(block.innerText);
          btn.textContent = '已复制';
          setTimeout(() => btn.textContent = '复制', 1500);
        };
        block.parentElement.style.position = 'relative';
        block.parentElement.appendChild(btn);
      }
    });
  }

  // 重新初始化 Twikoo 评论（如果存在）
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
        console.log('[INFO] Twikoo 初始化成功');
      }).catch(err => console.warn('[WARN] Twikoo 初始化失败:', err));
    }
  } catch (e) { console.warn('[WARN] Twikoo 加载错误', e); }

  // 刷新滚动揭示效果
  if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  }
  
  return true;
}

// ==================== 核心无刷新导航函数（改进版） ====================
async function fetchAndReplaceContent(url, pushState = true) {
  try {
    // 清理搜索控制器实例（如果存在）
    if (window._currentSearchController) {
      window._currentSearchController.destroy();
      window._currentSearchController = null;
    }
    
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    
    const isTargetArticle = isArticleDetailPage(url);
    const isCurrentArticle = isCurrentArticleDetailPage();
    
    // 根据情况选择替换策略
    let replaceSuccess = false;
    if (isTargetArticle) {
      // 目标页面是文章详情页
      replaceSuccess = await initArticlePageFromDOM(doc, url);
      if (!replaceSuccess) {
        // 降级到普通替换
        const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
        const currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');
        if (fetchedMain && currentMain) currentMain.innerHTML = fetchedMain.innerHTML;
      }
    } else {
      // 目标页面是普通页面（首页、文章列表、作品集等）
      // 如果当前是文章页，需要先移除文章容器，确保显示普通双栏布局
      if (isCurrentArticle) {
        const articleContainer = document.querySelector('.article-page-container');
        if (articleContainer) articleContainer.remove();
        // 确保双栏布局容器存在
        let twoColumnLayout = document.querySelector('.two-column-layout');
        if (!twoColumnLayout) {
          twoColumnLayout = document.createElement('div');
          twoColumnLayout.className = 'two-column-layout';
          const mainArea = document.querySelector('.main-content-area') || document.querySelector('main');
          if (mainArea) {
            mainArea.innerHTML = '';
            mainArea.appendChild(twoColumnLayout);
          } else {
            document.body.appendChild(twoColumnLayout);
          }
        }
        // 重新填充侧边栏和主内容区
        const sidebar = twoColumnLayout.querySelector('.sidebar-profile');
        const mainContent = twoColumnLayout.querySelector('.main-content-area');
        if (!sidebar) {
          const newSidebar = document.createElement('aside');
          newSidebar.className = 'sidebar-profile';
          newSidebar.innerHTML = '<div id="personal-card-container"></div>';
          twoColumnLayout.prepend(newSidebar);
        }
        if (!mainContent) {
          const newMain = document.createElement('main');
          newMain.className = 'main-content-area';
          newMain.innerHTML = '<div class="container"></div>';
          twoColumnLayout.appendChild(newMain);
        }
      }
      
      // 执行普通内容替换
      const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
      const currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');
      if (fetchedMain && currentMain) {
        currentMain.innerHTML = fetchedMain.innerHTML;
      } else {
        const container = document.querySelector('.container') || document.body;
        const newContent = doc.querySelector('.container') || doc.querySelector('main');
        if (newContent) container.innerHTML = newContent.innerHTML;
      }
      
      // 重新生成个人卡片（如果存在）
      const personalCardContainer = document.getElementById('personal-card-container');
      if (personalCardContainer && window.UIRenderer) {
        personalCardContainer.innerHTML = window.UIRenderer.generatePersonalCardHTML();
      }
      
      // 重新初始化普通页面功能（搜索等）
      const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
      if (pageName === 'articles' || pageName === 'works') {
        const { initSearchPage } = await import('/js/search-render.js');
        const refreshCallback = () => {
          if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
        };
        await initSearchPage(pageName, refreshCallback);
      } else if (pageName === 'index') {
        updateDynamicGreeting();
        if (!window.greetingInterval) {
          window.greetingInterval = setInterval(updateDynamicGreeting, 60000);
        }
      }
    }
    
    // 更新标题
    const fetchedTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
    document.title = fetchedTitle;
    
    // 更新URL状态
    if (pushState) {
      try {
        window.history.pushState({ ajax: true }, fetchedTitle, url);
      } catch (err) {
        console.warn('[WARN] pushState 失败:', err);
      }
    }
    
    // 重新注入样式（避免重复，简单处理）
    try {
      const headStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
      headStyles.forEach(h => {
        if (h.tagName.toLowerCase() === 'link') {
          const href = h.getAttribute('href') || h.href;
          if (!href) return;
          if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href === href)) {
            const nl = document.createElement('link');
            nl.rel = 'stylesheet';
            nl.href = href;
            document.head.appendChild(nl);
          }
        } else if (h.tagName.toLowerCase() === 'style') {
          const ns = document.createElement('style');
          ns.textContent = h.textContent;
          document.head.appendChild(ns);
        }
      });
    } catch (e) { console.warn('[WARN] 注入样式时出错', e); }
    
    // 重新绑定导航栏激活状态
    initNavigation();
    initMobileMenuToggle();
    initBackToTopButton();
    
    // 重新渲染数学公式和图表
    if (typeof renderMathAndMermaid === 'function') {
      try {
        const container = document.getElementById('mainContent') || document.querySelector('main') || document.body;
        renderMathAndMermaid(container);
      } catch (e) { console.warn('[WARN] renderMathAndMermaid 执行失败', e); }
    }
    
    // 更新背景图片（可选）
    const currentPath = window.location.pathname;
    const newPath = new URL(url, window.location.href).pathname;
    if (currentPath !== newPath) {
      applyRandomBackgroundImage();
    }
    
    // 刷新滚动揭示（确保新生成的列表项能被观察到）
    if (window.scrollRevealInstance) {
      window.scrollRevealInstance.refresh();
    } else {
      // 如果没有实例，则创建
      ensureScrollReveal();
      if (window.scrollRevealInstance) window.scrollRevealInstance.refresh();
    }

    refreshNavTitleReplacer();
    
    window.dispatchEvent(new CustomEvent('ajax:navigation', { detail: { url } }));
    return true;
  } catch (e) {
    console.error('[ERROR] 无刷新导航加载失败:', e);
    return false;
  }
}

function enableAjaxNavigation() {
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
  
  window.addEventListener('popstate', function (e) {
    fetchAndReplaceContent(window.location.href, false);
  });
}

// 页面功能初始化（按需加载 search-render）
async function initPageFeatures(pageName) {
  if (pageName === 'index') {
    updateDynamicGreeting();
    if (!window.greetingInterval) {
      window.greetingInterval = setInterval(updateDynamicGreeting, 60000);
    }
  } else if (pageName === 'articles' || pageName === 'works') {
    // 确保滚动揭示实例已存在（在列表生成前）
    ensureScrollReveal();
    
    // 动态加载搜索渲染模块
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
    } catch (e) { console.warn('[WARN] renderMathAndMermaid 执行失败', e); }
  }
}

// 列表项点击处理
function handleListItemClick(e) {
  const item = e.target.closest('.list-item, .recent-item');
  if (!item) return;
  const type = item.dataset.type;
  if (type === 'work') {
    const workInfoRaw = item.dataset.workInfo;
    if (workInfoRaw) {
      try {
        const workInfo = JSON.parse(decodeURIComponent(workInfoRaw));
        showWorkDetails(workInfo);
      } catch (e) { console.error('[ERROR] 解析作品信息失败', e); }
    } else { console.warn('[WARN] 未找到作品信息，无法展示详情'); }
  } else if (type === 'article') {
    const itemUrl = item.dataset.url;
    if (itemUrl) {
      // 支持无刷新导航的文章跳转
      if (isSameOrigin(itemUrl)) {
        fetchAndReplaceContent(itemUrl, true);
      } else {
        window.open(itemUrl, '_blank');
      }
    } else console.warn('[WARN] 文章链接无效');
  }
}

function showWorkDetails(work) {
  if (window.currentModalClose) window.currentModalClose();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  const envelope = document.createElement('div');
  envelope.className = 'work-details-envelope';
  const tags = work.tags || [];
  const tagsHtml = tags.length ? `<div class="work-details-tag"><strong>标签:</strong>${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>` : '';
  envelope.innerHTML = `
    <div class="work-details-close">✕</div>
    <div class="work-details-content">
      <h2 class="work-details-title">${Utils.escapeHtml(work.title)}</h2>
      <p class="work-details-description">${Utils.escapeHtml(work.description || '')}</p>
      ${tagsHtml}
      ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
    </div>
  `;
  document.body.appendChild(envelope);
  const closeModal = () => {
    if (envelope.classList.contains('closing')) return;
    envelope.classList.add('closing');
    overlay.classList.remove('active');
    setTimeout(() => {
      envelope.remove();
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      if (window.currentModalClose === closeModal) window.currentModalClose = null;
    }, 400);
  };
  const escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', closeModal);
  const closeBtn = envelope.querySelector('.work-details-close');
  closeBtn.addEventListener('click', closeModal);
  window.currentModalClose = closeModal;
  requestAnimationFrame(() => {
    envelope.classList.add('active');
    overlay.classList.add('active');
  });
}

// 图片懒加载（已在原 main 中保留）
class LazyImageLoader {
  static init() {
    if (!('IntersectionObserver' in window)) {
      console.warn('[LazyImageLoader] 浏览器不支持 IntersectionObserver，跳过懒加载');
      return;
    }
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('loaded');
            delete img.dataset.src;
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '50px 0px', threshold: 0.01 });
    const lazyImages = document.querySelectorAll('img[data-src]');
    lazyImages.forEach(img => imageObserver.observe(img));
  }
}

// 全局图片查看器（已存在）
class GlobalImageManager {
  static init() {
    document.addEventListener('click', (e) => {
      let img = e.target.closest('img');
      if (!img) return;
      if (img.closest('.no-image-viewer') || img.classList.contains('no-image-viewer')) return;
      if (img.closest('.modern-image-viewer')) return;
      if (img.closest('.list-item, .recent-item')) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.ImageViewer === 'undefined') {
        const script = document.createElement('script');
        script.src = '/js/image-viewer.js';
        script.onload = () => this.openViewerForImage(img);
        document.head.appendChild(script);
      } else {
        this.openViewerForImage(img);
      }
    });
  }
  static openViewerForImage(clickedImg) {
    let container = clickedImg.closest('#mainContent, .article-body, .post-content, .list-item, main, .container, body');
    if (!container) container = document.body;
    const allImgs = container.querySelectorAll('img:not(.no-image-viewer):not(.viewer-image)');
    const gallery = [];
    let currentIndex = 0;
    allImgs.forEach((img, idx) => {
      let src = img.dataset.src || img.src;
      if (!src || src.startsWith('data:') && src.length < 100) return;
      if (img === clickedImg) currentIndex = gallery.length;
      gallery.push({ src: src, alt: img.alt || img.title || '' });
    });
    if (gallery.length === 0) return;
    const needPreload = clickedImg.dataset.src && (!clickedImg.src || clickedImg.src === '');
    if (needPreload) {
      const tempImg = new Image();
      tempImg.onload = () => {
        clickedImg.src = clickedImg.dataset.src;
        clickedImg.classList.remove('lazy-loading');
        clickedImg.classList.add('loaded');
        delete clickedImg.dataset.src;
        new window.ImageViewer(gallery, currentIndex);
      };
      tempImg.src = clickedImg.dataset.src;
    } else {
      new window.ImageViewer(gallery, currentIndex);
    }
  }
}

// 统计管理器（简化）
class StatisticsManager {
  static async syncVisitRecord() {
    let stats;
    try {
      const response = await fetch(`${CONFIG.API.STATISTICS}?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error(response.statusText);
      stats = await response.json();
    } catch (error) {
      console.warn('[WARN] 加载 statistics.json 失败:', error);
      return { forceDarkTheme: false };
    }
    if (!storageController.isAllowed()) return { forceDarkTheme: false };
    const version = stats.version != null ? String(stats.version).trim() : null;
    const cached = this.getRecord();
    const previousVisit = cached.lastVisit ? Number(cached.lastVisit) : null;
    const previousVersion = cached.version || null;
    const now = Date.now();
    const currentVersion = version || '未知版本';
    const missingLocalVersion = !cached.version;
    const forceDarkTheme = false;
    this.saveRecord({ version: version || previousVersion || '', lastVisit: now });
    const awayMs = previousVisit ? now - previousVisit : null;
    if (!awayMs || awayMs >= 300 * 1000) {
      this.showWelcomeOverlay({ previousVisit, previousVersion, currentVersion, missingLocalVersion, hasVersion: !!version });
    }
    return { forceDarkTheme };
  }
  static getRecord() {
    if (!storageController.isAllowed()) return {};
    try {
      return JSON.parse(storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD) || '{}') || {};
    } catch { return {}; }
  }
  static saveRecord(record) {
    if (!storageController.isAllowed()) return;
    storageController.setItem(CONFIG.STORAGE_KEYS.VISIT_RECORD, JSON.stringify(record));
  }
  static formatAwayTime(milliseconds) {
    if (!milliseconds || milliseconds < 0) return '刚刚离开';
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const remain = minutes % 60;
      return `${hours} 小时${remain ? ` ${remain} 分钟` : ''}`;
    }
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days} 天${remainHours ? ` ${remainHours} 小时` : ''}`;
  }
  static showWelcomeOverlay({ previousVisit, previousVersion, currentVersion, hasVersion, missingLocalVersion }) {
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay active';
    const awayText = previousVisit ? `你已经离开 ${this.formatAwayTime(Date.now() - previousVisit)} 了，欢迎回来！` : '欢迎来到本站，这是你第一次访问。';
    const versionText = previousVersion && previousVersion !== currentVersion ? `在你离开的这段时间里，网站已从版本编号 ${previousVersion} 更新到版本编号 ${currentVersion}` : `当前版本编号：${currentVersion}`;
    const warningText = missingLocalVersion ? '<p class="welcome-overlay-warning">已根据当前时间自动选择主题~</p>' : '';
    const titleText = `${Utils.getGreetingMessage()}<br>欢迎回来`;
    overlay.innerHTML = `
      <div class="welcome-overlay-hero">
        <div class="welcome-overlay-eyebrow">WELCOME</div>
        <h1 class="welcome-overlay-title">${titleText}</h1>
        <p class="welcome-overlay-copy">${awayText}</p>
        <p class="welcome-overlay-copy">${versionText}</p>
        ${warningText}
        <p class="welcome-overlay-note">点击任意位置继续浏览</p>
      </div>
    `;
    const removeOverlay = () => {
      if (!overlay.parentNode) return;
      overlay.classList.remove('active');
      document.body.classList.remove('welcome-active');
      setTimeout(() => overlay.remove(), 350);
    };
    overlay.addEventListener('click', removeOverlay);
    document.body.classList.add('welcome-active');
    document.body.appendChild(overlay);
  }
}

function preloadCriticalJSON() {
  fetch(CONFIG.API.WORKS, { cache: 'force-cache' }).catch(() => {});
  fetch(CONFIG.API.ARTICLES, { cache: 'force-cache' }).catch(() => {});
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/js/sw.js').then(registration => {
        console.log('[SW] Service Worker 注册成功，作用域:', registration.scope);
      }).catch(error => {
        console.warn('[SW] Service Worker 注册失败:', error);
      });
    });
  }
}

// ==================== DOMContentLoaded 主入口 ====================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 提前初始化滚动揭示实例（必须在任何列表生成之前）
  ensureScrollReveal();
  
  // 2. 加载导航栏和页脚
  await Promise.all([loadNavbar(), loadFooter()]);
  updateFooterUpdateTime().catch(() => {});
  
  // 3. 应用主题（已通过 initThemeToggle 在 loadNavbar 中调用）
  // 确保主题已应用
  const savedTheme = storageController.isAllowed() ? storageController.getItem(CONFIG.STORAGE_KEYS.THEME) : null;
  const initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  
  // 4. 启动空闲任务（光标、外链管理器、预加载等）
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // 初始化 UI 特效（光标、外链管理器，滚动揭示已提前初始化）
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
    }, { timeout: 3000 });
  } else {
    setTimeout(() => {
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
    }, 500);
  }
  
  // 5. 其他初始化（不阻塞）
  await StatisticsManager.syncVisitRecord();
  startSiteAgeUpdater();
  applyRandomBackgroundImage();
  initBackToTopButton();
  enableAjaxNavigation();
  
  // 6. 初始化 Cookie 同意管理器
  cookieConsentManager = new CookieConsentManager(storageController);
  
  // 7. 处理个人卡片
  const personalCardContainer = document.getElementById('personal-card-container');
  if (personalCardContainer) {
    const { UIRenderer } = await import('/js/search-render.js');
    personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
    window.UIRenderer = UIRenderer; // 暴露给全局以便后续使用
  }
  
  // 8. 初始化当前页面功能（此时滚动揭示实例已存在）
  const currentPage = getPageNameFromPath(window.location.pathname) || 'index';
  if (isCurrentArticleDetailPage()) {
    // 文章页初始化：确保 ArticlePageManager 已加载
    if (window.ArticlePageManager) {
      currentArticleManager = new window.ArticlePageManager();
    } else {
      // 动态加载 article.js
      const script = document.createElement('script');
      script.src = '/js/article.js';
      script.onload = () => {
        currentArticleManager = new window.ArticlePageManager();
      };
      document.head.appendChild(script);
    }
  } else {
    await initPageFeatures(currentPage);
  }
  
  // 9. 全局列表项点击委托
  document.addEventListener('click', handleListItemClick);
  
  // 10. 标记已加载
  document.body.setAttribute('data-loaded', 'true');
  console.log('[Main] 初始化完成');
});

registerServiceWorker();

// 导出全局函数供其他脚本使用
window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;
window.destroyCurrentArticleManager = destroyCurrentArticleManager;