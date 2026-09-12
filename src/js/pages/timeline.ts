// /js/pages/timeline.ts
// 时间线页面：合并文章、作品与版本更新，按时间线展示

import { DataManager, UIRenderer } from '/js/pages/search-render.js';
import { Utils, perf } from '/js/core/core.js';
import { PageBase } from '/js/core/page-manager.js';
import { dataService } from '/js/core/data-service.js';

declare const marked: { parse(src: string): string };

// ==================== 类型定义 ====================

interface BaseItem {
  title?: string;
  description?: string;
  url?: string;
  link?: string;
  tag?: string | string[];
  tags?: string[];
  date?: string;
  last_updated?: string;
  hidden?: boolean;
  [key: string]: unknown;
}

interface Article extends BaseItem {}
interface Work extends BaseItem {}

interface Change {
  type: string;
  description: string;
}

interface Version {
  id: number;
  version: string;
  date: string;
  changes: Change[];
}

interface TimelineItem {
  id: string;
  type: 'article' | 'work' | 'version';
  title: string;
  description: string;
  date: string;
  dateObj: Date;
  url?: string;
  tags?: string[];
  versionNumber?: string;
  changes?: Change[];
  versionId?: number;
  originalOrder?: number;
}

// ==================== 工具函数 ====================

function getTags(item: BaseItem): string[] {
  if (item.tags?.length) return item.tags;
  if (item.tag?.length) return Array.isArray(item.tag) ? item.tag : [item.tag];
  return [];
}

function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const chineseMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (chineseMatch) {
    const [, y, m, d] = chineseMatch.map(Number);
    const dt = new Date(y, m - 1, d);
    if (!isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : dt;
}

function formatDateLabel(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMonthLabel(month: number): string {
  return `${month}月`;
}

function parseVersionSegments(version: string): number[] {
  return version
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n));
}

function compareVersionDesc(a: TimelineItem, b: TimelineItem): number {
  const pa = parseVersionSegments(a.versionNumber || '');
  const pb = parseVersionSegments(b.versionNumber || '');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return nb - na;
  }
  return (b.versionId ?? 0) - (a.versionId ?? 0);
}

function formatVersionLabel(version?: string): string {
  const v = (version || '').trim();
  if (!v) return '未知版本';
  return /^v/i.test(v) ? v : `v${v}`;
}

// ==================== 核心管理类 ====================

export class TimelineManager extends PageBase {
  private container: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private yearFilter: HTMLSelectElement | null = null;
  private resetButton: HTMLElement | null = null;
  private yearCapsulesContainer: HTMLElement | null = null;

  private typeCheckboxes: NodeListOf<HTMLInputElement> | null = null;
  private searchInput: HTMLInputElement | null = null;

  private allItems: TimelineItem[] = [];
  private currentYear = 'all';
  private selectedTypes: Set<string> = new Set(['article', 'work', 'version']);
  private searchQuery = '';

  private refreshCallback: (() => void) | null = null;
  private searchDebounceTimer: number | null = null;

  /* ================= 生命周期 ================= */

