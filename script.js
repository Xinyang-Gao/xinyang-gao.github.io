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

// --- 辅助函数 ---
// 检查数据是否过期 (设置缓存时间为 5 分钟)
function isDataExpired(storedDataString) {
    if (!storedDataString) return true;
    try {
        const storedData = JSON.parse(storedDataString);
        const timestamp = storedData._timestamp; // 假设我们在存储时加入了时间戳
        const tenMinutesAgo = Date.now() - 5 * 60 * 1000; // 10分钟毫秒数
        return !timestamp || timestamp < tenMinutesAgo;
    } catch (e) {
        console.error("Error parsing stored data:", e);
        return true; // 解析失败也认为过期
    }
}

async function fetchWorksData(useCache = true) {
    // 优化：添加更详细的错误处理
    if (useCache) {
      const cachedDataString = localStorage.getItem('worksData');
      if (cachedDataString) {
        try {
          const cachedData = JSON.parse(cachedDataString);
          if (cachedData && !isDataExpired(cachedData)) {
            delete cachedData._timestamp;
            return cachedData;
          }
        } catch (e) {
          console.error('Error parsing cached works data:', e);
        }
      }
    }
    
    try {
      console.log("Fetching fresh works data");
      const response = await fetch('works.json', { cache: 'no-store' }); // 确保不使用缓存
      if (!response.ok) {
        throw new Error(`Network error fetching works: ${response.statusText}`);
      }
      const data = await response.json();
      
      // 优化：添加数据验证
      if (!data.works || !Array.isArray(data.works) || data.works.length === 0) {
        throw new Error('Invalid works data format');
      }
      
      const dataToStore = { ...data, _timestamp: Date.now() };
      localStorage.setItem('worksData', JSON.stringify(dataToStore));
      return data;
    } catch (error) {
      console.error('Failed to fetch works data:', error);
      throw error;
    }
  }
  
