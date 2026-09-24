// /js/pages/404.ts
// 404 页面：根据访问路径动态渲染标题与描述

import { themeController } from '/js/core/theme-controller.js';

// ============================================================
// 类型定义
// ============================================================

type PathType = 'article' | 'work' | 'tag' | 'about' | 'generic';

interface PathClassification {
  type: PathType;
}

/** 一条路径对应的完整模板：标题 + 描述 */
interface MessageTemplate {
  title: string;
  message: string;
}

interface ClassifierRule {
  pattern: RegExp;
  type: PathType;
}

interface AnalyzerConfig {
  /** 精确匹配路径 */
  customMessages: Record<string, MessageTemplate>;
  /** 正则匹配路径 */
  customRegex: Array<{ pattern: RegExp; template: MessageTemplate }>;
  /** 分类规则 */
  classifierRules: ClassifierRule[];
  /** 各分类的默认模板 */
  templates: Record<PathType, MessageTemplate>;
}

// ============================================================
// 工具
// ============================================================

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
  constructor(private readonly path: string) {}

  classify(rules: ClassifierRule[]): PathClassification {
    for (const rule of rules) {
      if (rule.pattern.test(this.path)) {
        return { type: rule.type };
      }
    }
    return { type: 'generic' };
  }
}

// ============================================================
// 消息构建器
// ============================================================

class MessageBuilder {
  constructor(private readonly config: AnalyzerConfig) {}

  build(path: string): MessageTemplate {
    // 1. 精确匹配
    const exact = this.config.customMessages[path];
    if (exact) return exact;

    // 2. 正则匹配
    for (const rule of this.config.customRegex) {
      if (rule.pattern.test(path)) return rule.template;
    }

    // 3. 分类匹配
    const classification = new PathAnalyzer(path).classify(this.config.classifierRules);
    return this.config.templates[classification.type] ?? this.config.templates.generic;
  }
}

// ============================================================
// 配置（按需增删）
// ============================================================

const CONFIG: AnalyzerConfig = {
  customMessages: {
    '/404.html': {
      title: '你应该是故意的，对吧？',
      message: '好吧，被你发现了。这里就是 404 页面本身。',
    },
    '/love': {
      title: '嗯～',
      message: '你为什么会想输入这个呢？',
    },
    '/wxy': {
      title: '这是什么的缩写呢……',
      message: '这个页面在未来也许会放点什么～',
    },
  },

  customRegex: [
    {
      pattern: /^\/assets\//,
      template: {
        title: '这里不可以访问哟～',
        message: '静态资源目录不对外开放，请从站内链接访问相关内容。',
      },
    },
    {
      pattern: /^\/test\//,
      template: {
        title: '测试页面',
        message: '这是一个临时测试页面，目前不可用。感谢您的关注～',
      },
    },
  ],

  classifierRules: [
    { pattern: /\/article\//i, type: 'article' },
    { pattern: /\/articles\//i, type: 'article' },
    { pattern: /\/post\//i, type: 'article' },
    { pattern: /\/blog\//i, type: 'article' },
    { pattern: /\/work\//i, type: 'work' },
    { pattern: /\/works\//i, type: 'work' },
    { pattern: /\/project\//i, type: 'work' },
    { pattern: /\/portfolio\//i, type: 'work' },
    { pattern: /\/tag\//i, type: 'tag' },
    { pattern: /\/tags\//i, type: 'tag' },
    { pattern: /\/topic\//i, type: 'tag' },
    { pattern: /\/about/i, type: 'about' },
    { pattern: /\/contact/i, type: 'about' },
  ],

  templates: {
    article: {
      title: '文章未找到',
      message: '这篇文章似乎暂时离开了书架，可能已被移至存档区、链接失效，或者还在草稿箱中酝酿。',
    },
    work: {
      title: '作品未找到',
      message: '你寻找的作品项目也许正在迭代升级，或者它换了新的展示位置。',
    },
    tag: {
      title: '标签未找到',
      message: '这个标签可能尚未收录，或者还没有任何内容被打上这个标签。',
    },
    about: {
      title: '页面未找到',
      message: '关于页面或联系方式可能还没有完全开放，但我一直都在。',
    },
    generic: {
      title: '页面未找到',
      message: '宇宙在膨胀，页面在漂流。你访问的链接暂时没有对应的内容。',
    },
  },
};

// ============================================================
// UI 管理器
// ============================================================

class UI404Manager {
  private readonly titleEl: HTMLElement | null;
  private readonly messageEl: HTMLElement | null;
  private readonly pathDisplay: HTMLElement | null;
  private readonly backBtn: HTMLElement | null;

  constructor() {
    this.titleEl = document.getElementById('errorTitle');
    this.messageEl = document.getElementById('errorMessage');
    this.pathDisplay = document.getElementById('errorPathDisplay');
    this.backBtn = document.getElementById('goBackBtn');
  }

  refresh(path: string, template: MessageTemplate): void {
    if (this.titleEl) this.titleEl.textContent = template.title;
    if (this.messageEl) this.messageEl.textContent = template.message;
    if (this.pathDisplay) this.pathDisplay.textContent = path;
  }

  bindGoBack(): void {
    if (!this.backBtn) return;
    this.backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    });
  }
}

// ============================================================
// 初始化
// ============================================================

function init404Page(): void {
  // 主题由 app-initializer 与 theme-controller 统管，此处幂等调用即可
  themeController.init();

  const ui = new UI404Manager();
  ui.bindGoBack();

  const path = getDecodedPath();
  const template = new MessageBuilder(CONFIG).build(path);
  ui.refresh(path, template);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init404Page);
} else {
  init404Page();
}

export { CONFIG, MessageBuilder, PathAnalyzer, UI404Manager, init404Page };