  protected async mount(): Promise<void> {
    this.container = document.getElementById('timeline-container');
    this.summary = document.getElementById('timeline-summary');
    this.yearFilter = document.getElementById('timeline-year-filter') as HTMLSelectElement | null;
    this.resetButton = document.getElementById('timeline-reset');
    this.yearCapsulesContainer = document.getElementById('year-capsules-container');

    this.typeCheckboxes = document.querySelectorAll('.type-filter');
    this.searchInput = document.getElementById('timeline-search') as HTMLInputElement | null;

    if (!this.container) return;

    this.container.innerHTML =
      '<div class="loading-spinner"><div class="spinner"></div><p>加载时间线数据...</p></div>';
    if (this.summary) this.summary.textContent = '';

    try {
      const [articlesResult, worksResult, versionsResult] = await Promise.allSettled([
        DataManager.fetchData('articles', true),
        DataManager.fetchData('works', true),
        this.fetchVersions(),
      ]);

      const articles =
        articlesResult.status === 'fulfilled' && articlesResult.value.articles
          ? articlesResult.value.articles.filter((a: any) => !a.hidden)
          : [];
      const works =
        worksResult.status === 'fulfilled' && worksResult.value.works
          ? worksResult.value.works
          : [];
      const versions = versionsResult.status === 'fulfilled' ? versionsResult.value : [];

      this.allItems = this.buildTimelineItems(articles, works, versions);

      this.populateYearSelect();
      this.renderYearCapsules();
      this.attachEvents();
      this.renderTimeline();
    } catch (error) {
      console.error('[Timeline] 初始化失败:', error);
      this.container.innerHTML = `<div class="timeline-error">❌ 加载时间线失败，请刷新重试。</div>`;
    }
  }

  protected unmount(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.container = null;
    this.summary = null;
    this.yearFilter = null;
    this.resetButton = null;
    this.yearCapsulesContainer = null;
    this.typeCheckboxes = null;
    this.searchInput = null;
    this.allItems = [];
    this.refreshCallback = null;
  }

  /** 供路由注入滚动揭示刷新回调 */
  setRefreshCallback(cb: (() => void) | null): void {
    this.refreshCallback = cb;
  }

  private async fetchVersions(): Promise<Version[]> {
    try {
      const data = await dataService.getVersion();
      return data.versions || [];
    } catch (e) {
      console.warn('[Timeline] 版本数据加载失败，将忽略版本条目', e);
      return [];
    }
  }

  private buildTimelineItems(
    articles: Article[],
    works: Work[],
    versions: Version[]
  ): TimelineItem[] {
    const items: TimelineItem[] = [];

    for (const art of articles) {
      const dateStr = art.date || art.last_updated || '';
      const dateObj = parseDateString(dateStr);
      if (!dateObj) continue;
      items.push({
        id: `article-${art.title || Math.random()}`,
        type: 'article',
        title: art.title || '无标题文章',
        description: art.description || '',
        date: formatDateLabel(dateObj),
        dateObj,
        url: art.url || art.link || '#',
        tags: getTags(art),
      });
    }

    for (const work of works) {
      const dateStr = work.date || '';
      const dateObj = parseDateString(dateStr);
      if (!dateObj) continue;
      items.push({
        id: `work-${work.title || Math.random()}`,
        type: 'work',
        title: work.title || '无题作品',
        description: work.description || '',
        date: formatDateLabel(dateObj),
        dateObj,
        url: work.link || work.url || '#',
        tags: getTags(work),
      });
    }

    let versionOrder = 0;
    for (const ver of versions) {
      const dateStr = ver.date || '';
      const dateObj = parseDateString(dateStr);
      if (!dateObj) continue;
      items.push({
        id: `version-${ver.id}`,
        type: 'version',
        title: `版本 ${ver.version}`,
        description: `${ver.changes?.length || 0} 项变更`,
        date: formatDateLabel(dateObj),
        dateObj,
        versionNumber: ver.version,
        changes: ver.changes || [],
        versionId: ver.id,
        originalOrder: versionOrder++,
      });
    }

    return items;
  }

