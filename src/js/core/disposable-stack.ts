// /js/core/disposable-stack.ts
// 资源清理栈：集中管理定时器、事件监听、Observer 等需要手动释放的资源

type Disposer = () => void;

export class DisposableStack {
  private disposers: Disposer[] = [];
  private _disposed = false;

  get disposed(): boolean {
    return this._disposed;
  }

  /** 添加任意清理函数 */
  add(disposer: Disposer): void {
    if (this._disposed) {
      // 已释放：立即执行传入的清理，避免泄漏
      try {
        disposer();
      } catch (e) {
        console.warn('[DisposableStack] deferred dispose error:', e);
      }
      return;
    }
    this.disposers.push(disposer);
  }

  /** 添加事件监听，dispose 时自动移除 */
  addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void {
    target.addEventListener(type, listener, options);
    this.add(() => target.removeEventListener(type, listener, options));
  }

  /** 添加 setInterval 返回的 ID */
  addInterval(id: ReturnType<typeof setInterval>): void {
    this.add(() => clearInterval(id as number));
  }

  /** 添加 setTimeout 返回的 ID */
  addTimeout(id: ReturnType<typeof setTimeout>): void {
    this.add(() => clearTimeout(id as number));
  }

  /** 添加带 disconnect() 的对象（IntersectionObserver / MutationObserver / ResizeObserver） */
  addObserver(observer: { disconnect: () => void }): void {
    this.add(() => observer.disconnect());
  }

  /** 添加带 abort() 的对象（AbortController） */
  addAbortController(ac: AbortController): void {
    this.add(() => ac.abort());
  }

  /** 释放所有资源，按添加顺序逆序执行（LIFO） */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const list = this.disposers;
    this.disposers = [];
    for (let i = list.length - 1; i >= 0; i--) {
      try {
        list[i]();
      } catch (e) {
        console.warn('[DisposableStack] dispose error:', e);
      }
    }
  }
}