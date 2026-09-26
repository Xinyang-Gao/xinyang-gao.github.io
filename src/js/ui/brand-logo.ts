// /js/ui/brand-logo.ts
// 职责：站点品牌标识（/assets/GaoXinYang.svg）的挂载、隐藏与勾边动画编排
// -----------------------------------------------------------------------------
// 统一封装两处同源 LOGO 的行为差异：
//   · 导航栏（manual） ：默认隐藏，加载覆盖层完全消失后由 AppInitializer 调用 play()
//   · 页脚   （visible）：默认隐藏，滚动进入视口后自动落笔
//
// 动画本体交给 svg-draw-animation.ts：2s 勾边（smooth = 先慢-快-慢）→ 填充淡入
// → 完全显示。容器 CSS（.brand-logo）负责默认隐藏与占位，本模块只负责时机。
//
// 降级：SVG 加载失败时不加 'is-revealed'，容器内保持为空，原文字节点继续可见。
// 资源清理统一走 DisposableStack
// -----------------------------------------------------------------------------

import { DisposableStack } from '/js/core/disposable-stack.js';
import { createSvgDraw } from '/js/ui/svg-draw-animation.js';
import type { SvgDrawAnimation } from '/js/ui/svg-draw-animation.js';

/** 品牌 SVG 资源路径 */
const BRAND_SVG_SRC = '/assets/GaoXinYang.svg';
/** 勾边总时长（毫秒） */
const DRAW_DURATION = 2000;
/** 缓动：先慢-快-慢 */
const DRAW_EASING = 'smooth';
/** 勾边结束后填充淡入时长（毫秒） */
const FADE_DURATION = 600;
/** GaoXinYang.svg 的 viewBox 比例，用于 CSS 占位 */
const VIEWBOX_RATIO = '3355 / 1050';

/** 容器通用类名（CSS 依据它做默认隐藏与占位） */
export const BRAND_LOGO_CLASS = 'brand-logo';
/** 落笔后附加到容器上 → CSS 显形 */
export const BRAND_REVEALED_CLASS = 'is-revealed';
/** 扫描标记 */
const BRAND_DATA_ATTR = 'data-brand-logo';
/** mode='visible' 的默认可见比例阈值 */
const DEFAULT_THRESHOLD = 0.25;

export type BrandLogoMode = 'manual' | 'visible';

export interface BrandLogoOptions {
  /** manual：等待外部 play()；visible：滚动进入视口自动播放。默认 manual */
  mode?: BrandLogoMode;
  /** mode='visible' 时是否只播一次，默认 true */
  once?: boolean;
  /** mode='visible' 时的可见比例阈值，默认 0.25 */
  threshold?: number;
  /** 勾边时长（毫秒），默认 2000 */
  duration?: number;
}

export interface BrandLogoHandle {
  /** 开始勾边并显示（未就绪时排队，就绪后自动播） */
  play(): void;
  /** SVG 解析/加载完成 */
  readonly ready: Promise<void>;
  /** 释放资源 */
  destroy(): void;
}

/**
 * 在指定容器内挂载品牌 SVG。
 * 容器内原有内容会被替换，因此容器应专用于承载 LOGO。
 */
export function mountBrandLogo(
  container: HTMLElement,
  options: BrandLogoOptions = {}
): BrandLogoHandle {
  const {
    mode = 'manual',
    once = true,
    threshold = DEFAULT_THRESHOLD,
    duration = DRAW_DURATION,
  } = options;

  const stack = new DisposableStack();
  container.classList.add(BRAND_LOGO_CLASS);
  container.style.setProperty('--brand-ratio', VIEWBOX_RATIO);

  let draw: SvgDrawAnimation | null = null;
  let requested = false;
  let destroyed = false;

  /** 显形 + 落笔 */
  const start = (): void => {
    container.classList.add(BRAND_REVEALED_CLASS);
    draw?.play();
  };

  const observeVisibility = (): void => {
    const svg = draw?.getSvgElement();
    if (!svg || typeof IntersectionObserver !== 'function') {
      start();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (once) io.disconnect();
          start();
        });
      },
      { threshold }
    );
    io.observe(svg);
    stack.addObserver(io);
  };

  const ready = createSvgDraw({
    container,
    source: BRAND_SVG_SRC,
    duration,
    easing: DRAW_EASING,
    fadeDuration: FADE_DURATION,
    trigger: 'manual',
    roundCaps: true,
    evenSpeed: false,
    className: 'brand-logo-svg',
  })
    .then((instance) => {
      if (destroyed) {
        instance.destroy();
        return;
      }
      draw = instance;
      // 挂载后先复位：确保后续只有勾边轨迹可见，不会提前露出实心图形
      instance.reset();

      if (requested) start();
      else if (mode === 'visible') observeVisibility();
    })
    .catch((error: unknown) => {
      console.warn('[BrandLogo] LOGO 未就绪，保留原文字：', error);
    });

  return {
    ready,
    play(): void {
      if (destroyed || requested) return;
      requested = true;
      if (draw) start();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stack.dispose();
      draw?.destroy();
      draw = null;
      container.classList.remove(BRAND_REVEALED_CLASS);
    },
  };
}

/**
 * 扫描 root 内的 `[data-brand-logo]` 并逐个挂载。
 * data-brand-logo="visible" → 滚动可见触发；其余值 → manual。
 *
 * @returns 销毁函数（片段被替换时调用）
 */
export function initBrandLogos(
  root: ParentNode = document,
  options: BrandLogoOptions = {}
): () => void {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(`[${BRAND_DATA_ATTR}]`)
  );
  const handles = nodes.map((el) => {
    const mode: BrandLogoMode =
      el.getAttribute(BRAND_DATA_ATTR) === 'visible' ? 'visible' : 'manual';
    return mountBrandLogo(el, { ...options, mode });
  });

  return () => {
    handles.forEach((handle) => handle.destroy());
  };
}
