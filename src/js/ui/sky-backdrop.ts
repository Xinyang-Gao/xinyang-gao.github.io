// /js/ui/sky-backdrop.ts
// 渐变天空背景：按时间插值出天空色，简笔云朵与星空随滚动产生视差，
// 接近页脚时天空装饰（云、星、日月）逐级退场，为后续"地面"留出位置。

import { CONFIG, storageController } from '/js/core/core.js';
import { themeController, type Theme } from '/js/core/theme-controller.js';
import {
  ensureWeather,
  mapWeatherToSky,
  subscribeWeather,
  type WeatherInfo,
} from '/js/core/weather-service.js';
import { scrollDispatcher } from '/js/core/scroll-dispatcher.js';

// ==================== 类型 ====================

/** 设置面板可选的天空时段（auto = 跟随真实时间连续变化） */
export type SkyPhase = 'auto' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';

/** 天气：晴 → 多云 → 雨 → 雷暴，云量、雨势、天色逐级递进 */
export type SkyWeather = 'clear' | 'cloudy' | 'rain' | 'storm';

/** 天气来源：auto 跟随真实天气（UAPI），其余为手动指定 */
export type SkyWeatherMode = 'auto' | SkyWeather;

/**
 * 一份天气对天空的全部影响。
 *
 * 设计原则：天气不另起一套配色，而是在"时段配色"之上做后处理 ——
 * 这样"雨天的黄昏"仍然是黄昏，只是被云压暗、抽掉了一部分饱和度，
 * 不会出现"切到雨天就变成另一套主题"的割裂感。
 */
interface WeatherProfile {
  label: string;
  /** 天色向中性阴云灰混合的比例 */
  overcast: number;
  /** 整体亮度系数（乌云压顶时压暗） */
  dim: number;
  /** 云量档位：1 最少 → 4 最多，决定显示到第几批云 */
  clouds: number;
  /** 云朵颜色压暗程度（雨云更沉） */
  cloudDim: number;
  /** 云朵填充浓度倍率（雨云更厚实） */
  cloudFill: number;
  /** 雨势 0 → 1，0 表示无雨 */
  rain: number;
  /** 是否有闪电 */
  lightning: boolean;
  /** 日月可见度（阴雨天被云遮住） */
  celestial: number;
  /** 星星可见度（阴雨天看不到星） */
  star: number;
  /** 地平线雾气浓度倍率 */
  haze: number;
}

const WEATHER_PROFILES: Record<SkyWeather, WeatherProfile> = {
  clear: {
    label: '晴',
    overcast: 0,
    dim: 1,
    clouds: 1,
    cloudDim: 0,
    cloudFill: 1,
    rain: 0,
    lightning: false,
    celestial: 1,
    star: 1,
    haze: 1,
  },
  cloudy: {
    label: '多云',
    overcast: 0.24,
    dim: 0.97,
    clouds: 2,
    cloudDim: 0.16,
    cloudFill: 1.3,
    rain: 0,
    lightning: false,
    celestial: 0.55,
    star: 0.4,
    haze: 1.2,
  },
  rain: {
    label: '雨',
    overcast: 0.44,
    dim: 0.87,
    clouds: 3,
    cloudDim: 0.34,
    cloudFill: 1.55,
    rain: 0.6,
    lightning: false,
    celestial: 0.16,
    star: 0.1,
    haze: 1.55,
  },
  storm: {
    label: '雷暴',
    overcast: 0.6,
    dim: 0.74,
    clouds: 4,
    cloudDim: 0.48,
    cloudFill: 1.75,
    rain: 1,
    lightning: true,
    celestial: 0.06,
    star: 0.03,
    haze: 1.85,
  },
};

/** 阴云灰：所有天气的"抽色"都朝这个中性偏冷的方向靠 */
const OVERCAST_GRAY: RGB = [104, 112, 128];

type RGB = readonly [number, number, number];

/** 一天中的关键帧；小时数在 0–24 上线性插值，首尾同色以闭合循环 */
interface SkyKeyframe {
  hour: number;
  top: string;
  mid: string;
  bottom: string;
  glow: string;
  cloud: string;
  cloudFill: number;
  cloudStroke: number;
  star: number;
  starTint: string;
}

