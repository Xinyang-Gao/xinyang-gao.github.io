// /js/ui/list-events.js
// 列表项点击事件与作品详情弹窗

import { Utils } from '/js/core/core.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';

export function handleListItemClick(e) {
  const item = e.target.closest('.list-item, .recent-item');
  if (!item) return;
  const type = item.dataset.type;
  if (type === 'work') {
    const workInfoRaw = item.dataset.workInfo;
    if (workInfoRaw) {
      try {
        const workInfo = JSON.parse(decodeURIComponent(workInfoRaw));
        // 构造标签 HTML
        const tags = workInfo.tags || [];
        const tagsHtml = tags.length
          ? `<div class="work-details-tag"><strong>标签:</strong>${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>`
          : '';
        showDetailDialog({
          title: workInfo.title,
          htmlContent: `
            <p class="work-details-description">${Utils.escapeHtml(workInfo.description || '')}</p>
            ${tagsHtml}
            ${workInfo.link ? `<a href="${workInfo.link}" target="_blank" class="work-details-link">查看</a>` : ''}
          `,
          source: 'list-events'
        });
      } catch (e) {
        console.error('[ERROR] 解析作品信息失败', e);
      }
    } else {
      console.warn('[WARN] 未找到作品信息，无法展示详情');
    }
  } else if (type === 'article') {
    const itemUrl = item.dataset.url;
    if (itemUrl) {
      try {
        const full = new URL(itemUrl, window.location.href).href;
        if (typeof window.fetchAndReplaceContent === 'function' && full.indexOf(window.location.origin) === 0) {
          window.fetchAndReplaceContent(full, true);
        } else {
          window.open(full, '_blank');
        }
      } catch (e) {
        window.open(itemUrl, '_blank');
      }
    } else console.warn('[WARN] 文章链接无效');
  }
}
