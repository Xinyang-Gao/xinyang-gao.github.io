// --- 辅助函数 ---
class PerformanceMonitor {
  constructor() {
      this.timers = new Map();
  }
  start(label) {
      if (this.timers.has(label)) {
          console.warn(`Timer "${label}" already running`);
          return;
      }
      this.timers.set(label, performance.now());
  }
  end(label) {
      if (!this.timers.has(label)) {
          console.warn(`Timer "${label}" not found`);
          return;
      }
      const startTime = this.timers.get(label);
      const duration = performance.now() - startTime;
      if (duration > 100) {
          console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms (慢)`);
      }
      this.timers.delete(label);
      return duration;
  }
}
const perf = new PerformanceMonitor();

// URL参数获取
function getUrlParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// 数据过期检查
function isDataExpired(storedDataString, minutes = 5) {
  if (!storedDataString) return true;
  
  try {
      const storedData = JSON.parse(storedDataString);
      const timestamp = storedData._timestamp;
      const expireTime = Date.now() - minutes * 60 * 1000;
      return !timestamp || timestamp < expireTime;
  } catch (e) {
      console.error("解析缓存数据失败:", e);
      return true;
  }
}

// 验证数据格式
function validateData(data, type) {
  if (!data) return false;
  
  const validators = {
      works: data => Array.isArray(data.works) && data.works.length > 0,
      articles: data => Array.isArray(data.articles) && data.articles.length > 0
  };
  
  return validators[type] ? validators[type](data) : false;
}

// 通用数据获取函数
async function fetchData(type, useCache = true) {
  const config = {
      works: {
          url: 'works.json',
          cacheKey: 'worksData',
          cacheControl: 'no-cache'
      },
      articles: {
          url: 'articles.json',
          cacheKey: 'articlesData',
          cacheControl: 'default'
      }
  };
  
  const { url, cacheKey, cacheControl } = config[type];
  perf.start(`获取${type === 'works' ? '作品' : '文章'}数据`);
  
  // 尝试从缓存读取
  if (useCache) {
      const cachedDataString = localStorage.getItem(cacheKey);
      if (cachedDataString && !isDataExpired(cachedDataString)) {
          try {
              const cachedData = JSON.parse(cachedDataString);
              delete cachedData._timestamp;
              if (validateData(cachedData, type)) {
                  perf.end(`获取${type === 'works' ? '作品' : '文章'}数据`);
                  return cachedData;
              }
          } catch (e) {
              console.warn('缓存数据无效，重新获取');
          }
      }
  }
  
  // 从服务器获取
  try {
      console.log(`📥 从服务器获取${type === 'works' ? '作品' : '文章'}数据`);
      const fetchOptions = {
          headers: { 'Cache-Control': cacheControl }
      };
      if (cacheControl === 'no-cache') {
          fetchOptions.cache = 'no-store';
      }
      
      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
          throw new Error(`${type === 'works' ? '作品' : '文章'}数据获取失败: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!validateData(data, type)) {
          throw new Error(`${type === 'works' ? '作品' : '文章'}数据格式无效`);
      }
      
      // 缓存数据
      const dataToStore = { ...data, _timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(dataToStore));
      perf.end(`获取${type === 'works' ? '作品' : '文章'}数据`);
      return data;
  } catch (error) {
      console.error(`获取${type === 'works' ? '作品' : '文章'}数据失败:`, error);
      perf.end(`获取${type === 'works' ? '作品' : '文章'}数据`);
      throw error;
  }
}

// 生成标签HTML
function generateTagsHTML(tags) {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return '';
  }
  
  const tagsHTML = tags.map(tag => 
      `<span class="tag">${tag}</span>`
  ).join('');
  
  return `<div class="tags">${tagsHTML}</div>`;
}

