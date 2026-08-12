// /js/pages/timeline.ts
// 时间线页面：合并文章、作品与版本更新，按时间线展示

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
    date: string;               // YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss
    dateObj: Date;             // 用于排序
    url?: string;              // 文章或作品链接
    tags?: string[];
    // 版本特有
    versionNumber?: string;
    changes?: Change[];
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

    private allItems: TimelineItem[] = [];
    private currentYear = 'all';

    // 事件处理器引用
    private boundHandlers: {
        yearChange: ((this: HTMLSelectElement, ev: Event) => any) | null;
        reset: ((this: HTMLElement, ev: Event) => any) | null;
    } = { yearChange: null, reset: null };

    private refreshCallback: (() => void) | null = null;

    async init(): Promise<void> {
        this.container = document.getElementById('timeline-container');
        this.summary = document.getElementById('timeline-summary');
        this.yearFilter = document.getElementById('timeline-year-filter') as HTMLSelectElement | null;
        this.resetButton = document.getElementById('timeline-reset');
        this.yearCapsulesContainer = document.getElementById('year-capsules-container');

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

            // 提取数据
            const articles = (articlesResult.status === 'fulfilled' && articlesResult.value.articles)
                ? articlesResult.value.articles.filter((a: any) => !a.hidden)
                : [];
            const works = (worksResult.status === 'fulfilled' && worksResult.value.works)
                ? worksResult.value.works
                : [];
            const versions = (versionsResult.status === 'fulfilled')
                ? versionsResult.value
                : [];

            // 构建统一时间线条目
            this.allItems = this.buildTimelineItems(articles, works, versions);

            // 初始化年份下拉和胶囊
            this.populateYearSelect();
            this.renderYearCapsules();

            // 绑定事件
            this.attachEvents();

            // 首次渲染
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
            if (!dateObj) continue; // 跳过无日期条目
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

        // 版本
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
            });
        }

        // 按日期降序排序（最新的在前）
        items.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
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

        // 绑定点击事件
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
                this.renderTimeline();
                this.updateCapsulesActive();
            };
            this.resetButton.addEventListener('click', this.boundHandlers.reset);
        }
    }

    private renderTimeline(): void {
        if (!this.container) return;

        // 筛选年份
        let filtered = this.allItems;
        if (this.currentYear !== 'all') {
            const yearNum = parseInt(this.currentYear, 10);
            filtered = filtered.filter(item => item.dateObj.getFullYear() === yearNum);
        }

        // 更新摘要
        const articleCount = filtered.filter(i => i.type === 'article').length;
        const workCount = filtered.filter(i => i.type === 'work').length;
        const versionCount = filtered.filter(i => i.type === 'version').length;
        if (this.summary) {
            this.summary.innerHTML = `
                <i class="fas fa-chart-line"></i>
                当前筛选：<strong>${articleCount}</strong> 篇文章 ·
                <strong>${workCount}</strong> 个作品 ·
                <strong>${versionCount}</strong> 个版本 ·
                共 <strong>${filtered.length}</strong> 条内容
            `;
        }

        // 构建时间线 HTML
        if (!filtered.length) {
            this.container.innerHTML = '<div class="timeline-empty">📭 没有找到该年份的内容，试试其他筛选条件～</div>';
            return;
        }

        // 按年份-月份分组
        const grouped: GroupedItems = new Map();
        for (const item of filtered) {
            const year = item.dateObj.getFullYear();
            const month = item.dateObj.getMonth() + 1;
            if (!grouped.has(year)) grouped.set(year, new Map());
            const monthMap = grouped.get(year)!;
            if (!monthMap.has(month)) monthMap.set(month, []);
            monthMap.get(month)!.push(item);
        }

        // 生成 HTML
        let html = '<div class="timeline">';
        const sortedYears = Array.from(grouped.keys()).sort((a, b) => b - a);
        for (const year of sortedYears) {
            const monthMap = grouped.get(year)!;
            const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);
            // 年份标题
            const yearTotal = Array.from(monthMap.values()).reduce((sum, arr) => sum + arr.length, 0);
            html += `<div class="timeline-year">
                <h3 class="timeline-year-title">${year} <span class="year-count">${yearTotal}</span></h3>`;
            for (const month of sortedMonths) {
                const items = monthMap.get(month)!;
                // 同月份内按日期从新到旧（同一天内按类型优先级：版本 > 文章 > 作品）
                items.sort((a, b) => {
                    if (a.dateObj.getTime() !== b.dateObj.getTime()) {
                        return b.dateObj.getTime() - a.dateObj.getTime();
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
        this.container.innerHTML = html;

        // 绑定版本展开/收起事件
        this.container.querySelectorAll<HTMLElement>('.version-capsule').forEach(el => {
            const contentId = el.getAttribute('data-content-id');
            if (!contentId) return;
            el.addEventListener('click', () => {
                const content = document.getElementById(contentId);
                if (!content) return;
                const isOpen = content.style.display === 'block';
                content.style.display = isOpen ? 'none' : 'block';
                el.classList.toggle('expanded', !isOpen);
                // 更新图标
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

        // 1. 构建徽章
        let badge = '';
        if (item.type === 'article') {
            badge = '<span class="timeline-item-badge article-badge">文章</span>';
        } else if (item.type === 'work') {
            badge = '<span class="timeline-item-badge work-badge">作品</span>';
        } else if (item.type === 'version') {
            const versionNum = item.versionNumber || '未知版本';
            badge = `<span class="timeline-item-badge version-badge">版本 ${versionNum}</span>`;
        }

        // 2. 标题（版本类型不显示标题）
        let titleHtml = '';
        if (item.type === 'version') {
            titleHtml = '';
        } else {
            const url = item.url || '#';
            titleHtml = `<a href="${Utils.escapeHtml(url)}" class="timeline-item-title">${escapedTitle}</a>`;
        }

        // 3. 描述（版本类型不显示描述）
        let descHtml = '';
        if (item.type !== 'version') {
            descHtml = `<p class="timeline-item-description">${escapedDesc}</p>`;
        }

        // 4. 标签（所有类型都保留）
        const tagsHtml = tags.length
            ? `<div class="timeline-item-tags">${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>`
            : '';

        // 5. 版本特有：变更详情（按钮 + 详情内容）
        let versionButtonHtml = '';
        let versionContentHtml = '';
        if (item.type === 'version' && item.changes && item.changes.length) {
            const contentId = `version-detail-${item.id}`;
            // 解析变更描述中的 Markdown
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

            // 按钮（放在 meta 区域）
            versionButtonHtml = `
                <button class="version-capsule" data-content-id="${contentId}">
                    <span class="version-toggle-icon">▶</span> 查看 ${item.changes.length}项变更详情
                </button>
            `;

            // 详情内容（放在 body 区域，初始隐藏）
            versionContentHtml = `
                <div id="${contentId}" class="version-detail-content" style="display:none;">
                    ${changesHtml}
                </div>
            `;
        }

        // 组装 HTML
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
        this.container = null;
        this.summary = null;
        this.yearFilter = null;
        this.resetButton = null;
        this.yearCapsulesContainer = null;
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

// 自动初始化（如果页面存在）
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