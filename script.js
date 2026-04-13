class PerformanceMonitor {
    constructor() {
        this.timers = new Map();
        this.metrics = [];
    }

    start(label) {
        if (this.timers.has(label)) {
            console.warn(`Timer "${label}" already running`);
            return;
        }
        this.timers.set(label, performance.now());
    }

    end(label) {
        if (!this.timers.has(label)) {
            console.warn(`Timer "${label}" not found`);
            return;
        }
        const startTime = this.timers.get(label);
        const duration = performance.now() - startTime;        
        if (duration > 100) {
            console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms (慢)`);
        }
        this.metrics.push({ label, duration, timestamp: Date.now() });
        this.timers.delete(label);
        return duration;
    }

    getMetrics() {
        return this.metrics.slice(-50);
    }

    clearMetrics() {
        this.metrics = [];
    }
}

const perf = new PerformanceMonitor();

/**
 * 通用工具类
 */
class Utils {
    static getUrlParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    static isDataExpired(raw, minutes = 5) {
        if (!raw) return true;
        try {
            const { _timestamp = null } = JSON.parse(raw);
            return !_timestamp || _timestamp < Date.now() - minutes * 60e3;
        } catch {
            console.error('解析缓存数据失败');
            return true;
        }
    }

    static validateData(data, type) {
        if (!data) return false;
        if (type === 'works') {
            return Array.isArray(data.works) && data.works.length > 0;
        } else if (type === 'articles') {
            return Array.isArray(data.articles) && data.articles.length > 0;
        }
        return false;
    }
    
    static getTags(item) {
        if (item.tags && Array.isArray(item.tags)) {
            return item.tags;
        }
        if (item.tag && Array.isArray(item.tag)) {
            return item.tag;
        }
        return [];
    }
    
    static escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
    
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

/**
 * 数据管理器
 */
class DataManager {
    static TYPE_LABEL = { works: '作品', articles: '文章' };

    static config = {
        works: { url: 'works.json', cacheKey: 'worksData', cacheControl: 'no-cache' },
        articles: { url: 'articles.json', cacheKey: 'articlesData', cacheControl: 'default' }
    };

    static async fetchData(type, useCache = true) {
        const { url, cacheKey, cacheControl } = DataManager.config[type];
        const label = DataManager.TYPE_LABEL[type];
        perf.start(`获取${label}数据`);

        if (useCache) {
            const raw = localStorage.getItem(cacheKey);
            if (raw && !Utils.isDataExpired(raw)) {
                try {
                    const parsed = JSON.parse(raw);
                    delete parsed._timestamp;
                    if (Utils.validateData(parsed, type)) {
                        perf.end(`获取${label}数据`);
                        return parsed;
                    }
                } catch {
                    console.warn('缓存数据无效');
                }
            }
        }

        try {
            console.log(`📥 从服务器获取${label}数据`);
            const opts = { headers: { 'Cache-Control': cacheControl } };
            if (cacheControl === 'no-cache') opts.cache = 'no-store';

            const res = await fetch(url, opts);
            if (!res.ok) throw new Error(res.statusText);

            const data = await res.json();
            if (!Utils.validateData(data, type)) throw new Error('数据格式无效');

            localStorage.setItem(cacheKey, JSON.stringify({ ...data, _timestamp: Date.now() }));
            perf.end(`获取${label}数据`);
            return data;
        } catch (e) {
            console.error(`获取${label}数据失败:`, e);
            perf.end(`获取${label}数据`);
            throw e;
        }
    }
}

/**
 * 问候语
 */
function updateDynamicGreeting() {
    const greetingEl = document.getElementById('dynamic-greeting');
    if (!greetingEl) return;
    
    const h = new Date().getHours();
    let msg = '';
    
    if (h < 5) msg = '深夜灵感迸发，也要记得休息～';
    else if (h < 8) msg = '晨光熹微，今天也要闪闪发光！';
    else if (h < 11) msg = '早上好！元气满满的一天开始啦';
    else if (h < 14) msg = '中午好，记得补充能量~';
    else if (h < 18) msg = '午后时光，适合创造';
    else if (h < 21) msg = '傍晚好，享受此刻宁静';
    else msg = '星河在上，愿你今夜好梦';
    
    greetingEl.textContent = msg;
    greetingEl.style.fontWeight = 'bold';
}

window.updateDynamicGreeting = updateDynamicGreeting;

/**
 * UI 渲染器
 */
class UIRenderer {
    static generateTagsHTML(item) {
        const tags = Utils.getTags(item);
        if (!tags || !tags.length) return '';
        return `<div class="tags">${tags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}</div>`;
    }
    
    static escapeHtml(str) {
        return Utils.escapeHtml(str);
    }

    static generateListItem(item, type, index) {
        const tags = UIRenderer.generateTagsHTML(item);
        
        if (type === 'article') {
            const itemUrl = item.url || '';
            return `
            <div class="list-item" data-url="${this.escapeHtml(itemUrl)}" data-type="article" data-index="${index}">
                <div class="list-item-header">
                    <h3 class="list-item-title">${this.escapeHtml(item.title)}</h3>
                    <div class="list-item-meta">
                        <span class="list-item-date">${this.escapeHtml(item.date)}</span>
                    </div>
                </div>
                <div class="article-meta-info">
                    <span class="article-author">${this.escapeHtml(item.author || '未知作者')}</span>
                    ${item.word_count ? `<span class="article-word-count">${item.word_count} 字</span>` : ''}
                    ${item.read_time ? `<span class="article-read-time"><i class="far fa-clock"></i> ${this.escapeHtml(item.read_time)}</span>` : ''}
                </div>
                <p class="list-item-description">${this.escapeHtml(item.description || '')}</p>
                ${tags}
            </div>`;
        } else { // work 类型
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
                    <h3 class="list-item-title">${this.escapeHtml(item.title)}</h3>
                    <div class="list-item-meta">
                        <span class="list-item-date">${this.escapeHtml(item.date)}</span>
                    </div>
                </div>
                <p class="list-item-description">${this.escapeHtml(item.description || '')}</p>
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
            <img src="/avatar.jpg" alt="高新炀的头像" class="avatar-img" onerror="this.src='https://via.placeholder.com/140?text=GXY'">
            <h2 class="profile-name">高新炀</h2>
            <div class="profile-bio">
              <i class="fas fa-map-marker-alt" style="margin-right: 6px;"></i> 初中生 · 开发者 · 写作者
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
              <span class="tag" style="background: var(--accent-color); color: white;">保持好奇</span>
            </div>
          </div>
        </div>`;
    }

    static async fetchPageContent(url) {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 404) throw new Error('404');
            throw new Error(`HTTP错误! 状态码: ${res.status}`);
        }
        return res.text();
    }

    static replaceContainerContent(base, selector, html) {
        const doc = new DOMParser().parseFromString(base, 'text/html');
        const container = doc.querySelector(selector);
        if (container) {
            container.innerHTML = html;
            // 优先返回 fetched 页面主内容（避免返回整个 document，导致 container 嵌套）
            const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main') || container;
            return fetchedMain ? fetchedMain.innerHTML : container.innerHTML;
        }
        console.warn(`警告: ${selector} 未找到，尝试返回主内容或追加内容`);
        const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
        if (fetchedMain) return fetchedMain.innerHTML;
        return base + html;
    }
}

