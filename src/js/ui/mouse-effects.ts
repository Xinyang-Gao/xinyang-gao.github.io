// /js/ui/mouse-effects.ts
// 鼠标特效引擎（长按连线 + 爆发粒子） + 自定义光标（圆点+圆环，仿 cursor-fx 用户脚本）
// 性能优化：空闲自动暂停渲染循环，页面隐藏时暂停，减少 CPU 开销，优化 GC 和 Canvas 状态切换

// ===================================================================
//  MouseEffectManager — Canvas 渲染引擎（长按连线 + 粒子爆发）
//  职责：长按拖拽连线、长按结束爆发粒子（点击涟漪已移除）
// ===================================================================

interface BaseParticle {
  active: boolean;
  type: 'click' | 'longpress';   // 实际只使用 'longpress'
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  startAlpha: number;
  alpha: number;
  life: number;
  duration: number;
  delay: number;
  colorPrefix: string;        // 如 "rgba(r,g,b,"
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
  colorPrefix: string;
  width: number;
  startTime: number;
}

export class MouseEffectManager {
  // ---- 静态配置 ----
  private static readonly CONFIG = {
    longPressThreshold: 100,
    maxParticles: 120,
    maxLines: 12,
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
  private static readonly TWO_PI = Math.PI * 2;

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
  #currentRgbString: string = ''; // 缓存当前 RGB 字符串前缀

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
    this.#ctx = this.#canvas.getContext('2d', { alpha: true }); // 明确 alpha
    this.#resizeCanvas();
    document.body.appendChild(this.#canvas);

    this.#accentColor = this.#getAccentColor();
    this.#updateRgbCache();

    // 事件绑定
    window.addEventListener('themeChanged', this.#boundHandlers.theme);
    window.addEventListener('resize', this.#boundHandlers.resize);
    document.addEventListener('visibilitychange', this.#boundHandlers.visibility);

    console.log('[MouseEffect] 特效引擎初始化完成（长按连线 + 爆发粒子）');
  }

  // ---- 工具方法 ----
  #getAccentColor(): string {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--accent-color').trim() || '#a55860';
  }

  #updateRgbCache(): void {
    const hex = this.#accentColor;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      this.#rgbCache = {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      };
      this.#currentRgbString = `rgba(${this.#rgbCache.r}, ${this.#rgbCache.g}, ${this.#rgbCache.b}, `;
    } else {
      this.#rgbCache = { r: 165, g: 88, b: 96 };
      this.#currentRgbString = 'rgba(165, 88, 96, ';
    }
  }

  #getRgbFromAccent(): { r: number; g: number; b: number } {
    if (!this.#rgbCache) this.#updateRgbCache();
    return this.#rgbCache!;
  }

  #onThemeChanged(): void {
    this.#accentColor = this.#getAccentColor();
    this.#updateRgbCache();
  }

