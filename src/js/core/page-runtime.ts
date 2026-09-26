// /js/core/page-runtime.ts
// 页面运行时行为：背景图、站点年龄、页脚时间。
// 工具函数（getPageNameFromPath / getTimeBasedTheme / isSameOrigin）已统一至 core.Utils。

import { CONFIG, Utils } from '/js/core/core.js';

// ========== 背景图（不阻塞 LCP） ==========

/** 当前壁纸 URL 记录在 overlay 上，用于"恢复显示 vs 重新下载"的判定 */
const BG_URL_DATA = 'bgUrl';

function ensureOverlay(): HTMLElement | null {
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
  return overlay;
}

function revealOverlay(overlay: HTMLElement, imageUrl: string): void {
  overlay.style.backgroundImage = `url('${imageUrl}')`;
  overlay.classList.add('active');
  overlay.style.opacity = '1';
  document.body.classList.remove('background-loading');
}

/**
 * 确保背景壁纸处于显示态。
 *
 * 关键：已下载过壁纸时**只恢复显示，不重新下载**。
 * 之前的写法是每次 SPA 导航都走到 `applyRandomBackgroundImage({force:true})`，
 * force 会跳过同图短路，导致每次导航都重新拉一张 Bing UHD 壁纸（数百 KB）。
 */
export function showBackgroundImage(): void {
  const overlay = ensureOverlay();
  if (!overlay) return;

  const existing = overlay.dataset[BG_URL_DATA];
  if (existing) {
    revealOverlay(overlay, existing);
    return;
  }
  applyRandomBackgroundImage();
}

/** 随机挑选并下载一张壁纸（首次进入站点 / 用户主动换图） */
export function applyRandomBackgroundImage(): void {
  const { BACKGROUND_IMAGES } = CONFIG;
  if (!Array.isArray(BACKGROUND_IMAGES) || BACKGROUND_IMAGES.length === 0) return;

  const overlay = ensureOverlay();
  if (!overlay) return;

  // 已加载同一张且正在显示：直接返回
  const current = overlay.dataset[BG_URL_DATA];
  if (current && overlay.classList.contains('active') && overlay.style.opacity === '1') {
    revealOverlay(overlay, current);
    return;
  }

  // 有候选多张时避免连续选中同一张
  let imageUrl = BACKGROUND_IMAGES[Math.floor(Math.random() * BACKGROUND_IMAGES.length)];
  if (BACKGROUND_IMAGES.length > 1 && current && imageUrl === current) {
    imageUrl = BACKGROUND_IMAGES[(BACKGROUND_IMAGES.indexOf(current) + 1) % BACKGROUND_IMAGES.length];
  }

  const img = new Image();
  img.onload = () => {
    // 下载成功才记账，失败的图片不应被"恢复显示"复用
    overlay.dataset[BG_URL_DATA] = imageUrl;
    revealOverlay(overlay, imageUrl);
  };
  img.onerror = (error) => {
    console.warn('[WARN] 背景图片加载失败:', error);
    overlay.classList.add('active');
    overlay.style.opacity = '0.3';
    document.body.classList.remove('background-loading');
  };
  img.src = imageUrl;

  document.body.classList.add('background-loading');
}

// ========== 站点年龄（返回清理函数） ==========
export function startSiteAgeUpdater(siteBirth: Date): () => void {
  let intervalId: number | null = null;

  const stop = (): void => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const start = (): void => {
    if (intervalId === null) intervalId = window.setInterval(updateAge, 1000);
  };

  // 页面不可见时停止计时：既省电，也避免后台标签页堆积无意义的 DOM 写入
  const onVisibilityChange = (): void => {
    if (document.hidden) {
      stop();
    } else {
      updateAge();
      start();
    }
  };

  const updateAge = (): void => {
    const ageSpan = document.getElementById('site-age');
    // 元素短暂缺失（页脚异步加载中）时跳过本次，不要停掉计时器，
    // 否则页脚一旦被重建，年龄就永远不再更新了。
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
  start();
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibilityChange);
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