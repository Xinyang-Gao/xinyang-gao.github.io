// /js/pages/home-manager.ts
import { PageManager } from '/js/core/page-manager.js';
import { DataService } from '/js/core/data-service.js';

/** UAPI 名言归一化结构 */
interface Saying {
  text: string;
  author: string;
  source: string;    // 出处作品
  category: string;  // 分类
  uuid: string;      // 用于去重
  bio: string;       // 作者简介（悬停提示）
}

/** 本地兜底池：与远程结构对齐 */
const LOCAL_QUOTES: Saying[] = [
  { text: '代码是写给人读的，只是顺便能在机器上运行。', author: 'Harold Abelson', source: 'SICP', category: '编程', uuid: '', bio: '' },
];

const UAPI_PAYLOAD = { category: '文学' }; // 请求参数，具体值按需调整

export class HomePageManager extends PageManager {
  private greetingInterval: ReturnType<typeof setInterval> | null = null;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private quoteHandler: (() => void) | null = null;
  private quoteTimer: ReturnType<typeof setTimeout> | null = null;
  private revealObserver: IntersectionObserver | null = null;

  private lastQuoteUuid = '';
  private isQuoteLoading = false;
  private isDestroyed = false;

  init() {
    this.loadStatisticsAndTags();
    this.bindGlobalNavigateEvents();
    this.startGreetingUpdater();
    this.startLiveClock();
    this.setupReveal();
    this.bindQuoteRefresh();
    this.loadQuote(); // 初始加载一条名言
  }