  #resizeCanvas(): void {
    if (!this.#canvas || !this.#ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = document.documentElement.getBoundingClientRect();
    
    // 只有尺寸真正变化时才重设 canvas 大小，避免不必要的清空
    if (this.#canvas.width === rect.width * dpr && this.#canvas.height === rect.height * dpr) {
      return;
    }

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
    // 重置关键属性，防止内存泄漏或错误引用
    p.x = 0; p.y = 0; p.radius = 0; p.maxRadius = 0;
    p.startAlpha = 0; p.alpha = 0; p.life = 0; p.duration = 0;
    p.delay = 0; p.colorPrefix = ''; p.lineWidth = 0; p._startTime = 0;
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
    l.progress = 0; l.duration = 0; l.colorPrefix = ''; l.width = 0; l.startTime = 0;
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
      // 检查是否还有活跃元素，如果没有则停止循环
      if (this.#activeParticles.length || this.#activeLines.length || this.#lineActive) {
        this.#renderLoopId = requestAnimationFrame(loop);
      } else {
        this.#isRendering = false;
        this.#renderLoopId = null;
        // 清除最后一帧
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

    // 帧率自适应（只对粒子有效）
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
    const len = particles.length;
    
    // 倒序遍历，方便直接 splice 删除，避免创建额外数组
    for (let i = len - 1; i >= 0; i--) {
      const p = particles[i];
      const elapsed = timestamp - p._startTime - p.delay;
      
      if (elapsed < 0) continue;

      const progress = elapsed / p.duration;
      if (progress >= 1) {
        particles.splice(i, 1);
        this.#releaseParticle(p);
        continue;
      }

      // 长按粒子使用 cubic 缓出
      const easedProgress = MouseEffectManager.#easeOutCubic(progress);

      // 长按粒子位移（从中心向外扩散）
      if (p.type === 'longpress' && p.targetX !== undefined) {
        // 优化：减少乘法次数，使用固定系数
        p.x += (p.targetX - p.x) * 0.2;
        p.y += (p.targetY - p.y) * 0.2;
      }

      let currentRadius: number;
      // 长按粒子半径先增长再略微缩小
      const sizeProgress = progress < 0.6 ? progress / 0.6 : 1 - (progress - 0.6) / 0.4 * 0.3;
      currentRadius = p.radius + (p.maxRadius - p.radius) * sizeProgress;

      let alpha: number;
      const fadeStart = 0.2;
      if (progress < fadeStart) {
        alpha = p.startAlpha;
      } else {
        const fadeProgress = (progress - fadeStart) / (1 - fadeStart);
        alpha = p.startAlpha * (1 - fadeProgress);
      }

      // 优化：尽量减少 strokeStyle 的设置次数，如果颜色相同可以合并绘制
      // 但由于每个粒子 alpha 不同，必须单独设置
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, currentRadius), 0, MouseEffectManager.TWO_PI);
      ctx.strokeStyle = p.colorPrefix + alpha.toFixed(3) + ')'; // toFixed 减少字符串长度波动
      ctx.lineWidth = p.lineWidth;
      ctx.stroke();
    }
  }

  #renderLines(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const lines = this.#activeLines;
    const len = lines.length;

    for (let i = len - 1; i >= 0; i--) {
      const line = lines[i];
      const elapsed = timestamp - line.startTime;
      const progress = elapsed / line.duration;

      if (progress >= 1) {
        lines.splice(i, 1);
        this.#releaseLine(line);
        continue;
      }

      const eased = progress * (2 - progress); // easeOutQuad
      const currentStartX = line.startX + (line.endX - line.startX) * eased;
      const currentStartY = line.startY + (line.endY - line.startY) * eased;
      const alpha = 0.5 * (1 - eased);

      ctx.beginPath();
      ctx.moveTo(currentStartX, currentStartY);
      ctx.lineTo(line.endX, line.endY);
      ctx.strokeStyle = line.colorPrefix + alpha.toFixed(3) + ')';
      ctx.lineWidth = line.width * (1 - eased * 0.5);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  #renderActiveLine(ctx: CanvasRenderingContext2D, timestamp: number): void {
    // 使用缓存的 RGB 字符串
    const rgbStr = this.#currentRgbString;
    const dx = this.#lineEndX - this.#lineStartX;
    const dy = this.#lineEndY - this.#lineStartY;
    const distSq = dx * dx + dy * dy; // 使用平方距离比较，避免开方

    if (distSq > 25) { // 5 * 5
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -timestamp / 50;
      ctx.beginPath();
      ctx.moveTo(this.#lineStartX, this.#lineStartY);
      ctx.lineTo(this.#lineEndX, this.#lineEndY);
      ctx.strokeStyle = rgbStr + '0.3)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = rgbStr + '0.4)';
      ctx.beginPath();
      ctx.arc(this.#lineStartX, this.#lineStartY, 3, 0, MouseEffectManager.TWO_PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.#lineEndX, this.#lineEndY, 3, 0, MouseEffectManager.TWO_PI);
      ctx.fill();
      
      // 恢复实线，避免影响其他绘制
      ctx.setLineDash([]);
    }
  }

  // ---- 公开 API（触发渲染循环） ----
  // triggerClick 不再被调用，保留以防外部使用（但实际已弃用）
  public triggerClick(x: number, y: number): void {
    // 点击涟漪已移除，此方法为空操作
  }

  public triggerLongPress(x: number, y: number, duration: number): void {
    if (this.#disabled) return;
    const cfg = MouseEffectManager.CONFIG.longPress;
    // 使用缓存的 RGB 字符串前缀
    const colorPrefix = this.#currentRgbString;

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
        const angle = Math.random() * MouseEffectManager.TWO_PI;
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
        p.colorPrefix = colorPrefix; // 使用缓存的前缀
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
    
    // 清空之前的活跃线条
    for (const l of this.#activeLines) this.#releaseLine(l);
    this.#activeLines.length = 0; // 更快清空数组
    
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

    const dx = this.#lineEndX - this.#lineStartX;
    const dy = this.#lineEndY - this.#lineStartY;
    const distance = Math.hypot(dx, dy);
    
    if (distance < 5) {
      // 如果距离太短，不创建线条动画，直接停止
      // 注意：这里不需要手动 stopRenderLoop，因为 render 循环会检查 active 元素
      return;
    }

    const cfg = MouseEffectManager.CONFIG.line;
    const l = this.#acquireLine();
    l.startX = this.#lineStartX;
    l.startY = this.#lineStartY;
    l.endX = this.#lineEndX;
    l.endY = this.#lineEndY;
    l.progress = 0;
    l.duration = Math.min(cfg.durationBase + distance * cfg.durationPerPixel, cfg.maxDuration);
    l.colorPrefix = this.#currentRgbString; // 使用缓存前缀
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
    this.#activeLines.length = 0;

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

    // 仅当为长按时触发特效（短按无涟漪）
    if (this.#isLongPress) {
      this.triggerLongPress(x, y, duration);
      this.endLine(x, y);
      this.#isLongPress = false;
      this.#lineActive = false;
    }
    // 短按不做任何特效
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
    this.#activeParticles.length = 0;
    this.#activeLines.length = 0;
    this.#particlePool.length = 0;
    this.#linePool.length = 0;
    console.log('[MouseEffect] 特效引擎已销毁');
  }
}

// ===================================================================
//  CustomCursor — 自定义光标（仿 cursor-fx-userscript）
//  使用圆点 + 圆环，完全基于 DOM + transform，不再使用 SVG
//  集成 MouseEffectManager 的长按功能
//  特性：延迟跟随、悬停贴合、文本竖条模式、滚动拖尾、点击弹簧、空闲暂停
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

  constructor(options: Partial<typeof CustomCursor.DEFAULTS> = {}) {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('[CustomCursor] 触摸设备，跳过自定义光标');
      // 但仍然需要创建 effectManager？还是完全禁用？
      // 为了兼容，不创建 effectManager，所有方法为空
      this.#effectManager = null;
      this.#dot = document.createElement('div');
      this.#ring = document.createElement('div');
      return;
    }

    this.#config = { ...CustomCursor.DEFAULTS, ...options };

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
    // 圆点默认圆形，之后可能变为竖条
    this.#dot.style.width = cfg.DOT_SIZE + 'px';
    this.#dot.style.height = cfg.DOT_SIZE + 'px';
    this.#dot.style.borderRadius = '50%';

    // 圆环初始大小
    this.#rw = cfg.RING_SIZE;
    this.#rh = cfg.RING_SIZE;
    this.#rr = cfg.RING_SIZE / 2;
    this.#ring.style.width = this.#rw + 'px';
    this.#ring.style.height = this.#rh + 'px';
    this.#ring.style.borderRadius = this.#rr + 'px';
    // 透明度通过变量控制
    this.#ring.style.setProperty('--ccA', String(cfg.RING_ALPHA));
    // 实际 border 的透明度由 --ccA 控制? 但上面 style 已经固定了 rgba，为了动态切换文本模式，我们使用自定义属性
    // 我们采用更灵活的方式：在 setRingAlpha 中直接修改 border-color
    // 但为了方便，我们使用 class 或直接修改 style，这里先不处理
  }

  // ---- 辅助方法 ----
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

  // ---- 事件绑定 ----
  #bindEvents(): void {
    // 指针移动
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.#mx = e.clientX;
      this.#my = e.clientY;
      if (this.#focusEl) this.#focusEl = null;
      // 通知 effectManager
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

  // ---- 形状 / 透明度切换 ----
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
    // 由于 border 颜色已经在 style 中固定，我们需要动态调整透明度
    // 直接修改 border-color 的 alpha 值
    // 简便方法：使用变量
    this.#ring.style.setProperty('--ccA', String(alpha));
    // 但我们的 border 最初写的是 rgba(255,255,255, ${cfg.RING_ALPHA})，无法通过变量改变
    // 我们改为在样式表中使用 var(--ccA)
    // 在注入样式时，将 .cc-ring 的 border 改为 border: ${cfg.RING_BORDER}px solid rgba(255,255,255, var(--ccA, ${cfg.RING_ALPHA}));
    // 但为了兼容，我们动态修改 style 属性
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