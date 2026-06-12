// /js/entry/main.js (关键修改部分)

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';
import { initUIEffects, refreshScrollReveal, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { getTimeBasedTheme, getPageNameFromPath, applyRandomBackgroundImage, startSiteAgeUpdater, updateFooterUpdateTime } from '/js/core/page-utils.js';
import { loadNavbar, loadFooter, initBackToTopButton, enableAjaxNavigation, initPageFeatures, fetchAndReplaceContent } from '/js/router/router.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { StatisticsManager, preloadCriticalJSON, registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import '/js/vendor/global-music-player.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';

let cookieConsentManager = null;

async function bootstrap() {
  ensureScrollReveal();

  // 1. 立即应用主题（无等待）
  const savedTheme = storageController.isAllowed() ? storageController.getItem(CONFIG.STORAGE_KEYS.THEME) : null;
  const initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // 2. 立即设置背景纯色（避免白屏）
  // 该函数会立刻在 body 上添加一个带有背景色的覆盖层（图片加载前纯色）
  applyRandomBackgroundImage({ force: true, immediateColor: true });

  // 3. 渲染个人卡片（不依赖导航栏）
  try {
    const personalCardContainer = document.getElementById('personal-card-container');
    const targetPath = window.location.pathname;
    const isRootHtml = targetPath === '/' || targetPath === '/index.html' || (/^\/[^\/]+\.html$/.test(targetPath) && targetPath !== '/404.html');
    if (personalCardContainer && isRootHtml) {
      const { UIRenderer } = await import('/js/pages/search-render.js');
      personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
    }
  } catch (e) { console.warn('[Main] 渲染个人信息卡片时出错', e); }

  // 4. 后台加载导航栏和页脚（不阻塞首屏）
  // 同时启动站点年龄计时器
  Promise.all([loadNavbar(), loadFooter()]).catch(console.warn);
  startSiteAgeUpdater(CONFIG.SITE_BIRTH);

  // 5. 启用全局交互（立即启用，不依赖导航栏完成）
  initBackToTopButton();
  enableAjaxNavigation();
  document.addEventListener('click', handleListItemClick);

  // 6. 初始化当前页面功能（异步，但不会阻塞用户点击链接等）
  let currentPage = getPageNameFromPath(window.location.pathname) || 'index';
  if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
    currentPage = 'article-detail';
  }
  // 不等待管理器初始化完成，让用户先看到内容
  initPageFeatures(currentPage).catch(console.warn);

  // 7. 空闲时执行次要任务
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
      StatisticsManager.syncVisitRecord().catch(console.warn);
      updateFooterUpdateTime().catch(console.warn);
      initFooterStats().catch(console.warn);
    }, { timeout: 3000 });
  } else {
    setTimeout(() => {
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
      StatisticsManager.syncVisitRecord().catch(console.warn);
      updateFooterUpdateTime().catch(console.warn);
      initFooterStats().catch(console.warn);
    }, 500);
  }

  cookieConsentManager = new CookieConsentManager(storageController);
  initClarityOnConsent();
  window.addEventListener('ajax:navigation', () => updateClarityPage());

  document.body.setAttribute('data-loaded', 'true');
  console.log('[Main] 初始化完成（快速模式）');
}

document.addEventListener('DOMContentLoaded', bootstrap);
registerServiceWorker();

// 暴露全局函数供部分页面调用
window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;