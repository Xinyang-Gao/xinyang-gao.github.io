// /js/standalone/404.ts

// ============================================================
// 类型定义
// ============================================================

/** 路径分类结果 */
interface PathClassification {
  type: 'article' | 'work' | 'tag' | 'about' | 'generic';
  slug?: string; // 从路径提取的关键词
  tagName?: string; // 如果是标签页，提取标签名
}

/** 建议链接 */
interface Suggestion {
  text: string;
  url: string;
  icon?: string;
}

/** 消息模板：包含消息文本和默认建议列表 */
interface MessageTemplate {
  message: string;
  suggestions: Suggestion[];
}

/** 分类器配置：正则匹配与分类映射 */
interface ClassifierRule {
  pattern: RegExp;
  type: PathClassification['type'];
  extractSlug?: boolean;
  extractTag?: boolean;
}

/** 完整配置 */
interface AnalyzerConfig {
  customMessages: Record<string, string>;
  customRegex: { pattern: RegExp; message: string }[];
  classifierRules: ClassifierRule[];
  templates: Record<PathClassification['type'], MessageTemplate>;
  defaultSuggestions: Suggestion[];
}

/** 消息生成结果（返回给 UI） */
interface MessageResult {
  message: string;
  suggestions: Suggestion[];
  isCustom: boolean;
}

// ============================================================
// 全局依赖声明（由 main.js 提供）
// ============================================================

declare function loadNavbar(): Promise<void>;
declare function loadFooter(): Promise<void>;

// ============================================================
// 工具函数
// ============================================================

