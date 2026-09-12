// /js/pages/stats/chart-registry.ts
// 图表注册表：集中管理图表定义与上下文类型
// 主类 StatsManager 只负责数据获取与布局，图表逻辑全部外置到 charts.ts

// ==================== 数据类型 ====================

export interface StatisticsData {
  total_articles?: number;
  total_works?: number;
  total_word_count?: number;
  total_article_tags?: number;
  total_work_tags?: number;
  total_update_days?: number;
  version?: string;
  last_updated?: string;
  last_updated_full?: string;
  article_categories?: Array<{ name: string; count: number }>;
  article_tags?: Array<{ name: string; count: number }>;
  work_tags?: Array<{ name: string; count: number }>;
  [key: string]: unknown;
}

export interface ArticleItem {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  date?: string;
  last_updated?: string;
  word_count?: number;
  read_time?: string | number;
  hidden?: boolean;
  author?: string;
  [key: string]: unknown;
}

export interface WorkItem {
  title?: string;
  description?: string;
  tags?: string[];
  tag?: string[];
  date?: string;
  [key: string]: unknown;
}

export interface CodeExtensionStats {
  extension: string;
  count: number;
  total_lines?: number;
  non_empty_lines?: number;
  [key: string]: unknown;
}

export interface CodeAnalysisData {
  total_files?: number;
  total_lines?: number;
  non_empty_lines?: number;
  total_size_bytes?: number;
  by_extension?: CodeExtensionStats[];
  [key: string]: unknown;
}

// ==================== 渲染上下文 ====================

/** 汇总数据包：所有图表共享的一份数据 */
export interface StatsDataBundle {
  statistics: StatisticsData;
  articlesList: ArticleItem[];
  worksList: WorkItem[];
  codeAnalysis: CodeAnalysisData;
}

/** 主题色（由 StatsManager 根据 data-theme 提供） */
export interface ChartColors {
  textColor: string;
  gridColor: string;
  accent: string;
}

/** 单个图表渲染时接收的上下文 */
export interface ChartContext {
  /** canvas 2d context */
  ctx: CanvasRenderingContext2D;
  /** 数据包 */
  data: StatsDataBundle;
  /** 主题色 */
  colors: ChartColors;
  /** Chart.js 构造函数（避免全局依赖） */
  Chart: any;
  /** 注册图表实例，以便 StatsManager 统一销毁 */
  register: (chart: any) => void;
}

/** 图表定义 */
export interface ChartDefinition {
  /** canvas 的 id，需全局唯一 */
  id: string;
  /** 卡片标题 */
  title: string;
  /** 卡片图标（可选，FontAwesome 类名或 emoji） */
  icon?: string;
  /** 卡片副标题（可选） */
  subtitle?: string;
  /** 渲染函数 */
  render: (context: ChartContext) => void;
}

// ==================== 注册表 ====================

const defs: ChartDefinition[] = [];

/**
 * 注册一个图表定义。
 * 若 id 重复会警告并忽略，避免覆盖已有定义。
 */
export function registerChart(def: ChartDefinition): void {
  if (defs.some((d) => d.id === def.id)) {
    console.warn(`[ChartRegistry] 图表 id 重复: ${def.id}，已忽略`);
    return;
  }
  defs.push(def);
}

/** 获取所有图表定义（只读） */
export function getChartDefinitions(): readonly ChartDefinition[] {
  return defs;
}

/** 清空注册表（仅用于测试） */
export function clearChartRegistry(): void {
  defs.length = 0;
}