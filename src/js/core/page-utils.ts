// /js/core/page-utils.js
// 常用页面工具函数，供多个模块共享

import { CONFIG, Utils } from '/js/core/core.js';

export function getTimeBasedTheme() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function getPageNameFromPath(pathname) {
  // 去除首尾斜杠
  const trimmed = pathname.replace(/^\/|\/$/g, '');
  if (!trimmed) return 'index';          // 根路径返回 'index'
  const parts = trimmed.split('/');
  const last = parts[parts.length - 1];
  // 去除可能的扩展名（如 .html）
  const name = last.replace(/\.[^.]+$/, '');
  return name || 'index';
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

// ========== 优化后的背景图加载（不阻塞 LCP） ==========
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
    // 确保遮罩层在底部且不干扰交互
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      background-size: cover;
      background-position: center;
      opacity: 0;
      transition: opacity 0.5s ease;
      will-change: opacity;
    `;
    document.body.appendChild(overlay);
  }

  // 避免重复加载同一张图
  if (!force && overlay.style.backgroundImage === `url("${imageUrl}")` && overlay.classList.contains('active')) {
    return;
  }

  // 预加载图片，加载完成后淡入
  const img = new Image();
  img.onload = () => {
    overlay.style.backgroundImage = `url('${imageUrl}')`;
    overlay.classList.add('active');
    overlay.style.opacity = '1';
    document.body.classList.remove('background-loading');
  };
  img.onerror = (error) => {
    console.warn('[WARN] 背景图片加载失败:', error);
    overlay.classList.add('active');
    overlay.style.opacity = '0.3'; // 降级显示
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