/**
 * image-viewer.ts — 极简图片查看器
 *
 * 交互模型：
 *  - 滚轮 / 双指捏合：以光标为锚点缩放（0.5x – 5x）
 *  - 双击：定点放大 2.5x / 还原
 *  - 拖拽：放大后自由平移；1x 时阻尼拖动，横滑松手切换上/下一张
 *  - 键盘：← → 切换，+ − 缩放，0 重置，R 旋转，F 全屏，Esc 关闭
 *
 * 生命周期：全部监听挂载在同一个 AbortController 上，destroy() 一次性中断，零残留
 */

import { Utils } from '/js/core/core.js';

export interface ImageItem {
  src: string;
  alt?: string;
  title?: string;
  /** 可选：胶片条缩略图，缺省时回退到 src */
  thumb?: string;
}

export interface ImageViewerOptions {
  onClose?: () => void;
  /** 到两端后是否循环浏览，默认 true；传 false 恢复"到头停止"行为 */
  loop?: boolean;
  /** 点击源图片的视口矩形，用于 FLIP 打开/关闭动画。缺省时退化为普通淡入。 */
  originRect?: DOMRect;
}

// Constants
const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.35;
const SWIPE_DISTANCE = 72;
const DAMPING_FACTOR = 0.32;
const Y_DAMPING_FACTOR = 0.1;
const MOVE_THRESHOLD = 4;
const HUD_VISIBLE_DURATION = 900;
const PAN_PADDING = 48;
const DECODE_CACHE_LIMIT = 30;
const OPEN_DURATION = 450;
const CLOSE_DURATION = 450;
const CLOSE_RESET_DURATION = 150;

// Utilities
const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * 模块级解码缓存：同一 URL 只做一次「加载 + 解码」。
 * 简单 FIFO 淘汰，控制内存占用。
 */
const decodedCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = decodedCache.get(src);
  if (cached) return cached;

  const img = new Image();
  img.decoding = 'async';
  img.src = src;

  const p: Promise<HTMLImageElement> =
    typeof img.decode === 'function'
      ? img.decode().then(() => img)
      : new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('image load failed'));
        });

  p.catch(() => decodedCache.delete(src));

  if (decodedCache.size >= DECODE_CACHE_LIMIT) {
    const oldest = decodedCache.keys().next().value;
    if (oldest !== undefined) decodedCache.delete(oldest);
  }
  decodedCache.set(src, p);
  return p;
}

const svg = (inner: string): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  prev: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  next: svg('<path d="M9.5 5.5L16 12l-6.5 6.5"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8.5v5M8.5 11h5"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8.5 11h5"/>'),
  rotate: svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  fsEnter: svg('<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>'),
  fsExit: svg('<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>'),
};

export class ImageViewer {
  private static current: ImageViewer | null = null;

  /** 静态便捷方法 */
  static open(images: ImageItem[], startIndex = 0, options: ImageViewerOptions = {}) {
    return new ImageViewer(images, startIndex, options);
  }
  static close(): void {
    ImageViewer.current?.destroy();
  }

  // ---- 状态 ----
  private images: ImageItem[];
  private index: number;
  private loop: boolean;
  private onCloseCb?: () => void;
  private destroyed = false;
  private closing = false;
  private originRect: DOMRect | null = null;

  private tx = { scale: 1, x: 0, y: 0, rotate: 0 };

  // ---- DOM ----
  private root!: HTMLElement;
  private stage!: HTMLElement;
  private frame!: HTMLElement;
  private img!: HTMLImageElement;
  private spinner!: HTMLElement;
  private errorBtn!: HTMLButtonElement;
  private progress!: HTMLElement;
  private curEl!: HTMLElement;
  private captionEl!: HTMLElement;
  private closeBtn!: HTMLButtonElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private hud!: HTMLElement;
  private controls!: HTMLElement;
  private strip!: HTMLElement;

  // ---- 生命周期 / 竞态 ----
  private listeners = new AbortController();
  private loadToken = 0;
  private pendingDir: -1 | 0 | 1 = 0;
  private hudTimer = 0;
  private savedOverflow = '';
  private lastFocused: HTMLElement | null = null;

