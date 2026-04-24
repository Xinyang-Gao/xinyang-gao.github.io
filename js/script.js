class PerformanceMonitor {
    constructor() {
        this.timers = new Map();
        this.metrics = [];
    }
    start(label) {
        if (this.timers.has(label)) {
            console.warn(`[WARN] 计时器“${label}”已在运行`);
            return;
        }
        this.timers.set(label, performance.now());
    }
    end(label) {
        if (!this.timers.has(label)) {
            console.warn(`[WARN] 计时器“${label}”不存在`);
            return;
        }
        const startTime = this.timers.get(label);
        const duration = performance.now() - startTime;
        if (duration > 100) {
            console.log(`[INFO] ${label}: ${duration.toFixed(2)}ms (较慢)`);
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
            console.error('[ERROR] 解析缓存数据失败');
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
        if (item.tags && Array.isArray(item.tags)) return item.tags;
        if (item.tag && Array.isArray(item.tag)) return item.tag;
        return [];
    }
    static escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function (m) {
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
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }
}

class DataManager {
    static TYPE_LABEL = { works: '作品', articles: '文章' };
    static config = {
        works: { url: '/json/works.json', cacheKey: 'worksData', cacheControl: 'no-cache' },
        articles: { url: '/json/articles.json', cacheKey: 'articlesData', cacheControl: 'default' }
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
            localStorage.setItem(cacheKey, JSON.stringify({ ...data, _timestamp: Date.now() }));
            perf.end(`获取${label}数据`);
            return data;
        } catch (e) {
            console.error(`[ERROR] 获取${label}数据失败:`, e);
            perf.end(`获取${label}数据`);
            throw e;
        }
    }
}

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
            <img src="/assets/avatar.jpg" alt="高新炀的头像" class="avatar-img" onerror="this.src='https://via.placeholder.com/140?text=GXY'">
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
                <div class="inspire-quote">
                <h4>公告</h4>
          <p><i class="fas fa-quote-left"></i>目前正在对一部分元素进行重写，可能会有偶然出现一些显示问题</p>
          <div class="inspire-author">2026年4月19日</div>
        </div>
        `;
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
            const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main') || container;
            return fetchedMain ? fetchedMain.innerHTML : container.innerHTML;
        }
        console.warn(`[WARN] ${selector} 未找到，尝试返回主内容或追加内容`);
        const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main');
        if (fetchedMain) return fetchedMain.innerHTML;
        return base + html;
    }
}

class ScrollReveal {
    constructor() {
        this.observer = null;
        this.initObserver();
    }
    initObserver() {
        if (this.observer) this.observer.disconnect();
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
            if (!item.classList.contains('revealed')) this.observer.observe(item);
        });
    }
    refresh() {
        this.initObserver();
    }
}
let scrollRevealInstance = null;
function initScrollReveal() {
    if (!scrollRevealInstance) scrollRevealInstance = new ScrollReveal();
    else scrollRevealInstance.refresh();
}

function renderMathAndMermaid(rootElement = document.body) {
    try {
        if (typeof renderMathInElement === 'function') {
            try {
                renderMathInElement(rootElement, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                    throwOnError: false
                });
            } catch (e) { console.warn('[WARN] KaTeX 渲染失败', e); }
        }
        if (window.mermaid && typeof window.mermaid.init === 'function') {
            try {
                window.mermaid.initialize({ startOnLoad: false });
                const mermaids = (rootElement.querySelectorAll ? rootElement.querySelectorAll('.mermaid') : []);
                mermaids.forEach(el => {
                    try { window.mermaid.init(undefined, el); } catch (err) { console.warn('[WARN] Mermaid 渲染单个图失败', err); }
                });
            } catch (e) { console.warn('[WARN] Mermaid 初始化失败', e); }
        }
    } catch (e) { console.warn('[WARN] renderMathAndMermaid 异常', e); }
}

class SearchController {
    constructor(page) {
        this.page = page;
        this.input = null;
        this.field = null;
        this.selectedTags = [];
        this.debounceTimer = null;
        this.popStateHandler = null;
        this.skipNextPopState = false;
        this.init();
    }
    init() {
        requestAnimationFrame(() => {
            this.input = document.getElementById('search-input');
            this.field = document.getElementById('search-field');
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
    restoreFromURL() {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q') || '';
        const field = params.get('field') || 'all';
        const tagsParam = params.get('tags') || '';
        if (this.input) this.input.value = q;
        if (this.field) this.field.value = field;
        this.selectedTags = tagsParam ? tagsParam.split(',').filter(t => t.trim()) : [];
        this.applyTagsToButtons();
    }
    applyTagsToButtons() {
        const container = document.getElementById(`${this.page}-tags-filter`);
        if (!container) return;
        const btns = container.querySelectorAll('.tag-button:not(:last-child)');
        btns.forEach(btn => {
            const tag = btn.dataset.tag;
            if (this.selectedTags.includes(tag)) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
    updateURL() {
        const params = new URLSearchParams(window.location.search);
        const q = this.input ? this.input.value.trim() : '';
        const field = this.field ? this.field.value : 'all';
        if (q) params.set('q', q);
        else params.delete('q');
        if (field && field !== 'all') params.set('field', field);
        else params.delete('field');
        if (this.selectedTags.length) params.set('tags', this.selectedTags.join(','));
        else params.delete('tags');
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
        if (!skipUpdateURL) this.updateURL();
    }
    getCachedData(type) {
        const raw = localStorage.getItem(`${type}Data`);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            return Utils.validateData(data, type) ? data : null;
        } catch { return null; }
    }
    getAllTags() {
        const data = this.getCachedData(this.page);
        const tags = new Set();
        if (!data) return tags;
        const items = this.page === 'works' ? data.works : data.articles;
        items.forEach(item => {
            const itemTags = Utils.getTags(item);
            if (itemTags && Array.isArray(itemTags)) itemTags.forEach(t => tags.add(t));
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
    filterContent(type, query, field) {
        const data = this.getCachedData(type);
        if (!data) return;
        let items = type === 'works' ? [...data.works] : [...data.articles];
        if (this.selectedTags.length) {
            items = items.filter(item => {
                const itemTags = Utils.getTags(item);
                return itemTags && Array.isArray(itemTags) && itemTags.some(t => this.selectedTags.includes(t));
            });
        }
        if (query && query.trim() !== '') {
            const ql = query.toLowerCase().trim();
            items = items.filter(item => {
                switch (field) {
                    case 'title': return item.title.toLowerCase().includes(ql);
                    case 'tag': {
                        const itemTags = Utils.getTags(item);
                        return itemTags && Array.isArray(itemTags) && itemTags.some(t => t.toLowerCase().includes(ql));
                    }
                    case 'date': return item.date.includes(query);
                    default: return item.title.toLowerCase().includes(ql) || (Utils.getTags(item).some(t => t.toLowerCase().includes(ql))) || item.date.includes(query);
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
        document.removeEventListener('click', PageManager.handleListItemClick);
        document.addEventListener('click', PageManager.handleListItemClick);
    }
    destroy() {
        if (this.input && this._inputHandler) this.input.removeEventListener('input', this._inputHandler);
        if (this.field && this._fieldHandler) this.field.removeEventListener('change', this._fieldHandler);
        if (this.popStateHandler) window.removeEventListener('popstate', this.popStateHandler);
        clearTimeout(this.debounceTimer);
    }
}

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
            console.error('[ERROR] 页面加载失败:', e);
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
            paper.className = 'draw-animation-paper';
            document.body.appendChild(paper);
        }
        const rect = elements.container.getBoundingClientRect();
        const cs = window.getComputedStyle(elements.container);
        const pad = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(cs[`padding${k}`]));
        paper.style.cssText = `position: fixed; top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: ${rect.height}px; padding: ${pad.join(' ')}; border: var(--border-width) solid var(--border-color); box-shadow: var(--shadow-main), var(--shadow-offset), -var(--shadow-offset); border-radius: var(--border-radius-container); background: white; box-sizing: border-box; z-index: var(--z-index-animation-paper); opacity: 0; transform: translateY(100%) scale(0.95);`;
        if (document.documentElement.getAttribute('data-theme') === 'dark') paper.style.background = '#222';
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
        if (typeof renderMathAndMermaid === 'function') {
            try {
                const container = document.getElementById('mainContent') || document.querySelector('main') || document.body;
                renderMathAndMermaid(container);
            } catch (e) { console.warn('[WARN] renderMathAndMermaid 执行失败', e); }
        }
    }
    static setupListItemsInteraction() {
        const content = document.getElementById('mainContent') || document.querySelector('main.main-content-area') || document.querySelector('.container') || document.getElementById('articles-list-container') || document.getElementById('works-list-container');
        if (content) {
            content.removeEventListener('click', PageManager.handleListItemClick);
            content.addEventListener('click', PageManager.handleListItemClick);
            return;
        }
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
                } catch (e) { console.error('[ERROR] 解析作品信息失败', e); }
            } else { console.warn('[WARN] 未找到作品信息，无法展示详情'); }
        } else if (type === 'article') {
            const itemUrl = item.dataset.url;
            if (itemUrl) window.open(itemUrl, '_blank');
            else console.warn('[WARN] 文章链接无效');
        }
    }
    static showWorkDetails(work) {
        if (this.currentModalClose) this.currentModalClose();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
        const envelope = document.createElement('div');
        envelope.className = 'work-details-envelope';
        const tags = work.tags || [];
        const tagsHtml = tags.length ? `<div class="work-details-tag"><strong>标签:</strong>${tags.map(t => `<span class="tag">${UIRenderer.escapeHtml(t)}</span>`).join('')}</div>` : '';
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
                if (this.currentModalClose === closeModal) this.currentModalClose = null;
            }, 400);
        };
        const escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
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

class NavigationManager {
    static initMobileMenuToggle() {
        if (this._mobileToggleBound) return;
        this._mobileToggleBound = true;
        const getNav = () => document.getElementById('navbarNav');
        const getToggle = () => document.querySelector('.mobile-toggle');
        const closeMenu = () => {
            const nav = getNav();
            const toggle = getToggle();
            if (nav && nav.classList.contains('active')) {
                nav.classList.remove('active');
                if (toggle) toggle.classList.remove('active');
            }
        };
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest('.mobile-toggle');
            const nav = getNav();
            if (!nav) return;
            if (toggle) {
                e.preventDefault();
                const isActive = nav.classList.contains('active');
                if (isActive) {
                    nav.classList.remove('active');
                    toggle.classList.remove('active');
                } else {
                    nav.classList.add('active');
                    toggle.classList.add('active');
                }
                return;
            }
            const isNavItem = e.target.closest('.nav-item');
            if (isNavItem && nav.classList.contains('active')) { closeMenu(); return; }
            if (nav.classList.contains('active')) {
                const isInsideNav = e.target.closest('.nav-items');
                if (!isInsideNav) closeMenu();
            }
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                const nav = getNav();
                const toggle = getToggle();
                if (nav && nav.classList.contains('active')) {
                    nav.classList.remove('active');
                    if (toggle) toggle.classList.remove('active');
                }
            }
        });
        window.addEventListener('ajax:navigation', () => {
            const nav = getNav();
            const toggle = getToggle();
            if (nav && nav.classList.contains('active')) {
                nav.classList.remove('active');
                if (toggle) toggle.classList.remove('active');
            }
        });
    }
    static bindNavLinks() {
        const navItems = document.querySelectorAll('.nav-item[data-page]');
        if (!navItems || navItems.length === 0) return;
        navItems.forEach(item => {
            if (item._navHandler) item.removeEventListener('click', item._navHandler);
            const handler = (e) => {
                if (isArticleDetailOr404Page()) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const page = item.dataset.page;
                if (window.PageManager && typeof PageManager.loadPage === 'function') PageManager.loadPage(page, true);
                else if (typeof fetchAndReplaceContent === 'function') fetchAndReplaceContent(item.getAttribute('href') || `/${page}.html`, true);
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
            if (window.PageManager && typeof PageManager.loadPage === 'function') PageManager.loadPage(p, false);
            else if (typeof fetchAndReplaceContent === 'function') fetchAndReplaceContent(window.location.href, false);
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
            if (updateCheckbox) checkbox.checked = (theme === 'dark');
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
        };
        const handleChange = (e) => { setTheme(e.target.checked ? 'dark' : 'light', false); };
        checkbox.addEventListener('change', handleChange);
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let initialTheme = savedTheme;
        if (!initialTheme) initialTheme = systemPrefersDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', initialTheme);
        checkbox.checked = (initialTheme === 'dark');
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light', true);
        });
    }
    static initNavigation() {
        this.bindNavLinks();
        const navItems = document.querySelectorAll('.nav-item[data-page]');
        const urlParams = new URLSearchParams(window.location.search);
        let currentPage = urlParams.get('page');
        if (!currentPage) currentPage = typeof getPageNameFromPath === 'function' ? getPageNameFromPath(window.location.pathname) : 'index';
        navItems.forEach(item => {
            const page = item.dataset.page;
            if (page === currentPage) item.classList.add('active');
            else item.classList.remove('active');
        });
    }
}

class ScrollManager {
    static initBackToTopButton() {
        const btn = document.getElementById('backToTopBtn');
        if (!btn) return;
        const threshold = 300;
        window.addEventListener('scroll', Utils.throttle(() => { btn.classList.toggle('show', window.scrollY > threshold); }, 100), { passive: true });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
}

async function loadNavbar() {
    try {
        const response = await fetch('/navbar.html');
        if (!response.ok) throw new Error('加载导航栏失败');
        const navbarHTML = await response.text();
        const placeholder = document.getElementById('navbar-placeholder');
        if (placeholder) {
            placeholder.innerHTML = navbarHTML;
            NavigationManager.initThemeToggle();
            NavigationManager.initMobileMenuToggle();
            NavigationManager.bindNavLinks();
            NavigationManager.initNavigation();
            NavigationManager.initPopstate();
        } else console.warn('[WARN] 导航栏占位符未找到');
    } catch (error) { console.error('[ERROR] 加载导航栏出错:', error); }
}

class CustomCursor {
    constructor(options = {}) {
        if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
            console.log('[INFO] 触摸设备，跳过自定义光标');
            return;
        }
        this.config = { damping: 0.92, stiffness: 0.18, rotationSmoothing: 0.2, minSpeedForRotation: 0.5, ...options };
        this.targetX = 0; this.targetY = 0; this.currentX = 0; this.currentY = 0; this.fixedScale = 0.55; this.currentRotation = 0; this.targetRotation = 0;
        this.lastMouseX = 0; this.lastMouseY = 0; this.lastTimestamp = 0; this.velocityX = 0; this.velocityY = 0;
        this.snappedMode = false; this.snappedElement = null;
        this.rafId = null; this.visible = false;
        this.initDOM(); this.initEvents(); this.updateColors(); this.startAnimation();
        window.addEventListener('themeChanged', () => this.updateColors());
        const observer = new MutationObserver(() => this.updateColors()); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    initDOM() {
        this.container = document.createElement('div'); this.container.className = 'custom-cursor'; document.body.appendChild(this.container);
        const svgNS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width', '50'); svg.setAttribute('height', '54'); svg.setAttribute('viewBox', '0 0 50 54'); svg.style.width = '50px'; svg.style.height = '54px'; svg.style.display = 'block';
        this.fillPath = document.createElementNS(svgNS, 'path'); this.fillPath.setAttribute('d', 'M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z');
        this.strokePath = document.createElementNS(svgNS, 'path'); this.strokePath.setAttribute('d', 'M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z'); this.strokePath.setAttribute('stroke-width', '2.5'); this.strokePath.setAttribute('fill', 'none');
        svg.appendChild(this.fillPath); svg.appendChild(this.strokePath); this.container.appendChild(svg); this.svg = svg;
        this.dot = document.createElement('div'); this.dot.className = 'custom-cursor-dot'; document.body.appendChild(this.dot);
    }
    updateColors() {
        const rootStyles = getComputedStyle(document.documentElement);
        const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#a55860';
        this.fillPath.setAttribute('fill', accentColor); this.strokePath.setAttribute('stroke', '#ffffff');
    }
    initEvents() {
        window.addEventListener('mousemove', (e) => {
            if (!this.visible) { this.visible = true; this.container.classList.add('visible'); document.body.classList.add('custom-cursor-enabled'); }
            const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
            const isClickable = elemUnderCursor?.matches?.('a, button, .nav-item, .list-item, [role="button"], [data-clickable], .tag-button, .work-details-close, input, textarea, select, [contenteditable="true"]');
            if (isClickable) { if (!this.snappedMode || this.snappedElement !== elemUnderCursor) this.enterSnappedMode(elemUnderCursor); this.updateDotPosition(e.clientX, e.clientY); }
            else { if (this.snappedMode) this.exitSnappedMode(); }
            const now = performance.now();
            if (this.lastTimestamp) { const dt = Math.min(50, Math.max(1, now - this.lastTimestamp)); this.velocityX = (e.clientX - this.lastMouseX) / dt; this.velocityY = (e.clientY - this.lastMouseY) / dt; }
            this.lastMouseX = e.clientX; this.lastMouseY = e.clientY; this.lastTimestamp = now;
            if (!this.snappedMode) { this.targetX = e.clientX; this.targetY = e.clientY; let speed = Math.hypot(this.velocityX, this.velocityY); if (speed > this.config.minSpeedForRotation) { let angle = Math.atan2(this.velocityY, this.velocityX) * 180 / Math.PI + 90; this.targetRotation = angle; } else this.targetRotation = 0; }
            else this.targetRotation = -45;
        });
        window.addEventListener('mouseleave', () => { this.visible = false; this.container.classList.remove('visible'); document.body.classList.remove('custom-cursor-enabled'); if (this.snappedMode) this.exitSnappedMode(); });
        window.addEventListener('mouseenter', () => { if (this.targetX !== undefined) { this.visible = true; this.container.classList.add('visible'); document.body.classList.add('custom-cursor-enabled'); } });
        window.addEventListener('scroll', () => { if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition(); });
        window.addEventListener('resize', () => { if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition(); });
    }
    enterSnappedMode(element) { if (!element) return; this.snappedMode = true; this.snappedElement = element; this.dot.style.display = 'block'; this.updateSnappedTargetPosition(); this.targetRotation = 45; }
    exitSnappedMode() { this.snappedMode = false; this.snappedElement = null; this.dot.style.display = 'none'; this.targetRotation = 0; }
    updateSnappedTargetPosition() { if (!this.snappedElement) return; const rect = this.snappedElement.getBoundingClientRect(); this.targetX = rect.right; this.targetY = rect.bottom; }
    updateDotPosition(x, y) { if (!this.dot) return; this.dot.style.transform = `translate(${x}px, ${y}px)`; }
    startAnimation() {
        const animate = () => {
            if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
            this.currentX += (this.targetX - this.currentX) * this.config.stiffness; this.currentY += (this.targetY - this.currentY) * this.config.stiffness;
            const dx = this.targetX - this.currentX; const dy = this.targetY - this.currentY; this.currentX += dx * 0.3; this.currentY += dy * 0.3;
            let diff = this.targetRotation - this.currentRotation; if (Math.abs(diff) > 180) diff -= Math.sign(diff) * 360; this.currentRotation += diff * this.config.rotationSmoothing;
            this.svg.style.transform = `translate(-50%, -50%) rotate(${this.currentRotation}deg) scale(${this.fixedScale})`; this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
            this.rafId = requestAnimationFrame(animate);
        }; this.rafId = requestAnimationFrame(animate);
    }
    destroy() { if (this.rafId) cancelAnimationFrame(this.rafId); this.container?.remove(); this.dot?.remove(); document.body.classList.remove('custom-cursor-enabled'); document.body.style.cursor = ''; }
}

async function loadFooter() {
    try {
        const response = await fetch('/footer.html');
        if (!response.ok) throw new Error('加载页脚失败');
        const footerHTML = await response.text();
        const placeholder = document.getElementById('footer-placeholder');
        if (placeholder) {
            const tmp = document.createElement('div'); tmp.innerHTML = footerHTML;
            tmp.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                const href = link.getAttribute('href'); if (!href) return;
                const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
                if (!exists) { const newLink = document.createElement('link'); newLink.rel = 'stylesheet'; newLink.href = href; document.head.appendChild(newLink); }
            });
            tmp.querySelectorAll('script').forEach(s => s.remove());
            placeholder.innerHTML = tmp.innerHTML;
            const tmp2 = document.createElement('div'); tmp2.innerHTML = footerHTML; const scripts = Array.from(tmp2.querySelectorAll('script'));
            if (scripts.length === 0) return;
            let loadedCount = 0; const tryInvokeRender = () => { if (typeof renderMathAndMermaid === 'function') try { const container = document.getElementById('articleBody') || document.getElementById('mainContent') || document.body; renderMathAndMermaid(container); } catch (e) { console.warn('[WARN] 调用 renderMathAndMermaid 失败', e); } };
            const loadNextScript = (index) => {
                if (index >= scripts.length) { tryInvokeRender(); return; }
                const s = scripts[index]; const src = s.getAttribute('src');
                if (src) {
                    const newScript = document.createElement('script'); if (s.hasAttribute('type')) newScript.type = s.getAttribute('type'); if (s.hasAttribute('async')) newScript.async = true; if (s.hasAttribute('defer')) newScript.defer = true;
                    newScript.src = src; newScript.onload = () => { loadedCount++; loadNextScript(index + 1); }; newScript.onerror = () => { console.warn('[WARN] 脚本加载失败:', src); loadedCount++; loadNextScript(index + 1); };
                    document.body.appendChild(newScript);
                } else { try { const inline = document.createElement('script'); if (s.hasAttribute('type')) inline.type = s.getAttribute('type'); inline.text = s.textContent || s.innerText || ''; document.body.appendChild(inline); } catch (e) { console.warn('[WARN] 执行内联脚本失败', e); } loadNextScript(index + 1); }
            }; loadNextScript(0);
        } else { console.warn('[WARN] 页脚占位符未找到'); }
    } catch (error) { console.error('[ERROR] 加载页脚错误:', error); }
}

let siteAgeInterval = null;
function startSiteAgeUpdater() {
    if (siteAgeInterval) { clearInterval(siteAgeInterval); siteAgeInterval = null; }
    const BIRTH_DATE = new Date('2025-02-22T12:23:53Z');
    function updateAge() {
        const ageSpan = document.getElementById('site-age'); if (!ageSpan) return;
        const now = Date.now(); const diff = now - BIRTH_DATE.getTime();
        if (diff < 0) { ageSpan.innerText = '……等等，结果是负数？？！'; return; }
        const totalSeconds = Math.floor(diff / 1000); const days = Math.floor(totalSeconds / 86400); const hours = Math.floor((totalSeconds % 86400) / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60;
        const ageStr = `${days}天${hours.toString().padStart(2, '0')}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒`;
        ageSpan.innerText = ageStr;
    }
    updateAge(); siteAgeInterval = setInterval(updateAge, 1000);
}

class ExternalLinkManager {
    constructor() {
        this.WHITELIST = new Set(["github.com", "vercel.com", "netlify.app", "wikipedia.org", "bilibili.com", "bing.com", "baidu.com", "zhihu.com", "csdn.net", "cloud.tencent.com", "aliyun.com", "gaoxinyang.lanzouq.com", "icp.gov.moe"]);
        this.currentModal = null; this.currentOverlay = null; this.countdownInterval = null; this.remainingSeconds = 3; this.pendingUrl = null; this.isSafe = false; this.redirectTriggered = false;
        this.internalDomains = [window.location.hostname, 'localhost', '127.0.0.1', 'xinyang-gao.github.io', 'www.xinyang-gao.github.io'];
        this.init();
    }
    isWhitelistedDomain(hostname) { if (!hostname) return false; const lower = hostname.toLowerCase(); if (this.WHITELIST.has(lower)) return true; for (let domain of this.WHITELIST) if (lower.endsWith('.' + domain)) return true; return false; }
    isExternalLink(url) { if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false; try { const linkUrl = new URL(url, window.location.href); if (!['http:', 'https:'].includes(linkUrl.protocol)) return false; return !this.internalDomains.includes(linkUrl.hostname); } catch (e) { return false; } }
    clearTimer() { if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; } }
    closeModal() { if (!this.currentModal) return; this.clearTimer(); if (this.currentModal.classList.contains('closing')) return; this.currentModal.classList.add('closing'); if (this.currentOverlay) this.currentOverlay.classList.remove('active'); setTimeout(() => { if (this.currentModal) this.currentModal.remove(); if (this.currentOverlay) this.currentOverlay.remove(); this.currentModal = null; this.currentOverlay = null; this.pendingUrl = null; this.redirectTriggered = false; }, 400); }
    doRedirect() { if (this.redirectTriggered) return; if (!this.pendingUrl) return; this.redirectTriggered = true; this.clearTimer(); window.open(this.pendingUrl, '_blank', 'noopener,noreferrer'); setTimeout(() => this.closeModal(), 300); }
    startCountdown(timerElement) { if (!this.isSafe) return; if (this.redirectTriggered) return; this.clearTimer(); this.remainingSeconds = 3; if (timerElement) timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`; this.countdownInterval = setInterval(() => { if (this.redirectTriggered || !this.currentModal) { this.clearTimer(); return; } this.remainingSeconds--; if (this.remainingSeconds <= 0) { this.clearTimer(); if (!this.redirectTriggered && timerElement) timerElement.innerHTML = `✓ 正在跳转...`; this.doRedirect(); } else if (!this.redirectTriggered && timerElement) timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`; }, 1000); }
    showExternalLinkModal(url, targetElement = null) {
        if (this.currentModal) this.closeModal();
        let hostname = ''; let isValid = false;
        try { const urlObj = new URL(url); if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') { isValid = true; hostname = urlObj.hostname; } else { this.showErrorToast('不支持的协议，仅支持 HTTP/HTTPS'); return false; } } catch (err) { this.showErrorToast('链接格式无效'); return false; }
        if (!isValid) return false;
        this.isSafe = this.isWhitelistedDomain(hostname); this.pendingUrl = url; this.redirectTriggered = false;
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; document.body.appendChild(overlay);
        const modal = document.createElement('div'); modal.className = 'external-modal';
        const safeClass = this.isSafe ? 'safe' : ''; const subText = this.isSafe ? '安全站点' : '您即将访问外部网站'; const messageHtml = this.isSafe ? '安全的网站<br>将自动为您跳转，您也可点击「立即前往」手动跳转。' : '本站不对第三方内容负责'; const btnText = this.isSafe ? '立即前往' : '继续前往'; const btnSafeClass = this.isSafe ? 'safe' : '';
        modal.innerHTML = `<div class="external-modal-close">✕</div><div class="external-modal-content"><div class="external-modal-header"><span class="external-modal-domain ${safeClass}">${Utils.escapeHtml(hostname)}</span></div><div class="external-modal-sub">${subText}</div><div class="external-modal-url">${Utils.escapeHtml(url)}</div><div class="external-modal-message">${messageHtml}</div><div id="external-timer-area" class="external-modal-timer" style="${this.isSafe ? '' : 'display: none;'}"></div><div class="external-modal-buttons"><button class="external-modal-btn" id="external-cancel-btn">取消</button><button class="external-modal-btn external-modal-btn-primary ${btnSafeClass}" id="external-confirm-btn">${btnText}</button></div></div>`;
        document.body.appendChild(modal); this.currentModal = modal; this.currentOverlay = overlay;
        const closeBtn = modal.querySelector('.external-modal-close'); const cancelBtn = modal.querySelector('#external-cancel-btn'); const confirmBtn = modal.querySelector('#external-confirm-btn'); const timerArea = modal.querySelector('#external-timer-area');
        const handleClose = () => this.closeModal(); const handleConfirm = () => { if (this.redirectTriggered) return; this.clearTimer(); this.doRedirect(); };
        closeBtn.addEventListener('click', handleClose); cancelBtn.addEventListener('click', handleClose); confirmBtn.addEventListener('click', handleConfirm); overlay.addEventListener('click', handleClose);
        const escHandler = (e) => { if (e.key === 'Escape') { this.closeModal(); document.removeEventListener('keydown', escHandler); } }; document.addEventListener('keydown', escHandler);
        const originalClose = this.closeModal.bind(this); this.closeModal = () => { document.removeEventListener('keydown', escHandler); originalClose(); this.closeModal = originalClose; };
        requestAnimationFrame(() => { modal.classList.add('active'); overlay.classList.add('active'); });
        if (this.isSafe) this.startCountdown(timerArea);
        return true;
    }
    showErrorToast(message) { const toast = document.createElement('div'); toast.textContent = message; toast.style.cssText = `position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: var(--accent-color); color: white; padding: 10px 20px; border-radius: 40px; font-size: 0.9rem; z-index: 10000; box-shadow: var(--shadow-md); animation: fadeInUp 0.3s ease;`; document.body.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500); }
    handleLinkClick(e) { let target = e.target.closest('a'); if (!target) return; const href = target.getAttribute('href'); if (!href) return; if (this.isExternalLink(href)) { e.preventDefault(); e.stopPropagation(); this.showExternalLinkModal(href, target); } }
    init() { document.addEventListener('click', (e) => this.handleLinkClick(e)); console.log('[INFO] 外链跳转确认管理器已启动'); }
}

function isSameOrigin(href) { try { const url = new URL(href, window.location.href); return url.origin === window.location.origin; } catch { return false; } }
function getPageNameFromPath(pathname) { const name = pathname.split('/').pop() || 'index'; return name.replace('.html', '') || 'index'; }
function isArticleDetailOr404Page() { try { const path = window.location.pathname || ''; const name = path.split('/').pop() || ''; if (path.includes('/articles/') && name && name !== 'articles.html') return true; if (name === '404.html' || name === '404') return true; return false; } catch (e) { return false; } }

async function fetchAndReplaceContent(url, pushState = true) {
    try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Fetch失败: ${res.status}`);
        const text = await res.text(); const doc = new DOMParser().parseFromString(text, 'text/html'); const fetchedTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : document.title;
        const fetchedMain = doc.querySelector('#mainContent') || doc.querySelector('main.main-content-area') || doc.querySelector('main'); const currentMain = document.getElementById('mainContent') || document.querySelector('main.main-content-area');
        if (fetchedMain && currentMain) currentMain.innerHTML = fetchedMain.innerHTML;
        else if (fetchedMain && !currentMain) { const container = document.querySelector('.container') || document.body; container.innerHTML = fetchedMain.innerHTML; }
        document.title = fetchedTitle; if (pushState) try { window.history.pushState({ ajax: true }, fetchedTitle, url); } catch (err) { console.warn('[WARN] pushState 失败:', err); }
        try { const headStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style')); headStyles.forEach(h => { if (h.tagName.toLowerCase() === 'link') { const href = h.getAttribute('href') || h.href; if (!href) return; if (document.querySelector(`link[href="${href}"]`)) return; const nl = document.createElement('link'); nl.rel = 'stylesheet'; nl.href = href; document.head.appendChild(nl); } else if (h.tagName.toLowerCase() === 'style') { const existing = Array.from(document.head.querySelectorAll('style')).some(s => s.textContent === h.textContent); if (!existing) { const ns = document.createElement('style'); ns.textContent = h.textContent; document.head.appendChild(ns); } } }); } catch (e) { console.warn('[WARN] 注入样式时出错', e); }
        const bodyScripts = Array.from(doc.body.querySelectorAll('script')); const loadPromises = [];
        bodyScripts.forEach(s => { try { if (s.src) { if (document.querySelector(`script[src="${s.src}"]`)) return; const newS = document.createElement('script'); if (s.type) newS.type = s.type; newS.src = s.src; newS.async = false; const p = new Promise(resolve => { newS.onload = () => resolve(); newS.onerror = () => { console.warn('[WARN] 脚本加载失败:', s.src); resolve(); }; }); document.body.appendChild(newS); loadPromises.push(p); } else { const inline = document.createElement('script'); if (s.type) inline.type = s.type; inline.textContent = s.textContent; document.body.appendChild(inline); setTimeout(() => inline.parentNode && inline.parentNode.removeChild(inline), 0); } } catch (e) { console.warn('[WARN] 插入脚本时出错', e); } });
        if (loadPromises.length) try { await Promise.all(loadPromises); } catch (e) { console.warn('[WARN] 等待脚本加载时发生错误', e); }
        try { if (!document.querySelector('.container')) { const mainEl = document.querySelector('main') || document.getElementById('mainContent'); if (mainEl && !mainEl.closest('.container')) { const wrapper = document.createElement('div'); wrapper.className = 'container'; while (mainEl.firstChild) wrapper.appendChild(mainEl.firstChild); mainEl.appendChild(wrapper); } } } catch (e) { console.warn('[WARN] 修复缺失 .container 时出错', e); }
        try { const twikooEl = document.querySelector('#twikoo-comments'); if (twikooEl && typeof twikoo !== 'undefined' && twikoo && typeof twikoo.init === 'function' && !twikooEl.getAttribute('data-init')) { twikoo.init({ envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo', el: '#twikoo-comments', lang: 'zh-CN', enableComment: true }).then(() => { twikooEl.setAttribute('data-init', 'true'); console.log('[INFO] Twikoo 初始化（自动）成功'); }).catch(err => { console.warn('[WARN] Twikoo 自动初始化失败:', err); }); } } catch (e) { console.warn('[WARN] 尝试初始化 Twikoo 时出错', e); }
        NavigationManager.initNavigation(); NavigationManager.initMobileMenuToggle(); ScrollManager.initBackToTopButton();
        const personalCardContainer = document.getElementById('personal-card-container'); if (personalCardContainer) personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
        const pageName = getPageNameFromPath(new URL(url, window.location.href).pathname);
        if (pageName === 'index') { if (typeof updateDynamicGreeting === 'function') updateDynamicGreeting(); }
        else if (pageName === 'articles') await initializeArticlesPage();
        else if (pageName === 'works') await initializeWorksPage();
        window.dispatchEvent(new CustomEvent('ajax:navigation', { detail: { url, page: pageName } }));
        return true;
    } catch (e) { console.error('[ERROR] 无刷新导航加载失败:', e); return false; }
}

function formatRelativeTime(isoString) { const target = new Date(isoString); const now = new Date(); const diffMs = now - target; const diffMins = Math.floor(diffMs / (1000 * 60)); const diffHours = Math.floor(diffMs / (1000 * 60 * 60)); const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); if (diffMins < 1) return "刚刚"; if (diffMins < 60) return `${diffMins}分钟前`; if (diffHours < 24) return `${diffHours}小时前`; if (diffDays === 1) return "昨天"; if (diffDays === 2) return "前天"; if (diffDays <= 7) return `${diffDays}天前`; return target.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }); }

async function updateFooterUpdateTime() {
    const updateSpan = document.getElementById('footer-update-date'); if (!updateSpan) return;
    try { const response = await fetch('/json/statistics.json'); if (!response.ok) throw new Error('无法获取统计信息'); const stats = await response.json(); let fullTime = stats.last_updated_full; let dateOnly = stats.last_updated; if (fullTime) { const relative = formatRelativeTime(fullTime); updateSpan.textContent = relative; const absDate = new Date(fullTime); const formatted = `${absDate.getFullYear()}年${(absDate.getMonth() + 1).toString().padStart(2, '0')}月${absDate.getDate().toString().padStart(2, '0')}日 ${absDate.getHours().toString().padStart(2, '0')}:${absDate.getMinutes().toString().padStart(2, '0')}:${absDate.getSeconds().toString().padStart(2, '0')}`; updateSpan.setAttribute('title', `最后统计时间：${formatted}`); } else if (dateOnly) { updateSpan.textContent = dateOnly; updateSpan.setAttribute('title', '数据最后更新日期'); } else { updateSpan.textContent = '未知'; } } catch (error) { console.warn('[WARN] 加载统计时间失败:', error); updateSpan.textContent = '获取失败'; updateSpan.setAttribute('title', '无法加载 statistics.json'); }
}

function enableAjaxNavigation() {
    document.addEventListener('click', function (e) { const a = e.target.closest('a'); if (!a) return; const href = a.getAttribute('href'); if (!href) return; if (isArticleDetailOr404Page()) return; if (a.hasAttribute('data-no-ajax')) return; if (href.startsWith('#')) return; if (!isSameOrigin(href)) return; if (a.target === '_blank' || a.hasAttribute('download')) return; const isHtml = href.endsWith('.html') || href.indexOf('?') > -1 || href.endsWith('/'); if (!isHtml) return; e.preventDefault(); const url = new URL(href, window.location.href).href; if (url === window.location.href) return; fetchAndReplaceContent(url, true); }, { passive: false });
    window.addEventListener('popstate', function (e) { fetchAndReplaceContent(window.location.href, false); });
}

async function initializeArticlesPage() { try { const data = await DataManager.fetchData('articles'); const html = UIRenderer.generateListHTML(data, 'articles'); const container = document.getElementById('articles-list-container'); if (container) { container.innerHTML = html; new SearchController('articles'); initScrollReveal(); } } catch (e) { console.error('[ERROR] 加载文章数据失败:', e); } }
async function initializeWorksPage() { try { const data = await DataManager.fetchData('works'); const html = UIRenderer.generateListHTML(data, 'works'); const container = document.getElementById('works-list-container'); if (container) { container.innerHTML = html; new SearchController('works'); initScrollReveal(); } } catch (e) { console.error('[ERROR] 加载作品数据失败:', e); } }

// 动态加载图片查看器组件，确保主站引用
function loadImageViewer() {
    if (window.ImageViewer) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/js/image-viewer.js';
        script.onload = () => { console.log('[INFO] 图片查看器组件加载成功'); resolve(); };
        script.onerror = () => { console.warn('[WARN] 图片查看器组件加载失败'); reject(); };
        document.head.appendChild(script);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    window.ExternalLinkManager = new ExternalLinkManager();
    // 加载图片查看器组件（满足主站js引用要求）
    await loadImageViewer();
    const savedTheme = localStorage.getItem('theme'); const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; let initialTheme = savedTheme; if (!initialTheme) initialTheme = systemPrefersDark ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', initialTheme);
    await loadNavbar(); await loadFooter(); await updateFooterUpdateTime();
    setTimeout(() => { try { renderMathAndMermaid(document.body); } catch (e) { console.warn('[WARN] 初始 renderMathAndMermaid 失败', e); } }, 300);
    startSiteAgeUpdater();
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    if (currentPage === 'index') { updateDynamicGreeting(); setInterval(updateDynamicGreeting, 60000); }
    else if (currentPage === 'articles') initializeArticlesPage();
    else if (currentPage === 'works') initializeWorksPage();
    const personalCardContainer = document.getElementById('personal-card-container'); if (personalCardContainer) personalCardContainer.innerHTML = UIRenderer.generatePersonalCardHTML();
    ScrollManager.initBackToTopButton(); document.body.setAttribute('data-loaded', 'true'); initScrollReveal();
});
setTimeout(() => { if (!window.customCursorInstance) window.customCursorInstance = new CustomCursor(); }, 100);
enableAjaxNavigation();

