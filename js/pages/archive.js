// /js/pages/archive.js - 优化版归档页面
import { DataManager, UIRenderer } from '/js/pages/search-render.js';
import { Utils } from '/js/core/core.js';
import { PageManager } from '/js/core/page-manager.js';

// ---------- 辅助函数：生成年份导航胶囊 ----------
function renderYearCapsules(years, currentYear, onSelect) {
    if (!years.length) return '';
    return `
        <div class="year-capsules-wrapper">
            ${years.map(year => `
                <button class="year-capsule ${currentYear === String(year) ? 'active' : ''}" data-year="${year}">${year}</button>
            `).join('')}
        </div>
    `;
}

// ---------- 构建时间线HTML（支持无日期条目、类型筛选） ----------
function buildTimelineHTML(items, selectedYear, filterType) {
    if (!items.length) {
        return '<div class="archive-empty">📭 暂无可显示的内容，试试其他筛选条件吧～</div>';
    }

    // 分离有效日期条目与无效日期条目
    const datedItems = [];
    const undatedItems = [];

    items.forEach(item => {
        const date = Utils.parseArticleDate(item);
        if (date && !isNaN(date.getTime())) {
            datedItems.push({ ...item, _dateObj: date });
        } else {
            undatedItems.push(item);
        }
    });

    // 按年份月份分组（只处理有效日期项）
    const grouped = new Map(); // year -> Map(month -> items)
    datedItems.forEach(item => {
        const year = item._dateObj.getFullYear();
        const month = item._dateObj.getMonth() + 1;
        if (selectedYear !== 'all' && String(year) !== selectedYear) return;

        if (!grouped.has(year)) grouped.set(year, new Map());
        const yearGroups = grouped.get(year);
        if (!yearGroups.has(month)) yearGroups.set(month, []);
        yearGroups.get(month).push(item);
    });

    // 按年份倒序排序
    const sortedYears = Array.from(grouped.keys()).sort((a, b) => b - a);

    // 如果选择了具体年份但没有数据
    if (selectedYear !== 'all' && !sortedYears.length && (!undatedItems.length || selectedYear !== 'all')) {
        return `<div class="archive-empty">📅 没有找到 ${selectedYear} 年的内容，试试其他年份吧～</div>`;
    }

    // 统计各年份条目数量（用于标题徽章）
    const yearCountMap = new Map();
    datedItems.forEach(item => {
        const y = item._dateObj.getFullYear();
        yearCountMap.set(y, (yearCountMap.get(y) || 0) + 1);
    });
    if (undatedItems.length && selectedYear === 'all') {
        yearCountMap.set('undated', undatedItems.length);
    }

    // 渲染年份区块
    const yearSegments = sortedYears.map(year => {
        const months = Array.from(grouped.get(year).keys()).sort((a, b) => b - a);
        const monthHtml = months.map(month => {
            const monthItems = grouped.get(year).get(month).sort((a, b) => b._dateObj.getTime() - a._dateObj.getTime());
            const itemsHtml = monthItems.map(item => renderArchiveItem(item, item._dateObj)).join('');
            return `
                <section class="timeline-month">
                    <h4 class="timeline-month-title">${Utils.formatMonthLabel(month)}</h4>
                    <div class="timeline-list">${itemsHtml}</div>
                </section>
            `;
        }).join('');

        const countBadge = yearCountMap.get(year) ? `<span class="year-count">${yearCountMap.get(year)}</span>` : '';
        return `
            <section class="timeline-year">
                <h3 class="timeline-year-title">${year} ${countBadge}</h3>
                ${monthHtml}
            </section>
        `;
    });

    // 处理无日期条目分组（仅在「全部年份」且存在无日期条目时显示）
    let undatedSegment = '';
    if (selectedYear === 'all' && undatedItems.length) {
        const undatedHtml = undatedItems.map(item => renderArchiveItem(item, null)).join('');
        const countBadge = yearCountMap.get('undated') ? `<span class="year-count">${yearCountMap.get('undated')}</span>` : '';
        undatedSegment = `
            <section class="timeline-year undated-year">
                <h3 class="timeline-year-title">日期未标注 ${countBadge}</h3>
                <div class="timeline-list">${undatedHtml}</div>
            </section>
        `;
    }

    return `<div class="timeline">${yearSegments.join('')}${undatedSegment}</div>`;
}

