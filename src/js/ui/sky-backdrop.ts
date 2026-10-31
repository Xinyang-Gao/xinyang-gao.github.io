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
import { ensureLunar, getLunar, moonPhase, subscribeLunar } from '/js/core/lunar-service.js';

// ==================== 类型 ====================

/** 设置面板可选的天空时段（auto = 跟随真实时间连续变化） */
export type SkyPhase = 'auto' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';

/** 天气：晴 → 多云 → 阴 → 雨 → 雷暴 → 雪 → 雨夹雪 */
export type SkyWeather =
  | 'clear'
  | 'cloudy'
  | 'overcast'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'sleet'
  | 'fog'
  | 'haze'
  | 'dust'
  | 'wind';

/**
 * 降水形态。雨是斜线，雪是飘落的白点，雨夹雪两者混着来。
 * 三者共用同一个粒子池，只是绘制方式不同 —— 切换天气不用重建粒子。
 */
export type PrecipKind = 'none' | 'rain' | 'snow' | 'sleet' | 'dust';

/** 天气来源：auto 跟随真实天气（UAPI），其余为手动指定 */
export type SkyWeatherMode = 'auto' | SkyWeather;

/**
 * 天气档位的唯一白名单。
 * 以前 sky-backdrop 与 settings 各存一份，新增档位时漏改一处就会被静默退回 auto
 * （新增雾/霾/沙尘/大风时就踩了这个坑），所以统一放在这里导出。
 */
const SKY_WEATHERS: readonly SkyWeather[] = [
  'clear',
  'cloudy',
  'overcast',
  'rain',
  'storm',
  'snow',
  'sleet',
  'fog',
  'haze',
  'dust',
  'wind',
];

export function isSkyWeather(value: string): value is SkyWeather {
  return (SKY_WEATHERS as readonly string[]).includes(value);
}

export function isSkyWeatherMode(value: string): value is SkyWeatherMode {
  return value === 'auto' || isSkyWeather(value);
}

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
  /** 降水形态 */
  precip: PrecipKind;
  /** 降水强度 0 → 1（粒子池里取用的比例），0 表示无降水 */
  precipRate: number;
  /** 是否有闪电 */
  lightning: boolean;
  /** 日月可见度（阴雨天被云遮住） */
  celestial: number;
  /** 星星可见度（阴雨天看不到星） */
  star: number;
  /** 地平线雾气浓度倍率 */
  haze: number;
  /** 地平线雾气的高度（占天空层的百分比）：雾天要铺得很高，晴天只贴地一层 */
  hazeHeight: number;
  /** 远景山脉的可见度（雨雪天被水汽糊掉，晴天最清楚） */
  mountain: number;
  /**
   * 额外染色：在"抽色 + 压暗"之后再向某个色相靠。
   * 霾偏土黄、沙尘偏沙黄——这两者不是"更灰"，而是"更黄"，
   * 只靠 OVERCAST_GRAY 混合表达不出来。
   */
  tint?: { color: RGB; amount: number };
  /** 阵风强度倍率：大风天即使实测风级不高也该看得见风 */
  gust?: number;
}

