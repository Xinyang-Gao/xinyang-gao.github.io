// ==================== /js/site-state.js ====================
// 统计管理与服务工作线程注册

import { CONFIG, storageController, Utils } from '/js/core.js';

export class StatisticsManager {
  static async syncVisitRecord() {
    let stats;
    try {
      const response = await fetch(`${CONFIG.API.STATISTICS}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error(response.statusText);
      stats = await response.json();
    } catch (error) {
      console.warn('[WARN] 加载 statistics.json 失败:', error);
      return { forceDarkTheme: false };
    }

    if (!storageController.isAllowed()) {
      return { forceDarkTheme: false };
    }

    const version = stats.version != null ? String(stats.version).trim() : null;
    const cached = this.getRecord();
    const previousVisit = cached.lastVisit ? Number(cached.lastVisit) : null;
    const previousVersion = cached.version || null;
    const now = Date.now();
    const currentVersion = version || '未知版本';
    const missingLocalVersion = !cached.version;

    this.saveRecord({ version: version || previousVersion || '', lastVisit: now });

    if (!previousVisit || now - previousVisit >= 300 * 1000) {
      this.showWelcomeOverlay({
        previousVisit,
        previousVersion,
        currentVersion,
        missingLocalVersion,
        hasVersion: !!version
      });
    }

    return { forceDarkTheme: false };
  }

  static getRecord() {
    if (!storageController.isAllowed()) {
      return {};
    }
    try {
      return JSON.parse(storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD) || '{}') || {};
    } catch {
      return {};
    }
  }

  static saveRecord(record) {
    if (!storageController.isAllowed()) return;
    storageController.setItem(CONFIG.STORAGE_KEYS.VISIT_RECORD, JSON.stringify(record));
  }

  static formatAwayTime(milliseconds) {
    if (!milliseconds || milliseconds < 0) return '刚刚离开';
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const remain = minutes % 60;
      return `${hours} 小时${remain ? ` ${remain} 分钟` : ''}`;
    }
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days} 天${remainHours ? ` ${remainHours} 小时` : ''}`;
  }

  static showWelcomeOverlay({ previousVisit, previousVersion, currentVersion, missingLocalVersion }) {
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay active';
    const awayText = previousVisit
      ? `你已经离开 ${this.formatAwayTime(Date.now() - previousVisit)} 了，欢迎回来！`
      : '欢迎来到本站，这是你第一次访问。';
    const versionText = previousVersion && previousVersion !== currentVersion
      ? `在你离开的这段时间里，网站已从版本编号 ${previousVersion} 更新到版本编号 ${currentVersion}`
      : `当前版本编号：${currentVersion}`;
    const warningText = missingLocalVersion ? '<p class="welcome-overlay-warning">已根据当前时间自动选择主题~</p>' : '';
    const titleText = `${Utils.getGreetingMessage()}<br>欢迎回来`;

    overlay.innerHTML = `
      <div class="welcome-overlay-hero">
        <div class="welcome-overlay-eyebrow">WELCOME</div>
        <h1 class="welcome-overlay-title">${titleText}</h1>
        <p class="welcome-overlay-copy">${awayText}</p>
        <p class="welcome-overlay-copy">${versionText}</p>
        ${warningText}
        <p class="welcome-overlay-note">点击任意位置继续浏览</p>
      </div>
    `;

    const removeOverlay = () => {
      if (!overlay.parentNode) return;
      overlay.classList.remove('active');
      document.body.classList.remove('welcome-active');
      setTimeout(() => overlay.remove(), 350);
    };

    overlay.addEventListener('click', removeOverlay);
    document.body.classList.add('welcome-active');
    document.body.appendChild(overlay);
  }
}

export function preloadCriticalJSON() {
  fetch(CONFIG.API.WORKS, { cache: 'force-cache' }).catch(() => {});
  fetch(CONFIG.API.ARTICLES, { cache: 'force-cache' }).catch(() => {});
  fetch(CONFIG.API.STATISTICS, { cache: 'force-cache' }).catch(() => {});
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/js/sw.js').then(registration => {
        console.log('[SW] Service Worker 注册成功，作用域:', registration.scope);
      }).catch(error => {
        console.warn('[SW] Service Worker 注册失败:', error);
      });
    });
  }
}
