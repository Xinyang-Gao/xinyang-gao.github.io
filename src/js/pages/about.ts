// /js/pages/about.ts
import { PageBase } from '/js/core/page-manager.js';
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';

const BIRTHDAY = new Date(2010, 11, 21);

// ---------- 纯函数 ----------
function getAge(birthday: Date): number {
  const now = new Date();
  let age = now.getFullYear() - birthday.getFullYear();
  const m = now.getMonth() - birthday.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthday.getDate())) age--;
  return age;
}

function getTitle(age: number): string {
  if (age < 12) return '小萌新';
  if (age < 14) return '见习勇者';
  if (age < 16) return '勇者学徒';
  if (age < 18) return '初级勇者';
  if (age < 22) return '中级勇者';
  return '传奇勇者';
}

function getThisYearBirthday(birthday: Date): Date {
  const now = new Date();
  return new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate());
}

function getNextBirthday(birthday: Date): Date {
  const now = new Date();
  const thisYear = getThisYearBirthday(birthday);
  return thisYear > now
    ? thisYear
    : new Date(now.getFullYear() + 1, birthday.getMonth(), birthday.getDate());
}

function getStartBirthday(birthday: Date): Date {
  const now = new Date();
  const thisYear = getThisYearBirthday(birthday);
  return thisYear <= now
    ? thisYear
    : new Date(now.getFullYear() - 1, birthday.getMonth(), birthday.getDate());
}

// ---------- 页面管理器 ----------
export class AboutPageManager extends PageBase {
  private updateTimer: number | null = null;
  private revealObserver: IntersectionObserver | null = null;
  private twikooContainer: HTMLElement | null = null;

  // 里程碑
  private milestoneResizeObserver: ResizeObserver | null = null;
  private milestoneRaf: number | null = null;

  protected mount(): void {
    this.updateUI();
    this.scheduleUpdate();
    this.initComments();
    this.initGithubContrib();
    this.initRevealAnimation();
    this.initMilestones();
  }

  protected unmount(): void {
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.revealObserver?.disconnect();
    this.revealObserver = null;

    this.milestoneResizeObserver?.disconnect();
    this.milestoneResizeObserver = null;
    if (this.milestoneRaf !== null) {
      cancelAnimationFrame(this.milestoneRaf);
      this.milestoneRaf = null;
    }

    if (this.twikooContainer) {
      destroyTwikoo(this.twikooContainer);
      this.twikooContainer = null;
    }
  }

  private updateUI(): void {
    const now = new Date();
    const age = getAge(BIRTHDAY);
    const title = getTitle(age);

    const levelDisplay      = document.getElementById('levelDisplay');
    const titleDisplay      = document.getElementById('titleDisplay');
    const expFill           = document.getElementById('expFill');
    const expPercent        = document.getElementById('expPercent');
    const expEarnedDisplay  = document.getElementById('expEarnedDisplay');
    const expTotalDisplay   = document.getElementById('expTotalDisplay');
    const uptimeDisplay     = document.getElementById('uptimeDisplay');
    const nextLevelInfo     = document.getElementById('nextLevelInfo');

    if (levelDisplay) levelDisplay.textContent = String(age);
    if (titleDisplay) titleDisplay.textContent = title;

    const startBday = getStartBirthday(BIRTHDAY);
    const nextBday  = getNextBirthday(BIRTHDAY);
    const totalMs   = nextBday.getTime() - startBday.getTime();
    const elapsedMs = now.getTime() - startBday.getTime();
    const progress  = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

    if (expFill) expFill.style.setProperty('--w', progress + '%');
    if (expPercent) expPercent.textContent = Math.floor(progress) + '%';

    const totalXp  = Math.floor(totalMs / 60000);
    const earnedXp = Math.floor(elapsedMs / 60000);
    if (expEarnedDisplay) expEarnedDisplay.textContent = earnedXp.toLocaleString();
    if (expTotalDisplay)  expTotalDisplay.textContent  = totalXp.toLocaleString();

    const remainingMs    = Math.max(0, nextBday.getTime() - now.getTime());
    const remainingHours = Math.ceil(remainingMs / 3_600_000);
    const dateStr = nextBday.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    if (nextLevelInfo) {
      nextLevelInfo.innerHTML =
        `<i class="fas fa-hourglass-half" aria-hidden="true"></i>` +
        `<span>下一级解锁 · 剩余 <strong>${remainingHours.toLocaleString()}</strong> 小时</span>`;
      nextLevelInfo.setAttribute('data-tooltip', `预计升级日期：${dateStr}`);
    }

    const uptimeMs = now.getTime() - BIRTHDAY.getTime();
    const uptimeHours = Math.floor(uptimeMs / 3_600_000);
    if (uptimeDisplay) {
      uptimeDisplay.textContent = uptimeHours.toLocaleString() + ' 小时';
    }
  }

  private scheduleUpdate(): void {
    if (this.updateTimer !== null) clearTimeout(this.updateTimer);
    const delay = 5000 + Math.random() * 10000;
    this.updateTimer = window.setTimeout(() => {
      this.updateUI();
      this.scheduleUpdate();
    }, delay);
  }