  /* ---------- 统计与标签 ---------- */
  private loadStatisticsAndTags() {
    const container = document.getElementById('statsContainer');
    if (!container) return;

    DataService.getInstance()
      .getStatistics()
      .then((stat: any) => {
        const items = [
          { value: stat.total_articles ?? 0,           label: '文章总数', type: 'articles' },
          { value: stat.total_word_count ?? 0,         label: '累计字数', type: '', accent: true },
          { value: stat.total_works ?? 0,              label: '作品数量', type: 'works' },
          { value: stat.total_article_categories ?? 0, label: '文章分类', type: '' },
          { value: stat.total_article_tags ?? 0,       label: '文章标签', type: '' },
          { value: stat.total_work_tags ?? 0,          label: '作品标签', type: '' },
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
  private animateCounters(root: HTMLElement) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll<HTMLElement>('.stat-number[data-target]').forEach((el) => {
      const target = Number(el.dataset.target) || 0;
      if (reduce) { el.textContent = target.toLocaleString('zh-CN'); return; }
      const duration = 1200;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString('zh-CN');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* 标签云：按词频分三级字号，计数以徽章呈现 */
  private updateTagsList(tags: any[], containerId: string) {
    const container = document.querySelector(containerId);
    if (!container) return;

    const list = (tags || [])
      .map((t: any) =>
        typeof t === 'string' ? { name: t, count: 0 } : { name: t.name || '', count: t.count || 0 }
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
        return `<span class="tag ${size}" data-tag-name="${this.escapeHtml(t.name)}">${this.escapeHtml(t.name)}${count}</span>`;
      })
      .join('');
  }

  private escapeHtml(str: any): string {
    if (!str) return '';
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return String(str).replace(/[&<>"]/g, (m) => map[m] ?? m);
  }

  /* ---------- 事件委托（与原行为一致 + 键盘可达） ---------- */
  private bindGlobalNavigateEvents() {
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const statCell = target.closest<HTMLElement>('.stat-cell[data-stat-type]');
      if (statCell) {
        e.preventDefault();
        this.navigate(statCell.dataset.statType === 'articles' ? '/articles/' : '/works/');
        return;
      }

      const tagEl = target.closest<HTMLElement>('.tags-list .tag');
      if (tagEl && tagEl.dataset.tagName) {
        const isArticleZone = !!tagEl.closest('#articleTagsList');
        this.navigate(`${isArticleZone ? '/articles/' : '/works/'}?tags=${encodeURIComponent(tagEl.dataset.tagName)}`);
      }
    };
    document.addEventListener('click', this.clickHandler);

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.stat-cell[data-stat-type]');
      if (cell) { e.preventDefault(); cell.click(); }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private navigate(href: string) {
    const w = window as any;
    if (typeof w.fetchAndReplaceContent === 'function') w.fetchAndReplaceContent(href, true);
    else window.location.href = href;
  }

  /* ---------- 动态问候 ---------- */
  private startGreetingUpdater() {
    const update = () => {
      const el = document.getElementById('dynamic-greeting');
      const U = (window as any).Utils;
      if (el && U && U.getGreetingMessage) el.textContent = U.getGreetingMessage();
    };
    update();
    this.greetingInterval = setInterval(update, 60000);
  }

  /* ---------- 实时时钟 ---------- */
  private startLiveClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const render = () => {
      el.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    };
    render();
    this.clockInterval = setInterval(render, 1000);
  }

  /* ---------- 滚动渐显 ---------- */
  private setupReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            this.revealObserver?.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => this.revealObserver!.observe(el));
  }

  /* ---------- 名言相关 ---------- */

  /** 获取 UAPI 客户端（假设全局已有） */
  private getUapiClient(): any {
    return (window as any).uapiClient || null;
  }

  /** 按官方返回结构精确映射（保留一层 data 包装的兼容） */
  private normalizeQuote(raw: any): Saying | null {
    if (!raw) return null;
    const d = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const text = typeof d.content === 'string' ? d.content.trim() : '';
    if (!text) return null;
    return {
      text,
      author:   typeof d.author === 'string' ? d.author.trim() : '',
      source:   typeof d.source === 'string' ? d.source.trim() : '',
      category: typeof d.category === 'string' ? d.category.trim() : '',
      uuid:     typeof d.uuid === 'string' ? d.uuid : '',
      bio:      d.authorinfo?.description || d.authorinfo?.bio || '',
    };
  }

  /** 请求一条远程名言：6s 超时 + uuid 去重（连抽同一条时重试一次） */
  private async fetchRemoteQuote(): Promise<Saying | null> {
    try {
      const client = this.getUapiClient();
      if (!client?.poem?.getSayingRandom) return null;

      const call = () =>
        Promise.race([
          client.poem.getSayingRandom(UAPI_PAYLOAD),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
        ]);

      let q = this.normalizeQuote(await call());
      if (q?.uuid && q.uuid === this.lastQuoteUuid) {
        q = this.normalizeQuote(await call()) ?? q; // 撞车就重抽，仍失败则保留原结果
      }
      if (q?.uuid) this.lastQuoteUuid = q.uuid;
      return q;
    } catch (err) {
      console.warn('[quote] 远程名言获取失败，回退本地：', err);
      return null;
    }
  }

  /** 加载并显示一条名言（带淡入淡出效果） */
  private async loadQuote() {
    if (this.isQuoteLoading || this.isDestroyed) return;
    this.isQuoteLoading = true;

    const quote = document.querySelector('.inspire-quote');
    const sourceEl = document.querySelector<HTMLElement>('.inspire-source');
    const textEl = quote?.querySelector('.quote-text');
    const authorEl = quote?.querySelector<HTMLElement>('.inspire-author');

    if (!quote || !textEl || !authorEl) {
      this.isQuoteLoading = false;
      return;
    }

    // 开始淡出
    quote.classList.add('is-swapping');

    // 等待淡出动画（约 260ms）
    await new Promise(resolve => setTimeout(resolve, 260));

    // 若已销毁则放弃更新
    if (this.isDestroyed) {
      quote.classList.remove('is-swapping');
      this.isQuoteLoading = false;
      return;
    }

    // 获取名言
    let q = await this.fetchRemoteQuote();
    let isRemote = !!q;
    if (!q) {
      // 本地随机取一条
      const local = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
      q = { ...local, uuid: '' };
      isRemote = false;
    }

    // 更新 DOM
    textEl.textContent = q.text;
    // 署名行：作者《来源》
    const who = [q.author, q.source ? `《${q.source}》` : ''].filter(Boolean).join(' ');
    authorEl.textContent = who || '佚名';
    if (q.bio) {
      authorEl.setAttribute('title', q.bio);
    } else {
      authorEl.removeAttribute('title');
    }

    if (sourceEl) {
      sourceEl.textContent = isRemote ? `UAPI · ${q.category || '文学'}` : '本地收藏';
      sourceEl.classList.toggle('is-local', !isRemote);
    }

    // 淡入
    quote.classList.remove('is-swapping');
    this.isQuoteLoading = false;
  }

  /** 绑定“换一句”点击事件 */
  private bindQuoteRefresh() {
    const btn = document.getElementById('quoteRefresh');
    if (!btn) return;

    this.quoteHandler = () => {
      this.loadQuote();
    };
    btn.addEventListener('click', this.quoteHandler);
  }

  /* ---------- 清理 ---------- */
  destroy() {
    this.isDestroyed = true;
    if (this.greetingInterval) clearInterval(this.greetingInterval);
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    if (this.clickHandler) document.removeEventListener('click', this.clickHandler);
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    if (this.quoteHandler) {
      document.getElementById('quoteRefresh')?.removeEventListener('click', this.quoteHandler);
    }
    this.revealObserver?.disconnect();
    this.greetingInterval = this.clockInterval = null;
    this.clickHandler = this.keyHandler = null;
    this.quoteHandler = null;
    this.revealObserver = null;
  }
}

export function initHomePage() {
  const manager = new HomePageManager();
  manager.init();
  return manager;
}