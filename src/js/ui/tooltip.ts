export class TooltipManager {
  private container: HTMLElement | null = null;
  private bg: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private typeTimer: number | null = null;
  private hideTimer: number | null = null;
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
      transition: 'left 0.18s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.18s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.3s ease',
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
    if (this.currentTarget === tooltipTarget && this.isVisible) return;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.isVisible || this.isHiding) {
      this.hideImmediate();
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

  // ----- 独立的精确测量函数（使用 inline-block）-----
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
    const margin = 10;
    // needWrap 判断基于原始宽度（不加冗余）
    const estimatedLeft = this.mouseX + this.offsetX;
    const needWrap = maxWidth === undefined && (estimatedLeft + width > vw && this.mouseX - width - this.offsetX < 0);

    return { width, height, needWrap };
  }

  private show(target: HTMLElement, rawText: string, clientX: number, clientY: number) {
    if (this.isHiding || this.isVisible) {
      this.hideImmediate();
    }

    if (this.typeTimer) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }

    const text = rawText.replace(/\\n/g, '\n');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 10;

    // ---------- 1. 测量自然宽度 ----------
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

    // ---------- 3. 添加 2px 安全冗余（防止亚像素换行） ----------
    finalWidth += 2;
    // 如果换行模式下，宽度不能超过最大宽度（允许 +2px）
    if (needWrap) {
      const maxWidth = Math.max(100, vw - margin * 2);
      if (finalWidth > maxWidth + 2) finalWidth = maxWidth + 2;
    }

    // ---------- 4. 计算位置 ----------
    let left = clientX + this.offsetX;
    if (left + finalWidth > vw) {
      left = clientX - finalWidth - this.offsetX;
    }
    if (left < 0) left = margin;

    let top = clientY + this.offsetY;
    if (top + finalHeight > vh) {
      top = clientY - finalHeight - this.offsetY;
    }
    if (top < 0) top = margin;

    // ---------- 5. 缓存尺寸 ----------
    this.finalWidth = finalWidth;
    this.finalHeight = finalHeight;

    // ---------- 6. 构建内容 ----------
    const textEl = this.textEl!;
    textEl.innerHTML = '';
    textEl.style.width = finalWidth + 'px';
    textEl.style.maxWidth = needWrap ? (vw - margin * 2) + 'px' : 'none';
    textEl.style.opacity = '0';

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
        span.style.transition = 'opacity 0.1s';
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
    bg.style.width = '0px';
    bg.style.height = '0px';
    bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';
    void bg.offsetHeight;
    const totalChars = textEl.querySelectorAll('.tooltip-char').length;
    const duration = Math.max(totalChars * 30, 300);
    bg.style.transition = `width ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), height ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease`;
    bg.style.width = finalWidth + 'px';
    bg.style.height = finalHeight + 'px';

    // ---------- 9. 逐字浮现 ----------
    const chars = textEl.querySelectorAll('.tooltip-char');
    let index = 0;
    this.typeTimer = window.setInterval(() => {
      if (index < chars.length) {
        (chars[index] as HTMLElement).style.opacity = '1';
        index++;
      } else {
        clearInterval(this.typeTimer!);
        this.typeTimer = null;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const borderColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
        bg.style.boxShadow = `0 0 0 2px ${borderColor}`;
      }
    }, 30);

    textEl.style.opacity = '1';

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
    if (this.typeTimer) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
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

    setTimeout(() => {
      if (!this.isHiding) return;
      const rect = bg.getBoundingClientRect();
      const oldTop = parseFloat(bg.style.top) || 0;
      const oldHeight = parseFloat(bg.style.height) || 0;
      const newTop = oldTop + oldHeight - 2;
      bg.style.top = newTop + 'px';
      bg.style.height = '2px';
      bg.style.transition =
        'height 0.2s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.2s cubic-bezier(0.34, 1.2, 0.64, 1)';

      setTimeout(() => {
        if (!this.isHiding) return;
        const rect2 = bg.getBoundingClientRect();
        const oldLeft = parseFloat(bg.style.left) || 0;
        const oldWidth = parseFloat(bg.style.width) || 0;
        const newLeft = oldLeft + oldWidth / 2 - 1;
        bg.style.left = newLeft + 'px';
        bg.style.width = '2px';
        bg.style.transition =
          'width 0.2s cubic-bezier(0.34, 1.2, 0.64, 1), left 0.2s cubic-bezier(0.34, 1.2, 0.64, 1)';

        setTimeout(() => {
          if (!this.isHiding) return;
          bg.style.opacity = '0';
          container.style.opacity = '0';
          setTimeout(() => {
            if (this.isHiding) {
              this.resetElements();
              this.isVisible = false;
              this.isHiding = false;
              this.currentTarget = null;
            }
          }, 150);
        }, 200);
      }, 200);
    }, 150);

    const chars = this.textEl?.querySelectorAll('.tooltip-char') || [];
    if (chars.length > 0) {
      chars.forEach((char: HTMLElement) => {
        const delay = Math.random() * 200;
        const duration = 300 + Math.random() * 300;
        const distance = 30 + Math.random() * 50;
        char.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.4, 1) ${delay}ms, opacity ${duration}ms ease ${delay}ms`;
        char.style.transform = `translateY(${distance}px)`;
        char.style.opacity = '0';
      });
    }
  }

  private hideImmediate() {
    if (this.typeTimer) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
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
    if (this.typeTimer) clearInterval(this.typeTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
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