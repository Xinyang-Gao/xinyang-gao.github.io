// ==================== /js/core.js ====================
// 配置常量、工具类、存储控制器和Cookie同意管理器

// ==================== 配置常量 ====================
export const CONFIG = {
  // 存储键
  STORAGE_KEYS: {
    COOKIE_CONSENT: 'cookieConsentAccepted',
    WORKS_DATA: 'worksData',
    ARTICLES_DATA: 'articlesData',
    VISIT_RECORD: 'statisticsVisitRecord',
    THEME: 'theme'
  },
  
  API: {
    WORKS: '/json/works.json',
    ARTICLES: '/json/articles.json',
    STATISTICS: '/json/statistics.json'
  },
  
  EXTERNAL_WHITELIST: new Set([
    "github.com", "vercel.com", "netlify.app", "wikipedia.org", 
    "bilibili.com", "bing.com", "baidu.com", "zhihu.com", 
    "csdn.net", "cloud.tencent.com", "aliyun.com", 
    "gaoxinyang.lanzouq.com", "icp.gov.moe"
  ]),
  
  INTERNAL_DOMAINS: [
    window.location.hostname, 'localhost', '127.0.0.1', 
    'xinyang-gao.github.io', 'www.xinyang-gao.github.io'
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
    'https://cn.bing.com/th?id=OHR.SplugenPass_ZH-CN8347591461_UHD.jpg&pid=hp&w=1920'
  ],
  
  SITE_BIRTH: new Date('2025-02-22T12:23:53Z')
};

// ==================== 工具类 ====================
export class Utils {
  static getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  
  static getGreetingMessage() {
    const h = new Date().getHours();
    if (h < 5) return '深夜灵感迸发，也要记得休息～';
    if (h < 8) return '晨光熹微，今天也要闪闪发光！';
    if (h < 11) return '早上好！元气满满的一天开始啦';
    if (h < 14) return '中午好，记得补充能量~';
    if (h < 18) return '午后时光，适合创造';
    if (h < 21) return '傍晚好，享受此刻宁静';
    return '夜深人静，愿你今夜好梦';
  }
  
  static isDataExpired(raw, minutes = 5) {
    if (!raw) return true;
    try {
      const { _timestamp = null } = JSON.parse(raw);
      return !_timestamp || _timestamp < Date.now() - minutes * 60e3;
    } catch {
      console.error('[ERROR] 解析缓存数据失败');
      return true;
    }
  }
  
  static validateData(data, type) {
    if (!data) return false;
    if (type === 'works') {
      return Array.isArray(data.works) && data.works.length > 0;
    } else if (type === 'articles') {
      return Array.isArray(data.articles) && data.articles.length > 0;
    }
    return false;
  }
  
  static getTags(item) {
    if (item.tags && Array.isArray(item.tags)) return item.tags;
    if (item.tag && Array.isArray(item.tag)) return item.tag;
    return [];
  }
  
  static escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function (m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
  
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  static throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
  
  static formatRelativeTime(isoString) { 
    const target = new Date(isoString); 
    const now = new Date(); 
    const diffMs = now - target; 
    const diffMins = Math.floor(diffMs / (1000 * 60)); 
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60)); 
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); 
    if (diffMins < 1) return "刚刚"; 
    if (diffMins < 60) return `${diffMins}分钟前`; 
    if (diffHours < 24) return `${diffHours}小时前`; 
    if (diffDays === 1) return "昨天"; 
    if (diffDays === 2) return "前天"; 
    if (diffDays <= 7) return `${diffDays}天前`; 
    return target.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }); 
  }
}

// ==================== 存储控制器 ====================
export class StorageController {
  constructor() {
    this.enabled = this.checkInitialStatus();
    this.listenForConsent();
  }
  
