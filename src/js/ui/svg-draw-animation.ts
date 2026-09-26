// /js/ui/svg-draw-animation.ts
// SVG 绘制动画组件
// -----------------------------------------------------------------------------
// 由独立 demo（SVG绘制动画.html）提取而来：把「路径描边生长」动画封装成站点
// 可复用组件，其他 TS 模块 import 后传参即可调用。
//
// 能力：
//   1. 三种输入：SVG 源码字符串 / SVG 文件 URL / 页面已有 <svg> 元素
//   2. 安全清洗：移除 script、foreignObject、on* 事件属性、javascript: 链接
//   3. 自适应：补全 viewBox、移除固定宽高、保持纵横比（preserveAspectRatio）
//   4. 参数化：时长、缓动、填充、圆角端点、恒定速度、延迟、循环、触发方式
//   5. 生命周期：play / pause / resume / replay / finish / destroy
//      所有定时器、监听、Observer 由 DisposableStack 统一释放
//   6. 无障碍：尊重 prefers-reduced-motion（直接呈现终态）
//   7. 零配置接入：initSvgDraw() 扫描 [data-svg-draw] 容器
//
// 用法速览：
//   import { createSvgDraw } from '/js/ui/svg-draw-animation.js';
//   const draw = await createSvgDraw({
//     container: '#logo',
//     source: '/assets/logo.svg',
//     duration: 2400,
//     easing: 'smooth',
//   });
//   draw.replay();
// -----------------------------------------------------------------------------

import { DisposableStack } from '/js/core/disposable-stack.js';

// ==================== 常量 ====================

/** 注入的关键帧 <style> 的 id（全站唯一，避免重复注入） */
export const SVG_DRAW_STYLE_ID = 'svg-draw-animation-styles';
/** 关键帧动画名 */
export const SVG_DRAW_ANIMATION_NAME = 'svg-draw';
/** 单条路径长度写入的 CSS 变量名 */
export const SVG_DRAW_LEN_VAR = '--svg-draw-len';
/** 组件附加到 <svg> 上的类名（响应式尺寸） */
export const SVG_DRAW_SVG_CLASS = 'svg-draw-svg';
/** 组件附加到容器上的类名 */
export const SVG_DRAW_CONTAINER_CLASS = 'svg-draw-container';

/** 内置缓动预设；也可直接传任意 CSS timing-function 字符串 */
export type SvgDrawEasingPreset = 'smooth' | 'sine' | 'out' | 'in' | 'linear';
export type SvgDrawEasing = SvgDrawEasingPreset | (string & {});

const EASINGS: Record<SvgDrawEasingPreset, string> = {
  // 先慢-快-慢
  smooth: 'cubic-bezier(.65,0,.35,1)',
  // 正弦
  sine: 'cubic-bezier(.37,0,.63,1)',
  // 急起缓收
  out: 'cubic-bezier(.22,1,.36,1)',
  // 缓起急收
  in: 'cubic-bezier(.5,0,.75,0)',
  linear: 'linear',
};

