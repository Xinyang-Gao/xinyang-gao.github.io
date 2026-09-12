// /js/core/page-manager.ts
// 页面管理器基类：统一基于 DisposableStack 的资源生命周期管理
// 子类只需在 mount() 中注册监听/定时器/Observer，destroy() 由基类自动完成

import { DisposableStack } from '/js/core/disposable-stack.js';

export interface PageManager {
  init(): void | Promise<void>;
  destroy(): void;
}

/**
 * 页面管理器基类。
 *
 * 使用约定：
 *  - 子类实现 `mount()`，内部通过 `this.stack.*` 注册所有需要清理的资源
 *  - 子类可选实现 `unmount()`，在 stack.dispose() 之前做一些额外收尾（如置空引用）
 *  - 不要直接覆写 `init()` / `destroy()`，如确需覆写请调用 `super.*`
 */
export abstract class PageBase implements PageManager {
  protected stack = new DisposableStack();

  async init(): Promise<void> {
    this.stack = new DisposableStack();
    await this.mount();
  }

  destroy(): void {
    try {
      this.unmount?.();
    } catch (e) {
      console.warn('[PageBase] unmount error:', e);
    }
    this.stack.dispose();
    this.stack = new DisposableStack();
  }

  /** 子类实现：初始化逻辑，所有需清理资源请注册到 this.stack */
  protected abstract mount(): void | Promise<void>;

  /** 可选钩子：在 stack.dispose() 之前做一些额外清理（如置空 DOM 引用） */
  protected unmount?(): void;
}