// ---------- 渲染单个归档条目（复用卡片样式） ----------
function renderArchiveItem(item, dateObj) {
    const dateLabel = dateObj
        ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
        : '日期未知';
    const tagsHtml = UIRenderer.generateTagsHTML(item);
    const description = Utils.escapeHtml(item.description || '暂无描述');
    const title = Utils.escapeHtml(item.title || '未命名内容');
    const url = item.url || item.link || '#';
    const typeBadge = item.__archiveType === 'work'
        ? '<span class="timeline-item-badge work-badge">作品</span>'
        : '<span class="timeline-item-badge article-badge">文章</span>';

    let titleHtml;
    if (item.__archiveType === 'work') {
        const workInfo = {
            title: item.title || '',
            description: item.description || '',
            tags: item.tag || item.tags || [],
            link: item.link || item.url || ''
        };
        const workInfoAttr = Utils.escapeHtml(encodeURIComponent(JSON.stringify(workInfo)));
        titleHtml = `<a href="javascript:void(0)" class="timeline-item-title" data-type="work" data-work-info="${workInfoAttr}">${title}</a>`;
    } else {
        titleHtml = `<a href="${Utils.escapeHtml(url)}" class="timeline-item-title">${title}</a>`;
    }

    return `
        <article class="timeline-item" data-date="${Utils.escapeHtml(dateLabel)}">
            <div class="timeline-item-meta">
                <span class="timeline-item-date"><i class="far fa-calendar-alt"></i> ${Utils.escapeHtml(dateLabel)}</span>
                ${typeBadge}
            </div>
            <div class="timeline-item-body">
                ${titleHtml}
                <p class="timeline-item-description">${description}</p>
                ${tagsHtml ? `<div class="timeline-item-tags">${tagsHtml}</div>` : ''}
            </div>
        </article>
    `;
}

