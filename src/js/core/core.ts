// /js/core/core.ts
// 配置常量、工具类、存储控制器与性能监控（TypeScript 严格模式）

// ==================== 全局类型声明 ====================
declare global {
  interface Window {
    LZString?: {
      compressToUTF16(input: string): string;
      decompressFromUTF16(input: string): string;
    };
    clearAllServiceWorkerCache?: () => Promise<void>;
    requestIdleCallback?: (
      cb: IdleRequestCallback,
      opts?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  }
}

// ==================== 数据类型定义 ====================
export interface WorkItem {
  id?: string | number;
  title?: string;
  description?: string;
  tags?: string[];
  tag?: string[] | string;
  date?: string;
  [key: string]: unknown;
}

export interface WorksData {
  works: WorkItem[];
}

export interface ArticleItem {
  id?: string | number;
  title?: string;
  description?: string;
  tags?: string[];
  tag?: string[] | string;
  date?: string;
  last_updated?: string;
  updated_date?: string;
  [key: string]: unknown;
}

export interface ArticlesData {
  articles: ArticleItem[];
}

// ==================== 运行环境 ====================
/**
 * 是否为开发环境（localhost / 127.0.0.1）。
 * 用于 Service Worker 注册、缓存行为等环境相关分支，避免多处硬编码。
 *
 * 注意：Service Worker（sw.js）运行在独立环境无法 import，
 * 其内部仍使用 `self.location.hostname` 独立判断，此为必要降级。
 */
export const IS_DEV: boolean =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// ==================== 配置常量（强类型） ====================
export const CONFIG = {
  STORAGE_KEYS: {
    // 系统状态
    COOKIE_CONSENT: 'cookieConsentAccepted',
    VISIT_RECORD: 'statisticsVisitRecord',
    THEME: 'theme', // 旧键，保留兼容 theme-controller 迁移
    // 数据缓存（压缩存储）
    WORKS_DATA: 'worksData',
    ARTICLES_DATA: 'articlesData',
    // 用户设置（唯一来源，避免多处重复定义）
    THEME_MODE: 'settings_theme_mode',
    CURSOR_ENABLED: 'settings_cursor_enabled',
    LINK_WARNING_ENABLED: 'settings_link_warning_enabled',
    FONT_SCALE: 'settings_font_scale',
    REVEAL_ENABLED: 'settings_reveal_enabled',
    BG_IMAGE_ENABLED: 'settings_bg_image_enabled',
  } as const,
  API: {
    WORKS: '/json/works.json',
    ARTICLES: '/json/articles.json',
    STATISTICS: '/json/statistics.json',
  } as const,
  EXTERNAL_WHITELIST: new Set<string>([
    'github.com',
    'vercel.com',
    'netlify.app',
    'wikipedia.org',
    'bilibili.com',
    'bing.com',
    'baidu.com',
    'zhihu.com',
    'csdn.net',
    'cloud.tencent.com',
    'aliyun.com',
    'gaoxinyang.lanzouq.com',
    'icp.gov.moe',
  ]),
  BACKGROUND_IMAGES: [
    'https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.OloupenaFalls_ZH-CN2980118660_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.LoganCreek_ZH-CN5372283365_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.PerseidasTenerife_ZH-CN8520379683_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.FanetteIsland_ZH-CN6466809551_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.WaitangiFjordlandNP_ZH-CN9436140228_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.SichuanTea_ZH-CN6703437873_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.EuropeFromISS_ZH-CN0722816540_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.SplugenPass_ZH-CN8347591461_UHD.jpg&pid=hp&w=1920',
  ],
  SITE_BIRTH: new Date('2025-02-22T12:23:53Z'),
  BREAKPOINTS: {
    MOBILE: 768,
  },
} as const;

export type StorageKey = typeof CONFIG.STORAGE_KEYS[keyof typeof CONFIG.STORAGE_KEYS];

// ==================== 调度工具 ====================
/**
 * 统一的空闲调度器。
 * 不支持 requestIdleCallback 时按 timeout 降级为 setTimeout。
 * 全站所有“非关键延迟初始化”必须走此函数，禁止各处重复实现降级逻辑。
 */
export function scheduleIdle(
  callback: () => void,
  options?: { timeout?: number }
): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, options ?? {});
  } else {
    setTimeout(callback, options?.timeout ?? 50);
  }
}

// ==================== 导航事件总线 ====================
/**
 * 导航事件的 detail 结构。与 router 派发的 CustomEvent 保持一致。
 */
export interface NavigationDetail {
  url: string;
  page: string;
}

const navigationCallbacks = new Set<(d: NavigationDetail) => void>();
let navigationBound = false;

function ensureNavigationBound(): void {
  if (navigationBound) return;
  navigationBound = true;

  // 单一 addEventListener，替代散落各处的 N 个监听器
  window.addEventListener('ajax:navigation', (e: Event) => {
    const detail =
      (e as CustomEvent<NavigationDetail>).detail ??
      ({ url: location.href, page: '' } as NavigationDetail);
    navigationCallbacks.forEach((cb) => {
      try {
        cb(detail);
      } catch (err) {
        console.warn('[Navigation] callback error:', err);
      }
    });
  });
}

