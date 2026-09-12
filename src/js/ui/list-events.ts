// /js/ui/list-events.ts
// 列表项点击事件与作品详情弹窗

import { Utils } from '/js/core/core.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';
import { fetchAndReplaceContent } from '/js/router/router.js';

export function handleListItemClick(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const item = target.closest<HTMLElement>('.list-item, .recent-item');
  if (!item) return;

  const type = item.dataset.type;

  if (type === 'work') {
    const workInfoRaw = item.dataset.workInfo;
    if (workInfoRaw) {
      try {
        const workInfo = JSON.parse(decodeURIComponent(workInfoRaw));
        const tags: string[] = workInfo.tags || [];
        const tagsHtml = tags.length
          ? `<div class="work-details-tag"><strong>标签:</strong>${tags
              .map((t) => `<span class="tag">${Utils.escapeHtml(t)}</span>`)
              .join('')}</div>`
          : '';
        showDetailDialog({
          title: workInfo.title,
          htmlContent: `
            <p class="work-details-description">${Utils.escapeHtml(workInfo.description || '')}</p>
            ${tagsHtml}
            ${workInfo.link ? `<a href="${workInfo.link}" target="_blank" class="work-details-link">查看</a>` : ''}
          `,
          source: 'list-events',
        });
      } catch (err) {
        console.error('[ERROR] 解析作品信息失败', err);
      }
    } else {
      console.warn('[WARN] 未找到作品信息，无法展示详情');
    }
    return;
  }

  if (type === 'article') {
    const itemUrl = item.dataset.url;
    if (!itemUrl) {
      console.warn('[WARN] 文章链接无效');
      return;
    }

    try {
      const full = new URL(itemUrl, window.location.href).href;
      if (full.indexOf(window.location.origin) === 0) {
        // 直接调用 router 导出的模块函数，不再依赖 window 全局
        void fetchAndReplaceContent(full, true);
      } else {
        window.open(full, '_blank');
      }
    } catch {
      window.open(itemUrl, '_blank');
    }
  }
}