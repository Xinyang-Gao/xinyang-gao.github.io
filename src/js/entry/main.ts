// /js/entry/main.ts
// 精简后的入口，仅负责启动应用

import { AppInitializer } from '/js/core/app-initializer.js';

// 暴露全局函数（供其他模块调用）
import { fetchAndReplaceContent } from '/js/router/router.js';
import { refreshScrollReveal } from '/js/ui/ui-effects.js';

// 以下函数仍保留在此，因为它们是全局 API
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

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  AppInitializer.start();
});

// 暴露必要函数到全局
window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;
window.clearAllServiceWorkerCache = clearAllServiceWorkerCache;