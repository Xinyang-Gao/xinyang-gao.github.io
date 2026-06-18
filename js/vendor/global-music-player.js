// /js/vendor/global-music-player.js
// 功能：动态加载 NeteaseMiniPlayer 的 CSS/JS，然后创建唯一的悬浮播放器
(function() {
  // ==================== 配置区 ====================
  const PLAYER_CONFIG = {
    playlistId: '18022003523',
    embed: 'false',
    position: 'bottom-left',
    lyric: 'true',
    theme: 'auto'
  };

  // 资源 URL（根据你的实际存放路径修改）
  const RESOURCES = {
    css: '/css/components/player.css',
    js: '/js/vendor/netease-mini-player-v2.js'
  };

  // 全局状态：避免重复加载/插入
  let resourcesLoaded = false;
  let loadingPromise = null;
  let playerInserted = false;

  // ==================== 辅助函数 ====================
  function isPlayerExists() {
    return document.querySelector('.netease-mini-player[data-position="' + PLAYER_CONFIG.position + '"]') !== null;
  }

  function loadCSS(href) {
    if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadJS(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load JS: ${src}`));
      document.body.appendChild(script);
    });
  }

  // 加载所有资源（幂等）
  function loadResources() {
    if (resourcesLoaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = Promise.all([
      loadCSS(RESOURCES.css),
      loadJS(RESOURCES.js)
    ]).then(() => {
      resourcesLoaded = true;
      loadingPromise = null;
    }).catch(err => {
      loadingPromise = null;
      console.error('[MusicPlayer] 加载资源失败:', err);
      throw err;
    });
    return loadingPromise;
  }

  // 创建播放器 DOM
  function createPlayerElement() {
    const div = document.createElement('div');
    div.className = 'netease-mini-player';
    div.setAttribute('data-playlist-id', PLAYER_CONFIG.playlistId);
    div.setAttribute('data-embed', PLAYER_CONFIG.embed);
    div.setAttribute('data-position', PLAYER_CONFIG.position);
    div.setAttribute('data-lyric', PLAYER_CONFIG.lyric);
    div.setAttribute('data-theme', PLAYER_CONFIG.theme);
    div.setAttribute('data-autoplay', PLAYER_CONFIG.autoplay);
    div.setAttribute('data-global', 'true');
    return div;
  }

  // 初始化播放器（确保 NeteaseMiniPlayer 类已存在）
  function initPlayerElement(element) {
    if (!window.NeteaseMiniPlayer) {
      console.warn('[MusicPlayer] NeteaseMiniPlayer 未就绪，稍后重试');
      return false;
    }
    // 如果已经初始化过（有内部标记），避免重复初始化
    if (element._neteasePlayer) return true;
    window.NeteaseMiniPlayer.initPlayer(element);
    return true;
  }

  // 主流程：加载资源 → 插入播放器 → 初始化
  async function ensureMusicPlayer() {
    // 1. 如果播放器已存在，直接返回
    if (playerInserted && isPlayerExists()) return;

    // 2. 等待资源加载完成
    try {
      await loadResources();
    } catch (err) {
      console.error('[MusicPlayer] 资源加载失败，无法创建播放器');
      return;
    }

    // 3. 再次检查是否已存在（可能在加载资源过程中被其他代码插入）
    if (isPlayerExists()) {
      playerInserted = true;
      return;
    }

    // 4. 创建并插入播放器
    const playerDiv = createPlayerElement();
    document.body.appendChild(playerDiv);

    // 5. 初始化（如果 NeteaseMiniPlayer 还未就绪，延迟重试）
    const initSuccess = initPlayerElement(playerDiv);
    if (!initSuccess) {
      // 轮询等待（最多 2 秒）
      let retries = 0;
      const interval = setInterval(() => {
        if (window.NeteaseMiniPlayer) {
          clearInterval(interval);
          initPlayerElement(playerDiv);
        } else if (retries++ >= 20) { // 2 秒超时
          clearInterval(interval);
          console.error('[MusicPlayer] NeteaseMiniPlayer 加载超时');
        }
      }, 100);
    }
    playerInserted = true;
  }

  // ==================== 初始化时机 ====================
  // 页面首次加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMusicPlayer);
  } else {
    ensureMusicPlayer();
  }

  // 无刷新导航后，确保播放器还在（通常不会被替换，但防止意外）
  window.addEventListener('ajax:navigation', () => {
    if (!isPlayerExists()) {
      // 播放器没了，重新创建
      playerInserted = false;
      ensureMusicPlayer();
    }
  });
})();