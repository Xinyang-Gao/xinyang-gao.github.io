// /js/ui/detail-dialog.ts
// 通用详情弹窗，支持标题、HTML内容、来源（右下角）

import { Utils } from '/js/core/core.js';

let currentCloseFn: (() => void) | null = null;

export interface DetailDialogOptions {
  /** 弹窗标题（转义后显示） */
  title: string;
  /** 内容 HTML（直接插入，不会自动转义） */
  htmlContent: string;
  /** 来源文字，显示在右下角，例如 "作品列表" */
  source?: string;
}

/**
 * 显示一个模态详情弹窗
 * @param options 配置项
 * @returns 包含 close 方法的对象，可手动关闭
 */
export function showDetailDialog(options: DetailDialogOptions): { close: () => void } {
  // 若已存在弹窗，先关闭
  if (currentCloseFn) {
    currentCloseFn();
    currentCloseFn = null;
  }

  const { title, htmlContent, source = '' } = options;

  // ---- 创建遮罩 ----
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);

  // ---- 创建主容器 ----
  const envelope = document.createElement('div');
  envelope.className = 'work-details-envelope';

  // ---- 构建内容 ----
  const sourceHtml = source
    ? `<div class="dialog-source">source：${Utils.escapeHtml(source)} -> detail-dialog</div>`
    : '';

  envelope.innerHTML = `
    <div class="work-details-close">✕</div>
    <div class="work-details-content">
      <h2 class="work-details-title">${Utils.escapeHtml(title)}</h2>
      ${htmlContent}
    </div>
    ${sourceHtml}
  `;

  document.body.appendChild(envelope);

  // ---- 关闭逻辑 ----
  const closeModal = () => {
    if (envelope.classList.contains('closing')) return;
    envelope.classList.add('closing');
    overlay.classList.remove('active');

    document.removeEventListener('keydown', escHandler);
    overlay.removeEventListener('click', overlayClickHandler);
    const closeBtn = envelope.querySelector('.work-details-close');
    if (closeBtn) closeBtn.removeEventListener('click', closeModal);

    setTimeout(() => {
      envelope.remove();
      overlay.remove();
      if (currentCloseFn === closeModal) currentCloseFn = null;
    }, 400);
  };

  // ---- 事件绑定 ----
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal();
  };
  const overlayClickHandler = () => closeModal();

  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', overlayClickHandler);
  const closeBtn = envelope.querySelector('.work-details-close');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  currentCloseFn = closeModal;

  // ---- 入场动画 ----
  requestAnimationFrame(() => {
    envelope.classList.add('active');
    overlay.classList.add('active');
  });

  return { close: closeModal };
}