// ==================== 配色关键帧 ====================
// 黎明与黄昏刻意往"梦幻"方向调：天顶还留着夜的蓝紫，地平线一侧已经烧起来。
const SKY_KEYFRAMES: readonly SkyKeyframe[] = [
  {
    hour: 0,
    top: '#080d22',
    mid: '#101a36',
    bottom: '#1c2547',
    glow: '#2b3766',
    cloud: '#8ea3d6',
    cloudFill: 0.08,
    cloudStroke: 0.34,
    star: 1,
    starTint: '#e7edff',
  },
  {
    hour: 4.2,
    top: '#0b1130',
    mid: '#1b2450',
    bottom: '#3a3266',
    glow: '#6a4a7e',
    cloud: '#a490c8',
    cloudFill: 0.1,
    cloudStroke: 0.38,
    star: 0.82,
    starTint: '#efe6ff',
  },
  {
    hour: 5.6,
    top: '#2c2f6b',
    mid: '#7a4f8c',
    bottom: '#e79a7f',
    glow: '#ffab74',
    cloud: '#f7cfc0',
    cloudFill: 0.16,
    cloudStroke: 0.5,
    star: 0.34,
    starTint: '#ffe7d5',
  },
  {
    hour: 7.5,
    top: '#4d7fc4',
    mid: '#93bde6',
    bottom: '#f6cf9f',
    glow: '#ffcf8f',
    cloud: '#fdf3e6',
    cloudFill: 0.22,
    cloudStroke: 0.55,
    star: 0.06,
    starTint: '#fff6e8',
  },
  {
    hour: 10,
    top: '#3f86cf',
    mid: '#87c0ec',
    bottom: '#cfe4f5',
    glow: '#d8ecff',
    cloud: '#ffffff',
    cloudFill: 0.3,
    cloudStroke: 0.6,
    star: 0,
    starTint: '#ffffff',
  },
  {
    hour: 13.5,
    top: '#3b82cd',
    mid: '#85bfeb',
    bottom: '#d3e6f6',
    glow: '#dbeeff',
    cloud: '#ffffff',
    cloudFill: 0.32,
    cloudStroke: 0.62,
    star: 0,
    starTint: '#ffffff',
  },
  {
    hour: 15.5,
    top: '#4a7fc6',
    mid: '#8dbbe3',
    bottom: '#f8dcae',
    glow: '#ffd9a0',
    cloud: '#fff8ec',
    cloudFill: 0.28,
    cloudStroke: 0.58,
    star: 0,
    starTint: '#fff4e2',
  },
  {
    hour: 17.6,
    top: '#41508f',
    mid: '#a06a95',
    bottom: '#f2a878',
    glow: '#ff9f70',
    cloud: '#ffd7c2',
    cloudFill: 0.2,
    cloudStroke: 0.52,
    star: 0.06,
    starTint: '#ffe2cd',
  },
  {
    hour: 18.9,
    top: '#2a3268',
    mid: '#6d4a80',
    bottom: '#e0836e',
    glow: '#ff8f63',
    cloud: '#e9b7a8',
    cloudFill: 0.16,
    cloudStroke: 0.46,
    star: 0.34,
    starTint: '#ffdfd0',
  },
  {
    hour: 20.4,
    top: '#131a44',
    mid: '#2b2a5c',
    bottom: '#5a3f68',
    glow: '#8a5a7e',
    cloud: '#a893c4',
    cloudFill: 0.12,
    cloudStroke: 0.4,
    star: 0.74,
    starTint: '#f0e6ff',
  },
  {
    hour: 22,
    top: '#0a1029',
    mid: '#141c3d',
    bottom: '#232c52',
    glow: '#39456f',
    cloud: '#95a8dc',
    cloudFill: 0.09,
    cloudStroke: 0.35,
    star: 1,
    starTint: '#e9eeff',
  },
  {
    hour: 24,
    top: '#080d22',
    mid: '#101a36',
    bottom: '#1c2547',
    glow: '#2b3766',
    cloud: '#8ea3d6',
    cloudFill: 0.08,
    cloudStroke: 0.34,
    star: 1,
    starTint: '#e7edff',
  },
];

/** 手动时段 → 代表时刻（小时，可含小数） */
const PHASE_HOUR: Record<Exclude<SkyPhase, 'auto'>, number> = {
  dawn: 5.6,
  morning: 7.8,
  noon: 12,
  afternoon: 15.3,
  dusk: 18.5,
  night: 21.5,
};

const PHASE_LABEL: Record<SkyPhase, string> = {
  auto: '自动',
  dawn: '黎明',
  morning: '清晨',
  noon: '正午',
  afternoon: '午后',
  dusk: '黄昏',
  night: '夜晚',
};

/**
 * 主题调和：暗色主题把天空压深、浅色主题提亮一点，避免与卡片底色割裂。
 *
 * 关键是**按比例缩放而不是向灰色混合**——向深色混合会把黄昏的橙红搅成灰褐，
 * 傍晚那点"梦幻"就没了。缩放保留色相与饱和度，只是整体暗下来；
 * 再补一点点冷色底（暗色）/ 暖白（浅色）让两端不至于发闷。
 */
const DARK_SHADE = { scale: 0.74, lift: [8, 10, 24] as const, liftAmount: 0.26 };
const LIGHT_SHADE = { scale: 0.98, lift: [255, 255, 255] as const, liftAmount: 0.08 };
/** 云朵比天空更"吃"主题：压太狠会失去时段特征，所以着色更轻 */
const DARK_CLOUD_SHADE = { scale: 0.92, lift: [12, 14, 30] as const, liftAmount: 0.1 };
const LIGHT_CLOUD_SHADE = { scale: 1, lift: [255, 255, 255] as const, liftAmount: 0.06 };

/** 云层：越近的云越大、越快、越清晰（视差系数越大） */
interface CloudLayerConfig {
  depth: 'far' | 'mid' | 'near';
  count: number;
  width: readonly [number, number];
  top: readonly [number, number];
  parallax: number;
  rise: number;
  opacity: number;
  blur: number;
  drift: readonly [number, number];
}

const CLOUD_LAYERS: readonly CloudLayerConfig[] = [
  {
    depth: 'far',
    count: 9,
    width: [90, 150],
    top: [4, 38],
    parallax: 0.05,
    rise: 34,
    opacity: 0.5,
    blur: 1.4,
    drift: [110, 170],
  },
  {
    depth: 'mid',
    count: 7,
    width: [160, 250],
    top: [10, 46],
    parallax: 0.1,
    rise: 78,
    opacity: 0.72,
    blur: 0.5,
    drift: [80, 130],
  },
  {
    depth: 'near',
    count: 5,
    width: [260, 400],
    top: [16, 58],
    parallax: 0.18,
    rise: 140,
    opacity: 0.85,
    blur: 0,
    drift: [55, 95],
  },
];

