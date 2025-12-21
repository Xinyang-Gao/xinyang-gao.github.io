// --- 辅助函数 ---
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// --- 性能监控 (可选) ---
const perf = {
  start(label) {
    console.time(label);
  },
  end(label) {
    console.timeEnd(label);
  }
};

// --- 公共辅助函数 ---
function generateTagsHTML(tags, classNamePrefix = "tag") {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return '';
  }
  return `
    <div class="${classNamePrefix}-tags">
      ${tags.map(tag => `<span class="${classNamePrefix}-tag tech-tag">${tag}</span>`).join('')}
    </div>
  `;
}

async function fetchWorksData() {
  perf.start('fetchWorksData');
  try {
    const response = await fetch('works.json');
    if (!response.ok) {
      throw new Error(`Network error fetching works: ${response.statusText}`);
    }
    const data = await response.json();
    perf.end('fetchWorksData');
    return data;
  } catch (error) {
    console.error('Failed to fetch works data:', error);
    perf.end('fetchWorksData');
    throw error;
  }
}

function generateWorksHTML(data) {
  perf.start('generateWorksHTML');
  if (!data?.works || data.works.length === 0) {
    perf.end('generateWorksHTML');
    return '<div class="works-list"><h2>作品集</h2><p>暂无作品数据</p></div>';
  }

  const html = `
    <div class="works-list">
      ${data.works.map(work => {
    // --- 使用公共函数生成标签 HTML ---
    const tagsHtml = generateTagsHTML(work.tag, "work");
    return `
          <div class="work-item" data-id="${work.id}">
            <div class="work-item-header">
              <h3 class="work-title">${work.title}</h3>
              <div class="work-meta">
                <span class="work-date">${work.date}</span>
              </div>
            </div>
            <p class="work-description">${work.description}</p>
            ${tagsHtml} <!-- 插入标签 -->
          </div>
        `;
  }).join('')}
    </div>
  `;
  perf.end('generateWorksHTML');
  return html;
}

async function fetchArticlesData() {
  perf.start('fetchArticlesData');
  try {
    const response = await fetch('articles.json');
    if (!response.ok) {
      throw new Error(`Network error fetching articles: ${response.statusText}`);
    }
    const data = await response.json();
    perf.end('fetchArticlesData');
    return data;
  } catch (error) {
    console.error('Failed to fetch articles data:', error);
    perf.end('fetchArticlesData');
    throw error;
  }
}

function generateArticlesHTML(data) {
  perf.start('generateArticlesHTML');
  if (!data?.articles || data.articles.length === 0) {
    perf.end('generateArticlesHTML');
    return '<div class="articles-list"><h2>文章</h2><p>暂无文章数据</p></div>';
  }

  const html = `
    <div class="articles-list">
      ${data.articles.map(article => {
    const tagsHtml = generateTagsHTML(article.tag, "article");
    return `
          <div class="article-item" data-id="${article.id}">
            <div class="article-item-header">
              <h3 class="article-title">${article.title}</h3>
              <div class="article-meta">
                <span class="article-date">${article.date}</span>
              </div>
            </div>
            <p class="article-description">${article.description}</p>
            ${tagsHtml}
          </div>
        `;
  }).join('')}
    </div>
  `;
  perf.end('generateArticlesHTML');
  return html;
}

async function fetchPageContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('404');
    }
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  return await response.text();
}

function replaceWorkListContainer(baseHtml, worksListHtml) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = baseHtml;
  const container = tempDiv.querySelector('#works-list-container');
  if (container) {
    container.innerHTML = worksListHtml;
    return tempDiv.innerHTML;
  }
  console.warn('Warning: #works-list-container not found in works.html. Appending works list to end.');
  return baseHtml + worksListHtml;
}

function replaceArticlesListContainer(baseHtml, articlesListHtml) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = baseHtml;
  const container = tempDiv.querySelector('#articles-list-container');
  if (container) {
    container.innerHTML = articlesListHtml;
    return tempDiv.innerHTML;
  }
  console.warn('Warning: #articles-list-container not found in articles.html. Appending articles list to end.');
  return baseHtml + articlesListHtml;
}

