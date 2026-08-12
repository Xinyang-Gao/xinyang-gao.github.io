// /js/pages/stats-manager.ts
// 现代化的统计仪表板管理器
// 采用数据驱动、组件化设计，支持主题切换与动态加载

import { CONFIG } from '/js/core/core.js';
import { DataService } from '/js/core/data-service.js';

// ==================== 类型定义 ====================
interface StatisticsData {
  total_articles?: number;
  total_works?: number;
  total_word_count?: number;
  total_article_tags?: number;
  total_work_tags?: number;
  total_update_days?: number;
  version?: string;
  last_updated?: string;
  last_updated_full?: string;
  article_categories?: Array<{ name: string; count: number }>;
  article_tags?: Array<{ name: string; count: number }>;
  work_tags?: Array<{ name: string; count: number }>;
  [key: string]: unknown;
}

interface ArticleItem {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  date?: string;
  last_updated?: string;
  word_count?: number;
  read_time?: string | number;
  hidden?: boolean;
  author?: string;
  [key: string]: unknown;
}

interface WorkItem {
  title?: string;
  description?: string;
  tags?: string[];
  date?: string;
  [key: string]: unknown;
}

interface CodeExtensionStats {
  extension: string;
  count: number;
  total_lines?: number;
  non_empty_lines?: number;
  [key: string]: unknown;
}

interface CodeAnalysisData {
  total_files?: number;
  total_lines?: number;
  non_empty_lines?: number;
  total_size_bytes?: number;
  by_extension?: CodeExtensionStats[];
  [key: string]: unknown;
}

declare const Chart: any;
declare const window: any;