  // ---- 布局缓存（避免指针移动时触发 reflow） ----
  private stageRect = { w: 0, h: 0, left: 0, top: 0 };
  private baseW = 0; // scale=1、无旋转时图片的显示宽度
  private baseH = 0;

  // ---- 手势 ----
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; scale: number; x: number; y: number; midX: number; midY: number } | null = null;
  private dragStart = { x: 0, y: 0 };
  private dragBase = { x: 0, y: 0 };
  private moved = false;
  private downTarget: EventTarget | null = null;

  constructor(images: ImageItem[], startIndex = 0, options: ImageViewerOptions = {}) {
    // 若上一实例仍在关闭动画中，让它自行完成，不打断
    const prev = ImageViewer.current;
    if (prev && prev !== this && !prev.closing) prev.destroy();
    ImageViewer.current = this;

    this.images = (images || []).filter((it) => it?.src);
    if (!this.images.length) throw new Error('ImageViewer: 没有可用的图片');

    this.loop = options.loop ?? true;
    this.onCloseCb = options.onClose;
    this.originRect = options.originRect ?? null;
    this.index = clamp(startIndex, 0, this.images.length - 1);

    this.build();
    this.bind();
    this.buildStrip();

    // 初始即进入打开态：UI 元素先隐藏，等待加载完成后播放动画
    this.root.classList.add('is-opening');

    this.savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.lastFocused = document.activeElement as HTMLElement | null;

    this.measureStage();
    this.show(this.index, 0);
  }

  /* ================= 公开 API ================= */

  prev(): void { this.nav(-1); }
  next(): void { this.nav(1); }

  go(index: number): void {
    if (index === this.index || index < 0 || index >= this.images.length) return;
    this.show(index, index > this.index ? 1 : -1);
  }

  /**
   * 关闭查看器。两阶段：
   *   1. 播放关闭动画（UI 退场 + 图片 FLIP + 遮罩淡出）
   *   2. 动画完成后移除 DOM、恢复状态、回调
   */
  destroy(): void {
    if (this.destroyed || this.closing) return;
    this.closing = true;

    // 立即中断在途加载与事件
    this.loadToken++;
    this.listeners.abort();
    window.clearTimeout(this.hudTimer);

    // 停掉所有手势状态，避免松手回调干扰
    this.pointers.clear();
    this.pinch = null;
    this.stage.classList.remove('is-grabbing');

    this.playCloseAnimation().then(() => {
      this.destroyed = true;
      this.root.remove();
      document.body.style.overflow = this.savedOverflow;
      if (ImageViewer.current === this) ImageViewer.current = null;
      this.lastFocused?.focus?.({ preventScroll: true });
      this.onCloseCb?.();
    });
  }

  /* ================= 构建 ================= */

  private build(): void {
    const root = document.createElement('div');
    root.className = 'modern-image-viewer';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '图片查看器');

    root.innerHTML = `
      <div class="viewer-progress" aria-hidden="true"></div>

      <header class="viewer-top">
        <div class="viewer-meta">
          <div class="viewer-count" aria-live="polite">
            <span class="viewer-cur">--</span><span class="viewer-sep">/</span><span class="viewer-total">${pad2(this.images.length)}</span>
          </div>
          <p class="viewer-caption" hidden></p>
        </div>
        <button class="viewer-close" type="button" aria-label="关闭（Esc）">${ICONS.close}</button>
      </header>

      <div class="viewer-stage">
        <figure class="viewer-frame">
          <img class="viewer-image" alt="" draggable="false" decoding="async" />
        </figure>
        <div class="viewer-spinner" hidden aria-hidden="true"></div>
        <button class="viewer-error" type="button" hidden>加载失败 · 点击重试</button>
      </div>

      <button class="viewer-nav viewer-prev" type="button" aria-label="上一张（←）">${ICONS.prev}</button>
      <button class="viewer-nav viewer-next" type="button" aria-label="下一张（→）">${ICONS.next}</button>

      <div class="viewer-hud" aria-hidden="true">100%</div>

      <div class="viewer-controls" role="toolbar" aria-label="查看器工具">
        <button type="button" data-act="zoom-out" aria-label="缩小（−）">${ICONS.zoomOut}</button>
        <button type="button" data-act="zoom-in" aria-label="放大（+）">${ICONS.zoomIn}</button>
        <button type="button" data-act="rotate" aria-label="旋转（R）">${ICONS.rotate}</button>
        <button type="button" data-act="fullscreen" aria-label="全屏（F）">
          <span class="i-enter">${ICONS.fsEnter}</span><span class="i-exit">${ICONS.fsExit}</span>
        </button>
      </div>

      <nav class="viewer-strip" aria-label="图片列表"></nav>
    `;

    document.body.appendChild(root);

    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    this.root = root;
    this.stage = q('.viewer-stage');
    this.frame = q('.viewer-frame');
    this.img = q<HTMLImageElement>('.viewer-image');
    this.spinner = q('.viewer-spinner');
    this.errorBtn = q<HTMLButtonElement>('.viewer-error');
    this.progress = q('.viewer-progress');
    this.curEl = q('.viewer-cur');
    this.captionEl = q('.viewer-caption');
    this.closeBtn = q<HTMLButtonElement>('.viewer-close');
    this.prevBtn = q<HTMLButtonElement>('.viewer-prev');
    this.nextBtn = q<HTMLButtonElement>('.viewer-next');
    this.hud = q('.viewer-hud');
    this.controls = q('.viewer-controls');
    this.strip = q('.viewer-strip');
  }

  /* ================= 事件 ================= */

  private bind(): void {
    const { signal } = this.listeners;
    const on = (
      target: EventTarget,
      type: string,
      fn: (e: Event) => void,
      opts?: AddEventListenerOptions
    ) => target.addEventListener(type, fn, { signal, ...opts });

    on(this.closeBtn, 'click', () => this.destroy());
    on(this.prevBtn, 'click', () => this.nav(-1));
    on(this.nextBtn, 'click', () => this.nav(1));
    on(this.errorBtn, 'click', () => this.show(this.index, 0));

    // 点击空白处关闭：必须 pointerdown 与 click 都落在舞台上
    on(this.stage, 'click', (e) => {
      if (this.moved) return;
      if (e.target === this.stage && this.downTarget === this.stage) this.destroy();
    });

    on(this.stage, 'dblclick', (e) => {
      e.preventDefault();
      const me = e as MouseEvent;
      if (this.tx.scale > 1.01) this.resetTransform(true, true);
      else this.zoomAt(me.clientX, me.clientY, 2.5, true);
    });

    on(this.stage, 'wheel', (e) => {
      e.preventDefault();
      const we = e as WheelEvent;
      this.zoomAt(we.clientX, we.clientY, Math.exp(-we.deltaY * 0.0015), false);
    }, { passive: false });

    on(this.stage, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    on(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    on(window, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
    on(window, 'pointercancel', (e) => this.onPointerUp(e as PointerEvent));
    on(this.stage, 'dragstart', (e) => e.preventDefault());

    on(document, 'keydown', (e) => this.onKeydown(e as KeyboardEvent));

    // 视口变化：刷新舞台测量，并让基准尺寸失效
    on(window, 'resize', () => {
      this.measureStage();
      this.baseW = 0;
      this.baseH = 0;
      if (this.tx.scale > 1) {
        this.clampPan();
        this.apply(false);
      }
    });

    // 工具栏事件委托
    on(this.controls, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-act]');
      if (!btn) return;
      switch (btn.getAttribute('data-act')) {
        case 'zoom-in': this.zoomBy(ZOOM_STEP); break;
        case 'zoom-out': this.zoomBy(1 / ZOOM_STEP); break;
        case 'rotate': this.rotate(); break;
        case 'fullscreen': this.toggleFullscreen(); break;
      }
    });

    // 胶片条事件委托
    on(this.strip, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.viewer-thumb');
      if (!btn) return;
      const i = Number(btn.dataset.index);
      if (!Number.isNaN(i)) this.go(i);
    });
  }

  private onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Tab') { this.trapFocus(e); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'Escape':
        if (document.fullscreenElement) return;
        this.destroy();
        break;
      case 'ArrowLeft': e.preventDefault(); this.nav(-1); break;
      case 'ArrowRight': e.preventDefault(); this.nav(1); break;
      case '+': case '=': e.preventDefault(); this.zoomBy(ZOOM_STEP); break;
      case '-': case '_': e.preventDefault(); this.zoomBy(1 / ZOOM_STEP); break;
      case '0': e.preventDefault(); this.resetTransform(true, true); break;
      case 'r': case 'R': this.rotate(); break;
      case 'f': case 'F': this.toggleFullscreen(); break;
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    const focusables = Array.from(
      this.root.querySelectorAll<HTMLElement>('button:not([disabled])')
    ).filter((el) => !el.closest('[hidden]'));
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || active === this.root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ================= 加载与切换 ================= */

  private show(index: number, dir: -1 | 0 | 1): void {
    const total = this.images.length;
    this.index = ((index % total) + total) % total;
    this.pendingDir = dir;

    const item = this.images[this.index];
    const token = ++this.loadToken;

    // 顶部元信息
    this.curEl.textContent = pad2(this.index + 1);
    const caption = item.title || item.alt || '';
    this.captionEl.textContent = caption;
    this.captionEl.hidden = !caption;
    this.img.alt = item.alt || item.title || '';

    // 导航按钮
    const single = total <= 1;
    this.prevBtn.hidden = single;
    this.nextBtn.hidden = single;
    if (!single) {
      this.prevBtn.disabled = !this.loop && this.index === 0;
      this.nextBtn.disabled = !this.loop && this.index === total - 1;
    }

    // 胶片条高亮 + 滚动居中
    const thumbs = this.strip.children;
    for (let i = 0; i < thumbs.length; i++) {
      (thumbs[i] as HTMLElement).classList.toggle('is-active', i === this.index);
    }
    const active = thumbs[this.index] as HTMLElement | undefined;
    if (active) {
      this.strip.scrollTo({
        left: active.offsetLeft - (this.strip.clientWidth - active.offsetWidth) / 2,
        behavior: 'smooth',
      });
    }

    // 加载状态：先隐藏旧图，避免快速切换时闪现
    this.frame.classList.remove('in-zoom', 'in-right', 'in-left', 'is-static');
    this.img.classList.remove('is-opening-anim', 'is-closing-anim', 'is-resetting');
    this.img.style.transition = '';
    this.img.style.transform = '';
    this.resetTransform(false);
    this.spinner.hidden = false;
    this.errorBtn.hidden = true;
    this.progress.classList.add('is-loading');

    const done = () => {
      if (token !== this.loadToken || this.destroyed) return;
      this.img.src = item.src;

      // 首次打开（有 originRect）→ 播放 FLIP 打开动画
      if (this.originRect) {
        const rect = this.originRect;
        // 注意：不置空 originRect，关闭动画仍要复用
        requestAnimationFrame(() => {
          if (token !== this.loadToken || this.destroyed) return;
          this.playOpenFrom(rect);
        });
        return;
      }

      // 常规路径：切换图片时的进入动画
      this.spinner.hidden = true;
      this.progress.classList.remove('is-loading');
      requestAnimationFrame(() => {
        if (token === this.loadToken && !this.destroyed) this.measureBase();
      });
      this.playEnter();
      this.preloadNeighbors();
    };

    const fail = () => {
      if (token !== this.loadToken || this.destroyed) return;
      this.spinner.hidden = true;
      this.progress.classList.remove('is-loading');
      this.errorBtn.hidden = false;
    };

    loadImage(item.src).then(done, fail);
  }

  private playEnter(): void {
    const cls = this.pendingDir > 0 ? 'in-right' : this.pendingDir < 0 ? 'in-left' : 'in-zoom';
    this.pendingDir = 0;
    void this.frame.offsetWidth; // 强制重排，确保动画可重复触发
    this.frame.classList.add(cls);
  }

  private preloadNeighbors(): void {
    const total = this.images.length;
    if (total < 2) return;
    const i = this.index;
    loadImage(this.images[(i + 1) % total].src).catch(() => {});
    loadImage(this.images[(i - 1 + total) % total].src).catch(() => {});
  }

  private nav(dir: -1 | 1): void {
    const total = this.images.length;
    if (total < 2) return;
    let next = this.index + dir;
    if (next < 0 || next >= total) {
      if (!this.loop) return;
      next = (next + total) % total;
    }
    this.show(next, dir);
  }

  /* ================= 打开动画（FLIP） ================= */

  /**
   * FLIP 打开动画：让查看器图片从「点击图片的视口矩形」平滑过渡到自然位置。
   *
   * 公式（transform-origin: center）：
   *   scale = min(原图宽 / 自然宽, 原图高 / 自然高)
   *   translate = 原图中心 - 自然中心
   *
   * 时间轴：
   *   t=0      root 加 .is-open → 遮罩淡入（0.35s）
   *            图片 transform 起点 = FLIP 初始态
   *   t=rAF    图片过渡至 identity（0.45s）
   *   t=450    收尾：移除 .is-opening → UI 从边缘滑入
   */
  private playOpenFrom(originRect: DOMRect): void {
    this.root.classList.add('is-open');
    this.frame.classList.add('is-static');

    // 测量图片自然位置
    const naturalRect = this.img.getBoundingClientRect();
    if (naturalRect.width < 1 || naturalRect.height < 1) {
      this.finishOpen();
      return;
    }

    const naturalCx = naturalRect.left + naturalRect.width / 2;
    const naturalCy = naturalRect.top + naturalRect.height / 2;
    const originCx = originRect.left + originRect.width / 2;
    const originCy = originRect.top + originRect.height / 2;

    const scale = Math.min(
      originRect.width / naturalRect.width,
      originRect.height / naturalRect.height
    );
    const tx = originCx - naturalCx;
    const ty = originCy - naturalCy;

    // 立即设置初始 transform（禁用过渡，强制 reflow 提交）
    this.img.style.transition = 'none';
    this.img.style.transform =
      `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    void this.img.offsetWidth; // 强制同步布局

    // 下一帧开启过渡，回到自然位置
    requestAnimationFrame(() => {
      if (this.destroyed || this.closing) return;
      this.img.classList.add('is-opening-anim');
      this.img.style.transition = '';
      this.img.style.transform = '';
    });

    // 动画结束后切换 UI 状态
    window.setTimeout(() => {
      if (this.destroyed || this.closing) return;
      this.img.classList.remove('is-opening-anim');
      this.finishOpen();
    }, OPEN_DURATION);
  }

  /** 打开动画收尾：隐藏 spinner、移除 is-opening 触发 UI 滑入 */
  private finishOpen(): void {
    this.spinner.hidden = true;
    this.progress.classList.remove('is-loading');
    this.root.classList.remove('is-opening');
    this.measureBase();
    this.preloadNeighbors();
  }

  /* ================= 关闭动画（打开动画的逆序） ================= */

  /**
   * 关闭动画：
   *   阶段一：UI 从边缘滑出（0.35s），若有缩放/旋转先复位（0.15s）
   *   阶段二：图片 FLIP 从自然位置飞向原图位置（0.45s）
   *           遮罩（root）同步淡出
   *
   * 返回 Promise，在动画全部结束后 resolve。
   */
  private playCloseAnimation(): Promise<void> {
    return new Promise<void>((resolve) => {
      // UI 立即滑出
      this.root.classList.add('is-closing');

      const hasOrigin = !!(this.originRect && this.baseW > 0);
      const needsReset =
        this.tx.scale !== 1 ||
        this.tx.x !== 0 ||
        this.tx.y !== 0 ||
        this.tx.rotate !== 0;

      // 无 originRect（例如通过 API 打开）→ 只做遮罩淡出
      if (!hasOrigin) {
        this.root.classList.remove('is-open');
        window.setTimeout(resolve, 350);
        return;
      }

      if (needsReset) {
        // 快速复位到自然态，避免 FLIP 起点矩阵复杂化
        this.tx.scale = 1;
        this.tx.x = 0;
        this.tx.y = 0;
        this.tx.rotate = 0;
        this.img.classList.add('is-resetting');
        this.apply(false);

        window.setTimeout(() => {
          this.img.classList.remove('is-resetting');
          this.applyCloseFlip();
          this.root.classList.remove('is-open');
          window.setTimeout(resolve, CLOSE_DURATION);
        }, CLOSE_RESET_DURATION);
      } else {
        this.applyCloseFlip();
        this.root.classList.remove('is-open');
        window.setTimeout(resolve, CLOSE_DURATION);
      }
    });
  }

  /**
   * 计算并应用「从自然位置飞向 originRect」的 FLIP 变换。
   * 自然态居中于 stage，可直接由 baseW/baseH 推算自然中心，无需再测量。
   */
  private applyCloseFlip(): void {
    const originRect = this.originRect;
    if (!originRect) return;

    if (!this.baseW || !this.baseH) this.measureBase();
    if (!this.baseW || !this.baseH) return;

    const naturalCx = this.stageRect.left + this.stageRect.w / 2;
    const naturalCy = this.stageRect.top + this.stageRect.h / 2;
    const naturalW = this.baseW;
    const naturalH = this.baseH;

    const originCx = originRect.left + originRect.width / 2;
    const originCy = originRect.top + originRect.height / 2;
    const targetScale = Math.min(
      originRect.width / naturalW,
      originRect.height / naturalH
    );
    const tx = originCx - naturalCx;
    const ty = originCy - naturalCy;

    // 应用终点 transform，让 CSS 从 identity 平滑过渡到此
    this.img.classList.remove('is-smooth');
    this.img.classList.add('is-closing-anim');
    this.img.style.transform =
      `translate3d(${tx}px, ${ty}px, 0) scale(${targetScale})`;
  }

  /* ================= 布局测量 ================= */

  private measureStage(): void {
    const r = this.stage.getBoundingClientRect();
    this.stageRect.w = r.width;
    this.stageRect.h = r.height;
    this.stageRect.left = r.left;
    this.stageRect.top = r.top;
  }

  /**
   * 测量图片在 scale=1、无旋转时的显示尺寸。
   * 通过除以当前 scale + 旋转交换反推，因此可在任意变换状态下调用。
   */
  private measureBase(): void {
    const rect = this.img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = this.tx.scale || 1;
    const swapped = this.tx.rotate % 180 !== 0;
    this.baseW = (swapped ? rect.height : rect.width) / sx;
    this.baseH = (swapped ? rect.width : rect.height) / sx;
  }

  /* ================= 变换 ================= */

  private apply(smooth = false): void {
    this.img.classList.toggle('is-smooth', smooth);
    const { scale, x, y, rotate } = this.tx;
    this.img.style.transform =
      `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
  }

  private resetTransform(smooth: boolean, flash = false): void {
    this.tx.scale = 1;
    this.tx.x = 0;
    this.tx.y = 0;
    this.tx.rotate = 0;
    this.apply(smooth);
    if (flash) this.flashHud();
  }

  /** 以光标为锚点缩放，保证指针下的图像内容不动 */
  private zoomAt(clientX: number, clientY: number, factor: number, smooth = true): void {
    const next = clamp(this.tx.scale * factor, MIN_SCALE, MAX_SCALE);
    if (next === this.tx.scale) return;

    if (this.stageRect.w === 0) this.measureStage();
    const px = clientX - (this.stageRect.left + this.stageRect.w / 2);
    const py = clientY - (this.stageRect.top + this.stageRect.h / 2);
    const k = next / this.tx.scale;

    this.tx.x = px - k * (px - this.tx.x);
    this.tx.y = py - k * (py - this.tx.y);
    this.tx.scale = next;

    this.clampPan();
    this.apply(smooth);
    this.flashHud();
  }

  private zoomBy(factor: number): void {
    if (this.stageRect.w === 0) this.measureStage();
    this.zoomAt(
      this.stageRect.left + this.stageRect.w / 2,
      this.stageRect.top + this.stageRect.h / 2,
      factor
    );
  }

  /** 约束平移：图片不会完全移出视野（允许少量越界 padding） */
  private clampPan(): void {
    if (this.tx.scale <= 1) return;

    if (!this.baseW || !this.baseH) {
      this.measureBase();
      if (!this.baseW || !this.baseH) return;
    }
    if (this.stageRect.w === 0) this.measureStage();

    const swapped = this.tx.rotate % 180 !== 0;
    const bw = swapped ? this.baseH : this.baseW;
    const bh = swapped ? this.baseW : this.baseH;

    const scaledW = bw * this.tx.scale;
    const scaledH = bh * this.tx.scale;

    const maxX = Math.max(0, (scaledW - this.stageRect.w) / 2 + PAN_PADDING);
    const maxY = Math.max(0, (scaledH - this.stageRect.h) / 2 + PAN_PADDING);

    this.tx.x = clamp(this.tx.x, -maxX, maxX);
    this.tx.y = clamp(this.tx.y, -maxY, maxY);
  }

  private rotate(): void {
    this.tx.rotate = (this.tx.rotate + 90) % 360;
    if (this.tx.scale > 1) this.clampPan();
    this.apply(true);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      this.root.requestFullscreen?.().catch(() => {});
    }
  }

  private flashHud(): void {
    this.hud.textContent = `${Math.round(this.tx.scale * 100)}%`;
    this.hud.classList.add('is-visible');
    window.clearTimeout(this.hudTimer);
    this.hudTimer = window.setTimeout(() => {
      if (!this.destroyed) this.hud.classList.remove('is-visible');
    }, HUD_VISIBLE_DURATION);
  }

  /* ================= 手势 ================= */

  private onPointerDown(e: PointerEvent): void {
    if (this.closing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    this.downTarget = e.target;
    try { this.stage.setPointerCapture(e.pointerId); } catch { /* noop */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 双指落下 → 进入捏合
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: this.tx.scale,
        x: this.tx.x,
        y: this.tx.y,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      this.moved = true;
      this.stage.classList.add('is-grabbing');
      return;
    }

    this.dragStart.x = e.clientX;
    this.dragStart.y = e.clientY;
    this.dragBase.x = this.tx.x;
    this.dragBase.y = this.tx.y;
    this.moved = false;
    this.img.classList.remove('is-smooth');
    this.stage.classList.add('is-grabbing');
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.closing) return;
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 捏合缩放（锚定双指中点）
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      const next = clamp(this.pinch.scale * (dist / this.pinch.dist), MIN_SCALE, MAX_SCALE);
      const k = next / this.pinch.scale;
      if (this.stageRect.w === 0) this.measureStage();
      const px = this.pinch.midX - (this.stageRect.left + this.stageRect.w / 2);
      const py = this.pinch.midY - (this.stageRect.top + this.stageRect.h / 2);

      this.tx.scale = next;
      this.tx.x = px - k * (px - this.pinch.x) + (midX - this.pinch.midX);
      this.tx.y = py - k * (py - this.pinch.y) + (midY - this.pinch.midY);
      this.moved = true;
      this.apply(false);
      this.flashHud();
      return;
    }

    // 单指 / 鼠标拖拽
    if (this.pointers.size !== 1) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    if (!this.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) this.moved = true;
    if (!this.moved) return;

    if (this.tx.scale > 1.01) {
      this.tx.x = this.dragBase.x + dx;
      this.tx.y = this.dragBase.y + dy;
      this.clampPan();
    } else {
      // 1x 时的阻尼反馈，暗示可滑动翻页
      this.tx.x = dx * DAMPING_FACTOR;
      this.tx.y = dy * Y_DAMPING_FACTOR;
    }
    this.apply(false);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);

    // 捏合结束
    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
        if (this.pointers.size === 1) {
          // 剩一根手指 → 无缝切换为拖拽
          const [p] = [...this.pointers.values()];
          this.dragStart.x = p.x;
          this.dragStart.y = p.y;
          this.dragBase.x = this.tx.x;
          this.dragBase.y = this.tx.y;
          this.moved = true;
        }
      }
      if (this.pointers.size === 0) {
        this.stage.classList.remove('is-grabbing');
        this.clampPan();
        this.apply(true);
      }
      return;
    }

    if (this.pointers.size > 0) return;
    this.stage.classList.remove('is-grabbing');

    if (this.closing) return;

    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;

    if (this.tx.scale <= 1.01) {
      const isSwipe = Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.4;
      if (isSwipe) this.nav(dx < 0 ? 1 : -1);
      // 回弹
      this.tx.x = 0;
      this.tx.y = 0;
      this.apply(true);
    } else {
      this.clampPan();
      this.apply(true);
    }
  }

  /* ================= 胶片条 ================= */

  private buildStrip(): void {
    if (this.images.length < 2) {
      this.strip.hidden = true;
      return;
    }
    this.strip.innerHTML = this.images
      .map(
        (it, i) => `
          <button class="viewer-thumb" type="button" data-index="${i}" aria-label="第 ${i + 1} 张">
            <img src="${Utils.escapeHtml(it.thumb || it.src)}" alt="" loading="lazy" decoding="async" draggable="false" />
          </button>`
      )
      .join('');
  }
}