// /js/types/data.ts

export interface Article {
  id?: string | number;
  title: string;
  description?: string;
  url?: string;
  link?: string;
  date?: string;
  last_updated?: string;
  updated_date?: string;
  tags?: string[];
  tag?: string[] | string;
  category?: string;
  word_count?: number;
  read_time?: string;
  author?: string;
  hidden?: boolean;
  /** 封面图片地址（可选，列表项会作为背景显示） */
  cover?: string;
}

export interface Work {
  id?: string | number;
  title: string;
  description?: string;
  url?: string;
  link?: string;
  date?: string;
  tags?: string[];
  tag?: string[] | string;
  /** 封面图片地址（可选，列表项会作为背景显示） */
  cover?: string;
  /** 是否已归档（不再维护） */
  archived?: boolean;
}

/**
 * 搜索 / 列表场景的通用条目。
 * 后端 JSON 中文章与作品字段并不完全一致（作品无 word_count / last_updated），
 * 因此这里用「全字段可选」的独立结构，避免列表页到处 `as any` 断言。
 */
export interface Item {
  id?: string | number;
  title?: string;
  description?: string;
  url?: string;
  link?: string;
  date?: string;
  last_updated?: string;
  updated_date?: string;
  tags?: string[];
  tag?: string[] | string;
  category?: string;
  word_count?: number;
  read_time?: string;
  author?: string;
  hidden?: boolean;
  /** 封面图片地址（可选，列表项会作为背景显示） */
  cover?: string;
  /** 是否已归档（不再维护），目前仅作品有此项 */
  archived?: boolean;
  [key: string]: unknown;
}

export interface ArticlesPayload {
  articles: Article[];
  total?: number;
}

export interface WorksPayload {
  works: Work[];
  total?: number;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface StatisticsPayload {
  version?: string | number;
  total_articles?: number;
  total_word_count?: number;
  total_works?: number;
  total_article_categories?: number;
  total_article_tags?: number;
  total_work_tags?: number;
  total_update_days?: number;
  last_updated?: string;
  last_updated_full?: string;
  article_categories?: TagCount[];
  article_tags?: TagCount[];
  work_tags?: TagCount[];
}

export interface CodeExtensionStats {
  extension: string;
  count: number;
  total_lines?: number;
  non_empty_lines?: number;
}

export interface CodeAnalysisData {
  total_files?: number;
  total_lines?: number;
  non_empty_lines?: number;
  total_size_bytes?: number;
  by_extension?: CodeExtensionStats[];
}

export interface FriendItem {
  name: string;
  url: string;
  avatar?: string;
  description?: string;
}

export interface VersionChange {
  type: string;
  description: string;
}

export interface VersionEntry {
  id: number;
  version: string;
  date: string;
  changes: VersionChange[];
  /** 旧式日志（仅有日期、无版本号）为 true */
  is_old?: boolean;
}

/**
 * 单个版本分片的元信息（不含变更正文）。
 * 由 version.json 提供，前端据此按需拉取具体分片。
 */
export interface VersionShardMeta {
  index: number;
  url: string;
  count: number;
  start_id: number;
  end_id: number;
  first_version: string;
  last_version: string;
  start_date: string;
  end_date: string;
  hash?: string;
}

/** version.json：仅索引，体积远小于全量数据 */
export interface VersionIndexPayload {
  generated_at?: string;
  total_versions: number;
  changelog_hash?: string;
  shard_size: number;
  shard_count: number;
  latest_version?: string;
  latest_date?: string;
  shards: VersionShardMeta[];
}

/** 单个分片文件（/json/version/version-N.json）的内容 */
export interface VersionShardPayload {
  index: number;
  count: number;
  start_id: number;
  end_id: number;
  hash?: string;
  versions: VersionEntry[];
}

/** 合并后的完整版本数据（分片全部加载后组装） */
export interface VersionPayload {
  generated_at?: string;
  total_versions?: number;
  versions: VersionEntry[];
}