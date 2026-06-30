// /js/standalone/404.js
// 自定义 404 页面：智能路径分析、个性化消息、快速搜索、返回上一页

(function() {
  // ==================== 配置常量 ====================
  const CONFIG = {
    // 精确路径 -> 自定义消息
    customMessages: {
      "/404.html": "你应该是故意的，对吧？",
      "/love": "嗯~ 你为什么会想输入这个呢？",
      "/wxy": "这是什么的缩写呢……（这个页面在未来也许会放点什么~）"
    },
    // 正则匹配规则
    regexRules: [
      { pattern: /^\/assets\/(.+)/, message: "这里不可以访问哟~" },
      { pattern: /^\/test\/(.+)/, message: "这是一个临时测试页面，目前不可用。感谢您的关注～" }
    ],
    // 通用建议链接
    defaultSuggestions: [
      { text: '返回首页', url: '/', icon: 'fa-house' },
      { text: '浏览全部文章', url: '/articles/', icon: 'fa-book-open' },
      { text: '创意作品集', url: '/works/', icon: 'fa-cube' },
      { text: '反馈失效链接', url: 'https://github.com/Xinyang-Gao/xinyang-gao.github.io/issues/new', icon: 'fa-github' }
    ],
    // 路径分类模式
    patterns: {
      article: [/\/article\//i, /\/articles\//i, /\/post\//i, /\/p\//i, /\/blog\//i],
      work: [/\/work\//i, /\/works\//i, /\/project\//i, /\/portfolio\//i],
      tag: [/\/tag\//i, /\/tags\//i, /\/topic\//i],
      about: [/\/about/i, /\/contact/i, /\/me/i]
    }
  };

  // ==================== 工具函数 ====================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function getDecodedPath() {
    try {
      return decodeURIComponent(window.location.pathname);
    } catch {
      return window.location.pathname;
    }
  }

  // ==================== 消息生成器 ====================
  class MessageGenerator {
    constructor() {
      this.path = getDecodedPath();
    }

    getCustomMessage() {
      // 精确匹配
      if (CONFIG.customMessages.hasOwnProperty(this.path)) {
        return { found: true, message: CONFIG.customMessages[this.path] };
      }
      // 正则匹配
      for (const rule of CONFIG.regexRules) {
        if (rule.pattern.test(this.path)) {
          return { found: true, message: rule.message };
        }
      }
      return { found: false };
    }

    generateSmartMessage() {
      const custom = this.getCustomMessage();
      if (custom.found) {
        return { message: custom.message, suggestions: CONFIG.defaultSuggestions };
      }

      const pathParts = this.path.split('/').filter(p => p.length > 0);
      let lastSegment = pathParts.length ? pathParts[pathParts.length - 1] : '';
      if (lastSegment.endsWith('.html')) lastSegment = lastSegment.slice(0, -5);
      if (lastSegment.endsWith('.htm')) lastSegment = lastSegment.slice(0, -4);

      const isArticleMatch = CONFIG.patterns.article.some(p => p.test(this.path));
      const isWorkMatch = CONFIG.patterns.work.some(p => p.test(this.path));
      const isTagMatch = CONFIG.patterns.tag.some(p => p.test(this.path));
      const isAboutMatch = CONFIG.patterns.about.some(p => p.test(this.path));
      const probableSlug = lastSegment && lastSegment.length < 100 ? lastSegment : null;

      let message = '';
      let suggestions = [];

      if (isArticleMatch) {
        message = `这篇文章似乎暂时离开了书架。可能已被作者移至存档区、链接失效，或者还在草稿箱中酝酿。不过别灰心，站内还有很多值得阅读的篇章。`;
        suggestions = [
          { text: '浏览全部文章', url: '/articles/', icon: 'fa-book-open' },
          { text: '热门标签导航', url: '/articles/?tags=', icon: 'fa-tags' }
        ];
        if (probableSlug) {
          suggestions.push({ text: `搜索 「${escapeHtml(probableSlug.substring(0, 28))}」 相关文章`, url: `/articles/?search=${encodeURIComponent(probableSlug)}`, icon: 'fa-search' });
        }
      } else if (isWorkMatch) {
        message = `你寻找的作品项目也许正在迭代升级，或者它换了新的展示位置。不妨前往「创意工坊」探索更多有趣的代码与设计作品。`;
        suggestions = [
          { text: '进入作品集', url: '/works/', icon: 'fa-cube' },
          { text: '创意实验室', url: '/works/?tags=实验', icon: 'fa-flask' }
        ];
        if (probableSlug) {
          suggestions.push({ text: `站内检索作品 「${escapeHtml(probableSlug)}」`, url: `/works/?search=${encodeURIComponent(probableSlug)}`, icon: 'fa-magnifying-glass' });
        }
      } else if (isTagMatch) {
        const tagName = pathParts[pathParts.length - 1] || '';
        message = `标签「${escapeHtml(tagName)}」可能尚未收录，或者还没有任何内容被打上这个标签。你可以浏览所有标签，或从首页热门标签开始。`;
        suggestions = [
          { text: '全部文章标签云', url: '/articles/', icon: 'fa-tag' },
          { text: '创意工坊标签', url: '/works/', icon: 'fa-palette' }
        ];
        if (tagName) {
          suggestions.push({ text: `在文章中查找标签「${escapeHtml(tagName)}」`, url: `/articles/?tags=${encodeURIComponent(tagName)}`, icon: 'fa-file-alt' });
        }
      } else if (isAboutMatch) {
        message = `关于页面或者联系方式可能还没完全开放，但我一直都在。你可以通过留言板给我发消息，或者从首页了解我。`;
        suggestions = [
          { text: '留言板', url: '/contact/', icon: 'fa-comment-dots' },
          { text: '返回首页', url: '/', icon: 'fa-house' }
        ];
      } else {
        if (this.path.endsWith('.html') || this.path.includes('.')) {
          message = `这个页面地址可能已经更新或归档。你访问的链接也许来自旧版本的站点地图。可以尝试站内搜索或前往最近更新的内容。`;
        } else {
          message = `宇宙在膨胀，页面在漂流。你访问的链接暂时没有对应的内容，但这里的星光依旧灿烂。或许你感兴趣的内容就在不远处。`;
        }
        suggestions = [
          { text: '最新文章', url: '/#blogHome', icon: 'fa-newspaper' },
          { text: '作品精选', url: '/works/', icon: 'fa-rocket' }
        ];
        if (probableSlug && probableSlug.length > 1) {
          suggestions.push({ text: `全站搜索 “${escapeHtml(probableSlug)}”`, url: `/articles/?search=${encodeURIComponent(probableSlug)}`, icon: 'fa-search' });
        } else {
          suggestions.push({ text: '热门标签', url: '/articles/', icon: 'fa-fire' });
        }
      }

      if (suggestions.length < 2) {
        suggestions.push({ text: '反馈缺失页面', url: 'https://github.com/Xinyang-Gao/xinyang-gao.github.io/issues/new', icon: 'fa-github' });
      }
      return { message, suggestions };
    }
  }

  // ==================== UI 组件管理 ====================
  class UI404Manager {
    constructor() {
      this.pathDisplay = document.getElementById('errorPathDisplay');
      this.msgContainer = document.getElementById('personalizedMessage');
      this.suggestionContainer = document.getElementById('smartSuggestions');
      this.searchInput = document.getElementById('quickSearchInput');
      this.searchBtn = document.getElementById('quickSearchBtn');
      this.backBtn = document.getElementById('goBackBtn');
      this.backToTopBtn = document.getElementById('backToTopBtn');
      this.themeCheckbox = document.getElementById('theme-toggle-checkbox');
    }

    updatePathDisplay(path) {
      if (this.pathDisplay) this.pathDisplay.textContent = path;
    }

    renderMessage(message, useCustom = false) {
      if (!this.msgContainer) return;
      const iconHtml = useCustom ? '<i class="fas fa-star" style="margin-right: 8px; color: var(--accent-color);"></i>' : '<i class="fas fa-info-circle" style="margin-right: 8px; color: var(--accent-color);"></i>';
      this.msgContainer.innerHTML = `${iconHtml} ${escapeHtml(message)}`;
    }

    renderSuggestions(suggestions) {
      if (!this.suggestionContainer) return;
      if (suggestions.length) {
        this.suggestionContainer.innerHTML = suggestions.map(sugg => {
          const iconHtml = sugg.icon ? `<i class="fas ${sugg.icon}" style="margin-right: 5px;"></i>` : '';
          const targetAttr = (sugg.url.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : '');
          return `<a href="${escapeHtml(sugg.url)}" class="suggestion-link" ${targetAttr}>${iconHtml} ${escapeHtml(sugg.text)}</a>`;
        }).join('');
      } else {
        this.suggestionContainer.innerHTML = '<span style="font-size:0.85rem;">✨ 试试返回首页浏览最新内容</span>';
      }
    }

    bindQuickSearch() {
      if (!this.searchInput || !this.searchBtn) return;
      const performSearch = () => {
        const query = this.searchInput.value.trim();
        window.location.href = query ? `/articles/?search=${encodeURIComponent(query)}` : '/articles/';
      };
      this.searchBtn.addEventListener('click', performSearch);
      this.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
      });
    }

    bindGoBack() {
      if (!this.backBtn) return;
      this.backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/';
        }
      });
    }

    bindBackToTop() {
      if (!this.backToTopBtn) return;
      const toggleBtn = () => {
        this.backToTopBtn.classList.toggle('show', window.scrollY > 400);
      };
      window.addEventListener('scroll', toggleBtn);
      this.backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      toggleBtn();
    }

    syncTheme() {
      const saved = localStorage.getItem('theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
        if (this.themeCheckbox) this.themeCheckbox.checked = (saved === 'dark');
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  }

  // ==================== 导航栏与页脚加载（复用全局函数，若不存在则降级） ====================
  async function loadNavbarAndFooter() {
    if (typeof loadNavbar === 'function') {
      try { await loadNavbar(); } catch (e) { console.warn('loadNavbar 异常', e); }
    }
    if (typeof loadFooter === 'function') {
      try { await loadFooter(); } catch (e) { console.warn('loadFooter 异常', e); }
    }
  }

  // ==================== 页面过渡效果 ====================
  function handlePageTransition() {
    const transitionDiv = document.getElementById('pageTransition');
    if (transitionDiv) {
      setTimeout(() => { transitionDiv.style.opacity = '0'; }, 200);
    }
    document.body.setAttribute('data-loaded', 'true');
  }

  // ==================== 监听主题跨页面变更 ====================
  function listenThemeStorage() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme' && e.newValue) {
        document.documentElement.setAttribute('data-theme', e.newValue);
        const checkbox = document.getElementById('theme-toggle-checkbox');
        if (checkbox) checkbox.checked = (e.newValue === 'dark');
      }
    });
  }

  // ==================== 无刷新导航重新绑定（如果页面通过 AJAX 加载） ====================
  function rebindOnAjaxNavigation() {
    window.addEventListener('ajax:navigation', () => {
      // 重新获取 DOM 元素引用并重新绑定事件
      const ui = new UI404Manager();
      ui.bindQuickSearch();
      ui.bindGoBack();
      ui.bindBackToTop();
      ui.syncTheme();
      // 重新生成消息（路径可能变化）
      const generator = new MessageGenerator();
      const { message, suggestions } = generator.generateSmartMessage();
      ui.renderMessage(message);
      ui.renderSuggestions(suggestions);
      ui.updatePathDisplay(getDecodedPath());
    });
  }

  // ==================== 主初始化 ====================
  async function init404Page() {
    const ui = new UI404Manager();
    ui.syncTheme();
    await loadNavbarAndFooter();
    ui.bindBackToTop();
    ui.bindGoBack();
    ui.bindQuickSearch();

    const generator = new MessageGenerator();
    const custom = generator.getCustomMessage();
    const { message, suggestions } = generator.generateSmartMessage();
    ui.renderMessage(message, custom.found);
    ui.renderSuggestions(suggestions);
    ui.updatePathDisplay(generator.path);

    handlePageTransition();
    listenThemeStorage();
    rebindOnAjaxNavigation();
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init404Page);
  } else {
    init404Page();
  }
})();