---
title: README.md
description: README.md
author: 高新炀
date: 2026-04-12
tag: [网站]
---

# 个人网站项目 README

本项目是一个功能完整的静态个人网站，融合了博客、作品集、留言板、友链等功能，具有现代化的界面、无刷新页面切换、搜索筛选、暗黑模式、自定义光标等特性。文章通过 Markdown 文件生成，并集成 Twikoo 评论系统和不蒜子统计。

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [文件结构](#文件结构)
- [快速开始](#快速开始)
- [构建与数据更新](#构建与数据更新)
- [配置文件说明](#配置文件说明)
- [数据格式](#数据格式)
- [开发与扩展](#开发与扩展)
- [许可证](#许可证)

---

## 项目简介

这是一个基于 HTML/CSS/JS 构建的静态个人网站，采用**双栏布局**设计（左侧个人信息卡片 + 右侧主内容区），主要包含以下模块：

- **首页**：展示统计卡片（文章数、总字数、作品数）、标签云（文章标签/作品标签）、最近更新的文章和作品、动态问候语，以及不蒜子全站统计。
- **关于**：个人介绍页。
- **文章**：通过 Markdown 生成的博客文章列表，支持标签筛选、搜索、阅读进度条、目录导航和 Twikoo 评论。
- **作品**：展示个人项目作品，支持标签筛选、搜索和详情弹窗（点击卡片展示详情）。
- **友链**：展示友情链接，支持 JSON 数据驱动、申请要求说明、一键复制站点信息模板，并集成 Twikoo 评论区用于友链申请交流。
- **留言板**：基于 Twikoo 的独立评论系统，访客可留言交流。
- **404 页面**：包含返回首页、返回上一页和问题反馈入口。

网站采用 SPA 风格的页面切换动画（“纸张展开”效果），所有页面内容由 `PageManager` 动态加载，数据从 JSON 文件中获取，具有良好的扩展性和维护性。

---

## 功能特性

### 前端体验
- **无刷新页面切换**：通过 `PageManager` 实现，带有平滑过渡动画（`draw-animation-paper`）。
- **暗黑模式**：主题切换，跟随系统或用户手动选择，持久化存储到 `localStorage`，切换时带有淡入淡出过渡效果。
- **搜索与标签筛选**：文章和作品页面支持标题、标签、日期等多种搜索方式，并可通过标签按钮筛选，筛选条件自动同步到 URL。
- **自定义光标**：非触摸设备上显示独特的钢笔尖光标（`custom-cursor`），悬停可点击元素时自动吸附并改变样式。
- **响应式设计**：适配移动端和桌面端，导航栏在移动端折叠为汉堡菜单，双栏布局在大屏幕下显示为两列，移动端自动折叠为单列。

### 文章阅读增强（`article.js`）
- **文章目录（TOC）**：自动提取文章中的标题（H1-H4）生成目录，点击可平滑滚动到对应位置，滚动时高亮当前章节。
- **阅读进度条**：滚动时显示文章阅读进度（顶部进度条）。
- **图片懒加载与预览**：文章内图片采用懒加载，点击任意图片自动打开全局图片查看器（`ImageViewer`），支持缩放、拖拽、切换图片。
- **代码块增强**：代码块自动添加语言标签和复制按钮，支持一键复制代码。
- **阅读时间**：根据文章字数自动计算并显示（200~500 字/分钟估算）。
- **文章分类与元数据**：支持按分类组织文章，显示作者、字数、阅读时间、最后更新日期、修订次数等。
- **Mermaid 与数学公式**：支持 Mermaid 图表和 LaTeX 数学公式（KaTeX/MathJax）。

### 首页增强（`index.html`）
- **统计卡片**：展示文章总数、总字数、作品总数，点击卡片可跳转到对应列表页面。
- **标签云**：分为“文章星系”和“创意工坊”，点击标签可跳转到对应列表并自动筛选。
- **最近更新**：分别展示最新的文章和作品（各 5 条），支持点击跳转。
- **动态问候语**：根据时间段显示不同的问候语。
- **不蒜子统计**：全站总访问量和总访客数。

### 评论与统计
- **评论系统**：集成 Twikoo，支持留言、回复、点赞等（留言板、404 页、文章页底部）。
- **访问统计**：集成不蒜子统计，显示全站和单页访问量；同时通过 `statistics.json` 提供文章/作品的聚合统计（标签云、总字数等）。

### 安全与辅助功能
- **外链跳转确认**：点击外部链接时弹出模态框确认，支持白名单（如 GitHub、Bilibili 等）自动跳转，提升安全性。
- **返回顶部按钮**：滚动超过阈值后显示，平滑滚动到顶部。
- **网站运行时长**：页脚动态显示网站已运行时间（精确到秒）。
- **图片查看器**：全局图片查看器（`image-viewer.js`），支持缩放、拖拽、键盘操作。

### 内容生成与自动化（Python 脚本）
- **Markdown 转 HTML**：通过 `ArticleManager.py` 批量处理，支持 YAML Front Matter 元数据、标题 ID 自动生成、哈希状态追踪。
- **作品管理**：通过 `WorkManager.py` 扫描 `works/` 目录下的 `metadata.json` 管理作品信息。
- **统计聚合**：`Statistic.py` 从 `articles.json` 和 `works.json` 生成 `statistics.json`。
- **RSS Feed 生成**：`RssGenerator.py` 自动生成 `rss.xml`，支持文章和作品订阅。
- **一键运行**：`run.py` 按顺序执行上述脚本。

---

## 技术栈

| 类别 | 技术/库 |
|------|---------|
| 前端 | HTML5, CSS3, JavaScript (ES6) |
| 样式 | 自定义 CSS（支持暗黑模式、响应式、双栏布局） |
| 图标 | Font Awesome 5/6 |
| Markdown 转换 | Python 3 + `markdown` 库 |
| 语法高亮 | `codehilite`（Markdown 扩展） |
| 评论系统 | [Twikoo](https://twikoo.js.org/) |
| 统计系统 | [不蒜子](https://busuanzi.ibruce.info/) |
| 数学公式 | KaTeX（`auto-render`） |
| 图表 | Mermaid |
| 存储 | `localStorage`（缓存文章/作品数据、主题偏好、友链） |
| 构建工具 | Python 脚本（批量处理、生成 JSON 索引、RSS） |

---

## 文件结构

```
/
├── index.html               # 首页（双栏布局 + 统计卡片 + 标签云 + 最近更新）
├── about.html               # 关于页面
├── articles.html            # 文章列表页面（双栏布局 + 搜索 + 标签筛选）
├── works.html               # 作品列表页面（双栏布局 + 搜索 + 标签筛选）
├── contact.html             # 留言板页面（双栏布局 + Twikoo）
├── friends.html             # 友链页面（双栏布局 + 友链卡片 + 申请信息 + Twikoo）
├── 404.html                 # 自定义 404 页面（含反馈评论区）
├── navbar.html              # 导航栏 HTML 片段
├── footer.html              # 页脚 HTML 片段（三列玻璃态布局 + 不蒜子 + 站点年龄）
│
├── css/
│   ├── style.css            # 全局样式（含双栏布局、暗黑模式、动画）
│   ├── article.css          # 文章页面专用样式（目录、代码块、进度条）
│   └── image-viewer.css     # 图片查看器样式
│
├── js/
│   ├── script.js            # 主要逻辑（PageManager、SearchController、ExternalLinkManager、GlobalImageManager）
│   ├── article.js           # 文章页面专用脚本（TOC、进度条、代码块、图片查看器）
│   ├── image-viewer.js      # 全局图片查看器组件
│   └── busuanzi.min.js      # 不蒜子统计脚本
│
├── articles/                # 生成的 HTML 文章存放目录
│   ├── 文章名.html
│   └── ...
│
├── articles/source/         # 原始 Markdown 文件（按分类子目录组织）
│   ├── 随笔/
│   │   └── 文章.md
│   └── 技术/
│       └── 另一篇.md
│
├── works/                   # 作品数据源目录
│   └── 作品名/
│       └── metadata.json
│
├── json/                    # 自动生成的 JSON 数据索引
│   ├── articles.json        # 文章元数据索引
│   ├── works.json           # 作品元数据索引
│   ├── statistics.json      # 聚合统计数据
│   └── friends.json         # 友链数据（需手动维护）
│
├── python/                  # Python 自动化脚本目录
│   ├── ArticleManager.py    # Markdown → HTML 转换
│   ├── WorkManager.py       # 扫描 works/ 生成 works.json
│   ├── Statistic.py         # 生成 statistics.json
│   ├── RssGenerator.py      # 生成 RSS Feed
│   └── run.py               # 一键运行所有脚本
│
├── rss.xml                  # RSS Feed 文件（自动生成）
├── .nojekyll                # GitHub Pages 忽略 Jekyll 处理
└── README.md                # 本文件
```

> **注意**：Python 脚本放在 `python/` 目录下，在项目根目录运行时需要调整路径引用。

---

## 快速开始

### 本地运行

1. **克隆或下载本仓库** 到本地。

2. **安装 Python 依赖**（用于 Markdown 转换）：
   ```bash
   pip install markdown
   ```

3. **生成网站数据**：
   ```bash
   cd python
   python run.py
   ```
   该脚本会依次执行所有数据生成脚本。

4. **启动本地服务器**：
   ```bash
   # 在项目根目录执行
   python -m http.server 8000
   ```
   然后访问 `http://localhost:8000`。

### 部署到生产环境

- 将整个项目上传至任意静态网站托管服务（如 GitHub Pages、Netlify、Vercel 等）。
- 确保所有文件（包括 `pages/`、`articles/`、`works/`、`json/`、`rss.xml` 等）都上传。
- 配置 Twikoo 后端地址（见下方配置说明）。
- 更新 `script.js` 中 `startSiteAgeUpdater` 函数的网站创建时间 `BIRTH_DATE`。
- 如需自定义域名，请按托管服务商指引设置。

---

## 构建与数据更新

### 文章管理

- **添加新文章**：
  1. 在 `articles/source/` 下选择或创建分类子目录。
  2. 在该目录中创建 `.md` 文件，文件头部必须包含 YAML 元数据。
  3. 运行 `python run.py`（或单独执行 `ArticleManager.py`）。
  4. 生成的 HTML 文件出现在 `articles/` 目录，同时 JSON 索引和 RSS 自动更新。

- **修改文章**：直接编辑 `.md` 文件，重新运行 `ArticleManager.py` 即可覆盖对应的 HTML。脚本会自动检测内容变化，更新 `last_updated` 和 `modify_count`。

- **删除文章**：删除 `.md` 文件后重新运行脚本，`articles.json` 会自动移除该文章。

- **隐藏文章**：在 front matter 的 `tag` 字段中加入 `隐藏` 标签，运行脚本后该文章将不会出现在 `articles.json` 和 RSS 中（但仍会生成 HTML 文件）。

### 作品管理

- **添加新作品**：
  1. 在 `works/` 下创建新文件夹，文件夹名称即为作品标题。
  2. 在该文件夹中创建 `metadata.json`。
  3. 运行 `python run.py`（或单独执行 `WorkManager.py`）。

- **隐藏作品**：在 `metadata.json` 的 `tag` 字段中加入 `隐藏` 标签，运行脚本后该作品将不会出现在 `works.json` 和 RSS 中。

### 友链管理

- **添加友链**：编辑 `json/friends.json`，格式如下：
  ```json
  [
    {
      "name": "站点名称",
      "link": "https://example.com",
      "desc": "站点描述",
      "avatar": "https://example.com/avatar.jpg"
    }
  ]
  ```

### 统计与 RSS 更新

- 运行 `Statistic.py` 和 `RssGenerator.py` 即可更新统计文件和 RSS。

---

## 配置文件说明

### 1. Twikoo 评论系统

需要修改以下文件中的 `envId` 参数为你的 Twikoo 后端地址：
- `contact.html`
- `404.html`
- `friends.html`
- `article.js`（通过 `ArticleManager.py` 生成的文章 HTML 中的脚本）

Twikoo 后端可使用 [Netlify Functions](https://twikoo.js.org/backend.html#netlify-functions) 或腾讯云云函数部署。

### 2. 不蒜子统计

已在 `footer.html` 和 `ArticleManager.py` 生成的每篇文章中引入不蒜子脚本，无需额外配置。

### 3. 网站运行起始时间

`script.js` 中的 `startSiteAgeUpdater` 函数定义了网站创建时间：
```javascript
const BIRTH_DATE = new Date('2025-02-22T12:23:53Z');
```
请根据实际创建时间修改该值。

### 4. 外链跳转白名单

`script.js` 的 `ExternalLinkManager` 类中的 `WHITELIST` 定义了自动跳转的域名：
```javascript
this.WHITELIST = new Set([
  "github.com", "vercel.com", "netlify.app", "bilibili.com", ...
]);
```

### 5. RSS 生成配置

编辑 `python/RssGenerator.py` 开头的常量：
- `SITE_TITLE`：网站标题
- `SITE_LINK`：网站根 URL
- `SITE_DESCRIPTION`：站点描述
- `INCLUDE_ARTICLES`：是否包含文章（默认 `True`）
- `INCLUDE_WORKS`：是否包含作品（默认 `True`）

### 6. 图片查看器

全局图片查看器由 `GlobalImageManager` 自动初始化，点击任意图片（除标记 `.no-image-viewer` 外）会自动打开查看器，支持：
- 缩放（滚轮/按钮）
- 拖拽（仅缩放时）
- 键盘操作（方向键切换、ESC 关闭、+/- 缩放）

---

## 数据格式

### `articles.json` 格式

```json
{
  "generated_at": "2026-04-24T...",
  "total_articles": 10,
  "total_word_count": 5000,
  "articles": [
    {
      "relative_path": "articles/source/随笔/文章.md",
      "hash": "md5...",
      "last_updated": "2026-04-20",
      "modify_count": 3,
      "hidden": false,
      "title": "文章标题",
      "date": "2026-03-01",
      "description": "简介",
      "author": "作者",
      "tags": ["标签1", "标签2"],
      "category": "随笔",
      "url": "/articles/文章.html",
      "word_count": 1200,
      "read_time": "3-5分钟"
    }
  ]
}
```

### `works.json` 格式

```json
{
  "works": [
    {
      "title": "作品标题",
      "date": "2026-01-01",
      "description": "作品描述",
      "author": "作者名",
      "tag": ["标签1", "标签2"],
      "link": "https://example.com"
    }
  ]
}
```

### `metadata.json` 格式（`works/作品名/`）

```json
{
  "title": "作品标题",
  "date": "2026-01-01",
  "description": "详细描述",
  "author": "高新炀",
  "tag": ["标签1", "标签2"],
  "link": "https://..."
}
```

### Markdown 文件头部格式（YAML Front Matter）

```markdown
---
title: 我的第一篇文章
date: 2026-03-01
description: 这是一篇示例文章
author: 高新炀
tag: [随笔, 生活]
---

# 正文标题

这里是文章正文...
```

- `tag` 字段支持数组格式，若包含 `隐藏` 标签则不在列表中显示。
- `category` 字段可选，若不提供则自动使用所在子目录名作为分类。

### `statistics.json` 格式

```json
{
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

### `friends.json` 格式

```json
[
  {
    "name": "站点名称",
    "link": "https://example.com",
    "desc": "站点描述",
    "avatar": "https://example.com/avatar.jpg"
  }
]
```

---

## 开发与扩展

### 修改样式

- 所有 CSS 变量定义在 `:root` 和 `[data-theme="dark"]` 中，修改这些变量即可全局调整主题色、间距、圆角等。
- 双栏布局相关样式在 `style.css` 的 `.two-column-layout` 区域。

### 添加新页面

1. 在 `pages/` 下创建新的 HTML 片段文件。
2. 在 `script.js` 的 `PageManager.pageConfig` 中添加新页面配置（`title` 和 `type`）。
3. 在 `navbar.html` 中添加导航链接，设置 `data-page` 属性。
4. 如果需要动态数据（如列表），在 `DataManager.config` 中配置对应的数据源。

### 修改数据缓存策略

- 在 `DataManager.config` 中调整 `cacheControl` 字段。
- 缓存过期时间可在 `Utils.isDataExpired` 中修改 `minutes` 参数（默认 5 分钟）。

### 调试与性能

- 浏览器控制台会输出关键操作耗时（通过 `PerformanceMonitor` 类）。
- 滚动渐入动画使用 `IntersectionObserver`，阈值设为 `0.2`。

### 自定义光标

- `CustomCursor` 类控制光标外观和吸附行为。如需禁用，可注释 `script.js` 末尾的初始化代码。

### 无刷新导航（AJAX）

- 已通过 `enableAjaxNavigation` 函数启用，所有内部链接点击后会通过 `fetch` 加载新页面并替换主内容区域。
- 若某个链接不希望使用 AJAX 导航，可添加 `data-no-ajax` 属性。

---

## 许可证

本项目代码部分基于 MIT 许可证开源。

MIT 许可证允许任何人以任何目的使用、复制、修改、合并、出版发行、散布、再授权及销售软件及其副本，但必须包含版权声明和许可声明。

文章中除特别声明外的文字内容采用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) 许可协议（署名-非商业性使用-禁止演绎）。

---

**项目维护者**：高新炀  
**联系方式**：[邮件](mailto:gao_xinyang@foxmail.com) | [GitHub](https://github.com/Xinyang-Gao)

如有任何问题，欢迎通过网站留言板或邮箱联系。