// /js/ui/ui-effects.ts
// 顶层 UI 编排：外链管理、滚动揭示、鼠标特效、工具提示
// 设置读取统一走 settings.ts 的 isEnabled；
// 同源判定统一走 Utils.isSameOrigin；调度统一走 core.scheduleIdle。

import { CONFIG, Utils, scheduleIdle } from '/js/core/core.js';
import { isEnabled } from '/js/data/settings.js';
import { showJumpDialog, extractAvatarHtml } from '/js/ui/jump-dialog.js';
import { CustomCursor } from './mouse-effects.js';
import { initTooltips } from './tooltip.js';

const K = CONFIG.STORAGE_KEYS;

// ===================================================================
//  ExternalLinkManager — 外链管理（基于 jump-dialog）
// ===================================================================
export class ExternalLinkManager {
  /**
   * 白名单统一取自 CONFIG.EXTERNAL_WHITELIST。
   * 原来这里另有一份内容不一致的副本（core 里那份则完全没人用），
   * 导致同源外链判定存在两套标准。
   */
  private WHITELIST: Set<string> = CONFIG.EXTERNAL_WHITELIST;
  private _boundHandleClick: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.init();
  }

  /**
   * 是否站外链接。
   * 同源判定收敛到 Utils.isSameOrigin；此处仅补充协议过滤。
   */
  private isExternalLink(url: string): boolean {
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false;
    try {
      const linkUrl = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(linkUrl.protocol)) return false;
      return !Utils.isSameOrigin(linkUrl);
    } catch {
      return false;
    }
  }

  private isWhitelisted(url: string): boolean {
    try {
      const hostname = new URL(url, window.location.href).hostname.toLowerCase();
      if (this.WHITELIST.has(hostname)) return true;
      for (const domain of this.WHITELIST) {
        if (hostname.endsWith('.' + domain)) return true;
      }
    } catch {}
    return false;
  }

  /**
   * 弹窗标题的取值顺序：
   * 显式声明 > title / aria-label > 卡片标题 > 图片 alt > 文本 > 主机名。
   * 原来只取 anchor.textContent，图片链接拿不到名字，
   * 而卡片类链接会把整段描述塞进标题。
   */
  private pickName(anchor: HTMLAnchorElement, href: string): string {
    const declared = (anchor.dataset.jumpName || anchor.dataset.name || '').trim();
    if (declared) return declared;

    const label = (anchor.getAttribute('title') || anchor.getAttribute('aria-label') || '').trim();
    if (label) return label;

    const heading = anchor.querySelector(
      '.friend-name, .jump-name, .external-link-name, h1, h2, h3',
    );
    const headingText = heading?.textContent?.trim();
    if (headingText) return headingText;

    const alt = anchor.querySelector('img[alt]')?.getAttribute('alt')?.trim();
    if (alt) return alt;

    const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;

    try {
      return new URL(href, window.location.href).hostname;
    } catch {
      return '外部链接';
    }
  }

  private handleLinkClick = (e: MouseEvent): void => {
    /**
     * 中键 / Ctrl(Cmd)+点击 / Shift+点击 等交给浏览器：
     * 这些操作本意是「新标签页打开」，不该被确认弹窗拦下。
     */
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // 已被更内层的处理器消费（图片查看器等）
    if (e.defaultPrevented) return;

    const start = e.target as Element | null;
    const anchor = start?.closest?.('a') as HTMLAnchorElement | null;
    if (!anchor) return;

    // 下载链接不拦
    if (anchor.hasAttribute('download')) return;
    // 已由 bindJumpTriggers 接管（友链卡片等），避免弹两次
    if (anchor.closest('[data-jump-bound="true"], [data-friend-link="true"]')) return;

    const href = anchor.getAttribute('href');
    if (!href || !this.isExternalLink(href)) return;

    e.preventDefault();
    e.stopPropagation();

    // 白名单直接跳转
    if (this.isWhitelisted(href)) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    const name = this.pickName(anchor, href);

    // 使用 jump-dialog 弹窗确认
    showJumpDialog({
      name,
      url: href,
      desc: (anchor.dataset.jumpDesc || '').trim() || '您即将访问外部网站，本站不对第三方内容负责',
      // 链接里的照片（头像 / 封面）传给弹窗展示
      avatarHtml: extractAvatarHtml(anchor, 'img', name),
      // Chrome 的瞬时用户激活只保留 5s：弹窗入场 650ms + 倒计时必须留出余量。
      // 原为 6s（总 6.65s），自动跳转的 window.open 必被弹窗拦截 → "倒计时到 0 却没反应"
      countdown: 3,
      redirectTarget: '_blank',
      anchorElement: anchor,
      onRedirect: (url) => {
        console.log('[ExternalLinkManager] 跳转至:', url);
      },
    });
  };

  private init(): void {
    this._boundHandleClick = this.handleLinkClick;
    document.addEventListener('click', this._boundHandleClick);
    console.log('[ExternalLinkManager] 已启用（基于 jump-dialog）');
  }

  public destroy(): void {
    if (this._boundHandleClick) {
      document.removeEventListener('click', this._boundHandleClick);
      this._boundHandleClick = null;
    }
    console.log('[ExternalLinkManager] 已销毁');
  }
}

