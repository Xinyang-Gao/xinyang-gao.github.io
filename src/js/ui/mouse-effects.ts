// /js/ui/mouse-effects.ts
// 鼠标特效引擎（长按连线 + 爆发粒子） + 自定义光标（圆点+圆环，仿 cursor-fx 用户脚本）
// 性能优化：空闲自动暂停渲染循环，页面隐藏时暂停，减少 CPU 开销，优化 GC 和 Canvas 状态切换

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
  targetX: number;          // 扩散目标点
  targetY: number;
  radius: number;           // 初始半径
  maxRadius: number;        // 扩散峰值半径
  startAlpha: number;
  duration: number;
  delay: number;            // 错峰出现延迟
  lineWidth: number;
  color: string;            // 纯色 'rgb(r, g, b)'，透明度走 globalAlpha
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
  // ---- 静态配置（只读，运行时不再被改写） ----
  private static readonly CONFIG = {
    longPressThreshold: 100,
    maxLines: 12,
    burst: {
      countBase: 4,              // 最少粒子数
      countTimeFactor: 20,       // 长按每 2000ms 额外增加的数量
      countMax: 30,
      radiusBase: 50,
      radiusTimeFactor: 160,     // 扩散半径 = base + sec^0.8 * factor
      radiusCap: 320,
      durationBase: 900,
      durationTimeFactor: 0.6,   // 粒子寿命 = base + min(按压时长 * factor, extraCap)
      durationExtraCap: 700,
      alphaMin: 0.4,
      alphaMax: 0.7,
      lineWidthMin: 1.8,
      lineWidthMax: 3.0,
      delayMax: 180,             // 随机出现延迟
      batchSize: 6,              // 仅用于模拟旧实现"逐帧批量生成"的节奏
      batchFrameMs: 16.7,
      sizeStart: 1.5,
      sizeMaxBase: 8,
      sizeMaxRand: 10,
      spreadMin: 0.3,            // 散布距离 = 扩散半径 * (0.3 ~ 1.0)
      chaseRate: 13.39,          // 追逐趋近率：60fps 下每帧系数 ≈ 0.2，与旧实现一致
    },
    line: {
      minDist: 5,                // 短于此距离不产生连线动画
      durationBase: 300,
      durationPerPixel: 0.5,
      durationMax: 700,
      alpha: 0.5,
      width: 1.5,
      drag: {                    // 实时拖拽虚线
        alpha: 0.3,
        dotAlpha: 0.4,
        width: 2,
        dotRadius: 3,
        dash: [6, 6],
        dashSpeed: 50,           // lineDashOffset = -now / dashSpeed
      },
    },
    fps: { interval: 1000, low: 30, shrink: 0.7, floor: 30 },
    particles: { highEnd: 120, lowEnd: 60 },
  };

  // ---- 画布 ----
  #disabled = false;
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #logicalWidth = 0;
  #logicalHeight = 0;

  // ---- 对象池与活跃列表 ----
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

  // ---- 长按状态 ----
  #pressStartX = 0;
  #pressStartY = 0;
  #pressStartTime = 0;
  #isLongPress = false;
  #longPressTimer: number | null = null;

  // ---- 拖拽连线状态 ----
  #lineActive = false;
  #lineStartX = 0;
  #lineStartY = 0;
  #lineEndX = 0;
  #lineEndY = 0;

  // ---- 主题色缓存（纯色字符串 + globalAlpha，避免每帧拼接 rgba） ----
  #accentRgb = 'rgb(165, 88, 96)';

  // ---- 渲染循环控制 ----
  #renderLoopId: number | null = null;
  #isRendering = false;
  #lastFrameTs = 0;

  // ---- 帧率自适应 ----
  #frameCount = 0;
  #lastFpsCheck = 0;
  #particleLimit = MouseEffectManager.CONFIG.particles.highEnd;

  #pageHidden = false;

  // ---- 事件处理器（箭头函数字段，add/remove 天然同引用） ----
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
    // 触摸设备禁用
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.#disabled = true;
      console.log('[MouseEffect] 触摸设备，禁用鼠标特效');
      return;
    }

    // 性能自适应：低端设备降低粒子上限（只影响实例，不修改静态配置）
    const isLowEnd = window.devicePixelRatio < 2 ||
      !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    this.#particleLimit = isLowEnd
      ? MouseEffectManager.CONFIG.particles.lowEnd
      : MouseEffectManager.CONFIG.particles.highEnd;

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9997;
      will-change: transform;
    `;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d', { alpha: true });
    this.#resizeCanvas();
    document.body.appendChild(canvas);

    this.#refreshAccentColor();

    window.addEventListener('themeChanged', this.#onThemeChanged);
    window.addEventListener('resize', this.#onResize);
    document.addEventListener('visibilitychange', this.#onVisibility);

    console.log('[MouseEffect] 特效引擎初始化完成（长按连线 + 爆发粒子）');
  }

  // ---- 主题色 ----
  #refreshAccentColor(): void {
    const hex = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-color').trim() || '#a55860';
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    const r = m ? parseInt(m[1], 16) : 165;
    const g = m ? parseInt(m[2], 16) : 88;
    const b = m ? parseInt(m[3], 16) : 96;
    this.#accentRgb = `rgb(${r}, ${g}, ${b})`;
  }

  // ---- 尺寸 ----
  #resizeCanvas(): void {
    const canvas = this.#canvas, ctx = this.#ctx;
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = document.documentElement.getBoundingClientRect();
    const bufferW = Math.round(rect.width * dpr);
    const bufferH = Math.round(rect.height * dpr);

    // 只有尺寸真正变化时才重设缓冲区，避免不必要的清空（旧实现因浮点比较永远不相等而失效）
    if (canvas.width === bufferW && canvas.height === bufferH) return;

    canvas.width = bufferW;
    canvas.height = bufferH;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#logicalWidth = rect.width;
    this.#logicalHeight = rect.height;
  }

  // ---- 渲染循环控制 ----
  #hasActiveWork(): boolean {
    return this.#particles.length > 0 || this.#trails.length > 0 || this.#lineActive;
  }

  #startRenderLoop(): void {
    if (this.#disabled || this.#pageHidden || this.#isRendering) return;
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
    if (this.#pageHidden) {
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
      // 所有动画结束：停止循环并清除最后一帧
      this.#isRendering = false;
      this.#renderLoopId = null;
      this.#clearCanvas();
    }
  };

  #clearCanvas(): void {
    this.#ctx?.clearRect(0, 0, this.#logicalWidth, this.#logicalHeight);
  }

  // ---- 核心渲染 ----
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
    // 帧率无关的追逐趋近：60fps 时单帧系数 ≈ 0.2，与旧实现逐帧 lerp 观感一致
    const chase = 1 - Math.exp(-MouseEffectManager.CONFIG.burst.chaseRate * dt);
    let strokedColor = '';

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const t = (now - p.startTime - p.delay) / p.duration;
      if (t < 0) continue;                          // 延迟未到，尚未出现
      if (t >= 1) {                                 // 生命周期结束，回收
        list.splice(i, 1);
        this.#particlePool.release(p);
        continue;
      }

      // 从按压点向外追逐目标点
      p.x += (p.targetX - p.x) * chase;
      p.y += (p.targetY - p.y) * chase;

      // 半径：前 60% 生命周期扩张到峰值，之后轻微回缩至 70%
      const sizeT = t < 0.6 ? t / 0.6 : 1 - ((t - 0.6) / 0.4) * 0.3;
      const radius = Math.max(0, p.radius + (p.maxRadius - p.radius) * sizeT);

      // 透明度：前 20% 保持，随后线性淡出
      const alpha = t < 0.2 ? p.startAlpha : p.startAlpha * (1 - (t - 0.2) / 0.8);

      // 同色合并 strokeStyle 切换；透明度走 globalAlpha，全程无字符串拼接
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

      // easeOutQuad：起点向终点"收拢"，同时整体淡出、线条变细
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

    // 流动虚线
    ctx.globalAlpha = drag.alpha;
    ctx.setLineDash(drag.dash);
    ctx.lineDashOffset = -now / drag.dashSpeed;
    ctx.beginPath();
    ctx.moveTo(this.#lineStartX, this.#lineStartY);
    ctx.lineTo(this.#lineEndX, this.#lineEndY);
    ctx.stroke();

    // 两端实心圆点
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

  // ---- 上限与帧率自适应 ----
  #enforceLimits(): void {
    const excessP = this.#particles.length - this.#particleLimit;
    if (excessP > 0) {
      const removed = this.#particles.splice(0, excessP);  // 挤出最旧的
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

  // ---- 公开 API ----

  /** @deprecated 点击涟漪已移除，保留空操作以兼容外部调用 */
  public triggerClick(_x: number, _y: number): void { /* no-op */ }

  public triggerLongPress(x: number, y: number, duration: number): void {
    if (this.#disabled) return;

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
      // 随机延迟 + 模拟旧实现"每帧生成一批"的展开节奏；不需要时删掉后半项即可
      p.delay = Math.random() * b.delayMax + Math.floor(i / b.batchSize) * b.batchFrameMs;
      p.lineWidth = b.lineWidthMin + Math.random() * widthSpan;
      p.color = this.#accentRgb;
      p.startTime = now;
      this.#particles.push(p);
    }

    this.#startRenderLoop();
  }

  public startLine(x: number, y: number): void {
    if (this.#disabled) return;
    this.#clearTrails();
    this.#lineActive = true;
    this.#lineStartX = this.#lineEndX = x;
    this.#lineStartY = this.#lineEndY = y;
    this.#startRenderLoop();
  }

  public updateLine(x: number, y: number): void {
    if (this.#disabled || !this.#lineActive) return;
    this.#lineEndX = x;
    this.#lineEndY = y;
    this.#startRenderLoop();
  }

  public endLine(x: number, y: number): void {
    if (this.#disabled || !this.#lineActive) return;
    this.#lineActive = false;
    this.#lineEndX = x;
    this.#lineEndY = y;

    const cfg = MouseEffectManager.CONFIG.line;
    const dx = x - this.#lineStartX;
    const dy = y - this.#lineStartY;
    const distance = Math.hypot(dx, dy);
    if (distance < cfg.minDist) return;   // 太短：不产生残留动画

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

  // ---- 指针事件集成 ----
  public onPointerDown(x: number, y: number): void {
    if (this.#disabled) return;

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
    if (this.#disabled || !this.#isLongPress) return;
    this.updateLine(x, y);
  }

  public onPointerUp(x: number, y: number): void {
    if (this.#disabled) return;

    if (this.#longPressTimer !== null) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }
    if (!this.#isLongPress) return;   // 短按：无任何特效

    this.#isLongPress = false;
    const duration = performance.now() - this.#pressStartTime;
    this.triggerLongPress(x, y, duration);
    this.endLine(x, y);
  }

  public destroy(): void {
    this.#disabled = true;   // 阻断销毁后的任何新渲染（修复旧实现可能残留的空转 rAF）
    this.#stopRenderLoop();

    if (this.#longPressTimer !== null) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }

    window.removeEventListener('themeChanged', this.#onThemeChanged);
    window.removeEventListener('resize', this.#onResize);
    document.removeEventListener('visibilitychange', this.#onVisibility);

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
//  CustomCursor — 自定义光标（仿 cursor-fx-userscript）
//  使用圆点 + 圆环，完全基于 DOM + transform，不再使用 SVG
//  集成 MouseEffectManager 的长按功能
//  特性：延迟跟随、悬停贴合、文本竖条模式、滚动拖尾、点击弹簧、空闲暂停
//  自动检测 Cursor FX 用户脚本，若已存在则让出控制权
// ===================================================================

export class CustomCursor {
  // ---- 配置（与用户脚本保持一致） ----
  private static readonly DEFAULTS = {
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

  // ---- 私有字段 ----
  #config: typeof CustomCursor.DEFAULTS;
  #effectManager: MouseEffectManager | null = null;

  // DOM 元素
  #dot: HTMLDivElement;
  #ring: HTMLDivElement;
  #styleTag: HTMLStyleElement | null = null;

  // 状态变量（仿用户脚本）
  #mx = window.innerWidth / 2;
  #my = window.innerHeight / 2;
  #rx = this.#mx;
  #ry = this.#my;
  #rw = 0;
  #rh = 0;
  #rr = 0;
  #tw = 0;
  #th = 0;
  #tr = 0;
  #sX = 0;
  #sY = 0;
  #dotS = 1;
  #ringS = 1;
  #dotV = 0;
  #ringV = 0;
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
  #dotCache = { v: '' };
  #ringCache = { v: '' };
  #lastW = -1;
  #lastH = -1;
  #lastR = -1;

  // 选择器
  private static readonly SEL_INTERACTIVE =
    'a, button, [role="button"], [tabindex]:not([tabindex="-1"]), [onclick]';
  private static readonly SEL_TEXT =
    'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="range"]):not([type="color"]):not([type="file"]),' +
    'textarea,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"],[role="textbox"]';

  // ================================================================
  //  构造函数：检测触摸设备、探测用户脚本，决定是否初始化
  // ================================================================
  constructor(options: Partial<typeof CustomCursor.DEFAULTS> = {}) {
    // 触摸设备直接禁用
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('[CustomCursor] 触摸设备，跳过自定义光标');
      this.#effectManager = null;
      this.#dot = document.createElement('div');
      this.#ring = document.createElement('div');
      return;
    }

    this.#config = { ...CustomCursor.DEFAULTS, ...options };

    // 异步探测 Cursor FX 用户脚本是否已加载
    // 使用 Promise.race 实现超时降级，避免阻塞主线程
    const probeTimeoutMs = 30;
    const probePromise = new Promise<boolean>((resolve) => {
      const requestId = `cursorfx-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      const onResponse = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.requestId === requestId && detail?.result?.status === 'alive') {
          cleanup();
          resolve(true);
        }
      };
      
      const cleanup = () => {
        window.removeEventListener('CURSORFX_RESPONSE', onResponse);
      };
      
      window.addEventListener('CURSORFX_RESPONSE', onResponse);
      window.dispatchEvent(new CustomEvent('CURSORFX_REQUEST', {
        detail: { action: 'ping', requestId }
      }));
    });

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), probeTimeoutMs);
    });

    // 不阻塞构造函数，异步完成初始化
    Promise.race([probePromise, timeoutPromise]).then((scriptExists) => {
      if (scriptExists) {
        console.log('[CustomCursor] 检测到 Cursor FX 用户脚本已激活，让出控制权');
        // 创建占位元素防止后续方法报错，但不注入样式/不启动循环
        this.#dot = document.createElement('div');
        this.#ring = document.createElement('div');
        this.#effectManager = null;
        return;
      }

      // 用户脚本不存在，正常初始化
      this.#init(options);
    });
  }

  // ================================================================
  //  真正的初始化（仅在确认无用户脚本时调用）
  // ================================================================
  #init(_options: Partial<typeof CustomCursor.DEFAULTS>): void {
    // 创建 EffectManager（长按特效）
    this.#effectManager = new MouseEffectManager();

    // 注入样式
    this.#injectStyles();

    // 创建 DOM
    this.#dot = document.createElement('div');
    this.#ring = document.createElement('div');
    this.#dot.className = 'cc-dot';
    this.#ring.className = 'cc-ring';
    document.body.append(this.#ring, this.#dot); // ring 在前，dot 在上层

    // 初始化大小
    this.#applyInitialStyles();

    // 启动主循环
    this.#lastInput = performance.now();
    this.#lastT = this.#lastInput;
    this.#rafId = requestAnimationFrame((t) => this.#tick(t));

    // 绑定事件
    this.#bindEvents();

    // 处理系统减少动态效果
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(this.#config, {
        FOLLOW_SPEED: 1e4,
        FIT_SPEED: 1e4,
        SHAPE_SPEED: 1e4,
        SCROLL_MAX: 0,
        SPRING_K: 1e4,
        SPRING_DAMP: 1e4,
      });
    }

    console.log('[CustomCursor] 自定义光标初始化完成（仿 cursor-fx）');
  }

  // ================================================================
  //  样式注入
  // ================================================================
  #injectStyles(): void {
    const cfg = this.#config;
    const style = document.createElement('style');
    style.id = 'custom-cursor-styles';
    style.textContent = `
      .cc-dot, .cc-ring {
        position: fixed;
        left: 0;
        top: 0;
        pointer-events: none;
        z-index: 2147483647;
        mix-blend-mode: difference;
        will-change: transform;
        opacity: 0;
        transition: opacity .3s ease;
      }
      .cc-dot {
        width: ${cfg.DOT_SIZE}px;
        height: ${cfg.DOT_SIZE}px;
        background: #fff;
        border-radius: 50%;
        transition: opacity .3s ease, width .22s ease, height .22s ease, border-radius .22s ease;
      }
      .cc-ring {
        width: ${cfg.RING_SIZE}px;
        height: ${cfg.RING_SIZE}px;
        border: ${cfg.RING_BORDER}px solid rgba(255,255,255,${cfg.RING_ALPHA});
        border-radius: 50%;
        transition: opacity .3s ease;
      }
      .cc-live { opacity: 1; }
    `;
    document.head.appendChild(style);
    this.#styleTag = style;
  }

  #applyInitialStyles(): void {
    const cfg = this.#config;
    this.#dot.style.width = cfg.DOT_SIZE + 'px';
    this.#dot.style.height = cfg.DOT_SIZE + 'px';
    this.#dot.style.borderRadius = '50%';

    this.#rw = cfg.RING_SIZE;
    this.#rh = cfg.RING_SIZE;
    this.#rr = cfg.RING_SIZE / 2;
    this.#ring.style.width = this.#rw + 'px';
    this.#ring.style.height = this.#rh + 'px';
    this.#ring.style.borderRadius = this.#rr + 'px';
    // 初始透明度由样式中的 rgba 决定，后续通过 #setRingAlpha 动态修改 borderColor
  }

  // ================================================================
  //  工具方法
  // ================================================================
  #clamp(v: number, a: number, b: number): number {
    return v < a ? a : (v > b ? b : v);
  }

  #measureElement(el: Element): { rad: number } | null {
    const r = el.getBoundingClientRect();
    if (r.width > this.#config.MAX_FIT_SIZE && r.height > this.#config.MAX_FIT_SIZE) return null;
    const br = getComputedStyle(el).borderRadius || '0px';
    let rad = 0;
    if (br.indexOf('%') > -1) {
      rad = parseFloat(br) / 100 * Math.min(r.width, r.height);
    } else {
      rad = parseFloat(br) || 0;
    }
    return { rad };
  }

  #show(): void {
    if (this.#shown) return;
    this.#shown = true;
    this.#dot.classList.add('cc-live');
    this.#ring.classList.add('cc-live');
  }

  #hide(): void {
    if (!this.#shown) return;
    this.#shown = false;
    this.#dot.classList.remove('cc-live');
    this.#ring.classList.remove('cc-live');
  }

  #wake(): void {
    this.#lastInput = performance.now();
    this.#show();
    if (!this.#rafId) {
      this.#lastT = this.#lastInput;
      this.#rafId = requestAnimationFrame((t) => this.#tick(t));
    }
  }

  // ================================================================
  //  事件绑定
  // ================================================================
  #bindEvents(): void {
    // 指针移动
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.#mx = e.clientX;
      this.#my = e.clientY;
      if (this.#focusEl) this.#focusEl = null;
      this.#effectManager?.onPointerMove(e.clientX, e.clientY);
      this.#wake();
    }, { passive: true });

    // 指针按下
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.#pressed = true;
      this.#effectManager?.onPointerDown(e.clientX, e.clientY);
      this.#wake();
    }, { passive: true });

    // 指针抬起
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.#pressed = false;
      this.#effectManager?.onPointerUp(e.clientX, e.clientY);
      this.#wake();
    }, { passive: true });

    window.addEventListener('pointercancel', () => {
      this.#pressed = false;
      this.#wake();
    }, { passive: true });

    // 滚动拖尾
    window.addEventListener('wheel', (e) => {
      if (this.#hoverEl || this.#focusEl) return;
      const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? window.innerHeight : 1);
      this.#sX = this.#clamp(this.#sX - this.#clamp(e.deltaX * unit, -80, 80), -this.#config.SCROLL_MAX, this.#config.SCROLL_MAX);
      this.#sY = this.#clamp(this.#sY - this.#clamp(e.deltaY * unit, -80, 80), -this.#config.SCROLL_MAX, this.#config.SCROLL_MAX);
      this.#wake();
    }, { passive: true });

    // 悬停检测（鼠标覆盖）
    document.addEventListener('mouseover', (e) => {
      const target = e.target as Element;
      if (!target || target.nodeType !== 1) return;

      const text = target.closest(CustomCursor.SEL_TEXT);
      if (text !== this.#textEl) {
        this.#textEl = text;
        this.#setDotShape(!!text);
        this.#setRingAlpha(!!text);
      }

      const inter = target.closest(CustomCursor.SEL_INTERACTIVE);
      if (inter !== this.#hoverEl) {
        let next: Element | null = null, rad = 0;
        if (inter && !inter.matches(CustomCursor.SEL_TEXT)) {
          const m = this.#measureElement(inter);
          if (m) { next = inter; rad = m.rad; }
        }
        this.#hoverEl = next;
        this.#hoverRad = rad;
      }
    }, { passive: true });

    // 键盘聚焦
    document.addEventListener('focusin', (e) => {
      const target = e.target as Element;
      if (!target || target.nodeType !== 1) return;
      if (target.matches(CustomCursor.SEL_TEXT) || !target.matches(CustomCursor.SEL_INTERACTIVE)) return;
      const m = this.#measureElement(target);
      if (m) { this.#focusEl = target; this.#focusRad = m.rad; this.#wake(); }
    }, { passive: true });

    document.addEventListener('focusout', (e) => {
      if (this.#focusEl === e.target) { this.#focusEl = null; this.#wake(); }
    }, { passive: true });

    // 窗口进出
    const docEl = document.documentElement;
    docEl.addEventListener('mouseenter', () => { this.#inside = true; this.#wake(); }, { passive: true });
    docEl.addEventListener('mouseleave', () => { this.#inside = false; this.#hide(); }, { passive: true });
    window.addEventListener('blur', () => this.#hide(), { passive: true });
    window.addEventListener('focus', () => { if (this.#inside) this.#wake(); }, { passive: true });
  }

  // ================================================================
  //  形状 / 透明度切换
  // ================================================================
  #setDotShape(bar: boolean): void {
    if (this.#dotIsBar === bar) return;
    this.#dotIsBar = bar;
    const cfg = this.#config;
    this.#dot.style.width = (bar ? cfg.TEXT_BAR_W : cfg.DOT_SIZE) + 'px';
    this.#dot.style.height = (bar ? cfg.TEXT_BAR_H : cfg.DOT_SIZE) + 'px';
    this.#dot.style.borderRadius = bar ? '2px' : '50%';
  }

  #setRingAlpha(dim: boolean): void {
    if (this.#ringDim === dim) return;
    this.#ringDim = dim;
    const cfg = this.#config;
    const alpha = dim ? cfg.TEXT_RING_ALPHA : cfg.RING_ALPHA;
    // 直接修改 border-color 的 alpha 值（覆盖内联样式）
    this.#ring.style.borderColor = `rgba(255,255,255,${alpha})`;
  }

  // ---- 写入 transform（缓存跳过） ----
  #setT(el: HTMLElement, x: number, y: number, s: number, cache: { v: string }): void {
    const v = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    if (cache.v !== v) {
      cache.v = v;
      el.style.transform = v;
    }
  }

  // ---- 主循环 ----
  #tick(t: number): void {
    this.#rafId = 0;
    const dt = this.#clamp((t - this.#lastT) / 1000, 0, 0.05) || 0.016;
    this.#lastT = t;

    // 确定当前贴合元素
    let el = this.#hoverEl || this.#focusEl;
    const elRad = this.#hoverEl ? this.#hoverRad : this.#focusRad;
    if (el && !el.isConnected) {
      if (this.#hoverEl === el) this.#hoverEl = null;
      if (this.#focusEl === el) this.#focusEl = null;
      el = null;
    }

    // 1) 滚动拖尾衰减
    if (this.#sX !== 0 || this.#sY !== 0) {
      const d = Math.exp(-this.#config.SCROLL_DECAY * dt);
      this.#sX *= d;
      this.#sY *= d;
      if (Math.abs(this.#sX) < 0.05) this.#sX = 0;
      if (Math.abs(this.#sY) < 0.05) this.#sY = 0;
    }

    // 2) 计算目标位置和尺寸
    let tx = this.#mx + this.#sX, ty = this.#my + this.#sY;
    let speed = this.#config.FOLLOW_SPEED;
    let tw = this.#textEl ? this.#config.TEXT_RING_SIZE : this.#config.RING_SIZE;
    let th = tw;
    let tr = tw / 2;

    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > this.#config.MAX_FIT_SIZE && r.height > this.#config.MAX_FIT_SIZE) {
        if (this.#hoverEl === el) this.#hoverEl = null;
        if (this.#focusEl === el) this.#focusEl = null;
      } else {
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
        tw = r.width + this.#config.FIT_PADDING * 2;
        th = r.height + this.#config.FIT_PADDING * 2;
        tr = Math.min(elRad + this.#config.FIT_PADDING, Math.min(tw, th) / 2);
        speed = this.#config.FIT_SPEED;
      }
    }

    // 3) 平滑跟随（帧率无关）
    const k = 1 - Math.exp(-speed * dt);
    this.#rx += (tx - this.#rx) * k;
    this.#ry += (ty - this.#ry) * k;
    if (Math.abs(tx - this.#rx) < 0.05) this.#rx = tx;
    if (Math.abs(ty - this.#ry) < 0.05) this.#ry = ty;

    const ks = 1 - Math.exp(-this.#config.SHAPE_SPEED * dt);
    this.#rw += (tw - this.#rw) * ks;
    this.#rh += (th - this.#rh) * ks;
    this.#rr += (tr - this.#rr) * ks;
    if (Math.abs(tw - this.#rw) < 0.1) this.#rw = tw;
    if (Math.abs(th - this.#rh) < 0.1) this.#rh = th;
    if (Math.abs(tr - this.#rr) < 0.1) this.#rr = tr;

    // 4) 点击弹簧
    const sT = this.#pressed ? this.#config.CLICK_SCALE : 1;
    this.#dotV = (this.#dotV + (sT - this.#dotS) * this.#config.SPRING_K * dt) * Math.exp(-this.#config.SPRING_DAMP * dt);
    this.#dotS = Math.max(0.2, this.#dotS + this.#dotV * dt);
    this.#ringV = (this.#ringV + (sT - this.#ringS) * this.#config.SPRING_K * dt) * Math.exp(-this.#config.SPRING_DAMP * dt);
    this.#ringS = Math.max(0.2, this.#ringS + this.#ringV * dt);

    // 5) 写入 DOM（跳过缓存）
    this.#setT(this.#dot, this.#mx, this.#my, this.#dotS, this.#dotCache);
    this.#setT(this.#ring, this.#rx, this.#ry, this.#ringS, this.#ringCache);

    if (this.#rw !== this.#lastW) {
      this.#ring.style.width = this.#rw + 'px';
      this.#lastW = this.#rw;
    }
    if (this.#rh !== this.#lastH) {
      this.#ring.style.height = this.#rh + 'px';
      this.#lastH = this.#rh;
    }
    if (this.#rr !== this.#lastR) {
      this.#ring.style.borderRadius = this.#rr + 'px';
      this.#lastR = this.#rr;
    }

    // 6) 空闲暂停检查
    const settled =
      this.#rw === tw && this.#rh === th && this.#rr === tr &&
      !el && this.#sX === 0 && this.#sY === 0 &&
      Math.abs(this.#dotS - sT) < 0.002 && Math.abs(this.#dotV) < 0.01 &&
      Math.abs(this.#ringS - sT) < 0.002 && Math.abs(this.#ringV) < 0.01;

    if (settled && t - this.#lastInput > this.#config.IDLE_PAUSE_MS) {
      // 停止循环
      return;
    }

    this.#rafId = requestAnimationFrame((t) => this.#tick(t));
  }

  // ---- 公开方法 ----
  public destroy(): void {
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = 0;
    }
    this.#dot?.remove();
    this.#ring?.remove();
    this.#styleTag?.remove();
    this.#effectManager?.destroy();
    this.#effectManager = null;
    console.log('[CustomCursor] 已销毁');
  }
}