// /js/pages/search-render.ts
// 文章/作品页面的数据管理、UI渲染和搜索控制

import { CONFIG, Utils, storageController, perf } from '/js/core/core.js';
import type { DataType, Item, TagCount } from '/js/types/data.js';

// ==================== 数据管理器 ====================
export class DataManager {
  static TYPE_LABEL = { works: '作品', articles: '文章' };
  static config = {
    works: { url: CONFIG.API.WORKS, cacheKey: CONFIG.STORAGE_KEYS.WORKS_DATA, cacheControl: 'no-cache' },
    articles: { url: CONFIG.API.ARTICLES, cacheKey: CONFIG.STORAGE_KEYS.ARTICLES_DATA, cacheControl: 'default' }
  };

  static async fetchData(type: 'works' | 'articles', useCache = true): Promise<any> {
    if (type === 'articles' && (window as any).__STATIC_ARTICLES_DATA) {
      console.log('[DataManager] 使用静态内嵌文章数据');
      return { articles: (window as any).__STATIC_ARTICLES_DATA };
    }
    if (type === 'works' && (window as any).__STATIC_WORKS_DATA) {
      console.log('[DataManager] 使用静态内嵌作品数据');
      return { works: (window as any).__STATIC_WORKS_DATA };
    }
    const { url, cacheKey, cacheControl } = DataManager.config[type];
    const label = DataManager.TYPE_LABEL[type];
    perf.start(`获取${label}数据`);

    if (useCache && storageController.isAllowed()) {
      const raw = storageController.getItem(cacheKey);
      if (raw && !Utils.isDataExpired(raw)) {
        try {
          const parsed = JSON.parse(raw);
          delete parsed._timestamp;
          if (Utils.validateData(parsed, type)) {
            perf.end(`获取${label}数据`);
            return parsed;
          }
        } catch {
          console.warn('[WARN] 缓存数据无效');
        }
      }
    }

    try {
      console.log(`[INFO] 从服务器获取${label}数据`);
      const opts: RequestInit = { headers: { 'Cache-Control': cacheControl } };
      if (cacheControl === 'no-cache') opts.cache = 'no-store';
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (!Utils.validateData(data, type)) throw new Error('数据格式无效');

      if (type === 'articles' && data.articles) {
        data.articles = data.articles.map((article: any) => ({
          ...article,
          last_updated: article.last_updated || article.date,
          date: article.date,
          updated_date: article.last_updated || article.date
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
    const tags = Utils.getTags(item);
    if (!tags || !tags.length) return '';
    return `<div class="tags">${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>`;
  }

  static generateListItem(item: Item, type: 'article' | 'work', index: number): string {
    const tags = UIRenderer.generateTagsHTML(item);
    if (type === 'article') {
      const itemUrl = item.url || '';
      const publishDate = item.date ? `<span class="publish-date">发布于 ${Utils.escapeHtml(item.date)}</span>` : '';
      const updateDate = item.last_updated && item.last_updated !== item.date ?
        `<span class="update-date">更新: ${Utils.escapeHtml(item.last_updated)}</span>` : '';
      const dateInfo = publishDate || updateDate ?
        `<div class="article-dates-top-right">${publishDate}${updateDate ? '<br/>' + updateDate : ''}</div>` : '';

      return `
      <div class="list-item" data-url="${Utils.escapeHtml(itemUrl)}" data-type="article" data-index="${index}">
        <div class="list-item-header">
          <h3 class="list-item-title">${Utils.escapeHtml(item.title)}</h3>
          ${dateInfo}
        </div>
        <div class="article-meta-info">
          <span class="article-author">${Utils.escapeHtml(item.author || '未知作者')}</span>
          ${item.word_count ? `<span class="article-word-count">${item.word_count} 字</span>` : ''}
          ${item.read_time ? `<span class="article-read-time"><i class="far fa-clock"></i> ${Utils.escapeHtml(item.read_time)}</span>` : ''}
        </div>
        <p class="list-item-description">${Utils.escapeHtml(item.description || '')}</p>
        ${tags}
      </div>`;
    } else {
      const workInfo = {
        title: item.title,
        description: item.description || '',
        link: item.link || '',
        tags: Utils.getTags(item)
      };
      const workInfoStr = encodeURIComponent(JSON.stringify(workInfo));
      return `
      <div class="list-item" data-work-info="${workInfoStr}" data-type="work" data-index="${index}">
        <div class="list-item-header">
          <h3 class="list-item-title">${Utils.escapeHtml(item.title)}</h3>
          <div class="list-item-meta">
            <span class="list-item-date">${Utils.escapeHtml(item.date)}</span>
          </div>
        </div>
        <p class="list-item-description">${Utils.escapeHtml(item.description || '')}</p>
        ${tags}
      </div>`;
    }
  }

  static generateListHTML(data: any, type: 'works' | 'articles'): string {
    perf.start(`生成${DataManager.TYPE_LABEL[type]}HTML`);
    if (!Utils.validateData(data, type)) {
      perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
      return `<div class="${type}-list"><p>没有找到相关${DataManager.TYPE_LABEL[type]}！ >-<</p></div>`;
    }
    const items = type === 'works' ? data.works : data.articles;
    const html = `<div class="${type}-list">${items.map((item: Item, idx: number) => UIRenderer.generateListItem(item, type.slice(0, -1) as 'article' | 'work', idx)).join('')}</div>`;
    perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
    return html;
  }
}

// ==================== 搜索控制器 ====================
export class SearchController {
  private page: 'works' | 'articles';
  public scrollRevealRefresh: (() => void) | undefined;
  private input: HTMLInputElement | null = null;
  private field: HTMLSelectElement | null = null;
  private sortSelect: HTMLSelectElement | null = null;
  private selectedTags: string[] = [];
  private sortOrder = 'date_desc';
  private debounceTimer: number | null = null;
  private popStateHandler: ((e: PopStateEvent) => void) | null = null;
  private skipNextPopState = false;
  private dataCache: any = null;

  private worker: Worker | null = null;
  private currentRequestId = 0;
  private timeoutId: number | null = null;
  private renderCancelToken = 0;

  private _inputHandler: (() => void) | null = null;
  private _fieldHandler: (() => void) | null = null;
  private _sortHandler: (() => void) | null = null;
  private initRetryTimer: number | null = null;
  private isDestroyed = false;

  // 初始化标志
  private _initialized = false;
  private _tagsInitialized = false;

  private static readonly BATCH_SIZE = 20;

  constructor(page: 'works' | 'articles', scrollRevealRefreshCallback?: () => void) {
    this.page = page;
    this.scrollRevealRefresh = scrollRevealRefreshCallback;
    this.init();
  }

  private init(retryCount = 0): void {
    if (this._initialized || this.isDestroyed) return;
    this._initialized = true;

    this.input = document.getElementById('search-input') as HTMLInputElement;
    this.field = document.getElementById('search-field') as HTMLSelectElement;
    this.sortSelect = document.getElementById('sort-order') as HTMLSelectElement;

    if (!this.input || !this.field) {
      if (retryCount < 3) {
        console.warn(`[SearchController] 搜索元素未找到，${retryCount + 1}秒后重试 (${retryCount + 1}/3)`);
        this.initRetryTimer = window.setTimeout(() => {
          this.init(retryCount + 1);
        }, 1000 * (retryCount + 1));
      } else {
        console.error(`[SearchController] 搜索元素在 ${this.page} 页面中未找到，放弃初始化`);
      }
      return;
    }

    if (this.sortSelect) {
      this._sortHandler = () => {
        this.sortOrder = this.sortSelect!.value;
        this.handleSearch();
        this.updateURL();
      };
      this.sortSelect.addEventListener('change', this._sortHandler);
    }

    this._inputHandler = Utils.debounce(() => this.handleSearch(), 300);
    this.input.addEventListener('input', this._inputHandler);

    this._fieldHandler = () => this.handleSearch();
    this.field.addEventListener('change', this._fieldHandler);

    this.updateTagFilters();
    this.restoreFromURL();
    this.handleSearch(true);

    this.popStateHandler = (e: PopStateEvent) => {
      if (this.skipNextPopState) { this.skipNextPopState = false; return; }
      this.restoreFromURL();
      this.handleSearch(true);
    };
    window.addEventListener('popstate', this.popStateHandler);

    console.log(`[SearchController] 初始化完成 (${this.page})`);
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this._initialized = false;
    this._tagsInitialized = false;

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.initRetryTimer) {
      clearTimeout(this.initRetryTimer);
      this.initRetryTimer = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.input && this._inputHandler) {
      this.input.removeEventListener('input', this._inputHandler);
      this._inputHandler = null;
    }
    if (this.field && this._fieldHandler) {
      this.field.removeEventListener('change', this._fieldHandler);
      this._fieldHandler = null;
    }
    if (this.sortSelect && this._sortHandler) {
      this.sortSelect.removeEventListener('change', this._sortHandler);
      this._sortHandler = null;
    }
    if (this.popStateHandler) {
      window.removeEventListener('popstate', this.popStateHandler);
      this.popStateHandler = null;
    }

    console.log(`[SearchController] 已销毁 (${this.page})`);
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker('/js/data/searchWorker.js', { type: 'module' });
    }
    return this.worker;
  }

  private renderItemsInBatches(items: Item[], container: HTMLElement, token: number): void {
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = `<p>没有找到相关${DataManager.TYPE_LABEL[this.page]}！ >-<</p>`;
      if (this.scrollRevealRefresh) this.scrollRevealRefresh();
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `${this.page}-list`; // "works-list" 或 "articles-list"
    container.appendChild(wrapper);

    const total = items.length;
    let index = 0;
    const type = this.page.slice(0, -1) as 'article' | 'work';

    const renderBatch = () => {
      if (this.isDestroyed || token !== this.renderCancelToken) return;

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
        requestAnimationFrame(renderBatch);
      } else {
        if (this.scrollRevealRefresh) this.scrollRevealRefresh();
      }
    };

    requestAnimationFrame(renderBatch);
  }

  private async handleSearch(skipUpdateURL = false): Promise<void> {
    if (this.isDestroyed) return;

    const data = await this.getCachedData(this.page);
    if (!data) return;

    const q = this.input ? this.input.value.trim() : '';
    const f = this.field ? this.field.value : 'all';
    const items = this.page === 'works' ? [...data.works] : [...data.articles];

    const requestId = ++this.currentRequestId;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.renderCancelToken++;

    const worker = this.getWorker();

    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        worker.removeEventListener('message', handler);
        this.timeoutId = null;
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        reject(new Error('Worker 搜索超时'));
      }, 5000);
      this.timeoutId = timeoutId;

      const handler = (e: MessageEvent) => {
        if (e.data.type === 'filterAndSortResult' && e.data.requestId === requestId) {
          if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
          }
          worker.removeEventListener('message', handler);

          const filteredItems = e.data.data;
          if (!skipUpdateURL) this.updateURL();

          const container = document.getElementById(`${this.page}-list-container`);
          if (container) {
            this.renderItemsInBatches(filteredItems, container, this.renderCancelToken);
          }
          resolve();
        }
      };
      worker.addEventListener('message', handler);

