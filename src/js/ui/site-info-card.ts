// /js/ui/site-info-card.ts
// 网站信息卡渲染器（原「个人信息卡片」）。
//
// 定位变了：不再是身份档案，而是**这个站点本身**的一张名片 ——
// 它叫什么、跑了多久、攒了多少内容，以及此刻（地理 / 天气 / 日期 / 季节）
// 的一句描述。
//
// 联系方式与技术栈已迁往 /about/：那些是「我是谁」，不是「这个站是什么」。
// 完整版留在关于页，这里只留两个出口。

import { CONFIG, Utils } from '/js/core/core.js';
import { dataService } from '/js/core/data-service.js';
import { getWeather, subscribeWeather } from '/js/core/weather-service.js';
import { ensureLunar, getLunar, subscribeLunar } from '/js/core/lunar-service.js';
import { generateAmbientText } from '/js/ui/site-ambient-text.js';

/** 容器 id：模板与 Python 生成器里的挂载点 */
export const SITE_INFO_CONTAINER_ID = 'site-info-card-container';
/** 「此刻」文案节点 id，天气到达后单独更新它 */
const AMBIENT_ID = 'siteAmbientText';
/** 建站日期展示格式 */
const BIRTH_LABEL = formatBirth(CONFIG.SITE_BIRTH);

let cachedHTML: string | null = null;

/** 统计数字：SPA 重渲染时先用已知值同步出图，避免占位符在每次跳转时闪一下 */
const statsCache: { articles: string | null; works: string | null } = {
  articles: null,
  works: null,
};

/** 天气订阅句柄：重复渲染时先解绑，避免叠加出多个监听 */
let unsubWeather: (() => void) | null = null;
/** 农历订阅句柄 */
let unsubLunar: (() => void) | null = null;
/** 整点重绘的定时器是页面级单例（跨小时都要换文案），只需启动一次 */
let ambientClockStarted = false;

