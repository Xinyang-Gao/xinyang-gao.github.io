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

// ==================== 头像（照片）提取 ====================

/** 元素是否处于可显示状态（只看 display / visibility，忽略淡入用的 opacity） */
function isDisplayed(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * 图片是否可用：有真实地址，且不是「已加载完成但宽度为 0」这种必然失败的情况。
 * 尚未 complete（懒加载 / 仍在下载）视为可用 —— 弹窗里会重新发起加载。
 */
export function isDisplayableImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src || '';
  if (!src) return false;
  if (img.complete && img.naturalWidth === 0) return false;
  return isDisplayed(img);
}

/**
 * 生成弹窗头像 HTML。
 *
 * 默认只渲染一张铺满容器的照片，首字母占位用行内 `display:none` 藏起来；
 * 只有照片加载失败时（onerror）才把占位显示出来并移除破图。
 * 不做「照片压在占位之上」的叠层——叠层一旦缺样式就会变成上下各半、两边都看不全。
 */
export function buildAvatarHtml(src: string, alt: string, fallbackText = ''): string {
  if (!src) return '';
  const text = (fallbackText || alt || '').trim();
  const initial = (text.charAt(0) || '?').toUpperCase();
  return (
    // 关键尺寸一并写成行内样式：弹窗不依赖新 CSS 也能正确铺满容器
    `<div class="friend-link-avatar-stack" style="position:relative;width:100%;height:100%">` +
    `<img class="friend-link-avatar-img" src="${Utils.escapeHtml(src)}" ` +
    `alt="${Utils.escapeHtml(alt || text || '头像')}" decoding="async" ` +
    `style="width:100%;height:100%;object-fit:cover;display:block" ` +
    `onerror="var p=this.nextElementSibling;if(p)p.style.display='flex';this.remove()">` +
    `<div class="friend-link-avatar-placeholder" style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:3rem;font-weight:700;color:#fff;background:var(--accent-color,#b45b63)">${Utils.escapeHtml(initial)}</div>` +
    `</div>`
  );
}

/**
 * 从触发器里挑出头像（照片）。
 *
 * 调用方常写成 '.avatar-img, .avatar-placeholder' 这类逗号选择器，
 * 而 querySelector 只返回「文档顺序第一个」——友链卡片里占位 div 排在 img 前面，
 * 照片会被整段丢弃，弹窗永远只显示首字母。
 * 这里改为按选择器声明顺序逐个尝试，并跳过已隐藏 / 加载失败的候选。
 */
export function extractAvatarHtml(
  root: HTMLElement,
  avatarSelector: string,
  name = ''
): string {
  // 1) 显式声明的照片地址优先级最高
  const explicit = root.dataset?.jumpAvatar || root.dataset?.avatar;
  if (explicit) return buildAvatarHtml(explicit, name, name);

  const selectors = avatarSelector.split(',').map(s => s.trim()).filter(Boolean);

  for (const selector of selectors) {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el || !isDisplayed(el)) continue;

    // 2) 候选本身就是图片
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement;
      if (isDisplayableImage(img)) {
        return buildAvatarHtml(img.currentSrc || img.src, img.alt || name, name);
      }
      continue; // 加载失败：让位给后面的占位选择器
    }

    // 3) 候选是容器：内部有可用图片时优先用图片
    const inner = el.querySelector<HTMLImageElement>('img');
    if (inner && isDisplayableImage(inner)) {
      return buildAvatarHtml(inner.currentSrc || inner.src, inner.alt || name, name);
    }

    // 4) 纯占位元素：首字母 + 背景色
    const initial = (name.trim() || '?').charAt(0).toUpperCase();
    const bg =
      window.getComputedStyle(el).backgroundColor || 'var(--accent-color, #b45b63)';
    return `<div class="friend-link-avatar-placeholder" style="background:${Utils.escapeHtml(bg)};">${Utils.escapeHtml(initial)}</div>`;
  }

  return '';
}

/** 取 URL 的主机名，失败时返回空串 */
function hostnameOf(url: string): string {
  try {
    return new URL(url, window.location.href).hostname;
  } catch {
    return '';
  }
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

  /**
   * 打标记：告诉 ExternalLinkManager「这个触发器已被接管」，
   * 避免同一张卡片被弹窗处理两次。
   */
  const markBound = (el: Element): void => {
    if (el instanceof HTMLElement) el.dataset.jumpBound = 'true';
  };
  container.querySelectorAll(triggerSelector).forEach(markBound);

  const handleClick = (e: Event): void => {
    const start = e.target as HTMLElement | null;
    const trigger = start?.closest?.(triggerSelector) as HTMLElement | null;
    if (!trigger) return;

    markBound(trigger);

    let dialogOptions: Partial<JumpDialogOptions> = {};

    if (extractor) {
      dialogOptions = { ...extractor(trigger) };
    } else {
      // ---------- 默认提取逻辑 ----------
      const url = trigger.getAttribute(urlAttr) || trigger.getAttribute('data-url') || '';
      const nameEl = trigger.querySelector<HTMLElement>(nameSelector);
      const descEl = trigger.querySelector<HTMLElement>(descSelector);

      const name = nameEl ? nameEl.textContent?.trim() || '' : '';
      const desc = descEl ? descEl.textContent?.trim() || '' : '';

      dialogOptions = {
        url,
        name,
        desc,
        // 照片：按选择器顺序挑选真正可用的图片，失败再退回首字母占位
        avatarHtml: extractAvatarHtml(trigger, avatarSelector, name),
      };
    }

    const finalOptions = {
      ...dialogDefaults,
      ...dialogOptions,
      anchorElement: trigger,
    } as JumpDialogOptions;

    /**
     * 校验必须放在 preventDefault 之前：
     * 原来「先拦截、再校验」，缺字段时直接 return，
     * 点击被整条吞掉，链接再也打不开。
     */
    if (!finalOptions.url) {
      console.warn('[JumpDialog] 触发器缺少 url，交由浏览器默认行为处理');
      return;
    }
    if (!finalOptions.name) {
      finalOptions.name = hostnameOf(finalOptions.url) || '外部链接';
    }

    e.preventDefault();
    e.stopPropagation();
    showJumpDialog(finalOptions);
  };

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}