// /js/ui/ui-effects.ts
// 自定义光标、外链管理器、滚动揭示效果 + 鼠标特效系统（点击涟漪、长按爆发、拖拽连线）
// 性能优化版本（TypeScript 重构）
// 外链管理器已重构为基于 jump-dialog 的轻量实现

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme } from '/js/core/page-utils.js';
import { showJumpDialog } from '/js/ui/jump-dialog.js';

// 设置键名（与 settings.js 保持一致）
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled'
};

function isFeatureEnabled(key: string, defaultValue: boolean = true): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === 'true';
  } catch (e) { /* ignore */ }
  return defaultValue;
}

// ===================================================================
//  MouseEffectManager — 鼠标特效引擎（Canvas 渲染）
//  职责：点击涟漪、长按爆发、拖拽连线
//  性能优化：空渲染跳过、分批生成粒子、虚线缓存、帧率自适应
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
  // 长按特有
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

class MouseEffectManager {
  // ---- 静态配置 ----
  private static readonly CONFIG = {
    longPressThreshold: 100,
    maxParticles: 120,               // 将被动态调整
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
      sizeProgressSplit: 0.6,
      fadeStart: 0.2,
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

  // 批次 ID 最大值，防止溢出
  private static readonly MAX_BATCH_ID = 1000000000;

  private disabled: boolean = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private logicalWidth: number = 0;
  private logicalHeight: number = 0;

  private particlePool: BaseParticle[] = [];
  private activeParticles: BaseParticle[] = [];
  private linePool: Line[] = [];
  private activeLines: Line[] = [];

  private pressStartX: number = 0;
  private pressStartY: number = 0;
  private pressStartTime: number = 0;
  private isLongPress: boolean = false;
  private longPressTimer: number | null = null;

  private lineActive: boolean = false;
  private lineStartX: number = 0;
  private lineStartY: number = 0;
  private lineEndX: number = 0;
  private lineEndY: number = 0;

  private currentX: number = 0;
  private currentY: number = 0;

  private accentColor: string = '#a55860';
  private _rgbCache: { r: number; g: number; b: number } | null = null;

  private animId: number | null = null;
  private _renderTimestamp: number = 0;

  // 帧率自适应
  private frameCount: number = 0;
  private lastFpsCheck: number = 0;
  private maxParticles: number = MouseEffectManager.CONFIG.maxParticles;

  // 分批生成控制
  private _batchId: number = 0;

  private _boundHandlers: {
    theme: () => void;
    resize: () => void;
  };

  constructor() {
    // 检测触摸设备 —— 特效仅对鼠标设备启用
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.disabled = true;
      console.log('[MouseEffect] 触摸设备，禁用鼠标特效');
      return;
    }

    // 根据设备性能调整粒子上限
    const isLowEnd = window.devicePixelRatio < 2 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    this.maxParticles = isLowEnd ? 60 : 120;
    MouseEffectManager.CONFIG.maxParticles = this.maxParticles;

    // 创建 Canvas 覆盖层
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9997;
      will-change: transform;
    `;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    document.body.appendChild(this.canvas);

    // 颜色初始化
    this.accentColor = this.getAccentColor();
    this._rgbCache = null;

    // 渲染循环
    this.startRenderLoop();

    // 事件绑定
    this._boundHandlers = {
      theme: () => this.onThemeChanged(),
      resize: () => this.resizeCanvas(),
    };
    window.addEventListener('themeChanged', this._boundHandlers.theme);
    window.addEventListener('resize', this._boundHandlers.resize);

    console.log('[MouseEffect] 特效引擎初始化完成');
  }

  // ---- 工具方法 ----
  private getAccentColor(): string {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--accent-color').trim() || '#a55860';
  }

  private getRgbFromAccent(): { r: number; g: number; b: number } {
    if (this._rgbCache) return this._rgbCache;
    const hex = this.accentColor;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 165, g: 88, b: 96 };
    this._rgbCache = {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
    return this._rgbCache;
  }

  private onThemeChanged(): void {
    this.accentColor = this.getAccentColor();
    this._rgbCache = null;
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = document.documentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.logicalWidth = rect.width;
    this.logicalHeight = rect.height;
  }

  // ---- 缓动函数 ----
  private static easeOutQuad(t: number): number { return t * (2 - t); }
  private static easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
  private static easeOutQuart(t: number): number { return 1 - Math.pow(1 - t, 4); }

  // ---- 对象池管理 ----
  private _acquireParticle(type: 'click' | 'longpress'): BaseParticle {
    let p = this.particlePool.pop();
    if (!p) {
      p = {} as BaseParticle;
    }
    p.active = true;
    p.type = type;
    p._startTime = 0;
    p.delay = 0;
    return p;
  }

  private _releaseParticle(p: BaseParticle): void {
    p.active = false;
    // 清理引用（保留部分字段以重用）
    p.x = 0; p.y = 0; p.radius = 0; p.maxRadius = 0;
    p.startAlpha = 0; p.alpha = 0; p.life = 0; p.duration = 0;
    p.delay = 0; p.color = ''; p.lineWidth = 0; p._startTime = 0;
    p.targetX = undefined; p.targetY = undefined;
    if (this.particlePool.length < this.maxParticles) {
      this.particlePool.push(p);
    }
  }

  private _acquireLine(): Line {
    let l = this.linePool.pop();
    if (!l) l = {} as Line;
    l.active = true;
    l.startTime = 0;
    return l;
  }

  private _releaseLine(l: Line): void {
    l.active = false;
    l.startX = 0; l.startY = 0; l.endX = 0; l.endY = 0;
    l.progress = 0; l.duration = 0; l.color = ''; l.width = 0; l.startTime = 0;
    if (this.linePool.length < MouseEffectManager.CONFIG.maxLines) {
      this.linePool.push(l);
    }
  }

  // ---- 1. 点击特效 ----
  public triggerClick(x: number, y: number): void {
    if (this.disabled) return;
    const cfg = MouseEffectManager.CONFIG.click;
    const rgb = this.getRgbFromAccent();
    const count = cfg.countRange[0] + Math.floor(Math.random() * (cfg.countRange[1] - cfg.countRange[0] + 1));

    for (let i = 0; i < count; i++) {
      const p = this._acquireParticle('click');
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
      this.activeParticles.push(p);
    }
  }

  // ---- 2. 长按爆发（分批生成） ----
  public triggerLongPress(x: number, y: number, duration: number): void {
    if (this.disabled) return;
    const cfg = MouseEffectManager.CONFIG.longPress;
    const rgb = this.getRgbFromAccent();

    const count = Math.min(
      Math.max(4, Math.floor(4 + (duration / 2000) * cfg.countFactor)),
      cfg.maxCount
    );
    const maxRadius = Math.min(
      320,
      cfg.radiusBase + Math.pow(duration / 1000, 0.8) * cfg.radiusFactor
    );
    const particleDuration = cfg.durationBase + Math.min(duration * cfg.durationFactor, 700);

    // 批次 ID 递增并防御溢出
    this._batchId++;
    if (this._batchId > MouseEffectManager.MAX_BATCH_ID) {
      this._batchId = 1;
    }
    const batchId = this._batchId;
    let generated = 0;
    const batchSize = 6; // 每帧生成6个

    const createBatch = () => {
      // 如果批次ID已过期，停止生成
      if (batchId !== this._batchId) return;

      for (let i = 0; i < batchSize && generated < count; i++, generated++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = maxRadius * (0.3 + Math.random() * 0.7);
        const targetX = x + Math.cos(angle) * dist;
        const targetY = y + Math.sin(angle) * dist;

        const p = this._acquireParticle('longpress');
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
        this.activeParticles.push(p);
      }

      if (generated < count && batchId === this._batchId) {
        requestAnimationFrame(createBatch);
      }
    };

    requestAnimationFrame(createBatch);
  }

  // ---- 3. 连线特效 ----
  public startLine(x: number, y: number): void {
    if (this.disabled) return;
    this.lineActive = true;
    this.lineStartX = x;
    this.lineStartY = y;
    this.lineEndX = x;
    this.lineEndY = y;
    // 清除旧的连线
    for (const l of this.activeLines) this._releaseLine(l);
    this.activeLines = [];

    // 设置虚线样式（仅一次）
    if (this.ctx) {
      this.ctx.setLineDash([6, 6]);
    }
  }

  public updateLine(x: number, y: number): void {
    if (this.disabled || !this.lineActive) return;
    this.lineEndX = x;
    this.lineEndY = y;
    this.currentX = x;
    this.currentY = y;
  }

  public endLine(x: number, y: number): void {
    if (this.disabled || !this.lineActive) return;
    this.lineActive = false;
    this.lineEndX = x;
    this.lineEndY = y;

    // 重置虚线
    if (this.ctx) {
      this.ctx.setLineDash([]);
    }

    const dx = this.lineEndX - this.lineStartX;
    const dy = this.lineEndY - this.lineStartY;
    const distance = Math.hypot(dx, dy);
    if (distance < 5) return;

    const cfg = MouseEffectManager.CONFIG.line;
    const rgb = this.getRgbFromAccent();
    const l = this._acquireLine();
    l.startX = this.lineStartX;
    l.startY = this.lineStartY;
    l.endX = this.lineEndX;
    l.endY = this.lineEndY;
    l.progress = 0;
    l.duration = Math.min(cfg.durationBase + distance * cfg.durationPerPixel, cfg.maxDuration);
    l.color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, `;
    l.width = cfg.width;
    l.startTime = performance.now();
    this.activeLines.push(l);
  }

