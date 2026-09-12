// /js/ui/detail-dialog.ts
// 通用详情弹窗，基于 modal-base

import { Utils } from '/js/core/core.js';
import { createModal, type ModalInstance } from '/js/core/modal-base.js';

export interface DetailDialogOptions {
  /** 弹窗标题（转义后显示） */
  title: string;
  /** 内容 HTML（直接插入，调用方负责转义可变内容） */
  htmlContent: string;
  /** 来源文字，显示在右下角 */
  source?: string;
}

/**
 * 显示一个模态详情弹窗
 * @returns 包含 close 方法的对象
 */
export function showDetailDialog(options: DetailDialogOptions): { close: () => void } {
  const { title, htmlContent, source = '' } = options;

  const sourceHtml = source
    ? `<div class="dialog-source">source：${Utils.escapeHtml(source)} -> detail-dialog</div>`
    : '';

  const modal: ModalInstance = createModal({
    overlayClass: 'modal-overlay',
    containerClass: 'work-details-envelope',
    closeOnEsc: true,
    closeOnOverlayClick: true,
    closeDuration: 400,
    content: `
      <div class="work-details-close" role="button" aria-label="关闭">✕</div>
      <div class="work-details-content">
        <h2 class="work-details-title">${Utils.escapeHtml(title)}</h2>
        ${htmlContent}
      </div>
      ${sourceHtml}
    `,
  });

  // 绑定关闭按钮（在容器内容上挂载，由 modal-base 统一管理生命周期）
  const closeBtn = modal.container.querySelector('.work-details-close');
  if (closeBtn) {
    const handler = () => modal.close();
    closeBtn.addEventListener('click', handler);
    // 无需手动解绑：DOM 会被整体移除
  }

  return { close: () => modal.close() };
}