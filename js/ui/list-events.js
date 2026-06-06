// ==================== /js/ui/list-events.js ====================
// 列表项点击事件与作品详情弹窗

import { Utils } from '/js/core/core.js';

export function showWorkDetails(work) {
  if (window.currentModalClose) window.currentModalClose();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  const envelope = document.createElement('div');
  envelope.className = 'work-details-envelope';
  const tags = work.tags || [];
  const tagsHtml = tags.length ? `<div class="work-details-tag"><strong>标签:</strong>${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>` : '';
  envelope.innerHTML = `
    <div class="work-details-close">✕</div>
    <div class="work-details-content">
      <h2 class="work-details-title">${Utils.escapeHtml(work.title)}</h2>
      <p class="work-details-description">${Utils.escapeHtml(work.description || '')}</p>
      ${tagsHtml}
      ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
    </div>
  `;
  document.body.appendChild(envelope);

  const closeModal = () => {
    if (envelope.classList.contains('closing')) return;
    envelope.classList.add('closing');
    overlay.classList.remove('active');
    setTimeout(() => {
      envelope.remove();
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      if (window.currentModalClose === closeModal) window.currentModalClose = null;
    }, 400);
  };

  const escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', closeModal);
  const closeBtn = envelope.querySelector('.work-details-close');
  closeBtn.addEventListener('click', closeModal);
  window.currentModalClose = closeModal;
  requestAnimationFrame(() => {
    envelope.classList.add('active');
    overlay.classList.add('active');
  });
}

export function handleListItemClick(e) {
  const item = e.target.closest('.list-item, .recent-item');
  if (!item) return;
  const type = item.dataset.type;
  if (type === 'work') {
    const workInfoRaw = item.dataset.workInfo;
    if (workInfoRaw) {
      try {
        const workInfo = JSON.parse(decodeURIComponent(workInfoRaw));
        showWorkDetails(workInfo);
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
