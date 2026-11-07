// /js/types/globals.d.ts
// 全站 window 扩展的唯一声明处（此前散落在 core / router / article /
// stats-manager / twikoo-manager 等文件的 declare global 中，且有遗漏——
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
    /** APlayer 由 vendor 脚本以 UMD 全局注入（改版：Vue 3 玻璃拟态悬浮播放器） */
    APlayer?: new (
      options: APlayerOptions,
    ) => APlayerInstance;
    /** 播放器外部控制接口，由 vendor/global-music-player.ts 挂载 */
    __musicPlayer?: MusicPlayerController;
  }

  /** APlayer 构造参数（container 必填，其余可选） */
  interface APlayerOptions {
    container: HTMLElement;
    audio?: Array<{
      name?: string;
      artist?: string;
      url: string;
      cover?: string;
      lrc?: string;
    }>;
    playlistId?: string;
    server?: string;
    type?: string;
    api?: string;
    volume?: number;
    lyrics?: boolean;
    /** 'widget' 悬浮小卡 / 'full' 全屏卡片 */
    mode?: 'widget' | 'full';
    visible?: boolean;
    /** 空闲多久后折叠（毫秒，仅悬浮形态） */
    collapseDelay?: number;
  }

  /** APlayer 实例：播放控制 + 形态 / 显隐 / 外观 */
  interface APlayerInstance {
    audio: HTMLAudioElement | null;
    playlist: unknown[];
    play(): void;
    pause(): void;
    toggle(): void;
    next(): void;
    prev(): void;
    switchTo(index: number): void;
    seek(seconds: number): void;
    volume(value?: number): number | void;
    scale(value?: number): void;
    /** 形态：不传值读取，传值设置 */
    mode(value?: string): string | void;
    setMode(mode: string): void;
    toggleMode(): void;
    getMode(): string;
    /** 显隐：不传值读取，传值设置 */
    visible(value?: boolean): boolean | void;
    setVisible(visible: boolean): void;
    show(): void;
    hide(): void;
    toggleVisible(): void;
    getVisible(): boolean;
    /** 背景外观：{ opacity, blur } 改当前形态；{ widgetOpacity } / { fullBlur } 指定形态 */
    style(patch?: Record<string, number>): PlayerAppearance | void;
    getAppearance(): PlayerAppearance;
    setAppearance(patch: Record<string, number>): void;
    lyrics(value?: boolean): boolean | void;
    setLyricsVisible(visible: boolean): void;
    getLyricsVisible(): boolean;
    position(
      value?: { left: number; top: number } | null,
    ): { left: number; top: number } | null | void;
    setPosition(position: { left: number; top: number } | null): void;
    lyricsPosition(value?: Record<string, number | boolean>): void;
    setLyricsPosition(position: Record<string, number | boolean>): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    destroy(): void;
    [key: string]: unknown;
  }

  /** 两种形态各自的背景外观 */
  interface PlayerAppearance {
    widget: { opacity: number; blur: number };
    full: { opacity: number; blur: number };
  }

  /** 站点侧封装：播放器未就绪时调用只告警不抛错 */
  interface MusicPlayerController {
    readonly ready: boolean;
    play(): void;
    pause(): void;
    toggle(): void;
    next(): void;
    prev(): void;
    setMode(mode: string): void;
    toggleMode(): void;
    getMode(): string | undefined;
    show(): void;
    hide(): void;
    toggleVisible(): void;
    setVisible(visible: boolean): void;
    getVisible(): boolean | undefined;
    setAppearance(patch: Record<string, number>): void;
    getAppearance(): PlayerAppearance | undefined;
    setLyricsVisible(visible: boolean): void;
    toggleLyrics(): void;
    getLyricsVisible(): boolean | undefined;
    setPosition(position: { left: number; top: number } | null): void;
    setLyricsPosition(position: Record<string, number | boolean>): void;
    destroy(): void;
  }
}
