/**
 * 性能监控器 - 现代化重构版本
 * @version 2.0.0
 */
class PerformanceMonitor {
    #timers = new Map();
    #metrics = [];
    #slowThreshold = 100;

    start(label) {
        if (this.#timers.has(label)) {
            console.warn(`计时器 "${label}" 已在运行中`);
            return;
        }
        this.#timers.set(label, performance.now());
    }

    end(label) {
        const startTime = this.#timers.get(label);
        if (!startTime) {
            console.warn(`计时器 "${label}" 不存在`);
            return null;
        }

        const duration = performance.now() - startTime;
        const isSlow = duration > this.#slowThreshold;
        
        if (isSlow) {
            console.log(`${label}: ${duration.toFixed(2)}ms (慢)`);
        }

        this.#metrics.push({ label, duration, timestamp: Date.now() });
        this.#timers.delete(label);
        
        return duration;
    }

    getMetrics() {
        return [...this.#metrics.slice(-50)];
    }

    clearMetrics() {
        this.#metrics = [];
    }
}

// 全局性能监控实例
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
            return !_timestamp || _timestamp < Date.now() - minutes * 60_000;
        } catch {
            console.error('解析缓存数据失败');
            return true;
        }
    }

    static validateData(data, type) {
        if (!data) return false;
        
        const validators = {
            works: (d) => Array.isArray(d.works) && d.works.length > 0,
            articles: (d) => Array.isArray(d.articles) && d.articles.length > 0
        };
        
        return validators[type]?.(data) ?? false;
    }
    
    static getTags(item) {
        return item.tags?.filter(Boolean) ?? item.tag?.filter(Boolean) ?? [];
    }
    
    static debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }
    
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 数据管理器
 */
class DataManager {
    static #TYPE_CONFIG = {
        works: {
            url: 'works.json',
            cacheKey: 'worksData',
            cacheControl: 'no-cache',
            label: '作品'
        },
        articles: {
            url: 'articles.json',
            cacheKey: 'articlesData',
            cacheControl: 'default',
            label: '文章'
        }
    };

    static async fetchData(type, useCache = true) {
        const config = this.#TYPE_CONFIG[type];
        if (!config) throw new Error(`未知数据类型: ${type}`);

        perf.start(`获取${config.label}数据`);

        try {
            // 尝试从缓存获取
            if (useCache) {
                const cachedData = this.#getCachedData(config.cacheKey, type);
                if (cachedData) {
                    perf.end(`获取${config.label}数据`);
                    return cachedData;
                }
            }

            // 从服务器获取
            console.log(`📥 从服务器获取${config.label}数据`);
            const data = await this.#fetchFromServer(config);
            
            // 保存到缓存
            this.#saveToCache(config.cacheKey, data);
            
            perf.end(`获取${config.label}数据`);
            return data;
        } catch (error) {
            perf.end(`获取${config.label}数据`);
            console.error(`获取${config.label}数据失败:`, error);
            throw error;
        }
    }

    static #getCachedData(cacheKey, type) {
        const raw = localStorage.getItem(cacheKey);
        if (!raw || Utils.isDataExpired(raw)) return null;

        try {
            const parsed = JSON.parse(raw);
            delete parsed._timestamp;
            return Utils.validateData(parsed, type) ? parsed : null;
        } catch {
            console.warn('缓存数据无效');
            return null;
        }
    }

    static async #fetchFromServer(config) {
        const options = {
            headers: { 'Cache-Control': config.cacheControl }
        };
        
        if (config.cacheControl === 'no-cache') {
            options.cache = 'no-store';
        }

        const response = await fetch(config.url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        if (!Utils.validateData(data, config.url.split('.')[0])) {
            throw new Error('数据格式无效');
        }
        
        return data;
    }

    static #saveToCache(cacheKey, data) {
        localStorage.setItem(cacheKey, JSON.stringify({
            ...data,
            _timestamp: Date.now()
        }));
    }
}

/**
 * 问候语管理器
 */
class GreetingManager {
    static #GREETING_SLOTS = [
        { max: 7, text: '唔…好早啊…早上好！' },
        { max: 8, text: '早上好呀！希望今天是开心的一天呐' },
        { max: 11, text: '上午好！' },
        { max: 14, text: '中午好！记得吃午饭和午睡哦~' },
        { max: 18, text: '下午好！' },
        { max: 21, text: '晚上好呀！' },
        { max: 23, text: '夜深了，注意休息~' }
    ];
    static #DEFAULT_GREETING = '熬夜对身体不好的，要注意休息呀！';

    static update() {
        const hour = new Date().getHours();
        const greeting = this.#GREETING_SLOTS.find(slot => hour < slot.max)?.text ?? this.#DEFAULT_GREETING;
        
        const element = document.getElementById('dynamic-greeting');
        if (element) {
            element.textContent = greeting;
            element.style.fontWeight = 'bold';
        }
    }
}

