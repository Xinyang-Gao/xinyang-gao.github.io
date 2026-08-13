## 1. 概述
我的个人网站。

---

## 2. 技术栈

项目为前后端分离静态站点生成架构。

| 层级 | 技术 | 说明 |
|------|----------|-----------|
| **构建系统** | Python 3.10+ | 运行构建脚本（`run.py`），处理 Markdown 解析、数据聚合、静态资源生成 |
| **Markdown 解析** | `markdown` + `pymdown-extensions` | 支持 Frontmatter、Admonition、任务列表、选项卡、代码高亮、数学公式（KaTeX 前端渲染） |
| **数据序列化** | `PyYAML`、`json` | 解析文章 Frontmatter、作品元数据、友链 JSON |
| **颜色提取** | `requests` + `Pillow` | 为友链头像提取主色调，生成 `friend_colors.json` |
| **CSS 压缩** | `rcssmin` | 构建时压缩 CSS 文件 |
| **日期处理** | `python-dateutil`、`packaging` | 解析多种日期格式，版本号排序 |
| **前端语言** | TypeScript 6.0.3 | 所有交互逻辑、页面管理器、路由、UI 组件均使用 TypeScript 编写，部分传统模块为 JavaScript |
| **前端构建工具** | Vite 8.1.1 | 编译 TypeScript、打包模块、复制 vendor 库，支持 HMR 开发服务器 |
| **路由与 SPA** | 原生 History API + 自定义 Router | 无刷新页面切换，支持 `popstate`、滚动位置恢复、页面缓存（LRU）、资源动态加载/卸载 |
| **状态管理** | 单例模式 + `localStorage` | `DataService` 管理数据缓存，`storageController` 统一存储读写（含 LZ 压缩），`Settings` 管理用户偏好 |
| **样式系统** | 原生 CSS + CSS 变量 | 模块化设计：`core/`（变量、布局、基础）、`components/`（导航、评论、页脚等）、`pages/`（各页面独有样式），支持明暗主题自动切换 |
| **图表渲染** | Chart.js 4.4.0 | 统计仪表板动态加载，绘制文章趋势、分类占比、标签排行、代码分布等图表，主题自适应 |
| **评论系统** | Twikoo 1.7.19 | 无后端评论，部署于 Netlify Functions，支持 Markdown、邮件通知 |
| **访问统计** | vercount | 基于 `vercount.one` 服务，统计站点/页面 PV、UV，兼容不蒜子数据属性 |
| **图片查看器** | 自定义 Canvas 实现 | 支持缩放（滚轮/双指）、旋转、拖拽、键盘快捷键、全屏、画廊模式，无第三方依赖 |
| **鼠标特效** | Canvas 2D 渲染 | 自定义光标（圆点+圆环）、长按连线拖拽、释放爆发粒子，帧率自适应、空闲暂停 |
| **音乐播放器** | APlayer | 悬浮播放器，自动加载网易云歌单，支持歌词显示、音量控制、播放列表 |
| **通用弹窗** | `jump-dialog` + `detail-dialog` | 基于原生 DOM 构建，复用友链卡片样式，支持锚点放大动画、倒计时自动跳转、键盘操作 |
| **Service Worker** | 自定义 `sw.js` | 精细化缓存策略：静态资源（Cache First）、JSON 数据（Stale-While-Revalidate）、HTML 文档（Network First），启用 Navigation Preload |
| **数据格式** | JSON（API 数据）、YAML（文章 Frontmatter） | 所有内容数据（文章、作品、统计、友链、版本日志）均以 JSON 形式提供给前端，构建时生成 |
| **部署** | GitHub Actions + GitHub Pages | 自动化构建部署，详见 `.github/workflows/static.yml` |

---

### 依赖版本详情

#### Python 依赖（`requirements.txt`）
```
markdown               # 核心 Markdown 解析
pyyaml                 # Frontmatter 解析
requests               # 友链头像下载
pillow                 # 图像主色提取
rcssmin                # CSS 压缩
python-dateutil        # 日期解析
packaging              # 版本号排序
pymdown-extensions     # 扩展 Markdown 语法
```

#### Node.js 依赖（`package.json`）
```json
{
  "devDependencies": {
    "typescript": "^6.0.3",
    "vite": "^8.1.1",
    "rollup-plugin-copy": "^3.5.0"
  }
}
```

---

## 3. 目录结构