  private getAvailableYears(): number[] {
    const years = new Set<number>();
    for (const item of this.allItems) years.add(item.dateObj.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }

  private populateYearSelect(): void {
    if (!this.yearFilter) return;
    const years = this.getAvailableYears();
    this.yearFilter.innerHTML =
      '<option value="all">全部年份</option>' +
      years.map((y) => `<option value="${y}">${y}</option>`).join('');
  }

  private renderYearCapsules(): void {
    if (!this.yearCapsulesContainer) return;
    const years = this.getAvailableYears();
    if (!years.length) {
      this.yearCapsulesContainer.innerHTML = '';
      return;
    }
    const html = years
      .map(
        (year) =>
          `<button class="year-capsule ${
            this.currentYear === String(year) ? 'active' : ''
          }" data-year="${year}">${year}</button>`
      )
      .join('');
    this.yearCapsulesContainer.innerHTML = html;

    this.yearCapsulesContainer.querySelectorAll('.year-capsule').forEach((btn) => {
      this.stack.addEventListener(btn, 'click', () => {
        const year = btn.getAttribute('data-year');
        if (year) {
          this.currentYear = year;
          if (this.yearFilter) this.yearFilter.value = year;
          this.renderTimeline();
          this.updateCapsulesActive();
        }
      });
    });
  }

  private updateCapsulesActive(): void {
    if (!this.yearCapsulesContainer) return;
    this.yearCapsulesContainer.querySelectorAll('.year-capsule').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-year') === this.currentYear);
    });
  }

  private attachEvents(): void {
    if (this.yearFilter) {
      this.stack.addEventListener(this.yearFilter, 'change', () => {
        this.currentYear = this.yearFilter!.value;
        this.renderTimeline();
        this.updateCapsulesActive();
      });
    }

    if (this.resetButton) {
      this.stack.addEventListener(this.resetButton, 'click', () => {
        this.currentYear = 'all';
        if (this.yearFilter) this.yearFilter.value = 'all';
        this.typeCheckboxes?.forEach((cb) => (cb.checked = true));
        this.selectedTypes = new Set(['article', 'work', 'version']);
        if (this.searchInput) {
          this.searchInput.value = '';
          this.searchQuery = '';
        }
        this.renderTimeline();
        this.updateCapsulesActive();
      });
    }

    if (this.typeCheckboxes) {
      this.typeCheckboxes.forEach((cb) => {
        this.stack.addEventListener(cb, 'change', () => this.updateTypeFilter());
      });
    }

    if (this.searchInput) {
      this.stack.addEventListener(this.searchInput, 'input', () => {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = window.setTimeout(() => {
          this.searchQuery = this.searchInput!.value;
          this.renderTimeline();
        }, 300);
      });
    }
  }

  private updateTypeFilter(): void {
    this.selectedTypes.clear();
    this.typeCheckboxes?.forEach((cb) => {
      if (cb.checked) this.selectedTypes.add(cb.value);
    });
    this.renderTimeline();
  }

  /* ================= 渲染主流程 ================= */

  private renderTimeline(): void {
    if (!this.container) return;

    const filtered = this.allItems.filter((item) => {
      if (!this.selectedTypes.has(item.type)) return false;
      if (this.currentYear !== 'all') {
        const yearNum = parseInt(this.currentYear, 10);
        if (item.dateObj.getFullYear() !== yearNum) return false;
      }
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        const title = (item.title || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const tags = (item.tags || []).join(' ').toLowerCase();
        const versionNum = (item.versionNumber || '').toLowerCase();
        return (
          title.includes(q) || desc.includes(q) || tags.includes(q) || versionNum.includes(q)
        );
      }
      return true;
    });

    filtered.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    const articleCount = filtered.filter((i) => i.type === 'article').length;
    const workCount = filtered.filter((i) => i.type === 'work').length;
    const versionCount = filtered.filter((i) => i.type === 'version').length;
    const dayCount = new Set(filtered.map((i) => i.date)).size;
    if (this.summary) {
      this.summary.innerHTML = `
        <i class="fas fa-chart-line"></i>
        当前筛选：<strong>${articleCount}</strong> 篇文章 ·
        <strong>${workCount}</strong> 个作品 ·
        <strong>${versionCount}</strong> 个更新日志 ·
        共 <strong>${filtered.length}</strong> 条内容 ·
        <strong>${dayCount}</strong> 天
      `;
    }

    if (!filtered.length) {
      this.container.innerHTML =
        '<div class="timeline-empty">啊？似乎没有符合条件的条目呀，换个条件试试？</div>';
      return;
    }

    const yearMap = new Map<number, Map<number, Map<string, TimelineItem[]>>>();
    for (const item of filtered) {
      const year = item.dateObj.getFullYear();
      const month = item.dateObj.getMonth() + 1;
      const dayKey = formatDateLabel(item.dateObj);

      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const monthMap = yearMap.get(year)!;
      if (!monthMap.has(month)) monthMap.set(month, new Map());
      const dayMap = monthMap.get(month)!;
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(item);
    }

    let html = '<div class="timeline">';
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

    for (const year of sortedYears) {
      const monthMap = yearMap.get(year)!;
      const yearTotal = Array.from(monthMap.values()).reduce(
        (sum, dayMap) =>
          sum + Array.from(dayMap.values()).reduce((s, arr) => s + arr.length, 0),
        0
      );

      html += `<div class="timeline-year">
          <h3 class="timeline-year-title">${year} <span class="year-count">${yearTotal}</span></h3>`;

      const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);
      for (const month of sortedMonths) {
        const dayMap = monthMap.get(month)!;
        html += `<div class="timeline-month">
            <h4 class="timeline-month-title">${formatMonthLabel(month)}</h4>
            <div class="timeline-list">`;

        const sortedDays = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));
        for (const day of sortedDays) {
          html += this.renderDayCard(dayMap.get(day)!);
        }

        html += `</div></div>`;
      }

      html += `</div>`;
    }
    html += '</div>';

    this.container.innerHTML = html;

    this.bindVersionCapsules();

    if (this.refreshCallback) this.refreshCallback();
    else if ((window as any).refreshScrollReveal) (window as any).refreshScrollReveal();
  }

  private renderDayCard(items: TimelineItem[]): string {
    const dateLabel = formatDateLabel(items[0].dateObj);

    const contentItems = items
      .filter((i) => i.type !== 'version')
      .sort((a, b) => {
        const order: Record<string, number> = { article: 0, work: 1 };
        const diff = (order[a.type] ?? 9) - (order[b.type] ?? 9);
        if (diff !== 0) return diff;
        return (a.title || '').localeCompare(b.title || '', 'zh');
      });

    const versionItems = items
      .filter((i) => i.type === 'version')
      .sort(compareVersionDesc);

    const itemsHtml = contentItems.length
      ? `<div class="day-card-items">${contentItems
          .map((i) => this.renderSubCard(i))
          .join('')}</div>`
      : '';

    let versionsHtml = '';
    if (versionItems.length) {
      const capsules = versionItems
        .map((v) => {
          const detailId = this.getDetailId(v);
          return `<button type="button"
                        class="version-capsule"
                        data-detail-id="${detailId}"
                        aria-expanded="false"
                        aria-controls="${detailId}">
                        <span class="version-capsule-dot" aria-hidden="true"></span>
                        <span class="version-capsule-num">${Utils.escapeHtml(formatVersionLabel(v.versionNumber))}</span>
                        <span class="version-capsule-count">${v.changes?.length || 0}</span>
                    </button>`;
        })
        .join('');

      const details = versionItems
        .map((v) => {
          const detailId = this.getDetailId(v);
          return `<div id="${detailId}" class="version-detail-content" hidden>
                      ${this.renderChanges(v)}
                  </div>`;
        })
        .join('');

      versionsHtml = `
          <div class="day-card-versions">
              <div class="version-capsules-row">${capsules}</div>
              <div class="version-details-container">${details}</div>
          </div>
      `;
    }

    return `
        <div class="day-card" data-date="${dateLabel}">
            <div class="day-card-header">
                <span class="day-card-date"><i class="far fa-calendar-alt"></i> ${dateLabel}</span>
                <span class="day-card-count">${items.length} 条</span>
            </div>
            ${itemsHtml}
            ${versionsHtml}
        </div>
    `;
  }

  private getDetailId(item: TimelineItem): string {
    return `version-detail-${item.id}`;
  }

  private renderSubCard(item: TimelineItem): string {
    const isArticle = item.type === 'article';
    const url = item.url || '#';
    const tags = item.tags || [];

    const tagsHtml = tags.length
      ? `<div class="day-subcard-tags">${tags
          .map((t) => `<span class="tag">${Utils.escapeHtml(t)}</span>`)
          .join('')}</div>`
      : '';

    const descHtml = item.description
      ? `<p class="day-subcard-desc">${Utils.escapeHtml(item.description)}</p>`
      : '';

    return `
        <a class="day-subcard" href="${Utils.escapeHtml(url)}" data-type="${item.type}">
            <span class="day-subcard-badge ${isArticle ? 'article-badge' : 'work-badge'}">
                ${isArticle ? '文章' : '作品'}
            </span>
            <div class="day-subcard-main">
                <h5 class="day-subcard-title">${Utils.escapeHtml(item.title)}</h5>
                ${descHtml}
                ${tagsHtml}
            </div>
            <i class="fas fa-chevron-right day-subcard-arrow" aria-hidden="true"></i>
        </a>
    `;
  }

  private renderChanges(item: TimelineItem): string {
    if (!item.changes || !item.changes.length) {
      return `<p class="change-empty">该版本暂无变更记录。</p>`;
    }

    return item.changes
      .map((chg) => {
        const typeColor = this.getTypeColor(chg.type);
        let descHtml = '';
        try {
          descHtml = marked.parse(chg.description);
        } catch {
          descHtml = Utils.escapeHtml(chg.description).replace(/\n/g, '<br>');
        }
        return `<div class="change-item">
            <span class="change-type" style="background:${typeColor}20; color:${typeColor}; border-color:${typeColor}40;">${Utils.escapeHtml(chg.type)}</span>
            <div class="change-desc">${descHtml}</div>
        </div>`;
      })
      .join('');
  }

  private bindVersionCapsules(): void {
    if (!this.container) return;

    this.container.querySelectorAll<HTMLElement>('.day-card').forEach((card) => {
      const capsules = Array.from(
        card.querySelectorAll<HTMLButtonElement>('.version-capsule')
      );
      if (!capsules.length) return;

      const details = Array.from(
        card.querySelectorAll<HTMLElement>('.version-detail-content')
      );

      const closeAll = () => {
        capsules.forEach((btn) => {
          btn.classList.remove('expanded');
          btn.setAttribute('aria-expanded', 'false');
        });
        details.forEach((d) => {
          d.hidden = true;
        });
      };

      capsules.forEach((btn) => {
        this.stack.addEventListener(btn, 'click', () => {
          const detailId = btn.dataset.detailId;
          if (!detailId) return;

          const wasOpen = btn.classList.contains('expanded');
          closeAll();
          if (wasOpen) return;

          btn.classList.add('expanded');
          btn.setAttribute('aria-expanded', 'true');

          const detail = details.find((d) => d.id === detailId);
          if (detail) detail.hidden = false;
        });
      });
    });
  }

  private getTypeColor(type: string): string {
    const map: Record<string, string> = {
      feat: '#4CAF50',
      fix: '#f44336',
      perf: '#FF9800',
      style: '#9C27B0',
      refactor: '#2196F3',
      chore: '#607D8B',
      docs: '#00BCD4',
      revert: '#FF5722',
      ci: '#795548',
    };
    return map[type] || '#6b6b6b';
  }
}

// ==================== 入口函数 ====================

export async function initTimelinePage(
  scrollRevealRefreshCallback?: () => void
): Promise<TimelineManager> {
  const manager = new TimelineManager();
  manager.setRefreshCallback(scrollRevealRefreshCallback || null);
  await manager.init();
  return manager;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('timeline-container');
    if (container) void initTimelinePage();
  });
} else {
  const container = document.getElementById('timeline-container');
  if (container) void initTimelinePage();
}