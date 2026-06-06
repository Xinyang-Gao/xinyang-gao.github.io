(function () {
    // ======================= 自定义错误消息映射表 (JSON格式) =======================
    const CUSTOM_ERROR_MESSAGES = {
        "/404.html": "你应该是故意的，对吧？",
        "/love": "嗯~ 你为什么会想输入这个呢？",
        "/wxy": "这是什么的缩写呢……（这个页面在未来也许会放点什么~）"
    };

    // 高级正则映射（可选，用于批量匹配，比如所有 /old/ 路径）
    const REGEX_ERROR_RULES = [
        { pattern: /^\/assets\/(.+)/, message: "这里不可以访问哟~" },
        { pattern: /^\/test\/(.+)/, message: "这是一个临时测试页面，目前不可用。感谢您的关注～" }
    ];

    // ----- 辅助函数：安全HTML转义
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function (m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function (c) {
            return c;
        });
    }

    // ----- 获取当前路径（解码后的完整pathname）
    function getDecodedPath() {
        let rawPath = window.location.pathname;
        try {
            return decodeURIComponent(rawPath);
        } catch (e) {
            return rawPath;
        }
    }

    // ----- 核心：根据路径获取自定义消息（优先精确匹配，再正则匹配）
    function getCustomMessageByPath(path) {
        // 1. 精确匹配
        if (CUSTOM_ERROR_MESSAGES.hasOwnProperty(path)) {
            return { found: true, message: CUSTOM_ERROR_MESSAGES[path], type: 'exact' };
        }
        // 2. 正则匹配
        for (let rule of REGEX_ERROR_RULES) {
            if (rule.pattern.test(path)) {
                return { found: true, message: rule.message, type: 'regex', rule: rule };
            }
        }
        return { found: false };
    }

    // ----- 根据网址生成个性化消息与智能建议（融合自定义映射 + 动态分析）
    function analyzePathAndGenerateMessage() {
        const decodedPath = getDecodedPath();
        // 展示访问路径
        const pathDisplay = document.getElementById('errorPathDisplay');
        if (pathDisplay) {
            pathDisplay.textContent = decodedPath || '/';
        }

        let mainMessage = '';
        let suggestions = [];
        let useCustom = false;

        // 优先检查自定义消息映射
        const customResult = getCustomMessageByPath(decodedPath);
        if (customResult.found) {
            useCustom = true;
            mainMessage = customResult.message;
            // 自定义消息时，建议仍提供通用导航帮助（保留人性化跳转）
            suggestions.push({ text: '返回首页', url: '/', icon: 'fa-house' });
            suggestions.push({ text: '浏览全部文章', url: '/articles.html', icon: 'fa-book-open' });
            suggestions.push({ text: '创意作品集', url: '/works.html', icon: 'fa-cube' });
            suggestions.push({ text: '反馈失效链接', url: 'https://github.com/Xinyang-Gao/xinyang-gao.github.io/issues/new', icon: 'fa-github' });
        } else {
            // ========= 原有智能分析逻辑（未匹配自定义时使用） =========
            const articlePatterns = [/\/article\//i, /\/articles\//i, /\/post\//i, /\/p\//i, /\/blog\//i];
            const workPatterns = [/\/work\//i, /\/works\//i, /\/project\//i, /\/portfolio\//i];
            const tagPatterns = [/\/tag\//i, /\/tags\//i, /\/topic\//i];
            const aboutPatterns = [/\/about/i, /\/contact/i, /\/me/i];

            let pathParts = decodedPath.split('/').filter(p => p.length > 0);
            let lastSegment = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
            if (lastSegment.endsWith('.html')) lastSegment = lastSegment.slice(0, -5);
            if (lastSegment.endsWith('.htm')) lastSegment = lastSegment.slice(0, -4);

            let isArticleMatch = articlePatterns.some(pattern => pattern.test(decodedPath));
            let isWorkMatch = workPatterns.some(pattern => pattern.test(decodedPath));
            let isTagMatch = tagPatterns.some(pattern => pattern.test(decodedPath));
            let isAboutMatch = aboutPatterns.some(pattern => pattern.test(decodedPath));
            let probableSlug = lastSegment && lastSegment.length > 0 && lastSegment.length < 100 ? lastSegment : null;

            if (isArticleMatch) {
                mainMessage = `这篇文章似乎暂时离开了书架。可能已被作者移至存档区、链接失效，或者还在草稿箱中酝酿。不过别灰心，站内还有很多值得阅读的篇章。`;
                suggestions.push({ text: '浏览全部文章', url: '/articles.html', icon: 'fa-book-open' });
                suggestions.push({ text: '热门标签导航', url: '/articles.html?tags=', icon: 'fa-tags' });
                if (probableSlug) {
                    suggestions.push({ text: `搜索 「${escapeHtml(probableSlug.substring(0, 28))}」 相关文章`, url: `/articles.html?search=${encodeURIComponent(probableSlug)}`, icon: 'fa-search' });
                }
            }
            else if (isWorkMatch) {
                mainMessage = `你寻找的作品项目也许正在迭代升级，或者它换了新的展示位置。不妨前往「创意工坊」探索更多有趣的代码与设计作品。`;
                suggestions.push({ text: '进入作品集', url: '/works.html', icon: 'fa-cube' });
                suggestions.push({ text: '创意实验室', url: '/works.html?tags=实验', icon: 'fa-flask' });
                if (probableSlug) {
                    suggestions.push({ text: `站内检索作品 「${escapeHtml(probableSlug)}」`, url: `/works.html?search=${encodeURIComponent(probableSlug)}`, icon: 'fa-magnifying-glass' });
                }
            }
            else if (isTagMatch) {
                let tagName = pathParts[pathParts.length - 1] || '';
                mainMessage = `标签「${escapeHtml(tagName)}」可能尚未收录，或者还没有任何内容被打上这个标签。你可以浏览所有标签，或从首页热门标签开始。`;
                suggestions.push({ text: '全部文章标签云', url: '/articles.html', icon: 'fa-tag' });
                suggestions.push({ text: '创意工坊标签', url: '/works.html', icon: 'fa-palette' });
                if (tagName) {
                    suggestions.push({ text: `在文章中查找标签「${escapeHtml(tagName)}」`, url: `/articles.html?tags=${encodeURIComponent(tagName)}`, icon: 'fa-file-alt' });
                }
            }
            else if (isAboutMatch) {
                mainMessage = `关于页面或者联系方式可能还没完全开放，但我一直都在。你可以通过留言板给我发消息，或者从首页了解我。`;
                suggestions.push({ text: '留言板', url: '/contact.html', icon: 'fa-comment-dots' });
                suggestions.push({ text: '返回首页', url: '/', icon: 'fa-house' });
            }
            else {
                if (decodedPath.endsWith('.html') || decodedPath.includes('.')) {
                    mainMessage = `这个页面地址可能已经更新或归档。你访问的链接也许来自旧版本的站点地图。可以尝试站内搜索或前往最近更新的内容。`;
                } else {
                    mainMessage = `宇宙在膨胀，页面在漂流。你访问的链接暂时没有对应的内容，但这里的星光依旧灿烂。或许你感兴趣的内容就在不远处。`;
                }
                suggestions.push({ text: '最新文章', url: '/#blogHome', icon: 'fa-newspaper' });
                suggestions.push({ text: '作品精选', url: '/works.html', icon: 'fa-rocket' });
                if (probableSlug && probableSlug.length > 1) {
                    suggestions.push({ text: `全站搜索 “${escapeHtml(probableSlug)}”`, url: `/articles.html?search=${encodeURIComponent(probableSlug)}`, icon: 'fa-search' });
                } else {
                    suggestions.push({ text: '热门标签', url: '/articles.html', icon: 'fa-fire' });
                }
            }

            // 确保至少有两个建议
            if (suggestions.length < 2) {
                suggestions.push({ text: '反馈缺失页面', url: 'https://github.com/Xinyang-Gao/xinyang-gao.github.io/issues/new', icon: 'fa-github' });
            }
        }

        // 渲染主消息
        const msgContainer = document.getElementById('personalizedMessage');
        if (msgContainer) {
            let iconHtml = useCustom ? '<i class="fas fa-star" style="margin-right: 8px; color: var(--accent-color);"></i>' : '<i class="fas fa-info-circle" style="margin-right: 8px; color: var(--accent-color);"></i>';
            msgContainer.innerHTML = `${iconHtml} ${escapeHtml(mainMessage)}`;
        }

        // 渲染建议链接
        const suggestionContainer = document.getElementById('smartSuggestions');
        if (suggestionContainer) {
            if (suggestions.length) {
                suggestionContainer.innerHTML = suggestions.map(sugg => {
                    let iconHtml = sugg.icon ? `<i class="fas ${sugg.icon}" style="margin-right: 5px;"></i>` : '';
                    let targetAttr = (sugg.url.startsWith('http') || sugg.url.startsWith('https')) ? 'target="_blank" rel="noopener noreferrer"' : '';
                    return `<a href="${escapeHtml(sugg.url)}" class="suggestion-link" ${targetAttr}>${iconHtml} ${escapeHtml(sugg.text)}</a>`;
                }).join('');
            } else {
                suggestionContainer.innerHTML = '<span style="font-size:0.85rem;">✨ 试试返回首页浏览最新内容</span>';
            }
        }
    }

    // ----- 快速站内搜索（跳转至文章页带搜索参数）
    function initQuickSearch() {
        const searchInput = document.getElementById('quickSearchInput');
        const searchBtn = document.getElementById('quickSearchBtn');
        if (!searchInput || !searchBtn) return;
        const performSearch = () => {
            let query = searchInput.value.trim();
            if (query === '') {
                window.location.href = '/articles.html';
                return;
            }
            window.location.href = `/articles.html?search=${encodeURIComponent(query)}`;
        };
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    // ----- 返回上一页逻辑（优雅降级）
    function initGoBack() {
        const backBtn = document.getElementById('goBackBtn');
        if (!backBtn) return;
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '/';
            }
        });
    }

    // ----- 加载导航栏与页脚（与全局main.js配合）
    async function loadNavbarAndFooter() {
        if (typeof loadNavbar === 'function') {
            try { await loadNavbar(); } catch (e) { console.warn('loadNavbar 异常', e); }
        }
        if (typeof loadFooter === 'function') {
            try { await loadFooter(); } catch (e) { console.warn('loadFooter 异常', e); }
        }
    }

    // 返回顶部按钮
    function setupBackToTop() {
        const backBtn = document.getElementById('backToTopBtn');
        if (!backBtn) return;
        const toggleBackBtn = () => {
            if (window.scrollY > 400) {
                backBtn.classList.add('show');
            } else {
                backBtn.classList.remove('show');
            }
        };
        window.addEventListener('scroll', toggleBackBtn);
        backBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        toggleBackBtn();
    }

    // 页面过渡动画淡化
    function handleTransitionOut() {
        const transitionDiv = document.getElementById('pageTransition');
        if (transitionDiv) {
            setTimeout(() => {
                transitionDiv.style.opacity = '0';
            }, 200);
        }
        document.body.setAttribute('data-loaded', 'true');
    }

    // 监听主题跨页面变更
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme' && e.newValue) {
            document.documentElement.setAttribute('data-theme', e.newValue);
            const checkbox = document.getElementById('theme-toggle-checkbox');
            if (checkbox) checkbox.checked = (e.newValue === 'dark');
        }
    });

    // 确保主题同步
    function syncTheme() {
        const saved = localStorage.getItem('theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }

    // 主初始化
    async function init404Page() {
        syncTheme();
        await loadNavbarAndFooter();
        setupBackToTop();
        initGoBack();
        initQuickSearch();
        analyzePathAndGenerateMessage();   // 根据网址与自定义映射输出差异化消息
        handleTransitionOut();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init404Page);
    } else {
        init404Page();
    }
})();