// /js/pages/search-render.ts
// 文章/作品页面的数据管理、UI渲染和搜索控制（精简优化版）

import { CONFIG, Utils, storageController, perf } from '/js/core/core.js';
import type { Item, TagCount } from '/js/types/data.js';

// ==================== 工具函数 ====================
const getTags = (item: Item): string[] => item.tags?.length ? item.tags : (item.tag?.length ? item.tag : []);
const escapeHtml = (s: unknown) => s ? String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m)) : '';
const isDataValid = (data: any, type: 'works' | 'articles') => data && (type === 'works' ? data.works?.length : data.articles?.length);

// ==================== 数据管理器 ====================
export class DataManager {
  static readonly TYPE_LABEL = { works: '作品', articles: '文章' };
  private static readonly CONFIG = {
    works: { url: CONFIG.API.WORKS, cacheKey: CONFIG.STORAGE_KEYS.WORKS_DATA },
    articles: { url: CONFIG.API.ARTICLES, cacheKey: CONFIG.STORAGE_KEYS.ARTICLES_DATA },
  };

  static async fetchData(type: 'works' | 'articles', useCache = true): Promise<any> {
    const win = window as any;
    // 静态数据优先
    const staticKey = type === 'articles' ? '__STATIC_ARTICLES_DATA' : '__STATIC_WORKS_DATA';
    if (win[staticKey]) {
      console.log(`[DataManager] 使用静态内嵌${this.TYPE_LABEL[type]}数据`);
      return { [type]: win[staticKey] };
    }

    const { url, cacheKey } = this.CONFIG[type];
    const label = this.TYPE_LABEL[type];
    perf.start(`获取${label}数据`);

    // 缓存读取
    if (useCache && storageController.isAllowed()) {
      const raw = storageController.getItem(cacheKey);
      if (raw && !Utils.isDataExpired(raw)) {
        try {
          const parsed = JSON.parse(raw);
          delete parsed._timestamp;
          if (isDataValid(parsed, type)) {
            perf.end(`获取${label}数据`);
            return parsed;
          }
        } catch { /* ignore */ }
      }
    }

    // 网络请求
    try {
      console.log(`[INFO] 从服务器获取${label}数据`);
      const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (!isDataValid(data, type)) throw new Error('数据格式无效');

      // 文章字段标准化
      if (type === 'articles' && data.articles) {
        data.articles = data.articles.map((a: any) => ({
          ...a,
          last_updated: a.last_updated || a.date,
          date: a.date,
          updated_date: a.last_updated || a.date,
        }));
      }

      if (storageController.isAllowed()) {
        storageController.setItem(cacheKey, JSON.stringify({ ...data, _timestamp: Date.now() }));
      }
      perf.end(`获取${label}数据`);
      return data;
    } catch (e) {
      console.error(`[ERROR] 获取${label}数据失败:`, e);
      perf.end(`获取${label}数据`);
      throw e;
    }
  }
}

// ==================== UI渲染器 ====================
export class UIRenderer {
  static generateTagsHTML(item: Item): string {
    const tags = getTags(item);
    return tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : '';
  }