/** 简笔云朵轮廓：一条底线 + 若干圆弧，描边为主、填充只给一点点 */
const CLOUD_PATHS: readonly { viewBox: string; d: string }[] = [
  {
    viewBox: '0 0 96 40',
    d: 'M6 34 Q2 34 2 30 Q2 26 6 25 Q8 16 18 15 Q24 6 34 11 Q42 4 50 12 Q60 8 66 16 Q76 14 80 22 Q88 21 90 27 Q92 34 86 34 Z',
  },
  {
    viewBox: '0 0 120 36',
    d: 'M8 30 Q2 30 3 25 Q5 19 12 20 Q16 11 27 12 Q34 4 44 10 Q54 3 63 11 Q74 8 81 16 Q92 14 96 21 Q104 20 106 26 Q108 31 100 31 Z',
  },
  {
    viewBox: '0 0 72 32',
    d: 'M7 26 Q2 26 3 21 Q4 16 10 16 Q13 9 21 10 Q28 4 35 9 Q43 6 47 13 Q55 12 58 18 Q64 18 64 23 Q65 27 58 27 Z',
  },
];

/** 闪电：一条主干 + 两个分叉，简笔勾线的风格与云朵一致 */
const LIGHTNING_PATH = 'M32 4 L18 78 L34 76 L14 132 L30 128 L8 196 L26 118 L12 120 L28 66 L14 68 Z';

const SUN_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="11" /></svg>`;
const MOON_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M23 5 A16 16 0 1 0 37 21 A13 13 0 1 1 23 5 Z" /></svg>`;

// ==================== 小工具 ====================

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** 按比例缩放亮度再补一点底色：保留色相与饱和度，只把整体压暗/提亮 */
function shadeColor(
  rgb: RGB,
  shade: { scale: number; lift: readonly [number, number, number]; liftAmount: number },
): RGB {
  return [
    rgb[0] * shade.scale + shade.lift[0] * shade.liftAmount,
    rgb[1] * shade.scale + shade.lift[1] * shade.liftAmount,
    rgb[2] * shade.scale + shade.lift[2] * shade.liftAmount,
  ];
}