  // ---- 渲染循环 ----
  private startRenderLoop(): void {
    const loop = (timestamp: number) => {
      if (!this.canvas) return;
      this._renderTimestamp = timestamp;
      this.render(timestamp);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private render(timestamp: number): void {
    // 空渲染快速清除并返回
    if (this.activeParticles.length === 0 && this.activeLines.length === 0 && !this.lineActive) {
      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
      }
      return;
    }

    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.logicalWidth || window.innerWidth;
    const h = this.logicalHeight || window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    // 渲染粒子
    this._renderParticles(ctx, timestamp);

    // 渲染已完成的连线（收拢动画）
    this._renderLines(ctx, timestamp);

    // 渲染实时拖拽连线
    if (this.lineActive) {
      this._renderActiveLine(ctx, timestamp);
    }

    // 池子清理
    if (this.activeParticles.length > this.maxParticles) {
      const excess = this.activeParticles.length - this.maxParticles;
      for (let i = 0; i < excess; i++) {
        const p = this.activeParticles.shift();
        if (p) this._releaseParticle(p);
      }
    }
    if (this.activeLines.length > MouseEffectManager.CONFIG.maxLines) {
      const excess = this.activeLines.length - MouseEffectManager.CONFIG.maxLines;
      for (let i = 0; i < excess; i++) {
        const l = this.activeLines.shift();
        if (l) this._releaseLine(l);
      }
    }

    // 帧率监测与自适应
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsCheck > 1000) {
      const fps = this.frameCount;
      if (fps < 30 && this.maxParticles > 30) {
        this.maxParticles = Math.max(30, Math.floor(this.maxParticles * 0.7));
        console.warn('[MouseEffect] 低帧率，降低粒子上限至', this.maxParticles);
      }
      this.frameCount = 0;
      this.lastFpsCheck = now;
    }
  }

