---
title: README.md
description: 项目介绍
author: 高新炀 ＆ DEEPSEEK-V4
date: 2026-04-12
tag: [网站]
---

# 个人网站项目 README

这是一个功能完整的静态个人网站，兼具博客、作品集、留言板、友链等功能。网站采用**双栏布局**（左侧个人信息卡片 + 右侧主内容区），拥有现代化的界面、无刷新页面切换、搜索筛选、暗黑模式、自定义光标、全局图片查看器等特性。文章由 Markdown 文件自动生成 HTML，并集成 Twikoo 评论系统和不蒜子统计。

[在网站上查看此文章](https://xinyang-gao.github.io/articles/README.html)

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [构建与数据更新](#构建与数据更新)
- [配置说明](#配置说明)
- [数据格式](#数据格式)
- [开发与扩展](#开发与扩展)
- [许可证](#许可证)

---

## 功能概览

### 前端交互
- **无刷新页面切换**：通过 AJAX 动态加载页面内容，伴随“纸张展开”过渡动画。
- **暗黑模式**：支持跟随系统或手动切换，切换时带有淡入淡出效果，主题偏好持久化存储。
- **搜索与标签筛选**：文章和作品页面支持按标题、标签、日期搜索，可通过标签按钮快速筛选，筛选条件自动同步到 URL。
- **自定义光标**：非触摸设备上显示独特的钢笔尖光标，悬停在可点击元素上时自动吸附并变换样式。
- **响应式设计**：完美适配移动端和桌面端。导航栏在移动端折叠为汉堡菜单，双栏布局在窄屏下自动转为单列。

### 文章阅读增强
- **目录导航**：自动提取文章标题生成目录，支持点击跳转和滚动高亮。
- **阅读进度条**：页面顶部显示阅读进度。
- **图片预览**：文章图片懒加载，点击任意图片打开全局图片查看器，支持缩放、拖拽、旋转、前后切换。
- **代码块增强**：代码块自动添加语言标签和复制按钮，支持一键复制。
- **阅读时间估算**：根据文章字数自动计算阅读时间。
- **元数据展示**：文章页显示作者、字数、阅读时间、发布日期、最后更新日期及修订次数。
- **公式与图表**：支持 KaTeX 数学公式和 Mermaid 图表渲染。

### 首页增强
- **统计卡片**：展示文章总数、总字数、作品总数，点击卡片可跳转。
- **标签云**：分“文章星系”和“创意工坊”两个区域，点击标签可跳转并自动筛选。
- **最近更新**：分别展示最新 5 篇文章和 5 个作品。
- **动态问候语**：根据时段显示不同的欢迎语。
- **全站统计**：展示不蒜子的访问量和访客数。

### 评论与统计
- **评论系统**：集成 Twikoo，支持留言、回复、表情。
- **访问统计**：不蒜子统计全站及单页访问量；`/json/statistics.json` 提供文章/作品聚合数据。

### 安全与辅助
- **外链确认**：点击外部链接时弹出模态框确认，白名单域名自动跳转，增强安全性。
- **返回顶部按钮**：滚动后显示，平滑返回顶部。
- **网站运行时长**：页脚动态显示网站已运行时间（精确到秒）。
- **Cookie 同意横幅**：提供明确的 Cookie 使用说明和同意/拒绝选项，符合隐私规范。

### 内容自动生成 (Python)
- **Markdown → HTML**：`ArticleManager.py` 批量处理 `assets/source/` 下的 `.md` 文件，支持 YAML front matter、内容哈希与修改次数追踪。
- **作品管理**：`WorkManager.py` 扫描 `works/` 目录生成作品索引。
- **统计聚合**：`Statistic.py` 生成 `statistics.json`。
- **RSS 订阅**：`RssGenerator.py` 自动生成 `rss.xml`。
- **一键构建**：`run.py` 按顺序执行所有脚本。

---

## 技术栈

| 类别 | 技术/库 |
|------|---------|
| 前端 | HTML5, CSS3, JavaScript (ES6 Modules) |
| 样式 | 自定义 CSS（CSS 变量、暗黑模式、响应式、双栏布局） |
| 图标 | Font Awesome 6 |
| Markdown 转换 | Python 3 + `markdown` 库 |
| 语法高亮 | `codehilite`（Markdown 扩展） |
| 评论系统 | [Twikoo](https://twikoo.js.org/) |
| 统计系统 | [不蒜子](https://busuanzi.ibruce.info/) |
| 数学公式 | KaTeX (`auto-render`) |
| 图表 | Mermaid |
| 存储 | `localStorage`（缓存数据、主题偏好） |
| 构建工具 | Python 脚本 (`run.py`) |

---

## 项目结构

```
/
├── index.html                 # 首页（统计卡片、标签云、最近更新）
├── about.html                 # 关于页面
├── articles.html              # 文章列表（搜索、筛选、排序）
├── works.html                 # 作品列表（搜索、筛选）
├── contact.html               # 留言板
├── friends.html               # 友链页面（卡片、申请说明、Twikoo）
├── 404.html                   # 自定义 404 页面
├── navbar.html                # 导航栏 HTML 片段
├── footer.html                # 页脚 HTML 片段（三列网格、运行时长、不蒜子）
├── rss.xml                    # RSS Feed（自动生成）
│
├── css/
│   ├── style.css              # 全局样式（双栏布局、暗黑模式、动画、响应式）
│   ├── article.css            # 文章专用样式（目录、代码块、进度条）
│   ├── image-viewer.css       # 图片查看器样式
│   ├── navbar.css             # 导航栏样式
│   ├── footer.css             # 页脚样式
│   ├── friends.css            # 友链页面样式
│   └── twikoo.css             # Twikoo 评论框样式覆盖
│
├── js/
│   ├── core.js                # 配置常量、工具类、存储控制器、Cookie 管理器
│   ├── ui-effects.js          # 自定义光标、外链管理器、滚动揭示
│   ├── search-render.js       # 数据管理、UI 渲染器、搜索控制器
│   ├── main.js                # 主入口：加载导航/页脚，初始化各页面功能
│   ├── article.js             # 文章详情页脚本（目录、进度条、代码块、懒加载）
│   ├── image-viewer.js        # 全局图片查看器组件
│   ├── searchWorker.js        # Web Worker（过滤、排序、标签提取）
│   ├── sw.js                  # Service Worker（缓存关键 JSON）
│   └── busuanzi.min.js        # 不蒜子统计
│
├── articles/                  # 生成的 HTML 文章（由 ArticleManager.py 输出）
│   ├── xxx.html
│   └── .hidden/               # 隐藏文章的输出目录（如含有“隐藏”标签）
│
├── assets/                    # 源文件（Markdown 源文件、图片等）
│   └── source/                # Markdown 源文件目录（按分类子目录组织）
│       ├── 随笔/
│       │   └── 文章.md
│       └── 技术/
│           └── 另一篇.md
│
├── works/                     # 作品数据源目录
│   └── 作品名/
│       └── metadata.json
│
├── json/                      # 自动生成的 JSON 数据
│   ├── articles.json
│   ├── works.json
│   ├── statistics.json
│   └── friends.json           # 友链数据（需手动维护）
│
├── python/                    # Python 自动化脚本
│   ├── ArticleManager.py
│   ├── WorkManager.py
│   ├── Statistic.py
│   ├── RssGenerator.py
│   └── run.py
│
└── README.md
```

---

## 快速开始

### 本地运行

1. **克隆仓库到本地**。

2. **安装 Python 依赖**（用于 Markdown 转换）：
   ```bash
   pip install markdown pyyaml
   ```

3. **生成网站数据**：
   ```bash
   cd python
   python run.py
   ```
   该脚本会依次执行文章管理、作品管理、统计生成、RSS 生成。

4. **启动本地服务器**（项目根目录）：
   ```bash
   python -m http.server 8000
   ```
   访问 `http://localhost:8000` 即可预览。

### 部署到生产环境

- 将整个项目上传至静态网站托管服务（如 GitHub Pages、Netlify、Vercel 等）。
- 确保所有文件均已上传。
- 配置 Twikoo 后端地址（见[配置说明](#配置说明)）。
- 更新 `js/core.js` 中网站创建时间 `SITE_BIRTH`（如果需要精确运行时长）。
- 如需自定义域名，请按托管服务指引设置。

---

## 构建与数据更新

### 文章管理

- **添加新文章**：
  1. 在 `assets/source/` 下选择或创建分类子目录（如“随笔”、“技术”）。
  2. 在该目录中创建 `.md` 文件，文件头部必须包含 YAML front matter（`title`、`date`、`tag` 等）。
  3. 运行 `python run.py`（或单独运行 `ArticleManager.py`）。
  4. 生成的 HTML 将输出到 `articles/`，同时 `articles.json` 和 `rss.xml` 自动更新。

- **修改文章**：直接编辑 `.md` 文件，重新运行脚本。脚本会检测内容哈希变化，自动更新 `last_updated` 和 `modify_count`。

- **删除文章**：删除 `.md` 文件后重新运行脚本，索引会自动清理。

- **隐藏文章**：在 front matter 的 `tag` 中加入 `隐藏`，该文章不会出现在文章列表和 RSS 中（但仍会生成 HTML 至 `articles/.hidden/`）。

### 作品管理

- **添加新作品**：
  1. 在 `works/` 下新建文件夹，文件夹名即作品标题。
  2. 在文件夹内创建 `metadata.json`（格式见下方[数据格式](#数据格式)）。
  3. 运行 `python/WorkManager.py` 或 `run.py`。

- **隐藏作品**：在 `metadata.json` 的 `tag` 中加入 `隐藏`，该作品将被排除在索引和 RSS 外。

### 友链管理

- 手动编辑 `json/friends.json`，每个条目包含 `name`、`link`、`desc`、`avatar`。
- 友链页面动态读取该 JSON，并缓存 10 分钟。

### 统计与 RSS

- `Statistic.py` 聚合文章和作品数据生成 `statistics.json`。
- `RssGenerator.py` 生成 `rss.xml`。
- `run.py` 包含上述所有步骤，推荐使用一键构建。

---

## 配置说明

### 1. Twikoo 评论系统

修改以下文件中的 `envId` 为你的 Twikoo 后端地址：
- `contact.html`
- `friends.html`
- `404.html`
- `js/article.js`（通过 `ArticleManager.py` 生成的文章页面也会包含该配置）

示例：
```javascript
twikoo.init({
  envId: 'https://your-endpoint.netlify.app/.netlify/functions/twikoo',
  el: '#twikoo-comments'
});
```

### 2. 网站运行起始时间

在 `js/core.js` 中修改 `SITE_BIRTH` 常量：
```javascript
SITE_BIRTH: new Date('2025-02-22T12:23:53Z')
```
页脚将根据该时间显示网站运行时长。

### 3. 外链跳转白名单

在 `js/core.js` 的 `EXTERNAL_WHITELIST` 中添加受信任的域名：
```javascript
EXTERNAL_WHITELIST: new Set([
  "github.com", "bilibili.com", ...
])
```
白名单域名将自动跳转，非白名单域名会弹出确认框。

### 4. RSS 生成配置

编辑 `python/RssGenerator.py` 开头的常量：
- `SITE_TITLE`：网站标题
- `SITE_LINK`：网站根地址（如 `https://xinyang-gao.github.io`）
- `SITE_DESCRIPTION`：站点描述
- `INCLUDE_ARTICLES`：是否包含文章（默认 `True`）
- `INCLUDE_WORKS`：是否包含作品（默认 `False`）

### 5. 背景图片

在 `js/core.js` 的 `BACKGROUND_IMAGES` 数组中替换或添加背景图片 URL，首页和欢迎弹窗会随机选用。

### 6. Cookie 同意横幅

`js/core.js` 中的 `CookieConsentManager` 负责管理 Cookie 同意状态。用户的选择存储在 `localStorage` 中，完全遵循隐私政策。

---

## 数据格式

### `articles.json`
```json
{
  "generated_at": "2026-04-24T...",
  "total_articles": 10,
  "total_word_count": 5000,
  "articles": [
    {
      "relative_path": "assets/source/随笔/文章.md",
      "hash": "md5...",
      "last_updated": "2026-04-20",
      "modify_count": 3,
      "hidden": false,
      "title": "文章标题",
      "date": "2026-03-01",
      "description": "简介",
      "author": "高新炀",
      "tags": ["随笔", "生活"],
      "category": "随笔",
      "url": "/articles/%E6%96%87%E7%AB%A0.html",
      "word_count": 1200,
      "read_time": "4分钟"
    }
  ]
}
```

### `works.json`
```json
{
  "works": [
    {
      "title": "作品标题",
      "date": "2026-01-01",
      "description": "作品描述",
      "author": "高新炀",
      "tag": ["游戏", "工具"],
      "link": "https://example.com"
    }
  ]
}
```

### `metadata.json`（`works/作品名/` 内）
```json
{
  "title": "作品标题",
  "date": "2026-01-01",
  "description": "详细描述",
  "author": "高新炀",
  "tag": ["标签1", "标签2"],
  "link": "https://example.com"
}
```

### `statistics.json`
```json
{
  "version": 520,
  "last_updated": "2026-04-20",
  "last_updated_full": "2026-04-20T15:30:00+08:00",
  "total_articles": 12,
  "total_word_count": 18000,
  "total_works": 5,
  "article_tags": ["随笔", "技术", "生活"],
  "article_categories": ["随笔", "技术"],
  "work_tags": ["游戏", "工具"]
}
```

### `friends.json`
```json
[
  {
    "name": "站点名称",
    "link": "https://example.com",
    "desc": "站点描述",
    "avatar": "https://example.com/avatar.webp"
  }
]
```

### Markdown Front Matter (YAML)
```yaml
---
title: 我的文章
date: 2026-03-01
description: 简介
author: 高新炀
tag: [随笔, 生活]
category: 随笔
---
```
- `tag` 可包含 `隐藏` 来隐藏文章。
- `category` 若不提供则自动使用所在子目录名。

---

## 开发与扩展

### 修改样式
- 所有 CSS 变量定义在 `style.css` 的 `:root` 和 `[data-theme="dark"]` 中，修改这些变量即可全局调整主题色、间距、圆角等。

### 添加新页面
1. 在根目录创建新的 `.html` 文件。
2. 确保包含 `#navbar-placeholder`、`#personal-card-container`、`#footer-placeholder` 等占位元素。
3. 在 `navbar.html` 中添加导航链接，设置 `data-page` 属性。
4. 若需要动态数据，可在 `js/search-render.js` 或 `js/main.js` 中添加对应的初始化逻辑。

### 调整缓存策略
- 在 `js/search-render.js` 的 `DataManager.config` 中修改 `cacheControl`。
- 缓存过期时间可通过 `Utils.isDataExpired` 的 `minutes` 参数调整（默认 5 分钟）。

### 性能调试
- 浏览器控制台会输出关键操作耗时（`PerformanceMonitor` 类），耗时超过 100ms 会有提示。
- 滚动渐入动画使用 `IntersectionObserver`，阈值可在 `js/ui-effects.js` 中调整。

### 无刷新导航
- 已在 `js/main.js` 的 `enableAjaxNavigation` 中启用，所有内部链接点击后会通过 `fetch` 加载新页面并替换主内容区域。
- 若需禁用某个链接的 AJAX 导航，可添加 `data-no-ajax="true"` 属性。

---

## 许可证

本项目代码基于 **MIT 许可证** 开源。

MIT 许可证允许任何人以任何目的使用、复制、修改、合并、出版发行、散布、再授权及销售软件及其副本，但必须包含版权声明和许可声明。

文章中除特别声明外的文字内容采用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) 许可协议（署名-非商业性使用-禁止演绎）。

---

**项目维护者**：高新炀  
**联系方式**：[邮件](mailto:gao_xinyang@foxmail.com) | [GitHub](https://github.com/Xinyang-Gao)

如有任何问题，欢迎通过网站留言板或邮箱联系。