// /js/pages/search-render.ts
// 文章/作品页面的数据管理、UI 渲染和搜索控制

import { CONFIG, Utils, perf } from '/js/core/core.js';
import type { Item } from '/js/types/data.js';
import { dataService } from '/js/core/data-service.js';
import { DisposableStack } from '/js/core/disposable-stack.js';

// ==================== 工具函数 ====================
// 标签提取、日期解析、HTML 转义、标签 HTML 渲染统一收敛至 Utils，
// 本模块不再保留任何重复实现。

/** 根据排序规则对项目数组进行排序（不修改原数组） */
function sortByField(items: Item[], order: string): Item[] {
  const sorted = [...items];
  switch (order) {
    case 'updated_asc':
      sorted.sort(
        (a, b) =>
          Utils.parseArticleTimestamp(a.last_updated || a.date) -
          Utils.parseArticleTimestamp(b.last_updated || b.date)
      );
      break;
    case 'updated_desc':
      sorted.sort(
        (a, b) =>
          Utils.parseArticleTimestamp(b.last_updated || b.date) -
          Utils.parseArticleTimestamp(a.last_updated || a.date)
      );
      break;
    case 'wordcount_asc':
      sorted.sort((a, b) => (a.word_count || 0) - (b.word_count || 0));
      break;
    case 'wordcount_desc':
      sorted.sort((a, b) => (b.word_count || 0) - (a.word_count || 0));
      break;
    case 'date_asc':
      sorted.sort(
        (a, b) =>
          Utils.parseArticleTimestamp(a.date) -
          Utils.parseArticleTimestamp(b.date)
      );
      break;
    case 'date_desc':
    default:
      sorted.sort(
        (a, b) =>
          Utils.parseArticleTimestamp(b.date) -
          Utils.parseArticleTimestamp(a.date)
      );
      break;
  }
  return sorted;
}

function filterAndSort(
  items: Item[],
  query: string,
  field: string,
  selectedTags: string[],
  sortOrder: string
): Item[] {
  let result = [...items];

  if (selectedTags && selectedTags.length > 0) {
    result = result.filter((item) => {
      const tags = Utils.getTags(item);
      return tags.some((t) => selectedTags.includes(t));
    });
  }

  if (query && query.trim() !== '') {
    const ql = query.toLowerCase().trim();
    result = result.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const tags = Utils.getTags(item);

      switch (field) {
        case 'title':
          return title.includes(ql);
        case 'tag':
          return tags.some((t) => t.toLowerCase().includes(ql));
        case 'date':
          return (item.date || '').includes(query);
        default:
          return (
            title.includes(ql) ||
            tags.some((t) => t.toLowerCase().includes(ql)) ||
            (item.date || '').includes(query)
          );
      }
    });
  }

  return sortByField(result, sortOrder);
}

/**
 * 安全取出对应类型的条目数组。
 * 后端 JSON 缺字段（或 fetch 失败返回 null）时返回空数组，
 * 避免 `[...data.works]` 直接抛 TypeError 中断搜索流程。
 */
function pickItems(data: unknown, page: 'works' | 'articles'): Item[] {
  const list = (data as Record<string, unknown> | null | undefined)?.[page];
  return Array.isArray(list) ? (list as Item[]) : [];
}

// ==================== 数据管理器 ====================

export class DataManager {
  static readonly TYPE_LABEL = { works: '作品', articles: '文章' } as const;

  static async fetchData(
    type: 'works' | 'articles',
    useCache = true
  ): Promise<any> {
    const win = window as any;

    // 静态内嵌数据优先（构建时注入，跳过网络请求）
    const staticKey =
      type === 'articles' ? '__STATIC_ARTICLES_DATA' : '__STATIC_WORKS_DATA';
    if (win[staticKey]) {
      console.log(`[DataManager] 使用静态内嵌${this.TYPE_LABEL[type]}数据`);
      return { [type]: win[staticKey] };
    }

    try {
      const options = useCache ? undefined : { forceRefresh: true };
      const data =
        type === 'articles'
          ? await dataService.getArticles(options)
          : await dataService.getWorks(options);

      // 字段标准化（文章）
      if (type === 'articles' && data.articles) {
        data.articles = data.articles.map((a: any) => ({
          ...a,
          last_updated: a.last_updated || a.date,
          date: a.date,
          updated_date: a.last_updated || a.date,
        }));
      }

      return { [type]: data[type] };
    } catch (e) {
      console.error(`[DataManager] 获取${this.TYPE_LABEL[type]}数据失败:`, e);
      throw e;
    }
  }
}