/**
 * 滚动视口渐入动画管理器
 */
class ScrollReveal {
    constructor() {
        this.observer = null;
        this.initObserver();
    }

    initObserver() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        this.observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2, rootMargin: '0px 0px -20px 0px' }
        );
        this.observeItems();
    }

    observeItems() {
        const items = document.querySelectorAll('.list-item');
        items.forEach(item => {
            if (!item.classList.contains('revealed')) {
                this.observer.observe(item);
            }
        });
    }

    refresh() {
        this.initObserver();
    }
}

let scrollRevealInstance = null;

function initScrollReveal() {
    if (!scrollRevealInstance) {
        scrollRevealInstance = new ScrollReveal();
    } else {
        scrollRevealInstance.refresh();
    }
}

/**
 * 渲染页面中的数学公式（KaTeX）与 Mermaid 流程图
 * rootElement: 渲染范围，默认整个 document.body
 */
function renderMathAndMermaid(rootElement = document.body) {
    try {
        // KaTeX 自动渲染（如果 auto-render 已加载）
        if (typeof renderMathInElement === 'function') {
            try {
                renderMathInElement(rootElement, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                    throwOnError: false
                });
            } catch (e) {
                console.warn('KaTeX 渲染失败', e);
            }
        }

        // Mermaid 渲染（如果 mermaid 已加载）
        if (window.mermaid && typeof window.mermaid.init === 'function') {
            try {
                window.mermaid.initialize({ startOnLoad: false });
                const mermaids = (rootElement.querySelectorAll ? rootElement.querySelectorAll('.mermaid') : []);
                mermaids.forEach(el => {
                    try {
                        window.mermaid.init(undefined, el);
                    } catch (err) {
                        console.warn('Mermaid 渲染单个图失败', err);
                    }
                });
            } catch (e) {
                console.warn('Mermaid 初始化失败', e);
            }
        }
    } catch (e) {
        console.warn('renderMathAndMermaid 异常', e);
    }
}

/**
 * 搜索控制器（支持 URL 参数同步）
 */
class SearchController {
    static instances = new Map();

    constructor(page) {
        if (SearchController.instances.has(page)) {
            SearchController.instances.get(page).destroy();
        }
        this.page = page;
        this.input = null;
        this.field = null;
        this.selectedTags = [];
        this.debounceTimer = null;
        this.popStateHandler = null;
        this.skipNextPopState = false;

        SearchController.instances.set(page, this);
        this.init();
    }

    init() {
        requestAnimationFrame(() => {
            this.input = document.getElementById('search-input');
            this.field = document.getElementById('search-field');

            if (!this.input || !this.field) {
                console.error(`搜索元素未在 ${this.page} 页面中找到`);
                return;
            }

            // 绑定 UI 事件（保存引用以便 later removeEventListener）
            this._inputHandler = Utils.debounce(() => this.handleSearch(), 300);
            this.input.addEventListener('input', this._inputHandler);
            this._fieldHandler = () => this.handleSearch();
            this.field.addEventListener('change', this._fieldHandler);

            this.updateTagFilters();
            // 从 URL 恢复筛选条件
            this.restoreFromURL();
            // 执行初始筛选
            this.handleSearch(true); // skipUpdateURL = true 避免重复 pushState
            // 监听 popstate 事件
            this.popStateHandler = (e) => {
                if (this.skipNextPopState) {
                    this.skipNextPopState = false;
                    return;
                }
                this.restoreFromURL();
                this.handleSearch(true);
            };
            window.addEventListener('popstate', this.popStateHandler);
        });
    }

    // 从 URL 参数恢复 UI 状态
    restoreFromURL() {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q') || '';
        const field = params.get('field') || 'all';
        const tagsParam = params.get('tags') || '';
        
        if (this.input) this.input.value = q;
        if (this.field) this.field.value = field;
        
        this.selectedTags = tagsParam ? tagsParam.split(',').filter(t => t.trim()) : [];
        
        // 激活对应的标签按钮（等待标签按钮渲染）
        this.applyTagsToButtons();
    }
    
