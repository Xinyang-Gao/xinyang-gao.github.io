// /js/core/core.ts
// 配置常量、工具类、存储控制器与 Cookie 同意管理器（TypeScript 严格模式）

// ==================== 全局类型声明 ====================
declare global {
  interface Window {
    LZString?: {
      compressToUTF16(input: string): string;
      decompressFromUTF16(input: string): string;
    };
    clearAllServiceWorkerCache?: () => Promise<void>;
  }
}

// ==================== 数据类型定义 ====================
export interface WorkItem {
  id?: string | number;
  title?: string;
  description?: string;
  tags?: string[];
  tag?: string[];
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
  tag?: string[];
  date?: string;
  last_updated?: string;
  updated_date?: string;
  [key: string]: unknown;
}

export interface ArticlesData {
  articles: ArticleItem[];
}

// ==================== 配置常量（强类型） ====================
export const CONFIG = {
  STORAGE_KEYS: {
    COOKIE_CONSENT: 'cookieConsentAccepted',
    WORKS_DATA: 'worksData',
    ARTICLES_DATA: 'articlesData',
    VISIT_RECORD: 'statisticsVisitRecord',
    THEME: 'theme',
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
  INTERNAL_DOMAINS: [
    window.location.hostname,
    'localhost',
    '127.0.0.1',
    'gxy.cn.mt',
    'www.gxy.cn.mt',
    'xinyang-gao.github.io',
    'www.xinyang-gao.github.io',
  ],
  BACKGROUND_IMAGES: [
    'https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.OloupenaFalls_ZH-CN2980118660_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.LoganCreek_ZH-CN5372283365_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.MendenhallCave_ZH-CN1850649760_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.FanetteIsland_ZH-CN6466809551_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.WaitangiFjordlandNP_ZH-CN9436140228_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.SichuanTea_ZH-CN6703437873_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.EuropeFromISS_ZH-CN0722816540_UHD.jpg&pid=hp&w=1920',
    'https://cn.bing.com/th?id=OHR.SplugenPass_ZH-CN8347591461_UHD.jpg&pid=hp&w=1920',
  ],
  SITE_BIRTH: new Date('2025-02-22T12:23:53Z'),
} as const;

export type StorageKey = typeof CONFIG.STORAGE_KEYS[keyof typeof CONFIG.STORAGE_KEYS];

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

  static getTags(item: { tags?: string[]; tag?: string[] }): string[] {
    return item.tags?.length ? item.tags : item.tag?.length ? item.tag : [];
  }

  static escapeHtml(str: unknown): string {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, (m) => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
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

  static parseArticleDate(item: ArticleItem): Date | null {
    const value = item.date || item.last_updated || item.updated_date;
    if (!value) return null;
    const chineseMatch = String(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (chineseMatch) {
      const [_, year, month, day] = chineseMatch.map(Number);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return date;
    }
    const date = new Date(value as string | number);
    return isNaN(date.getTime()) ? null : date;
  }

  static formatMonthLabel(monthIndex: number): string {
    return `${monthIndex}月`;
  }
}

// ==================== 存储控制器（支持数据压缩） ====================
export class StorageController {
  private enabled: boolean;

  constructor() {
    this.enabled = this.checkInitialStatus();
    this.listenForConsent();
  }

  private checkInitialStatus(): boolean {
    const consentGiven = this.getItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT) === 'true';
    if (!consentGiven) {
      this.clearAllData();
      return false;
    }
    return true;
  }

  private listenForConsent(): void {
    window.addEventListener('cookieConsentAccepted', () => {
      this.enableStorage();
    });

    window.addEventListener('cookieConsentChanged', (event: Event) => {
      const detail = (event as CustomEvent<{ consent: boolean }>).detail;
      if (detail.consent) {
        this.enableStorage();
      } else {
        this.disableStorage();
      }
    });
  }

  enableStorage(): void {
    this.enabled = true;
    this.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, 'true');
    console.log('[StorageController] 存储功能已启用');
  }

  disableStorage(): void {
    this.enabled = false;
    this.clearAllData();
    console.log('[StorageController] 存储功能已禁用');
  }

  isAllowed(): boolean {
    return this.enabled;
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

  private shouldCompress(key: string): key is typeof CONFIG.STORAGE_KEYS.WORKS_DATA | typeof CONFIG.STORAGE_KEYS.ARTICLES_DATA {
    return key === CONFIG.STORAGE_KEYS.WORKS_DATA || key === CONFIG.STORAGE_KEYS.ARTICLES_DATA;
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

  getItem(key: StorageKey): string | null {
    // Cookie 同意状态不受存储启用限制
    if (key === CONFIG.STORAGE_KEYS.COOKIE_CONSENT) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    if (!this.isAllowed()) return null;

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

  setItem(key: StorageKey, value: string): void {
    if (key === CONFIG.STORAGE_KEYS.COOKIE_CONSENT) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.warn('[WARN] 设置cookie同意状态失败:', e);
        return;
      }
    }

    if (!this.isAllowed()) return;

    try {
      const storeValue = this.shouldCompress(key) ? this.compressData(value) : value;
      localStorage.setItem(key, storeValue);
    } catch (e) {
      console.warn(`[WARN] 设置存储项 "${key}" 失败:`, e);
    }
  }

  removeItem(key: StorageKey): void {
    if (key === CONFIG.STORAGE_KEYS.COOKIE_CONSENT) {
      try {
        localStorage.removeItem(key);
        return;
      } catch (e) {
        console.warn('[WARN] 删除cookie同意状态失败:', e);
        return;
      }
    }

    if (!this.isAllowed()) return;
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[WARN] 删除存储项 "${key}" 失败:`, e);
    }
  }
}

// ==================== Cookie 同意管理器 ====================
export class CookieConsentManager {
  private static readonly BANNER_ID = 'cookie-consent-banner';
  private storageController: StorageController;
  private banner: HTMLElement | null = null;

  constructor(storageController: StorageController) {
    this.storageController = storageController;
    this.init();
  }

  private init(): void {
    if (this.hasConsented()) {
      this.storageController.enableStorage();
      console.log('[CookieConsentManager] 用户已同意，启用存储功能');
      return;
    }

    if (this.hasRejected()) {
      console.log('[CookieConsentManager] 用户已拒绝Cookie，禁用存储功能');
      this.storageController.disableStorage();
      return;
    }

    this.createBanner();
    this.attachEvents();

    window.addEventListener('ajax:navigation', () => {
      if (!this.hasConsented() && !this.hasRejected() && this.banner && !this.banner.classList.contains('show')) {
        setTimeout(() => this.showBanner(), 100);
      }
    });
  }

  hasConsented(): boolean {
    return this.storageController.getItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT) === 'true';
  }

  hasRejected(): boolean {
    return this.storageController.getItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT) === 'false';
  }

  setConsented(consented: boolean): void {
    this.storageController.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, consented ? 'true' : 'false');

    if (consented) {
      this.storageController.enableStorage();
      console.log('[CookieConsentManager] Cookie同意已保存，启用存储');
    } else {
      this.storageController.disableStorage();
      console.log('[CookieConsentManager] Cookie拒绝已保存，禁用存储');
    }

    window.dispatchEvent(
      new CustomEvent('cookieConsentChanged', {
        detail: { consent: consented },
      })
    );
  }

  shouldShow(): boolean {
    return !this.hasConsented() && !this.hasRejected();
  }

  private createBanner(): void {
    const existing = document.getElementById(CookieConsentManager.BANNER_ID);
    if (existing) existing.remove();

    this.banner = document.createElement('div');
    this.banner.id = CookieConsentManager.BANNER_ID;
    this.banner.className = 'cookie-consent-banner';
    this.banner.innerHTML = `
      <div class="cookie-consent-banner-container">
        <div class="cookie-consent-text">
          <i class="fas fa-cookie-bite"></i>
          本网站使用 Cookies 来记录您的主题偏好、分析网站流量并存储一些缓存。不会使用其提供个性化服务！
          <a href="/privacy/" target="_blank" class="cookie-privacy-link">您可以查看完整信息</a>
        </div>
        <div class="cookie-consent-buttons">
          <button class="cookie-btn cookie-btn-decline" id="cookie-decline-btn">
            <i class="fas fa-times"></i> 拒绝
          </button>
          <button class="cookie-btn cookie-btn-accept" id="cookie-accept-btn">
            <i class="fas fa-check"></i> 同意
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.banner);

    requestAnimationFrame(() => {
      this.banner?.classList.add('show');
    });
  }

  showBanner(): void {
    if (this.banner && !this.banner.classList.contains('show')) {
      this.banner.classList.add('show');
    }
  }

  hideBanner(): void {
    if (this.banner) {
      this.banner.classList.remove('show');
      setTimeout(() => {
        if (this.banner?.parentNode) {
          this.banner.remove();
          this.banner = null;
        }
      }, 400);
    }
  }

  private attachEvents(): void {
    if (!this.banner) return;

    const acceptBtn = this.banner.querySelector<HTMLButtonElement>('#cookie-accept-btn');
    const declineBtn = this.banner.querySelector<HTMLButtonElement>('#cookie-decline-btn');

    acceptBtn?.addEventListener('click', () => {
      this.setConsented(true);
      this.hideBanner();
      window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
    });

    declineBtn?.addEventListener('click', () => {
      this.setConsented(false);
      this.hideBanner();
    });
  }

  resetConsent(): void {
    this.storageController.removeItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT);
    if (!this.banner) {
      this.createBanner();
      this.attachEvents();
    } else {
      this.showBanner();
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