// /js/data/site-state.js
// 统计管理与服务工作线程注册

import { CONFIG, storageController, Utils } from '/js/core/core.js';

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
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev) {
    console.log('[SW] 开发环境，跳过 Service Worker 注册');
    return;
  }
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

/**
 * 页脚统计信息填充（文章数、总字数、作品数、分类数、版本号、快照时间、代码规模）
 * 建议在页面加载及无刷新导航后调用
 */
export async function initFooterStats() {
  // 获取需要填充的DOM元素
  const elements = {
    articles: document.getElementById('footerTotalArticles'),
    words: document.getElementById('footerTotalWords'),
    works: document.getElementById('footerTotalWorks'),
    categories: document.getElementById('footerTotalCategories'),
    version: document.getElementById('footerVersionNumber'),
    snapshot: document.getElementById('footerSnapshotDate'),
    files: document.getElementById('footerTotalFiles'),
    lines: document.getElementById('footerTotalLines')
  };

  // 如果关键元素不存在，说明当前页脚未使用该网格，直接返回
  if (!elements.articles && !elements.version) return;

  try {
    // 1. 获取 statistics.json
    const statsRes = await fetch(`${CONFIG.API.STATISTICS}?t=${Date.now()}`, { cache: 'no-store' });
    if (statsRes.ok) {
      const stats = await statsRes.json();
      if (elements.articles) elements.articles.innerText = stats.total_articles ?? '—';
      if (elements.words) {
        const words = stats.total_word_count ?? 0;
        elements.words.innerText = typeof words === 'number' ? words.toLocaleString() : words;
      }
      if (elements.works) elements.works.innerText = stats.total_works ?? '—';
      if (elements.categories) elements.categories.innerText = stats.total_article_categories ?? '—';
      if (elements.version) {
        const version = stats.version ? `v${stats.version}` : '—';
        elements.version.innerText = version;
      }
      if (elements.snapshot) {
        const lastUpdated = stats.last_updated || stats.last_updated_full?.split('T')[0] || '未知';
        elements.snapshot.innerText = `最后更新 · ${lastUpdated}`;
      }
    } else {
      throw new Error('statistics.json 加载失败');
    }
  } catch (err) {
    console.warn('[FooterStats] 加载统计信息失败:', err);
    // 降级显示
    if (elements.articles) elements.articles.innerText = '?';
    if (elements.words) elements.words.innerText = '?';
    if (elements.works) elements.works.innerText = '?';
    if (elements.categories) elements.categories.innerText = '?';
    if (elements.version) elements.version.innerText = '?';
    if (elements.snapshot) elements.snapshot.innerText = '快照加载失败';
  }

  // 2. 获取 code_analysis.json （文件数、代码行数）
  try {
    const codeRes = await fetch('/json/code_analysis.json', { cache: 'no-store' });
    if (codeRes.ok) {
      const codeStats = await codeRes.json();
      if (elements.files) {
        const totalFiles = codeStats.total_files ?? '—';
        elements.files.innerText = typeof totalFiles === 'number' ? totalFiles.toLocaleString() : totalFiles;
      }
      if (elements.lines) {
        // 优先展示非空行数，其次总行数
        const totalLines = codeStats.non_empty_lines ?? codeStats.total_lines ?? '—';
        elements.lines.innerText = typeof totalLines === 'number' ? totalLines.toLocaleString() : totalLines;
      }
    } else {
      throw new Error('code_analysis.json 加载失败');
    }
  } catch (err) {
    console.warn('[FooterStats] 加载代码分析数据失败:', err);
    if (elements.files) elements.files.innerText = '?';
    if (elements.lines) elements.lines.innerText = '?';
  }
}

// 自动监听无刷新导航，重新填充页脚统计（如果页脚在导航后重新渲染）
if (typeof window !== 'undefined') {
  window.addEventListener('ajax:navigation', () => {
    // 延迟一小段时间确保新页脚DOM已插入
    setTimeout(() => initFooterStats(), 100);
  });
}