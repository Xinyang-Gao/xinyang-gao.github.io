// /js/ui/mouse-effects.ts
// 鼠标特效引擎（点击涟漪、长按爆发、拖拽连线）与自定义光标
// 性能优化：空闲时自动停止渲染循环，页面隐藏时暂停，减少 CPU 开销

// ===================================================================
//  MouseEffectManager — 鼠标特效引擎（Canvas 渲染）
//  职责：点击涟漪、长按爆发、拖拽连线
//  优化：仅在活跃元素存在时渲染，空闲自动停止循环
// ===================================================================

interface BaseParticle {
  active: boolean;
  type: 'click' | 'longpress';
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  startAlpha: number;
  alpha: number;
  life: number;
  duration: number;
  delay: number;
  color: string;        // 如 "rgba(r,g,b,"
  lineWidth: number;
  _startTime: number;
  targetX?: number;
  targetY?: number;
}

interface Line {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  duration: number;
  color: string;
  width: number;
  startTime: number;
}

export class MouseEffectManager {
  // ---- 静态配置 ----
  private static readonly CONFIG = {
    longPressThreshold: 100,
    maxParticles: 120,
    maxLines: 12,
    click: {
      countRange: [1, 3],
      radiusRange: [25, 40],
      durationRange: [600, 1000],
      alphaRange: [0.3, 0.5],
      lineWidthRange: [1.5, 2.5],
      delayStep: 100,
    },
    longPress: {
      countFactor: 20,
      maxCount: 30,
      radiusBase: 50,
      radiusFactor: 160,
      durationBase: 900,
      durationFactor: 0.6,
      alphaRange: [0.4, 0.7],
      lineWidthRange: [1.8, 3.0],
      delayMax: 180,
    },
    line: {
      durationBase: 300,
      durationPerPixel: 0.5,
      maxDuration: 700,
      alpha: 0.5,
      width: 1.5,
      dash: [6, 6],
      dotRadius: 3,
    }
  };

  private static readonly MAX_BATCH_ID = 1_000_000_000;

  // ---- 私有字段 ----
  #disabled = false;
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #logicalWidth = 0;
  #logicalHeight = 0;

  #particlePool: BaseParticle[] = [];
  #activeParticles: BaseParticle[] = [];
  #linePool: Line[] = [];
  #activeLines: Line[] = [];

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

  #accentColor = '#a55860';
  #rgbCache: { r: number; g: number; b: number } | null = null;

  // ---- 渲染循环控制 ----
  #renderLoopId: number | null = null;
  #isRendering = false;
  #batchId = 0;

  // ---- 帧率自适应 ----
  #frameCount = 0;
  #lastFpsCheck = 0;
  #maxParticles = MouseEffectManager.CONFIG.maxParticles;

  // ---- 可见性控制 ----
  #visibilityHandler: (() => void) | null = null;
  #pageHidden = false;

