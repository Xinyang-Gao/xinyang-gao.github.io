// /js/home-manager.js
import { PageManager } from '/js/page-manager.js';

export class HomePageManager extends PageManager {
    constructor() {
        super();
        this.greetingInterval = null;
        this.statsLoadHandler = null;
        this.clickHandler = null;
    }

    init() {
        this.loadStatisticsAndTags();
        this.bindGlobalNavigateEvents();
        this.startGreetingUpdater();
    }

    loadStatisticsAndTags() {
        const statsContainer = document.getElementById('statsContainer');
        if (!statsContainer) return;
        
        fetch('/json/statistics.json')
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(stat => {
                const totalArticles = stat.total_articles ?? 0;
                const totalWords = stat.total_word_count ?? 0;
                const totalWorks = stat.total_works ?? 0;
                const totalArticleCategories = stat.total_article_categories ?? 0;
                const totalArticleTags = stat.total_article_tags ?? 0;
                const totalWorkTags = stat.total_work_tags ?? 0;
                statsContainer.innerHTML = `...`; // 原有 HTML 填充
                // 更新标签云
                this.updateTagsList(stat.article_tags || [], '#articleTagsList');
                this.updateTagsList(stat.work_tags || [], '#workTagsList');
                const badge = document.getElementById('statsUpdateBadge');
                if (badge) badge.innerHTML = `<i class="far fa-clock"></i> 数据快照 · ${stat.last_updated || '未知'}`;
            })
            .catch(() => {
                statsContainer.innerHTML = `<div class="stat-card" style="grid-column:1/-1;text-align:center;"><i class="fas fa-cloud-moon"></i> 统计信息正在星海漂流，稍后再来看看吧~</div>`;
            });
    }

    updateTagsList(tags, containerId) {
        const container = document.querySelector(containerId);
        if (!container) return;
        if (tags.length) {
            container.innerHTML = tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('');
        } else {
            container.innerHTML = '<span class="tag">暂无标签</span>';
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }

    bindGlobalNavigateEvents() {
        this.clickHandler = (e) => {
            const statCard = e.target.closest('.stat-card[data-stat-type]');
            if (statCard) {
                e.preventDefault();
                const type = statCard.getAttribute('data-stat-type');
                const href = type === 'articles' ? '/articles.html' : '/works.html';
                if (typeof window.fetchAndReplaceContent === 'function') {
                    window.fetchAndReplaceContent(href, true);
                } else {
                    window.location.href = href;
                }
                return;
            }
            const tagEl = e.target.closest('.tags-list .tag');
            if (tagEl && tagEl.innerText.trim() && !['加载中...', '暂无标签'].includes(tagEl.innerText.trim())) {
                const tagText = tagEl.innerText.trim();
                const isArticleZone = !!tagEl.closest('#articleTagsList');
                const targetPage = isArticleZone ? '/articles.html' : '/works.html';
                const href = `${targetPage}?tags=${encodeURIComponent(tagText)}`;
                if (typeof window.fetchAndReplaceContent === 'function') {
                    window.fetchAndReplaceContent(href, true);
                } else {
                    window.location.href = href;
                }
            }
        };
        document.addEventListener('click', this.clickHandler);
    }

    startGreetingUpdater() {
        const updateGreeting = () => {
            const greetingEl = document.getElementById('dynamic-greeting');
            if (greetingEl && typeof Utils !== 'undefined' && Utils.getGreetingMessage) {
                greetingEl.textContent = Utils.getGreetingMessage();
            }
        };
        updateGreeting();
        this.greetingInterval = setInterval(updateGreeting, 60000);
    }

    destroy() {
        if (this.greetingInterval) {
            clearInterval(this.greetingInterval);
            this.greetingInterval = null;
        }
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler);
            this.clickHandler = null;
        }
    }
}

export function initHomePage() {
    const manager = new HomePageManager();
    manager.init();
    return manager;
}