const WEATHER_PROFILES: Record<SkyWeather, WeatherProfile> = {
  clear: {
    label: '晴',
    overcast: 0,
    dim: 1,
    clouds: 1,
    cloudDim: 0,
    cloudFill: 1,
    precip: 'none',
    precipRate: 0,
    lightning: false,
    celestial: 1,
    star: 1,
    hazeHeight: 42,
    haze: 1,
    mountain: 1,
  },
  cloudy: {
    label: '多云',
    overcast: 0.24,
    dim: 0.97,
    clouds: 2,
    cloudDim: 0.16,
    cloudFill: 1.3,
    precip: 'none',
    precipRate: 0,
    lightning: false,
    celestial: 0.55,
    star: 0.4,
    hazeHeight: 46,
    haze: 1.2,
    mountain: 0.95,
  },
  // 阴：全天被云盖住但不降水 —— 云量比多云更满，天色更闷，不画雨
  overcast: {
    label: '阴',
    overcast: 0.37,
    dim: 0.92,
    clouds: 3,
    cloudDim: 0.24,
    cloudFill: 1.42,
    precip: 'none',
    precipRate: 0,
    lightning: false,
    celestial: 0.3,
    star: 0.16,
    hazeHeight: 52,
    haze: 1.4,
    mountain: 0.82,
  },
  rain: {
    label: '雨',
    overcast: 0.44,
    dim: 0.87,
    clouds: 3,
    cloudDim: 0.34,
    cloudFill: 1.55,
    precip: 'rain',
    precipRate: 0.6,
    lightning: false,
    celestial: 0.16,
    star: 0.1,
    hazeHeight: 58,
    haze: 1.55,
    mountain: 0.72,
  },
  storm: {
    label: '雷暴',
    overcast: 0.6,
    dim: 0.74,
    clouds: 4,
    cloudDim: 0.48,
    cloudFill: 1.75,
    precip: 'rain',
    precipRate: 1,
    lightning: true,
    celestial: 0.06,
    star: 0.03,
    hazeHeight: 66,
    haze: 1.85,
    mountain: 0.6,
  },
  // 雪：雪云是亮的而不是乌的，所以 dim > 1（雪面反照把天"提亮"），云几乎不压暗
  snow: {
    label: '雪',
    overcast: 0.4,
    dim: 1.04,
    clouds: 3,
    cloudDim: 0.06,
    cloudFill: 1.6,
    precip: 'snow',
    precipRate: 0.75,
    lightning: false,
    celestial: 0.2,
    star: 0.08,
    hazeHeight: 54,
    haze: 1.5,
    mountain: 0.68,
  },
  // 雨夹雪：介于雨与雪之间 —— 云压暗，粒子一半是雪片一半是雨丝
  sleet: {
    label: '雨夹雪',
    overcast: 0.48,
    dim: 0.9,
    clouds: 3,
    cloudDim: 0.28,
    cloudFill: 1.5,
    precip: 'sleet',
    precipRate: 0.82,
    lightning: false,
    celestial: 0.14,
    star: 0.06,
    hazeHeight: 56,
    haze: 1.62,
    mountain: 0.7,
  },
  // 雾：不降水，但水汽把远景整个吃掉 —— 雾气铺得很高、远山只剩一点轮廓。
  // 注意 dim 不降反升：雾散射光线，天色是"发白的灰"而不是"压暗的灰"。
  fog: {
    label: '雾',
    overcast: 0.34,
    dim: 1.0,
    clouds: 2,
    cloudDim: 0.04,
    cloudFill: 1.15,
    precip: 'none',
    precipRate: 0,
    lightning: false,
    celestial: 0.12,
    star: 0.02,
    hazeHeight: 88,
    haze: 3.4,
    mountain: 0.2,
  },
  // 霾：与雾的区别是"黄"而不是"白" —— 靠 tint 染出土黄色
  haze: {
    label: '霾',
    overcast: 0.3,
    dim: 0.94,
    clouds: 2,
    cloudDim: 0.1,
    cloudFill: 1.25,
    precip: 'none',
    precipRate: 0,
    lightning: false,
    celestial: 0.26,
    star: 0.05,
    hazeHeight: 70,
    haze: 2.5,
    mountain: 0.42,
    tint: { color: [176, 148, 96], amount: 0.3 },
  },
  // 沙尘：最浑的一档。有"降水"（其实是横向乱飞的沙粒），天色偏沙黄
  dust: {
    label: '沙尘',
    overcast: 0.44,
    dim: 0.9,
    clouds: 3,
    cloudDim: 0.3,
    cloudFill: 1.5,
    precip: 'dust',
    precipRate: 0.9,
    lightning: false,
    celestial: 0.08,
    star: 0.03,
    hazeHeight: 76,
    haze: 2.8,
    mountain: 0.28,
    tint: { color: [198, 164, 108], amount: 0.38 },
  },
  // 大风：天色变化不大，主要是"看得见风"——云跑得快、气流线明显
  wind: {
    label: '大风',
    overcast: 0.26,
    dim: 0.96,
    clouds: 3,
    cloudDim: 0.14,
    cloudFill: 1.35,
    precip: 'none',
    precipRate: 0,
    lightning: false,
    celestial: 0.6,
    star: 0.35,
    hazeHeight: 50,
    haze: 1.5,
    mountain: 0.8,
    gust: 2.4,
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
type CloudDepth = 'far' | 'mid' | 'near';

interface CloudLayerConfig {
  depth: CloudDepth;
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
    // blur 是滚动时最贵的一项（整层光栅化），半径减半后朦胧感几乎不变
    blur: 1,
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
    blur: 0.35,
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

/**
 * 滚动视差的消费者。
 *
 * 以前每帧把 `--sky-scroll` / `--sky-ground` 写在背景根元素上，靠 CSS calc 换算。
 * 但自定义属性是**继承**的：改一次就要让整棵子树（3 个云层 + 21 朵云 + 星空 +
 * 日月 + 3 条山脊 + 阵风…约 40 个元素）全部重算样式，这是滚动掉帧的主因。
 * 现在改成 JS 直接给这几个元素写 transform / opacity，收益：
 *   · 失效范围从"整棵子树"缩到这 5 个元素本身
 *   · 属性是 transform（只走合成，不触发布局）而不是 top/left
 */
interface ScrollTarget {
  el: HTMLElement;
  /** 视差系数（乘滚动距离，正值表示比页面滚得慢） */
  parallax: number;
  /** 接近地面时额外上浮的距离（px） */
  rise: number;
  /** 基础不透明度 */
  opacity: number;
  /** 是否还要再乘星空当前 alpha（星空有自己的淡入淡出） */
  star: boolean;
  /** 上次写入的位移与不透明度：变化太小就不写，省掉慢速滚动时的样式重算 */
  lastTy: number;
  lastOpacity: number;
}

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

/**
 * 远景山脉：三层山脊，越远越高越淡（大气透视）。
 *
 * 轮廓不是手画的，而是程序化生成的地形剖面，具备真实山脉的几个关键特征：
 *   · 分形自相似  —— Musgrave 脊状多重分形（8/7/6 个八度，Hurst 0.80–0.90）
 *   · 尖脊宽谷    —— 脊状噪声的尖峰 + 幂律提峰，山脊窄、谷地宽
 *   · 山脊线弯曲  —— 三层域扭曲，峰谷不等距
 *   · 山脉群非均匀 —— 多峰高斯包络 + 低频调制，加上底噪让山脉横向连续
 *   · 坡度各向异性 —— 整体倾斜 + 按平滑场做的剪切，山坡两侧不对称
 *   · 树枝状沟谷  —— 最深局部极小处扣高斯谷 + 一维水流侵蚀（A^m·S^n）
 *   · 休止角      —— 热力侵蚀（碎石坡）+ Lipschitz 包络投影，杜绝近垂直的壁
 *
 * 生成脚本见 tools/gen_mountains.py（同一套参数可复现）。
 * viewBox 1200×660 与容器实际渲染比例接近（约 1.27× / 1.2×），不会被拉伸变形；
 * 底部用一段平底收口，保证与地面衔接处不出缝。
 */
const MOUNTAIN_RIDGES: readonly { depth: 'far' | 'mid' | 'near'; d: string }[] = [
  {
    depth: 'far',
    d: 'M0 660 L0 280.668 C3.9 280.6 6.0 281.1 11.802 280.594 C17.6 280.1 14.3 280.5 17.4029 279.166 C20.5 277.8 17.9 281.2 21.0035 276.586 C24.1 271.9 23.2 265.8 26.8045 265.218 C30.4 264.6 29.3 270.9 31.8053 274.705 C34.3 278.6 29.4 275.6 34.4057 276.767 C39.4 278.0 39.8 278.7 46.8078 278.259 C53.8 277.9 51.2 278.2 55.4092 275.56 C59.6 273.0 53.5 272.9 59.4099 270.487 C65.3 268.1 60.8 273.3 73.2122 268.435 C85.6 263.6 84.5 260.1 96.6161 255.908 C108.7 251.7 103.4 257.1 109.418 255.779 C115.4 254.5 112.0 254.9 114.619 252.027 C117.3 249.1 112.4 259.4 117.42 247.061 C122.5 234.7 124.6 222.6 129.822 214.862 C135.0 207.2 131.3 221.2 133.022 223.948 C134.8 226.7 133.8 222.3 135.023 223.25 C136.3 224.2 132.7 225.9 136.823 226.831 C141.0 227.7 142.5 227.5 147.425 225.908 C152.4 224.3 148.6 227.7 151.625 222.157 C154.6 216.6 152.8 213.6 156.426 209.201 C160.1 204.8 158.6 210.0 162.627 209.003 C166.6 208.1 165.6 207.9 168.428 206.345 C171.3 204.8 169.2 206.9 171.229 204.397 C173.2 201.9 172.4 198.2 174.429 198.761 C176.5 199.3 175.5 203.3 177.43 206.061 C179.4 208.8 175.9 206.8 180.23 207.077 C184.6 207.4 182.6 208.5 190.432 206.908 C198.2 205.3 197.6 205.0 203.634 202.316 C209.6 199.6 205.3 204.1 208.435 198.781 C211.6 193.5 210.5 189.9 213.036 186.476 C215.6 183.1 212.4 181.0 216.036 188.549 C219.6 196.1 219.4 201.8 223.837 209.145 C228.2 216.4 225.3 213.6 229.238 210.46 C233.2 207.4 232.0 207.7 235.639 199.819 C239.3 191.9 236.8 193.9 240.24 186.711 C243.6 179.5 240.2 191.1 245.841 178.241 C251.5 165.3 251.3 161.7 257.243 148.006 C263.2 134.3 255.6 157.3 263.644 137.034 C271.6 116.7 271.5 93.6 281.247 87.1473 C291.0 80.7 287.8 108.6 292.849 117.702 C297.9 126.8 292.2 124.1 296.449 114.525 C300.7 104.9 300.6 97.5 305.451 88.8467 C310.3 80.2 292.5 42.7 311.052 88.5329 C329.6 134.3 340.8 174.0 361.06 226.276 C381.3 278.5 364.1 233.0 371.862 245.298 C379.7 257.6 378.7 255.9 384.464 263.252 C390.2 270.6 385.6 266.5 389.065 267.393 C392.5 268.3 390.6 266.3 394.866 265.842 C399.1 265.4 395.8 255.6 401.867 266.058 C407.9 276.6 404.5 279.7 413.069 297.347 C421.6 315.0 419.9 312.2 427.471 319.023 C435.1 325.9 430.4 321.0 435.873 317.934 C441.3 314.8 439.6 314.7 443.874 309.755 C448.1 304.8 444.6 312.0 448.675 303.166 C452.7 294.4 450.7 290.5 456.076 283.395 C461.5 276.3 459.5 286.1 464.877 281.904 C470.2 277.7 468.3 271.6 472.079 270.675 C475.9 269.7 473.1 275.7 476.279 279.091 C479.5 282.5 478.1 280.5 481.68 280.865 C485.3 281.2 483.8 279.7 487.081 280.158 C490.3 280.6 483.5 281.3 491.482 282.246 C499.5 283.1 503.0 283.3 511.085 282.85 C519.2 282.4 512.3 281.3 515.886 280.838 C519.5 280.4 518.8 281.9 521.887 281.398 C525.0 280.9 523.5 281.8 525.288 279.251 C527.1 276.7 526.3 275.6 527.288 273.796 C528.3 272.0 527.1 271.4 528.288 273.866 C529.5 276.3 528.4 276.3 530.888 281.241 C533.4 286.1 531.2 277.5 535.889 288.579 C540.6 299.6 539.1 300.6 545.091 314.353 C551.1 328.1 547.0 324.7 553.892 329.753 C560.8 334.8 559.6 332.5 565.694 329.571 C571.8 326.6 568.2 323.1 572.295 320.939 C576.4 318.8 571.7 322.8 578.096 323.158 C584.5 323.5 577.0 328.3 591.499 321.943 C606.0 315.6 599.4 314.6 621.504 304.118 C643.6 293.6 643.8 296.5 657.91 290.483 C672.0 284.4 660.6 289.3 663.911 285.943 C667.2 282.6 661.6 283.7 667.911 280.545 C674.2 277.4 676.9 276.5 682.914 276.608 C688.9 276.7 680.5 267.3 685.914 280.762 C691.3 294.2 692.8 303.4 699.117 316.932 C705.4 330.5 698.6 320.0 704.717 321.468 C710.8 323.0 710.9 322.8 717.32 321.388 C723.7 320.0 719.1 324.2 723.921 317.165 C728.7 310.1 725.9 315.1 731.722 300.28 C737.6 285.4 736.7 282.9 741.524 272.673 C746.3 262.4 742.7 275.4 746.124 269.592 C749.6 263.8 748.5 261.3 751.925 255.281 C755.4 249.2 751.0 264.1 756.526 251.427 C762.1 238.8 764.3 229.1 768.528 217.389 C772.8 205.7 768.1 215.7 769.328 216.387 C770.6 217.1 768.5 222.3 772.329 219.539 C776.1 216.8 774.2 219.8 780.73 208.164 C787.3 196.6 784.3 199.2 791.932 184.765 C799.6 170.3 797.3 177.5 803.734 164.887 C810.2 152.3 798.4 182.5 811.335 146.893 C824.3 111.3 828.6 87.6 842.54 58 C856.5 28.4 848.6 55.5 853.142 58.0619 C857.7 60.7 853.3 60.4 856.143 65.7814 C859.0 71.1 858.5 71.7 861.744 74.0701 C865.0 76.4 863.9 74.8 865.944 72.8875 C868.0 71.0 866.0 69.8 867.945 68.2877 C869.9 66.8 868.9 67.6 871.745 68.2877 C874.5 68.9 871.3 65.6 876.346 70.2128 C881.4 74.8 879.0 76.3 886.948 82.004 C894.9 87.7 891.8 74.4 900.15 87.2842 C908.5 100.1 904.3 102.4 911.952 120.519 C919.6 138.6 914.6 127.8 923.154 141.608 C931.7 155.4 930.2 153.4 937.556 161.906 C944.9 170.4 941.2 165.4 945.158 167.183 C949.1 169.0 944.7 162.7 949.358 167.313 C954.0 172.0 954.6 177.2 959.16 181.139 C963.7 185.1 961.0 181.8 962.96 179.058 C965.0 176.3 963.8 173.5 965.161 172.8 C966.6 172.1 965.5 176.1 967.161 177.024 C968.8 178.0 968.6 177.2 970.162 175.66 C971.8 174.1 969.8 169.4 971.962 172.32 C974.1 175.3 974.2 180.1 976.563 184.543 C978.9 189.0 977.6 183.9 978.963 185.644 C980.3 187.4 979.0 187.6 980.563 189.923 C982.1 192.3 978.7 189.8 983.564 192.624 C988.4 195.4 985.4 195.1 995.166 198.335 C1004.9 201.6 1002.7 201.2 1012.77 202.38 C1022.8 203.6 1018.0 203.3 1025.37 201.884 C1032.8 200.5 1028.9 201.3 1034.97 198.123 C1041.0 194.9 1040.0 195.6 1043.57 192.308 C1047.1 189.0 1044.0 189.8 1045.57 188.128 C1047.1 186.5 1045.8 191.6 1048.17 187.359 C1050.6 183.1 1050.2 178.4 1052.78 175.491 C1055.3 172.6 1053.0 177.4 1055.78 178.548 C1058.5 179.7 1058.0 181.6 1060.98 179.063 C1063.9 176.5 1062.7 172.7 1064.58 170.985 C1066.4 169.3 1064.4 172.9 1066.58 173.991 C1068.7 175.0 1068.3 175.7 1070.98 174.123 C1073.6 172.5 1072.2 168.4 1074.58 169.134 C1076.9 169.9 1075.4 174.4 1077.98 176.354 C1080.6 178.3 1080.3 176.9 1082.38 175.112 C1084.4 173.4 1081.4 167.2 1084.18 171.112 C1087.0 175.0 1084.8 178.8 1090.78 186.878 C1096.7 194.9 1094.8 192.3 1101.98 195.278 C1109.2 198.2 1106.1 196.2 1112.39 195.757 C1118.7 195.4 1116.5 195.9 1120.79 194.07 C1125.1 192.2 1122.7 193.5 1125.19 190.196 C1127.7 186.9 1125.9 184.5 1128.19 184.087 C1130.5 183.7 1127.1 187.8 1132.19 188.984 C1137.3 190.1 1136.5 178.9 1143.39 187.521 C1150.3 196.1 1147.1 201.3 1152.99 214.717 C1158.9 228.1 1157.8 223.3 1161.19 227.788 C1164.6 232.3 1160.7 225.0 1163.19 228.114 C1165.7 231.3 1165.2 238.1 1168.79 237.202 C1172.4 236.3 1170.0 222.9 1174 225.329 C1178.0 227.7 1177.3 238.3 1180.8 244.372 C1184.3 250.4 1181.9 242.8 1184.4 243.416 C1186.9 244.1 1186.2 246.1 1188.4 246.311 C1190.6 246.5 1187.1 237.5 1191 243.953 C1194.9 250.4 1197.0 258.4 1200 265.696 L1200 660 Z',
  },
  {
    depth: 'mid',
    d: 'M0 660 L0 414.201 C6.2 420.6 10.5 425.9 18.6031 433.419 C26.7 440.9 20.3 435.2 24.204 436.729 C28.1 438.2 24.5 437.5 30.205 437.912 C35.9 438.3 35.9 438.5 41.4069 437.836 C46.9 437.2 39.9 442.2 46.8078 436.006 C53.7 429.9 55.4 426.0 62.2104 419.396 C69.0 412.8 64.1 417.2 67.2112 416.188 C70.3 415.2 66.9 415.0 71.6119 416.31 C76.3 417.7 74.1 423.2 81.4136 420.252 C88.7 417.3 86.1 414.4 93.4156 407.476 C100.7 400.6 96.4 406.4 103.217 399.586 C110.0 392.8 101.9 409.6 113.819 386.989 C125.8 364.3 126.2 354.2 139.023 331.629 C151.8 309.1 143.3 328.7 152.225 319.277 C161.2 309.9 157.9 316.4 165.828 303.498 C173.8 290.6 163.0 288.2 176.029 280.592 C189.1 273.0 192.2 276.8 205.034 280.592 C217.9 284.4 208.2 288.9 214.636 291.905 C221.0 294.9 219.4 291.2 224.237 289.53 C229.0 287.8 225.8 289.4 229.038 286.821 C232.2 284.2 228.9 290.7 233.839 281.719 C238.8 272.7 239.0 267.6 243.841 259.883 C248.7 252.2 245.6 261.9 248.441 258.541 C251.3 255.1 247.5 245.5 252.442 249.659 C257.4 253.8 256.4 262.5 263.244 271.049 C270.1 279.6 268.4 275.6 273.046 275.32 C277.6 275.0 272.5 279.1 277.046 270.086 C281.6 261.1 282.0 257.6 286.648 248.277 C291.3 238.9 288.4 241.5 291.049 242.017 C293.7 242.5 287.8 239.9 294.649 249.784 C301.5 259.7 304.5 264.2 311.652 271.63 C318.8 279.1 311.4 266.4 316.053 272.112 C320.7 277.8 319.0 281.9 325.654 288.619 C332.3 295.3 330.9 291.0 336.056 292.218 C341.3 293.5 338.1 292.9 341.257 292.411 C344.5 291.9 341.7 290.9 345.658 290.815 C349.7 290.7 348.0 292.3 353.259 292.209 C358.5 292.1 356.8 290.2 361.46 290.431 C366.1 290.7 363.5 292.6 367.261 293.049 C371.1 293.5 369.7 291.4 372.862 291.68 C376.0 292.0 372.7 298.6 376.663 294.019 C380.7 289.4 380.5 283.9 384.864 277.88 C389.3 271.9 386.0 278.7 389.865 276.042 C393.7 273.4 390.1 271.4 396.466 269.877 C402.9 268.3 400.9 271.5 409.068 271.455 C417.3 271.4 416.4 270.6 421.07 269.814 C425.7 269.0 421.3 271.2 423.071 268.965 C424.8 266.8 422.9 261.1 426.271 263.219 C429.7 265.4 429.5 272.1 433.272 275.468 C437.0 278.8 435.2 275.6 437.473 273.292 C439.7 270.9 437.6 270.1 440.073 268.408 C442.5 266.8 437.9 256.0 444.874 268.339 C451.9 280.7 453.7 290.5 461.077 305.361 C468.5 320.3 461.6 314.5 467.078 313.056 C472.5 311.6 470.3 313.5 477.48 301.085 C484.6 288.7 482.8 284.7 488.481 275.835 C494.1 267.0 491.3 275.8 494.482 274.631 C497.7 273.5 495.0 272.9 498.083 272.314 C501.2 271.7 498.2 269.9 503.684 272.768 C509.2 275.6 500.8 254.9 514.486 280.906 C528.2 306.9 532.2 322.9 544.891 350.68 C557.6 378.5 547.0 356.5 552.492 364.319 C558.0 372.1 557.0 374.1 561.494 374.087 C566.0 374.1 563.4 367.5 566.094 364.26 C568.8 361.0 564.2 354.3 569.695 364.218 C575.2 374.1 575.2 379.1 582.697 393.974 C590.2 408.9 587.4 402.0 592.099 408.89 C596.8 415.7 593.8 412.6 596.899 414.555 C600.0 416.5 597.5 412.2 601.5 414.76 C605.5 417.4 603.8 419.1 608.901 422.342 C614.0 425.6 613.1 423.8 616.703 424.556 C620.3 425.3 615.0 428.9 619.703 424.55 C624.4 420.2 615.9 433.9 630.705 411.508 C645.5 389.1 644.5 394.0 664.111 357.379 C683.7 320.7 677.0 320.2 689.515 301.564 C702.0 283.0 695.8 302.3 701.517 301.564 C707.3 300.8 701.6 296.2 706.718 299.233 C711.9 302.3 709.9 304.1 716.919 310.78 C724.0 317.5 720.7 316.0 727.921 319.255 C735.1 322.5 733.1 320.9 738.523 320.444 C744.0 319.9 740.3 314.0 744.324 317.745 C748.4 321.5 747.5 326.0 750.725 331.794 C753.9 337.5 747.7 322.4 753.926 334.99 C760.2 347.6 758.4 359.4 769.528 369.578 C780.7 379.8 775.5 371.2 787.331 365.545 C799.2 359.9 792.1 365.1 805.134 352.612 C818.2 340.1 815.2 343.2 826.538 327.966 C837.9 312.7 829.3 326.6 839.14 306.899 C848.9 287.2 837.5 281.6 855.943 268.882 C874.3 256.2 878.4 262.4 894.349 268.882 C910.3 275.4 897.9 284.7 903.751 288.384 C909.6 292.1 905.8 282.7 911.752 279.894 C917.7 277.0 917.3 280.9 921.554 279.829 C925.8 278.8 916.8 293.3 924.554 276.663 C932.4 260.0 934.7 245.4 944.957 229.835 C955.2 214.2 951.3 231.0 955.359 229.835 C959.4 228.6 954.9 227.9 957.16 226.243 C959.4 224.6 959.7 226.3 962.16 224.937 C964.6 223.5 960.0 231.7 964.561 222.006 C969.2 212.4 970.8 204.6 975.963 196 C981.2 187.4 971.6 179.6 980.163 196.152 C988.8 212.7 992.2 224.9 1001.77 245.734 C1011.3 266.6 1000.1 246.3 1008.77 258.786 C1017.4 271.3 1018.7 274.5 1027.77 283.126 C1036.8 291.8 1028.7 282.0 1035.97 284.75 C1043.2 287.5 1041.7 292.8 1049.57 291.331 C1057.4 289.8 1053.7 287.6 1059.58 280.253 C1065.4 272.9 1060.8 281.4 1067.18 269.206 C1073.6 257.0 1073.5 253.4 1078.78 243.719 C1084.0 234.0 1080.0 244.4 1082.98 240.016 C1086.0 235.6 1084.7 234.0 1087.78 230.539 C1090.8 227.1 1084.9 217.6 1092.18 229.705 C1099.4 241.8 1100.3 251.1 1109.58 266.905 C1118.9 282.7 1114.9 272.6 1120.19 277.096 C1125.5 281.6 1121.2 279.1 1125.39 280.431 C1129.6 281.7 1129.5 280.1 1132.79 281.015 C1136.1 282.0 1133.1 282.6 1135.39 283.293 C1137.7 284.0 1136.7 281.5 1139.59 283.178 C1142.5 284.8 1141.5 286.1 1143.99 288.209 C1146.5 290.3 1144.8 287.2 1147.19 289.401 C1149.6 291.6 1143.2 290.1 1151.19 294.793 C1159.2 299.5 1154.9 300.2 1171.2 303.414 C1187.5 306.6 1190.4 304.1 1200 304.427 L1200 660 Z',
  },
  {
    depth: 'near',
    d: 'M0 660 L0 565.009 C1.7 565.0 2.7 565.8 5.00083 565.031 C7.3 564.2 -4.0 583.9 7.00117 562.623 C18.0 541.3 25.8 521.9 38.0063 501.186 C50.2 480.5 40.9 501.3 43.6073 500.419 C46.3 499.6 43.6 502.0 46.2077 498.641 C48.8 495.3 42.8 499.9 51.4086 490.485 C60.0 481.1 63.5 479.4 72.012 470.529 C80.5 461.6 73.5 467.1 77.0128 463.805 C80.5 460.5 78.6 464.8 82.4137 460.647 C86.2 456.5 82.3 462.8 88.4147 451.406 C94.5 440.0 95.7 435.5 100.617 426.4 C105.5 417.3 99.8 425.7 103.017 424.254 C106.2 422.8 104.2 426.4 110.218 422.078 C116.2 417.8 114.9 409.9 121.02 411.367 C127.2 412.9 125.4 420.8 128.621 426.628 C131.9 432.4 129.5 428.5 130.822 428.798 C132.2 429.1 130.7 426.3 132.622 427.596 C134.6 428.9 132.4 428.9 136.623 432.615 C140.9 436.3 140.4 440.9 145.424 438.799 C150.5 436.7 148.4 431.0 151.825 426.355 C155.2 421.7 152.5 427.6 155.626 424.855 C158.8 422.1 152.6 434.4 161.227 418.032 C169.9 401.6 172.7 392.9 181.63 375.677 C190.6 358.4 184.5 370.4 188.031 366.294 C191.6 362.2 189.6 364.4 192.232 363.389 C194.8 362.4 193.8 364.5 195.833 363.397 C197.8 362.3 195.5 361.1 198.233 360 C201.0 358.9 194.4 344.1 204.034 360.225 C213.6 376.3 217.9 391.9 227.038 408.368 C236.2 424.9 220.4 389.4 231.439 409.752 C242.4 430.1 247.9 445.3 260.043 469.33 C272.2 493.4 262.4 474.4 267.845 481.852 C273.2 489.4 271.4 490.7 276.246 491.825 C281.0 493.0 278.0 491.8 282.247 485.341 C286.5 478.9 285.4 478.0 289.048 472.427 C292.7 466.9 290.2 472.5 293.249 468.624 C296.2 464.7 295.2 464.2 298.05 460.78 C300.9 457.4 295.6 469.7 301.85 458.425 C308.1 447.2 311.4 437.6 316.853 427.079 C322.3 416.6 311.7 414.3 318.253 426.956 C324.8 439.6 328.1 450.0 336.456 465.042 C344.9 480.1 340.0 469.1 343.457 471.982 C346.9 474.8 343.3 473.1 346.858 473.631 C350.4 474.2 349.3 477.6 354.059 473.631 C358.9 469.7 355.5 459.8 361.26 461.714 C367.0 463.7 366.3 476.4 371.262 479.517 C376.3 482.6 370.6 473.4 376.263 470.928 C381.9 468.5 376.1 455.5 388.265 472.153 C400.4 488.8 403.3 504.7 412.669 520.954 C422.0 537.2 409.5 509.3 416.269 520.967 C423.1 532.7 425.7 542.8 433.072 556.106 C440.4 569.4 435.0 558.8 438.273 560.995 C441.5 563.2 440.7 562.2 442.874 562.828 C445.1 563.5 435.3 581.4 444.874 562.925 C454.4 544.5 457.7 535.0 471.479 507.438 C485.3 479.9 475.2 496.0 486.281 480.229 C497.3 464.5 496.1 470.9 504.684 460.239 C513.2 449.6 507.7 451.0 511.885 448.288 C516.1 445.6 511.3 443.5 517.286 452.126 C523.3 460.8 523.6 468.1 529.888 474.245 C536.2 480.3 531.2 474.9 536.089 470.429 C541.0 466.0 536.0 474.8 544.691 460.925 C553.4 447.1 550.5 439.6 562.094 428.864 C573.7 418.2 559.3 399.2 579.497 428.864 C599.7 458.5 602.8 479.8 622.704 517.727 C642.6 555.7 626.6 526.7 639.307 542.794 C652.0 558.9 647.8 565.7 660.71 566 C673.6 566.3 665.4 562.9 677.913 543.778 C690.4 524.7 672.4 559.8 698.116 508.715 C723.8 457.6 726.7 429.9 754.926 390.574 C783.1 351.3 771.1 390.0 782.73 390.88 C794.4 391.8 782.0 381.0 789.932 393.243 C797.9 405.5 795.1 407.5 806.534 427.719 C817.9 447.9 815.6 448.5 824.137 453.762 C832.7 459.0 817.7 471.4 832.139 443.433 C846.6 415.4 853.1 394.1 867.545 369.811 C881.9 345.5 868.3 361.1 875.346 370.601 C882.3 380.1 881.3 385.4 888.548 398.168 C895.8 410.9 890.2 405.2 897.15 408.772 C904.1 412.3 899.5 419.9 909.352 408.758 C919.2 397.6 917.6 386.5 926.754 375.43 C936.0 364.3 927.2 362.2 936.956 375.43 C946.7 388.6 947.0 401.7 955.959 414.995 C965.0 428.3 952.3 396.4 963.961 415.296 C975.6 434.2 980.8 452.9 990.965 471.792 C1001.1 490.7 983.0 450.5 994.366 472.035 C1005.8 493.6 1011.8 512.2 1025.17 536.504 C1038.6 560.8 1030.2 541.7 1034.57 545.036 C1039.0 548.4 1036.7 546.7 1038.37 546.464 C1040.0 546.3 1023.3 578.2 1039.57 544.462 C1055.8 510.7 1070.2 479.4 1087.18 445.266 C1104.2 411.1 1086.8 443.1 1090.58 442.021 C1094.3 440.9 1092.6 448.5 1098.38 441.982 C1104.1 435.4 1099.4 428.9 1107.78 422.371 C1116.2 415.8 1105.1 395.5 1123.59 422.371 C1142.1 449.3 1146.7 471.1 1163.39 503.033 C1180.1 534.9 1161.6 503.1 1173.8 518.104 C1186.0 533.1 1191.3 538.1 1200 548.039 L1200 660 Z',
  },
];

/**
 * 山脉的三层排布。
 *
 * 以前整座山锚在页脚的地表线上，只在快滚到底时才露出来 —— 既"贴着页脚"，
 * 又因为没有远近视差而像一张贴在屏幕上的图。现在改成普通的背景层：
 * 三层各自定在地平线附近，越远的山越高、走得越慢。
 *
 * baseline 是山脚（填充区顶边）所在的视口高度比例；
 * height 是山脊剪影本身的高度（viewBox 660 会被压到这个高度，所以三层都是
 * "宽而低"的远景轮廓，横向约 1.27×、纵向压缩，符合远山的实际观感）。
 *
 * parallax 刻意比云朵小（云是 0.05 / 0.10 / 0.18）：山比云远得多，
 * 视差必须更小才符合直觉 —— 远山几乎不动，近处的丘陵才跟得上一点。
 */
interface MountainLayerConfig {
  depth: 'far' | 'mid' | 'near';
  /** 山脊剪影高度 = 视口高度 × 该比例 */
  height: number;
  /** 山脚所在的视口高度比例 */
  baseline: number;
  /** 滚动视差系数（越小越远） */
  parallax: number;
}

const MOUNTAIN_LAYERS: readonly MountainLayerConfig[] = [
  { depth: 'far', height: 0.4, baseline: 0.78, parallax: 0.012 },
  { depth: 'mid', height: 0.32, baseline: 0.86, parallax: 0.022 },
  { depth: 'near', height: 0.24, baseline: 0.94, parallax: 0.035 },
];

/**
 * 视差位移的上限（视口高度的比例）。
 *
 * 山是固定背景层，位移会随滚动一直累积；不封顶的话长页面上近景丘陵
 * 会一路爬到屏幕中间去。封顶之后远山始终贴在地平线附近。
 */
const MOUNTAIN_MAX_DRIFT = 0.14;
/** 触发阵风特效的风级阈值（蒲福 6 级 = 强风） */
const GUST_WIND_LEVEL = 6;

/** 闪电：一条主干 + 两个分叉，简笔勾线的风格与云朵一致 */
const LIGHTNING_PATH = 'M32 4 L18 78 L34 76 L14 132 L30 128 L8 196 L26 118 L12 120 L28 66 L14 68 Z';

const SUN_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="11" /></svg>`;
/**
 * 月亮的两种画法：
 *   - 默认（`moonSvg()`）：经典月牙，用于拿不到农历时（接口失败 / 还没返回）
 *   - 按相位（`moonSvg(phase)`）：由农历日推算的真实月相
 */
const MOON_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M23 5 A16 16 0 1 0 37 21 A13 13 0 1 1 23 5 Z" /></svg>`;

/**
 * 按月相生成月亮 SVG。
 *
 * 画法是「整圆 + 明暗界线」：亮部由一段半圆弧（外缘）加一段椭圆弧（明暗界线）
 * 围成，椭圆的横半径 = R·|cos(2πp)| —— 蛾眉月时椭圆接近整圆（亮部只剩一牙），
 * 上弦月时椭圆退化为直径（正好半个亮面），满月时椭圆反向铺满（整个圆都亮）。
 * 亏月（p > 0.5）是盈月的水平镜像。
 *
 * 暗面用一层极淡的同心圆表示（"地照"，新月时能看到月盘轮廓），
 * 比直接留空更真实，也避免新月时月亮彻底消失、像是没画出来。
 *
 * @param phase 0 = 新月，0.5 = 满月，1 = 下一个新月；传 null 用默认月牙
 */
function moonSvg(phase: number | null): string {
  if (phase == null || !Number.isFinite(phase)) return MOON_SVG;

  const R = 15;
  const cx = 20;
  const cy = 20;
  const top = cy - R;
  const bottom = cy + R;

  // 归一到「盈月半边」再镜像，盈亏共用一套参数
  const waxing = phase < 0.5;
  const mirrored = !waxing;
  // cos 在 p 与 1-p 下相同，可直接用原相位计算椭圆半径
  const rx = Math.max(0.001, R * Math.abs(Math.cos(2 * Math.PI * phase)));
  /*
   * 第二段弧的 sweep 决定亮面是"胖"还是"瘦"：
   *   sweep2 = 0 → 椭圆弧也走右侧，与半圆弧之间是**细月牙**（亮面 < 半圆）
   *   sweep2 = 1 → 椭圆弧绕到左侧，围出右半圆加半个椭圆（亮面 > 半圆）
   * 所以蛾眉月（亮面不足半圆）取 0、盈凸月取 1 —— 写成反的话
   * "初四"会画成一个几乎全亮的圆盘，"十五"反而是全黑的。
   */
  const p2 = waxing ? phase : 1 - phase;
  const sweep2 = p2 < 0.25 ? 0 : 1;

  const lit =
    `M${cx} ${top} A${R} ${R} 0 0 1 ${cx} ${bottom} ` +
    `A${rx.toFixed(3)} ${R} 0 0 ${sweep2} ${cx} ${top} Z`;

  const flip = mirrored ? ` transform="translate(${2 * cx} 0) scale(-1 1)"` : '';
  return (
    `<svg viewBox="0 0 40 40" aria-hidden="true">` +
    `<circle cx="${cx}" cy="${cy}" r="${R}" class="moon-dark" />` +
    `<g${flip}><path d="${lit}" class="moon-lit" /></g>` +
    `</svg>`
  );
}

/** 当前农历对应的月相；没有农历时返回 null（月亮用默认月牙） */
function currentMoonPhase(): number | null {
  const lunar = getLunar();
  return lunar ? moonPhase(lunar.lunarDay) : null;
}

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
  // 必须夹到 0–255：天气的 dim 系数大于 1（雪天反照）时会算出 270 这类越界值，
  // 浏览器虽会自己夹紧，但写进 CSS 的就不是合法颜色了。
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  const [r, g, b] = [ch(rgb[0]), ch(rgb[1]), ch(rgb[2])];
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

let reducedMotion = false;
let reducedMotionBound = false;

/**
 * 是否偏好减少动效。
 * 结果缓存起来：滚动时每帧都会问一次，而 `matchMedia` 并不便宜。
 */
function prefersReducedMotion(): boolean {
  if (!reducedMotionBound && typeof window.matchMedia === 'function') {
    reducedMotionBound = true;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    mq.addEventListener?.('change', (e) => {
      reducedMotion = e.matches;
    });
  }
  return reducedMotion;
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
  // 霾/沙尘的"黄"抽色表达不出来，tint 放在最后单独染一层。
  // 云也要染：否则沙尘天会出现"黄天 + 灰白净云"，看着很假。
  const sky = (c: RGB, k = w.dim): RGB => {
    const d = dim(overcast(c), k);
    return w.tint ? mix(d, w.tint.color, w.tint.amount) : d;
  };

  return {
    top: sky(base.top),
    mid: sky(base.mid),
    bottom: sky(base.bottom),
    glow: sky(base.glow),
    // 云比天空更"吃"天气：雨云要明显沉下去，但别沉成纯黑
    cloud: sky(base.cloud, 1 - w.cloudDim),
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
  /** 当前月亮画的是哪个相位；只在相位真变了时才重建 SVG */
  private moonPhase: number | null = null;
  /** 农历订阅句柄（destroy 时解绑） */
  private unsubLunar: (() => void) | null = null;
  /** 降水（雨 / 雪 / 雨夹雪）：独立 canvas，与星空分开便于各自控制强度 */
  private precipCanvas: HTMLCanvasElement | null = null;
  private precipCtx: CanvasRenderingContext2D | null = null;
  private drops: Drop[] = [];
  /** 三层远景山，各自独立视差（见 MountainLayerConfig） */
  private mountainLayers: { el: HTMLElement; parallax: number; lastTy: number }[] = [];
  /** 滚动视差的消费者（云层 / 星空 / 日月），见 ScrollTarget */
  private scrollTargets: ScrollTarget[] = [];
  /** 上一次写入的滚动状态，用来在值没变时跳过样式写入 */
  private lastScrollY = Number.NaN;
  private lastGround = Number.NaN;
  private lastStarAlpha = Number.NaN;
  /** 阵风：大风时才出现的横向气流线 */
  private gustsEl: HTMLElement | null = null;
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

  /** 当前降水强度 0 → 1，平滑逼近目标，切换天气时不会突然出现/消失 */
  private precipAlpha = 0;
  private precipTarget = 0;
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
  /** 观察文档高度变化：页脚插入、统计加载、SPA 导航都会让"地面在哪"失效 */
  private bodyObserver: ResizeObserver | null = null;
  private started = false;
  /** 地面顶边的文档坐标（缓存，避免滚动时每帧回流） */
  private groundTopDoc = 0;
  /**
   * 地表线（土层顶边）的文档坐标。
   * 地面元素顶边到土层顶边之间还隔着草丛与丘线的高度，
   * 拿元素顶边当基准会让山脚悬在半空 —— 山脉必须对齐这条真正的地平线。
   */

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
      // 天气现象没变、但风力变了（或首次拿到数据）：只更新云速与阵风
      else this.applyWind();
    });
    if (this.weatherMode === 'auto') void ensureWeather();

    // 订阅农历：月相由农历日推算，拿到后重画月亮。
    // 月亮是纯装饰，拿不到就用默认月牙，不影响其它部分。
    this.unsubLunar = subscribeLunar(() => this.applyMoonShape());
    void ensureLunar();

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
      this.precipAlpha = 0;
      this.precipTarget = 0;
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
  /**
   * 按当前农历重画月亮。
   *
   * 只在相位真的变了时才重建 SVG —— 农历一天才变一次，而这个方法会被
   * subscribeLunar 在每次数据到达时调用（含重复回传同一份数据）。
   */
  private applyMoonShape(): void {
    if (!this.moonEl) return;
    const next = currentMoonPhase();
    // 相位差 < 0.5% 视为没变：农历日相同就一定是同一个值，这里只是防浮点抖动
    if (next != null && this.moonPhase != null && Math.abs(next - this.moonPhase) < 0.005) return;
    if (next == null && this.moonPhase == null) return;
    this.moonPhase = next;
    this.moonEl.innerHTML = moonSvg(next);
  }

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
    this.unsubLunar?.();
    this.unsubLunar = null;
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
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
    this.scrollTargets.push({
      el: starsWrap,
      parallax: 0.022,
      rise: 26,
      opacity: 1,
      star: true,
      lastTy: Number.NaN,
      lastOpacity: Number.NaN,
    });

    const celestialWrap = document.createElement('div');
    celestialWrap.className = 'sky-celestial-ground';
    const sun = document.createElement('div');
    sun.className = 'sky-celestial sky-celestial--sun';
    sun.innerHTML = SUN_SVG;
    const moon = document.createElement('div');
    moon.className = 'sky-celestial sky-celestial--moon';
    // 农历可能已在缓存里（当天取过），直接画出真实月相；否则用默认月牙，
    // 等 ensureLunar() 回来再换
    this.moonPhase = currentMoonPhase();
    moon.innerHTML = moonSvg(this.moonPhase);
    celestialWrap.appendChild(sun);
    celestialWrap.appendChild(moon);
    root.appendChild(celestialWrap);
    this.scrollTargets.push({
      el: celestialWrap,
      parallax: 0.035,
      rise: 44,
      opacity: 1,
      star: false,
      lastTy: Number.NaN,
      lastOpacity: Number.NaN,
    });
    this.sunEl = sun;
    this.moonEl = moon;

    const haze = document.createElement('div');
    haze.className = 'sky-haze';
    root.appendChild(haze);

    // 图层顺序 = 绘制顺序（同一个层叠上下文里，后面的盖住前面的）：
    //   远景云 → 中景云 → 【山脉】 → 近景云 → 降水 → 阵风 → 闪电
    // 山脉插在中景与近景之间，于是中景/远景的云在山后、近景的云在山前。
    this.buildCloudLayers(root, ['far', 'mid']);
    this.buildMountains(root);
    this.buildCloudLayers(root, ['near']);

    // 降水在近景云之后：雨雪从云底落下来，应该盖住云而不是被云盖住
    const precipCanvas = document.createElement('canvas');
    precipCanvas.className = 'sky-precip';
    root.appendChild(precipCanvas);
    this.precipCanvas = precipCanvas;
    this.precipCtx = precipCanvas.getContext('2d');

    this.buildGusts(root);

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

  /**
   * 三层远景山。每层是独立定位 + 独立视差的元素，而不是一整块跟着地面走。
   *
   * 每层由两部分组成：上方的山脊剪影（SVG）+ 下方一块实心填充。
   * 填充必须一直延伸到视口以下 —— 否则视差把整层往上推时会从下边缘露出天空。
   */
  private buildMountains(root: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'sky-mountains';

    for (const layer of MOUNTAIN_LAYERS) {
      const ridge = MOUNTAIN_RIDGES.find((r) => r.depth === layer.depth);
      if (!ridge) continue;

      const el = document.createElement('div');
      el.className = `sky-ridge-layer sky-ridge-layer--${layer.depth}`;
      el.dataset.depth = layer.depth;
      el.innerHTML =
        `<svg class="sky-ridge" viewBox="0 0 1200 660" preserveAspectRatio="none" aria-hidden="true">` +
        `<path d="${ridge.d}" /></svg>` +
        `<span class="sky-ridge-fill"></span>`;
      wrap.appendChild(el);
      this.mountainLayers.push({ el, parallax: layer.parallax, lastTy: Number.NaN });
    }

    root.appendChild(wrap);
    this.layoutMountains();
  }

  /**
   * 山脊的纵向位置与高度只跟视口尺寸有关，滚动时不变 —— 所以在 build / resize
   * 时算一次写进样式，滚动帧里只改 transform。
   */
  private layoutMountains(): void {
    const vh = window.innerHeight;
    for (let i = 0; i < this.mountainLayers.length; i += 1) {
      const cfg = MOUNTAIN_LAYERS[i];
      if (!cfg) continue;
      const height = Math.round(vh * cfg.height);
      const el = this.mountainLayers[i].el;
      el.style.setProperty('--ridge-h', `${height}px`);
      // 山脚落在 baseline 处，所以山脊整体要往上抬一个自身的高度
      el.style.top = `${Math.round(vh * cfg.baseline - height)}px`;
      // 尺寸变了，缓存的位移也要重算
      this.mountainLayers[i].lastTy = Number.NaN;
    }
  }

  /** 阵风：几条横向掠过的气流线，只在大风时出现（可见度由 JS 控制） */
  private buildGusts(root: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'sky-gusts';
    const rand = mulberry32(20261018);
    for (let i = 0; i < 6; i += 1) {
      const gust = document.createElement('span');
      gust.className = 'sky-gust';
      const duration = lerp(2.4, 5.6, rand());
      gust.style.top = `${lerp(6, 78, rand()).toFixed(1)}%`;
      gust.style.width = `${lerp(16, 34, rand()).toFixed(1)}%`;
      gust.style.setProperty('--gust-duration', `${duration.toFixed(2)}s`);
      gust.style.setProperty('--gust-delay', `-${(rand() * duration).toFixed(2)}s`);
      gust.style.setProperty('--gust-scale', lerp(0.6, 1.5, rand()).toFixed(2));
      wrap.appendChild(gust);
    }
    root.appendChild(wrap);
    this.gustsEl = wrap;
  }

  private buildCloudLayers(root: HTMLElement, depths: readonly CloudDepth[]): void {
    const rand = mulberry32(20260222);
    const narrow = window.innerWidth < 768;
    const scale = narrow ? 0.7 : 1;

    for (const layer of CLOUD_LAYERS) {
      if (!depths.includes(layer.depth)) continue;
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
      this.scrollTargets.push({
        el,
        parallax: layer.parallax,
        rise: layer.rise,
        opacity: layer.opacity,
        star: false,
        lastTy: Number.NaN,
        lastOpacity: Number.NaN,
      });
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

    const precipCanvas = this.precipCanvas;
    if (precipCanvas) {
      precipCanvas.width = Math.round(w * dpr);
      precipCanvas.height = Math.round(h * dpr);
      const ctx = this.precipCtx;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.buildStars(w, h);
    this.buildDrops(w, h);
  }

  /**
   * 降水粒子池按最大强度一次性建好，绘制时只取前 N 个 ——
   * 切换天气（雨 ↔ 雪 ↔ 雨夹雪）不必重建粒子，也不会因为反复分配造成 GC 抖动。
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
    root.style.setProperty('--sky-haze-opacity', Math.min(1, 0.32 * profile.haze).toFixed(3));
    root.style.setProperty('--sky-haze-height', `${profile.hazeHeight}%`);
    root.dataset.phase = this.phase;
    root.dataset.weather = weather;
    root.dataset.theme = theme;
    root.dataset.cloudTier = String(profile.clouds);

    // 山脉：大气透视 —— 越远越淡越接近天色，越近越沉。
    // 颜色由当前天色算出，所以黄昏的山是暖的、夜晚的山是墨蓝的，不会是同一块灰。
    //
    // 全部用**不透明**色表达"淡"和"远"，不能用 alpha：
    // 半透明的近景山盖不住它后面的远山与云，层叠关系会整个乱掉
    // （远山从近山底下透出来，云也穿山而过）。
    // 所以"远"改成把山色向天色混合，"被水汽糊掉"改成可见度越低越向天色靠拢 ——
    // 视觉上一样是融入天色，但物理上仍然是一块实心，遮挡关系正确。
    const ink: RGB = theme === 'dark' ? [6, 7, 14] : [46, 52, 66];
    const vis = profile.mountain;
    const ridge = (skyRef: RGB, depth: number): RGB => mix(skyRef, mix(skyRef, ink, depth), vis);
    root.style.setProperty('--mountain-far', toCss(ridge(sky.mid, 0.3)));
    root.style.setProperty('--mountain-mid', toCss(ridge(sky.mid, 0.46)));
    root.style.setProperty('--mountain-near', toCss(ridge(sky.bottom, 0.63)));

    // 星星：目标值交给 rAF 循环平滑逼近（含首次立即到位）
    this.starTarget = this.enabled ? sky.star : 0;
    this.starTintTarget = sky.starTint;
    if (immediate) {
      this.starAlpha = this.starTarget;
      this.starTint = this.starTintTarget;
    }
    root.style.setProperty('--sky-star-alpha', this.starAlpha.toFixed(3));

    // 降水：目标强度，同样交给 rAF 平滑逼近
    this.precipTarget = this.enabled ? profile.precipRate : 0;
    if (immediate) this.precipAlpha = this.precipTarget;

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

    this.applyWind();
    this.measureGround();
    this.updateScroll();
    this.syncStarLoop();
  }

  // ---------- 风力 → 云速 / 阵风 ----------

  /** 真实风级（0–17）；拿不到天气或解析不出风级时为 null */
  private windLevel(): number | null {
    const lv = this.realWeather?.windLevel;
    return typeof lv === 'number' && Number.isFinite(lv) ? lv : null;
  }

  /**
   * 风级 → 云朵飘动速度倍率。
   * 0–2 级基本不动（甚至比默认更慢一点），3 级起明显加快，9 级往上封顶 3 倍 ——
   * 再快就变成"云在飞"，反而不像天空了。
   */
  private windFactor(): number {
    const lv = this.windLevel();
    if (lv === null) return 1;
    // 0–2 级（无风到轻风）保持默认速度：只有"真的起风了"才加速，
    // 否则用户会看到云比设置里的默认值更慢，像是出了 bug。
    const table = [1, 1, 1, 1.15, 1.35, 1.6, 2, 2.4, 2.8, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    const i = Math.max(0, Math.min(table.length - 1, Math.round(lv)));
    return table[i];
  }

  /** 风级 → 0–1 的倾斜量，用来把雨吹斜、把阵风拉长 */
  private windSlant(): number {
    const lv = this.windLevel();
    return lv === null ? 0 : clamp01((lv - 1) / 8);
  }

  /**
   * 把"设置里的云速 × 风力系数"写进 CSS 变量，并决定要不要刮阵风。
   * 单独抽出来：真实天气刷新但天气现象没变时，只更新风速即可，不必整套重算。
   */
  private applyWind(): void {
    const root = this.root;
    if (!root) return;

    const speed = this.readCloudSpeed() * this.windFactor();
    root.style.setProperty('--sky-cloud-speed', speed.toFixed(3));
    // 风大时云不只是走得快，来回摆动的幅度也更大（默认 3%，与改动前一致）
    root.style.setProperty(
      '--sky-drift-range',
      `${(3 * Math.min(2.4, Math.max(1, speed * 0.8))).toFixed(2)}%`,
    );

    const lv = this.windLevel();
    // 天气本身也可以刮风（"大风"档）：即使实测风级不到阈值也该看得见气流线
    const gustBoost = WEATHER_PROFILES[this.effectiveWeather()].gust ?? 1;
    const gusting =
      gustBoost > 1 ||
      (lv !== null && lv >= GUST_WIND_LEVEL && this.enabled && !prefersReducedMotion());
    if (this.gustsEl) {
      this.gustsEl.classList.toggle('is-on', gusting);
      if (gusting) {
        // 6 级刚起风时若隐若现，9 级以上明显到"看得见风"
        const strength =
          lv === null ? clamp01((gustBoost - 1) / 1.4) : clamp01((lv - GUST_WIND_LEVEL + 1) / 4);
        this.gustsEl.style.setProperty(
          '--gust-opacity',
          Math.min(0.9, (0.25 + strength * 0.55) * gustBoost).toFixed(3),
        );
        // 风越大，气流线掠过越快
        this.gustsEl.style.setProperty(
          '--gust-speed',
          ((1 / Math.max(0.28, 1.9 - strength * 1.1)) * Math.min(1.6, gustBoost)).toFixed(3),
        );
      }
    }
  }

  /** 当前云朵飘动速度倍率（供设置面板显示） */
  getCloudSpeed(): number {
    return this.readCloudSpeed();
  }

  /** 设置面板里"云朵飘动速度"那行的说明 */
  getCloudSpeedText(): string {
    const base = this.readCloudSpeed();
    const lv = this.windLevel();
    const wind = this.realWeather?.windPower;
    const total = base * this.windFactor();
    if (lv === null) return `×${total.toFixed(1)}（默认）`;
    return `×${total.toFixed(1)} · ${wind || `${lv}级`}`;
  }

  setCloudSpeed(multiplier: number): void {
    const valid = Number.isFinite(multiplier) ? Math.max(0.25, Math.min(3, multiplier)) : 1;
    storageController.setItem(CONFIG.STORAGE_KEYS.CLOUD_SPEED, String(valid));
    this.applyWind();
  }

  private readCloudSpeed(): number {
    const raw = Number(storageController.getItem(CONFIG.STORAGE_KEYS.CLOUD_SPEED));
    return Number.isFinite(raw) && raw > 0 ? Math.max(0.25, Math.min(3, raw)) : 1;
  }

  // ---------- 滚动视差 / 页脚退场 ----------

  private updateScroll(): void {
    if (!this.root) return;
    const y = scrollDispatcher.getScrollY();
    // ground 量化到 3 位小数：4 位时几乎每帧都在变，白写样式；
    // 3 位（千分之一）对透明度与上浮距离已经完全看不出差别。
    const ground = Math.round(this.groundProgress(y) * 1000) / 1000;
    this.applyScrollTransforms(y, ground);
    this.applyMountainParallax(y);
  }

  /**
   * 把滚动位置直接写进视差消费者，而不是写继承型的 CSS 变量。
   *
   * `--sky-scroll` / `--sky-ground` 挂在背景根元素上，改一次会让整棵子树
   * （约 40 个元素）全部重算样式 —— 滚动掉帧主要就是这么来的。
   * 直接写 transform / opacity 后失效范围只剩这 5 个元素本身，
   * 而且 transform 只走合成，不触发布局。
   *
   * CSS 里仍保留 calc 版本作为无 JS 时的兜底。
   */
  private applyScrollTransforms(y: number, ground: number): void {
    if (this.scrollTargets.length === 0) return;
    // 值没变就整个跳过：静止时（或滚到顶/底之后）一次样式写入都不做
    if (
      y === this.lastScrollY &&
      ground === this.lastGround &&
      this.starAlpha === this.lastStarAlpha
    ) {
      return;
    }
    this.lastScrollY = y;
    this.lastGround = ground;
    this.lastStarAlpha = this.starAlpha;

    const reduced = prefersReducedMotion();
    const fade = 1 - ground;
    for (const t of this.scrollTargets) {
      // 降低动效偏好下不做视差（CSS 里也是 transform: none）
      if (reduced) {
        if (t.lastTy !== 0) {
          t.el.style.transform = 'none';
          t.lastTy = 0;
        }
      } else {
        // 保留 1 位小数即可（视差是几十到几百 px 的量级），
        // 而且刻意避开 String.toFixed —— 每帧十几次调用并不便宜。
        const ty = Math.round((-y * t.parallax - ground * t.rise) * 10) / 10;
        // 位移不到 0.1px 就当没动：慢速滚动时能省掉大部分样式写入
        if (ty !== t.lastTy) {
          t.el.style.transform = `translate3d(0, ${ty}px, 0)`;
          t.lastTy = ty;
        }
      }
      const opacity = Math.round(t.opacity * fade * (t.star ? this.starAlpha : 1) * 1000) / 1000;
      if (opacity !== t.lastOpacity) {
        t.el.style.opacity = String(opacity);
        t.lastOpacity = opacity;
      }
    }
  }

  /**
   * 三层山各自的视差位移。
   *
   * 只写 transform（不触发布局），位移变化小于 0.1px 就不写；
   * 并且封顶，避免长页面上位移无限累积把近景丘陵推到屏幕中间。
   */
  private applyMountainParallax(y: number): void {
    if (this.mountainLayers.length === 0) return;
    const maxDrift = window.innerHeight * MOUNTAIN_MAX_DRIFT;
    const disabled = prefersReducedMotion();
    for (const m of this.mountainLayers) {
      const ty = disabled ? 0 : Math.round(-Math.min(y * m.parallax, maxDrift) * 10) / 10;
      if (ty === m.lastTy) continue;
      m.el.style.transform = ty === 0 ? 'none' : `translate3d(0, ${ty}px, 0)`;
      m.lastTy = ty;
    }
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
    const scroll = window.scrollY || document.documentElement.scrollTop || 0;
    const rect = target.getBoundingClientRect();
    this.groundTopDoc = rect.top + scroll;
  }

  // ---------- 星空循环 ----------

  /** 循环条件：星空闪烁或下雨时才需要 rAF，晴天夜里没星星就完全静止 */
  private syncStarLoop(): void {
    const needsPrecip = this.precipAlpha > 0.01 || this.precipTarget > 0.01;
    const needsStars = this.starAlpha > 0.02 || this.starTarget > 0.02;
    const shouldRun =
      this.enabled && !prefersReducedMotion() && !document.hidden && (needsPrecip || needsStars);

    if (shouldRun && !this.rafId) {
      this.lastDraw = 0;
      this.rafId = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.drawStars(0, true);
      this.drawPrecip(0, 0);
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
    this.precipAlpha += (this.precipTarget - this.precipAlpha) * 0.09;
    // 星空淡入淡出要靠 applyScrollTransforms 落到元素上（不再写根变量）
    if (Number.isFinite(this.lastScrollY)) {
      this.applyScrollTransforms(this.lastScrollY, this.lastGround);
    }

    if (Math.abs(this.starTarget - this.starAlpha) < 0.004) this.starAlpha = this.starTarget;
    if (Math.abs(this.precipTarget - this.precipAlpha) < 0.004) {
      this.precipAlpha = this.precipTarget;
    }

    this.drawStars(time / 1000, false);
    this.drawPrecip(dt, time / 1000);
    this.syncStarLoop();
  };

  /** 当前降水形态；天空关闭时一律不画 */
  private precipKind(): PrecipKind {
    if (!this.enabled) return 'none';
    return WEATHER_PROFILES[this.effectiveWeather()].precip;
  }

  /**
   * 画降水：雨 / 雪 / 雨夹雪共用同一批粒子，只是画法不同。
   *
   * - 雨：斜向的短线，落得快
   * - 雪：缓慢飘落的白点，带左右摆动
   * - 雨夹雪：一半画雪片、一半画雨丝（按粒子下标奇偶分），速度取中间值
   * - 沙尘：几乎不下落，被风横着推的细小沙粒
   *
   * @param dt 本帧经过的秒数（真实经过时间，掉帧时速度不会变慢）
   * @param seconds 累计秒数，用于雪片的摆动相位
   */
  private drawPrecip(dt: number, seconds: number): void {
    const ctx = this.precipCtx;
    const canvas = this.precipCanvas;
    if (!ctx || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const kind = this.precipKind();
    if (kind === 'none' || this.precipAlpha <= 0.01) return;
    const active = Math.round(this.drops.length * this.precipAlpha);
    if (active <= 0) return;

    // 风把降水吹斜：无风时是最基础的 0.26，大风时可以斜到 0.85
    const slant = 0.26 + this.windSlant() * 0.6;
    // 雪落得慢、雨夹雪居中、雨最快
    const fallScale = kind === 'snow' ? 0.13 : kind === 'sleet' ? 0.45 : 1;

    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    for (let i = 0; i < active; i += 1) {
      const d = this.drops[i];
      const isFlake = kind === 'snow' || (kind === 'sleet' && (i & 1) === 0);
      // 雨夹雪里雪片再慢一档，才看得出"夹"的层次
      const vy = d.speed * fallScale * (kind === 'sleet' && isFlake ? 0.7 : 1);

      if (kind === 'dust') {
        // 沙尘：几乎不"下落"，主要被风横着推；颗粒细、偏沙黄、带一点上下浮沉
        const vx = d.speed * 0.22 * (0.7 + slant * 1.7);
        d.x += vx * dt;
        d.y += vx * dt * (0.1 + Math.sin(seconds * 1.4 + i) * 0.22);
        if (d.x > w + 30) {
          d.x = -30;
          d.y = Math.random() * h;
        }
        if (d.y > h + 20) d.y = -20;
        if (d.y < -20) d.y = h + 20;

        const da = Math.min(0.72, d.alpha * this.precipAlpha * 1.1);
        ctx.fillStyle = `rgba(214, 184, 138, ${da.toFixed(3)})`;
        ctx.fillRect(d.x, d.y, 1.5 + d.len * 0.02, 1.1);
        continue;
      }

      d.y += vy * dt;
      d.x += vy * dt * slant;
      if (d.y > h + 20) {
        d.y = -30;
        d.x = Math.random() * (w + 260) - 130;
      }
      if (d.x > w + 140) d.x -= w + 260;

      const a = Math.min(0.85, d.alpha * this.precipAlpha * (isFlake ? 1.25 : 1));
      if (isFlake) {
        // 雪片：左右摆动的正弦位移只在绘制时叠加，不积分进 x，避免越飘越偏
        const sway = Math.sin(seconds * 0.9 + i) * 22;
        const r = 0.8 + d.len * 0.055;
        ctx.beginPath();
        ctx.arc(d.x + sway, d.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
        ctx.fill();
      } else {
        ctx.strokeStyle = `rgba(196, 214, 236, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * slant, d.y + d.len);
        ctx.stroke();
      }
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

    // 缓存的地面坐标会过期：页脚异步插入、统计/标签渲染完、SPA 换页都会改变
    // 地面在文档里的位置。这里用 ResizeObserver 自动重测，
    // 否则山脉会画在几百像素之外（云朵退场也会算错时机）。
    this.bodyObserver = new ResizeObserver(() => {
      this.measureGround();
      this.updateScroll();
    });
    this.bodyObserver.observe(document.body);

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
      this.layoutMountains();
      this.apply(false);
    }, 200);
  };

  private handleVisibility = (): void => {
    this.syncStarLoop();
    // 后台标签页：云朵漂移、阵风这些 CSS 动画照跑不误，白烧 CPU/GPU。
    // 这里统一暂停（rAF 循环另由 syncStarLoop 停掉）。
    this.root?.classList.toggle('is-paused', document.hidden);
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
    return raw !== null && isSkyWeather(raw) ? raw : 'auto';
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

/** 云朵飘动速度倍率（默认 1 = 改动前的速度；有真实风级时会再乘风力系数） */
export function setSkyCloudSpeed(multiplier: number): void {
  skyBackdrop.setCloudSpeed(multiplier);
}

export function getSkyCloudSpeed(): number {
  return skyBackdrop.getCloudSpeed();
}

/** 设置面板里"云朵飘动速度"那行的说明（含真实风力） */
export function getSkyCloudSpeedText(): string {
  return skyBackdrop.getCloudSpeedText();
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

/** 页面高度变化（SPA 导航、页脚加载完成）后重算"离地距离"与山脉位置 */
export function refreshSkyBackdrop(): void {
  skyBackdrop.refresh();
}
