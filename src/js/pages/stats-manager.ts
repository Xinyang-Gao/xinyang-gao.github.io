// /js/pages/stats-manager.ts
// 统计仪表板：负责数据获取、布局渲染、图表生命周期
// 图表定义全部外置到 /js/pages/stats/charts.ts，通过注册表管理

import { CONFIG } from '/js/core/core.js';
import { dataService } from '/js/core/data-service.js';
import { themeController } from '/js/core/theme-controller.js';
import {
  getChartDefinitions,
  type StatisticsData,
  type ArticleItem,
  type WorkItem,
  type CodeAnalysisData,
  type StatsDataBundle,
  type ChartColors,
} from '/js/pages/stats/chart-registry.js';

// 触发 charts.ts 中的注册副作用（8 张图表在此处被加入注册表）
import '/js/pages/stats/charts.js';

// 全局声明：Chart.js 由外部脚本注入
declare const window: any;

export class StatsManager {
  private data: {
    statistics: StatisticsData | null;
    articles: { articles: ArticleItem[] } | null;
    works: { works: WorkItem[] } | null;
    codeAnalysis: CodeAnalysisData | null;
  } = {
    statistics: null,
    articles: null,
    works: null,
    codeAnalysis: null,
  };

  private articlesList: ArticleItem[] = [];
  private worksList: WorkItem[] = [];
  private charts: any[] = [];
  private initialized = false;

  /** 主题订阅的取消函数（替代 window 'themeChanged' 监听） */
  private themeUnsubscribe: (() => void) | null = null;

  private uptimeInterval: number | null = null;
  private container: HTMLElement | null = null;

  // ==================== 初始化入口 ====================

  async init(container?: HTMLElement | string): Promise<void> {
    this.container =
      typeof container === 'string'
        ? document.querySelector(container)
        : container || document.getElementById('stats-root');

    if (!this.container) {
      console.warn('[StatsManager] 容器不存在');
      return;
    }

    // 加载 Chart.js（如果未加载）
    await this.loadChartJS();

    // 获取数据
    await this.fetchAllData();

    // 渲染
    this.renderHero();
    this.renderKpiCards();
    this.renderCharts();
    this.renderInsights();
    this.renderFooter();

    // 启动运行时间更新
    this.startUptimeUpdater();

    // 监听主题变化（统一走 themeController.onChange）
    this.setupThemeListener();

    this.initialized = true;
  }

  // ==================== 加载 Chart.js ====================