// ==================== UI 渲染器 ====================

export class UIRenderer {
  static generateTagsHTML(item: Item): string {
    return Utils.renderTags(Utils.getTags(item));
  }

  static generateListItem(
    item: Item,
    type: 'article' | 'work',
    index: number
  ): string {
    const tagsHtml = this.generateTagsHTML(item);
    const desc = Utils.escapeHtml(item.description || '');
    const title = Utils.escapeHtml(item.title);

    if (type === 'article') {
      const url = item.url || '';
      const dateInfo = item.date
        ? `<span class="publish-date">发布于 ${Utils.escapeHtml(item.date)}</span>`
        : '';
      const updateInfo =
        item.last_updated && item.last_updated !== item.date
          ? `<span class="update-date">更新: ${Utils.escapeHtml(item.last_updated)}</span>`
          : '';
      const metaDate =
        dateInfo || updateInfo
          ? `<div class="article-dates-top-right">${dateInfo}${updateInfo ? '<br/>' + updateInfo : ''}</div>`
          : '';

      return `
        <div class="list-item" data-url="${Utils.escapeHtml(url)}" data-type="article" data-index="${index}">
          <div class="list-item-header">
            <h3 class="list-item-title">${title}</h3>
            ${metaDate}
          </div>
          <div class="article-meta-info">
            <span class="article-author">${Utils.escapeHtml(item.author || '未知作者')}</span>
            ${item.word_count ? `<span class="article-word-count">${item.word_count} 字</span>` : ''}
            ${item.read_time ? `<span class="article-read-time"><i class="far fa-clock"></i> ${Utils.escapeHtml(item.read_time)}</span>` : ''}
          </div>
          <p class="list-item-description">${desc}</p>
          ${tagsHtml}
        </div>`;
    } else {
      const workInfo = encodeURIComponent(
        JSON.stringify({
          title: item.title,
          description: item.description || '',
          link: item.link || '',
          tags: Utils.getTags(item),
        })
      );

      return `
        <div class="list-item" data-work-info="${workInfo}" data-type="work" data-index="${index}">
          <div class="list-item-header">
            <h3 class="list-item-title">${title}</h3>
            <div class="list-item-meta"><span class="list-item-date">${Utils.escapeHtml(item.date)}</span></div>
          </div>
          <p class="list-item-description">${desc}</p>
          ${tagsHtml}
        </div>`;
    }
  }

  static generateListHTML(data: any, type: 'works' | 'articles'): string {
    perf.start(`生成${DataManager.TYPE_LABEL[type]}HTML`);
    const items = type === 'works' ? data.works : data.articles;
    if (!items?.length) {
      perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
      return `<div class="${type}-list"><p>没有找到相关${DataManager.TYPE_LABEL[type]}！ >-<</p></div>`;
    }
    const html = `<div class="${type}-list">${items
      .map((item: Item, i: number) =>
        this.generateListItem(item, type.slice(0, -1) as 'article' | 'work', i)
      )
      .join('')}</div>`;
    perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
    return html;
  }
}

// ==================== 搜索控制器 ====================

export class SearchController {
  private page: 'works' | 'articles';
  public scrollRevealRefresh?: () => void;
  private selectedTags: string[] = [];
  private sortOrder = 'date_desc';
  private dataCache: Record<string, unknown> | null = null;
  private renderToken = 0;
  private isDestroyed = false;
  private tagsInitialized = false;

  private input: HTMLInputElement | null = null;
  private field: HTMLSelectElement | null = null;
  private sortSelect: HTMLSelectElement | null = null;
  private tagsContainer: HTMLElement | null = null;

  /** 统一资源清理栈 */
  private stack = new DisposableStack();

  private static readonly BATCH_SIZE = 20;

  constructor(page: 'works' | 'articles', scrollRevealRefresh?: () => void) {
    this.page = page;
    this.scrollRevealRefresh = scrollRevealRefresh;
    this.init();
  }

  // ---------- 初始化 ----------

