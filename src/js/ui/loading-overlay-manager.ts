// /js/ui/loading-overlay-manager.ts
// 加载覆盖层：版本检测、数据预加载、更新提示
//
// 布局约定：
//  - LOGO 居中；左侧 .loading-log 显示最近 5 行日志（新的在上）。
//  - 右侧 .loading-done 显示最近 5 条已完成项（绿色）。
//  - 溢出（第 6 条）时，触发与 tooltip 完全一致的淡出：
//      每个字符独立随机 delay(0~200ms) / duration(300~600ms) / translateY(30~80px)
//  - 进入更新态 / 关闭覆盖层前，两栏所有字符统一执行相同淡出。

import { CONFIG, storageController, Utils } from '/js/core/core.js';
import { dataService } from '/js/core/data-service.js';

interface VersionEntry {
  id: number;
  version: string;
  date?: string;
  changes?: Array<{ type: string; description: string }>;
}

interface VersionInfo {
  allVersions: VersionEntry[];
  latestWebVersion: string | null;
  storedVersion: string | null;
  lastVisit: number | null;
  needUpdate: boolean;
}

/** 更新内容入场后，等待其稳定多久才开始淡出（毫秒） */
const LOG_FADE_DELAY_MS = 3000;

/** 左栏最多显示行数 */
const MAX_LOG_LINES = 5;
/** 右栏最多显示条数 */
const MAX_DONE_ITEMS = 5;

/**
 * 与 TooltipManager.hide() 完全一致的退出节奏：
 *   延迟 0~200ms，时长 300~600ms，向下位移 30~80px。
 * 每个字符独立采样一次随机参数 → 多个字符的动画自然重叠。
 */
const FADE_DELAY_MAX = 200;
const FADE_DURATION_BASE = 300;
const FADE_DURATION_RANGE = 300;
const FADE_DISTANCE_BASE = 30;
const FADE_DISTANCE_RANGE = 50;

/** 逐字入场节拍（毫秒/字符），与 tooltip 的 typeTimer 对齐 */
const CHAR_TYPE_INTERVAL = 18;

export class LoadingOverlayManager {
  private overlay: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private logContainer: HTMLElement | null = null;
  private doneContainer: HTMLElement | null = null;

  /** 更新态下「文字淡出」的定时器句柄，用户提前点击时必须清掉 */
  private fadeTimer: number | null = null;
  /** 覆盖层点击关闭回调，保证只绑定 / 解绑一次 */
  private dismissHandler: (() => void) | null = null;

  /* ==================== 字符构建 ==================== */

  /**
   * 构建一行带逐字 span 的条目。
   * segments 允许传入多段文本（如时间/模块/消息），每段可指定 class 以继承配色。
   */
  private buildEntry(
    className: string,
    segments: Array<{ text: string; className?: string }>
  ): HTMLElement {
    const root = document.createElement('div');
    root.className = className;

    for (const seg of segments) {
      const wrap = document.createElement('span');
      if (seg.className) wrap.className = seg.className;
      for (const ch of seg.text) {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.opacity = '0';
        wrap.appendChild(span);
      }
      root.appendChild(wrap);
    }

    return root;
  }

  /** 逐字入场：每个字符按索引 i * CHAR_TYPE_INTERVAL 依次淡入 */
  private animateCharsIn(root: HTMLElement): void {
    const chars = root.querySelectorAll<HTMLElement>('.char');
    if (chars.length === 0) return;

    chars.forEach((ch, i) => {
      ch.style.transition = `opacity 0.15s ease ${i * CHAR_TYPE_INTERVAL}ms`;
    });

    // 强制一次 layout，确保 transition 被触发
    void root.offsetWidth;

    requestAnimationFrame(() => {
      chars.forEach((ch) => {
        ch.style.opacity = '1';
      });
    });
  }

  /**
   * 逐字退场：每个字符独立随机 delay/duration/distance。
   * 与 TooltipManager.hide() 的字符级淡出逻辑一致。
   * @returns 该行所有字符退场所需的最长耗时（毫秒）
   */
  private applyCharOut(root: HTMLElement): number {
    const chars = root.querySelectorAll<HTMLElement>('.char');
    let maxEnd = 0;

    chars.forEach((ch) => {
      const delay = Math.random() * FADE_DELAY_MAX;
      const duration = FADE_DURATION_BASE + Math.random() * FADE_DURATION_RANGE;
      const distance = FADE_DISTANCE_BASE + Math.random() * FADE_DISTANCE_RANGE;
      maxEnd = Math.max(maxEnd, delay + duration);

      ch.style.transition =
        `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.4, 1) ${delay}ms, ` +
        `opacity ${duration}ms ease ${delay}ms`;
      ch.style.transform = `translateY(${distance}px)`;
      ch.style.opacity = '0';
    });

    return maxEnd;
  }

