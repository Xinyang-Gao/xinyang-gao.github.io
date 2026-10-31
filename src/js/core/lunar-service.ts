// /js/core/lunar-service.ts
// 农历查询（UAPI · /api/v1/misc/lunartime），与天气、每日一言同一提供商。
//
// 缓存策略：农历一天才变一次，缓存到**次日零点**即可（比天气的 30 分钟宽松得多）。
// 跨日（含跨月、跨年）时缓存自动失效，重新取一次。
// 请求失败一律返回 null，调用方按"没有农历"处理 —— 文案退成只说公历时令，
// 月亮退回默认的月牙，不把失败暴露给读者。

import { CONFIG, storageController } from '/js/core/core.js';

/** 文档：https://uapis.cn/docs/api-reference/get-misc-lunartime */
const ENDPOINT = 'https://uapis.cn/api/v1/misc/lunartime';
/** 单请求超时（毫秒） */
const TIMEOUT_MS = 6000;
/** 兜底有效期（小时）：缓存解析不出日期时按这个时长算过期 */
const FALLBACK_TTL_H = 6;

export interface LunarInfo {
  /** 农历年中文，如「二〇二六」 */
  lunarYearCn: string;
  /** 农历月中文，如「九月」；闰月会带「闰」字 */
  lunarMonthCn: string;
  /** 农历日中文，如「廿二」 */
  lunarDayCn: string;
  /** 是否闰月 */
  isLeapMonth: boolean;
  /** 农历日数字（1–30）—— 月相由它推导 */
  lunarDay: number;
  /** 干支年 / 月 / 日，如「丙午」「戊戌」「戊寅」 */
  ganzhiYear: string;
  ganzhiMonth: string;
  ganzhiDay: string;
  /** 生肖，如「马」 */
  zodiac: string;
  /** 节气（如「霜降」），接口可能不给 */
  solarTerm: string | null;
  /** 公历节日（如「万圣节前夜」） */
  solarFestivals: string[];
  /** 农历节日（如「中秋」「除夕」） */
  lunarFestivals: string[];
  /** 取到这份数据的本地时间戳 */
  fetchedAt: number;
}

type Listener = (info: LunarInfo | null) => void;

let cache: LunarInfo | null = null;
let inflight: Promise<LunarInfo | null> | null = null;
const listeners = new Set<Listener>();

// ==================== 月相 ====================

/**
 * 农历日 → 相位的换算周期（天）。
 *
 * **不是**天文上的朔望月（29.53 天），而是按农历的常识标定为 28 天：
 * 农历把"望"固定在十五、"朔"固定在初一，所以
 *   初一 = 0（朔）、初八 = 0.25（上弦）、十五 = 0.5（望）、廿二 = 0.75（下弦）
 * 用 29.53 会把十五算成 0.474 —— 差一点点就够不上满月，
 * 于是"八月十五"画出来是个凸月，这显然不对。
 *
 * 代价是月末（廿九、三十）的相位会提前跑满并 clamp，
 * 但那两天本来就是残月到新月，视觉上没有区别。
 */
const LUNAR_PHASE_CYCLE = 28;

/**
 * 农历日 → 月相。
 *
 * 农历本身就以朔望定月，所以直接用农历日换算即可，不需要天文算法。
 *
 * @returns 0 = 新月，0.5 = 满月，1 = 下一个新月
 */
export function moonPhase(lunarDay: number): number {
  if (!Number.isFinite(lunarDay)) return 0;
  const age = Math.min(Math.max(lunarDay, 1), 30) - 1;
  return Math.min(age / LUNAR_PHASE_CYCLE, 0.999);
}

/** 月相名称 —— 用于文案与无障碍描述 */
export type MoonPhaseName =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export function moonPhaseName(phase: number): MoonPhaseName {
  if (phase < 0.035 || phase > 0.965) return 'new';
  if (phase < 0.235) return 'waxing-crescent';
  if (phase < 0.275) return 'first-quarter';
  if (phase < 0.475) return 'waxing-gibbous';
  if (phase < 0.525) return 'full';
  if (phase < 0.725) return 'waning-gibbous';
  if (phase < 0.775) return 'last-quarter';
  return 'waning-crescent';
}

// ==================== 缓存 ====================

