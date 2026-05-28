// ==================== /js/page-utils.js ====================
// 常用页面工具函数，供多个模块共享

import { CONFIG, Utils } from '/js/core.js';

export function getTimeBasedTheme() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function getPageNameFromPath(pathname) {
  const name = pathname.split('/').pop() || 'index';
  return name.replace('.html', '') || 'index';
}

export function isArticleDetailOr404Page() {
  try {
    const path = window.location.pathname || '';
    const name = path.split('/').pop() || '';
    if (path.includes('/articles/') && name && name !== 'articles.html') return true;
    if (name === '404.html' || name === '404') return true;
    return false;
  } catch (e) {
    return false;
  }
}

export function isSameOrigin(href) {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function updateDynamicGreeting() {
  const greetingEl = document.getElementById('dynamic-greeting');
  if (!greetingEl) return;
  greetingEl.textContent = Utils.getGreetingMessage();
  greetingEl.style.fontWeight = 'bold';
}

export function applyRandomBackgroundImage({ force = false } = {}) {
  const { BACKGROUND_IMAGES } = CONFIG;
  if (!Array.isArray(BACKGROUND_IMAGES) || BACKGROUND_IMAGES.length === 0) return;

  const randomIndex = Math.floor(Math.random() * BACKGROUND_IMAGES.length);
  const imageUrl = BACKGROUND_IMAGES[randomIndex];

  // 获取或创建永久背景遮罩层
  let overlay = document.getElementById('bg-image-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bg-image-overlay';
    document.body.appendChild(overlay);
  }

  // 避免重复动画
  if (!force && overlay.style.backgroundImage === `url("${imageUrl}")` && overlay.classList.contains('active')) {
    return;
  }

  // 移除 active 类，重置动画状态
  overlay.classList.remove('active');
  // 强制重绘，确保重置生效
  void overlay.offsetWidth;

  // 更新
  overlay.style.backgroundImage = `url('${imageUrl}')`;

  // 预加载图片，确保动画开始时图片已经可用
  const img = new Image();
  img.onload = () => {
    // 图片加载完成后再添加 active 类，触发从模糊到清晰的过渡
    overlay.classList.add('active');
    document.body.classList.remove('background-loading');
  };
  img.onerror = (error) => {
    console.warn('[WARN] 背景图片加载失败:', error);
    // 即使加载失败，也尝试显示（可能显示破损图标），或者保持纯色背景
    overlay.classList.add('active');
    document.body.classList.remove('background-loading');
  };
  img.src = imageUrl;

  document.body.classList.add('background-loading');
}

export function startSiteAgeUpdater(SITE_BIRTH) {
  let siteAgeInterval = null;
  const updateAge = () => {
    const ageSpan = document.getElementById('site-age');
    if (!ageSpan) return;
    const now = Date.now();
    const diff = now - SITE_BIRTH.getTime();
    if (diff < 0) {
      ageSpan.innerText = '……等等，结果是负数？？！';
      return;
    }
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    ageSpan.innerText = `${days}天${hours.toString().padStart(2, '0')}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒`;
  };

  updateAge();
  siteAgeInterval = setInterval(updateAge, 1000);
  return () => {
    clearInterval(siteAgeInterval);
    siteAgeInterval = null;
  };
}

export async function updateFooterUpdateTime() {
  const updateSpan = document.getElementById('footer-update-date');
  if (!updateSpan) return;
  try {
    const response = await fetch(CONFIG.API.STATISTICS);
    if (!response.ok) throw new Error('无法获取统计信息');
    const stats = await response.json();
    const fullTime = stats.last_updated_full;
    const dateOnly = stats.last_updated;
    if (fullTime) {
      const relative = Utils.formatRelativeTime(fullTime);
      updateSpan.textContent = relative;
      const absDate = new Date(fullTime);
      const formatted = `${absDate.getFullYear()}年${(absDate.getMonth() + 1).toString().padStart(2, '0')}月${absDate.getDate().toString().padStart(2, '0')}日 ${absDate.getHours().toString().padStart(2, '0')}:${absDate.getMinutes().toString().padStart(2, '0')}:${absDate.getSeconds().toString().padStart(2, '0')}`;
      updateSpan.setAttribute('title', `最后统计时间：${formatted}`);
    } else if (dateOnly) {
      updateSpan.textContent = dateOnly;
      updateSpan.setAttribute('title', '数据最后更新日期');
    } else {
      updateSpan.textContent = '未知';
    }
  } catch (error) {
    console.warn('[WARN] 加载统计时间失败:', error);
    updateSpan.textContent = '获取失败';
    updateSpan.setAttribute('title', '无法加载 statistics.json');
  }
}
