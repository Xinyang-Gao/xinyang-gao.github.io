// /js/data/sw.js 
// Service Worker: 缓存关键 JSON 文件，提升加载速度

const CACHE_NAME = 'site-cache-v1';
const CRITICAL_JSON_URLS = [
  '/json/works.json',
  '/json/articles.json',
  '/json/statistics.json'
];

// 安装时预缓存关键 JSON
self.addEventListener('install', event => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CRITICAL_JSON_URLS);
    }).catch(err => {
      console.warn('[SW] 预缓存失败:', err);
    })
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', event => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 拦截请求，优先从缓存读取关键 JSON，网络请求用于更新
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // 只处理同源的 JSON 请求
  if (CRITICAL_JSON_URLS.some(jsonUrl => url.includes(jsonUrl))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        // 尝试从缓存获取
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // 后台发起网络请求更新缓存
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }
        // 缓存未命中，发起网络请求
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      })
    );
    return;
  }
  
  // 其他请求使用网络优先策略
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});