/** 缓存只在**同一天**内有效：跨日则农历日、干支都可能变了 */
function isSameDay(a: number, b: number): boolean {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/** 宽容解析：结构不对 / 字段缺失就当没缓存，不要让脏数据卡住 */
function parseCache(raw: string | null): LunarInfo | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<LunarInfo>;
    if (typeof data?.lunarDayCn !== 'string' || !data.lunarDayCn) return null;
    if (typeof data?.fetchedAt !== 'number' || !Number.isFinite(data.fetchedAt)) return null;
    // 跨日失效；fetchedAt 异常（例如未来时间）时退回 6 小时兜底
    const age = Date.now() - data.fetchedAt;
    const valid =
      age >= 0 && age < FALLBACK_TTL_H * 3600_000 ? isSameDay(data.fetchedAt, Date.now()) : false;
    if (!valid) return null;
    return {
      lunarYearCn: typeof data.lunarYearCn === 'string' ? data.lunarYearCn : '',
      lunarMonthCn: typeof data.lunarMonthCn === 'string' ? data.lunarMonthCn : '',
      lunarDayCn: data.lunarDayCn,
      isLeapMonth: data.isLeapMonth === true,
      lunarDay: typeof data.lunarDay === 'number' ? data.lunarDay : 1,
      ganzhiYear: typeof data.ganzhiYear === 'string' ? data.ganzhiYear : '',
      ganzhiMonth: typeof data.ganzhiMonth === 'string' ? data.ganzhiMonth : '',
      ganzhiDay: typeof data.ganzhiDay === 'string' ? data.ganzhiDay : '',
      zodiac: typeof data.zodiac === 'string' ? data.zodiac : '',
      solarTerm: typeof data.solarTerm === 'string' ? data.solarTerm : null,
      solarFestivals: Array.isArray(data.solarFestivals)
        ? data.solarFestivals.filter((s) => typeof s === 'string')
        : [],
      lunarFestivals: Array.isArray(data.lunarFestivals)
        ? data.lunarFestivals.filter((s) => typeof s === 'string')
        : [],
      fetchedAt: data.fetchedAt,
    };
  } catch {
    return null;
  }
}

function writeCache(info: LunarInfo): void {
  try {
    storageController.setItem(CONFIG.STORAGE_KEYS.LUNAR_CACHE, JSON.stringify(info));
  } catch (err) {
    console.warn('[lunar] 写入缓存失败：', err);
  }
}

/** 当前可用的农历（可能来自缓存，可能没有） */
export function getLunar(): LunarInfo | null {
  if (cache) return cache;
  cache = parseCache(storageController.getItem(CONFIG.STORAGE_KEYS.LUNAR_CACHE));
  return cache;
}

/** 订阅农历变化；订阅时立即回传当前值 */
export function subscribeLunar(listener: Listener): () => void {
  listener(getLunar());
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

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 字段别名较多（节气尤其），逐个尝试 */
function firstString(body: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = str(body[k]);
    if (v) return v;
  }
  return '';
}

function stringList(body: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = body[k];
    if (Array.isArray(v)) {
      const out = v.map(str).filter(Boolean);
      if (out.length) return out;
    }
    const single = str(v);
    if (single) return [single];
  }
  return [];
}

function normalize(raw: unknown): LunarInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const body = d.data && typeof d.data === 'object' ? (d.data as Record<string, unknown>) : d;

  // 农历日中文是核心（文案要念出来），缺了就整份作废
  const lunarDayCn = firstString(body, ['lunar_day_cn', 'lunarDayCn', 'lunar_day_chinese']);
  if (!lunarDayCn) return null;

  const day = num(body.lunar_day) ?? num(body.lunarDay) ?? 1;
  const monthCn = firstString(body, ['lunar_month_cn', 'lunarMonthCn']);
  const isLeap = body.is_leap_month === true || body.isLeapMonth === true;

  return {
    lunarYearCn: firstString(body, ['lunar_year_cn', 'lunarYearCn']),
    // 闰月在中文月名上补「闰」：接口有的给了、有的没给，统一在这里兜住
    lunarMonthCn: isLeap && monthCn && !monthCn.startsWith('闰') ? `闰${monthCn}` : monthCn,
    lunarDayCn,
    isLeapMonth: isLeap,
    lunarDay: Math.min(Math.max(Math.round(day), 1), 30),
    ganzhiYear: firstString(body, ['ganzhi_year', 'ganzhiYear']),
    ganzhiMonth: firstString(body, ['ganzhi_month', 'ganzhiMonth']),
    ganzhiDay: firstString(body, ['ganzhi_day', 'ganzhiDay']),
    zodiac: firstString(body, ['zodiac', 'shengxiao']),
    solarTerm: firstString(body, ['jieqi', 'solar_term', 'solarTerm', 'term']) || null,
    solarFestivals: stringList(body, ['solar_festivals', 'solarFestivals', 'festivals']),
    lunarFestivals: stringList(body, ['lunar_festivals', 'lunarFestivals']),
    fetchedAt: Date.now(),
  };
}

async function request(): Promise<LunarInfo | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    // 不传 ts / timezone：默认当前时间 + Asia/Shanghai，与站点读者所在时区一致
    const res = await fetch(ENDPOINT, {
      signal: ac.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`UAPI lunar HTTP ${res.status}`);
    return normalize(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 幂等地拿到农历：同一天内复用缓存，跨日或没有缓存才联网。
 * 并发调用共享同一个请求。
 */
export function ensureLunar(force = false): Promise<LunarInfo | null> {
  if (!force) {
    const cached = getLunar();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;

  inflight = request()
    .then((info) => {
      cache = info;
      if (info) writeCache(info);
      return info;
    })
    .catch((err) => {
      // 失败不抛：调用方拿 null，按"没有农历"降级
      console.warn('[lunar] 获取失败：', err);
      return cache;
    })
    .finally(() => {
      inflight = null;
      emit();
    });

  return inflight;
}
