// /js/ui/jump-dialog.ts
// 通用跳转确认弹窗，完全复用 friends.css 样式
// 提供 showJumpDialog 和 bindJumpTriggers 两种使用方式
// 基于 modal-base 统一管理遮罩、Esc、生命周期

import { Utils } from '/js/core/core.js';
import { createModal, type ModalInstance } from '/js/core/modal-base.js';

// ==================== 类型定义 ====================

export interface JumpDialogOptions {
  /** 目标名称（必填） */
  name: string;
  /** 跳转链接（必填） */
  url: string;
  /** 描述文本 */
  desc?: string;
  /** 头像 HTML 内容（例如 '<img src="...">' 或 '<div>...</div>'），若为空则不显示头像区域 */
  avatarHtml?: string;
  /** 倒计时秒数，默认 3；设为 0 则不自动跳转 */
  countdown?: number;
  /** 是否自动跳转，默认 true */
  autoRedirect?: boolean;
  /** 跳转目标，默认 '_blank' */
  redirectTarget?: '_blank' | '_self';
  /** 关闭回调 */
  onClose?: () => void;
  /** 跳转前回调，若返回 false 则取消跳转 */
  onRedirect?: (url: string) => void | boolean;
  /** 覆盖层自定义类名 */
  overlayClass?: string;
  /** 内容容器自定义类名 */
  contentClass?: string;
  /** 是否显示右上角关闭按钮（默认 false，点击背景或 ESC 关闭） */
  showCloseButton?: boolean;
  /** 起始锚点元素（用于放大动画） */
  anchorElement?: HTMLElement;
  /** 直接指定起始矩形（优先级高于 anchorElement） */
  anchorRect?: DOMRect;
}

export interface BindJumpTriggersOptions {
  /** 触发器选择器，默认 '[data-jump-trigger]' */
  triggerSelector?: string;
  /** 名称提取选择器（相对于触发器），默认 '.jump-name' */
  nameSelector?: string;
  /** 描述提取选择器，默认 '.jump-desc' */
  descSelector?: string;
  /** 头像提取选择器，默认 '.jump-avatar' */
  avatarSelector?: string;
  /** 从触发器获取 URL 的属性，默认 'href'（也支持 data-url） */
  urlAttr?: string;
  /** 完全自定义提取函数（优先级高于上述选择器） */
  extractor?: (trigger: HTMLElement) => Partial<JumpDialogOptions>;
  /** 传递给 showJumpDialog 的默认配置 */
  dialogDefaults?: Partial<JumpDialogOptions>;
}

// ==================== 主函数 ====================

/**
 * 显示跳转确认弹窗
 *
 * 交互细节：
 *  - 若提供 anchorElement / anchorRect，会从锚点位置放大展开
 *  - 内容在 400ms 后淡入
 *  - 倒计时在 650ms 后启动
 *  - Esc / 点击遮罩空白处 / 点击关闭按钮（若显示）均可关闭
 *  - 点击「立即前往」立即跳转
 */