```
Website
├─ .github
│  └─ workflows
│     └─ static.yml
├─ builder
│  ├─ generators
│  │  ├─ aggregated.py
│  │  ├─ base.py
│  │  └─ friend_colors.py
│  ├─ build_context.py
│  ├─ common.py
│  ├─ engine.py
│  ├─ input_loader.py
│  └─ __init__.py
├─ dist
├─ node_modules
├─ src
│  ├─ assets
│  │  ├─ source
│  │  │  ├─ 分类一
│  │  │  │  └─ 马生复宋濂书.md
│  │  │  └─ 分类二
│  │  │     └─ 网站的起源.md
│  │  ├─ avatar.webp
│  │  ├─ friends.json
│  │  ├─ friend_colors.json
│  │  └─ 网站更新日志.md
│  ├─ copy
│  │  ├─ .well-known
│  │  │  └─ vercount-verify-pof0sq1cg39g4rpkl66s6rtf.txt
│  │  ├─ BingSiteAuth.xml
│  │  ├─ favicon.ico
│  │  └─ robots.txt
│  ├─ css
│  │  ├─ components
│  │  │  ├─ comments.css
│  │  │  ├─ footer.css
│  │  │  ├─ github-contrib-graph.css
│  │  │  ├─ image-viewer.css
│  │  │  └─ navbar.css
│  │  ├─ core
│  │  │  ├─ base.css
│  │  │  ├─ components.css
│  │  │  ├─ layout.css
│  │  │  └─ variables.css
│  │  ├─ pages
│  │  │  ├─ 404.css
│  │  │  ├─ about.css
│  │  │  ├─ article.css
│  │  │  ├─ friends.css
│  │  │  ├─ home.css
│  │  │  ├─ stats.css
│  │  │  └─ timeline.css
│  │  └─ main.css
│  ├─ js
│  │  ├─ core
│  │  │  ├─ app-initializer.ts
│  │  │  ├─ clarity.ts
│  │  │  ├─ core.ts
│  │  │  ├─ data-service.ts
│  │  │  ├─ page-manager.ts
│  │  │  ├─ page-utils.ts
│  │  │  └─ twikoo-manager.ts
│  │  ├─ data
│  │  │  ├─ searchWorker.ts
│  │  │  ├─ settings.ts
│  │  │  ├─ site-state.ts
│  │  │  └─ sw.js
│  │  ├─ entry
│  │  │  └─ main.ts
│  │  ├─ pages
│  │  │  ├─ about.ts
│  │  │  ├─ article.ts
│  │  │  ├─ friends-manager.ts
│  │  │  ├─ home-manager.ts
│  │  │  ├─ search-render.ts
│  │  │  ├─ stats-manager.ts
│  │  │  └─ timeline.ts
│  │  ├─ router
│  │  │  └─ router.ts
│  │  ├─ standalone
│  │  │  └─ 404.ts
│  │  ├─ ui
│  │  │  ├─ button-manager.ts
│  │  │  ├─ detail-dialog.ts
│  │  │  ├─ image-manager.ts
│  │  │  ├─ image-viewer.ts
│  │  │  ├─ jump-dialog.ts
│  │  │  ├─ list-events.ts
│  │  │  ├─ loading-overlay-manager.ts
│  │  │  ├─ mouse-effects.ts
│  │  │  ├─ navbar-manager.ts
│  │  │  ├─ personal-card.ts
│  │  │  ├─ theme.ts
│  │  │  └─ ui-effects.ts
│  │  └─ vendor
│  │     ├─ APlayer.min.js
│  │     ├─ browser.global.min.js
│  │     ├─ global-music-player.ts
│  │     └─ vercount.min.js
│  ├─ templates
│  │  ├─ 404.html
│  │  ├─ about.html
│  │  ├─ contact.html
│  │  ├─ footer.html
│  │  ├─ index.html
│  │  ├─ privacy.html
│  │  ├─ stats.html
│  │  └─ timeline.html
│  └─ works
│     ├─ 作品一
│     │  └─ metadata.json
│     └─ 作品二
│        ├─ index.html
│        └─ metadata.json
├─ .gitignore
├─ .gitmodules
├─ CNAME
├─ LICENSE
├─ package-lock.json
├─ package.json
├─ README.md
├─ requirements.txt
├─ run.py
└─ vite.config.ts
```

---

## 4. 构建系统详解

将源码（Markdown、元数据、前端资源）转换为可部署的静态网站。整个系统由 Python 编写，模块化设计，支持增量构建、并行执行和扩展。

