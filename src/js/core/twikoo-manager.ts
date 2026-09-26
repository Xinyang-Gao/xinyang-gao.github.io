// /js/core/twikoo-manager.ts
// 通用 Twikoo 评论管理器（单例模式）

interface TwikooInstance {
  init: (config: Record<string, unknown>) => Promise<void>;
}

declare global {
  interface Window {
    twikoo?: TwikooInstance;
  }
}

export interface TwikooOptions {
  envId?: string;
  lang?: string;
  path?: string;
  enableComment?: boolean;
  [key: string]: unknown;
}

const DEFAULT_CONFIG = {
  envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
  lang: 'zh-CN',
  enableComment: true,
};

let libraryLoadPromise: Promise<void> | null = null;
const initializedContainers = new WeakSet<Element>();

/** 把「元素或选择器」统一解析成元素 */
function resolveContainer(
  container: string | HTMLElement
): HTMLElement | null {
  return typeof container === 'string'
    ? document.querySelector<HTMLElement>(container)
    : container;
}

/**
 * 动态加载 Twikoo 库（仅一次）
 */
function loadTwikooLibrary(): Promise<void> {
  if (window.twikoo) return Promise.resolve();
  if (libraryLoadPromise) return libraryLoadPromise;

  libraryLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://registry.npmmirror.com/twikoo/2.0.9/files/dist/twikoo.nocss.js';
    script.async = true;
    script.onload = () => {
      console.log('[TwikooManager] 库加载成功');
      resolve();
    };
    script.onerror = () => {
      console.warn('[TwikooManager] 库加载失败');
      libraryLoadPromise = null; // 允许下次重试
      reject(new Error('Twikoo 库加载失败'));
    };
    document.head.appendChild(script);
  });
  return libraryLoadPromise;
}

/**
 * 初始化 Twikoo 评论容器
 * @param container 容器元素或其选择器
 * @param options 可选配置，会覆盖默认值
 * @returns 是否初始化成功
 */
export async function initTwikoo(
  container: string | HTMLElement,
  options: TwikooOptions = {}
): Promise<boolean> {
  const containerEl = resolveContainer(container);

  if (!containerEl) {
    console.warn('[TwikooManager] 容器不存在:', container);
    return false;
  }

  // 如果已初始化，直接返回
  if (initializedContainers.has(containerEl)) return true;
  if (containerEl.getAttribute('data-init') === 'true') {
    initializedContainers.add(containerEl);
    return true;
  }

  try {
    await loadTwikooLibrary();
    if (!window.twikoo) throw new Error('Twikoo 库未加载');

    const config: Record<string, unknown> = {
      ...DEFAULT_CONFIG,
      ...options,
      el: containerEl,
      path: options.path || window.location.pathname,
    };

    await window.twikoo.init(config);

    containerEl.setAttribute('data-init', 'true');
    initializedContainers.add(containerEl);
    console.log('[TwikooManager] 评论初始化成功');
    return true;
  } catch (error) {
    console.error('[TwikooManager] 初始化失败:', error);
    containerEl.removeAttribute('data-init');
    return false;
  }
}

/**
 * 重置指定容器的初始化状态（用于销毁时）
 */
export function resetTwikooContainer(container: string | HTMLElement): void {
  const containerEl = resolveContainer(container);
  if (!containerEl) return;
  containerEl.removeAttribute('data-init');
  initializedContainers.delete(containerEl);
  // 清空容器内容（可选）
  containerEl.innerHTML = '';
}

/**
 * 销毁 Twikoo 实例（清理容器）
 */
export function destroyTwikoo(container: string | HTMLElement): void {
  resetTwikooContainer(container);
}
