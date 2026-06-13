// /js/entry/main.js (完整版，修复个人信息卡片首次加载与闪烁问题)

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';
import { initUIEffects, refreshScrollReveal, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { getTimeBasedTheme, getPageNameFromPath, applyRandomBackgroundImage, startSiteAgeUpdater, updateFooterUpdateTime } from '/js/core/page-utils.js';
import { loadNavbar, loadFooter, initBackToTopButton, enableAjaxNavigation, initPageFeatures, fetchAndReplaceContent } from '/js/router/router.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { StatisticsManager, preloadCriticalJSON, registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import '/js/vendor/global-music-player.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';
import { renderPersonalCard } from '/js/ui/personal-card.js';   // 个人信息卡片(仅在此处导入即可)

let cookieConsentManager = null;

// 新增：清除所有 Service Worker 缓存并注销 SW
export async function clearAllServiceWorkerCache() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('[SW] 所有 Service Worker 缓存已清除并注销');
    window.location.reload();
  }
}

async function bootstrap() {
  ensureScrollReveal();

  const savedTheme = storageController.isAllowed() ? storageController.getItem(CONFIG.STORAGE_KEYS.THEME) : null;
  const initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  applyRandomBackgroundImage({ force: true, immediateColor: true });

  Promise.all([loadNavbar(), loadFooter()]).catch(console.warn);
  startSiteAgeUpdater(CONFIG.SITE_BIRTH);

  initBackToTopButton();
  enableAjaxNavigation();
  document.addEventListener('click', handleListItemClick);

  let currentPage = getPageNameFromPath(window.location.pathname) || 'index';
  if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
    currentPage = 'article-detail';
  }
  initPageFeatures(currentPage).catch(console.warn);

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

// 注册 Service Worker（开发环境跳过）
const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (!isDev) {
  registerServiceWorker();
} else {
  console.log('[Main] 开发环境，跳过 Service Worker 注册');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(r => r.unregister());
    });
  }
}

// 暴露全局辅助函数（供设置页面等调用）
window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;
window.clearAllServiceWorkerCache = clearAllServiceWorkerCache;