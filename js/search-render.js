// ==================== /js/search-render.js ====================
// 文章/作品页面的数据管理、UI渲染和搜索控制（按需加载）

import { CONFIG, Utils, storageController, perf } from '/js/core.js';

// 导入 Worker（使用内联方式或单独文件）
let searchWorker = null;

function getSearchWorker() {
  if (!searchWorker) {
    searchWorker = new Worker('/js/searchWorker.js');
  }
  return searchWorker;
}

// ==================== 数据管理器 ====================
export class DataManager {
  static TYPE_LABEL = { works: '作品', articles: '文章' };
  static config = {
    works: { url: CONFIG.API.WORKS, cacheKey: CONFIG.STORAGE_KEYS.WORKS_DATA, cacheControl: 'no-cache' },
    articles: { url: CONFIG.API.ARTICLES, cacheKey: CONFIG.STORAGE_KEYS.ARTICLES_DATA, cacheControl: 'default' }
  };
  
  static async fetchData(type, useCache = true) {
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
      const opts = { headers: { 'Cache-Control': cacheControl } };
      if (cacheControl === 'no-cache') opts.cache = 'no-store';
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (!Utils.validateData(data, type)) throw new Error('数据格式无效');
      
      if (type === 'articles' && data.articles) {
        data.articles = data.articles.map(article => ({
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
  static generateTagsHTML(item) {
    const tags = Utils.getTags(item);
    if (!tags || !tags.length) return '';
    return `<div class="tags">${tags.map(t => `<span class="tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>`;
  }
  
  static generateListItem(item, type, index) {
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

  static generateListHTML(data, type) {
    perf.start(`生成${DataManager.TYPE_LABEL[type]}HTML`);
    if (!Utils.validateData(data, type)) {
      perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
      return `<div class="${type}-list"><p>没有找到相关${DataManager.TYPE_LABEL[type]}！ >-<</p></div>`;
    }
    const items = type === 'works' ? data.works : data.articles;
    const html = `<div class="${type}-list">${items.map((item, idx) => UIRenderer.generateListItem(item, type.slice(0, -1), idx)).join('')}</div>`;
    perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
    return html;
  }
  
  static generatePersonalCardHTML() {
    return `
    <div class="profile-card">
      <div class="profile-avatar">
        <img src="/assets/avatar.webp" alt="高新炀的头像" class="avatar-img" onerror="this.src='https://via.placeholder.com/140?text=GXY'">
        <h2 class="profile-name">高新炀</h2>
        <div class="profile-bio">一个15岁爱探索的小孩子~
        </div>
      </div>
      <div class="profile-details">
        <div class="detail-item">
          <i class="fas fa-quote-left"></i>
          <span>「 Where there's a will, there's a way 」</span>
        </div>
        <div class="detail-item">
          <i class="fas fa-envelope"></i>
          <a href="mailto:gao-xinyang@foxmail.com">gao-xinyang@foxmail.com</a>
        </div>
        <div class="detail-item">
          <i class="fas fa-globe"></i>
          <span>中国 · 河南</span>
        </div>
        <div class="detail-item">
          <i class="fas fa-code"></i>
          <span>Java / Python</span>
        </div>
        <div class="social-links-side">
          <a href="https://github.com/Xinyang-Gao" target="_blank" class="social-icon-link" aria-label="GitHub" rel="noopener noreferrer">
            <i class="fab fa-github"></i>
          </a>
          <a href="https://space.bilibili.com/1064600697" target="_blank" class="social-icon-link" aria-label="Bilibili" rel="noopener noreferrer">
            <i class="fab fa-bilibili"></i>
          </a>
          <a href="mailto:gao_xinyang@foxmail.com" class="social-icon-link" aria-label="邮箱">  
            <i class="fas fa-envelope"></i>
          </a>
          <a href="https://wpa.qq.com/msgrd?v=3&uin=2489083744&site=qq&menu=yes" target="_blank" class="social-icon-link" aria-label="QQ" rel="noopener noreferrer">
            <i class="fab fa-qq"></i>
          </a>
          <a href="/rss.xml" target="_blank" class="social-icon-link" aria-label="RSS" rel="noopener noreferrer">
            <i class="fas fa-rss"></i>
          </a>
        </div>
        <div class="detail-item" style="justify-content: center; margin-top: 12px;">
          <span class="tag" style="background: var(--accent-color); color: white;">Python</span>
          <span class="tag" style="background: var(--accent-color); color: white;">Html</span>
          <span class="tag" style="background: var(--accent-color); color: white;">Scratch</span>
          <span class="tag" style="background: var(--accent-color); color: white;">绘画</span>
          <span class="tag" style="background: var(--accent-color); color: white;">轮滑</span>
          <span class="tag" style="background: var(--accent-color); color: white;">Minecraft</span>
        </div>
      </div>
    </div>
    `;
  }
}

// ==================== 搜索控制器 ====================
export class SearchController {
  constructor(page, scrollRevealRefreshCallback) {
    this.page = page;
    this.scrollRevealRefresh = scrollRevealRefreshCallback;
    this.input = null;
    this.field = null;
    this.selectedTags = [];
    this.sortOrder = 'date_desc';
    this.debounceTimer = null;
    this.popStateHandler = null;
    this.skipNextPopState = false;
    this.dataCache = null;
    this.requestIdCounter = 0;
    this.pendingRequests = new Map();
    this.init();
  }
  
  init() {
    requestAnimationFrame(() => {
      this.input = document.getElementById('search-input');
      this.field = document.getElementById('search-field');
      this.sortSelect = document.getElementById('sort-order');
      
      if (this.sortSelect) {
        this.sortSelect.addEventListener('change', () => {
          this.sortOrder = this.sortSelect.value;
          this.handleSearch();
          this.updateURL();
        });
      }
      
      if (!this.input || !this.field) {
        console.error(`[ERROR] 搜索元素未在 ${this.page} 页面中找到`);
        return;
      }
      
      this._inputHandler = Utils.debounce(() => this.handleSearch(), 300);
      this.input.addEventListener('input', this._inputHandler);
      this._fieldHandler = () => this.handleSearch();
      this.field.addEventListener('change', this._fieldHandler);
      
      this.updateTagFilters();
      this.restoreFromURL();
      this.handleSearch(true);
      
      this.popStateHandler = (e) => {
        if (this.skipNextPopState) { this.skipNextPopState = false; return; }
        this.restoreFromURL();
        this.handleSearch(true);
      };
      window.addEventListener('popstate', this.popStateHandler);
    });
  }
  
  destroy() {
    if (this.input && this._inputHandler) this.input.removeEventListener('input', this._inputHandler);
    if (this.field && this._fieldHandler) this.field.removeEventListener('change', this._fieldHandler);
    if (this.sortSelect && this._sortHandler) this.sortSelect.removeEventListener('change', this._sortHandler);
    if (this.popStateHandler) window.removeEventListener('popstate', this.popStateHandler);
    clearTimeout(this.debounceTimer);
    // 清理待处理的请求
    this.pendingRequests.forEach((_, id) => {
      // Worker 请求无法取消，但可以忽略结果
    });
  }
  
  restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    const field = params.get('field') || 'all';
    const tagsParam = params.get('tags') || '';
    const sortOrder = params.get('sort') || 'updated_desc';
    
    if (this.input) this.input.value = q;
    if (this.field) this.field.value = field;
    if (this.sortSelect) {
      this.sortSelect.value = sortOrder;
      this.sortOrder = sortOrder;
    }
    
    this.selectedTags = tagsParam ? tagsParam.split(',').filter(t => t.trim()) : [];
    this.applyTagsToButtons();
  }
  
  updateURL() {
    const params = new URLSearchParams(window.location.search);
    const q = this.input ? this.input.value.trim() : '';
    const field = this.field ? this.field.value : 'all';
    const sort = this.sortSelect ? this.sortSelect.value : 'updated_desc';
    
    if (q) params.set('q', q);
    else params.delete('q');
    
    if (field && field !== 'all') params.set('field', field);
    else params.delete('field');
    
    if (sort && sort !== 'updated_desc') params.set('sort', sort);
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
  
  async getCachedData(type) {
    if (this.dataCache) return this.dataCache;
    try {
      this.dataCache = await DataManager.fetchData(type, true);
      return this.dataCache;
    } catch (error) {
      console.warn(`[WARN] 从 DataManager 获取 ${type} 数据失败:`, error);
      return null;
    }
  }
  
  async getAllTags() {
    const data = await this.getCachedData(this.page);
    if (!data) return new Set();
    const items = this.page === 'works' ? data.works : data.articles;
    
    return new Promise((resolve) => {
      const requestId = ++this.requestIdCounter;
      const worker = getSearchWorker();
      
      const handler = (e) => {
        if (e.data.type === 'extractTagsResult' && e.data.requestId === requestId) {
          worker.removeEventListener('message', handler);
          resolve(new Set(e.data.data));
        }
      };
      worker.addEventListener('message', handler);
      
      worker.postMessage({
        type: 'extractTags',
        data: { items },
        options: { requestId }
      });
    });
  }
  
  applyTagsToButtons() {
    const container = document.getElementById(`${this.page}-tags-filter`);
    if (!container) return;
    const buttons = container.querySelectorAll('.tag-button:not(:last-child)');
    buttons.forEach(btn => {
      const tag = btn.dataset.tag;
      if (this.selectedTags.includes(tag)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  
  async updateTagFilters() {
    if (!['works', 'articles'].includes(this.page)) return;
    const container = document.getElementById(`${this.page}-tags-filter`);
    if (!container) return;
    container.innerHTML = '';
    
    const label = document.createElement('span');
    label.className = 'filter-label';
    label.textContent = '按标签筛选:';
    container.appendChild(label);
    
    const allTagsSet = await this.getAllTags();
    if (allTagsSet.size === 0) {
      const msg = document.createElement('span');
      msg.textContent = '暂无标签';
      msg.style.color = '#888';
      container.appendChild(msg);
      return;
    }
    
    const sortedTags = Array.from(allTagsSet).sort();
    sortedTags.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-button';
      btn.textContent = tag;
      btn.dataset.tag = tag;
      btn.addEventListener('click', () => this.toggleTag(tag, btn));
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
  
  toggleTag(tag, btn) {
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
  
  clearAllTags() {
    this.selectedTags.length = 0;
    document.querySelectorAll(`#${this.page}-tags-filter .tag-button:not(:last-child)`).forEach(b => b.classList.remove('active'));
    this.handleSearch();
  }
  
  async handleSearch(skipUpdateURL = false) {
    const data = await this.getCachedData(this.page);
    if (!data) return;
    
    const q = this.input ? this.input.value.trim() : '';
    const f = this.field ? this.field.value : 'all';
    const items = this.page === 'works' ? [...data.works] : [...data.articles];
    
    const requestId = ++this.requestIdCounter;
    const worker = getSearchWorker();
    
    return new Promise((resolve) => {
      const handler = (e) => {
        if (e.data.type === 'filterAndSortResult' && e.data.requestId === requestId) {
          worker.removeEventListener('message', handler);
          const filteredItems = e.data.data;
          const html = UIRenderer.generateListHTML({ [this.page]: filteredItems }, this.page);
          const container = document.getElementById(`${this.page}-list-container`);
          if (container) {
            container.innerHTML = html;
            if (this.scrollRevealRefresh) this.scrollRevealRefresh();
          }
          if (!skipUpdateURL) this.updateURL();
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
    });
  }
}

// 页面初始化函数
export async function initSearchPage(page, scrollRevealRefreshCallback) {
  // 销毁旧的 SearchController 实例
  if (window._currentSearchController) {
    window._currentSearchController.destroy();
    window._currentSearchController = null;
  }
  
  // 预加载数据
  await DataManager.fetchData(page, true);
  
  // 创建新的 SearchController
  window._currentSearchController = new SearchController(page, scrollRevealRefreshCallback);
  return window._currentSearchController;
}