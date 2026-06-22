// /js/ui/ui-effects.js
// 自定义光标、外链管理器、滚动揭示效果 + 鼠标特效系统（点击涟漪、长按爆发、拖拽连线）

import { CONFIG, Utils, storageController } from '/js/core/core.js';

// 完整版鼠标特效系统
// 包含自定义光标、外链管理器、滚动揭示效果 + 鼠标特效系统（点击涟漪、长按爆发、拖拽连线）

// 设置键名（与 settings.js 保持一致）
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled'
};

function isFeatureEnabled(key, defaultValue = true) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === 'true';
  } catch (e) { }
  return defaultValue;
}

// ===================================================================
//  MouseEffectManager — 鼠标特效引擎（Canvas 渲染）
//  职责：点击涟漪、长按爆发、拖拽连线
// ===================================================================
// ===================================================================
//  MouseEffectManager — 鼠标特效引擎（Canvas 渲染）
//  职责：点击涟漪、长按爆发、拖拽连线
//  重构要点：配置分离、渲染管道化、对象池复用、性能优化
// ===================================================================
class MouseEffectManager {
  // ---- 静态配置 ----
  static CONFIG = {
    longPressThreshold: 100,           // 长按判定 ms
    maxParticles: 120,                 // 粒子池上限
    maxLines: 12,                      // 线条池上限
    click: {
      countRange: [1, 3],              // 点击产生的圆环数
      radiusRange: [25, 40],           // 最大半径范围
      durationRange: [600, 1000],      // 持续时间范围 ms
      alphaRange: [0.3, 0.5],          // 透明度范围
      lineWidthRange: [1.5, 2.5],      // 线宽范围
      delayStep: 100,                  // 多圆环延迟步进
    },
    longPress: {
      countFactor: 20,                 // 粒子数 = 基础4 + (时长/2000)*20
      maxCount: 30,
      radiusBase: 50,
      radiusFactor: 160,               // 半径扩展系数
      durationBase: 900,
      durationFactor: 0.6,
      alphaRange: [0.4, 0.7],
      lineWidthRange: [1.8, 3.0],
      delayMax: 180,
      sizeProgressSplit: 0.6,          // 粒子大小先增后减的拐点
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

  constructor() {
    // 检测触摸设备 —— 特效仅对鼠标设备启用
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      this.disabled = true;
      console.log('[MouseEffect] 触摸设备，禁用鼠标特效');
      return;
    }
    this.disabled = false;

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
    `;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    document.body.appendChild(this.canvas);

    // 使用对象池复用粒子对象（减少GC）
    this.particlePool = [];
    this.activeParticles = [];
    this.linePool = [];
    this.activeLines = [];

    // 长按状态
    this.pressStartX = 0;
    this.pressStartY = 0;
    this.pressStartTime = 0;
    this.isLongPress = false;
    this.longPressTimer = null;

    // 连线状态
    this.lineActive = false;
    this.lineStartX = 0;
    this.lineStartY = 0;
    this.lineEndX = 0;
    this.lineEndY = 0;

    // 当前鼠标位置
    this.currentX = 0;
    this.currentY = 0;

    // 颜色缓存
    this.accentColor = this.getAccentColor();
    this._rgbCache = null; // 缓存 RGB 对象

    // 渲染循环控制
    this.animId = null;
    this._renderTimestamp = 0;
    this.startRenderLoop();

    // 绑定事件处理器以便销毁时移除
    this._boundHandlers = {
      theme: () => this.onThemeChanged(),
      resize: () => this.resizeCanvas(),
    };
    window.addEventListener('themeChanged', this._boundHandlers.theme);
    window.addEventListener('resize', this._boundHandlers.resize);

    console.log('[MouseEffect] 特效引擎初始化完成（重构版）');
  }

  // ---- 工具方法 ----
  getAccentColor() {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--accent-color').trim() || '#a55860';
  }

  getRgbFromAccent() {
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

  onThemeChanged() {
    this.accentColor = this.getAccentColor();
    this._rgbCache = null; // 强制重新解析
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = document.documentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
    this.ctx.scale(dpr, dpr);
    this.logicalWidth = rect.width;
    this.logicalHeight = rect.height;
  }

  // ---- 缓动函数 ----
  static easeOutQuad(t) { return t * (2 - t); }
  static easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  static easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  // ---- 对象池管理 ----
  _acquireParticle(type) {
    let p = this.particlePool.pop();
    if (!p) {
      p = {};
    }
    p.type = type;
    p.active = true;
    p._startTime = 0;
    p.delay = 0;
    // 其他字段在调用时赋值
    return p;
  }

  _releaseParticle(p) {
    p.active = false;
    // 清理引用避免内存泄露
    for (let key in p) {
      if (key !== 'active' && key !== 'type') {
        delete p[key];
      }
    }
    if (this.particlePool.length < MouseEffectManager.CONFIG.maxParticles) {
      this.particlePool.push(p);
    }
  }

  _acquireLine() {
    let l = this.linePool.pop();
    if (!l) l = {};
    l.active = true;
    l.startTime = 0;
    return l;
  }

  _releaseLine(l) {
    l.active = false;
    for (let key in l) {
      if (key !== 'active') delete l[key];
    }
    if (this.linePool.length < MouseEffectManager.CONFIG.maxLines) {
      this.linePool.push(l);
    }
  }

  // ---- 1. 点击特效 ----
  triggerClick(x, y) {
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

  // ---- 2. 长按爆发 ----
  triggerLongPress(x, y, duration) {
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

    for (let i = 0; i < count; i++) {
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
  }

  // ---- 3. 连线特效 ----
  startLine(x, y) {
    if (this.disabled) return;
    this.lineActive = true;
    this.lineStartX = x;
    this.lineStartY = y;
    this.lineEndX = x;
    this.lineEndY = y;
    // 清除旧的连线
    for (const l of this.activeLines) this._releaseLine(l);
    this.activeLines = [];
  }

  updateLine(x, y) {
    if (this.disabled || !this.lineActive) return;
    this.lineEndX = x;
    this.lineEndY = y;
    this.currentX = x;
    this.currentY = y;
  }

  endLine(x, y) {
    if (this.disabled || !this.lineActive) return;
    this.lineActive = false;
    this.lineEndX = x;
    this.lineEndY = y;

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
  startRenderLoop() {
    const loop = (timestamp) => {
      if (!this.canvas) return;
      this._renderTimestamp = timestamp;
      this.render(timestamp);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  render(timestamp) {
    const ctx = this.ctx;
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

    // 池子清理（防止溢出）
    if (this.activeParticles.length > MouseEffectManager.CONFIG.maxParticles) {
      const excess = this.activeParticles.length - MouseEffectManager.CONFIG.maxParticles;
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
  }

  _renderParticles(ctx, timestamp) {
    const toRemove = [];
    for (let i = 0; i < this.activeParticles.length; i++) {
      const p = this.activeParticles[i];
      const elapsed = timestamp - p._startTime - p.delay;
      if (elapsed < 0) continue;

      const progress = Math.min(elapsed / p.duration, 1);
      if (progress >= 1) {
        toRemove.push(i);
        continue;
      }

      // 缓动计算
      let easedProgress;
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
      let currentRadius;
      if (p.type === 'click') {
        currentRadius = p.maxRadius * easedProgress;
      } else {
        const sizeProgress = progress < 0.6 ? progress / 0.6 : 1 - (progress - 0.6) / 0.4 * 0.3;
        currentRadius = p.radius + (p.maxRadius - p.radius) * sizeProgress;
      }

      // 透明度计算
      let alpha;
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

      // 更新生命周期（可扩展）
    }

    // 移除已完成的粒子并回收
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const p = this.activeParticles[idx];
      this.activeParticles.splice(idx, 1);
      this._releaseParticle(p);
    }
  }

  _renderLines(ctx, timestamp) {
    const toRemove = [];
    for (let i = 0; i < this.activeLines.length; i++) {
      const line = this.activeLines[i];
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
      const l = this.activeLines[idx];
      this.activeLines.splice(idx, 1);
      this._releaseLine(l);
    }
  }

  _renderActiveLine(ctx, timestamp) {
    const rgb = this.getRgbFromAccent();
    const dx = this.lineEndX - this.lineStartX;
    const dy = this.lineEndY - this.lineStartY;
    const dist = Math.hypot(dx, dy);

    if (dist > 5) {
      // 虚线
      ctx.beginPath();
      ctx.moveTo(this.lineStartX, this.lineStartY);
      ctx.lineTo(this.lineEndX, this.lineEndY);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -timestamp / 50;
      ctx.stroke();
      ctx.setLineDash([]);

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
  onPointerDown(x, y) {
    if (this.disabled) return;
    this.pressStartX = x;
    this.pressStartY = y;
    this.pressStartTime = performance.now();
    this.isLongPress = false;
    this.lineActive = false;
    // 清空旧连线
    for (const l of this.activeLines) this._releaseLine(l);
    this.activeLines = [];

    clearTimeout(this.longPressTimer);
    this.longPressTimer = setTimeout(() => {
      this.isLongPress = true;
      this.startLine(this.pressStartX, this.pressStartY);
      if (navigator.vibrate) navigator.vibrate(8);
    }, MouseEffectManager.CONFIG.longPressThreshold);
  }

  onPointerMove(x, y) {
    if (this.disabled) return;
    this.currentX = x;
    this.currentY = y;
    if (this.isLongPress) {
      this.updateLine(x, y);
    }
  }

  onPointerUp(x, y) {
    if (this.disabled) return;
    const duration = performance.now() - this.pressStartTime;
    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;

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
  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    clearTimeout(this.longPressTimer);
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
// ===================================================================
export class CustomCursor {
  constructor(options = {}) {
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
    this.targetX = 0; this.targetY = 0; this.currentX = 0; this.currentY = 0;
    this.fixedScale = 0.55;
    this.currentRotation = 0; this.targetRotation = 0;
    this.lastMouseX = 0; this.lastMouseY = 0; this.lastTimestamp = 0;
    this.velocityX = 0; this.velocityY = 0;
    this.snappedMode = false; this.snappedElement = null;
    this.rafId = null; this.visible = false;
    this.speedThreshold = 0.5;
    this.currentFillOpacity = 1;
    this.targetFillOpacity = 1;
    this.lastMoveTime = performance.now();
    this.filteredAngle = 0;
    this.clickScaleMultiplier = 1;
    this.clickTargetMultiplier = 1;
    this.clickFillMultiplier = 1;
    this.clickFillTarget = 1;

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

  initDOM() {
    this.container = document.createElement('div');
    this.container.className = 'custom-cursor';
    document.body.appendChild(this.container);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '54');
    svg.setAttribute('viewBox', '0 0 50 54');
    svg.style.width = '50px';
    svg.style.height = '54px';
    svg.style.display = 'block';
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
    document.body.appendChild(this.dot);
  }

  updateColors() {
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#a55860';
    this.fillPath.setAttribute('fill', accentColor);
    this.strokePath.setAttribute('stroke', '#ffffff');
  }

  initEvents() {
    // ---- 鼠标移动 ----
    window.addEventListener('mousemove', (e) => {
      if (!this.visible) {
        this.visible = true;
        this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }
      this.lastMoveTime = performance.now();

      const clickableSelector = `
        a, button, .nav-item, .list-item, [role="button"], [data-clickable],
        .tag-button, .work-details-close, input, textarea, select, [contenteditable="true"],
        .theme-switch, .stat-card, .tag, .stat-card[data-stat-type], #theme-toggle-checkbox
      `;
      const elemUnderCursor = document.elementsFromPoint(e.clientX, e.clientY)[0];
      const clickableTarget = elemUnderCursor?.closest(clickableSelector);
      const isClickable = !!clickableTarget;

      if (isClickable) {
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

      // ---- 将鼠标移动事件传递给特效管理器 ----
      if (this.effectManager && !this.effectManager.disabled) {
        this.effectManager.onPointerMove(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseleave', () => {
      this.visible = false;
      this.container.classList.remove('visible');
      document.body.classList.remove('custom-cursor-enabled');
      if (this.snappedMode) this.exitSnappedMode();
    });

    window.addEventListener('mouseenter', () => {
      if (this.targetX !== undefined) {
        this.visible = true;
        this.container.classList.add('visible');
        document.body.classList.add('custom-cursor-enabled');
      }
    });

    window.addEventListener('scroll', () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
    });
    window.addEventListener('resize', () => {
      if (this.snappedMode && this.snappedElement) this.updateSnappedTargetPosition();
    });

    // ---- 鼠标按下 / 松开（集成特效） ----
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.clickTargetMultiplier = this.config.clickScale;
      this.clickFillTarget = 1;

      // 通知特效管理器
      if (this.effectManager && !this.effectManager.disabled) {
        this.effectManager.onPointerDown(e.clientX, e.clientY);
      }
    };

    const onMouseUp = (e) => {
      if (e.button !== 0) return;
      this.clickTargetMultiplier = 1;
      this.clickFillTarget = 1;

      // 通知特效管理器
      if (this.effectManager && !this.effectManager.disabled) {
        this.effectManager.onPointerUp(e.clientX, e.clientY);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this._clickHandlers = { onMouseDown, onMouseUp };
  }

  enterSnappedMode(element) {
    if (!element) return;
    this.snappedMode = true;
    this.snappedElement = element;
    this.dot.style.display = 'block';
    this.updateSnappedTargetPosition();
    this.targetRotation = 45;
  }

  exitSnappedMode() {
    this.snappedMode = false;
    this.snappedElement = null;
    this.dot.style.display = 'none';
    this.targetRotation = 0;
  }

  updateSnappedTargetPosition() {
    if (!this.snappedElement) return;
    const rect = this.snappedElement.getBoundingClientRect();
    this.targetX = rect.right;
    this.targetY = rect.bottom;
  }

  updateDotPosition(x, y) {
    if (!this.dot) return;
    this.dot.style.transform = `translate(${x}px, ${y}px)`;
  }

  startAnimation() {
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
      this.fillPath.setAttribute('fill-opacity', finalFillOpacity);

      this.svg.style.transform = `translate(-50%, -50%) rotate(${this.currentRotation}deg) scale(${finalScale})`;
      this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  _hideNativeCursor() {
    if (!document.getElementById('custom-cursor-style')) {
      const style = document.createElement('style');
      style.id = 'custom-cursor-style';
      style.textContent = `body.custom-cursor-enabled, body.custom-cursor-enabled * { cursor: none !important; }`;
      document.head.appendChild(style);
    }
  }

  _restoreNativeCursor() {
    const styleEl = document.getElementById('custom-cursor-style');
    if (styleEl) styleEl.remove();
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._clickHandlers) {
      window.removeEventListener('mousedown', this._clickHandlers.onMouseDown);
      window.removeEventListener('mouseup', this._clickHandlers.onMouseUp);
    }
    this.container?.remove();
    this.dot?.remove();
    document.body.classList.remove('custom-cursor-enabled');
    this._restoreNativeCursor();

    // 销毁特效管理器
    if (this.effectManager) {
      this.effectManager.destroy();
      this.effectManager = null;
    }
  }
}


// ===================================================================
//  ExternalLinkManager — 外链跳转确认（保持不变）
// ===================================================================
export class ExternalLinkManager {
  constructor() {
    this.WHITELIST = new Set([
      'github.com', 'google.com', 'wikipedia.org',
      'twitter.com', 'linkedin.com', 'amazon.com', 'microsoft.com', 'travellings.cn'
    ]);
    this.currentModal = null;
    this.currentOverlay = null;
    this.countdownInterval = null;
    this.remainingSeconds = 3;
    this.pendingUrl = null;
    this.isSafe = false;
    this.redirectTriggered = false;
    this.internalDomains = ['localhost', '127.0.0.1', window.location.hostname];
    this._boundHandleClick = null;
    this.init();
  }

  isWhitelistedDomain(hostname) {
    if (!hostname) return false;
    const lower = hostname.toLowerCase();
    if (this.WHITELIST.has(lower)) return true;
    for (let domain of this.WHITELIST) if (lower.endsWith('.' + domain)) return true;
    return false;
  }

  isExternalLink(url) {
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false;
    try {
      const linkUrl = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(linkUrl.protocol)) return false;
      return !this.internalDomains.includes(linkUrl.hostname);
    } catch (e) {
      return false;
    }
  }

  clearTimer() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  closeModal() {
    if (!this.currentModal) return;
    this.clearTimer();
    if (this.currentModal.classList.contains('closing')) return;
    this.currentModal.classList.add('closing');
    if (this.currentOverlay) this.currentOverlay.classList.remove('active');
    setTimeout(() => {
      if (this.currentModal) this.currentModal.remove();
      if (this.currentOverlay) this.currentOverlay.remove();
      this.currentModal = null;
      this.currentOverlay = null;
      this.pendingUrl = null;
      this.redirectTriggered = false;
    }, 400);
  }

  doRedirect() {
    if (this.redirectTriggered) return;
    if (!this.pendingUrl) return;
    this.redirectTriggered = true;
    this.clearTimer();
    window.open(this.pendingUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => this.closeModal(), 300);
  }

  startCountdown(timerElement) {
    if (!this.isSafe) return;
    if (this.redirectTriggered) return;
    this.clearTimer();
    this.remainingSeconds = 3;
    if (timerElement) timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`;
    this.countdownInterval = setInterval(() => {
      if (this.redirectTriggered || !this.currentModal) {
        this.clearTimer();
        return;
      }
      this.remainingSeconds--;
      if (this.remainingSeconds <= 0) {
        this.clearTimer();
        if (!this.redirectTriggered && timerElement) timerElement.innerHTML = `✓ 正在跳转...`;
        this.doRedirect();
      } else if (!this.redirectTriggered && timerElement) timerElement.innerHTML = `信任站点 · ${this.remainingSeconds} 秒后自动跳转`;
    }, 1000);
  }

  showExternalLinkModal(url, targetElement = null) {
    if (this.currentModal) this.closeModal();
    let hostname = '';
    let isValid = false;
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
        isValid = true;
        hostname = urlObj.hostname;
      } else {
        this.showErrorToast('不支持的协议，仅支持 HTTP/HTTPS');
        return false;
      }
    } catch (err) {
      this.showErrorToast('链接格式无效');
      return false;
    }
    if (!isValid) return false;
    this.isSafe = this.isWhitelistedDomain(hostname);
    this.pendingUrl = url;
    this.redirectTriggered = false;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    const modal = document.createElement('div');
    modal.className = 'external-modal';
    const safeClass = this.isSafe ? 'safe' : '';
    const subText = this.isSafe ? '安全站点' : '您即将访问外部网站';
    const messageHtml = this.isSafe ? '安全的网站<br>将自动为您跳转，您也可点击「立即前往」手动跳转。' : '本站不对第三方内容负责';
    const btnText = this.isSafe ? '立即前往' : '继续前往';
    const btnSafeClass = this.isSafe ? 'safe' : '';
    modal.innerHTML = `<div class="external-modal-close">✕</div><div class="external-modal-content"><div class="external-modal-header"><span class="external-modal-domain ${safeClass}">${this.escapeHtml(hostname)}</span></div><div class="external-modal-sub">${subText}</div><div class="external-modal-url">${this.escapeHtml(url)}</div><div class="external-modal-message">${messageHtml}</div><div id="external-timer-area" class="external-modal-timer" style="${this.isSafe ? '' : 'display: none;'}"></div><div class="external-modal-buttons"><button class="external-modal-btn" id="external-cancel-btn">取消</button><button class="external-modal-btn external-modal-btn-primary ${btnSafeClass}" id="external-confirm-btn">${btnText}</button></div></div>`;
    document.body.appendChild(modal);
    this.currentModal = modal;
    this.currentOverlay = overlay;
    const closeBtn = modal.querySelector('.external-modal-close');
    const cancelBtn = modal.querySelector('#external-cancel-btn');
    const confirmBtn = modal.querySelector('#external-confirm-btn');
    const timerArea = modal.querySelector('#external-timer-area');
    const handleClose = () => this.closeModal();
    const handleConfirm = () => {
      if (this.redirectTriggered) return;
      this.clearTimer();
      this.doRedirect();
    };
    closeBtn.addEventListener('click', handleClose);
    cancelBtn.addEventListener('click', handleClose);
    confirmBtn.addEventListener('click', handleConfirm);
    overlay.addEventListener('click', handleClose);
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    const originalClose = this.closeModal.bind(this);
    this.closeModal = () => {
      document.removeEventListener('keydown', escHandler);
      originalClose();
      this.closeModal = originalClose;
    };
    requestAnimationFrame(() => {
      modal.classList.add('active');
      overlay.classList.add('active');
    });
    if (this.isSafe) this.startCountdown(timerArea);
    return true;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showErrorToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: var(--accent-color); color: white; padding: 10px 20px; border-radius: 40px; font-size: 0.9rem; z-index: 10000; box-shadow: var(--shadow-md); animation: fadeInUp 0.3s ease;`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  handleLinkClick(e) {
    let target = e.target.closest('a');
    if (!target) return;
    if (target.closest('[data-friend-link="true"]')) return;
    const href = target.getAttribute('href');
    if (!href) return;
    if (this.isExternalLink(href)) {
      e.preventDefault();
      e.stopPropagation();
      this.showExternalLinkModal(href, target);
    }
  }

  init() {
    this._boundHandleClick = this.handleLinkClick.bind(this);
    document.addEventListener('click', this._boundHandleClick);
    console.log('[INFO] 外链跳转确认管理器已启动');
  }

  destroy() {
    if (this._boundHandleClick) {
      document.removeEventListener('click', this._boundHandleClick);
      this._boundHandleClick = null;
    }
    if (this.currentModal) this.closeModal();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = null;
  }
}


// ===================================================================
//  ScrollReveal — 滚动揭示（保持不变）
// ===================================================================
export class ScrollReveal {
  #observer = null;
  #targetSelector = '.list-item';

  constructor(selector = '.list-item') {
    this.#targetSelector = selector;
    this.#initObserver();
    this.observe();
  }

  #initObserver() {
    if (this.#observer) this.#observer.disconnect();
    this.#observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.#observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -20px 0px' }
    );
  }

  observe(targets = document.querySelectorAll(this.#targetSelector)) {
    if (!this.#observer) return;
    targets.forEach(el => {
      if (!el.classList.contains('revealed')) {
        this.#observer.observe(el);
      }
    });
  }

  refresh() {
    const hidden = document.querySelectorAll(`${this.#targetSelector}:not(.revealed)`);
    if (hidden.length) {
      hidden.forEach(el => this.#observer.observe(el));
    }
  }

  destroy() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }
  }
}


