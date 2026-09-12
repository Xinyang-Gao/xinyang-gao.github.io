// /js/core/data-service.ts
// 数据服务：内存缓存 + 并发去重（泛型 + 类型化）
// 持久化缓存由 Service Worker 负责（见 /js/data/sw.js）

import { CONFIG } from '/js/core/core.js';
import type {
  ArticlesPayload,
  WorksPayload,
  StatisticsPayload,
  CodeAnalysisData,
  FriendItem,
  VersionPayload,
} from '/js/types/data.js';

// ==================== 类型定义 ====================

/** key → 数据载荷类型的映射。新增数据类型时只需在此处补充。 */
export interface DataKeyMap {
  articles: ArticlesPayload;
  works: WorksPayload;
  statistics: StatisticsPayload;
  codeAnalysis: CodeAnalysisData;
  friends: FriendItem[];
  version: VersionPayload;
}

export type DataKey = keyof DataKeyMap;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface FetchOptions {
  /** 强制刷新，跳过内存缓存并让 SW 走网络 */
  forceRefresh?: boolean;
}

// ==================== URL 映射 ====================

const URL_MAP: Record<DataKey, string> = {
  articles: CONFIG.API.ARTICLES,
  works: CONFIG.API.WORKS,
  statistics: CONFIG.API.STATISTICS,
  codeAnalysis: '/json/code_analysis.json',
  friends: '/json/friends.json',
  version: '/json/version.json',
};

// ==================== 核心服务类 ====================

class DataService {
  /** 内存缓存。每个 key 的载荷类型不同，统一以 unknown 存储，对外返回时由泛型断言。 */
  private memoryCache = new Map<DataKey, CacheEntry<unknown>>();

  /** 并发去重 */
  private pending = new Map<DataKey, Promise<unknown>>();

  /** 内存缓存有效期：60 秒（持久化交给 SW） */
  private readonly TTL = 60 * 1000;

  /**
   * 核心请求：
   *  1. 内存缓存命中 → 直接返回
   *  2. 进行中的请求 → 复用 Promise
   *  3. 发起网络请求（SW 会处理持久化缓存）
   */
  private async fetchWithCache<K extends DataKey>(
    key: K,
    options: FetchOptions = {}
  ): Promise<DataKeyMap[K]> {
    const { forceRefresh = false } = options;

    // 1) 内存缓存
    if (!forceRefresh) {
      const mem = this.memoryCache.get(key);
      if (mem && Date.now() - mem.timestamp < this.TTL) {
        return mem.data as DataKeyMap[K];
      }
    }

    // 2) 并发去重
    const inflight = this.pending.get(key);
    if (inflight) return inflight as Promise<DataKeyMap[K]>;

    // 3) 网络请求
    const promise = this.doFetch<DataKeyMap[K]>(URL_MAP[key], forceRefresh)
      .then((data) => {
        this.memoryCache.set(key, { data, timestamp: Date.now() });
        return data;
      })
      .catch((err) => {
        // 网络失败时回退到过期内存缓存
        const mem = this.memoryCache.get(key);
        if (mem) {
          console.warn(`[DataService] 网络请求失败，返回过期缓存 (${key})`, err);
          return mem.data as DataKeyMap[K];
        }
        throw err;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * 实际网络请求。
   * 关键：不再加 ?t= 时间戳（会污染 SW 缓存 key）；
   * 强制刷新通过 cache: 'reload' 通知 SW 绕过缓存。
   */
  private async doFetch<T>(url: string, forceRefresh: boolean): Promise<T> {
    const res = await fetch(url, {
      cache: forceRefresh ? 'reload' : 'default',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${res.statusText})`);
    }
    return (await res.json()) as T;
  }

  // ---------- 对外方法 ----------

  getArticles(options?: FetchOptions): Promise<ArticlesPayload> {
    return this.fetchWithCache('articles', options);
  }

  getWorks(options?: FetchOptions): Promise<WorksPayload> {
    return this.fetchWithCache('works', options);
  }

  getStatistics(options?: FetchOptions): Promise<StatisticsPayload> {
    return this.fetchWithCache('statistics', options);
  }

  getCodeAnalysis(options?: FetchOptions): Promise<CodeAnalysisData> {
    return this.fetchWithCache('codeAnalysis', options);
  }

  getFriends(options?: FetchOptions): Promise<FriendItem[]> {
    return this.fetchWithCache('friends', options);
  }

  getVersion(options?: FetchOptions): Promise<VersionPayload> {
    return this.fetchWithCache('version', options);
  }

  clearCache(): void {
    this.memoryCache.clear();
    this.pending.clear();
  }

  warmup(): void {
    this.getArticles().catch(() => {});
    this.getWorks().catch(() => {});
    this.getStatistics().catch(() => {});
  }
}

// ==================== 单例 ====================

let instance: DataService | null = null;

function getDataService(): DataService {
  if (!instance) instance = new DataService();
  return instance;
}

export const dataService: DataService = getDataService();
export default dataService;

export type { DataService };