/**
 * UI渲染器
 */
class UIRenderer {
    static #HTML_ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    };

    static escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, char => this.#HTML_ESCAPE_MAP[char]);
    }

    static generateTagsHTML(item) {
        const tags = Utils.getTags(item);
        if (!tags.length) return '';
        
        const tagsHTML = tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('');
        return `<div class="tags">${tagsHTML}</div>`;
    }

    static generateListItem(item, type, index) {
        const tagsHTML = this.generateTagsHTML(item);
        const escapedTitle = this.escapeHtml(item.title);
        const escapedDate = this.escapeHtml(item.date);
        const escapedDescription = this.escapeHtml(item.description || '');

        if (type === 'article') {
            return this.#generateArticleItem(item, escapedTitle, escapedDate, escapedDescription, tagsHTML, index);
        }
        
        return this.#generateWorkItem(item, escapedTitle, escapedDate, escapedDescription, tagsHTML, index);
    }

    static #generateArticleItem(item, title, date, description, tagsHTML, index) {
        const itemUrl = item.url || '';
        const author = this.escapeHtml(item.author || '未知作者');
        const wordCount = item.word_count ? `<span class="article-word-count">${item.word_count} 字</span>` : '';
        const readTime = item.read_time ? `<span class="article-read-time"><i class="far fa-clock"></i> ${this.escapeHtml(item.read_time)}</span>` : '';

        return `
            <div class="list-item" data-url="${this.escapeHtml(itemUrl)}" data-type="article" data-index="${index}">
                <div class="list-item-header">
                    <h3 class="list-item-title">${title}</h3>
                    <div class="list-item-meta">
                        <span class="list-item-date">${date}</span>
                    </div>
                </div>
                <div class="article-meta-info">
                    <span class="article-author">${author}</span>
                    ${wordCount}
                    ${readTime}
                </div>
                <p class="list-item-description">${description}</p>
                ${tagsHTML}
            </div>`;
    }

    static #generateWorkItem(item, title, date, description, tagsHTML, index) {
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
                    <h3 class="list-item-title">${title}</h3>
                    <div class="list-item-meta">
                        <span class="list-item-date">${date}</span>
                    </div>
                </div>
                <p class="list-item-description">${description}</p>
                ${tagsHTML}
            </div>`;
    }

    static generateListHTML(data, type) {
        perf.start(`生成${DataManager.TYPE_LABEL?.[type] || type}HTML`);
        
        if (!Utils.validateData(data, type)) {
            perf.end(`生成${type}HTML`);
            return `<div class="${type}-list"><p>没有找到相关${type}！ >-<</p></div>`;
        }

        const items = type === 'works' ? data.works : data.articles;
        const filteredItems = items.filter(item => !Utils.getTags(item).includes('隐藏'));
        const itemsHTML = filteredItems.map((item, idx) => this.generateListItem(item, type.slice(0, -1), idx)).join('');
        
        const html = `<div class="${type}-list">${itemsHTML}</div>`;
        perf.end(`生成${type}HTML`);
        
        return html;
    }

    static async fetchPageContent(url) {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(response.status === 404 ? '404' : `HTTP错误! 状态码: ${response.status}`);
        }
        
        return response.text();
    }

    static replaceContainerContent(baseHTML, selector, newContent) {
        const doc = new DOMParser().parseFromString(baseHTML, 'text/html');
        const container = doc.querySelector(selector);
        
        if (container) {
            container.innerHTML = newContent;
            return doc.documentElement.innerHTML;
        }
        
        console.warn(`警告: ${selector} 未找到，追加内容`);
        return baseHTML + newContent;
    }
}

/**
 * 搜索控制器 - 增强版
 */
class SearchController {
    static #instances = new Map();

    constructor(page) {
        // 清理已存在的实例
        if (SearchController.#instances.has(page)) {
            SearchController.#instances.get(page).destroy();
        }

        this.page = page;
        this.input = null;
        this.field = null;
        this.selectedTags = new Set();
        this.debouncedSearch = Utils.debounce(() => this.performSearch(), 300);

        SearchController.#instances.set(page, this);
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

            this.input.addEventListener('input', () => this.debouncedSearch());
            this.field.addEventListener('change', () => this.performSearch());

            this.updateTagFilters();
            this.performSearch();
        });
    }

    performSearch() {
        const query = this.input?.value.trim() ?? '';
        const field = this.field?.value ?? '';
        this.filterContent(this.page, query, field);
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
        if (!data) return new Set();
        
        const items = this.page === 'works' ? data.works : data.articles;
        const tags = new Set();
        
        for (const item of items) {
            const itemTags = Utils.getTags(item);
            for (const tag of itemTags) {
                if (tag !== '隐藏') tags.add(tag);
            }
        }
        
        return tags;
    }

    updateTagFilters() {
        if (!['works', 'articles'].includes(this.page)) return;
        
        const container = document.getElementById(`${this.page}-tags-filter`);
        if (!container) return;

        container.replaceChildren();
        
        const label = document.createElement('span');
        label.className = 'filter-label';
        label.textContent = '按标签筛选:';
        container.appendChild(label);

        const allTags = this.getAllTags();
        if (allTags.size === 0) {
            const message = document.createElement('span');
            message.textContent = '暂无标签';
            message.style.color = '#888';
            container.appendChild(message);
            return;
        }

        // 添加标签按钮
        const sortedTags = [...allTags].sort();
        for (const tag of sortedTags) {
            const button = this.#createTagButton(tag);
            container.appendChild(button);
        }

        // 添加清除按钮
        const clearButton = this.#createClearButton();
        container.appendChild(clearButton);
    }

    #createTagButton(tag) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tag-button';
        button.textContent = tag;
        button.dataset.tag = tag;
        button.addEventListener('click', () => this.toggleTag(tag, button));
        return button;
    }

    #createClearButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tag-button';
        button.textContent = '清除筛选';
        button.style.marginLeft = 'auto';
        button.addEventListener('click', () => this.clearAllTags());
        return button;
    }

    toggleTag(tag, button) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
            button.classList.remove('active');
        } else {
            this.selectedTags.add(tag);
            button.classList.add('active');
        }
        this.performSearch();
    }

    clearAllTags() {
        this.selectedTags.clear();
        
        const buttons = document.querySelectorAll(`#${this.page}-tags-filter .tag-button:not(:last-child)`);
        buttons.forEach(button => button.classList.remove('active'));
        
        this.performSearch();
    }

    filterContent(type, query, field) {
        const data = this.getCachedData(type);
        if (!data) return;

        let items = type === 'works' ? [...data.works] : [...data.articles];

        // 标签筛选
        if (this.selectedTags.size > 0) {
            items = items.filter(item => {
                const itemTags = Utils.getTags(item);
                return itemTags.some(tag => this.selectedTags.has(tag));
            });
        }

        // 文本搜索
        if (query?.trim()) {
            const searchQuery = query.toLowerCase().trim();
            items = items.filter(item => this.#matchesSearch(item, searchQuery, field));
        }

        const html = UIRenderer.generateListHTML({ [type]: items }, type);
        const container = document.getElementById(`${type}-list-container`);
        
        if (container) {
            container.innerHTML = html;
            this.#setupItemsInteraction();
        }
    }

    #matchesSearch(item, query, field) {
        const searchFields = {
            title: () => item.title.toLowerCase().includes(query),
            tag: () => {
                const tags = Utils.getTags(item);
                return tags.some(tag => tag.toLowerCase().includes(query));
            },
            date: () => item.date.includes(query),
            default: () => item.title.toLowerCase().includes(query) ||
                         Utils.getTags(item).some(tag => tag.toLowerCase().includes(query)) ||
                         item.date.includes(query)
        };
        
        const searchMethod = searchFields[field] ?? searchFields.default;
        return searchMethod();
    }

    #setupItemsInteraction() {
        const content = document.getElementById('mainContent');
        if (content) {
            content.removeEventListener('click', PageManager.handleListItemClick);
            content.addEventListener('click', PageManager.handleListItemClick);
        }
    }

    destroy() {
        this.input?.removeEventListener('input', this.debouncedSearch);
        this.field?.removeEventListener('change', this.performSearch);
        SearchController.#instances.delete(this.page);
    }
}

