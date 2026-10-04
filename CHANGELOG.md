# 更新日志

本站所有值得注意的变动都记录在本文件中。

本文件格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本规范](https://semver.org/lang/zh-CN/)。

变动类型：

- **新增** —— 新添加的功能
- **变更** —— 对现有功能的改动
- **弃用** —— 即将移除、暂不支持的功能
- **移除** —— 已移除的功能
- **修复** —— 缺陷修复
- **安全** —— 安全相关的改进

## [8.47.2] - 2026-10-04

### 新增

- footer：联系区新增 CurseForge 与 Modrinth 两个入口
  - 分别指向 `https://www.curseforge.com/members/gaoxinyang/projects` 与 `https://modrinth.com/user/GaoXinyang`
  - Font Awesome 未收录此二枚图标，改用 `src/assets/svg/curseforge.svg` / `modrinth.svg` 作 CSS 蒙版着色，尺寸、主题色与悬停动效同相邻 `<i>` 图标保持一致

### 变更

- works：作品卡片的归档提示改为右上角 45° 浅红横条「已归档」
  - 原先的胶囊标签（已归档 · 不再维护）由卡片内容区移出，改为压在右上角角平分线上的横条，两端由卡片圆角裁切（`.list-item.has-archived` 增加 `overflow: hidden`）
  - 选择器带上 `.list-item.has-archived` 以盖过 `.list-item.has-cover > *` 的 `position: relative`（同特异性后写者胜），带封面的归档卡片才会保持绝对定位
  - 构建期 SSR（`builder/generators/aggregated.py`）与前端渲染（`search-render.ts`）两处标记同源更新，鼠标悬停仍保留 `该作品已归档，不再维护` 提示

## [8.47.1] - 2026-10-04

### 移除

- 移除 Microsoft Clarity 行为统计集成
 - 删除 `js/core/clarity.ts`（Clarity 项目 ID `wnxwo9anpg` 的注入片段与 `window.clarity` 队列占位），`app-initializer` 相应删去初始化调用与 SPA 导航时的页面视图上报
 - 该第三方此前在未取得任何同意的情况下即加载，直接移除比补一层同意弹窗更彻底
 - 隐私政策的第三方服务列表撤下 Clarity 卡片；README 的技术栈表、目录树、架构图、模块职责表、启动阶段说明与第三方选型表共 6 处同步移除

## [8.47.0] - 2026-10-03

### 新增

- seo：构建期统一注入 canonical / Open Graph / Twitter Card / JSON-LD / RSS 自动发现
 - builder: 新增 `seo.py`（`seo_head_tags` / `json_ld_webpage`），文章页、文章与作品列表页、友链页共用同一套标签生成
 - templates: 7 个静态模板补齐上述标签；关于 / 留言板 / 时间线 / 文章 / 作品 / 友链六个一级页补上缺失的 meta description
 - 中文文件名在 canonical 与 sitemap 中统一百分号编码，两者形态一致
- sw：新增离线降级页 `/offline.html` —— 此前 Service Worker 预缓存与回退指向的地址从未被生成（线上 404），离线兜底一直是死代码；新页面自包含内联样式，离线时无需请求任何外部资源
- build：新增 `SITE_URL` 单点（`builder/common.py`），RSS、sitemap、robots、友链信息卡与静态模板共用；`src/public` 下的 `.html` / `.txt` / `.xml` 支持 `{{SITE_URL}}` 占位符，将来换域名只改一处
- ci：新增质量门禁与产物冒烟断言
 - typecheck: `tsconfig.json` 纳入版本库并从 `.gitignore` 移除，`tsc --noEmit` strict 全量校验（首次运行即暴露 35 个历史错误，已全部修完）
 - lint: biome（TS/JS 正确性规则）与 ruff（`builder/` 与 `run.py`）；另提供 `npm run check` 一条命令串行跑完四条门禁
 - smoke: 校验 17 个关键产物、robots 含绝对 Sitemap 地址、sitemap 不含 404 页面、index 含 OG 与 canonical、favicon 体积上限；`pull_request` 同样触发门禁但不部署
- css：core 四件套（variables / base / layout / components）按序合并为 `/css/core.css`，首页 CSS 请求 7 → 4、文章页 9 → 5；单文件照常产出，外部引用不受影响
- a11y：加载遮罩支持键盘关闭（Enter / Space / Escape），更新提示态设 `role="dialog"` 与 `aria-modal`
- repo：新增 `.gitattributes` 固定行尾（此前 42 个 CRLF / 3 个 LF 混用），biome formatter 统一 45 个源文件的格式

### 变更

- theme：浅色主题强调色 `#b45b63` → `#ab4f57`
 - 正文链接与加粗的对比度 4.10 → 4.75（WCAG AA 正文需 4.5），白色背景上 5.27；暗色主题本就达标，未改动
 - 新增 `--accent-hover` 令牌承载文字 hover（浅色取 accent-dark 5.51，暗色沿用原 accent-light 6.03），33 处硬编码旧色值同步更新；统计图表调色板首色跟随
- a11y：焦点指示由 18% 透明度光晕（对浅底 1.24，WCAG 1.4.11 需 3）改为 2px 实线 outline，并移除 10 处 `outline: none` 对全局焦点环的覆盖
- perf：KaTeX 改为按需注入 —— 在转换前的 Markdown 源上判定是否含公式（先剔除围栏 / 缩进 / 行内代码，避免把 PHP 的 `$var` 当成公式），全站仅 1 篇真含公式，20 篇中 19 篇不再加载三件套（约省 300KB / 页）
- sw：静态资源缓存策略 Cache First → Stale-While-Revalidate，`CACHE_VERSION` v6 → v7
 - 产物不带内容哈希，Cache First 会把访客锁死在首次缓存的 JS / CSS 上，只能靠手动改版本号强刷
- build：sitemap 排除指向 404 的 `/settings/`、补上遗漏的 `/privacy/`、排除 README 构建文档，priority 分层（首页 1.0 / 频道 0.8 / 文章 0.6），中文 URL 百分号编码
- types：四套并行的同构类型定义归一到 `types/data.ts` 唯一真源
 - core: `WorkItem` / `ArticleItem` / `WorksData` / `ArticlesData` 改为 re-export，既有导入路径不变
 - timeline: `BaseItem` 加两个空扩展 `Article` / `Work`、以及与 `VersionEntry` 同构的 `Version` / `Change` 全部改为别名
 - stats: `chart-registry` 的 `StatisticsData` / `ArticleItem` / `CodeAnalysisData` 改为引用；`site-state` 三个从未使用的 interface 移除
- ui：外链确认弹窗倒计时 6 → 3 秒，关闭按钮默认显示
 - Chrome 的瞬时用户激活只保留 5 秒，原「入场 650ms + 6 秒倒计时」的自动 `window.open` 必被弹窗拦截，表现为倒计时归零却毫无反应
 - 弹窗被拦截时降级为当前标签页导航，不再静默失败
- works：Google Fonts 改为 `media="print" onload` 非阻塞加载（国内访问不到，同步引用会阻塞渲染到超时）；Font Awesome 统一到 6.5.0（原有 6.0.0-beta3 / 6.0.0 / 6.4.0 / 6.5.0 四版并存）；《周总理，你在哪里》页面移除已失效（http / https 均 403）的背景图并以渐变兜底
- README：同步版本漂移（TypeScript 6.0.3 → 7.0.2、Vite 8.1.1 → 8.3.0、Twikoo 1.7.22 → 2.0.12），修正 `page-utils.ts` → `page-runtime.ts`、`standalone/404.ts` → `pages/404.ts`，补充质量门禁章节

### 修复

- 文章与 README 的目录不再把围栏代码块里的 `#` 注释、示例当作标题：此前它们会混进目录条目，并让其后所有真实标题的锚点错位
- ui: 自定义光标 `refresh()` 从未生效 —— 方法内解构的 `this.dot` / `this.ring` 并不存在（实际字段是私有 `#dot` / `#ring`），解构恒得 `undefined` 后在下一行早退
- ui: 加载遮罩在无 JS 或 JS 报错时是全屏黑屏，唯一的 noscript 提示还被遮罩自身的 `z-index: 999999` 盖住
 - 7 个整页模板各加 `<noscript>` 遮罩样式；noscript 横幅 z-index 提到 1000001
 - 遮罩新增单请求 6 秒超时与整体 8 秒硬兜底，弱网不再永久黑屏；`dismiss()` 幂等，点击 / 键盘 / 超时多方竞争只生效一次
 - 硬超时在进入「等待用户确认」态时解除，不会把用户正在读的更新提示强行关掉
- seo: favicon 由 205,086 字节（单条目 256×256 未压缩 BMP、无 alpha 通道）压缩到 10,254 字节，并在 head 显式声明 `rel="icon"`，不再让每个页面白付约 200KB
- build: 单篇 Markdown 解析失败只记一行日志后继续，CI 绿灯发布缺文章的站点
 - 收集失败列表并在**写入 articles.json 之前**抛出，避免增量缓存把「这些文章本来就不存在」固化；`--no-strict` 仍可宽容继续
- build: `_run_vite` 的 900 秒超时形同虚设 —— 读流无超时，`TimeoutExpired` 后 `Popen.__exit__` 仍会阻塞等待；改为读流独立线程 + 超时先 `proc.kill()` 再回收
- build: 删除源文件后 HTML 永久残留并继续被部署，隐藏标签来回切换会在 `articles/` 与 `articles/.hidden/` 各留一份；新增陈旧产物清理
- articles: README 被渲染成「未命名文章」—— 标题在 HTML 写盘之后才被改写，列表与页面标题对不上；改为写盘前确定
- articles: 「markdown 渲染测试」（作者含 DEEPSEEK-V3）对外可访问并以 0.9 的 priority 进入站点地图；打上隐藏标签走 noindex 通道
- fetch: 数据请求无超时、对 404 也无退避连打 2 次、`clearCache()` 连在途 Promise 一起清掉导致重复请求
 - `data-service` 统一 10 秒超时；router 加 12 秒超时与 `HttpStatusError`（4xx 不重试），重试改为 300ms 起的指数退避
- fetch: `page-runtime` 绕过 `dataService` 裸 fetch statistics.json，首屏同一份数据被请求两次
- a11y: 首页 `main` 上的 `aria-live` 让读屏每秒播报一次实时时钟；时钟加 `aria-hidden`，内层第二个 `<main>`（HTML 非法）降级为 `<section>`
- timeline: `<head>` 内同步加载 marked 阻塞页面解析（同页的 Font Awesome 已是 defer），补上 `defer`
- frontend: window 扩展（`fetchAndReplaceContent` / `scrollRevealInstance` / `APlayer` 等）无类型声明，只能靠 `(window as any)` 绕过；新建 `types/globals.d.ts` 统一收口，此前散落在 6 个文件的 `declare global` 一并收敛

## [8.46.0] - 2026-10-02

### 变更

- 网站更新日志更名为 `CHANGELOG.md` 并移动到仓库根目录，整体改写为 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/) 格式：版本标题改为 `## [x.y.z] - YYYY-MM-DD`，条目按变动类型小节分组，文件头部新增 `[Unreleased]` 区块与变动类型说明
- 构建系统改为从仓库根目录读取 `CHANGELOG.md`：解析器按 `### 新增 / 变更 / 弃用 / 移除 / 修复 / 安全` 小节生成条目类型，`type` 由 Conventional Commits 前缀（`feat` / `fix` / …）变为中文小节名；该文件随静态资源规则原样发布到站点根
- 时间线的变更类型徽标按新的中文类型着色，同时保留对旧格式分片（`feat` / `fix` 等）的兼容

### 修复

- 若干缩进书写或缺少日期的版本块（v7.8.7、v7.0.0、v6.0.0-dev1~6、v4.2.0、v4.0.0、v3.0.0、v8.12.0-DEV.1/2）此前被并入相邻版本的描述，现在作为独立版本参与时间线与更新提示
- v6.0.0-dev1~3 的日期误写为 2024 年，已更正为 2026 年；重复的 `2025-10-22` 旧日志合并为一条

## [8.45.7] - 2026-09-30

### 变更

- 更新 twikoo 版本（2.0.9 -> 2.0.12）

## [8.45.6] - 2026-09-27

### 新增

- 支持点击页脚数据区打开统计页

### 修复

- 页脚数据区卡片中的图标显示完全不透明

## [8.45.5] - 2026-09-27

### 修复

- 首页 UAPI 的随机一言未工作

## [8.45.4] - 2026-09-27

### 修复

- frontend：修复外链拦截与跳转弹窗的一系列缺陷
 - jump-dialog: `querySelector('.avatar-img, .avatar-placeholder')` 只返回文档顺序的第一个元素，友链卡片里占位 div 排在 img 前面，头像照片被整段丢弃，弹窗永远只显示首字母；改为按选择器声明顺序逐个尝试，并跳过已隐藏 / 加载失败的候选
 - jump-dialog: 照片加载失败时才切换到首字母占位（占位默认行内隐藏），不再做「照片压在占位之上」的叠层——叠层缺样式时会变成上下各半、两边都看不全
 - jump-dialog: 原来先 `preventDefault()` 再校验字段，缺少 name 时直接 return，点击被吞掉、链接再也打不开；改为校验通过后才拦截，且 name 缺失时回退到主机名
 - ui-effects: 外链弹窗此前完全不传照片，链接内的头像 / 封面无法显示；现在会带上链接里可用的图片，并从锚点位置放大展开
 - ui-effects: 中键与 Ctrl / Cmd / Shift / Alt 组合点击不再被拦截（本意是新标签页打开），下载链接（`download`）同样放行
 - ui-effects: 弹窗标题不再直接取 `anchor.textContent`（图片链接拿不到名字、卡片链接会把整段描述塞进标题），改为 `data-jump-name` > `title` / `aria-label` > 卡片标题 > 图片 alt > 截断文本 > 主机名
 - ui-effects: 已被 `bindJumpTriggers` 接管的触发器会打上 `data-jump-bound`，替代原先从不生效的 `[data-friend-link="true"]` 判断，避免同一张卡片弹两次

## [8.45.3] - 2026-09-27

### 变更

- works：非归档作品统一目录结构与资源命名
- README 补充作品目录约定（文件命名、外链方式、编码要求）

## [8.45.2] - 2026-09-26

### 修复

- 修复无刷新导航不支持浏览器前进和后退

