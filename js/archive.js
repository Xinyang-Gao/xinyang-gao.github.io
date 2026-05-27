// archive.js
import { DataManager, UIRenderer } from '/js/search-render.js';
import { Utils } from '/js/core.js';
import { PageManager } from '/js/page-manager.js';

function buildTimelineHTML(items, selectedYear) {
  if (!items.length) {
    return '<div class="archive-empty">暂无可显示的内容。</div>';
  }

  const grouped = new Map();

  items.forEach(item => {
    const date = Utils.parseArticleDate(item);
    if (!date) return;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    if (selectedYear !== 'all' && String(year) !== selectedYear) return;

    if (!grouped.has(year)) grouped.set(year, new Map());
    const yearGroups = grouped.get(year);
    if (!yearGroups.has(month)) yearGroups.set(month, []);
    yearGroups.get(month).push(item);
  });

  if (selectedYear !== 'all' && (!grouped.size || !grouped.get(Number(selectedYear)))) {
    return '<div class="archive-empty">当前年份没有文章或作品。可调整筛选条件查看全部内容。</div>';
  }

  const sortedYears = Array.from(grouped.keys()).sort((a, b) => b - a);
  const htmlSegments = sortedYears.map(year => {
    const months = Array.from(grouped.get(year).keys()).sort((a, b) => b - a);
    const monthHtml = months.map(month => {
      const monthItems = grouped.get(year).get(month).sort((a, b) => {
        const da = Utils.parseArticleDate(a)?.getTime() || 0;
        const db = Utils.parseArticleDate(b)?.getTime() || 0;
        return db - da;
      });
      const itemsHtml = monthItems.map(item => {
        const date = Utils.parseArticleDate(item);
        const dateLabel = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '未知日期';
        const tagsHtml = UIRenderer.generateTagsHTML(item);
        const description = Utils.escapeHtml(item.description || '暂无描述');
        const title = Utils.escapeHtml(item.title || '未命名内容');
        const url = item.url || item.link || '#';
        const typeBadge = item.__archiveType === 'work' ? '<span class="timeline-item-badge">作品</span>' : '';

        let titleHtml;
        if (item.__archiveType === 'work') {
          const workInfo = {
            title: item.title || '',
            description: item.description || '',
            tags: item.tag || item.tags || [],
            link: item.link || item.url || ''
          };
          const workInfoAttr = Utils.escapeHtml(encodeURIComponent(JSON.stringify(workInfo)));
          titleHtml = `<a href="javascript:void(0)" class="timeline-item-title list-item" data-type="work" data-work-info="${workInfoAttr}">${title}</a>`;
        } else {
          titleHtml = `<a href="${Utils.escapeHtml(url)}" class="timeline-item-title">${title}</a>`;
        }

        return `
          <article class="timeline-item" data-date="${Utils.escapeHtml(dateLabel)}">
            <div class="timeline-item-marker"></div>
            <div class="timeline-item-content">
              <div class="timeline-item-header">
                ${titleHtml}
                ${typeBadge}
                <span class="timeline-item-date">${Utils.escapeHtml(dateLabel)}</span>
              </div>
              <p class="timeline-item-description">${description}</p>
              ${tagsHtml}
            </div>
          </article>`;
      }).join('');

      return `
        <section class="timeline-month">
          <h4>${Utils.formatMonthLabel(month)}</h4>
          <div class="timeline-month-list">${itemsHtml}</div>
        </section>`;
    }).join('');

    return `
      <section class="timeline-year">
        <h3>${year}</h3>
        ${monthHtml}
      </section>`;
  });

  return `<div class="timeline">${htmlSegments.join('')}</div>`;
}

function getAvailableYears(items) {
  const years = new Set();
  items.forEach(item => {
    const date = Utils.parseArticleDate(item);
    if (date) years.add(date.getFullYear());
  });
  return Array.from(years).sort((a, b) => b - a);
}

function renderYearFilter(articles) {
  const yearFilter = document.getElementById('archive-year-filter');
  if (!yearFilter) return;
  const years = getAvailableYears(articles);
  yearFilter.innerHTML = '<option value="all">全部年份</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
}

// ==================== 归档页面管理器类 ====================
export class ArchiveManager extends PageManager {
    constructor() {
        super();
        this.container = null;
        this.summary = null;
        this.yearFilter = null;
        this.resetButton = null;
        this.archiveItems = [];
        this.changeHandler = null;
        this.resetHandler = null;
        this.refreshCallback = null;
    }

    async init() {
        this.container = document.getElementById('archive-container');
        this.summary = document.getElementById('archive-summary');
        this.yearFilter = document.getElementById('archive-year-filter');
        this.resetButton = document.getElementById('archive-reset');

        if (!this.container || !this.summary || !this.yearFilter || !this.resetButton) return;

        this.container.innerHTML = '<div class="loading-text">正在加载归档...</div>';
        this.summary.textContent = '';

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

            this.archiveItems = [
                ...articles.map(item => ({ ...item, __archiveType: 'article', url: item.url || item.link || '#' })),
                ...works.map(item => ({ ...item, __archiveType: 'work', url: item.link || item.url || '#' }))
            ];

            const totalArticles = articles.length;
            const totalWorks = works.length;
            this.summary.textContent = `当前显示 ${totalArticles} 篇文章，${totalWorks} 个作品`;

            renderYearFilter(this.archiveItems);
            
            this.changeHandler = () => this.renderArchive();
            this.resetHandler = () => {
                if (this.yearFilter) this.yearFilter.value = 'all';
                this.renderArchive();
            };
            
            this.yearFilter.addEventListener('change', this.changeHandler);
            this.resetButton.addEventListener('click', this.resetHandler);
            
            this.renderArchive();
        } catch (error) {
            this.container.innerHTML = `<div class="archive-error">加载归档失败，请稍后重试。</div>`;
            console.error('[Archive] 初始化归档页面失败:', error);
        }
    }

    renderArchive() {
        if (!this.container) return;
        const selectedYear = this.yearFilter ? (this.yearFilter.value || 'all') : 'all';
        this.container.innerHTML = buildTimelineHTML(this.archiveItems, selectedYear);
        if (this.refreshCallback) this.refreshCallback();
        else if (window.refreshScrollReveal) window.refreshScrollReveal();
    }

    destroy() {
        if (this.yearFilter && this.changeHandler) {
            this.yearFilter.removeEventListener('change', this.changeHandler);
        }
        if (this.resetButton && this.resetHandler) {
            this.resetButton.removeEventListener('click', this.resetHandler);
        }
        this.container = null;
        this.summary = null;
        this.yearFilter = null;
        this.resetButton = null;
        this.archiveItems = [];
        this.changeHandler = null;
        this.resetHandler = null;
        this.refreshCallback = null;
    }
}

// ==================== 导出的初始化函数（供 router 调用）====================
export async function initArchivePage(scrollRevealRefreshCallback) {
    const manager = new ArchiveManager();
    manager.refreshCallback = scrollRevealRefreshCallback;
    await manager.init();
    return manager;
}