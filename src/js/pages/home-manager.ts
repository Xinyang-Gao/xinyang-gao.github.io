// /js/pages/home-manager.ts
import { PageBase } from '/js/core/page-manager.js';
import { dataService } from '/js/core/data-service.js';
import { Utils } from '/js/core/core.js';
import { fetchAndReplaceContent } from '/js/router/router.js';

/** UAPI 名言归一化结构 */
interface Saying {
  text: string;
  author: string;
  source: string;
  category: string;
  uuid: string;
  bio: string;
}

/** 本地兜底池：与远程结构对齐 */
const LOCAL_QUOTES: Saying[] = [
  {
    text: '代码是写给人读的，只是顺便能在机器上运行。',
    author: 'Harold Abelson',
    source: 'SICP',
    category: '编程',
    uuid: '',
    bio: '',
  },
  {
    text: '我们一路奋战，不是为了改变世界，而是为了不让世界改变我们。',
    author: '老男孩',
    source: '老男孩',
    category: '影视',
    uuid: '',
    bio: '',
  },
  {
    text: '所谓无底深渊，下去，也是前程万里。',
    author: '木心',
    source: '素履之往',
    category: '文学',
    uuid: '',
    bio: '',
  },
];

/**
 * UAPI 一言（随机）接口。
 * 站点从未加载过 UAPI 的 JS SDK，`window.uapiClient` 恒为 undefined，
 * 因此这里直接调用公开 REST 端点（支持 CORS，无需 API Key）。
 * 文档：https://uapis.cn/docs/api-reference/get-saying-random
 */
const UAPI_ENDPOINT = 'https://uapis.cn/api/v1/saying/random';
const UAPI_CATEGORY = '文学';
const UAPI_TIMEOUT = 6000;

export class HomePageManager extends PageBase {
  private isDestroyed = false;
  private lastQuoteUuid = '';
  private isQuoteLoading = false;
  /** 当前进行中的名言请求，用于切换页面/连点时取消 */
  private quoteAbort: AbortController | null = null;

  /* ---------- 生命周期 ---------- */

  protected mount(): void {
    this.loadStatisticsAndTags();
    this.bindGlobalNavigateEvents();
    this.startGreetingUpdater();
    this.startLiveClock();
    this.setupReveal();
    this.bindQuoteRefresh();
    // 初始加载一条名言（必须 catch：否则异常会变成未处理的 Promise 拒绝）
    this.loadQuote().catch((err) => console.warn('[Home] 初始化名言失败:', err));
  }

  protected unmount(): void {
    this.isDestroyed = true;
    this.quoteAbort?.abort();
    this.quoteAbort = null;
  }

  /* ---------- 统计与标签 ---------- */

  private loadStatisticsAndTags(): void {
    const container = document.getElementById('statsContainer');
    if (!container) return;

    dataService
      .getStatistics()
      .then((stat: any) => {
        const items = [
          { value: stat.total_articles ?? 0, label: '文章总数', type: 'articles' },
          { value: stat.total_word_count ?? 0, label: '累计字数', type: '', accent: true },
          { value: stat.total_works ?? 0, label: '作品数量', type: 'works' },
          { value: stat.total_article_categories ?? 0, label: '文章分类', type: '' },
          { value: stat.total_article_tags ?? 0, label: '文章标签', type: '' },
          { value: stat.total_work_tags ?? 0, label: '作品标签', type: '' },
        ];

        container.innerHTML = items
          .map((it: any) => {
            const clickable = it.type
              ? ` data-stat-type="${it.type}" role="link" tabindex="0" title="点击查看"`
              : '';
            const accent = it.accent ? ' stat-cell--accent' : '';
            return `<div class="stat-cell${accent}"${clickable}>
                <span class="stat-number" data-target="${it.value}">0</span>
                <span class="stat-label">${it.label}</span>
              </div>`;
          })
          .join('');

        this.animateCounters(container);
        this.updateTagsList(stat.article_tags || [], '#articleTagsList');
        this.updateTagsList(stat.work_tags || [], '#workTagsList');

        const badge = document.getElementById('statsUpdateBadge');
        if (badge) badge.textContent = `最后更新 · ${stat.last_updated || '未知'}`;
      })
      .catch(() => {
        container.innerHTML =
          `<div class="stats-empty"><i class="fas fa-cloud-moon"></i>统计信息正在星海漂流，稍后再来看看吧~</div>`;
      });
  }