// 通用列表项生成函数
function generateListItem(item, itemType) {
  const { id, title, date, description, tag } = item;
  const tagsHtml = generateTagsHTML(tag);
  
  return `
      <div class="list-item" data-id="${id}" data-type="${itemType}">
          <div class="list-item-header">
              <h3 class="list-item-title">${title}</h3>
              <div class="list-item-meta">
                  <span class="list-item-date">${date}</span>
              </div>
          </div>
          <p class="list-item-description">${description}</p>
          ${tagsHtml}
      </div>
  `;
}

// 生成列表HTML
function generateListHTML(data, type) {
  perf.start(`生成${type === 'works' ? '作品' : '文章'}HTML`);
  if (!validateData(data, type)) {
      perf.end(`生成${type === 'works' ? '作品' : '文章'}HTML`);
      return `<div class="${type}-list"><p>没有找到相关${type === 'works' ? '作品' : '文章'}！ >-<</p></div>`;
  }

  let items = type === 'works' ? data.works : data.articles;

  items = items.filter(item => {
      // 检查 item.tag 是否存在且为数组，然后检查是否包含 "隐藏"
      return !(item.tag && Array.isArray(item.tag) && item.tag.includes("隐藏"));
  });

  const itemType = type.slice(0, -1); // 'work' 或 'article'
  const itemsHTML = items.map(item => generateListItem(item, itemType)).join('');

  const html = `
      <div class="${type}-list">
          ${itemsHTML}
      </div>
  `;

  perf.end(`生成${type === 'works' ? '作品' : '文章'}HTML`);
  return html;
}

// 获取页面内容
async function fetchPageContent(url) {
  try {
      const response = await fetch(url);
      if (!response.ok) {
          if (response.status === 404) {
              throw new Error('404');
          }
          throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }
      return await response.text();
  } catch (error) {
      console.error(`获取页面内容失败: ${url}`, error);
      throw error;
  }
}

// 替换容器内容
function replaceContainerContent(baseHtml, containerId, newHtml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(baseHtml, 'text/html');
  const container = doc.querySelector(containerId);
  
  if (container) {
      container.innerHTML = newHtml;
      return doc.documentElement.innerHTML;
  }
  
  console.warn(`警告: ${containerId} 未在页面中找到。将内容追加到末尾。`);
  return baseHtml + newHtml;
}

// 搜索功能类
class SearchManager {
  static instances = new Map();
  
  constructor(pageName) {
      // 清理旧的实例
      if (SearchManager.instances.has(pageName)) {
          SearchManager.instances.get(pageName).destroy();
      }
      
      this.pageName = pageName;
      this.searchInput = null;
      this.searchField = null;
      this.selectedTags = [];
      this.allTags = new Set();
      this.debounceTimer = null;
      
      SearchManager.instances.set(pageName, this);
      this.init();
  }
  
  init() {
      requestAnimationFrame(() => {
          this.searchInput = document.getElementById('search-input');
          this.searchField = document.getElementById('search-field');
          
          if (!this.searchInput || !this.searchField) {
              console.error(`搜索元素未在 ${this.pageName} 页面中找到`);
              return;
          }
          
          // 添加防抖处理
          this.searchInput.addEventListener('input', () => this.handleSearchWithDebounce());
          this.searchField.addEventListener('change', () => this.handleSearch());
          
          // 初始化标签筛选
          this.initializeTagFilters();
          
          // 初始化搜索
          this.handleSearch();
      });
  }
  
  handleSearchWithDebounce() {
      if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(() => {
          this.handleSearch();
      }, 300);
  }
  
  handleSearch() {
      const query = this.searchInput.value.trim();
      const field = this.searchField.value;
      
      try {
          if (this.pageName === 'articles') {
              this.filterContent('articles', query, field);
          } else if (this.pageName === 'works') {
              this.filterContent('works', query, field);
          }
      } catch (e) {
          console.error('搜索过程中出错:', e);
      }
  }
  