  private _renderParticles(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const particles = this.activeParticles;
    const toRemove: number[] = [];
    const len = particles.length;

    for (let i = 0; i < len; i++) {
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
        easedProgress = MouseEffectManager.easeOutQuart(progress);
      } else {
        easedProgress = MouseEffectManager.easeOutCubic(progress);
      }

      // 长按粒子位移
      if (p.type === 'longpress' && p.targetX !== undefined) {
        p.x += (p.targetX - p.x) * 0.2;
        p.y += (p.targetY - p.y) * 0.2;
      }

      // 半径计算
      let currentRadius: number;
      if (p.type === 'click') {
        currentRadius = p.maxRadius * easedProgress;
      } else {
        const sizeProgress = progress < 0.6 ? progress / 0.6 : 1 - (progress - 0.6) / 0.4 * 0.3;
        currentRadius = p.radius + (p.maxRadius - p.radius) * sizeProgress;
      }

      // 透明度计算
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

      // 绘制空心圆环
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
      this._releaseParticle(p);
    }
  }

  private _renderLines(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const lines = this.activeLines;
    const toRemove: number[] = [];
    const len = lines.length;

    for (let i = 0; i < len; i++) {
      const line = lines[i];
      const elapsed = timestamp - line.startTime;
      const progress = Math.min(elapsed / line.duration, 1);

      if (progress >= 1) {
        toRemove.push(i);
        continue;
      }

      const eased = MouseEffectManager.easeOutQuad(progress);
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
      this._releaseLine(l);
    }
  }

  private _renderActiveLine(ctx: CanvasRenderingContext2D, timestamp: number): void {
    const rgb = this.getRgbFromAccent();
    const dx = this.lineEndX - this.lineStartX;
    const dy = this.lineEndY - this.lineStartY;
    const dist = Math.hypot(dx, dy);

    if (dist > 5) {
      // 显式设置虚线样式，确保独立于外部状态
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -timestamp / 50;
      ctx.beginPath();
      ctx.moveTo(this.lineStartX, this.lineStartY);
      ctx.lineTo(this.lineEndX, this.lineEndY);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      // 注意：此处不重置 setLineDash，因为下一帧会被 clearRect 清除，且不影响其他绘制

      // 端点圆点
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
      ctx.beginPath();
      ctx.arc(this.lineStartX, this.lineStartY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.lineEndX, this.lineEndY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 公开 API（事件驱动） ----
  public onPointerDown(x: number, y: number): void {
    if (this.disabled) return;
    this.pressStartX = x;
    this.pressStartY = y;
    this.pressStartTime = performance.now();
    this.isLongPress = false;
    this.lineActive = false;
    // 清空旧连线
    for (const l of this.activeLines) this._releaseLine(l);
    this.activeLines = [];

    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = window.setTimeout(() => {
      this.isLongPress = true;
      this.startLine(this.pressStartX, this.pressStartY);
      if (navigator.vibrate) navigator.vibrate(8);
    }, MouseEffectManager.CONFIG.longPressThreshold);
  }

  public onPointerMove(x: number, y: number): void {
    if (this.disabled) return;
    this.currentX = x;
    this.currentY = y;
    if (this.isLongPress) {
      this.updateLine(x, y);
    }
  }

  public onPointerUp(x: number, y: number): void {
    if (this.disabled) return;
    const duration = performance.now() - this.pressStartTime;
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (this.isLongPress) {
      this.triggerLongPress(x, y, duration);
      this.endLine(x, y);
      this.isLongPress = false;
      this.lineActive = false;
    } else {
      // 短按点击
      if (duration < 100) {
        this.triggerClick(x, y);
        // 额外随机小涟漪
        setTimeout(() => {
          this.triggerClick(x - 6 + Math.random() * 12, y - 6 + Math.random() * 12);
        }, 60);
      } else {
        this.triggerClick(x, y);
      }
    }
  }

  // ---- 销毁 ----
  public destroy(): void {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    window.removeEventListener('themeChanged', this._boundHandlers.theme);
    window.removeEventListener('resize', this._boundHandlers.resize);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.activeParticles = [];
    this.activeLines = [];
    this.particlePool = [];
    this.linePool = [];
    console.log('[MouseEffect] 特效引擎已销毁');
  }
}

// ===================================================================
//  CustomCursor — 自定义光标（集成鼠标特效）
//  性能优化：will-change、被动事件、帧率节流
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
  private config: Required<CursorOptions>;
  private targetX: number = 0;
  private targetY: number = 0;
  private currentX: number = 0;
  private currentY: number = 0;
  private fixedScale: number = 0.55;
  private currentRotation: number = 0;
  private targetRotation: number = 0;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private lastTimestamp: number = 0;
  private velocityX: number = 0;
  private velocityY: number = 0;
  private snappedMode: boolean = false;
  private snappedElement: Element | null = null;
  private rafId: number | null = null;
  private visible: boolean = false;
  private speedThreshold: number = 0.5;
  private currentFillOpacity: number = 1;
  private targetFillOpacity: number = 1;
  private lastMoveTime: number = performance.now();
  private filteredAngle: number = 0;
  private clickScaleMultiplier: number = 1;
  private clickTargetMultiplier: number = 1;
  private clickFillMultiplier: number = 1;
  private clickFillTarget: number = 1;

  private container: HTMLDivElement | null = null;
  private svg: SVGElement | null = null;
  private fillPath: SVGPathElement | null = null;
  private strokePath: SVGPathElement | null = null;
  private dot: HTMLDivElement | null = null;

  private effectManager: MouseEffectManager | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private _clickHandlers: { onMouseDown: (e: MouseEvent) => void; onMouseUp: (e: MouseEvent) => void } | null = null;

  constructor(options: CursorOptions = {}) {
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      console.log('[INFO] 触摸设备，跳过自定义光标');
      return;
    }

    this.config = {
      damping: 0.92,
      stiffness: 0.5,
      rotationSmoothing: 0.2,
      minSpeedForRotation: 0.5,
      idleDecayFactor: 0.98,
      angleFilter: 0.2,
      clickScale: 0.8,
      idleResetDelay: 100,
      ...options
    };

    // ---- 初始化鼠标特效管理器 ----
    this.effectManager = new MouseEffectManager();

    this.initDOM();
    this.initEvents();
    this.updateColors();
    this.startAnimation();
    this._hideNativeCursor();

    window.addEventListener('themeChanged', () => this.updateColors());
    const observer = new MutationObserver(() => this.updateColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  private initDOM(): void {
    this.container = document.createElement('div');
    this.container.className = 'custom-cursor';
    this.container.style.cssText = 'will-change: transform;';
    document.body.appendChild(this.container);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '54');
    svg.setAttribute('viewBox', '0 0 50 54');
    svg.style.width = '50px';
    svg.style.height = '54px';
    svg.style.display = 'block';
    svg.style.willChange = 'transform';

    this.fillPath = document.createElementNS(svgNS, 'path');
    this.fillPath.setAttribute('d', 'M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z');
    this.fillPath.setAttribute('fill-opacity', '1');

    this.strokePath = document.createElementNS(svgNS, 'path');
    this.strokePath.setAttribute('d', 'M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z');
    this.strokePath.setAttribute('stroke-width', '2.5');
    this.strokePath.setAttribute('fill', 'none');

    svg.appendChild(this.fillPath);
    svg.appendChild(this.strokePath);
    this.container.appendChild(svg);
    this.svg = svg;

    this.dot = document.createElement('div');
    this.dot.className = 'custom-cursor-dot';
    this.dot.style.cssText = 'will-change: transform;';
    document.body.appendChild(this.dot);
  }

  private updateColors(): void {
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#a55860';
    if (this.fillPath) this.fillPath.setAttribute('fill', accentColor);
    if (this.strokePath) this.strokePath.setAttribute('stroke', '#ffffff');
  }

  private initEvents(): void {
    // ---- 鼠标移动（使用被动事件 + requestAnimationFrame 节流） ----
    let pendingMove = false;
    const onMouseMove = (e: MouseEvent) => {
      if (pendingMove) return;
      pendingMove = true;
      requestAnimationFrame(() => {
        this._handleMouseMove(e);
        pendingMove = false;
      });
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    window.addEventListener('mouseleave', () => {
      this.visible = false;
      if (this.container) this.container.classList.remove('visible');
      document.body.classList.remove('custom-cursor-enabled');
      if (this.snappedMode) this.exitSnappedMode();
    }, { passive: true });

    window.addEventListener('mouseenter', () => {
      if (this.targetX !== undefined) {
        this.visible = true;
        if (this.container) this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }
    }, { passive: true });

    window.addEventListener('scroll', () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
    }, { passive: true });
    window.addEventListener('resize', () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
    }, { passive: true });

    // ---- 鼠标按下 / 松开（集成特效） ----
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.clickTargetMultiplier = this.config.clickScale;
      this.clickFillTarget = 1;

      if (this.effectManager && !this.effectManager['disabled']) {
        this.effectManager.onPointerDown(e.clientX, e.clientY);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.clickTargetMultiplier = 1;
      this.clickFillTarget = 1;

      if (this.effectManager && !this.effectManager['disabled']) {
        this.effectManager.onPointerUp(e.clientX, e.clientY);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this._clickHandlers = { onMouseDown, onMouseUp };
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (!this.visible) {
      this.visible = true;
      if (this.container) this.container.classList.add('visible');
      document.body.classList.add('custom-cursor-enabled');
    }
    this.lastMoveTime = performance.now();

    const clickableSelector = `
      a, button, .nav-item, .list-item, [role="button"], [data-clickable],
      .tag-button, .work-details-close, input, textarea, select, [contenteditable="true"],
      .theme-switch, .stat-card, .tag, .stat-card[data-stat-type], #theme-toggle-checkbox
    `;
    const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
    const clickableTarget = elemUnderCursor?.closest(clickableSelector) || null;

    if (clickableTarget) {
      if (!this.snappedMode || this.snappedElement !== clickableTarget) {
        this.enterSnappedMode(clickableTarget);
      }
      this.updateDotPosition(e.clientX, e.clientY);
    } else {
      if (this.snappedMode) this.exitSnappedMode();
    }

    const now = performance.now();
    if (this.lastTimestamp) {
      const dt = Math.min(50, Math.max(1, now - this.lastTimestamp));
      this.velocityX = (e.clientX - this.lastMouseX) / dt;
      this.velocityY = (e.clientY - this.lastMouseY) / dt;
    }
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.lastTimestamp = now;

    if (!this.snappedMode) {
      this.targetX = e.clientX;
      this.targetY = e.clientY;
      let speed = Math.hypot(this.velocityX, this.velocityY);
      if (speed > this.config.minSpeedForRotation) {
        let rawAngle = Math.atan2(this.velocityY, this.velocityX) * 180 / Math.PI + 90;
        let angleDiff = rawAngle - this.filteredAngle;
        if (Math.abs(angleDiff) > 180) angleDiff -= Math.sign(angleDiff) * 360;
        this.filteredAngle += angleDiff * this.config.angleFilter;
        this.targetRotation = this.filteredAngle;
      }
    } else {
      this.targetRotation = -45;
    }

    // 将鼠标移动事件传递给特效管理器
    if (this.effectManager && !this.effectManager['disabled']) {
      this.effectManager.onPointerMove(e.clientX, e.clientY);
    }
  }

  private enterSnappedMode(element: Element): void {
    if (!element) return;
    this.snappedMode = true;
    this.snappedElement = element;

    // 初始化 ResizeObserver（仅一次）
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.snappedMode && this.snappedElement) {
          this.updateSnappedTargetPosition();
        }
      });
    }
    // 开始观察新元素
    this.resizeObserver.observe(element);

    if (this.dot) this.dot.style.display = 'block';
    this.updateSnappedTargetPosition();
    this.targetRotation = 45;
  }

  private exitSnappedMode(): void {
    if (this.snappedElement && this.resizeObserver) {
      this.resizeObserver.unobserve(this.snappedElement);
    }
    this.snappedMode = false;
    this.snappedElement = null;
    if (this.dot) this.dot.style.display = 'none';
    this.targetRotation = 0;
  }

  private updateSnappedTargetPosition(): void {
    if (!this.snappedElement) return;
    try {
      const rect = this.snappedElement.getBoundingClientRect();
      this.targetX = rect.right;
      this.targetY = rect.bottom;
    } catch (e) {
      // 元素可能已从 DOM 移除，忽略
    }
  }

  private updateDotPosition(x: number, y: number): void {
    if (!this.dot) return;
    this.dot.style.transform = `translate(${x}px, ${y}px)`;
  }

  private startAnimation(): void {
    let lastIdleCheck = performance.now();
    let isIdle = false;

    const animate = () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
      this.currentX += (this.targetX - this.currentX) * this.config.stiffness;
      this.currentY += (this.targetY - this.currentY) * this.config.stiffness;

      if (!this.snappedMode) {
        const now = performance.now();
        const speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed > this.config.minSpeedForRotation) {
          this.lastMoveTime = now;
          isIdle = false;
        } else {
          const idleDuration = now - this.lastMoveTime;
          if (idleDuration >= this.config.idleResetDelay) {
            if (!isIdle) isIdle = true;
            this.targetRotation *= this.config.idleDecayFactor;
            if (Math.abs(this.targetRotation) < 0.5) this.targetRotation = 0;
          } else {
            isIdle = false;
          }
        }
      } else {
        this.targetRotation = -45;
      }

      let diff = this.targetRotation - this.currentRotation;
      if (Math.abs(diff) > 180) diff -= Math.sign(diff) * 360;
      this.currentRotation += diff * this.config.rotationSmoothing;

      const speed = Math.hypot(this.velocityX, this.velocityY);
      this.targetFillOpacity = speed > this.speedThreshold ? 1 : 0;
      this.currentFillOpacity += (this.targetFillOpacity - this.currentFillOpacity) * 0.25;

      this.clickScaleMultiplier += (this.clickTargetMultiplier - this.clickScaleMultiplier) * 0.3;
      this.clickFillMultiplier += (this.clickFillTarget - this.clickFillMultiplier) * 0.3;
      const finalScale = this.fixedScale * this.clickScaleMultiplier;
      let finalFillOpacity = this.currentFillOpacity * this.clickFillMultiplier;
      if (finalFillOpacity > 1) finalFillOpacity = 1;
      if (this.fillPath) {
        this.fillPath.setAttribute('fill-opacity', String(finalFillOpacity));
      }

      if (this.svg) {
        this.svg.style.transform = `translate(-50%, -50%) rotate(${this.currentRotation}deg) scale(${finalScale})`;
      }
      if (this.container) {
        this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
      }

      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  private _hideNativeCursor(): void {
    if (!document.getElementById('custom-cursor-style')) {
      const style = document.createElement('style');
      style.id = 'custom-cursor-style';
      style.textContent = `body.custom-cursor-enabled, body.custom-cursor-enabled * { cursor: none !important; }`;
      document.head.appendChild(style);
    }
  }

  private _restoreNativeCursor(): void {
    const styleEl = document.getElementById('custom-cursor-style');
    if (styleEl) styleEl.remove();
  }

  public destroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._clickHandlers) {
      window.removeEventListener('mousedown', this._clickHandlers.onMouseDown);
      window.removeEventListener('mouseup', this._clickHandlers.onMouseUp);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.dot) {
      this.dot.remove();
      this.dot = null;
    }
    document.body.classList.remove('custom-cursor-enabled');
    this._restoreNativeCursor();

    if (this.effectManager) {
      this.effectManager.destroy();
      this.effectManager = null;
    }
  }
}

