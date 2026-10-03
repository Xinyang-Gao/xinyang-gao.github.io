// /js/pages/stats/chart-registry.ts
// 图表注册表：集中管理图表定义与上下文类型
// 主类 StatsManager 只负责数据获取与布局，图表逻辑全部外置到 charts.ts

// ==================== 数据类型 ====================
// 唯一真源是 /js/types/data.ts（本文件曾与 core.ts、types/data.ts、timeline.ts
// 并行维护四套同构类型，字段漂移后互相赋值报错）。这里全部改为复用/再导出。

import type {
  StatisticsPayload,
  Article,
  Work,
  CodeAnalysisData as BaseCodeAnalysisData,
  CodeExtensionStats as BaseCodeExtensionStats,
} from '/js/types/data.js';

/** 统计数据（= statistics.json 载荷） */
export type StatisticsData = StatisticsPayload;
/** 列表中的文章条目 */
export type ArticleItem = Article;
/** 列表中的作品条目 */
export type WorkItem = Work;
/** 单语言/扩展的代码统计行 */
export type CodeExtensionStats = BaseCodeExtensionStats;
/** 代码分析数据（= code_analysis.json 载荷） */
export type CodeAnalysisData = BaseCodeAnalysisData;

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