    applyTagsToButtons() {
        const container = document.getElementById(`${this.page}-tags-filter`);
        if (!container) return;
        const btns = container.querySelectorAll('.tag-button:not(:last-child)');
        btns.forEach(btn => {
            const tag = btn.dataset.tag;
            if (this.selectedTags.includes(tag)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    // 更新 URL 参数（pushState）
    updateURL() {
        const params = new URLSearchParams(window.location.search);
        const q = this.input ? this.input.value.trim() : '';
        const field = this.field ? this.field.value : 'all';
        
        if (q) params.set('q', q);
        else params.delete('q');
        
        if (field && field !== 'all') params.set('field', field);
        else params.delete('field');
        
        if (this.selectedTags.length) {
            params.set('tags', this.selectedTags.join(','));
        } else {
            params.delete('tags');
        }
        
        // 保留 page 参数（如果存在）
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        const currentUrl = window.location.href.split('#')[0];
        if (newUrl !== currentUrl) {
            this.skipNextPopState = true;
            window.history.pushState({}, '', newUrl);
        }
    }

    handleSearch(skipUpdateURL = false) {
        const q = this.input.value.trim();
        const f = this.field.value;
        this.filterContent(this.page, q, f);
        if (!skipUpdateURL) {
            this.updateURL();
        }
    }

    getCachedData(type) {
        const raw = localStorage.getItem(`${type}Data`);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            return Utils.validateData(data, type) ? data : null;
        } catch {
            return null;
        }
    }

    getAllTags() {
        const data = this.getCachedData(this.page);
        const tags = new Set();
        if (!data) return tags;
        const items = this.page === 'works' ? data.works : data.articles;
        items.forEach(item => {
            const itemTags = Utils.getTags(item);
            if (itemTags && Array.isArray(itemTags)) {
                itemTags.forEach(t => tags.add(t));
            }
        });
        return tags;
    }

    updateTagFilters() {
        if (!['works', 'articles'].includes(this.page)) return;
        const container = document.getElementById(`${this.page}-tags-filter`);
        if (!container) return;

        container.innerHTML = '';
        const label = document.createElement('span');
        label.className = 'filter-label';
        label.textContent = '按标签筛选:';
        container.appendChild(label);

        const allTags = this.getAllTags();
        if (allTags.size === 0) {
            const msg = document.createElement('span');
            msg.textContent = '暂无标签';
            msg.style.color = '#888';
            container.appendChild(msg);
            return;
        }

        const sortedTags = Array.from(allTags).sort();
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
        
        // 恢复激活状态
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
        this.handleSearch(); // 会触发 updateURL
    }

    clearAllTags() {
        this.selectedTags.length = 0;
        document.querySelectorAll(`#${this.page}-tags-filter .tag-button:not(:last-child)`).forEach(b => b.classList.remove('active'));
        this.handleSearch();
    }

    filterContent(type, query, field) {
        const data = this.getCachedData(type);
        if (!data) return;

        let items = type === 'works' ? [...data.works] : [...data.articles];

        if (this.selectedTags.length) {
            items = items.filter(item => {
                const itemTags = Utils.getTags(item);
                return itemTags && Array.isArray(itemTags) &&
                    itemTags.some(t => this.selectedTags.includes(t));
            });
        }

        if (query && query.trim() !== '') {
            const ql = query.toLowerCase().trim();
            items = items.filter(item => {
                switch (field) {
                    case 'title':
                        return item.title.toLowerCase().includes(ql);
                    case 'tag':
                        const itemTags = Utils.getTags(item);
                        return itemTags && Array.isArray(itemTags) && 
                            itemTags.some(t => t.toLowerCase().includes(ql));
                    case 'date':
                        return item.date.includes(query);
                    default:
                        return item.title.toLowerCase().includes(ql) ||
                            (Utils.getTags(item).some(t => t.toLowerCase().includes(ql))) ||
                            item.date.includes(query);
                }
            });
        }

        const html = UIRenderer.generateListHTML({ [type]: items }, type);
        const container = document.getElementById(`${type}-list-container`);
        if (container) {
            container.innerHTML = html;
            this.setupItemsInteraction();
            if (typeof initScrollReveal === 'function') initScrollReveal();
        }
    }

    setupItemsInteraction() {
        const content = document.getElementById('mainContent') || document.querySelector('main.main-content-area') || document.querySelector('.container') || document.getElementById(`${this.page}-list-container`);
        if (content) {
            content.removeEventListener('click', PageManager.handleListItemClick);
            content.addEventListener('click', PageManager.handleListItemClick);
            return;
        }
        // 兜底：如果未找到主容器，绑定到 document，以确保列表项点击能被捕获
        document.removeEventListener('click', PageManager.handleListItemClick);
        document.addEventListener('click', PageManager.handleListItemClick);
    }

    destroy() {
        if (this.input && this._inputHandler) this.input.removeEventListener('input', this._inputHandler);
        if (this.field && this._fieldHandler) this.field.removeEventListener('change', this._fieldHandler);
        if (this.popStateHandler) {
            window.removeEventListener('popstate', this.popStateHandler);
        }
        clearTimeout(this.debounceTimer);
        SearchController.instances.delete(this.page);
    }
}

/**
 * 页面管理器
 */
class PageManager {
    static pageConfig = {
        about: { title: '关于', type: 'normal' },
        articles: { title: '文章', type: 'list' },
        contact: { title: '联系', type: 'normal' },
        works: { title: '作品', type: 'list' }
    };

    static async loadPage(page, pushState = true) {
        perf.start(`加载页面: ${page}`);
        const cfg = PageManager.pageConfig[page] || { title: "GXY's website", type: 'normal' };
        try {
            let content;
            let title = `${cfg.title} - 高新炀的个人网站`;
            if (cfg.type === 'list') {
                const base = await UIRenderer.fetchPageContent(`pages/${page}.html`);
                const data = await DataManager.fetchData(page);
                content = UIRenderer.replaceContainerContent(base, `#${page}-list-container`, UIRenderer.generateListHTML(data, page));
            } else if (page === '404') {
                content = '<h2>页面未找到</h2><p>抱歉，您访问的页面不存在。</p>';
                title = '404 - 页面未找到';
            } else {
                content = await UIRenderer.fetchPageContent(`pages/${page}.html`);
            }
            await PageManager.performDrawAnimation(content, page, title, pushState);
        } catch (e) {
            console.error('页面加载失败:', e);
            const errorContent = '<h2>加载失败</h2><p>哎呀！加载页面时出了点问题……要不刷新试试？</p>';
            await PageManager.performDrawAnimation(errorContent, 'error', '加载失败 - GXY\'s website', pushState);
        } finally {
            perf.end(`加载页面: ${page}`);
        }
    }

    static async performDrawAnimation(content, page, pageTitle, pushState) {
        const elements = {
            navItems: document.querySelectorAll('.nav-item'),
            content: document.getElementById('mainContent'),
            pageTransition: document.getElementById('pageTransition'),
            container: document.querySelector('.container')
        };
        if (!elements.container) return;
        elements.pageTransition.classList.add('active');
        let paper = document.querySelector('.draw-animation-paper');
        if (!paper) {
            paper = document.createElement('div');
            // 不给动画纸张增加 container 类，避免与内容中的 .container 嵌套
            paper.className = 'draw-animation-paper';
            document.body.appendChild(paper);
        }
        const rect = elements.container.getBoundingClientRect();
        const cs = window.getComputedStyle(elements.container);
        const pad = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(cs[`padding${k}`]));
        paper.style.cssText = `position: fixed; top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: ${rect.height}px; padding: ${pad.join(' ')}; border: var(--border-width) solid var(--border-color); box-shadow: var(--shadow-main), var(--shadow-offset), -var(--shadow-offset); border-radius: var(--border-radius-container); background: white; box-sizing: border-box; z-index: var(--z-index-animation-paper); opacity: 0; transform: translateY(100%) scale(0.95);`;
        
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
             paper.style.background = '#222';
        }

        paper.innerHTML = content;
        elements.content.classList.add('fade-out-shrink');
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                paper.style.transform = 'translate(0, 0) scale(1)';
                paper.style.opacity = '1';
                paper.addEventListener('animationend', function handler() {
                    elements.content.innerHTML = content;
                    elements.content.classList.remove('fade-out-shrink');
                    document.title = pageTitle;
                    if (pushState) {
                        const searchParams = new URLSearchParams(window.location.search);
                        searchParams.delete('q');
                        searchParams.delete('field');
                        searchParams.delete('tags');
                        const queryString = searchParams.toString();
                        const newUrl = queryString ? `?page=${page}&${queryString}` : `?page=${page}`;
                        window.history.pushState({ page }, pageTitle, newUrl);
                    }
                    elements.navItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-page') === page));
                    paper.parentNode?.removeChild(paper);
                    elements.pageTransition.classList.remove('active');
                    PageManager.initializePageFeatures(page);
                    this.removeEventListener('animationend', handler);
                    resolve();
                }, { once: true });
            });
        });
    }

    static initializePageFeatures(page) {
        if (['works', 'articles'].includes(page)) new SearchController(page);
        if (page === 'index') updateDynamicGreeting();
        PageManager.setupListItemsInteraction();
        if (typeof initScrollReveal === 'function') initScrollReveal();
        // 渲染页面中的数学公式与 Mermaid 流程图（如果存在）
        if (typeof renderMathAndMermaid === 'function') {
            try {
                const container = document.getElementById('mainContent') || document.querySelector('main') || document.body;
                renderMathAndMermaid(container);
            } catch (e) {
                console.warn('renderMathAndMermaid 执行失败', e);
            }
        }
    }

    static setupListItemsInteraction() {
        const content = document.getElementById('mainContent') || document.querySelector('main.main-content-area') || document.querySelector('.container') || document.getElementById('articles-list-container') || document.getElementById('works-list-container');
        if (content) {
            content.removeEventListener('click', PageManager.handleListItemClick);
            content.addEventListener('click', PageManager.handleListItemClick);
            return;
        }
        // 兜底绑定到 document，确保在无特定容器时仍能响应列表项点击
        document.removeEventListener('click', PageManager.handleListItemClick);
        document.addEventListener('click', PageManager.handleListItemClick);
    }

    static handleListItemClick(e) {
        const item = e.target.closest('.list-item, .recent-item');
        if (!item) return;
        const type = item.dataset.type;
        if (type === 'work') {
            const workInfoRaw = item.dataset.workInfo;
            if (workInfoRaw) {
                try {
                    const workInfo = JSON.parse(decodeURIComponent(workInfoRaw));
                    PageManager.showWorkDetails(workInfo);
                } catch(e) {
                    console.error('解析作品信息失败', e);
                }
            } else {
                console.warn('未找到作品信息，无法展示详情');
            }
        } else if (type === 'article') {
            const itemUrl = item.dataset.url;
            if (itemUrl) {
                window.open(itemUrl, '_blank');
            } else {
                console.warn('文章链接无效');
            }
        }
    }

    static showWorkDetails(work) {
        if (this.currentModalClose) {
            this.currentModalClose();
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);

        const envelope = document.createElement('div');
        envelope.className = 'work-details-envelope';
        
        const tags = work.tags || [];
        const tagsHtml = tags.length ? 
            `<div class="work-details-tag"><strong>标签:</strong>${tags.map(t => `<span class="tag">${UIRenderer.escapeHtml(t)}</span>`).join('')}</div>` : '';
        
        envelope.innerHTML = `
            <div class="work-details-close">✕</div>
            <div class="work-details-content">
                <h2 class="work-details-title">${UIRenderer.escapeHtml(work.title)}</h2>
                <p class="work-details-description">${UIRenderer.escapeHtml(work.description || '')}</p>
                ${tagsHtml}
                ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
            </div>
        `;
        document.body.appendChild(envelope);

        const closeModal = () => {
            if (envelope.classList.contains('closing')) return;
            envelope.classList.add('closing');
            overlay.classList.remove('active');
            setTimeout(() => {
                envelope.remove();
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
                if (this.currentModalClose === closeModal) {
                    this.currentModalClose = null;
                }
            }, 400);
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        };
        document.addEventListener('keydown', escHandler);
        overlay.addEventListener('click', closeModal);
        const closeBtn = envelope.querySelector('.work-details-close');
        closeBtn.addEventListener('click', closeModal);

        this.currentModalClose = closeModal;

        requestAnimationFrame(() => {
            envelope.classList.add('active');
            overlay.classList.add('active');
        });
    }
}

