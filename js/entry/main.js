// /js/entry/main.js (优化 LCP 版本)

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';
import { initUIEffects, refreshScrollReveal, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { getTimeBasedTheme, getPageNameFromPath, applyRandomBackgroundImage, startSiteAgeUpdater, updateFooterUpdateTime } from '/js/core/page-utils.js';
import { loadNavbar, loadFooter, initBackToTopButton, enableAjaxNavigation, initPageFeatures, fetchAndReplaceContent } from '/js/router/router.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { StatisticsManager, preloadCriticalJSON, registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import '/js/vendor/global-music-player.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';
import { renderPersonalCard } from '/js/ui/personal-card.js';

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

// ========== LCP 优化：动态添加预连接和预加载 ==========
function addOptimizationLinks() {
  // 预连接背景图片域名 (Bing)
  const preconnectBing = document.createElement('link');
  preconnectBing.rel = 'preconnect';
  preconnectBing.href = 'https://cn.bing.com';
  document.head.appendChild(preconnectBing);

  // 预连接 API 域名（音乐播放器、统计）
  const preconnectAPI = document.createElement('link');
  preconnectAPI.rel = 'preconnect';
  preconnectAPI.href = 'https://api.hypcvgm.top';
  document.head.appendChild(preconnectAPI);

  // 预加载头像（关键 LCP 元素）
  const preloadAvatar = document.createElement('link');
  preloadAvatar.rel = 'preload';
  preloadAvatar.as = 'image';
  preloadAvatar.href = '/assets/avatar.webp';
  preloadAvatar.fetchPriority = 'high';
  document.head.appendChild(preloadAvatar);
}

async function bootstrap() {
  // 1. 立即添加优化标签（预连接、预加载）
  addOptimizationLinks();

  // 2. 确保滚动揭示实例存在（轻量）
  ensureScrollReveal();

  // 3. 主题同步（同步，轻量，必须尽快）
  const savedTheme = storageController.isAllowed() ? storageController.getItem(CONFIG.STORAGE_KEYS.THEME) : null;
  const initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // 4. 背景图加载：使用 requestIdleCallback 不阻塞 LCP
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      applyRandomBackgroundImage({ force: true });
    }, { timeout: 100 });
  } else {
    setTimeout(() => applyRandomBackgroundImage({ force: true }), 50);
  }

  // 5. 导航栏和页脚异步加载（不阻塞）
  Promise.all([loadNavbar(), loadFooter()]).catch(console.warn);
  
  // 6. 站点年龄更新（非关键）
  startSiteAgeUpdater(CONFIG.SITE_BIRTH);

  // 7. 返回顶部按钮（轻量，可同步）
  initBackToTopButton();

  // 8. 无刷新导航和列表点击事件延迟初始化
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      enableAjaxNavigation();
      document.addEventListener('click', handleListItemClick);
    }, { timeout: 500 });
  } else {
    setTimeout(() => {
      enableAjaxNavigation();
      document.addEventListener('click', handleListItemClick);
    }, 100);
  }

  // 9. 当前页面特性延迟初始化
  let currentPage = getPageNameFromPath(window.location.pathname) || 'index';
  if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
    currentPage = 'article-detail';
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initPageFeatures(currentPage).catch(console.warn);
    }, { timeout: 800 });
  } else {
    setTimeout(() => initPageFeatures(currentPage).catch(console.warn), 200);
  }

  // 10. 其余非关键功能（统计分析、懒加载等）放在最后
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

  // 11. Cookie 同意与 Clarity（不影响 LCP）
  cookieConsentManager = new CookieConsentManager(storageController);
  initClarityOnConsent();
  window.addEventListener('ajax:navigation', () => updateClarityPage());

  document.body.setAttribute('data-loaded', 'true');
  console.log('[Main] 初始化完成（LCP 优化版）');
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

window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;
window.clearAllServiceWorkerCache = clearAllServiceWorkerCache;