// /js/ui/site-ambient-text.ts
// 网站信息卡的「此刻」文案生成器。
//
// 目标：把地理、天气、农历、季节揉成一段**能读的话**，而不是把字段罗列成表格
// （"城市：新乡 天气：晴 温度：18" 是数据，不是文案）。
//
// 三个设计约束：
//   1. **确定性变体**：同一小时内文案稳定，跨小时才换说法。
//      否则每次 SPA 重渲染都跳字，看着像坏了。
//   2. **能缺就缺**：拿不到天气 / 农历时退成更通用的句子，
//      不写"天气：未知"这种把失败暴露给读者的话。
//   3. **不堆砌**：节气、节日、月相、提醒都只挑最值得说的那一两样写进去，
//      全塞进来会变成流水账。
//
// 返回结构化三段，由卡片各自用 textContent 写入 —— API 返回的城市名、节日名
// 属于外部数据，走 DOM 文本节点最稳，不需要转义也不会被注入。

import type { SkyWeather } from '/js/ui/sky-backdrop.js';
import type { WeatherInfo } from '/js/core/weather-service.js';
import { mapWeatherToSky } from '/js/core/weather-service.js';
import type { LunarInfo, MoonPhaseName } from '/js/core/lunar-service.js';
import { moonPhase, moonPhaseName } from '/js/core/lunar-service.js';

/** 三段文案：景 / 农历 / 应景提醒。任一段都可能为 null（没有数据或不值得说） */
export interface AmbientText {
  /** 头一句：时段 + 天气 + 温度 */
  scene: string;
  /** 农历与月相 */
  lunarLine: string | null;
  /** 节气 / 节日 / 提醒 */
  note: string | null;
}

/** 按种子稳定地挑一个变体（取模可能为负，故先加一个长度再取） */
function pick<T>(list: readonly T[], seed: number, salt = 0): T {
  const i = (((seed + salt * 7919) % list.length) + list.length) % list.length;
  return list[i];
}

/** 变体种子：年 + 月 + 日 + 小时 —— 同一小时稳定，跨小时换说法 */
function seedFrom(d: Date): number {
  return d.getFullYear() * 1000000 + (d.getMonth() + 1) * 10000 + d.getDate() * 100 + d.getHours();
}

/**
 * 时段。与天空背景的配色时段大致对齐 —— 读者抬头看到的和读到的是同一时刻。
 * 给的是画面而不是标签：写"黄昏正一寸寸落下来"而不是"傍晚"。
 */
function timeOfDay(hour: number, seed: number): string {
  if (hour < 5) return pick(['夜色沉沉', '万籁俱静', '夜正深'], seed, 1);
  if (hour < 8) return pick(['晨光初透', '天刚破晓', '晓色微明'], seed, 2);
  if (hour < 11) return pick(['晨光正好', '日头渐高', '天已大亮'], seed, 3);
  if (hour < 14) return pick(['日正当空', '正午的阳光直直落下来', '日头正盛'], seed, 4);
  if (hour < 17) return pick(['日影渐长', '午后斜阳', '阳光斜斜地铺过来'], seed, 5);
  if (hour < 19) return pick(['黄昏正一寸寸落下来', '暮色渐合', '天光将暮'], seed, 6);
  if (hour < 22) return pick(['夜色初临', '灯火初上', '入夜了'], seed, 7);
  return pick(['夜已深', '更深露重', '万籁都睡了'], seed, 8);
}

/**
 * 地名的行政后缀（市 / 区 / 县 …）。
 * 接口给的是「新乡市」这种全称，直接写进句子会变成"新乡市的秋日"——
 * 两个"的"连读很拗口。剥掉后念着才顺。
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

/** 天气的说法：短语而非形容词，方便直接嵌进句子当谓语 */
const WEATHER_PHRASES: Record<SkyWeather, readonly string[]> = {
  clear: ['天色清朗', '天空澄澈', '万里无云'],
  cloudy: ['云层不厚', '有几片云闲闲地挂着', '云絮散着'],
  overcast: ['天色阴沉', '云压得很低', '天是灰的'],
  rain: ['正下着雨', '雨还没停', '窗外有雨声'],
  storm: ['雷雨将至', '雷声不远', '云里有雷'],
  snow: ['正飘着雪', '雪还没停', '落着雪'],
  sleet: ['雨里夹着雪', '雨雪交杂', '落的是雨夹雪'],
  fog: ['起了雾', '雾气很重', '雾还没散'],
  haze: ['有些霾', '空气发闷', '天色浑浊'],
  dust: ['风里带着沙', '有扬沙', '沙尘未散'],
  wind: ['风不小', '风正劲', '风一阵接一阵'],
};

/**
 * 温度的体感描写：比干巴巴的数字更像人说的话。
 *
 * 档位刻意避开"不冷不热"这类与数字重复的表述 —— "18°C，不冷不热"
 * 等于把同一个信息说两遍。
 */
function tempPhrase(temp: number, seed: number): string {
  if (temp <= 0) return pick(['寒意浸骨', '呵气成霜'], seed, 11);
  if (temp <= 8) return pick(['寒意渐浓', '冷得清冽'], seed, 12);
  if (temp <= 16) return pick(['凉意正起', '有些凉了'], seed, 13);
  if (temp <= 22) return pick(['正宜人', '温度刚好'], seed, 14);
  if (temp <= 28) return pick(['暖得发懒', '有些闷热'], seed, 15);
  return pick(['暑气未消', '热得黏人'], seed, 16);
}

