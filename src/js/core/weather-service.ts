// /js/core/weather-service.ts
// 真实天气查询（UAPI · /api/v1/misc/weather），与首页每日一言同一提供商。
//
// 缓存策略：天气数据每整点 / 半点更新一次，所以本地缓存 30 分钟。
// 缓存命中直接返回，不发起任何请求；过期或没有缓存才真正联网。
// 请求失败（超时 / 4xx / 5xx / 断网）一律返回 null，调用方按"拿不到天气"处理
// —— 背景退回晴天，首页不显示天气条。

import { CONFIG, storageController } from '/js/core/core.js';
import type { SkyWeather } from '/js/ui/sky-backdrop.js';

/** 文档：https://uapis.cn/docs/api-reference/get-misc-weather */
const ENDPOINT = 'https://uapis.cn/api/v1/misc/weather';
/** 单个请求的超时（毫秒）：弱网下不让页面一直等 */
const TIMEOUT_MS = 6000;
/** 天气每整点 / 半点更新，缓存半小时足够 */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** 首页展示与背景映射需要的字段（不缓存 alerts 全文，避免塞爆存储） */
export interface WeatherInfo {
  /** 城市名，如「新乡市」 */
  city: string;
  /** 区县，如「卫滨区」，可能缺失 */
  district: string;
  /** 天气现象文本，如「多云」—— 自由文本，不是固定枚举 */
  weather: string;
  /** 天气图标代码，如 "101"，比 weather 文本稳定，映射优先用它 */
  icon: string;
  /** 摄氏度 */
  temperature: number;
  /** 体感温度（extended 字段，可能缺失） */
  feelsLike: number | null;
  humidity: number | null;
  windDirection: string;
  windPower: string;
  /** 蒲福风级 0–17；解析不出来（或接口没给）时为 null */
  windLevel: number | null;
  /** 一条最值得看的预警（可能没有） */
  alert: { title: string; level: string; text: string } | null;
  /** 本地取到这份数据的时间戳 */
  fetchedAt: number;
}

type Listener = (info: WeatherInfo | null) => void;

let cache: WeatherInfo | null = null;
let inflight: Promise<WeatherInfo | null> | null = null;
const listeners = new Set<Listener>();

// ==================== 缓存 ====================

/** 宽容解析：JSON 坏了 / 结构变了就当没缓存，不要让脏数据卡住天气 */
function parseCache(raw: string | null): WeatherInfo | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<WeatherInfo>;
    if (typeof data?.city !== 'string' || typeof data?.weather !== 'string') return null;
    if (typeof data?.fetchedAt !== 'number' || !Number.isFinite(data.fetchedAt)) return null;
    if (Date.now() - data.fetchedAt > CACHE_TTL_MS) return null;
    return {
      city: data.city,
      district: typeof data.district === 'string' ? data.district : '',
      weather: data.weather,
      icon: typeof data.icon === 'string' ? data.icon : '',
      temperature: Number(data.temperature) || 0,
      feelsLike: typeof data.feelsLike === 'number' ? data.feelsLike : null,
      humidity: typeof data.humidity === 'number' ? data.humidity : null,
      windDirection: typeof data.windDirection === 'string' ? data.windDirection : '',
      windPower: typeof data.windPower === 'string' ? data.windPower : '',
      windLevel: typeof data.windLevel === 'number' ? data.windLevel : null,
      alert: data.alert ?? null,
      fetchedAt: data.fetchedAt,
    };
  } catch {
    return null;
  }
}

function writeCache(info: WeatherInfo): void {
  try {
    storageController.setItem(CONFIG.STORAGE_KEYS.WEATHER_CACHE, JSON.stringify(info));
  } catch (err) {
    // 存储写满 / 隐私模式：只是没有缓存，不影响本次使用
    console.warn('[weather] 写入缓存失败：', err);
  }
}

/** 当前可用的天气（可能来自缓存，可能没有） */
export function getWeather(): WeatherInfo | null {
  if (cache) return cache;
  cache = parseCache(storageController.getItem(CONFIG.STORAGE_KEYS.WEATHER_CACHE));
  return cache;
}

/** 订阅天气变化；订阅时会立即回传当前值，便于后挂载的页面拿到数据 */
export function subscribeWeather(listener: Listener): () => void {
  listener(getWeather());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener(cache);
}

// ==================== 请求 ====================

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * 从风力文案里取风级：支持「2级」「3-4级」「微风」等写法。
 * 区间取上限（"3-4级"按 4 算）：宁可让云飘快一点，也别弱化了真实的强风。
 * 解析不出来返回 null —— 调用方据此回落到"默认风速"。
 */