// ==================== 全局图片查看器管理器（自动识别所有图片） ====================
class GlobalImageManager {
    static init() {
        // 使用事件委托，避免重复绑定，且对动态内容自动生效
        document.addEventListener('click', (e) => {
            // 获取实际点击的图片元素
            let img = e.target.closest('img');
            if (!img) return;

            // 跳过标记为忽略的图片（例如头像、图标等）
            if (img.closest('.no-image-viewer') || img.classList.contains('no-image-viewer')) return;
            // 跳过已在查看器内部的图片
            if (img.closest('.modern-image-viewer')) return;

            // 阻止冒泡和默认行为（防止触发父级链接）
            e.preventDefault();
            e.stopPropagation();

            // 确保 ImageViewer 已加载
            if (typeof window.ImageViewer === 'undefined') {
                console.warn('[ImageViewer] 组件未加载，尝试动态加载...');
                const script = document.createElement('script');
                script.src = '/js/image-viewer.js';
                script.onload = () => this.openViewerForImage(img);
                document.head.appendChild(script);
            } else {
                this.openViewerForImage(img);
            }
        });
    }

    static openViewerForImage(clickedImg) {
        // 确定图片所在的“画廊容器”（同一区域的所有图片视为一组）
        let container = clickedImg.closest('#mainContent, .article-body, .post-content, .list-item, main, .container, body');
        if (!container) container = document.body;

        // 收集容器内所有有效的图片（包括懒加载图片）
        const allImgs = container.querySelectorAll('img:not(.no-image-viewer):not(.viewer-image)');
        const gallery = [];
        let currentIndex = 0;

        allImgs.forEach((img, idx) => {
            // 获取真实图片地址（优先 data-src，其次 src，并过滤空值）
            let src = img.dataset.src || img.src;
            if (!src || src.startsWith('data:') && src.length < 100) return; // 跳过极小 base64 占位图
            if (img === clickedImg) currentIndex = gallery.length;

            gallery.push({
                src: src,
                alt: img.alt || img.title || ''
            });
        });

        if (gallery.length === 0) {
            console.warn('[ImageViewer] 未找到可展示的图片');
            return;
        }

        // 若当前点击的图片是懒加载未加载状态，预先加载它，再打开查看器
        const needPreload = clickedImg.dataset.src && (!clickedImg.src || clickedImg.src === '');
        if (needPreload) {
            const tempImg = new Image();
            tempImg.onload = () => {
                clickedImg.src = clickedImg.dataset.src;
                clickedImg.classList.remove('lazy-loading');
                clickedImg.classList.add('loaded');
                delete clickedImg.dataset.src;
                new window.ImageViewer(gallery, currentIndex);
            };
            tempImg.src = clickedImg.dataset.src;
        } else {
            new window.ImageViewer(gallery, currentIndex);
        }
    }
}

// 初始化全局图片查看器（仅需一次）
GlobalImageManager.init();