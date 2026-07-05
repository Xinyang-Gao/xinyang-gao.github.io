// /js/standalone/changelog.js

(function () {
    // ---------- 配置 ----------
    const BATCH_SIZE = 15;
    const TYPE_COLORS = {
        feat: '#4CAF50',
        fix: '#f44336',
        perf: '#FF9800',
        style: '#9C27B0',
        refactor: '#2196F3',
        chore: '#607D8B',
        docs: '#00BCD4',
        revert: '#FF5722',
        ci: '#795548',
    };
    const DEFAULT_COLOR = '#6b6b6b';

    // DOM 引用
    const container = document.getElementById('changelog-container');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const counterEl = document.getElementById('version-counter');
    const searchInput = document.getElementById('search-input');
    const searchField = document.getElementById('search-field');

    // 状态
    let allVersions = [];          // 原始数据（已按 id 降序）
    let currentCount = 0;
    let allLoaded = false;

    // ---------- 工具函数 ----------
    function formatDate(dateStr) {
        if (!dateStr) return '日期不详';
        // 尝试解析 YYYY-MM-DD
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
            return `${m[1]}年${parseInt(m[2])}月${parseInt(m[3])}日`;
        }
        return dateStr;
    }

    // 解析 type(scope): description
    function parseChange(change) {
        const rawType = (change.type || '').trim();
        let rawDesc = (change.description || '').trim();
        let finalType = rawType;
        let scope = null;
        let msg = rawDesc;

        const match = rawDesc.match(/^(\w+)\(([^)]+)\)\s*[:：]\s*(.*)$/);
        if (match) {
            const inlineType = match[1];
            const inlineScope = match[2];
            const rest = match[3].trim();
            if (!rawType || rawType === inlineType) {
                finalType = inlineType;
                scope = inlineScope;
                msg = rest;
            } else {
                // 保留原始 type，不提取 scope
                msg = rawDesc;
            }
        }

        // 预处理列表：在列表项前插入空行
        const lines = msg.split('\n');
        const newLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const stripped = line.trimLeft();
            if (i > 0 && /^[-*+]\s/.test(stripped) && lines[i - 1].trim() !== '') {
                newLines.push('');
            }
            newLines.push(line);
        }
        msg = newLines.join('\n');

        // 使用 marked 渲染 Markdown
        let descHtml = msg;
        try {
            descHtml = marked.parse(msg);
        } catch (e) {
            descHtml = msg.replace(/\n/g, '<br>');
        }

        return {
            type: finalType,
            scope: scope,
            descriptionHtml: descHtml,
        };
    }

    // 渲染单个版本
    function renderVersion(ver) {
        const verId = ver.id || 0;
        const verStr = ver.version || 'v0.0.0';
        const verDate = ver.date || '';
        const changes = ver.changes || [];

        const dateDisplay = formatDate(verDate);

        let changesHtml = '';
        if (changes.length) {
            const items = changes.map(chg => {
                const parsed = parseChange(chg);
                const color = TYPE_COLORS[parsed.type] || DEFAULT_COLOR;
                const typeTag = `<span class="change-type" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${parsed.type}</span>`;
                let scopeTag = '';
                if (parsed.scope) {
                    scopeTag = `<span class="change-scope" style="color:${color}; font-weight:500; background:${color}10; padding:0 8px; border-radius:8px; font-size:0.8rem;">${parsed.scope}</span>`;
                }
                return `<li class="change-item">
                            <div class="change-meta">${typeTag} ${scopeTag}</div>
                            <div class="change-desc">${parsed.descriptionHtml}</div>
                        </li>`;
            }).join('');
            changesHtml = `<ul class="change-list">${items}</ul>`;
        } else {
            changesHtml = '<p class="no-changes">无变更记录</p>';
        }

        // 收集搜索文本
        const searchText = `${verStr} ${dateDisplay} ${verId} ${changes.map(c => c.description || '').join(' ')}`;

        return `<div class="changelog-version" data-search="${searchText}" data-version-id="${verId}">
                    <div class="version-header">
                        <span class="version-tag">${verStr}</span>
                        <span class="version-date">${dateDisplay}</span>
                        <span class="version-id">#${verId}</span>
                    </div>
                    ${changesHtml}
                </div>`;
    }

    // ---------- 渲染控制 ----------
    function renderBatch(count) {
        const items = container.querySelectorAll('.changelog-version');
        let visible = 0;
        items.forEach((el, idx) => {
            if (idx < count) {
                el.style.display = '';
                visible++;
            } else {
                el.style.display = 'none';
            }
        });
        currentCount = visible;
        allLoaded = (visible >= items.length);
        updateControls();
    }

    function showAll() {
        const items = container.querySelectorAll('.changelog-version');
        items.forEach(el => el.style.display = '');
        allLoaded = true;
        updateControls();
    }

    function updateControls() {
        const total = allVersions.length;
        if (loadMoreBtn) {
            if (allLoaded || currentCount >= total) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = 'inline-block';
                loadMoreBtn.textContent = `加载更多版本 (${total - currentCount} 个剩余)`;
            }
        }
        if (counterEl) {
            const searching = searchInput.value.trim() !== '';
            if (searching) {
                const visible = container.querySelectorAll('.changelog-version[style*="display: block"], .changelog-version:not([style*="display: none"])').length;
                counterEl.textContent = `匹配 ${visible} / 共 ${total} 个版本`;
            } else {
                counterEl.textContent = `显示 ${currentCount} / 共 ${total} 个版本`;
            }
        }
    }

    // ---------- 加载数据 ----------
    function loadData() {
        fetch('/json/version.json')
            .then(res => {
                if (!res.ok) throw new Error('网络请求失败');
                return res.json();
            })
            .then(data => {
                const versions = data.versions || [];
                // 按 id 降序
                versions.sort((a, b) => (b.id || 0) - (a.id || 0));
                allVersions = versions;

                if (!versions.length) {
                    container.innerHTML = '<p style="text-align:center; padding:2rem;">暂无更新记录</p>';
                    return;
                }

                // 生成所有卡片 HTML
                const cardsHtml = versions.map(ver => renderVersion(ver)).join('');
                container.innerHTML = cardsHtml;

                // 初始显示第一批
                renderBatch(BATCH_SIZE);
            })
            .catch(err => {
                container.innerHTML = `<p style="text-align:center; padding:2rem; color:var(--text-secondary);">加载失败：${err.message}</p>`;
                console.error('Changelog load error:', err);
            });
    }

    // ---------- 搜索过滤 ----------
    function filterVersions() {
        const keyword = searchInput.value.trim().toLowerCase();
        const field = searchField.value;
        const items = container.querySelectorAll('.changelog-version');

        if (!keyword) {
            // 清空搜索，回到分批状态
            allLoaded = false;
            renderBatch(BATCH_SIZE);
            return;
        }

        // 搜索时加载全部
        showAll();

        let matchCount = 0;
        items.forEach(el => {
            const searchData = el.dataset.search || '';
            let match = false;
            if (field === 'all') {
                match = searchData.toLowerCase().includes(keyword);
            } else if (field === 'version') {
                const tag = el.querySelector('.version-tag');
                match = tag && tag.textContent.toLowerCase().includes(keyword);
            } else if (field === 'date') {
                const dateEl = el.querySelector('.version-date');
                match = dateEl && dateEl.textContent.toLowerCase().includes(keyword);
            } else if (field === 'desc') {
                const descEls = el.querySelectorAll('.change-desc');
                let descText = '';
                descEls.forEach(d => descText += d.textContent);
                match = descText.toLowerCase().includes(keyword);
            }
            if (match) {
                el.style.display = '';
                matchCount++;
            } else {
                el.style.display = 'none';
            }
        });
        if (counterEl) {
            counterEl.textContent = `匹配 ${matchCount} / 共 ${allVersions.length} 个版本`;
        }
    }

    // ---------- 加载更多 ----------
    function loadMore() {
        if (allLoaded) return;
        const nextCount = Math.min(currentCount + BATCH_SIZE, allVersions.length);
        renderBatch(nextCount);
    }

    // ---------- 初始化 ----------
    function init() {
        loadData();
        if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMore);
        if (searchInput) searchInput.addEventListener('input', filterVersions);
        if (searchField) searchField.addEventListener('change', filterVersions);
    }

    // 如果页面已经加载完成，直接初始化；否则等待 DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();