/**
 * 导航管理器
 */
class NavigationManager {
    static initMobileMenuToggle() {
    // 避免重复绑定全局委托
    if (this._mobileToggleBound) return;
    this._mobileToggleBound = true;
    
    // 使用事件委托处理菜单开关
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.mobile-toggle');
        const nav = document.getElementById('navbarNav');
        if (!nav) return;
        
        // 点击汉堡菜单按钮
        if (toggle) {
            e.preventDefault();
            nav.classList.toggle('active');
            toggle.classList.toggle('active');
            return;
        }
        
        // 点击菜单项时关闭菜单
        const isNavItem = e.target.closest('.nav-item');
        if (isNavItem && nav.classList.contains('active')) {
            nav.classList.remove('active');
            const toggleBtn = document.querySelector('.mobile-toggle');
            if (toggleBtn) toggleBtn.classList.remove('active');
        }
    });
}

    static bindNavLinks() {
        const navItems = document.querySelectorAll('.nav-item[data-page]');
        if (!navItems || navItems.length === 0) return;
        navItems.forEach(item => {
            try {
                if (item._navHandler) item.removeEventListener('click', item._navHandler);
            } catch (e) {}
            const handler = (e) => {
                // 在文章详情页或 404 页面不拦截导航，交由浏览器直接跳转并完整加载页面
                if (isArticleDetailOr404Page()) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const page = item.dataset.page;
                if (window.PageManager && typeof PageManager.loadPage === 'function') {
                    PageManager.loadPage(page, true);
                } else {
                    const href = item.getAttribute('href') || `/${page}.html`;
                    if (typeof fetchAndReplaceContent === 'function') fetchAndReplaceContent(href, true);
                }
            };
            item.addEventListener('click', handler);
            item._navHandler = handler;
        });
    }
    static initPopstate() {
        if (this._popstateInitialized) return;
        this._popstateInitialized = true;
        window.addEventListener('popstate', e => {
            const statePage = e.state?.page;
            const urlParams = new URLSearchParams(window.location.search);
            const pageFromQuery = urlParams.get('page');
            const p = statePage || pageFromQuery || getPageNameFromPath(window.location.pathname) || 'index';
            if (window.PageManager && typeof PageManager.loadPage === 'function') {
                PageManager.loadPage(p, false);
            } else if (typeof fetchAndReplaceContent === 'function') {
                fetchAndReplaceContent(window.location.href, false);
            }
        });
    }
    
    static initThemeToggle() {
        const checkbox = document.getElementById('theme-toggle-checkbox');
        if (!checkbox) return;

        const setTheme = (theme, updateCheckbox = true) => {
            const root = document.documentElement;
            const currentTheme = root.getAttribute('data-theme');
            if (currentTheme === theme) return;

            document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: ${theme === 'dark' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
                z-index: 9999;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.4s ease;
            `;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => { overlay.style.opacity = '1'; });
            setTimeout(() => {
                overlay.remove();
                document.body.style.transition = '';
            }, 400);
            
            root.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            
            if (updateCheckbox) {
                checkbox.checked = (theme === 'dark');
            }
            
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
        };

        const handleChange = (e) => {
            const newTheme = e.target.checked ? 'dark' : 'light';
            setTheme(newTheme, false);
        };
        
        checkbox.addEventListener('change', handleChange);
        
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let initialTheme = savedTheme;
        if (!initialTheme) {
            initialTheme = systemPrefersDark ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', initialTheme);
        checkbox.checked = (initialTheme === 'dark');
        
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) {
                const newSysTheme = e.matches ? 'dark' : 'light';
                setTheme(newSysTheme, true);
            }
        });
    }
}

/**
 * 滚动管理器
 */
class ScrollManager {
    static initBackToTopButton() {
        const btn = document.getElementById('backToTopBtn');
        if (!btn) return;
        const threshold = 300;
        window.addEventListener('scroll', Utils.throttle(() => {
            btn.classList.toggle('show', window.scrollY > threshold);
        }, 100), { passive: true });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
}

/**
 * 加载导航栏
 */
async function loadNavbar() {
    try {
        const response = await fetch('/navbar.html');
        if (!response.ok) throw new Error('Failed to load navbar');
        const navbarHTML = await response.text();
        const placeholder = document.getElementById('navbar-placeholder');
        if (placeholder) {
            placeholder.innerHTML = navbarHTML;
            // 初始化导航相关交互：主题开关、移动端菜单、绑定 nav 链接、导航高亮与 popstate
            NavigationManager.initThemeToggle();
            NavigationManager.initMobileMenuToggle();
            NavigationManager.bindNavLinks();
            NavigationManager.initNavigation();
            NavigationManager.initPopstate();
        } else {
            console.warn('Navbar placeholder not found');
        }
    } catch (error) {
        console.error('Error loading navbar:', error);
    }
}

/**
 * 自定义光标
 */
class CustomCursor {
  constructor(options = {}) {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('触摸设备，跳过自定义光标');
      return;
    }

    this.config = {
      damping: 0.92,
      stiffness: 0.18,
      rotationSmoothing: 0.2,
      minSpeedForRotation: 0.5,
      ...options
    };

    this.targetX = 0;
    this.targetY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.fixedScale = 0.55;
    this.currentRotation = 0;
    this.targetRotation = 0;

    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.lastTimestamp = 0;
    this.velocityX = 0;
    this.velocityY = 0;

    this.snappedMode = false;
    this.snappedElement = null;

    this.rafId = null;
    this.visible = false;

    this.initDOM();
    this.initEvents();
    this.updateColors();
    this.startAnimation();

    window.addEventListener('themeChanged', () => this.updateColors());
    const observer = new MutationObserver(() => this.updateColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  initDOM() {
    this.container = document.createElement('div');
    this.container.className = 'custom-cursor';
    document.body.appendChild(this.container);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '54');
    svg.setAttribute('viewBox', '0 0 50 54');
    svg.style.width = '50px';
    svg.style.height = '54px';
    svg.style.display = 'block';

    this.fillPath = document.createElementNS(svgNS, 'path');
    this.fillPath.setAttribute('d', 'M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z');

    this.strokePath = document.createElementNS(svgNS, 'path');
    this.strokePath.setAttribute('d', 'M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z');
    this.strokePath.setAttribute('stroke-width', '2.5');
    this.strokePath.setAttribute('fill', 'none');

    svg.appendChild(this.fillPath);
    svg.appendChild(this.strokePath);
    this.container.appendChild(svg);
    this.svg = svg;

    this.dot = document.createElement('div');
    this.dot.className = 'custom-cursor-dot';
    document.body.appendChild(this.dot);
  }

  updateColors() {
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#a55860';
    this.fillPath.setAttribute('fill', accentColor);
    this.strokePath.setAttribute('stroke', '#ffffff');
  }

  initEvents() {
    window.addEventListener('mousemove', (e) => {
      if (!this.visible) {
        this.visible = true;
        this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }

      const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
      const isClickable = elemUnderCursor?.matches?.(
        'a, button, .nav-item, .list-item, [role="button"], [data-clickable], .tag-button, .work-details-close, ' +
        'input, textarea, select, [contenteditable="true"]'
      );

      if (isClickable) {
        if (!this.snappedMode || this.snappedElement !== elemUnderCursor) {
          this.enterSnappedMode(elemUnderCursor);
        }
        this.updateDotPosition(e.clientX, e.clientY);
      } else {
        if (this.snappedMode) {
          this.exitSnappedMode();
        }
      }

      const now = performance.now();
      if (this.lastTimestamp) {
        const dt = Math.min(50, Math.max(1, now - this.lastTimestamp));
        this.velocityX = (e.clientX - this.lastMouseX) / dt;
        this.velocityY = (e.clientY - this.lastMouseY) / dt;
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.lastTimestamp = now;

      if (!this.snappedMode) {
        this.targetX = e.clientX;
        this.targetY = e.clientY;

        let speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed > this.config.minSpeedForRotation) {
          let angle = Math.atan2(this.velocityY, this.velocityX) * 180 / Math.PI + 90;
          this.targetRotation = angle;
        } else {
          this.targetRotation = 0;
        }
      } else {
        this.targetRotation = -45;
      }
    });

    window.addEventListener('mouseleave', () => {
      this.visible = false;
      this.container.classList.remove('visible');
      document.body.classList.remove('custom-cursor-enabled');
      if (this.snappedMode) this.exitSnappedMode();
    });

    window.addEventListener('mouseenter', () => {
      if (this.targetX !== undefined) {
        this.visible = true;
        this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }
    });

    window.addEventListener('scroll', () => {
      if (this.snappedMode && this.snappedElement) {
        this.updateSnappedTargetPosition();
      }
    });
    window.addEventListener('resize', () => {
      if (this.snappedMode && this.snappedElement) {
        this.updateSnappedTargetPosition();
      }
    });
  }

  enterSnappedMode(element) {
    if (!element) return;
    this.snappedMode = true;
    this.snappedElement = element;
    this.dot.style.display = 'block';
    this.updateSnappedTargetPosition();
    this.targetRotation = 45;
  }

  exitSnappedMode() {
    this.snappedMode = false;
    this.snappedElement = null;
    this.dot.style.display = 'none';
    this.targetRotation = 0;
  }

  updateSnappedTargetPosition() {
    if (!this.snappedElement) return;
    const rect = this.snappedElement.getBoundingClientRect();
    this.targetX = rect.right;
    this.targetY = rect.bottom;
  }

  updateDotPosition(x, y) {
    if (!this.dot) return;
    this.dot.style.transform = `translate(${x}px, ${y}px)`;
  }

  startAnimation() {
    const animate = () => {
      if (this.snappedMode && this.snappedElement) {
        this.updateSnappedTargetPosition();
      }

      this.currentX += (this.targetX - this.currentX) * this.config.stiffness;
      this.currentY += (this.targetY - this.currentY) * this.config.stiffness;
      const dx = this.targetX - this.currentX;
      const dy = this.targetY - this.currentY;
      this.currentX += dx * 0.3;
      this.currentY += dy * 0.3;

      let diff = this.targetRotation - this.currentRotation;
      if (Math.abs(diff) > 180) diff -= Math.sign(diff) * 360;
      this.currentRotation += diff * this.config.rotationSmoothing;

      this.svg.style.transform = `translate(-50%, -50%) rotate(${this.currentRotation}deg) scale(${this.fixedScale})`;
      this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;

      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.container?.remove();
    this.dot?.remove();
    document.body.classList.remove('custom-cursor-enabled');
    document.body.style.cursor = '';
  }
}

/**
 * 加载全局页脚
 */
async function loadFooter() {
  try {
    const response = await fetch('/footer.html');
    if (!response.ok) throw new Error('加载页脚失败');
    const footerHTML = await response.text();
    const placeholder = document.getElementById('footer-placeholder');
    if (placeholder) {
            // 将 footer HTML 临时解析到一个容器中，安全地提取资源
            const tmp = document.createElement('div');
            tmp.innerHTML = footerHTML;

            // 注入样式（link）到 head，避免重复注入
            tmp.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
                if (!exists) {
                    const newLink = document.createElement('link');
                    newLink.rel = 'stylesheet';
                    newLink.href = href;
                    document.head.appendChild(newLink);
                }
            });

            // 将非脚本内容（比如 footer 的静态 HTML）放入占位符
            // 先移除所有 script 标签，剩下的 HTML 就是可直接插入的内容
            tmp.querySelectorAll('script').forEach(s => s.remove());
            placeholder.innerHTML = tmp.innerHTML;

            // 重新解析 footerHTML 用于提取并执行 script
            const tmp2 = document.createElement('div');
            tmp2.innerHTML = footerHTML;
            const scripts = Array.from(tmp2.querySelectorAll('script'));

            if (scripts.length === 0) return;

            // 顺序加载脚本并在全部完成后触发回调
            let loadedCount = 0;
            const tryInvokeRender = () => {
                // 在 footer 的脚本全部加载后，调用渲染函数（若存在）
                if (typeof renderMathAndMermaid === 'function') {
                    try {
                        const container = document.getElementById('articleBody') || document.getElementById('mainContent') || document.body;
                        renderMathAndMermaid(container);
                    } catch (e) {
                        console.warn('调用 renderMathAndMermaid 失败', e);
                    }
                }
            };

            const loadNextScript = (index) => {
                if (index >= scripts.length) {
                    tryInvokeRender();
                    return;
                }
                const s = scripts[index];
                const src = s.getAttribute('src');
                if (src) {
                    const newScript = document.createElement('script');
                    // 复制常用属性
                    if (s.hasAttribute('type')) newScript.type = s.getAttribute('type');
                    if (s.hasAttribute('async')) newScript.async = true;
                    if (s.hasAttribute('defer')) newScript.defer = true;
                    newScript.src = src;
                    newScript.onload = () => { loadedCount++; loadNextScript(index + 1); };
                    newScript.onerror = () => { console.warn('脚本加载失败:', src); loadedCount++; loadNextScript(index + 1); };
                    document.body.appendChild(newScript);
                } else {
                    // 内联脚本：直接执行
                    try {
                        const inline = document.createElement('script');
                        if (s.hasAttribute('type')) inline.type = s.getAttribute('type');
                        inline.text = s.textContent || s.innerText || '';
                        document.body.appendChild(inline);
                    } catch (e) {
                        console.warn('执行内联脚本失败', e);
                    }
                    // 继续加载下一个
                    loadNextScript(index + 1);
                }
            };

            loadNextScript(0);
    } else {
      console.warn('页脚占位符未找到');
    }
  } catch (error) {
    console.error('加载页脚错误:', error);
  }
}

/**
 * 网站存活时间计时器
 */
let siteAgeInterval = null;

function startSiteAgeUpdater() {
    if (siteAgeInterval) {
        clearInterval(siteAgeInterval);
        siteAgeInterval = null;
    }

    const BIRTH_DATE = new Date('2025-02-22T12:23:53Z');

    function updateAge() {
        const ageSpan = document.getElementById('site-age');
        if (!ageSpan) return;

        const now = Date.now();
        const diff = now - BIRTH_DATE.getTime();

        if (diff < 0) {
            ageSpan.innerText = '……等等，结果是负数？？！';
            return;
        }

        const totalSeconds = Math.floor(diff / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const ageStr = `${days}天${hours.toString().padStart(2, '0')}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒`;
        ageSpan.innerText = ageStr;
    }

    updateAge();
    siteAgeInterval = setInterval(updateAge, 1000);
}

/**
 * 外链跳转确认管理器
 */
class ExternalLinkManager {
    constructor() {
        // 白名单配置
        this.WHITELIST = new Set([
            "github.com", "vercel.com", "netlify.app", "wikipedia.org",
            "bilibili.com", "bing.com", "baidu.com", "zhihu.com",
            "csdn.net", "cloud.tencent.com", "aliyun.com", "gaoxinyang.lanzouq.com"
        ]);
        
        this.currentModal = null;
        this.currentOverlay = null;
        this.countdownInterval = null;
        this.remainingSeconds = 3;
        this.pendingUrl = null;
        this.isSafe = false;
        this.redirectTriggered = false;
        
        this.internalDomains = [
            window.location.hostname,
            'localhost',
            '127.0.0.1',
            'xinyang-gao.github.io',
            'www.xinyang-gao.github.io'
        ];
        
        this.init();
    }

    // 判断是否为白名单域名
    isWhitelistedDomain(hostname) {
        if (!hostname) return false;
        const lower = hostname.toLowerCase();
        if (this.WHITELIST.has(lower)) return true;
        for (let domain of this.WHITELIST) {
            if (lower.endsWith('.' + domain)) return true;
        }
        return false;
    }

    // 判断是否为外部链接
    isExternalLink(url) {
        if (!url || url.startsWith('#') || url.startsWith('javascript:')) {
            return false;
        }
        
        try {
            const linkUrl = new URL(url, window.location.href);
            if (!['http:', 'https:'].includes(linkUrl.protocol)) {
                return false;
            }
            return !this.internalDomains.includes(linkUrl.hostname);
        } catch (e) {
            return false;
        }
    }

    // 清除倒计时
    clearTimer() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    // 关闭当前弹窗
    closeModal() {
        if (!this.currentModal) return;
        
        this.clearTimer();
        
        if (this.currentModal.classList.contains('closing')) return;
        this.currentModal.classList.add('closing');
        if (this.currentOverlay) {
            this.currentOverlay.classList.remove('active');
        }
        
        setTimeout(() => {
            if (this.currentModal) this.currentModal.remove();
            if (this.currentOverlay) this.currentOverlay.remove();
            this.currentModal = null;
            this.currentOverlay = null;
            this.pendingUrl = null;
            this.redirectTriggered = false;
        }, 400);
    }

    // 执行跳转（新标签页打开）
    doRedirect() {
        if (this.redirectTriggered) return;
        if (!this.pendingUrl) return;
        
        this.redirectTriggered = true;
        this.clearTimer();
        
        // 在新标签页打开链接
        window.open(this.pendingUrl, '_blank', 'noopener,noreferrer');
        
        // 延迟关闭弹窗，让用户看到已跳转的提示
        setTimeout(() => {
            this.closeModal();
        }, 300);
    }

    // 启动白名单倒计时
    startCountdown(timerElement) {
        if (!this.isSafe) return;
        if (this.redirectTriggered) return;
        
        this.clearTimer();
        this.remainingSeconds = 3;
        
        if (timerElement) {
            timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`;
        }
        
        this.countdownInterval = setInterval(() => {
            if (this.redirectTriggered || !this.currentModal) {
                this.clearTimer();
                return;
            }
            
            this.remainingSeconds--;
            
            if (this.remainingSeconds <= 0) {
                this.clearTimer();
                if (!this.redirectTriggered && timerElement) {
                    timerElement.innerHTML = `✓ 正在跳转...`;
                }
                this.doRedirect();
            } else {
                if (!this.redirectTriggered && timerElement) {
                    timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`;
                }
            }
        }, 1000);
    }

    // 显示外链确认弹窗
    showExternalLinkModal(url, targetElement = null) {
        // 关闭已存在的弹窗
        if (this.currentModal) {
            this.closeModal();
        }
        
        // 验证 URL
        let hostname = '';
        let isValid = false;
        
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
                isValid = true;
                hostname = urlObj.hostname;
            } else {
                this.showErrorToast('不支持的协议，仅支持 HTTP/HTTPS');
                return false;
            }
        } catch (err) {
            this.showErrorToast('链接格式无效');
            return false;
        }
        
        if (!isValid) return false;
        
        // 判断是否白名单
        this.isSafe = this.isWhitelistedDomain(hostname);
        this.pendingUrl = url;
        this.redirectTriggered = false;
        
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
        
        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'external-modal';
        
        const safeClass = this.isSafe ? 'safe' : '';
        const icon = this.isSafe ? '' : '';
        const subText = this.isSafe ? '安全站点' : '您即将访问外部网站';
        const messageHtml = this.isSafe 
            ? '安全的网站<br>将自动为您跳转，您也可点击「立即前往」手动跳转。'
            : '本站不对第三方内容负责';
        const btnText = this.isSafe ? '立即前往' : '继续前往';
        const btnSafeClass = this.isSafe ? 'safe' : '';
        
        modal.innerHTML = `
            <div class="external-modal-close">✕</div>
            <div class="external-modal-content">
                <div class="external-modal-header">
                    <span class="external-modal-icon">${icon}</span>
                    <span class="external-modal-domain ${safeClass}">${Utils.escapeHtml(hostname)}</span>
                </div>
                <div class="external-modal-sub">${subText}</div>
                <div class="external-modal-url">${Utils.escapeHtml(url)}</div>
                <div class="external-modal-message">${messageHtml}</div>
                <div id="external-timer-area" class="external-modal-timer" style="${this.isSafe ? '' : 'display: none;'}"></div>
                <div class="external-modal-buttons">
                    <button class="external-modal-btn" id="external-cancel-btn">取消</button>
                    <button class="external-modal-btn external-modal-btn-primary ${btnSafeClass}" id="external-confirm-btn">${btnText}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        this.currentModal = modal;
        this.currentOverlay = overlay;
        
        // 绑定事件
        const closeBtn = modal.querySelector('.external-modal-close');
        const cancelBtn = modal.querySelector('#external-cancel-btn');
        const confirmBtn = modal.querySelector('#external-confirm-btn');
        const timerArea = modal.querySelector('#external-timer-area');
        
        const handleClose = () => this.closeModal();
        const handleConfirm = () => {
            if (this.redirectTriggered) return;
            this.clearTimer();
            this.doRedirect();
        };
        
        closeBtn.addEventListener('click', handleClose);
        cancelBtn.addEventListener('click', handleClose);
        confirmBtn.addEventListener('click', handleConfirm);
        overlay.addEventListener('click', handleClose);
        
        // ESC 键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // 弹窗关闭时清理 ESC 监听
        const originalClose = this.closeModal.bind(this);
        this.closeModal = () => {
            document.removeEventListener('keydown', escHandler);
            originalClose();
            // 恢复原始的 closeModal 引用
            this.closeModal = originalClose;
        };
        
        // 显示动画
        requestAnimationFrame(() => {
            modal.classList.add('active');
            overlay.classList.add('active');
        });
        
        // 如果是白名单，启动倒计时
        if (this.isSafe) {
            this.startCountdown(timerArea);
        }
        
        return true;
    }

    // 显示错误提示（简单的 toast 风格）
    showErrorToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--accent-color);
            color: white;
            padding: 10px 20px;
            border-radius: 40px;
            font-size: 0.9rem;
            z-index: 10000;
            box-shadow: var(--shadow-md);
            animation: fadeInUp 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // 处理链接点击
    handleLinkClick(e) {
        let target = e.target.closest('a');
        if (!target) return;
        
        const href = target.getAttribute('href');
        if (!href) return;
        
        if (this.isExternalLink(href)) {
            e.preventDefault();
            e.stopPropagation();
            this.showExternalLinkModal(href, target);
        }
    }

    // 初始化事件监听
    init() {
        document.addEventListener('click', (e) => {
            this.handleLinkClick(e);
        });
        console.log('外链跳转确认管理器已启动');
    }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!window.customCursorInstance) {
      window.customCursorInstance = new CustomCursor();
    }
  }, 100);
});

