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
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
      this.timers.delete(label);
      return duration;
    }
  }
  const perf = new PerformanceMonitor();
  
  // URL参数获取
  function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }
  
  // 数据过期检查 (5分钟缓存)
  function isDataExpired(storedDataString) {
    if (!storedDataString) return true;
    try {
      const storedData = JSON.parse(storedDataString);
      const timestamp = storedData._timestamp;
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      return !timestamp || timestamp < fiveMinutesAgo;
    } catch (e) {
      console.error("解析缓存数据失败:", e);
      return true;
    }
  }
  
  // 验证数据格式
  function validateData(data, type) {
    if (!data) return false;
    if (type === 'works') {
      return Array.isArray(data.works) && data.works.length > 0;
    } else if (type === 'articles') {
      return Array.isArray(data.articles) && data.articles.length > 0;
    }
    return false;
  }
  
  // 获取作品数据
  async function fetchWorksData(useCache = true) {
    perf.start('获取作品数据');
    if (useCache) {
      const cachedDataString = localStorage.getItem('worksData');
      if (cachedDataString && !isDataExpired(cachedDataString)) {
        try {
          const cachedData = JSON.parse(cachedDataString);
          delete cachedData._timestamp;
          if (validateData(cachedData, 'works')) {
            perf.end('获取作品数据');
            return cachedData;
          }
        } catch (e) {
          console.warn('缓存数据无效，重新获取');
        }
      }
    }
    try {
      console.log("📥 从服务器获取作品数据");
      const response = await fetch('works.json', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) {
        throw new Error(`网络错误: ${response.statusText}`);
      }
      const data = await response.json();
      if (!validateData(data, 'works')) {
        throw new Error('数据格式无效');
      }
      // 缓存数据
      const dataToStore = { ...data, _timestamp: Date.now() };
      localStorage.setItem('worksData', JSON.stringify(dataToStore));
      perf.end('获取作品数据');
      return data;
    } catch (error) {
      console.error('获取作品数据失败:', error);
      perf.end('获取作品数据');
      throw error;
    }
  }
  
  // 获取文章数据
  async function fetchArticlesData(useCache = true) {
    perf.start('获取文章数据');
    if (useCache) {
      const cachedDataString = localStorage.getItem('articlesData');
      if (cachedDataString && !isDataExpired(cachedDataString)) {
        try {
          const cachedData = JSON.parse(cachedDataString);
          delete cachedData._timestamp;
          if (validateData(cachedData, 'articles')) {
            perf.end('获取文章数据');
            return cachedData;
          }
        } catch (e) {
          console.warn('缓存文章数据无效，重新获取');
        }
      }
    }
    try {
      console.log("📥 从服务器获取文章数据");
      const response = await fetch('articles.json');
      if (!response.ok) {
        throw new Error(`网络错误: ${response.statusText}`);
      }
      const data = await response.json();
      if (!validateData(data, 'articles')) {
        throw new Error('文章数据格式无效');
      }
      // 缓存数据
      const dataToStore = { ...data, _timestamp: Date.now() };
      localStorage.setItem('articlesData', JSON.stringify(dataToStore));
      perf.end('获取文章数据');
      return data;
    } catch (error) {
      console.error('获取文章数据失败:', error);
      perf.end('获取文章数据');
      throw error;
    }
  }
  
  // 生成标签HTML
  function generateTagsHTML(tags, classNamePrefix = "tag") {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return '';
    }
    const tagClass = classNamePrefix === 'work' ? 'work-tag' : (classNamePrefix === 'article' ? 'article-tag' : `${classNamePrefix}-tag`);
    const detailsTagClass = classNamePrefix === 'work' ? 'work-details-tag-item' : (classNamePrefix === 'article' ? 'article-details-tag-item' : 'tech-tag'); // 或者统一用 'tech-tag'
    const tagsHTML = tags
      .map(tag => `<span class="${tagClass} ${detailsTagClass}">${tag}</span>`)
      // 生成列表项时使用列表类和详情类
      .join('');
    return ` <div class="${classNamePrefix}-tags"> ${tagsHTML} </div> `;
  }
  
  // 生成作品HTML
  function generateWorksHTML(data) {
    perf.start('生成作品HTML');
    if (!validateData(data, 'works')) {
      perf.end('生成作品HTML');
      return '<div class="works-list"><p>没有找到相关作品！ >-<</p></div>';
    }
    const worksHTML = data.works.map(work => {
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
          ${tagsHtml}
        </div>
      `;
    }).join('');
    const html = `
      <div class="works-list">
        ${worksHTML}
      </div>
    `;
    perf.end('生成作品HTML');
    return html;
  }
  
  // 生成文章HTML
  function generateArticlesHTML(data) {
    perf.start('生成文章HTML');
    if (!validateData(data, 'articles')) {
      perf.end('生成文章HTML');
      return '<div class="articles-list"><p>没有找到相关文章！ >-<</p></div>';
    }
    const articlesHTML = data.articles.map(article => {
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
    }).join('');
    const html = `
      <div class="articles-list">
        ${articlesHTML}
      </div>
    `;
    perf.end('生成文章HTML');
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
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = baseHtml;
    const container = tempDiv.querySelector(containerId);
    if (container) {
      container.innerHTML = newHtml;
      return tempDiv.innerHTML;
    }
    console.warn(`警告: ${containerId} 未在页面中找到。将内容追加到末尾。`);
    return baseHtml + newHtml;
  }
  
  // 搜索功能类
  class SearchManager {
    constructor(pageName) {
      this.pageName = pageName; // 'articles' or 'works'
      this.searchInput = null;
      this.searchField = null;
      this.selectedTags = []; // 存储当前选中的标签
      this.allTags = new Set(); // 存储所有可用的标签
      this.init();
    }
  
    init() {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        this.searchInput = document.getElementById('search-input');
        this.searchField = document.getElementById('search-field');
        if (!this.searchInput || !this.searchField) {
          console.error(`搜索元素未在 ${this.pageName} 页面中找到`);
          return;
        }
  
        // 移除可能存在的旧监听器
        this.removeListeners();
  
        // 绑定新监听器到当前实例方法
        this.searchInput._searchListener = this.handleSearch.bind(this);
        this.searchField._searchListener = this.handleSearch.bind(this);
        this.searchInput.addEventListener('input', this.searchInput._searchListener);
        this.searchField.addEventListener('change', this.searchField._searchListener);
  
        // 初始化搜索（显示所有或应用上次的搜索）
        this.handleSearch();
  
        // 初始化标签筛选
        this.initializeTagFilters();
      });
    }
  
    removeListeners() {
      if (this.searchInput && this.searchInput._searchListener) {
        this.searchInput.removeEventListener('input', this.searchInput._searchListener);
        delete this.searchInput._searchListener; // 清理引用
      }
      if (this.searchField && this.searchField._searchListener) {
        this.searchField.removeEventListener('change', this.searchField._searchListener);
        delete this.searchField._searchListener; // 清理引用
      }
    }
  
    handleSearch() {
      const query = this.searchInput.value.trim();
      const field = this.searchField.value;
      try {
        if (this.pageName === 'articles') {
          this.filterArticles(query, field);
        } else if (this.pageName === 'works') {
          this.filterWorks(query, field);
        }
      } catch (e) {
        console.error('搜索过程中出错:', e);
      }
    }
  
    /**
     * 获取指定类型的所有唯一标签
     * @param {string} type - 'works' 或 'articles'
     * @returns {Set<string>} 所有唯一标签的集合
     */
    getAllUniqueTags(type) {
      const tags = new Set();
      const dataKey = type === 'works' ? 'worksData' : 'articlesData';
      const dataString = localStorage.getItem(dataKey);
      if (!dataString) {
        console.error(`${type} 数据未找到，无法提取标签`);
        return tags;
      }
      let data;
      try {
        data = JSON.parse(dataString);
      } catch (e) {
        console.error(`解析缓存${type}数据失败:`, e);
        return tags;
      }
      if (!validateData(data, type)) {
        console.error(`缓存${type}数据格式无效`);
        return tags;
      }
  
      const items = type === 'works' ? data.works : data.articles;
      items.forEach(item => {
        if (item.tag && Array.isArray(item.tag)) {
          item.tag.forEach(tag => tags.add(tag));
        }
      });
      return tags;
    }
  
    /**
     * 初始化标签筛选 UI
     */
    async initializeTagFilters() {
      if (this.pageName !== 'works' && this.pageName !== 'articles') return;
  
      const pageType = this.pageName; // 'works' or 'articles'
      const filterContainerId = pageType === 'works' ? 'work-tags-filter' : 'article-tags-filter';
      const filterContainer = document.getElementById(filterContainerId);
  
      if (!filterContainer) {
        console.error(`标签筛选容器未找到: ${filterContainerId}`);
        return;
      }
  
      // 清空容器内容
      filterContainer.innerHTML = '';
  
      // 创建标签筛选提示
      const label = document.createElement('span');
      label.className = 'filter-label';
      label.textContent = '按标签筛选:';
      filterContainer.appendChild(label);
  
      // 获取所有标签
      const allTags = this.getAllUniqueTags(pageType);
      this.allTags = allTags; // 存储到实例属性
  
      // 如果没有标签，可以不显示筛选器或显示提示
      if (allTags.size === 0) {
        const noTagsMsg = document.createElement('span');
        noTagsMsg.textContent = '暂无标签';
        noTagsMsg.style.color = '#888';
        filterContainer.appendChild(noTagsMsg);
        return;
      }
  
      // 为每个标签创建按钮
      allTags.forEach(tag => {
        const button = document.createElement('button');
        button.type = 'button'; // 防止表单提交
        button.className = 'tag-button';
        button.textContent = tag;
        button.dataset.tag = tag; // 存储标签名以便后续识别
  
        // 添加点击事件
        button.addEventListener('click', () => {
          this.toggleTag(tag, button);
        });
  
        filterContainer.appendChild(button);
      });
  
      // 可选：添加“清除筛选”按钮
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'tag-button';
      clearButton.textContent = '清除筛选';
      clearButton.style.marginLeft = 'auto'; // 右对齐或调整布局
      clearButton.addEventListener('click', () => {
        this.clearAllTags();
      });
      filterContainer.appendChild(clearButton);
  
      // 初始化时根据 URL 参数或状态应用筛选
      // （如果需要的话，可以在 loadPage 或初始化时处理）
    }
  
    /**
     * 切换标签选择状态
     * @param {string} tag - 要切换的标签名
     * @param {HTMLElement} buttonElement - 对应的按钮元素
     */
    toggleTag(tag, buttonElement) {
      const index = this.selectedTags.indexOf(tag);
      if (index > -1) {
        // 已选中 -> 取消选中
        this.selectedTags.splice(index, 1);
        buttonElement.classList.remove('active');
      } else {
        // 未选中 -> 选中
        this.selectedTags.push(tag);
        buttonElement.classList.add('active');
      }
      // 应用筛选
      if (this.pageName === 'articles') {
        this.filterArticles('', 'all'); // 传递空查询，使用标签筛选
      } else if (this.pageName === 'works') {
        this.filterWorks('', 'all'); // 传递空查询，使用标签筛选
      }
    }
  
    /**
     * 清除所有标签筛选
     */
    clearAllTags() {
      this.selectedTags = [];
      // 移除所有按钮的 active 类
      const buttons = document.querySelectorAll(`#${this.pageName === 'works' ? 'work-tags-filter' : 'article-tags-filter'} .tag-button:not(:last-child)`); // 排除清除按钮
      buttons.forEach(btn => {
        btn.classList.remove('active');
      });
      // 应用筛选（显示所有）
      if (this.pageName === 'articles') {
        this.filterArticles('', 'all');
      } else if (this.pageName === 'works') {
        this.filterWorks('', 'all');
      }
    }
  
    filterArticles(query, field) {
      const articlesDataString = localStorage.getItem('articlesData');
      if (!articlesDataString) {
        console.error("文章数据未找到，无法搜索");
        return;
      }
      let articlesData;
      try {
        articlesData = JSON.parse(articlesDataString);
      } catch (e) {
        console.error("解析缓存文章数据失败:", e);
        return;
      }
      if (!validateData(articlesData, 'articles')) {
        console.error("缓存文章数据格式无效");
        return;
      }
  
      let filteredArticles = articlesData.articles;
  
      // 应用标签筛选
      if (this.selectedTags.length > 0) {
        filteredArticles = filteredArticles.filter(article =>
          article.tag &&
          Array.isArray(article.tag) &&
          article.tag.some(tag => this.selectedTags.includes(tag))
        );
      }
  
      // 应用文本搜索 (如果需要)
      if (query && field !== 'tag') { // 如果不是仅标签搜索
        const lowerQuery = query.toLowerCase();
        filteredArticles = filteredArticles.filter(item => {
          if (field === 'title') {
            return item.title.toLowerCase().includes(lowerQuery);
          } else if (field === 'date') {
            return item.date.includes(query);
          } else { // 'all' or other fields
            return (
              item.title.toLowerCase().includes(lowerQuery) ||
              (item.tag && Array.isArray(item.tag) && item.tag.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
              item.date.includes(query)
            );
          }
        });
      }
  
      const filteredHtml = generateArticlesHTML({ articles: filteredArticles });
      const container = document.getElementById('articles-list-container');
      if (container) {
        container.innerHTML = filteredHtml;
        // 搜索后也需要重新设置交互
        this.setupArticleItemsInteraction();
      } else {
        console.error("文章列表容器未找到");
      }
    }
  
    filterWorks(query, field) {
      const worksDataString = localStorage.getItem('worksData');
      if (!worksDataString) {
        console.error("作品数据未找到，无法搜索");
        return;
      }
      let worksData;
      try {
        worksData = JSON.parse(worksDataString);
      } catch (e) {
        console.error("解析缓存作品数据失败:", e);
        return;
      }
      if (!validateData(worksData, 'works')) {
        console.error("缓存作品数据格式无效");
        return;
      }
  
      let filteredWorks = worksData.works;
  
      // 应用标签筛选
      if (this.selectedTags.length > 0) {
        filteredWorks = filteredWorks.filter(work =>
          work.tag &&
          Array.isArray(work.tag) &&
          work.tag.some(tag => this.selectedTags.includes(tag))
        );
      }
  
      // 应用文本搜索 (如果需要)
      if (query && field !== 'tag') { // 如果不是仅标签搜索
        const lowerQuery = query.toLowerCase();
        filteredWorks = filteredWorks.filter(item => {
          if (field === 'title') {
            return item.title.toLowerCase().includes(lowerQuery);
          } else if (field === 'date') {
            return item.date.includes(query);
          } else { // 'all' or other fields
            return (
              item.title.toLowerCase().includes(lowerQuery) ||
              (item.tag && Array.isArray(item.tag) && item.tag.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
              item.date.includes(query)
            );
          }
        });
      }
  
      const filteredHtml = generateWorksHTML({ works: filteredWorks });
      const container = document.getElementById('works-list-container');
      if (container) {
        container.innerHTML = filteredHtml;
        // 搜索后也需要重新设置交互
        this.setupWorkItemsInteraction();
      } else {
        console.error("作品列表容器未找到");
      }
    }
  
    // 重新设置交互，确保事件监听器正确绑定到新生成的元素
    setupArticleItemsInteraction() {
      const content = document.getElementById('mainContent');
      if (!content) {
        console.error("主内容区域未找到，无法设置文章项交互");
        return;
      }
      // 移除旧的监听器
      content.removeEventListener('click', handleArticleItemClick);
      // 绑定新的监听器
      content.addEventListener('click', handleArticleItemClick);
    }
  
    setupWorkItemsInteraction() {
      const content = document.getElementById('mainContent');
      if (!content) {
        console.error("主内容区域未找到，无法设置作品项交互");
        return;
      }
      // 移除旧的监听器
      content.removeEventListener('click', handleWorkItemClick);
      // 绑定新的监听器
      content.addEventListener('click', handleWorkItemClick);
    }
  }
  
  // 页面加载与切换
  async function loadPage(pageName, pushState = true) {
    perf.start(`加载页面: ${pageName}`);
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
        const worksListHtml = generateWorksHTML(worksData);
        content = replaceContainerContent(baseHtml, '#works-list-container', worksListHtml);
      } else if (pageName === 'articles') {
        pageTitle = '文章 - GXY\'s website';
        const baseHtml = await fetchPageContent(`pages/${pageName}.html`);
        const articlesData = await fetchArticlesData();
        const articlesListHtml = generateArticlesHTML(articlesData);
        content = replaceContainerContent(baseHtml, '#articles-list-container', articlesListHtml);
      } else {
        pageTitle = pageConfig[pageName] ? `${pageConfig[pageName]} - GXY's website` : pageTitle;
        if (pageName === '404') {
          content = '<h2>页面未找到</h2><p>抱歉，您访问的页面不存在。</p>';
        } else {
          content = await fetchPageContent(`pages/${pageName}.html`);
        }
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
  
    // 触发页面过渡遮罩
    elements.pageTransition.classList.add('active');
  
    // 获取容器的边界信息和样式
    const containerRect = elements.container.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(elements.container);
    const padding = {
      top: parseFloat(computedStyle.paddingTop),
      right: parseFloat(computedStyle.paddingRight),
      bottom: parseFloat(computedStyle.paddingBottom),
      left: parseFloat(computedStyle.paddingLeft)
    };
  
    // 创建并设置纸张元素
    let paperElement = document.querySelector('.draw-animation-paper');
    if (!paperElement) {
      paperElement = document.createElement('div');
      paperElement.className = 'draw-animation-paper container';
      document.body.appendChild(paperElement);
    }
  
    // 关键修复：使用 fixed 定位和视口坐标
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
  
    // 启动旧内容的"退出"动画
    elements.content.classList.add('fade-out-shrink');
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 触发新内容动画
          paperElement.style.transform = 'translate(0, 0) scale(1)';
          paperElement.style.opacity = '1';
  
          // 监听动画结束
          paperElement.addEventListener('animationend', function animationEndHandler() {
            // 将新内容放入原容器
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
  
            // 初始化页面特定功能
            initializePageFeatures(pageName);
  
            // 移除监听器
            this.removeEventListener('animationend', animationEndHandler);
            resolve();
          }, { once: true });
        });
      });
    });
  }
  
  // 初始化页面特定功能
  function initializePageFeatures(pageName) {
    // 初始化搜索功能 - 每次页面加载都创建一个新的 SearchManager 实例
    if (pageName === 'works' || pageName === 'articles') {
      // 先尝试移除旧的搜索管理器实例（如果有的话，需要在全局或类外部管理实例）
      // 注意：这里只是确保每次都创建新实例，但不会移除旧实例的监听器
      // 更安全的做法是将 SearchManager 实例存储在一个全局变量中，在初始化前清理
      // 但为了简化，这里直接创建新实例
      new SearchManager(pageName);
    }
  
    // 初始化交互功能 - 每次页面加载都重新设置
    if (pageName === 'works') {
      setupWorkItemsInteraction(); // 这个函数内部会移除旧监听器并添加新监听器
    } else if (pageName === 'articles') {
      setupArticleItemsInteraction(); // 这个函数内部会移除旧监听器并添加新监听器
    }
  }
  
  // 交互功能
  function setupWorkItemsInteraction() {
    const content = document.getElementById('mainContent');
    content.removeEventListener('click', handleWorkItemClick);
    content.addEventListener('click', handleWorkItemClick);
  }
  
  function setupArticleItemsInteraction() {
    const content = document.getElementById('mainContent');
    content.removeEventListener('click', handleArticleItemClick);
    content.addEventListener('click', handleArticleItemClick);
  }
  
  function handleWorkItemClick(e) {
    const workItem = e.target.closest('.work-item');
    if (!workItem) return;
    const workId = parseInt(workItem.dataset.id, 10);
    if (isNaN(workId)) return;
    const worksDataString = localStorage.getItem('worksData');
    if (!worksDataString) return;
    const worksData = JSON.parse(worksDataString);
    if (!validateData(worksData, 'works')) return;
    const work = worksData.works.find(w => w.id === workId);
    if (work) {
      showWorkDetails(work);
    }
  }
  
  function handleArticleItemClick(e) {
    const articleItem = e.target.closest('.article-item');
    if (!articleItem) return;
    const articleId = parseInt(articleItem.dataset.id, 10);
    if (isNaN(articleId)) return;
    const articlesDataString = localStorage.getItem('articlesData');
    if (!articlesDataString) return;
    const articlesData = JSON.parse(articlesDataString);
    if (!validateData(articlesData, 'articles')) return;
    const article = articlesData.articles.find(a => a.id === articleId);
    if (article) {
      const articleTitle = encodeURIComponent(article.title);
      window.open(`/articles/?article=${articleTitle}`, '_blank');
    }
  }
  
  // 显示作品详情
  function showWorkDetails(work) {
    // 检查是否已存在活动的详情弹窗
    if (document.querySelector('.work-details-envelope.active')) {
      return;
    }
    const workItem = document.querySelector(`.work-item[data-id="${work.id}"]`);
    if (!workItem) return;
    const workItemRect = workItem.getBoundingClientRect();
  
    // 创建或获取信封元素
    let envelope = document.querySelector('.work-details-envelope');
    if (!envelope) {
      envelope = document.createElement('div');
      envelope.className = 'work-details-envelope';
      document.body.appendChild(envelope);
    }
  
    // 存储初始位置
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
  
    // 创建详情内容
    envelope.innerHTML = `
      <div class="work-details-close">✕</div>
      <div class="work-details-content">
        <h2 class="work-details-title">${work.title}</h2>
        <p class="work-details-description">${work.description}</p>
        ${work.tag && work.tag.length ? `
          <div class="work-details-tag">
            <strong>标签:</strong> ${work.tag.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
          </div>
        ` : ''}
        ${work.link ? `<a href="${work.link}" target="_blank" class="work-details-link">查看</a>` : ''}
      </div>
    `;
  
    const closeBtn = envelope.querySelector('.work-details-close');
  
    // 关闭函数
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
  
    // 绑定关闭事件
    closeBtn.addEventListener('click', closeWorkDetails);
  
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
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
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
    });
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
    const initialPage = getUrlParameter('page') || 'index';
    loadPage(initialPage);
  
    // 添加加载完成标志
    document.body.setAttribute('data-loaded', 'true');
    console.log('✅ 网站初始化完成');
  });