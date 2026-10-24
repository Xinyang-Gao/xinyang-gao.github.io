// /js/data/privacy-content.ts
// 隐私政策的正文与样式：现在是 TS 模块的一部分，不再有独立的 privacy.html 页面。
// 弹窗需要时才 import 进来，样式也是首次打开时才注入 —— 平时不占任何体积。

/** 最近一次修订文案的日期（改文案时同步更新） */
export const PRIVACY_UPDATED = '2026年10月18日';

/**
 * 正文 HTML。
 *
 * 结构与原先的 privacy.html 一致，但去掉了页面外壳（<main> / H1）：
 * 标题由弹窗外壳提供，正文只负责内容。
 */
export const PRIVACY_HTML = `
<header class="privacy-hero">
  <div class="privacy-badges">
    <span class="privacy-badge">不出售数据</span>
    <span class="privacy-badge">本地存储</span>
    <span class="privacy-badge">可随时清除</span>
  </div>
  <span class="last-updated">更新于 ${PRIVACY_UPDATED}</span>
</header>

<section class="privacy-section">
  <h2>数据流向</h2>
  <div class="data-flow">
    <div class="flow-node">
      <i class="fas fa-user"></i><span>你</span>
    </div>
    <span class="flow-arrow">→</span>
    <div class="flow-node flow-node-accent">
      <i class="fas fa-laptop"></i><span>本站</span>
    </div>
    <span class="flow-arrow">→</span>
    <div class="flow-node">
      <i class="fas fa-cloud"></i><span>第三方</span>
    </div>
  </div>
  <p class="privacy-note">偏好与缓存只留在本地；仅必要请求才会到达第三方。</p>
</section>

<section class="privacy-section">
  <h2>本地存了什么</h2>
  <div class="storage-grid">
    <div class="storage-item"><i class="fas fa-palette"></i><span>主题 / 字体</span></div>
    <div class="storage-item"><i class="fas fa-arrow-pointer"></i><span>揭示动画</span></div>
    <div class="storage-item"><i class="fas fa-cloud-sun"></i><span>天空时段 / 天气</span></div>
    <div class="storage-item"><i class="fas fa-database"></i><span>文章 / 作品缓存</span></div>
    <div class="storage-item"><i class="fas fa-music"></i><span>播放器状态</span></div>
    <div class="storage-item"><i class="fas fa-clock-rotate-left"></i><span>版本访问记录</span></div>
  </div>
</section>

<section class="privacy-section">
  <h2>第三方服务</h2>
  <div class="service-grid">
    <div class="service-card">
      <div class="service-icon"><i class="fas fa-eye"></i></div>
      <div class="service-body">
        <span class="service-name">vercount</span>
        <span class="service-desc">访问计数 · PV / UV</span>
      </div>
    </div>
    <div class="service-card">
      <div class="service-icon"><i class="fas fa-comments"></i></div>
      <div class="service-body">
        <span class="service-name">Twikoo</span>
        <span class="service-desc">评论 · 昵称 / 邮箱 / 正文</span>
      </div>
    </div>
    <div class="service-card">
      <div class="service-icon"><i class="fas fa-music"></i></div>
      <div class="service-body">
        <span class="service-name">APlayer</span>
        <span class="service-desc">音乐 · 外部歌单接口</span>
      </div>
    </div>
    <div class="service-card">
      <div class="service-icon"><i class="fas fa-quote-left"></i></div>
      <div class="service-body">
        <span class="service-name">UAPI</span>
        <span class="service-desc">每日一言 · 真实天气</span>
      </div>
    </div>
  </div>
  <p class="privacy-note">
    天气接口按访问 IP 定位城市，不会上传任何账号信息；结果在本地缓存半小时，到期才重新请求。
  </p>
</section>

<section class="privacy-section">
  <h2>你的控制权</h2>
  <div class="control-list">
    <div class="control-item">
      <i class="fas fa-eraser"></i>
      <div class="control-body">
        <strong>清除缓存</strong>
        <span>设置面板 → 清除缓存</span>
      </div>
    </div>
    <div class="control-item">
      <i class="fas fa-trash-can"></i>
      <div class="control-body">
        <strong>重置所有数据</strong>
        <span>设置面板 → 重置所有数据</span>
      </div>
    </div>
    <div class="control-item">
      <i class="fas fa-shield-halved"></i>
      <div class="control-body">
        <strong>屏蔽第三方</strong>
        <span>使用 uBlock Origin 等扩展拦截</span>
      </div>
    </div>
    <div class="control-item">
      <i class="fas fa-comment-slash"></i>
      <div class="control-body">
        <strong>删除评论</strong>
        <span>评论区自助删除，或邮件联系我</span>
      </div>
    </div>
  </div>
</section>

<footer class="privacy-footer">
  <p>有疑问？<a href="/contact/">留言</a> 或 <a href="mailto:gao_xinyang@foxmail.com">发邮件</a></p>
</footer>
`;

