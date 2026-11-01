// /js/vendor/global-music-player.ts
// 功能：懒加载 APlayer，创建播放器实例，并对外暴露控制接口
//
// 本文件只负责「加载 + 实例化 + 暴露接口」。
// 拖拽、缩放、自动折叠、桌面歌词、主题适配、形态切换、显隐与外观全部由
// APlayer.min.js 自身实现：播放器直接消费站点的 CSS 变量
// （--surface-color / --accent-color / --radius-xl …），
// 因此不再需要任何覆盖样式与运行时补丁。

// MusicPlayerController / PlayerAppearance 是 globals.d.ts 里的全局类型，无需 import

// ==================== 配置 ====================

const PLAYER_JS = '/js/vendor/APlayer.min.js';
const CONTAINER_ID = 'global-music-player';

/** 站点侧默认值：仍可被 APlayer 自己的 localStorage 记录覆盖 */
const PLAYER_OPTIONS = {
  collapseDelay: 500,
  lyrics: true,
  volume: 0.7,
};

// ==================== 状态 ====================

let loadPromise: Promise<void> | null = null;
let inserted = false;
let controller: MusicPlayerController | null = null;

// ==================== 辅助函数 ====================

function findContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${CONTAINER_ID}`);
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

/** vendor 脚本以 UMD 挂到 window.APlayer；等它真正可用再实例化 */
function waitForGlobal(timeout = 3000): Promise<boolean> {
  if (typeof window.APlayer === 'function') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (typeof window.APlayer === 'function') {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= timeout) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

// ==================== 外部控制接口 ====================

/**
 * 包一层：播放器尚未就绪时调用不会报错，就绪后自动补上。
 * 站点任何地方（设置面板、控制台、其它脚本）都可以通过 window.__musicPlayer 调用。
 */
function createController(): MusicPlayerController {
  const call = <T>(name: string, ...args: unknown[]): T | undefined => {
    const ap = (findContainer() as unknown as { _ap?: Record<string, unknown> } | null)?._ap;
    const fn = ap?.[name];
    if (typeof fn !== 'function') {
      console.warn(`[MusicPlayer] ${name} 暂不可用（播放器未就绪）`);
      return undefined;
    }
    return (fn as (...a: unknown[]) => T).call(ap, ...args);
  };

  return {
    get ready() {
      return Boolean((findContainer() as unknown as { _ap?: unknown } | null)?._ap);
    },
    play: () => call('play'),
    pause: () => call('pause'),
    toggle: () => call('toggle'),
    next: () => call('next'),
    prev: () => call('prev'),
    setMode: (mode: string) => call('setMode', mode),
    toggleMode: () => call('toggleMode'),
    getMode: () => call<string>('getMode'),
    show: () => call('show'),
    hide: () => call('hide'),
    toggleVisible: () => call('toggleVisible'),
    setVisible: (visible: boolean) => call('setVisible', visible),
    getVisible: () => call<boolean>('getVisible'),
    setAppearance: (patch: Record<string, number>) => call('setAppearance', patch),
    getAppearance: () => call('getAppearance'),
    setLyricsVisible: (visible: boolean) => call('setLyricsVisible', visible),
    toggleLyrics: () => call('setLyricsVisible', !call<boolean>('getLyricsVisible')),
    getLyricsVisible: () => call<boolean>('getLyricsVisible'),
    setPosition: (position: { left: number; top: number } | null) => call('setPosition', position),
    setLyricsPosition: (position: Record<string, number | boolean>) => call('setLyricsPosition', position),
    destroy: () => call('destroy'),
  };
}

// ==================== 初始化 ====================

function createInstance(container: HTMLElement): boolean {
  if ((container as unknown as { _ap?: unknown })._ap) {
    return true;
  }
  if (typeof window.APlayer !== 'function') {
    return false;
  }
  try {
    const ap = new window.APlayer({ container, ...PLAYER_OPTIONS });
    (container as unknown as { _ap: unknown })._ap = ap;
    console.log('[MusicPlayer] APlayer 实例创建成功');
    return true;
  } catch (err) {
    console.error('[MusicPlayer] 创建 APlayer 实例失败:', err);
    return false;
  }
}

async function ensureMusicPlayer(): Promise<void> {
  if (inserted && findContainer()) {
    return;
  }

  if (!loadPromise) {
    loadPromise = loadJS(PLAYER_JS).catch((err) => {
      loadPromise = null;
      throw err;
    });
  }

  try {
    await loadPromise;
  } catch {
    console.error('[MusicPlayer] 资源加载失败，无法创建播放器');
    return;
  }

  const ready = await waitForGlobal();
  if (!ready) {
    console.error('[MusicPlayer] window.APlayer 超时未定义');
    return;
  }

  let container = findContainer();
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
    console.log('[MusicPlayer] 容器已插入 DOM');
  }

  if (createInstance(container)) {
    inserted = true;
  }
}

// ==================== 启动时机 ====================

function bootstrap(): void {
  controller = createController();
  (window as unknown as { __musicPlayer?: MusicPlayerController }).__musicPlayer = controller;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void ensureMusicPlayer());
  } else {
    void ensureMusicPlayer();
  }

  // 站内 AJAX 换页会重建 body 局部内容，容器丢失时重建
  window.addEventListener('ajax:navigation', () => {
    if (!findContainer()) {
      inserted = false;
      void ensureMusicPlayer();
    }
  });
}

bootstrap();

// 使 TypeScript 将本文件视为模块（动态 import() 需要模块身份）；
// 顶层逻辑在 bootstrap() 中执行，副作用不变。
export {};