  /* ==================== 日志 / 完成项 ==================== */

  /** 追加一行日志（新的在上）；超出 MAX_LOG_LINES 的最旧行逐字退场。 */
  private log(module: string, msg: string): void {
    if (!this.logContainer) return;

    const line = this.buildEntry(`log-entry log-module-${module}`, [
      { text: `[${new Date().toLocaleTimeString()}]`, className: 'log-time' },
      { text: `[${module}]`, className: 'log-module-name' },
      { text: ' ' + msg },
    ]);

    this.logContainer.prepend(line);
    this.animateCharsIn(line);
    this.enforceLimit(this.logContainer, '.log-entry', MAX_LOG_LINES);
  }

  /** 追加一条已完成项（新的在上）；超出 MAX_DONE_ITEMS 的最旧项逐字退场。 */
  private done(msg: string): void {
    if (!this.doneContainer) return;

    const item = this.buildEntry('done-entry', [
      { text: '✓ ' },
      { text: msg },
    ]);

    this.doneContainer.prepend(item);
    this.animateCharsIn(item);
    this.enforceLimit(this.doneContainer, '.done-entry', MAX_DONE_ITEMS);
  }

  /** 由于新项 prepend 到顶部，越靠后越旧；slice(max) 即为需要退场的项。 */
  private enforceLimit(container: HTMLElement, selector: string, max: number): void {
    const entries = Array.from(
      container.querySelectorAll<HTMLElement>(`${selector}:not(.is-leaving)`)
    );
    if (entries.length <= max) return;
    entries.slice(max).forEach((el) => this.removeEntry(el));
  }

  /** 单条退场：逐字下落 → 整行 DOM 移除。 */
  private removeEntry(el: HTMLElement): void {
    if (el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');

    const maxEnd = this.applyCharOut(el);
    window.setTimeout(() => el.remove(), maxEnd + 60);
  }

  /**
   * 两栏所有活跃文字统一退场。
   * 用于：进入更新态 / 关闭覆盖层之前。
   */
  private fadeOutAllPanels(): Promise<void> {
    const targets: HTMLElement[] = [];

    const collect = (root: HTMLElement | null, selector: string): void => {
      if (!root) return;
      root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (!el.classList.contains('is-leaving')) targets.push(el);
      });
    };
    collect(this.logContainer, '.log-entry');
    collect(this.doneContainer, '.done-entry');

    if (targets.length === 0) return Promise.resolve();

