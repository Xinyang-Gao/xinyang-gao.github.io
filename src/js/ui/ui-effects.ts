// /js/ui/ui-effects.ts
// 自定义光标、外链管理器、滚动揭示效果 + 鼠标特效系统（点击涟漪、长按爆发、拖拽连线）
// 鼠标特效与自定义光标已拆分至 ./mouse-effects.js

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme } from '/js/core/page-utils.js';
import { showJumpDialog } from '/js/ui/jump-dialog.js';
import { MouseEffectManager, CustomCursor } from './mouse-effects.js';

// 设置键名（与 settings.js 保持一致）
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled'
};

function isFeatureEnabled(key: string, defaultValue: boolean = true): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === 'true';
  } catch (e) { /* ignore */ }
  return defaultValue;
}

// ===================================================================
//  ExternalLinkManager — 外链管理（基于 jump-dialog）
// ===================================================================
export class ExternalLinkManager {
  private WHITELIST: Set<string> = new Set([
    'github.com', 'google.com', 'wikipedia.org',
    'twitter.com', 'linkedin.com', 'amazon.com', 'microsoft.com', 'travellings.cn'
  ]);
  private internalDomains: string[] = [
    'localhost', '127.0.0.1', window.location.hostname
  ];
  private _boundHandleClick: ((e: Event) => void) | null = null;

  constructor() {
    this.init();
  }

  private isExternalLink(url: string): boolean {
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false;
    try {
      const linkUrl = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(linkUrl.protocol)) return false;
      return !this.internalDomains.includes(linkUrl.hostname);
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

  private handleLinkClick = (e: Event): void => {
    const anchor = (e.target as Element).closest('a');
    if (!anchor) return;
    // 跳过友链卡片（由 friend-link-manager 处理）
    if (anchor.closest('[data-friend-link="true"]')) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (this.isExternalLink(href)) {
      e.preventDefault();
      e.stopPropagation();

      // 白名单直接跳转
      if (this.isWhitelisted(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }

      // 使用 jump-dialog 弹窗确认
      const name = anchor.textContent?.trim() || new URL(href, window.location.href).hostname;
      showJumpDialog({
        name: name || '外部链接',
        url: href,
        desc: '您即将访问外部网站，本站不对第三方内容负责',
        countdown: 6,
        redirectTarget: '_blank',
        onRedirect: (url) => {
          console.log('[ExternalLinkManager] 跳转至:', url);
        }
      });
    }
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
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -20px 0px' }
    );
  }

  public observe(targets: NodeListOf<Element> | Element[] = document.querySelectorAll(this.targetSelector)): void {
    if (!this.observer) return;
    targets.forEach(el => {
      if (!el.classList.contains('revealed')) {
        this.observer!.observe(el);
      }
    });
  }

  public refresh(): void {
    const hidden = document.querySelectorAll(`${this.targetSelector}:not(.revealed)`);
    if (hidden.length) {
      hidden.forEach(el => this.observer?.observe(el));
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

  // 根据当前设置重新创建
  const cursorEnabled = isFeatureEnabled(SETTINGS_KEYS.CURSOR_ENABLED, true);
  const linkWarningEnabled = isFeatureEnabled(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);

  if (cursorEnabled && !customCursorInstance) {
    customCursorInstance = new CustomCursor();
  }
  if (linkWarningEnabled && !externalLinkManagerInstance) {
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

  const initFn = () => {
    refreshUIEffects();
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(initFn, { timeout: 3000 });
  } else {
    setTimeout(initFn, 500);
  }
}

// 重新导出鼠标特效与光标类，保持对外兼容
export { MouseEffectManager, CustomCursor } from './mouse-effects.js';
export { customCursorInstance, externalLinkManagerInstance };