// /js/core/scroll-dispatcher.ts
// 全局滚动事件分发器：单监听 + rAF 节流，多订阅者共享

type ScrollListener = (scrollY: number) => void;

class ScrollDispatcher {
  private listeners = new Set<ScrollListener>();
  private ticking = false;
  private lastY = 0;
  private bound = false;

  private handleScroll = (): void => {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.ticking = false;
      this.lastY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      this.listeners.forEach((cb) => {
        try {
          cb(this.lastY);
        } catch (e) {
          console.warn('[ScrollDispatcher] listener error:', e);
        }
      });
    });
  };

  /**
   * 订阅滚动事件。订阅时立即以当前值同步调用一次。
   * @returns 取消订阅函数
   */
  subscribe(cb: ScrollListener): () => void {
    this.listeners.add(cb);

    if (!this.bound) {
      this.bound = true;
      this.lastY = window.scrollY || document.documentElement.scrollTop || 0;
      window.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    // 立即同步一次
    cb(this.lastY);

    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.bound) {
        this.bound = false;
        window.removeEventListener('scroll', this.handleScroll);
      }
    };
  }

  /** 当前滚动位置（缓存值，无需读 DOM） */
  getScrollY(): number {
    return this.lastY;
  }
}

export const scrollDispatcher = new ScrollDispatcher();