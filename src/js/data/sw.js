// /js/data/sw.js
// Service Worker v5 —— 现代化优化版
// 核心改进：剥离 ?t= 缓存破坏参数，启用 Navigation Preload，精细化缓存策略

const CACHE_VERSION = 'v5';
const CACHE_NAME = `site-cache-${CACHE_VERSION}`;
const isDev = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// ---------- 预缓存列表（仅确保关键离线资源） ----------
const PRE_CACHE_URLS = [
  '/json/statistics.json',
  '/json/works.json',
  '/json/articles.json',
  '/offline.html',    // 需确保该文件存在，或移除该项
];

// ---------- 工具：剥离 ?t= 时间戳，用于缓存匹配 ----------
function stripCacheBusting(urlStr) {
  try {
    const url = new URL(urlStr, self.location.href);
    if (url.searchParams.has('t')) {
      url.searchParams.delete('t');
      return url.toString();
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

// ---------- 缓存清理（按 LRU 策略，最多 300 条） ----------
async function trimCache(cache, maxEntries = 300) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map(key => cache.delete(key)));
}

// ---------- 安装：预缓存核心资源 ----------
self.addEventListener('install', event => {
  console.log('[SW] 安装中...', CACHE_NAME);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const valid = [];
      for (const url of PRE_CACHE_URLS) {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) valid.push(url);
          else console.warn(`[SW] 预缓存跳过 (404): ${url}`);
        } catch {
          console.warn(`[SW] 预缓存跳过 (不可达): ${url}`);
        }
      }
      if (valid.length) await cache.addAll(valid);
      await self.skipWaiting();
    })()
  );
});

// ---------- 激活：清理旧缓存 + 启用 Navigation Preload ----------
self.addEventListener('activate', event => {
  console.log('[SW] 激活中...', CACHE_NAME);
  event.waitUntil(
    (async () => {
      // 1. 清理旧版本缓存
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => {
          console.log('[SW] 删除旧缓存:', name);
          return caches.delete(name);
        })
      );

      // 2. 启用 Navigation Preload（提升导航速度）
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
          console.log('[SW] Navigation Preload 已启用');
        } catch (e) {
          console.warn('[SW] Navigation Preload 不可用', e);
        }
      }

      await self.clients.claim();
    })()
  );
});

// ---------- 请求拦截 ----------
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // 开发环境完全绕过缓存
  if (isDev) {
    event.respondWith(fetch(request));
    return;
  }

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // ---------- 策略 1：静态资源（JS/CSS/字体/图片）—— Cache First ----------
  // 匹配常见静态资源扩展名（这些文件通常带有哈希，适合长期缓存）
  const staticExts = ['.js', '.css', '.woff', '.woff2', '.ttf', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
  if (staticExts.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        // 剥离时间戳，用规范 URL 匹配缓存
        const cacheKey = stripCacheBusting(request.url);
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return cachedResponse;

        // 缓存未命中，请求网络
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            // 同样用规范 URL 存储
            await cache.put(cacheKey, networkResponse.clone());
            await trimCache(cache);
          }
          return networkResponse;
        } catch {
          // 图片等静态资源降级：返回空占位（避免页面破裂）
          if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
            return new Response('', { status: 404 });
          }
          throw new Error('静态资源加载失败');
        }
      })()
    );
    return;
  }

  // ---------- 策略 2：API / JSON 数据 —— Stale-While-Revalidate ----------
  // 匹配 /json/ 或 /api/ 路径
  if (url.pathname.startsWith('/json/') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cacheKey = stripCacheBusting(request.url);
        const cachedResponse = await cache.match(cacheKey);

        // 网络请求（用于后台更新）
        const fetchPromise = fetch(request).then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            await cache.put(cacheKey, networkResponse.clone());
            await trimCache(cache);
          }
          return networkResponse;
        }).catch(() => null);

        // 如果有缓存，立即返回；同时触发后台更新
        if (cachedResponse) {
          // 不等待 fetchPromise，让它在后台完成
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        // 无缓存，等待网络响应
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;

        // 完全失败：返回友好的空数据
        return new Response(
          JSON.stringify({ error: '数据加载失败，请检查网络' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })()
    );
    return;
  }

  // ---------- 策略 3：HTML 文档 —— Network First，回退缓存 ----------
  // 匹配 .html 或根路径（且不是静态资源）
  if (url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.')) {
    event.respondWith(
      (async () => {
        try {
          // 尝试网络请求（带上预加载响应，如果有）
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) return preloadResponse;

          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
            return networkResponse;
          }
          throw new Error('网络响应异常');
        } catch {
          // 网络失败，尝试缓存
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;

          // 终极降级：离线页面
          const offline = await cache.match('/offline.html');
          if (offline) return offline;

          return new Response('您当前处于离线状态，部分内容不可用', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // ---------- 其他请求（默认网络优先，不缓存） ----------
  event.respondWith(fetch(request).catch(() => new Response('', { status: 404 })));
});