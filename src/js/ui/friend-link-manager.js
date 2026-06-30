// /js/ui/friend-link-manager.js
// 友链跳转管理器 - 覆盖层从卡片放大至全屏，内容直接显示在覆盖层上
// 点击背景或按 ESC 关闭，无关闭按钮

class FriendLinkManager {
  constructor() {
    this.overlay = null;
    this.contentWrapper = null;
    this.timer = null;
    this.initialized = false;
    this.boundClick = this.handleClick.bind(this);
    this.isClosing = false;
    this._contentTimer = null;
    this._countdownTimer = null;
    this._escHandler = null;
  }

  init() {
    if (this.initialized) return;
    document.querySelectorAll('.friend-card').forEach(card => {
      card.setAttribute('data-friend-link', 'true');
      card.removeEventListener('click', this.boundClick);
      card.addEventListener('click', this.boundClick);
    });
    this.initialized = true;
    console.log('[FriendLinkManager] 初始化完成');
  }

  refresh() {
    this.initialized = false;
    this.init();
  }

  handleClick(e) {
    e.preventDefault();
    const card = e.currentTarget;
    if (this.isClosing) return;

    // 提取卡片信息
    const url = card.getAttribute('href') || '#';
    const name = card.querySelector('.friend-name')?.textContent?.trim() || '未知站点';
    const desc = card.querySelector('.friend-desc')?.textContent?.trim() || '';
    let avatarHtml = '';

    const img = card.querySelector('.avatar-img');
    const placeholder = card.querySelector('.avatar-placeholder');
    if (img && img.src && !img.src.includes('data:image')) {
      avatarHtml = `<img src="${img.src}" alt="${name}的头像" class="friend-link-avatar-img">`;
    } else if (placeholder) {
      const initial = placeholder.textContent?.trim() || '?';
      const bg = placeholder.style.background || 'var(--accent-color)';
      avatarHtml = `<div class="friend-link-avatar-placeholder" style="background:${bg};">${initial}</div>`;
    } else {
      avatarHtml = `<div class="friend-link-avatar-placeholder" style="background:var(--accent-color);">?</div>`;
    }

    const rect = card.getBoundingClientRect();
    this.showOverlay({ name, desc, url, avatarHtml, rect });
  }

  showOverlay({ name, desc, url, avatarHtml, rect }) {
    this.closeOverlay(true);

    // ---- 1. 创建覆盖层 ----
    const overlay = document.createElement('div');
    overlay.className = 'friend-link-overlay';
    // 初始位置和尺寸 = 卡片位置
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.borderRadius = '16px';
    overlay.style.opacity = '0';
    overlay.style.background = 'rgba(0,0,0,0)';
    overlay.style.backdropFilter = 'blur(0px)';
    overlay.style.transition = 'all 0.65s cubic-bezier(0.34, 1.2, 0.64, 1)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.cursor = 'pointer';

    // ---- 2. 内部内容容器（居中） ----
    const content = document.createElement('div');
    content.className = 'friend-link-content';
    content.style.opacity = '0';
    content.style.transform = 'translateY(20px) scale(0.95)';
    content.style.transition = 'opacity 0.5s ease 0.35s, transform 0.5s ease 0.35s';
    content.style.maxWidth = '480px';
    content.style.width = '90%';
    content.style.textAlign = 'center';
    content.style.color = 'white';
    content.style.pointerEvents = 'none'; // 让点击穿透到覆盖层

    // 移除关闭按钮，只保留内容
    content.innerHTML = `
      <div class="friend-link-avatar">${avatarHtml}</div>
      <h2 class="friend-link-name">${this.escapeHtml(name)}</h2>
      <p class="friend-link-desc">${this.escapeHtml(desc)}</p>
      <p class="friend-link-url">${this.escapeHtml(url)}</p>
      <p class="friend-link-hint">即将启程！坐稳扶好，欢迎下次再来玩！</p>
      <div class="friend-link-countdown">
        倒计时 <span class="countdown-number">3</span> 秒
      </div>
      <button class="friend-link-go">立即前往</button>
    `;

    // 让按钮可点击（阻止冒泡到背景）
    const goBtn = content.querySelector('.friend-link-go');
    if (goBtn) {
      goBtn.style.pointerEvents = 'auto';
      goBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.goToUrl(url);
      });
    }

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.contentWrapper = content;
    this.isClosing = false;

    // ---- 3. 点击背景关闭 ----
    overlay.addEventListener('click', (e) => {
      // 只有点击在 overlay 本身（而不是内部元素）才触发关闭
      if (e.target === overlay) {
        this.closeOverlay();
      }
    });

    // ---- 4. ESC 键关闭 ----
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeOverlay();
      }
    };
    document.addEventListener('keydown', this._escHandler);

    // ---- 5. 执行动画 ----
    void overlay.offsetHeight;

    overlay.style.opacity = '1';
    overlay.style.background = 'rgba(0, 0, 0, 0.65)';
    overlay.style.backdropFilter = 'blur(16px) saturate(1.2)';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.borderRadius = '0';

    // ---- 6. 内容延迟出现 ----
    this._contentTimer = setTimeout(() => {
      if (this.isClosing) return;
      content.style.opacity = '1';
      content.style.transform = 'translateY(0) scale(1)';
    }, 400);

    // ---- 7. 倒计时 ----
    this._countdownTimer = setTimeout(() => {
      if (this.isClosing) return;
      let seconds = 3;
      const countdownSpan = content.querySelector('.countdown-number');
      if (!countdownSpan) return;
      this.timer = setInterval(() => {
        seconds--;
        countdownSpan.textContent = seconds;
        if (seconds <= 0) {
          clearInterval(this.timer);
          this.timer = null;
          this.goToUrl(url);
        }
      }, 1000);
    }, 650);
  }

  goToUrl(url) {
    if (this.isClosing) return;
    this.closeOverlay();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  closeOverlay(force = false) {
    if (this.isClosing && !force) return;
    this.isClosing = true;

    // 清理所有定时器
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this._contentTimer) {
      clearTimeout(this._contentTimer);
      this._contentTimer = null;
    }
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }

    // 移除 ESC 监听
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    if (this.overlay) {
      this.overlay.style.transition = 'all 0.35s ease';
      this.overlay.style.opacity = '0';
      this.overlay.style.transform = 'scale(0.92)';
      this.overlay.style.backdropFilter = 'blur(0px)';
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.remove();
        }
        this.overlay = null;
        this.contentWrapper = null;
        this.isClosing = false;
      }, 400);
    } else {
      this.isClosing = false;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
}

export const friendLinkManager = new FriendLinkManager();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => friendLinkManager.init());
} else {
  friendLinkManager.init();
}

window.addEventListener('ajax:navigation', () => friendLinkManager.refresh());