function generateWorksHTML(data) {
    perf.start('generateWorksHTML');
    if (!data?.works || data.works.length === 0) {
        perf.end('generateWorksHTML');
        return '<div class="works-list"><p>没有找到相关作品！ >-<</p></div>';
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

async function fetchArticlesData(useCache = true) {
    // 添加 useCache 参数
    perf.start('fetchArticlesData');
    try {
        if (useCache) {
            const cachedDataString = localStorage.getItem('articlesData');
            if (cachedDataString && !isDataExpired(cachedDataString)) {
                console.log("Using cached articles data");
                const cachedData = JSON.parse(cachedDataString);
                delete cachedData._timestamp;
                perf.end('fetchArticlesData');
                return cachedData;
            }
        }
        console.log("Fetching fresh articles data");
        const response = await fetch('articles.json');
        if (!response.ok) {
            throw new Error(`Network error fetching articles: ${response.statusText}`);
        }
        const data = await response.json();
        const dataToStore = {...data, _timestamp: Date.now()};
        localStorage.setItem('articlesData', JSON.stringify(dataToStore));
        perf.end('fetchArticlesData');
        return data;
    } catch (error) {
        console.error('Failed to fetch or use cached articles data:', error);
        perf.end('fetchArticlesData');
        throw error;
    }
}

function generateArticlesHTML(data) {
    perf.start('generateArticlesHTML');
    if (!data?.articles || data.articles.length === 0) {
        perf.end('generateArticlesHTML');
        return '<div class="articles-list"><p>没有找到相关文章！ >-<</p></div>';
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

// --- 搜索功能修复 ---
// 添加文章搜索过滤函数
function filterArticles(articles, query, field) {
    if (!query) return articles;
    
    const lowerQuery = query.toLowerCase();
    return articles.filter(article => {
        switch(field) {
            case 'title':
                return article.title.toLowerCase().includes(lowerQuery);
            case 'description':
                return article.description.toLowerCase().includes(lowerQuery);
            case 'tag':
                return article.tag.some(tag => tag.toLowerCase().includes(lowerQuery));
            case 'date':
                return article.date.includes(query);
            default: // 'all'
                return article.title.toLowerCase().includes(lowerQuery) ||
                       article.description.toLowerCase().includes(lowerQuery) ||
                       article.tag.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
                       article.date.includes(query);
        }
    });
}

// 添加作品搜索过滤函数
function filterWorks(works, query, field) {
    if (!query) return works;
    
    const lowerQuery = query.toLowerCase();
    return works.filter(work => {
        switch(field) {
            case 'title':
                return work.title.toLowerCase().includes(lowerQuery);
            case 'description':
                return work.description.toLowerCase().includes(lowerQuery);
            case 'tag':
                return work.tag.some(tag => tag.toLowerCase().includes(lowerQuery));
            case 'date':
                return work.date.includes(query);
            default: // 'all'
                return work.title.toLowerCase().includes(lowerQuery) ||
                       work.description.toLowerCase().includes(lowerQuery) ||
                       work.tag.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
                       work.date.includes(query);
        }
    });
}

// 初始化搜索功能
function initSearch(pageName) {
    // 使用 requestAnimationFrame 确保在下一帧渲染后执行
    requestAnimationFrame(() => {
        const searchInput = document.getElementById('search-input');
        const searchField = document.getElementById('search-field');
        
        if (!searchInput || !searchField) {
            console.error('Search elements not found in', pageName);
            return;
        }
        
        // 移除可能存在的旧监听器 (防止重复绑定)
        const inputListener = searchInput._searchListener;
        const fieldListener = searchField._searchListener;
        
        if (inputListener) {
            searchInput.removeEventListener('input', inputListener);
        }
        if (fieldListener) {
            searchField.removeEventListener('change', fieldListener);
        }

        // 定义处理函数
        function handleSearch() {
            const query = searchInput.value.trim();
            const field = searchField.value;
            
            if (pageName === 'articles') {
                // 处理文章搜索
                try {
                    const articlesDataString = localStorage.getItem('articlesData');
                    if (!articlesDataString) {
                        console.error('No articles data found in localStorage');
                        return;
                    }
                    const articlesData = JSON.parse(articlesDataString);
                    if (!articlesData || !articlesData.articles) {
                        console.error('Invalid articles data format');
                        return;
                    }
                    const filteredArticles = filterArticles(articlesData.articles, query, field);
                    const filteredHtml = generateArticlesHTML({ articles: filteredArticles });
                    const container = document.getElementById('articles-list-container');
                    if (container) {
                        container.innerHTML = filteredHtml;
                    }
                } catch (e) {
                    console.error('Error during articles search:', e);
                }
            } else if (pageName === 'works') {
                // 处理作品搜索
                try {
                    const worksDataString = localStorage.getItem('worksData');
                    if (!worksDataString) {
                        console.error('No works data found in localStorage');
                        return;
                    }
                    const worksData = JSON.parse(worksDataString);
                    if (!worksData || !worksData.works) {
                        console.error('Invalid works data format');
                        return;
                    }
                    const filteredWorks = filterWorks(worksData.works, query, field);
                    const filteredHtml = generateWorksHTML({ works: filteredWorks });
                    const container = document.getElementById('works-list-container');
                    if (container) {
                        container.innerHTML = filteredHtml;
                    }
                } catch (e) {
                    console.error('Error during works search:', e);
                }
            }
        }
        
        // 绑定新的监听器
        searchInput.addEventListener('input', handleSearch);
        searchField.addEventListener('change', handleSearch);
        
        // 保存引用以便后续移除
        searchInput._searchListener = handleSearch;
        searchField._searchListener = handleSearch;
        
        // 初始化时触发一次搜索 (显示全部)
        handleSearch();
    });
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
            setupWorkItemsInteraction();
        } else if (pageName === 'articles') {
            pageTitle = '文章 - GXY\'s website';
            const baseHtml = await fetchPageContent(`pages/${pageName}.html`);
            const articlesData = await fetchArticlesData();
            localStorage.setItem('articlesData', JSON.stringify(articlesData));
            const articlesListHtml = generateArticlesHTML(articlesData);
            content = replaceArticlesListContainer(baseHtml, articlesListHtml);
            setupArticleItemsInteraction();
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
    const elements = {
      navItems: document.querySelectorAll('.nav-item'),
      content: document.getElementById('mainContent'),
      pageTransition: document.getElementById('pageTransition'),
      container: document.querySelector('.container')
    };
    
    elements.pageTransition.classList.add('active');
    
    // 优化：使用 requestAnimationFrame 优化动画
    requestAnimationFrame(() => {
      const containerRect = elements.container.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(elements.container);
      const padding = {
        top: parseFloat(computedStyle.paddingTop),
        right: parseFloat(computedStyle.paddingRight),
        bottom: parseFloat(computedStyle.paddingBottom),
        left: parseFloat(computedStyle.paddingLeft)
      };
      
      // 优化：避免重复创建元素
      let paperElement = document.querySelector('.draw-animation-paper');
      if (!paperElement) {
        paperElement = document.createElement('div');
        paperElement.className = 'draw-animation-paper container';
        document.body.appendChild(paperElement);
      }
      
      paperElement.style.cssText = `
        top: ${containerRect.top}px;
        left: ${containerRect.left}px;
        width: ${containerRect.width}px;
        height: ${containerRect.height}px;
        padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;
      `;
      paperElement.innerHTML = content;
      
      // 优化：使用 transform 而不是直接修改位置
      paperElement.style.transform = 'translate(0, 0) scale(1)';
      paperElement.style.opacity = '1';
      
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
        
        // 初始化搜索功能
        initSearch(pageName);
        
        // 初始化作品交互
        if (pageName === 'works') {
          setupWorkItemsInteraction();
        }
      }, { once: true });
    });
  }

function initMobileMenuToggle() {
    const toggleButton = document.querySelector('.mobile-toggle');
    const navbarNav = document.getElementById('navbarNav');
    // 使用上面添加的 ID
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
    const elements = { content: document.getElementById('mainContent') };
    // 移除旧监听器
    elements.content.removeEventListener('click', handleWorkItemClick);
    // 添加新监听器
    elements.content.addEventListener('click', handleWorkItemClick);
}

function setupArticleItemsInteraction() {
    const elements = { content: document.getElementById('mainContent') };
    // 移除旧监听器
    elements.content.removeEventListener('click', handleArticleItemClick);
    // 添加新监听器
    elements.content.addEventListener('click', handleArticleItemClick);
}

function handleWorkItemClick(e) {
    const elements = { content: document.getElementById('mainContent') };
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
    const elements = { content: document.getElementById('mainContent') };
    const articleItem = e.target.closest('.article-item');
    if (!articleItem) return;
    const articleId = parseInt(articleItem.dataset.id, 10); // 假设是ID
    if (isNaN(articleId)) return;
    const articlesData = JSON.parse(localStorage.getItem('articlesData'));
    if (!articlesData || !articlesData.articles) return; // 检查数据是否存在
    const article = articlesData.articles.find(a => a.id === articleId);
    if (article) {
        const articleTitle = encodeURIComponent(article.title); // URL 编码标题
        window.open(`/articles/?article=${articleTitle}`, '_blank'); // 在新标签页打开
    }
}

function showWorkDetails(work) {
    // 优化：检查是否已经存在活动的详情弹窗
    if (document.querySelector('.work-details-envelope.active')) {
      return;
    }
    
    const workItem = document.querySelector(`.work-item[data-id="${work.id}"]`);
    if (!workItem) return;
    
    const workItemRect = workItem.getBoundingClientRect();
    
    // 优化：避免重复创建元素
    let envelope = document.querySelector('.work-details-envelope');
    if (!envelope) {
      envelope = document.createElement('div');
      envelope.className = 'work-details-envelope';
      document.body.appendChild(envelope);
    }
    
    // 优化：存储初始位置
    envelope.dataset.initialTop = workItemRect.top;
    envelope.dataset.initialLeft = workItemRect.left;
    envelope.dataset.initialWidth = workItemRect.width;
    envelope.dataset.initialHeight = workItemRect.height;
    
    envelope.style.cssText = `
      top: ${workItemRect.top}px;
      left: ${workItemRect.left}px;
      width: ${workItemRect.width}px;
      height: ${workItemRect.height}px;
    `;
    
    // 优化：避免重复创建内容
    const detailsContent = envelope.querySelector('.work-details-content') || document.createElement('div');
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
    
    // 优化：避免重复创建关闭按钮
    const closeBtn = envelope.querySelector('.work-details-close') || document.createElement('div');
    closeBtn.className = 'work-details-close';
    closeBtn.innerHTML = '✕';
    
    // 优化：确保只绑定一次关闭事件
    closeBtn.addEventListener('click', closeWorkDetails);
    
    // 清理旧内容
    envelope.innerHTML = '';
    envelope.appendChild(detailsContent);
    envelope.appendChild(closeBtn);
    
    // 触发动画
    requestAnimationFrame(() => {
      const containerRect = document.querySelector('.container').getBoundingClientRect();
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
  }

// --- 初始化 ---
function initNavigation() {
    const elements = { navItems: document.querySelectorAll('.nav-item') };
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

function initBackToTopButton() {
    const backToTopButton = document.getElementById("backToTopBtn");
    if (!backToTopButton) return;
    const scrollThreshold = 300; // 滚动多少像素后显示按钮
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > scrollThreshold) {
            backToTopButton.classList.add('show');
        } else {
            backToTopButton.classList.remove('show');
        }
    });
    
    backToTopButton.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// --- 主执行逻辑 ---
document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    initPopstate();
    initMobileMenuToggle();
    initBackToTopButton();
    const initialPage = getUrlParameter('page') || 'index';
    loadPage(initialPage);
});