### 4.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **数据模型** | `build_context.py` | 定义 `Article`、`Work`、`Friend`、`BuildContext` 等数据结构，作为构建上下文在各模块间传递。 |
| **公共工具** | `common.py` | 提供日志、JSON 读写、哈希计算、日期格式化、路径处理等通用函数。 |
| **输入加载器** | `input_loader.py` | 扫描 `src/assets/source/` 下的 Markdown 文件、`src/works/` 下的作品元数据、`src/assets/friends.json` 友链以及 `src/assets/网站更新日志.md`，解析后填充 `BuildContext`。 |
| **构建引擎** | `engine.py` | 管理所有生成器（`OutputGenerator`），协调执行顺序，支持串行/并行运行，并依据 `.build_state.json` 进行增量判断。 |
| **生成器基类** | `generators/base.py` | 定义生成器抽象接口，包含 `name`、`inputs`、`outputs`、`generate()` 等方法，以及输入哈希计算和状态更新逻辑。 |
| **聚合生成器** | `generators/aggregated.py` | 核心生成器，负责生成绝大部分输出：统计 JSON、RSS、站点地图、文章/作品/友链列表页、无 JS 回退页、复制静态资源（CSS、JS、素材）等。 |
| **友链颜色生成器** | `generators/friend_colors.py` | 独立生成器，通过下载友链头像并提取主色调，生成 `friend_colors.json` 用于前端卡片背景色。 |
| **入口脚本** | `run.py` | 命令行入口，解析参数，注册生成器，启动构建引擎。 |

### 4.2 构建流程

1. **加载输入**：`InputLoader` 读取所有源文件，生成 `BuildContext` 对象。
2. **生成器注册**：在 `run.py` 中注册 `FriendColorsGenerator` 和 `AggregatedGenerator`。
3. **增量判断**：引擎检查每个生成器的输出文件是否都存在，并比对输入数据的哈希值（以及前端资源的哈希），若未变化则跳过。
4. **执行生成**：依次（或并行）调用各生成器的 `generate()` 方法，将结果写入 `dist/` 目录。
5. **更新状态**：成功生成后，将当前输入哈希及时间戳保存到 `.build_state.json`，供下次增量判断使用。

### 4.3 增量构建机制

- **状态文件**：`.build_state.json` 存储每个生成器上次运行的“输入哈希”和“前端哈希”。
- **输入哈希**：由生成器声明的依赖（如 `articles`、`works`）的序列化内容计算而得，任一源文件改动都会导致哈希变化。
- **前端哈希**：`AggregatedGenerator` 额外监控 `src/css/`、`src/js/`、`src/templates/`、`src/assets/`（除 `source/` 外）以及根目录下的 `favicon.ico`、`robots.txt` 等文件，确保前端资源变动时重新编译。
- **强制重建**：通过 `--force` 参数可忽略所有增量判断，强制全量构建；`--force-colors` 可单独强制更新友链颜色。

### 4.4 生成器详解

#### AggregatedGenerator（聚合生成器）

这是最主要的生成器，其 `generate()` 方法依次执行以下任务：

- **统计生成**：统计文章数、总字数、标签/分类频次、作者数、更新天数等，写入 `dist/json/statistics.json`。
- **RSS 生成**：从文章和作品中提取条目，按时间排序生成 `dist/rss.xml`。
- **站点地图**：生成 `dist/sitemap.xml`，包含所有文章及固定页面。
- **文章列表页**：渲染 `dist/articles/index.html`，包含标签筛选、搜索框、排序功能，数据通过 `window.__STATIC_ARTICLES_DATA` 注入。
- **作品列表页**：渲染 `dist/works/index.html`，类似文章列表，数据通过 `window.__STATIC_WORKS_DATA` 注入。
- **友链页面**：渲染 `dist/friends/index.html`，包含友链卡片（带主题色）和申请要求说明。
- **无 JS 回退页**：生成 `dist/nojs.html`，提供完全静态的内容列表，方便搜索引擎或禁用 JavaScript 的用户访问。
- **子目录页面**：将 `src/templates/` 下的 `about.html`、`timeline.html`、`stats.html`、`contact.html`、`privacy.html` 复制到对应的 `dist/about/`、`dist/timeline/` 等目录。
- **前端构建**：调用 Vite 编译 TypeScript（`npm run build`），并将结果输出到 `dist/js/`。
- **静态资源复制**：
  - 压缩 CSS（使用 `rcssmin`）并复制到 `dist/css/`。
  - 复制 `src/assets/`（排除 `source/`）到 `dist/assets/`。
  - 复制 `src/copy/` 下的所有文件（如 `favicon.ico`、`robots.txt`、`BingSiteAuth.xml` 等）到 `dist/` 根目录。
  - 复制 `src/works/`（排除 `metadata.json`）到 `dist/works/`，以便作品子页面资源可访问。
  - 复制 `friends.json` 和 `friend_colors.json` 到 `dist/json/` 供前端使用。