## [8.45.1] - 2026-09-26

### 变更

- footer：数据卡片右下角的装饰图标改为半透明（0.45，悬停 0.68），并抽出 `--footer-stat-icon-opacity` / `--footer-stat-icon-opacity-hover` 两个变量便于调整

### 修复

- footer：修复页脚“今日访问 / 累计访问”始终显示 0、趋势图一直转圈
 - router: 页脚由 fetch + innerHTML 注入，浏览器不会执行 innerHTML 写入的 `<script>`，fakeicp widget.js 从未运行；新增 reviveInjectedScripts() 按原属性重建脚本节点后替换占位节点，挂件得以正常拉取数据
 - router: 重建时保留 `data-site` / `data-target`，widget.js 仍可通过 document.currentScript 找到 `#footer-stats-widget` 容器

## [8.45.0] - 2026-09-26

### 新增

- articles：文章 frontmatter 新增可选字段 `cover`，填写后作为列表项背景图显示
- works：作品 `metadata.json` 新增可选字段 `cover`（卡片背景）与 `archived`（卡片右上角标记“已归档 · 不再维护”）

### 变更

- list：文章列表项的发布日期 / 更新日期并入元信息行（作者 · 字数 · 阅读时长 · 发布于 · 更新于），圆点分隔、窄屏自动换行，移除 `.article-dates-top-right`
 - common: 新增 `UNKNOWN_DATE_TEXT` 与 `is_known_date()`，缺失日期整块省略，作品卡片同理不再渲染“未指定日期”
- README 数据格式规范补充 `cover` / `archived` 字段说明

### 修复

- articles：修复文章列表所有条目都显示“发布于 未指定日期”
 - common: `format_date()` 的 strftime 漏了“月”字（`%Y年%m%d日`），`format_date_iso()` 无法反向解析，日期被统一降级成占位值，并随哈希缓存长期固化在 articles.json 里
 - input_loader: 日期改为先归一化成 ISO 再转展示格式，不再做「格式化 → 反解析」往返；缓存复用时若旧记录日期为占位值则重新解析，无需 `--force` 即可自愈

## [8.44.1] - 2026-09-26

### 变更

- 优化一些CSS

## [8.44.0] - 2026-09-26

### 新增

- 更新日志分片以减少每次加载的更新日志json大小

### 变更

- FA Kit 移入 `<head>` 并添加 defer

## [8.43.0] - 2026-09-26

### 变更

- frontend：消除滚动与导航期的重复计算与重复下载
 - article: 标题集合、TOC 条目、文档可滚动区间改为缓存，滚动回调不再每帧 querySelectorAll + getBoundingClientRect 全量扫描
 - article: 高亮项与进度百分比未变化时跳过 DOM 写入，滚动时绝大多数帧不再触碰样式
 - page-runtime: 拆出 showBackgroundImage()，已下载过壁纸时只恢复显示 —— 原来每次 SPA 导航都走 force 分支重新下载一张 Bing UHD 壁纸
 - mouse-effects: 守护用的 MutationObserver 收敛为只观察 body 直接子节点，不再监听整个 documentElement 子树
 - friends-manager: 页面不可见时跳过随机排序，避免后台标签页反复 replaceChildren 重排与头像重解码
 - page-runtime: 站点年龄计时器在 document.hidden 时暂停，回到前台立即补算
- frontend：收敛重复实现并补齐类型与异常兜底
 - core: 新增 safeSession / safeLocal 封装，全站 sessionStorage / localStorage 读写统一走它，无痕模式与配额超限不再抛异常中断流程
 - types/data: 补齐 search-render 引用的 Item 类型（此前该类型并不存在，实际退化为隐式 any），并移除相关的 (a as any) 断言
 - twikoo-manager / clarity: 两个 .ts 文件此前是纯 JS，补全参数类型与 window 全局声明
 - settings: 新增 getNumberSetting() 替换 getSetting(...) as number 的假类型（实际拿到的是字符串 "110"）；清理存储相关的函数补齐 try/catch
 - core: CONFIG.EXTERNAL_WHITELIST 与 ui-effects 的私有副本合并为唯一来源，合并时补回 travellings.cn 等此前遗漏的域名
 - image-manager: IS_DEV 改为复用 core 的实现，不再自己判断 hostname
 - router: stale 导航已插入的样式 / 脚本依旧登记到 activeStyleIds，否则下次 unload() 找不到它们，会永久泄漏在 head 中
 - router: 目标页已有在途请求时不再 abort 上一个控制器，否则会取消掉自己正要复用的 Promise
 - core: validateData 的 undefined > 0 改为显式判空；PerformanceMonitor 指标数组改为只保留最近 50 条
 - button-manager: 返回顶部阈值改为每次计算，窗口高度变化后不再沿用初始化时的旧值

### 修复

- frontend：修复多处影响正常使用与资源回收的缺陷
 - site-state: registerServiceWorker() 改为按 document.readyState 判定，原来无条件挂在 window load 上，而调用时 load 早已触发，生产环境 Service Worker 从未注册成功
 - article: 目录点击写入完整 HistoryState，原来的 pushState(null) 会让 router 的 popstate 走到 location.reload()，点目录后按返回键变成整页刷新
 - article: unmount() 恢复 body 的 overflow，侧边栏开启状态下做 SPA 导航会让新页面滚动永久锁死
 - image-manager: 图片被 a[href] 包裹时不再劫持点击，capture 阶段的 preventDefault + stopPropagation 会整条吞掉事件，导致外链确认弹窗与 SPA 导航失效
 - search-render: 新增 pickItems() 安全取列表，避免字段缺失时 [...data.works] 抛 TypeError；四处 handleSearch() 统一改走带 catch 的 runSearch()
 - stats-manager: Chart.js 加载失败不再 reject 中断 init()，改为布尔降级 + 10s 超时兜底，统计页不再静默空白
 - about: ResizeObserver 降级分支的 window resize 监听改由 DisposableStack 托管，页面销毁后不再持续触发里程碑重排
 - loading-overlay: 更新态的 3s 淡出定时器保存句柄，用户提前点击关闭时清理；点击监听改为幂等绑定
 - tooltip: hide() 的 4 段接力 setTimeout 登记到 hideAnimTimers，destroy() 与 hideImmediate() 现在能真正清掉它们
 - home-manager: 名言请求的 6s 超时定时器在 race 结束后清理；initHomePage() 改为 await init()，不再留下未处理的 Promise 拒绝

## [8.42.0] - 2026-09-26

### 变更