function parseWindLevel(power: string): number | null {
  const nums = power.match(/\d+(?:\.\d+)?/g);
  if (nums) {
    const parsed = nums.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 17);
    if (parsed.length) return Math.max(...parsed);
  }
  if (/微风|软风|轻风|静风|无风/.test(power)) return 1;
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(raw: unknown): WeatherInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  // 兼容 { data } 包装
  const body = d.data && typeof d.data === 'object' ? (d.data as Record<string, unknown>) : d;

  const weather = str(body.weather);
  const city = str(body.city) || str(body.district) || str(body.province);
  if (!weather || !city) return null;

  const rawAlerts = Array.isArray(body.alerts) ? body.alerts : [];
  const firstAlert = rawAlerts.find(
    (a): a is Record<string, unknown> => !!a && typeof a === 'object',
  );

  return {
    city,
    district: str(body.district),
    weather,
    icon: str(body.weather_icon) || str(body.weathercode) || str(body.weather_code),
    temperature: num(body.temperature) ?? 0,
    feelsLike: num(body.feels_like) ?? num(body.feelsLike),
    humidity: num(body.humidity),
    windDirection: str(body.wind_direction),
    windPower: str(body.wind_power),
    windLevel: parseWindLevel(str(body.wind_power)),
    alert: firstAlert
      ? {
          title: str(firstAlert.title),
          level: str(firstAlert.level),
          // 预警正文很长，只留一段作为悬停提示
          text: str(firstAlert.text).slice(0, 300),
        }
      : null,
    fetchedAt: Date.now(),
  };
}

async function request(): Promise<WeatherInfo | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const url = new URL(ENDPOINT);
    // 不传 city / adcode：由服务端按客户端 IP 自动定位（手动参数优先的规则由服务端处理）
    url.searchParams.set('extended', 'true');
    const res = await fetch(url.href, {
      signal: ac.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`UAPI weather HTTP ${res.status}`);
    return normalize(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 幂等地拿到天气：30 分钟内复用缓存，过期才联网。
 * 并发调用共享同一个请求，不会打出多个。
 */
export function ensureWeather(force = false): Promise<WeatherInfo | null> {
  if (!force) {
    const cached = getWeather();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;

  inflight = request()
    .then((info) => {
      if (info) {
        cache = info;
        writeCache(info);
        emit();
      } else {
        // 接口通了但字段不对：清掉旧缓存，避免一直用过期数据
        cache = null;
        emit();
      }
      return info;
    })
    .catch((err) => {
      console.warn('[weather] 获取天气失败，按晴天处理：', err);
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

// ==================== 天气 → 背景天气 ====================

/**
 * 天气图标代码 → 四档背景天气。
 * 图标码沿用和风那套（100 晴 / 101 多云 / 104 阴 / 3xx 雨 / 302 雷阵雨 / 4xx 雪 / 5xx 雾霾沙尘）。
 */
const ICON_WEATHER: Record<string, SkyWeather> = {
  '100': 'clear', // 晴
  '150': 'clear', // 晴（夜）
  '102': 'clear', // 少云
  '103': 'clear', // 晴间多云
  '101': 'cloudy', // 多云
  '104': 'overcast', // 阴
  '404': 'sleet', // 雨夹雪
  '405': 'sleet', // 雨雪天气
  '406': 'sleet', // 阵雨夹雪
  '302': 'storm', // 雷阵雨
  '303': 'storm', // 强雷阵雨
  '304': 'storm', // 雷阵雨伴有冰雹
  '209': 'storm', // 风暴
  '210': 'storm', // 狂爆风
  '211': 'storm', // 飓风
  '212': 'storm', // 龙卷风
  '213': 'storm', // 热带风暴
};

/** 按首位数字兜底：3xx 雨、4xx 雪（雨夹雪已由精确表接管）、5xx 雾霾沙尘、2xx 风 */
function byIconPrefix(icon: string): SkyWeather | null {
  const head = icon.charAt(0);
  if (head === '3') return 'rain';
  if (head === '4') return 'snow';
  if (head === '5') return 'cloudy';
  if (head === '2') return 'cloudy';
  return null;
}

/**
 * 真实天气 → 背景天气档位。
 * 优先用图标码（稳定），图标缺失时退回文本匹配。
 */
export function mapWeatherToSky(info: WeatherInfo | null): SkyWeather {
  if (!info) return 'clear';

  const exact = ICON_WEATHER[info.icon];
  if (exact) return exact;
  const byPrefix = byIconPrefix(info.icon);
  if (byPrefix) return byPrefix;

  // 文本兜底：注意"雨夹雪"要排在"雪"和"雨"之前，否则会被误判成纯雨
  const w = info.weather;
  if (w.includes('雷')) return 'storm';
  if (/雨夹雪|雨雪|阵雨夹雪|冻雨/.test(w)) return 'sleet';
  if (/冰雹/.test(w)) return 'storm';
  if (w.includes('雪')) return 'snow';
  if (w.includes('雨')) return 'rain';
  if (/阴|雾|霾|沙|尘/.test(w)) return 'overcast';
  if (w.includes('多云')) return 'cloudy';
  if (w.includes('晴')) return 'clear';
  return 'clear';
}
