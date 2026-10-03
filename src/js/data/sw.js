// /js/data/sw.js
// Service Worker

// v7：静态资源由 Cache First 改为 Stale-While-Revalidate（产物无 hash，
//     Cache First 会把用户锁死在旧版本）；离线页 /offline.html 已真正生成
const CACHE_VERSION = 'v7';
const CACHE_NAME = `site-cache-${CACHE_VERSION}`;
const isDev = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// ---------- 预缓存列表（仅确保关键离线资源） ----------
const PRE_CACHE_URLS = [
  '/json/statistics.json',
  '/json/works.json',
  '/json/articles.json',
  '/offline.html', // 由 aggregated 生成器产出，离线时作为最终兜底
];

// ---------- 缓存清理（按 LRU 策略，最多 300 条） ----------
async function trimCache(cache, maxEntries = 300) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map((key) => cache.delete(key)));
}

// ---------- 安装：预缓存核心资源 ----------
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...', CACHE_NAME);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const valid = [];
      for (const url of PRE_CACHE_URLS) {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) {
            valid.push(url);
          } else {
            console.warn(`[SW] 预缓存跳过 (${res.status}): ${url}`);
          }
        } catch {
          console.warn(`[SW] 预缓存跳过 (不可达): ${url}`);
        }
      }
      if (valid.length) await cache.addAll(valid);
      await self.skipWaiting();
    })(),
  );
});

// ---------- 激活：清理旧缓存 + 启用 Navigation Preload ----------
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...', CACHE_NAME);
  event.waitUntil(
    (async () => {
      // 1. 清理旧版本缓存
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 删除旧缓存:', name);
            return caches.delete(name);
          }),
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
    })(),
  );
});

// ---------- 请求拦截 ----------
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 开发环境完全绕过缓存
  if (isDev) {
    event.respondWith(fetch(request));
    return;
  }

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 强制刷新标记：DataService.forceRefresh 会通过 cache 字段通知我们
  const forceRefresh = request.cache === 'reload' || request.cache === 'no-cache';

  // ---------- 策略 1：静态资源（JS/CSS/字体/图片）—— Stale-While-Revalidate ----------
  // 为什么不用 Cache First：本项目产物**不带内容哈希**（vite 的 entryFileNames
  // 是固定名），Cache First 会让用户永远停在第一次缓存的 JS/CSS 上，只能靠
  // 手动递增 CACHE_VERSION 强刷（审计 P0-10）。
  // SWR 的语义：先立刻回缓存（快），同时后台拉新并写入——下次访问即为新版。
  const staticExts = [
    '.js',
    '.css',
    '.woff',
    '.woff2',
    '.ttf',
    '.ico',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
  ];
  if (staticExts.some((ext) => url.pathname.endsWith(ext))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = !forceRefresh ? await cache.match(request) : null;

        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              await cache.put(request, networkResponse.clone());
              await trimCache(cache);
            }
            return networkResponse;
          })
          .catch(() => null);

        // 有缓存：立即返回，同时后台更新（网络失败时静默保留旧缓存）
        if (cachedResponse) {
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        // 无缓存（或强制刷新）：等网络
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;

        // 完全离线且无缓存：图片给空占位，其余抛错交给上层
        if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
          return new Response('', { status: 404 });
        }
        throw new Error('静态资源加载失败');
      })(),
    );
    return;
  }

  // ---------- 策略 2：本站 API / JSON 数据 —— Stale-While-Revalidate ----------
  // 匹配 /json/ 或 /api/ 路径。
  // 仅限同源：第三方 API（如 uapis.cn/api/v1/saying/random）被 SWR 缓存后，
  // 每次请求都会命中同一份缓存，随机接口将永远返回同一条结果。
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/json/') || url.pathname.startsWith('/api/'))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // ---- 强制刷新：跳过缓存读取，直接走网络 ----
        if (forceRefresh) {
          try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.ok) {
              await cache.put(request, networkResponse.clone());
              await trimCache(cache);
            }
            return networkResponse;
          } catch {
            // 网络失败时回退到旧缓存
            const cached = await cache.match(request);
            if (cached) return cached;
            return new Response(JSON.stringify({ error: '数据加载失败，请检查网络' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        // ---- 正常路径：Stale-While-Revalidate ----
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              await cache.put(request, networkResponse.clone());
              await trimCache(cache);
            }
            return networkResponse;
          })
          .catch(() => null);

        // 有缓存：立即返回，同时后台更新
        if (cachedResponse) {
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        // 无缓存：等待网络响应
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;

        // 完全失败：返回友好的空数据
        return new Response(JSON.stringify({ error: '数据加载失败，请检查网络' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })(),
    );
    return;
  }

  // ---------- 策略 3：HTML 文档 —— Network First，回退缓存 ----------
  // 匹配 .html 或根路径（且不是静态资源）；同样只处理同源导航请求，
  // 避免把第三方接口的响应当成 HTML 塞进缓存。
  if (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.'))
  ) {
    event.respondWith(
      (async () => {
        try {
          // 尝试使用 Navigation Preload 响应
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
          // 网络失败：尝试缓存
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
      })(),
    );
    return;
  }

  // ---------- 其他请求（默认网络优先，不缓存） ----------
  event.respondWith(fetch(request).catch(() => new Response('', { status: 404 })));
});