  // 获取所有唯一标签
  getAllUniqueTags(type) {
    const tags = new Set();
    const dataKey = `${type}Data`;
    const dataString = localStorage.getItem(dataKey);

    if (!dataString) {
        console.error(`${type} 数据未找到，无法提取标签`);
        return tags;
    }

    try {
        const data = JSON.parse(dataString);
        if (!validateData(data, type)) {
            console.error(`缓存${type}数据格式无效`);
            return tags;
        }

        const items = type === 'works' ? data.works : data.articles;
        items.forEach(item => {
            if (item.tag && Array.isArray(item.tag)) {
                item.tag.forEach(tag => {
                    // --- 添加条件来过滤掉 "隐藏" 标签 ---
                    if (tag !== "隐藏") {
                        tags.add(tag);
                    }
                    // --- 过滤代码结束 ---
                });
            }
        });

        return tags;
    } catch (e) {
        console.error(`解析缓存${type}数据失败:`, e);
        return tags;
    }
}
  
  // 初始化标签筛选
  initializeTagFilters() {
      if (!['works', 'articles'].includes(this.pageName)) return;
      
      const filterContainerId = `${this.pageName}-tags-filter`;
      const filterContainer = document.getElementById(filterContainerId);
      
      if (!filterContainer) {
          console.error(`标签筛选容器未找到: ${filterContainerId}`);
          return;
      }
      
      // 清空容器
      filterContainer.innerHTML = '';
      
      // 创建筛选提示
      const label = document.createElement('span');
      label.className = 'filter-label';
      label.textContent = '按标签筛选:';
      filterContainer.appendChild(label);
      
      // 获取所有标签
      const allTags = this.getAllUniqueTags(this.pageName);
      this.allTags = allTags;
      
      if (allTags.size === 0) {
          const noTagsMsg = document.createElement('span');
          noTagsMsg.textContent = '暂无标签';
          noTagsMsg.style.color = '#888';
          filterContainer.appendChild(noTagsMsg);
          return;
      }
      
      // 创建标签按钮
      allTags.forEach(tag => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'tag-button';
          button.textContent = tag;
          button.dataset.tag = tag;
          
          button.addEventListener('click', () => this.toggleTag(tag, button));
          filterContainer.appendChild(button);
      });
      