  checkInitialStatus() {
    const consentGiven = this.getItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT) === 'true';
    if (!consentGiven) {
      this.clearAllData();
      return false;
    }
    return true;
  }
  
  listenForConsent() {
    window.addEventListener('cookieConsentAccepted', () => {
      this.enableStorage();
    });
    
    window.addEventListener('cookieConsentChanged', (event) => {
      const consent = event.detail.consent;
      if (consent) {
        this.enableStorage();
      } else {
        this.disableStorage();
      }
    });
  }
  
  enableStorage() {
    this.enabled = true;
    this.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, 'true');
    console.log('[StorageController] 存储功能已启用');
  }
  
  disableStorage() {
    this.enabled = false;
    this.clearAllData();
    console.log('[StorageController] 存储功能已禁用');
  }
  
  isAllowed() {
    return this.enabled;
  }
  
  clearAllData() {
    const keysToRemove = Object.values(CONFIG.STORAGE_KEYS);
    
    keysToRemove.forEach(key => {
      try {
        this.removeItem(key);
      } catch (e) {
        console.warn(`[WARN] 删除存储项 "${key}" 失败:`, e);
      }
    });
  }
  
  getItem(key) {
    if (!this.isAllowed()) {
      if (key === CONFIG.STORAGE_KEYS.COOKIE_CONSENT) {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      }
      return null;
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[WARN] 读取存储项 "${key}" 失败:`, e);
      return null;
    }
  }
  
  setItem(key, value) {
    if (key === CONFIG.STORAGE_KEYS.COOKIE_CONSENT) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.warn(`[WARN] 设置cookie同意状态失败:`, e);
        return;
      }
    }
    
    if (!this.isAllowed()) return;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[WARN] 设置存储项 "${key}" 失败:`, e);
    }
  }
  
  removeItem(key) {
    if (key === CONFIG.STORAGE_KEYS.COOKIE_CONSENT) {
      try {
        localStorage.removeItem(key);
        return;
      } catch (e) {
        console.warn(`[WARN] 删除cookie同意状态失败:`, e);
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
  static STORAGE_KEY = CONFIG.STORAGE_KEYS.COOKIE_CONSENT;
  static BANNER_ID = 'cookie-consent-banner';
  
  constructor(storageController) {
    this.storageController = storageController;
    this.banner = null;
    this.isInitialized = false;
    this.init();
  }
  
  init() {
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
    
    this.isInitialized = true;
  }
  
  hasConsented() {
    const consent = this.storageController.getItem(CookieConsentManager.STORAGE_KEY);
    return consent === 'true';
  }
  
  hasRejected() {
    const consent = this.storageController.getItem(CookieConsentManager.STORAGE_KEY);
    return consent === 'false';
  }
  
  setConsented(consented) {
    this.storageController.setItem(CookieConsentManager.STORAGE_KEY, consented ? 'true' : 'false');
    
    if (consented) {
      this.storageController.enableStorage();
      console.log('[CookieConsentManager] Cookie同意已保存，启用存储');
    } else {
      this.storageController.disableStorage();
      console.log('[CookieConsentManager] Cookie拒绝已保存，禁用存储');
    }
    
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', {
      detail: { consent: consented }
    }));
  }
  
  shouldShow() {
    if (this.hasConsented() || this.hasRejected()) return false;
    return true;
  }
  
  createBanner() {
    const existingBanner = document.getElementById(CookieConsentManager.BANNER_ID);
    if (existingBanner) {
      existingBanner.remove();
    }
    
    this.banner = document.createElement('div');
    this.banner.id = CookieConsentManager.BANNER_ID;
    this.banner.className = 'cookie-consent-banner';
    
    this.banner.innerHTML = `
      <div class="cookie-consent-banner-container">
        <div class="cookie-consent-text">
          <i class="fas fa-cookie-bite"></i>
          本网站使用 Cookies 来提升您的浏览体验、分析网站流量并提供个性化内容。
          <a href="/privacy.html" target="_blank" class="cookie-privacy-link">了解更多</a>
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
      this.banner.classList.add('show');
    });
  }
  
  showBanner() {
    if (this.banner && !this.banner.classList.contains('show')) {
      this.banner.classList.add('show');
    }
  }
  
  hideBanner() {
    if (this.banner) {
      this.banner.classList.remove('show');
      setTimeout(() => {
        if (this.banner && this.banner.parentNode) {
          this.banner.remove();
          this.banner = null;
        }
      }, 400);
    }
  }
  
  attachEvents() {
    if (!this.banner) return;
    
    const acceptBtn = this.banner.querySelector('#cookie-accept-btn');
    const declineBtn = this.banner.querySelector('#cookie-decline-btn');
    
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        this.setConsented(true);
        this.hideBanner();
        window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
      });
    }
    
    if (declineBtn) {
      declineBtn.addEventListener('click', () => {
        this.setConsented(false);
        this.hideBanner();
      });
    }
  }
  
  resetConsent() {
    this.storageController.removeItem(CookieConsentManager.STORAGE_KEY);
    if (!this.banner) {
      this.createBanner();
      this.attachEvents();
    } else {
      this.showBanner();
    }
  }
}

// 创建全局存储控制器实例（同步导出供其他模块使用）
export const storageController = new StorageController();

// 性能监控器（同步导出）
export class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
    this.metrics = [];
  }
  
  start(label) {
    if (this.timers.has(label)) {
      console.warn(`[WARN] 计时器"${label}"已在运行`);
      return;
    }
    this.timers.set(label, performance.now());
  }
  
  end(label) {
    if (!this.timers.has(label)) {
      console.warn(`[WARN] 计时器"${label}"不存在`);
      return;
    }
    const startTime = this.timers.get(label);
    const duration = performance.now() - startTime;
    if (duration > 100) {
      console.log(`[INFO] ${label}: ${duration.toFixed(2)}ms (较慢)`);
    }
    this.metrics.push({ label, duration, timestamp: Date.now() });
    this.timers.delete(label);
    return duration;
  }
  
  getMetrics() {
    return this.metrics.slice(-50);
  }
  
  clearMetrics() {
    this.metrics = [];
  }
}

export const perf = new PerformanceMonitor();