- **代码分析**：生成 `dist/json/code_analysis.json`，记录 `dist/` 目录下各文件类型的数量、大小和行数统计，便于监控构建产物规模。

#### FriendColorsGenerator（友链颜色生成器）

- **功能**：为每个友链的头像图片提取主色调，生成 `src/assets/friend_colors.json`（映射：网站链接 → [R, G, B]）。
- **缓存**：头像图片会被缓存到临时目录，避免重复下载。
- **依赖**：需 `requests` 和 `Pillow` 库，若未安装则生成器跳过（但构建不会失败，只会使用默认灰色）。
- **增量**：默认只处理新增或缺失颜色的友链，使用 `--force-colors` 可强制刷新所有。

### 4.5 命令行用法

```bash
# 全量构建（忽略增量）
python run.py --force

# 仅强制更新友链颜色（其他生成器仍按增量判断）
python run.py --force-colors

# 只运行指定生成器（如只生成友链颜色）
python run.py --targets friend_colors

# 禁用并行执行（串行运行所有生成器）
python run.py --no-parallel

# 调整并行线程数（默认 4）
python run.py --workers 6
```

### 4.6 依赖与环境

- **Python 依赖**：见 `requirements.txt`，主要包括 `markdown`、`pyyaml`、`requests`、`pillow`、`rcssmin`、`python-dateutil`、`packaging`、`pymdown-extensions`。
- **Node.js 依赖**：用于前端 TypeScript 编译，见 `package.json`，使用 Vite 作为构建工具。
- **安装命令**：
  ```bash
  pip install -r requirements.txt
  npm install
  ```

### 4.7 扩展新生成器

若需增加自定义输出（如生成 JSON 摘要、额外页面），可继承 `OutputGenerator` 基类并实现抽象方法，然后在 `run.py` 中注册。例如：

```python
from builder.generators.base import OutputGenerator
from builder.build_context import BuildContext

class MyGenerator(OutputGenerator):
    name = "mygen"
    inputs = {"articles"}          # 依赖 articles
    outputs = [Path("dist/my.json")]

    def generate(self, context: BuildContext, force: bool) -> bool:
        # 使用 context.articles 生成 my.json
        return True
```

注册：

```python
engine.register(MyGenerator())
```

## 5. 前端架构

前端采用 **单页应用 (SPA)** 模式，基于原生 TypeScript 构建，无第三方框架依赖。核心设计遵循 **模块化**、**可维护性** 和 **性能优先** 原则，通过自定义路由、页面管理器、数据服务层和 UI 组件库，实现流畅的页面切换、高效的数据缓存和丰富的交互体验。

---

### 5.1 整体架构图

```mermaid
flowchart TB
    subgraph 入口与初始化
        A[main.ts] --> B[AppInitializer]
        B --> C[加载导航栏/页脚/主题/背景]
        B --> D[LoadingOverlayManager]
        D --> E[版本检测 & 数据预加载]
        E --> F[初始化完成]
    end

    subgraph 路由系统
        F --> G[enableAjaxNavigation]
        G --> H[router.ts]
        H --> I[拦截点击事件]
        I --> J[fetchAndReplaceContent]
        J --> K[提取页面内容 #router-view]
        K --> L[替换 DOM + 执行新页面脚本]
        L --> M[更新历史记录 & 滚动位置]
    end

    subgraph 页面管理
        M --> N[initPageManager]
        N --> O{页面类型}
        O -->|首页| P[HomePageManager]
        O -->|文章列表/作品列表| Q[SearchController]
        O -->|文章详情| R[ArticlePageManager]
        O -->|时间线| S[TimelineManager]
        O -->|统计| T[StatsManager]
        O -->|友链| U[FriendsPageManager]
        O -->|关于| V[AboutPageManager]
        O -->|其他| W[通用页面]
        P & Q & R & S & T & U & V & W --> X[执行 init / 销毁 destroy]
    end

    subgraph 数据与缓存
        E --> Y[DataService]
        Y --> Z[内存缓存 + localStorage]
        Z --> AA[并发去重 & 过期策略]
        Y --> AB[API 请求 /json/*]
    end

    subgraph UI组件与交互
        C --> AC[主题切换 theme.ts]
        C --> AD[导航栏 navbar-manager]
        C --> AE[个人卡片 personal-card]
        C --> AF[浮动按钮 button-manager]
        C --> AG[鼠标特效 mouse-effects]
        C --> AH[图片查看器 image-viewer]
        C --> AI[跳转弹窗 jump-dialog]
        C --> AJ[滚动揭示 ui-effects]
    end

    subgraph 第三方集成
        K --> AK[Twikoo 评论]
        K --> AL[vercount 统计]
        K --> AM[Chart.js 图表]
        K --> AN[APlayer 音乐播放器]
        K --> AO[GitHub 贡献图]
    end

    subgraph 性能与工具
        B --> AP[requestIdleCallback 调度]
        J --> AQ[页面缓存 & 预加载]
        H --> AR[滚动位置恢复]
        AA --> AS[Service Worker 离线缓存]
    end
```