// ===================================================================
//  全局单例管理
// ===================================================================
let globalScrollRevealInstance = null;
let uiEffectsInitialized = false;
let customCursorInstance = null;
let externalLinkManagerInstance = null;

export function ensureScrollReveal() {
  if (!globalScrollRevealInstance) {
    globalScrollRevealInstance = new ScrollReveal();
  }
  window.scrollRevealInstance = globalScrollRevealInstance;
  return globalScrollRevealInstance;
}

export function refreshScrollReveal() {
  if (globalScrollRevealInstance) {
    globalScrollRevealInstance.refresh();
  } else if (window.scrollRevealInstance) {
    window.scrollRevealInstance.refresh();
  } else {
    ensureScrollReveal();
  }
}

export function getScrollReveal() {
  return globalScrollRevealInstance || window.scrollRevealInstance;
}

export function initUIEffects() {
  if (uiEffectsInitialized) return;
  uiEffectsInitialized = true;

  const initFn = () => {
    const cursorEnabled = isFeatureEnabled(SETTINGS_KEYS.CURSOR_ENABLED, true);
    const linkWarningEnabled = isFeatureEnabled(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);

    if (cursorEnabled && !customCursorInstance) {
      customCursorInstance = new CustomCursor();
    } else if (!cursorEnabled && customCursorInstance) {
      customCursorInstance.destroy();
      customCursorInstance = null;
    }

    if (linkWarningEnabled && !externalLinkManagerInstance) {
      externalLinkManagerInstance = new ExternalLinkManager();
    } else if (!linkWarningEnabled && externalLinkManagerInstance) {
      externalLinkManagerInstance.destroy();
      externalLinkManagerInstance = null;
    }
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(initFn, { timeout: 3000 });
  } else {
    setTimeout(initFn, 500);
  }
}

export { customCursorInstance, externalLinkManagerInstance };