function escapeHtml(str: unknown): string {
  if (!str) return '';
  const s = String(str);
  return s.replace(/[&<>]/g, (m) => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function getDecodedPath(): string {
  try {
    return decodeURIComponent(window.location.pathname);
  } catch {
    return window.location.pathname;
  }
}

// ============================================================
// 路径分析器
// ============================================================

class PathAnalyzer {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  classify(rules: ClassifierRule[]): PathClassification {
    for (const rule of rules) {
      if (rule.pattern.test(this.path)) {
        const result: PathClassification = { type: rule.type };
        if (rule.extractSlug) {
          const slug = this.extractLastSegment();
          if (slug) result.slug = slug;
        }
        if (rule.extractTag) {
          const tag = this.extractLastSegment();
          if (tag) result.tagName = tag;
        }
        return result;
      }
    }
    return { type: 'generic' };
  }

  private extractLastSegment(): string | undefined {
    const parts = this.path.split('/').filter((p) => p.length > 0);
    if (parts.length === 0) return undefined;
    let last = parts[parts.length - 1];
    last = last.replace(/\.html?$/i, '');
    return last.length > 0 && last.length < 100 ? last : undefined;
  }
}

// ============================================================
// 消息构建器
// ============================================================

class MessageBuilder {
  constructor(private readonly config: AnalyzerConfig) {}

  build(path: string): MessageResult {
    // 1. 检查精确匹配或自定义正则
    const customMsg = this.matchCustom(path);
    if (customMsg) {
      return {
        message: customMsg,
        suggestions: this.config.defaultSuggestions,
        isCustom: true,
      };
    }

    // 2. 分类路径
    const analyzer = new PathAnalyzer(path);
    const classification = analyzer.classify(this.config.classifierRules);

    // 3. 根据分类获取模板
    const template = this.config.templates[classification.type] || this.config.templates.generic;

    // 4. 动态构建建议
    let suggestions = this.buildSuggestions(classification, template.suggestions);

    // 5. 至少保留2个建议
    if (suggestions.length < 2) {
      suggestions = suggestions.concat(
        this.config.defaultSuggestions.slice(0, 2 - suggestions.length)
      );
    }

    return {
      message: template.message,
      suggestions,
      isCustom: false,
    };
  }

  private matchCustom(path: string): string | null {
    if (this.config.customMessages[path]) {
      return this.config.customMessages[path];
    }
    for (const rule of this.config.customRegex) {
      if (rule.pattern.test(path)) {
        return rule.message;
      }
    }
    return null;
  }

  private buildSuggestions(
    classification: PathClassification,
    baseSuggestions: Suggestion[]
  ): Suggestion[] {
    const list = [...baseSuggestions];
    const { type, slug, tagName } = classification;

    if (type === 'article' && slug) {
      list.push({
        text: `搜索 “${slug}” 相关文章`,
        url: `/articles/?search=${encodeURIComponent(slug)}`,
        icon: 'fa-search',
      });
    } else if (type === 'work' && slug) {
      list.push({
        text: `检索作品 “${slug}”`,
        url: `/works/?search=${encodeURIComponent(slug)}`,
        icon: 'fa-magnifying-glass',
      });
    } else if (type === 'tag' && tagName) {
      list.push({
        text: `查找标签 “${tagName}”`,
        url: `/articles/?tags=${encodeURIComponent(tagName)}`,
        icon: 'fa-file-alt',
      });
    } else if (type === 'generic' && slug && slug.length > 1) {
      list.push({
        text: `全站搜索 “${slug}”`,
        url: `/articles/?search=${encodeURIComponent(slug)}`,
        icon: 'fa-search',
      });
    } else {
      list.push({ text: '热门标签', url: '/articles/', icon: 'fa-fire' });
    }

    return list;
  }
}

// ============================================================
// 配置实例（与网站规则一致）
// ============================================================

const CONFIG: AnalyzerConfig = {
  customMessages: {
    '/404.html': '你应该是故意的，对吧？',
    '/love': '嗯~ 你为什么会想输入这个呢？',
    '/wxy': '这是什么的缩写呢……（这个页面在未来也许会放点什么~）',
  },
  customRegex: [
    { pattern: /^\/assets\/(.+)/, message: '这里不可以访问哟~' },
    { pattern: /^\/test\/(.+)/, message: '这是一个临时测试页面，目前不可用。感谢您的关注～' },
  ],
  classifierRules: [
    { pattern: /\/article\//i, type: 'article', extractSlug: true },
    { pattern: /\/articles\//i, type: 'article', extractSlug: true },
    { pattern: /\/post\//i, type: 'article', extractSlug: true },
    { pattern: /\/p\//i, type: 'article', extractSlug: true },
    { pattern: /\/blog\//i, type: 'article', extractSlug: true },
    { pattern: /\/work\//i, type: 'work', extractSlug: true },
    { pattern: /\/works\//i, type: 'work', extractSlug: true },
    { pattern: /\/project\//i, type: 'work', extractSlug: true },
    { pattern: /\/portfolio\//i, type: 'work', extractSlug: true },
    { pattern: /\/tag\//i, type: 'tag', extractTag: true },
    { pattern: /\/tags\//i, type: 'tag', extractTag: true },
    { pattern: /\/topic\//i, type: 'tag', extractTag: true },
    { pattern: /\/about/i, type: 'about' },
    { pattern: /\/contact/i, type: 'about' },
    { pattern: /\/me/i, type: 'about' },
  ],
  templates: {
    article: {
      message:
        '这篇文章似乎暂时离开了书架。可能已被作者移至存档区、链接失效，或者还在草稿箱中酝酿。不过别灰心，站内还有很多值得阅读的篇章。',
      suggestions: [
        { text: '浏览全部文章', url: '/articles/', icon: 'fa-book-open' },
        { text: '热门标签导航', url: '/articles/?tags=', icon: 'fa-tags' },
      ],
    },
    work: {
      message:
        '你寻找的作品项目也许正在迭代升级，或者它换了新的展示位置。不妨前往「创意工坊」探索更多有趣的代码与设计作品。',
      suggestions: [
        { text: '进入作品集', url: '/works/', icon: 'fa-cube' },
        { text: '创意实验室', url: '/works/?tags=实验', icon: 'fa-flask' },
      ],
    },
    tag: {
      message:
        '这个标签可能尚未收录，或者还没有任何内容被打上这个标签。你可以浏览所有标签，或从首页热门标签开始。',
      suggestions: [
        { text: '全部文章标签云', url: '/articles/', icon: 'fa-tag' },
        { text: '创意工坊标签', url: '/works/', icon: 'fa-palette' },
      ],
    },
    about: {
      message:
        '关于页面或者联系方式可能还没完全开放，但我一直都在。你可以通过留言板给我发消息，或者从首页了解我。',
      suggestions: [
        { text: '留言板', url: '/contact/', icon: 'fa-comment-dots' },
        { text: '返回首页', url: '/', icon: 'fa-house' },
      ],
    },
    generic: {
      message:
        '宇宙在膨胀，页面在漂流。你访问的链接暂时没有对应的内容，但这里的星光依旧灿烂。或许你感兴趣的内容就在不远处。',
      suggestions: [
        { text: '最新文章', url: '/#blogHome', icon: 'fa-newspaper' },
        { text: '作品精选', url: '/works/', icon: 'fa-rocket' },
      ],
    },
  },
  defaultSuggestions: [
    { text: '返回首页', url: '/', icon: 'fa-house' },
    {
      text: '反馈失效链接',
      url: 'https://github.com/Xinyang-Gao/xinyang-gao.github.io/issues/new',
      icon: 'fa-github',
    },
  ],
};

// ============================================================
// UI 管理器
// ============================================================

class UI404Manager {
  private readonly pathDisplay: HTMLElement | null;
  private readonly msgContainer: HTMLElement | null;
  private readonly suggestionContainer: HTMLElement | null;
  private readonly searchInput: HTMLInputElement | null;
  private readonly searchBtn: HTMLElement | null;
  private readonly backBtn: HTMLElement | null;
  private readonly backToTopBtn: HTMLElement | null;
  private readonly themeCheckbox: HTMLInputElement | null;

  constructor() {
    this.pathDisplay = document.getElementById('errorPathDisplay');
    this.msgContainer = document.getElementById('personalizedMessage');
    this.suggestionContainer = document.getElementById('smartSuggestions');
    this.searchInput = document.getElementById('quickSearchInput') as HTMLInputElement | null;
    this.searchBtn = document.getElementById('quickSearchBtn');
    this.backBtn = document.getElementById('goBackBtn');
    this.backToTopBtn = document.getElementById('backToTopBtn');
    this.themeCheckbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement | null;
  }

  updatePathDisplay(path: string): void {
    if (this.pathDisplay) {
      this.pathDisplay.textContent = path;
    }
  }

  renderMessage(message: string, isCustom = false): void {
    if (!this.msgContainer) return;
    const icon = isCustom ? 'fa-star' : 'fa-info-circle';
    this.msgContainer.innerHTML = `
      <i class="fas ${icon}" aria-hidden="true" style="margin-right: 0.5rem; color: var(--accent-color);"></i>
      ${escapeHtml(message)}
    `;
  }

  renderSuggestions(suggestions: Suggestion[]): void {
    if (!this.suggestionContainer) return;
    if (suggestions.length === 0) {
      this.suggestionContainer.innerHTML =
        '<span style="font-size:0.85rem; color: var(--text-secondary);">返回首页浏览最新内容</span>';
      return;
    }
    this.suggestionContainer.innerHTML = suggestions
      .map((sugg) => {
        const iconHtml = sugg.icon
          ? `<i class="fas ${sugg.icon}" aria-hidden="true" style="margin-right: 4px;"></i>`
          : '';
        const targetAttr = sugg.url.startsWith('http')
          ? 'target="_blank" rel="noopener noreferrer"'
          : '';
        return `<a href="${escapeHtml(sugg.url)}" class="suggestion-link" ${targetAttr}>
                ${iconHtml} ${escapeHtml(sugg.text)}
              </a>`;
      })
      .join('');
  }

  bindQuickSearch(): void {
    if (!this.searchInput || !this.searchBtn) return;
    const performSearch = () => {
      const query = this.searchInput!.value.trim();
      window.location.href = query ? `/articles/?search=${encodeURIComponent(query)}` : '/articles/';
    };
    this.searchBtn.addEventListener('click', performSearch);
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });
  }

  bindGoBack(): void {
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

  bindBackToTop(): void {
    if (!this.backToTopBtn) return;
    const toggleBtn = () => {
      this.backToTopBtn!.classList.toggle('show', window.scrollY > 400);
    };
    window.addEventListener('scroll', toggleBtn);
    this.backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    toggleBtn();
  }

  syncTheme(): void {
    const saved = localStorage.getItem('theme');
    let theme: 'dark' | 'light' | null = null;
    if (saved === 'dark' || saved === 'light') {
      theme = saved;
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
      if (this.themeCheckbox) {
        this.themeCheckbox.checked = theme === 'dark';
      }
    }
  }

  refreshUI(path: string, message: string, suggestions: Suggestion[], isCustom: boolean): void {
    this.updatePathDisplay(path);
    this.renderMessage(message, isCustom);
    this.renderSuggestions(suggestions);
  }
}

// ============================================================
// 辅助功能
// ============================================================

async function loadNavbarAndFooter(): Promise<void> {
  if (typeof loadNavbar === 'function') {
    try {
      await loadNavbar();
    } catch (e) {
      console.warn('loadNavbar 异常', e);
    }
  }
  if (typeof loadFooter === 'function') {
    try {
      await loadFooter();
    } catch (e) {
      console.warn('loadFooter 异常', e);
    }
  }
}

function handlePageTransition(): void {
  const transitionDiv = document.getElementById('pageTransition');
  if (transitionDiv) {
    setTimeout(() => {
      transitionDiv.style.opacity = '0';
    }, 200);
  }
  document.body.setAttribute('data-loaded', 'true');
}

function listenThemeStorage(): void {
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme' && e.newValue) {
      document.documentElement.setAttribute('data-theme', e.newValue);
      const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement | null;
      if (checkbox) {
        checkbox.checked = e.newValue === 'dark';
      }
    }
  });
}

function rebindOnAjaxNavigation(): void {
  window.addEventListener('ajax:navigation', () => {
    const ui = new UI404Manager();
    ui.bindQuickSearch();
    ui.bindGoBack();
    ui.bindBackToTop();
    ui.syncTheme();

    const builder = new MessageBuilder(CONFIG);
    const result = builder.build(getDecodedPath());
    ui.refreshUI(getDecodedPath(), result.message, result.suggestions, result.isCustom);
  });
}

// ============================================================
// 主初始化
// ============================================================

async function init404Page(): Promise<void> {
  const ui = new UI404Manager();
  ui.syncTheme();

  await loadNavbarAndFooter();

  ui.bindBackToTop();
  ui.bindGoBack();
  ui.bindQuickSearch();

  const builder = new MessageBuilder(CONFIG);
  const path = getDecodedPath();
  const result = builder.build(path);
  ui.refreshUI(path, result.message, result.suggestions, result.isCustom);

  handlePageTransition();
  listenThemeStorage();
  rebindOnAjaxNavigation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init404Page);
} else {
  init404Page();
}

export { CONFIG, PathAnalyzer, MessageBuilder, UI404Manager, init404Page };