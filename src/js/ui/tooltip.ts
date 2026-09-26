export class TooltipManager {
  private container: HTMLElement | null = null;
  private bg: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private typeRaf: number | null = null;
  private hideTimer: number | null = null;
  /** hide() 退场动画的接力定时器句柄（4 段），销毁时必须全部清掉 */
  private hideAnimTimers: number[] = [];
  private isVisible = false;
  private currentTarget: HTMLElement | null = null;
  private isHiding = false;
  private mouseX = 0;
  private mouseY = 0;
  private moveListener: ((e: MouseEvent) => void) | null = null;
  private readonly offsetX = 16;
  private readonly offsetY = 16;
  private finalWidth = 0;
  private finalHeight = 0;

  constructor() {
    this.createElements();
    this.bindEvents();
  }

  private createElements() {
    const container = document.createElement('div');
    container.className = 'tooltip-container';
    Object.assign(container.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '10000',
      opacity: '0',
      transition:
        'left 0.18s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.18s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.3s ease',
      left: '0',
      top: '0',
    });

    const bg = document.createElement('div');
    bg.className = 'tooltip-bg';
    Object.assign(bg.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      backgroundColor: 'rgba(var(--accent-rgb), 0.85)',
      borderRadius: '6px',
      boxShadow: '0 0 0 0 rgba(0,0,0,0)',
      transition:
        'width 0.4s cubic-bezier(0.34, 1.2, 0.64, 1), height 0.4s cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease',
      opacity: '1',
      overflow: 'visible',
    });

    const textEl = document.createElement('div');
    textEl.className = 'tooltip-text';
    Object.assign(textEl.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      padding: '8px 14px',
      color: '#fff',
      fontSize: '0.9rem',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      opacity: '0',
      transition: 'opacity 0.2s',
      pointerEvents: 'none',
      overflow: 'visible',
      width: 'auto',
      maxWidth: 'none',
    });

    container.appendChild(bg);
    container.appendChild(textEl);
    document.body.appendChild(container);
    this.container = container;
    this.bg = bg;
    this.textEl = textEl;
  }

  private bindEvents() {
    document.addEventListener('mouseover', this.onMouseOver, true);
    document.addEventListener('mouseout', this.onMouseOut, true);
  }

  private onMouseOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tooltipTarget = target.closest('[data-tooltip]');
    if (!tooltipTarget) return;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (this.currentTarget === tooltipTarget && this.isVisible && !this.isHiding) return;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.currentTarget = tooltipTarget as HTMLElement;
    const rawText = tooltipTarget.getAttribute('data-tooltip') || '';
    this.show(tooltipTarget, rawText, e.clientX, e.clientY);
  };

  private onMouseOut = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tooltipTarget = target.closest('[data-tooltip]');
    if (!tooltipTarget) return;
    const related = e.relatedTarget as HTMLElement;
    if (related && tooltipTarget.contains(related)) return;
    if (this.currentTarget === tooltipTarget) {
      this.scheduleHide();
    }
  };

  private scheduleHide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 100);
  }

  private measureText(text: string, maxWidth?: number): { width: number; height: number; needWrap: boolean } {
    const measure = document.createElement('div');
    measure.className = 'tooltip-measure';
    Object.assign(measure.style, {
      position: 'fixed',
      visibility: 'hidden',
      pointerEvents: 'none',
      padding: '8px 14px',
      fontSize: '0.9rem',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily: 'inherit',
      display: 'inline-block',
      width: 'auto',
      maxWidth: maxWidth !== undefined ? maxWidth + 'px' : 'none',
      height: 'auto',
      boxSizing: 'border-box',
    });
    measure.textContent = text;
    document.body.appendChild(measure);
    void measure.offsetHeight;
    const rect = measure.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    document.body.removeChild(measure);

    const vw = window.innerWidth;
    const estimatedLeft = this.mouseX + this.offsetX;
    const needWrap =
      maxWidth === undefined && estimatedLeft + width > vw && this.mouseX - width - this.offsetX < 0;

    return { width, height, needWrap };
  }

  /**
   * 文字退场动画：随机延迟、随机时长、随机距离向下飘散淡出。
   * 隐藏 tooltip 与切换 tooltip 时共用此函数。
   *
   * 关键：分两阶段设置 —— 先写 transition，等 rAF 让浏览器记录初始状态后，
   * 再写目标值。这样即使节点是"刚克隆刚插入"的，transition 也能正常生效。
   */
  private fadeOutChars(chars: NodeListOf<HTMLElement>) {
    const list = Array.from(chars);
    if (list.length === 0) return;

    const distances: number[] = [];
    list.forEach((char) => {
      const delay = Math.random() * 200;
      const duration = 300 + Math.random() * 300;
      const distance = 30 + Math.random() * 50;
      distances.push(distance);
      char.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.4, 1) ${delay}ms, opacity ${duration}ms ease ${delay}ms`;
    });

    // 下一帧应用目标值 —— 确保浏览器已经记录了字符的初始状态（opacity: 1，无 transform）
    requestAnimationFrame(() => {
      list.forEach((char, i) => {
        char.style.transform = `translateY(${distances[i]}px)`;
        char.style.opacity = '0';
      });
    });
  }

  private show(target: HTMLElement, rawText: string, clientX: number, clientY: number) {
    if (this.isHiding) {
      this.hideImmediate();
    }
    const isSwitching = this.isVisible;

    if (this.typeRaf !== null) {
      cancelAnimationFrame(this.typeRaf);
      this.typeRaf = null;
    }

    const text = rawText.replace(/\\n/g, '\n');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 10;

    // ---------- 1. 测量 ----------
    const natural = this.measureText(text);
    let finalWidth = natural.width;
    let finalHeight = natural.height;
    let needWrap = natural.needWrap;

    // ---------- 2. 强制换行 ----------
    if (needWrap) {
      const maxWidth = Math.max(100, vw - margin * 2);
      const wrapped = this.measureText(text, maxWidth);
      finalWidth = wrapped.width;
      finalHeight = wrapped.height;
    }

    // ---------- 3. 安全冗余 ----------
    finalWidth += 2;
    if (needWrap) {
      const maxWidth = Math.max(100, vw - margin * 2);
      if (finalWidth > maxWidth + 2) finalWidth = maxWidth + 2;
    }

    // ---------- 4. 计算位置 ----------
    let left = clientX + this.offsetX;
    if (left + finalWidth > vw) left = clientX - finalWidth - this.offsetX;
    if (left < 0) left = margin;

    let top = clientY + this.offsetY;
    if (top + finalHeight > vh) top = clientY - finalHeight - this.offsetY;
    if (top < 0) top = margin;

    // 关键：保存上一次的尺寸，作为背景过渡的起点（不要从动画中的 getBoundingClientRect 读）
    const prevWidth = this.finalWidth;
    const prevHeight = this.finalHeight;
    this.finalWidth = finalWidth;
    this.finalHeight = finalHeight;

    const textEl = this.textEl!;

    // ---------- 5. 切换时：旧文字克隆为 ghost 层，复用隐藏时的下落动画 ----------
    if (isSwitching && textEl.childElementCount > 0) {
      this.spawnExitGhost(textEl);
    }

    // ---------- 6. 构建新文字内容（与 ghost 下落同时开始）----------
    textEl.innerHTML = '';
    textEl.style.width = finalWidth + 'px';
    textEl.style.maxWidth = needWrap ? vw - margin * 2 + 'px' : 'none';
    textEl.style.opacity = '1';

    const lines = text.split('\n');
    const fragment = document.createDocumentFragment();
    lines.forEach((line) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'tooltip-line';
      lineDiv.style.display = 'block';
      for (const ch of line) {
        const span = document.createElement('span');
        span.className = 'tooltip-char';
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.opacity = '0';
        span.style.transition = 'opacity 0.12s ease-out';
        lineDiv.appendChild(span);
      }
      fragment.appendChild(lineDiv);
    });
    textEl.appendChild(fragment);

    // ---------- 7. 定位容器 ----------
    if (this.container) {
      this.container.style.left = left + 'px';
      this.container.style.top = top + 'px';
      this.container.style.opacity = '1';
    }

    // ---------- 8. 背景动画 ----------
    const bg = this.bg!;
    bg.style.opacity = '1';

    const totalChars = textEl.querySelectorAll('.tooltip-char').length;

    if (isSwitching) {
      // 切换：从"上一次的 final 尺寸"平滑过渡到新尺寸
      // 注意：不要重置 box-shadow，否则已完成的 2px 边框会瞬间消失 → 视觉闪烁
      bg.style.transition = 'none';
      bg.style.width = prevWidth + 'px';
      bg.style.height = prevHeight + 'px';
      void bg.offsetWidth; // 强制重排

      const duration = Math.min(400, Math.max(220, totalChars * 12));
      bg.style.transition = `width ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), height ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease`;
      bg.style.width = finalWidth + 'px';
      bg.style.height = finalHeight + 'px';
    } else {
      // 首次显示：从 0 生长，边框清零后再播
      bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';
      bg.style.transition = 'none';
      bg.style.width = '0px';
      bg.style.height = '0px';
      void bg.offsetHeight;

      const duration = Math.max(totalChars * 24, 260);
      bg.style.transition = `width ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), height ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease`;
      bg.style.width = finalWidth + 'px';
      bg.style.height = finalHeight + 'px';
    }

    // ---------- 9. 逐字浮现 ----------
    const chars = textEl.querySelectorAll<HTMLElement>('.tooltip-char');
    this.startTypeIn(chars, bg);

    // ---------- 10. 鼠标跟随 ----------
    if (!this.moveListener) {
      this.moveListener = (e: MouseEvent) => {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.updatePosition();
      };
      document.addEventListener('mousemove', this.moveListener);
    }

    this.isVisible = true;
    this.isHiding = false;
    this.currentTarget = target;
  }

  private startTypeIn(chars: NodeListOf<HTMLElement>, bg: HTMLElement) {
    const total = chars.length;
    if (total === 0) {
      this.finishTypeIn(bg);
      return;
    }

    // 约 15ms/字，下限 190ms，上限 650ms
    const baseDuration = Math.min(650, Math.max(total * 15, 190));
    const startTime = performance.now();
    let shownCount = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / baseDuration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      let targetCount = Math.floor(eased * total);
      if (targetCount < 1 && t > 0) targetCount = 1;

      while (shownCount < targetCount) {
        chars[shownCount].style.opacity = '1';
        shownCount++;
      }

      if (t < 1) {
        this.typeRaf = requestAnimationFrame(tick);
      } else {
        while (shownCount < total) {
          chars[shownCount].style.opacity = '1';
          shownCount++;
        }
        this.typeRaf = null;
        this.finishTypeIn(bg);
      }
    };

    this.typeRaf = requestAnimationFrame(tick);
  }

  private finishTypeIn(bg: HTMLElement) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    bg.style.boxShadow = `0 0 0 2px ${borderColor}`;
  }

  /**
   * 把旧 textEl 克隆为绝对定位的 ghost 层，只承载退场动画。
   * - ghost 的 z-index 高于新 textEl，让下落动画完整可见，不被新字符遮挡
   * - 内部调用与 hide() 完全相同的 fadeOutChars
   */
  private spawnExitGhost(oldTextEl: HTMLElement) {
    const container = this.container;
    if (!container) return;

    const ghost = oldTextEl.cloneNode(true) as HTMLElement;
    ghost.classList.add('tooltip-text-ghost');
    Object.assign(ghost.style, {
      position: 'absolute',
      top: oldTextEl.style.top || '0',
      left: oldTextEl.style.left || '0',
      width: oldTextEl.style.width || 'auto',
      maxWidth: oldTextEl.style.maxWidth || 'none',
      opacity: '1',
      pointerEvents: 'none',
      zIndex: '1', // 在新 textEl（auto）之上，下落动画完整可见
      transition: 'none',
    });

    // 插入到 textEl 之前（DOM 顺序：bg → ghost → textEl）
    container.insertBefore(ghost, oldTextEl);

    const chars = ghost.querySelectorAll<HTMLElement>('.tooltip-char');
    this.fadeOutChars(chars);

    // 最长 delay 200 + duration 600 = 800ms，留冗余
    setTimeout(() => {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }, 900);
  }

  private updatePosition() {
    if (!this.isVisible || !this.container) return;
    const width = this.finalWidth;
    const height = this.finalHeight;
    let left = this.mouseX + this.offsetX;
    let top = this.mouseY + this.offsetY;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    if (left + width > vw) left = this.mouseX - width - this.offsetX;
    if (left < 0) left = 10;
    if (top + height > vh) top = this.mouseY - height - this.offsetY;
    if (top < 0) top = 10;
    this.container.style.left = left + 'px';
    this.container.style.top = top + 'px';
  }

  private hide() {
    if (this.isHiding || !this.isVisible) return;
    this.isHiding = true;
    if (this.typeRaf !== null) {
      cancelAnimationFrame(this.typeRaf);
      this.typeRaf = null;
    }
    if (this.moveListener) {
      document.removeEventListener('mousemove', this.moveListener);
      this.moveListener = null;
    }

    const bg = this.bg;
    const container = this.container;
    if (!bg || !container) {
      this.resetElements();
      this.isVisible = false;
      this.isHiding = false;
      this.currentTarget = null;
      return;
    }

    bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';

    /**
     * 退场用 4 段接力 setTimeout 实现。句柄必须登记到 hideAnimTimers：
     * 原来它们是无主的，destroy() / hideImmediate() 都清不掉，
     * 实例销毁后仍会继续操作已经 remove 的 container / bg。
     */
    const later = (fn: () => void, delay: number): void => {
      this.hideAnimTimers.push(window.setTimeout(() => {
        if (this.isHiding) fn();
      }, delay));
    };

    later(() => {
      const oldTop = parseFloat(bg.style.top) || 0;
      const oldHeight = parseFloat(bg.style.height) || 0;
      const newTop = oldTop + oldHeight - 2;
      bg.style.top = newTop + 'px';
      bg.style.height = '2px';
      bg.style.transition =
        'height 0.2s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.2s cubic-bezier(0.34, 1.2, 0.64, 1)';

      later(() => {
        const oldLeft = parseFloat(bg.style.left) || 0;
        const oldWidth = parseFloat(bg.style.width) || 0;
        const newLeft = oldLeft + oldWidth / 2 - 1;
        bg.style.left = newLeft + 'px';
        bg.style.width = '2px';
        bg.style.transition =
          'width 0.2s cubic-bezier(0.34, 1.2, 0.64, 1), left 0.2s cubic-bezier(0.34, 1.2, 0.64, 1)';

        later(() => {
          bg.style.opacity = '0';
          container.style.opacity = '0';
          later(() => {
            this.resetElements();
            this.isVisible = false;
            this.isHiding = false;
            this.currentTarget = null;
          }, 150);
        }, 200);
      }, 200);
    }, 150);

    // 文字随机下移散落 —— 与切换共用同一函数
    const chars = this.textEl?.querySelectorAll<HTMLElement>('.tooltip-char');
    if (chars) this.fadeOutChars(chars);
  }

  /** 清掉 hide() 的接力动画定时器 */
  private clearHideAnimTimers(): void {
    for (const id of this.hideAnimTimers) clearTimeout(id);
    this.hideAnimTimers = [];
  }

  private hideImmediate() {
    if (this.typeRaf !== null) {
      cancelAnimationFrame(this.typeRaf);
      this.typeRaf = null;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.clearHideAnimTimers();
    if (this.moveListener) {
      document.removeEventListener('mousemove', this.moveListener);
      this.moveListener = null;
    }
    this.resetElements();
    this.isVisible = false;
    this.isHiding = false;
    this.currentTarget = null;
  }

  private resetElements() {
    if (this.container) {
      this.container.querySelectorAll('.tooltip-text-ghost').forEach((el) => el.remove());
    }
    if (this.textEl) {
      this.textEl.innerHTML = '';
      this.textEl.style.transform = '';
      this.textEl.style.opacity = '0';
      this.textEl.style.transition = '';
      this.textEl.style.width = 'auto';
      this.textEl.style.maxWidth = 'none';
    }
    if (this.bg) {
      this.bg.style.width = '0';
      this.bg.style.height = '0';
      this.bg.style.opacity = '1';
      this.bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';
      this.bg.style.top = '0';
      this.bg.style.left = '0';
      this.bg.style.transition =
        'width 0.4s cubic-bezier(0.34, 1.2, 0.64, 1), height 0.4s cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease';
    }
    if (this.container) {
      this.container.style.opacity = '0';
    }
    this.finalWidth = 0;
    this.finalHeight = 0;
  }

  destroy() {
    document.removeEventListener('mouseover', this.onMouseOver, true);
    document.removeEventListener('mouseout', this.onMouseOut, true);
    if (this.typeRaf !== null) cancelAnimationFrame(this.typeRaf);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.clearHideAnimTimers();
    if (this.moveListener) {
      document.removeEventListener('mousemove', this.moveListener);
      this.moveListener = null;
    }
    if (this.container) this.container.remove();
  }
}

let tooltipInstance: TooltipManager | null = null;

export function initTooltips() {
  if (!tooltipInstance) {
    tooltipInstance = new TooltipManager();
  }
  return tooltipInstance;
}

export function destroyTooltips() {
  if (tooltipInstance) {
    tooltipInstance.destroy();
    tooltipInstance = null;
  }
}