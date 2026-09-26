// /js/data/site-state.ts
// 统计管理与服务工作线程注册（全面接入 DataService）

import { CONFIG, storageController, Utils, IS_DEV } from '/js/core/core.js';
import { dataService } from '/js/core/data-service.js';

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
  by_extension?: Array<{
    extension: string;
    count: number;
    total_lines?: number;
    non_empty_lines?: number;
  }>;
  [key: string]: unknown;
}

// ==================== Service Worker 注册 ====================
export function registerServiceWorker(): void {
  if (IS_DEV) {
    console.log('[SW] 开发环境，跳过 Service Worker 注册');
    return;
  }
  if (!('serviceWorker' in navigator)) return;

  const doRegister = (): void => {
    navigator.serviceWorker
      .register('/js/data/sw.js')
      .then((registration) => {
        console.log('[SW] Service Worker 注册成功，作用域:', registration.scope);
      })
      .catch((error) => {
        console.warn('[SW] Service Worker 注册失败:', error);
      });
  };

  /**
   * 原来无条件监听 window 'load'，但本函数是在 DOMContentLoaded 之后
   * 又经过多轮 await 才被调用的，此时 load 早已触发 → 监听器永不回调，
   * 生产环境 SW 注册不上。这里改为按 readyState 判断：
   * 已完成就直接注册，否则仍挂 load（首屏极早就调用时的兜底）。
   */
  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister, { once: true });
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

  try {
    // 并行获取统计数据和代码分析
    const [stats, codeStats] = await Promise.all([
      dataService.getStatistics(),
      dataService.getCodeAnalysis(),
    ]);

    // 填充统计信息
    if (elements.articles) {
      elements.articles.innerText = stats.total_articles ?? '—';
    }
    if (elements.words) {
      const words = stats.total_word_count ?? 0;
      elements.words.innerText =
        typeof words === 'number' ? words.toLocaleString() : words;
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
      const lastUpdated =
        stats.last_updated || stats.last_updated_full?.split('T')[0] || '未知';
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