// ==================== 主类 ====================
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
  private themeHandler: ((this: Window, ev: Event) => any) | null = null;
  private uptimeInterval: number | null = null;
  private container: HTMLElement | null = null;

  // ---------- 初始化入口 ----------
  async init(container?: HTMLElement | string): Promise<void> {
    this.container = typeof container === 'string'
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

    // 监听主题变化
    this.setupThemeListener();

    this.initialized = true;
  }

  // ---------- 加载 Chart.js ----------
  private loadChartJS(): Promise<void> {
    if (window.Chart) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Chart.js加载失败'));
      document.head.appendChild(script);
    });
  }

  // ---------- 数据获取 ----------
  private async fetchAllData(): Promise<void> {
    const service = DataService.getInstance();
    try {
      const [statistics, articles, works, codeAnalysis] = await Promise.all([
        service.getStatistics(),
        service.getArticles(),
        service.getWorks(),
        service.getCodeAnalysis(),
      ]);
      this.data.statistics = statistics;
      this.data.articles = articles;
      this.data.works = works;
      this.data.codeAnalysis = codeAnalysis;
    } catch (err) {
      console.warn('[StatsManager] 加载数据失败', err);
    }
    this.articlesList = this.data.articles?.articles?.filter(a => !a.hidden) || [];
    this.worksList = this.data.works?.works || [];
  }

  // ---------- 安全 DOM 辅助 ----------
  private setText(selector: string, value: any): void {
    const el = this.container?.querySelector(selector);
    if (el) el.textContent = value ?? '—';
  }

  private setHtml(selector: string, html: string): void {
    const el = this.container?.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  // ---------- 渲染：英雄区 ----------
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

  // ---------- 渲染：KPI 卡片 ----------
  private renderKpiCards(): void {
    const grid = this.container?.querySelector('.stats-cards-grid');
    if (!grid) return;

    const stats = this.data.statistics || {};
    const code = this.data.codeAnalysis || {};

    const totalArticles = stats.total_articles ?? this.articlesList.length;
    const totalWorks = stats.total_works ?? this.worksList.length;
    const totalWords = stats.total_word_count ?? this.articlesList.reduce((s, a) => s + (a.word_count || 0), 0);
    const articleTags = stats.total_article_tags ?? (stats.article_tags?.length ?? 0);
    const workTags = stats.total_work_tags ?? (stats.work_tags?.length ?? 0);
    const totalFiles = code.total_files ?? '—';
    const totalLines = code.non_empty_lines ?? code.total_lines ?? '—';
    const avgWord = totalArticles ? Math.round(totalWords / totalArticles) : 0;

    // 计算平均标签数
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
      { icon: 'fas fa-folder-open', number: typeof totalFiles === 'number' ? totalFiles.toLocaleString() : totalFiles, label: '源文件', sub: '个' },
      { icon: 'fas fa-code', number: typeof totalLines === 'number' ? totalLines.toLocaleString() : totalLines, label: '代码行数', sub: '非空' },
      { icon: 'fas fa-chart-line', number: avgWord.toLocaleString(), label: '篇均字数', sub: '深度' },
      { icon: 'fas fa-bookmark', number: avgTag, label: '篇均标签', sub: '维度' },
      { icon: 'fas fa-clock', number: totalReadMins > 0 ? `${totalReadMins}min` : '—', label: '阅读总时长', sub: '≈' + (totalReadMins / 60).toFixed(1) + 'h' },
    ];

    grid.innerHTML = kpis.map(k => `
      <div class="stat-card">
        <div class="stat-card-icon"><i class="${k.icon}"></i></div>
        <div class="stat-card-number">${k.number}</div>
        <div class="stat-card-label">${k.label}</div>
        <div class="stat-card-sub">${k.sub}</div>
      </div>
    `).join('');
  }

  // ---------- 渲染：图表网格 ----------
  private renderCharts(): void {
    const grid = this.container?.querySelector('.charts-grid');
    if (!grid) return;

    // 定义图表配置
    const chartDefs: Array<{ id: string; title: string; icon: string; subtitle: string; render: (ctx: CanvasRenderingContext2D) => void }> = [
      {
        id: 'trendChart',
        title: '文章发布趋势',
        icon: '',
        subtitle: '月度波动',
        render: this.renderTrendChart.bind(this),
      },
      {
        id: 'categoryChart',
        title: '文章分类',
        icon: '',
        subtitle: '占比',
        render: this.renderCategoryChart.bind(this),
      },
      {
        id: 'articleTagsChart',
        title: '热门文章标签',
        icon: '',
        subtitle: 'TOP 10',
        render: this.renderArticleTagsChart.bind(this),
      },
      {
        id: 'workTagsChart',
        title: '作品标签云',
        icon: '',
        subtitle: '分类',
        render: this.renderWorkTagsChart.bind(this),
      },
      {
        id: 'codeExtensionChart',
        title: '代码文件分布',
        icon: '',
        subtitle: '按扩展名',
        render: this.renderCodeExtensionChart.bind(this),
      },
      {
        id: 'wordHistogramChart',
        title: '文章字数分布',
        icon: '',
        subtitle: '区间密度',
        render: this.renderWordHistogram.bind(this),
      },
      {
        id: 'codeLineChart',
        title: '代码行数占比',
        icon: '',
        subtitle: '非空行',
        render: this.renderCodeLineShareChart.bind(this),
      },
      {
        id: 'worksYearChart',
        title: '作品年份分布',
        icon: '',
        subtitle: '按年份',
        render: this.renderWorksYearChart.bind(this),
      },
    ];

    // 构建图表容器
    grid.innerHTML = chartDefs.map(def => `
      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-icon">${def.icon}</span>
          <h3>${def.title}</h3>
          <span class="chart-subtitle">${def.subtitle}</span>
        </div>
        <div class="chart-container">
          <canvas id="${def.id}" width="500" height="280"></canvas>
        </div>
      </div>
    `).join('');

    // 渲染图表
    for (const def of chartDefs) {
      const canvas = document.getElementById(def.id) as HTMLCanvasElement;
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (ctx) def.render(ctx);
    }
  }

  // ---------- 各图表渲染函数 ----------
  private renderTrendChart(ctx: CanvasRenderingContext2D): void {
    const monthMap = new Map<string, number>();
    for (const art of this.articlesList) {
      if (!art.date) continue;
      const d = new Date(art.date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }
    const sorted = Array.from(monthMap.keys()).sort();
    const labels = sorted.map(m => m.replace('-', '年') + '月');
    const data = sorted.map(m => monthMap.get(m)!);
    const { textColor, gridColor, accent } = this.getChartColors();

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '发布数',
          data,
          borderColor: accent,
          backgroundColor: 'rgba(180,91,99,0.1)',
          tension: 0.3,
          fill: true,
          pointBackgroundColor: accent,
          pointBorderColor: '#fff',
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: { mode: 'index', intersect: false },
          legend: { labels: { color: textColor } },
        },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
          x: { ticks: { color: textColor, maxRotation: 45 } },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderCategoryChart(ctx: CanvasRenderingContext2D): void {
    let categories = this.data.statistics?.article_categories || [];
    if (!categories.length) {
      const catMap = new Map<string, number>();
      for (const art of this.articlesList) {
        if (art.category) catMap.set(art.category, (catMap.get(art.category) || 0) + 1);
      }
      categories = Array.from(catMap.entries()).map(([name, count]) => ({ name, count }));
    }
    const { textColor } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: categories.map(c => c.name),
        datasets: [{
          data: categories.map(c => c.count),
          backgroundColor: ['#b45b63', '#cd8189', '#e3a5a9', '#9e5e66', '#d99ca2', '#c06f78', '#e9b3b7'],
        }],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                return `${ctx.label}: ${ctx.raw} 篇 (${((ctx.raw / total) * 100).toFixed(1)}%)`;
              },
            },
          },
          legend: { position: 'right', labels: { color: textColor, font: { size: 11 } } },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderArticleTagsChart(ctx: CanvasRenderingContext2D): void {
    let tags = this.data.statistics?.article_tags || [];
    if (!tags.length) {
      const tagMap = new Map<string, number>();
      for (const art of this.articlesList) {
        for (const t of (art.tags || [])) tagMap.set(t, (tagMap.get(t) || 0) + 1);
      }
      tags = Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
    }
    tags.sort((a, b) => b.count - a.count);
    const top10 = tags.slice(0, 10);
    const { textColor, gridColor, accent } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map(t => t.name),
        datasets: [{ label: '引用次数', data: top10.map(t => t.count), backgroundColor: accent, borderRadius: 6 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor } },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderWorkTagsChart(ctx: CanvasRenderingContext2D): void {
    let workTags = this.data.statistics?.work_tags || [];
    if (!workTags.length) {
      const tagMap = new Map<string, number>();
      for (const w of this.worksList) {
        const tags = w.tag || w.tags || [];
        for (const t of (Array.isArray(tags) ? tags : [])) tagMap.set(t, (tagMap.get(t) || 0) + 1);
      }
      workTags = Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
    }
    const { textColor } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: workTags.map(t => t.name),
        datasets: [{
          data: workTags.map(t => t.count),
          backgroundColor: ['#4ea8ff', '#7dcea0', '#f9b5a4', '#b45b63', '#cd8189', '#e6c3a0', '#9ba5c9'],
        }],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ${ctx.raw} 次` } },
          legend: { position: 'right', labels: { color: textColor } },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderCodeExtensionChart(ctx: CanvasRenderingContext2D): void {
    const exts = this.data.codeAnalysis?.by_extension || [];
    if (!exts.length) {
      this.charts.push(new Chart(ctx, { type: 'pie', data: { labels: ['暂无数据'], datasets: [{ data: [1] }] } }));
      return;
    }
    let top = exts.sort((a, b) => b.count - a.count).slice(0, 6);
    const others = exts.slice(6).reduce((s, e) => s + e.count, 0);
    if (others) top.push({ extension: '其他', count: others });
    const { textColor } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: top.map(e => e.extension === 'no_extension' ? '无后缀' : e.extension),
        datasets: [{
          data: top.map(e => e.count),
          backgroundColor: ['#b45b63', '#4ea8ff', '#7dcea0', '#f4b942', '#c97e5a', '#9b59b6', '#95a5a6'],
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } } },
      },
    });
    this.charts.push(chart);
  }

  private renderWordHistogram(ctx: CanvasRenderingContext2D): void {
    const words = this.articlesList.map(a => a.word_count || 0).filter(w => w > 0);
    const labels = ['<500', '500-999', '1000-1999', '2000-4999', '5000-9999', '≥10000'];
    const counts = new Array(6).fill(0);
    for (const w of words) {
      if (w < 500) counts[0]++;
      else if (w < 1000) counts[1]++;
      else if (w < 2000) counts[2]++;
      else if (w < 5000) counts[3]++;
      else if (w < 10000) counts[4]++;
      else counts[5]++;
    }
    const { textColor, gridColor, accent } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: '文章数量', data: counts, backgroundColor: accent, borderRadius: 8 }],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
          x: { ticks: { color: textColor } },
        },
        plugins: {
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.raw} 篇文章` } },
          legend: { labels: { color: textColor } },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderWorksYearChart(ctx: CanvasRenderingContext2D): void {
    const yearMap = new Map<number, number>();
    for (const w of this.worksList) {
      if (!w.date) continue;
      const year = new Date(w.date).getFullYear();
      if (!isNaN(year)) yearMap.set(year, (yearMap.get(year) || 0) + 1);
    }
    const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
    const counts = years.map(y => yearMap.get(y)!);
    const { textColor, gridColor, accent } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: years,
        datasets: [{ label: '作品数量', data: counts, backgroundColor: accent, borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
          x: { ticks: { color: textColor } },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderCodeLineShareChart(ctx: CanvasRenderingContext2D): void {
    const exts = this.data.codeAnalysis?.by_extension || [];
    if (!exts.length) {
      this.charts.push(new Chart(ctx, { type: 'doughnut', data: { labels: ['暂无数据'], datasets: [{ data: [1] }] } }));
      return;
    }
    let valid = exts.filter(e => (e.non_empty_lines || e.total_lines || 0) > 0);
    if (valid.length === 0) valid = exts;
    let top = valid.sort((a, b) => (b.non_empty_lines || 0) - (a.non_empty_lines || 0)).slice(0, 6);
    const others = valid.slice(6).reduce((s, e) => s + (e.non_empty_lines || 0), 0);
    if (others > 0) top.push({ extension: '其他', non_empty_lines: others });
    const { textColor } = this.getChartColors();
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: top.map(e => e.extension === 'no_extension' ? '无后缀' : e.extension),
        datasets: [{
          data: top.map(e => e.non_empty_lines || e.total_lines || 0),
          backgroundColor: ['#b45b63', '#4ea8ff', '#7dcea0', '#f4b942', '#c97e5a', '#9b59b6', '#95a5a6'],
        }],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                return `${ctx.label}: ${ctx.raw.toLocaleString()} 行 (${((ctx.raw / total) * 100).toFixed(1)}%)`;
              },
            },
          },
          legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } },
        },
      },
    });
    this.charts.push(chart);
  }

  // ---------- 渲染：洞察卡片 ----------
  private renderInsights(): void {
    const container = this.container?.querySelector('.insights-grid');
    if (!container) return;

    const stats = this.data.statistics || {};
    const code = this.data.codeAnalysis || {};

    // 最长文章
    const sortedByWords = [...this.articlesList].sort((a, b) => (b.word_count || 0) - (a.word_count || 0)).slice(0, 5);
    const topArticlesHtml = sortedByWords.length
      ? sortedByWords.map(art => `<li><span>${art.title || '无题'}</span><span>${(art.word_count || 0).toLocaleString()}字</span></li>`).join('')
      : '<li>暂无数据</li>';

    // 代码深度
    const extensions = code.by_extension || [];
    const topExt = extensions.length ? extensions.sort((a, b) => b.count - a.count)[0].extension : '—';
    const extAvg = extensions
      .map((ext) => ({
        name: ext.extension === 'no_extension' ? '无后缀' : ext.extension,
        avg: ext.total_lines ? Math.round(ext.total_lines / ext.count) : 0,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
    const avgHtml = extAvg.map(e => `<span class="badge">${e.name}</span> ${e.avg}行/文件`).join(' &nbsp; ');

    // 作者数量
    const authors = new Set(this.articlesList.map(a => a.author).filter(Boolean));

    // 最近更新月份
    const dates = this.articlesList
      .map(a => (a.date ? new Date(a.date) : null))
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    const lastActive = dates.length ? `${dates.reduce((max, d) => d > max ? d : max).getFullYear()}-${dates.reduce((max, d) => d > max ? d : max).getMonth() + 1}` : '—';

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

  // ---------- 渲染：页脚 ----------
  private renderFooter(): void {
    const footer = this.container?.querySelector('.stats-footer');
    if (!footer) return;
    const birth = CONFIG.SITE_BIRTH;
    const diff = Date.now() - birth.getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    footer.innerHTML = `
      <span>站点已运行 ${days}天${hours}小时${mins}分</span>
    `;
  }

  // ---------- 运行时间更新 ----------
  private startUptimeUpdater(): void {
    const footer = this.container?.querySelector('.stats-footer');
    if (!footer) return;
    const birth = CONFIG.SITE_BIRTH;
    const update = () => {
      const diff = Date.now() - birth.getTime();
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const span = footer.querySelector('span:first-child');
      if (span) span.textContent = `站点运行 ${days}天${hours}小时${mins}分`;
    };
    update();
    if (this.uptimeInterval) clearInterval(this.uptimeInterval);
    this.uptimeInterval = window.setInterval(update, 60000); // 每分钟更新
  }

  // ---------- 主题颜色 ----------
  private getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#eceef2' : '#2c2c2c',
      gridColor: isDark ? '#3f3f4b' : '#e8e2db',
      accent: '#b45b63',
    };
  }

  // ---------- 主题监听 ----------
  private setupThemeListener(): void {
    const handler = () => {
      if (this.initialized) {
        this.destroyCharts();
        this.renderCharts();
      }
    };
    window.addEventListener('themeChanged', handler);
    this.themeHandler = handler;
  }

  // ---------- 销毁图表 ----------
  private destroyCharts(): void {
    this.charts.forEach(ch => ch?.destroy());
    this.charts = [];
  }

  // ---------- 销毁管理器 ----------
  destroy(): void {
    this.destroyCharts();
    if (this.themeHandler) window.removeEventListener('themeChanged', this.themeHandler);
    if (this.uptimeInterval) clearInterval(this.uptimeInterval);
  }
}