  // ---- 主题 / 尺寸处理器 ----
  #boundHandlers = {
    theme: () => this.#onThemeChanged(),
    resize: () => this.#resizeCanvas(),
    visibility: () => this.#onVisibilityChange(),
  };

  constructor() {
    // 触摸设备禁用
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.#disabled = true;
      console.log('[MouseEffect] 触摸设备，禁用鼠标特效');
      return;
    }

    // 性能自适应
    const isLowEnd = window.devicePixelRatio < 2 ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    this.#maxParticles = isLowEnd ? 60 : 120;
    MouseEffectManager.CONFIG.maxParticles = this.#maxParticles;

    // 创建 Canvas
    this.#canvas = document.createElement('canvas');
    this.#canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9997;
      will-change: transform;
    `;
    this.#ctx = this.#canvas.getContext('2d');
    this.#resizeCanvas();
    document.body.appendChild(this.#canvas);

    this.#accentColor = this.#getAccentColor();
    this.#rgbCache = null;

    // 事件绑定
    window.addEventListener('themeChanged', this.#boundHandlers.theme);
    window.addEventListener('resize', this.#boundHandlers.resize);
    document.addEventListener('visibilitychange', this.#boundHandlers.visibility);

    console.log('[MouseEffect] 特效引擎初始化完成');
  }

  // ---- 工具方法 ----
  #getAccentColor(): string {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--accent-color').trim() || '#a55860';
  }

  #getRgbFromAccent(): { r: number; g: number; b: number } {
    if (this.#rgbCache) return this.#rgbCache;
    const hex = this.#accentColor;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 165, g: 88, b: 96 };
    this.#rgbCache = {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
    return this.#rgbCache;
  }

  #onThemeChanged(): void {
    this.#accentColor = this.#getAccentColor();
    this.#rgbCache = null;
  }

  #resizeCanvas(): void {
    if (!this.#canvas || !this.#ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = document.documentElement.getBoundingClientRect();
    this.#canvas.width = rect.width * dpr;
    this.#canvas.height = rect.height * dpr;
    this.#canvas.style.width = rect.width + 'px';
    this.#canvas.style.height = rect.height + 'px';
    this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#ctx.scale(dpr, dpr);
    this.#logicalWidth = rect.width;
    this.#logicalHeight = rect.height;
  }

  #onVisibilityChange(): void {
    this.#pageHidden = document.hidden;
    if (this.#pageHidden && this.#isRendering) {
      this.#stopRenderLoop();
    } else if (!this.#pageHidden && (this.#activeParticles.length || this.#activeLines.length || this.#lineActive)) {
      this.#startRenderLoop();
    }
  }

  // ---- 缓动函数 ----
  static #easeOutQuad(t: number): number { return t * (2 - t); }
  static #easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
  static #easeOutQuart(t: number): number { return 1 - Math.pow(1 - t, 4); }

  // ---- 对象池 ----
  #acquireParticle(type: 'click' | 'longpress'): BaseParticle {
    const p = this.#particlePool.pop() ?? ({} as BaseParticle);
    p.active = true;
    p.type = type;
    p._startTime = 0;
    p.delay = 0;
    return p;
  }

  #releaseParticle(p: BaseParticle): void {
    p.active = false;
    p.x = 0; p.y = 0; p.radius = 0; p.maxRadius = 0;
    p.startAlpha = 0; p.alpha = 0; p.life = 0; p.duration = 0;
    p.delay = 0; p.color = ''; p.lineWidth = 0; p._startTime = 0;
    p.targetX = undefined; p.targetY = undefined;
    if (this.#particlePool.length < this.#maxParticles) {
      this.#particlePool.push(p);
    }
  }

  #acquireLine(): Line {
    const l = this.#linePool.pop() ?? ({} as Line);
    l.active = true;
    l.startTime = 0;
    return l;
  }

  #releaseLine(l: Line): void {
    l.active = false;
    l.startX = 0; l.startY = 0; l.endX = 0; l.endY = 0;
    l.progress = 0; l.duration = 0; l.color = ''; l.width = 0; l.startTime = 0;
    if (this.#linePool.length < MouseEffectManager.CONFIG.maxLines) {
      this.#linePool.push(l);
    }
  }

  // ---- 渲染循环控制 ----
  #startRenderLoop(): void {
    if (this.#disabled || this.#pageHidden) return;
    if (this.#isRendering) return;
    this.#isRendering = true;
    const loop = (timestamp: number) => {
      if (this.#pageHidden) {
        this.#isRendering = false;
        this.#renderLoopId = null;
        return;
      }
      this.#render(timestamp);
      // 如果还有内容需要渲染，继续下一帧
      if (this.#activeParticles.length || this.#activeLines.length || this.#lineActive) {
        this.#renderLoopId = requestAnimationFrame(loop);
      } else {
        this.#isRendering = false;
        this.#renderLoopId = null;
        // 清空画布
        this.#ctx?.clearRect(0, 0, this.#logicalWidth, this.#logicalHeight);
      }
    };
    this.#renderLoopId = requestAnimationFrame(loop);
  }

  #stopRenderLoop(): void {
    if (this.#renderLoopId) {
      cancelAnimationFrame(this.#renderLoopId);
      this.#renderLoopId = null;
    }
    this.#isRendering = false;
    this.#ctx?.clearRect(0, 0, this.#logicalWidth, this.#logicalHeight);
  }

  // ---- 核心渲染 ----
  #render(timestamp: number): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    const w = this.#logicalWidth || window.innerWidth;
    const h = this.#logicalHeight || window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    // 渲染粒子
    this.#renderParticles(ctx, timestamp);
    // 渲染已完成的连线
    this.#renderLines(ctx, timestamp);
    // 渲染实时拖拽连线
    if (this.#lineActive) {
      this.#renderActiveLine(ctx, timestamp);
    }

    // 池子清理
    if (this.#activeParticles.length > this.#maxParticles) {
      const excess = this.#activeParticles.length - this.#maxParticles;
      for (let i = 0; i < excess; i++) {
        const p = this.#activeParticles.shift();
        if (p) this.#releaseParticle(p);
      }
    }
    if (this.#activeLines.length > MouseEffectManager.CONFIG.maxLines) {
      const excess = this.#activeLines.length - MouseEffectManager.CONFIG.maxLines;
      for (let i = 0; i < excess; i++) {
        const l = this.#activeLines.shift();
        if (l) this.#releaseLine(l);
      }
    }

    // 帧率自适应
    this.#frameCount++;
    const now = performance.now();
    if (now - this.#lastFpsCheck > 1000) {
      const fps = this.#frameCount;
      if (fps < 30 && this.#maxParticles > 30) {
        this.#maxParticles = Math.max(30, Math.floor(this.#maxParticles * 0.7));
        console.warn('[MouseEffect] 低帧率，降低粒子上限至', this.#maxParticles);
      }
      this.#frameCount = 0;
      this.#lastFpsCheck = now;
    }
  }

  #renderParticles(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const particles = this.#activeParticles;
    const toRemove: number[] = [];

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const elapsed = timestamp - p._startTime - p.delay;
      if (elapsed < 0) continue;

      const progress = Math.min(elapsed / p.duration, 1);
      if (progress >= 1) {
        toRemove.push(i);
        continue;
      }

      let easedProgress: number;
      if (p.type === 'click') {
        easedProgress = MouseEffectManager.#easeOutQuart(progress);
      } else {
        easedProgress = MouseEffectManager.#easeOutCubic(progress);
      }

      // 长按粒子位移
      if (p.type === 'longpress' && p.targetX !== undefined) {
        p.x += (p.targetX - p.x) * 0.2;
        p.y += (p.targetY - p.y) * 0.2;
      }

      let currentRadius: number;
      if (p.type === 'click') {
        currentRadius = p.maxRadius * easedProgress;
      } else {
        const sizeProgress = progress < 0.6 ? progress / 0.6 : 1 - (progress - 0.6) / 0.4 * 0.3;
        currentRadius = p.radius + (p.maxRadius - p.radius) * sizeProgress;
      }

      let alpha: number;
      if (p.type === 'click') {
        alpha = p.startAlpha * (1 - easedProgress);
      } else {
        const fadeStart = 0.2;
        if (progress < fadeStart) {
          alpha = p.startAlpha;
        } else {
          const fadeProgress = (progress - fadeStart) / (1 - fadeStart);
          alpha = p.startAlpha * (1 - fadeProgress);
        }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, currentRadius), 0, Math.PI * 2);
      ctx.strokeStyle = p.color + alpha + ')';
      ctx.lineWidth = p.lineWidth || 1.5;
      ctx.stroke();
    }

    // 移除并回收
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const p = particles[idx];
      particles.splice(idx, 1);
      this.#releaseParticle(p);
    }
  }

  #renderLines(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const lines = this.#activeLines;
    const toRemove: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const elapsed = timestamp - line.startTime;
      const progress = Math.min(elapsed / line.duration, 1);

      if (progress >= 1) {
        toRemove.push(i);
        continue;
      }

      const eased = MouseEffectManager.#easeOutQuad(progress);
      const currentStartX = line.startX + (line.endX - line.startX) * eased;
      const currentStartY = line.startY + (line.endY - line.startY) * eased;
      const alpha = 0.5 * (1 - eased);

      ctx.beginPath();
      ctx.moveTo(currentStartX, currentStartY);
      ctx.lineTo(line.endX, line.endY);
      ctx.strokeStyle = line.color + alpha + ')';
      ctx.lineWidth = line.width * (1 - eased * 0.5);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const l = lines[idx];
      lines.splice(idx, 1);
      this.#releaseLine(l);
    }
  }

  #renderActiveLine(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const rgb = this.#getRgbFromAccent();
    const dx = this.#lineEndX - this.#lineStartX;
    const dy = this.#lineEndY - this.#lineStartY;
    const dist = Math.hypot(dx, dy);

    if (dist > 5) {
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -timestamp / 50;
      ctx.beginPath();
      ctx.moveTo(this.#lineStartX, this.#lineStartY);
      ctx.lineTo(this.#lineEndX, this.#lineEndY);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
      ctx.beginPath();
      ctx.arc(this.#lineStartX, this.#lineStartY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.#lineEndX, this.#lineEndY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 公开 API（触发渲染循环） ----
  public triggerClick(x: number, y: number): void {
    if (this.#disabled) return;
    const cfg = MouseEffectManager.CONFIG.click;
    const rgb = this.#getRgbFromAccent();
    const count = cfg.countRange[0] + Math.floor(Math.random() * (cfg.countRange[1] - cfg.countRange[0] + 1));

    for (let i = 0; i < count; i++) {
      const p = this.#acquireParticle('click');
      p.x = x + (i === 0 ? 0 : (Math.random() - 0.5) * 10);
      p.y = y + (i === 0 ? 0 : (Math.random() - 0.5) * 10);
      p.radius = 0;
      p.maxRadius = cfg.radiusRange[0] + Math.random() * (cfg.radiusRange[1] - cfg.radiusRange[0]);
      p.startAlpha = cfg.alphaRange[0] + Math.random() * (cfg.alphaRange[1] - cfg.alphaRange[0]);
      p.alpha = p.startAlpha;
      p.life = 0;
      p.duration = cfg.durationRange[0] + Math.random() * (cfg.durationRange[1] - cfg.durationRange[0]);
      p.delay = i * cfg.delayStep;
      p.color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, `;
      p.lineWidth = cfg.lineWidthRange[0] + Math.random() * (cfg.lineWidthRange[1] - cfg.lineWidthRange[0]);
      p._startTime = performance.now();
      this.#activeParticles.push(p);
    }
    this.#startRenderLoop();
  }

  public triggerLongPress(x: number, y: number, duration: number): void {
    if (this.#disabled) return;
    const cfg = MouseEffectManager.CONFIG.longPress;
    const rgb = this.#getRgbFromAccent();

    const count = Math.min(
      Math.max(4, Math.floor(4 + (duration / 2000) * cfg.countFactor)),
      cfg.maxCount
    );
    const maxRadius = Math.min(
      320,
      cfg.radiusBase + Math.pow(duration / 1000, 0.8) * cfg.radiusFactor
    );
    const particleDuration = cfg.durationBase + Math.min(duration * cfg.durationFactor, 700);

    this.#batchId++;
    if (this.#batchId > MouseEffectManager.MAX_BATCH_ID) this.#batchId = 1;
    const batchId = this.#batchId;
    let generated = 0;
    const batchSize = 6;

    const createBatch = () => {
      if (batchId !== this.#batchId) return;
      for (let i = 0; i < batchSize && generated < count; i++, generated++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = maxRadius * (0.3 + Math.random() * 0.7);
        const targetX = x + Math.cos(angle) * dist;
        const targetY = y + Math.sin(angle) * dist;

        const p = this.#acquireParticle('longpress');
        p.x = x;
        p.y = y;
        p.targetX = targetX;
        p.targetY = targetY;
        p.radius = 1.5;
        p.maxRadius = 8 + Math.random() * 10;
        p.startAlpha = cfg.alphaRange[0] + Math.random() * (cfg.alphaRange[1] - cfg.alphaRange[0]);
        p.alpha = p.startAlpha;
        p.life = 0;
        p.duration = particleDuration;
        p.delay = Math.random() * cfg.delayMax;
        p.color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, `;
        p.lineWidth = cfg.lineWidthRange[0] + Math.random() * (cfg.lineWidthRange[1] - cfg.lineWidthRange[0]);
        p._startTime = performance.now();
        this.#activeParticles.push(p);
      }
      if (generated < count && batchId === this.#batchId) {
        requestAnimationFrame(createBatch);
      } else {
        this.#startRenderLoop();
      }
    };
    requestAnimationFrame(createBatch);
    this.#startRenderLoop();
  }

  public startLine(x: number, y: number): void {
    if (this.#disabled) return;
    this.#lineActive = true;
    this.#lineStartX = x;
    this.#lineStartY = y;
    this.#lineEndX = x;
    this.#lineEndY = y;
    for (const l of this.#activeLines) this.#releaseLine(l);
    this.#activeLines = [];
    if (this.#ctx) this.#ctx.setLineDash([6, 6]);
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
    if (this.#ctx) this.#ctx.setLineDash([]);

    const dx = this.#lineEndX - this.#lineStartX;
    const dy = this.#lineEndY - this.#lineStartY;
    const distance = Math.hypot(dx, dy);
    if (distance < 5) {
      this.#stopRenderLoop();
      return;
    }

    const cfg = MouseEffectManager.CONFIG.line;
    const rgb = this.#getRgbFromAccent();
    const l = this.#acquireLine();
    l.startX = this.#lineStartX;
    l.startY = this.#lineStartY;
    l.endX = this.#lineEndX;
    l.endY = this.#lineEndY;
    l.progress = 0;
    l.duration = Math.min(cfg.durationBase + distance * cfg.durationPerPixel, cfg.maxDuration);
    l.color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, `;
    l.width = cfg.width;
    l.startTime = performance.now();
    this.#activeLines.push(l);
    this.#startRenderLoop();
  }

  public onPointerDown(x: number, y: number): void {
    if (this.#disabled) return;
    this.#pressStartX = x;
    this.#pressStartY = y;
    this.#pressStartTime = performance.now();
    this.#isLongPress = false;
    this.#lineActive = false;
    for (const l of this.#activeLines) this.#releaseLine(l);
    this.#activeLines = [];

    if (this.#longPressTimer) clearTimeout(this.#longPressTimer);
    this.#longPressTimer = window.setTimeout(() => {
      this.#isLongPress = true;
      this.startLine(this.#pressStartX, this.#pressStartY);
      if (navigator.vibrate) navigator.vibrate(8);
    }, MouseEffectManager.CONFIG.longPressThreshold);
  }

  public onPointerMove(x: number, y: number): void {
    if (this.#disabled) return;
    if (this.#isLongPress) {
      this.updateLine(x, y);
    }
  }

  public onPointerUp(x: number, y: number): void {
    if (this.#disabled) return;
    const duration = performance.now() - this.#pressStartTime;
    if (this.#longPressTimer) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }

    if (this.#isLongPress) {
      this.triggerLongPress(x, y, duration);
      this.endLine(x, y);
      this.#isLongPress = false;
      this.#lineActive = false;
    } else {
      if (duration < 100) {
        this.triggerClick(x, y);
        setTimeout(() => {
          this.triggerClick(x - 6 + Math.random() * 12, y - 6 + Math.random() * 12);
        }, 60);
      } else {
        this.triggerClick(x, y);
      }
    }
  }

  public destroy(): void {
    this.#stopRenderLoop();
    if (this.#longPressTimer) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }
    window.removeEventListener('themeChanged', this.#boundHandlers.theme);
    window.removeEventListener('resize', this.#boundHandlers.resize);
    document.removeEventListener('visibilitychange', this.#boundHandlers.visibility);
    if (this.#canvas?.parentNode) this.#canvas.parentNode.removeChild(this.#canvas);
    this.#canvas = null;
    this.#ctx = null;
    this.#activeParticles = [];
    this.#activeLines = [];
    this.#particlePool = [];
    this.#linePool = [];
    console.log('[MouseEffect] 特效引擎已销毁');
  }
}

// ===================================================================
//  CustomCursor — 自定义光标（集成鼠标特效）
//  优化：鼠标静止时自动停止动画循环，降低 CPU 占用
// ===================================================================

interface CursorOptions {
  damping?: number;
  stiffness?: number;
  rotationSmoothing?: number;
  minSpeedForRotation?: number;
  idleDecayFactor?: number;
  angleFilter?: number;
  clickScale?: number;
  idleResetDelay?: number;
}

export class CustomCursor {
  // ---- 配置 ----
  #config: Required<CursorOptions>;

  // ---- 位置与变换 ----
  #targetX = 0;
  #targetY = 0;
  #currentX = 0;
  #currentY = 0;
  #fixedScale = 0.55;
  #currentRotation = 0;
  #targetRotation = 0;
  #lastMouseX = 0;
  #lastMouseY = 0;
  #lastTimestamp = 0;
  #velocityX = 0;
  #velocityY = 0;

  // ---- 状态 ----
  #snappedMode = false;
  #snappedElement: Element | null = null;
  #visible = false;
  #speedThreshold = 0.5;
  #currentFillOpacity = 1;
  #targetFillOpacity = 1;
  #lastMoveTime = performance.now();
  #filteredAngle = 0;
  #clickScaleMultiplier = 1;
  #clickTargetMultiplier = 1;
  #clickFillMultiplier = 1;
  #clickFillTarget = 1;

  // ---- DOM 元素 ----
  #container: HTMLDivElement | null = null;
  #svg: SVGElement | null = null;
  #fillPath: SVGPathElement | null = null;
  #strokePath: SVGPathElement | null = null;
  #dot: HTMLDivElement | null = null;

  // ---- 依赖 ----
  #effectManager: MouseEffectManager | null = null;
  #resizeObserver: ResizeObserver | null = null;

  // ---- 事件处理 ----
  #clickHandlers: { onMouseDown: (e: MouseEvent) => void; onMouseUp: (e: MouseEvent) => void } | null = null;
  #boundMouseMove: ((e: MouseEvent) => void) | null = null;

  // ---- 动画循环控制 ----
  #animationId: number | null = null;
  #isAnimating = false;
  #idleTimeout = 80; // ms 无鼠标移动则停止动画

  constructor(options: CursorOptions = {}) {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('[INFO] 触摸设备，跳过自定义光标');
      return;
    }

    this.#config = {
      damping: 0.92,
      stiffness: 0.5,
      rotationSmoothing: 0.2,
      minSpeedForRotation: 0.5,
      idleDecayFactor: 0.98,
      angleFilter: 0.2,
      clickScale: 0.8,
      idleResetDelay: 100,
      ...options,
    };

    this.#effectManager = new MouseEffectManager();

    this.#initDOM();
    this.#initEvents();
    this.#updateColors();
    this.#startAnimation();

    window.addEventListener('themeChanged', () => this.#updateColors());
    const observer = new MutationObserver(() => this.#updateColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  #initDOM(): void {
    this.#container = document.createElement('div');
    this.#container.className = 'custom-cursor';
    this.#container.style.cssText = 'will-change: transform;';
    document.body.appendChild(this.#container);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '54');
    svg.setAttribute('viewBox', '0 0 50 54');
    svg.style.width = '50px';
    svg.style.height = '54px';
    svg.style.display = 'block';
    svg.style.willChange = 'transform';

    this.#fillPath = document.createElementNS(svgNS, 'path');
    this.#fillPath.setAttribute('d', 'M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z');
    this.#fillPath.setAttribute('fill-opacity', '1');

    this.#strokePath = document.createElementNS(svgNS, 'path');
    this.#strokePath.setAttribute('d', 'M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z');
    this.#strokePath.setAttribute('stroke-width', '2.5');
    this.#strokePath.setAttribute('fill', 'none');

    svg.appendChild(this.#fillPath);
    svg.appendChild(this.#strokePath);
    this.#container.appendChild(svg);
    this.#svg = svg;

    this.#dot = document.createElement('div');
    this.#dot.className = 'custom-cursor-dot';
    this.#dot.style.cssText = 'will-change: transform;';
    document.body.appendChild(this.#dot);
  }

  #updateColors(): void {
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#a55860';
    if (this.#fillPath) this.#fillPath.setAttribute('fill', accentColor);
    if (this.#strokePath) this.#strokePath.setAttribute('stroke', '#ffffff');
  }

  #initEvents(): void {
    // 鼠标移动 —— 启动动画并更新目标
    this.#boundMouseMove = (e: MouseEvent) => {
      this.#handleMouseMove(e);
    };
    window.addEventListener('mousemove', this.#boundMouseMove, { passive: true });

    window.addEventListener('mouseleave', () => {
      this.#visible = false;
      this.#container?.classList.remove('visible');
      document.body.classList.remove('custom-cursor-enabled');
      if (this.#snappedMode) this.#exitSnappedMode();
      this.#stopAnimation();
    }, { passive: true });

    window.addEventListener('mouseenter', () => {
      if (this.#targetX !== undefined) {
        this.#visible = true;
        this.#container?.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
        this.#startAnimation();
      }
    }, { passive: true });

    window.addEventListener('scroll', () => {
      if (this.#snappedMode && this.#snappedElement) this.#updateSnappedTargetPosition();
    }, { passive: true });
    window.addEventListener('resize', () => {
      if (this.#snappedMode && this.#snappedElement) this.#updateSnappedTargetPosition();
    }, { passive: true });

    // 鼠标按下/松开
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.#clickTargetMultiplier = this.#config.clickScale;
      this.#clickFillTarget = 1;
      this.#effectManager?.onPointerDown(e.clientX, e.clientY);
      this.#startAnimation(); // 确保动画运行以响应点击效果
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.#clickTargetMultiplier = 1;
      this.#clickFillTarget = 1;
      this.#effectManager?.onPointerUp(e.clientX, e.clientY);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this.#clickHandlers = { onMouseDown, onMouseUp };
  }

  #handleMouseMove(e: MouseEvent): void {
    if (!this.#visible) {
      this.#visible = true;
      this.#container?.classList.add('visible');
      document.body.classList.add('custom-cursor-enabled');
    }
    this.#lastMoveTime = performance.now();

    const clickableSelector = `
      a, button, .nav-item, .list-item, [role="button"], [data-clickable],
      .tag-button, .work-details-close, input, textarea, select, [contenteditable="true"],
      .theme-switch, .stat-card, .tag, .stat-card[data-stat-type], #theme-toggle-checkbox
    `;
    const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
    const clickableTarget = elemUnderCursor?.closest(clickableSelector) || null;

    if (clickableTarget) {
      if (!this.#snappedMode || this.#snappedElement !== clickableTarget) {
        this.#enterSnappedMode(clickableTarget);
      }
      this.#updateDotPosition(e.clientX, e.clientY);
    } else {
      if (this.#snappedMode) this.#exitSnappedMode();
    }

    const now = performance.now();
    if (this.#lastTimestamp) {
      const dt = Math.min(50, Math.max(1, now - this.#lastTimestamp));
      this.#velocityX = (e.clientX - this.#lastMouseX) / dt;
      this.#velocityY = (e.clientY - this.#lastMouseY) / dt;
    }
    this.#lastMouseX = e.clientX;
    this.#lastMouseY = e.clientY;
    this.#lastTimestamp = now;

    if (!this.#snappedMode) {
      this.#targetX = e.clientX;
      this.#targetY = e.clientY;
      const speed = Math.hypot(this.#velocityX, this.#velocityY);
      if (speed > this.#config.minSpeedForRotation) {
        let rawAngle = Math.atan2(this.#velocityY, this.#velocityX) * 180 / Math.PI + 90;
        let angleDiff = rawAngle - this.#filteredAngle;
        if (Math.abs(angleDiff) > 180) angleDiff -= Math.sign(angleDiff) * 360;
        this.#filteredAngle += angleDiff * this.#config.angleFilter;
        this.#targetRotation = this.#filteredAngle;
      }
    } else {
      this.#targetRotation = -45;
    }

    // 传递给特效管理器
    this.#effectManager?.onPointerMove(e.clientX, e.clientY);

    // 每次鼠标移动都启动动画（如果已停止）
    this.#startAnimation();
  }

  #enterSnappedMode(element: Element): void {
    if (!element) return;
    this.#snappedMode = true;
    this.#snappedElement = element;

    if (!this.#resizeObserver) {
      this.#resizeObserver = new ResizeObserver(() => {
        if (this.#snappedMode && this.#snappedElement) {
          this.#updateSnappedTargetPosition();
        }
      });
    }
    this.#resizeObserver.observe(element);

    if (this.#dot) this.#dot.style.display = 'block';
    this.#updateSnappedTargetPosition();
    this.#targetRotation = 45;
  }

  #exitSnappedMode(): void {
    if (this.#snappedElement && this.#resizeObserver) {
      this.#resizeObserver.unobserve(this.#snappedElement);
    }
    this.#snappedMode = false;
    this.#snappedElement = null;
    if (this.#dot) this.#dot.style.display = 'none';
    this.#targetRotation = 0;
  }

  #updateSnappedTargetPosition(): void {
    if (!this.#snappedElement) return;
    try {
      const rect = this.#snappedElement.getBoundingClientRect();
      this.#targetX = rect.right;
      this.#targetY = rect.bottom;
    } catch { /* ignored */ }
  }

  #updateDotPosition(x: number, y: number): void {
    if (!this.#dot) return;
    this.#dot.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---- 动画循环 ----
  #startAnimation(): void {
    if (this.#isAnimating) return;
    this.#isAnimating = true;
    const loop = () => {
      this.#tick();
      // 检查空闲超时
      const now = performance.now();
      if (now - this.#lastMoveTime > this.#idleTimeout) {
        // 鼠标静止，停止动画
        this.#isAnimating = false;
        this.#animationId = null;
        return;
      }
      this.#animationId = requestAnimationFrame(loop);
    };
    this.#animationId = requestAnimationFrame(loop);
  }

  #stopAnimation(): void {
    if (this.#animationId) {
      cancelAnimationFrame(this.#animationId);
      this.#animationId = null;
    }
    this.#isAnimating = false;
  }

  #tick(): void {
    // 更新位置（带阻尼）
    if (this.#snappedMode && this.#snappedElement) this.#updateSnappedTargetPosition();

    this.#currentX += (this.#targetX - this.#currentX) * this.#config.stiffness;
    this.#currentY += (this.#targetY - this.#currentY) * this.#config.stiffness;

    // 旋转更新
    let diff = this.#targetRotation - this.#currentRotation;
    if (Math.abs(diff) > 180) diff -= Math.sign(diff) * 360;
    this.#currentRotation += diff * this.#config.rotationSmoothing;

    // 透明度
    const speed = Math.hypot(this.#velocityX, this.#velocityY);
    this.#targetFillOpacity = speed > this.#speedThreshold ? 1 : 0;
    this.#currentFillOpacity += (this.#targetFillOpacity - this.#currentFillOpacity) * 0.25;

    // 点击缩放
    this.#clickScaleMultiplier += (this.#clickTargetMultiplier - this.#clickScaleMultiplier) * 0.3;
    this.#clickFillMultiplier += (this.#clickFillTarget - this.#clickFillMultiplier) * 0.3;
    const finalScale = this.#fixedScale * this.#clickScaleMultiplier;
    let finalFillOpacity = this.#currentFillOpacity * this.#clickFillMultiplier;
    if (finalFillOpacity > 1) finalFillOpacity = 1;

    // 应用变换（仅当有变化时）
    if (this.#fillPath) {
      this.#fillPath.setAttribute('fill-opacity', String(finalFillOpacity));
    }
    if (this.#svg) {
      this.#svg.style.transform = `translate(-50%, -50%) rotate(${this.#currentRotation}deg) scale(${finalScale})`;
    }
    if (this.#container) {
      this.#container.style.transform = `translate(${this.#currentX}px, ${this.#currentY}px)`;
    }
  }

  // ---- 原生光标隐藏/恢复 ----
  #hideNativeCursor(): void {
    if (!document.getElementById('custom-cursor-style')) {
      const style = document.createElement('style');
      style.id = 'custom-cursor-style';
      style.textContent = `body.custom-cursor-enabled, body.custom-cursor-enabled * { cursor: none !important; }`;
      document.head.appendChild(style);
    }
  }

  #restoreNativeCursor(): void {
    document.getElementById('custom-cursor-style')?.remove();
  }

  public destroy(): void {
    this.#stopAnimation();
    if (this.#clickHandlers) {
      window.removeEventListener('mousedown', this.#clickHandlers.onMouseDown);
      window.removeEventListener('mouseup', this.#clickHandlers.onMouseUp);
    }
    if (this.#boundMouseMove) {
      window.removeEventListener('mousemove', this.#boundMouseMove);
    }
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    this.#container?.remove();
    this.#container = null;
    this.#dot?.remove();
    this.#dot = null;
    document.body.classList.remove('custom-cursor-enabled');
    this.#restoreNativeCursor();

    this.#effectManager?.destroy();
    this.#effectManager = null;
  }
}