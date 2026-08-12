// /js/pages/timeline.ts
// 时间线页面：合并文章、作品与版本更新，按时间线展示
// 支持：年份筛选、类型筛选（文章/作品/更新日志）、搜索、版本按ID降序（新版本在前）

import { DataManager, UIRenderer } from '/js/pages/search-render.js';
import { Utils, storageController, perf } from '/js/core/core.js';
import { PageManager } from '/js/core/page-manager.js';

declare const marked: {
    parse(src: string): string;
};

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

interface Article extends BaseItem {
    // 文章特有字段
}

interface Work extends BaseItem {
    // 作品特有字段
}

/** 版本变更项 */
interface Change {
    type: string;
    description: string;
}

/** 版本条目 */
interface Version {
    id: number;
    version: string;
    date: string;
    changes: Change[];
}

/** 统一的时间线条目 */
interface TimelineItem {
    id: string;                 // 唯一标识
    type: 'article' | 'work' | 'version';
    title: string;
    description: string;
    date: string;               // YYYY-MM-DD
    dateObj: Date;             // 用于排序
    url?: string;              // 文章或作品链接
    tags?: string[];
    // 版本特有
    versionNumber?: string;
    changes?: Change[];
    versionId?: number;        // 版本在 version.json 中的 id（用于排序）
    originalOrder?: number;    // 保留原始索引（备用）
}

/** 按年份/月份分组后的结构 */
type GroupedItems = Map<number, Map<number, TimelineItem[]>>;

// ==================== 工具函数 ====================

function getTags(item: BaseItem): string[] {
    if (item.tags?.length) return item.tags;
    if (item.tag?.length) return Array.isArray(item.tag) ? item.tag : [item.tag];
    return [];
}