  private loadChartJS(): Promise<void> {
    if (window.Chart) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Chart.js 加载失败'));
      document.head.appendChild(script);
    });
  }

  // ==================== 数据获取 ====================

  private async fetchAllData(): Promise<void> {
    try {
      const [statistics, articles, works, codeAnalysis] = await Promise.all([
        dataService.getStatistics(),
        dataService.getArticles(),
        dataService.getWorks(),
        dataService.getCodeAnalysis(),
      ]);
      this.data.statistics = statistics;
      this.data.articles = articles;
      this.data.works = works;
      this.data.codeAnalysis = codeAnalysis;
    } catch (err) {
      console.warn('[StatsManager] 加载数据失败', err);
    }
    this.articlesList = this.data.articles?.articles?.filter((a) => !a.hidden) || [];
    this.worksList = this.data.works?.works || [];
  }

  // ==================== 安全 DOM 辅助 ====================

  private setText(selector: string, value: any): void {
    const el = this.container?.querySelector(selector);
    if (el) el.textContent = value ?? '—';
  }

  private setHtml(selector: string, html: string): void {
    const el = this.container?.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  // ==================== 渲染：英雄区 ====================

  private renderHero(): void {
    const hero = this.container?.querySelector('.stats-hero');
    if (!hero) return;
    const stats = this.data.statistics || {};
    hero.innerHTML = `
      <h1>统计</h1>
      <p class="stats-subhead">
        基于 ${this.articlesList.length} 篇文章 · ${this.worksList.length} 个作品
        ${stats.last_updated ? `· 更新于 ${stats.last_updated}` : ''}
      </p>
    `;
  }

  // ==================== 渲染：KPI 卡片 ====================

  private renderKpiCards(): void {
    const grid = this.container?.querySelector('.stats-cards-grid');
    if (!grid) return;

    const stats = this.data.statistics || {};
    const code = this.data.codeAnalysis || {};

    const totalArticles = stats.total_articles ?? this.articlesList.length;
    const totalWorks = stats.total_works ?? this.worksList.length;
    const totalWords =
      stats.total_word_count ?? this.articlesList.reduce((s, a) => s + (a.word_count || 0), 0);
    const articleTags = stats.total_article_tags ?? stats.article_tags?.length ?? 0;
    const workTags = stats.total_work_tags ?? stats.work_tags?.length ?? 0;
    const totalFiles = code.total_files ?? '—';
    const totalLines = code.non_empty_lines ?? code.total_lines ?? '—';
    const avgWord = totalArticles ? Math.round(totalWords / totalArticles) : 0;

    // 平均标签数
    const totalTagCount = this.articlesList.reduce((s, a) => s + (a.tags?.length || 0), 0);
    const avgTag = totalArticles ? (totalTagCount / totalArticles).toFixed(1) : '—';

    // 阅读总时长
    let totalReadMins = 0;
    for (const art of this.articlesList) {
      if (art.read_time) {
        const mins = parseInt(String(art.read_time));
        if (!isNaN(mins)) totalReadMins += mins;
        else if (art.word_count) totalReadMins += Math.ceil(art.word_count / 300);
      } else if (art.word_count) {
        totalReadMins += Math.ceil(art.word_count / 300);
      }
    }

    const kpis = [
      { icon: 'fas fa-file-lines', number: totalArticles, label: '文章总数', sub: '篇' },
      { icon: 'fas fa-box', number: totalWorks, label: '作品总数', sub: '个' },
      { icon: 'fas fa-pen-to-square', number: totalWords.toLocaleString(), label: '总字数', sub: '字' },
      { icon: 'fas fa-tags', number: articleTags, label: '文章标签', sub: '种' },
      { icon: 'fas fa-palette', number: workTags, label: '作品标签', sub: '类' },
      {
        icon: 'fas fa-folder-open',
        number: typeof totalFiles === 'number' ? totalFiles.toLocaleString() : totalFiles,
        label: '源文件',
        sub: '个',
      },
      {
        icon: 'fas fa-code',
        number: typeof totalLines === 'number' ? totalLines.toLocaleString() : totalLines,
        label: '代码行数',
        sub: '非空',
      },
      { icon: 'fas fa-chart-line', number: avgWord.toLocaleString(), label: '篇均字数', sub: '深度' },
      { icon: 'fas fa-bookmark', number: avgTag, label: '篇均标签', sub: '维度' },
      {
        icon: 'fas fa-clock',
        number: totalReadMins > 0 ? `${totalReadMins}min` : '—',
        label: '阅读总时长',
        sub: '≈' + (totalReadMins / 60).toFixed(1) + 'h',
      },
    ];

    grid.innerHTML = kpis
      .map(
        (k) => `
      <div class="stat-card">
        <div class="stat-card-icon"><i class="${k.icon}"></i></div>
        <div class="stat-card-number">${k.number}</div>
        <div class="stat-card-label">${k.label}</div>
        <div class="stat-card-sub">${k.sub}</div>
      </div>
    `
      )
      .join('');
  }

  // ==================== 渲染：图表（从注册表循环） ====================

  private renderCharts(): void {
    const grid = this.container?.querySelector('.charts-grid');
    if (!grid) return;

    const defs = getChartDefinitions();

    // 构建容器骨架
    grid.innerHTML = defs
      .map(
        (def) => `
      <div class="chart-card" data-chart-id="${def.id}">
        <div class="chart-header">
          <span class="chart-icon">${def.icon || ''}</span>
          <h3>${def.title}</h3>
          <span class="chart-subtitle">${def.subtitle || ''}</span>
        </div>
        <div class="chart-container">
          <canvas id="${def.id}" width="500" height="280"></canvas>
        </div>
      </div>
    `
      )
      .join('');

    // 执行渲染
    const bundle = this.buildBundle();
    const colors = this.getChartColors();
    const ChartCtor = window.Chart;

    for (const def of defs) {
      const canvas = document.getElementById(def.id) as HTMLCanvasElement | null;
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      try {
        def.render({
          ctx,
          data: bundle,
          colors,
          Chart: ChartCtor,
          register: (chart) => this.charts.push(chart),
        });
      } catch (e) {
        console.warn(`[StatsManager] 图表 ${def.id} 渲染失败:`, e);
        const card = grid.querySelector(`[data-chart-id="${def.id}"]`);
        if (card) {
          const container = card.querySelector('.chart-container');
          if (container) container.innerHTML = '<p class="chart-error">图表渲染失败</p>';
        }
      }
    }
  }

  private buildBundle(): StatsDataBundle {
    return {
      statistics: this.data.statistics || {},
      articlesList: this.articlesList,
      worksList: this.worksList,
      codeAnalysis: this.data.codeAnalysis || {},
    };
  }

  // ==================== 渲染：洞察卡片 ====================

  private renderInsights(): void {
    const container = this.container?.querySelector('.insights-grid');
    if (!container) return;

    const stats = this.data.statistics || {};
    const code = this.data.codeAnalysis || {};

    // 最长文章 TOP5
    const sortedByWords = [...this.articlesList]
      .sort((a, b) => (b.word_count || 0) - (a.word_count || 0))
      .slice(0, 5);
    const topArticlesHtml = sortedByWords.length
      ? sortedByWords
          .map(
            (art) =>
              `<li><span>${art.title || '无题'}</span><span>${(art.word_count || 0).toLocaleString()}字</span></li>`
          )
          .join('')
      : '<li>暂无数据</li>';

    // 代码深度
    const extensions = code.by_extension || [];
    const topExt = extensions.length
      ? [...extensions].sort((a, b) => b.count - a.count)[0].extension
      : '—';
    const extAvg = extensions
      .map((ext) => ({
        name: ext.extension === 'no_extension' ? '无后缀' : ext.extension,
        avg: ext.total_lines ? Math.round(ext.total_lines / ext.count) : 0,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
    const avgHtml = extAvg.map((e) => `<span class="badge">${e.name}</span> ${e.avg}行/文件`).join(' &nbsp; ');

    // 作者数量
    const authors = new Set(this.articlesList.map((a) => a.author).filter(Boolean));

    // 最近更新月份
    const dates = this.articlesList
      .map((a) => (a.date ? new Date(a.date) : null))
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    const lastActive = dates.length
      ? (() => {
          const max = dates.reduce((m, d) => (d > m ? d : m));
          return `${max.getFullYear()}-${max.getMonth() + 1}`;
        })()
      : '—';

    container.innerHTML = `
      <div class="insight-card">
        <h4>最长文章 TOP5</h4>
        <ul class="ranking-list">${topArticlesHtml}</ul>
      </div>
      <div class="insight-card">
        <h4>代码深度</h4>
        <div class="insight-item"><span class="insight-label">总文件</span><strong>${code.total_files ?? '—'}</strong></div>
        <div class="insight-item"><span class="insight-label">非空行</span><strong>${(code.non_empty_lines ?? code.total_lines ?? '—').toLocaleString()}</strong></div>
        <div class="insight-item"><span class="insight-label">总大小</span><strong>${code.total_size_bytes ? (code.total_size_bytes / 1024).toFixed(1) : '—'} KB</strong></div>
        <div class="insight-item"><span class="insight-label">最多扩展名</span><strong>${topExt === 'no_extension' ? '无后缀' : topExt}</strong></div>
        <div class="insight-item" style="flex-wrap:wrap;">${avgHtml}</div>
      </div>
      <div class="insight-card">
        <h4>创作活跃度</h4>
        <div class="insight-item"><span class="insight-label">文章作者</span><strong>${authors.size}</strong></div>
        <div class="insight-item"><span class="insight-label">最近更新月份</span><strong>${lastActive}</strong></div>
        <div class="insight-item"><span class="insight-label">总更新天数</span><strong>${stats.total_update_days ?? '—'}</strong></div>
        <div class="insight-item"><span class="insight-label">站点版本</span><strong>${stats.version ?? '—'}</strong></div>
        <div class="insight-item"><span class="insight-label">数据快照</span><strong>${stats.last_updated_full ? new Date(stats.last_updated_full).toLocaleString() : '—'}</strong></div>
      </div>
    `;
  }

  // ==================== 渲染：页脚 ====================

  private renderFooter(): void {
    const footer = this.container?.querySelector('.stats-footer');
    if (!footer) return;
    const birth = CONFIG.SITE_BIRTH;
    const diff = Date.now() - birth.getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    footer.innerHTML = `<span>站点已运行 ${days}天${hours}小时${mins}分</span>`;
  }

  // ==================== 运行时间更新 ====================

  private startUptimeUpdater(): void {
    const footer = this.container?.querySelector('.stats-footer');
    if (!footer) return;
    const birth = CONFIG.SITE_BIRTH;
    const update = (): void => {
      const diff = Date.now() - birth.getTime();
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const span = footer.querySelector('span:first-child');
      if (span) span.textContent = `站点运行 ${days}天${hours}小时${mins}分`;
    };
    update();
    if (this.uptimeInterval) clearInterval(this.uptimeInterval);
    this.uptimeInterval = window.setInterval(update, 60000);
  }

  // ==================== 主题色 ====================

  private getChartColors(): ChartColors {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#eceef2' : '#2c2c2c',
      gridColor: isDark ? '#3f3f4b' : '#e8e2db',
      accent: '#b45b63',
    };
  }

  // ==================== 主题监听（统一走 themeController.onChange） ====================

  private setupThemeListener(): void {
    // 先清理旧的订阅（重复 init 场景）
    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
      this.themeUnsubscribe = null;
    }

    this.themeUnsubscribe = themeController.onChange(() => {
      if (this.initialized) {
        this.destroyCharts();
        this.renderCharts();
      }
    });
  }

  // ==================== 销毁图表 ====================

  private destroyCharts(): void {
    this.charts.forEach((ch) => ch?.destroy());
    this.charts = [];
  }

  // ==================== 销毁管理器 ====================

  destroy(): void {
    this.destroyCharts();

    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
      this.themeUnsubscribe = null;
    }

    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
      this.uptimeInterval = null;
    }

    this.initialized = false;
  }
}