function toCss(rgb: RGB, alpha = 1): string {
  const [r, g, b] = [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 固定种子的伪随机：保证云朵布局在刷新/缩放前后稳定，不会每次 reshuffle */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 第 i 朵云（共 count 朵）属于哪一档：1 晴就有、2 多云起、3 雨起、4 仅雷暴。
 * 靠前的云永远在场，靠后的随天气加重逐步补上。
 */
function weatherTier(i: number, count: number): number {
  const rank = count > 1 ? i / (count - 1) : 0;
  if (rank <= 0.36) return 1;
  if (rank <= 0.62) return 2;
  if (rank <= 0.84) return 3;
  return 4;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

// ==================== 时段解析 ====================

/** 取当前应生效的小时数：auto 走系统时钟，其余走代表时刻 */
function resolveHour(phase: SkyPhase): number {
  if (phase !== 'auto') return PHASE_HOUR[phase];
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

interface ResolvedSky {
  top: RGB;
  mid: RGB;
  bottom: RGB;
  glow: RGB;
  cloud: RGB;
  cloudFill: number;
  cloudStroke: number;
  star: number;
  starTint: RGB;
}

/**
 * 在时段配色之上叠加天气：向阴云灰混合（抽掉饱和度）+ 整体压暗。
 * 先算时段再算天气，所以"雨天的黄昏"仍然是黄昏的色相，只是沉下去了。
 */
function applyWeather(base: ResolvedSky, weather: SkyWeather): ResolvedSky {
  const w = WEATHER_PROFILES[weather];
  const overcast = (c: RGB): RGB => mix(c, OVERCAST_GRAY, w.overcast);
  const dim = (c: RGB, k = w.dim): RGB => [c[0] * k, c[1] * k, c[2] * k];
  const sky = (c: RGB): RGB => dim(overcast(c));

  return {
    top: sky(base.top),
    mid: sky(base.mid),
    bottom: sky(base.bottom),
    glow: sky(base.glow),
    // 云比天空更"吃"天气：雨云要明显沉下去，但别沉成纯黑
    cloud: dim(overcast(base.cloud), 1 - w.cloudDim),
    cloudFill: Math.min(0.92, base.cloudFill * w.cloudFill),
    cloudStroke: Math.min(1, base.cloudStroke * (1 + w.overcast * 0.5)),
    star: base.star * w.star,
    starTint: base.starTint,
  };
}

function resolveSky(hour: number, theme: Theme, weather: SkyWeather): ResolvedSky {
  const h = ((hour % 24) + 24) % 24;

  let i = 0;
  while (i < SKY_KEYFRAMES.length - 2 && SKY_KEYFRAMES[i + 1].hour <= h) i += 1;
  const a = SKY_KEYFRAMES[i];
  const b = SKY_KEYFRAMES[i + 1];
  const span = b.hour - a.hour;
  // 不同关键帧之间做 smoothstep，避免正午这类"平段"与黄昏之间出现折线感
  const raw = span > 0 ? (h - a.hour) / span : 0;
  const t = raw * raw * (3 - 2 * raw);

  const shade = theme === 'dark' ? DARK_SHADE : LIGHT_SHADE;
  const cloudShade = theme === 'dark' ? DARK_CLOUD_SHADE : LIGHT_CLOUD_SHADE;
  const tint = (hex: string): RGB => shadeColor(hexToRgb(hex), shade);
  const tintCloud = (hex: string): RGB => shadeColor(hexToRgb(hex), cloudShade);
  const blend = (x: string, y: string): RGB => mix(tint(x), tint(y), t);

  return applyWeather(
    {
      top: blend(a.top, b.top),
      mid: blend(a.mid, b.mid),
      bottom: blend(a.bottom, b.bottom),
      // 地平线辉光带一点透明度，直接叠在渐变上不至于糊成一块
      glow: blend(a.glow, b.glow),
      cloud: mix(tintCloud(a.cloud), tintCloud(b.cloud), t),
      cloudFill: lerp(a.cloudFill, b.cloudFill, t),
      cloudStroke: lerp(a.cloudStroke, b.cloudStroke, t),
      star: lerp(a.star, b.star, t),
      starTint: mix(hexToRgb(a.starTint), hexToRgb(b.starTint), t),
    },
    weather,
  );
}

/** 日月：沿一条弧线东升西落，日出日落时贴着地平线（最出片的位置） */
function resolveCelestial(hour: number): {
  sun: number;
  moon: number;
  x: number;
  y: number;
  color: string;
  glow: string;
} {
  const h = ((hour % 24) + 24) % 24;
  const isDay = h >= 5.6 && h < 18.6;
  const start = isDay ? 5.6 : 18.6;
  const t = ((((h - start) % 24) + 24) % 24) / 13; // 白昼 / 夜晚各 13 小时一轮
  const arc = Math.sin(Math.PI * clamp01(t));

  return {
    sun: isDay ? clamp01(arc * 1.8) : 0,
    moon: isDay ? 0 : clamp01(arc * 1.8),
    x: 12 + 76 * clamp01(t),
    y: (isDay ? 76 : 70) - (isDay ? 54 : 46) * arc,
    color: isDay ? 'rgba(255, 226, 178, 0.95)' : 'rgba(233, 239, 255, 0.95)',
    glow: isDay ? 'rgba(255, 190, 120, 0.32)' : 'rgba(190, 210, 255, 0.22)',
  };
}

// ==================== 星空 ====================

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
  halo: boolean;
}

/** 雨滴：斜着落下，长度与速度成正比（快的雨丝更长） */
interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

// ==================== 天空控制器 ====================

class SkyBackdrop {
  private root: HTMLElement | null = null;
  private gradients: HTMLElement[] = [];
  private activeGradient = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stars: Star[] = [];
  private sunEl: HTMLElement | null = null;
  private moonEl: HTMLElement | null = null;
  /** 雨：独立 canvas，与星空分开便于各自控制强度 */
  private rainCanvas: HTMLCanvasElement | null = null;
  private rainCtx: CanvasRenderingContext2D | null = null;
  private drops: Drop[] = [];
  /** 闪电：整屏白闪 + 一道分叉的折线 */
  private lightningEl: HTMLElement | null = null;
  private lightningTimer: ReturnType<typeof setTimeout> | null = null;

  private phase: SkyPhase = 'auto';
  /** 用户选择的天气来源（默认 auto = 真实天气） */
  private weatherMode: SkyWeatherMode = 'auto';
  /** auto 模式下实际生效的天气；拿不到真实天气时退回晴天 */
  private realWeather: WeatherInfo | null = null;
  private enabled = true;
  /** 天气服务的订阅句柄 */
  private unsubscribeWeather: (() => void) | null = null;
  private theme: Theme = 'light';

  /** 当前雨势 0 → 1，平滑逼近目标，切换天气时不会突然出现/消失 */
  private rainAlpha = 0;
  private rainTarget = 0;
  private starAlpha = 0;
  private starTarget = 0;
  private starTint: RGB = [231, 237, 255];
  private starTintTarget: RGB = [231, 237, 255];

  private rafId = 0;
  private lastDraw = 0;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeScroll: (() => void) | null = null;
  private unsubscribeTheme: (() => void) | null = null;
  private started = false;
  /** 地面顶边的文档坐标（缓存，避免滚动时每帧回流） */
  private groundTopDoc = 0;

  /** 幂等初始化：只建一次 DOM，之后所有入口都走 apply() */
  init(): void {
    if (this.started) return;
    this.started = true;

    this.phase = this.readPhase();
    this.weatherMode = this.readWeatherMode();
    this.enabled = this.readEnabled();
    this.theme = themeController.getTheme();

    this.build();
    this.apply(true);
    this.bindEvents();
    document.body.classList.toggle('has-sky', this.enabled);

    // 订阅真实天气：拿到后（或后续刷新后）若处于 auto 就重算天空
    this.unsubscribeWeather = subscribeWeather((info) => {
      const changed = info?.weather !== this.realWeather?.weather;
      this.realWeather = info;
      if (this.weatherMode === 'auto' && changed) this.apply(false);
    });
    if (this.weatherMode === 'auto') void ensureWeather();

    // 天空是纯装饰，晚一帧再淡入，避免和加载遮罩抢首帧
    requestAnimationFrame(() => this.root?.classList.add('is-ready'));
  }

  getPhase(): SkyPhase {
    return this.phase;
  }

  /** 供设置面板显示"当前实际生效的时段" */
  getStatusText(): string {
    const hour = resolveHour(this.phase);
    const hh = Math.floor(hour) % 24;
    const mm = Math.floor((hour - Math.floor(hour)) * 60);
    return `${PHASE_LABEL[this.phase]} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** 设置面板下拉里选中哪一项 */
  getWeatherMode(): SkyWeatherMode {
    return this.weatherMode;
  }

  setWeatherMode(mode: SkyWeatherMode): void {
    this.weatherMode = mode;
    // 平滑逼近依赖 rAF：先改再 apply，循环条件会自动补上/停掉
    this.apply(false);
  }

  /** 实际渲染用的天气：auto 取真实天气，取不到按晴天 */
  private effectiveWeather(): SkyWeather {
    return this.weatherMode === 'auto' ? mapWeatherToSky(this.realWeather) : this.weatherMode;
  }

  /** 设置面板里"天空"那行的说明：时段 + 天气（auto 时带出真实天气来源） */
  getWeatherText(): string {
    const base = `${this.getStatusText()} · ${WEATHER_PROFILES[this.effectiveWeather()].label}`;
    if (this.weatherMode === 'auto') {
      return this.realWeather
        ? `${base}（真实天气 · ${this.realWeather.city}${this.realWeather.weather}）`
        : `${base}（真实天气获取中…）`;
    }
    return base;
  }

  setPhase(phase: SkyPhase): void {
    this.phase = phase;
    this.apply(false);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    document.body.classList.toggle('has-sky', enabled);
    const root = this.root;
    if (!root) return;
    root.classList.toggle('is-disabled', !enabled);
    if (!enabled) {
      this.starAlpha = 0;
      this.starTarget = 0;
      this.rainAlpha = 0;
      this.rainTarget = 0;
    }
    this.apply(false);
    this.syncStarLoop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** 外部（主题切换、尺寸变化、导航完成）触发重算 */
  refresh(): void {
    this.apply(false);
  }

  /** 释放监听与定时器（一般只在测试或极端场景调用） */
  destroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = null;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    if (this.lightningTimer) clearTimeout(this.lightningTimer);
    this.lightningTimer = null;
    this.unsubscribeScroll?.();
    this.unsubscribeScroll = null;
    this.unsubscribeTheme?.();
    this.unsubscribeTheme = null;
    this.unsubscribeWeather?.();
    this.unsubscribeWeather = null;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.root?.remove();
    this.root = null;
    this.started = false;
  }

  // ---------- DOM ----------

  private build(): void {
    const root = document.createElement('div');
    root.id = 'sky-backdrop';
    root.className = 'sky-backdrop';
    root.setAttribute('aria-hidden', 'true');

    // 两层渐变交替淡入淡出：CSS 不能直接过渡 background-image，
    // 只能靠两张叠放在一起的图层交叉淡化来"过渡"时间。
    this.gradients = [0, 1].map(() => {
      const el = document.createElement('div');
      el.className = 'sky-gradient';
      root.appendChild(el);
      return el;
    });

    const starsWrap = document.createElement('div');
    starsWrap.className = 'sky-stars-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'sky-stars';
    starsWrap.appendChild(canvas);
    root.appendChild(starsWrap);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    const celestialWrap = document.createElement('div');
    celestialWrap.className = 'sky-celestial-ground';
    const sun = document.createElement('div');
    sun.className = 'sky-celestial sky-celestial--sun';
    sun.innerHTML = SUN_SVG;
    const moon = document.createElement('div');
    moon.className = 'sky-celestial sky-celestial--moon';
    moon.innerHTML = MOON_SVG;
    celestialWrap.appendChild(sun);
    celestialWrap.appendChild(moon);
    root.appendChild(celestialWrap);
    this.sunEl = sun;
    this.moonEl = moon;

    const haze = document.createElement('div');
    haze.className = 'sky-haze';
    root.appendChild(haze);

    // 雨在云之下、雾之上：雨丝从云底落下来
    const rainCanvas = document.createElement('canvas');
    rainCanvas.className = 'sky-rain';
    root.appendChild(rainCanvas);
    this.rainCanvas = rainCanvas;
    this.rainCtx = rainCanvas.getContext('2d');

    this.buildClouds(root);

    // 闪电盖在最上面：一瞬间的整屏白 + 折线
    const lightning = document.createElement('div');
    lightning.className = 'sky-lightning';
    lightning.innerHTML = `<span class="sky-lightning-flash"></span>
      <svg class="sky-lightning-bolt" viewBox="0 0 60 200" aria-hidden="true"><path d="${LIGHTNING_PATH}" /></svg>`;
    root.appendChild(lightning);
    this.lightningEl = lightning;

    document.body.appendChild(root);
    this.root = root;
  }

  private buildClouds(root: HTMLElement): void {
    const rand = mulberry32(20260222);
    const narrow = window.innerWidth < 768;
    const scale = narrow ? 0.7 : 1;

    for (const layer of CLOUD_LAYERS) {
      const el = document.createElement('div');
      el.className = 'sky-cloud-layer';
      el.dataset.depth = layer.depth;
      el.style.setProperty('--layer-parallax', String(layer.parallax));
      el.style.setProperty('--layer-rise', `${layer.rise}px`);
      el.style.setProperty('--layer-opacity', String(layer.opacity));
      el.style.setProperty('--layer-blur', `${layer.blur}px`);

      const count = Math.max(3, Math.round(layer.count * (narrow ? 0.7 : 1)));
      for (let i = 0; i < count; i += 1) {
        const cloud = document.createElement('div');
        cloud.className = 'sky-cloud';
        // 分批出场：朵云按序位分配"从哪一档天气开始出现"，
        // 于是晴天疏、多云中、雨天密、雷暴乌云压顶 —— 无需重建 DOM，纯 CSS 显隐。
        cloud.dataset.minWeather = String(weatherTier(i, count));
        const width = Math.round(lerp(layer.width[0], layer.width[1], rand()) * scale);
        const left = lerp(-6, 92, rand());
        const top = lerp(layer.top[0], layer.top[1], rand());
        const duration = Math.round(lerp(layer.drift[0], layer.drift[1], rand()));
        const shape = CLOUD_PATHS[Math.floor(rand() * CLOUD_PATHS.length)];
        cloud.style.width = `${width}px`;
        cloud.style.left = `${left.toFixed(2)}%`;
        cloud.style.top = `${top.toFixed(2)}%`;
        cloud.style.setProperty('--drift-duration', `${duration}s`);
        // 负延迟让每朵云一出场就处于漂移中的随机相位，而不是整排同步起步
        cloud.style.setProperty('--drift-delay', `-${Math.round(rand() * duration)}s`);
        cloud.innerHTML = `<svg viewBox="${shape.viewBox}" aria-hidden="true"><path d="${shape.d}" /></svg>`;
        el.appendChild(cloud);
      }
      root.appendChild(el);
    }
  }

  private resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    const canvas = this.canvas;
    if (canvas) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = this.ctx;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const rainCanvas = this.rainCanvas;
    if (rainCanvas) {
      rainCanvas.width = Math.round(w * dpr);
      rainCanvas.height = Math.round(h * dpr);
      const ctx = this.rainCtx;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.buildStars(w, h);
    this.buildDrops(w, h);
  }

  /**
   * 雨滴池按最大雨势（雷暴）一次性建好，绘制时只取前 N 个 ——
   * 切换天气不必重建粒子，也不会因为反复分配造成 GC 抖动。
   */
  private buildDrops(w: number, h: number): void {
    const rand = mulberry32(20261017);
    const count = Math.min(320, Math.max(90, Math.round((w * h) / 5200)));
    const drops: Drop[] = [];
    for (let i = 0; i < count; i += 1) {
      const speed = lerp(620, 1250, rand());
      drops.push({
        x: rand() * (w + 260) - 130, // 左右多铺一些，斜风才不会在边缘露空
        y: rand() * h,
        len: lerp(10, 26, rand()),
        speed,
        alpha: lerp(0.18, 0.52, rand()),
      });
    }
    this.drops = drops;
  }

  private buildStars(w: number, h: number): void {
    const rand = mulberry32(19980222);
    const density = w < 768 ? 14000 : 9000;
    const count = Math.min(180, Math.max(40, Math.round((w * h) / density)));
    const stars: Star[] = [];
    for (let i = 0; i < count; i += 1) {
      const halo = rand() > 0.9;
      stars.push({
        x: rand() * w,
        y: rand() * h * 0.92,
        r: halo ? lerp(1.4, 2.2, rand()) : lerp(0.4, 1.2, rand()),
        base: halo ? lerp(0.75, 1, rand()) : lerp(0.3, 0.8, rand()),
        speed: lerp(0.4, 1.6, rand()),
        phase: rand() * Math.PI * 2,
        halo,
      });
    }
    this.stars = stars;
  }

  // ---------- 应用 ----------

  private apply(immediate: boolean): void {
    const root = this.root;
    if (!root) return;

    const hour = resolveHour(this.phase);
    const theme = themeController.getTheme();
    this.theme = theme;

    const weather = this.effectiveWeather();
    const sky = resolveSky(hour, theme, weather);
    const profile = WEATHER_PROFILES[weather];

    // 渐变：写入非当前层，再交叉淡化
    const next = this.gradients[this.activeGradient === 0 ? 1 : 0];
    if (next) {
      next.style.setProperty('--sky-top', toCss(sky.top));
      next.style.setProperty('--sky-mid', toCss(sky.mid));
      next.style.setProperty('--sky-bottom', toCss(sky.bottom));
      next.style.setProperty('--sky-glow', toCss(sky.glow, 0.6));
      next.classList.add('is-active');
      const prev = this.gradients[this.activeGradient];
      prev?.classList.remove('is-active');
      this.activeGradient = this.activeGradient === 0 ? 1 : 0;
    }

    root.style.setProperty('--sky-cloud-color', toCss(sky.cloud));
    root.style.setProperty('--sky-cloud-fill-opacity', sky.cloudFill.toFixed(3));
    root.style.setProperty('--sky-cloud-stroke-opacity', sky.cloudStroke.toFixed(3));
    // 地平线雾气：阴雨天更浓，把远景糊进天色里
    root.style.setProperty('--sky-haze-opacity', (0.32 * profile.haze).toFixed(3));
    root.dataset.phase = this.phase;
    root.dataset.weather = weather;
    root.dataset.theme = theme;

    // 星星：目标值交给 rAF 循环平滑逼近（含首次立即到位）
    this.starTarget = this.enabled ? sky.star : 0;
    this.starTintTarget = sky.starTint;
    if (immediate) {
      this.starAlpha = this.starTarget;
      this.starTint = this.starTintTarget;
    }
    root.style.setProperty('--sky-star-alpha', this.starAlpha.toFixed(3));

    // 雨：目标雨势，同样交给 rAF 平滑逼近
    this.rainTarget = this.enabled ? profile.rain : 0;
    if (immediate) this.rainAlpha = this.rainTarget;

    // 闪电：只在雷暴且天空开启时排期
    this.scheduleLightning();

    // 日月
    const c = resolveCelestial(hour);
    const size = window.innerWidth < 768 ? 64 : 86;
    if (this.sunEl) {
      this.sunEl.style.setProperty('--celestial-x', `${c.x.toFixed(2)}%`);
      this.sunEl.style.setProperty('--celestial-y', `${c.y.toFixed(2)}%`);
      this.sunEl.style.setProperty('--celestial-size', `${size}px`);
      this.sunEl.style.setProperty('--celestial-color', c.color);
      this.sunEl.style.setProperty('--celestial-glow', c.glow);
      this.sunEl.style.opacity = this.enabled ? (c.sun * profile.celestial).toFixed(3) : '0';
    }
    if (this.moonEl) {
      this.moonEl.style.setProperty('--celestial-x', `${c.x.toFixed(2)}%`);
      this.moonEl.style.setProperty('--celestial-y', `${c.y.toFixed(2)}%`);
      this.moonEl.style.setProperty('--celestial-size', `${Math.round(size * 0.72)}px`);
      this.moonEl.style.setProperty('--celestial-color', c.color);
      this.moonEl.style.setProperty('--celestial-glow', c.glow);
      this.moonEl.style.opacity = this.enabled ? (c.moon * profile.celestial).toFixed(3) : '0';
    }

    this.measureGround();
    this.updateScroll();
    this.syncStarLoop();
  }

  // ---------- 滚动视差 / 页脚退场 ----------

  private updateScroll(): void {
    const root = this.root;
    if (!root) return;
    const y = scrollDispatcher.getScrollY();
    root.style.setProperty('--sky-scroll', String(Math.round(y)));
    root.style.setProperty('--sky-ground', this.groundProgress(y).toFixed(4));
    root.style.setProperty('--sky-star-alpha', this.starAlpha.toFixed(3));
  }

  /**
   * 0 → 1 表示"离地面越来越近"。
   *
   * 基准是真正的地面元素（#site-ground）：它一进视口底部就开始退场，
   * 滚到视口上部时云朵/星空/日月已淡干净，正好把舞台交给地面与页脚。
   * 地面组件缺失时（例如尚未初始化）退回按页脚占位符计算。
   */
  private groundProgress(y: number): number {
    const viewport = window.innerHeight;
    const distanceToGround = this.groundTopDoc - y; // ≈ 地面顶边的视口坐标
    const fadeSpan = viewport * 0.6;
    return clamp01((viewport - distanceToGround) / fadeSpan);
  }

  /**
   * 量一次地面顶边的文档坐标，滚动时复用。
   * 每帧 getBoundingClientRect 会强制回流，缓存后只在 apply/resize 时算一次。
   */
  private measureGround(): void {
    const ground = document.getElementById('site-ground');
    const footer = document.getElementById('footer-placeholder');
    const target = ground ?? footer;
    if (!target) {
      this.groundTopDoc = document.documentElement.scrollHeight;
      return;
    }
    const rect = target.getBoundingClientRect();
    this.groundTopDoc = rect.top + (window.scrollY || document.documentElement.scrollTop || 0);
  }

  // ---------- 星空循环 ----------

  /** 循环条件：星空闪烁或下雨时才需要 rAF，晴天夜里没星星就完全静止 */
  private syncStarLoop(): void {
    const needsRain = this.rainAlpha > 0.01 || this.rainTarget > 0.01;
    const needsStars = this.starAlpha > 0.02 || this.starTarget > 0.02;
    const shouldRun =
      this.enabled && !prefersReducedMotion() && !document.hidden && (needsRain || needsStars);

    if (shouldRun && !this.rafId) {
      this.lastDraw = 0;
      this.rafId = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.drawStars(0, true);
      this.drawRain(0);
    }
  }

  private tick = (time: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    // 约 30fps：星星闪烁不需要 60fps，省一半电量
    if (time - this.lastDraw < 33) return;
    // dt 要在覆盖 lastDraw 之前算出来：雨滴按真实经过的时间下落，
    // 这样掉帧时雨速不会跟着变慢。
    const dt = Math.min((time - this.lastDraw) / 1000, 0.06);
    this.lastDraw = time;

    // 目标值平滑逼近：切时段/切主题/切天气时不会硬跳
    this.starAlpha += (this.starTarget - this.starAlpha) * 0.12;
    this.starTint = mix(this.starTint, this.starTintTarget, 0.12);
    this.rainAlpha += (this.rainTarget - this.rainAlpha) * 0.09;
    this.root?.style.setProperty('--sky-star-alpha', this.starAlpha.toFixed(3));

    if (Math.abs(this.starTarget - this.starAlpha) < 0.004) this.starAlpha = this.starTarget;
    if (Math.abs(this.rainTarget - this.rainAlpha) < 0.004) this.rainAlpha = this.rainTarget;

    this.drawStars(time / 1000, false);
    this.drawRain(dt);
    this.syncStarLoop();
  };

  /**
   * 画雨：斜风细雨到密集雨幕都靠同一批粒子，只是数量与透明度随雨势缩放。
   * dt 传秒，速度按 60fps 的观感标定。
   */
  private drawRain(dt: number): void {
    const ctx = this.rainCtx;
    const canvas = this.rainCanvas;
    if (!ctx || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    if (this.rainAlpha <= 0.01) return;
    const active = Math.round(this.drops.length * this.rainAlpha);
    if (active <= 0) return;

    // 雨丝略带冷调，天色越暗越明显
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    for (let i = 0; i < active; i += 1) {
      const d = this.drops[i];
      d.y += d.speed * dt;
      d.x += d.speed * dt * 0.26; // 斜风
      if (d.y > h + 20) {
        d.y = -30;
        d.x = Math.random() * (w + 260) - 130;
      }
      if (d.x > w + 140) d.x -= w + 260;

      const a = d.alpha * this.rainAlpha;
      ctx.strokeStyle = `rgba(196, 214, 236, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.26, d.y + d.len);
      ctx.stroke();
    }
  }

  // ---------- 闪电 ----------

  /**
   * 雷暴时随机打闪：间隔 2.4–7.2s，一次flash 约 0.6s。
   * 用随机间隔而不是固定周期，避免形成可预期的节拍感。
   */
  private scheduleLightning(): void {
    if (this.lightningTimer) {
      clearTimeout(this.lightningTimer);
      this.lightningTimer = null;
    }
    const profile = WEATHER_PROFILES[this.effectiveWeather()];
    if (!profile.lightning || !this.enabled || prefersReducedMotion() || document.hidden) return;

    const delay = lerp(2400, 7200, Math.random());
    this.lightningTimer = setTimeout(() => {
      this.strike();
      this.scheduleLightning();
    }, delay);
  }

  /** 打一次闪：随机横向位置与缩放，避免每次都在同一处 */
  private strike(): void {
    const el = this.lightningEl;
    const root = this.root;
    if (!el || !root) return;

    el.style.setProperty('--bolt-x', `${(18 + Math.random() * 64).toFixed(1)}%`);
    el.style.setProperty('--bolt-scale', (0.8 + Math.random() * 0.5).toFixed(2));

    // 类加在 root 上：云层是闪电元素的前置兄弟，靠 root 才能一起被照亮
    root.classList.remove('is-flashing');
    // 强制回流，保证连续两次打闪也能重新播放动画
    void root.offsetWidth;
    root.classList.add('is-flashing');

    const clear = (): void => {
      root.classList.remove('is-flashing');
      el.removeEventListener('animationend', clear);
    };
    el.addEventListener('animationend', clear);
  }

  private drawStars(seconds: number, staticDraw: boolean): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (this.starAlpha <= 0.01) return;

    const alpha = this.starAlpha;
    const [tr, tg, tb] = [
      Math.round(this.starTint[0]),
      Math.round(this.starTint[1]),
      Math.round(this.starTint[2]),
    ];

    for (const star of this.stars) {
      const twinkle = staticDraw ? 1 : 0.68 + 0.32 * Math.sin(seconds * star.speed + star.phase);
      const a = alpha * star.base * twinkle;
      if (a <= 0.01) continue;

      if (star.halo) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${(a * 0.12).toFixed(3)})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${a.toFixed(3)})`;
      ctx.fill();
    }
  }

  // ---------- 事件 ----------

  private bindEvents(): void {
    this.resizeCanvas();

    this.unsubscribeScroll = scrollDispatcher.subscribe(() => this.updateScroll());

    this.unsubscribeTheme = themeController.onChange((theme) => {
      if (theme === this.theme) return;
      this.apply(false);
    });

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);

    // auto 模式跟随时钟：一分钟一跳足够平滑（渐变本身是连续插值的）
    this.autoTimer = setInterval(() => {
      if (this.phase === 'auto') this.apply(false);
    }, 60_000);
  }

  private handleResize = (): void => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeCanvas();
      this.apply(false);
    }, 200);
  };

  private handleVisibility = (): void => {
    this.syncStarLoop();
    // 后台标签页不打闪（也别让定时器在后台空转）
    if (document.hidden) {
      if (this.lightningTimer) {
        clearTimeout(this.lightningTimer);
        this.lightningTimer = null;
      }
    } else {
      this.scheduleLightning();
    }
  };

  // ---------- 读取设置 ----------

  private readPhase(): SkyPhase {
    const raw = storageController.getItem(CONFIG.STORAGE_KEYS.SKY_TIME);
    if (
      raw === 'dawn' ||
      raw === 'morning' ||
      raw === 'noon' ||
      raw === 'afternoon' ||
      raw === 'dusk' ||
      raw === 'night'
    ) {
      return raw;
    }
    return 'auto';
  }

  private readWeatherMode(): SkyWeatherMode {
    const raw = storageController.getItem(CONFIG.STORAGE_KEYS.SKY_WEATHER);
    return raw === 'clear' || raw === 'cloudy' || raw === 'rain' || raw === 'storm' ? raw : 'auto';
  }

  private readEnabled(): boolean {
    const raw = storageController.getItem(CONFIG.STORAGE_KEYS.SKY_ENABLED);
    return raw === null ? true : raw !== 'false';
  }
}

export const skyBackdrop = new SkyBackdrop();

// ==================== 对外 API ====================

/** 幂等初始化，应用启动时调用一次即可 */
export function initSkyBackdrop(): void {
  skyBackdrop.init();
}

export function setSkyPhase(phase: SkyPhase): void {
  skyBackdrop.setPhase(phase);
}

export function setSkyEnabled(enabled: boolean): void {
  skyBackdrop.setEnabled(enabled);
}

export function setSkyWeatherMode(mode: SkyWeatherMode): void {
  skyBackdrop.setWeatherMode(mode);
}

export function getSkyWeatherMode(): SkyWeatherMode {
  return skyBackdrop.getWeatherMode();
}

/** 设置面板里"天空"那行的说明：时段 + 天气 */
export function getSkyWeatherText(): string {
  return skyBackdrop.getWeatherText();
}

export function getSkyPhase(): SkyPhase {
  return skyBackdrop.getPhase();
}

/** 设置面板里那行"当前：xx"的说明文字 */
export function getSkyStatusText(): string {
  return skyBackdrop.getStatusText();
}

export function isSkyEnabled(): boolean {
  return skyBackdrop.isEnabled();
}

/** 页面高度变化（SPA 导航、页脚加载完成）后重算"离地距离" */
export function refreshSkyBackdrop(): void {
  skyBackdrop.refresh();
}
