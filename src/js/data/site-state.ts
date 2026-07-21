// /js/data/site-state.ts
// 统计管理与服务工作线程注册（全面接入 DataService）

import { CONFIG, storageController, Utils } from '/js/core/core.js';
import { DataService } from '/js/core/data-service.js';

// ==================== 类型定义 ====================
interface VisitRecord {
  version?: string;
  lastVisit?: number;
  [key: string]: unknown;
}

interface StatisticsData {
  version?: string | number;
  total_articles?: number;
  total_word_count?: number;
  total_works?: number;
  total_article_categories?: number;
  total_article_tags?: number;
  total_work_tags?: number;
  last_updated?: string;
  last_updated_full?: string;
  article_tags?: Array<{ name: string; count: number }>;
  work_tags?: Array<{ name: string; count: number }>;
  [key: string]: unknown;
}

interface CodeAnalysisData {
  total_files?: number;
  total_lines?: number;
  non_empty_lines?: number;
  total_size_bytes?: number;
  by_extension?: Array<{ extension: string; count: number; total_lines?: number; non_empty_lines?: number }>;
  [key: string]: unknown;
}

// ==================== StatisticsManager ====================
export class StatisticsManager {
  /**
   * 同步访问记录，检查版本更新并决定是否显示欢迎覆盖层
   * @returns { forceDarkTheme: boolean } 当前未使用，保留兼容
   */
  static async syncVisitRecord(): Promise<{ forceDarkTheme: boolean }> {
    let stats: StatisticsData | null = null;
    const service = DataService.getInstance();

    try {
      stats = await service.getStatistics();
    } catch (error) {
      console.warn('[WARN] 加载 statistics.json 失败:', error);
      return { forceDarkTheme: false };
    }

    if (!storageController.isAllowed()) {
      return { forceDarkTheme: false };
    }

    const version = stats?.version != null ? String(stats.version).trim() : null;
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
        hasVersion: !!version,
      });
    }

    return { forceDarkTheme: false };
  }

  static getRecord(): VisitRecord {
    if (!storageController.isAllowed()) {
      return {};
    }
    try {
      const raw = storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static saveRecord(record: VisitRecord): void {
    if (!storageController.isAllowed()) return;
    storageController.setItem(CONFIG.STORAGE_KEYS.VISIT_RECORD, JSON.stringify(record));
  }

  static formatAwayTime(milliseconds: number): string {
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

  // 内部方法：显示欢迎覆盖层（由 loading-overlay-manager 处理，这里保留占位）
  private static showWelcomeOverlay(params: {
    previousVisit: number | null;
    previousVersion: string | null;
    currentVersion: string;
    missingLocalVersion: boolean;
    hasVersion: boolean;
  }): void {
    // 实际逻辑已移至 LoadingOverlayManager，此处保留兼容
    console.log('[StatisticsManager] 版本检测:', params);
    // 触发自定义事件供其他模块监听
    window.dispatchEvent(
      new CustomEvent('versionCheckComplete', { detail: params })
    );
  }
}

// ==================== Service Worker 注册 ====================
export function registerServiceWorker(): void {
  const isDev =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev) {
    console.log('[SW] 开发环境，跳过 Service Worker 注册');
    return;
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/js/data/sw.js')
        .then((registration) => {
          console.log('[SW] Service Worker 注册成功，作用域:', registration.scope);
        })
        .catch((error) => {
          console.warn('[SW] Service Worker 注册失败:', error);
        });
    });
  }
}

// ==================== 页脚统计信息填充 ====================
export async function initFooterStats(): Promise<void> {
  const elements = {
    articles: document.getElementById('footerTotalArticles'),
    words: document.getElementById('footerTotalWords'),
    works: document.getElementById('footerTotalWorks'),
    categories: document.getElementById('footerTotalCategories'),
    version: document.getElementById('footerVersionNumber'),
    snapshot: document.getElementById('footerSnapshotDate'),
    files: document.getElementById('footerTotalFiles'),
    lines: document.getElementById('footerTotalLines'),
  };

  // 如果关键元素不存在，说明当前页脚未使用该网格，直接返回
  if (!elements.articles && !elements.version) return;

  const service = DataService.getInstance();

  try {
    // 并行获取统计数据和代码分析
    const [stats, codeStats] = await Promise.all([
      service.getStatistics(),
      service.getCodeAnalysis(),
    ]);

    // 填充统计信息
    if (elements.articles) {
      elements.articles.innerText = stats.total_articles ?? '—';
    }
    if (elements.words) {
      const words = stats.total_word_count ?? 0;
      elements.words.innerText = typeof words === 'number' ? words.toLocaleString() : words;
    }
    if (elements.works) {
      elements.works.innerText = stats.total_works ?? '—';
    }
    if (elements.categories) {
      elements.categories.innerText = stats.total_article_categories ?? '—';
    }
    if (elements.version) {
      const version = stats.version ? `v${stats.version}` : '—';
      elements.version.innerText = version;
    }
    if (elements.snapshot) {
      const lastUpdated = stats.last_updated || stats.last_updated_full?.split('T')[0] || '未知';
      elements.snapshot.innerText = `最后更新 · ${lastUpdated}`;
    }

    // 填充代码分析数据
    if (elements.files) {
      const totalFiles = codeStats.total_files ?? '—';
      elements.files.innerText =
        typeof totalFiles === 'number' ? totalFiles.toLocaleString() : totalFiles;
    }
    if (elements.lines) {
      // 优先展示非空行数，其次总行数
      const totalLines = codeStats.non_empty_lines ?? codeStats.total_lines ?? '—';
      elements.lines.innerText =
        typeof totalLines === 'number' ? totalLines.toLocaleString() : totalLines;
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
    if (elements.files) elements.files.innerText = '?';
    if (elements.lines) elements.lines.innerText = '?';
  }
}

// ==================== 自动监听无刷新导航 ====================
if (typeof window !== 'undefined') {
  window.addEventListener('ajax:navigation', () => {
    // 延迟一小段时间确保新页脚 DOM 已插入
    setTimeout(() => initFooterStats(), 100);
  });
}