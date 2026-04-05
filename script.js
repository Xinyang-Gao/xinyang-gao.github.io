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
        el.style.color = '';
    }
}

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
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
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
            // 构造作品信息对象，用于弹窗展示（不含 id，完全基于 json 内容）
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
        const filteredItems = items.filter(item => {
            const tags = Utils.getTags(item);
            return !tags.includes('隐藏');
        });
        
        const html = `<div class="${type}-list">${filteredItems.map((item, idx) => UIRenderer.generateListItem(item, type.slice(0, -1), idx)).join('')}</div>`;
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

/**
 * 搜索控制器
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

            this.input.addEventListener('input', Utils.debounce(() => this.handleSearch(), 300));
            this.field.addEventListener('change', () => this.handleSearch());

            this.updateTagFilters();
            this.handleSearch();
        });
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
            const itemTags = Utils.getTags(item);
            if (itemTags && Array.isArray(itemTags)) {
                itemTags.forEach(t => {
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
        if (this.input) this.input.removeEventListener('input', this.handleSearch);
        if (this.field) this.field.removeEventListener('change', this.handleSearch);
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
        const toggle = document.querySelector('.mobile-toggle');
        const nav = document.getElementById('navbarNav');
        if (!toggle || !nav) return;
        toggle.addEventListener('click', function () { nav.classList.toggle('active'); this.classList.toggle('active'); });
        document.querySelectorAll('.nav-item').forEach(i => i.addEventListener('click', () => { nav.classList.remove('active'); toggle.classList.remove('active'); }));
    }

    static initNavigation() {
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
            NavigationManager.initThemeToggle();
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
      placeholder.innerHTML = footerHTML;
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
        this.internalDomains = [
            window.location.hostname,
            'localhost',
            '127.0.0.1',
            'xinyang-gao.github.io',
            'www.xinyang-gao.github.io'
        ];
        
        this.init();
    }

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

    handleLinkClick(e) {
        let target = e.target.closest('a');
        if (!target) return;
        
        const href = target.getAttribute('href');
        if (!href) return;
        
        if (this.isExternalLink(href)) {
            e.preventDefault();
            e.stopPropagation();
            
            const confirmUrl = `/link.html?url=${encodeURIComponent(href)}`;
            window.open(confirmUrl, '_blank', 'noopener,noreferrer');
        }
    }

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

    startSiteAgeUpdater();

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