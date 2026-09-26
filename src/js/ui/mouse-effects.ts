// /js/ui/mouse-effects.ts
// 鼠标特效引擎（长按连线 + 爆发粒子） + 自定义光标（圆点+圆环，仿 cursor-fx 用户脚本）
// 性能优化：空闲自动暂停渲染循环，页面隐藏时暂停，减少 CPU 开销，优化 GC 和 Canvas 状态切换
//
// 主题订阅：统一走 themeController.onChange（不再依赖 window 'themeChanged' 事件）

import { themeController } from '/js/core/theme-controller.js';

// ===================================================================
//  MouseEffectManager — Canvas 渲染引擎（长按连线 + 粒子爆发）
//  职责：长按拖拽连线、长按结束爆发粒子（点击涟漪已移除）
// ===================================================================

const TWO_PI = Math.PI * 2;
const EMPTY_DASH: number[] = [];

/** 爆发粒子（生成时覆盖全部字段，回收无需重置） */
interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  maxRadius: number;
  startAlpha: number;
  duration: number;
  delay: number;
  lineWidth: number;
  color: string;
  startTime: number;
}

/** 长按结束后残留的连线动画 */
interface TrailLine {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
  width: number;
  color: string;
  startTime: number;
}

/** 极简对象池：复用空闲对象，降低 GC 压力 */
class Pool<T extends { active: boolean }> {
  #idle: T[] = [];
  #create: () => T;
  #capacity: number;

  constructor(create: () => T, capacity: number) {
    this.#create = create;
    this.#capacity = capacity;
  }

  acquire(): T {
    const item = this.#idle.pop() ?? this.#create();
    item.active = true;
    return item;
  }

  release(item: T): void {
    item.active = false;
    if (this.#idle.length < this.#capacity) this.#idle.push(item);
  }

  clear(): void {
    this.#idle.length = 0;
  }
}

export class MouseEffectManager {
  private static readonly CONFIG = {
    longPressThreshold: 100,
    maxLines: 12,
    burst: {
      countBase: 4,
      countTimeFactor: 20,
      countMax: 30,
      radiusBase: 50,
      radiusTimeFactor: 160,
      radiusCap: 320,
      durationBase: 900,
      durationTimeFactor: 0.6,
      durationExtraCap: 700,
      alphaMin: 0.4,
      alphaMax: 0.7,
      lineWidthMin: 1.8,
      lineWidthMax: 3.0,
      delayMax: 180,
      batchSize: 6,
      batchFrameMs: 16.7,
      sizeStart: 1.5,
      sizeMaxBase: 8,
      sizeMaxRand: 10,
      spreadMin: 0.3,
      chaseRate: 13.39,
    },
    line: {
      minDist: 5,
      durationBase: 300,
      durationPerPixel: 0.5,
      durationMax: 700,
      alpha: 0.5,
      width: 1.5,
      drag: {
        alpha: 0.3,
        dotAlpha: 0.4,
        width: 2,
        dotRadius: 3,
        dash: [6, 6],
        dashSpeed: 50,
      },
    },
    fps: { interval: 1000, low: 30, shrink: 0.7, floor: 30 },
    particles: { highEnd: 120, lowEnd: 60 },
  };

  #disabled = false;
  #destroyed = false;
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #logicalWidth = 0;
  #logicalHeight = 0;

