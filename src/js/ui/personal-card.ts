// /js/ui/personal-card.js
// 个人信息卡片渲染器
//
// 定位：侧边栏的「身份档案卡」——不与 /about/ 比详、不与页脚比全，
// 而是两者的索引：把关于页压成几行档案、把页脚联系压成一排图标，
// 再留「关于我 / 留言板」两个出口，让卡片成为枢纽而不是内容终点。
// 完整版分别留在 /about/ 与页脚，此处只重复摘要。

import { dataService } from '/js/core/data-service.js';

let cachedHTML: string | null = null;

/** 统计数字：SPA 重渲染时先用已知值同步出图，避免占位符在每次跳转时闪一下 */
const statsCache: { articles: string | null; works: string | null } = {
  articles: null,
  works: null,
};

/** 档案行（图标 + 文字），样式见 core/layout.css 的 .profile-info-item */
function infoItem(icon: string, body: string): string {
  return `<div class="profile-info-item"><i class="fas ${icon}" aria-hidden="true"></i><span>${body}</span></div>`;
}

export function generatePersonalCardHTML(): string {
  return `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-avatar-wrapper">
          <img
            src="/assets/avatar.webp"
            alt="高新炀的头像"
            class="profile-avatar"
            fetchpriority="high"
            onerror="this.src='https://via.placeholder.com/120?text=GXY'"
          >
        </div>
        <h2 class="profile-name">高新炀</h2>
        <p class="profile-bio">一个15岁爱探索的小孩子~</p>
      </div>

      <div class="profile-body">
        ${infoItem('fa-graduation-cap', '高一在读 · 新乡市第一中学')}
        ${infoItem('fa-earth-asia', '中国 · UTC+8')}
        ${infoItem('fa-brain', 'INTP · 逻辑学家')}
        ${infoItem(
          'fa-pen-nib',
          `<a href="/articles/"><span id="profileStatArticles">${
            statsCache.articles ?? '—'
          }</span> 篇文章</a> · <a href="/works/"><span id="profileStatWorks">${
            statsCache.works ?? '—'
          }</span> 个作品</a>`,
        )}
        ${infoItem('fa-calendar-days', '建站于 2025.02.22')}
      </div>

      <div class="profile-social">
        <a href="https://github.com/Xinyang-Gao" target="_blank" class="social-link" aria-label="GitHub" rel="noopener noreferrer"><i class="fab fa-github"></i></a>
        <a href="https://www.curseforge.com/members/gaoxinyang/projects" target="_blank" class="social-link" aria-label="CurseForge" rel="noopener noreferrer"><span class="social-svg-icon social-svg-icon--curseforge" aria-hidden="true"></span></a>
        <a href="https://modrinth.com/user/GaoXinyang" target="_blank" class="social-link" aria-label="Modrinth" rel="noopener noreferrer"><span class="social-svg-icon social-svg-icon--modrinth" aria-hidden="true"></span></a>
        <a href="https://space.bilibili.com/1064600697" target="_blank" class="social-link" aria-label="Bilibili" rel="noopener noreferrer"><i class="fab fa-bilibili"></i></a>
        <a href="mailto:gao_xinyang@foxmail.com" class="social-link" aria-label="邮箱"><i class="fas fa-envelope"></i></a>
        <a href="https://user.qzone.qq.com/2489083744/" target="_blank" class="social-link" aria-label="QQ" rel="noopener noreferrer"><i class="fab fa-qq"></i></a>
        <a href="/rss.xml" target="_blank" class="social-link" aria-label="RSS" rel="noopener noreferrer"><i class="fas fa-rss"></i></a>
      </div>

      <div class="profile-travelling">
        <a href="https://www.travellings.cn/go.html" target="_blank" rel="noopener" title="开往-友链接力">
          <img class="travelling-img travelling-light" data-viewer-exclude="true" src="https://www.travellings.cn/assets/w.png" alt="开往-友链接力（浅色）" width="120" loading="lazy">
          <img class="travelling-img travelling-dark" data-viewer-exclude="true" src="https://www.travellings.cn/assets/b.png" alt="开往-友链接力（深色）" width="120" loading="lazy">
        </a>
      </div>

      <div class="profile-tags">
        <span class="tag tag-interest">Python</span>
        <span class="tag tag-interest">Html</span>
        <span class="tag tag-interest">JavaScript</span>
        <span class="tag tag-interest">TypeScript</span>
        <span class="tag tag-interest">Scratch</span>
        <span class="tag tag-interest">绘画</span>
        <span class="tag tag-interest">轮滑</span>
        <span class="tag tag-interest">Minecraft</span>
      </div>

      <div class="profile-actions">
        <a class="profile-action" href="/about/">关于我<i class="fas fa-arrow-right" aria-hidden="true"></i></a>
        <a class="profile-action" href="/contact/">留言板<i class="fas fa-arrow-right" aria-hidden="true"></i></a>
      </div>
    </div>
  `;
}

/**
 * 用统计数据刷新档案行里的「N 篇文章 · M 个作品」。
 * dataService 自带内存缓存与并发去重，SPA 每次跳转都调用也不会重复请求。
 * 拿到新数字后把 cachedHTML 置空，让下一次渲染直接带上正确的值。
 */
async function refreshProfileStats(): Promise<void> {
  try {
    const stats = await dataService.getStatistics();
    const articles = stats.total_articles == null ? null : String(stats.total_articles);
    const works = stats.total_works == null ? null : String(stats.total_works);
    const changed = articles !== statsCache.articles || works !== statsCache.works;
    statsCache.articles = articles;
    statsCache.works = works;
    if (!changed) return;

    cachedHTML = null;
    const articlesEl = document.getElementById('profileStatArticles');
    const worksEl = document.getElementById('profileStatWorks');
    if (articlesEl && articles != null) articlesEl.textContent = articles;
    if (worksEl && works != null) worksEl.textContent = works;
  } catch (err) {
    console.warn('[PersonalCard] 统计信息加载失败:', err);
  }
}

export function renderPersonalCard(): void {
  const container = document.getElementById('personal-card-container');
  if (!container) return;

  if (!cachedHTML) {
    cachedHTML = generatePersonalCardHTML();
  }

  if (container.innerHTML !== cachedHTML) {
    container.innerHTML = cachedHTML;
    const card = container.querySelector('.profile-card');
    if (card) {
      requestAnimationFrame(() => card.classList.add('visible'));
    }
  } else {
    const card = container.querySelector('.profile-card');
    if (card && !card.classList.contains('visible')) {
      requestAnimationFrame(() => card.classList.add('visible'));
    }
  }

  void refreshProfileStats();
}
