// /js/types/globals.d.ts
// 全站 window 扩展的唯一声明处（曾散落在 core/router/article/stats-manager/
// twikoo-manager/clarity 等 6 个文件的 declare global 中，且有遗漏——
// 漏声明的属性只能靠 (window as any) 绕过，此处统一收口）。

export {};

import type { ScrollReveal } from '/js/ui/ui-effects.js';

declare global {
  interface Window {
    /** SPA 路由：拉取并替换页面内容（history 模式导航） */
    fetchAndReplaceContent?: (
      url: string,
      pushState?: boolean,
      scrollData?: { x: number; y: number } | null,
      retryCount?: number,
      isPopState?: boolean,
    ) => Promise<boolean>;
    /** 重新计算滚动揭示动画的观察目标（列表内容更新后调用） */
    refreshScrollReveal?: (root?: ParentNode) => void;
    /** 注销所有 Service Worker 并清空 Cache Storage 后刷新 */
    clearAllServiceWorkerCache?: () => Promise<void>;
    /** ui-effects 挂载的滚动揭示实例（settings/router 以 window 形式访问） */
    scrollRevealInstance?: ScrollReveal;
    /** APlayer 由 vendor 脚本以 UMD 全局注入 */
    APlayer?: new (
      options: Record<string, unknown>,
    ) => {
      destroy: () => void;
      list: { switch?: (index: number) => void; audio?: unknown[] };
      [key: string]: unknown;
    };
  }
}