/**
 * 订阅 `ajax:navigation` 事件，返回取消订阅函数。
 * 内部用一个 Set 维护回调，把 N 个独立 addEventListener 收敛为 1 个。
 *
 * 与 DisposableStack 搭配：
 *   const unsub = onNavigation(cb);
 *   stack.add(unsub);
 */
export function onNavigation(
  cb: (detail: NavigationDetail) => void
): () => void {
  ensureNavigationBound();
  navigationCallbacks.add(cb);
  return () => {
    navigationCallbacks.delete(cb);
  };
}

/**
 * 派发导航事件（router 使用）。
 * 与 `onNavigation` 配套，确保所有订阅者收到同一 detail。
 */
export function dispatchNavigation(detail: NavigationDetail): void {
  ensureNavigationBound();
  window.dispatchEvent(
    new CustomEvent<NavigationDetail>('ajax:navigation', { detail })
  );
}

// ==================== 工具类 ====================
export class Utils {
  static getUrlParam(name: string): string | null {
    return new URLSearchParams(window.location.search).get(name);
  }

  static getGreetingMessage(): string {
    const h = new Date().getHours();
    if (h < 5) return '深夜灵感迸发，也要记得休息～';
    if (h < 8) return '晨光熹微，今天也要闪闪发光！';
    if (h < 11) return '早上好！元气满满的一天开始啦';
    if (h < 14) return '中午好，记得补充能量~';
    if (h < 18) return '午后时光，适合创造';
    if (h < 21) return '傍晚好，享受此刻宁静';
    return '夜深人静，愿你今夜好梦';
  }

  static isDataExpired(raw: string | null, minutes = 5): boolean {
    if (!raw) return true;
    try {
      const parsed = JSON.parse(raw) as { _timestamp?: number };
      const ts = parsed._timestamp ?? null;
      return ts === null || ts < Date.now() - minutes * 60 * 1000;
    } catch {
      console.error('[ERROR] 解析缓存数据失败');
      return true;
    }
  }

  static validateData(data: unknown, type: 'works' | 'articles'): boolean {
    if (!data) return false;
    if (type === 'works') {
      return (data as WorksData)?.works?.length > 0;
    } else {
      return (data as ArticlesData)?.articles?.length > 0;
    }
  }

  /**
   * 统一提取标签：兼容 tags / tag 两种字段，tag 支持 string | string[]。
   * 全站唯一实现，其他模块一律引用此方法。
   */
  static getTags(item: {
    tags?: string[];
    tag?: string[] | string;
  } | null | undefined): string[] {
    if (!item) return [];
    if (item.tags?.length) return item.tags;
    const tag = item.tag;
    if (!tag) return [];
    if (Array.isArray(tag)) return tag.length ? tag : [];
    return [tag];
  }

