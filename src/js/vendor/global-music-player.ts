// /js/vendor/global-music-player.ts
// 功能：动态加载 APlayer，适配网站主题，支持拖拽、顺序折叠动画
// 歌词颜色保留 APlayer 默认，不覆盖
// 所有定制通过 CSS 覆盖与运行时补丁实现，不修改 APlayer.min.js

(function () {
  // ==================== 配置 ====================
  const RESOURCES = {
    js: ['/js/vendor/APlayer.min.js'],
  };

  const STORAGE_POS_KEY = 'player-widget-position';
  const STORAGE_COLLAPSE_KEY = 'player-widget-collapsed';
  const STYLE_ID = 'aplayer-override-style';
  const COLLAPSE_DELAY = 500;

  // ==================== 状态 ====================
  let resourcesLoaded = false;
  let loadingPromise: Promise<void> | null = null;
  let playerInserted = false;

  // ==================== 辅助函数 ====================

  function isPlayerExists(): boolean {
    return document.querySelector('#global-music-player') !== null;
  }

  function loadJS(src: string): Promise<void> {
    if (document.querySelector(`script[src="${src}"]`)) {
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

  function loadResources(): Promise<void> {
    if (resourcesLoaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = Promise.all(RESOURCES.js.map(loadJS))
      .then(() => {
        resourcesLoaded = true;
        loadingPromise = null;
        console.log('[MusicPlayer] 所有资源加载完成');
      })
      .catch((err) => {
        loadingPromise = null;
        console.error('[MusicPlayer] 加载资源失败:', err);
        throw err;
      });
    return loadingPromise;
  }

  /** 注入所有定制样式 */
  function injectOverrideStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* ----- 通用覆盖（圆角、颜色、阴影） ----- */
      #global-music-player .player-widget {
        border-radius: var(--radius-xl, 18px) !important;
        background: var(--surface-color, #fff) !important;
        border-color: var(--border-color, #e4e1da) !important;
        box-shadow: var(--shadow-md, 0 6px 18px rgba(0,0,0,0.06)),
                    var(--shadow-offset, 6px 6px 0 -2px rgba(180,91,99,0.07)) !important;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 6px 12px 6px 6px !important;
        max-width: 480px;
        transition: padding 0.4s cubic-bezier(0.65, 0, 0.35, 1),
                    background 0.3s, border-color 0.3s, box-shadow 0.3s;
      }

      #global-music-player .cover-wrapper {
        border-radius: 50% !important;
        border: 2px solid var(--bg-color, #f4f3f0) !important;
        box-shadow: 0 2px 8px var(--shadow-color, rgba(0,0,0,0.06)) !important;
        width: 44px;
        height: 44px;
        transition: width 0.4s cubic-bezier(0.34, 1.2, 0.64, 1),
                    height 0.4s cubic-bezier(0.34, 1.2, 0.64, 1);
      }

      #global-music-player .song-title {
        color: var(--text-color, #23231f) !important;
        font-weight: 600;
        transition: font-size 0.4s cubic-bezier(0.34, 1.2, 0.64, 1);
      }
      #global-music-player .song-artist {
        color: var(--text-secondary, #6d6d66) !important;
        transition: font-size 0.4s cubic-bezier(0.34, 1.2, 0.64, 1);
      }

      #global-music-player .icon-btn {
        color: var(--text-secondary, #6d6d66) !important;
      }
      #global-music-player .icon-btn:hover {
        background: rgba(var(--accent-rgb, 180,91,99), 0.1) !important;
        color: var(--accent-color, #b45b63) !important;
      }

      #global-music-player .progress-bg {
        background: var(--border-color, #e4e1da) !important;
      }
      #global-music-player .progress-fill {
        background: var(--accent-color, #b45b63) !important;
      }

      #global-music-player .volume-track {
        background: var(--surface-color, #fff) !important;
        border-color: var(--border-color, #e4e1da) !important;
      }
      #global-music-player .volume-bar {
        background: var(--accent-color, #b45b63) !important;
      }
      #global-music-player .menu-toggle.active {
        background: var(--accent-color, #b45b63) !important;
      }

      /* ----- 顺序折叠动画 ----- */
      /* 控件组 - 默认展开状态 */
      #global-music-player .controls,
      #global-music-player .more-control-wrapper,
      #global-music-player .volume-control-wrapper {
        transition: max-width 0.5s cubic-bezier(0.65, 0, 0.35, 1) 0s,
                    max-height 0.5s cubic-bezier(0.65, 0, 0.35, 1) 0s,
                    opacity 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) 0.3s,
                    transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) 0.3s,
                    margin 0.4s ease 0s,
                    padding 0.4s ease 0s;
        flex: 0 1 auto;
        max-width: 500px;
        max-height: 500px;
        opacity: 1;
        transform: translateY(0) scaleY(1);
        margin: initial;
        padding: initial;
        pointer-events: auto;
      }

      /* 控件组 - 折叠状态（尺寸平滑收缩至零，裁剪溢出内容） */
      #global-music-player[data-collapsed="true"] .controls,
      #global-music-player[data-collapsed="true"] .more-control-wrapper,
      #global-music-player[data-collapsed="true"] .volume-control-wrapper {
        max-width: 0 !important;
        max-height: 0 !important;
        opacity: 0 !important;
        transform: translateY(-10px) scaleY(0.8) !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        pointer-events: none !important;
        overflow: hidden !important; /* 折叠时强制裁剪，保证完全隐藏 */
        transition: max-width 0.5s cubic-bezier(0.65, 0, 0.35, 1) 0.3s,
                    max-height 0.5s cubic-bezier(0.65, 0, 0.35, 1) 0.3s,
                    opacity 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) 0s,
                    transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) 0s,
                    margin 0.4s ease 0.3s,
                    padding 0.4s ease 0.3s;
      }

      /* 播放器内边距和字体大小随折叠状态变化（同步整体收缩） */
      #global-music-player[data-collapsed="true"] .player-widget {
        padding: 4px 10px 4px 4px !important;
      }
      #global-music-player[data-collapsed="true"] .top-row {
        margin-bottom: 2px !important;
      }
      #global-music-player[data-collapsed="true"] .song-title {
        font-size: 0.9rem !important;
      }
      #global-music-player[data-collapsed="true"] .song-artist {
        font-size: 0.75rem !important;
      }
      #global-music-player[data-collapsed="true"] .cover-wrapper {
        width: 36px;
        height: 36px;
      }

      /* ----- 拖拽反馈（透明 + 按压缩放） ----- */
      #global-music-player.dragging .player-widget {
        opacity: 0.75 !important;
        transform: scale(0.96) !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.2) !important;
        transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
        cursor: grabbing;
      }

      /* ----- 暗色主题微调（不含歌词） ----- */
      [data-theme="dark"] #global-music-player .player-widget {
        background: rgba(23, 23, 30, 0.92) !important;
        border-color: var(--border-color, #2c2c37) !important;
      }
      [data-theme="dark"] #global-music-player .icon-btn:hover {
        color: var(--accent-light, #a3d4ff) !important;
      }
    `;
    document.head.appendChild(style);
    console.log('[MusicPlayer] 覆盖样式已注入');
  }

  function createPlayerContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'global-music-player';
    container.style.position = 'fixed';
    container.style.bottom = '24px';
    container.style.left = '24px';
    container.style.zIndex = '9999';
    const collapsed = localStorage.getItem(STORAGE_COLLAPSE_KEY);
    if (collapsed === 'true') {
      container.dataset.collapsed = 'true';
    }
    return container;
  }

  // ==================== 拖拽补丁 ====================

  function enableDragging(container: HTMLElement) {
    const widget = container.querySelector('.player-widget') as HTMLElement;
    if (!widget) {
      console.warn('[MusicPlayer] 未找到 .player-widget，拖拽功能无法启用');
      return;
    }

    widget.style.userSelect = 'none';

    let isDragging = false;
    let startX = 0,
      startY = 0;
    let origLeft = 0,
      origTop = 0;

    const saved = localStorage.getItem(STORAGE_POS_KEY);
    if (saved) {
      try {
        const { left, top } = JSON.parse(saved);
        widget.style.position = 'fixed';
        widget.style.left = left + 'px';
        widget.style.top = top + 'px';
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
      } catch (_) {}
    }

    const onStart = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('.cover-container') ||
        target.closest('.progress-container') ||
        target.closest('.volume-control-wrapper')
      ) {
        return;
      }

      const touch = (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      startX = touch.clientX;
      startY = touch.clientY;

      const rect = widget.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      isDragging = false;
      container.classList.add('dragging');

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);

      e.preventDefault();
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      const touch = (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!isDragging) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        isDragging = true;
      }

      e.preventDefault();

      let left = origLeft + dx;
      let top = origTop + dy;

      const maxX = window.innerWidth - widget.offsetWidth - 10;
      const maxY = window.innerHeight - widget.offsetHeight - 10;
      left = Math.max(10, Math.min(left, maxX));
      top = Math.max(10, Math.min(top, maxY));

      widget.style.position = 'fixed';
      widget.style.left = left + 'px';
      widget.style.top = top + 'px';
      widget.style.bottom = 'auto';
      widget.style.right = 'auto';
    };

    const onEnd = () => {
      if (isDragging) {
        const left = parseFloat(widget.style.left);
        const top = parseFloat(widget.style.top);
        if (!isNaN(left) && !isNaN(top)) {
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify({ left, top }));
        }
      }
      container.classList.remove('dragging');

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    widget.addEventListener('mousedown', onStart);
    widget.addEventListener('touchstart', onStart, { passive: false });
  }

  // ==================== 自动折叠补丁（逻辑不变） ====================

  function setupAutoCollapse(container: HTMLElement, apInstance: any) {
    let collapseTimer: number | null = null;
    let isCollapsed = container.dataset.collapsed === 'true';
    let isUserInteracting = false;

    const widget = container.querySelector('.player-widget') as HTMLElement;
    if (!widget) return;

    const setCollapsed = (collapsed: boolean) => {
      if (collapsed === isCollapsed) return;
      isCollapsed = collapsed;
      if (collapsed) {
        container.dataset.collapsed = 'true';
        localStorage.setItem(STORAGE_COLLAPSE_KEY, 'true');
      } else {
        delete container.dataset.collapsed;
        localStorage.setItem(STORAGE_COLLAPSE_KEY, 'false');
      }
    };

    const resetTimer = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      if (isUserInteracting || (apInstance && apInstance.audio && !apInstance.audio.paused)) {
        setCollapsed(false);
        return;
      }
      collapseTimer = window.setTimeout(() => {
        setCollapsed(true);
        collapseTimer = null;
      }, COLLAPSE_DELAY);
    };

    widget.addEventListener('mouseenter', () => {
      isUserInteracting = true;
      setCollapsed(false);
      resetTimer();
    });

    widget.addEventListener('mouseleave', () => {
      isUserInteracting = false;
      resetTimer();
    });

    if (apInstance) {
      const handlePlay = () => {
        setCollapsed(false);
        resetTimer();
      };
      const handlePause = () => {
        if (!isUserInteracting) {
          resetTimer();
        }
      };
      apInstance.on('play', handlePlay);
      apInstance.on('pause', handlePause);
      apInstance.on('ended', handlePause);
      (container as any)._collapseCleanup = () => {
        apInstance.off('play', handlePlay);
        apInstance.off('pause', handlePause);
        apInstance.off('ended', handlePause);
      };
    }

    if (!isCollapsed) {
      resetTimer();
    }

    widget.addEventListener('click', resetTimer);
    widget.addEventListener('touchstart', resetTimer);
  }

  // ==================== 初始化 APlayer ====================

  function initAPlayer(container: HTMLElement): boolean {
    if (!window.APlayer) {
      console.warn('[MusicPlayer] window.APlayer 未定义');
      return false;
    }

    if ((container as any)._ap) {
      console.log('[MusicPlayer] 已存在 APlayer 实例');
      return true;
    }

    try {
      console.log('[MusicPlayer] 正在创建 APlayer 实例...');
      const ap = new window.APlayer({ container });
      (container as any)._ap = ap;

      injectOverrideStyles();
      enableDragging(container);
      setupAutoCollapse(container, ap);

      console.log('[MusicPlayer] APlayer 实例创建成功', ap);
      return true;
    } catch (err) {
      console.error('[MusicPlayer] 创建 APlayer 实例失败:', err);
      return false;
    }
  }

  // ==================== 主流程 ====================

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

    if (isPlayerExists()) {
      playerInserted = true;
      console.log('[MusicPlayer] 播放器容器已存在（可能由其他实例创建）');
      return;
    }

    const container = createPlayerContainer();
    document.body.appendChild(container);
    console.log('[MusicPlayer] 容器已插入 DOM');

    injectOverrideStyles();

    let initSuccess = initAPlayer(container);
    if (!initSuccess) {
      console.log('[MusicPlayer] 初始化失败，启动重试机制');
      let retries = 0;
      const maxRetries = 30;
      const interval = setInterval(() => {
        retries++;
        if (window.APlayer) {
          console.log(`[MusicPlayer] 检测到 window.APlayer (重试 ${retries} 次后成功)`);
          clearInterval(interval);
          initAPlayer(container);
          playerInserted = true;
        } else if (retries >= maxRetries) {
          clearInterval(interval);
          console.error('[MusicPlayer] 重试超时，window.APlayer 仍未定义');
        } else {
          console.log(`[MusicPlayer] 重试 ${retries}/${maxRetries}，等待 window.APlayer...`);
        }
      }, 100);
    } else {
      playerInserted = true;
    }
  }

  // ==================== 启动时机 ====================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMusicPlayer);
  } else {
    ensureMusicPlayer();
  }

  window.addEventListener('ajax:navigation', () => {
    if (!isPlayerExists()) {
      console.log('[MusicPlayer] 检测到导航，播放器容器丢失，重新创建');
      playerInserted = false;
      ensureMusicPlayer();
    }
  });

  (window as any).__musicPlayerDebug = {
    resourcesLoaded,
    playerInserted,
    isPlayerExists,
    loadResources,
    ensureMusicPlayer,
  };

  console.log('[MusicPlayer] 初始化脚本已执行');
})();