---

### 5.2 模块划分与职责

| 模块路径 | 职责 |
|---------|------|
| **`/js/entry/main.ts`** | 应用入口，启动 `AppInitializer`，暴露全局 API（如 `fetchAndReplaceContent`） |
| **`/js/core/app-initializer.ts`** | 启动编排器，按优先级执行：主题同步、导航/页脚加载、数据预取、UI 组件初始化、Service Worker 注册等 |
| **`/js/router/router.ts`** | 核心路由引擎：拦截同源链接，基于 `History API` 实现无刷新导航，支持 `popstate`、锚点跳转、滚动位置管理、页面缓存（LRU）和资源动态加载/卸载 |
| **`/js/core/page-manager.ts`** | 页面管理器基类，定义 `init` / `destroy` 契约，所有页面管理器均继承或实现该接口 |
| **`/js/pages/`** | 各页面管理器实现：<br> • `home-manager.ts` – 首页统计、标签云、名言轮播、实时时钟<br> • `search-render.ts` – 文章/作品列表的搜索、筛选、排序（基于 Web Worker）<br> • `article.ts` – 文章详情：TOC 高亮、阅读进度、代码复制、图片懒加载、数学公式渲染<br> • `timeline.ts` – 时间线聚合（文章、作品、版本日志），支持年份/类型/搜索过滤<br> • `stats-manager.ts` – 统计仪表板，动态加载 Chart.js 绘制图表<br> • `friends-manager.ts` – 友链卡片随机排序、复制 JSON、跳转弹窗绑定<br> • `about.ts` – 关于页面：年龄升级系统、翻转卡片、GitHub 贡献图 |
| **`/js/core/data-service.ts`** | 数据服务单例：统一管理 API 请求，内存缓存 + localStorage 持久化（带过期策略），并发请求去重，支持强制刷新 |
| **`/js/data/`** | 数据辅助模块：<br> • `searchWorker.ts` – Web Worker，负责列表数据的过滤和排序，避免阻塞主线程<br> • `settings.ts` – 用户设置管理（光标、外链拦截）<br> • `site-state.ts` – 统计记录同步、Service Worker 注册、页脚信息填充 |
| **`/js/ui/`** | UI 组件集合：<br> • `theme.ts` – 主题切换（自动时段 + 手动）<br> • `navbar-manager.ts` – 导航栏 DOM 生成、移动端适配、标题替换模式<br> • `personal-card.ts` – 个人信息卡片渲染<br> • `button-manager.ts` – 返回顶部、目录（移动端）、设置按钮<br> • `mouse-effects.ts` – 自定义光标（圆点+圆环）、长按连线、爆发粒子<br> • `image-manager.ts` – 全局图片懒加载与点击查看器绑定<br> • `image-viewer.ts` – 图片查看器（缩放、旋转、拖拽、键盘控制）<br> • `jump-dialog.ts` – 通用跳转确认弹窗，支持锚点放大动画<br> • `detail-dialog.ts` – 通用详情弹窗（作品信息、设置面板）<br> • `list-events.ts` – 列表项点击处理（作品弹窗、文章导航）<br> • `loading-overlay-manager.ts` – 加载遮罩层，展示版本更新日志<br> • `ui-effects.ts` – 滚动揭示（IntersectionObserver）、外链拦截管理 |
| **`/js/core/core.ts`** | 核心工具库：配置常量、存储控制器（含 LZ 压缩）、Cookie 同意管理器、性能监控器、通用工具函数（防抖、节流、转义、日期解析等） |
| **`/js/core/page-utils.ts`** | 页面相关工具：时间主题判断、路径解析、背景图加载、站点年龄更新、页脚更新时间 |
| **`/js/vendor/`** | 第三方库封装：<br> • `global-music-player.ts` – 动态加载 APlayer，创建悬浮播放器<br> • `APlayer.min.js` – 音乐播放器核心（含网易云歌单）<br> • `vercount.min.js` – 访问统计（不蒜子风格） |
| **`/js/standalone/404.ts`** | 404 页面独立逻辑，包含智能路径分析和自定义错误消息 |