  /* 数字滚动（easeOutCubic，尊重减弱动画偏好） */
  private animateCounters(root: HTMLElement): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll<HTMLElement>('.stat-number[data-target]').forEach((el) => {
      const target = Number(el.dataset.target) || 0;
      if (reduce) {
        el.textContent = target.toLocaleString('zh-CN');
        return;
      }
      const duration = 1200;
      const start = performance.now();
      const tick = (now: number) => {
        if (this.isDestroyed) return;
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString('zh-CN');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* 标签云：按词频分三级字号，计数以徽章呈现 */
  private updateTagsList(tags: any[], containerId: string): void {
    const container = document.querySelector(containerId);
    if (!container) return;

    const list = (tags || [])
      .map((t: any) =>
        typeof t === 'string'
          ? { name: t, count: 0 }
          : { name: t.name || '', count: t.count || 0 }
      )
      .filter((t: any) => t.name);

    if (!list.length) {
      container.innerHTML = '<span class="tag">暂无标签</span>';
      return;
    }

    const max = Math.max(...list.map((t: any) => t.count), 1);
    container.innerHTML = list
      .map((t: any) => {
        const ratio = t.count / max;
        const size = ratio >= 0.66 ? 'tag--lg' : ratio >= 0.33 ? 'tag--md' : 'tag--sm';
        const count = t.count ? `<span class="tag-count">${t.count}</span>` : '';
        return `<span class="tag ${size}" data-tag-name="${Utils.escapeHtml(t.name)}">${Utils.escapeHtml(t.name)}${count}</span>`;
      })
      .join('');
  }

  /* ---------- 事件委托（与原行为一致 + 键盘可达） ---------- */

  private bindGlobalNavigateEvents(): void {
    this.stack.addEventListener(document, 'click', ((e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const statCell = target.closest<HTMLElement>('.stat-cell[data-stat-type]');
      if (statCell) {
        e.preventDefault();
        this.navigate(
          statCell.dataset.statType === 'articles' ? '/articles/' : '/works/'
        );
        return;
      }

      const tagEl = target.closest<HTMLElement>('.tags-list .tag');
      if (tagEl && tagEl.dataset.tagName) {
        const isArticleZone = !!tagEl.closest('#articleTagsList');
        this.navigate(
          `${isArticleZone ? '/articles/' : '/works/'}?tags=${encodeURIComponent(tagEl.dataset.tagName)}`
        );
      }
    }) as EventListener);

    this.stack.addEventListener(document, 'keydown', ((e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>(
        '.stat-cell[data-stat-type]'
      );
      if (cell) {
        e.preventDefault();
        cell.click();
      }
    }) as EventListener);
  }

  /** 直接调用 router 导出的模块函数，不再依赖 window.fetchAndReplaceContent */
  private navigate(href: string): void {
    fetchAndReplaceContent(href, true).catch((err) => {
      console.warn('[HomePageManager] SPA 导航失败，回退整页跳转', err);
      window.location.href = href;
    });
  }

  /* ---------- 动态问候 ---------- */
  private startGreetingUpdater(): void {
    const update = (): void => {
      const el = document.getElementById('dynamic-greeting');
      if (el) el.textContent = Utils.getGreetingMessage();
    };
    update();
    const timer = setInterval(update, 60000);
    this.stack.addInterval(timer);
  }

  /* ---------- 实时时钟 ---------- */
  private startLiveClock(): void {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const render = (): void => {
      el.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    };
    render();
    const timer = setInterval(render, 1000);
    this.stack.addInterval(timer);
  }

  /* ---------- 滚动渐显 ---------- */
  private setupReveal(): void {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            observer.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => observer.observe(el));
    this.stack.addObserver(observer);
  }

  /* ---------- 名言相关 ---------- */

  /**
   * 归一化 UAPI 返回体：
   * 兼容 `{data}` 包装、`{item}` 包装（daily/recommend/moment 模式）与裸对象，
   * 同时兼容 `content` / `text` 两种正文字段名。
   */
  private normalizeQuote(raw: any): Saying | null {
    let d: any = raw;
    if (d && typeof d === 'object') {
      if (d.data && typeof d.data === 'object') d = d.data;
      if (d.item && typeof d.item === 'object') d = d.item;
    }
    if (!d || typeof d !== 'object') return null;

    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const text = str(d.content) || str(d.text) || str(d.saying);
    if (!text) return null;

    return {
      text,
      author: str(d.author),
      source: str(d.source),
      category: str(d.category) || str(d.corpus),
      uuid: str(d.uuid),
      bio: str(d.authorinfo?.description) || str(d.authorinfo?.bio),
    };
  }

  /** 请求一条随机语录；超时/失败由调用方降级处理 */
  private async requestSaying(category?: string): Promise<unknown> {
    const url = new URL(UAPI_ENDPOINT);
    url.searchParams.set('mode', 'random');
    if (category) url.searchParams.set('category', category);

    // 连点"换一句"时取消上一请求，避免旧响应覆盖新结果
    this.quoteAbort?.abort();
    const ac = new AbortController();
    this.quoteAbort = ac;

    const timer = setTimeout(() => ac.abort(), UAPI_TIMEOUT);
    try {
      const res = await fetch(url.href, {
        signal: ac.signal,
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`UAPI HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
      if (this.quoteAbort === ac) this.quoteAbort = null;
    }
  }

  private async fetchRemoteQuote(): Promise<Saying | null> {
    try {
      // 指定分类可能命中不到（404 / 空结果），放宽条件再试一次
      let q = this.normalizeQuote(await this.requestSaying(UAPI_CATEGORY));
      if (!q) q = this.normalizeQuote(await this.requestSaying());

      // 随机模式偶尔撞到同一条：重试一次，保证"换一句"真的换了
      if (q?.uuid && q.uuid === this.lastQuoteUuid) {
        const retry = this.normalizeQuote(await this.requestSaying(UAPI_CATEGORY));
        if (retry) q = retry;
      }
      if (q?.uuid) this.lastQuoteUuid = q.uuid;
      return q;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' && this.isDestroyed) return null;
      console.warn('[quote] 远程名言获取失败，回退本地：', err);
      return null;
    }
  }

  private async loadQuote(): Promise<void> {
    if (this.isQuoteLoading || this.isDestroyed) return;
    this.isQuoteLoading = true;

    const quote = document.querySelector('.inspire-quote');
    if (!quote) {
      this.isQuoteLoading = false;
      return;
    }

    const sourceEl = quote.querySelector<HTMLElement>('.inspire-source');
    // .quote-text 缺失时退回第一个段落，避免整块语录停在占位符
    const textEl = quote.querySelector('.quote-text') ?? quote.querySelector('p');
    const authorEl = quote.querySelector<HTMLElement>('.inspire-author');

    if (!textEl || !authorEl) {
      this.isQuoteLoading = false;
      return;
    }

    try {
      quote.classList.add('is-swapping');
      await new Promise((resolve) => setTimeout(resolve, 260));

      if (this.isDestroyed) return;

      let q = await this.fetchRemoteQuote();
      let isRemote = !!q;
      if (!q) {
        const local = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
        q = { ...local, uuid: '' };
        isRemote = false;
      }

      if (this.isDestroyed) return;

      textEl.textContent = q.text;
      const who = [q.author, q.source ? `《${q.source}》` : ''].filter(Boolean).join(' ');
      authorEl.textContent = who || '佚名';
      if (q.bio) authorEl.setAttribute('title', q.bio);
      else authorEl.removeAttribute('title');

      if (sourceEl) {
        sourceEl.textContent = isRemote ? `UAPI · ${q.category || UAPI_CATEGORY}` : '本地收藏';
        sourceEl.classList.toggle('is-local', !isRemote);
      }
    } finally {
      quote.classList.remove('is-swapping');
      this.isQuoteLoading = false;
    }
  }

  private bindQuoteRefresh(): void {
    const btn = document.getElementById('quoteRefresh');
    if (!btn) return;
    this.stack.addEventListener(btn, 'click', () => {
      this.loadQuote().catch((err) =>
        console.warn('[Home] 刷新名言失败:', err)
      );
    });
  }
}

export async function initHomePage(): Promise<HomePageManager> {
  const manager = new HomePageManager();
  // 必须 await：原来直接返回未完成的 Promise，mount() 内的异常会变成未处理拒绝，
  // 且 router 会在页面尚未挂载完成时就认为初始化成功。
  await manager.init();
  return manager;
}