// /js/vendor/global-music-player.ts
// 功能：动态加载 APlayer 的 JS/CSS，创建唯一的悬浮播放器
// 注意：APlayer.min.js 已经包含了播放器 UI 和网易云歌单获取逻辑（硬编码歌单ID）
// 此脚本不再依赖 Meting，直接实例化 APlayer 即可

(function () {
  // 配置
  const PLAYER_CONFIG = {
    autoplay: false,          // 是否自动播放（由 APlayer 内部控制，参考）
    volume: 0.7,              // 默认音量（APlayer 内部会从 localStorage 读取，占位）
  };

  // 资源 URL
  const RESOURCES = {
    js: [
      '/js/vendor/APlayer.min.js'   // 改版 APlayer
    ]
  };

  // 全局状态
  let resourcesLoaded = false;
  let loadingPromise = null;
  let playerInserted = false;

  // ==================== 辅助函数 ====================
  function isPlayerExists() {
    return document.querySelector('#global-music-player') !== null;
  }

  function loadCSS(href) {
    if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => {
        console.log(`[MusicPlayer] CSS 加载成功: ${href}`);
        resolve();
      };
      link.onerror = () => {
        console.error(`[MusicPlayer] CSS 加载失败: ${href}`);
        reject(new Error(`Failed to load CSS: ${href}`));
      };
      document.head.appendChild(link);
    });
  }

  function loadJS(src) {
    // 避免重复加载同一脚本
    if (document.querySelector(`script[src="${src}"]`)) {
      console.log(`[MusicPlayer] 脚本已存在，跳过加载: ${src}`);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        console.log(`[MusicPlayer] JS 加载成功: ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`[MusicPlayer] JS 加载失败: ${src}`);
        reject(new Error(`Failed to load JS: ${src}`));
      };
      document.body.appendChild(script);
    });
  }

  // 加载所有资源（幂等）
  function loadResources() {
    if (resourcesLoaded) {
      console.log('[MusicPlayer] 资源已加载，直接返回');
      return Promise.resolve();
    }
    if (loadingPromise) {
      console.log('[MusicPlayer] 资源正在加载中，等待完成');
      return loadingPromise;
    }

    console.log('[MusicPlayer] 开始加载资源...');
    loadingPromise = Promise.all(
      RESOURCES.js.map(loadJS)
    ).then(() => {
      resourcesLoaded = true;
      loadingPromise = null;
      console.log('[MusicPlayer] 所有资源加载完成');
    }).catch(err => {
      loadingPromise = null;
      console.error('[MusicPlayer] 加载资源失败:', err);
      throw err;
    });
    return loadingPromise;
  }

  // 创建播放器容器
  function createPlayerContainer() {
    const container = document.createElement('div');
    container.id = 'global-music-player';
    container.style.position = 'fixed';
    container.style.bottom = '24px';
    container.style.left = '24px';
    container.style.zIndex = '9999';
    // 其他样式由 APlayer 内部 CSS 控制
    return container;
  }

  // 初始化 APlayer（直接实例化）
  function initAPlayer(container) {
    if (!window.APlayer) {
      console.warn('[MusicPlayer] window.APlayer 未定义，可能加载失败或顺序问题');
      return false;
    }

    // 避免重复初始化
    if (container._ap) {
      console.log('[MusicPlayer] 已存在 APlayer 实例，跳过');
      return true;
    }

    try {
      console.log('[MusicPlayer] 正在创建 APlayer 实例...');
      const ap = new window.APlayer({ container: container });
      container._ap = ap;
      console.log('[MusicPlayer] APlayer 实例创建成功', ap);
      return true;
    } catch (err) {
      console.error('[MusicPlayer] 创建 APlayer 实例失败:', err);
      return false;
    }
  }

  // 主流程：加载资源 → 插入容器 → 初始化
  async function ensureMusicPlayer() {
    if (playerInserted && isPlayerExists()) {
      console.log('[MusicPlayer] 播放器已存在，跳过');
      return;
    }

    try {
      await loadResources();
    } catch (err) {
      console.error('[MusicPlayer] 资源加载失败，无法创建播放器');
      return;
    }

    // 二次检查，防止并发创建
    if (isPlayerExists()) {
      playerInserted = true;
      console.log('[MusicPlayer] 播放器容器已存在（可能由其他实例创建）');
      return;
    }

    const container = createPlayerContainer();
    document.body.appendChild(container);
    console.log('[MusicPlayer] 容器已插入 DOM');

    // 尝试初始化，如果失败则重试
    let initSuccess = initAPlayer(container);
    if (!initSuccess) {
      console.log('[MusicPlayer] 初始化失败，启动重试机制 (检查 window.APlayer)');
      let retries = 0;
      const maxRetries = 30; // 最多重试30次，每次100ms，共3秒
      const interval = setInterval(() => {
        retries++;
        if (window.APlayer) {
          console.log(`[MusicPlayer] 检测到 window.APlayer (重试 ${retries} 次后成功)`);
          clearInterval(interval);
          initAPlayer(container);
          playerInserted = true;
        } else if (retries >= maxRetries) {
          clearInterval(interval);
          console.error('[MusicPlayer] 重试超时，window.APlayer 仍未定义，请检查 APlayer.min.js 是否正确加载');
          // 可在此处抛出错误或提示用户
        } else {
          console.log(`[MusicPlayer] 重试 ${retries}/${maxRetries}，等待 window.APlayer...`);
        }
      }, 100);
    } else {
      playerInserted = true;
    }
  }

  // ==================== 初始化时机 ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMusicPlayer);
  } else {
    ensureMusicPlayer();
  }

  // 无刷新导航后，检查播放器是否还存在（如 PJAX）
  window.addEventListener('ajax:navigation', () => {
    if (!isPlayerExists()) {
      console.log('[MusicPlayer] 检测到页面导航，播放器容器丢失，重新创建');
      playerInserted = false;
      ensureMusicPlayer();
    } else {
      console.log('[MusicPlayer] 导航后播放器容器仍然存在');
    }
  });

  // 暴露当前状态（调试用）
  window.__musicPlayerDebug = {
    resourcesLoaded,
    playerInserted,
    isPlayerExists,
    loadResources,
    ensureMusicPlayer
  };

  console.log('[MusicPlayer] 初始化脚本已执行，等待资源加载...');
})();