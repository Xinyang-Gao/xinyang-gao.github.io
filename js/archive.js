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

function buildTimelineHTML(articles, selectedYear) {
  if (!articles.length) {
    return '<div class="archive-empty">暂无可显示的文章。</div>';
  }

  const grouped = new Map();
  const yearSet = new Set();

  articles.forEach(article => {
    const date = parseArticleDate(article);
    if (!date) return;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    yearSet.add(year);
    if (selectedYear !== 'all' && String(year) !== selectedYear) return;

    if (!grouped.has(year)) grouped.set(year, new Map());
    const yearGroups = grouped.get(year);
    if (!yearGroups.has(month)) yearGroups.set(month, []);
    yearGroups.get(month).push(article);
  });

  if (selectedYear !== 'all' && (!grouped.size || !grouped.get(Number(selectedYear)))) {
    return '<div class="archive-empty">当前年份没有文章。可调整筛选条件查看全部内容。</div>';
  }

  const sortedYears = Array.from(grouped.keys()).sort((a, b) => b - a);
  const htmlSegments = sortedYears.map(year => {
    const months = Array.from(grouped.get(year).keys()).sort((a, b) => b - a);
    const monthHtml = months.map(month => {
      const monthArticles = grouped.get(year).get(month).sort((a, b) => {
        const da = parseArticleDate(a)?.getTime() || 0;
        const db = parseArticleDate(b)?.getTime() || 0;
        return db - da;
      });
      const itemsHtml = monthArticles.map(article => {
        const date = parseArticleDate(article);
        const dateLabel = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '未知日期';
        const tagsHtml = UIRenderer.generateTagsHTML(article);
        const description = Utils.escapeHtml(article.description || '暂无描述');
        const title = Utils.escapeHtml(article.title || '未命名文章');
        const url = article.url || '#';

        return `
          <article class="timeline-item" data-date="${Utils.escapeHtml(dateLabel)}">
            <div class="timeline-item-marker"></div>
            <div class="timeline-item-content">
              <div class="timeline-item-header">
                <a href="${Utils.escapeHtml(url)}" class="timeline-item-title">${title}</a>
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

function getAvailableYears(articles) {
  const years = new Set();
  articles.forEach(article => {
    const date = parseArticleDate(article);
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
    const data = await DataManager.fetchData('articles', true);
    const articles = (data.articles || []).filter(item => !item.hidden);
    const totalCount = articles.length;
    summary.textContent = `当前显示 ${totalCount} 篇文章`; 

    renderYearFilter(articles);
    const renderArchive = () => {
      const selectedYear = yearFilter.value || 'all';
      container.innerHTML = buildTimelineHTML(articles, selectedYear);
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
