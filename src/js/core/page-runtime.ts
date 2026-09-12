// /js/core/page-runtime.ts
// 页面运行时行为：背景图、站点年龄、页脚时间。
// 工具函数（getPageNameFromPath / getTimeBasedTheme / isSameOrigin）已统一至 core.Utils。

import { CONFIG, Utils } from '/js/core/core.js';

// ========== 背景图（不阻塞 LCP） ==========
export function applyRandomBackgroundImage({ force = false } = {}): void {
  const { BACKGROUND_IMAGES } = CONFIG;
  if (!Array.isArray(BACKGROUND_IMAGES) || BACKGROUND_IMAGES.length === 0) return;

  const imageUrl = BACKGROUND_IMAGES[Math.floor(Math.random() * BACKGROUND_IMAGES.length)];

  let overlay = document.getElementById('bg-image-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bg-image-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: -1;
      background-size: cover;
      background-position: center;
      opacity: 0;
      transition: opacity 0.5s ease;
      will-change: opacity;
    `;
    document.body.appendChild(overlay);
  }

  if (!force && overlay.style.backgroundImage === `url("${imageUrl}")` && overlay.classList.contains('active')) {
    return;
  }

  const img = new Image();
  img.onload = () => {
    overlay!.style.backgroundImage = `url('${imageUrl}')`;
    overlay!.classList.add('active');
    overlay!.style.opacity = '1';
    document.body.classList.remove('background-loading');
  };
  img.onerror = (error) => {
    console.warn('[WARN] 背景图片加载失败:', error);
    overlay!.classList.add('active');
    overlay!.style.opacity = '0.3';
    document.body.classList.remove('background-loading');
  };
  img.src = imageUrl;

  document.body.classList.add('background-loading');
}

// ========== 站点年龄（返回清理函数） ==========
export function startSiteAgeUpdater(siteBirth: Date): () => void {
  let intervalId: number | null = null;

  const updateAge = (): void => {
    const ageSpan = document.getElementById('site-age');
    if (!ageSpan) return;
    const diff = Date.now() - siteBirth.getTime();
    if (diff < 0) {
      ageSpan.innerText = '……等等，结果是负数？？！';
      return;
    }
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    ageSpan.innerText = `${days}天${pad(hours)}小时${pad(minutes)}分钟${pad(seconds)}秒`;
  };

  updateAge();
  intervalId = window.setInterval(updateAge, 1000);

  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

// ========== 页脚最后更新时间 ==========
export async function updateFooterUpdateTime(): Promise<void> {
  const updateSpan = document.getElementById('footer-update-date');
  if (!updateSpan) return;

  try {
    const response = await fetch(CONFIG.API.STATISTICS);
    if (!response.ok) throw new Error('无法获取统计信息');
    const stats = await response.json();
    const fullTime = stats.last_updated_full;
    const dateOnly = stats.last_updated;

    if (fullTime) {
      updateSpan.textContent = Utils.formatRelativeTime(fullTime);
      const absDate = new Date(fullTime);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const formatted = `${absDate.getFullYear()}年${pad(absDate.getMonth() + 1)}月${pad(absDate.getDate())}日 ${pad(absDate.getHours())}:${pad(absDate.getMinutes())}:${pad(absDate.getSeconds())}`;
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