export function showJumpDialog(options: JumpDialogOptions): { close: () => void } {
  const {
    name,
    url,
    desc = '',
    avatarHtml = '',
    countdown = 3,
    autoRedirect = true,
    redirectTarget = '_blank',
    onClose,
    onRedirect,
    overlayClass = '',
    contentClass = '',
    showCloseButton = false,
    anchorElement,
    anchorRect,
  } = options;

  // ---------- 状态 ----------
  let countdownInterval: number | null = null;
  let redirectTriggered = false;
  let isClosed = false;
  let modalInstance: ModalInstance | null = null;

  // ---------- 内部函数 ----------
  const stopCountdown = (): void => {
    if (countdownInterval !== null) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  const redirect = (): void => {
    if (redirectTriggered || isClosed) return;
    redirectTriggered = true;

    let shouldRedirect = true;
    if (onRedirect) {
      const result = onRedirect(url);
      if (result === false) shouldRedirect = false;
    }

    if (shouldRedirect) {
      window.open(url, redirectTarget, 'noopener,noreferrer');
    }
    // 稍等片刻让用户看到跳转反馈
    window.setTimeout(() => modalInstance?.close(), 300);
  };

  // ---------- 内容片段 ----------
  const avatarHtmlContent = avatarHtml
    ? `<div class="friend-link-avatar">${avatarHtml}</div>`
    : '';

  const closeBtnHtml = showCloseButton
    ? `<button class="friend-link-close" aria-label="关闭" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:28px;color:#fff;opacity:0.6;cursor:pointer;pointer-events:auto;">&times;</button>`
    : '';

  const contentHtml = `
    ${closeBtnHtml}
    ${avatarHtmlContent}
    <h2 class="friend-link-name">${Utils.escapeHtml(name)}</h2>
    ${desc ? `<p class="friend-link-desc">${Utils.escapeHtml(desc)}</p>` : ''}
    <p class="friend-link-url">${Utils.escapeHtml(url)}</p>
    <p class="friend-link-hint">即将启程！坐稳扶好，欢迎下次再来玩！</p>
    <div class="friend-link-countdown">
      倒计时 <span class="countdown-number">${countdown}</span> 秒
    </div>
    <button class="friend-link-go">立即前往</button>
  `;

  // ---------- 创建模态框 ----------
  const modal = createModal({
    overlayClass: `friend-link-overlay ${overlayClass}`.trim(),
    containerClass: `friend-link-content ${contentClass}`.trim(),
    containerInOverlay: true,   // friend-link 的 content 在 overlay 内
    autoActivate: false,        // 使用自定义的入场动画
    closeOnEsc: true,
    closeOnOverlayClick: true,  // 点击遮罩空白处关闭
    closeDuration: 400,
    content: contentHtml,
    onOpening: (instance) => {
      modalInstance = instance;

      // ----- 初始状态 -----
      // overlay：全屏无背景，稍后过渡到模糊黑底
      Object.assign(instance.overlay.style, {
        width: '100%',
        height: '100%',
        top: '0',
        left: '0',
        background: 'rgba(0, 0, 0, 0)',
        backdropFilter: 'blur(0px)',
        borderRadius: '0',
      });

      // content：透明 + 下移
      instance.container.style.opacity = '0';
      instance.container.style.transform = 'translateY(20px) scale(0.95)';
      instance.container.style.transition =
        'opacity 0.5s ease 0.35s, transform 0.5s ease 0.35s';

      // ----- 下一帧执行锚点动画 -----
      requestAnimationFrame(() => {
        if (instance.isClosed()) return;

        let rect: DOMRect | null = null;
        if (anchorRect) {
          rect = anchorRect;
        } else if (anchorElement) {
          rect = anchorElement.getBoundingClientRect();
        }

        if (rect) {
          // 先把 overlay 缩到锚点位置
          Object.assign(instance.overlay.style, {
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            borderRadius: '16px',
            background: 'rgba(0, 0, 0, 0)',
            backdropFilter: 'blur(0px)',
          });
          // 强制回流，确保上一步生效
          void instance.overlay.offsetHeight;
          // 再展开到全屏
          Object.assign(instance.overlay.style, {
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            borderRadius: '0',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(16px) saturate(1.2)',
          });
        } else {
          // 无锚点：直接显示全屏背景
          Object.assign(instance.overlay.style, {
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(16px) saturate(1.2)',
          });
        }

        // ----- 内容淡入 -----
        window.setTimeout(() => {
          if (instance.isClosed()) return;
          instance.container.style.opacity = '1';
          instance.container.style.transform = 'translateY(0) scale(1)';
        }, 400);

        // ----- 倒计时启动 -----
        window.setTimeout(() => {
          if (instance.isClosed()) return;
          if (countdown <= 0 || !autoRedirect) return;

          let remaining = countdown;
          const countdownSpan = instance.container.querySelector<HTMLElement>('.countdown-number');

          countdownInterval = window.setInterval(() => {
            remaining--;
            if (countdownSpan) {
              countdownSpan.textContent = String(Math.max(0, remaining));
            }
            if (remaining <= 0) {
              stopCountdown();
              if (!instance.isClosed() && !redirectTriggered) redirect();
            }
          }, 1000);
        }, 650);
      });
    },
    onClosed: () => {
      isClosed = true;
      stopCountdown();
      onClose?.();
    },
  });

  // 双保险：createModal 是同步返回的，正常流程下 onOpening 已赋值
  modalInstance = modal;

  // ---------- 绑定关闭按钮 ----------
  const closeBtn = modal.container.querySelector<HTMLButtonElement>('.friend-link-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.close();
    });
  }

  // ---------- 绑定跳转按钮 ----------
  const goBtn = modal.container.querySelector<HTMLButtonElement>('.friend-link-go');
  if (goBtn) {
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      redirect();
    });
  }

  return { close: () => modal.close() };
}