function resolveEasing(easing: SvgDrawEasing): string {
  return EASINGS[easing as SvgDrawEasingPreset] ?? easing;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// ==================== 类型 ====================

/** 触发方式：加载即播 / 首次进入视口才播 / 完全手动 */
export type SvgDrawTrigger = 'auto' | 'visible' | 'manual';

/** 绘制状态 */
export type SvgDrawState = 'idle' | 'playing' | 'paused' | 'finished';

/** 扫描结果 */
export interface SvgDrawInfo {
  /** 参与描边动画的图形数量 */
  pathCount: number;
  /** 参与淡入的非描边元素数量（text / image） */
  fadeCount: number;
  /** 本次播放的总时长（毫秒） */
  duration: number;
}

/**
 * SVG 来源：
 *  - string：含 `<svg` 视为源码，否则视为 URL（走 fetch）
 *  - SVGElement：页面已有元素（默认克隆，不污染原节点）
 */
export type SvgDrawSource = string | SVGElement;

export interface SvgDrawOptions {
  /** 挂载容器（元素或选择器）。容器内原有内容会被替换 */
  container: HTMLElement | string;
  /** SVG 来源 */
  source: SvgDrawSource;

  /** 总时长（毫秒），默认 2000 */
  duration?: number;
  /** 缓动：预设名或任意 CSS timing-function，默认 'smooth' */
  easing?: SvgDrawEasing;
  /** 起笔延迟（毫秒），默认 0 */
  delay?: number;
  /** 画完是否显示填充（有填充的图形先描边后填色），默认 true */
  fillAfterDraw?: boolean;
  /** 填充/淡入过渡时长（毫秒），默认 500 */
  fadeDuration?: number;
  /** 圆角端点（stroke-linecap/linejoin = round），默认 true */
  roundCaps?: boolean;
  /** 恒定速度：按路径长度分配时长，所有笔同时收笔→匀速感，默认 false */
  evenSpeed?: boolean;
  /** evenSpeed 下单条路径的最短时长（毫秒），默认 140 */
  minSegmentDuration?: number;

  /** 触发方式，默认 'auto' */
  trigger?: SvgDrawTrigger;
  /** trigger='visible' 时，是否只在首次进入视口播放一次，默认 true（false = 每次进入都重播） */
  once?: boolean;
  /** 是否循环播放，默认 false */
  loop?: boolean;
  /** 循环间隔（毫秒），默认 600 */
  loopDelay?: number;

  /** 是否清洗 SVG（移除脚本与事件属性），默认 true */
  sanitize?: boolean;
  /** 是否注入组件所需样式（@keyframes 与响应式尺寸），默认 true */
  injectStyles?: boolean;
  /** 是否让 SVG 自适应容器宽度（加 .svg-draw-svg），默认 true */
  responsive?: boolean;
  /** 无描边图形补描边时使用的颜色，默认 'currentColor'（随主题变化） */
  strokeFallbackColor?: string;
  /** 是否尊重系统「减少动态效果」设置，默认 true */
  respectReducedMotion?: boolean;
  /** 附加到 <svg> 上的额外类名 */
  className?: string;

  /** 解析/加载完成（已入 DOM、尚未绘制） */
  onReady?: (info: SvgDrawInfo) => void;
  /** 一次绘制结束（loop 时每次结束都会触发） */
  onFinish?: (info: SvgDrawInfo) => void;
  /** 加载或解析失败 */
  onError?: (error: Error) => void;
}

/** 合并默认值后的完整配置（container / source 由调用方必传，不设默认值） */
type ResolvedOptions = Required<
  Omit<SvgDrawOptions, 'onReady' | 'onFinish' | 'onError'>
> &
  Pick<SvgDrawOptions, 'onReady' | 'onFinish' | 'onError'>;

interface DrawPath {
  el: SVGGeometryElement;
  length: number;
  hasFill: boolean;
  fillOpacity: string;
  /** 原始内联样式，destroy 时还原 */
  originalStyle: string;
}

const DEFAULT_OPTIONS: Omit<ResolvedOptions, 'container' | 'source'> = {
  duration: 2000,
  easing: 'smooth',
  delay: 0,
  fillAfterDraw: true,
  fadeDuration: 500,
  roundCaps: true,
  evenSpeed: false,
  minSegmentDuration: 140,
  trigger: 'auto',
  once: true,
  loop: false,
  loopDelay: 600,
  sanitize: true,
  injectStyles: true,
  responsive: true,
  strokeFallbackColor: 'currentColor',
  respectReducedMotion: true,
  className: '',
};

// ==================== DOM / SVG 工具 ====================

/** 注入组件所需样式（幂等） */
function ensureStyles(): void {
  if (document.getElementById(SVG_DRAW_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SVG_DRAW_STYLE_ID;
  style.textContent = [
    `@keyframes ${SVG_DRAW_ANIMATION_NAME}{`,
    `  from{stroke-dashoffset:var(${SVG_DRAW_LEN_VAR})}`,
    `  to{stroke-dashoffset:0}`,
    `}`,
    `svg.${SVG_DRAW_SVG_CLASS}{display:block;max-width:100%;height:auto}`,
  ].join('');
  document.head.appendChild(style);
}

function resolveContainer(input: HTMLElement | string): HTMLElement {
  if (typeof input === 'string') {
    const el = document.querySelector<HTMLElement>(input);
    if (!el) throw new Error(`[SvgDraw] 找不到容器：${input}`);
    return el;
  }
  return input;
}

function isSvgMarkup(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

/** 安全清洗：移除可执行内容 */
function sanitizeSvg(svg: SVGSVGElement): void {
  svg.querySelectorAll('script,foreignObject').forEach((n) => n.remove());
  svg.querySelectorAll('*').forEach((n) => {
    Array.from(n.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        n.removeAttribute(attr.name);
        return;
      }
      if (
        (name === 'href' || name === 'xlink:href') &&
        attr.value.trim().toLowerCase().startsWith('javascript:')
      ) {
        n.removeAttribute(attr.name);
      }
    });
  });
}

/** 尺寸自适应：补全 viewBox、去掉固定宽高 */
function normalizeSvg(svg: SVGSVGElement): void {
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width') ?? '') || 300;
    const h = parseFloat(svg.getAttribute('height') ?? '') || 300;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  if (!svg.getAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
}

function parseSvgText(text: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    doc.querySelector('parsererror') ||
    !root ||
    root.nodeName.toLowerCase() !== 'svg'
  ) {
    throw new Error('[SvgDraw] 无法解析为 SVG，请检查内容');
  }
  // DOMParser 产出的是同 window 下的 SVG 元素，可安全断言
  return root as unknown as SVGSVGElement;
}

async function fetchSvgText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`[SvgDraw] 加载失败：HTTP ${res.status} (${url})`);
  return await res.text();
}