---

### 5.3 核心流程

#### 5.3.1 应用启动流程

1. **入口**：`main.ts` 监听 `DOMContentLoaded`，调用 `AppInitializer.start()`。
2. **编排器**执行顺序：
   - 添加预连接、预加载标签（优化性能）。
   - 同步主题（从 localStorage 或时段计算）。
   - 空闲时加载背景图。
   - **同步加载导航栏**（确保 DOM 就绪）。
   - 异步加载页脚、个人卡片、浮动按钮。
   - 启动站点年龄更新器。
   - 启用无刷新导航（`enableAjaxNavigation`）。
   - 注册 `popstate` 监听。
   - 初始化当前页面的 `PageManager`（通过 `initPageFeatures`）。
   - 加载数据服务、图片懒加载、全局图片查看器。
   - 初始化 Clarity 分析、音乐播放器（空闲时）。
   - **显示加载覆盖层**（`LoadingOverlayManager`），等待用户点击后关闭。
   - 播放导航栏入场动画。
   - 注册 Service Worker（生产环境）。

#### 5.3.2 路由与页面切换

- 用户点击同源链接 → `router.ts` 拦截（`enableAjaxNavigation`）。
- 调用 `fetchAndReplaceContent(url)`：
  1. 检查缓存（内存 + localStorage），若命中且未过期则直接使用。
  2. 否则发起 `fetch` 请求（带 `t` 时间戳防止缓存）。
  3. 解析 HTML，提取 `#router-view` 内容、样式表、脚本。
  4. 执行 DOM 替换（带淡入淡出动画）。
  5. 卸载旧页面的资源（样式/脚本）。
  6. 加载新页面的资源，并初始化对应的 `PageManager`。
  7. 恢复滚动位置（从 `history.state` 或锚点）。
  8. 触发 `ajax:navigation` 事件，供其他模块监听。

#### 5.3.3 数据流

- 所有 API 请求通过 `DataService` 单例发出。
- 策略：
  1. **内存缓存**（5 分钟 TTL）。
  2. **localStorage 持久化**（压缩存储大对象）。
  3. **并发去重**（同一请求多个调用共享同一个 Promise）。
  4. 网络失败时返回过期缓存（降级）。
- 页面管理器在 `init` 中调用 `DataService` 获取数据，并渲染 UI。

#### 5.3.4 搜索与筛选（文章/作品列表）

- 使用 `SearchController`（位于 `search-render.ts`）管理列表页。
- 核心逻辑在 **Web Worker**（`searchWorker.ts`）中执行，避免主线程卡顿。
- 支持标签筛选、关键词搜索（标题/标签/日期）、多种排序（更新时间、字数、发布日期）。
- 搜索结果分批次渲染（每批 20 项），提升首屏速度。
- URL 参数与搜索状态双向同步（`pushState` 更新）。

#### 5.3.5 页面管理器生命周期

- 每个页面管理器实现 `init` 和 `destroy` 方法。
- `init`：绑定事件、加载数据、渲染 DOM、初始化第三方组件（如 Twikoo）。
- `destroy`：清理事件监听、定时器、观察者，重置 DOM（防止内存泄漏）。
- 路由切换时自动调用旧页面的 `destroy` 和新页面的 `init`。

---

### 5.4 性能优化策略

| 优化点 | 实现方式 |
|-------|---------|
| **懒加载** | 图片懒加载（`IntersectionObserver`）、组件异步加载（动态 `import()`） |
| **缓存** | 内存缓存 + localStorage 持久化，SW 离线缓存（`stale-while-revalidate`） |
| **并发控制** | `DataService` 去重，避免重复请求；`requestIdleCallback` 调度非关键任务 |
| **渲染优化** | 列表分批次渲染、使用 `DocumentFragment`、减少回流 |
| **代码分割** | Vite 构建，按入口分割（`main`、`404`、`settings`、`searchWorker`） |
| **资源预加载** | 预连接第三方域、预加载首屏图片、`<link rel="preload">` |
| **滚动性能** | 滚动事件防抖/节流，`passive` 监听器，`will-change` 提示 |
| **动画性能** | 使用 CSS `transform`/`opacity` 触发 GPU 加速，避免 JS 动画阻塞主线程 |

