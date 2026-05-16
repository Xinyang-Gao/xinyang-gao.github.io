// ==================== /js/main.js ====================
// 主入口：加载导航/页脚、应用主题、启动空闲任务，并按需加载模块

import { CONFIG, storageController, CookieConsentManager } from '/js/core.js';
import { initUIEffects, refreshScrollReveal, ensureScrollReveal } from '/js/ui-effects.js';
import { getTimeBasedTheme, getPageNameFromPath, applyRandomBackgroundImage, startSiteAgeUpdater, updateFooterUpdateTime } from '/js/page-utils.js';
import { loadNavbar, loadFooter, initBackToTopButton, enableAjaxNavigation, initPageFeatures, fetchAndReplaceContent } from '/js/router.js';
import { LazyImageLoader, GlobalImageManager } from '/js/image-manager.js';
import { StatisticsManager, preloadCriticalJSON, registerServiceWorker } from '/js/site-state.js';
import { handleListItemClick } from '/js/list-events.js';

let cookieConsentManager = null;

async function bootstrap() {
  ensureScrollReveal();

  await Promise.all([loadNavbar(), loadFooter()]);
  updateFooterUpdateTime().catch(() => {});

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

  const personalCardContainer = document.getElementById('personal-card-container');
  if (personalCardContainer) {
    const { UIRenderer } = await import('/js/search-render.js');
    personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
  }

  const currentPage = getPageNameFromPath(window.location.pathname) || 'index';
  await initPageFeatures(currentPage);

  document.addEventListener('click', handleListItemClick);
  document.body.setAttribute('data-loaded', 'true');

  console.log('[Main] 初始化完成');
}

document.addEventListener('DOMContentLoaded', bootstrap);
registerServiceWorker();

window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;