/**
 * 页面管理器 - 现代化页面路由
 */
class PageManager {
    static #pageConfig = {
        about: { title: '关于', type: 'normal' },
        articles: { title: '文章', type: 'list' },
        contact: { title: '联系', type: 'normal' },
        works: { title: '作品', type: 'list' }
    };

    static async loadPage(page, pushState = true) {
        perf.start(`加载页面: ${page}`);
        
        const config = this.#pageConfig[page] ?? { title: "GXY's website", type: 'normal' };
        
        try {
            const { content, title } = await this.#fetchPageContent(page, config);
            await this.#performPageTransition(content, page, title, pushState);
        } catch (error) {
            console.error('页面加载失败:', error);
            const errorContent = '<h2>加载失败</h2><p>哎呀！加载页面时出了点问题……要不刷新试试？</p>';
            await this.#performPageTransition(errorContent, 'error', '加载失败 - GXY\'s website', pushState);
        } finally {
            perf.end(`加载页面: ${page}`);
        }
    }

    static async #fetchPageContent(page, config) {
        let content;
        let title = `${config.title} - GaoXinYang's website`;
        
        if (config.type === 'list') {
            const baseHTML = await UIRenderer.fetchPageContent(`pages/${page}.html`);
            const data = await DataManager.fetchData(page);
            const listHTML = UIRenderer.generateListHTML(data, page);
            content = UIRenderer.replaceContainerContent(baseHTML, `#${page}-list-container`, listHTML);
        } else if (page === '404') {
            content = '<h2>页面未找到</h2><p>抱歉，您访问的页面不存在。</p>';
            title = '404 - 页面未找到';
        } else {
            content = await UIRenderer.fetchPageContent(`pages/${page}.html`);
        }
        
        return { content, title };
    }

    static async #performPageTransition(content, page, pageTitle, pushState) {
        const elements = {
            container: document.querySelector('.container'),
            content: document.getElementById('mainContent'),
            pageTransition: document.getElementById('pageTransition'),
            navItems: document.querySelectorAll('.nav-item')
        };

        if (!elements.container) return;

        // 显示过渡动画
        elements.pageTransition?.classList.add('active');
        
        // 创建动画纸张
        const paper = this.#createAnimationPaper(content, elements.container);
        
        // 执行动画
        await this.#animatePageTransition(paper, elements, content, page, pageTitle, pushState);
    }

    static #createAnimationPaper(content, container) {
        const rect = container.getBoundingClientRect();
        const styles = window.getComputedStyle(container);
        const paddings = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(styles[`padding${k}`]));
        
        const paper = document.createElement('div');
        paper.className = 'draw-animation-paper container';
        paper.innerHTML = content;
        paper.style.cssText = `
            position: fixed;
            top: ${rect.top}px;
            left: ${rect.left}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            padding: ${paddings.join(' ')}px;
            border: var(--border-width) solid var(--border-color);
            box-shadow: var(--shadow-main), var(--shadow-offset), -var(--shadow-offset);
            border-radius: var(--border-radius-container);
            background: ${document.documentElement.getAttribute('data-theme') === 'dark' ? '#222' : 'white'};
            box-sizing: border-box;
            z-index: var(--z-index-animation-paper);
            opacity: 0;
            transform: translateY(100%) scale(0.95);
        `;
        
        document.body.appendChild(paper);
        return paper;
    }

    static #animatePageTransition(paper, elements, content, page, pageTitle, pushState) {
        return new Promise(resolve => {
            elements.content?.classList.add('fade-out-shrink');
            
            requestAnimationFrame(() => {
                paper.style.transform = 'translate(0, 0) scale(1)';
                paper.style.opacity = '1';
                
                paper.addEventListener('animationend', () => {
                    this.#finalizePageTransition(paper, elements, content, page, pageTitle, pushState);
                    resolve();
                }, { once: true });
            });
        });
    }

    static #finalizePageTransition(paper, elements, content, page, pageTitle, pushState) {
        if (elements.content) {
            elements.content.innerHTML = content;
            elements.content.classList.remove('fade-out-shrink');
        }
        
        document.title = pageTitle;
        
        if (pushState) {
            window.history.pushState({ page }, pageTitle, `?page=${page}`);
        }
        
        elements.navItems?.forEach(item => {
            const isActive = item.getAttribute('data-page') === page;
            item.classList.toggle('active', isActive);
        });
        
        paper.remove();
        elements.pageTransition?.classList.remove('active');
        
        this.initializePageFeatures(page);
    }

    static initializePageFeatures(page) {
        if (['works', 'articles'].includes(page)) {
            new SearchController(page);
        }
        
        if (page === 'index') {
            GreetingManager.update();
        }
        
        this.setupListItemsInteraction();
    }

    static setupListItemsInteraction() {
        const content = document.getElementById('mainContent');
        if (content) {
            content.removeEventListener('click', this.handleListItemClick);
            content.addEventListener('click', this.handleListItemClick);
        }
    }

    static handleListItemClick = (event) => {
        const item = event.target.closest('.list-item');
        if (!item) return;
        
        const { type, workInfo, url } = item.dataset;
        
        if (type === 'work' && workInfo) {
            try {
                const work = JSON.parse(decodeURIComponent(workInfo));
                this.showWorkDetails(work);
            } catch (error) {
                console.error('解析作品信息失败', error);
            }
        } else if (type === 'article' && url) {
            window.open(url, '_blank');
        }
    };

    static #currentModalClose = null;

    static showWorkDetails(work) {
        // 关闭已存在的模态框
        this.#currentModalClose?.();
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
        
        const modal = document.createElement('div');
        modal.className = 'work-details-envelope';
        
        const tags = work.tags ?? [];
        const tagsHTML = tags.length ? `
            <div class="work-details-tag">
                <strong>标签:</strong>
                ${tags.map(tag => `<span class="tag">${UIRenderer.escapeHtml(tag)}</span>`).join('')}
            </div>
        ` : '';
        
        modal.innerHTML = `
            <div class="work-details-close">✕</div>
            <div class="work-details-content">
                <h2 class="work-details-title">${UIRenderer.escapeHtml(work.title)}</h2>
                <p class="work-details-description">${UIRenderer.escapeHtml(work.description || '')}</p>
                ${tagsHTML}
                ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeModal = () => {
            if (modal.classList.contains('closing')) return;
            
            modal.classList.add('closing');
            overlay.classList.remove('active');
            
            setTimeout(() => {
                modal.remove();
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
                
                if (this.#currentModalClose === closeModal) {
                    this.#currentModalClose = null;
                }
            }, 400);
        };
        
        const escHandler = (event) => {
            if (event.key === 'Escape') closeModal();
        };
        
        document.addEventListener('keydown', escHandler);
        overlay.addEventListener('click', closeModal);
        modal.querySelector('.work-details-close')?.addEventListener('click', closeModal);
        
        this.#currentModalClose = closeModal;
        
        requestAnimationFrame(() => {
            modal.classList.add('active');
            overlay.classList.add('active');
        });
    }
}

/**
 * 导航管理器 - 统一导航控制
 */
class NavigationManager {
    static initMobileMenuToggle() {
        const toggle = document.querySelector('.mobile-toggle');
        const nav = document.getElementById('navbarNav');
        
        if (!toggle || !nav) return;
        
        toggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            toggle.classList.toggle('active');
        });
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                nav.classList.remove('active');
                toggle.classList.remove('active');
            });
        });
    }

    static initNavigation() {
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
        
        document.querySelectorAll('.nav-item').forEach(item => {
            const page = item.getAttribute('data-page');
            item.classList.toggle('active', page === currentPage);
        });
    }

    static initPopstate() {
        window.addEventListener('popstate', event => {
            const page = event.state?.page || 'index';
            PageManager.loadPage(page, false);
        });
    }
    
    static initThemeToggle() {
        const checkbox = document.getElementById('theme-toggle-checkbox');
        if (!checkbox) return;
        
        const setTheme = (theme, updateCheckbox = true) => {
            const root = document.documentElement;
            const currentTheme = root.getAttribute('data-theme');
            if (currentTheme === theme) return;
            
            // 添加过渡动画
            this.#animateThemeTransition(theme);
            
            root.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            
            if (updateCheckbox) {
                checkbox.checked = theme === 'dark';
            }
            
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
        };
        
        checkbox.addEventListener('change', event => {
            const newTheme = event.target.checked ? 'dark' : 'light';
            setTheme(newTheme, false);
        });
        
        // 初始化主题
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme ?? (systemPrefersDark ? 'dark' : 'light');
        
        document.documentElement.setAttribute('data-theme', initialTheme);
        checkbox.checked = initialTheme === 'dark';
        
        // 监听系统主题变化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            if (!localStorage.getItem('theme')) {
                const newTheme = event.matches ? 'dark' : 'light';
                setTheme(newTheme, true);
            }
        });
    }
    
    static #animateThemeTransition(theme) {
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
        
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
        
        setTimeout(() => {
            overlay.remove();
        }, 400);
    }
}

/**
 * 滚动管理器 - 统一滚动控制
 */
class ScrollManager {
    static #SCROLL_THRESHOLD = 300;
    
    static initBackToTopButton() {
        const button = document.getElementById('backToTopBtn');
        if (!button) return;
        
        const handleScroll = Utils.throttle(() => {
            button.classList.toggle('show', window.scrollY > this.#SCROLL_THRESHOLD);
        }, 100);
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        button.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

/**
 * 自定义光标 - 优化版
 */
class CustomCursor {
    #config = {
        damping: 0.92,
        stiffness: 0.18,
        rotationSmoothing: 0.2,
        minSpeedForRotation: 0.5
    };
    
    #position = { targetX: 0, targetY: 0, currentX: 0, currentY: 0 };
    #velocity = { x: 0, y: 0, lastX: 0, lastY: 0, lastTime: 0 };
    #rotation = { current: 0, target: 0 };
    #scale = 0.55;
    #snappedMode = { active: false, element: null };
    #animationId = null;
    #visible = false;
    
    constructor() {
        // 触摸设备跳过
        if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
            console.log('触摸设备，跳过自定义光标');
            return;
        }
        
        this.#initDOM();
        this.#initEvents();
        this.#updateColors();
        this.#startAnimation();
        
        // 监听主题变化
        window.addEventListener('themeChanged', () => this.#updateColors());
        
        // 监听主题属性变化
        new MutationObserver(() => this.#updateColors())
            .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    
    #initDOM() {
        this.container = document.createElement('div');
        this.container.className = 'custom-cursor';
        document.body.appendChild(this.container);
        
        const svg = this.#createCursorSVG();
        this.container.appendChild(svg);
        this.svg = svg;
        
        this.dot = document.createElement('div');
        this.dot.className = 'custom-cursor-dot';
        document.body.appendChild(this.dot);
    }
    
    #createCursorSVG() {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '50');
        svg.setAttribute('height', '54');
        svg.setAttribute('viewBox', '0 0 50 54');
        svg.style.cssText = 'width: 50px; height: 54px; display: block';
        
        this.fillPath = document.createElementNS(svgNS, 'path');
        this.fillPath.setAttribute('d', 'M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z');
        
        this.strokePath = document.createElementNS(svgNS, 'path');
        this.strokePath.setAttribute('d', 'M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z');
        this.strokePath.setAttribute('stroke-width', '2.5');
        this.strokePath.setAttribute('fill', 'none');
        
        svg.appendChild(this.fillPath);
        svg.appendChild(this.strokePath);
        
        return svg;
    }
    
    #updateColors() {
        const accentColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-color').trim() || '#a55860';
        
        this.fillPath.setAttribute('fill', accentColor);
        this.strokePath.setAttribute('stroke', '#ffffff');
    }
    
    #initEvents() {
        window.addEventListener('mousemove', (event) => this.#handleMouseMove(event));
        window.addEventListener('mouseleave', () => this.#handleMouseLeave());
        window.addEventListener('mouseenter', () => this.#handleMouseEnter());
        window.addEventListener('scroll', () => this.#updateSnappedPosition());
        window.addEventListener('resize', () => this.#updateSnappedPosition());
    }
    
    #handleMouseMove(event) {
        if (!this.#visible) {
            this.#visible = true;
            this.container.classList.add('visible');
            document.body.classList.add('custom-cursor-enabled');
        }
        
        const elementUnderCursor = document.elementsFromPoint(event.clientX, event.clientY)[0];
        const isClickable = elementUnderCursor?.matches?.(
            'a, button, .nav-item, .list-item, [role="button"], [data-clickable], .tag-button, .work-details-close, ' +
            'input, textarea, select, [contenteditable="true"]'
        );
        
        if (isClickable) {
            if (!this.#snappedMode.active || this.#snappedMode.element !== elementUnderCursor) {
                this.#enterSnappedMode(elementUnderCursor);
            }
            this.#updateDotPosition(event.clientX, event.clientY);
        } else if (this.#snappedMode.active) {
            this.#exitSnappedMode();
        }
        
        // 更新速度
        const now = performance.now();
        if (this.#velocity.lastTime) {
            const delta = Math.min(50, Math.max(1, now - this.#velocity.lastTime));
            this.#velocity.x = (event.clientX - this.#velocity.lastX) / delta;
            this.#velocity.y = (event.clientY - this.#velocity.lastY) / delta;
        }
        
        this.#velocity.lastX = event.clientX;
        this.#velocity.lastY = event.clientY;
        this.#velocity.lastTime = now;
        
        if (!this.#snappedMode.active) {
            this.#position.targetX = event.clientX;
            this.#position.targetY = event.clientY;
            
            const speed = Math.hypot(this.#velocity.x, this.#velocity.y);
            if (speed > this.#config.minSpeedForRotation) {
                const angle = Math.atan2(this.#velocity.y, this.#velocity.x) * 180 / Math.PI + 90;
                this.#rotation.target = angle;
            } else {
                this.#rotation.target = 0;
            }
        } else {
            this.#rotation.target = -45;
        }
    }
    
    #handleMouseLeave() {
        this.#visible = false;
        this.container.classList.remove('visible');
        document.body.classList.remove('custom-cursor-enabled');
        
        if (this.#snappedMode.active) {
            this.#exitSnappedMode();
        }
    }
    
    #handleMouseEnter() {
        if (this.#position.targetX !== undefined) {
            this.#visible = true;
            this.container.classList.add('visible');
            document.body.classList.add('custom-cursor-enabled');
        }
    }
    
    #enterSnappedMode(element) {
        if (!element) return;
        
        this.#snappedMode.active = true;
        this.#snappedMode.element = element;
        this.dot.style.display = 'block';
        this.#updateSnappedPosition();
        this.#rotation.target = 45;
    }
    
    #exitSnappedMode() {
        this.#snappedMode.active = false;
        this.#snappedMode.element = null;
        this.dot.style.display = 'none';
        this.#rotation.target = 0;
    }
    
    #updateSnappedPosition() {
        if (!this.#snappedMode.active || !this.#snappedMode.element) return;
        
        const rect = this.#snappedMode.element.getBoundingClientRect();
        this.#position.targetX = rect.right;
        this.#position.targetY = rect.bottom;
    }
    
    #updateDotPosition(x, y) {
        if (this.dot) {
            this.dot.style.transform = `translate(${x}px, ${y}px)`;
        }
    }
    
    #startAnimation() {
        const animate = () => {
            if (this.#snappedMode.active && this.#snappedMode.element) {
                this.#updateSnappedPosition();
            }
            
            // 更新位置
            const dx = this.#position.targetX - this.#position.currentX;
            const dy = this.#position.targetY - this.#position.currentY;
            
            this.#position.currentX += dx * this.#config.stiffness;
            this.#position.currentY += dy * this.#config.stiffness;
            this.#position.currentX += dx * 0.3;
            this.#position.currentY += dy * 0.3;
            
            // 更新旋转
            let rotationDiff = this.#rotation.target - this.#rotation.current;
            if (Math.abs(rotationDiff) > 180) {
                rotationDiff -= Math.sign(rotationDiff) * 360;
            }
            this.#rotation.current += rotationDiff * this.#config.rotationSmoothing;
            
            // 应用变换
            this.svg.style.transform = `translate(-50%, -50%) rotate(${this.#rotation.current}deg) scale(${this.#scale})`;
            this.container.style.transform = `translate(${this.#position.currentX}px, ${this.#position.currentY}px)`;
            
            this.#animationId = requestAnimationFrame(animate);
        };
        
        this.#animationId = requestAnimationFrame(animate);
    }
    
    destroy() {
        if (this.#animationId) {
            cancelAnimationFrame(this.#animationId);
        }
        
        this.container?.remove();
        this.dot?.remove();
        document.body.classList.remove('custom-cursor-enabled');
    }
}

/**
 * 外链管理器 - 安全的外链跳转
 */
class ExternalLinkManager {
    #internalDomains;
    
    constructor() {
        this.#internalDomains = new Set([
            window.location.hostname,
            'localhost',
            '127.0.0.1',
            'xinyang-gao.github.io',
            'www.xinyang-gao.github.io'
        ]);
        
        this.#init();
    }
    
    #isExternalLink(url) {
        if (!url || url.startsWith('#') || url.startsWith('javascript:')) {
            return false;
        }
        
        try {
            const linkUrl = new URL(url, window.location.href);
            if (!['http:', 'https:'].includes(linkUrl.protocol)) {
                return false;
            }
            return !this.#internalDomains.has(linkUrl.hostname);
        } catch {
            return false;
        }
    }
    
    #handleLinkClick(event) {
        const target = event.target.closest('a');
        if (!target) return;
        
        const href = target.getAttribute('href');
        if (!href) return;
        
        if (this.#isExternalLink(href)) {
            event.preventDefault();
            event.stopPropagation();
            
            const confirmUrl = `/link.html?url=${encodeURIComponent(href)}`;
            window.open(confirmUrl, '_blank', 'noopener,noreferrer');
        }
    }
    
    #init() {
        document.addEventListener('click', (event) => this.#handleLinkClick(event));
        console.log('外链跳转确认管理器已启动');
    }
}