---

### 5.5 技术选型说明

| 技术 | 用途 | 理由 |
|------|------|------|
| **TypeScript** | 前端语言 | 提供类型安全、更好的 IDE 支持和代码可维护性 |
| **Vite** | 构建工具 | 极速冷启动、按需编译、原生 ESM，适合现代浏览器 |
| **原生 History API** | 路由 | 轻量、无依赖，与 SPA 无缝集成 |
| **Web Worker** | 搜索/筛选 | 将计算密集型任务移至后台线程，保证 UI 流畅 |
| **IntersectionObserver** | 懒加载、滚动揭示 | 高性能，减少滚动事件监听 |
| **localStorage + LZString** | 数据缓存 | 支持大对象压缩，减少网络请求 |
| **Service Worker** | 离线缓存 | 提升二次访问速度，支持弱网环境 |
| **Chart.js** | 统计图表 | 轻量、易用、主题自适应 |
| **Twikoo** | 评论系统 | 无后端、部署简单，支持 Markdown |
| **vercount** | 访问统计 | 轻量、隐私友好 |
| **APlayer** | 音乐播放器 | 支持歌单、歌词显示，界面美观 |

---

### 5.6 扩展指南

#### 添加新页面

1. 在 `src/templates/` 创建 HTML 模板（含 `#router-view` 等占位）。
2. 在 `builder/generators/aggregated.py` 的 `PAGE_TEMPLATES` 中注册。
3. 在 `src/js/pages/` 下创建对应的 `XxxManager.ts`，继承 `PageManager` 并实现 `init`/`destroy`。
4. 在 `src/js/router/router.ts` 的 `registerDefaultPages` 中注册页面管理器（动态导入）。
5. 在导航栏（`navbar-manager.ts`）添加链接项。
6. （可选）在 `src/js/core/app-initializer.ts` 中调整初始化逻辑（若需特殊处理）。

#### 自定义 UI 组件

- 新建文件于 `src/js/ui/`，导出核心函数。
- 遵循“事件绑定与销毁”模式，确保在页面切换时能清理资源。
- 若需全局弹窗，可使用 `detail-dialog.ts` 或 `jump-dialog.ts` 作为基础。

#### 修改主题或样式

- CSS 变量定义在 `src/css/core/variables.css`。
- 主题切换逻辑在 `src/js/ui/theme.ts`。
- 图表颜色随主题变化（`stats-manager.ts` 中监听 `themeChanged` 事件）。

## 6. 关键数据流

### 6.1 文章发布流程

```
1. 作者在 src/assets/source/分类/ 下新建 .md 文件（含 frontmatter）
2. 运行 python run.py
3. input_loader 解析 MD，生成 HTML 到 dist/articles/
4. 更新 dist/json/articles.json
5. aggregated 生成统计、RSS、站点地图
6. 静态资源复制（Vite 构建 JS/CSS）
7. 部署 dist/ 到服务器
```

### 6.2 前端页面加载流程（以文章详情为例）

```
1. 用户点击文章链接（或直接输入 URL）
2. router 拦截，fetch 获取 /articles/xxx.html
3. 提取 #router-view 内容，替换
4. 执行新页面中的脚本（article.ts 初始化）
5. ArticlePageManager：
   - 读取 window.ARTICLE_HEADINGS（由构建时注入）
   - 构建 TOC 并绑定点击滚动
   - 初始化阅读进度条
   - 启用图片懒加载（IntersectionObserver）
   - 初始化 Twikoo 评论（动态加载库）
   - 启动数学公式渲染（KaTeX）
   - 更新不蒜子统计
6. 记录滚动位置到 sessionStorage（返回时恢复）
```

### 6.3 搜索与筛选流程（文章/作品列表）

```
1. 页面加载时，DataManager 从缓存或网络获取数据。
2. SearchController 从 URL 解析查询参数（q, field, tags, sort）。
3. 将数据、查询条件发送给 Web Worker。
4. Worker 过滤、排序后返回结果。
5. UIRenderer 生成 HTML，替换列表容器。
6. 滚动揭示效果重新触发（ScrollReveal）。
7. 用户修改搜索/标签/排序时，更新 URL 并重复上述过程。
```

---

## 7. 数据格式规范

### 7.1 文章 Frontmatter（YAML）

```yaml
---
title: 文章标题
date: 2026-05-24
description: 简介
author: 高新炀
tag: [随笔, 生活]
category: 随笔   # 可选，默认使用所在子目录名
---
```