// ==================== 声明式绑定 ====================

/**
 * 为容器内匹配的元素绑定点击事件，弹出跳转确认弹窗
 * @param container 父容器
 * @param options 配置
 * @returns 清理函数，用于解除绑定
 */
export function bindJumpTriggers(
  container: HTMLElement,
  options: BindJumpTriggersOptions = {}
): () => void {
  const {
    triggerSelector = '[data-jump-trigger]',
    nameSelector = '.jump-name',
    descSelector = '.jump-desc',
    avatarSelector = '.jump-avatar',
    urlAttr = 'href',
    extractor,
    dialogDefaults = {},
  } = options;

  const handleClick = (e: Event): void => {
    const trigger = (e.target as HTMLElement).closest(triggerSelector) as HTMLElement | null;
    if (!trigger) return;

    e.preventDefault();
    e.stopPropagation();

    let dialogOptions: Partial<JumpDialogOptions> = {};

    if (extractor) {
      dialogOptions = { ...dialogOptions, ...extractor(trigger) };
    } else {
      // ---------- 默认提取逻辑 ----------
      const url = trigger.getAttribute(urlAttr) || trigger.getAttribute('data-url') || '';
      const nameEl = trigger.querySelector<HTMLElement>(nameSelector);
      const descEl = trigger.querySelector<HTMLElement>(descSelector);
      const avatarEl = trigger.querySelector<HTMLElement>(avatarSelector);

      const name = nameEl ? nameEl.textContent?.trim() || '' : '';
      const desc = descEl ? descEl.textContent?.trim() || '' : '';
      let avatarHtml = '';

      if (avatarEl) {
        if (avatarEl.tagName === 'IMG') {
          const img = avatarEl as HTMLImageElement;
          avatarHtml = `<img src="${Utils.escapeHtml(img.src)}" alt="${Utils.escapeHtml(img.alt || name || '头像')}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
        } else {
          // 占位元素：取首字母 + 背景色
          const initial = name ? name.charAt(0).toUpperCase() : '?';
          const bg = window.getComputedStyle(avatarEl).backgroundColor || 'var(--accent-color, #b45b63)';
          avatarHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${Utils.escapeHtml(bg)};color:#fff;font-size:32px;font-weight:600;">${Utils.escapeHtml(initial)}</div>`;
        }
      }

      dialogOptions = {
        url,
        name: name || '未命名',
        desc,
        avatarHtml,
      };
    }

    const finalOptions: JumpDialogOptions = {
      ...dialogDefaults,
      ...dialogOptions,
      anchorElement: trigger,
    } as JumpDialogOptions;

    if (!finalOptions.url || !finalOptions.name) {
      console.warn('[JumpDialog] 缺少必填字段 url 或 name，跳过弹窗');
      return;
    }

    showJumpDialog(finalOptions);
  };

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}