  // ---------- 滚动显现 ----------
  private initRevealAnimation(): void {
    const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (targets.length === 0) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('revealed'));
      return;
    }

    this.revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(el => this.revealObserver?.observe(el));
  }

  // ============================================================
  // 里程碑：蜿蜒时间线
  // ============================================================
  private initMilestones(): void {
    // 首次渲染（等一帧，确保布局完成）
    requestAnimationFrame(() => this.renderMilestones());

    const track = document.getElementById('milestoneTrack');
    if (!track) return;

    if ('ResizeObserver' in window) {
      this.milestoneResizeObserver = new ResizeObserver(() => {
        this.scheduleMilestoneRender();
      });
      this.milestoneResizeObserver.observe(track);
      // 交清理栈托管，避免 unmount 遗漏（ResizeObserver 不 disconnect 会持续触发）
      this.stack.addObserver(this.milestoneResizeObserver);
    } else {
      // 降级分支必须登记清理：原来直接 addEventListener，unmount 从不移除，
      // 页面销毁后 resize 仍会触发 renderMilestones()。
      this.stack.addEventListener(window, 'resize', this.scheduleMilestoneRender, {
        passive: true,
      });
    }
  }

  private scheduleMilestoneRender = (): void => {
    if (this.milestoneRaf !== null) return;
    this.milestoneRaf = requestAnimationFrame(() => {
      this.milestoneRaf = null;
      this.renderMilestones();
    });
  };

/**
 * 里程碑渲染
 *
 * · 横向：非均匀权重（三频正弦叠加），避免等距感
 * · 纵向：难度数字（data-level 1-5）映射到高度，附带时间上升趋势 + 抖动
 *   → 难度越高 = 节点越高；随着时间推进，整体呈现上升趋势
 * · 曲线：Catmull-Rom → Bezier，平滑穿过每个节点
 */
private renderMilestones(): void {
  const track = document.getElementById('milestoneTrack');
  const svg   = document.getElementById('milestoneSvg') as unknown as SVGSVGElement | null;
  const path  = document.getElementById('milestonePath') as unknown as SVGPathElement | null;
  if (!track || !svg || !path) return;

  const rect = track.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (W < 10 || H < 10) return;

  const nodes = Array.from(track.querySelectorAll<HTMLElement>('.milestone-node'));
  const N = nodes.length;
  if (N === 0) return;

  if (N === 1) {
    nodes[0].style.left = W / 2 + 'px';
    nodes[0].style.top  = H / 2 + 'px';
    return;
  }

  // ---------- 1. 非均匀水平权重 ----------
  const segs = N - 1;
  const weights: number[] = [];
  for (let i = 0; i < segs; i++) {
    const w = 0.75
            + Math.sin(i * 1.37 + 0.9) * 0.18
            + Math.cos(i * 2.11 + 2.2) * 0.12;
    weights.push(Math.max(0.50, w));
  }
  const totalW = weights.reduce((s, w) => s + w, 0);
  const uPos: number[] = [0];
  let cum = 0;
  for (let i = 0; i < segs; i++) {
    cum += weights[i];
    uPos.push(cum / totalW);
  }

  // ---------- 2. 难度 → 高度 ----------
  const MIN_LEVEL  = 1;
  const MAX_LEVEL  = 5;
  const TOP_PAD    = 34;      // 顶部留白
  const BOTTOM_PAD = 34;      // 底部留白
  const rangeH     = Math.max(60, H - TOP_PAD - BOTTOM_PAD);

  const levels = nodes.map(node => {
    const v = parseFloat(node.dataset.level || '3');
    return Number.isFinite(v)
      ? Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, v))
      : 3;
  });

  // 抖动：避免高度与难度"点对点"对应而显得死板
  const noise = (i: number): number => {
    const raw =
      Math.sin(i * 1.13 + 0.7) * 0.55 +
      Math.sin(i * 2.71 + 2.1) * 0.30 +
      Math.cos(i * 3.97 + 1.4) * 0.15;
    return Math.max(-1, Math.min(1, raw));
  };

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    // x：左端留 4.5% 内边距
    const x = (0.045 + uPos[i] * 0.91) * W;

    // 难度归一化 (0..1)
    const lvlNorm = (levels[i] - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);

    // 时间上升趋势：越靠后，微微向上叠加（强化"上升"的视觉）
    const timeNorm  = i / (N - 1);
    const timeBoost = timeNorm * 0.10;   // 最多抬 10%

    // 组合：难度主导（86%），时间助推，加少量抖动
    const rawH = lvlNorm * 0.86 + timeBoost + noise(i) * 0.05;
    const hNorm = Math.max(0, Math.min(1, rawH));

    // 高度 → y 坐标（hNorm=1 靠顶部，hNorm=0 靠底部）
    const y = TOP_PAD + (1 - hNorm) * rangeH;

    points.push({ x, y });
  }

  // ---------- 3. Catmull-Rom → Bezier ----------
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)},`
       + ` ${c2x.toFixed(1)} ${c2y.toFixed(1)},`
       + ` ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  path.setAttribute('d', d);

  // ---------- 4. 吸附节点 ----------
  nodes.forEach((node, i) => {
    node.style.left = points[i].x + 'px';
    node.style.top  = points[i].y + 'px';
  });
}

  // ---------- 评论区 ----------
  private initComments(): void {
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    this.twikooContainer = container;
    destroyTwikoo(container);
    initTwikoo(container).catch(console.warn);
  }

  // ---------- GitHub 贡献图 ----------
  private initGithubContrib(): void {
    const ghContainer = document.getElementById('gh');
    const ghGraph = (window as any).GhContribGraph;
    if (ghContainer && typeof ghGraph !== 'undefined') {
      try {
        ghGraph.init();
        console.log('[About] GitHub 贡献图已初始化');
      } catch (e) {
        console.warn('[About] GitHub 贡献图初始化失败:', e);
      }
    }
  }
}