// /js/core/twikoo-manager.js
// 通用 Twikoo 评论管理器（单例模式）

const DEFAULT_CONFIG = {
  envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
  lang: 'zh-CN',
  enableComment: true,
};

let libraryLoadPromise = null;
const initializedContainers = new WeakSet();

/**
 * 动态加载 Twikoo 库（仅一次）
 * @returns {Promise<void>}
 */
function loadTwikooLibrary() {
  if (typeof twikoo !== 'undefined') {
    return Promise.resolve();
  }
  if (libraryLoadPromise) {
    return libraryLoadPromise;
  }

  libraryLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://registry.npmmirror.com/twikoo/1.7.14/files/dist/twikoo.nocss.js';
    script.async = true;
    script.onload = () => {
      console.log('[TwikooManager] 库加载成功');
      resolve();
    };
    script.onerror = () => {
      console.warn('[TwikooManager] 库加载失败');
      libraryLoadPromise = null;
      reject(new Error('Twikoo 库加载失败'));
    };
    document.head.appendChild(script);
  });
  return libraryLoadPromise;
}

/**
 * 初始化 Twikoo 评论容器
 * @param {string|HTMLElement} container - 容器元素或其选择器
 * @param {Object} [options] - 可选配置，会覆盖默认值
 * @param {string} [options.envId] - 环境 ID
 * @param {string} [options.lang] - 语言
 * @param {string} [options.path] - 页面路径（默认 window.location.pathname）
 * @param {boolean} [options.enableComment] - 是否启用评论
 * @returns {Promise<boolean>} 是否初始化成功
 */
export async function initTwikoo(container, options = {}) {
  const containerEl = typeof container === 'string' 
    ? document.querySelector(container) 
    : container;

  if (!containerEl) {
    console.warn('[TwikooManager] 容器不存在:', container);
    return false;
  }

  // 如果已初始化，直接返回
  if (initializedContainers.has(containerEl)) {
    return true;
  }
  if (containerEl.getAttribute('data-init') === 'true') {
    initializedContainers.add(containerEl);
    return true;
  }

  try {
    // 确保库已加载
    await loadTwikooLibrary();
    if (typeof twikoo === 'undefined') {
      throw new Error('Twikoo 库未加载');
    }

    // 合并配置
    const config = {
      ...DEFAULT_CONFIG,
      ...options,
      el: containerEl,
      path: options.path || window.location.pathname,
    };

    // 初始化
    await twikoo.init(config);
    
    // 标记已初始化
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
 * @param {string|HTMLElement} container - 容器元素或其选择器
 */
export function resetTwikooContainer(container) {
  const containerEl = typeof container === 'string' 
    ? document.querySelector(container) 
    : container;
  if (containerEl) {
    containerEl.removeAttribute('data-init');
    initializedContainers.delete(containerEl);
    // 清空容器内容（可选）
    containerEl.innerHTML = '';
  }
}

/**
 * 销毁 Twikoo 实例（清理容器）
 * @param {string|HTMLElement} container - 容器元素或其选择器
 */
export function destroyTwikoo(container) {
  resetTwikooContainer(container);
}