  static escapeHtml(str: unknown): string {
    if (str === null || str === undefined || str === '') return '';
    return String(str).replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  static debounce<T extends (...args: unknown[]) => void>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function executedFunction(...args: Parameters<T>) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        func(...args);
      }, wait);
    };
  }

  static throttle<T extends (...args: unknown[]) => void>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return function (this: unknown, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  static formatRelativeTime(isoString: string): string {
    const target = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - target.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays === 1) return '昨天';
    if (diffDays === 2) return '前天';
    if (diffDays <= 7) return `${diffDays}天前`;
    return target.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  }

  /**
   * 统一日期解析：支持 ArticleItem / 字符串 / undefined / null。
   * 兼容 "2026年05月24日" 与标准格式，失败返回 null。
   */
  static parseArticleDate(
    input: ArticleItem | string | undefined | null
  ): Date | null {
    if (!input) return null;
    const value =
      typeof input === 'string'
        ? input
        : input.date || input.last_updated || input.updated_date;
    if (!value) return null;

    const chineseMatch = String(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (chineseMatch) {
      const [, year, month, day] = chineseMatch.map(Number);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return date;
    }
    const date = new Date(value as string | number);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * 日期解析为时间戳（毫秒），失败返回 0。
   * 排序场景专用，避免调用方重复判空。
   */
  static parseArticleTimestamp(
    input: ArticleItem | string | undefined | null
  ): number {
    const d = Utils.parseArticleDate(input);
    return d ? d.getTime() : 0;
  }

  /**
   * 统一同源判定（基于 origin，包含协议与端口）。
   * 替代 page-utils / router / ui-effects 中的多套实现。
   */
  static isSameOrigin(href: string | URL, base?: string): boolean {
    try {
      const url =
        href instanceof URL
          ? href
          : new URL(href, base ?? window.location.href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  /**
   * 统一标签 HTML 渲染。
   * @param tags 标签数组
   * @param className 单个标签的类名（默认 'tag'）
   * @param wrapperClass 外层包裹类名（默认 'tags'）
   * @returns HTML 字符串；无标签时返回空串
   */
  static renderTags(
    tags: string[] | undefined | null,
    className = 'tag',
    wrapperClass = 'tags'
  ): string {
    if (!tags || !tags.length) return '';
    const inner = tags
      .map((t) => `<span class="${className}">${Utils.escapeHtml(t)}</span>`)
      .join('');
    return `<div class="${wrapperClass}">${inner}</div>`;
  }

  static formatMonthLabel(monthIndex: number): string {
    return `${monthIndex}月`;
  }

  /**
   * 根据 pathname 提取页面名（不含扩展名）。
   * 原 page-utils.ts 的实现，统一收敛至此。
   */
  static getPageNameFromPath(pathname: string): string {
    const trimmed = pathname.replace(/^\/|\/$/g, '');
    if (!trimmed) return 'index';
    const parts = trimmed.split('/');
    const last = parts[parts.length - 1];
    const name = last.replace(/\.[^.]+$/, '');
    return name || 'index';
  }

  /**
   * 按时段返回主题（6:00–18:00 为 light，否则 dark）。
   * 原 page-utils.ts 的实现，统一收敛至此。
   */
  static getTimeBasedTheme(): 'light' | 'dark' {
    const hour = new Date().getHours();
    return hour >= 6 && hour < 18 ? 'light' : 'dark';
  }
}

// ==================== 顶层命名导出（便捷引用） ====================
// 便于 `import { escapeHtml, getTags } from 'core'`。
// Utils 上的静态方法保留作为兼容与显式命名空间入口。
export const escapeHtml = Utils.escapeHtml.bind(Utils);
export const getTags = Utils.getTags.bind(Utils);
export const parseArticleDate = Utils.parseArticleDate.bind(Utils);
export const parseArticleTimestamp = Utils.parseArticleTimestamp.bind(Utils);
export const renderTags = Utils.renderTags.bind(Utils);
export const isSameOrigin = Utils.isSameOrigin.bind(Utils);

// ==================== 存储控制器（支持数据压缩） ====================

export class StorageController {
  private compressKeys: Set<string> = new Set([
    CONFIG.STORAGE_KEYS.WORKS_DATA,
    CONFIG.STORAGE_KEYS.ARTICLES_DATA,
  ]);

  /**
   * @deprecated 保留仅为兼容旧调用点；始终返回 true。
   * 将来要是需要恢复 GDPR 合规，在此基础上重新引入流程
   */
  isAllowed(): boolean {
    return true;
  }

  clearAllData(): void {
    Object.values(CONFIG.STORAGE_KEYS).forEach((key) => {
      try {
        this.removeItem(key);
      } catch (e) {
        console.warn(`[WARN] 删除存储项 "${key}" 失败:`, e);
      }
    });
  }

  private shouldCompress(key: string): boolean {
    return this.compressKeys.has(key);
  }

  private compressData(raw: string): string {
    if (typeof window.LZString?.compressToUTF16 === 'function') {
      try {
        return window.LZString.compressToUTF16(raw);
      } catch (e) {
        console.warn('[StorageController] 压缩失败，使用原始数据', e);
      }
    }
    return raw;
  }

  private decompressData(compressed: string): string {
    if (typeof window.LZString?.decompressFromUTF16 === 'function') {
      try {
        const decompressed = window.LZString.decompressFromUTF16(compressed);
        if (decompressed != null) return decompressed;
      } catch (e) {
        console.warn('[StorageController] 解压失败，尝试直接解析', e);
      }
    }
    return compressed;
  }

  getItem(key: string): string | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      if (this.shouldCompress(key)) {
        return this.decompressData(raw);
      }
      return raw;
    } catch (e) {
      console.warn(`[WARN] 读取存储项 "${key}" 失败:`, e);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      const storeValue = this.shouldCompress(key) ? this.compressData(value) : value;
      localStorage.setItem(key, storeValue);
    } catch (e) {
      console.warn(`[WARN] 设置存储项 "${key}" 失败:`, e);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[WARN] 删除存储项 "${key}" 失败:`, e);
    }
  }
}

// ==================== 全局实例 ====================
export const storageController = new StorageController();

// ==================== 性能监控器 ====================
export class PerformanceMonitor {
  private timers = new Map<string, number>();
  private metrics: Array<{ label: string; duration: number; timestamp: number }> = [];

  start(label: string): void {
    if (this.timers.has(label)) {
      console.warn(`[WARN] 计时器"${label}"已在运行`);
      return;
    }
    this.timers.set(label, performance.now());
  }

  end(label: string): number | undefined {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      console.warn(`[WARN] 计时器"${label}"不存在`);
      return;
    }
    const duration = performance.now() - startTime;
    if (duration > 100) {
      console.log(`[INFO] ${label}: ${duration.toFixed(2)}ms (较慢)`);
    }
    this.metrics.push({ label, duration, timestamp: Date.now() });
    this.timers.delete(label);
    return duration;
  }

  getMetrics(): typeof this.metrics {
    return this.metrics.slice(-50);
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

export const perf = new PerformanceMonitor();