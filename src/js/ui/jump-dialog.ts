// /js/ui/jump-dialog.ts
// 通用跳转确认弹窗，完全复用 friends.css 样式
// 提供 showJumpDialog 和 bindJumpTriggers 两种使用方式

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

let currentDialog: {
  overlay: HTMLElement;
  content: HTMLElement;
  close: () => void;
} | null = null;

function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getElementRect(el: HTMLElement): DOMRect {
  return el.getBoundingClientRect();
}

/**
 * 显示跳转确认弹窗
 */
export function showJumpDialog(options: JumpDialogOptions): { close: () => void } {
  // 关闭已存在的弹窗
  if (currentDialog) {
    currentDialog.close();
    currentDialog = null;
  }

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

  // ---------- 创建覆盖层 ----------
  const overlay = document.createElement('div');
  overlay.className = `friend-link-overlay ${overlayClass}`;
  // 默认全屏尺寸
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.background = 'rgba(0, 0, 0, 0)';
  overlay.style.backdropFilter = 'blur(0px)';
  overlay.style.borderRadius = '0';
  if (anchorElement || anchorRect) {
    overlay.dataset.anchored = 'true';
  }

  // ---------- 内容容器 ----------
  const content = document.createElement('div');
  content.className = `friend-link-content ${contentClass}`;
  content.style.opacity = '0';
  content.style.transform = 'translateY(20px) scale(0.95)';
  content.style.transition = 'opacity 0.5s ease 0.35s, transform 0.5s ease 0.35s';

  // ---------- 头像处理 ----------
  let avatarHtmlContent = '';
  if (avatarHtml) {
    // 仅在提供了 avatarHtml 时渲染头像区域
    avatarHtmlContent = `<div class="friend-link-avatar">${avatarHtml}</div>`;
  }

  // 关闭按钮（可选）
  const closeBtnHtml = showCloseButton
    ? `<button class="friend-link-close" aria-label="关闭" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:28px;color:#fff;opacity:0.6;cursor:pointer;pointer-events:auto;">&times;</button>`
    : '';

  content.innerHTML = `
    ${closeBtnHtml}
    ${avatarHtmlContent}
    <h2 class="friend-link-name">${escapeHtml(name)}</h2>
    ${desc ? `<p class="friend-link-desc">${escapeHtml(desc)}</p>` : ''}
    <p class="friend-link-url">${escapeHtml(url)}</p>
    <p class="friend-link-hint">即将启程！坐稳扶好，欢迎下次再来玩！</p>
    <div class="friend-link-countdown">
      倒计时 <span class="countdown-number">${countdown}</span> 秒
    </div>
    <button class="friend-link-go">立即前往</button>
  `;

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // ---------- DOM 引用 ----------
  const countdownSpan = content.querySelector('.countdown-number') as HTMLElement;
  const goBtn = content.querySelector('.friend-link-go') as HTMLButtonElement;
  const closeBtn = content.querySelector('.friend-link-close') as HTMLButtonElement;

  // ---------- 状态 ----------
  let remaining = countdown;
  let countdownInterval: number | null = null;
  let isClosed = false;
  let redirectTriggered = false;

  // ---------- 关闭函数 ----------
  const close = (): void => {
    if (isClosed) return;
    isClosed = true;

    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    document.removeEventListener('keydown', escHandler);
    overlay.removeEventListener('click', overlayClickHandler);

    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(0.92)';
    overlay.style.backdropFilter = 'blur(0px)';
    content.style.opacity = '0';
    content.style.transform = 'translateY(20px) scale(0.95)';

    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
      if (currentDialog === dialogRef) currentDialog = null;
    }, 400);

    if (onClose) onClose();
  };

  // ---------- 跳转函数 ----------
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
    setTimeout(close, 300);
  };

  // ---------- 事件绑定 ----------
  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const overlayClickHandler = (e: MouseEvent): void => {
    if (e.target === overlay) close();
  };

  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', overlayClickHandler);

  goBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    redirect();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
  }

  // ---------- 倒计时 ----------
  const startCountdown = (): void => {
    if (countdown <= 0 || !autoRedirect) return;
    countdownInterval = window.setInterval(() => {
      remaining--;
      if (countdownSpan) {
        countdownSpan.textContent = String(Math.max(0, remaining));
      }
      if (remaining <= 0) {
        clearInterval(countdownInterval!);
        countdownInterval = null;
        if (!isClosed && !redirectTriggered) redirect();
      }
    }, 1000);
  };

  // ---------- 锚点放大动画 ----------
  const applyAnchorAnimation = (): void => {
    let rect: DOMRect | null = null;
    if (anchorRect) {
      rect = anchorRect;
    } else if (anchorElement) {
      rect = getElementRect(anchorElement);
    }

    if (rect) {
      overlay.style.top = rect.top + 'px';
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.borderRadius = '16px';
      overlay.style.background = 'rgba(0, 0, 0, 0)';
      overlay.style.backdropFilter = 'blur(0px)';
      // 强制回流
      void overlay.offsetHeight;
      // 过渡到全屏
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.borderRadius = '0';
      overlay.style.background = 'rgba(0, 0, 0, 0.65)';
      overlay.style.backdropFilter = 'blur(16px) saturate(1.2)';
    } else {
      // 无锚点：直接显示全屏背景
      overlay.style.background = 'rgba(0, 0, 0, 0.65)';
      overlay.style.backdropFilter = 'blur(16px) saturate(1.2)';
    }
  };

  // ---------- 执行 ----------
  requestAnimationFrame(() => {
    applyAnchorAnimation();
  });

  setTimeout(() => {
    if (!isClosed) {
      content.style.opacity = '1';
      content.style.transform = 'translateY(0) scale(1)';
    }
  }, 400);

  setTimeout(() => {
    if (!isClosed) startCountdown();
  }, 650);

  const dialogRef = { overlay, content, close };
  currentDialog = dialogRef;

  return { close };
}

// ==================== 声明式绑定 ====================

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
    const trigger = (e.target as HTMLElement).closest(triggerSelector) as HTMLElement;
    if (!trigger) return;

    e.preventDefault();
    e.stopPropagation();

    let dialogOptions: Partial<JumpDialogOptions> = {};

    if (extractor) {
      dialogOptions = { ...dialogOptions, ...extractor(trigger) };
    } else {
      // 默认提取逻辑
      const url = trigger.getAttribute(urlAttr) || trigger.getAttribute('data-url') || '';
      const nameEl = trigger.querySelector(nameSelector) as HTMLElement;
      const descEl = trigger.querySelector(descSelector) as HTMLElement;
      const avatarEl = trigger.querySelector(avatarSelector) as HTMLElement;

      let name = nameEl ? nameEl.textContent?.trim() || '' : '';
      const desc = descEl ? descEl.textContent?.trim() || '' : '';
      let avatarHtml = '';

      if (avatarEl) {
        if (avatarEl.tagName === 'IMG') {
          const img = avatarEl as HTMLImageElement;
          avatarHtml = `<img src="${img.src}" alt="${img.alt || name || '头像'}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
        } else {
          // 占位元素：取首字母 + 背景色
          const initial = name ? name.charAt(0).toUpperCase() : '?';
          const bg = window.getComputedStyle(avatarEl).backgroundColor || 'var(--accent-color, #b45b63)';
          avatarHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${bg};color:#fff;font-size:32px;font-weight:600;">${initial}</div>`;
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