function formatBirth(birth: Date): string {
  const y = birth.getFullYear();
  const m = String(birth.getMonth() + 1).padStart(2, '0');
  const d = String(birth.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

/** 档案行（图标 + 文字），样式见 core/layout.css 的 .profile-info-item */
function infoItem(icon: string, body: string): string {
  return `<div class="profile-info-item"><i class="fas ${icon}" aria-hidden="true"></i><span>${body}</span></div>`;
}

export function generateSiteInfoCardHTML(): string {
  const age = Utils.getSiteAgeParts(CONFIG.SITE_BIRTH);
  return `
    <div class="profile-card site-info-card">
      <div class="profile-header">
        <h2 class="profile-name">高新炀的小站</h2>
        <p class="profile-bio">写点东西，做点东西</p>
      </div>

      <p class="site-ambient" id="${AMBIENT_ID}">${ambientMarkup()}</p>

      <div class="profile-body">
        ${infoItem('fa-clock', `已运行 <b>${age.days}</b> 天`)}
        ${infoItem(
          'fa-pen-nib',
          `<a href="/articles/"><span id="siteStatArticles">${
            statsCache.articles ?? '—'
          }</span> 篇文章</a> · <a href="/works/"><span id="siteStatWorks">${
            statsCache.works ?? '—'
          }</span> 个作品</a>`,
        )}
        ${infoItem('fa-rocket', `建站于 ${BIRTH_LABEL}`)}
      </div>

      <div class="profile-actions">
        <a class="profile-action" href="/about/">关于我<i class="fas fa-arrow-right" aria-hidden="true"></i></a>
        <a class="profile-action" href="/contact/">留言板<i class="fas fa-arrow-right" aria-hidden="true"></i></a>
      </div>
    </div>
  `;
}

/**
 * 「此刻」文案随两件事变：天气到达（异步）与跨小时（时段词变了）。
 *
 * 天气走订阅而不是轮询；整点重绘走一个 60s 的检查，且只在文案真的变了
 * 才写 DOM —— 否则每分钟都要触发一次无谓的重排。
 */
/**
 * 三段文案的初始标记。
 *
 * 只用 textContent 写入，所以这里只搭结构、不填内容 —— 内容全部来自
 * API（城市名、节日名等外部数据），交给 DOM 文本节点最稳，无需转义。
 */
function ambientMarkup(): string {
  return (
    '<span class="ambient-scene"></span>' +
    '<span class="ambient-lunar"></span>' +
    '<span class="ambient-note"></span>'
  );
}

/** 把三段写进对应 span：逐段比较，只有变化的那段才动 DOM */
function paintAmbient(root: HTMLElement): void {
  const text = generateAmbientText(getWeather(), getLunar());
  const parts: Array<[string, string | null]> = [
    ['.ambient-scene', text.scene],
    ['.ambient-lunar', text.lunarLine],
    ['.ambient-note', text.note],
  ];
  for (const [sel, value] of parts) {
    const el = root.querySelector(sel);
    if (!el) continue;
    if (value) {
      if (el.textContent !== value) el.textContent = value;
      el.removeAttribute('hidden');
    } else {
      // 没有这一段（例如不值得提醒）就整段隐藏，不留空行
      if (el.textContent) el.textContent = '';
      el.setAttribute('hidden', '');
    }
  }
}

/**
 * 「此刻」文案随三件事变：天气到达、农历到达（都异步）与跨小时（时段词变了）。
 *
 * 天气 / 农历走订阅而不是轮询；整点重绘走一个 60s 的检查，且只在文案真的变了
 * 才写 DOM —— 否则每分钟都要触发一次无谓的重排。
 */
function bindAmbientText(): void {
  const el = document.getElementById(AMBIENT_ID);
  if (!el) return;

  const paint = (): void => paintAmbient(el);

  paint();

  unsubWeather?.();
  unsubWeather = subscribeWeather(() => paint());
  unsubLunar?.();
  unsubLunar = subscribeLunar(() => paint());
  // 农历与天气都是"用到才取"，这里顺手发起一次（幂等，已缓存则直接返回）
  void ensureLunar();

  if (!ambientClockStarted) {
    ambientClockStarted = true;
    setInterval(() => {
      // 节点可能已被 SPA 换掉，重新取一次；取不到就等下次渲染再绑
      const now = document.getElementById(AMBIENT_ID);
      if (now) paintAmbient(now);
    }, 60_000);
  }
}

/**
 * 用统计数据刷新「N 篇文章 · M 个作品」。
 * dataService 自带内存缓存与并发去重，SPA 每次跳转都调用也不会重复请求。
 * 拿到新数字后把 cachedHTML 置空，让下一次渲染直接带上正确的值。
 */
async function refreshStats(): Promise<void> {
  try {
    const stats = await dataService.getStatistics();
    const articles = stats.total_articles == null ? null : String(stats.total_articles);
    const works = stats.total_works == null ? null : String(stats.total_works);
    const changed = articles !== statsCache.articles || works !== statsCache.works;
    statsCache.articles = articles;
    statsCache.works = works;
    if (!changed) return;

    cachedHTML = null;
    const articlesEl = document.getElementById('siteStatArticles');
    const worksEl = document.getElementById('siteStatWorks');
    if (articlesEl && articles != null) articlesEl.textContent = articles;
    if (worksEl && works != null) worksEl.textContent = works;
  } catch (err) {
    console.warn('[SiteInfoCard] 统计信息加载失败:', err);
  }
}

export function renderSiteInfoCard(): void {
  const container = document.getElementById(SITE_INFO_CONTAINER_ID);
  if (!container) return;

  if (!cachedHTML) {
    cachedHTML = generateSiteInfoCardHTML();
  }

  if (container.innerHTML !== cachedHTML) {
    container.innerHTML = cachedHTML;
    bindAmbientText();
    const card = container.querySelector('.profile-card');
    if (card) {
      requestAnimationFrame(() => card.classList.add('visible'));
    }
  } else {
    // DOM 未变（同一个容器节点）：订阅仍然有效，但农历 / 天气可能刚到，
    // 重新绑一次并刷一遍文案（内部逐段比较，没变化就不动 DOM）
    bindAmbientText();
    const card = container.querySelector('.profile-card');
    if (card && !card.classList.contains('visible')) {
      requestAnimationFrame(() => card.classList.add('visible'));
    }
  }

  void refreshStats();
}