      // 清除筛选按钮
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'tag-button';
      clearButton.textContent = '清除筛选';
      clearButton.style.marginLeft = 'auto';
      clearButton.addEventListener('click', () => this.clearAllTags());
      filterContainer.appendChild(clearButton);
  }
  
  // 切换标签
  toggleTag(tag, buttonElement) {
      const index = this.selectedTags.indexOf(tag);
      if (index > -1) {
          this.selectedTags.splice(index, 1);
          buttonElement.classList.remove('active');
      } else {
          this.selectedTags.push(tag);
          buttonElement.classList.add('active');
      }
      
      this.handleSearch();
  }
  
  // 清除所有标签
  clearAllTags() {
      this.selectedTags = [];
      const buttons = document.querySelectorAll(`#${this.pageName}-tags-filter .tag-button:not(:last-child)`);
      buttons.forEach(btn => btn.classList.remove('active'));
      this.handleSearch();
  }
  
  // 通用内容筛选
  filterContent(type, query, field) {
      const dataKey = `${type}Data`;
      const dataString = localStorage.getItem(dataKey);
      
      if (!dataString) {
          console.error(`${type}数据未找到，无法搜索`);
          return;
      }
      
      let data;
      try {
          data = JSON.parse(dataString);
          if (!validateData(data, type)) {
              console.error(`缓存${type}数据格式无效`);
              return;
          }
      } catch (e) {
          console.error(`解析缓存${type}数据失败:`, e);
          return;
      }
      
      const items = type === 'works' ? data.works : data.articles;
      let filteredItems = items;
      
      // 标签筛选
      if (this.selectedTags.length > 0) {
          filteredItems = filteredItems.filter(item =>
              item.tag &&
              Array.isArray(item.tag) &&
              item.tag.some(tag => this.selectedTags.includes(tag))
          );
      }
      
      // 文本搜索
      if (query && field !== 'tag') {
          const lowerQuery = query.toLowerCase();
          filteredItems = filteredItems.filter(item => {
              switch (field) {
                  case 'title':
                      return item.title.toLowerCase().includes(lowerQuery);
                  case 'date':
                      return item.date.includes(query);
                  default: // 'all'
                      return (
                          item.title.toLowerCase().includes(lowerQuery) ||
                          (item.tag && Array.isArray(item.tag) && 
                           item.tag.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
                          item.date.includes(query)
                      );
              }
          });
      }
      
      // 渲染结果
      const filteredData = type === 'works' 
          ? { works: filteredItems } 
          : { articles: filteredItems };
      
      const filteredHtml = generateListHTML(filteredData, type);
      const containerId = `${type}-list-container`;
      const container = document.getElementById(containerId);
      
      if (container) {
          container.innerHTML = filteredHtml;
          this.setupItemsInteraction();
      } else {
          console.error(`${type}列表容器未找到`);
      }
  }
  
  // 设置交互
  setupItemsInteraction() {
      const content = document.getElementById('mainContent');
      if (!content) return;
      
      content.removeEventListener('click', handleListItemClick);
      content.addEventListener('click', handleListItemClick);
  }
  
  // 销毁实例
  destroy() {
      if (this.searchInput) {
          this.searchInput.removeEventListener('input', this.handleSearchWithDebounce);
      }
      if (this.searchField) {
          this.searchField.removeEventListener('change', this.handleSearch);
      }
      if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
      }
      
      SearchManager.instances.delete(this.pageName);
  }
}

// 页面加载与切换
async function loadPage(pageName, pushState = true) {
  perf.start(`加载页面: ${pageName}`);
  
  const pageConfig = {
      'about': { title: '关于', type: 'normal' },
      'articles': { title: '文章', type: 'list' },
      'contact': { title: '联系', type: 'normal' },
      'works': { title: '作品', type: 'list' }
  };
  
  const config = pageConfig[pageName] || { title: 'GXY\'s website', type: 'normal' };
  
  try {
      let content = '';
      let pageTitle = `${config.title} - GaoXinYang's website`;
      
      if (config.type === 'list') {
          const baseHtml = await fetchPageContent(`pages/${pageName}.html`);
          const data = await fetchData(pageName);
          const listHtml = generateListHTML(data, pageName);
          content = replaceContainerContent(baseHtml, `#${pageName}-list-container`, listHtml);
      } else if (pageName === '404') {
          content = '<h2>页面未找到</h2><p>抱歉，您访问的页面不存在。</p>';
          pageTitle = '404 - 页面未找到';
      } else if (pageName === 'index') {
          content = await fetchPageContent(`pages/${pageName}.html`);
      } else {
          content = await fetchPageContent(`pages/${pageName}.html`);
      }
      
      await performDrawAnimation(content, pageName, pageTitle, pushState);
  } catch (error) {
      console.error('页面加载失败:', error);
      const errorContent = '<h2>加载失败</h2><p>哎呀！加载页面时出了点问题……要不刷新试试？</p>';
      await performDrawAnimation(errorContent, 'error', '加载失败 - GXY\'s website', pushState);
  } finally {
      perf.end(`加载页面: ${pageName}`);
  }
}

