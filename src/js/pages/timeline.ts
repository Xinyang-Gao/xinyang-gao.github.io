// /js/pages/timeline.ts
// 时间线页面：合并文章、作品与版本更新，按时间线展示

import { DataManager, UIRenderer } from '/js/pages/search-render.js';
import { Utils, perf } from '/js/core/core.js';
import { PageBase } from '/js/core/page-manager.js';
import { dataService } from '/js/core/data-service.js';
import type { VersionIndexPayload, VersionShardMeta } from '/js/types/data.js';

declare const marked: { parse(src: string): string };

/** 首屏加载的版本数（更新日志已分片，按需再拉更早的分片） */
const INITIAL_VERSION_COUNT = 30;

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
// 标签提取与日期解析统一收敛到 Utils，禁止本地重复实现。

function formatDateLabel(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  private articles: Article[] = [];
  private works: Work[] = [];

  /** 更新日志索引（只有元信息，无变更正文） */
  private versionIndex: VersionIndexPayload | null = null;
  /** 已加载的版本（按 id 去重） */
  private versionMap = new Map<number, Version>();
  private allVersions: Version[] = [];
  private loadedShards = new Set<number>();
  private loadingShards = false;

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
      const results = await Promise.allSettled([
        DataManager.fetchData('articles', true),
        DataManager.fetchData('works', true),
        this.loadInitialVersions(),
      ]);
      const [articlesResult, worksResult] = results;

      const articles =
        articlesResult.status === 'fulfilled' && articlesResult.value.articles
          ? articlesResult.value.articles.filter((a: any) => !a.hidden)
          : [];
      const works =
        worksResult.status === 'fulfilled' && worksResult.value.works
          ? worksResult.value.works
          : [];

      this.articles = articles;
      this.works = works;
      this.rebuildItems();

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
    this.articles = [];
    this.works = [];
    this.versionIndex = null;
    this.versionMap.clear();
    this.allVersions = [];
    this.loadedShards.clear();
    this.loadingShards = false;
    this.refreshCallback = null;
  }

  /** 供路由注入滚动揭示刷新回调 */
  setRefreshCallback(cb: (() => void) | null): void {
    this.refreshCallback = cb;
  }

  /* ================= 版本分片加载 ================= */

  /** 首屏：先取索引，再只拉取覆盖最近 INITIAL_VERSION_COUNT 个版本所需的分片 */
  private async loadInitialVersions(): Promise<Version[]> {
    try {
      this.versionIndex = await dataService.getVersionIndex();
    } catch (e) {
      console.warn('[Timeline] 版本索引加载失败，将忽略版本条目', e);
      this.versionIndex = null;
      return [];
    }

    const shards = [...(this.versionIndex?.shards || [])].sort((a, b) => a.index - b.index);

    // 兼容尚未分片的旧 version.json（如 Service Worker 里的旧缓存）
    if (!shards.length) {
      const legacy = (this.versionIndex as unknown as { versions?: Version[] } | null)?.versions;
      if (Array.isArray(legacy)) {
        for (const ver of legacy) this.versionMap.set(ver.id, ver);
        this.allVersions = Array.from(this.versionMap.values()).sort((a, b) => a.id - b.id);
      }
      return this.allVersions;
    }

    const targets: number[] = [];
    let count = 0;
    for (let i = shards.length - 1; i >= 0; i--) {
      targets.push(shards[i].index);
      count += shards[i].count || 0;
      if (count >= INITIAL_VERSION_COUNT) break;
    }

    await this.loadShards(targets);
    return this.allVersions;
  }

  /** 按分片序号加载（已加载的自动跳过），返回是否有新数据 */
  private async loadShards(indexes: number[]): Promise<boolean> {
    if (!this.versionIndex || this.loadingShards) return false;

    const metas = indexes
      .filter((i) => !this.loadedShards.has(i))
      .map((i) => this.versionIndex!.shards.find((s) => s.index === i))
      .filter((s): s is VersionShardMeta => !!s);
    if (!metas.length) return false;

    this.loadingShards = true;
    try {
      const results = await Promise.allSettled(
        metas.map((meta) => dataService.getVersionShard(meta.url))
      );

      let changed = false;
      results.forEach((res, i) => {
        if (res.status !== 'fulfilled') {
          console.warn('[Timeline] 版本分片加载失败:', metas[i].url, res.reason);
          return;
        }
        this.loadedShards.add(metas[i].index);
        for (const ver of res.value.versions || []) {
          if (!this.versionMap.has(ver.id)) changed = true;
          this.versionMap.set(ver.id, ver);
        }
      });

      if (changed) {
        this.allVersions = Array.from(this.versionMap.values()).sort((a, b) => a.id - b.id);
      }
      return changed;
    } finally {
      this.loadingShards = false;
    }
  }

  /** 加载紧邻已加载部分的更早一个分片 */
  private async loadOlderShard(): Promise<boolean> {
    const pending = (this.versionIndex?.shards || [])
      .map((s) => s.index)
      .filter((i) => !this.loadedShards.has(i))
      .sort((a, b) => b - a);
    if (!pending.length) return false;
    return this.loadShards([pending[0]]);
  }

  /** 尚未加载的版本数（用于“加载更早”按钮文案） */
  private getUnloadedVersionCount(): number {
    return (this.versionIndex?.shards || [])
      .filter((s) => !this.loadedShards.has(s.index))
      .reduce((sum, s) => sum + (s.count || 0), 0);
  }

  /** 覆盖指定年份所需的分片序号 */
  private getShardIndexesForYear(year: number): number[] {
    return (this.versionIndex?.shards || [])
      .filter((s) => {
        const startYear = Number((s.start_date || '').slice(0, 4));
        const endYear = Number((s.end_date || '').slice(0, 4));
        if (!startYear || !endYear) return false;
        return year >= startYear && year <= endYear;
      })
      .map((s) => s.index);
  }

  /** 选中某个年份时，补齐该年份对应的分片 */
  private async ensureShardsForYear(year: number): Promise<boolean> {
    const indexes = this.getShardIndexesForYear(year);
    if (!indexes.length) return false;
    return this.loadShards(indexes);
  }

  private rebuildItems(): void {
    this.allItems = this.buildTimelineItems(this.articles, this.works, this.allVersions);
  }

  private buildTimelineItems(
    articles: Article[],
    works: Work[],
    versions: Version[]
  ): TimelineItem[] {
    const items: TimelineItem[] = [];

    for (const art of articles) {
      // 统一走 Utils.parseArticleDate（内部已兼容 date / last_updated / updated_date）
      const dateObj = Utils.parseArticleDate(art);
      if (!dateObj) continue;
      items.push({
        id: `article-${art.title || Math.random()}`,
        type: 'article',
        title: art.title || '无标题文章',
        description: art.description || '',
        date: formatDateLabel(dateObj),
        dateObj,
        url: art.url || art.link || '#',
        tags: Utils.getTags(art),
      });
    }

    for (const work of works) {
      const dateObj = Utils.parseArticleDate(work);
      if (!dateObj) continue;
      items.push({
        id: `work-${work.title || Math.random()}`,
        type: 'work',
        title: work.title || '无题作品',
        description: work.description || '',
        date: formatDateLabel(dateObj),
        dateObj,
        url: work.link || work.url || '#',
        tags: Utils.getTags(work),
      });
    }

    let versionOrder = 0;
    for (const ver of versions) {
      const dateObj = Utils.parseArticleDate(ver.date);
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
    // 未加载的分片也要出现在年份列表里，选中时再按需拉取
    for (const shard of this.versionIndex?.shards || []) {
      const startYear = Number((shard.start_date || '').slice(0, 4));
      const endYear = Number((shard.end_date || '').slice(0, 4));
      if (startYear) years.add(startYear);
      if (endYear) years.add(endYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }

  /** 切换年份：必要时先补齐分片，再重渲染 */
  private async applyYearChange(): Promise<void> {
    if (this.currentYear !== 'all') {
      const year = parseInt(this.currentYear, 10);
      if (!isNaN(year) && (await this.ensureShardsForYear(year))) {
        this.rebuildItems();
      }
    }
    this.renderTimeline();
    this.updateCapsulesActive();
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
          void this.applyYearChange();
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
        void this.applyYearChange();
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
            <h4 class="timeline-month-title">${Utils.formatMonthLabel(month)}</h4>
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
    html += this.renderLoadMore();

    this.container.innerHTML = html;

    this.bindVersionCapsules();
    this.bindLoadMore();

    if (this.refreshCallback) this.refreshCallback();
    else if ((window as any).refreshScrollReveal) (window as any).refreshScrollReveal();
  }

  /** 时间线末尾的“加载更早”入口（仅当还有未加载的分片时出现） */
  private renderLoadMore(): string {
    const remaining = this.getUnloadedVersionCount();
    if (!remaining) return '';

    const label = this.loadingShards
      ? '正在加载更早的更新日志...'
      : `加载更早的更新日志（还有 ${remaining} 个版本）`;

    return `
        <div class="timeline-load-more">
            <button type="button" class="timeline-load-more-btn" ${this.loadingShards ? 'disabled' : ''}>
                <i class="fas fa-history" aria-hidden="true"></i>
                <span>${label}</span>
            </button>
        </div>
    `;
  }

  private bindLoadMore(): void {
    const btn = this.container?.querySelector<HTMLButtonElement>('.timeline-load-more-btn');
    if (!btn) return;
    this.stack.addEventListener(btn, 'click', () => {
      void this.handleLoadMore();
    });
  }

  private async handleLoadMore(): Promise<void> {
    if (this.loadingShards) return;
    const changed = await this.loadOlderShard();
    if (!changed) return;
    this.rebuildItems();
    this.renderTimeline();
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