/**
 * 网站存活时间计时器
 */
class SiteAgeManager {
    static #BIRTH_DATE = new Date('2025-02-22T12:23:53Z');
    static #intervalId = null;
    
    static start() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
        }
        
        const updateAge = () => {
            const ageSpan = document.getElementById('site-age');
            if (!ageSpan) return;
            
            const diff = Date.now() - this.#BIRTH_DATE.getTime();
            
            if (diff < 0) {
                ageSpan.innerText = '……等等，结果是负数？？！';
                return;
            }
            
            const totalSeconds = Math.floor(diff / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            const ageString = `${days}天${hours.toString().padStart(2, '0')}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒`;
            ageSpan.innerText = ageString;
        };
        
        updateAge();
        this.#intervalId = setInterval(updateAge, 1000);
    }
    
    static stop() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
    }
}

/**
 * 导航栏和页脚加载器
 */
class LayoutLoader {
    static async loadNavbar() {
        try {
            const response = await fetch('/navbar.html');
            if (!response.ok) throw new Error('Failed to load navbar');
            
            const navbarHTML = await response.text();
            const placeholder = document.getElementById('navbar-placeholder');
            
            if (placeholder) {
                placeholder.innerHTML = navbarHTML;
                NavigationManager.initThemeToggle();
            } else {
                console.warn('Navbar placeholder not found');
            }
        } catch (error) {
            console.error('Error loading navbar:', error);
        }
    }
    
