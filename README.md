---
title: README.md
description: 项目介绍
author: 高新炀 ＆ DEEPSEEK-V4
date: 2026-04-12
tag: [网站]
---

> 此 README 使用 AIGC 润色

这是一个 **全功能静态个人网站**，兼具博客、作品集、留言板、友链、统计仪表板、站点设置等模块。网站采用现代化的**双栏布局**（侧边个人信息卡片 + 主内容区），拥有无刷新页面切换、暗黑模式、自定义光标、全局图片查看器、音乐播放器、滚动动画等丰富交互。  
所有内容均通过 **Python 构建工具** 从 Markdown 和 JSON 源文件自动生成，前端使用 **TypeScript + Vite** 进行打包优化。

[→ 在网站上查看此文章](https://xinyang-gao.github.io/articles/README.html) · [→ 项目源码](https://github.com/Xinyang-Gao/xinyang-gao.github.io)

---

## ✨ 功能亮点

### 📄 内容管理
- **文章**：`assets/source/` 下按分类存放 Markdown 文件，支持 YAML Front Matter（标题、日期、标签、作者等），自动生成 HTML 页面并更新索引。
- **作品**：`src/assets/works/` 或 `src/works/` 下每个子目录包含 `metadata.json` 描述作品信息，可附带静态页面。
- **友链**：通过 `json/friends.json` 管理，自动渲染至友链页面。
- **版本日志**：从 `assets/网站更新日志.md` 解析版本更新记录，生成 `version.json` 供前端展示更新提示。

### 🧩 前端交互
- **无刷新导航**：点击内部链接时通过 AJAX 加载新页面，保留浏览器回退/前进。
- **暗黑模式**：手动切换或跟随系统，偏好持久化存储。
- **搜索与筛选**：文章/作品页面支持关键词搜索、标签筛选（带计数），排序方式多样，筛选条件自动同步到 URL。
- **自定义光标**：非触摸设备显示钢笔尖光标，悬停可交互元素时自动吸附。
- **滚动动画**：列表项滚动进入视口时渐入。

### 📖 文章阅读体验
- **自动目录**：提取文章标题，生成可点击的树形目录，滚动高亮当前章节。
- **阅读进度条**：顶部及侧边栏目录均显示进度。
- **图片预览器**：点击文章图片打开全局查看器，支持缩放、旋转、拖拽、前后切换。
- **代码块增强**：自动添加语言标签和复制按钮。
- **数学公式**：支持 KaTeX（`$...$` 和 `$$...$$`）。
- **元数据显示**：作者、字数、阅读时间、发布/更新日期、修订次数。

### 📊 统计与仪表板
- **首页统计卡片**：文章数、总字数、作品数、分类数、标签数，点击可跳转。
- **统计页面**：使用 Chart.js 渲染文章趋势、分类/标签占比、代码资产构成等图表，实时显示站点运行时长（秒级更新）。
- **不蒜子统计**：全站 PV/UV。

### 🔧 站点设置
- 开关自定义光标、外链拦截弹窗。
- 一键清除 Service Worker 缓存和所有本地存储数据。

### 🔗 安全与辅助
- **外链确认**：点击外部链接弹出模态框，白名单域名自动跳转。
- **返回顶部**按钮。
- **Cookie 同意横幅**：符合隐私规范。
- **Service Worker**：提供离线缓存与 stale-while-revalidate 策略。

### 🎵 全局音乐播放器
- 嵌入网易云迷你播放器，支持歌单播放、歌词显示、拖拽定位，跟随暗黑主题。
- 支持短代码 `{nmpv2:playlist=xxx, position=...}` 在任意页面插入播放器。

### 🛠️ 自动化构建
- **Markdown → HTML**：批量处理，增量构建（基于内容哈希）。
- **JSON 生成**：`articles.json`、`works.json`、`statistics.json`、`version.json`、`code_analysis.json`。
- **RSS 订阅**：`rss.xml`（可配置包含文章或作品）。
- **站点地图**：`sitemap.xml`。
- **前端打包**：通过 Vite 编译 TypeScript，压缩 CSS。
- **一键构建**：`run.py` 提供命令行和图形界面（Tkinter）两种模式，支持并行执行。

---

## 🧰 技术栈

| 领域 | 技术 |
|------|------|
| 前端 | TypeScript, HTML5, CSS3（CSS 变量, 响应式） |
| 前端构建 | Vite 8 |
| 后端生成 | Python 3（markdown, PyYAML, rcssmin） |
| 评论系统 | Twikoo |
| 统计 | 不蒜子 |
| 图表 | Chart.js 4.4 |
| 数学公式 | KaTeX |
| 音乐播放器 | NeteaseMiniPlayer v2（二次开发） |
| 存储 | localStorage + CacheStorage（SW） |
| CI/CD | GitHub Actions（自动构建并部署到 GitHub Pages） |

---

## 📁 项目结构

```
.
├── builder/                     # Python 构建核心（全部脚本）
│   ├── __init__.py
│   ├── build_context.py         # 数据类（Article, Work, Friend, BuildContext）
│   ├── common.py                # 公共工具（日志、路径、JSON、哈希等）
│   ├── input_loader.py          # 加载所有源数据（文章、作品、友链、版本）
│   ├── engine.py                # 构建引擎（调度生成器，支持并行）
│   ├── generators/
│   │   ├── base.py              # 生成器基类
│   │   └── aggregated.py        # 聚合生成器（生成统计、RSS、站点地图、列表页、静态资源）
│   └── rss_config.json          # RSS 配置文件
├── src/                         # 源代码（前端源码 + 原始内容）
│   ├── assets/                  # 静态资源与内容源
│   │   ├── source/              # Markdown 文章源（按分类子目录存放）
│   │   │   ├── 作文/
│   │   │   ├── 分享/
│   │   │   ├── 技术/
│   │   │   ├── 日记/
│   │   │   └── 网站/
│   │   ├── works/               # 作品源目录（每个子目录包含 metadata.json）
│   │   ├── avatars/             # 头像等（友链头像存放处）
│   │   ├── svg/                 # SVG 素材
│   │   ├── avatar.webp          # 个人头像
│   │   └── 网站更新日志.md       # 版本日志源文件
│   ├── css/                     # 样式源码（未压缩）
│   │   ├── core/                # 基础样式（variables, base, layout, components）
│   │   ├── components/          # 组件样式（navbar, footer, image-viewer, player, comments）
│   │   ├── pages/               # 页面专用样式
│   │   └── main.css             # 入口文件（导入所有）
│   ├── js/                      # TypeScript/JavaScript 源码
│   │   ├── core/                # 核心模块（配置、工具、存储、页面基类等）
│   │   ├── data/                # 数据模块（Worker, Settings, SiteState, SW）
│   │   ├── entry/               # 入口文件（main.ts）
│   │   ├── pages/               # 各页面管理器（article, archive, stats, friends...）
│   │   ├── router/              # 无刷新路由
│   │   ├── standalone/          # 独立功能（404, changelog）
│   │   ├── ui/                  # UI 组件（光标、外链、图片查看器、主题等）
│   │   └── vendor/              # 第三方库（busuanzi, 音乐播放器）
│   ├── templates/               # HTML 模板（用于生成页面和静态列表）
│   │   ├── index.html
│   │   ├── about.html
│   │   ├── articles.html
│   │   ├── works.html
│   │   ├── archive.html
│   │   ├── stats.html
│   │   ├── friends.html
│   │   ├── contact.html
│   │   ├── settings.html
│   │   ├── 404.html
│   │   ├── footer.html
│   │   └── ...
│   └── works/                   # 作品源（与 assets/works 类似，可能重复，实际以 src/works 为准）
├── dist/                        # 构建输出目录（部署时使用）
│   ├── articles/                # 生成的 HTML 文章
│   ├── json/                    # 生成的 JSON 数据
│   ├── css/                     # 压缩后的 CSS
│   ├── js/                      # 打包后的 JS（Vite 输出）
│   ├── assets/                  # 复制后的静态素材
│   ├── works/                   # 作品静态资源
│   ├── about/                   # 子页面（通过模板生成）
│   ├── archive/
│   ├── contact/
│   ├── friends/
│   ├── settings/
│   ├── stats/
│   ├── index.html
│   ├── 404.html
│   ├── footer.html
│   ├── rss.xml
│   ├── sitemap.xml
│   ├── favicon.ico
│   ├── robots.txt
│   └── ...
├── .github/workflows/static.yml # GitHub Actions 自动部署
├── package.json                 # Node 依赖（Vite, TypeScript）
├── vite.config.ts               # Vite 配置
├── tsconfig.json                # TypeScript 配置
├── run.py                       # 一键构建入口（调用 builder）
├── .build_state.json            # 构建状态缓存（用于增量构建）
├── .gitignore
├── CNAME                        # 自定义域名
├── LICENSE
└── README.md
```

> **注意**：`src/works/` 和 `src/assets/works/` 可能存在重复，实际构建以 `src/works/` 为准（`input_loader.py` 读取 `WORKS_SRC_DIR`，该变量指向 `SRC_ROOT / "works"`）。若希望统一，可统一使用 `src/works/`。

---

## 🚀 快速开始

### 1. 克隆仓库
```bash
git clone https://github.com/Xinyang-Gao/xinyang-gao.github.io.git
cd xinyang-gao.github.io
```

### 2. 安装 Python 依赖
```bash
pip install markdown pyyaml python-dateutil rcssmin
```

### 3. 安装 Node 依赖（用于前端构建）
```bash
npm install
```

### 4. 运行构建
```bash
python run.py
```
- 默认会加载所有源数据，调用 `AggregatedGenerator` 生成所有输出（文章 HTML、JSON、CSS、JS、RSS 等），并自动执行 `npm run build` 编译 TypeScript。
- 若需要强制重新生成所有文件：`python run.py --force`
- 若只生成特定部分：`python run.py --targets aggregated`
- 更多选项：`python run.py --help`

### 5. 预览结果
构建完成后，所有输出位于 `dist/` 目录。可以使用任意静态服务器预览：
```bash
cd dist
python -m http.server 8000
```
访问 `http://localhost:8000` 即可。

---

## 📝 开发指南

### 添加新文章
1. 在 `src/assets/source/` 下选择或创建分类子目录（如“技术”）。
2. 在该目录中创建 `.md` 文件，文件顶部必须包含 YAML Front Matter：
   ```yaml
   ---
   title: 文章标题
   date: 2026-07-01
   description: 简介
   author: 你的名字
   tag: [标签1, 标签2]
   ---
   ```
   - `tag` 可包含 `隐藏` 来隐藏文章。
   - `category` 若未指定，则使用所在子目录名。
3. 运行 `python run.py`，文章将生成在 `dist/articles/`，并自动更新索引和 RSS。

### 添加新作品
1. 在 `src/works/` 下新建文件夹，文件夹名即作品标题。
2. 在文件夹内创建 `metadata.json`：
   ```json
   {
     "title": "作品标题",
     "date": "2026-07-01",
     "description": "作品描述",
     "author": "高新炀",
     "tag": ["工具", "游戏"],
     "link": "https://example.com"
   }
   ```
   - 若 `link` 为空，则默认指向 `/works/作品名/`。
3. 运行构建，作品将出现在作品列表和 RSS 中（除非 `tag` 含“隐藏”）。

### 管理友链
编辑 `dist/json/friends.json`（或 `src/assets/friends.json`，但实际读取的是 `dist/json/friends.json`，构建后不会覆盖此文件，需手动维护）。格式：
```json
[
  {
    "name": "站点名",
    "link": "https://example.com",
    "desc": "站点描述",
    "avatar": "https://example.com/avatar.webp"
  }
]
```
运行构建后友链页面自动更新。

### 修改样式
- CSS 变量定义在 `src/css/core/variables.css` 中，修改 `:root` 和 `[data-theme="dark"]` 下的变量即可全局调色。
- 组件样式位于 `src/css/components/`，页面样式在 `src/css/pages/`。

### 修改前端逻辑
前端源码在 `src/js/` 下（TypeScript），修改后需重新运行 `npm run build` 或直接运行 `python run.py`（会自动调用 Vite 构建）。开发时也可使用 `npm run dev` 启动 Vite 开发服务器（需先构建一次，以生成 JSON 数据等）。

### 添加新页面
1. 在 `src/templates/` 中创建新的 HTML 模板（包含 `#navbar-placeholder`、`#personal-card-container`、`#footer-placeholder` 等占位）。
2. 在 `builder/generators/aggregated.py` 的 `PAGE_TEMPLATES` 字典中注册（模板名 → 目标子目录）。
3. 如有动态逻辑，在 `src/js/pages/` 下新建页面管理器（继承 `PageManager`），并在 `src/js/router/router.ts` 的 `initPageManagerByPageName` 中注册。
4. 运行构建即可。

---

## ⚙️ 配置说明

### RSS 配置
编辑 `builder/rss_config.json`（若不存在则使用默认值）：
```json
{
  "site": {
    "title": "你的站点标题",
    "link": "https://your-domain.com",
    "description": "站点描述",
    "language": "zh-CN",
    "generator": "AggregatedGenerator"
  },
  "filters": {
    "max_items": 20
  }
}
```

### Twikoo 评论系统
修改以下文件中的 `envId` 为你的后端地址：
- `src/templates/contact.html`
- `src/templates/friends.html`
- `src/templates/404.html`
- `src/js/core/twikoo-manager.ts`（DEFAULT_CONFIG.envId）

### 网站诞生时间
在 `src/js/core/core.ts` 中修改 `SITE_BIRTH` 常量（UTC 时间），用于计算运行时长。

### 外链白名单
在 `src/js/core/core.ts` 的 `EXTERNAL_WHITELIST` Set 中添加信任域名。

### 背景图片列表
在 `src/js/core/core.ts` 的 `BACKGROUND_IMAGES` 数组中替换或添加图片 URL（首页和欢迎弹窗会随机选用）。

### Service Worker 缓存策略
缓存配置在 `src/js/data/sw.js` 中，`CACHE_CONFIG` 对象可调整版本号、最大条目数等。

---

## 📦 部署

推荐使用 **GitHub Pages** 或 **Netlify** 部署 `dist/` 目录。

### GitHub Pages 自动部署
项目已包含 `.github/workflows/static.yml`，在推送代码到 `main` 分支时会自动构建并部署到 `gh-pages` 分支（需在仓库设置中启用 Pages 并选择该分支）。

### 手动部署
1. 运行 `python run.py` 完成构建。
2. 将 `dist/` 目录下的所有文件上传到你的静态托管服务根目录。
3. 确保自定义域名（如 `CNAME` 文件）正确配置。

---

## 📄 许可证

本项目代码采用 **MIT 许可证**。  
文章内容（Markdown 源文件）采用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)（署名-非商业性使用-禁止演绎）。

---

**维护者**：高新炀  
**邮箱**：[gao_xinyang@foxmail.com](mailto:gao_xinyang@foxmail.com) 
**GitHub**：[Xinyang-Gao](https://github.com/Xinyang-Gao)

如有问题或建议，欢迎通过留言板或邮箱联系。