// /js/pages/gallery.ts
//
// 全宽瀑布流图库的独立入口。刻意**不 import 任何站点模块**：
// 这个页面不加载 main.js，因此没有导航栏、页脚、侧边栏、播放器与加载遮罩，
// 也不会被 SPA 路由接管；它只需要 core.css 提供的设计变量。
//
// 布局分三步，目标是「自适应铺满、底部不留大空洞」：
//   1. 算出每张图的宽高比（JSON 给 width/height 最省事，缺失才发一次图片探测）；
//   2. 按「估算高度从大到小」依次投进当前最矮的列（LPT 调度），
//      比按数据顺序投放更不容易出现某列一枝独秀；列内仍保持 JSON 顺序；
//   3. 把较矮列的卡片等比放大一点点（object-fit: cover 轻微裁切），
//      让所有列底部尽量齐平。放大上限 1.22 倍，避免明显裁掉画面。
// 列数随容器宽度分档，且不超过 ceil(图片数 / 2)，保证每列至少约 2 张。
// 列数不变时只更新高度、不重排 DOM，图片节点全程复用、不重复请求。

/** 与主站 CONFIG.STORAGE_KEYS.THEME_MODE 保持一致（此处不引 core.ts，避免拖入主包） */
const THEME_MODE_KEY = 'settings_theme_mode';
const DATA_URL = '/json/gallery.json';
/** 图片尺寸探测失败时的兜底比例（正方形），保证布局不塌 */
const FALLBACK_RATIO = 1;
const PROBE_TIMEOUT = 4000;
/** 列底对齐时允许的最大拉伸倍率：超过就宁可留一点差，也不把图裁得过狠 */
const MAX_STRETCH = 1.22;

interface GalleryItem {
  id?: string;
  url: string;
  title: string;
  description?: string;
  date?: string;
  width?: number;
  height?: number;
  tags?: string[];
}

interface GalleryData {
  updated?: string;
  items: GalleryItem[];
}

const grid = document.querySelector<HTMLElement>('#gallery-grid');
// 不能叫 status：DOM lib 里已有全局 window.status，会触发 TS2451 重复声明
const statusEl = document.querySelector<HTMLElement>('#gallery-status');
const countEl = document.querySelector<HTMLElement>('#gallery-count');

/** 卡片 DOM、图片容器与比例一一对应，重排时只移动节点，不重新请求图片 */
const cards: HTMLElement[] = [];
const medias: HTMLElement[] = [];
const ratios: number[] = [];
let columns: HTMLElement[] = [];
/** 每列里放的是 cards 的下标，按投放顺序记录 */
let buckets: number[][] = [];
let columnCount = -1;
let lastWidth = -1;

function setStatus(title: string, detail: string): void {
  if (!statusEl) return;
  statusEl.replaceChildren();
  const heading = document.createElement('span');
  heading.className = 'gallery-status__title';
  heading.textContent = title;
  const body = document.createElement('span');
  body.textContent = detail;
  statusEl.append(heading, body);
  statusEl.hidden = false;
}

function clearStatus(): void {
  if (statusEl) statusEl.hidden = true;
}

function formatDate(raw: string): string {
  // 2026-11-08 -> 2026.11.08；其它写法原样展示（target 是 ES2020，不用 replaceAll）
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.replace(/-/g, '.') : raw;
}

/** JSON 没给宽高时，用一次带超时的图片探测拿到真实比例 */
function probeRatio(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = new Image();
    let settled = false;
    const finish = (ratio: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.onload = null;
      probe.onerror = null;
      resolve(ratio > 0 && Number.isFinite(ratio) ? ratio : FALLBACK_RATIO);
    };
    const timer = window.setTimeout(() => finish(FALLBACK_RATIO), PROBE_TIMEOUT);
    probe.onload = () => finish(probe.naturalWidth / probe.naturalHeight);
    probe.onerror = () => finish(FALLBACK_RATIO);
    probe.src = url;
  });
}