// --- 页面加载与切换逻辑 ---
async function loadPage(pageName, pushState = true) {
  perf.start('loadPage');
  let content = '';
  let pageTitle = 'GXY\'s website';
  const pageConfig = {
    'about': '关于',
    'articles': '文章',
    'contact': '联系',
    'works': '作品'
  };

  try {
    if (pageName === 'works') {
      pageTitle = '作品 - GXY\'s website';
      const baseHtml = await fetchPageContent(`pages/${pageName}.html`);
      const worksData = await fetchWorksData();
      localStorage.setItem('worksData', JSON.stringify(worksData));
      const worksListHtml = generateWorksHTML(worksData);
      content = replaceWorkListContainer(baseHtml, worksListHtml);
    } else if (pageName === 'articles') {
      pageTitle = '文章 - GXY\'s website';
      const baseHtml = await fetchPageContent(`pages/${pageName}.html`);
      const articlesData = await fetchArticlesData();
      localStorage.setItem('articlesData', JSON.stringify(articlesData));
      const articlesListHtml = generateArticlesHTML(articlesData);
      content = replaceArticlesListContainer(baseHtml, articlesListHtml);
      setupArticleItemsInteraction(); // Setup after content is loaded
    } else {
      pageTitle = pageConfig[pageName] ? `${pageConfig[pageName]} - GXY\'s website` : pageTitle;
      if (pageName === '404') {
        content = '<h2>页面未找到</h2><p>抱歉，您访问的页面不存在。</p>';
      } else {
        content = await fetchPageContent(`pages/${pageName}.html`);
      }
    }

    performDrawAnimation(content, pageName, pageTitle, pushState);

  } catch (error) {
    console.error('Page load failed:', error);
    const errorContent = '<h2>加载失败</h2><p>哎呀！加载页面时出了点问题……要不刷新试试？</p>';
    performDrawAnimation(errorContent, 'error', '加载失败 - GXY\'s website', pushState);
  } finally {
    perf.end('loadPage');
  }
}

function performDrawAnimation(content, pageName, pageTitle, pushState) {
  perf.start('performDrawAnimation');
  const elements = {
    navItems: document.querySelectorAll('.nav-item'),
    content: document.getElementById('mainContent'),
    pageTransition: document.getElementById('pageTransition'),
    container: document.querySelector('.container')
  };

  elements.pageTransition.classList.add('active');

  const containerRect = elements.container.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(elements.container);
  const padding = {
    top: parseFloat(computedStyle.paddingTop),
    right: parseFloat(computedStyle.paddingRight),
    bottom: parseFloat(computedStyle.paddingBottom),
    left: parseFloat(computedStyle.paddingLeft)
  };

  // 创建动画元素 (使用容器实际尺寸)
  const paperElement = document.createElement('div');
  paperElement.className = 'draw-animation-paper container';
  paperElement.style.cssText = `
    top: ${containerRect.top}px;
    left: ${containerRect.left}px;
    width: ${containerRect.width}px;
    height: ${containerRect.height}px;
    padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;
  `;
  paperElement.innerHTML = content;
  document.body.appendChild(paperElement);

  // 触发内容区域退出动画
  elements.content.classList.add('fade-out-shrink');

  // 动画结束后处理
  paperElement.addEventListener('animationend', () => {
    elements.content.innerHTML = content;
    elements.content.classList.remove('fade-out-shrink');
    document.title = pageTitle;

    if (pushState) {
      window.history.pushState({ page: pageName }, pageTitle, `?page=${pageName}`);
    }

    // 更新导航状态
    elements.navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-page') === pageName);
    });

    // 清理临时元素
    if (paperElement.parentNode) {
      paperElement.parentNode.removeChild(paperElement);
    }
    elements.pageTransition.classList.remove('active');

    // 初始化作品交互 (如果当前是作品页)
    if (pageName === 'works') {
      setupWorkItemsInteraction();
    }
  }, { once: true });

  perf.end('performDrawAnimation');
}

function initMobileMenuToggle() {
  const toggleButton = document.querySelector('.mobile-toggle');
  const navbarNav = document.getElementById('navbarNav'); // 使用上面添加的 ID

  if (toggleButton && navbarNav) {
      toggleButton.addEventListener('click', function () {
          // 切换导航菜单的显示状态
          navbarNav.classList.toggle('active');
          // 切换汉堡按钮本身的样式（用于动画）
          this.classList.toggle('active');
      });
  }
}

function setupWorkItemsInteraction() {
  const elements = {
    content: document.getElementById('mainContent')
  };
  // 移除旧监听器
  elements.content.removeEventListener('click', handleWorkItemClick);
  // 添加新监听器
  elements.content.addEventListener('click', handleWorkItemClick);
}

function setupArticleItemsInteraction() {
  const elements = {
    content: document.getElementById('mainContent')
  };
  // 移除旧监听器
  elements.content.removeEventListener('click', handleArticleItemClick);
  // 添加新监听器
  elements.content.addEventListener('click', handleArticleItemClick);
}

