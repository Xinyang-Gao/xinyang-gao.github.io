// /js/core/modal-base.ts
// 通用模态框基础设施：遮罩、容器、生命周期、关闭逻辑
// 具体 UI 内容由调用方通过 content 参数提供

export interface ModalInstance {
  /** 遮罩层元素 */
  overlay: HTMLElement;
  /** 内容容器元素 */
  container: HTMLElement;
  /** 关闭 */
  close: () => void;
  /** 是否已关闭 */
  isClosed: () => boolean;
}

export interface ModalOptions {
  /** 遮罩层类名（默认 'modal-overlay'） */
  overlayClass?: string;
  /** 内容容器类名（默认 'modal-envelope'） */
  containerClass?: string;
  /** 内容：字符串会被 innerHTML 注入；HTMLElement 直接挂载；函数接受容器自行构建 */
  content: string | HTMLElement | ((container: HTMLElement) => void);
  /** 容器是否放在遮罩层内部（默认 false，两者为兄弟节点） */
  containerInOverlay?: boolean;
  /** 关闭动画时长（毫秒），默认 400 */
  closeDuration?: number;
  /** Esc 是否关闭，默认 true */
  closeOnEsc?: boolean;
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlayClick?: boolean;
  /** 是否自动添加 .active 类触发打开动画（默认 true） */
  autoActivate?: boolean;
  /** 打开动画前的钩子（用于锚点动画等自定义） */
  onOpening?: (instance: ModalInstance) => void;
  /** 关闭动画结束、DOM 移除后的回调 */
  onClosed?: () => void;
}

let currentModal: ModalInstance | null = null;

/** 关闭当前模态框（若有） */
export function closeCurrentModal(): void {
  currentModal?.close();
  currentModal = null;
}

/**
 * 创建一个模态框，返回其实例。
 * 若已存在模态框，会先关闭旧的（单例约定）。
 */
export function createModal(options: ModalOptions): ModalInstance {
  closeCurrentModal();

  const {
    overlayClass = 'modal-overlay',
    containerClass = 'modal-envelope',
    content,
    containerInOverlay = false,
    closeDuration = 400,
    closeOnEsc = true,
    closeOnOverlayClick = true,
    autoActivate = true,
    onOpening,
    onClosed,
  } = options;

  // ---------- DOM 结构 ----------
  const overlay = document.createElement('div');
  overlay.className = overlayClass;

  const container = document.createElement('div');
  container.className = containerClass;

  if (typeof content === 'string') {
    container.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    container.appendChild(content);
  } else {
    content(container);
  }

  if (containerInOverlay) {
    overlay.appendChild(container);
    document.body.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
    document.body.appendChild(container);
  }

  // ---------- 生命周期 ----------
  let closed = false;
  const cleanupFns: Array<() => void> = [];

  const doCleanup = (): void => {
    const list = cleanupFns;
    cleanupFns.length = 0;
    // 逆序清理
    for (let i = list.length - 1; i >= 0; i--) {
      try {
        list[i]();
      } catch (e) {
        console.warn('[Modal] cleanup error:', e);
      }
    }
  };

  const close = (): void => {
    if (closed) return;
    closed = true;

    doCleanup();

    container.classList.remove('active');
    overlay.classList.remove('active');

    window.setTimeout(() => {
      container.remove();
      overlay.remove();
      if (currentModal === instance) currentModal = null;
      onClosed?.();
    }, closeDuration);
  };

  // ---------- 事件绑定 ----------
  if (closeOnEsc) {
    const escHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', escHandler);
    cleanupFns.push(() => document.removeEventListener('keydown', escHandler));
  }

  if (closeOnOverlayClick) {
    const overlayHandler = (e: MouseEvent): void => {
      // 只有直接点击遮罩本身才关闭（避免 containerInOverlay=true 时误触）
      if (e.target === overlay) close();
    };
    overlay.addEventListener('click', overlayHandler);
    cleanupFns.push(() => overlay.removeEventListener('click', overlayHandler));
  }

  const instance: ModalInstance = {
    overlay,
    container,
    close,
    isClosed: () => closed,
  };

  currentModal = instance;

  // ---------- 打开动画 ----------
  onOpening?.(instance);

  if (autoActivate) {
    requestAnimationFrame(() => {
      if (!closed) {
        container.classList.add('active');
        overlay.classList.add('active');
      }
    });
  }

  return instance;
}