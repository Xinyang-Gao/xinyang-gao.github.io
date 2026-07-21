// /js/core/data-service.ts

import { CONFIG, storageController } from './core.js';

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

// 请求配置
interface FetchOptions {
  /** 强制刷新，忽略所有缓存 */
  forceRefresh?: boolean;
  /** 是否使用 localStorage 持久化（默认 true） */
  useStorage?: boolean;
}

// ==================== 核心服务类 ====================

export class DataService {
  private static instance: DataService;

  // 内存缓存
  private memoryCache = new Map<DataKey, CacheEntry>();

  // 并发去重（pending 请求）
  private pending = new Map<DataKey, Promise<any>>();

  // 缓存有效期（5 分钟）
  private readonly TTL = 5 * 60 * 1000;

  private constructor() {}

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // ---------- 私有方法 ----------

  /**
   * 获取 localStorage 键名
   */
  private getStorageKey(key: DataKey): string {
    const map: Record<DataKey, string> = {
      articles: CONFIG.STORAGE_KEYS.ARTICLES_DATA,
      works: CONFIG.STORAGE_KEYS.WORKS_DATA,
      statistics: 'statistics_cache',
      codeAnalysis: 'code_analysis_cache',
      friends: 'friends_cache',
      version: 'version_cache',
    };
    return map[key];
  }

  /**
   * 获取数据 URL
   */
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
   * 核心请求方法，自动处理缓存、去重、持久化
   */
  private async fetchWithCache(
    key: DataKey,
    options: FetchOptions = {}
  ): Promise<any> {
    const { forceRefresh = false, useStorage = true } = options;
    const url = this.getUrl(key);

    // 1) 内存缓存
    if (!forceRefresh) {
      const mem = this.memoryCache.get(key);
      if (mem && Date.now() - mem.timestamp < this.TTL) {
        return mem.data;
      }
    }

    // 2) localStorage 缓存（仅当启用且未强制刷新）
    if (!forceRefresh && useStorage && storageController.isAllowed()) {
      const storageKey = this.getStorageKey(key);
      const raw = storageController.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const ts = parsed._timestamp || 0;
          if (Date.now() - ts < this.TTL) {
            delete parsed._timestamp;
            // 同时存入内存
            this.memoryCache.set(key, { data: parsed, timestamp: ts });
            return parsed;
          }
        } catch {
          // 解析失败则忽略，继续网络请求
        }
      }
    }

    // 3) 并发去重
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    // 4) 发起网络请求
    const promise = this.doFetch(url)
      .then((data) => {
        // 更新内存
        this.memoryCache.set(key, { data, timestamp: Date.now() });

        // 更新 localStorage（如果启用）
        if (useStorage && storageController.isAllowed()) {
          const storageKey = this.getStorageKey(key);
          const toStore = { ...data, _timestamp: Date.now() };
          storageController.setItem(storageKey, JSON.stringify(toStore));
        }

        return data;
      })
      .catch((err) => {
        // 如果网络失败，但内存中有旧缓存（即使过期），仍然返回，避免白屏
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
   * 实际网络请求（带时间戳破坏缓存）
   */
  private async doFetch(url: string): Promise<any> {
    const finalUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
    const res = await fetch(finalUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
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
   * 清空所有缓存（包括内存和 localStorage）
   */
  clearCache(): void {
    // 清空内存
    this.memoryCache.clear();
    this.pending.clear();

    // 清空 localStorage（仅清除我们自己的键）
    if (storageController.isAllowed()) {
      const keys = [
        CONFIG.STORAGE_KEYS.ARTICLES_DATA,
        CONFIG.STORAGE_KEYS.WORKS_DATA,
        'statistics_cache',
        'code_analysis_cache',
        'friends_cache',
        'version_cache',
      ];
      for (const k of keys) {
        try {
          storageController.removeItem(k as any);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * 预热缓存（预加载常用数据，不阻塞）
   */
  warmup(): void {
    const service = DataService.getInstance();
    // 异步加载，不等待
    service.getArticles().catch(() => {});
    service.getWorks().catch(() => {});
    service.getStatistics().catch(() => {});
  }
}

// ==================== 导出单例实例（方便直接导入） ====================

export const dataService = DataService.getInstance();

// 默认导出单例
export default dataService;