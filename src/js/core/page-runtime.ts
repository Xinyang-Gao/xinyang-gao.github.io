// /js/core/page-runtime.ts
// 页面运行时行为：站点年龄、页脚时间。
// 背景由 /js/ui/sky-backdrop.js 负责（时间驱动的渐变天空），壁纸逻辑已移除。
// 工具函数（getPageNameFromPath / getTimeBasedTheme / isSameOrigin）已统一至 core.Utils。

import { Utils } from '/js/core/core.js';
import { dataService } from '/js/core/data-service.js';

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
    const { days, hours, minutes, seconds } = Utils.getSiteAgeParts(siteBirth);
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
    // 走 dataService 而非裸 fetch：statistics.json 在首屏已被加载过，
    // 裸 fetch 会让同一份数据被请求两次（审计 M8）
    const stats = await dataService.getStatistics();
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
