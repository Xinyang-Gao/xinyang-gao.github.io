// /js/pages/stats-manager.js
// 全域统计管理器 — 优化版：移除友链、新增运行时间秒级更新、新增代码行数占比图表
import { CONFIG } from '/js/core/core.js';

class FullStatsManager {
    constructor() {
        this.data = {
            statistics: null,
            articles: null,
            works: null,
            codeAnalysis: null
        };
        this.charts = [];
        this.initialized = false;
        this.themeHandler = null;
        this.uptimeInterval = null;
    }

    async init() {
        await this.loadChartJS();
        await this.fetchAllData();
        this.renderCoreCards();
        this.renderExtraDetails();
        this.renderSiteUptime();     // 秒级更新运行时间
        this.renderAllCharts();
        this.setupThemeListener();
        this.initialized = true;
    }

    loadChartJS() {
        if (window.Chart) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Chart.js加载失败'));
            document.head.appendChild(script);
        });
    }

    async fetchAllData() {
        const endpoints = [
            { key: 'statistics', url: CONFIG?.API?.STATISTICS || '/json/statistics.json' },
            { key: 'articles', url: CONFIG?.API?.ARTICLES || '/json/articles.json' },
            { key: 'works', url: CONFIG?.API?.WORKS || '/json/works.json' },
            { key: 'codeAnalysis', url: '/json/code_analysis.json' }
        ];
        for (const ep of endpoints) {
            try {
                const res = await fetch(`${ep.url}?t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                this.data[ep.key] = await res.json();
            } catch (err) {
                console.warn(`[FullStats] 加载 ${ep.key} 失败`, err);
                this.data[ep.key] = null;
            }
        }
        this.articlesList = this.data.articles?.articles?.filter(a => !a.hidden) || [];
        this.worksList = this.data.works?.works || [];
    }

    renderCoreCards() {
        const container = document.getElementById('statsCardsGrid');
        if (!container) return;
        const stats = this.data.statistics || {};
        const code = this.data.codeAnalysis || {};
        const totalArticles = stats.total_articles ?? this.articlesList.length;
        const totalWorks = stats.total_works ?? this.worksList.length;
        const totalWords = stats.total_word_count ?? this.articlesList.reduce((sum, a) => sum + (a.word_count || 0), 0);
        const articleTags = stats.total_article_tags ?? (stats.article_tags?.length ?? 0);
        const workTags = stats.total_work_tags ?? (stats.work_tags?.length ?? 0);
        const totalFiles = code.total_files ?? '—';
        const totalLines = code.non_empty_lines ?? code.total_lines ?? '—';
        const avgWord = totalArticles ? Math.round(totalWords / totalArticles) : 0;
        const avgTagPerArticle = totalArticles ? (this.articlesList.reduce((sum, a) => sum + (a.tags?.length || 0), 0) / totalArticles).toFixed(1) : '—';
        const codeDensity = totalFiles !== '—' && totalLines !== '—' && totalFiles > 0 ? Math.round(totalLines / totalFiles) : '—';

        container.innerHTML = `
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-newspaper"></i></div><div class="stat-card-number">${totalArticles}</div><div class="stat-card-label">文章总数</div><div class="stat-card-sub">篇</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-cubes"></i></div><div class="stat-card-number">${totalWorks}</div><div class="stat-card-label">作品总数</div><div class="stat-card-sub">个</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-feather-alt"></i></div><div class="stat-card-number">${totalWords.toLocaleString()}</div><div class="stat-card-label">总字数</div><div class="stat-card-sub">字</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-tags"></i></div><div class="stat-card-number">${articleTags}</div><div class="stat-card-label">文章标签</div><div class="stat-card-sub">种</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-palette"></i></div><div class="stat-card-number">${workTags}</div><div class="stat-card-label">作品标签</div><div class="stat-card-sub">类</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-folder-tree"></i></div><div class="stat-card-number">${typeof totalFiles === 'number' ? totalFiles.toLocaleString() : totalFiles}</div><div class="stat-card-label">源文件总数</div><div class="stat-card-sub">个</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-code"></i></div><div class="stat-card-number">${typeof totalLines === 'number' ? totalLines.toLocaleString() : totalLines}</div><div class="stat-card-label">代码行数</div><div class="stat-card-sub">非空行</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-chart-line"></i></div><div class="stat-card-number">${avgWord.toLocaleString()}</div><div class="stat-card-label">篇均字数</div><div class="stat-card-sub">深度</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-layer-group"></i></div><div class="stat-card-number">${avgTagPerArticle}</div><div class="stat-card-label">篇均标签数</div><div class="stat-card-sub">维度</div></div>
            <div class="stat-card-item"><div class="stat-card-icon"><i class="fas fa-microchip"></i></div><div class="stat-card-number">${codeDensity}</div><div class="stat-card-label">代码密度</div><div class="stat-card-sub">行/文件</div></div>
        `;
        document.getElementById('extraTotalWords') && (document.getElementById('extraTotalWords').innerText = totalWords.toLocaleString());
    }

    renderExtraDetails() {
        // 最长文章TOP5
        const sortedByWords = [...this.articlesList].sort((a,b) => (b.word_count||0) - (a.word_count||0)).slice(0,5);
        const listContainer = document.getElementById('longestArticlesList');
        if (listContainer) {
            if (sortedByWords.length) {
                listContainer.innerHTML = sortedByWords.map(art => `<li><span>${art.title || '无题'}</span><span>${(art.word_count||0).toLocaleString()}字</span></li>`).join('');
            } else listContainer.innerHTML = '<li>暂无数据</li>';
        }
        // 阅读总时长
        let totalReadMins = 0;
        this.articlesList.forEach(art => {
            if (art.read_time) {
                const mins = parseInt(art.read_time);
                if (!isNaN(mins)) totalReadMins += mins;
                else if (art.word_count) totalReadMins += Math.ceil(art.word_count / 300);
            } else if (art.word_count) totalReadMins += Math.ceil(art.word_count / 300);
        });
        const totalReadSpan = document.getElementById('totalReadTime');
        if (totalReadSpan) totalReadSpan.innerText = totalReadMins > 0 ? `${totalReadMins} 分钟 (≈${(totalReadMins / 60).toFixed(1)}h)` : '—';
        // 代码规模深度
        const code = this.data.codeAnalysis || {};
        document.getElementById('codeTotalFiles') && (document.getElementById('codeTotalFiles').innerText = code.total_files ?? '—');
        document.getElementById('codeNonEmptyLines') && (document.getElementById('codeNonEmptyLines').innerText = code.non_empty_lines ?? code.total_lines ?? '—');
        const totalSizeKB = code.total_size_bytes ? (code.total_size_bytes / 1024).toFixed(1) : '—';
        document.getElementById('codeTotalSize') && (document.getElementById('codeTotalSize').innerText = totalSizeKB);
        const extensions = code.by_extension || [];
        let topExt = extensions.length ? extensions.sort((a,b)=>b.count - a.count)[0].extension : '—';
        document.getElementById('codeTopExt') && (document.getElementById('codeTopExt').innerText = topExt === 'no_extension' ? '无后缀' : topExt);
        const extAvg = extensions.map(ext => ({ name: ext.extension === 'no_extension' ? '无后缀' : ext.extension, avg: ext.total_lines ? Math.round(ext.total_lines / ext.count) : 0 })).sort((a,b)=>b.avg - a.avg).slice(0,3);
        const avgHtml = extAvg.map(e => `<span class="badge-stat">${e.name}</span> ${e.avg}行/文件`).join(' &nbsp; ');
        document.getElementById('extAvgLinesList') && (document.getElementById('extAvgLinesList').innerHTML = avgHtml || '—');
        // 作者数量
        const authors = new Set(this.articlesList.map(a => a.author).filter(Boolean));
        document.getElementById('authorCount') && (document.getElementById('authorCount').innerText = authors.size);
        // 最近更新月份
        const lastActive = this.getLatestActiveMonth();
        document.getElementById('lastActiveMonth') && (document.getElementById('lastActiveMonth').innerText = lastActive);
        const stats = this.data.statistics || {};
        document.getElementById('totalUpdateDays') && (document.getElementById('totalUpdateDays').innerText = stats.total_update_days ?? '—');
        document.getElementById('statsUpdatedDate') && (document.getElementById('statsUpdatedDate').innerText = stats.last_updated ? `· 版本 ${stats.version || '—'}  · ${stats.last_updated}` : '');
        document.getElementById('snapshotTime') && (document.getElementById('snapshotTime').innerText = stats.last_updated_full ? new Date(stats.last_updated_full).toLocaleString() : '未知');
        document.getElementById('totalArticlesStat') && (document.getElementById('totalArticlesStat').innerText = this.articlesList.length);
        document.getElementById('totalWorksStat') && (document.getElementById('totalWorksStat').innerText = this.worksList.length);
    }

    // 秒级更新站点运行时间
    renderSiteUptime() {
        const container = document.getElementById('siteUptimeDisplay');
        if (!container) return;
        const birth = CONFIG.SITE_BIRTH;
        const update = () => {
            const now = new Date();
            const diff = now - birth;
            if (diff <= 0) {
                container.innerText = '刚刚诞生';
                return;
            }
            const seconds = Math.floor(diff / 1000);
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            container.innerText = `${days}天 ${hours}小时 ${minutes}分 ${secs}秒`;
        };
        update();
        if (this.uptimeInterval) clearInterval(this.uptimeInterval);
        this.uptimeInterval = setInterval(update, 1000);
    }

    getLatestActiveMonth() {
        const dates = this.articlesList.map(a => a.date ? new Date(a.date) : null).filter(d => d && !isNaN(d));
        if (!dates.length) return '—';
        const maxDate = new Date(Math.max(...dates));
        return `${maxDate.getFullYear()}-${maxDate.getMonth()+1}`;
    }

    destroyCharts() {
        this.charts.forEach(ch => ch?.destroy());
        this.charts = [];
    }

    renderAllCharts() {
        this.destroyCharts();
        this.renderTrendChart();
        this.renderCategoryChart();
        this.renderArticleTagsChart();
        this.renderWorkTagsChart();
        this.renderCodeExtensionChart();
        this.renderWordHistogram();
        this.renderWorksYearChart();
        this.renderCodeLineShareChart();   // 新增：代码行数占比
    }

    getChartColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return { textColor: isDark ? '#eceef2' : '#2c2c2c', gridColor: isDark ? '#3f3f4b' : '#e8e2db', accent: '#b45b63' };
    }

    renderTrendChart() {
        const ctx = document.getElementById('trendChart')?.getContext('2d');
        if (!ctx) return;
        const monthMap = new Map();
        this.articlesList.forEach(art => {
            if (!art.date) return;
            const d = new Date(art.date);
            if (isNaN(d)) return;
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            monthMap.set(key, (monthMap.get(key) || 0) + 1);
        });
        const sorted = Array.from(monthMap.keys()).sort();
        const labels = sorted.map(m => m.replace('-', '年') + '月');
        const data = sorted.map(m => monthMap.get(m));
        const { textColor, gridColor, accent } = this.getChartColors();
        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: '发布文章数', data, borderColor: accent, backgroundColor: 'rgba(180,91,99,0.1)', tension: 0.3, fill: true, pointBackgroundColor: accent, pointBorderColor: '#fff', pointRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { tooltip: { mode: 'index', intersect: false }, legend: { labels: { color: textColor } } }, scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } }, x: { ticks: { color: textColor, maxRotation: 45 } } } }
        });
        this.charts.push(chart);
        if (data.length) {
            const maxIdx = data.indexOf(Math.max(...data));
            if (maxIdx !== -1) document.getElementById('peakMonthLabel') && (document.getElementById('peakMonthLabel').innerText = labels[maxIdx] + ` (${data[maxIdx]}篇)`);
        }
    }

    renderCategoryChart() {
        const ctx = document.getElementById('categoryChart')?.getContext('2d');
        if (!ctx) return;
        let categories = this.data.statistics?.article_categories || [];
        if (!categories.length) {
            const catMap = new Map();
            this.articlesList.forEach(art => { if(art.category) catMap.set(art.category, (catMap.get(art.category)||0)+1); });
            categories = Array.from(catMap.entries()).map(([name,count]) => ({ name, count }));
        }
        const labels = categories.map(c=>c.name), data = categories.map(c=>c.count);
        const { textColor } = this.getChartColors();
        const chart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ data, backgroundColor: ['#b45b63','#cd8189','#e3a5a9','#9e5e66','#d99ca2','#c06f78','#e9b3b7'] }] }, options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} 篇 (${((ctx.raw / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)` } }, legend: { position: 'right', labels: { color: textColor, font: { size: 11 } } } } } });
        this.charts.push(chart);
    }

    renderArticleTagsChart() {
        const ctx = document.getElementById('articleTagsChart')?.getContext('2d');
        if (!ctx) return;
        let tags = this.data.statistics?.article_tags || [];
        if (!tags.length) {
            const tagMap = new Map();
            this.articlesList.forEach(art => { (art.tags||[]).forEach(t => tagMap.set(t, (tagMap.get(t)||0)+1)); });
            tags = Array.from(tagMap.entries()).map(([name,count])=> ({ name, count }));
        }
        tags.sort((a,b)=>b.count - a.count);
        const top10 = tags.slice(0,10);
        const labels = top10.map(t=>t.name), data = top10.map(t=>t.count);
        const { textColor, gridColor, accent } = this.getChartColors();
        const chart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: '引用次数', data, backgroundColor: accent, borderRadius: 6 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor } } } } });
        this.charts.push(chart);
    }

    renderWorkTagsChart() {
        const ctx = document.getElementById('workTagsChart')?.getContext('2d');
        if (!ctx) return;
        let workTags = this.data.statistics?.work_tags || [];
        if (!workTags.length) {
            const tagMap = new Map();
            this.worksList.forEach(w => { (w.tag||w.tags||[]).forEach(t => tagMap.set(t, (tagMap.get(t)||0)+1)); });
            workTags = Array.from(tagMap.entries()).map(([name,count])=> ({ name, count }));
        }
        const labels = workTags.map(t=>t.name), data = workTags.map(t=>t.count);
        const { textColor } = this.getChartColors();
        const chart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: ['#4ea8ff','#7dcea0','#f9b5a4','#b45b63','#cd8189','#e6c3a0','#9ba5c9'] }] }, options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} 次` } }, legend: { position: 'right', labels: { color: textColor } } } } });
        this.charts.push(chart);
    }

    renderCodeExtensionChart() {
        const ctx = document.getElementById('codeExtensionChart')?.getContext('2d');
        if (!ctx) return;
        const exts = this.data.codeAnalysis?.by_extension || [];
        if (!exts.length) { const chart = new Chart(ctx, { type: 'pie', data: { labels: ['暂无数据'], datasets: [{ data: [1] }] } }); this.charts.push(chart); return; }
        let top = exts.sort((a,b)=>b.count - a.count).slice(0,6);
        const others = exts.slice(6).reduce((s,e)=>s+e.count,0);
        if(others) top.push({ extension: '其他', count: others });
        const labels = top.map(e=>e.extension === 'no_extension' ? '无后缀' : e.extension);
        const data = top.map(e=>e.count);
        const { textColor } = this.getChartColors();
        const chart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ data, backgroundColor: ['#b45b63','#4ea8ff','#7dcea0','#f4b942','#c97e5a','#9b59b6','#95a5a6'] }] }, options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } } } } });
        this.charts.push(chart);
    }

    renderWordHistogram() {
        const ctx = document.getElementById('wordHistogramChart')?.getContext('2d');
        if (!ctx) return;
        const words = this.articlesList.map(a => a.word_count || 0).filter(w => w > 0);
        const labels = ['<500', '500-999', '1000-1999', '2000-4999', '5000-9999', '≥10000'];
        const counts = new Array(6).fill(0);
        words.forEach(w => {
            if (w < 500) counts[0]++;
            else if (w < 1000) counts[1]++;
            else if (w < 2000) counts[2]++;
            else if (w < 5000) counts[3]++;
            else if (w < 10000) counts[4]++;
            else counts[5]++;
        });
        const { textColor, gridColor, accent } = this.getChartColors();
        const chart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: '文章数量', data: counts, backgroundColor: accent, borderRadius: 8 }] }, options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor } } }, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.raw} 篇文章` } }, legend: { labels: { color: textColor } } } } });
        this.charts.push(chart);
    }

    renderWorksYearChart() {
        const canvas = document.getElementById('worksYearChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const yearMap = new Map();
        this.worksList.forEach(w => {
            if (!w.date) return;
            const year = new Date(w.date).getFullYear();
            if (!isNaN(year)) yearMap.set(year, (yearMap.get(year) || 0) + 1);
        });
        const years = Array.from(yearMap.keys()).sort();
        const counts = years.map(y => yearMap.get(y));
        const { textColor, gridColor, accent } = this.getChartColors();
        const chart = new Chart(ctx, { type: 'bar', data: { labels: years, datasets: [{ label: '作品数量', data: counts, backgroundColor: accent, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: textColor } } }, scales: { y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor } } } } });
        this.charts.push(chart);
    }

    // 新增：代码行数占比（基于 non_empty_lines）
    renderCodeLineShareChart() {
        const ctx = document.getElementById('codeLineChart')?.getContext('2d');
        if (!ctx) return;
        const exts = this.data.codeAnalysis?.by_extension || [];
        if (!exts.length) {
            const chart = new Chart(ctx, { type: 'doughnut', data: { labels: ['暂无数据'], datasets: [{ data: [1] }] } });
            this.charts.push(chart);
            return;
        }
        // 过滤掉行数为0的扩展名
        let valid = exts.filter(e => (e.non_empty_lines || e.total_lines || 0) > 0);
        if (valid.length === 0) valid = exts;
        let top = valid.sort((a,b) => (b.non_empty_lines || 0) - (a.non_empty_lines || 0)).slice(0,6);
        const others = valid.slice(6).reduce((s,e) => s + (e.non_empty_lines || 0), 0);
        if (others > 0) top.push({ extension: '其他', non_empty_lines: others });
        const labels = top.map(e => e.extension === 'no_extension' ? '无后缀' : e.extension);
        const data = top.map(e => e.non_empty_lines || e.total_lines || 0);
        const { textColor } = this.getChartColors();
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: ['#b45b63','#4ea8ff','#7dcea0','#f4b942','#c97e5a','#9b59b6','#95a5a6'] }] },
            options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toLocaleString()} 行 (${((ctx.raw / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)` } }, legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } } } }
        });
        this.charts.push(chart);
    }

    setupThemeListener() {
        const handler = () => {
            if (this.initialized) {
                this.destroyCharts();
                this.renderAllCharts();
            }
        };
        window.addEventListener('themeChanged', handler);
        this.themeHandler = handler;
    }

    destroy() {
        this.destroyCharts();
        if (this.themeHandler) window.removeEventListener('themeChanged', this.themeHandler);
        if (this.uptimeInterval) clearInterval(this.uptimeInterval);
    }
}

let manager = null;
async function initFullStats() {
    if (manager) manager.destroy();
    manager = new FullStatsManager();
    await manager.init();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFullStats);
else initFullStats();
export { initFullStats };