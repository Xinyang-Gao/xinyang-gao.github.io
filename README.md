# 个人网站项目 README

本项目是一个功能完整的个人网站，融合了博客、作品集、留言板等功能，具有现代化的界面、动态页面切换、搜索筛选、暗黑模式、自定义光标等特性。文章通过 Markdown 文件生成，并集成 Twikoo 评论系统和不蒜子统计。

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [文件结构](#文件结构)
- [运行与部署](#运行与部署)
- [配置说明](#配置说明)
- [数据格式](#数据格式)
- [开发与扩展](#开发与扩展)
- [许可证](#许可证)

---

## 项目简介

这是一个基于 HTML/CSS/JS 构建的静态个人网站，主要包含以下模块：

- **首页**：欢迎信息及动态问候语。
- **关于**：个人介绍。
- **文章**：通过 Markdown 生成的博客文章，支持标签筛选、搜索、阅读进度条、目录导航和评论。
- **作品**：展示个人项目作品，支持标签筛选、搜索和详情弹窗。
- **留言板**：基于 Twikoo 的评论系统，访客可留言交流。

网站采用 SPA 风格的页面切换动画，所有页面内容由 JavaScript 动态加载，数据从 JSON 文件中获取，具有良好的扩展性和维护性。

---

## 功能特性

- **页面动态加载**：通过 `PageManager` 实现无刷新切换，带有平滑过渡动画。
- **暗黑模式**：主题切换，跟随系统或用户手动选择，持久化存储。
- **搜索与标签筛选**：文章和作品页面支持标题、标签、日期等多种搜索方式，并可通过标签按钮筛选。
- **自定义光标**：非触摸设备上显示独特的光标效果，悬停可点击元素时自动吸附并改变样式。
- **文章目录**：自动提取文章中的标题生成目录，点击可平滑滚动到对应位置。
- **阅读进度条**：显示文章阅读进度。
- **图片预览**：点击文章中的图片可放大预览（需在文章页面启用）。
- **评论系统**：集成 Twikoo，支持留言、回复、点赞等。
- **统计信息**：集成不蒜子统计，显示全站和单页访问量。
- **外链跳转确认**：点击外部链接时会跳转到一个确认页面，提升安全性。
- **返回顶部按钮**：滚动超过一定阈值后显示，平滑滚动到顶部。
- **响应式设计**：适配移动端和桌面端。

---

## 技术栈

| 类别         | 技术/库                                                       |
|--------------|---------------------------------------------------------------|
| 前端         | HTML5, CSS3, JavaScript (ES6)                                 |
| 样式         | 自定义 CSS（支持暗黑模式、响应式）                            |
| 图标         | Font Awesome 5                                                |
| Markdown转换 | Python 3 + `markdown` 库（用于生成文章页面）                  |
| 评论系统     | [Twikoo](https://twikoo.js.org/)                              |
| 统计系统     | [不蒜子](https://busuanzi.ibruce.info/)                       |
| 存储         | localStorage（缓存文章/作品数据，主题偏好）                   |

---

## 文件结构

```
/
├── index.html               # 首页
├── about.html               # 关于页面
├── articles.html            # 文章列表页面
├── works.html               # 作品列表页面
├── contact.html             # 留言板页面
├── style.css                # 全局样式
├── script.js                # 主要 JavaScript 逻辑
├── navbar.html              # 导航栏 HTML 片段
├── footer.html              # 页脚 HTML 片段
├── markdown2html.py         # Markdown 转 HTML 的 Python 脚本
├── articles.json            # 文章元数据索引（自动生成）
├── works.json               # 作品数据（需手动编写）
├── pages/                   # 各页面的 HTML 片段（文章和作品页面通过此目录加载）
│   ├── articles.html
│   └── works.html
├── articles/                # 生成的 HTML 文章存放目录
│   ├── 文章名.html
│   └── ...
├── articles/articles/       # 原始 Markdown 文件存放目录
│   ├── 文章名.md
│   └── ...
└── link.html                # 外链跳转确认页面（需自行创建）
```

**说明**：
- `pages/` 目录下的 HTML 文件是页面的基础骨架，用于被 `script.js` 动态加载并填充数据。
- `articles.json` 由 `markdown2html.py` 自动生成，包含所有文章的元数据。
- `works.json` 需要手动编写，格式见后文。
- `link.html` 用于处理外部链接跳转确认，需根据实际情况创建（代码中已包含跳转逻辑）。

---

## 运行与部署

### 本地运行

1. **克隆或下载本仓库** 到本地。
2. **安装 Python 依赖**（用于 Markdown 生成）：
   ```bash
   pip install markdown
   ```
3. **生成文章页面**：
   ```bash
   python markdown2html.py
   ```
   该脚本会：
   - 扫描 `articles/articles/` 目录下的所有 `.md` 文件。
   - 解析 YAML 头部信息（标题、日期、标签等）。
   - 生成对应的 HTML 文件到 `articles/` 目录。
   - 更新根目录的 `articles.json` 文件。

4. **准备数据文件**：
   - 编辑 `works.json`，添加作品信息（格式见后文）。
   - 确保 `pages/` 目录下的 `articles.html` 和 `works.html` 文件存在（已提供）。

5. **启动本地服务器**（推荐使用 `live-server` 或 Python 自带服务器）：
   ```bash
   # 使用 Python 3
   python -m http.server 8000
   ```
   然后访问 `http://localhost:8000`。

### 部署到生产环境

- 将整个项目上传至任意静态网站托管服务（如 GitHub Pages、Netlify、Vercel 等）。
- 确保所有文件（包括 `pages/`、`articles/`、`works.json`、`articles.json` 等）都上传。
- 配置 `contact.html` 中的 Twikoo `envId` 为自己的后端地址（见下文配置）。
- 更新 `footer.html` 中的网站运行起始时间（`site-age` 的 `BIRTH_DATE` 需在 `script.js` 中修改）。
- 如需自定义域名，请按托管服务商指引设置。

---

## 配置说明

### 1. Twikoo 评论系统

- 本站在 `contact.html` 和生成的每一篇文章页面中都集成了 Twikoo 评论。
- 你需要先部署一个 Twikoo 后端（可使用 [腾讯云云函数](https://twikoo.js.org/backend.html) 或 [Netlify Functions](https://twikoo.js.org/backend.html#netlify-functions)）。
- 获得后端 URL 后，修改 `contact.html` 和 `markdown2html.py` 中 `twikoo.init` 的 `envId` 参数。
- 注意：`markdown2html.py` 生成的每篇文章中也会包含相同的 `envId`，请同步修改。

### 2. 不蒜子统计

- 已在 `footer.html` 和文章页面中引入不蒜子脚本，无需额外配置。
- 统计会从部署后自动开始计数，无需注册。

### 3. 网站运行起始时间

- `script.js` 中的 `startSiteAgeUpdater` 函数定义了网站创建时间 `BIRTH_DATE = new Date('2025-02-22T12:23:53Z')` （由 Github API 查询仓库创建时间）。
- 请根据实际创建时间修改该值。

### 4. 外链跳转确认页面

- 代码中 `ExternalLinkManager` 类会将所有外部链接拦截，并跳转到 `/link.html?url=...`。

### 5. 阅读进度条与目录

- 这些功能由 `article.js` 提供，但该文件未在提供的代码中给出。请确保 `article.js` 存在并实现以下功能：
  - 监听滚动事件，更新进度条宽度。
  - 根据 `window.ARTICLE_HEADINGS` 生成目录并绑定点击滚动。
  - 图片预览功能（点击图片放大）。
- 你可以根据项目需要自行编写或参考常见实现。

---

## 数据格式

### `works.json` 格式

```json
{
  "works": [
    {
      "id": "1",
      "title": "作品标题",
      "date": "2025-01-01",
      "description": "作品描述",
      "tags": ["标签1", "标签2"],
      "link": "https://example.com",
      "type": "project"
    }
  ]
}
```

- `id`：唯一标识，用于详情弹窗。
- `link`：可选，作品的外部链接。
- `tags`：数组，用于标签筛选和显示。

### `articles.json` 格式

由 `markdown2html.py` 自动生成，结构如下：

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
      "url": "/articles/文章名.html",
      "word_count": 1200
    }
  ]
}
```

### Markdown 文件头部格式

每个 `.md` 文件需以 YAML front matter 开头，例如：

```markdown
---
title: 我的第一篇文章
date: 2025-03-01
description: 这是一篇示例文章
author: 高新炀
tag: [随笔, 生活]
---

这里是文章正文...
```

- `tag` 字段支持数组格式，如 `[tag1, tag2]` 或 `[tag1][tag2]`，也支持逗号分隔的字符串。
- 支持 `#` 标题，会自动生成目录。

---

## 开发与扩展

### 修改样式

- 所有样式变量定义在 `:root` 和 `[data-theme="dark"]` 中，修改这些变量即可全局调整主题色、间距等。
- 媒体查询用于响应式布局，可根据需要调整断点。

### 添加新页面

1. 在 `pages/` 下创建新的 HTML 片段文件。
2. 在 `script.js` 的 `PageManager.pageConfig` 中添加新页面配置。
3. 在 `navbar.html` 中添加导航链接。
4. 如果需要动态数据，在 `DataManager.config` 中配置对应的数据源。

### 修改数据源

- 文章数据源固定为 `articles.json`，由脚本生成。
- 作品数据源固定为 `works.json`，手动维护。
- 如需修改缓存策略，调整 `DataManager.config` 中的 `cacheControl` 字段。

### 调试与性能

- `PerformanceMonitor` 类会记录关键操作耗时，可在浏览器控制台查看。
- 使用 `localStorage` 缓存数据，默认 5 分钟过期，可修改 `Utils.isDataExpired` 的 `minutes` 参数。

---

## 许可证

本项目基于 GNU General Public License v3.0 开源协议发布。
您可以自由使用、修改和分发本项目的代码，但需遵守 GPL v3 协议条款，包括：
- 分发衍生作品时，必须提供源代码。
- 保留版权声明和许可信息。
- 不得附加额外的限制条件。

完整的许可证文本请参阅 LICENSE 文件。

---

如有任何问题，欢迎通过网站留言板或邮箱联系我。