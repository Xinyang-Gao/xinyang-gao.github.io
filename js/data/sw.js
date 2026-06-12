// /js/data/sw.js
// Service Worker: 智能缓存策略，支持离线回退与 stale-while-revalidate
// 修复：开发环境自动绕过缓存，预缓存资源不存在时跳过，提供版本管理

const CACHE_CONFIG = {
  version: 'v3',                     // 升级版本号，强制旧缓存失效
  get name() { return `site-cache-${this.version}`; },
  preCacheUrls: [
    '/json/works.json',
    '/json/articles.json',
    '/json/statistics.json',
  ],
  strategies: {
    staleWhileRevalidate: ['/json/', '/api/'],
    cacheFirst: ['.css', '.js', '.webp', '.svg', '.ico'],
    networkFirst: ['.html', '/']
  },
  maxEntries: 50,
  maxAgeSeconds: 7 * 24 * 60 * 60
};

const CACHE_NAME = CACHE_CONFIG.name;
const isDev = self.location.hostname === 'localhost' ||
              self.location.hostname === '127.0.0.1' ||
              self.location.hostname.includes('github.io'); // 可加其他开发域

function isUrlMatch(url, patterns) {
  return patterns.some(p => url.includes(p));
}

function shouldUseStaleWhileRevalidate(url) {
  return isUrlMatch(url, CACHE_CONFIG.strategies.staleWhileRevalidate);
}
function shouldUseCacheFirst(url) {
  return isUrlMatch(url, CACHE_CONFIG.strategies.cacheFirst);
}
function shouldUseNetworkFirst(url) {
  return isUrlMatch(url, CACHE_CONFIG.strategies.networkFirst);
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map(key => cache.delete(key)));
}

// 安装事件：预缓存关键资源（跳过不存在的文件）
self.addEventListener('install', event => {
  console.log('[SW] 安装中...', CACHE_NAME);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const validUrls = [];
      for (const url of CACHE_CONFIG.preCacheUrls) {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) validUrls.push(url);
          else console.warn(`[SW] 预缓存资源不存在，跳过: ${url}`);
        } catch (err) {
          console.warn(`[SW] 预缓存资源不可达，跳过: ${url}`, err);
        }
      }
      if (validUrls.length) await cache.addAll(validUrls);
    })().catch(err => console.error('[SW] 安装失败:', err))
  );
  self.skipWaiting();
});

// 激活事件：清理旧缓存
self.addEventListener('activate', event => {
  console.log('[SW] 激活中...', CACHE_NAME);
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => {
          console.log('[SW] 删除旧缓存:', name);
          return caches.delete(name);
        })
      );
      await self.clients.claim();
    })()
  );
});

// 请求拦截：开发环境直接走网络，其他请求按策略处理
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;

  if (request.method !== 'GET') return;

  // 开发环境：完全绕过缓存，直接 fetch
  if (isDev) {
    event.respondWith(fetch(request));
    return;
  }

  // 1. JSON 数据：stale-while-revalidate
  if (shouldUseStaleWhileRevalidate(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request.clone()).then(async networkResponse => {
          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
            await trimCache(cache, CACHE_CONFIG.maxEntries);
          }
          return networkResponse;
        }).catch(err => {
          console.warn(`[SW] 网络请求失败 (${url}):`, err);
          return null;
        });
        if (cachedResponse) {
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;
        if (request.headers.get('accept')?.includes('text/html')) {
          const offlinePage = await cache.match('/offline.html');
          if (offlinePage) return offlinePage;
        }
        return new Response('数据加载失败，请检查网络', { status: 503 });
      })()
    );
    return;
  }

  // 2. 静态资源：缓存优先
  if (shouldUseCacheFirst(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
            await trimCache(cache, CACHE_CONFIG.maxEntries);
          }
          return networkResponse;
        } catch (err) {
          return new Response('', { status: 404 });
        }
      })()
    );
    return;
  }

  // 3. HTML：网络优先，降级缓存
  if (shouldUseNetworkFirst(url)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
            return networkResponse;
          }
          throw new Error(`HTTP ${networkResponse?.status}`);
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          const offlinePage = await cache.match('/offline.html');
          if (offlinePage) return offlinePage;
          return new Response('您当前处于离线状态，部分内容不可用', { status: 503 });
        }
      })()
    );
    return;
  }

  // 4. 其他请求：网络优先，不缓存
  event.respondWith(fetch(request).catch(() => new Response('', { status: 404 })));
});