async function resolveRatios(items: GalleryItem[]): Promise<number[]> {
  return Promise.all(
    items.map((item) => {
      if (item.width && item.height && item.width > 0 && item.height > 0) {
        return Promise.resolve(item.width / item.height);
      }
      return probeRatio(item.url);
    }),
  );
}

function makeCard(item: GalleryItem, ratio: number): { card: HTMLElement; media: HTMLElement } {
  const card = document.createElement('article');
  card.className = 'gallery-card';
  card.tabIndex = 0;
  if (item.id) card.dataset.id = item.id;

  const media = document.createElement('div');
  media.className = 'gallery-card__media';
  // 提前占好高度：图片加载前后盒高一致，瀑布流不会跳动
  media.style.aspectRatio = String(ratio);

  const img = document.createElement('img');
  img.alt = item.title || '图库图片';
  img.loading = 'lazy';
  img.decoding = 'async';
  const markLoaded = (): void => img.classList.add('is-loaded');
  const markBroken = (): void => card.classList.add('is-broken');
  img.addEventListener('load', markLoaded);
  img.addEventListener('error', markBroken);
  img.src = item.url;
  if (img.complete) {
    if (img.naturalWidth > 0) markLoaded();
    else markBroken();
  }
  media.appendChild(img);

  const overlay = document.createElement('div');
  overlay.className = 'gallery-card__overlay';

  const title = document.createElement('h2');
  title.className = 'gallery-card__title';
  title.textContent = item.title || '未命名';
  overlay.appendChild(title);

  if (item.description) {
    const desc = document.createElement('p');
    desc.className = 'gallery-card__desc';
    desc.textContent = item.description;
    overlay.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'gallery-card__meta';
  if (item.date) {
    const time = document.createElement('time');
    time.dateTime = item.date;
    time.textContent = formatDate(item.date);
    meta.appendChild(time);
  }
  for (const tag of (item.tags ?? []).slice(0, 3)) {
    const chip = document.createElement('span');
    chip.className = 'gallery-card__tag';
    chip.textContent = tag;
    meta.appendChild(chip);
  }
  if (meta.childElementCount > 0) overlay.appendChild(meta);

  // 无障碍：让读屏软件把整张卡片当作一个可聚焦的图文单元
  card.setAttribute(
    'aria-label',
    [item.title, item.description, item.date].filter(Boolean).join('，'),
  );
  card.append(media, overlay);
  return { card, media };
}

/** 列数只跟容器宽度有关；分档让窄屏也有 2 列，超宽屏最多 6 列 */
function columnsFor(width: number): number {
  if (width < 640) return 2;
  if (width < 1024) return 3;
  if (width < 1440) return 4;
  if (width < 1920) return 5;
  return 6;
}

function readGap(): number {
  if (!grid) return 8;
  const value = Number.parseFloat(getComputedStyle(grid).columnGap);
  return Number.isFinite(value) ? value : 8;
}

/** LPT：先放最"高"的图，再让小图去补空，列底比按原顺序投放更齐 */
function assign(width: number, count: number): number[][] {
  const gap = readGap();
  const colWidth = (width - gap * (count - 1)) / count;
  const order = cards.map((_, index) => index);
  // 降序：先放最高的图（LPT），小图留到最后去补空
  order.sort((a, b) => colWidth / ratios[b] - colWidth / ratios[a]);

  const result: number[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const index of order) {
    let target = 0;
    for (let i = 1; i < count; i += 1) {
      if (heights[i] < heights[target]) target = i;
    }
    result[target].push(index);
    heights[target] += colWidth / ratios[index] + gap;
  }
  // 列内恢复 JSON 顺序，读屏与视觉顺序仍与数据一致
  for (const bucket of result) bucket.sort((a, b) => a - b);
  return result;
}

/** 把较矮列整体等比放大一点，让列底尽量齐平（cover 只做轻微裁切） */
function applyHeights(width: number, count: number): void {
  const gap = readGap();
  const colWidth = (width - gap * (count - 1)) / count;
  const base = ratios.map((ratio) => colWidth / ratio);
  const gaps = buckets.map((bucket) => gap * Math.max(0, bucket.length - 1));
  const net = buckets.map((bucket, c) => bucket.reduce((sum, i) => sum + base[i], 0) + gaps[c]);
  const target = Math.max(...net);

  buckets.forEach((bucket, c) => {
    const ownGaps = gaps[c];
    const ownNet = net[c] - ownGaps;
    const wanted = target - ownGaps;
    const scale = Math.min(MAX_STRETCH, Math.max(1, wanted / ownNet));
    for (const i of bucket) {
      const media = medias[i];
      const finalHeight = base[i] * scale;
      media.style.aspectRatio = 'auto';
      media.style.height = `${finalHeight.toFixed(2)}px`;
      // 极矮的卡片实在塞不下两行简介，浮层精简成「标题 + 日期」；
      // 阈值定得低，避免窄屏下大多数卡片都被误判
      cards[i].classList.toggle('is-short', finalHeight < 170);
    }
  });
}

function layout(): void {
  if (!grid || cards.length === 0) return;
  const width = grid.clientWidth;
  if (width <= 0 || width === lastWidth) return;
  lastWidth = width;

  // 图片很少时别硬分 5 列，否则每列只有一张、底部必然留大空洞
  const wanted = columnsFor(width);
  const count = Math.min(wanted, Math.max(1, Math.ceil(cards.length / 2)));
  if (count !== columnCount) {
    columnCount = count;
    buckets = assign(width, count);
    columns = Array.from({ length: count }, () => {
      const el = document.createElement('div');
      el.className = 'gallery-column';
      return el;
    });
    buckets.forEach((bucket, c) => {
      for (const i of bucket) columns[c].appendChild(cards[i]);
    });
    grid.replaceChildren(...columns);
  }
  applyHeights(width, count);
}

/** 跟随主站主题（不加载主站脚本，只读同一个 localStorage 键） */
function syncTheme(): void {
  const apply = (): void => {
    let mode: string | null = null;
    try {
      mode = localStorage.getItem(THEME_MODE_KEY);
    } catch {
      // 隐私模式下 localStorage 可能不可用，按系统偏好处理
    }
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = mode === 'dark' || ((!mode || mode === 'auto') && systemDark);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  };
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
}

function watchResize(): void {
  if (!grid) return;
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => layout()).observe(grid);
  } else {
    window.addEventListener('resize', layout, { passive: true });
  }
}

async function init(): Promise<void> {
  syncTheme();
  if (!grid) return;
  setStatus('正在整理图片…', '正在读取 /json/gallery.json');

  let data: GalleryData;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as GalleryData;
  } catch (err) {
    setStatus('图库数据没能加载', `检查 ${DATA_URL} 是否存在、是否为合法 JSON。${String(err)}`);
    return;
  }

  const items = Array.isArray(data.items) ? data.items.filter((it) => it && it.url) : [];
  if (items.length === 0) {
    clearStatus();
    if (countEl) countEl.textContent = '0 张';
    setStatus('图库还是空的', `往 ${DATA_URL} 的 items 里加几条图片信息就会出现在这里。`);
    return;
  }

  const resolved = await resolveRatios(items);
  items.forEach((item, index) => {
    ratios.push(resolved[index]);
    const { card, media } = makeCard(item, resolved[index]);
    cards.push(card);
    medias.push(media);
  });

  if (countEl) countEl.textContent = `${items.length} 张`;
  clearStatus();
  layout();
  watchResize();
  // 首帧可能还没拿到 clientWidth（字体/布局未稳），补一次校正
  requestAnimationFrame(layout);
}

void init();