// ==================== 组件主体 ====================

export class SvgDrawAnimation {
  private readonly container: HTMLElement;
  private readonly stack = new DisposableStack();
  private playStack: DisposableStack | null = null;

  private options: ResolvedOptions;
  private svg: SVGSVGElement | null = null;
  private paths: DrawPath[] = [];
  private fades: SVGElement[] = [];
  private state: SvgDrawState = 'idle';
  private destroyed = false;
  /** SVG 是否已解析完成（决定 play() 同步还是排队） */
  private loaded = false;

  /** 加载/解析完成的 Promise；手动调用 play() 前不必显式等待 */
  public readonly ready: Promise<void>;

  constructor(options: SvgDrawOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options, className: options.className ?? '' };
    this.container = resolveContainer(options.container);

    if (this.options.injectStyles) ensureStyles();
    this.container.classList.add(SVG_DRAW_CONTAINER_CLASS);

    this.ready = this.load().catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn('[SvgDraw] 初始化失败:', error);
      this.options.onError?.(error);
    });
  }

  // ---------- 加载 ----------

  private async load(): Promise<void> {
    let svg: SVGSVGElement;

    if (typeof this.options.source !== 'string') {
      // 已有元素：默认克隆，避免污染原节点
      const src = this.options.source;
      svg = (src.nodeName.toLowerCase() === 'svg'
        ? src.cloneNode(true)
        : src) as SVGSVGElement;
      if (svg.nodeName.toLowerCase() !== 'svg') {
        throw new Error('[SvgDraw] source 必须是 <svg> 元素');
      }
    } else {
      const raw = this.options.source;
      const text = isSvgMarkup(raw) ? raw : await fetchSvgText(raw);
      svg = parseSvgText(text);
    }

    if (this.options.sanitize) sanitizeSvg(svg);
    normalizeSvg(svg);

    if (this.options.responsive) svg.classList.add(SVG_DRAW_SVG_CLASS);
    if (this.options.className) svg.classList.add(...this.options.className.split(/\s+/).filter(Boolean));

    this.container.replaceChildren(svg);
    this.svg = svg;

    if (!document.contains(svg)) {
      console.warn('[SvgDraw] 容器尚未插入文档，无法读取计算样式，动画可能异常');
    }

    this.analyze();
    this.loaded = true;
    this.options.onReady?.(this.info());

    if (this.options.trigger === 'auto') {
      this.play();
    } else if (this.options.trigger === 'visible') {
      this.observeVisibility();
    }
  }

  /** 扫描可绘制图形与非描边元素 */
  private analyze(): void {
    const svg = this.svg;
    if (!svg) return;

    this.paths = [];
    this.fades = [];

    const nodes = Array.from(
      svg.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')
    ) as SVGGeometryElement[];

    nodes.forEach((el) => {
      // defs / clipPath / mask 等内部图形不参与渲染，跳过
      if (el.closest('defs,clipPath,mask,marker,pattern,symbol')) return;
      if (typeof el.getTotalLength !== 'function') return;

      let length = 0;
      try {
        length = el.getTotalLength();
      } catch {
        return; // 部分浏览器对 rect/circle 不支持
      }
      if (!Number.isFinite(length) || length <= 0) return;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;

      const fill = cs.fill;
      const hasFill =
        !!fill && fill !== 'none' && fill !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(fill);
      const noStroke = !cs.stroke || cs.stroke === 'none';
      const strokeWidth = parseFloat(cs.strokeWidth) || 0;

      const originalStyle = el.getAttribute('style') ?? '';
      el.style.setProperty(SVG_DRAW_LEN_VAR, `${length.toFixed(2)}px`);
      el.style.strokeDasharray = `var(${SVG_DRAW_LEN_VAR})`;
      el.style.strokeDashoffset = `var(${SVG_DRAW_LEN_VAR})`;
      el.style.transition = `fill-opacity ${this.options.fadeDuration}ms ease`;

      if (noStroke || strokeWidth === 0) {
        // 纯填充图形：补一条描边才「画」得出来
        el.style.stroke = hasFill ? fill : this.options.strokeFallbackColor;
        if (strokeWidth === 0) el.style.strokeWidth = '1';
      }

      this.paths.push({
        el,
        length,
        hasFill,
        fillOpacity: cs.fillOpacity || '1',
        originalStyle,
      });
    });

    // 文本 / 位图无法描边，落笔结束后统一淡入
    this.fades = Array.from(svg.querySelectorAll('text,image,tspan')) as SVGElement[];
    this.fades.forEach((el) => {
      el.style.transition = `opacity ${this.options.fadeDuration}ms ease`;
    });

    this.applyRoundCaps();
  }

  private applyRoundCaps(): void {
    const on = this.options.roundCaps;
    this.paths.forEach((p) => {
      p.el.style.strokeLinecap = on ? 'round' : '';
      p.el.style.strokeLinejoin = on ? 'round' : '';
    });
  }

  private observeVisibility(): void {
    const svg = this.svg;
    if (!svg || typeof IntersectionObserver !== 'function') {
      this.play();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          this.play();
          if (this.options.once) io.disconnect();
        });
      },
      { threshold: 0.15 }
    );
    io.observe(svg);
    this.stack.addObserver(io);
  }

  // ---------- 播放控制 ----------

  /** 开始播放（未就绪时排队，就绪后自动播） */
  /** 开始播放（已就绪时同步生效；未就绪则排队，就绪后自动播） */
  public play(): void {
    if (this.destroyed) return;
    if (this.loaded) {
      this.doPlay();
      return;
    }
    void this.ready.then(() => {
      if (!this.destroyed) this.doPlay();
    });
  }

  /** 重新播放（从头开始） */
  public replay(): void {
    this.play();
  }

  /** 暂停（保留当前笔触位置） */
  public pause(): void {
    if (this.state !== 'playing') return;
    this.paths.forEach((p) => {
      p.el.style.animationPlayState = 'paused';
    });
    this.state = 'paused';
  }

  /** 继续 */
  public resume(): void {
    if (this.state !== 'paused') return;
    this.paths.forEach((p) => {
      p.el.style.animationPlayState = 'running';
    });
    this.state = 'playing';
  }

  /** 跳到终态：清除虚线、恢复填充与文本 */
  public finish(): void {
    if (this.destroyed || !this.svg) return;
    this.clearPlayResources();

    this.paths.forEach((p) => {
      const s = p.el.style;
      s.animation = '';
      s.strokeDasharray = '';
      s.strokeDashoffset = '';
      s.animationPlayState = '';
      if (this.options.fillAfterDraw && p.hasFill) s.fillOpacity = p.fillOpacity;
    });
    this.fades.forEach((el) => {
      el.style.opacity = '';
    });

    this.state = 'finished';
    this.options.onFinish?.(this.info());

    if (this.options.loop && !this.destroyed) {
      const id = window.setTimeout(() => this.doPlay(), this.options.loopDelay);
      this.stack.addTimeout(id);
    }
  }

  /** 回到起笔前状态（全部隐藏） */
  public reset(): void {
    if (!this.svg) return;
    this.clearPlayResources();
    this.paths.forEach((p) => {
      const s = p.el.style;
      s.animation = 'none';
      s.animationPlayState = '';
      s.strokeDasharray = `var(${SVG_DRAW_LEN_VAR})`;
      s.strokeDashoffset = `var(${SVG_DRAW_LEN_VAR})`;
      if (p.hasFill) s.fillOpacity = '0';
    });
    this.fades.forEach((el) => {
      el.style.opacity = '0';
    });
    this.state = 'idle';
  }

  private doPlay(): void {
    if (this.destroyed || !this.svg || this.paths.length === 0) return;

    // 尊重系统减少动效设置
    if (this.options.respectReducedMotion && prefersReducedMotion()) {
      this.finish();
      return;
    }

    this.clearPlayResources();
    const play = new DisposableStack();
    this.playStack = play;

    const { duration, delay, evenSpeed, minSegmentDuration } = this.options;
    const easing = resolveEasing(this.options.easing);
    let maxLen = 0;
    this.paths.forEach((p) => {
      if (p.length > maxLen) maxLen = p.length;
    });
    if (maxLen <= 0) maxLen = 1;

    this.reset();
    // 强制回流，确保复位生效后再启动动画
    void this.svg.getBoundingClientRect();

    let longest = 0;
    this.paths.forEach((p) => {
      // 恒定速度：按长度分配时长（同时收笔 → 视觉匀速）
      const d = evenSpeed ? Math.max(minSegmentDuration, (duration * p.length) / maxLen) : duration;
      if (d > longest) longest = d;
      const s = p.el.style;
      s.animationName = SVG_DRAW_ANIMATION_NAME;
      s.animationDuration = `${d}ms`;
      s.animationDelay = `${delay}ms`;
      s.animationTimingFunction = easing;
      s.animationFillMode = 'both';
      s.animationIterationCount = '1';
      s.animationPlayState = 'running';
    });

    this.state = 'playing';

    // 单监听 + 计数（animationend 会冒泡）
    let remaining = this.paths.length;
    const onEnd = (): void => {
      remaining -= 1;
      if (remaining <= 0) this.finish();
    };
    play.addEventListener(this.svg, 'animationend', onEnd);
    play.addEventListener(this.svg, 'animationcancel', onEnd);

    // 兜底：动画事件丢失时仍能收尾
    play.addTimeout(
      window.setTimeout(() => {
        if (remaining > 0) this.finish();
      }, longest + delay + 120)
    );
  }

  private clearPlayResources(): void {
    this.playStack?.dispose();
    this.playStack = null;
  }

  // ---------- 配置与状态 ----------

  /** 运行时修改参数；applyNow=true 时按新参数立即重播 */
  public update(patch: Partial<SvgDrawOptions>, applyNow = false): void {
    if (this.destroyed) return;
    const { container: _c, source: _s, ...rest } = patch;
    this.options = { ...this.options, ...rest, className: patch.className ?? this.options.className };
    this.applyRoundCaps();
    if (applyNow) this.play();
  }

  public getState(): SvgDrawState {
    return this.state;
  }

  public info(): SvgDrawInfo {
    const maxLen = this.paths.reduce((m, p) => Math.max(m, p.length), 0);
    return {
      pathCount: this.paths.length,
      fadeCount: this.fades.length,
      duration: this.options.evenSpeed ? this.options.duration : this.options.duration,
      ...(maxLen > 0 ? {} : {}),
    };
  }

  /** 当前挂载的 <svg> 元素（可用于后续自定义操作） */
  public getSvgElement(): SVGSVGElement | null {
    return this.svg;
  }

  // ---------- 销毁 ----------

  /** 释放所有资源并还原 DOM（路由切换时必须调用） */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearPlayResources();
    this.stack.dispose();

    this.paths.forEach((p) => {
      if (p.originalStyle) p.el.setAttribute('style', p.originalStyle);
      else p.el.removeAttribute('style');
    });
    this.fades.forEach((el) => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transition');
    });
    this.paths = [];
    this.fades = [];

    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
    this.container.classList.remove(SVG_DRAW_CONTAINER_CLASS);
  }
}