/** 月相的诗意图景 */
const MOON_PHRASES: Record<MoonPhaseName, readonly string[]> = {
  new: ['月隐于夜，抬头只见星子', '今夜无月，正好看星'],
  'waxing-crescent': ['一弯蛾眉斜挂天边', '月牙细细的，还没长开'],
  'first-quarter': ['上弦月半开', '月如半规'],
  'waxing-gibbous': ['月将圆未满', '月色一日日厚起来'],
  full: ['月色正圆，照得夜也亮了几分', '今夜月满'],
  'waning-gibbous': ['月已过圆，正在一点点瘦下去', '圆月始亏'],
  'last-quarter': ['下弦月半落', '月只剩一半了'],
  'waning-crescent': ['残月一钩，天将明时才见', '月只剩细细一痕'],
};

/** 没有天气时的景句：只说时令，不暴露"拿不到数据" */
const GENERIC_SCENES: readonly string[] = [
  '这样的天，适合慢下来读点什么',
  '一切都刚刚好',
  '安静得很',
  '风很轻',
];

/** 一句应景的提醒：天气类优先于温度类，没有值得提醒的就返回 null */
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

/**
 * 生成「此刻」文案。
 *
 * @param weather 真实天气；null 表示没拿到（接口失败 / 还没返回）
 * @param lunar   农历信息；null 表示没拿到
 * @param now     用于推导时段、季节与变体种子
 */
export function generateAmbientText(
  weather: WeatherInfo | null,
  lunar: LunarInfo | null,
  now = new Date(),
): AmbientText {
  const seed = seedFrom(now);
  const when = timeOfDay(now.getHours(), seed);
  const place = weather?.city?.trim() ? trimPlace(weather.city.trim()) : '';

  // ---------- 第一句：景 ----------
  let scene: string;
  if (!weather) {
    // 没有天气：只说时令，不暴露"拿不到数据"
    scene = `${when}。${season(now.getMonth())}里${pick(GENERIC_SCENES, seed, 21)}。`;
  } else {
    const sky = mapWeatherToSky(weather);
    const phrase = pick(WEATHER_PHRASES[sky], seed, 22);
    // 地点只带一个"的"（"新乡的黄昏"）：两个"的"连读很拗口
    const head = place ? `${place}的${when}` : when;
    // 体感与实际差得多时用体感
    const shown =
      weather.feelsLike != null && Math.abs(weather.feelsLike - weather.temperature) >= 2
        ? weather.feelsLike
        : weather.temperature;
    const tempTail = Number.isFinite(shown)
      ? `，${Math.round(shown)}°C，${tempPhrase(shown, seed)}`
      : '';
    // 两种句式轮换：把"时段"单独成句更有画面感，但连着写也不坏 ——
    // 固定一种句式读几遍就露模板味了
    scene = seed % 3 === 0 ? `${head}，${phrase}${tempTail}。` : `${head}。${phrase}${tempTail}。`;
  }

  // ---------- 第二句：农历与月相 ----------
  let lunarLine: string | null = null;
  if (lunar) {
    const datePart = `农历${lunar.lunarMonthCn}${lunar.lunarDayCn}`;
    // 干支与生肖：有就带上，没有就只说日期
    const eraPart =
      lunar.ganzhiYear && lunar.zodiac
        ? `，${lunar.ganzhiYear}年属${lunar.zodiac}`
        : lunar.ganzhiYear
          ? `，岁次${lunar.ganzhiYear}`
          : '';
    /*
     * 白天不写月相 —— 大白天说"下弦月半落"是看不见的东西，读着别扭。
     * 换成同属历法的干支月日，信息量相当，也不会指错天象。
     * （黄昏 17 点后月亮多半已升起，算作可见。）
     */
    const hour = now.getHours();
    const moonVisible = hour >= 17 || hour < 6;
    let tail = '';
    if (moonVisible) {
      tail = `，${pick(MOON_PHRASES[moonPhaseName(moonPhase(lunar.lunarDay))], seed, 23)}`;
    } else if (lunar.ganzhiMonth && lunar.ganzhiDay) {
      tail = `，${lunar.ganzhiMonth}月${lunar.ganzhiDay}日`;
    }
    lunarLine = `${datePart}${eraPart}${tail}。`;
  } else {
    // 没有农历时退成公历日期 + 时令，让这一段不至于空着
    lunarLine = `公历${now.getMonth() + 1}月${now.getDate()}日，${season(now.getMonth())}将尽。`;
  }

  // ---------- 第三句：节气 / 节日 / 提醒 ----------
  const marks: string[] = [];
  if (lunar?.solarTerm) marks.push(`今日${lunar.solarTerm}`);
  // 节日最多提一个：连着报三个名字就成了日历
  const festival = lunar?.lunarFestivals[0] ?? lunar?.solarFestivals[0] ?? null;
  if (festival) marks.push(`今日是${festival}`);

  const tip = tipFor(
    weather ? mapWeatherToSky(weather) : null,
    weather?.feelsLike ?? weather?.temperature ?? null,
  );
  // 时令点与提醒是两回事，用句号分开；挤在一个逗号句里读着像流水账
  let note: string | null = null;
  if (marks.length || tip) {
    note = `${marks.length ? `${marks.join('，')}。` : ''}${tip ? `${tip}。` : ''}`;
  }

  return { scene, lunarLine, note };
}

/** 把三段拼成一句纯文本（给 title / aria-label 等只需要字符串的场景） */
export function formatAmbientText(t: AmbientText): string {
  return [t.scene, t.lunarLine, t.note].filter(Boolean).join('');
}
