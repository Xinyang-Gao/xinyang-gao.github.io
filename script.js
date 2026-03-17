// 性能监控器
class PerformanceMonitor {
    constructor() {
        this.timers = new Map();
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
        this.timers.delete(label);
        return duration;
    }
}

const perf = new PerformanceMonitor();

// 通用工具
class Utils {
    static getUrlParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    static isDataExpired(raw, minutes = 5) {
        if (!raw) return true;
        try {
            const { _timestamp } = JSON.parse(raw);
            return !_timestamp || _timestamp < Date.now() - minutes * 60e3;
        } catch {
            console.error('解析缓存数据失败');
            return true;
        }
    }

    static validateData(data, type) {
        if (!data) return false;
        return {
            works: d => Array.isArray(d.works) && d.works.length,
            articles: d => Array.isArray(d.articles) && d.articles.length
        }[type]?.(data) || false;
    }
}

// 数据管理器
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

// 问候语
function updateDynamicGreeting() {
    const h = new Date().getHours();
    const slots = [
        { max: 7, text: '唔…好早啊…早上好！' },
        { max: 8, text: '早上好呀！希望今天是开心的一天呐' },
        { max: 11, text: '上午好！' },
        { max: 14, text: '中午好！记得吃午饭和午睡哦~' },
        { max: 18, text: '下午好！' },
        { max: 21, text: '晚上好呀！' },
        { max: 23, text: '夜深了，注意休息~' }
    ];
    const greeting = slots.find(s => h < s.max)?.text || '熬夜对身体不好的，要注意休息呀！';

    const el = document.getElementById('dynamic-greeting');
    if (el) {
        el.textContent = greeting;
        el.style.fontWeight = 'bold';
        // 颜色由 CSS 变量控制，这里不再硬编码
        el.style.color = ''; 
    }
}

// UI 渲染器
class UIRenderer {
    static generateTagsHTML(tags = []) {
        if (!tags.length) return '';
        return `<div class=\"tags\">${tags.map(t => `<span class=\"tag\">${t}</span>`).join('')}</div>`;
    }

    static generateListItem(item, type) {
        const tags = UIRenderer.generateTagsHTML(item.tag);
        return `
        <div class=\"list-item\" data-id=\"${item.id}\" data-type=\"${type}\">\n          <div class=\"list-item-header\">\n            <h3 class=\"list-item-title\">${item.title}</h3>\n            <div class=\"list-item-meta\"><span class=\"list-item-date\">${item.date}</span></div>\n          </div>\n          <p class=\"list-item-description\">${item.description}</p>\n          ${tags}\n        </div>`;
    }

    static generateListHTML(data, type) {
        perf.start(`生成${DataManager.TYPE_LABEL[type]}HTML`);
        if (!Utils.validateData(data, type)) {
            perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
            return `<div class=\"${type}-list\"><p>没有找到相关${DataManager.TYPE_LABEL[type]}！ >-<</p></div>`;
        }

        const list = (type === 'works' ? data.works : data.articles)
            .filter(i => !(i.tag && i.tag.includes('隐藏')));
        const html = `<div class=\"${type}-list\">${list.map(i => UIRenderer.generateListItem(i, type.slice(0, -1))).join('')}</div>`;
        perf.end(`生成${DataManager.TYPE_LABEL[type]}HTML`);
        return html;
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
            return doc.documentElement.innerHTML;
        }
        console.warn(`警告: ${selector} 未找到，追加内容`);
        return base + html;
    }
}