// ==================== 便捷工厂 ====================

/**
 * 创建并加载一个绘制动画实例（推荐入口）。
 * @returns 已解析完成的实例（未等待播放结束）
 */
export async function createSvgDraw(
  options: SvgDrawOptions
): Promise<SvgDrawAnimation> {
  const instance = new SvgDrawAnimation(options);
  await instance.ready;
  return instance;
}

/** 同步创建（不等待加载），适合在 PageBase.mount() 中配合 stack 使用 */
export function mountSvgDraw(options: SvgDrawOptions): SvgDrawAnimation {
  return new SvgDrawAnimation(options);
}

// ==================== 零配置批量初始化 ====================

const SVG_DRAW_SELECTOR = '[data-svg-draw]';

function readDatasetOptions(el: HTMLElement): Partial<SvgDrawOptions> {
  const d = el.dataset;
  const bool = (v: string | undefined, fallback: boolean): boolean =>
    v === undefined ? fallback : v !== 'false' && v !== '0';
  const num = (v: string | undefined, fallback: number): number => {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const opts: Partial<SvgDrawOptions> = {
    duration: num(d.svgDuration, DEFAULT_OPTIONS.duration),
    delay: num(d.svgDelay, DEFAULT_OPTIONS.delay),
    fadeDuration: num(d.svgFade, DEFAULT_OPTIONS.fadeDuration),
    minSegmentDuration: num(d.svgMinSegment, DEFAULT_OPTIONS.minSegmentDuration),
    loopDelay: num(d.svgLoopDelay, DEFAULT_OPTIONS.loopDelay),
    fillAfterDraw: bool(d.svgFill, DEFAULT_OPTIONS.fillAfterDraw),
    roundCaps: bool(d.svgRound, DEFAULT_OPTIONS.roundCaps),
    evenSpeed: bool(d.svgEven, DEFAULT_OPTIONS.evenSpeed),
    loop: bool(d.svgLoop, DEFAULT_OPTIONS.loop),
    once: bool(d.svgOnce, DEFAULT_OPTIONS.once),
    responsive: bool(d.svgResponsive, DEFAULT_OPTIONS.responsive),
  };
  if (d.svgEasing) opts.easing = d.svgEasing;
  if (d.svgTrigger === 'auto' || d.svgTrigger === 'visible' || d.svgTrigger === 'manual') {
    opts.trigger = d.svgTrigger;
  }
  if (d.svgClass) opts.className = d.svgClass;
  if (d.svgStroke) opts.strokeFallbackColor = d.svgStroke;
  return opts;
}

/**
 * 扫描容器内的 `[data-svg-draw]` 元素并初始化。
 *
 * 支持的 data 属性：
 *  - data-svg-src           SVG 文件路径（或含 <svg> 的源码）
 *  - data-svg-duration      时长 ms（默认 2000）
 *  - data-svg-easing        smooth|sine|out|in|linear 或 CSS timing-function
 *  - data-svg-delay         延迟 ms
 *  - data-svg-fill          画完是否填充（"false" 关闭）
 *  - data-svg-round         圆角端点（"false" 关闭）
 *  - data-svg-even          恒定速度（"true" 开启）
 *  - data-svg-trigger       auto|visible|manual
 *  - data-svg-once          visible 时是否只播一次
 *  - data-svg-loop / data-svg-loop-delay
 *  - data-svg-class / data-svg-stroke / data-svg-responsive
 *
 * @returns 销毁函数（页面 destroy 时调用）
 */
export function initSvgDraw(
  root: ParentNode = document,
  defaults: Partial<SvgDrawOptions> = {}
): () => void {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(SVG_DRAW_SELECTOR)
  );
  const instances: SvgDrawAnimation[] = [];

  nodes.forEach((el) => {
    const src = el.dataset.svgSrc ?? '';
    const inlineSvg = el.querySelector('svg');
    const innerText = src ? '' : (el.textContent ?? '').trim();

    let source: SvgDrawSource | null = null;
    if (src) source = src;
    else if (inlineSvg) source = inlineSvg;
    else if (isSvgMarkup(innerText)) source = innerText;

    if (!source) {
      console.warn('[SvgDraw] 跳过缺少 SVG 来源的容器:', el);
      return;
    }

    instances.push(
      new SvgDrawAnimation({
        ...defaults,
        ...readDatasetOptions(el),
        container: el,
        source,
      })
    );
  });

  return () => {
    instances.forEach((i) => i.destroy());
    instances.length = 0;
  };
}

export default SvgDrawAnimation;