// ===================================================================
//  ScrollReveal — 滚动揭示
// ===================================================================
export class ScrollReveal {
  private observer: IntersectionObserver | null = null;
  private targetSelector: string;

  constructor(selector: string = '.list-item') {
    this.targetSelector = selector;
    this.initObserver();
    this.observe();
  }

  private initObserver(): void {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -20px 0px' },
    );
  }

  public observe(
    targets: NodeListOf<Element> | Element[] = document.querySelectorAll(this.targetSelector),
  ): void {
    if (!this.observer) return;
    targets.forEach((el) => {
      if (!el.classList.contains('revealed')) {
        this.observer!.observe(el);
      }
    });
  }

  public refresh(): void {
    const hidden = document.querySelectorAll(`${this.targetSelector}:not(.revealed)`);
    if (hidden.length) {
      hidden.forEach((el) => this.observer?.observe(el));
    }
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// ===================================================================
//  全局单例管理
// ===================================================================

let globalScrollRevealInstance: ScrollReveal | null = null;
let uiEffectsInitialized = false;
let customCursorInstance: CustomCursor | null = null;
let externalLinkManagerInstance: ExternalLinkManager | null = null;

export function refreshUIEffects(): void {
  // 销毁现有实例
  if (customCursorInstance) {
    customCursorInstance.destroy();
    customCursorInstance = null;
  }
  if (externalLinkManagerInstance) {
    externalLinkManagerInstance.destroy();
    externalLinkManagerInstance = null;
  }

  // 根据当前设置重新创建（统一从 settings.ts 读取）
  if (isEnabled(K.CURSOR_ENABLED, true)) {
    customCursorInstance = new CustomCursor();
  }
  if (isEnabled(K.LINK_WARNING_ENABLED, true)) {
    externalLinkManagerInstance = new ExternalLinkManager();
  }
}

export function ensureScrollReveal(): ScrollReveal {
  if (!globalScrollRevealInstance) {
    globalScrollRevealInstance = new ScrollReveal();
  }
  window.scrollRevealInstance = globalScrollRevealInstance;
  return globalScrollRevealInstance;
}

export function refreshScrollReveal(): void {
  if (globalScrollRevealInstance) {
    globalScrollRevealInstance.refresh();
  } else if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
  }
}

export function getScrollReveal(): ScrollReveal | null {
  return globalScrollRevealInstance || window.scrollRevealInstance || null;
}

export function initUIEffects(): void {
  if (uiEffectsInitialized) return;
  uiEffectsInitialized = true;

  // 统一走 core.scheduleIdle，禁止本地再写 idle 降级逻辑
  scheduleIdle(
    () => {
      refreshUIEffects();
      initTooltips();
    },
    { timeout: 3000 },
  );
}

// 重新导出鼠标特效与光标类，保持对外兼容
export { MouseEffectManager, CustomCursor } from './mouse-effects.js';
export { customCursorInstance, externalLinkManagerInstance };
