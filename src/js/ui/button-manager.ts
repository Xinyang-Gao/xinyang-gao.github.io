// /js/ui/button-manager.ts
// 统一管理浮动按钮：返回顶部 + 文章目录（TOC）+ 设置
// 滚动监听统一走 ScrollDispatcher（全局单监听 + rAF 节流）

import { CONFIG, onNavigation } from '/js/core/core.js';
import { scrollDispatcher } from '/js/core/scroll-dispatcher.js';

// ---------- 模块级单例状态 ----------
let container: HTMLElement | null = null;
let backToTopBtn: HTMLButtonElement | null = null;
let tocBtn: HTMLButtonElement | null = null;
let settingsBtn: HTMLButtonElement | null = null;
let resizeHandler: (() => void) | null = null;
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
let updateVisibilityFn: ((scrollY: number) => void) | null = null;

// 允许给按钮挂载清理函数
type CleanableButton = HTMLButtonElement & { _cleanup?: () => void };

/**
 * 创建浮动按钮容器（单例）
 */
function ensureContainer(): HTMLElement {
  if (container) return container;

  const existing = document.querySelector<HTMLElement>('.floating-buttons');
  if (existing) {
    container = existing;
    return container;
  }

  const c = document.createElement('div');
  c.className = 'floating-buttons';
  document.body.appendChild(c);
  container = c;
  return container;
}

/**
 * 初始化返回顶部按钮
 * 滚动时自动显示/隐藏（使用 hidden 类），悬停时显示 ↑，否则显示进度百分比
 */
export function initBackToTop(): void {
  if (backToTopBtn) return;

  const c = ensureContainer();
  const btn = document.createElement('button') as CleanableButton;
  btn.className = 'floating-btn hidden';
  btn.id = 'backToTopBtn';
  btn.setAttribute('aria-label', '返回顶部');
  btn.textContent = '↑';
  c.appendChild(btn);
  backToTopBtn = btn;

  let isHovered = false;

  // 动态阈值：至少 150px，且不低于视口高度的 20%（最大 300px）
  const threshold = Math.min(300, Math.max(150, window.innerHeight * 0.2));

  const updateVisibility = (scrollY: number): void => {
    const show = scrollY > threshold;
    btn.classList.toggle('hidden', !show);

    if (isHovered) {
      btn.textContent = '↑';
    } else {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const percent = docHeight > 0 ? Math.round((scrollY / docHeight) * 100) : 0;
      btn.textContent = String(percent);
    }
  };
  updateVisibilityFn = updateVisibility;

  // 订阅滚动（scrollDispatcher 内部 rAF 节流，多订阅者共享一个监听）
  const unsubscribe = scrollDispatcher.subscribe(updateVisibility);

  // resize 时以当前滚动位置重新计算百分比
  const onResize = (): void => {
    updateVisibility(scrollDispatcher.getScrollY());
  };
  window.addEventListener('resize', onResize, { passive: true });

  // 点击返回顶部
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 悬停切换显示内容
  btn.addEventListener('mouseenter', () => {
    isHovered = true;
    updateVisibility(scrollDispatcher.getScrollY());
  });
  btn.addEventListener('mouseleave', () => {
    isHovered = false;
    updateVisibility(scrollDispatcher.getScrollY());
  });

  // 保存清理函数（供潜在的手动销毁场景）
  btn._cleanup = (): void => {
    unsubscribe();
    window.removeEventListener('resize', onResize);
    updateVisibilityFn = null;
    backToTopBtn = null;
  };
}

// ---------- TOC 浮动按钮 ----------

// 判断是否应该显示 TOC 按钮（仅移动端 + 文章页）
function shouldShowTocButton(): boolean {
  const isArticlePage = !!(
    document.querySelector('.article-page-container') ||
    document.getElementById('articleBody')
  );
  if (!isArticlePage) return false;
  return window.innerWidth <= CONFIG.BREAKPOINTS.MOBILE;
}

/**
 * 更新 TOC 按钮状态：根据条件创建或移除
 */
function updateTocButton(): void {
  const show = shouldShowTocButton();

  if (show) {
    if (!tocBtn) {
      const c = ensureContainer();
      const btn = document.createElement('button');
      btn.className = 'floating-btn';
      btn.id = 'tocFloatingBtn';
      btn.setAttribute('aria-label', '切换目录');
      btn.textContent = '📑';
      c.appendChild(btn);
      tocBtn = btn;
      btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('article:toggleSidebar'));
      });
      console.log('[TOC] 创建目录按钮 (移动端)');
    }
  } else {
    if (tocBtn) {
      tocBtn.remove();
      tocBtn = null;
      console.log('[TOC] 移除目录按钮');
    }
  }
}

/**
 * 初始化文章目录（TOC）浮动按钮，并监听窗口变化
 */
export function initTocFloatingButton(): void {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  updateTocButton();

  resizeHandler = () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateTocButton();
      resizeTimeout = null;
    }, 200);
  };
  window.addEventListener('resize', resizeHandler);
}

// ---------- 设置按钮 ----------

export function initSettingsButton(): void {
  if (settingsBtn) return;

  const c = ensureContainer();
  const btn = document.createElement('button');
  btn.className = 'floating-btn';
  btn.id = 'settingsFloatingBtn';
  btn.setAttribute('aria-label', '打开设置');
  btn.innerHTML = '<i class="fas fa-cog"></i>';
  c.appendChild(btn);
  settingsBtn = btn;

  btn.addEventListener('click', () => {
    // 动态加载设置浮窗
    import('/js/data/settings.js')
      .then((module) => {
        if (module.showSettingsPanel) {
          module.showSettingsPanel();
        } else {
          console.warn('[Settings] showSettingsPanel 未导出');
        }
      })
      .catch((err) => {
        console.error('[Settings] 加载设置模块失败:', err);
      });
  });
}

// ---------- 统一初始化 ----------

/**
 * 统一初始化所有浮动按钮
 */
export function initButtons(): void {
  initBackToTop();
  initTocFloatingButton();
  initSettingsButton();
}

// ---------- 导出：导航后刷新（由 AppInitializer 调用） ----------
export function refreshButtonsOnNavigation(): void {
  // 重置 TOC 按钮（不同页面可能不再需要）
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (tocBtn) {
    tocBtn.remove();
    tocBtn = null;
  }
  initTocFloatingButton();
  initSettingsButton();

  // 延迟更新返回顶部按钮（等待新页面滚动位置稳定）
  if (updateVisibilityFn) {
    setTimeout(() => {
      updateVisibilityFn?.(scrollDispatcher.getScrollY());
    }, 100);
  }
}