    static async loadFooter() {
        try {
            const response = await fetch('/footer.html');
            if (!response.ok) throw new Error('加载页脚失败');
            
            const footerHTML = await response.text();
            const placeholder = document.getElementById('footer-placeholder');
            
            if (placeholder) {
                placeholder.innerHTML = footerHTML;
            } else {
                console.warn('页脚占位符未找到');
            }
        } catch (error) {
            console.error('加载页脚错误:', error);
        }
    }
}

/**
 * 页面初始化函数
 */
async function initializePage() {
    // 设置主题
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme ?? (systemPrefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', initialTheme);
    
    // 加载布局组件
    await Promise.all([
        LayoutLoader.loadNavbar(),
        LayoutLoader.loadFooter()
    ]);
    
    // 启动计时器
    SiteAgeManager.start();
    
    // 初始化当前页面
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    
    if (currentPage === 'index') {
        GreetingManager.update();
    } else if (currentPage === 'articles') {
        await initializeArticlesPage();
    } else if (currentPage === 'works') {
        await initializeWorksPage();
    }
    
    // 初始化各种管理器
    NavigationManager.initNavigation();
    NavigationManager.initMobileMenuToggle();
    ScrollManager.initBackToTopButton();
    NavigationManager.initPopstate();
    
    document.body.setAttribute('data-loaded', 'true');
}

/**
 * 文章页面初始化
 */
async function initializeArticlesPage() {
    try {
        const data = await DataManager.fetchData('articles');
        const html = UIRenderer.generateListHTML(data, 'articles');
        const container = document.getElementById('articles-list-container');
        
        if (container) {
            container.innerHTML = html;
            new SearchController('articles');
        }
    } catch (error) {
        console.error('加载文章数据失败:', error);
    }
}

/**
 * 作品页面初始化
 */
async function initializeWorksPage() {
    try {
        const data = await DataManager.fetchData('works');
        const html = UIRenderer.generateListHTML(data, 'works');
        const container = document.getElementById('works-list-container');
        
        if (container) {
            container.innerHTML = html;
            new SearchController('works');
        }
    } catch (error) {
        console.error('加载作品数据失败:', error);
    }
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initializePage);

// 延迟初始化自定义光标
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (!window.customCursorInstance) {
            window.customCursorInstance = new CustomCursor();
        }
    }, 100);
});

// 初始化外链管理器
document.addEventListener('DOMContentLoaded', () => {
    window.ExternalLinkManager = new ExternalLinkManager();
});

// 导出全局API（用于调试和兼容）
window.PerformanceMonitor = PerformanceMonitor;
window.DataManager = DataManager;
window.PageManager = PageManager;
window.UIRenderer = UIRenderer;
window.SearchController = SearchController;
window.NavigationManager = NavigationManager;
window.ScrollManager = ScrollManager;
window.CustomCursor = CustomCursor;
window.ExternalLinkManager = ExternalLinkManager;
window.SiteAgeManager = SiteAgeManager;
window.GreetingManager = GreetingManager;
window.initializeArticlesPage = initializeArticlesPage;
window.initializeWorksPage = initializeWorksPage;