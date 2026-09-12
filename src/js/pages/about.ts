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
  private flipAbortController: AbortController | null = null;
  private resizeTimer: number | null = null;
  private twikooContainer: HTMLElement | null = null;

  protected mount(): void {
    this.updateUI();
    this.scheduleUpdate();
    this.initFlipCard();
    this.initComments();
    this.initGithubContrib();
  }

  protected unmount(): void {
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.flipAbortController?.abort();
    this.flipAbortController = null;
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
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

    const levelDisplay = document.getElementById('levelDisplay');
    const titleDisplay = document.getElementById('titleDisplay');
    const expFill = document.getElementById('expFill');
    const expPercent = document.getElementById('expPercent');
    const expEarnedDisplay = document.getElementById('expEarnedDisplay');
    const expTotalDisplay = document.getElementById('expTotalDisplay');
    const uptimeDisplay = document.getElementById('uptimeDisplay');
    const nextLevelInfo = document.getElementById('nextLevelInfo');

    if (levelDisplay) levelDisplay.textContent = 'LV.' + age;
    if (titleDisplay) titleDisplay.textContent = title;

    const startBday = getStartBirthday(BIRTHDAY);
    const nextBday = getNextBirthday(BIRTHDAY);
    const totalMs = nextBday.getTime() - startBday.getTime();
    const elapsedMs = now.getTime() - startBday.getTime();
    const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

    if (expFill) expFill.style.width = progress + '%';
    if (expPercent) expPercent.textContent = Math.floor(progress) + '%';

    const totalXp = Math.floor(totalMs / 60000);
    const earnedXp = Math.floor(elapsedMs / 60000);
    if (expEarnedDisplay) expEarnedDisplay.textContent = earnedXp.toLocaleString();
    if (expTotalDisplay) expTotalDisplay.textContent = totalXp.toLocaleString();

    const dateStr = nextBday.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    if (nextLevelInfo) {
      nextLevelInfo.innerHTML = `<i class="fas fa-info-circle"></i> 下一级解锁: ${dateStr}`;
    }

    const uptimeMs = now.getTime() - BIRTHDAY.getTime();
    const uptimeHours = Math.floor(uptimeMs / 3600000);
    if (uptimeDisplay) uptimeDisplay.textContent = uptimeHours.toLocaleString() + ' 小时';
  }

  private scheduleUpdate(): void {
    if (this.updateTimer !== null) clearTimeout(this.updateTimer);
    const delay = 5000 + Math.random() * 10000;
    this.updateTimer = window.setTimeout(() => {
      this.updateUI();
      this.scheduleUpdate();
    }, delay);
  }

  private initFlipCard(): void {
    this.flipAbortController?.abort();
    const controller = new AbortController();
    this.flipAbortController = controller;

    const flipBtn = document.getElementById('flipCardBtn');
    const flipCard = document.getElementById('aboutFlipCard');
    const flipBtnLabel = document.getElementById('flipBtnLabel');
    if (!flipBtn || !flipCard) return;

    flipBtn.addEventListener('click', () => {
      flipCard.classList.toggle('flipped');
      if (flipBtnLabel) flipBtnLabel.textContent = '翻转';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      requestAnimationFrame(() => setTimeout(() => this.updateFlipHeight(), 80));
    }, { signal: controller.signal });

    flipCard.addEventListener('transitionend', (e) => {
      const ev = e as TransitionEvent;
      if (ev.propertyName === 'transform' || ev.propertyName === 'min-height') {
        this.updateFlipHeight();
      }
    }, { signal: controller.signal });

    window.addEventListener('resize', () => {
      if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.updateFlipHeight(), 150);
    }, { signal: controller.signal });

    setTimeout(() => this.updateFlipHeight(), 200);
  }

  private updateFlipHeight(): void {
    const flipCard = document.getElementById('aboutFlipCard');
    const inner = flipCard?.querySelector<HTMLElement>('.flip-card-inner');
    const front = flipCard?.querySelector<HTMLElement>('.flip-card-front');
    const back = flipCard?.querySelector<HTMLElement>('.flip-card-back');
    if (!inner || !front || !back || !flipCard) return;

    inner.style.height = 'auto';
    const targetHeight = flipCard.classList.contains('flipped')
      ? back.scrollHeight
      : front.scrollHeight;

    if (targetHeight > 0) {
      const finalHeight = targetHeight + 4;
      inner.style.height = finalHeight + 'px';
      flipCard.style.minHeight = finalHeight + 'px';
    }
  }

  private initComments(): void {
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    this.twikooContainer = container;
    destroyTwikoo(container);
    initTwikoo(container).catch(console.warn);
  }

  private initGithubContrib(): void {
    const ghContainer = document.getElementById('gh');
    const ghGraph = (window as any).GhContribGraph;
    if (ghContainer && typeof ghGraph !== 'undefined') {
      try {
        ghGraph.init();
        console.log('[About] GitHub 贡献图已重新初始化');
      } catch (e) {
        console.warn('[About] GitHub 贡献图初始化失败:', e);
      }
    }
  }
}