function handleWorkItemClick(e) {
  const elements = {
    content: document.getElementById('mainContent')
  };
  const workItem = e.target.closest('.work-item');
  if (!workItem) return;

  const workId = parseInt(workItem.dataset.id, 10);
  if (isNaN(workId)) return;

  const worksData = JSON.parse(localStorage.getItem('worksData'));
  if (!worksData || !worksData.works) return; // 检查数据是否存在

  const work = worksData.works.find(w => w.id === workId);
  if (work) {
    showWorkDetails(work);
  }
}

function handleArticleItemClick(e) {
  const elements = {
    content: document.getElementById('mainContent')
  };
  const articleItem = e.target.closest('.article-item');
  if (!articleItem) return;

  const articleId = parseInt(articleItem.dataset.id, 10); // 假设是ID
  if (isNaN(articleId)) return;

  const articlesData = JSON.parse(localStorage.getItem('articlesData'));
  if (!articlesData || !articlesData.articles) return; // 检查数据是否存在

  const article = articlesData.articles.find(a => a.id === articleId);
  if (article) {
    const articleTitle = encodeURIComponent(article.title); // URL 编码标题
    window.open(`../articles/?article=${articleTitle}`, '_blank'); // 在新标签页打开
  }
}

function showWorkDetails(work) {
  // 检查是否已经存在活动的详情弹窗
  if (document.querySelector('.work-details-envelope.active')) {
    return;
  }

  const elements = {
    container: document.querySelector('.container')
  };

  const workItem = document.querySelector(`.work-item[data-id="${work.id}"]`);
  if (!workItem) return;

  const workItemRect = workItem.getBoundingClientRect();

  const envelope = document.createElement('div');
  envelope.className = 'work-details-envelope';
  Object.assign(envelope.dataset, {
    initialTop: workItemRect.top,
    initialLeft: workItemRect.left,
    initialWidth: workItemRect.width,
    initialHeight: workItemRect.height
  });
  envelope.style.cssText = `
    top: ${workItemRect.top}px;
    left: ${workItemRect.left}px;
    width: ${workItemRect.width}px;
    height: ${workItemRect.height}px;
  `;

  const detailsContent = document.createElement('div');
  detailsContent.className = 'work-details-content';
  detailsContent.innerHTML = `
    <h2 class="work-details-title">${work.title}</h2>
    <p class="work-details-description">${work.description}</p>
    ${work.tag && work.tag.length ? `
      <div class="work-details-tag">
        <strong>标签:</strong> ${work.tag.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
      </div>
    ` : ''}
    ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
  `;

  const closeBtn = document.createElement('div');
  closeBtn.className = 'work-details-close';
  closeBtn.innerHTML = '✕';

  function closeWorkDetails() {
    envelope.style.top = `${envelope.dataset.initialTop}px`;
    envelope.style.left = `${envelope.dataset.initialLeft}px`;
    envelope.style.width = `${envelope.dataset.initialWidth}px`;
    envelope.style.height = `${envelope.dataset.initialHeight}px`;
    envelope.classList.remove('active');
    setTimeout(() => {
      if (envelope.parentNode) {
        envelope.parentNode.removeChild(envelope);
      }
    }, 300);
  }

  closeBtn.addEventListener('click', closeWorkDetails);
  envelope.appendChild(detailsContent);
  envelope.appendChild(closeBtn);
  document.body.appendChild(envelope);

  // 动画过渡
  requestAnimationFrame(() => {
    const containerRect = elements.container.getBoundingClientRect();
    envelope.style.cssText = `
      top: ${containerRect.top}px;
      left: ${containerRect.left}px;
      width: ${containerRect.width}px;
      height: ${containerRect.height}px;
    `;
    envelope.classList.add('active');

    // 点击外部关闭
    document.body.addEventListener('click', function closeOnBodyClick(e) {
      if (!envelope.contains(e.target)) {
        closeWorkDetails();
        document.body.removeEventListener('click', closeOnBodyClick);
      }
    }, { once: true });
  });
}

// --- 初始化 ---
function initNavigation() {
  const elements = {
    navItems: document.querySelectorAll('.nav-item')
  };
  elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.getAttribute('data-page');
      if (page) loadPage(page);
    });
  });
}

function initPopstate() {
  window.addEventListener('popstate', (e) => {
    const page = e.state?.page || 'index';
    loadPage(page, false);
  });
}

// --- 主执行逻辑 ---
document.addEventListener('DOMContentLoaded', function () {
  initNavigation();
  initPopstate();
  initMobileMenuToggle(); 
  const initialPage = getUrlParameter('page') || 'index';
  loadPage(initialPage);
});