// 搜索控制器
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

            this.input.addEventListener('input', () => this.debounceSearch());
            this.field.addEventListener('change', () => this.handleSearch());

            this.updateTagFilters();
            this.handleSearch();
        });
    }

    debounceSearch() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.handleSearch(), 300);
    }

    handleSearch() {
        const q = this.input.value.trim();
        const f = this.field.value;
        this.filterContent(this.page, q, f);
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
            if (item.tag && Array.isArray(item.tag)) {
                item.tag.forEach(t => {
                    if (t !== '隐藏') tags.add(t);
                });
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

        allTags.forEach(tag => {
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

        let items = type === 'works' ? data.works : data.articles;

        if (this.selectedTags.length) {
            items = items.filter(item =>
                item.tag && Array.isArray(item.tag) &&
                item.tag.some(t => this.selectedTags.includes(t))
            );
        }

        if (query && field !== 'tag') {
            const ql = query.toLowerCase();
            items = items.filter(item => {
                switch (field) {
                    case 'title': return item.title.toLowerCase().includes(ql);
                    case 'date': return item.date.includes(query);
                    default:
                        return item.title.toLowerCase().includes(ql) ||
                            (item.tag && Array.isArray(item.tag) && item.tag.some(t => t.toLowerCase().includes(ql))) ||
                            item.date.includes(query);
                }
            });
        }

        const html = UIRenderer.generateListHTML({ [type]: items }, type);
        const container = document.getElementById(`${type}-list-container`);
        if (container) {
            container.innerHTML = html;
            this.setupItemsInteraction();
        }
    }

    setupItemsInteraction() {
        const content = document.getElementById('mainContent');
        if (content) {
            content.removeEventListener('click', PageManager.handleListItemClick);
            content.addEventListener('click', PageManager.handleListItemClick);
        }
    }

    destroy() {
        if (this.input) this.input.removeEventListener('input', this.debounceSearch);
        if (this.field) this.field.removeEventListener('change', this.handleSearch);
        clearTimeout(this.debounceTimer);
        SearchController.instances.delete(this.page);
    }
}

// 页面管理器
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
            let title = `${cfg.title} - GaoXinYang's website`;
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
            paper.className = 'draw-animation-paper container';
            document.body.appendChild(paper);
        }
        const rect = elements.container.getBoundingClientRect();
        const cs = window.getComputedStyle(elements.container);
        const pad = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(cs[`padding${k}`]));
        paper.style.cssText = `position: fixed; top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: ${rect.height}px; padding: ${pad.join(' ')}; border: var(--border-width) solid var(--border-color); box-shadow: var(--shadow-main), var(--shadow-offset), -var(--shadow-offset); border-radius: var(--border-radius-container); background: white; box-sizing: border-box; z-index: var(--z-index-animation-paper); opacity: 0; transform: translateY(100%) scale(0.95);`;
        
        // 暗黑模式下调整纸张背景色
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
                    if (pushState) window.history.pushState({ page }, pageTitle, `?page=${page}`);
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
    }

    static setupListItemsInteraction() {
        const content = document.getElementById('mainContent');
        if (content) {
            content.removeEventListener('click', PageManager.handleListItemClick);
            content.addEventListener('click', PageManager.handleListItemClick);
        }
    }

    static handleListItemClick(e) {
        const item = e.target.closest('.list-item');
        if (!item) return;
        const id = parseInt(item.dataset.id, 10);
        const type = item.dataset.type;
        if (isNaN(id)) return;
        type === 'work' ? PageManager.handleWorkItemClick(id) : PageManager.handleArticleItemClick(id);
    }

    static handleWorkItemClick(workId) {
        const data = this.getData('works');
        if (data) {
            const work = data.works.find(w => w.id === workId);
            if (work) PageManager.showWorkDetails(work);
        }
    }

    static handleArticleItemClick(articleId) {
        const data = this.getData('articles');
        if (data) {
            const article = data.articles.find(a => a.id === articleId);
            if (article) window.open(`/articles/?article=${encodeURIComponent(article.title)}`, '_blank');
        }
    }

    static getData(type) {
        const raw = localStorage.getItem(`${type}Data`);
        if (!raw) return null;
        try {
            const d = JSON.parse(raw);
            return Utils.validateData(d, type) ? d : null;
        } catch { return null; }
    }

    static showWorkDetails(work) {
        if (document.querySelector('.work-details-envelope.active')) return;
        const envelope = document.createElement('div');
        envelope.className = 'work-details-envelope';
        const tags = work.tag && work.tag.length ? `<div class="work-details-tag"><strong>标签:</strong>${work.tag.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : '';
        envelope.innerHTML = `
        <div class="work-details-close">✕</div>
        <div class="work-details-content">
          <h2 class="work-details-title">${work.title}</h2>
          <p class="work-details-description">${work.description}</p>
          ${tags}
          ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
        </div>`;
        document.body.appendChild(envelope);
        const closeBtn = envelope.querySelector('.work-details-close');
        function close() {
            envelope.classList.remove('active');
            envelope.classList.add('closing');
            setTimeout(() => envelope.parentNode?.removeChild(envelope), 400);
        }
        closeBtn.addEventListener('click', close);
        requestAnimationFrame(() => {
            envelope.classList.add('active');
            document.body.addEventListener('click', function fn(e) {
                if (!envelope.contains(e.target) && e.target !== closeBtn) { close(); document.body.removeEventListener('click', fn); }
            }, { once: true });
        });
    }
}

// 导航管理器
class NavigationManager {
    static initMobileMenuToggle() {
        const toggle = document.querySelector('.mobile-toggle');
        const nav = document.getElementById('navbarNav');
        if (!toggle || !nav) return;
        toggle.addEventListener('click', function () { nav.classList.toggle('active'); this.classList.toggle('active'); });
        document.querySelectorAll('.nav-item').forEach(i => i.addEventListener('click', () => { nav.classList.remove('active'); toggle.classList.remove('active'); }));
    }

    static initNavigation() {
        // 在多页面模式下，导航链接是直接的 HTML 链接，不需要 JavaScript 处理
        // 但可以设置 active 状态
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
        document.querySelectorAll('.nav-item').forEach(item => {
            const page = item.getAttribute('data-page');
            if (page === currentPage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    static initPopstate() {
        window.addEventListener('popstate', e => {
            const p = e.state?.page || 'index';
            PageManager.loadPage(p, false);
        });
    }
    
    // 新增：初始化主题切换
    static initThemeToggle() {
        const themeToggleBtn = document.getElementById('theme-toggle');
        if (!themeToggleBtn) return;

        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('theme', theme);
        };

        // 检查本地存储或系统偏好
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme) {
            applyTheme(savedTheme);
        } else if (systemPrefersDark) {
            applyTheme('dark');
        }

        // 监听按钮点击
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });
        
        // 监听系统主题变化 (如果用户没有手动设置过)
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
}

// 滚动管理器
class ScrollManager {
    static initBackToTopButton() {
        const btn = document.getElementById('backToTopBtn');
        if (!btn) return;
        const threshold = 300;
        window.addEventListener('scroll', () => {
            btn.classList.toggle('show', window.scrollY > threshold);
        }, { passive: true });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
}

// 加载导航栏
async function loadNavbar() {
    try {
        const response = await fetch('/navbar.html');
        if (!response.ok) throw new Error('Failed to load navbar');
        const navbarHTML = await response.text();
        const placeholder = document.getElementById('navbar-placeholder');
        if (placeholder) {
            placeholder.innerHTML = navbarHTML;
            // 导航栏加载后，初始化主题切换功能
            NavigationManager.initThemeToggle();
        } else {
            console.warn('Navbar placeholder not found');
        }
    } catch (error) {
        console.error('Error loading navbar:', error);
    }
}

// 主初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 在加载导航栏之前，先尝试应用保存的主题，防止闪烁
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (systemPrefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    await loadNavbar();
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    if (currentPage === 'index') {
        updateDynamicGreeting();
    } else if (currentPage === 'articles') {
        initializeArticlesPage();
    } else if (currentPage === 'works') {
        initializeWorksPage();
    }
    NavigationManager.initNavigation();
    NavigationManager.initMobileMenuToggle();
    ScrollManager.initBackToTopButton();
    document.body.setAttribute('data-loaded', 'true');
});

async function initializeArticlesPage() {
    try {
        const data = await DataManager.fetchData('articles');
        const html = UIRenderer.generateListHTML(data, 'articles');
        const container = document.getElementById('articles-list-container');
        if (container) {
            container.innerHTML = html;
            new SearchController('articles');
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
        }
    } catch (e) {
        console.error('加载作品数据失败:', e);
    }
}