    let maxEnd = 0;
    targets.forEach((el) => {
      el.classList.add('is-leaving');
      maxEnd = Math.max(maxEnd, this.applyCharOut(el));
    });

    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.logContainer?.replaceChildren();
        this.doneContainer?.replaceChildren();
        resolve();
      }, maxEnd + 60);
    });
  }

  /* ==================== 数据抓取 ==================== */

  private async fetchData(keys: string[]): Promise<Record<string, any>> {
    const fetchMap: Record<string, () => Promise<any>> = {
      statistics: () => dataService.getStatistics(),
      articles: () => dataService.getArticles(),
      works: () => dataService.getWorks(),
      code: () => dataService.getCodeAnalysis(),
      friends: () => dataService.getFriends(),
      version: () => dataService.getVersion(),
    };

    const results = await Promise.allSettled(
      keys.map(
        (key) => fetchMap[key]?.() ?? Promise.reject(new Error(`Unknown key: ${key}`))
      )
    );

    const dataMap: Record<string, any> = {};
    results.forEach((result, idx) => {
      const key = keys[idx];
      if (result.status === 'fulfilled') {
        dataMap[key] = result.value;
      } else {
        console.warn(`[LoadingOverlay] ${key} 加载失败`, result.reason);
        dataMap[key] = null;
      }
    });
    return dataMap;
  }

  /* ==================== 公共 API ==================== */

  public show(): Promise<void> {
    return new Promise((resolve) => {
      this.overlay = document.getElementById('loading-overlay');
      if (!this.overlay) {
        console.warn('[LoadingOverlay] #loading-overlay 不存在，跳过');
        resolve();
        return;
      }

      document.body.style.overflow = 'hidden';
      this.content = document.getElementById('loading-content');

      // 左右两栏容器（不存在则创建并挂到 content 上；布局由 main.css 控制）
      this.logContainer = this.ensurePanel('loading-log');
      this.doneContainer = this.ensurePanel('loading-done');

      // ---- 精简日志：只保留能传达"当前在做什么"的关键节点 ----
      this.log('System', '加载覆盖层已启动');
      this.done('初始化完成');

      this.log('Data', '开始并行请求关键数据');

      this.runFlow(resolve).catch((err) => {
        console.error('[LoadingOverlay] 流程执行失败', err);
        resolve();
      });
    });
  }

  /* ==================== 内部流程 ==================== */

  private async runFlow(resolve: () => void): Promise<void> {
    const dataMap = await this.fetchData([
      'statistics', 'articles', 'works', 'code', 'friends', 'version',
    ]);

    this.logDataSummary(dataMap);
    this.done('数据已就绪');

    const versionInfo = this.resolveVersionInfo(dataMap.version);
    const { allVersions, latestWebVersion, storedVersion, lastVisit, needUpdate } = versionInfo;

    this.log(
      'Version',
      `本地 ${storedVersion || '无'} → 远程 ${latestWebVersion || '无'}`
    );
    this.done('版本比对完成');

    const awayText = this.buildAwayText(lastVisit);

    // ---- 版本一致：两栏淡出 → 直接进入页面 ----
    if (!needUpdate) {
      this.log('System', '准备就绪，即将进入页面');
      this.done('准备就绪');
      this.persistVisitRecord(latestWebVersion);

      await this.fadeOutAllPanels();
      this.overlay!.classList.add('hidden');
      this.restoreScroll();
      resolve();
      return;
    }

    // ---- 需要更新：LOGO 先动，更新内容随后入场 ----
    const { versionMsg, changesHTML } = this.buildUpdateContent(allVersions, storedVersion);
    this.log('Version', '发现新版本，正在渲染更新提示');
    this.done('更新内容已就绪');

    // 触发 .updated：LOGO 立即开始非线性上移+缩小（1s 完成）
    // .update-info 由 CSS 延迟 1s 后开始入场
    this.showUpdateContent(versionMsg, awayText, changesHTML);

    // 更新内容稳定 3s 后，两栏文字开始逐字下落淡出。
    // 句柄必须保存：用户提前点击关闭时若不清掉，定时器仍会对已隐藏的容器做 replaceChildren()
    this.fadeTimer = window.setTimeout(() => {
      this.fadeTimer = null;
      void this.fadeOutAllPanels();
    }, LOG_FADE_DELAY_MS);

    // 幂等：重复进入 runFlow 时不叠加第二个监听器
    if (this.dismissHandler) {
      this.overlay!.removeEventListener('click', this.dismissHandler);
    }

    const handler = (): void => {
      if (this.fadeTimer !== null) {
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
      }
      this.persistVisitRecord(latestWebVersion);
      this.overlay!.classList.add('hidden');
      this.restoreScroll();
      window.dispatchEvent(new CustomEvent('welcomeOverlayDismissed'));
      if (this.dismissHandler) {
        this.overlay!.removeEventListener('click', this.dismissHandler);
        this.dismissHandler = null;
      }
      resolve();
    };
    this.dismissHandler = handler;
    this.overlay!.addEventListener('click', handler);
  }

  /* ==================== 数据摘要日志 ==================== */

  private logDataSummary(dataMap: Record<string, any>): void {
    const { statistics, articles, works, code, friends } = dataMap;

    if (statistics) {
      const articleCount = statistics.total_articles ?? (articles?.articles?.length ?? 0);
      const workCount = statistics.total_works ?? (works?.works?.length ?? 0);
      this.log(
        'Data',
        `统计: 版本 ${statistics.version ?? '—'} · 文章 ${articleCount} · 作品 ${workCount}`
      );
    }

    if (code) {
      this.log(
        'Data',
        `代码: ${code.total_files ?? 0} 文件 · ${(code.non_empty_lines ?? 0).toLocaleString()} 行`
      );
    }

    if (friends) {
      const count = Array.isArray(friends) ? friends.length : 0;
      this.log('Data', `友链: ${count} 个`);
    }
  }

  /* ==================== 更新内容渲染 ==================== */

  private showUpdateContent(versionMsg: string, awayText: string, changesHTML: string): void {
    if (!this.content) return;

    this.content.querySelector('.update-info')?.remove();

    const infoDiv = document.createElement('div');
    infoDiv.className = 'update-info';
    infoDiv.innerHTML = `
      <div class="version-badge">${Utils.escapeHtml(versionMsg)}</div>
      <div class="welcome-message">${Utils.escapeHtml(awayText)}</div>
      ${changesHTML}
      <div class="click-hint">点击任意位置继续</div>
    `;
    this.content.appendChild(infoDiv);

    requestAnimationFrame(() => this.content!.classList.add('updated'));
  }

  /* ==================== 版本处理 ==================== */

  private resolveVersionInfo(versionData: any): VersionInfo {
    let allVersions: VersionEntry[] = [];
    let latestWebVersion: string | null = null;

    if (Array.isArray(versionData?.versions)) {
      allVersions = versionData.versions.slice().sort((a: any, b: any) => a.id - b.id);
      if (allVersions.length > 0) {
        latestWebVersion = allVersions[allVersions.length - 1].version;
      }
    }

    let storedVersion: string | null = null;
    let lastVisit: number | null = null;
    if (storageController.isAllowed()) {
      const raw = storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD);
      if (raw) {
        try {
          const record = JSON.parse(raw);
          storedVersion = record.version || null;
          lastVisit = record.lastVisit || null;
        } catch { /* ignore */ }
      }
    }

    const needUpdate =
      !storedVersion || (!!latestWebVersion && storedVersion !== latestWebVersion);

    return { allVersions, latestWebVersion, storedVersion, lastVisit, needUpdate };
  }

  private buildAwayText(lastVisit: number | null): string {
    if (!lastVisit) return '欢迎首次访问本站';

    const seconds = Math.floor((Date.now() - lastVisit) / 1000);
    if (seconds < 60) return `你刚刚离开 ${seconds} 秒`;
    if (seconds < 3600) return `你已经离开 ${Math.floor(seconds / 60)} 分钟`;
    if (seconds < 86400) return `你已经离开 ${Math.floor(seconds / 3600)} 小时`;
    return `你已经离开 ${Math.floor(seconds / 86400)} 天`;
  }

  private buildUpdateContent(
    allVersions: VersionEntry[],
    storedVersion: string | null
  ): { versionMsg: string; changesHTML: string } {
    let startIdx: number;
    if (storedVersion) {
      const foundIdx = allVersions.findIndex((v) => v.version === storedVersion);
      startIdx = foundIdx !== -1 ? foundIdx + 1 : Math.max(0, allVersions.length - 3);
    } else {
      startIdx = Math.max(0, allVersions.length - 1);
    }

    const sorted = allVersions.slice(startIdx).reverse();

    let versionMsg: string;
    if (!storedVersion) {
      versionMsg = sorted.length
        ? `当前是最新版本 ${sorted[0].version}`
        : '版本信息已就绪';
    } else if (sorted.length === 0) {
      versionMsg = '版本信息已就绪';
    } else if (sorted.length === 1) {
      versionMsg = `网站已更新到版本 ${sorted[0].version}`;
    } else {
      versionMsg = `网站已从版本 ${storedVersion} 更新到 ${sorted[0].version}，共 ${sorted.length} 个版本更新`;
    }

    const showVersionHeader = sorted.length > 1;

    const items = sorted
      .map((v) => {
        const label = v.version || `v${v.id}`;
        const changeItems = (v.changes || [])
          .slice(0, 8)
          .map(
            (c) =>
              `<li><span class="change-type">[${Utils.escapeHtml(c.type || '')}]</span> ${Utils.escapeHtml(c.description || '')}</li>`
          )
          .join('');
        if (!changeItems) return '';

        const header = showVersionHeader
          ? `<div class="version-item-label">版本 ${Utils.escapeHtml(label)}</div>`
          : '';

        return `<div class="version-item">${header}<ul class="changes-list">${changeItems}</ul></div>`;
      })
      .filter(Boolean)
      .join('');

    const changesHTML = items
      ? `<div class="changes-container"><h4>更新内容</h4><div class="version-list">${items}</div></div>`
      : '';

    return { versionMsg, changesHTML };
  }

  /* ==================== 通用 ==================== */

  /** 保证 content 内存在指定类名的面板容器，并清空后返回。 */
  private ensurePanel(className: string): HTMLElement | null {
    if (!this.content) return null;
    let el = this.content.querySelector<HTMLElement>(`.${className}`);
    if (!el) {
      el = document.createElement('div');
      el.className = className;
      this.content.appendChild(el);
    } else {
      el.replaceChildren();
    }
    return el;
  }

  private persistVisitRecord(latestVersion: string | null): void {
    try {
      let record: any = {};
      if (storageController.isAllowed()) {
        const raw = storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD);
        if (raw) {
          try { record = JSON.parse(raw); } catch { /* ignore */ }
        }
      }
      record.lastVisit = Date.now();
      if (latestVersion) record.version = latestVersion;
      storageController.setItem(CONFIG.STORAGE_KEYS.VISIT_RECORD, JSON.stringify(record));
    } catch (e) {
      console.warn('[LoadingOverlay] 更新访客记录失败', e);
    }
  }

  private restoreScroll(): void {
    document.body.classList.remove('loading');
    document.body.style.overflow = '';
  }
}