// 执行绘制动画
async function performDrawAnimation(content, pageName, pageTitle, pushState) {
  const elements = {
      navItems: document.querySelectorAll('.nav-item'),
      content: document.getElementById('mainContent'),
      pageTransition: document.getElementById('pageTransition'),
      container: document.querySelector('.container')
  };
  
  if (!elements.container) {
      console.error('容器元素未找到');
      return;
  }
  
  // 触发页面过渡
  elements.pageTransition.classList.add('active');
  
  // 创建纸张元素
  let paperElement = document.querySelector('.draw-animation-paper');
  if (!paperElement) {
      paperElement = document.createElement('div');
      paperElement.className = 'draw-animation-paper container';
      document.body.appendChild(paperElement);
  }
  
  // 设置初始样式
  const containerRect = elements.container.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(elements.container);
  const padding = {
      top: parseFloat(computedStyle.paddingTop),
      right: parseFloat(computedStyle.paddingRight),
      bottom: parseFloat(computedStyle.paddingBottom),
      left: parseFloat(computedStyle.paddingLeft)
  };
  
  paperElement.style.cssText = `
      position: fixed;
      top: ${containerRect.top}px;
      left: ${containerRect.left}px;
      width: ${containerRect.width}px;
      height: ${containerRect.height}px;
      padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;
      border: var(--border-width) solid var(--border-color);
      box-shadow: var(--shadow-main), var(--shadow-offset), -var(--shadow-offset);
      border-radius: var(--border-radius-container);
      background: white;
      box-sizing: border-box;
      z-index: var(--z-index-animation-paper);
      opacity: 0;
      transform: translateY(100%) scale(0.95);
  `;
  
  paperElement.innerHTML = content;
  
  // 旧内容退出动画
  elements.content.classList.add('fade-out-shrink');
  
  return new Promise(resolve => {
      requestAnimationFrame(() => {
          // 新内容进入动画
          paperElement.style.transform = 'translate(0, 0) scale(1)';
          paperElement.style.opacity = '1';
          
          paperElement.addEventListener('animationend', function animationEndHandler() {
              // 更新内容
              elements.content.innerHTML = content;
              elements.content.classList.remove('fade-out-shrink');
              
              // 更新页面标题和导航
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
              
              // 隐藏过渡遮罩
              elements.pageTransition.classList.remove('active');
              
              // 初始化页面功能
              initializePageFeatures(pageName);
              
              this.removeEventListener('animationend', animationEndHandler);
              resolve();
          }, { once: true });
      });
  });
}

// 初始化页面功能
function initializePageFeatures(pageName) {
  if (['works', 'articles'].includes(pageName)) {
      new SearchManager(pageName);
  }
  
  // 设置列表项交互
  setupListItemsInteraction();
}

// 设置列表项交互
function setupListItemsInteraction() {
  const content = document.getElementById('mainContent');
  content.removeEventListener('click', handleListItemClick);
  content.addEventListener('click', handleListItemClick);
}

// 列表项点击处理
function handleListItemClick(e) {
  const listItem = e.target.closest('.list-item');
  if (!listItem) return;
  
  const itemId = parseInt(listItem.dataset.id, 10);
  const itemType = listItem.dataset.type; // 'work' 或 'article'
  
  if (isNaN(itemId)) return;
  
  if (itemType === 'work') {
      handleWorkItemClick(itemId);
  } else if (itemType === 'article') {
      handleArticleItemClick(itemId);
  }
}

// 处理作品项点击
function handleWorkItemClick(workId) {
  const worksDataString = localStorage.getItem('worksData');
  if (!worksDataString) return;
  
  try {
      const worksData = JSON.parse(worksDataString);
      if (!validateData(worksData, 'works')) return;
      
      const work = worksData.works.find(w => w.id === workId);
      if (work) {
          showWorkDetails(work);
      }
  } catch (e) {
      console.error('解析作品数据失败:', e);
  }
}

// 处理文章项点击
function handleArticleItemClick(articleId) {
  const articlesDataString = localStorage.getItem('articlesData');
  if (!articlesDataString) return;
  
  try {
      const articlesData = JSON.parse(articlesDataString);
      if (!validateData(articlesData, 'articles')) return;
      
      const article = articlesData.articles.find(a => a.id === articleId);
      if (article) {
          const articleTitle = encodeURIComponent(article.title);
          window.open(`/articles/?article=${articleTitle}`, '_blank');
      }
  } catch (e) {
      console.error('解析文章数据失败:', e);
  }
}

