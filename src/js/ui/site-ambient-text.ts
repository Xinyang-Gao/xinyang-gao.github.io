// /js/ui/site-ambient-text.ts
// 网站信息卡的「此刻」文案生成器。
//
// 目标：把地理、天气、日期、季节揉成一句能读的话，而不是把字段罗列成表格
// （"城市：新乡 天气：晴 温度：18" 这种是数据，不是文案）。
//
// 两个设计约束：
//   1. **确定性变体**：同一小时内文案稳定，跨小时才换说法。
//      否则每次 SPA 重渲染都跳字，看着像坏了。
//   2. **能缺就缺**：拿不到天气时退成「季节 + 时段」的通用句，
//      不写"天气：未知"这种把失败暴露给读者的话。

import type { SkyWeather } from '/js/ui/sky-backdrop.js';
import type { WeatherInfo } from '/js/core/weather-service.js';
import { mapWeatherToSky } from '/js/core/weather-service.js';

/** 时段词：与天空背景的配色时段大致对齐，读者抬头看到的和读到的一致 */
function timeOfDay(hour: number): string {
  if (hour < 5) return '深夜';
  if (hour < 8) return '清晨';
  if (hour < 11) return '上午';
  if (hour < 14) return '中午';
  if (hour < 17) return '午后';
  if (hour < 19) return '傍晚';
  if (hour < 22) return '夜里';
  return '深夜';
}

/**
 * 地名的行政后缀（市 / 区 / 县 …）。
 *
 * 接口给的是「新乡市」这种全称，直接写进句子就成了
 * "新乡市的秋日午后" —— 两个"的"连读很拗口。去掉后缀念着才顺。
 * 万一去掉后为空（理论上不会），退回原名。
 */
function trimPlace(raw: string): string {
  const trimmed = raw.replace(/(市|区|县|旗|盟|州)$/, '');
  return trimmed || raw;
}

/** 季节按月份划分（北半球） */
function season(month: number): string {
  if (month >= 2 && month <= 4) return '春日';
  if (month >= 5 && month <= 7) return '夏日';
  if (month >= 8 && month <= 10) return '秋日';
  return '冬日';
}

/**
 * 天气的说法。
 *
 * 每种给 3 个变体：同一个"晴"说十遍"晴朗"就露馅了。
 * 都是短语而非形容词，方便直接嵌进句子当谓语。
 */
const WEATHER_PHRASES: Record<SkyWeather, readonly string[]> = {
  clear: ['天气晴朗', '天色清朗', '是个晴天'],
  cloudy: ['云层不厚', '天上有云', '云絮散着'],
  overcast: ['天色阴沉', '云压得很低', '阴着天'],
  rain: ['正下着雨', '雨还没停', '窗外有雨声'],
  storm: ['雷雨将至', '有雷阵雨', '雷声不远'],
  snow: ['正飘着雪', '落着雪', '雪还没停'],
  sleet: ['雨里夹着雪', '雨雪交杂', '落的是雨夹雪'],
  fog: ['起了雾', '雾气很重', '雾还没散'],
  haze: ['有些霾', '空气发闷', '天色浑浊'],
  dust: ['风里带着沙', '有扬沙', '沙尘未散'],
  wind: ['风不小', '风正劲', '风一阵接一阵'],
};

/**
 * 一句应景的提醒。
 *
 * 天气类优先于温度类：下雨说带伞比说保暖有用。
 * 没有值得提醒的（温度宜人、天气平和）就返回 null，别硬凑。
 */
function tipFor(sky: SkyWeather | null, temp: number | null): string | null {
  if (sky) {
    const byWeather: Partial<Record<SkyWeather, string>> = {
      rain: '出门记得带伞',
      sleet: '出门记得带伞',
      storm: '雷雨天气，注意安全',
      snow: '路上当心',
      fog: '能见度低，慢些走',
      haze: '记得戴口罩',
      dust: '记得戴口罩',
      wind: '注意防风',
    };
    const hit = byWeather[sky];
    if (hit) return hit;
  }
  if (temp != null && Number.isFinite(temp)) {
    if (temp <= 2) return '注意保暖';
    if (temp >= 32) return '注意防暑';
  }
  return null;
}

/** 拿不到天气时的通用句：只说季节与时段，不给"未知"这类词 */
const GENERIC_PHRASES: readonly string[] = [
  '适合慢下来读点什么',
  '一切都刚刚好',
  '安静得很',
  '风很轻',
];

/** 按种子稳定地挑一个变体（取模可能为负，故先加一个长度再取） */
function pick<T>(list: readonly T[], seed: number): T {
  const i = ((seed % list.length) + list.length) % list.length;
  return list[i];
}

/** 变体种子：年 + 月 + 日 + 小时 —— 同一小时稳定，跨小时换说法 */
function seedFrom(d: Date): number {
  return d.getFullYear() * 1000000 + (d.getMonth() + 1) * 10000 + d.getDate() * 100 + d.getHours();
}

/**
 * 生成「此刻」文案。
 *
 * @param weather 真实天气；传 null 表示没拿到（接口失败 / 还没返回）
 * @param now     用于推导时段、季节与变体种子
 */
export function generateAmbientText(weather: WeatherInfo | null, now = new Date()): string {
  const seed = seedFrom(now);
  const place = weather?.city?.trim() ? trimPlace(weather.city.trim()) : '';
  const when = `${season(now.getMonth())}${timeOfDay(now.getHours())}`;

  // —— 没有天气：只说时令，不暴露"拿不到数据"
  if (!weather) {
    return `${when}，${pick(GENERIC_PHRASES, seed)}。`;
  }

  const sky = mapWeatherToSky(weather);
  const phrase = pick(WEATHER_PHRASES[sky], seed);

  // 主句：地点只带一个"的"（"新乡的秋日午后"）。写成"新乡的秋日的午后"
  // 两个"的"连读很拗口，写成"新乡秋日午后"又太赶。地点可缺：接口有时给不到城市。
  const head = place ? `${place}的${when}，${phrase}` : `${when}，${phrase}`;

  // 温度：只在数字可信时带上；体感与实际差得多时用体感
  const shown =
    weather.feelsLike != null && Math.abs(weather.feelsLike - weather.temperature) >= 2
      ? weather.feelsLike
      : weather.temperature;
  const tempPart = Number.isFinite(shown) ? `，${Math.round(shown)}°C` : '';

  const tip = tipFor(sky, shown);
  return `${head}${tempPart}。${tip ? `${tip}。` : ''}`;
}
