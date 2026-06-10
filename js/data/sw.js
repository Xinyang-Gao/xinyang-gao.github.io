// /js/data/sw.js
// Service Worker: 智能缓存策略，支持离线回退与 stale-while-revalidate

// ==================== 配置常量 ====================
const CACHE_CONFIG = {
  // 缓存名称（修改版本号即可触发旧缓存清理）
  version: 'v2',
  get name() {
    return `site-cache-${this.version}`;
  },
  
  // 需要预缓存的关键资源（安装时立即缓存）
  preCacheUrls: [
    '/json/works.json',
    '/json/articles.json',
    '/json/statistics.json',
  ],
  
  // 缓存策略配置
  strategies: {
    // 针对 JSON 数据：stale-while-revalidate（优先返回缓存，后台更新）
    staleWhileRevalidate: ['/json/', '/api/'],
    // 针对静态资源：缓存优先（Cache First）
    cacheFirst: ['.css', '.js', '.webp', '.svg', '.ico'],
    // 针对 HTML：网络优先（Network First）
    networkFirst: ['.html', '/']
  },
  
  // 最大缓存条目（用于动态缓存限制，可选）
  maxEntries: 50,
  maxAgeSeconds: 7 * 24 * 60 * 60 // 7天
};

// 获取缓存名称
const CACHE_NAME = CACHE_CONFIG.name;

// ==================== 辅助函数 ====================
function isUrlMatch(url, patterns) {
  return patterns.some(pattern => {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    } else if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    return false;
  });
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

// 清理超出限制的缓存（LRU 思想，简单实现）
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map(key => cache.delete(key)));
  console.log(`[SW] 清理了 ${toDelete.length} 个旧缓存条目`);
}

// ==================== 安装事件 ====================
self.addEventListener('install', event => {
  console.log('[SW] 安装中...', CACHE_NAME);
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 过滤掉不存在的 URL（防止整体失败）
      const validUrls = [];
      for (const url of CACHE_CONFIG.preCacheUrls) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok) {
            validUrls.push(url);
          } else {
            console.warn(`[SW] 预缓存资源不存在，跳过: ${url}`);
          }
        } catch (err) {
          console.warn(`[SW] 预缓存资源不可达，跳过: ${url}`, err);
        }
      }
      if (validUrls.length) {
        await cache.addAll(validUrls);
        console.log(`[SW] 预缓存完成: ${validUrls.join(', ')}`);
      } else {
        console.warn('[SW] 无可预缓存的资源');
      }
    })().catch(err => {
      console.error('[SW] 安装失败:', err);
    })
  );
  
  // 跳过等待，立即激活
  self.skipWaiting();
});

// ==================== 激活事件 ====================
self.addEventListener('activate', event => {
  console.log('[SW] 激活中...', CACHE_NAME);
  
  event.waitUntil(
    (async () => {
      // 删除旧版本缓存
      const cacheNames = await caches.keys();
      const deletePromises = cacheNames
        .filter(name => name !== CACHE_NAME)
        .map(name => {
          console.log('[SW] 删除旧缓存:', name);
          return caches.delete(name);
        });
      await Promise.all(deletePromises);
      
      // 立即接管所有客户端
      await self.clients.claim();
      console.log('[SW] 激活完成，已接管所有客户端');
    })()
  );
});

// ==================== 请求拦截 ====================
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const request = event.request;
  
  // 跳过非 GET 请求和跨域请求（可选）
  if (request.method !== 'GET') return;
  
  // 1. 针对 JSON 数据：stale-while-revalidate
  if (shouldUseStaleWhileRevalidate(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        // 网络请求（后台更新）
        const fetchPromise = fetch(request.clone()).then(async networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone());
            // 可选：清理超出限制的缓存
            await trimCache(cache, CACHE_CONFIG.maxEntries);
          }
          return networkResponse;
        }).catch(err => {
          console.warn(`[SW] 网络请求失败 (${url}):`, err);
          return null;
        });
        
        // 优先返回缓存，否则等待网络
        if (cachedResponse) {
          // 后台更新不阻塞响应
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;
        
        // 降级：返回离线页面（仅对 HTML 请求）
        if (request.headers.get('accept')?.includes('text/html')) {
          const offlinePage = await cache.match('/offline.html');
          if (offlinePage) return offlinePage;
        }
        return new Response('数据加载失败，请检查网络', { status: 503 });
      })()
    );
    return;
  }
  
  // 2. 静态资源：缓存优先（Cache First）
  if (shouldUseCacheFirst(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone());
            await trimCache(cache, CACHE_CONFIG.maxEntries);
          }
          return networkResponse;
        } catch (err) {
          console.warn(`[SW] 静态资源获取失败 (${url}):`, err);
          // 返回空占位或默认图片（可选）
          return new Response('', { status: 404 });
        }
      })()
    );
    return;
  }
  
  // 3. HTML 页面：网络优先（Network First），降级到缓存
  if (shouldUseNetworkFirst(url)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
            return networkResponse;
          }
          throw new Error(`HTTP ${networkResponse?.status}`);
        } catch (err) {
          console.warn(`[SW] 网络请求失败，尝试缓存 (${url})`);
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(request);
          if (cachedResponse) return cachedResponse;
          
          // 返回离线回退页面
          const offlinePage = await cache.match('/offline.html');
          if (offlinePage) return offlinePage;
          return new Response('您当前处于离线状态，部分内容不可用', { status: 503 });
        }
      })()
    );
    return;
  }
  
  // 4. 其他请求（如图片、字体）：网络优先，不缓存（或根据需求调整）
  event.respondWith(
    fetch(request).catch(err => {
      console.warn(`[SW] 其他资源获取失败 (${url}):`, err);
      return new Response('', { status: 404 });
    })
  );
});