  static generateListItem(item: Item, type: 'article' | 'work', index: number): string {
    const tagsHtml = this.generateTagsHTML(item);
    const desc = escapeHtml(item.description || '');
    const title = escapeHtml(item.title);

    if (type === 'article') {
      const url = item.url || '';
      const dateInfo = item.date ? `<span class="publish-date">发布于 ${escapeHtml(item.date)}</span>` : '';
      const updateInfo = item.last_updated && item.last_updated !== item.date ?
        `<span class="update-date">更新: ${escapeHtml(item.last_updated)}</span>` : '';
      const metaDate = dateInfo || updateInfo ?
        `<div class="article-dates-top-right">${dateInfo}${updateInfo ? '<br/>' + updateInfo : ''}</div>` : '';
      return `
        <div class="list-item" data-url="${escapeHtml(url)}" data-type="article" data-index="${index}">
          <div class="list-item-header">
            <h3 class="list-item-title">${title}</h3>
            ${metaDate}
          </div>
          <div class="article-meta-info">
            <span class="article-author">${escapeHtml(item.author || '未知作者')}</span>
            ${item.word_count ? `<span class="article-word-count">${item.word_count} 字</span>` : ''}
            ${item.read_time ? `<span class="article-read-time"><i class="far fa-clock"></i> ${escapeHtml(item.read_time)}</span>` : ''}
          </div>
          <p class="list-item-description">${desc}</p>
          ${tagsHtml}
        </div>`;
    } else {
      const workInfo = encodeURIComponent(JSON.stringify({
        title: item.title,
        description: item.description || '',
        link: item.link || '',
        tags: getTags(item),
      }));
      return `
        <div class="list-item" data-work-info="${workInfo}" data-type="work" data-index="${index}">
          <div class="list-item-header">
            <h3 class="list-item-title">${title}</h3>
            <div class="list-item-meta"><span class="list-item-date">${escapeHtml(item.date)}</span></div>
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
    const html = `<div class="${type}-list">${items.map((item: Item, i: number) => this.generateListItem(item, type.slice(0, -1) as 'article' | 'work', i)).join('')}</div>`;
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
  private dataCache: any = null;
  private worker: Worker | null = null;
  private requestId = 0;
  private renderToken = 0;
  private isDestroyed = false;
  private tagsInitialized = false;

  private input: HTMLInputElement | null = null;
  private field: HTMLSelectElement | null = null;
  private sortSelect: HTMLSelectElement | null = null;
  private tagsContainer: HTMLElement | null = null;

  private boundHandlers: { input: () => void; field: () => void; sort: () => void; popstate: (e: PopStateEvent) => void } | null = null;
  private initTimer: number | null = null;

  private static readonly BATCH_SIZE = 20;

  constructor(page: 'works' | 'articles', scrollRevealRefresh?: () => void) {
    this.page = page;
    this.scrollRevealRefresh = scrollRevealRefresh;
    this.init();
  }

  private init(retry = 0): void {
    if (this.isDestroyed) return;
    this.input = document.getElementById('search-input') as HTMLInputElement;
    this.field = document.getElementById('search-field') as HTMLSelectElement;
    this.sortSelect = document.getElementById('sort-order') as HTMLSelectElement;
    this.tagsContainer = document.getElementById(`${this.page}-tags-filter`);

    if (!this.input || !this.field) {
      if (retry < 3) {
        this.initTimer = window.setTimeout(() => this.init(retry + 1), 1000 * (retry + 1));
        return;
      }
      console.error(`[SearchController] 搜索元素在 ${this.page} 页面中未找到，放弃初始化`);
      return;
    }

    this.boundHandlers = {
      input: Utils.debounce(() => this.handleSearch(), 300),
      field: () => this.handleSearch(),
      sort: () => { this.sortOrder = this.sortSelect!.value; this.handleSearch(); this.updateURL(); },
      popstate: (e) => { if (!e.state?.skip) { this.restoreFromURL(); this.handleSearch(true); } },
    };

    this.input.addEventListener('input', this.boundHandlers.input);
    this.field.addEventListener('change', this.boundHandlers.field);
    if (this.sortSelect) this.sortSelect.addEventListener('change', this.boundHandlers.sort);
    window.addEventListener('popstate', this.boundHandlers.popstate);

    this.restoreFromURL();
    this.handleSearch(true);
    this.updateTagFilters();
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (this.initTimer) clearTimeout(this.initTimer);
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    if (this.boundHandlers) {
      this.input?.removeEventListener('input', this.boundHandlers.input);
      this.field?.removeEventListener('change', this.boundHandlers.field);
      this.sortSelect?.removeEventListener('change', this.boundHandlers.sort);
      window.removeEventListener('popstate', this.boundHandlers.popstate);
      this.boundHandlers = null;
    }
    console.log(`[SearchController] 已销毁 (${this.page})`);
  }

  private getWorker(): Worker {
    if (!this.worker) this.worker = new Worker('/js/data/searchWorker.js', { type: 'module' });
    return this.worker;
  }

  private async getData(): Promise<any> {
    if (this.dataCache) return this.dataCache;
    this.dataCache = await DataManager.fetchData(this.page, true);
    return this.dataCache;
  }

  private async handleSearch(skipUpdateURL = false): Promise<void> {
    if (this.isDestroyed) return;
    const data = await this.getData();
    if (!data) return;

    const q = this.input?.value.trim() || '';
    const field = this.field?.value || 'all';
    const items = this.page === 'works' ? [...data.works] : [...data.articles];

    const requestId = ++this.requestId;
    this.renderToken++;

    const worker = this.getWorker();
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('message', handler);
        worker.terminate();
        this.worker = null;
        resolve();
      }, 5000);

      const handler = (e: MessageEvent) => {
        if (e.data.type === 'filterAndSortResult' && e.data.requestId === requestId) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          if (!skipUpdateURL) this.updateURL();

          const container = document.getElementById(`${this.page}-list-container`);
          if (container) {
            this.renderItemsInBatches(e.data.data, container, this.renderToken);
          }
          resolve();
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'filterAndSort',
        options: { items, query: q, field, selectedTags: this.selectedTags, sortOrder: this.sortOrder, requestId }
      });
    }).catch(() => { /* ignore */ });
  }

  private renderItemsInBatches(items: Item[], container: HTMLElement, token: number): void {
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

    const batch = () => {
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
      if (index < total) requestAnimationFrame(batch);
      else this.scrollRevealRefresh?.();
    };
    requestAnimationFrame(batch);
  }

  private updateURL(): void {
    const params = new URLSearchParams(location.search);
    const q = this.input?.value.trim() || '';
    const field = this.field?.value || 'all';
    const sort = this.sortSelect?.value || 'date_desc';

    q ? params.set('q', q) : params.delete('q');
    field && field !== 'all' ? params.set('field', field) : params.delete('field');
    sort && sort !== 'date_desc' ? params.set('sort', sort) : params.delete('sort');
    this.selectedTags.length ? params.set('tags', this.selectedTags.join(',')) : params.delete('tags');

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

  private applyTagsToButtons(): void {
    if (!this.tagsContainer) return;
    this.tagsContainer.querySelectorAll<HTMLElement>('.tag-button:not(:last-child)').forEach(btn => {
      const tag = btn.dataset.tag;
      btn.classList.toggle('active', tag !== undefined && this.selectedTags.includes(tag));
    });
  }

  private async updateTagFilters(): Promise<void> {
    if (this.tagsInitialized || !this.tagsContainer) return;
    this.tagsInitialized = true;

    const data = await this.getData();
    if (!data) return;
    const items = this.page === 'works' ? data.works : data.articles;
    const tagMap = new Map<string, number>();
    items.forEach((item: Item) => getTags(item).forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)));
    const tags = Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

    this.tagsContainer.innerHTML = `<span class="filter-label">按标签筛选:</span>`;
    tags.forEach(({ name, count }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-button';
      btn.textContent = `${name} (${count})`;
      btn.dataset.tag = name;
      btn.addEventListener('click', () => {
        const idx = this.selectedTags.indexOf(name);
        idx > -1 ? this.selectedTags.splice(idx, 1) : this.selectedTags.push(name);
        this.applyTagsToButtons();
        this.handleSearch();
      });
      this.tagsContainer!.appendChild(btn);
    });

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tag-button';
    clear.textContent = '清除筛选';
    clear.style.marginLeft = 'auto';
    clear.addEventListener('click', () => {
      this.selectedTags = [];
      this.applyTagsToButtons();
      this.handleSearch();
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
  const existing = (window as any)._currentSearchController;
  if (existing && !existing.isDestroyed && existing.page === page) {
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