  #particles: BurstParticle[] = [];
  #trails: TrailLine[] = [];
  #particlePool = new Pool<BurstParticle>(() => ({
    active: false, x: 0, y: 0, targetX: 0, targetY: 0,
    radius: 0, maxRadius: 0, startAlpha: 0, duration: 1,
    delay: 0, lineWidth: 0, color: '', startTime: 0,
  }), MouseEffectManager.CONFIG.particles.highEnd);
  #trailPool = new Pool<TrailLine>(() => ({
    active: false, startX: 0, startY: 0, endX: 0, endY: 0,
    duration: 1, width: 0, color: '', startTime: 0,
  }), MouseEffectManager.CONFIG.maxLines);

  #pressStartX = 0;
  #pressStartY = 0;
  #pressStartTime = 0;
  #isLongPress = false;
  #longPressTimer: number | null = null;

  #lineActive = false;
  #lineStartX = 0;
  #lineStartY = 0;
  #lineEndX = 0;
  #lineEndY = 0;

  #accentRgb = 'rgb(165, 88, 96)';

  #renderLoopId: number | null = null;
  #isRendering = false;
  #lastFrameTs = 0;

  #frameCount = 0;
  #lastFpsCheck = 0;
  #particleLimit = MouseEffectManager.CONFIG.particles.highEnd;

  #pageHidden = false;

  #themeUnsubscribe: (() => void) | null = null;
  #abort: AbortController | null = null;

  #onThemeChanged = (): void => this.#refreshAccentColor();
  #onResize = (): void => this.#resizeCanvas();
  #onVisibility = (): void => {
    this.#pageHidden = document.hidden;
    if (this.#pageHidden) {
      if (this.#isRendering) this.#stopRenderLoop();
    } else if (this.#hasActiveWork()) {
      this.#startRenderLoop();
    }
  };

  constructor() {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.#disabled = true;
      console.log('[MouseEffect] 触摸设备，禁用鼠标特效');
      return;
    }

    const isLowEnd = window.devicePixelRatio < 2 ||
      !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    this.#particleLimit = isLowEnd
      ? MouseEffectManager.CONFIG.particles.lowEnd
      : MouseEffectManager.CONFIG.particles.highEnd;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 9997; will-change: transform;
    `;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d', { alpha: true });
    this.#resizeCanvas();
    document.body.appendChild(canvas);

    // 记录初始可见性，避免隐藏标签页里首帧绘制
    this.#pageHidden = document.hidden;

    this.#refreshAccentColor();
    this.#themeUnsubscribe = themeController.onChange(this.#onThemeChanged);

    const ac = new AbortController();
    this.#abort = ac;
    const sig = ac.signal;
    window.addEventListener('resize', this.#onResize, { signal: sig });
    document.addEventListener('visibilitychange', this.#onVisibility, { signal: sig });

    console.log('[MouseEffect] 特效引擎初始化完成（长按连线 + 爆发粒子）');
  }

  #refreshAccentColor(): void {
    const hex = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-color').trim() || '#a55860';
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    const r = m ? parseInt(m[1], 16) : 165;
    const g = m ? parseInt(m[2], 16) : 88;
    const b = m ? parseInt(m[3], 16) : 96;
    this.#accentRgb = `rgb(${r}, ${g}, ${b})`;

    // 主题切换时同步更新活跃元素颜色，避免"新粒子换色、旧粒子留旧色"
    for (const p of this.#particles) p.color = this.#accentRgb;
    for (const l of this.#trails) l.color = this.#accentRgb;
  }

  #resizeCanvas(): void {
    const canvas = this.#canvas, ctx = this.#ctx;
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = document.documentElement.getBoundingClientRect();
    const bufferW = Math.round(rect.width * dpr);
    const bufferH = Math.round(rect.height * dpr);

    if (canvas.width === bufferW && canvas.height === bufferH) return;

    canvas.width = bufferW;
    canvas.height = bufferH;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#logicalWidth = rect.width;
    this.#logicalHeight = rect.height;
  }

  #hasActiveWork(): boolean {
    return this.#particles.length > 0 || this.#trails.length > 0 || this.#lineActive;
  }

  #startRenderLoop(): void {
    if (this.#disabled || this.#destroyed || this.#pageHidden || this.#isRendering) return;
    this.#isRendering = true;
    this.#lastFrameTs = 0;
    this.#renderLoopId = requestAnimationFrame(this.#frame);
  }

  #stopRenderLoop(): void {
    if (this.#renderLoopId !== null) {
      cancelAnimationFrame(this.#renderLoopId);
      this.#renderLoopId = null;
    }
    this.#isRendering = false;
    this.#clearCanvas();
  }

  #frame = (now: number): void => {
    if (this.#pageHidden || this.#destroyed) {
      this.#isRendering = false;
      this.#renderLoopId = null;
      return;
    }

    const dt = this.#lastFrameTs > 0
      ? Math.min((now - this.#lastFrameTs) / 1000, 0.05)
      : 1 / 60;
    this.#lastFrameTs = now;

    this.#render(now, dt);

    if (this.#hasActiveWork()) {
      this.#renderLoopId = requestAnimationFrame(this.#frame);
    } else {
      this.#isRendering = false;
      this.#renderLoopId = null;
      this.#clearCanvas();
    }
  };

  #clearCanvas(): void {
    this.#ctx?.clearRect(0, 0, this.#logicalWidth, this.#logicalHeight);
  }

  #render(now: number, dt: number): void {
    const ctx = this.#ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0,
      this.#logicalWidth || window.innerWidth,
      this.#logicalHeight || window.innerHeight);

    this.#renderBurst(ctx, now, dt);
    this.#renderTrails(ctx, now);
    if (this.#lineActive) this.#renderDragLine(ctx, now);

    this.#enforceLimits();
    this.#adaptParticleLimit(now);
  }

  #renderBurst(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    const list = this.#particles;
    const chase = 1 - Math.exp(-MouseEffectManager.CONFIG.burst.chaseRate * dt);
    let strokedColor = '';

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const t = (now - p.startTime - p.delay) / p.duration;
      if (t < 0) continue;
      if (t >= 1) {
        list.splice(i, 1);
        this.#particlePool.release(p);
        continue;
      }

      p.x += (p.targetX - p.x) * chase;
      p.y += (p.targetY - p.y) * chase;

      const sizeT = t < 0.6 ? t / 0.6 : 1 - ((t - 0.6) / 0.4) * 0.3;
      const radius = Math.max(0, p.radius + (p.maxRadius - p.radius) * sizeT);
      const alpha = t < 0.2 ? p.startAlpha : p.startAlpha * (1 - (t - 0.2) / 0.8);

      if (p.color !== strokedColor) {
        strokedColor = p.color;
        ctx.strokeStyle = p.color;
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = p.lineWidth;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, TWO_PI);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  #renderTrails(ctx: CanvasRenderingContext2D, now: number): void {
    const list = this.#trails;
    const baseAlpha = MouseEffectManager.CONFIG.line.alpha;
    let strokedColor = '';
    ctx.lineCap = 'round';

    for (let i = list.length - 1; i >= 0; i--) {
      const line = list[i];
      const t = (now - line.startTime) / line.duration;
      if (t >= 1) {
        list.splice(i, 1);
        this.#trailPool.release(line);
        continue;
      }

      const eased = t * (2 - t);

      if (line.color !== strokedColor) {
        strokedColor = line.color;
        ctx.strokeStyle = line.color;
      }
      ctx.globalAlpha = baseAlpha * (1 - eased);
      ctx.lineWidth = line.width * (1 - eased * 0.5);
      ctx.beginPath();
      ctx.moveTo(
        line.startX + (line.endX - line.startX) * eased,
        line.startY + (line.endY - line.startY) * eased);
      ctx.lineTo(line.endX, line.endY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  #renderDragLine(ctx: CanvasRenderingContext2D, now: number): void {
    const dx = this.#lineEndX - this.#lineStartX;
    const dy = this.#lineEndY - this.#lineStartY;
    const minDist = MouseEffectManager.CONFIG.line.minDist;
    if (dx * dx + dy * dy <= minDist * minDist) return;

    const drag = MouseEffectManager.CONFIG.line.drag;
    ctx.strokeStyle = this.#accentRgb;
    ctx.fillStyle = this.#accentRgb;
    ctx.lineWidth = drag.width;
    ctx.lineCap = 'round';

    ctx.globalAlpha = drag.alpha;
    ctx.setLineDash(drag.dash);
    ctx.lineDashOffset = -now / drag.dashSpeed;
    ctx.beginPath();
    ctx.moveTo(this.#lineStartX, this.#lineStartY);
    ctx.lineTo(this.#lineEndX, this.#lineEndY);
    ctx.stroke();

    ctx.setLineDash(EMPTY_DASH);
    ctx.globalAlpha = drag.dotAlpha;
    ctx.beginPath();
    ctx.arc(this.#lineStartX, this.#lineStartY, drag.dotRadius, 0, TWO_PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.#lineEndX, this.#lineEndY, drag.dotRadius, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  #enforceLimits(): void {
    const excessP = this.#particles.length - this.#particleLimit;
    if (excessP > 0) {
      const removed = this.#particles.splice(0, excessP);
      for (const p of removed) this.#particlePool.release(p);
    }
    const excessL = this.#trails.length - MouseEffectManager.CONFIG.maxLines;
    if (excessL > 0) {
      const removed = this.#trails.splice(0, excessL);
      for (const l of removed) this.#trailPool.release(l);
    }
  }

  #adaptParticleLimit(now: number): void {
    this.#frameCount++;
    const fps = MouseEffectManager.CONFIG.fps;
    if (now - this.#lastFpsCheck < fps.interval) return;

    const measured = this.#frameCount;
    this.#frameCount = 0;
    this.#lastFpsCheck = now;

    if (measured < fps.low && this.#particleLimit > fps.floor) {
      this.#particleLimit = Math.max(fps.floor, Math.floor(this.#particleLimit * fps.shrink));
      console.warn('[MouseEffect] 低帧率，降低粒子上限至', this.#particleLimit);
    }
  }

  /** @deprecated 点击涟漪已移除 */
  public triggerClick(_x: number, _y: number): void { /* no-op */ }

  public triggerLongPress(x: number, y: number, duration: number): void {
    if (this.#disabled || this.#destroyed) return;

    const b = MouseEffectManager.CONFIG.burst;
    const count = Math.min(
      Math.max(b.countBase, Math.floor(b.countBase + (duration / 2000) * b.countTimeFactor)),
      b.countMax);
    const spreadRadius = Math.min(
      b.radiusCap,
      b.radiusBase + Math.pow(duration / 1000, 0.8) * b.radiusTimeFactor);
    const lifetime = b.durationBase + Math.min(duration * b.durationTimeFactor, b.durationExtraCap);

    const now = performance.now();
    const alphaSpan = b.alphaMax - b.alphaMin;
    const widthSpan = b.lineWidthMax - b.lineWidthMin;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TWO_PI;
      const dist = spreadRadius * (b.spreadMin + Math.random() * (1 - b.spreadMin));

      const p = this.#particlePool.acquire();
      p.x = x;
      p.y = y;
      p.targetX = x + Math.cos(angle) * dist;
      p.targetY = y + Math.sin(angle) * dist;
      p.radius = b.sizeStart;
      p.maxRadius = b.sizeMaxBase + Math.random() * b.sizeMaxRand;
      p.startAlpha = b.alphaMin + Math.random() * alphaSpan;
      p.duration = lifetime;
      p.delay = Math.random() * b.delayMax + Math.floor(i / b.batchSize) * b.batchFrameMs;
      p.lineWidth = b.lineWidthMin + Math.random() * widthSpan;
      p.color = this.#accentRgb;
      p.startTime = now;
      this.#particles.push(p);
    }

    this.#startRenderLoop();
  }

  public startLine(x: number, y: number): void {
    if (this.#disabled || this.#destroyed) return;
    this.#clearTrails();
    this.#lineActive = true;
    this.#lineStartX = this.#lineEndX = x;
    this.#lineStartY = this.#lineEndY = y;
    this.#startRenderLoop();
  }

  public updateLine(x: number, y: number): void {
    if (this.#disabled || this.#destroyed || !this.#lineActive) return;
    this.#lineEndX = x;
    this.#lineEndY = y;
    this.#startRenderLoop();
  }

  public endLine(x: number, y: number): void {
    if (this.#disabled || this.#destroyed || !this.#lineActive) return;
    this.#lineActive = false;
    this.#lineEndX = x;
    this.#lineEndY = y;

    const cfg = MouseEffectManager.CONFIG.line;
    const dx = x - this.#lineStartX;
    const dy = y - this.#lineStartY;
    const distance = Math.hypot(dx, dy);
    if (distance < cfg.minDist) return;

    const line = this.#trailPool.acquire();
    line.startX = this.#lineStartX;
    line.startY = this.#lineStartY;
    line.endX = x;
    line.endY = y;
    line.duration = Math.min(cfg.durationBase + distance * cfg.durationPerPixel, cfg.durationMax);
    line.width = cfg.width;
    line.color = this.#accentRgb;
    line.startTime = performance.now();
    this.#trails.push(line);

    this.#startRenderLoop();
  }

  #clearTrails(): void {
    for (const l of this.#trails) this.#trailPool.release(l);
    this.#trails.length = 0;
  }

  public onPointerDown(x: number, y: number): void {
    if (this.#disabled || this.#destroyed) return;

    this.#pressStartX = x;
    this.#pressStartY = y;
    this.#pressStartTime = performance.now();
    this.#isLongPress = false;
    this.#lineActive = false;
    this.#clearTrails();

    if (this.#longPressTimer !== null) clearTimeout(this.#longPressTimer);
    this.#longPressTimer = window.setTimeout(() => {
      this.#longPressTimer = null;
      this.#isLongPress = true;
      this.startLine(this.#pressStartX, this.#pressStartY);
      navigator.vibrate?.(8);
    }, MouseEffectManager.CONFIG.longPressThreshold);
  }

  public onPointerMove(x: number, y: number): void {
    if (this.#disabled || this.#destroyed || !this.#isLongPress) return;
    this.updateLine(x, y);
  }

  public onPointerUp(x: number, y: number): void {
    if (this.#disabled || this.#destroyed) return;

    if (this.#longPressTimer !== null) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }
    if (!this.#isLongPress) return;

    this.#isLongPress = false;
    const duration = performance.now() - this.#pressStartTime;
    this.triggerLongPress(x, y, duration);
    this.endLine(x, y);
  }

  public destroy(): void {
    this.#disabled = true;
    this.#destroyed = true;
    this.#stopRenderLoop();

    if (this.#longPressTimer !== null) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }

    this.#themeUnsubscribe?.();
    this.#themeUnsubscribe = null;

    if (this.#abort) { this.#abort.abort(); this.#abort = null; }

    this.#canvas?.remove();
    this.#canvas = null;
    this.#ctx = null;

    this.#particles.length = 0;
    this.#trails.length = 0;
    this.#particlePool.clear();
    this.#trailPool.clear();

    console.log('[MouseEffect] 特效引擎已销毁');
  }
}

// ===================================================================
//  CustomCursor — 自定义光标（对齐 cursor-fx-userscript 3.0.0）
//  圆点 + 圆环，纯 DOM + transform，不使用 SVG/Canvas
//  特性：延迟跟随、悬停贴合、文本竖条、滚动拖尾、点击弹簧、空闲暂停
//  集成 MouseEffectManager 的长按连线 / 爆发粒子
//  自动探测 Cursor FX 用户脚本，若存在则让出控制权
// ===================================================================

interface TransformCache { x: number; y: number; s: number }

/** 与用户脚本一致的量化 transform 写入：x/y 保留 2 位、scale 保留 3 位 */
function writeTransform(
  el: HTMLElement, x: number, y: number, s: number, cache: TransformCache,
): void {
  const qx = Math.round(x * 100) / 100;
  const qy = Math.round(y * 100) / 100;
  const qs = Math.round(s * 1000) / 1000;
  if (cache.x === qx && cache.y === qy && cache.s === qs) return;
  cache.x = qx; cache.y = qy; cache.s = qs;
  el.style.transform =
    `translate3d(${qx}px,${qy}px,0) translate(-50%,-50%) scale(${qs})`;
}

/** 解析元素的最大 border-radius（支持 "8px"、"50%" 或四角简写） */
function parseBorderRadius(el: Element, rect: DOMRect): number {
  const br = getComputedStyle(el).borderRadius || '0px';
  const parts = br.split(/\s+/);
  const minSide = Math.min(rect.width, rect.height);
  let max = 0;
  for (const p of parts) {
    const v = parseFloat(p);
    if (!isFinite(v)) continue;
    max = Math.max(max, p.endsWith('%') ? (v / 100) * minSide : v);
  }
  return max;
}

export class CustomCursor {
  // ---- 配置（与用户脚本对齐，含 3 个开关） ----
  private static readonly DEFAULTS = {
    ENABLE_DOT: true,
    ENABLE_RING: true,
    HIDE_CURSOR: true,

    DOT_SIZE: 8,
    RING_SIZE: 40,
    RING_BORDER: 1.5,
    RING_ALPHA: 0.9,
    TEXT_RING_ALPHA: 0.4,
    TEXT_RING_SIZE: 24,
    MAX_FIT_SIZE: 200,
    FIT_PADDING: 6,
    TEXT_BAR_W: 2,
    TEXT_BAR_H: 22,
    FOLLOW_SPEED: 16,
    FIT_SPEED: 26,
    SHAPE_SPEED: 18,
    SCROLL_MAX: 30,
    SCROLL_DECAY: 7,
    CLICK_SCALE: 0.78,
    SPRING_K: 520,
    SPRING_DAMP: 21,
    IDLE_PAUSE_MS: 2500,
  };

  private static readonly SEL_INTERACTIVE =
    'a, button, [role="button"], [tabindex]:not([tabindex="-1"]), [onclick]';

  private static readonly SEL_TEXT =
    'input:not([type="button"]):not([type="checkbox"]):not([type="radio"])' +
    ':not([type="submit"]):not([type="reset"]):not([type="image"])' +
    ':not([type="range"]):not([type="color"]):not([type="file"]),' +
    'textarea,[contenteditable="true"],[contenteditable=""],' +
    '[contenteditable="plaintext-only"],[role="textbox"]';

  // ---- 内部状态 ----
  #cfg: typeof CustomCursor.DEFAULTS;
  #disabled = false;
  #initialized = false;

  #dot: HTMLDivElement | null = null;
  #ring: HTMLDivElement | null = null;
  #styleTag: HTMLStyleElement | null = null;
  #abort: AbortController | null = null;
  #guardian: MutationObserver | null = null;

  #effectManager: MouseEffectManager | null = null;

  // ---- 运动状态 ----
  #mx = 0; #my = 0;
  #rx = 0; #ry = 0;
  #rw = 0; #rh = 0; #rr = 0;
  #tw = 0; #th = 0; #tr = 0;
  #sX = 0; #sY = 0;
  #dotS = 1; #ringS = 1;
  #dotV = 0; #ringV = 0;

  #pressed = false;
  #hoverEl: Element | null = null;
  #hoverRad = 0;
  #focusEl: Element | null = null;
  #focusRad = 0;
  #textEl: Element | null = null;
  #dotIsBar = false;
  #ringDim = false;
  #shown = false;
  #inside = true;

  #lastInput = 0;
  #lastT = 0;
  #rafId = 0;

  // ---- 写入缓存 ----
  #dotCache: TransformCache = { x: NaN, y: NaN, s: NaN };
  #ringCache: TransformCache = { x: NaN, y: NaN, s: NaN };
  #lastW = -1; #lastH = -1; #lastR = -1;

  // ---- 空闲检测 ----
  #ringSettled = false;
  #dotSettled = false;

  #tickBound = (t: number): void => this.#tick(t);

  constructor(options: Partial<typeof CustomCursor.DEFAULTS> = {}) {
    // 触摸设备直接跳过
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.#disabled = true;
      this.#cfg = { ...CustomCursor.DEFAULTS };
      console.log('[CustomCursor] 触摸设备，跳过自定义光标');
      return;
    }

    this.#cfg = { ...CustomCursor.DEFAULTS, ...options };

    // 减少动态效果：直接覆盖（与脚本一次性生效方式一致）
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(this.#cfg, {
        FOLLOW_SPEED: 1e4, FIT_SPEED: 1e4, SHAPE_SPEED: 1e4,
        SCROLL_MAX: 0, SCROLL_DECAY: 1e4,
        SPRING_K: 1e4, SPRING_DAMP: 1e4,
      });
    }

    // 异步探测 Cursor FX 用户脚本
    this.#probeUserscript().then((exists) => {
      if (this.#disabled) return;
      if (exists) {
        console.log('[CustomCursor] 检测到 Cursor FX 用户脚本，让出控制权');
        this.#disabled = true;
        return;
      }
      this.#mount();
    });
  }

  // ================================================================
  //  用户脚本探测（Promise.race 超时降级）
  // ================================================================
  #probeUserscript(timeoutMs = 30): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const requestId = `cursorfx-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;

      const finish = (v: boolean): void => {
        if (settled) return;
        settled = true;
        window.removeEventListener('CURSORFX_RESPONSE', onResponse);
        resolve(v);
      };

      const onResponse = (e: Event): void => {
        const detail = (e as CustomEvent).detail;
        if (detail?.requestId === requestId && detail?.result?.status === 'alive') {
          finish(true);
        }
      };

      window.addEventListener('CURSORFX_RESPONSE', onResponse);
      window.dispatchEvent(new CustomEvent('CURSORFX_REQUEST', {
        detail: { action: 'ping', requestId },
      }));
      setTimeout(() => finish(false), timeoutMs);
    });
  }

  // ================================================================
  //  初始化（仅一次）
  // ================================================================
  #mount(): void {
    if (this.#disabled || this.#initialized) return;

    if (!document.body) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.#mount(), { once: true });
      }
      return;
    }

    this.#initialized = true;

    // 事件绑定用同一 AbortController
    const ac = new AbortController();
    this.#abort = ac;

    this.#injectStyles();
    this.#createElements();
    this.#bindEvents(ac.signal);
    this.#installGuardian();

    // 长按 / 粒子引擎
    this.#effectManager = new MouseEffectManager();

    // 初始运动状态：从屏幕中心开始
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    this.#mx = cx; this.#my = cy;
    this.#rx = cx; this.#ry = cy;
    this.#rw = this.#cfg.RING_SIZE;
    this.#rh = this.#cfg.RING_SIZE;
    this.#rr = this.#cfg.RING_SIZE / 2;
    this.#tw = this.#rw; this.#th = this.#rh; this.#tr = this.#rr;

    this.#lastInput = performance.now();
    this.#lastT = this.#lastInput;
    this.#rafId = requestAnimationFrame(this.#tickBound);

    console.log('[CustomCursor] 自定义光标初始化完成（仿 cursor-fx）');
  }

  // ================================================================
  //  样式 & DOM
  // ================================================================
  #injectStyles(): void {
    const cfg = this.#cfg;
    const style = document.createElement('style');
    style.id = 'custom-cursor-styles';

    const cursorRule = cfg.HIDE_CURSOR
      ? '*,*::before,*::after{cursor:none !important}'
      : '';
    const dotDisplay = cfg.ENABLE_DOT ? '' : '.cc-dot{display:none !important}';
    const ringDisplay = cfg.ENABLE_RING ? '' : '.cc-ring{display:none !important}';

    style.textContent = `
      ${cursorRule}
      .cc-dot,.cc-ring{
        position:fixed;left:0;top:0;
        pointer-events:none;
        z-index:2147483647;
        mix-blend-mode:difference;
        will-change:transform;
        opacity:0;
      }
      .cc-dot{
        width:${cfg.DOT_SIZE}px;height:${cfg.DOT_SIZE}px;
        background:#fff;border-radius:50%;
        transition:opacity .3s ease,width .22s ease,height .22s ease,border-radius .22s ease;
      }
      .cc-ring{
        width:${cfg.RING_SIZE}px;height:${cfg.RING_SIZE}px;
        border:${cfg.RING_BORDER}px solid rgb(255 255 255 / var(--ccA,${cfg.RING_ALPHA}));
        border-radius:50%;
        transition:opacity .3s ease,border-color .25s ease;
      }
      .cc-live{opacity:1}
      ${dotDisplay}
      ${ringDisplay}
    `;
    document.head.appendChild(style);
    this.#styleTag = style;
  }

  #createElements(): void {
    // 幂等：重建前先移除旧元素
    this.#dot?.remove();
    this.#ring?.remove();

    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cc-dot';
    ring.className = 'cc-ring';
    // ring 在 dot 之下
    (document.body || document.documentElement).append(ring, dot);

    this.#dot = dot;
    this.#ring = ring;

    // 重置形状 / 透明度状态
    this.#dotIsBar = false;
    this.#ringDim = false;
    dot.style.width = this.#cfg.DOT_SIZE + 'px';
    dot.style.height = this.#cfg.DOT_SIZE + 'px';
    dot.style.borderRadius = '50%';

    // 重置写入缓存，保证下一帧一定会写入
    this.#dotCache.x = this.#dotCache.y = this.#dotCache.s = NaN;
    this.#ringCache.x = this.#ringCache.y = this.#ringCache.s = NaN;
    this.#lastW = this.#lastH = this.#lastR = -1;

    // 立即落位，避免闪一下
    writeTransform(dot, this.#mx, this.#my, 1, this.#dotCache);
    writeTransform(ring, this.#rx, this.#ry, 1, this.#ringCache);

    // 若此前已显示，则新元素直接带上 live 状态
    if (this.#shown) {
      dot.classList.add('cc-live');
      ring.classList.add('cc-live');
    }
  }

  #isMounted(): boolean {
    return !!(this.#dot?.isConnected && this.#ring?.isConnected);
  }

  #installGuardian(): void {
    // 只观察 body 的直接子节点变化。
    // 原来观察 documentElement 的 { childList, subtree }，
    // 页面上任何节点插入（搜索结果分批渲染、tooltip 插入等）都会触发回调。
    // dot / ring 是 body 的直接子元素，看住这一层就够了。
    this.#guardian = new MutationObserver(() => {
      if (!this.#isMounted()) {
        this.#createElements();
        this.#wake();
      }
    });
    this.#guardian.observe(document.body || document.documentElement, {
      childList: true,
    });
  }

  // ================================================================
  //  事件绑定（统一 AbortController 管理生命周期）
  // ================================================================
  #bindEvents(sig: AbortSignal): void {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.#mx = e.clientX;
      this.#my = e.clientY;
      if (this.#focusEl) { this.#focusEl = null; this.#focusRad = 0; }
      this.#effectManager?.onPointerMove(e.clientX, e.clientY);
      this.#wake();
    }, { passive: true, signal: sig });

    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.#pressed = true;
      this.#effectManager?.onPointerDown(e.clientX, e.clientY);
      this.#wake();
    }, { passive: true, signal: sig });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.#pressed = false;
      this.#effectManager?.onPointerUp(e.clientX, e.clientY);
      this.#wake();
    }, { passive: true, signal: sig });

    window.addEventListener('pointercancel', () => {
      this.#pressed = false;
      this.#wake();
    }, { passive: true, signal: sig });

    // 滚动拖尾：与脚本一致的 16 / 120 系数
    window.addEventListener('wheel', (e) => {
      if (this.#hoverEl || this.#focusEl || this.#textEl) return;
      let dx = e.deltaX, dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
      else if (e.deltaMode === 2) { dx *= 120; dy *= 120; }
      const max = this.#cfg.SCROLL_MAX;
      this.#sX = this.#clamp(this.#sX - this.#clamp(dx, -80, 80), -max, max);
      this.#sY = this.#clamp(this.#sY - this.#clamp(dy, -80, 80), -max, max);
      this.#wake();
    }, { passive: true, signal: sig });

    document.addEventListener('mouseover', (e) => this.#onMouseOver(e), { signal: sig });

    document.addEventListener('focusin', (e) => this.#onFocusIn(e), { signal: sig });

    document.addEventListener('focusout', (e) => {
      if (this.#focusEl === e.target) { this.#focusEl = null; this.#wake(); }
    }, { signal: sig });

    const docEl = document.documentElement;
    docEl.addEventListener('mouseenter', () => { this.#inside = true; this.#wake(); }, { signal: sig });
    docEl.addEventListener('mouseleave', () => { this.#inside = false; this.#hide(); }, { signal: sig });
    window.addEventListener('blur', () => this.#hide(), { signal: sig });
    window.addEventListener('focus', () => { if (this.#inside) this.#wake(); }, { signal: sig });
  }

  #onMouseOver(e: MouseEvent): void {
    const tgt = e.target as Element | null;
    if (!tgt || tgt.nodeType !== 1) return;

    // 文本模式
    const txt = tgt.closest(CustomCursor.SEL_TEXT);
    if (txt !== this.#textEl) {
      this.#textEl = txt;
      this.#setDotShape(!!txt);
      this.#setRingAlpha(!!txt);
    }

    // hoverEl 掉线则清空
    if (this.#hoverEl && !this.#hoverEl.isConnected) {
      this.#hoverEl = null;
      this.#hoverRad = 0;
    }

    // 悬停贴合目标
    const inter = tgt.closest(CustomCursor.SEL_INTERACTIVE);
    if (inter !== this.#hoverEl) {
      let next: Element | null = null;
      let rad = 0;
      if (inter && !inter.matches(CustomCursor.SEL_TEXT)) {
        const m = this.#measure(inter);
        if (m !== null) { next = inter; rad = m; }
      }
      this.#hoverEl = next;
      this.#hoverRad = rad;
    }
  }

  #onFocusIn(e: FocusEvent): void {
    const tgt = e.target as Element | null;
    if (!tgt || tgt.nodeType !== 1) return;
    if (tgt.matches(CustomCursor.SEL_TEXT) || !tgt.matches(CustomCursor.SEL_INTERACTIVE)) return;
    const m = this.#measure(tgt);
    if (m !== null) {
      this.#focusEl = tgt;
      this.#focusRad = m;
      this.#wake();
    }
  }

  // ================================================================
  //  工具方法
  // ================================================================
  #clamp(v: number, a: number, b: number): number {
    return v < a ? a : (v > b ? b : v);
  }

  /** 元素是否符合贴合条件；返回 border-radius 或 null */
  #measure(el: Element): number | null {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    if (r.width > this.#cfg.MAX_FIT_SIZE || r.height > this.#cfg.MAX_FIT_SIZE) return null;
    return parseBorderRadius(el, r);
  }

  #show(): void {
    if (this.#shown) return;
    this.#shown = true;
    this.#dot?.classList.add('cc-live');
    this.#ring?.classList.add('cc-live');
  }

  #hide(): void {
    if (!this.#shown) return;
    this.#shown = false;
    this.#dot?.classList.remove('cc-live');
    this.#ring?.classList.remove('cc-live');
  }

  #wake(): void {
    this.#lastInput = performance.now();
    this.#show();
    if (!this.#rafId && !this.#disabled) {
      this.#lastT = this.#lastInput;
      this.#rafId = requestAnimationFrame(this.#tickBound);
    }
  }

  // ================================================================
  //  形状 / 透明度切换
  // ================================================================
  #setDotShape(bar: boolean): void {
    if (this.#dotIsBar === bar) return;
    this.#dotIsBar = bar;
    const d = this.#dot;
    if (!d) return;
    d.style.width = (bar ? this.#cfg.TEXT_BAR_W : this.#cfg.DOT_SIZE) + 'px';
    d.style.height = (bar ? this.#cfg.TEXT_BAR_H : this.#cfg.DOT_SIZE) + 'px';
    d.style.borderRadius = bar ? '2px' : '50%';
  }

  #setRingAlpha(dim: boolean): void {
    if (this.#ringDim === dim) return;
    this.#ringDim = dim;
    this.#ring?.style.setProperty(
      '--ccA', dim ? String(this.#cfg.TEXT_RING_ALPHA) : String(this.#cfg.RING_ALPHA),
    );
  }

  // ================================================================
  //  公开：参数变更后刷新（保留与脚本 refresh() 一致的语义）
  // ================================================================
  public refresh(): void {
    const { dot, ring } = this;
    if (!dot || !ring) return;

    const dotTrans = dot.style.transition;
    const ringTrans = ring.style.transition;
    dot.style.transition = 'none';
    ring.style.transition = 'none';

    // 强制形状/透明度各重绘一次
    const b = this.#dotIsBar; this.#dotIsBar = !b; this.#setDotShape(b);
    const d = this.#ringDim; this.#ringDim = !d; this.#setRingAlpha(d);

    this.#lastW = this.#lastH = this.#lastR = -1;
    this.#dotCache.x = this.#dotCache.y = this.#dotCache.s = NaN;
    this.#ringCache.x = this.#ringCache.y = this.#ringCache.s = NaN;

    requestAnimationFrame(() => {
      if (this.#dot) this.#dot.style.transition = dotTrans || '';
      if (this.#ring) this.#ring.style.transition = ringTrans || '';
    });

    this.#wake();
  }

  // ================================================================
  //  主循环
  // ================================================================
  #tick = (t: number): void => {
    if (this.#disabled) return;
    this.#rafId = 0;

    const dt = this.#clamp((t - this.#lastT) / 1000, 0, 0.05) || 0.016;
    this.#lastT = t;

    // 解析当前贴合元素
    let el: Element | null = this.#hoverEl || this.#focusEl;
    const elRad = this.#hoverEl ? this.#hoverRad : this.#focusRad;
    if (el && !el.isConnected) {
      if (this.#hoverEl === el) this.#hoverEl = null;
      if (this.#focusEl === el) this.#focusEl = null;
      el = null;
    }

    // 1) 滚动拖尾衰减
    if (this.#sX !== 0 || this.#sY !== 0) {
      const d = Math.exp(-this.#cfg.SCROLL_DECAY * dt);
      this.#sX *= d; this.#sY *= d;
      if (Math.abs(this.#sX) < 0.05) this.#sX = 0;
      if (Math.abs(this.#sY) < 0.05) this.#sY = 0;
    }

    // 2) 目标位置/尺寸
    let tx = this.#mx + this.#sX, ty = this.#my + this.#sY;
    let speed = this.#cfg.FOLLOW_SPEED;

    const baseSize = this.#textEl ? this.#cfg.TEXT_RING_SIZE : this.#cfg.RING_SIZE;
    let tw = baseSize, th = baseSize, tr = baseSize / 2;

    if (el) {
      const r = el.getBoundingClientRect();
      if ((r.width === 0 && r.height === 0) ||
          r.width > this.#cfg.MAX_FIT_SIZE || r.height > this.#cfg.MAX_FIT_SIZE) {
        if (this.#hoverEl === el) { this.#hoverEl = null; this.#hoverRad = 0; }
        if (this.#focusEl === el) { this.#focusEl = null; this.#focusRad = 0; }
      } else {
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
        tw = r.width + this.#cfg.FIT_PADDING * 2;
        th = r.height + this.#cfg.FIT_PADDING * 2;
        tr = Math.min(elRad + this.#cfg.FIT_PADDING, Math.min(tw, th) / 2);
        speed = this.#cfg.FIT_SPEED;
      }
    }

    const pressedTarget = this.#pressed ? this.#cfg.CLICK_SCALE : 1;

    // 3) 圆环
    if (this.#cfg.ENABLE_RING) {
      const k = 1 - Math.exp(-speed * dt);
      this.#rx += (tx - this.#rx) * k;
      this.#ry += (ty - this.#ry) * k;
      if (Math.abs(tx - this.#rx) < 0.05) this.#rx = tx;
      if (Math.abs(ty - this.#ry) < 0.05) this.#ry = ty;

      const ks = 1 - Math.exp(-this.#cfg.SHAPE_SPEED * dt);
      this.#rw += (tw - this.#rw) * ks;
      this.#rh += (th - this.#rh) * ks;
      this.#rr += (tr - this.#rr) * ks;
      if (Math.abs(tw - this.#rw) < 0.1) this.#rw = tw;
      if (Math.abs(th - this.#rh) < 0.1) this.#rh = th;
      if (Math.abs(tr - this.#rr) < 0.1) this.#rr = tr;

      this.#ringV = (this.#ringV + (pressedTarget - this.#ringS) * this.#cfg.SPRING_K * dt)
        * Math.exp(-this.#cfg.SPRING_DAMP * dt);
      this.#ringS = Math.max(0.2, this.#ringS + this.#ringV * dt);

      const ring = this.#ring;
      if (ring) {
        writeTransform(ring, this.#rx, this.#ry, this.#ringS, this.#ringCache);

        const qrw = Math.round(this.#rw * 10) / 10;
        const qrh = Math.round(this.#rh * 10) / 10;
        const qrr = Math.round(this.#rr * 10) / 10;
        if (qrw !== this.#lastW) { ring.style.width = qrw + 'px'; this.#lastW = qrw; }
        if (qrh !== this.#lastH) { ring.style.height = qrh + 'px'; this.#lastH = qrh; }
        if (qrr !== this.#lastR) { ring.style.borderRadius = qrr + 'px'; this.#lastR = qrr; }

        // 与脚本一致：用尺寸量化后的值判定稳定
        this.#ringSettled =
          qrw === Math.round(tw * 10) / 10 &&
          qrh === Math.round(th * 10) / 10 &&
          qrr === Math.round(tr * 10) / 10 &&
          Math.abs(this.#ringS - pressedTarget) < 0.002 &&
          Math.abs(this.#ringV) < 0.01;
      } else {
        this.#ringSettled = true;
      }
    } else {
      this.#ringSettled = true;
    }

    // 4) 圆点
    if (this.#cfg.ENABLE_DOT) {
      this.#dotV = (this.#dotV + (pressedTarget - this.#dotS) * this.#cfg.SPRING_K * dt)
        * Math.exp(-this.#cfg.SPRING_DAMP * dt);
      this.#dotS = Math.max(0.2, this.#dotS + this.#dotV * dt);

      const dot = this.#dot;
      if (dot) writeTransform(dot, this.#mx, this.#my, this.#dotS, this.#dotCache);

      this.#dotSettled =
        Math.abs(this.#dotS - pressedTarget) < 0.002 &&
        Math.abs(this.#dotV) < 0.01;
    } else {
      this.#dotSettled = true;
    }

    // 5) 空闲判定
    const idle = this.#ringSettled && this.#dotSettled &&
      !el && this.#sX === 0 && this.#sY === 0;
    if (idle && t - this.#lastInput > this.#cfg.IDLE_PAUSE_MS) return;

    this.#rafId = requestAnimationFrame(this.#tickBound);
  };

  // ================================================================
  //  销毁
  // ================================================================
  public destroy(): void {
    this.#disabled = true;
    this.#initialized = false;

    if (this.#abort) { this.#abort.abort(); this.#abort = null; }
    if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = 0; }

    this.#guardian?.disconnect();
    this.#guardian = null;

    this.#dot?.remove(); this.#dot = null;
    this.#ring?.remove(); this.#ring = null;
    this.#styleTag?.remove(); this.#styleTag = null;

    this.#effectManager?.destroy();
    this.#effectManager = null;

    console.log('[CustomCursor] 已销毁');
  }
}