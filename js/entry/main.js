// ==================== /js/entry/main.js ====================
// 主入口：加载导航/页脚、应用主题、启动空闲任务，并按需加载模块

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

  await Promise.all([loadNavbar(), loadFooter()]);
  updateFooterUpdateTime().catch(() => { });

  const savedTheme = storageController.isAllowed() ? storageController.getItem(CONFIG.STORAGE_KEYS.THEME) : null;
  const initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
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

  await StatisticsManager.syncVisitRecord();
  startSiteAgeUpdater(CONFIG.SITE_BIRTH);
  applyRandomBackgroundImage();
  initBackToTopButton();
  enableAjaxNavigation();

  cookieConsentManager = new CookieConsentManager(storageController);

  let currentPage = getPageNameFromPath(window.location.pathname) || 'index';

  // 检测文章详情页（直接访问时）
  if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
    currentPage = 'article-detail';
  }

  // 在根目录的 HTML 文件（包括 /、/index.html、以及 /xxx.html），但排除 /404.html，渲染个人信息卡片
  try {
    const personalCardContainer = document.getElementById('personal-card-container');
    const targetPath = window.location.pathname;
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

  await initPageFeatures(currentPage);

  document.addEventListener('click', handleListItemClick);
  document.body.setAttribute('data-loaded', 'true');

  console.log('[Main] 初始化完成');
  initClarityOnConsent();

  // 监听无刷新导航，更新 Clarity 页面记录
  window.addEventListener('ajax:navigation', () => {
    updateClarityPage();
  });
  initFooterStats();
}

document.addEventListener('DOMContentLoaded', bootstrap);
registerServiceWorker();

window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;