- builder：非构建资源改为声明式统一管理
 - 新增 static_assets.py：所有“原样复制”的资源由 AssetRule 声明（目录 / glob / 单文件），构建流程不再散落 shutil.copytree 与手工单文件复制
 - src/copy 更名为 src/public：站点根文件（favicon、robots、域名验证）放进即发布，无需改代码
 - src/assets/*.json 自动发布到 dist/json/，新增友链数据 / 主题色不再需要手写复制逻辑
 - 同步改为内容寻址增量复制（size + mtime / 哈希比对），未变化文件不重复写盘；默认排除 .git 等元数据
 - 前端哈希由静态资源规则自动派生，新增规则无需再维护哈希清单
 - friend_colors: 头像抓取失败时保留已有颜色，不再把已缓存的主题色“降级”为灰色
 - ci: 构建前校验 src/assets/friend_colors.json 缓存（缺失即失败），并用 actions/cache 复用头像字节，减少重复网络请求

## [8.41.1] - 2026-09-26

### 变更

- 在导航栏和页脚添加 GaoXinYang.svg 及动画

## [8.41.0] - 2026-09-26

### 变更

- builder：现代化构建系统并修复增量与跨平台缺陷
 - common: 移除 import 期创建目录的副作用，哈希升级为 BLAKE2b，产物统一 LF 换行，日志支持 NO_COLOR / CI
 - config: 新增 BuildConfig 统一承载 force / clean / skip_frontend / offline / strict / parallel 等开关
 - engine: 新增 BuildReport 汇总结果，--clean 清空 dist；修复聚合生成器 frontend_hash 未落盘导致每次都触发 Vite 的问题
 - aggregated: Vite 调用跨平台（npm.cmd + 引号转义）且失败默认中止构建，CSS 并行压缩且内容未变不重写
 - friend_colors: 头像抓取改为带重试的连接池 + 并发，失败降级为默认色，支持 --offline 离线模式
 - frontend: vite.config.mts 基于自身位置解析路径，补全 dev / preview 构建参数；package.json 增加 engines
 - ci: 工作流拆分为 build / deploy 两个作业，版本改用 .python-version / .nvmrc，去掉 --force 改用 --ci 严格模式

## [8.40.0] - 2026-09-26

### 新增

- 添加了一个 SVG 绘制动画组件

## [8.39.3] - 2026-09-26

### 新增

- 在页脚添加开源致谢

## [8.39.2] - 2026-09-25

### 变更

- 重写 github-contrib-graph 样式和 tooltip 使其适配网站

## [8.39.1] - 2026-09-25

### 变更

- 优化 tooltip 切换动画

## [8.39.0] - 2026-09-25

### 变更

- 重写关于页

## [8.38.2] - 2026-09-25

### 变更

- 移除页脚没什么作用的探索板块并替换为版权信息

## [8.38.1] - 2026-09-25

### 变更

- 简洁化隐私政策和404页

## [8.38.0] - 2026-09-25

### 新增

- image-viewer：新增 FLIP 打开/关闭动画并优化查看器性能

## [8.37.4] - 2026-09-24

### 变更

- mouse-effects：重构自定义光标以对齐 cursor-fx 3.0.0 并优化性能

## [8.37.3] - 2026-09-24

### 变更

- 更新 twikoo 版本（1.7.24 -> 2.0.9）并适配相应的类名变化
 - JS 大小减少约 20Kb
 - CSS 大小减少约 8Kb

## [8.37.2] - 2026-09-19

### 修复

- 计算最后更新时间未把代码更新计入

## [8.37.1] - 2026-09-19

### 新增

- 将网站页脚的流量计数显示从 [Vercount](https://www.vercount.one) 改为 [FakeICP](https://fakeicp.top)

### 变更

- 美化页脚布局

## [8.37.0] - 2026-09-19

### 变更

- 重构加载覆盖层，优化动画和布局

## [8.36.2] - 2026-09-18

### 变更

- 更新 twikoo 版本（1.7.22 -> 1.7.24）

### 修复

- 修复 theme-controller.ts 未导入 Utils 导致生产环境无法进入网站的 BUG

## [8.36.1] - 2026-09-12

### 变更

- 提升依赖版本
 - typescript 6.0.3 -> 7.0.2
 - vite 8.1.1 -> 8.3.0
 - vite.config.ts -> vite.config.mts

## [8.36.0] - 2026-09-12

### 变更

- 收拢初始化流程并统一工具函数与数据服务
 - 所有模块初始化统一由 AppInitializer 编排，移除各文件末尾的 DOMContentLoaded / ajax:navigation 自动初始化副作用
 - 导航后刷新集中到 AppInitializer.initNavigationHandlers()，各模块改用 onNavigation 订阅，不再裸用 addEventListener
 - 删除 page-utils.ts，工具函数收敛至 core.Utils，运行时行为迁至新建 page-runtime.ts
 - data-service 泛型化 + 类型化，新增 types/data.ts 领域类型
 - about 页改为 PageBase 子类；friends 页移除单例与工厂
 - settings / personal-card / button-manager / site-state / timeline 移除自动初始化与导航订阅

## [8.35.2] - 2026-09-12

### 变更

- builder：现代化构建引擎并修复并行与增量缺陷
 - engine: 引入 Kahn 拓扑排序分层执行，同批并行、跨批串行
 - engine: state 写入加锁，消除并行竞态；失败不再 break 让批内任务跑完
 - engine: 异常输出完整 traceback，新增 dry-run 预览执行计划
 - base: 新增 dependencies / timeout 属性，update_state 改为 build_state_entry
 - run: 修复 --no-parallel 导致 parallel 恒为 False 的 bug，暴露 --dry-run
 - aggregated: 声明依赖 friend_colors，保证复制时序
 - aggregated: npm 缺失或 Vite 失败时不再回退复制 .ts、不中断构建，仅报错
 - friend_colors: 移除重复的模块 docstring，简化颜色选择逻辑

## [8.35.1] - 2026-09-12

### 变更

- 消除全局依赖与循环依赖，统一类型与接口
 - 移除 `as any` / `declare const window: any`，为 Chart.js 与 `__currentPageManager` 补全类型化全局声明
 - `list-events` 与 `home-manager` 直接 `import { fetchAndReplaceContent }`，不再依赖 `window.fetchAndReplaceContent`
 - `PageManagerRegistry` 支持 `RegExp` 匹配页面路径，移除 `/articles/<slug>` 硬编码分支
 - 将 `initNavigation` / `initMobileMenuToggle` 迁入 `navbar-manager`，解除其与 `router` 的循环依赖
 - 统一主题存储键到 `CONFIG.STORAGE_KEYS.THEME_MODE`，消除散落硬编码
 - `TimelineManager` 暴露 `setRefreshCallback` setter，替代外部 `manager['refreshCallback']` bracket 访问

## [8.35.0] - 2026-09-12

### 变更

- core：统一工具函数与导航事件，消除重复实现
 - 在 Utils 中收敛 getTags、parseArticleDate、parseArticleTimestamp、isSameOrigin、renderTags 等公共方法
 - 新增顶层导出 escapeHtml、getTags、parseArticleDate、renderTags、isSameOrigin，方便按需引入
 - 删除 search-render、timeline、charts、loading-overlay-manager 等模块中的本地重复实现
 - 统一 isDev 判定，复用 core 导出的 IS_DEV
 - 新增 onNavigation / dispatchNavigation 集中管理 ajax:navigation 事件订阅，替代散落的独立监听
 - personal-card 移除模块内自动初始化，改由编排器或 onNavigation 统一调度
 - initUIEffects 复用 core.scheduleIdle，移除本地 idle 降级逻辑

## [8.34.0] - 2026-09-12

### 变更

- 初始化/清理/设置/主题/单例 五项统一重构
 - refactor(core): 拆分 AppInitializer.start() 为四阶段，抽出 scheduleIdle
 - refactor(pages): PageBase 统一 DisposableStack，迁移 6 个页面管理器
 - refactor(settings): 收敛 STORAGE_KEYS 与 isEnabled，删除重复实现
 - refactor(theme): 统一走 themeController.onChange，事件保留为兼容层
 - refactor(data): 移除 DataService.getInstance()，收敛到 dataService 单例
 - fix(router): 修复文章详情分支对 initArticlePage() Promise 的误用

## [8.33.1] - 2026-09-12

### 变更

- 更新 twikoo 版本（1.7.20 -> 1.7.22）

## [8.33.0] - 2026-09-12

### 变更

- stats：图表逻辑迁移至注册表
 - 新增 js/pages/stats/chart-registry.ts（类型 + 注册接口）
 - 新增 js/pages/stats/charts.ts（8 个图表注册与渲染纯函数）
 - 重写 js/pages/stats-manager.ts，移除 8 个 renderXxxChart 方法
 - 单图表渲染异常隔离，避免整页失败
- data：SW 与 DataService 缓存职责分离，移除 localStorage 层
 - BREAKING CHANGE:
  - DataService 不再写入 localStorage，
  - FetchOptions.useStorage 字段已移除。
 - sw.js：删除 stripCacheBusting，新增 forceRefresh 分支，缓存版本升至 v6
 - data-service.ts：仅保留内存缓存 + 并发去重，移除 ?t= 时间戳
 - search-render.ts：DataManager.useCache 语义对齐 forceRefresh
 - settings.ts：clearSWCacheAndReload 同步清空内存缓存
- search：移除 searchWorker，改为同步过滤排序
 - 删除 js/data/searchWorker.ts
 - search-render.ts：内联 filterAndSort / sortByField / parseDateString
 - 移除 Worker 通信开销与 5s 超时兜底
 - 保留 renderToken 竞态保护与分批渲染
 - 这显著增加了文章和作品列表的加载，也顺带修复了加载这些列表是的闪烁问题

## [8.32.0] - 2026-09-12

### 变更

- 抽取 theme-controller 与 modal-base，引入 DisposableStack 和 ScrollDispatcher
 - 新增 /js/core/theme-controller.ts：集中管理主题模式（auto/light/dark），迁移旧存储键，统一派发 themeChanged 事件，替换 app-initializer、theme.ts、settings.ts、404.ts 中的重复逻辑
 - 新增 /js/core/modal-base.ts：提供模态框通用生命周期（遮罩、Esc、点击遮罩关闭、入场/退场动画），detail-dialog 和 jump-dialog 基于它重构，消除重复的关闭与动画代码
 - 新增 /js/core/disposable-stack.ts：集中管理事件监听、定时器、Observer 的释放，避免手动维护 cleanupFns 数组
 - 新增 /js/core/scroll-dispatcher.ts：全局单例滚动事件分发，rAF 节流，多订阅者共享，替代 article.ts、button-manager.ts 中多处独立 scroll 监听
 - 改造 article.ts、button-manager.ts：使用 DisposableStack 清理资源，使用 ScrollDispatcher 监听滚动，删除冗余 handler 字段与手动清理逻辑
 - 改造 detail-dialog.ts、jump-dialog.ts：基于 modal-base 重构，保留原有交互细节（锚点动画、倒计时、点击跳转）
 - 改造 app-initializer.ts、theme.ts、settings.ts、404.ts：移除重复主题初始化，统一调用 themeController

## [8.31.0] - 2026-09-12

### 变更

- 统一工具函数、修复缺陷、移除冗余
 - 统一 escapeHtml 至 Utils.escapeHtml，删除 detail-dialog、image-viewer、jump-dialog、404、home-manager、search-render 等文件中的重复实现
 - 修复 initNavbar 返回类型，使 app-initializer 能正确调用 playEntranceAnimation，恢复导航栏入场动画
 - 在 CONFIG 中新增 BREAKPOINTS，统一移动端断点判断（navbar-manager、article、button-manager 等）
 - 修复 DataService.warmup 中 this 指向错误（误用 getInstance）
 - 简化 StorageController，移除 Cookie 同意相关逻辑；同步简化 clarity.ts 和 app-initializer.ts 中的同意处理
 - 删除未使用的私有方法（article.ts 的 escapeHtml）和冗余导入

## [8.30.3] - 2026-09-11

### 变更

- timeline：时间线改为按日期卡片分组展示
 - 将原“一条内容一张卡片”改为按 年/月/日 分组，同一天内容合并为一张日期卡片
 - 文章与作品在日期卡片内以子卡片形式展示
 - 版本改为在日期卡片底部以胶囊形式排列，按版本号倒序（新版本在前）
 - 点击版本胶囊可在日期卡片底部展开详情，同一卡片同时只显示一个版本详情
 - 同步调整 timeline.css 样式以适配新的卡片结构

## [8.30.2] - 2026-09-06

### 变更

- 在页脚新增由 custom-icon-badges.demolab.com 提供的 Badge 图片

## [8.30.1] - 2026-08-29

### 新增

- 优化友链颜色提取算法，避免极端颜色
 - 引入 HSV 色彩空间过滤机制，排除亮度 < 0.15 或 > 0.85、饱和度 < 0.20 的颜色
 - 在有效候选中按“频次 × 饱和度系数”评分，优先选择辨识度高且适中的颜色
 - 若无可接受颜色，依次尝试亮度适中的颜色、频次最高的颜色，最后返回 None 并由上层使用默认灰色 (200,200,200)
 - 解决了头像背景为白/黑时主色被误取为纯白/纯黑的问题，使友链卡片颜色更丰富且视觉友好

## [8.30.0] - 2026-08-29

### 新增

- 将很多直接调用 `localStorage` 的代码改为统一使用 `storageController`

### 修复

- 修复 `CookieConsentManager` 并未被实例化导致 `storageController` 一直处于禁用状态，导致所有 `setItem` 被忽略，`getItem` 返回 `null` 的 BUG
 - 此修复也连带将欢迎覆盖层的一系列关于存储的问题给修复了（包括一段时间内刷新网页会再次显示覆盖层的问题）

## [8.29.1] - 2026-08-29

### 变更

- 跳转欢迎覆盖层的更新日志显示，现在看起来更美观清楚了，排序改为又新到旧

### 修复

- 修复上个版本设置面板打开就刷新背景图，以及一些设置写入读写问题

## [8.29.0] - 2026-08-29

### 新增

- 添加更多设置功能并优化设置面板布局

## [8.28.1] - 2026-08-29

### 变更

- 在友链页完善我的网站信息，优化一些 tooltip 的显示

### 修复

- 修复友链复制信息中含多余空格的 BUG

## [8.28.0] - 2026-08-29

### 新增

- 使 APlayer 适配网站主题，支持拖拽、顺序折叠动画

## [8.27.3] - 2026-08-28

### 修复

- 彻底修复 tooltip 文本测量误差导致显示时可能出现一个字符被迫换行超出背景的情况

## [8.27.2] - 2026-08-28

### 修复

- 移除多余的 friends-manager 全局调用

## [8.27.1] - 2026-08-27

### 变更

- 优化友链 `本站用到的工具和服务` 板块

### 修复

- ~~修复 tooltip 文本测量误差导致显示时可能出现一个字符被迫换行超出背景的情况~~（实际上这次修复几乎没有解决此问题——来自2026年8月28日）

## [8.27.0] - 2026-08-27

### 新增

- 新增 tooltip

### 变更

- 使用 tooltip 精简设置面板文字

## [8.26.10] - 2026-08-27

### 变更

- 删除友链页冗余部分，优化文本

## [8.26.9] - 2026-08-27

### 变更

- 微调深浅模式切换按钮中太阳的图标样式和切换动画

## [8.26.8] - 2026-08-27

### 变更

- 同步 Github 提示框样式

## [8.26.7] - 2026-08-26

### 变更

- 同步文章和作品页的筛选便签样式同步首页标签云，并支持根据数量多少调整大小

## [8.26.6] - 2026-08-26

### 变更

- 优化关于页代码，便于维护

## [8.26.5] - 2026-08-25

### 变更

- 更新 twikoo 版本（1.7.19 -> 1.7.20）

## [8.26.4] - 2026-08-14

### 变更

- 重构twikoo样式，基于新的 1.7.19 原版改版替换原 1.7.15 原版改版
 - 为新增的搜索功能添加样式
 - 增加与网站样式的统一性
 - 修复标签输入弹窗显示异常的问题
 - 修复暗色模式下一些文本显示异常的问题

## [8.26.3] - 2026-08-14

### 变更

- 更新 twikoo 版本（1.7.15 -> 1.7.19）

## [8.26.2] - 2026-08-13

### 变更

- 友链页的互换友链部分使用更合理的布局，调整一些文本样式

## [8.26.1] - 2026-08-13

### 变更

- 重构统计页样式，优化一些条目的显示

## [8.26.0] - 2026-08-12

### 变更

- 移除 `stats-init.ts` 包装层，让 `Router` 直接实例化 `FullStatsManager`
- 一些文本修改

### 修复

- 修复统计页面缺失`<div id="router-view">`导致无刷新导航失效的问题

## [8.25.4] - 2026-08-12

### 新增

- 时间线页面新增筛选文章、作品、更新日志选择功能和搜索功能
- 为回到顶部按钮增加进度条

### 修复

- 修复时间线页面同时间多版本排序错误问题

## [8.25.3] - 2026-08-12

### 修复

- 修复特定窗口宽度下时间线更新日志详情内容布局过窄

## [8.25.2] - 2026-08-12

### 变更

- 简化时间线页面中网站更新日志的显示

## [8.25.1] - 2026-08-12

### 修复

- 补全构建 `works.json`、`friends.json`、`friend_colors.json`

## [8.25.0] - 2026-08-12

### 新增

- 合并归档与更新日志为统一时间线页面
 - 新增 `/timeline.html` 及其 TS/CSS 实现
 - 时间线整合文章、作品和版本更新，按年月分组展示
 - 版本条目支持点击展开/收起变更详情（Markdown 渲染）
 - 移除旧归档页 `/archive.html` 及对应 CSS 和 TS
 - 移除旧更新日志页 `/changelog.html` 及对应 CSS 和 TS

这次更新统一了内容回溯入口，提升浏览连续性并减少了维护成本

## [8.24.0] - 2026-08-12

### 新增

- ui：统一弹窗组件为通用 `detail-dialog`
 - 新增 `/js/ui/detail-dialog.ts` 通用弹窗，支持标题、HTML 内容和来源标注
 - 作品详情弹窗（`list-events.js`）改用 `detail-dialog`，移除原有 `showWorkDetails`
 - 路由错误弹窗（`router.ts`）改用 `detail-dialog`，移除 `showErrorOverlay`
 - 设置面板（`settings.ts`）改用 `detail-dialog`，移除自定义 `overlay/panel` 创建逻辑
 - 删除 `components.css` 中废弃的 `.settings-panel-overlay`、`.settings-panel`、`.settings-close-btn` 及相关媒体查询样式

## [8.23.2] - 2026-08-07

### 变更

- 优化关于页文本

## [8.23.1] - 2026-08-03

### 变更

- 重构 加载覆盖层 的样式，减少冗余代码

## [8.23.0] - 2026-08-03

### 变更

- 重构 `router.ts` 修复一些BUG，优化逻辑，减少极端情况下报错的概率

### 已知问题

- 无刷新导航对浏览器的前进/后退无法相应（技术问题，之后修复）

## [8.22.3] - 2026-08-03

### 变更

- 重构设置面板，移除多余的文本和元素，调整了布局

## [8.22.2] - 2026-08-03

### 新增

- 为文章查看页添加 markdown admonition 扩展语法解析

### 变更

- 清理构建系统多余代码

## [8.22.1] - 2026-07-31

### 变更

- 清理代码，减少外部网络依赖

## [8.22.0] - 2026-07-28

### 新增

- 在 `mouse-effects.ts` 中添加基于[ Cursor Fx 脚本](https://github.com/Xinyang-Gao/cursor-fx-userscript) `WEB API` 的判断：若用户已加载此脚本，则不再初始化网站自身的鼠标特效，以避免视觉冲突和性能影响

### 变更

- 大幅重构 `mouse-effects.ts` 的 `MouseEffectManager` 类，以优化性能和可维护性

## [8.21.3] - 2026-07-28

### 变更

- 优化文章查看页样式，统一风格，减少代码量（减少约 200 行）

## [8.21.2] - 2026-07-28

### 变更

- 优化图片查看器代码，增加可维护性

## [8.21.1] - 2026-07-28

### 变更

- 更新隐私政策

## [8.21.0] - 2026-07-28

### 变更

- 重构twikoo样式，基于新的 1.7.15 原版改版替换原 1.7.7 原版改版
 - 增加与网站样式的统一性
 - 大幅减少代码量（减少约 1700 行）

## [8.20.0] - 2026-07-28

### 变更

- 重构图片查看器，重构更现代简约的页面并优化代码质量，有一定性能提升

## [8.19.0] - 2026-07-28

### 变更

- 重构网站首页

## [8.18.0] - 2026-07-28

### 变更

- 重构网站基础样式，减少硬编码，统一风格，向简约方向重构，减少代码量(约400行CSS)

## [8.17.0] - 2026-07-28

### 变更

- 重构导航栏

## [8.16.1] - 2026-07-27

### 变更

- 更新 twikoo 版本（1.7.14 -> 1.7.15）

## [8.16.0] - 2026-07-27

### 变更

- 重构鼠标特效，复用[ cursor-fx-userscript 的部分代码](https://github.com/Xinyang-Gao/cursor-fx-userscript)

## [8.15.1] - 2026-07-27

### 变更

- 将[Github贡献图JS](https://unpkg.com/github-contrib-graph@latest/dist/browser.global.js)替换为本地文件，以减少外部网络不稳定造成的加载缓慢
- 重构（简约方向）页脚的样式，减少冗余CSS

## [8.15.0] - 2026-07-27

### 变更

- 重构（简约方向）关于页的样式，减少冗余CSS，修复深色模式下关于页评论区透明的问题

## [8.14.2] - 2026-07-23

### 变更

- 将个人信息卡片和外链跳转的头像图片样式同步为友链卡片头像的样式

## [8.14.1] - 2026-07-22

### 变更

- 规范更新日志格式，并使一些版本、图片和缩进能被正确解析

## [8.14.0] - 2026-07-22

### 新增

- 统一数据服务并全面重构缓存与请求层
 - 新增 `DataService` 单例，统一管理 `articles`/`works`/`statistics`/`codeAnalysis`/`friends`/`version` 等所有数据请求
 - 实现内存 + `localStorage` 双层缓存，统一 5 分钟 TTL 过期策略，支持强制刷新
 - 添加并发请求去重（pending Map），避免同一数据在短时间内重复发起网络请求
 - 迁移 `loading-overlay-manager`、`stats-manager`、`home-manager`、`site-state`、`app-initializer` 等模块，全部改用 `DataService` 获取数据
 - 移除各模块中散落的独立 fetch 逻辑，精简冗余代码
 - 优化 `sw.js`：剥离 `?t=` 缓存破坏参数进行缓存匹配，启用 `Navigation Preload`，静态资源策略升级为 `Cache First`，提升离线性能与加载速度
 - 统一页脚统计信息、预加载等数据获取入口，提升可维护性

## [8.13.1] - 2026-07-21

### 变更

- 将从 `https://vercount.one/js` 获取计数 JS 改为获取 `/js/vendor/vercount.min.js` 用以规避一些加载延迟

## [8.13.0] - 2026-07-21

### 变更

- entry：拆分 `main.ts` 启动流程，引入加载覆盖层与初始化编排器
 - 将加载覆盖层（版本检测/更新提示）抽离为 LoadingOverlayManager
  - 负责数据预加载、日志流式渲染、版本比对与更新界面交互
  - 返回 Promise，在用户点击后 resolve，不阻塞主流程
 - 新增 `AppInitializer` 启动编排器
  - 按职责拆分初始化步骤，使用 `requestIdleCallback` 调度非关键任务
  - 统一管理主题同步、导航栏加载、页面特性、音乐播放器等模块
  - 保留原有执行顺序与依赖关系，确保行为一致
 - 优化 `friends-manager.ts` 为单例模式
  - 添加 `_initialized` 锁，防止重复绑定事件
  - 导出 `friendLinkManager` 实例供全局复用
  - 路由注册时复用单例，避免重复创建
 - 调整 `router.ts` 友链路由注册，使用单例并支持重新初始化
 - 精简 `main.ts`，仅保留核心启动调用与全局 API 暴露

## [8.12.3] - 2026-07-21

### 变更

- article：将文章阅读页的 TOC 目录改为在构建时生成

## [8.12.2] - 2026-07-21

### 变更

- settings：将设置面板内联样式迁移至 CSS，优化布局结构

## [8.12.1] - 2026-07-21

### 新增

- 将 works 迁出主仓库将其链接为子模块

## [8.12.0] - 2026-07-18

### 变更

- router：重构无刷新导航，解决内存泄漏、资源累积
 - 原 `router.ts` 存在以下严重问题：
  1. 资源管理缺陷：每次导航后内联样式和脚本不断累积，无任何清理机制，导致样式冲突与内存泄漏
  2. 页面管理器生命周期不完善：部分 destroy 为空实现，事件监听和 DOM 引用未释放
  3. 导航拦截条件过严：仅拦截 `.html` / 带 `?` / 以 `/` 结尾的链接，导致 `/about` 等路径触发整页刷新
  4. 缓存与并发控制缺陷：缓存未关联资源依赖，切换页面时旧资源加载仍在继续
  5. SPA 功能遗漏：懒加载图片和滚动揭示在导航后未刷新
  6. 错误处理薄弱：网络请求失败后页面状态混乱，无重试或降级
  7. 性能问题：非关键操作阻塞主线程，低端设备适配不足
  8. 历史记录与滚动恢复存在 Edge Case：快速前进/后退重复请求，哈希变化处理不当
  9. 代码维护性差：`pageManagerMap` 硬编码，全局变量过多

## [8.12.0-DEV.2] - 2026-07-18

### 变更

- 修复 TypeScript 构建错误：将 `state.currentResources` 的类型注解从内联写法改为显式 `RouterState` 接口定义
- 资源卸载时同步清理 `loadedStyles` / `loadedScripts` 集合，确保资源可被重新加载
- 增强错误提示：重试次数用尽后显示“刷新页面”按钮，避免用户陷入死循环
- 优化文章详情页匹配正则，排除 `/articles/` 和 `/articles` 列表页的误判
- 移除未使用的导入（`CONFIG` / `storageController` / `Utils`），统一类型声明
- 完善哈希导航边界条件，确保带 `#` 的链接也能正确处理

## [8.12.0-DEV.1] - 2026-07-18

### 变更

- 资源生命周期管理：为每个样式/脚本注入唯一 ID，导航时主动卸载上一页资源
- 引入 `PageManagerRegistry` 替代硬编码映射，支持动态注册页面管理器
- 放宽导航拦截：拦截所有同源且非特殊协议（`mailto`/`tel`/`javascript`/`data`）的链接
- 智能哈希处理：在点击和 `popstate` 中区分仅哈希变化，只滚动不请求内容
- 错误恢复机制：请求失败时显示覆盖层，提供重试能力；重试耗尽后回退到传统刷新
- 加载取消：使用 `AbortController` 统一取消网络请求和资源加载
- 懒加载刷新：导航完成后自动调用 `LazyImageLoader.refresh()`
- 性能优化：将非关键资源加载拆分为低优先级任务，利用 `requestIdleCallback`
- 文章页判断优化：通过路径模式 `/^/articles/[^/]+$/` 匹配，不依赖 DOM 存在性

## [8.11.2] - 2026-07-15

### 变更

- search-render：现代化优化
 - 提取公共工具函数消除重复代码
 - 精简 `DataManager` 和 `UIRenderer`
 - 重构 `SearchController`，统一事件管理
 - 使用 `requestAnimationFrame` 优化渲染

## [8.11.1] - 2026-07-15

### 变更

- stats-manager：重构统计页面管理器，提升健壮性与可维护性
 - 添加安全的 DOM 辅助方法 (`setText`/`setHtml`)，避免因元素缺失导致运行时错误
 - 精简重复代码，使用数组方法替代循环
 - 统一图表渲染配置化，通过循环调用 `renderFn` 减少冗余
 - 优化数据访问，使用可选链和空值合并运算符简化条件判断
 - 保留所有原有功能与外部 API，确保向后兼容
 - 修复多处直接 DOM 赋值可能引发的空指针异常

## [8.11.0] - 2026-07-15

### 变更

- router：精简并优化无刷新导航路由系统
 - 合并缓存管理逻辑，使用单一 Map 存储，简化存取操作
 - 使用 `pageManagerMap` 对象替代冗长的 `switch-case`，动态导入统一处理
 - 简化资源加载流程，合并样式/脚本加载的重复代码
 - 移除未使用的函数（`bindNavLinks`、`refreshNavbarAfterNavigation` 等）
 - 优化内容替换过渡动画的事件绑定，使用 Promise 更清晰
 - 统一状态管理到单一 stat e对象，减少全局变量
 - 性能提升：减少不必要的 DOM 查询和事件监听，按需加载资源
- 维护作品

## [8.10.0] - 2026-07-15

## [8.10.0-dev2] - 2026-07-15

### 变更

- ui：优化鼠标特效性能
 - 实现按需渲染循环：仅在有粒子或连线活跃时运行，空闲时自动停止，大幅降低 CPU 占用
 - 添加页面可见性监听，标签页隐藏时暂停所有渲染，节省系统资源
 - `CustomCursor` 增加空闲停止机制：鼠标静止 80ms 后自动取消动画帧，移动时即时恢复
 - 增加帧率自适应，低帧率时动态降低粒子数量上限，保持流畅体验

## [8.10.0-dev1] - 2026-07-15

### 变更

- ui-effects.ts：拆分自定义鼠标相关代码到 `/js/ui/mouse-effects.ts`

### 修复

- router.ts：删除无效的加载自己的动态导入

## [8.9.0] - 2026-07-14

### 新增

- settings：将设置从独立页面改为弹窗，可通过右下角按钮进入
 - 新增及时读取功能，修改的设置会立刻应用，不再需要刷新页面
 - 删除 `settings.html` 模板

## [8.8.5] - 2026-07-14

### 变更

- 404：用 TypeScript 重构 `404.js` 为 `404.ts`，同时重构404页面，使其更符合网站整体样式

## [8.8.4] - 2026-07-14

### 变更

- 用 TypeScript 重构 `changelog.js` 为 `changelog.ts`

## [8.8.3] - 2026-07-12

### 变更

- 从 `friends.css` 中提取跳转覆盖层的样式到 `components.css`

## [8.8.2] - 2026-07-12

### 变更

- 清理冗余的外链管理器样式 `.external-modal`（减少 `components.css` 构建后体积约 3KB）

## [8.8.1] - 2026-07-12

### 变更

- 合并 `friend-link-manager.ts` 到 `friends-manager.ts` ，便于维护并避免污染

## [8.8.0] - 2026-07-12

### 新增

- 提取 友链跳转覆盖层 到 `jump-dialog.ts` 方便之后复用
- 将原先的外链跳转弹窗改为复用 `jump-dialog.ts`
 - 信任的网站不再弹窗直接跳转
 - 陌生的网站将等待 6 秒后自动跳转

## [8.7.5] - 2026-07-12

### 变更

- image-viewer：用 TypeScript 重构 `image-viewer.ts`
- V8.7.4 更改 `aggregated.py` 中的 Vite 调用

### 修复

- image-viewer：可能打开多个图片查看实例

## [8.7.4] - 2026-07-12

### 变更

- 用 TypeScript 重构 `settings.js` 为 `settings.ts`
- 优化 `core.ts` 代码
- 更改 `aggregated.py` 中的 Vite 调用

## [8.7.3] - 2026-07-11

### 变更

- 清理多余文件和文件夹 `/src/assets/works/`

## [8.7.2] - 2026-07-11

### 变更

- 清除网站残余 busuanzi 代码

## [8.7.1] - 2026-07-11

### 新增

- 将网站流量计数从 [不蒜子](https://www.busuanzi.cc) 改为 [Vercount](https://www.vercount.one)
- builder：`/src/copy/` 下的所有内容（包括子文件夹）复制到 `/dist/` 根目录

## [8.7.0] - 2026-07-11

### 新增

- builder：使用 GitHub Actions 工作流自动构建网站

## [8.6.4] - 2026-07-11

### 新增

- builder：将 友链卡片颜色提取 加入构建流

## [8.6.3] - 2026-07-11

### 新增

- builder：重新添加对生成 `code_analysis.json` 文件的支持

## [8.6.2] - 2026-07-11

### 新增

- builder：尊重 Markdown 源文件中的手动更新日期

## [8.6.1] - 2026-07-11

### 新增

- builder：从 `src/` 复制站点根文件到 `dist/`
 - 新增复制 `BingSiteAuth.xml`, `favicon.ico`, `robots.txt` 从 `src/` 到 `dist/`

### 变更

- builder：移除 GUI 并优化增量构建策略
 - 移除 `run.py` 中的 Tkinter GUI 模块，仅保留命令行入口
 - 增强 base.py 中 `is_up_to_date`方法：检查所有输出文件是否存在，若缺失则判定为过时
 - 补全 aggregated 生成器的 outputs 列表，添加 `friends/index.html`
 - 当输出文件被误删或损坏时，将自动触发重新构建，提高构建可靠性

## [8.6.0] - 2026-07-10

### 新增

- 使用 [APlayer(改版)](https://github.com/DIYgod/APlayer/pull/802) 替换 [NeteaseMiniPlayer-v2(改版)](https://github.com/numakkiyu/NeteaseMiniPlayer/pull/15)
 - *因为 NeteaseMiniPlayer-v2 已停止维护，NeteaseMiniPlayer-V3 的 api 尚不稳定且更换需要重构重网站的全局音乐加载模块；综合评估下来使用了 APlayer 的改版*

### 变更

- 修复更新日志中重复的版本号
- 更新文档

## [8.5.4] - 2026-07-10

### 变更

- 删除 `/scr/` 中未使用的 `articles.html` `works.html` `nojs.html` 模板

## [8.5.3] - 2026-07-10

### 变更

- 删除 `/scr/` 中未使用的 `friends.html` 模板

## [8.5.2] - 2026-07-09

### 变更

- footer：优化页脚样式
 - 紧凑显示社交胶囊
 - 移除原有的 `stat-chip` 和 `busuanzi-chip`，将 `运行时长` 和 `总访问/访客` 整合进 `stats-grid`
 - 响应式优化
 - 改善一些小细节

## [8.5.1] - 2026-07-09

### 变更

- personal-card：重构个人信息卡片样式
 - 去除大量渐变色，使其更简洁
 - 去除多余元素
 - 响应式优化
 - 改善一些小细节

## [8.5.0] - 2026-07-09

### 变更

- style：全面重构响应式系统
 - 优化基础排版、间距和字体大小，适配全设备
 - 重写布局组件（网格、双栏、卡片等）响应
 - 重构 UI 组件（标签、搜索、模态框、浮动按钮等）移动适配
 - 导航栏样式重写
 - 修复移动端友链页超出显示范围的 BUG

## [8.4.6] - 2026-07-07

### 变更

- 更新 twikoo 版本（1.7.13 -> 1.7.14）

## [8.4.5] - 2026-07-07

### 变更

- stats-manager：用 TypeScript 重构 `stats-manager.js` 为 `stats-manager.ts`

## [8.4.4] - 2026-07-07

### 新增

- core：使用 TypeScript 重构并添加数据压缩支持

## [8.4.3] - 2026-07-06

### 修复

- 修复 `V8.0.0` 重构遗留的问题
 - 现在可以正常构建出 `changelog` 和 `privacy` 页面

## [8.4.2] - 2026-07-06

### 变更

- archive：用 TypeScript 重构 `archive.js` 为 `archive.ts`

## [8.4.1] - 2026-07-06

### 变更

- article：现代化优化文章详情页

### 修复

- router：通过 `#articleBody` 辨别是否为文章详情页，防止无刷新导航进入导致一系列初始化问题

## [8.4.0] - 2026-07-06

### 变更

- router：现代化优化导航路由与导航栏管理，消除重复绑定并完善入场动画，不再每次切换页面重复初始化页脚
 - 影响范围：导航栏初始化、页面切换、移动端菜单关闭，性能略有提升
- navbar-manager：用 TypeScript 重构 `navbar-manager.js` 为 `navbar-manager.ts`

## [8.3.3] - 2026-07-06

### 变更

- twikoo：同步评论区引用样式与主站一致

## [8.3.2] - 2026-07-06

### 变更

- aggregated.py：删除复制 JS 的代码，构建 JS 全部交由 Vite 处理

## [8.3.1] - 2026-07-05

### 变更

- friends-manager：用 TypeScript 重构 `friends-manager.js` 为 `friends-manager.ts`

## [8.3.0] - 2026-07-05

### 新增

- build：重构友链与增量构建，支持头像主题色自动生成
 - 修复 load_friends 数据源路径，从源 JSON 而非构建输出读取
 - 增量构建加入前端资源哈希，仅在前端变更时执行 Vite 与 CSS 压缩
 - 友链页面改为全量数据驱动生成，不再依赖静态模板
 - 重新新增 generate_friend_colors.py 工具，自动提取友链头像主色生成配色 JSON

## [8.2.9] - 2026-07-04

### 修复

- theme：修复主题切换闪烁并优化过渡动画

## [8.2.8] - 2026-07-04

### 变更

- page-utils.js：删除已不被使用的 `isArticleDetailOr404Page` 函数

## [8.2.7] - 2026-07-04

### 变更

- search：优化搜索性能、修复重复初始化及 Worker 超时
 - 重构 `SearchController` 初始化逻辑
  - 添加 `_initialized` 和 `_tagsInitialized` 标志，防止重复初始化
  - `initSearchPage` 复用已有控制器，避免重复创建标签云
  - `destroy` 方法完善资源清理，重置所有状态标志
 - 列表渲染性能优化
  - 采用 `requestAnimationFrame` 分片渲染（每批 20 项）
  - 引入 `renderCancelToken` 取消过期渲染任务
 - Worker 通信可靠性增强
  - 为每次请求分配唯一 `requestId`，支持超时控制（5 秒）
  - 超时后自动终止 Worker 并 reject，防止 `Promise` 永久挂起
  - 通过 `requestId` 忽略过期响应，避免数据覆盖
- searchWorker：用 TypeScript 重构 `searchWorker.js` 为 `searchWorker.ts`

## [8.2.6] - 2026-07-04

### 变更

- ui-effects：增强鼠标特效性能与自适应降级能力
 - 空渲染跳过、粒子分批生成、帧率自适应、ResizeObserver 支持等多项优化
 - 降低 CPU 占用，提升低端设备流畅度
- ui-effects：用 TypeScript 重构 `ui-effects.js` 为 `ui-effects.ts`

## [8.2.5] - 2026-07-04

### 变更

- 优化欢迎覆盖层日志样式，给日志项添加颜色区分，并增加了一些真实日志

## [8.2.4] - 2026-07-04

### 修复

- player：将音乐播放器核心脚本作为 ES 模块加载

## [8.2.3] - 2026-07-03

### 变更

- 优化构建系统，减少 JS 体积约 25%~30%

## [8.2.2] - 2026-07-03

### 变更

- router, article：用 TypeScript 重构 `router.js` 、 `article.js` 为 `router.ts` 、 `article.ts`

### 修复

- search, router, article：修复无刷新导航后搜索功能失效及内存泄漏问题
 - 搜索控制器(SearchController)不再共享模块级 Worker 单例，每个实例独立管理 Worker 生命周期，销毁时正确终止并置空，避免已终止 Worker 被复用
 - 增加初始化重试机制，若搜索 DOM 元素未就绪，延迟重试最多 3 次，防止页面切换过快导致静默失败
 - 文章详情页滚动位置恢复逻辑优化：优先处理 URL 锚点 hash，避免保存的滚动位置覆盖锚点跳转
 - 路由切换时完善页面管理器销毁异常捕获，确保所有副作用（监听器、定时器、Observer、Worker）被清理
 - 统一各页面管理器 `destroy` 接口，防止内存泄漏累积

## [8.2.1] - 2026-07-01

### 修复

- 作品未被构建
- 作品列表地址错误

## [8.2.0] - 2026-07-01

### 新增

- 使用 Python 在构建时压缩 CSS

## [8.1.0] - 2026-07-01

### 新增

- 集成 TypeScript 与 Vite 构建系统
 - 将 src/js 下的所有模块迁移至 TypeScript，保留 vendor/ 及独立脚本为 .js
 - 新增 `vite.config.ts`，配置路径别名与构建选项，使用 `preserveModules` 保持目录结构
 - 修改 `aggregated.py` 的 `_copy_static_assets` 方法：
  - 在构建过程中调用 npm run build 编译 TypeScript
  - 遍历复制 `src/js` 下未被 Vite 处理的 .js 文件（如 vendor、standalone、sw.js、searchWorker.js 等）
  - 避免覆盖 Vite 生成的编译产物
 - 修复 TypeScript 编译错误：
  - `stats-manager.ts` 中重复导出 `initFullStats`
  - 调整 vite 入口键名，使 `main.js` 输出至 `dist/js/entry/main.js`
 - 在 `main.ts` 中显式调用 `renderPersonalCard`，确保该模块不被 tree-shaking 移除

使前端开发更现代，也保持了 Python 构建流程的统一性

## [8.0.1] - 2026-06-30

### 变更

- 移除构建一些目录
 - `/dist/assets/source/`
 - `/dist/assets/avatars/`
 - `/dist/assets/网站更新日志.md`

### 修复

- `aggregated.py` 可能运行失败

## [8.0.0] - 2026-06-30

### 变更

- 重构网站结构
 - 详见 GIT 提交记录：`d2f8ded782c2dd196e7c54bb1f483b21b02eee8d`和`59966e81828fe19db1989ef3b30eb908319f20f4`

## [7.22.2] - 2026-06-28

### 修复

- sw：优化缓存策略并修复留言板评论加载问题

## [7.22.1] - 2026-06-28

### 修复

- v7.13.0 重构导致的文章、作品列表搜索过滤失效

## [7.22.0] - 2026-06-28

### 变更

- build：重构构建系统，采用统一引擎与增量构建
 - 合并重复 I/O：所有输入数据（文章、作品、友链、版本）一次性加载到 `BuildContext`，避免各脚本反复读取 JSON
 - 消除子进程调用：废弃 11 个独立脚本，将生成逻辑整合为单一聚合生成器 (`AggregatedGenerator.py`)，在进程内顺序/并行执行
 - 实现完整增量构建：基于输入数据组合哈希，仅当内容变化时才重新生成输出，.`build_state.json` 记录状态
 - 自动同步版本日志：`load_version()` 会检测 `/assets/网站更新日志.md` 的哈希变化，自动重新生成 `version.json`

 - 新增：
   - build_context.py    - 数据结构定义
   - input_loader.py     - 统一加载器（文章/作品/友链/版本）
   - generators/base.py  - 生成器抽象基类
   - generators/aggregated.py - 聚合生成器（统计/RSS/站点地图/列表页/无JS索引）
   - engine.py      - 构建调度引擎（依赖解析、并行执行、增量判断）
 - 修改：
   - common.py      - 增加 compute_file_hash、compute_object_hash
   - run.py    - 改为使用新引擎，保留 CLI/GUI
 - 删除：
   - AggregateGenerator.py, ArticleManager.py, CodeAnalyzer.py,
     FriendLinkGenerator.py, GenerateNoJsIndex.py, RssGenerator.py,
     SitemapGenerator.py, StaticListGenerator.py, Statistic.py,
     VersionManager.py, WorkManager.py
 - 性能提升：
   - 全量构建时间从 ~5-10s 降至 ~1-4s
   - 增量构建可缩短到小于 0.5s
   - 显著减少磁盘 I/O 和进程启动开销

### 修复

- 修复了一个小 BUG

## [7.21.3] - 2026-06-25

### 新增

- 友链卡片每次进入随机显示，每隔 10 秒轮换一次

## [7.21.2] - 2026-06-25

### 变更

- 关于页无数无刷新导航适配（`/js/standalone/about.js` -> `/js/pages/about.js`）

## [7.21.1] - 2026-06-25

### 新增

- 在关于页新增 Github 贡献墙

### 变更

- 给关于页的评论区添加卡片包裹，避免透明导致看不清字

## [7.21.0] - 2026-06-25

### 变更

- about：重构关于页面（Merge pull request #10 from Xinyang-Gao/about）

## [7.20.2] - 2026-06-25

### 变更

- 删除友链、文章页的 [Twikoo CDN 调用](https://cdn.jsdelivr.net/npm/twikoo@1.7.13/dist/twikoo.min.js) 和留言板的 Twikoo 初始化，统一由 `twikoo-manager.js` 管理

## [7.20.1] - 2026-06-24

### 新增

- 若用户未主动设置主题，则自动根据时间切换明暗主题

### 变更

- 更新站内更新日志链接指向

## [7.20.0] - 2026-06-24

### 新增

- 迁移 `v7.19.13` 移除的更新日志到[新页面](/changelog/)并添加搜索和专属样式

## [7.19.15] - 2026-06-24

### 新增

- 添加在欢迎覆盖层上显示更新日志

## [7.19.14] - 2026-06-24

### 修复

- 更新日志生成脚本现在根据版本号排序，而不是日期

## [7.19.13] - 2026-06-24

### 变更

- 将 网站更新日志 从文章中删除，使用 json 存储并规范内部版本编号生成（根据版本号生成）

## [7.19.12] - 2026-06-24

### 变更

- 添加导航栏展开动画

## [7.19.11] - 2026-06-22

### 变更

- 优化欢迎覆盖层代码，减少其不必要的延迟

## [7.19.10] - 2026-06-22

### 修复

- 通过给播放器添加全局唯一标识，避免出现无刷新导航后重复初始化生成新播放器的问题

## [7.19.9] - 2026-06-22

### 变更

- 减少鼠标特效多余的二次平滑，并减少鼠标特效移动平滑

## [7.19.8] - 2026-06-22

### 新增

- 在友链页添加“站点工具/服务”分类

### 变更

- 更新 twikoo 版本（1.7.12 -> 1.7.13）

## [7.19.7] - 2026-06-21

### 新增

- 添加 [开往](https://www.travellings.cn/go.html)

## [7.19.6] - 2026-06-21

### 变更

- 默认主题为暗色，初次进入不再根据时间调整主题

## [7.19.5] - 2026-06-21

### 变更

- 优化友链后端缓存逻辑

## [7.19.4] - 2026-06-21

### 新增

- 新增友链卡片头像主题色渲染

## [7.19.3] - 2026-06-21

### 变更

- 优化友链样式

## [7.19.2] - 2026-06-20

### 修复

- 修复文章与作品 JSON 生成中的日期与标签解析问题

## [7.19.1] - 2026-06-20

### 新增

- 整合 `申请 cookie` 到欢迎页

## [7.19.0] - 2026-06-19

### 变更

- 重构欢迎模态框，并使其在 JS 初始化未完成时显示
    旧欢迎页样式：
    ![旧欢迎页样式](https://s41.ax1x.com/2026/06/19/pm8vQRx.png)
    新欢迎页样式：
    ![新欢迎页样式](https://s41.ax1x.com/2026/06/19/pm8vlz6.png)

## [7.18.7] - 2026-06-19

### 新增

- 文章查看页使用全局图片查看器，并移除单独实现

## [7.18.6] - 2026-06-19

### 变更

- 优化页面切换动画
 - 更平滑的页面切换动画：旧内容缩小淡出，新内容放大淡入
 - 个人卡片平滑显示：加载后自动渐入上浮

## [7.18.5] - 2026-06-19

### 变更

- 移除 `v7.18.3` 版本后不需要的代码

## [7.18.4] - 2026-06-19

### 变更

- 添加更多鼠标特效
 - 点击有空心圆圈点击特效（非线性扩散，不是很起眼）
 - 长按松开后根据长按的时间，显示更多的圆圈数量和更远的扩散（非线性）
 - 长按滑动，从起始点到鼠标连线，直到鼠标松开，从起始点到终点鼠标连线非线性消失

## [7.18.3] - 2026-06-19

### 变更

- 提取按钮（返回顶部，展开目录）管理 `button-manager.js`
- 优化按钮（返回顶部，展开目录）样式

## [7.18.2] - 2026-06-19

### 修复

- image-viewer：修复图片查看器不显示
- 404.html：修复 404 错误页样式错误

## [7.18.1] - 2026-06-18

### 变更

- 优化归档页样式

## [7.18.0] - 2026-06-18

### 变更

- 重构 CSS 文件结构
    ```
    css/
    ├── core/                # 核心基础层（原 style.css）
    │   ├── variables.css    # 所有 CSS 变量（浅色/暗色主题）
    │   ├── base.css         # 重置、基础排版、滚动条、链接、焦点
    │   ├── layout.css       # 容器、网格、卡片、双栏、Hero 等布局组件
    │   └── components.css   # 标签、按钮、搜索、模态框、返回顶部、工具类等
    │
    ├── components/          # 独立组件
    │   ├── navbar.css       # 导航栏
    │   ├── footer.css       # 页脚
    │   ├── image-viewer.css # 图片查看器
    │   ├── player.css       # 网易云迷你播放器（原 netease-mini-player-v2.css）
    │   └── comments.css     # Twikoo 评论样式（原 twikoo.css）
    │
    └── pages/          # 页面专用样式
        ├── 404.css     # 404 错误页
        ├── article.css # 文章页（双栏 + TOC）
        ├── friends.css # 友链页
        ├── home.css    # 首页（原 home-page.css）
        ├── privacy.css # 隐私政策页
        └── stats.css   # 统计页
    ```
- 修改 `robots.txt`

## [7.17.0] - 2026-06-18

### 新增

- 无刷新导航支持浏览器回退前进

### 变更

- 平滑无刷新导航

## [7.16.5] - 2026-06-18

### 变更

- 优化外部资源加载，提取通用 Twikoo 管理器，显著降低 LCP
 - 音乐播放器改为动态导入，在空闲时加载，避免阻塞主线程
 - 移除 `main.js` 中静态导入音乐播放器，首屏加载更流畅
 - 新增 `/js/core/twikoo-manager.js` 统一管理 Twikoo 库加载与初始化
 - 重构 `article.js` 和 `friends-manager.js`，使用通用 Twikoo 管理器，消除重复代码
 - 各页面管理器销毁时正确清理 Twikoo 容器，避免内存泄漏

## [7.16.4] - 2026-06-17

### 修复

- site-state.js：`/js/data/sw.js` 路径拼写错误修复

## [7.16.3] - 2026-06-17

### 变更

- friends.html：新增响应式

## [7.16.2] - 2026-06-16

### 变更

- 更新 twikoo 版本（1.7.11 -> 1.7.12）

## [7.16.1] - 2026-06-14

### 变更

- 优化归档页样式
- 更新 `avatar.webp` 和 `favicon.ico`

## [7.16.0.1] - 2026-06-13

### 修复

- article.js：解决 `this.getAttribute is not a function` 错误

## [7.16.0] - 2026-06-13

### 变更

- router.js：彻底重构无刷新导航，统一容器并修复卡片闪烁
    1. 无刷新导航核心重构
  - router.js 使用 `#router-view` 作为唯一动态内容容器
  - 替换策略改为整体替换 DOM 元素，避免侧边栏残留
  - 新增 `ScriptExecutor` 管理脚本加载，防止重复执行
    2. 生成脚本适配和静态页面适配新容器
  - ArticleManager.py / StaticListGenerator.py / FriendLinkGenerator.py 所有生成的页面动态内容统一包裹 #router-view
  - index, about, archive, contact, privacy, settings 等页面将 `two-column-layout` 移入 `#router-view` 内部
    3. 个人信息卡片模块独立
  - 新增 /js/ui/personal-card.js，自监听事件自动渲染
  - 移除 main.js / router.js 中的耦合代码
    4. 清理与文档
  - 删除 search-render.js 中冗余的 `generatePersonalCardHTML`
  - 补充关键模块的注释说明
    >铲掉了一坨大屎山！好耶！
    >![7个小时](https://s41.ax1x.com/2026/06/13/pmQmkq0.png)

## [7.15.0] - 2026-06-13

### 变更

- 重构文章查看页
 - 优化了布局（更好看啦）
 - 在 URL 后添加跳转标识
 - 将在页面顶部显示的阅读进度条移动到目录标题旁
    ![新旧样式对比](https://s41.ax1x.com/2026/06/13/pmQEsCd.png)
    >再也不敢动屎山了，不知道是因为重构了哪个文件，导致无刷新导航和 TOC 目录出现问题~~（明明几个版本前还能工作，而且这两个毫不相干的东西怎么能一起出 BUG 的？？！）~~~

## [7.14.11] - 2026-06-12

### 变更

- 优化 router.js 与 ui-effects.js 性能
 - router.js：新增 ScriptExecutor 类，使用 Set 记录已加载脚本 URL，支持外部脚本去重和内联脚本执行后移除，避免 DOM 污染和重复加载。
 - ui-effects.js：ScrollReveal 类改为复用单个 IntersectionObserver，refresh() 方法只重新观察未 reveal 的元素，不再重建 observer，提升性能。

## [7.14.10] - 2026-06-12

### 新增

- Service Worker 缓存策略
 - 开发环境通过 `localhost` 或 `127.0.0.1` 禁用 SW
 - 生产环境增加版本号管理，并在设置页提供“强制刷新”按钮清除缓存

## [7.14.9] - 2026-06-12

### 变更

- 大幅降低首屏时间（FCP）
 - 后台加载导航栏和页脚，不阻塞主内容
 - 不再等待背景图片加载（若未加载则设置当前主题背景色）
 - 利用 `requestIdleCallback` 将非关键任务（统计同步、音乐播放器等）放到空闲时执行

## [7.14.8] - 2026-06-12

### 变更

- 对 [NeteaseMiniPlayer v2](https://nmp.hypcvgm.top/) 进行改版和拖拽功能支持（详见 [feat: 实现拖拽功能，支持触摸、边缘吸附](https://github.com/numakkiyu/NeteaseMiniPlayer/pull/15)）

## [7.14.7] - 2026-06-10

### 变更

- friend.js：将 `friends.js` 重构模块化为 `friends-manager.js`
- sw.js：增强了可配置性、错误处理、离线回退和缓存策略
- router.js：拆分原 300+ 行的 `fetchAndReplaceContent` 函数，提升可维护性
- 404.js：提升可维护性

### 修复

- v7.13.0 重构导致的 404 页部分失效

## [7.14.6] - 2026-06-10

### 变更

- navbar：完全 JS 驱动导航栏并整合标题替换功能
 - 移除对 `/navbar.html` 的静态请求，改为由 `NavbarManager` 动态生成 DOM
 - 删除 `/js/router/nav-title-replacer.js`，相关逻辑内聚至 `/js/ui/navbar-manager.js`
 - 清理 `main.js` 和 `router.js` 中对旧模块的调用

## [7.14.5] - 2026-06-08

### 新增

- 集成 [Microsoft Clarity](https://clarity.microsoft.com/)

### 变更

- 更新[隐私政策](/privacy/)

## [7.14.4] - 2026-06-07

### 修复

- v7.13.0 重构导致的文章查看页响应式和初始化失效

## [7.14.3] - 2026-06-07

### 变更

- 维护作品
- 优化评论区样式

### 修复

- v7.13.0 重构导致的友链评论区初始化失效

## [7.14.2] - 2026-06-06

### 修复

- v7.13.0 重构导致的设置页面失效
- v7.13.0 重构导致的统计页面失效

## [7.14.1] - 2026-06-06

### 变更

- 优化文章查看页的图片加载占位

### 修复

- 修复直接打开文章详情页不会生成目录的 BUG

## [7.14.0] - 2026-06-06

### 新增

- 新增音乐播放器 [NeteaseMiniPlayer v2](https://nmp.hypcvgm.top/)

### 修复

- v7.13.0 重构导致的图片查看器失效

## [7.13.0] - 2026-06-06

### 变更

- js：对 JS 文件进行分类
    ```新的文件结构
    js/
    ├── core/     # 核心基础设施
    │   ├── core.js
    │   ├── page-manager.js
    │   └── page-utils.js
    ├── router/   # 路由与导航控制
    │   ├── router.js
    │   └── nav-title-replacer.js
    ├── pages/    # 页面管理器（具体页面实现）
    │   ├── home-manager.js
    │   ├── archive.js
    │   ├── article.js
    │   ├── stats-manager.js
    │   ├── stats-init.js
    │   └── search-render.js
    ├── data/     # 数据处理与存储
    │   ├── searchWorker.js
    │   ├── site-state.js
    │   ├── sw.js
    │   └── settings.js
    ├── ui/       # UI交互与特效
    │   ├── ui-effects.js
    │   ├── theme.js
    │   ├── image-viewer.js
    │   ├── image-manager.js
    │   └── list-events.js
    ├── standalone/    # 独立页面逻辑
    │   ├── 404.js
    │   └── friends.js
    ├── entry/    # 入口引导
    │   └── main.js
    └── vendor/   # 第三方脚本
   └── busuanzi.min.js
    ```

## [7.12.5] - 2026-06-03

### 修复

- archive：修复存档页文章无法显示及日期解析错误

## [7.12.4] - 2026-06-03

### 新增

- ui-effects：改进自定义鼠标效果，增加点击动效与空闲归位
 - 优化旋转角度平滑度，使用低通滤波避免突变
 - 鼠标停止移动后保持最后方向，空闲 100 毫秒后逐渐归位
 - 完全隐藏原生鼠标（支持设置开关控制）
 - 增加点击动效
 - 改进空闲复位逻辑，避免移动停止即归位的突兀感

## [7.12.3] - 2026-06-03

### 新增

- ui-effects：增强自定义光标交互体验
 - 扩展可点击元素选择器，支持导航主题切换按钮、统计卡片、标签等元素触发吸附效果
 - 根据鼠标移动速度动态调整光标填充透明度：快速移动时实心，慢速时透明（仅留轮廓），减少内容遮挡
 - 优化光标旋转角度逻辑：移动停止后角度平滑衰减而非瞬间归零，消除抖动
 - 新增空闲回正机制：鼠标静止超过3秒后自动将角度归零（最短路径旋转）~~好像有 BUG 导致没生效~~
 - 修复鼠标悬浮于列表项子元素时光标无吸附反馈的问题

## [7.12.2] - 2026-06-02

### 新增

- 首页新增导航栏，用于 SEO 优化

## [7.12.1] - 2026-06-01

### 变更

- run：重构脚本运行工具，支持脚本参数传递和增强交互
 - 统一脚本执行逻辑
 - 脚本参数传递支持
 - 命令行模式增强
 - GUI 界面优化
 - 依赖预检

## [7.12.0] - 2026-06-01

### 变更

- python：提取公共模块并优化所有生成器脚本
 - 新增 `common.py` 统一日志、路径、JSON 读写、日期处理等工具函数
 - 重构 ArticleManager / WorkManager / Statistic / FriendLinkGenerator / StaticListGenerator / RssGenerator / SitemapGenerator / CodeAnalyzer
 - 消除重复代码，改进错误处理和类型注解
 - 优化 `run.py` GUI/CLI 模式，提高稳定性

## [7.11.0] - 2026-06-01

### 新增

- build：添加 StaticListGenerator.py 生成静态文章/作品页
 - 新增统一的静态页面生成脚本，支持通过 `--type` 参数分别或同时生成 `articles.html` 和 `works.html`。脚本读取 `/json/articles.json` 和 `/works.json`，将数据内嵌到 HTML 中，避免前端发起额外 JSON 请求。

### 变更

- js：`DataManager` 优先使用内嵌静态数据，减少网络请求

## [7.10.0] - 2026-05-31

### 新增

- 添加统计信息页面

## [7.9.1] - 2026-05-31

### 新增

- 若友链头像获取失败则显示占位字符

## [7.9.0] - 2026-05-31

### 变更

- 使用 `FriendLinkGenerator.py` 构建 `friends.html` ,不在使用 JS 动态获取内容

## [7.8.12] - 2026-05-31

### 变更

- 优化页脚样式，新增一些统计信息

## [7.8.11] - 2026-05-31

### 新增

- 支持文章和作品列表搜索中显示 tag 数量

## [7.8.10] - 2026-05-31

### 变更

- 删除 `index.html` 内嵌冗余 js 代码

### 修复

- 修复首页因 json 格式修改导致的显示问题并支持在 tag 标签后显示数量

## [7.8.9] - 2026-05-31

### 变更

- 回滚 v7.8.7 的更改
- 规范更新日志格式

## [7.8.8] - 2026-05-30

### 变更

- 更新 twikoo 版本（1.7.9 -> 1.7.11）

## [7.8.7] - 2026-05-28 [YANKED]

> 此版本的更改已在 7.8.9 回滚，仅作存档。

### 新增

- 文章查看页若无目录则不显示目录栏或目录按钮

## [7.8.6] - 2026-05-28

### 修复

- 使背景图片的过渡效果保持连贯

## [7.8.5] - 2026-05-27

### 变更

- 模块化 `friends.js`
- 统一工具函数，消除代码重复

## [7.8.4] - 2026-05-27

### 新增

- 实现页面生命周期管理与资源销毁
 - 为每个页面类型（文章、作品、归档、首页等）定义统一的页面管理器接口，包含 `init()` 和 `destroy()` 方法
 - 在 `fetchAndReplaceContent` 切换页面时，调用当前页面管理器的 `destroy()` 方法，清理定时器、事件监听、IntersectionObserver 等
 - 将 `ArticlePageManager`、`SearchController` 等实例挂载到 `window.__currentPageManager` 并统一管理
 - 避免页面切换后残留事件和内存泄漏

### 修复

- 从文章查看页切换到其他页面时，文章查看页不会被销毁

## [7.8.3] - 2026-05-17

### 新增

- 添加背景显示动画

### 变更

- 其他样式优化

## [7.8.2] - 2026-05-17

### 修复

- 无刷新导航后，页面若无特殊记录则自动返回顶部

## [7.8.1] - 2026-05-17

### 修复

- 修复在归档页跳转作品使用无刷新导航的 BUG

## [7.8.0] - 2026-05-17

### 新增

- 支持切换查看文章页时的无刷新导航
- 将大部分跳转改为无刷新导航

## [7.7.2] - 2026-05-16

### 变更

- 统一作品代码缩进

## [7.7.1] - 2026-05-16

### 变更

- 优化无刷新导航性能

## [7.7.0] - 2026-05-16

### 新增

- 新增归档页面

## [7.6.10] - 2026-05-16

### 新增

- `index.html` 首页统计卡片区域新增展示：
 - 文章分类数
 - 文章标签数
 - 作品标签数
- 删除“最近更新”板块，因为功能重复

## [7.6.9] - 2026-05-16

### 变更

- 分离 `friends.html` 中的 JS 代码

## [7.6.8] - 2026-05-16

### 变更

- 维护作品——对一些作品进行修改以同步近来的网站代码

## [7.6.7] - 2026-05-16

### 新增

- 优化 Python 构建脚本
 - 给 `Run.py` 新增 GUI
 - 统一 `SitemapGenerator.py` 的输出

## [7.6.6] - 2026-05-16

### 变更

- 进一步模块化 JS

## [7.6.5] - 2026-05-15

### 变更

- 优化导航栏显示——宽度不再动态变化

## [7.6.4] - 2026-05-15

### 变更

- 重构 `404.html`

## [7.6.3] - 2026-05-13

### 变更

- 改文章列表的按更新时间降序为按发布时间降序

## [7.6.2] - 2026-05-13

### 变更

- 删除页脚冗余 js 代码

### 修复

- 修复列表项可以点击但不显示的问题

## [7.6.1] - 2026-05-12

### 修复

- 修复 Twikoo 输入框暗色主题显示异常的问题

## [7.6.0] - 2026-05-11

### 新增

- 新增[网站设置页面](https://xinyang-gao.github.io/settings/)
 - 自定义鼠标设置
 - 外链弹窗设置
 - 清除 cookie

### 修复

- 修复页脚无法正确获取不蒜子数据的 BUG
- 对页脚进行一点小修改

## [7.5.0] - 2026-05-10

### 新增

- 在页面没有选中导航栏时显示页面标题

## [7.4.1] - 2026-05-10

### 变更

- 不再在 RSS 中包含作品数据

### 修复

- 修复 `robots.txt` 中的错误

## [7.4.0] - 2026-05-10

### 变更

- 拆分 `script.js`，方便管理并优化加载速度
 - Core同步加载：`core.js` 包含基础工具和存储控制，通过 `type="module"` 同步导入。
 - 按需加载：`search-render.js` 仅在进入文章/作品页面时通过 `import()` 动态加载。
 - 空闲时初始化：`ui-effects.js` 使用 `requestIdleCallback` 延迟初始化自定义光标、外链管理等非关键特效。
 - Web Worker：`searchWorker.js` 独立线程处理数据过滤排序，主线程仅负责DOM更新。
 - 精简 `DOMContentLoaded`：仅执行加载导航/页脚、应用主题、启动空闲任务；页面内容初始化通过 `initPageFeatures` 按需处理。
 - Service Worker 预加载：`sw.js` 预缓存 `works.json`、`articles.json` 等关键JSON。

 文件结构：
 ```
 /js/
 ├── core.js      # 核心模块：CONFIG, Utils, StorageController, CookieConsentManager, PerformanceMonitor
 ├── searchWorker.js   # Web Worker：数据过滤、排序、标签提取
 ├── search-render.js  # 按需加载模块：DataManager, UIRenderer, SearchController
 ├── ui-effects.js     # UI特效模块：CustomCursor, ExternalLinkManager, ScrollReveal
 ├── main.js      # 主入口：导航/页脚加载、主题应用、空闲任务调度、页面初始化
 ├── sw.js   # Service Worker：预加载关键JSON
 ```

## [7.3.11] - 2026-05-08

### 变更

- 更新 Twikoo 版本（1.7.7 -> 1.7.9）

## [7.3.10] - 2026-05-08

### 变更

- 优化了 `script.js` 中的一些代码

### 修复

- 修复未同意 cookie 时点击同意无法保存已同意状态的 BUG

## [7.3.9] - 2026-05-08

### 变更

- 将 `avatar.jpg` 转换为 `avatar.webp` 格式，压缩近一半体积

## [7.3.8] - 2026-05-08

### 变更

- 将 CSS font-awesome 依赖改为使用 javascript Font Awesome Kit
- 删除 `article.js` 中对 Mermaid 支持的代码遗留

## [7.3.7] - 2026-05-08

## [7.3.6] - 2026-05-08

## [7.3.5] - 2026-05-07

## [7.3.4] - 2026-05-07

## [7.3.3] - 2026-05-07

## [7.3.2] - 2026-05-07

### 新增

- 增加 `robots.txt`

## [7.3.1.1] - 2026-05-06

### 变更

- 修改 `favicon.ico`，并修复其格式

## [7.3.1] - 2026-05-05

### 变更

- 暂时移除 umami 相关逻辑

### 修复

- 修复一些问题并优化 `script.js` 代码

## [7.3.0] - 2026-05-04

### 新增

- Cookies 支持
 - 新增 `StorageController` 在最顶部，立即初始化并控制所有本地存储
 - 所有 `localStorage` / `sessionStorage` 读写前均调用 `StorageController.isAllowed()`
 - 拒绝 Cookies 时调用 `StorageController.clearAllData()` 清除已有数据，并禁用后续存储
 - 搜索功能改为使用内存数据（挂载到 `window._currentXxxData`），不再依赖缓存
 - 主题、统计记录等均受存储守卫保护
 - 当用户未同意 Cookies 时，浏览器不会留下任何主题、版本、访问时间等记录
- 隐私政策 [查看详情](/privacy/)

## [7.2.3] - 2026-05-04

### 变更

- 将移动端的文章查看器改为可打开的弹窗目录

## [7.2.2] - 2026-05-04

### 变更

- 从 `friends.html` 中分离页脚样式到 `friends.css`

## [7.2.1.3] - 2026-05-04

### 变更

- 回退对 `.nojekyll` 的添加

## [7.2.1.2] - 2026-05-04

### 变更

- 简化 `jekyll-gh-pages.yml` 工作流

## [7.2.1.1] - 2026-05-04

### 变更

- 回退对 `/.github/workflows/jekyll-gh-pages.yml` 的删除

## [7.2.1] - 2026-05-04

### 新增

- 添加 `.nojekyll` 文件以阻止 Markdown 文件被构建

### 变更

- 删除历史遗留文件
 - `/_config.yml`
 - `/.github/workflows/jekyll-gh-pages.yml`

## [7.2.0] - 2026-05-04

### 新增

- 新增 `SitemapGenerator.py` 用于生成 [`sitemap.xml`](/sitemap.xml)

## [7.1.7] - 2026-05-04

### 变更

- 从 `style.css` 和 `footer.html` 中分离页脚样式到 `footer.css`
- 优化页脚样式

## [7.1.6] - 2026-05-04

### 变更

- 将 `README.md` 从 `/assets/source/网站/` 移至根目录 `/`（`ArticleManager.py` 会自动构建）

## [7.1.5] - 2026-05-04

### 变更

- 修改导航栏样式（灵动岛风格）

 ![导航栏新样式](https://s41.ax1x.com/2026/05/04/peHAYHe.jpg)
 ![导航栏旧样式](https://s41.ax1x.com/2026/05/04/peHANAH.jpg)

## [7.1.4] - 2026-05-04

### 变更

- 删除 `style.css` 中对 twikoo 样式的定义，因为已经在 `twikoo.css` 中定义
- 从 `style.css` 中分离导航栏样式到 `navbar.css`

## [7.1.3] - 2026-05-03

### 变更

- 优化“欢迎回来”页面的样式

## [7.1.2] - 2026-05-03

### 变更

- 将文章源文件从 `/articles/source/` 移动到 `/assets/source/`

## [7.1.1] - 2026-05-03

### 变更

- 删除了 `script.js` 中遗留的 SPA 切换动画逻辑：
 - 移除了 `PageManager.loadPage`
 - 移除了 `PageManager.performDrawAnimation`
 - 删除了相关的 pageConfig / SPA 页面切换动画代码

## [7.1.0] - 2026-05-02

### 新增

- 新增自动主题选择 `getTimeBasedTheme()`
 - 6:00–18:00 设为 light；其它时间设为 dark
 - 主题初始化优先使用用户保存的 `localStorage.theme`，否则自动按当前时间选择主题

### 修复

- 不再因 `statistics.json` 缺少 `version` 字段而强制设置暗黑主题

## [7.0.0] - 2026-05-02

### 新增

- 添加网站背景，来源 Bing
- 新增“欢迎回来”覆盖层（默认超过 5 分钟就显示）
- 在 `statistics.json` 中新增 `version` 字段
 - 若缺少 version 字段则强制设置暗黑主题

### 变更

- 重构主页样式
- 重构页脚样式
- 其他样式小修改
- 一些文本修改

## [6.8.2] - 2026-04-26

### 修复

- 修复 `applyTagsToButtons` 方法缺失导致的一系列问题

## [6.8.1] - 2026-04-25

### 新增

- 给图片查看器新增加了旋转、重置按钮
- 增加了图片无法加载提示

### 变更

- 优化了图片查看器的样式

### 修复

- 修复了图片查看器重新加载按钮未生效的问题

## [6.8.0] - 2026-04-25

### 新增

- 在文章列表页新增排序方式，默认为按更新时间降序
- 在文章列表页列表项中显示发布时间和更新时间

### 变更

- 其他小修改

## [6.7.1] - 2026-04-25

### 变更

- 修复友链页面评论区不显示的问题
- 更新并统一使用的[图标库](https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css)

## [6.7.0] - 2026-04-25

### 变更

- 重写评论区样式
- 删除冗余代码

## [6.6.0.1] - 2026-04-24

### 变更

- 更新 `README.md`

## [6.6.0] - 2026-04-24

### 新增

- 为文章查看器添加显示上传日期（原本的日期条目）、修改日期、修改次数

### 变更

- 将 `avatar.jpg` 移动至 `/assets/` 文件夹下

## [6.5.0] - 2026-04-24

### 变更

- 将 python 脚本移动至 `/python/` 文件夹下，移动文件如下：
 - `ArticleManager.py`
 - `WorkManager.py`
 - `Statistic.py`
 - `RssGenerator.py`
 - `run.py`
- 将 json 文件移动至 `/json/` 文件夹下，移动文件如下：
 - `articles.json`
 - `works.json`
 - `friends.json`
 - `statistics.json`
- 修改一些代码中的路径
- 优化 python 脚本的代码，统一格式和输出
- 优化文章查看页 HTML 页面的结构，删除冗余代码

## [6.4.2] - 2026-04-23

### 变更

- 优化“网站更新日志.md”的格式

## [6.4.1] - 2026-04-23

### 变更

- 优化页脚样式

## [6.4.0] - 2026-04-23

### 新增

- 分离文章查看页的图片查看器，现在可以全站调用

### 变更

- 将 js 代码移动至 `/js/` 文件夹，移动文件如下：
 - `script.js`
 - `article.js`
 - `busuanzi.min.js`
 - `image-viewer.js` (新增)
- 将 css 样式移动至 `/css/` 文件夹，移动文件如下：
 - `style.css`
 - `article.css`
 - `image-viewer.css` (新增)
- 在 `404.html` 页面的代码引用改为使用绝对路径

## [6.3.7] - 2026-04-18

### 新增

- 增加 [萌备](https://icp.gov.moe/?keyword=20261221)

### 变更

- 其他小修改
- 优化暗色模式下的卡片边缘对比度

## [6.3.6] - 2026-04-16

### 变更

- 在友链卡片右下角添加网址显示
- 修改了友链页面的一些文本
- 其他小修改

## [6.3.5] - 2026-04-13

### 变更

- 网站页脚最后更新时间自动获取构建时间并由 js 动态加载，不再手动修改
- 优化个人信息页面 tag 排版
- 修改了一些文本

### 修复

- 修复 v6.3.4 更新导致的无刷新导航加载失败问题

## [6.3.4] - 2026-04-13

### 变更

- 修复移动端页面汉堡菜单点击无效的问题
- 调整移动端布局：内容卡片在前，个人信息卡片在后

## [6.3.3] - 2026-04-12

### 新增

- 文章查看器支持更多 markdown 语法
 - [优化代码块显示](/articles/test.html#5-代码块)——新增复制按钮
 - [添加数学公式支持](/articles/test.html#14-数学公式)
 - [添加流程图支持](/articles/test.html#15-图表与流程图)
 - 优化脚注样式

### 变更

- 更新 Twikoo 评论系统版本：1.7.4 -> 1.7.7

## [6.3.2] - 2026-04-12

### 变更

- 文章查看页或 404 页禁止无刷新导航，以修复相关问题

## [6.3.1] - 2026-04-12

### 变更

- 删除 `404.html` 的评论区（因为出现 404 错误时网址不会改变，导致评论区被划分到很多不同页面，页面之间评论不互通，失去作用）
- 同步主站样式到 `404.html`，并优化 `404.html` 页面布局
- 删除 `404.html` 冗余代码

## [6.3.0] - 2026-04-11

### 新增

- 为网站实现 AJAX

## [6.2.1] - 2026-04-11

### 新增

- 更新个人信息卡片显示页面

## [6.2.0] - 2026-04-11

### 新增

- 新增 `rss.xml`（由 `RssGenerator.py` 自动生成）
- 在首页新增个人信息栏

## [6.1.1] - 2026-04-11

### 变更

- 将“隐藏”标签的文章和作品的剔除逻辑从前端移至后端

## [6.1.0] - 2026-04-06

### 新增

- 新增友链页面

## [6.0.4] - 2026-04-06

### 变更

- 优化外链跳转（由单独打开一个页面转为打开一个弹窗）
 - 删除 `link.html`
 - 将代码实现移动至 `script.js`
- 优化文章查看页图片查看器

## [6.0.3] - 2026-04-06

### 变更

- 优化文章查看页的图片懒加载

## [6.0.2] - 2026-04-06

### 新增

- 文章列表和作品列表页支持通过 url 参数搜索
- 点击主页的相应元素会跳转至相应页面
 - 文章总数 → 文章列表页面
 - 作品总数 → 作品列表页面
 - 文章和作品的 tag 标签 → 相应页面的对应搜索

### 变更

- 可以点击文章查看页 tag 标签来直接搜索同标签文章

## [6.0.1] - 2026-04-06

### 变更

- 更换 [Twikoo](https://twikoo.js.org/) 评论的 CDN

## [6.0.0] - 2026-04-06

## [6.0.0-dev6] - 2026-04-06

### 变更

- 重写主页样式（详见本节末）

## [6.0.0-dev5] - 2026-04-06

### 变更

- 回退 v6.0.0-dev4 更改
- 优化 `style.css`（主站样式）——添加元素显示动画（部分内容只有滑动到视窗时才显示）
- 优化 `article.css`
 - 同步前四个开发版的主站样式到文章查看页
 - 添加显示动画
 - 删除冗余样式定义
 - 其他小改动
- 优化文章查看器中的图片查看器
 - 支持同一篇文章内的图片前后查看
 - 支持放大、缩小、重新加载图片功能
 - 在图片下方添加图片介绍小字
- 内置 `busuanzi.min.js`（不再从 DNS 中下载）

## [6.0.0-dev4] - 2026-04-05

### 变更

- 基本重写 `script.js`，更现代化的代码结构

## [6.0.0-dev3] - 2026-04-05

### 变更

- 优化网站样式，基本重写 `style.css`

### 修复

- 修复文章列表和作品列表的暗黑模式显示异常问题

## [6.0.0-dev2] - 2026-04-05

### 新增

- 新增 `Statistic.py` 来统计网站信息
 - 生成 `statistics.json` 记录：
   - 最后更新日期
   - 文章总数
   - 文章总字数
   - 作品总数
   - 所有文章tag
   - 所有文章分类
   - 所有作品tag
 - 此脚本将在 `ArticleManager.py` 和 `WorkManager.py` 执行完毕后被 `run.py` 调用

## [6.0.0-dev1] - 2026-04-04

### 新增

- 新增 `WorkManager.py` 用于将 `./works/作品/` 下的 `metadata.json` 汇总生成 `works.json` 到根目录
- 新增 `run.py` 用于启动 `ArticleManager.py` 和 `WorkManager.py`

    #### 样式变更
    ![首页新样式](https://s41.ax1x.com/2026/04/06/peNUN60.png)
    ![首页旧样式](https://s41.ax1x.com/2026/04/06/peNUtlq.png)

### 变更

- 导航栏的按钮现在居中显示
- 更改文章文件存储
 - 由原来的 `./articles/articles/xxx.md` 改为 `./articles/source/分类/xxx.md`
 - 在 `articles.json` 中添加 `category`（分类）项，分类会显示在文章元数据区
- 更改作品文件存储
 - 由原来的 `./works/作品.html` 改为 `./works/作品/index.html`（HTML类文件改动示例）
 - 在 `./works/作品/` 下添加 `metadata.json` 来存储作品元数据
- 将 `markdown2html.py` 重命名为 `ArticleManager.py`

## [5.3.4] - 2026-04-04

### 变更

- 优化代码结构和性能
 - 优化 `script.js` `article.js` 代码结构
 - 优化 `style.css` `article.css` 样式
- 页面宽度从 850px 改为 1100px
- 文章查看页宽度从 1200px 改为 1300px

## [5.3.3] - 2026-04-04

### 新增

- 在网站页脚新增 [MIT License](https://opensource.org/licenses/MIT) 和 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0) 声明

### 变更

- 优化网站文章列表布局
 - 添加阅读时间显示
 - 将“作者”“字数”“阅读时间”移动到标题下方

### 修复

- 修复自 v5.0.0（2026-03-28）的修改导致的对 markdown 格式无序、有序列表的 2空格 缩进无法解析的问题

## [5.3.2] - 2026-04-03

### 变更

- 优化网站文章查看页的布局
 - 添加阅读时间显示（阅读时间将由 `markdown2html.py` 计算并写入 `articles.json`）
 - 用图标代替元数据各项解释（鼠标移动到上方会显示描述）
 - 将文章的 tag 标签从元数据中移动到文章末尾并显示为 `#xxx`
 - 分离内容区和评论区的卡片

## [5.3.1] - 2026-04-02

### 变更

- 优化 `style.css` 合并样式
- 优化 `article.css` 合并样式
- 其他小修改

## [5.3.0] - 2026-04-01

### 新增

- 新增文章字数统计功能（由 `markdown2html.py` 生成）
- 文章查看页新增字数统计
- 文章列表新增作者和字数统计

### 变更

- 优化 `articles.json`
 - 新增 `word_count` 和 `total_word_count` 项
 - 删除 `id` 项（文章列表项现在通过 data-url 属性存储跳转链接，不再依赖 id 字段）
- 删除一些冗余代码

## [5.2.0] - 2026-03-31

### 新增

- 增加外链提示功能（`link.html`）

### 变更

- 优化作品列表详情弹窗视觉效果
 - 添加背景模糊和变暗效果
 - 按下非弹窗部分和 `Esc` 键可以退出弹窗

## [5.1.2] - 2026-03-30

### 变更

- 删除文章查看页无意义的标题强调（从 `==={title}===` 改为 `{title}`）

## [5.1.1] - 2026-03-29

### 新增

- 在页脚新增网站存活时间

### 变更

- 修改“关于”页面的文本

## [5.1.0] - 2026-03-29

### 新增

- 添加[不蒜子](https://www.busuanzi.cc/)访问量统计系统
- 在 `404.html` 添加评论区

### 变更

- 将 `markdown2html.py` 从 `/articles` 目录移动至 `/` 目录
- 优化 markdown 文章的元数据
 - 增加 `description` 和 `author`
 - 将 `tag` 改为 `tags`
 - 优化生成的 HTML 文章的元数据模块显示
- 现在 `articles.json` 由 `markdown2html.py` 自动生成

## [5.0.1] - 2026-03-29

### 新增

- 添加自定义网站滚动条
- 添加自定义光标

### 变更

- 将“联系”改为“留言板”（因为原本的练习内容已经在新的页脚中包含）
- 优化明暗模式切换按钮
- 优化页脚显示——将联系方式以图表形式展示在页脚中

### 修复

- 修复首页“查看更新日志”链接跳转错误的问题

## [5.0.0] - 2026-03-28

### 新增

- 添加 [Twikoo](https://twikoo.js.org/) 评论系统
- 在文章查看页增加了图片查看器
- 新增文章查看页浏览记录功能，退出重进后仍能回到阅读位置
- 在文章查看页增加了阅读进度条

### 变更

- 优化网站样式（详见本节末）
- 更改文章查看页显示逻辑
 - 由原本的 `/articles/?article=${encodeURIComponent(article.title)}` 获取参数调用 markdown 文件改为由 `markdown2html.py` 预生成 HTML 文件（同时，文章列表的跳转改为 `/articles/{encodeURIComponent(article.title)}.html`）
 - 将 markdown 中的元数据标识从 `+++` 改为 `---`
- 删除文章查看页的冗余代码
- 在文章查看页显示的图片不会再超出内容框架范围
- 在文章查看页实现了图片懒加载（未滚动到图片位置则不加载）

### 修复

- 修复文章查看页暗黑模式适配不全的 BUG
- 修复文章查看页导航栏显示在“首页”的 BUG

    ![旧样式](https://s41.ax1x.com/2026/03/28/pe1QOXV.png)
    ![新样式](https://s41.ax1x.com/2026/03/28/pe1QokQ.png)

## [4.2.0] - 2026-03-27

### 新增

- 增加了暗黑模式
- 增加了一篇文章
- 增加了一个作品

### 已知问题

- 文章查看页未适配
- 在切换页面时会闪烁

## [4.1.0] - 2026-03-15

### 变更

- 支持在文章查看页显示导航栏
- 其他小修改
- 动画优化
 - 优化列表项显示动画：每个列表项从下方渐显滑入
 - 优化作品详情弹窗动画
 - 优化文章查看页动画
- 代码优化——删除多余的 `style.css` 代码

## [4.0.0] - 2026-03-14

### 变更

- 为了进行 SEO 优化，重构了网站模式：从 SPA 转为 MAP
 - 分离导航栏（导航栏代码移动至 `navbar.html`，修改导航链接从查询参数形式为直接的 HTML 文件链接）
 - 移动 `pages` 文件夹中的文件到根目录，并为每个文件创建了完整的 HTML 结构
 - 更新 `script.js` 以适应多页面模式：
   - 移除了页面动态加载逻辑（`PageManager.loadPage`）
   - 添加了页面特定的初始化函数
   - 根据当前页面路径初始化相应的功能（问候语、文章列表、作品列表等）
   - 简化了导航管理，保留了移动菜单和返回顶部功能
- 其他小修改
- 由于模式更换，被迫将原动画改为信纸淡入淡出（没想到怎么在多页面模式下实现原来的动画效果）

## [3.4.0] - 2026-03-08

### 变更

- 修改了“关于”页面文本（终于不是占位文本啦）
- 其他小修改
- 重构 `script.js`，优化命名与逻辑

## [3.3.2] - 2026-02-05

### 新增

- 增加了一个作品

### 变更

- 修改了“首页”（跟随时间动态调整）和“关于”页面文本
- 其他小修改

## [3.3.1.1] - 2026-01-06

### 变更

- 更新 `LICENSE` 文件

## [3.3.1] - 2025-12-28

### 新增

- 隐藏带有“隐藏”标签的文章与作品

### 变更

- 修复作品列表页在滚动后打开详情页会出现的显示问题
- 文章查看页目录中的不同级别标题具有更明显的视觉差异
- 优化 `script.js` 结构
 - 性能优化：为 `SearchManager` 中搜索输入添加了防抖功能；使用 DOMParser 替代 innerHTML 直接操作；优化了事件监听器的管理
 - 代码优化：合并 `fetchWorksData` 和 `fetchArticlesData` 为通用 `fetchData` 函数；合并列表生成函数，减少重复代码；使用 `.list-item` 替代原来的 `.work-item` 和 `.article-item`；使用统一的 `.list-item-header`、`.list-item-title`、`.list-item-meta`、`.list-item-description` 类；使用 `.tag` 类替代原来的 `.work-tag`、`.article-tag`、`.tech-tag`；将 `handleWorkItemClick` 和 `handleArticleItemClick` 合并为 `handleListItemClick`；移除 `setupWorkItemsInteraction` 和 `setupArticleItemsInteraction`，使用统一的 `setupListItemsInteraction`；重构 `SearchManager`；统一了命名规范并拆分了长函数
- 优化 `style.css` 结构——合并 `.work-item` 和 `.article-item` 为 `.list-item`
- 修改了一些文本

## [3.3.0] - 2025-12-27

### 新增

- 文章和作品列表页可以选择标签搜索了（相应地，移除了搜索中的“标签”搜索功能）
- 文章查看页面菜单标题现在追踪正文

### 变更

- 移动端菜单点击后自动关闭
- 优化 `script.js` 结构
 - 优化动画使其更加流畅、自然
 - 减少不必要的 DOM 操作和重绘
 - 优化代码结构和可维护性
 - 添加更完善的错误处理
 - 添加更详细的错误日志
- 优化 `style.css` 结构
- 修改了一些文本

## [3.2.1] - 2025-12-25

### 变更

- 修复文章页面无法获取到元数据的问题（GitHub Page 的 Jekyll 会识别并删除以 `---` 为标识符的文件的元数据，于是将 `---` 都改为 `+++` 解决了这个问题）
- 更改作品“统计计算器”为网站新样式，同时大幅精简代码
- 优化 `style.css` 结构

## [3.2.0] - 2025-12-23

### 新增

- 文章和作品页搜索功能，支持搜索“标题”“描述”“标签”“日期”和“所有”

### 变更

- 优化文件结构
- 修改了一些文本
- 修改了 `script.js` 中的一些函数
- 移除 `works.json` 中的 `image`
- 将一些路径改为绝对路径

## [3.1.1] - 2025-12-21

### 新增

- 文章查看页面（目录 + 内容）
- 首页新增“查看网站更新日志”链接

### 变更

- 优化导航栏样式
- 清理和优化代码结构（主要是 `script.js`）
 - 将函数定义移出 `DOMContentLoaded` 回调
 - 提取 `generateTagsHTML` 函数
 - 增强了对网络请求、数据解析和 DOM 操作的错误处理
 - 增加了对 `localStorage` 数据和 DOM 元素存在的检查
 - 添加了一些注释
- 修改了一些样式
- 修改了一些文本

### 修复

- 修复 404 页面的“返回首页”按钮指向的不是根目录的 `index.html` 的问题
- 修复网站图标不显示的问题

## [3.1.0] - 2025-12-20

### 新增

- 新增页面切换动画

### 变更

- 优化网站文件结构，更方便维护
- 优化作品详情查看页样式和动画
- 优化 `works.json` 结构（合并了一些条目）
- 清理上个样式残留的自定义光标和视差背景相关代码
- 清理多余无用文件
- 同步 `404.html` 页面的样式到新样式并修改了一些文本
- 作品页从卡片流样式修改为列表样式

## [3.0.0] - 2025-12-19

### 变更

- 重构样式，从科技风改信“封”
- 修改了一些文本

> 下面的更新日志已经不具有参考价值，仅记录（虽然记录得也不全）
> 在这之前的可以分为两个版本 v1.0 和 v2.0
> 其中 v1.0 就是复制了一个制作好的简易博客主题
> v2.0 舍弃了 v1.0 的项目，全部重做，风格是科技风，不过 2.0 版本时网站并不完善，更新日志也没有留下太多（其中有一部分是查看 Git 历史记录撰写的）

## 2025-12-06

### 变更

- 优化网站性能
- 优化样式

## 2025-12-03

### 变更

- 分离导航栏代码
- 一些小修改

## 2025-12-02

### 变更

- 优化导航栏样式
- 一些小修改

## 2025-11-30

### 变更

- 优化网站性能

## 2025-11-23

### 新增

- 新增了一个作品：`车轮模拟.html`

## 2025-10-22

### 新增

- 新增了一个（也可以说是两个）作品：`朗诵1.html`（和 `朗诵2.html`）

### 变更

- 优化作品 `朗诵1.html`（和 `朗诵2.html`）中的图片，以及修复其中的一些链接跳转问题

## 2025-09-08

### 新增

- 404页面（`404.html`）
- 新增触屏支持（在初始页面可以通过屏幕上滑进入，以前只能使用鼠标滚轮）

## 2025-09-07

### 变更

- 大量文件代码重构和移动
- 分离和部分优化了作品 `统计计算器.html` 的 js 和 css 代码
- 缩短切换页面的间隙时间
- 优化作品页面卡片流布局

## 2025-05-30

### 新增

- 新增了一个作品：`统计计算器.html`

## 2025-05-24

### 新增

- 在 `file.json` 中新增了一项内容 `gaoyaqing的画.jpg`

## 2025-05-16

### 变更

- 更新页脚文件 `footer.html`

## 2025-05-02

### 变更

- 代码和样式优化

## 2025-05-01

### 新增

- 新增了一个文章：`dilimoxieppt`
- 增加文件系统
- 添加文章阅读器
- 增加了一个自定义 markdown 语法：`<file src="文件链接" title="文件标题" type="文件类型" url="跳转链接">`

### 变更

- 代码和样式优化
- 更新 `404.html`
- 将导航栏页脚移动至通用脚本

## 2025-04-30

### 新增

- 新增文章页面

### 变更

- 分离 HTML、CSS、JS 文件并优化代码
- 优化文件结构

## 2025-04-29

### 新增

- 新增网站图标（注：时间上从加入起图标就一直不显示，2025-12-21 才修复）

### 变更

- 一些样式优化

## 2025-04-27

### 新增

- 新增网站配置文件：`jekyll-gh-pages.yml`、`jekyll-docker.yml`

### 变更

- 合并两个 html 文件：`content.html` 和 `index.html`

## 2025-04-26

### 变更

- 大量文件代码重构和移动
- 优化页面布局

## 2025-03-14

### 变更

- 优化 markdown 查看器

### 修复

- 修复一些链接指向问题

## 2025-03-13

### 变更

- 优化代码

## 2025-03-12

### 变更

- 优化代码

## 2025-03-11

### 变更

- 修复跨域问题（注：实际上当时根本没修复）

## 2025-03-03

### 变更

- 在新窗口打开文章
- 优化代码

## 2025-03-02

### 新增

- 新增日夜模式切换
- 新增 `404.html`

### 变更

- 优化代码

## 2025-03-01

### 变更

- 优化代码

## 2025-02-28

### 变更

- 优化代码

## 2025-02-23

### 变更

- 优化一些文本
- 优化代码

## 2025-02-22

### 新增

- 初始版本
 - 新增 `index.html`
 - 新增 `LICENSE`（MIT License）
