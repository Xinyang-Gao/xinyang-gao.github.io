// /js/core/data-service.ts
// 数据服务：内存缓存 + 并发去重
// 持久化缓存由 Service Worker 负责（见 /js/data/sw.js）
// 移除 localStorage 层，避免与 SW 冲突

import { CONFIG } from './core.js';

// ==================== 类型定义 ====================

export type DataKey =
  | 'articles'
  | 'works'
  | 'statistics'
  | 'codeAnalysis'
  | 'friends'
  | 'version';

interface CacheEntry {
  data: any;
  timestamp: number;
}

interface FetchOptions {
  /** 强制刷新，跳过内存缓存并让 SW 走网络 */
  forceRefresh?: boolean;
}

// ==================== 核心服务类 ====================

export class DataService {
  private static instance: DataService;

  /** 内存缓存 */
  private memoryCache = new Map<DataKey, CacheEntry>();

  /** 并发去重 */
  private pending = new Map<DataKey, Promise<any>>();

  /** 内存缓存有效期：60 秒（持久化交给 SW） */
  private readonly TTL = 60 * 1000;

  private constructor() {}

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // ---------- 私有方法 ----------

  private getUrl(key: DataKey): string {
    const map: Record<DataKey, string> = {
      articles: CONFIG.API.ARTICLES,
      works: CONFIG.API.WORKS,
      statistics: CONFIG.API.STATISTICS,
      codeAnalysis: '/json/code_analysis.json',
      friends: '/json/friends.json',
      version: '/json/version.json',
    };
    return map[key];
  }

  /**
   * 核心请求：
   * 1. 内存缓存命中 → 直接返回
   * 2. 进行中的请求 → 复用 Promise
   * 3. 发起网络请求（SW 会处理持久化缓存）
   */
  private async fetchWithCache(key: DataKey, options: FetchOptions = {}): Promise<any> {
    const { forceRefresh = false } = options;

    // 1) 内存缓存
    if (!forceRefresh) {
      const mem = this.memoryCache.get(key);
      if (mem && Date.now() - mem.timestamp < this.TTL) {
        return mem.data;
      }
    }

    // 2) 并发去重
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    // 3) 网络请求
    const promise = this.doFetch(this.getUrl(key), forceRefresh)
      .then((data) => {
        this.memoryCache.set(key, { data, timestamp: Date.now() });
        return data;
      })
      .catch((err) => {
        // 网络失败时回退到过期内存缓存
        const mem = this.memoryCache.get(key);
        if (mem) {
          console.warn(`[DataService] 网络请求失败，返回过期缓存 (${key})`, err);
          return mem.data;
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
  private async doFetch(url: string, forceRefresh: boolean): Promise<any> {
    const res = await fetch(url, {
      cache: forceRefresh ? 'reload' : 'default',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${res.statusText})`);
    }
    return res.json();
  }

  // ---------- 对外方法 ----------

  getArticles(options?: FetchOptions): Promise<any> {
    return this.fetchWithCache('articles', options);
  }

  getWorks(options?: FetchOptions): Promise<any> {
    return this.fetchWithCache('works', options);
  }

  getStatistics(options?: FetchOptions): Promise<any> {
    return this.fetchWithCache('statistics', options);
  }

  getCodeAnalysis(options?: FetchOptions): Promise<any> {
    return this.fetchWithCache('codeAnalysis', options);
  }

  getFriends(options?: FetchOptions): Promise<any> {
    return this.fetchWithCache('friends', options);
  }

  getVersion(options?: FetchOptions): Promise<any> {
    return this.fetchWithCache('version', options);
  }

  /**
   * 清空内存缓存，并让 SW 下次请求走网络
   */
  clearCache(): void {
    this.memoryCache.clear();
    this.pending.clear();
  }

  /**
   * 预热：并行加载常用数据
   */
  warmup(): void {
    this.getArticles().catch(() => {});
    this.getWorks().catch(() => {});
    this.getStatistics().catch(() => {});
  }
}

export const dataService = DataService.getInstance();
export default dataService;