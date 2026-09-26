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
  VersionIndexPayload,
  VersionShardPayload,
  VersionEntry,
} from '/js/types/data.js';

// ==================== 类型定义 ====================

/** key → 数据载荷类型的映射。新增数据类型时只需在此处补充。 */
export interface DataKeyMap {
  articles: ArticlesPayload;
  works: WorksPayload;
  statistics: StatisticsPayload;
  codeAnalysis: CodeAnalysisData;
  friends: FriendItem[];
  /** 更新日志索引（正文在分片里，见 getVersionShard） */
  versionIndex: VersionIndexPayload;
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
  versionIndex: '/json/version.json',
};

// ==================== 核心服务类 ====================

class DataService {
  /**
   * 内存缓存。key 为 DataKey 或具体 URL（版本分片等动态地址），
   * 载荷类型各异，统一以 unknown 存储，对外返回时由泛型断言。
   */
  private memoryCache = new Map<string, CacheEntry<unknown>>();

  /** 并发去重 */
  private pending = new Map<string, Promise<unknown>>();

  /** 内存缓存有效期：60 秒（持久化交给 SW） */
  private readonly TTL = 60 * 1000;

  /**
   * 核心请求：
   *  1. 内存缓存命中 → 直接返回
   *  2. 进行中的请求 → 复用 Promise
   *  3. 发起网络请求（SW 会处理持久化缓存）
   */
  private async fetchByCacheKey<T>(
    cacheKey: string,
    url: string,
    options: FetchOptions
  ): Promise<T> {
    const { forceRefresh = false } = options;

    // 1) 内存缓存
    if (!forceRefresh) {
      const mem = this.memoryCache.get(cacheKey);
      if (mem && Date.now() - mem.timestamp < this.TTL) {
        return mem.data as T;
      }
    }

    // 2) 并发去重
    const inflight = this.pending.get(cacheKey);
    if (inflight) return inflight as Promise<T>;

    // 3) 网络请求
    const promise = this.doFetch<T>(url, forceRefresh)
      .then((data) => {
        this.memoryCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      })
      .catch((err) => {
        // 网络失败时回退到过期内存缓存
        const mem = this.memoryCache.get(cacheKey);
        if (mem) {
          console.warn(`[DataService] 网络请求失败，返回过期缓存 (${cacheKey})`, err);
          return mem.data as T;
        }
        throw err;
      })
      .finally(() => {
        this.pending.delete(cacheKey);
      });

    this.pending.set(cacheKey, promise);
    return promise;
  }

  private async fetchWithCache<K extends DataKey>(
    key: K,
    options: FetchOptions = {}
  ): Promise<DataKeyMap[K]> {
    return this.fetchByCacheKey<DataKeyMap[K]>(key, URL_MAP[key], options);
  }

  /** 按 URL 缓存的通用 JSON 请求（分片等动态地址） */
  fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
    return this.fetchByCacheKey<T>(url, url, options);
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

  /** 更新日志索引（体积小，可安全优先加载） */
  getVersionIndex(options?: FetchOptions): Promise<VersionIndexPayload> {
    return this.fetchWithCache('versionIndex', options);
  }

  /** 拉取单个版本分片（url 取自索引的 VersionShardMeta.url） */
  getVersionShard(url: string, options?: FetchOptions): Promise<VersionShardPayload> {
    return this.fetchJson<VersionShardPayload>(url, options);
  }

  /**
   * 只加载最近若干个版本（用于更新提示等场景），避免拉取全部分片。
   * 由新到旧累加分片，直到覆盖 limit 个版本为止。
   */
  async getRecentVersions(limit: number, options?: FetchOptions): Promise<VersionPayload> {
    const index = await this.getVersionIndex(options);
    const shards = [...(index.shards || [])].sort((a, b) => a.index - b.index);

    // 兼容尚未分片的旧 version.json（如 Service Worker 里的旧缓存）
    if (!shards.length) {
      const legacy = (index as unknown as { versions?: VersionEntry[] }).versions || [];
      const sorted = [...legacy].sort((a, b) => a.id - b.id);
      return {
        generated_at: index.generated_at,
        total_versions: index.total_versions,
        versions: sorted.slice(-limit),
      };
    }

    const targets: string[] = [];
    let count = 0;
    for (let i = shards.length - 1; i >= 0; i--) {
      targets.push(shards[i].url);
      count += shards[i].count || 0;
      if (count >= limit) break;
    }

    const payloads = await Promise.all(
      targets.map((url) => this.getVersionShard(url, options))
    );
    const versions: VersionEntry[] = [];
    for (const p of payloads) {
      versions.push(...(p.versions || []));
    }
    versions.sort((a, b) => a.id - b.id);

    return {
      generated_at: index.generated_at,
      total_versions: index.total_versions,
      versions,
    };
  }

  /** 合并所有分片的完整版本数据（确需全量时使用） */
  async getVersion(options?: FetchOptions): Promise<VersionPayload> {
    const index = await this.getVersionIndex(options);
    const shards = [...(index.shards || [])].sort((a, b) => a.index - b.index);
    const payloads = await Promise.all(
      shards.map((s) => this.getVersionShard(s.url, options))
    );

    const versions: VersionEntry[] = [];
    for (const p of payloads) {
      versions.push(...(p.versions || []));
    }
    versions.sort((a, b) => a.id - b.id);

    return {
      generated_at: index.generated_at,
      total_versions: index.total_versions,
      versions,
    };
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