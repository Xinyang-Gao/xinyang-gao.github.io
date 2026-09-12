// /js/core/theme-controller.ts
// 主题控制器：单一数据源，统一 auto/light/dark 模式、系统偏好、存储与事件分发

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme } from '/js/core/page-utils.js';

export type Theme = 'light' | 'dark';
export type ThemeMode = 'auto' | 'light' | 'dark';

/** 新键：settings_theme_mode，值为 'auto' | 'light' | 'dark' */
const THEME_MODE_KEY = 'settings_theme_mode';
/** 旧键：'theme'，值只有 'light' | 'dark'，用于兼容迁移 */
const LEGACY_THEME_KEY = CONFIG.STORAGE_KEYS.THEME;

type ChangeListener = (theme: Theme, mode: ThemeMode) => void;

class ThemeController {
  private mode: ThemeMode = 'auto';
  private theme: Theme = 'light';
  private listeners = new Set<ChangeListener>();
  private mediaQuery: MediaQueryList | null = null;
  private initialized = false;

  /**
   * 初始化控制器：读取模式、应用主题、监听系统偏好。
   * 幂等，可安全重复调用。
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.mode = this.readMode();
    this.theme = this.resolveTheme(this.mode);
    this.applyTheme(this.theme);

    // 监听系统偏好变化（仅在 auto 模式下响应）
    if (typeof window.matchMedia === 'function') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', this.handleSystemChange);
    }
  }

  /** 当前模式 */
  getMode(): ThemeMode {
    return this.mode;
  }

  /** 当前实际生效主题 */
  getTheme(): Theme {
    return this.theme;
  }

  /**
   * 设置模式。'auto' 会清除手动主题偏好，
   * 若 mode 与当前一致则不触发任何操作。
   */
  setMode(mode: ThemeMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    storageController.setItem(THEME_MODE_KEY, mode);
    storageController.removeItem(LEGACY_THEME_KEY);
    this.applyMode();
  }

  /**
   * 订阅主题变化。返回取消订阅函数。
   * 与 window 'themeChanged' 事件并行存在，方便非模块化代码订阅。
   */
  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** 释放资源（一般只在测试或极端场景调用） */
  destroy(): void {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.handleSystemChange);
      this.mediaQuery = null;
    }
    this.listeners.clear();
    this.initialized = false;
  }

  // ---------- 内部 ----------

  private handleSystemChange = (): void => {
    if (this.mode === 'auto') {
      this.applyMode();
    }
  };

  private applyMode(): void {
    const nextTheme = this.resolveTheme(this.mode);
    const changed = nextTheme !== this.theme;
    this.theme = nextTheme;
    if (changed) this.applyTheme(nextTheme);
    // 即便主题色未变，也通知订阅者（模式变了，比如 dark → auto 但当前仍是 dark）
    this.emit();
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    // 触发 CSS 过渡类
    document.body.classList.add('theme-changing');
    window.setTimeout(() => {
      document.body.classList.remove('theme-changing');
    }, 600);
  }

  private resolveTheme(mode: ThemeMode): Theme {
    if (mode === 'auto') return getTimeBasedTheme();
    return mode;
  }

  /**
   * 读取模式：
   * 1. 优先读新键 settings_theme_mode
   * 2. 回退读旧键 theme（若有值则迁移到新键并删除旧键）
   * 3. 否则默认 auto
   */
  private readMode(): ThemeMode {
    const stored = storageController.getItem(THEME_MODE_KEY);
    if (stored === 'auto' || stored === 'light' || stored === 'dark') {
      return stored;
    }

    const legacy = storageController.getItem(LEGACY_THEME_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      // 迁移旧值
      storageController.setItem(THEME_MODE_KEY, legacy);
      storageController.removeItem(LEGACY_THEME_KEY);
      return legacy;
    }

    return 'auto';
  }

  private emit(): void {
    this.listeners.forEach((cb) => {
      try {
        cb(this.theme, this.mode);
      } catch (e) {
        console.warn('[ThemeController] listener error:', e);
      }
    });

    // 兼容旧代码：继续派发 themeChanged 事件
    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: { theme: this.theme, mode: this.mode },
      })
    );
  }
}

export const themeController = new ThemeController();