      worker.postMessage({
        type: 'filterAndSort',
        options: {
          items,
          query: q,
          field: f,
          selectedTags: this.selectedTags,
          sortOrder: this.sortOrder,
          requestId
        }
      });
    }).catch(err => {
      console.warn('[SearchController] 搜索请求失败:', err);
    });
  }

  private restoreFromURL(): void {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    const field = params.get('field') || 'all';
    const tagsParam = params.get('tags') || '';
    const sortOrder = params.get('sort') || 'date_desc';

    if (this.input) this.input.value = q;
    if (this.field) this.field.value = field;
    if (this.sortSelect) {
      this.sortSelect.value = sortOrder;
      this.sortOrder = sortOrder;
    }

    this.selectedTags = tagsParam ? tagsParam.split(',').filter(t => t.trim()) : [];
    this.applyTagsToButtons();
  }

  private updateURL(): void {
    const params = new URLSearchParams(window.location.search);
    const q = this.input ? this.input.value.trim() : '';
    const field = this.field ? this.field.value : 'all';
    const sort = this.sortSelect ? this.sortSelect.value : 'date_desc';

    if (q) params.set('q', q);
    else params.delete('q');

    if (field && field !== 'all') params.set('field', field);
    else params.delete('field');

    if (sort && sort !== 'date_desc') params.set('sort', sort);
    else params.delete('sort');

    if (this.selectedTags.length) params.set('tags', this.selectedTags.join(','));
    else params.delete('tags');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    const currentUrl = window.location.href.split('#')[0];
    if (newUrl !== currentUrl) {
      this.skipNextPopState = true;
      window.history.pushState({}, '', newUrl);
    }
  }

  private async getCachedData(type: 'works' | 'articles'): Promise<any> {
    if (this.dataCache) return this.dataCache;
    try {
      this.dataCache = await DataManager.fetchData(type, true);
      return this.dataCache;
    } catch (error) {
      console.warn(`[WARN] 从 DataManager 获取 ${type} 数据失败:`, error);
      return null;
    }
  }

  private async getTagsWithCount(): Promise<TagCount[]> {
    const data = await this.getCachedData(this.page);
    if (!data) return [];
    const items = this.page === 'works' ? data.works : data.articles;
    const tagCountMap = new Map<string, number>();

    items.forEach((item: Item) => {
      const tags = Utils.getTags(item);
      tags.forEach(tag => {
        tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCountMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }

  private applyTagsToButtons(): void {
    const container = document.getElementById(`${this.page}-tags-filter`);
    if (!container) return;
    const buttons = container.querySelectorAll('.tag-button:not(:last-child)');
    buttons.forEach(btn => {
      const tag = (btn as HTMLElement).dataset.tag;
      if (tag && this.selectedTags.includes(tag)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  private async updateTagFilters(): Promise<void> {
    if (this._tagsInitialized) return;
    this._tagsInitialized = true;

    const container = document.getElementById(`${this.page}-tags-filter`);
    if (!container) return;
    container.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'filter-label';
    label.textContent = '按标签筛选:';
    container.appendChild(label);

    const tagsWithCount = await this.getTagsWithCount();
    if (tagsWithCount.length === 0) {
      const msg = document.createElement('span');
      msg.textContent = '暂无标签';
      msg.style.color = '#888';
      container.appendChild(msg);
      return;
    }

    tagsWithCount.forEach(({ name, count }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-button';
      btn.textContent = `${name} (${count})`;
      btn.dataset.tag = name;
      btn.addEventListener('click', () => this.toggleTag(name, btn));
      container.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'tag-button';
    clearBtn.textContent = '清除筛选';
    clearBtn.style.marginLeft = 'auto';
    clearBtn.addEventListener('click', () => this.clearAllTags());
    container.appendChild(clearBtn);

    this.applyTagsToButtons();
  }

  private toggleTag(tag: string, btn: HTMLElement): void {
    const idx = this.selectedTags.indexOf(tag);
    if (idx > -1) {
      this.selectedTags.splice(idx, 1);
      btn.classList.remove('active');
    } else {
      this.selectedTags.push(tag);
      btn.classList.add('active');
    }
    this.handleSearch();
  }

  private clearAllTags(): void {
    this.selectedTags.length = 0;
    document.querySelectorAll(`#${this.page}-tags-filter .tag-button:not(:last-child)`).forEach(b => b.classList.remove('active'));
    this.handleSearch();
  }
}

// ==================== 页面初始化函数 ====================
export async function initSearchPage(
  page: 'works' | 'articles',
  scrollRevealRefreshCallback?: () => void
): Promise<SearchController> {
  const existing = (window as any)._currentSearchController;
  if (existing && !existing.isDestroyed && existing.page === page) {
    console.log(`[initSearchPage] 复用已有控制器 (${page})`);
    if (scrollRevealRefreshCallback) {
      existing.scrollRevealRefresh = scrollRevealRefreshCallback;
    }
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