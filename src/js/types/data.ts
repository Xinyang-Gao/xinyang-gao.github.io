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
}

export interface VersionPayload {
  versions: VersionEntry[];
}