// ===================================================================
//  ExternalLinkManager — 使用 jump-dialog 重构
// ===================================================================
export class ExternalLinkManager {
  private WHITELIST: Set<string> = new Set([
    'github.com', 'google.com', 'wikipedia.org',
    'twitter.com', 'linkedin.com', 'amazon.com', 'microsoft.com', 'travellings.cn'
  ]);
  private internalDomains: string[] = [
    'localhost', '127.0.0.1', window.location.hostname
  ];
  private _boundHandleClick: ((e: Event) => void) | null = null;

  constructor() {
    this.init();
  }

  private isExternalLink(url: string): boolean {
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false;
    try {
      const linkUrl = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(linkUrl.protocol)) return false;
      return !this.internalDomains.includes(linkUrl.hostname);
    } catch {
      return false;
    }
  }

  private isWhitelisted(url: string): boolean {
    try {
      const hostname = new URL(url, window.location.href).hostname.toLowerCase();
      if (this.WHITELIST.has(hostname)) return true;
      for (const domain of this.WHITELIST) {
        if (hostname.endsWith('.' + domain)) return true;
      }
    } catch {}
    return false;
  }

  private handleLinkClick = (e: Event): void => {
    const anchor = (e.target as Element).closest('a');
    if (!anchor) return;
    // 跳过友链卡片（由 friend-link-manager 处理）
    if (anchor.closest('[data-friend-link="true"]')) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (this.isExternalLink(href)) {
      e.preventDefault();
      e.stopPropagation();

      // 白名单直接跳转
      if (this.isWhitelisted(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }

      // 使用 jump-dialog 弹窗确认
      const name = anchor.textContent?.trim() || new URL(href, window.location.href).hostname;
      showJumpDialog({
        name: name || '外部链接',
        url: href,
        desc: '您即将访问外部网站，本站不对第三方内容负责',
        countdown: 6,
        redirectTarget: '_blank',
        onRedirect: (url) => {
          // 可添加日志或分析
          console.log('[ExternalLinkManager] 跳转至:', url);
        }
      });
    }
  };

  private init(): void {
    this._boundHandleClick = this.handleLinkClick;
    document.addEventListener('click', this._boundHandleClick);
    console.log('[ExternalLinkManager] 已启用（基于 jump-dialog）');
  }

  public destroy(): void {
    if (this._boundHandleClick) {
      document.removeEventListener('click', this._boundHandleClick);
      this._boundHandleClick = null;
    }
    console.log('[ExternalLinkManager] 已销毁');
  }
}

