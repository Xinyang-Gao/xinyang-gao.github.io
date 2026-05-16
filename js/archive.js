import { DataManager, UIRenderer } from '/js/search-render.js';
import { Utils } from '/js/core.js';

function parseArticleDate(item) {
  const value = item.date || item.last_updated || item.updated_date;
  const date = value ? new Date(value) : null;
  return Number.isNaN(date?.getTime()) ? null : date;
}

function formatMonthLabel(monthIndex) {
  return `${monthIndex.toString().padStart(2, '0')} 月`;
}

function buildTimelineHTML(items, selectedYear) {
  if (!items.length) {
    return '<div class="archive-empty">暂无可显示的内容。</div>';
  }

  const grouped = new Map();

  items.forEach(item => {
    const date = parseArticleDate(item);
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
        const da = parseArticleDate(a)?.getTime() || 0;
        const db = parseArticleDate(b)?.getTime() || 0;
        return db - da;
      });
      const itemsHtml = monthItems.map(item => {
        const date = parseArticleDate(item);
        const dateLabel = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '未知日期';
        const tagsHtml = UIRenderer.generateTagsHTML(item);
        const description = Utils.escapeHtml(item.description || '暂无描述');
        const title = Utils.escapeHtml(item.title || '未命名内容');
        const url = item.url || item.link || '#';
        const typeBadge = item.__archiveType === 'work' ? '<span class="timeline-item-badge">作品</span>' : '';

        // 如果是作品，渲染为可触发作品详情弹窗的元素（与作品列表一致）
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
          <h4>${formatMonthLabel(month)}</h4>
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
    const date = parseArticleDate(item);
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

export async function initArchivePage(scrollRevealRefreshCallback) {
  const container = document.getElementById('archive-container');
  const summary = document.getElementById('archive-summary');
  const yearFilter = document.getElementById('archive-year-filter');
  const resetButton = document.getElementById('archive-reset');

  if (!container || !summary || !yearFilter || !resetButton) return;

  container.innerHTML = '<div class="loading-text">正在加载归档...</div>';
  summary.textContent = '';

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

    const archiveItems = [
      ...articles.map(item => ({ ...item, __archiveType: 'article', url: item.url || item.link || '#' })),
      ...works.map(item => ({ ...item, __archiveType: 'work', url: item.link || item.url || '#' }))
    ];

    const totalArticles = articles.length;
    const totalWorks = works.length;
    summary.textContent = `当前显示 ${totalArticles} 篇文章，${totalWorks} 个作品`;

    renderYearFilter(archiveItems);
    const renderArchive = () => {
      const selectedYear = yearFilter.value || 'all';
      container.innerHTML = buildTimelineHTML(archiveItems, selectedYear);
      if (scrollRevealRefreshCallback) scrollRevealRefreshCallback();
    };

    yearFilter.addEventListener('change', renderArchive);
    resetButton.addEventListener('click', () => {
      yearFilter.value = 'all';
      renderArchive();
    });

    renderArchive();
  } catch (error) {
    container.innerHTML = `<div class="archive-error">加载归档失败，请稍后重试。</div>`;
    console.error('[Archive] 初始化归档页面失败:', error);
  }
}