document.addEventListener('DOMContentLoaded', async () => {
    window.ExternalLinkManager = new ExternalLinkManager();
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let initialTheme = savedTheme;
    if (!initialTheme) {
        initialTheme = systemPrefersDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', initialTheme);

    await loadNavbar();
    await loadFooter();
    // 在注入 footer 后尝试渲染页面内的数学公式与 Mermaid（延迟以等待外部脚本加载）
    setTimeout(() => {
        try { renderMathAndMermaid(document.body); } catch (e) { console.warn('初始 renderMathAndMermaid 失败', e); }
    }, 300);
    startSiteAgeUpdater();

    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    if (currentPage === 'index') {
        updateDynamicGreeting();
        setInterval(updateDynamicGreeting, 60000);
    } else if (currentPage === 'articles') {
        initializeArticlesPage();
    } else if (currentPage === 'works') {
        initializeWorksPage();
    }
    
    // 在所有页面中渲染个人信息卡片，如果容器存在
    const personalCardContainer = document.getElementById('personal-card-container');
    if (personalCardContainer) {
        personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
    }
    NavigationManager.initNavigation();
    NavigationManager.initMobileMenuToggle();
    ScrollManager.initBackToTopButton();
    document.body.setAttribute('data-loaded', 'true');
    
    initScrollReveal();
});

async function initializeArticlesPage() {
    try {
        const data = await DataManager.fetchData('articles');
        const html = UIRenderer.generateListHTML(data, 'articles');
        const container = document.getElementById('articles-list-container');
        if (container) {
            container.innerHTML = html;
            new SearchController('articles');
            initScrollReveal();
        }
    } catch (e) {
        console.error('加载文章数据失败:', e);
    }
}

async function initializeWorksPage() {
    try {
        const data = await DataManager.fetchData('works');
        const html = UIRenderer.generateListHTML(data, 'works');
        const container = document.getElementById('works-list-container');
        if (container) {
            container.innerHTML = html;
            new SearchController('works');
            initScrollReveal();
        }
    } catch (e) {
        console.error('加载作品数据失败:', e);
    }
}

/* 无刷新导航：拦截内部链接，fetch 页面并替换主内容 */
function isSameOrigin(href) {
    try {
        const url = new URL(href, window.location.href);
        return url.origin === window.location.origin;
    } catch {
        return false;
    }
}

function getPageNameFromPath(pathname) {
    const name = pathname.split('/').pop() || 'index';
    return name.replace('.html', '') || 'index';
}

// 判断当前页面是否为文章详情页（单篇文章）或 404 页面
function isArticleDetailOr404Page() {
    try {
        const path = window.location.pathname || '';
        const name = path.split('/').pop() || '';
        // articles 列表页面为 articles.html，单篇文章位于 /articles/xxx.html
        if (path.includes('/articles/') && name && name !== 'articles.html') return true;
        if (name === '404.html' || name === '404') return true;
        return false;
    } catch (e) {
        return false;
    }
}

async function fetchAndReplaceContent(url, pushState = true) {
    try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const fetchedTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;

        // 尽量寻找主内容节点
        const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
        const currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');
        if (fetchedMain && currentMain) {
            currentMain.innerHTML = fetchedMain.innerHTML;
        } else if (fetchedMain && !currentMain) {
            // 如果当前页面没有 mainContent，尝试将其放入第一个 container
            const container = document.querySelector('.container') || document.body;
            container.innerHTML = fetchedMain.innerHTML;
        }

        document.title = fetchedTitle;

        // 在执行页面脚本或初始化依赖 URL 的模块前，先更新历史记录（若需要）。
        // 这样可以确保后续初始化（如导航高亮、评论组件）读取到正确的 URL。
        if (pushState) {
            try {
                window.history.pushState({ ajax: true }, fetchedTitle, url);
            } catch (err) {
                console.warn('pushState 失败:', err);
            }
        }

        // 注入 fetched 文档中的样式到 head（避免样式仅存在于 fetched head 中而不生效）
        try {
            const headStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'));
            headStyles.forEach(h => {
                if (h.tagName.toLowerCase() === 'link') {
                    const href = h.getAttribute('href') || h.href;
                    if (!href) return;
                    // 若页面中已存在相同 href 的 link，则跳过
                    if (document.querySelector(`link[href="${href}"]`)) return;
                    const nl = document.createElement('link');
                    nl.rel = 'stylesheet';
                    nl.href = href;
                    document.head.appendChild(nl);
                } else if (h.tagName.toLowerCase() === 'style') {
                    // 避免重复插入完全相同的 style
                    const existing = Array.from(document.head.querySelectorAll('style')).some(s => s.textContent === h.textContent);
                    if (!existing) {
                        const ns = document.createElement('style');
                        ns.textContent = h.textContent;
                        document.head.appendChild(ns);
                    }
                }
            });
        } catch (e) {
            console.warn('注入样式时出错', e);
        }

        // 执行 fetched 文档中 body 的脚本，并等待外部脚本加载完成后再继续初始化页面
        const bodyScripts = Array.from(doc.body.querySelectorAll('script'));
        const loadPromises = [];
        bodyScripts.forEach(s => {
            try {
                if (s.src) {
                    // 如果页面中已有相同 src 的 script，则跳过
                    if (document.querySelector(`script[src="${s.src}"]`)) return;
                    const newS = document.createElement('script');
                    if (s.type) newS.type = s.type;
                    newS.src = s.src;
                    // 保证按顺序加载并执行
                    newS.async = false;
                    const p = new Promise(resolve => {
                        newS.onload = () => resolve();
                        newS.onerror = () => {
                            console.warn('脚本加载失败:', s.src);
                            resolve();
                        };
                    });
                    document.body.appendChild(newS);
                    loadPromises.push(p);
                } else {
                    const inline = document.createElement('script');
                    if (s.type) inline.type = s.type;
                    inline.textContent = s.textContent;
                    document.body.appendChild(inline);
                    // 保留执行效果后可移除，异步移除以免影响某些脚本依赖
                    setTimeout(() => inline.parentNode && inline.parentNode.removeChild(inline), 0);
                }
            } catch (e) {
                console.warn('插入脚本时出错', e);
            }
        });

        // 等待所有外部脚本加载（若有），再进行后续初始化
        if (loadPromises.length) {
            try {
                await Promise.all(loadPromises);
            } catch (e) {
                console.warn('等待脚本加载时发生错误', e);
            }
        }

        // 确保页面存在 .container，某些被抓取页面样式依赖此容器
        try {
            if (!document.querySelector('.container')) {
                const mainEl = document.querySelector('main') || document.getElementById('mainContent');
                if (mainEl && !mainEl.closest('.container')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'container';
                    // 将 mainEl 内部内容包裹进 container
                    while (mainEl.firstChild) {
                        wrapper.appendChild(mainEl.firstChild);
                    }
                    mainEl.appendChild(wrapper);
                }
            }
        } catch (e) {
            console.warn('修复缺失 .container 时出错', e);
        }

        // 如果页面中包含 Twikoo 评论容器，且 twikoo 可用，则尝试初始化（修复 inline 脚本不触发的问题）
        try {
            const twikooEl = document.querySelector('#twikoo-comments');
            if (twikooEl) {
                if (typeof twikoo !== 'undefined' && twikoo && typeof twikoo.init === 'function') {
                    // 避免重复初始化
                    if (!twikooEl.getAttribute('data-init')) {
                        twikoo.init({
                            envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
                            el: '#twikoo-comments',
                            lang: 'zh-CN',
                            enableComment: true,
                        }).then(() => {
                            twikooEl.setAttribute('data-init', 'true');
                            console.log('Twikoo 初始化（自动）成功');
                        }).catch(err => {
                            console.warn('Twikoo 自动初始化失败:', err);
                        });
                    }
                } else {
                    // 若 twikoo 还未加载，延迟尝试初始化一次
                    setTimeout(() => {
                        try {
                            if (typeof twikoo !== 'undefined' && twikoo && typeof twikoo.init === 'function' && !twikooEl.getAttribute('data-init')) {
                                twikoo.init({ envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo', el: '#twikoo-comments', lang: 'zh-CN', enableComment: true }).then(() => {
                                    twikooEl.setAttribute('data-init', 'true');
                                    console.log('Twikoo 延迟初始化成功');
                                }).catch(() => {});
                            }
                        } catch (_) {}
                    }, 300);
                }
            }
        } catch (e) {
            console.warn('尝试初始化 Twikoo 时出错', e);
        }

        // 更新导航激活状态并重新初始化页面功能
        NavigationManager.initNavigation();
        NavigationManager.initMobileMenuToggle();
        ScrollManager.initBackToTopButton();

        // 确保个人卡片存在
        const personalCardContainer = document.getElementById('personal-card-container');
        if (personalCardContainer) personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();

        // 根据目标页面名称初始化特定功能
        const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
        if (pageName === 'index') {
            if (typeof updateDynamicGreeting === 'function') updateDynamicGreeting();
            // index 页面的一些初始化函数可能在其内联脚本中，尽量调用常用函数
        } else if (pageName === 'articles') {
            await initializeArticlesPage();
        } else if (pageName === 'works') {
            await initializeWorksPage();
        }

        // 触发自定义事件，便于其他模块响应
        window.dispatchEvent(new CustomEvent('ajax:navigation', { detail: { url, page: pageName } }));
        return true;
    } catch (e) {
        console.error('无刷新导航加载失败:', e);
        return false;
    }
}

function enableAjaxNavigation() {
    document.addEventListener('click', function (e) {
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href) return;

        // 如果当前为文章详情页或 404 页，则不要拦截链接，使用浏览器默认行为进行完整跳转
        if (isArticleDetailOr404Page()) return;

        // 忽略带有 data-no-ajax 的链接或外部链接或锚点
        if (a.hasAttribute('data-no-ajax')) return;
        if (href.startsWith('#')) return;
        if (!isSameOrigin(href)) return;
        // 允许下载或带有 target=_blank 的链接正常跳转
        if (a.target === '_blank' || a.hasAttribute('download')) return;

        // 只处理 HTML 页面请求
        const isHtml = href.endsWith('.html') || href.indexOf('?') > -1 || href.endsWith('/');
        if (!isHtml) return;

        e.preventDefault();
        const url = new URL(href, window.location.href).href;
        if (url === window.location.href) return;
        fetchAndReplaceContent(url, true);
    }, { passive: false });

    window.addEventListener('popstate', function (e) {
        const url = window.location.href;
        // popstate 不需要 pushState
        fetchAndReplaceContent(url, false);
    });
}

// 启动无刷新导航
enableAjaxNavigation();