/**
 * 正文样式。
 *
 * 原先挂在 privacy.html 的 <style> 里，现在跟着内容一起走：
 * 打开弹窗时才注入一次，重复打开不会堆积标签。
 */
export const PRIVACY_CSS = `
.privacy-hero {
  text-align: center;
  margin-bottom: 1.2rem;
}
.privacy-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 0.7rem;
}
.privacy-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: var(--radius-full);
  background: var(--tag-bg);
  color: var(--tag-color);
  border: 1px solid var(--border-color);
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.4;
}
.privacy-badge i {
  color: var(--accent-color);
  font-size: 0.75rem;
}
.last-updated {
  display: inline-block;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--surface-color-secondary);
  padding: 3px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
}
.privacy-section {
  background: var(--surface-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.1rem 1.3rem;
  margin-bottom: 0.9rem;
}
.privacy-section h2 {
  display: block;
  font-size: 1rem;
  margin: 0 0 0.9rem 0;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-color);
  font-weight: 650;
}
.privacy-note {
  font-size: 0.83rem;
  color: var(--text-secondary);
  margin: 0.8rem 0 0;
  line-height: 1.5;
}
.data-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  min-width: 72px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  transition: transform var(--transition-fast), border-color var(--transition-fast);
}
.flow-node i {
  font-size: 1rem;
  color: var(--text-secondary);
}
.flow-node-accent {
  border-color: var(--accent-color);
  box-shadow: 0 4px 14px rgba(var(--accent-rgb), 0.15);
}
.flow-node-accent i,
.flow-node-accent span {
  color: var(--accent-color);
}
.flow-node-accent span {
  font-weight: 600;
}
.flow-arrow {
  color: var(--text-secondary);
  opacity: 0.5;
  font-size: 1rem;
}
.storage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}
.storage-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  color: var(--text-color);
  line-height: 1.35;
  transition: all var(--transition-fast);
}
.storage-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-1px);
}
.storage-item i {
  color: var(--accent-color);
  font-size: 0.85rem;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}
.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.service-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}
.service-card:hover {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-sm);
}
.service-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent-color);
  border-radius: var(--radius-md);
  flex-shrink: 0;
  font-size: 0.9rem;
}
.service-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.service-name {
  font-weight: 600;
  font-size: 0.84rem;
  color: var(--text-color);
}
.service-desc {
  font-size: 0.72rem;
  color: var(--text-secondary);
  line-height: 1.35;
}
.control-list {
  display: grid;
  gap: 6px;
}
.control-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}
.control-item:hover {
  border-color: var(--accent-color);
}
.control-item > i {
  width: 22px;
  text-align: center;
  color: var(--accent-color);
  font-size: 0.9rem;
  flex-shrink: 0;
}
.control-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.control-body strong {
  color: var(--text-color);
  font-weight: 600;
  font-size: 0.85rem;
}
.control-body span {
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.35;
}
.privacy-footer {
  margin-top: 1.2rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border-light);
  text-align: center;
  font-size: 0.83rem;
  color: var(--text-secondary);
}
.privacy-footer a {
  color: var(--accent-color);
}
.privacy-footer a:hover {
  color: var(--accent-light);
}
@media (max-width: 480px) {
  .privacy-section {
    padding: 0.9rem 1rem;
  }
  .storage-grid,
  .service-grid {
    grid-template-columns: 1fr;
  }
  .flow-node {
    padding: 8px 10px;
    min-width: 60px;
    font-size: 0.72rem;
  }
  .flow-node i {
    font-size: 0.9rem;
  }
}
`;
