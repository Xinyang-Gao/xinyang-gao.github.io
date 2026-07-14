// /js/ui/button-manager.js
// 统一管理浮动按钮：返回顶部 + 文章目录（TOC）

let container = null;
let backToTopBtn = null;
let tocBtn = null;
let settingsBtn = null;
let resizeHandler = null;
let resizeTimeout = null;
let updateVisibilityFn = null; // 暴露更新函数

/**
 * 获取当前滚动距离（兼容多种浏览器）
 */
function getScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

/**
 * 创建浮动按钮容器（单例）
 */
function ensureContainer() {
  if (container) return container;
  let existing = document.querySelector('.floating-buttons');
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
 * 滚动时自动显示/隐藏（使用 hidden 类）
 */
export function initBackToTop() {
  if (backToTopBtn) return;
  const c = ensureContainer();
  const btn = document.createElement('button');
  btn.className = 'floating-btn hidden';
  btn.id = 'backToTopBtn';
  btn.setAttribute('aria-label', '返回顶部');
  btn.innerHTML = '↑';
  c.appendChild(btn);
  backToTopBtn = btn;

  // 动态阈值：至少 150px，且不低于视口高度的 20%（最大 300px）
  const threshold = Math.min(300, Math.max(150, window.innerHeight * 0.2));

  const updateVisibility = () => {
    const scrollY = getScrollTop();
    const show = scrollY > threshold;
    btn.classList.toggle('hidden', !show);
  };
  updateVisibilityFn = updateVisibility;

  // 绑定滚动和窗口大小变化事件
  const events = ['scroll', 'resize'];
  events.forEach(evt => {
    window.addEventListener(evt, updateVisibility, { passive: true });
  });

  // 点击返回顶部
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 立即执行一次（应对页面加载时已经滚动的情况）
  updateVisibility();

  // 保存清理函数
  btn._cleanup = () => {
    events.forEach(evt => {
      window.removeEventListener(evt, updateVisibility);
    });
  };
}

// 判断是否应该显示 TOC 按钮（仅移动端 + 文章页）
function shouldShowTocButton() {
  const isArticlePage = !!(
    document.querySelector('.article-page-container') ||
    document.getElementById('articleBody')
  );
  if (!isArticlePage) return false;
  return window.innerWidth <= 768; // 仅移动端
}

/**
 * 更新 TOC 按钮状态：根据条件创建或移除
 */
function updateTocButton() {
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
export function initTocFloatingButton() {
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

export function initSettingsButton() {
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
    import('/js/data/settings.js').then(module => {
      if (module.showSettingsPanel) {
        module.showSettingsPanel();
      } else {
        console.warn('[Settings] showSettingsPanel 未导出');
      }
    }).catch(err => {
      console.error('[Settings] 加载设置模块失败:', err);
    });
  });
}

/**
 * 统一初始化所有浮动按钮
 */
export function initButtons() {
  initBackToTop();
  initTocFloatingButton();
  initSettingsButton(); // 新增
}

// 监听无刷新导航，重新评估 TOC 按钮，并延迟更新返回按钮
window.addEventListener('ajax:navigation', () => {
  // 处理 TOC
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (tocBtn) {
    tocBtn.remove();
    tocBtn = null;
  }
  initTocFloatingButton();

  // 设置按钮通常不受影响，但为保险，可重新创建（如果被意外移除）
  // 由于已有单例保护，再次调用不会重复添加
  initSettingsButton();

  // 延迟更新返回按钮，等待滚动位置稳定
  if (updateVisibilityFn) {
    setTimeout(updateVisibilityFn, 100);
  }
});

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initButtons);
} else {
  initButtons();
}