  private init(retry = 0): void {
    if (this.isDestroyed) return;

    this.input = document.getElementById('search-input') as HTMLInputElement | null;
    this.field = document.getElementById('search-field') as HTMLSelectElement | null;
    this.sortSelect = document.getElementById('sort-order') as HTMLSelectElement | null;
    this.tagsContainer = document.getElementById(`${this.page}-tags-filter`);

    if (!this.input || !this.field) {
      if (retry < 3) {
        const t = window.setTimeout(() => this.init(retry + 1), 1000 * (retry + 1));
        this.stack.addTimeout(t);
        return;
      }
      console.error(
        `[SearchController] 搜索元素在 ${this.page} 页面中未找到，放弃初始化`
      );
      return;
    }

    const inputHandler = Utils.debounce(() => this.runSearch(), 300);
    const fieldHandler = () => this.runSearch();
    const sortHandler = () => {
      this.sortOrder = this.sortSelect!.value;
      this.runSearch();
      this.updateURL();
    };
    const popstateHandler = (e: PopStateEvent) => {
      if (!e.state?.skip) {
        this.restoreFromURL();
        this.runSearch(true);
      }
    };

    this.stack.addEventListener(this.input, 'input', inputHandler as EventListener);
    this.stack.addEventListener(this.field, 'change', fieldHandler as EventListener);
    if (this.sortSelect) {
      this.stack.addEventListener(this.sortSelect, 'change', sortHandler as EventListener);
    }
    this.stack.addEventListener(window, 'popstate', popstateHandler as EventListener);

    this.restoreFromURL();
    this.runSearch(true);
    this.updateTagFilters().catch((err) => {
      console.warn(`[SearchController] 标签筛选初始化失败 (${this.page}):`, err);
    });
  }

