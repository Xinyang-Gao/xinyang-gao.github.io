---
title: README.md
description: README.md
author: 高新炀
date: 2026-04-12
tag: [网站]
---

# 个人网站项目 README

本项目是一个功能完整的个人网站，融合了博客、作品集、留言板等功能，具有现代化的界面、动态页面切换、搜索筛选、暗黑模式、自定义光标等特性。文章通过 Markdown 文件生成，并集成 Twikoo 评论系统和不蒜子统计。

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [文件结构](#文件结构)
- [快速开始](#快速开始)
- [构建与数据更新](#构建与数据更新)
- [配置说明](#配置说明)
- [数据格式](#数据格式)
- [开发与扩展](#开发与扩展)
- [许可证](#许可证)

---

## 项目简介

这是一个基于 HTML/CSS/JS 构建的静态个人网站，主要包含以下模块：

- **首页**：展示统计卡片（文章数、总字数、作品数）、标签云（文章标签 / 作品标签）、最近更新的文章和作品，以及动态问候语。
- **关于**：个人介绍页。
- **文章**：通过 Markdown 生成的博客文章列表，支持标签筛选、搜索、阅读进度条、目录导航和 Twikoo 评论。
- **作品**：展示个人项目作品，支持标签筛选、搜索和详情弹窗。
- **留言板**：基于 Twikoo 的独立评论系统，访客可留言交流。
- **404 页面**：包含返回首页和问题反馈入口，并集成 Twikoo 评论区用于收集报错反馈。

网站采用 SPA 风格的页面切换动画，所有页面内容由 JavaScript 动态加载，数据从 JSON 文件中获取，具有良好的扩展性和维护性。

---

## 功能特性

### 前端体验
- **页面动态加载**：通过 `PageManager` 实现无刷新切换，带有平滑过渡动画（“纸张展开”效果）。
- **暗黑模式**：主题切换，跟随系统或用户手动选择，持久化存储到 `localStorage`。
- **搜索与标签筛选**：文章和作品页面支持标题、标签、日期等多种搜索方式，并可通过标签按钮筛选，筛选条件自动同步到 URL。
- **自定义光标**：非触摸设备上显示独特的钢笔尖光标，悬停可点击元素时自动吸附并改变样式。
- **响应式设计**：适配移动端和桌面端，导航栏在移动端折叠为汉堡菜单。

### 文章阅读增强
- **文章目录**：自动提取文章中的标题生成目录，点击可平滑滚动到对应位置。
- **阅读进度条**：滚动时显示文章阅读进度。
- **图片预览**：点击文章中的图片可放大预览。
- **阅读时间**：根据文章字数自动计算并显示（支持 200~500 字/分钟估算）。
- **文章分类**：支持按分类组织文章（由源文件所在子目录自动识别）。

### 评论与统计
- **评论系统**：集成 Twikoo，支持留言、回复、点赞等。
- **统计信息**：集成不蒜子统计，显示全站和单页访问量；同时通过 `statistics.json` 提供文章/作品的聚合统计（标签云、总字数等）。

### 安全与辅助功能
- **外链跳转确认**：点击外部链接时弹出模态框确认（支持白名单自动跳转），提升安全性。
- **返回顶部按钮**：滚动超过一定阈值后显示，平滑滚动到顶部。
- **网站运行时长**：页脚动态显示网站已运行时间。

### 内容生成与自动化
- **Markdown 转 HTML**：通过 Python 脚本批量处理，支持 YAML Front Matter 元数据。
- **作品管理**：通过 `works/` 目录下的 `metadata.json` 管理作品信息。
- **RSS Feed 生成**：自动生成 `rss.xml`，支持文章和作品订阅（可配置）。
- **统计数据聚合**：自动生成 `statistics.json`，供首页使用。

---

## 技术栈

| 类别         | 技术/库                                                       |
|--------------|---------------------------------------------------------------|
| 前端         | HTML5, CSS3, JavaScript (ES6)                                 |
| 样式         | 自定义 CSS（支持暗黑模式、响应式）                |
| 图标         | Font Awesome 5                                                |
| Markdown转换 | Python 3 + `markdown` 库（用于生成文章页面）                  |
| 评论系统     | [Twikoo](https://twikoo.js.org/)                              |
| 统计系统     | [不蒜子](https://busuanzi.ibruce.info/)                       |
| 存储         | localStorage（缓存文章/作品数据，主题偏好）                   |
| 构建工具     | Python 脚本（批量处理、生成 JSON 索引、RSS）                  |

---

## 文件结构

```
/
├── index.html               # 首页
├── about.html               # 关于页面
├── articles.html            # 文章列表页面（实际使用 pages/articles.html 动态加载）
├── works.html               # 作品列表页面（实际使用 pages/works.html 动态加载）
├── contact.html             # 留言板页面
├── 404.html                 # 自定义 404 页面（含反馈评论区）
├── style.css                # 全局样式
├── script.js                # 主要 JavaScript 逻辑（页面管理、搜索、滚动、外链等）
├── article.js               # 文章页面专用脚本（目录生成、进度条、图片预览）
├── article.css              # 文章页面专用样式
├── navbar.html              # 导航栏 HTML 片段
├── footer.html              # 页脚 HTML 片段
├── pages/                   # 各页面的基础骨架（被动态加载）
│   ├── articles.html
│   └── works.html
├── articles/                # 生成的 HTML 文章存放目录
│   ├── 文章名.html
│   └── ...
├── articles/source/         # 原始 Markdown 文件存放目录（按分类子目录组织）
│   ├── 随笔/
│   │   └── 我的文章.md
│   └── 技术/
│       └── 另一篇.md
├── works/                   # 作品数据源目录（每个作品一个子文件夹）
│   └── 作品名/
│       └── metadata.json
├── ArticleManager.py        # Markdown 转 HTML 脚本
├── WorkManager.py           # 扫描 works/ 目录生成 works.json
├── Statistic.py             # 从 articles.json 和 works.json 生成 statistics.json
├── RssGenerator.py          # 生成 RSS Feed (rss.xml)
├── run.py                   # 一键运行上述四个 Python 脚本
├── articles.json            # 文章元数据索引（自动生成）
├── works.json               # 作品元数据索引（自动生成）
├── statistics.json          # 聚合统计数据（自动生成）
├── rss.xml                  # RSS Feed 文件（自动生成）
└── README.md                # 本文件
```

**说明**：
- `pages/` 目录下的 HTML 文件是页面的基础骨架，用于被 `script.js` 动态加载并填充数据。
- `articles/source/` 下按分类建立子目录，每个子目录代表一个文章分类（如“随笔”“技术”）。
- `works/` 下每个子目录代表一个作品，其中必须包含 `metadata.json`。
- 所有 JSON 索引文件及 RSS 文件均由 Python 脚本自动生成，无需手动编辑。

---

## 快速开始

### 本地运行

1. **克隆或下载本仓库** 到本地。

2. **安装 Python 依赖**（用于 Markdown 转换和 RSS 生成）：
   ```bash
   pip install markdown
   ```

3. **生成网站数据**：
   ```bash
   python run.py
   ```
   该脚本会依次执行：
   - `ArticleManager.py`：扫描 `articles/source/` 下的所有 `.md` 文件，生成 HTML 文章到 `articles/` 目录，并创建/更新 `articles.json`。
   - `WorkManager.py`：扫描 `works/` 目录，读取每个子文件夹中的 `metadata.json`，生成 `works.json`。
   - `Statistic.py`：读取 `articles.json` 和 `works.json`，生成 `statistics.json`（包含总文章数、总字数、作品数、标签云等）。
   - `RssGenerator.py`：读取 `articles.json` 和 `works.json`，生成 `rss.xml`。

4. **启动本地服务器**（推荐使用 `live-server` 或 Python 自带服务器）：
   ```bash
   # 使用 Python 3
   python -m http.server 8000
   ```
   然后访问 `http://localhost:8000`。

### 部署到生产环境

- 将整个项目上传至任意静态网站托管服务（如 GitHub Pages、Netlify、Vercel 等）。
- 确保所有文件（包括 `pages/`、`articles/`、`works/`、`*.json`、`rss.xml` 等）都上传。
- 配置 `contact.html`、`404.html` 和 `ArticleManager.py` 中的 Twikoo `envId` 为自己的后端地址（见下文配置）。
- 更新 `script.js` 中 `startSiteAgeUpdater` 函数的网站创建时间 `BIRTH_DATE`。
- 如需自定义域名，请按托管服务商指引设置。

---

## 构建与数据更新

### 文章管理

- **添加新文章**：
  1. 在 `articles/source/` 下选择或创建分类子目录（如 `articles/source/随笔/`）。
  2. 在该目录中创建 `.md` 文件，文件头部必须包含 YAML 元数据（见下文格式）。
  3. 运行 `python run.py` 或单独执行 `python ArticleManager.py`。
  4. 生成的 HTML 文件会出现在 `articles/` 目录，同时 `articles.json`、`statistics.json` 和 `rss.xml` 自动更新。

- **修改文章**：直接编辑 `.md` 文件，重新运行 `ArticleManager.py` 即可覆盖对应的 HTML。

- **删除文章**：删除 `.md` 文件后重新运行脚本，`articles.json` 会自动移除该文章。

- **隐藏文章**：在文章 front matter 的 `tag` 字段中加入 `隐藏` 标签（如 `tag: [随笔, 隐藏]`），运行脚本后该文章将不会出现在 `articles.json` 和 RSS 中，但仍会生成 HTML 文件（可通过直接链接访问，但不在列表显示）。

### 作品管理

- **添加新作品**：
  1. 在 `works/` 下创建一个新文件夹，文件夹名称即为作品标题。
  2. 在该文件夹中创建 `metadata.json`，内容格式见下文。
  3. 运行 `python run.py` 或单独执行 `python WorkManager.py`，`works.json`、`statistics.json` 和 `rss.xml` 会自动更新。

- **修改/删除作品**：修改 `metadata.json` 或删除整个作品文件夹，重新运行脚本即可。

- **隐藏作品**：在 `metadata.json` 的 `tag` 字段中加入 `隐藏` 标签（如 `"tag": ["工具", "隐藏"]`），运行脚本后该作品将不会出现在 `works.json` 和 RSS 中。

### 统计数据更新

- 运行 `Statistic.py` 会根据最新的 `articles.json` 和 `works.json` 重新计算：
  - 文章总数、总字数
  - 作品总数
  - 所有文章标签（去重排序）
  - 所有文章分类
  - 所有作品标签
  - 最后更新时间（取文章和作品中最新的日期）

- 首页的统计卡片和标签云区域会通过 `fetch('/statistics.json')` 动态加载这些数据。

### RSS Feed 更新

- 运行 `RssGenerator.py` 会根据 `articles.json` 和 `works.json` 生成 `rss.xml`。
- 可在脚本顶部配置 `INCLUDE_ARTICLES` 和 `INCLUDE_WORKS` 选择是否包含文章/作品。
- RSS 条目按日期降序排列，无效日期的条目会被跳过。
- 生成后可通过 `https://你的域名/rss.xml` 订阅。

---

## 配置说明

### 1. Twikoo 评论系统

- 网站中的留言板（`contact.html`）、404 页面（`404.html`）和每篇文章底部都集成了 Twikoo 评论。
- 你需要先部署一个 Twikoo 后端（可使用 [腾讯云云函数](https://twikoo.js.org/backend.html) 或 [Netlify Functions](https://twikoo.js.org/backend.html#netlify-functions)）。
- 获得后端 URL 后，修改以下文件中的 `envId` 参数：
  - `contact.html`：`twikoo.init` 中的 `envId`
  - `404.html`：`twikoo.init` 中的 `envId`
  - `ArticleManager.py`：`create_html_page` 函数中生成的 `<script>` 部分的 `envId`（重新生成所有文章后生效）

### 2. 不蒜子统计

- 已在 `footer.html` 和 `ArticleManager.py` 生成的每篇文章中引入不蒜子脚本，无需额外配置。
- 统计会从部署后自动开始计数，无需注册。

### 3. 网站运行起始时间

- `script.js` 中的 `startSiteAgeUpdater` 函数定义了网站创建时间 `BIRTH_DATE = new Date('2025-02-22T12:23:53Z')`。
- 请根据实际创建时间修改该值，页脚会动态显示“已运行 X天XX小时XX分钟XX秒”。

### 4. 外链跳转确认

- 代码中的 `ExternalLinkManager` 类会拦截所有外部链接（非本站域名），弹出一个模态框询问是否继续。
- 白名单域名（如 `github.com`、`bilibili.com` 等）会自动倒计时 3 秒后跳转，其余域名需手动确认。
- 白名单列表可在 `script.js` 的 `ExternalLinkManager` 构造函数中修改 `WHITELIST`。

### 5. 阅读进度条与目录

- 这些功能由 `article.js` 实现。该文件需要实现：
  - 监听滚动事件，更新进度条宽度。
  - 根据 `window.ARTICLE_HEADINGS` 生成目录并绑定点击滚动。
  - 图片预览功能（点击图片放大）。
- 本项目已提供 `article.js` 的完整实现，无需额外配置。

### 6. RSS 生成配置

- 编辑 `RssGenerator.py` 开头的常量：
  - `SITE_TITLE`：网站标题
  - `SITE_LINK`：网站根 URL
  - `SITE_DESCRIPTION`：站点描述
  - `INCLUDE_ARTICLES`：是否包含文章（默认 `True`）
  - `INCLUDE_WORKS`：是否包含作品（默认 `False`，可按需开启）

---

## 数据格式

### `works.json` 格式

由 `WorkManager.py` 自动生成，示例：

```json
{
  "works": [
    {
      "title": "作品标题",
      "date": "2025-01-01",
      "description": "作品描述",
      "author": "作者名",
      "tag": ["标签1", "标签2"],
      "link": "https://example.com"
    }
  ]
}
```

### `metadata.json` 格式（位于 `works/作品名/` 下）

```json
{
  "title": "作品标题",          // 可选，默认为文件夹名
  "date": "2025-01-01",
  "description": "详细描述",
  "author": "高新炀",
  "tag": ["标签1", "标签2"],
  "link": "https://..."
}
```

- `title` 如果未提供，则使用文件夹名作为标题。
- `link` 如果未提供，默认为 `./works/作品名/`（可放置一个 `index.html` 作为作品展示页）。
- 若 `tag` 数组中包含 `隐藏`，该作品将不会出现在 `works.json` 和 RSS 中。

### `articles.json` 格式

由 `ArticleManager.py` 自动生成，结构如下：

```json
{
  "generated_at": "2025-04-01T...",
  "total_articles": 10,
  "total_word_count": 5000,
  "articles": [
    {
      "title": "文章标题",
      "date": "2025-03-01",
      "description": "简介",
      "author": "作者",
      "tags": ["标签1", "标签2"],
      "category": "分类名",
      "url": "/articles/文章名.html",
      "word_count": 1200,
      "read_time": "3-5分钟"
    }
  ]
}
```

### Markdown 文件头部格式（YAML Front Matter）

每个 `.md` 文件必须以 `---` 包裹的元数据开头，例如：

```markdown
---
title: 我的第一篇文章
date: 2025-03-01
description: 这是一篇示例文章
author: 高新炀
tag: [随笔, 生活]
---

# 正文标题

这里是文章正文...
```

- `tag` 字段支持数组格式（如 `[tag1, tag2]`）或逗号分隔的字符串。若包含 `隐藏`，该文章将不会出现在 `articles.json` 和 RSS 中。
- `category` 字段可选，若不提供则自动使用所在子目录名作为分类。
- `word_count` 和 `read_time` 由脚本自动计算，无需手动填写。

### `statistics.json` 格式

由 `Statistic.py` 自动生成，示例：

```json
{
  "last_updated": "2025-04-01",
  "total_articles": 12,
  "total_word_count": 18000,
  "total_works": 5,
  "article_tags": ["随笔", "技术", "生活"],
  "article_categories": ["随笔", "技术"],
  "work_tags": ["游戏", "工具"]
}
```

首页的统计卡片和标签云区域会通过此文件渲染。

---

## 开发与扩展

### 修改样式

- 所有样式变量定义在 `:root` 和 `[data-theme="dark"]` 中，修改这些变量即可全局调整主题色、间距、圆角等。
- 媒体查询用于响应式布局，可根据需要调整断点（`768px`、`480px`）。

### 添加新页面

1. 在 `pages/` 下创建新的 HTML 片段文件（例如 `books.html`）。
2. 在 `script.js` 的 `PageManager.pageConfig` 中添加新页面配置（`title` 和 `type`）。
3. 在 `navbar.html` 中添加导航链接，并设置 `data-page` 属性。
4. 如果需要动态数据（如列表），在 `DataManager.config` 中配置对应的数据源，并修改 `UIRenderer` 和 `SearchController` 以支持新类型。

### 修改数据缓存策略

- 在 `DataManager.config` 中调整 `cacheControl` 字段（`'no-cache'` 或 `'default'`）。
- 缓存过期时间可在 `Utils.isDataExpired` 中修改 `minutes` 参数（默认 5 分钟）。

### 调试与性能

- `PerformanceMonitor` 类会记录关键操作耗时，可在浏览器控制台查看。
- 滚动渐入动画使用 `IntersectionObserver`，阈值设为 `0.2`，可根据需要调整。

### 自定义光标样式

- `CustomCursor` 类控制光标外观和吸附行为。如需禁用，可注释 `DOMContentLoaded` 中的初始化代码。

### 无刷新导航（AJAX）

- 已通过 `enableAjaxNavigation` 函数启用，所有内部链接点击后会通过 `fetch` 加载新页面并替换主内容区域，实现 SPA 体验。
- 若某个链接不希望使用 AJAX 导航，可添加 `data-no-ajax` 属性。

---

## 许可证

本项目基于 MIT 许可证 进行开源。

MIT 许可证是一种宽松的自由软件许可证，允许任何人以任何目的使用、复制、修改、合并、出版发行、散布、再授权及销售软件及其副本，但必须包含版权声明和许可声明。

完整的许可证文本请参阅仓库中的 `LICENSE` 文件。

---

如有任何问题，欢迎通过网站留言板或邮箱联系我。