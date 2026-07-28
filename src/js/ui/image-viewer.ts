/**
 * image-viewer.ts — 极简图片查看器（重构 v2）
 *
 * 交互模型：
 *  - 滚轮 / 双指捏合：以光标为锚点缩放（0.5x – 5x）
 *  - 双击：定点放大 2.5x / 还原
 *  - 拖拽：放大后自由平移；1x 时阻尼拖动，横滑松手切换上/下一张
 *  - 键盘：← → 切换，+ − 缩放，0 重置，R 旋转，F 全屏，Esc 关闭
 *
 * 生命周期：全部监听挂载在同一个 AbortController 上，destroy() 一次性中断，零残留
 */

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
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.35;
const SWIPE_DISTANCE = 72;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pad2 = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const svg = (inner: string) =>
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
  static close() {
    ImageViewer.current?.destroy();
  }

  // ---- 状态 ----
  private images: ImageItem[];
  private index: number;
  private loop: boolean;
  private onCloseCb?: () => void;
  private destroyed = false;

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

  // ---- 手势 ----
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; scale: number; x: number; y: number; midX: number; midY: number } | null = null;
  private dragStart = { x: 0, y: 0 };
  private dragBase = { x: 0, y: 0 };
  private moved = false;
  private downTarget: EventTarget | null = null;

  constructor(images: ImageItem[], startIndex = 0, options: ImageViewerOptions = {}) {
    ImageViewer.current?.destroy();
    ImageViewer.current = this;

    this.images = (images || []).filter((it) => it && it.src);
    if (!this.images.length) throw new Error('ImageViewer: 没有可用的图片');

    this.loop = options.loop ?? true;
    this.onCloseCb = options.onClose;
    this.index = clamp(startIndex, 0, this.images.length - 1);

    this.build();
    this.bind();
    this.buildStrip();

    this.savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.lastFocused = document.activeElement as HTMLElement | null;

    this.show(this.index, 0);
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.closeBtn.focus({ preventScroll: true });
  }

  /* ================= 公开 API ================= */

  prev() { this.nav(-1); }
  next() { this.nav(1); }
  go(index: number) {
    if (index === this.index || index < 0 || index >= this.images.length) return;
    this.show(index, index > this.index ? 1 : -1);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.loadToken++;          // 使所有在途加载的回调失效
    this.listeners.abort();    // 移除全部事件监听
    window.clearTimeout(this.hudTimer);

    this.root.classList.remove('is-open');
    const el = this.root;
    window.setTimeout(() => el.remove(), 320);

    document.body.style.overflow = this.savedOverflow;
    if (ImageViewer.current === this) ImageViewer.current = null;
    this.lastFocused?.focus?.({ preventScroll: true });
    this.onCloseCb?.();
  }

  /* ================= 构建 ================= */

  private build() {
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

  private bind() {
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
    // （Pointer Capture 会把 click 目标重定向到舞台，需借助 downTarget 判别真实起点）
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

  private onKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') { this.trapFocus(e); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'Escape':
        if (document.fullscreenElement) return; // 全屏时第一次 Esc 只退出全屏
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

  private trapFocus(e: KeyboardEvent) {
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

  private show(index: number, dir: -1 | 0 | 1) {
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
    if (!this.loop) {
      this.prevBtn.disabled = this.index === 0;
      this.nextBtn.disabled = this.index === total - 1;
    }

    // 胶片条高亮 + 滚动居中
    Array.from(this.strip.children).forEach((el, i) => {
      el.classList.toggle('is-active', i === this.index);
    });
    const active = this.strip.children[this.index] as HTMLElement | undefined;
    if (active) {
      this.strip.scrollTo({
        left: active.offsetLeft - (this.strip.clientWidth - active.offsetWidth) / 2,
        behavior: 'smooth',
      });
    }

    // 加载状态：先隐藏旧图，避免快速切换时闪现
    this.frame.classList.remove('in-zoom', 'in-right', 'in-left');
    this.resetTransform(false);
    this.spinner.hidden = false;
    this.errorBtn.hidden = true;
    this.progress.classList.add('is-loading');

    const loader = new Image();
    loader.decoding = 'async';
    loader.src = item.src;

    const done = () => {
      if (token !== this.loadToken || this.destroyed) return;
      this.spinner.hidden = true;
      this.progress.classList.remove('is-loading');
      this.img.src = item.src;
      this.playEnter();
      this.preloadNeighbors();
    };
    const fail = () => {
      if (token !== this.loadToken || this.destroyed) return;
      this.spinner.hidden = true;
      this.progress.classList.remove('is-loading');
      this.errorBtn.hidden = false;
    };

    if (typeof loader.decode === 'function') {
      loader.decode().then(done).catch(fail);
    } else {
      loader.onload = done;
      loader.onerror = fail;
    }
  }

  private playEnter() {
    const cls = this.pendingDir > 0 ? 'in-right' : this.pendingDir < 0 ? 'in-left' : 'in-zoom';
    this.pendingDir = 0;
    void this.frame.offsetWidth; // 强制重排，确保动画可重复触发
    this.frame.classList.add(cls);
  }

  private preloadNeighbors() {
    const total = this.images.length;
    if (total < 2) return;
    [(this.index + 1) % total, (this.index - 1 + total) % total].forEach((i) => {
      const im = new Image();
      im.decoding = 'async';
      im.src = this.images[i].src;
    });
  }

  private nav(dir: -1 | 1) {
    const total = this.images.length;
    if (total < 2) return;
    let next = this.index + dir;
    if (next < 0 || next >= total) {
      if (!this.loop) return;
      next = (next + total) % total;
    }
    this.show(next, dir);
  }

  /* ================= 变换 ================= */

  private apply(smooth = false) {
    this.img.classList.toggle('is-smooth', smooth);
    const { scale, x, y, rotate } = this.tx;
    this.img.style.transform =
      `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
  }

  private resetTransform(smooth: boolean, flash = false) {
    this.tx = { scale: 1, x: 0, y: 0, rotate: 0 };
    this.apply(smooth);
    if (flash) this.flashHud();
  }

  /** 以光标为锚点缩放，保证指针下的图像内容不动 */
  private zoomAt(clientX: number, clientY: number, factor: number, smooth = true) {
    const next = clamp(this.tx.scale * factor, MIN_SCALE, MAX_SCALE);
    if (next === this.tx.scale) return;

    const rect = this.stage.getBoundingClientRect();
    const px = clientX - (rect.left + rect.width / 2);
    const py = clientY - (rect.top + rect.height / 2);
    const k = next / this.tx.scale;

    this.tx.x = px - k * (px - this.tx.x);
    this.tx.y = py - k * (py - this.tx.y);
    this.tx.scale = next;

    this.clampPan();
    this.apply(smooth);
    this.flashHud();
  }

  private zoomBy(factor: number) {
    const rect = this.stage.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  /** 约束平移范围，图片不会完全移出视野（允许少量越界） */
  private clampPan() {
    if (this.tx.scale <= 1) return; // 1x 时的位移由松手回弹处理
    const stageRect = this.stage.getBoundingClientRect();
    const imgRect = this.img.getBoundingClientRect();
    const w = imgRect.width / this.tx.scale;
    const h = imgRect.height / this.tx.scale;
    const pad = 48;
    const maxX = Math.max(0, (w * this.tx.scale - stageRect.width) / 2 + pad);
    const maxY = Math.max(0, (h * this.tx.scale - stageRect.height) / 2 + pad);
    this.tx.x = clamp(this.tx.x, -maxX, maxX);
    this.tx.y = clamp(this.tx.y, -maxY, maxY);
  }

  private rotate() {
    this.tx.rotate = (this.tx.rotate + 90) % 360;
    this.apply(true);
  }

  private toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else this.root.requestFullscreen?.();
  }

  private flashHud() {
    this.hud.textContent = `${Math.round(this.tx.scale * 100)}%`;
    this.hud.classList.add('is-visible');
    window.clearTimeout(this.hudTimer);
    this.hudTimer = window.setTimeout(() => this.hud.classList.remove('is-visible'), 900);
  }

  /* ================= 手势 ================= */

  private onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 按钮（如"加载失败·重试"）不参与拖拽逻辑
    if ((e.target as HTMLElement).closest('button')) return;

    this.downTarget = e.target;
    try { this.stage.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 第二根手指落下 → 进入捏合
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

    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragBase = { x: this.tx.x, y: this.tx.y };
    this.moved = false;
    this.img.classList.remove('is-smooth');
    this.stage.classList.add('is-grabbing');
  }

  private onPointerMove(e: PointerEvent) {
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
      const rect = this.stage.getBoundingClientRect();
      const px = this.pinch.midX - (rect.left + rect.width / 2);
      const py = this.pinch.midY - (rect.top + rect.height / 2);

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
    if (!this.moved && Math.hypot(dx, dy) > 4) this.moved = true;
    if (!this.moved) return;

    if (this.tx.scale > 1.01) {
      this.tx.x = this.dragBase.x + dx;
      this.tx.y = this.dragBase.y + dy;
      this.clampPan();
    } else {
      // 1x 时的阻尼反馈，暗示可滑动翻页
      this.tx.x = dx * 0.32;
      this.tx.y = dy * 0.1;
    }
    this.apply(false);
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);

    // 捏合结束
    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
        if (this.pointers.size === 1) {
          // 剩一根手指 → 无缝切换为拖拽
          const [p] = [...this.pointers.values()];
          this.dragStart = { x: p.x, y: p.y };
          this.dragBase = { x: this.tx.x, y: this.tx.y };
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

    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;

    if (this.tx.scale <= 1.01) {
      const isSwipe = Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.4;
      if (isSwipe) this.nav(dx < 0 ? 1 : -1);
      // 回弹（若已翻页，show() 内部也会重置，这里是幂等的）
      this.tx.x = 0;
      this.tx.y = 0;
      this.apply(true);
    } else {
      this.clampPan();
      this.apply(true);
    }
  }

  /* ================= 胶片条 ================= */

  private buildStrip() {
    if (this.images.length < 2) {
      this.strip.hidden = true;
      return;
    }
    this.strip.innerHTML = this.images
      .map(
        (it, i) => `
          <button class="viewer-thumb" type="button" data-index="${i}" aria-label="第 ${i + 1} 张">
            <img src="${esc(it.thumb || it.src)}" alt="" loading="lazy" decoding="async" draggable="false" />
          </button>`
      )
      .join('');
  }
}