// 获取可用的年份列表（基于有效日期）
function getAvailableYears(items) {
    const years = new Set();
    items.forEach(item => {
        const date = Utils.parseArticleDate(item);
        if (date && !isNaN(date.getTime())) years.add(date.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
}

// 更新摘要统计
function updateSummary(articlesCount, worksCount, totalCount) {
    const summaryEl = document.getElementById('archive-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `<i class="fas fa-chart-line"></i> 当前筛选：<strong>${articlesCount}</strong> 篇文章 · <strong>${worksCount}</strong> 个作品 · 共 <strong>${totalCount}</strong> 条内容`;
    }
}

// ==================== 归档页面管理器 ====================
export class ArchiveManager extends PageManager {
    constructor() {
        super();
        this.container = null;
        this.summary = null;
        this.yearFilter = null;
        this.typeFilter = null;
        this.resetButton = null;
        this.yearCapsulesContainer = null;
        this.allItems = [];
        this.currentYear = 'all';
        this.currentType = 'all';
        this.changeHandler = null;
        this.resetHandler = null;
        this.typeChangeHandler = null;
        this.refreshCallback = null;
    }

    async init() {
        this.container = document.getElementById('archive-container');
        this.summary = document.getElementById('archive-summary');
        this.yearFilter = document.getElementById('archive-year-filter');
        this.resetButton = document.getElementById('archive-reset');

        if (!this.container) return;

        // 动态创建类型筛选器（如果不存在）
        this.ensureTypeFilter();
        // 动态创建年份胶囊容器
        this.ensureYearCapsulesContainer();

        this.container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载归档中...</p></div>';
        if (this.summary) this.summary.textContent = '';

        try {
            const [articlesResult, worksResult] = await Promise.allSettled([
                DataManager.fetchData('articles', true),
                DataManager.fetchData('works', true)
            ]);

            if (articlesResult.status === 'rejected' && worksResult.status === 'rejected') {
                throw new Error('文章和作品数据均加载失败');
            }

            const articles = articlesResult.status === 'fulfilled' ? (articlesResult.value.articles || []).filter(item => !item.hidden) : [];
            const works = worksResult.status === 'fulfilled' ? (worksResult.value.works || []) : [];

            this.allItems = [
                ...articles.map(item => ({ ...item, __archiveType: 'article', url: item.url || item.link || '#' })),
                ...works.map(item => ({ ...item, __archiveType: 'work', url: item.link || item.url || '#' }))
            ];

            // 初始化年份下拉选项
            this.populateYearSelect(this.allItems);
            // 生成年份胶囊
            this.renderYearCapsules(this.allItems);
            // 绑定事件
            this.attachEvents();
            // 首次渲染
            this.renderArchive();
        } catch (error) {
            this.container.innerHTML = `<div class="archive-error">❌ 加载归档失败，请刷新重试或联系站长。</div>`;
            console.error('[Archive] 初始化失败:', error);
        }
    }

    ensureTypeFilter() {
        if (document.getElementById('archive-type-filter')) return;
        const toolbarLeft = document.querySelector('.archive-toolbar-left');
        if (!toolbarLeft) return;

        const typeSelect = document.createElement('select');
        typeSelect.id = 'archive-type-filter';
        typeSelect.innerHTML = `
            <option value="all">全部类型</option>
            <option value="article">仅文章</option>
            <option value="work">仅作品</option>
        `;
        toolbarLeft.appendChild(typeSelect);
        this.typeFilter = typeSelect;
    }

    ensureYearCapsulesContainer() {
        if (document.getElementById('year-capsules-container')) return;
        const toolbar = document.querySelector('.archive-toolbar');
        if (!toolbar) return;
        const container = document.createElement('div');
        container.id = 'year-capsules-container';
        container.className = 'year-capsules-wrapper';
        toolbar.insertAdjacentElement('afterend', container);
        this.yearCapsulesContainer = container;
    }

    populateYearSelect(items) {
        if (!this.yearFilter) return;
        const years = getAvailableYears(items);
        this.yearFilter.innerHTML = '<option value="all">全部年份</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    renderYearCapsules(items) {
        if (!this.yearCapsulesContainer) return;
        const years = getAvailableYears(items);
        if (!years.length) {
            this.yearCapsulesContainer.innerHTML = '';
            return;
        }
        const currentYear = this.currentYear;
        const html = renderYearCapsules(years, currentYear, () => {});
        this.yearCapsulesContainer.innerHTML = html;
        // 绑定胶囊点击事件
        this.yearCapsulesContainer.querySelectorAll('.year-capsule').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const year = btn.getAttribute('data-year');
                this.currentYear = year;
                if (this.yearFilter) this.yearFilter.value = year;
                this.renderArchive();
                this.updateCapsulesActive(year);
            });
        });
    }

    updateCapsulesActive(activeYear) {
        if (!this.yearCapsulesContainer) return;
        this.yearCapsulesContainer.querySelectorAll('.year-capsule').forEach(btn => {
            if (btn.getAttribute('data-year') === activeYear) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    attachEvents() {
        if (this.yearFilter) {
            this.changeHandler = () => {
                this.currentYear = this.yearFilter.value;
                this.renderArchive();
                this.updateCapsulesActive(this.currentYear);
            };
            this.yearFilter.addEventListener('change', this.changeHandler);
        }
        if (this.typeFilter) {
            this.typeChangeHandler = () => {
                this.currentType = this.typeFilter.value;
                this.renderArchive();
            };
            this.typeFilter.addEventListener('change', this.typeChangeHandler);
        }
        if (this.resetButton) {
            this.resetHandler = () => {
                this.currentYear = 'all';
                this.currentType = 'all';
                if (this.yearFilter) this.yearFilter.value = 'all';
                if (this.typeFilter) this.typeFilter.value = 'all';
                this.renderArchive();
                this.updateCapsulesActive('all');
            };
            this.resetButton.addEventListener('click', this.resetHandler);
        }
    }

    renderArchive() {
        if (!this.container) return;

        // 根据类型筛选
        let filtered = this.allItems;
        if (this.currentType === 'article') {
            filtered = filtered.filter(item => item.__archiveType === 'article');
        } else if (this.currentType === 'work') {
            filtered = filtered.filter(item => item.__archiveType === 'work');
        }

        // 更新摘要
        const articlesCount = filtered.filter(i => i.__archiveType === 'article').length;
        const worksCount = filtered.filter(i => i.__archiveType === 'work').length;
        updateSummary(articlesCount, worksCount, filtered.length);

        // 渲染时间线
        this.container.innerHTML = buildTimelineHTML(filtered, this.currentYear, this.currentType);

        // 触发滚动动画刷新
        if (this.refreshCallback) this.refreshCallback();
        else if (window.refreshScrollReveal) window.refreshScrollReveal();

        // 绑定作品模态框（如果有全局委托可忽略，此处确保卡片点击）
        this.container.querySelectorAll('.timeline-item-title[data-type="work"]').forEach(el => {
            if (!el.hasAttribute('data-work-listener')) {
                el.setAttribute('data-work-listener', 'true');
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    const workInfoRaw = el.getAttribute('data-work-info');
                    if (workInfoRaw && window.showWorkDetails) {
                        try {
                            const workInfo = JSON.parse(decodeURIComponent(workInfoRaw));
                            window.showWorkDetails(workInfo);
                        } catch (err) {
                            console.warn('解析作品信息失败', err);
                        }
                    }
                });
            }
        });
    }

    destroy() {
        if (this.yearFilter && this.changeHandler) {
            this.yearFilter.removeEventListener('change', this.changeHandler);
        }
        if (this.typeFilter && this.typeChangeHandler) {
            this.typeFilter.removeEventListener('change', this.typeChangeHandler);
        }
        if (this.resetButton && this.resetHandler) {
            this.resetButton.removeEventListener('click', this.resetHandler);
        }
        this.container = null;
        this.summary = null;
        this.yearFilter = null;
        this.typeFilter = null;
        this.resetButton = null;
        this.yearCapsulesContainer = null;
        this.allItems = [];
        this.refreshCallback = null;
    }
}

// 导出初始化函数
export async function initArchivePage(scrollRevealRefreshCallback) {
    const manager = new ArchiveManager();
    manager.refreshCallback = scrollRevealRefreshCallback;
    await manager.init();
    return manager;
}