  // ---------- 销毁 ----------

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stack.dispose();
    console.log(`[SearchController] 已销毁 (${this.page})`);
  }

  // ---------- 数据 ----------

  private async getData(): Promise<Record<string, unknown> | null> {
    if (this.dataCache) return this.dataCache;
    const data = await DataManager.fetchData(this.page, true);
    this.dataCache = (data ?? null) as Record<string, unknown> | null;
    return this.dataCache;
  }

  /**
   * handleSearch 的容错包装：把内部异常收敛为一条 warn，
   * 避免事件回调里出现未处理的 Promise rejection。
   */
  private runSearch(skipUpdateURL = false): void {
    this.handleSearch(skipUpdateURL).catch((err) => {
      console.warn(`[SearchController] 搜索失败 (${this.page}):`, err);
    });
  }

  // ---------- 搜索主流程 ----------

  private async handleSearch(skipUpdateURL = false): Promise<void> {
    if (this.isDestroyed) return;

    const data = await this.getData();
    if (!data) return;

    const q = this.input?.value.trim() || '';
    const field = this.field?.value || 'all';
    const items = pickItems(data, this.page);

    const token = ++this.renderToken;

    if (!skipUpdateURL) this.updateURL();

    const result = filterAndSort(items, q, field, this.selectedTags, this.sortOrder);

    const container = document.getElementById(`${this.page}-list-container`);
    if (container) {
      this.renderItemsInBatches(result, container, token);
    }
  }

  // ---------- 分批渲染 ----------

  private renderItemsInBatches(
    items: Item[],
    container: HTMLElement,
    token: number
  ): void {
    container.innerHTML = '';

    if (!items.length) {
      container.innerHTML = `<p>没有找到相关${DataManager.TYPE_LABEL[this.page]}！ >-<</p>`;
      this.scrollRevealRefresh?.();
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `${this.page}-list`;
    container.appendChild(wrapper);

    const total = items.length;
    let index = 0;
    const type = this.page.slice(0, -1) as 'article' | 'work';

    const batch = (): void => {
      if (this.isDestroyed || token !== this.renderToken) return;

      const end = Math.min(index + SearchController.BATCH_SIZE, total);
      const fragment = document.createDocumentFragment();

      for (let i = index; i < end; i++) {
        const html = UIRenderer.generateListItem(items[i], type, i);
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const node = temp.firstElementChild;
        if (node) fragment.appendChild(node);
      }

      wrapper.appendChild(fragment);
      index = end;

      if (index < total) {
        requestAnimationFrame(batch);
      } else {
        this.scrollRevealRefresh?.();
      }
    };

    requestAnimationFrame(batch);
  }

  // ---------- URL 同步 ----------

  private updateURL(): void {
    const params = new URLSearchParams(location.search);
    const q = this.input?.value.trim() || '';
    const field = this.field?.value || 'all';
    const sort = this.sortSelect?.value || 'date_desc';

    q ? params.set('q', q) : params.delete('q');
    field && field !== 'all' ? params.set('field', field) : params.delete('field');
    sort && sort !== 'date_desc' ? params.set('sort', sort) : params.delete('sort');
    this.selectedTags.length
      ? params.set('tags', this.selectedTags.join(','))
      : params.delete('tags');

    const newUrl = `${location.pathname}?${params.toString()}`;
    if (newUrl !== location.href.split('#')[0]) {
      history.pushState({ skip: true }, '', newUrl);
    }
  }

  private restoreFromURL(): void {
    const params = new URLSearchParams(location.search);
    if (this.input) this.input.value = params.get('q') || '';
    if (this.field) this.field.value = params.get('field') || 'all';

    if (this.sortSelect) {
      const sort = params.get('sort') || 'date_desc';
      this.sortSelect.value = sort;
      this.sortOrder = sort;
    }

    this.selectedTags = params.get('tags')?.split(',').filter(Boolean) || [];
    this.applyTagsToButtons();
  }

  // ---------- 标签筛选按钮 ----------

  private applyTagsToButtons(): void {
    if (!this.tagsContainer) return;
    this.tagsContainer
      .querySelectorAll<HTMLElement>('.tag-button:not(:last-child)')
      .forEach((btn) => {
        const tag = btn.dataset.tag;
        btn.classList.toggle(
          'active',
          tag !== undefined && this.selectedTags.includes(tag)
        );
      });
  }

  private async updateTagFilters(): Promise<void> {
    if (this.tagsInitialized || !this.tagsContainer) return;
    this.tagsInitialized = true;

    const data = await this.getData();
    if (!data) return;

    const items = pickItems(data, this.page);
    const tagMap = new Map<string, number>();
    items.forEach((item: Item) =>
      Utils.getTags(item).forEach((t) => tagMap.set(t, (tagMap.get(t) || 0) + 1))
    );

    const tags = Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

    this.tagsContainer.innerHTML = `<span class="filter-label">按标签筛选:</span>`;

    const maxCount = Math.max(...tags.map((t) => t.count), 1);

    tags.forEach(({ name, count }) => {
      const ratio = count / maxCount;
      let sizeClass = 'tag--sm';
      if (ratio >= 0.66) sizeClass = 'tag--lg';
      else if (ratio >= 0.33) sizeClass = 'tag--md';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tag-button ${sizeClass}`;
      btn.textContent = name;

      const badge = document.createElement('span');
      badge.className = 'tag-count';
      badge.textContent = String(count);
      btn.appendChild(badge);

      btn.dataset.tag = name;

      btn.addEventListener('click', () => {
        const idx = this.selectedTags.indexOf(name);
        idx > -1 ? this.selectedTags.splice(idx, 1) : this.selectedTags.push(name);
        this.applyTagsToButtons();
        this.runSearch();
      });

      this.tagsContainer!.appendChild(btn);
    });

    // 清除筛选按钮
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tag-button';
    clear.textContent = '清除筛选';
    clear.style.marginLeft = 'auto';
    clear.addEventListener('click', () => {
      this.selectedTags = [];
      this.applyTagsToButtons();
      this.runSearch();
    });
    this.tagsContainer.appendChild(clear);

    this.applyTagsToButtons();
  }
}

// ==================== 页面初始化 ====================

export async function initSearchPage(
  page: 'works' | 'articles',
  scrollRevealRefreshCallback?: () => void
): Promise<SearchController> {
  const existing = (window as any)._currentSearchController as
    | SearchController
    | undefined;

  if (
    existing &&
    !(existing as any).isDestroyed &&
    (existing as any).page === page
  ) {
    existing.scrollRevealRefresh = scrollRevealRefreshCallback;
    return existing;
  }

  if (existing) {
    existing.destroy();
    (window as any)._currentSearchController = null;
  }

  await DataManager.fetchData(page, true);
  const controller = new SearchController(page, scrollRevealRefreshCallback);
  (window as any)._currentSearchController = controller;
  return controller;
}