// 显示作品详情
function showWorkDetails(work) {
  if (document.querySelector('.work-details-envelope.active')) {
    return;
  }
  // 创建信封元素
  const envelope = document.createElement('div');
  envelope.className = 'work-details-envelope';

  // 创建详情内容
  const tagsHtml = work.tag && work.tag.length ?
    `<div class="work-details-tag">
       <strong>标签:</strong>
       ${work.tag.map(tag => `<span class="tag">${tag}</span>`).join('')}
     </div>` : '';

  envelope.innerHTML = `
    <div class="work-details-close">✕</div>
    <div class="work-details-content">
      <h2 class="work-details-title">${work.title}</h2>
      <p class="work-details-description">${work.description}</p>
      ${tagsHtml}
      ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
    </div>
  `;

  document.body.appendChild(envelope);

  const closeBtn = envelope.querySelector('.work-details-close');

  function closeWorkDetails() {
    envelope.style.transform = 'translate(-50%, -50%) scale(0.1)'; // 动画回到初始小尺寸状态
    envelope.classList.remove('active');
    setTimeout(() => {
      if (envelope.parentNode) {
        envelope.parentNode.removeChild(envelope);
      }
    }, 300); // 与 CSS 动画时间匹配
  }

  // 绑定关闭事件
  closeBtn.addEventListener('click', closeWorkDetails);

  // 触发动画
  requestAnimationFrame(() => {
    envelope.classList.add('active'); // 触发动画到最终状态

    // 点击外部关闭
    document.body.addEventListener('click', function closeOnBodyClick(e) {
      if (!envelope.contains(e.target) && e.target !== closeBtn) {
        closeWorkDetails();
        document.body.removeEventListener('click', closeOnBodyClick);
      }
    }, { once: true });
  });
}

// 移动端菜单切换
function initMobileMenuToggle() {
  const toggleButton = document.querySelector('.mobile-toggle');
  const navbarNav = document.getElementById('navbarNav');
  
  if (toggleButton && navbarNav) {
      toggleButton.addEventListener('click', function () {
          navbarNav.classList.toggle('active');
          this.classList.toggle('active');
      });
      
      // 点击导航项后关闭菜单
      document.querySelectorAll('.nav-item').forEach(item => {
          item.addEventListener('click', () => {
              navbarNav.classList.remove('active');
              toggleButton.classList.remove('active');
          });
      });
  }
}

// 初始化导航
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
          e.preventDefault();
          const page = item.getAttribute('data-page');
          if (page) loadPage(page);
      });
  });
}

// 初始化历史记录
function initPopstate() {
  window.addEventListener('popstate', (e) => {
      const page = e.state?.page || 'index';
      loadPage(page, false);
  });
}

// 返回顶部按钮
function initBackToTopButton() {
  const backToTopButton = document.getElementById("backToTopBtn");
  if (!backToTopButton) return;
  
  const scrollThreshold = 300;
  
  window.addEventListener('scroll', function () {
      if (window.scrollY > scrollThreshold) {
          backToTopButton.classList.add('show');
      } else {
          backToTopButton.classList.remove('show');
      }
  }, { passive: true });
  
  backToTopButton.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// 主初始化
document.addEventListener('DOMContentLoaded', function () {
  console.log('🚀 初始化网站...');
  
  // 初始化所有组件
  initNavigation();
  initPopstate();
  initMobileMenuToggle();
  initBackToTopButton();
  
  // 加载初始页面
  const initialPage = getUrlParam('page') || 'index';
  loadPage(initialPage);
  
  // 添加加载完成标志
  document.body.setAttribute('data-loaded', 'true');
  console.log('✅ 网站初始化完成');
});