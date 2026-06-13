// /js/ui/personal-card.js
// 个人信息卡片渲染器（带缓存，避免重复渲染导致闪烁）

let cachedHTML = null;

export function generatePersonalCardHTML() {
  return `
    <div class="profile-card">
      <div class="profile-avatar">
        <img src="/assets/avatar.webp" alt="高新炀的头像" class="avatar-img" onerror="this.src='https://via.placeholder.com/140?text=GXY'">
        <h2 class="profile-name">高新炀</h2>
        <div class="profile-bio">一个15岁爱探索的小孩子~</div>
      </div>
      <div class="profile-details">
        <div class="detail-item">
          <i class="fas fa-quote-left"></i>
          <span>「 Where there's a will, there's a way 」</span>
        </div>
        <div class="detail-item">
          <i class="fas fa-envelope"></i>
          <a href="mailto:gao-xinyang@foxmail.com">gao-xinyang@foxmail.com</a>
        </div>
        <div class="detail-item">
          <i class="fas fa-globe"></i>
          <span>中国 · 河南</span>
        </div>
        <div class="detail-item">
          <i class="fas fa-code"></i>
          <span>Java / Python</span>
        </div>
        <div class="social-links-side">
          <a href="https://github.com/Xinyang-Gao" target="_blank" class="social-icon-link" aria-label="GitHub" rel="noopener noreferrer">
            <i class="fab fa-github"></i>
          </a>
          <a href="https://space.bilibili.com/1064600697" target="_blank" class="social-icon-link" aria-label="Bilibili" rel="noopener noreferrer">
            <i class="fab fa-bilibili"></i>
          </a>
          <a href="mailto:gao_xinyang@foxmail.com" class="social-icon-link" aria-label="邮箱">  
            <i class="fas fa-envelope"></i>
          </a>
          <a href="https://user.qzone.qq.com/2489083744/" target="_blank" class="social-icon-link" aria-label="QQ" rel="noopener noreferrer">
            <i class="fab fa-qq"></i>
          </a>
          <a href="/rss.xml" target="_blank" class="social-icon-link" aria-label="RSS" rel="noopener noreferrer">
            <i class="fas fa-rss"></i>
          </a>
        </div>
        <div class="detail-item" style="justify-content: center; margin-top: 12px;">
          <span class="tag" style="background: var(--accent-color); color: white;">Python</span>
          <span class="tag" style="background: var(--accent-color); color: white;">Html</span>
          <span class="tag" style="background: var(--accent-color); color: white;">Scratch</span>
          <span class="tag" style="background: var(--accent-color); color: white;">绘画</span>
          <span class="tag" style="background: var(--accent-color); color: white;">轮滑</span>
          <span class="tag" style="background: var(--accent-color); color: white;">Minecraft</span>
        </div>
      </div>
    </div>
  `;
}

export function renderPersonalCard() {
  const container = document.getElementById('personal-card-container');
  if (!container) return;

  // 生成并缓存 HTML（仅第一次）
  if (!cachedHTML) {
    cachedHTML = generatePersonalCardHTML();
  }

  // 仅在内容不同时才更新 DOM，避免闪烁
  if (container.innerHTML !== cachedHTML) {
    container.innerHTML = cachedHTML;
  }
}

// 自动监听事件，无需外部显式调用
if (typeof window !== 'undefined') {
  const init = () => renderPersonalCard();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('ajax:navigation', init);
}