// ===================================================================
//  ScrollReveal — 滚动揭示
// ===================================================================

export class ScrollReveal {
  private observer: IntersectionObserver | null = null;
  private targetSelector: string;

  constructor(selector: string = '.list-item') {
    this.targetSelector = selector;
    this.initObserver();
    this.observe();
  }

  private initObserver(): void {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -20px 0px' }
    );
  }

  public observe(targets: NodeListOf<Element> | Element[] = document.querySelectorAll(this.targetSelector)): void {
    if (!this.observer) return;
    targets.forEach(el => {
      if (!el.classList.contains('revealed')) {
        this.observer!.observe(el);
      }
    });
  }

  public refresh(): void {
    const hidden = document.querySelectorAll(`${this.targetSelector}:not(.revealed)`);
    if (hidden.length) {
      hidden.forEach(el => this.observer?.observe(el));
    }
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// ===================================================================
//  全局单例管理
// ===================================================================

let globalScrollRevealInstance: ScrollReveal | null = null;
let uiEffectsInitialized = false;
let customCursorInstance: CustomCursor | null = null;
let externalLinkManagerInstance: ExternalLinkManager | null = null;

export function refreshUIEffects(): void {
  // 销毁现有实例
  if (customCursorInstance) {
    customCursorInstance.destroy();
    customCursorInstance = null;
  }
  if (externalLinkManagerInstance) {
    externalLinkManagerInstance.destroy();
    externalLinkManagerInstance = null;
  }

  // 根据当前设置重新创建
  const cursorEnabled = isFeatureEnabled(SETTINGS_KEYS.CURSOR_ENABLED, true);
  const linkWarningEnabled = isFeatureEnabled(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);

  if (cursorEnabled && !customCursorInstance) {
    customCursorInstance = new CustomCursor();
  }
  if (linkWarningEnabled && !externalLinkManagerInstance) {
    externalLinkManagerInstance = new ExternalLinkManager();
  }
}

export function ensureScrollReveal(): ScrollReveal {
  if (!globalScrollRevealInstance) {
    globalScrollRevealInstance = new ScrollReveal();
  }
  window.scrollRevealInstance = globalScrollRevealInstance;
  return globalScrollRevealInstance;
}

export function refreshScrollReveal(): void {
  if (globalScrollRevealInstance) {
    globalScrollRevealInstance.refresh();
  } else if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
  }
}

export function getScrollReveal(): ScrollReveal | null {
  return globalScrollRevealInstance || window.scrollRevealInstance || null;
}

export function initUIEffects(): void {
  if (uiEffectsInitialized) return;
  uiEffectsInitialized = true;

  const initFn = () => {
    refreshUIEffects();
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(initFn, { timeout: 3000 });
  } else {
    setTimeout(initFn, 500);
  }
}

export { customCursorInstance, externalLinkManagerInstance };