- `date` 支持 `YYYY-MM-DD` 或 `YYYY年MM月DD日`。
- `tag` 可为数组或逗号分隔字符串。
- 包含 `隐藏` 标签的文章将不出现在列表/RSS/统计中，但仍生成 HTML 到 `.hidden/`。

### 7.2 作品元数据（`works/作品名/metadata.json`）

```json
{
  "title": "作品标题",
  "date": "2026-01-01",
  "description": "描述",
  "author": "高新炀",
  "tag": ["工具", "游戏"],
  "link": "https://example.com"   // 可留空，默认指向 /works/作品名/
}
```

### 7.3 友链（`dist/json/friends.json`）

```json
[
  {
    "name": "站点名称",
    "link": "https://example.com",
    "desc": "描述",
    "avatar": "https://example.com/avatar.png"
  }
]
```

### 7.4 统计 JSON（`statistics.json`）字段

| 字段 | 说明 |
|------|------|
| `version` | 版本号（来自更新日志最新版本 ID） |
| `last_updated` | 最新更新日期 |
| `total_articles` | 文章总数 |
| `total_word_count` | 总字数 |
| `total_works` | 作品总数 |
| `article_tags` | `[{name, count}, ...]` 按次数降序 |
| `article_categories` | 同 `article_tags` |
| `work_tags` | 同 `article_tags` |
| `total_update_days` | 有更新的日期天数 |

---

## 8. 开发与扩展指南

### 8.1 添加新页面

1. 在 `src/templates/` 下创建新的 HTML 模板，包含 `#navbar-placeholder`、`#personal-card-container`、`#footer-placeholder`、`#router-view` 等占位。
2. 在 `builder/generators/aggregated.py` 的 `PAGE_TEMPLATES` 字典中添加映射（模板名 → 子目录），以在构建时复制到 `dist/`。
3. （可选）若页面需要动态初始化，在 `src/js/pages/` 下创建对应的页面管理器（继承 `PageManager`），并导出 `initXxxPage` 函数。
4. 在 `src/js/router/router.ts` 的 `initPageManagerByPageName` 中添加分支，动态导入并初始化该管理器。
5. 在导航栏（`navbar-manager.ts` 的 `links` 数组）中添加链接项。
6. 重新运行构建。

### 8.2 自定义生成器

若需扩展构建输出（如生成 JSON 摘要、额外页面等），可继承 `OutputGenerator`：

```python
from builder.generators.base import OutputGenerator
from builder.build_context import BuildContext

class MyGenerator(OutputGenerator):
    name = "mygen"
    inputs = {"articles", "works"}   # 依赖的上下文属性
    outputs = [Path("dist/myfile.json")]

    def generate(self, context: BuildContext, force: bool) -> bool:
        # 使用 context.articles, context.works 等生成
        return True
```

然后在 `run.py` 中注册：

```python
engine.register(MyGenerator())
```

### 8.3 修改前端构建（Vite）

- 入口文件：`src/js/entry/main.ts`。
- Vite 配置：`vite.config.ts` 将 `src/js` 映射为 `/js`，构建输出到 `dist/`（`preserveModules` 保持目录结构）。
- 生产构建通过 Python 构建系统调用 `npm run build` 触发 Vite。

### 8.4 调试技巧

- **构建日志**：`builder/common.py` 提供 `log_info/warning/error`，彩色输出。
- **前端调试**：Chrome DevTools，查看 `localStorage` 中的缓存数据（`articlesData`, `worksData` 等）。
- **性能分析**：`core/core.ts` 中的 `PerformanceMonitor` 自动记录关键操作耗时，超过 100ms 会输出警告。
- **Service Worker**：可在 Chrome Application 面板中手动注销或更新。

---

## 9. 部署说明

1. 安装依赖：`pip install markdown pyyaml python-dateutil rcssmin`
2. 安装 Node.js 依赖：`npm install`（用于 Vite）
3. 运行构建：`python run.py`（或 `python run.py --nogui`）
4. 构建产物位于 `dist/` 目录。
5. 将 `dist/` 内容上传到静态托管平台（如 GitHub Pages、Netlify、Vercel）。
6. 确保 `CNAME` 文件内容为自定义域名（如需）。
7. 若使用 Twikoo，需部署云函数并更新各页面中的 `envId`。

---

## 10. 许可证

- **代码**：MIT License
- **文章内容**：CC BY-NC-ND 4.0（除特别声明外）

---

*本文档持续更新，以项目最新代码为准。*  
*维护者：高新炀*  
*最后更新：2026-08-13*