function parseDateString(dateStr: string): Date | null {
    if (!dateStr) return null;
    // 尝试解析中文日期 "2026年08月12日"
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

// ==================== 核心管理类 ====================

export class TimelineManager extends PageManager {
    private container: HTMLElement | null = null;
    private summary: HTMLElement | null = null;
    private yearFilter: HTMLSelectElement | null = null;
    private resetButton: HTMLElement | null = null;
    private yearCapsulesContainer: HTMLElement | null = null;

    // 类型复选框和搜索
    private typeCheckboxes: NodeListOf<HTMLInputElement> | null = null;
    private searchInput: HTMLInputElement | null = null;

    private allItems: TimelineItem[] = [];
    private currentYear = 'all';
    private selectedTypes: Set<string> = new Set(['article', 'work', 'version']);
    private searchQuery = '';

    // 事件处理器引用
    private boundHandlers: {
        yearChange: ((this: HTMLSelectElement, ev: Event) => any) | null;
        reset: ((this: HTMLElement, ev: Event) => any) | null;
        typeChange: ((this: HTMLInputElement, ev: Event) => any) | null;
        searchInput: ((this: HTMLInputElement, ev: Event) => any) | null;
    } = { yearChange: null, reset: null, typeChange: null, searchInput: null };

    private refreshCallback: (() => void) | null = null;
    private searchDebounceTimer: number | null = null;

    async init(): Promise<void> {
        this.container = document.getElementById('timeline-container');
        this.summary = document.getElementById('timeline-summary');
        this.yearFilter = document.getElementById('timeline-year-filter') as HTMLSelectElement | null;
        this.resetButton = document.getElementById('timeline-reset');
        this.yearCapsulesContainer = document.getElementById('year-capsules-container');

        this.typeCheckboxes = document.querySelectorAll('.type-filter');
        this.searchInput = document.getElementById('timeline-search') as HTMLInputElement | null;

        if (!this.container) return;

        // 显示加载状态
        this.container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载时间线数据...</p></div>';
        if (this.summary) this.summary.textContent = '';

        try {
            // 并行获取三类数据
            const [articlesResult, worksResult, versionsResult] = await Promise.allSettled([
                DataManager.fetchData('articles', true),
                DataManager.fetchData('works', true),
                this.fetchVersions(),
            ]);

            const articles = (articlesResult.status === 'fulfilled' && articlesResult.value.articles)
                ? articlesResult.value.articles.filter((a: any) => !a.hidden)
                : [];
            const works = (worksResult.status === 'fulfilled' && worksResult.value.works)
                ? worksResult.value.works
                : [];
            const versions = (versionsResult.status === 'fulfilled')
                ? versionsResult.value
                : [];

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

    private async fetchVersions(): Promise<Version[]> {
        try {
            const resp = await fetch('/json/version.json');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return data.versions || [];
        } catch (e) {
            console.warn('[Timeline] 版本数据加载失败，将忽略版本条目', e);
            return [];
        }
    }

    private buildTimelineItems(articles: Article[], works: Work[], versions: Version[]): TimelineItem[] {
        const items: TimelineItem[] = [];

        // 文章
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
                dateObj: dateObj,
                url: art.url || art.link || '#',
                tags: getTags(art),
            });
        }

        // 作品
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
                dateObj: dateObj,
                url: work.link || work.url || '#',
                tags: getTags(work),
            });
        }

        // 版本 —— 记录原始顺序和版本ID
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
                dateObj: dateObj,
                versionNumber: ver.version,
                changes: ver.changes || [],
                versionId: ver.id,            // 保存版本ID
                originalOrder: versionOrder++, // 原始索引（备用）
            });
        }

        return items;
    }

    private getAvailableYears(): number[] {
        const years = new Set<number>();
        for (const item of this.allItems) {
            years.add(item.dateObj.getFullYear());
        }
        return Array.from(years).sort((a, b) => b - a);
    }

    private populateYearSelect(): void {
        if (!this.yearFilter) return;
        const years = this.getAvailableYears();
        this.yearFilter.innerHTML = '<option value="all">全部年份</option>' +
            years.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    private renderYearCapsules(): void {
        if (!this.yearCapsulesContainer) return;
        const years = this.getAvailableYears();
        if (!years.length) {
            this.yearCapsulesContainer.innerHTML = '';
            return;
        }
        const html = years.map(year => `
            <button class="year-capsule ${this.currentYear === String(year) ? 'active' : ''}" data-year="${year}">${year}</button>
        `).join('');
        this.yearCapsulesContainer.innerHTML = html;

        this.yearCapsulesContainer.querySelectorAll('.year-capsule').forEach(btn => {
            btn.addEventListener('click', () => {
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
        this.yearCapsulesContainer.querySelectorAll('.year-capsule').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-year') === this.currentYear);
        });
    }

    private attachEvents(): void {
        // 年份下拉
        if (this.yearFilter) {
            this.boundHandlers.yearChange = () => {
                this.currentYear = this.yearFilter!.value;
                this.renderTimeline();
                this.updateCapsulesActive();
            };
            this.yearFilter.addEventListener('change', this.boundHandlers.yearChange);
        }

        // 重置按钮
        if (this.resetButton) {
            this.boundHandlers.reset = () => {
                this.currentYear = 'all';
                if (this.yearFilter) this.yearFilter.value = 'all';
                this.typeCheckboxes?.forEach(cb => cb.checked = true);
                this.selectedTypes = new Set(['article', 'work', 'version']);
                if (this.searchInput) {
                    this.searchInput.value = '';
                    this.searchQuery = '';
                }
                this.renderTimeline();
                this.updateCapsulesActive();
            };
            this.resetButton.addEventListener('click', this.boundHandlers.reset);
        }

        // 类型复选框
        if (this.typeCheckboxes) {
            this.boundHandlers.typeChange = () => {
                this.updateTypeFilter();
            };
            this.typeCheckboxes.forEach(cb => {
                cb.addEventListener('change', this.boundHandlers.typeChange!);
            });
        }

        // 搜索输入（防抖）
        if (this.searchInput) {
            this.boundHandlers.searchInput = () => {
                if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = window.setTimeout(() => {
                    this.searchQuery = this.searchInput!.value;
                    this.renderTimeline();
                }, 300);
            };
            this.searchInput.addEventListener('input', this.boundHandlers.searchInput);
        }
    }

    private updateTypeFilter(): void {
        this.selectedTypes.clear();
        this.typeCheckboxes?.forEach(cb => {
            if (cb.checked) this.selectedTypes.add(cb.value);
        });
        this.renderTimeline();
    }

    private renderTimeline(): void {
        if (!this.container) return;

        // 1. 过滤数据
        let filtered = this.allItems.filter(item => {
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
                return title.includes(q) || desc.includes(q) || tags.includes(q) || versionNum.includes(q);
            }
            return true;
        });

        // 2. 排序逻辑
        const isVersionOnly = this.selectedTypes.size === 1 && this.selectedTypes.has('version');
        if (isVersionOnly) {
            // 版本专用模式：按版本ID降序（大号在前，即最新版本在前）
            filtered.sort((a, b) => (b.versionId || 0) - (a.versionId || 0));
        } else {
            // 混合模式：按日期降序（最新在前）
            filtered.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
        }

        // 3. 更新摘要
        const articleCount = filtered.filter(i => i.type === 'article').length;
        const workCount = filtered.filter(i => i.type === 'work').length;
        const versionCount = filtered.filter(i => i.type === 'version').length;
        if (this.summary) {
            this.summary.innerHTML = `
                <i class="fas fa-chart-line"></i>
                当前筛选：<strong>${articleCount}</strong> 篇文章 ·
                <strong>${workCount}</strong> 个作品 ·
                <strong>${versionCount}</strong> 个更新日志 ·
                共 <strong>${filtered.length}</strong> 条内容
            `;
        }

        // 4. 渲染内容
        if (!filtered.length) {
            this.container.innerHTML = '<div class="timeline-empty">啊？似乎没有符合条件的条目呀，换个条件试试？</div>';
            return;
        }

        let html = '';
        if (isVersionOnly) {
            // 版本专用模式：直接顺序列表，不分组
            html = '<div class="timeline timeline-version-only">';
            for (const item of filtered) {
                html += this.renderTimelineItem(item);
            }
            html += '</div>';
        } else {
            // 普通模式：按年份-月份分组
            const grouped: GroupedItems = new Map();
            for (const item of filtered) {
                const year = item.dateObj.getFullYear();
                const month = item.dateObj.getMonth() + 1;
                if (!grouped.has(year)) grouped.set(year, new Map());
                const monthMap = grouped.get(year)!;
                if (!monthMap.has(month)) monthMap.set(month, []);
                monthMap.get(month)!.push(item);
            }

            html = '<div class="timeline">';
            const sortedYears = Array.from(grouped.keys()).sort((a, b) => b - a);
            for (const year of sortedYears) {
                const monthMap = grouped.get(year)!;
                const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);
                const yearTotal = Array.from(monthMap.values()).reduce((sum, arr) => sum + arr.length, 0);
                html += `<div class="timeline-year">
                    <h3 class="timeline-year-title">${year} <span class="year-count">${yearTotal}</span></h3>`;
                for (const month of sortedMonths) {
                    const items = monthMap.get(month)!;
                    // 月份内排序：按日期降序，同日期内版本优先且版本按版本ID降序
                    items.sort((a, b) => {
                        if (a.dateObj.getTime() !== b.dateObj.getTime()) {
                            return b.dateObj.getTime() - a.dateObj.getTime();
                        }
                        // 同日期：版本优先，版本之间按版本ID降序
                        if (a.type === 'version' && b.type === 'version') {
                            return (b.versionId || 0) - (a.versionId || 0);
                        }
                        const order = { version: 0, article: 1, work: 2 };
                        return order[a.type] - order[b.type];
                    });
                    html += `<div class="timeline-month">
                        <h4 class="timeline-month-title">${formatMonthLabel(month)}</h4>
                        <div class="timeline-list">`;
                    for (const item of items) {
                        html += this.renderTimelineItem(item);
                    }
                    html += `</div></div>`;
                }
                html += `</div>`;
            }
            html += '</div>';
        }

        this.container.innerHTML = html;

        // 5. 绑定版本展开/收起事件
        this.container.querySelectorAll<HTMLElement>('.version-capsule').forEach(el => {
            const contentId = el.getAttribute('data-content-id');
            if (!contentId) return;
            el.addEventListener('click', () => {
                const content = document.getElementById(contentId);
                if (!content) return;
                const isOpen = content.style.display === 'block';
                content.style.display = isOpen ? 'none' : 'block';
                el.classList.toggle('expanded', !isOpen);
                const icon = el.querySelector('.version-toggle-icon');
                if (icon) icon.textContent = isOpen ? '▶' : '▼';
            });
        });

        // 触发滚动动画刷新
        if (this.refreshCallback) this.refreshCallback();
        else if (window.refreshScrollReveal) (window as any).refreshScrollReveal();
    }

    private renderTimelineItem(item: TimelineItem): string {
        const dateLabel = formatDateLabel(item.dateObj);
        const escapedTitle = Utils.escapeHtml(item.title);
        const escapedDesc = Utils.escapeHtml(item.description);
        const tags = item.tags || [];

        // 徽章
        let badge = '';
        if (item.type === 'article') {
            badge = '<span class="timeline-item-badge article-badge">文章</span>';
        } else if (item.type === 'work') {
            badge = '<span class="timeline-item-badge work-badge">作品</span>';
        } else if (item.type === 'version') {
            const versionNum = item.versionNumber || '未知版本';
            badge = `<span class="timeline-item-badge version-badge">版本 ${versionNum}</span>`;
        }

        // 标题（版本不显示标题）
        let titleHtml = '';
        if (item.type !== 'version') {
            const url = item.url || '#';
            titleHtml = `<a href="${Utils.escapeHtml(url)}" class="timeline-item-title">${escapedTitle}</a>`;
        }

        // 描述（版本不显示描述）
        let descHtml = '';
        if (item.type !== 'version') {
            descHtml = `<p class="timeline-item-description">${escapedDesc}</p>`;
        }

        // 标签
        const tagsHtml = tags.length
            ? `<div class="timeline-item-tags">${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>`
            : '';

        // 版本变更详情
        let versionButtonHtml = '';
        let versionContentHtml = '';
        if (item.type === 'version' && item.changes && item.changes.length) {
            const contentId = `version-detail-${item.id}`;
            const changesHtml = item.changes.map(chg => {
                const typeColor = this.getTypeColor(chg.type);
                let descHtml2 = '';
                try {
                    descHtml2 = marked.parse(chg.description);
                } catch {
                    descHtml2 = chg.description.replace(/\n/g, '<br>');
                }
                return `<div class="change-item">
                    <span class="change-type" style="background:${typeColor}20; color:${typeColor}; border-color:${typeColor}40;">${chg.type}</span>
                    <div class="change-desc">${descHtml2}</div>
                </div>`;
            }).join('');

            versionButtonHtml = `
                <button class="version-capsule" data-content-id="${contentId}">
                    <span class="version-toggle-icon">▶</span> 展开${item.changes.length}项变更
                </button>
            `;
            versionContentHtml = `
                <div id="${contentId}" class="version-detail-content" style="display:none;">
                    ${changesHtml}
                </div>
            `;
        }

        return `
            <div class="timeline-item" data-type="${item.type}" data-date="${dateLabel}">
                <div class="timeline-item-meta">
                    <span class="timeline-item-date"><i class="far fa-calendar-alt"></i> ${dateLabel}</span>
                    ${badge}
                    ${versionButtonHtml}
                </div>
                <div class="timeline-item-body">
                    ${titleHtml}
                    ${descHtml}
                    ${tagsHtml}
                    ${versionContentHtml}
                </div>
            </div>
        `;
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

    destroy(): void {
        if (this.yearFilter && this.boundHandlers.yearChange) {
            this.yearFilter.removeEventListener('change', this.boundHandlers.yearChange);
        }
        if (this.resetButton && this.boundHandlers.reset) {
            this.resetButton.removeEventListener('click', this.boundHandlers.reset);
        }
        if (this.typeCheckboxes && this.boundHandlers.typeChange) {
            this.typeCheckboxes.forEach(cb => {
                cb.removeEventListener('change', this.boundHandlers.typeChange!);
            });
        }
        if (this.searchInput && this.boundHandlers.searchInput) {
            this.searchInput.removeEventListener('input', this.boundHandlers.searchInput);
        }
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
}

// ==================== 入口函数 ====================

export async function initTimelinePage(scrollRevealRefreshCallback?: () => void): Promise<TimelineManager> {
    const manager = new TimelineManager();
    manager['refreshCallback'] = scrollRevealRefreshCallback || null;
    await manager.init();
    return manager;
}

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.getElementById('timeline-container');
        if (container) {
            void initTimelinePage();
        }
    });
} else {
    const container = document.getElementById('timeline-container');
    if (container) {
        void initTimelinePage();
    }
}