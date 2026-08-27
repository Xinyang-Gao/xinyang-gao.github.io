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
      maxWidth: '300px',
      overflow: 'visible',
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

  private show(target: HTMLElement, rawText: string, clientX: number, clientY: number) {
    // 强制清理残留
    if (this.isHiding || this.isVisible) {
      this.hideImmediate();
    }

    if (this.typeTimer) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }

    const text = rawText.replace(/\\n/g, '\n');

    // 测量尺寸（增加 2px 冗余以防止末尾字符换行溢出）
    const measure = document.createElement('div');
    const style = getComputedStyle(target);
    Object.assign(measure.style, {
      position: 'fixed',
      visibility: 'hidden',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontSize: '0.9rem',
      lineHeight: '1.5',
      padding: '8px 14px',
      maxWidth: '300px',
      fontFamily: style.fontFamily || 'inherit',
    });
    measure.textContent = text;
    document.body.appendChild(measure);
    const rect = measure.getBoundingClientRect();
    const measuredWidth = Math.ceil(rect.width);
    const measuredHeight = Math.ceil(rect.height);
    document.body.removeChild(measure);

    // 最终尺寸：宽度 + 2px 冗余，但不超过最大宽度
    const finalWidth = Math.min(measuredWidth + 2, 300);
    const finalHeight = measuredHeight;

    // 构建字符行（保留换行）
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

    if (this.textEl) {
      this.textEl.innerHTML = '';
      this.textEl.style.width = finalWidth + 'px';
      this.textEl.style.height = finalHeight + 'px';
      this.textEl.appendChild(fragment);
      this.textEl.style.opacity = '1';
    }

    // 定位（基于鼠标坐标，带弹性跟随）
    let left = clientX + this.offsetX;
    let top = clientY + this.offsetY;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    if (left + finalWidth > vw) left = clientX - finalWidth - this.offsetX;
    if (left < 0) left = 10;
    if (top + finalHeight > vh) top = clientY - finalHeight - this.offsetY;
    if (top < 0) top = 10;

    if (this.container) {
      this.container.style.left = left + 'px';
      this.container.style.top = top + 'px';
      this.container.style.opacity = '1';
    }

    // 获取所有字符，计算总显示时间
    const chars = this.textEl?.querySelectorAll('.tooltip-char') || [];
    const totalChars = chars.length;
    // 每个字符显示间隔 30ms，背景过渡与总时间同步
    const duration = Math.max(totalChars * 30, 300); // 至少 300ms 避免闪烁

    // 背景扩展：从 0 到最终尺寸，过渡时长与字符浮现总时间一致
    if (this.bg) {
      // 重置为 0，强制重排
      this.bg.style.width = '0px';
      this.bg.style.height = '0px';
      this.bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';
      void this.bg.offsetHeight;

      // 设置动态过渡时长（仅宽度和高度使用长过渡，边框和透明度保持短过渡）
      this.bg.style.transition = `width ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), height ${duration}ms cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease`;

      // 扩展到最终尺寸
      this.bg.style.width = finalWidth + 'px';
      this.bg.style.height = finalHeight + 'px';
    }

    // 逐字浮现
    let index = 0;
    this.typeTimer = window.setInterval(() => {
      if (index < chars.length) {
        (chars[index] as HTMLElement).style.opacity = '1';
        index++;
      } else {
        clearInterval(this.typeTimer!);
        this.typeTimer = null;
        // 全部显示后，添加边框
        if (this.bg) {
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          const borderColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
          this.bg.style.boxShadow = `0 0 0 2px ${borderColor}`;
        }
      }
    }, 30);

    // 鼠标跟随
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
    const width = parseFloat(this.bg?.style.width || '0');
    const height = parseFloat(this.bg?.style.height || '0');
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

    // 1. 边框淡出（0.15s）
    bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';

    // 2. 等待边框消失后，背景收缩成线（高度→2px，底部固定）
    setTimeout(() => {
      if (!this.isHiding) return;
      const rect = bg.getBoundingClientRect();
      const oldTop = parseFloat(bg.style.top) || 0;
      const oldHeight = parseFloat(bg.style.height) || 0;
      const newTop = oldTop + oldHeight - 2; // 底部固定
      bg.style.top = newTop + 'px';
      bg.style.height = '2px';
      bg.style.transition =
        'height 0.2s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.2s cubic-bezier(0.34, 1.2, 0.64, 1)';

      // 3. 等待线形成后，缩成点（宽度→2px，水平居中）
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

        // 4. 淡出背景和容器（0.15s）
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

    // 文字竖直下落（与背景收缩并行）
    const chars = this.textEl?.querySelectorAll('.tooltip-char') || [];
    if (chars.length > 0) {
      let completed = 0;
      const total = chars.length;
      chars.forEach((char: HTMLElement) => {
        const delay = Math.random() * 200;
        const duration = 300 + Math.random() * 300;
        const distance = 30 + Math.random() * 50;
        char.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.4, 1) ${delay}ms, opacity ${duration}ms ease ${delay}ms`;
        char.style.transform = `translateY(${distance}px)`;
        char.style.opacity = '0';
        const onFinish = () => {
          completed++;
          // 全部完成时不需要额外操作，resetElements 会清空
        };
        char.addEventListener('transitionend', onFinish, { once: true });
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
      this.textEl.style.width = '';
      this.textEl.style.height = '';
    }
    if (this.bg) {
      this.bg.style.width = '0';
      this.bg.style.height = '0';
      this.bg.style.opacity = '1';
      this.bg.style.boxShadow = '0 0 0 0 rgba(0,0,0,0)';
      this.bg.style.top = '0';
      this.bg.style.left = '0';
      // 恢复默认过渡（与创建时一致）
      this.bg.style.transition =
        'width 0.4s cubic-bezier(0.34, 1.2, 0.64, 1), height 0.4s cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s ease, opacity 0.15s ease';
    }
    if (this.container) {
      this.container.style.opacity = '0';
    }
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