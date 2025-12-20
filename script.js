document.addEventListener('DOMContentLoaded', function () {
    // --- 元素获取 ---
    const elements = {
      navItems: document.querySelectorAll('.nav-item'),
      content: document.getElementById('mainContent'),
      pageTransition: document.getElementById('pageTransition'),
      container: document.querySelector('.container')
    };
  
    // --- 性能监控 (可选) ---
    const perf = {
      start(label) {
        console.time(label);
      },
      end(label) {
        console.timeEnd(label);
      }
    };
  
    // --- 辅助函数 ---
    /**
     * 获取 URL 查询参数
     * @param {string} name 参数名
     * @returns {string|null} 参数值
     */
    function getUrlParameter(name) {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(name);
    }
  
    /**
     * 加载作品数据
     * @returns {Promise<Object>} 解析后的 JSON 数据
     */
    async function fetchWorksData() {
      perf.start('fetchWorksData');
      try {
        const response = await fetch('works.json');
        if (!response.ok) throw new Error(`网络响应错误: ${response.statusText}`);
        const data = await response.json();
        perf.end('fetchWorksData');
        return data;
      } catch (error) {
        console.error('获取作品数据失败:', error);
        perf.end('fetchWorksData');
        throw error;
      }
    }
  
    /**
     * 根据作品数据生成 HTML (使用你原来的复杂结构)
     * @param {Object} data 包含 works 数组的根对象
     * @returns {string} 生成的 HTML 字符串
     */
    function generateWorksHTML(data) {
      perf.start('generateWorksHTML');
      if (!data || !data.works) {
        return '<h2>作品集</h2><p>暂无作品数据</p>';
      }
  
      const html = `
        <h2>我的作品</h2>
        <div class="works-grid">
          ${data.works.map(work => `
            <div class="work-card" data-id="${work.id}">
              <div class="work-card-inner">
                <div class="work-card-front">
                  ${work.image ? `<img src="${work.image}" alt="${work.title}" class="work-image" loading="lazy">` : ''}
                  <div class="work-info">
                    <h3 class="work-title">${work.title}</h3>
                    <p class="work-description">${work.description}</p>
                    <div class="work-meta">
                      <span class="work-category">${work.category}</span>
                      <span class="work-date">${work.date}</span>
                    </div>
                  </div>
                </div>
                <div class="work-card-back">
                  <h3>${work.title}</h3>
                  <p class="work-details">${work.description}</p>
                  ${work.technologies && work.technologies.length ? `
                    <div class="work-technologies">
                      <strong>技术栈:</strong> ${work.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
                    </div>
                  ` : ''}
                  ${work.link ? `
                    <div class="work-links">
                      <a href="${work.link}" target="_blank" class="work-link">
                        <i class="fas fa-external-link-alt"></i> 查看项目
                      </a>
                    </div>
                  ` : ''}
                  <button class="work-close-btn">
                    <i class="fas fa-times"></i> 关闭
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      perf.end('generateWorksHTML');
      return html;
    }
  
    // --- 页面加载与切换逻辑 ---
    /**
     * 加载指定页面
     * @param {string} pageName 页面名称
     * @param {boolean} pushState 是否更新浏览器历史记录
     */
    async function loadPage(pageName, pushState = true) {
      perf.start('loadPage');
      let content = '';
      let pageTitle = 'GXY\'s website';
      try {
        // 处理作品页的特殊情况
        if (pageName === 'works') {
          pageTitle = '作品 - GXY\'s website';
          const baseResponse = await fetch(`pages/${pageName}.html`);
          if (!baseResponse.ok) throw new Error(`加载作品页面基础HTML失败: ${baseResponse.statusText}`);
          let baseHtml = await baseResponse.text();
          
          const worksData = await fetchWorksData();
          const worksListHtml = generateWorksHTML(worksData);
          
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = baseHtml;
          const container = tempDiv.querySelector('#works-list-container');
          if (container) {
            container.innerHTML = worksListHtml;
            content = tempDiv.innerHTML;
          } else {
            content = baseHtml + worksListHtml;
            console.warn('警告: 在 works.html 中未找到 #works-list-container，作品列表将被追加到末尾。');
          }
        } else {
          const response = await fetch(`pages/${pageName}.html`);
          if (!response.ok) {
            if (response.status === 404) {
              content = '<h2>页面未找到</h2><p>抱歉，您访问的页面不存在。</p>';
              pageTitle = '页面未找到 - GXY\'s website';
              pageName = '404';
            } else {
              throw new Error(`HTTP 错误! 状态码: ${response.status}`);
            }
          } else {
            content = await response.text();
          }
  
          // 设置页面标题
          switch (pageName) {
            case 'about':
              pageTitle = '关于 - GXY\'s website';
              break;
            case 'articles':
              pageTitle = '文章 - GXY\'s website';
              break;
            case 'contact':
              pageTitle = '联系 - GXY\'s website';
              break;
            case '404':
              pageTitle = '页面未找到 - GXY\'s website';
              break;
            default:
              pageTitle = 'GXY\'s website';
              pageName = 'index';
          }
        }
  
        // 执行动画
        performDrawAnimation(content, pageName, pageTitle, pushState);
      } catch (error) {
        console.error('加载页面时出错:', error);
        const errorContent = '<h2>加载失败</h2><p>哎呀！加载页面时出了点问题……要不刷新试试？</p>';
        performDrawAnimation(errorContent, 'error', '加载失败 - GXY\'s website', pushState);
      } finally {
        perf.end('loadPage');
      }
    }
  
    /**
     * 执行优化后的页面切换动画
     * @param {string} content - 要显示的新页面内容 HTML 字符串
     * @param {string} pageName - 当前加载的页面名称
     * @param {string} pageTitle - 当前加载的页面标题
     * @param {boolean} pushState - 是否更新浏览器历史记录
     */
     function performDrawAnimation(content, pageName, pageTitle, pushState) {
        perf.start('performDrawAnimation');
        
        // 显示页面切换遮罩
        elements.pageTransition.classList.add('active');
    
        // 获取容器尺寸和样式
        const containerRect = elements.container.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(elements.container);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
    
        // 创建用于入场动画的“纸张”元素
        const paperElement = document.createElement('div');
        paperElement.className = 'draw-animation-paper container'; // 添加 container 类以复用样式
        paperElement.style.cssText = `
            top: ${containerRect.top + window.scrollY - paddingTop}px; /* 考虑到padding-top */
            left: ${containerRect.left + window.scrollX}px;
            width: ${containerRect.width}px;
            height: ${containerRect.height + paddingTop + paddingBottom}px; /* 考虑到padding-top和padding-bottom */
            padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;
        `;
        paperElement.innerHTML = content;
    
        // 将“纸张”元素添加到 body
        document.body.appendChild(paperElement);

    // 给当前内容区域添加离场动画类
    elements.content.classList.add('fade-out-shrink');

    // 监听“纸张”入场动画结束事件
    paperElement.addEventListener('animationend', () => {
        // 动画结束后，更新主内容区域的内容
        elements.content.innerHTML = content;
        elements.content.classList.remove('fade-out-shrink'); // 清除离场动画类

        // 更新页面标题和历史记录
        document.title = pageTitle;
        if (pushState) {
            window.history.pushState({ page: pageName }, pageTitle, `?page=${pageName}`);
        }

        // 更新导航栏活动状态
        elements.navItems.forEach(item => {
            if (item.getAttribute('data-page') === pageName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 移除临时“纸张”元素
        if (paperElement.parentNode) {
            paperElement.parentNode.removeChild(paperElement);
        }

        // 隐藏页面切换遮罩
        elements.pageTransition.classList.remove('active');

        // 如果是作品页面，重新设置交互 (事件委托)
        if (pageName === 'works') {
            setupWorkCardsInteraction();
        }

        perf.end('performDrawAnimation');
    }, { once: true }); // 确保只触发一次
}
  
    /**
     * 为工作卡片交互设置事件委托
     */
    function setupWorkCardsInteraction() {
      perf.start('setupWorkCardsInteraction');
      elements.content.removeEventListener('click', handleWorkCardClick);
      elements.content.addEventListener('click', handleWorkCardClick);
      perf.end('setupWorkCardsInteraction');
    }
  
    // --- 工作卡片交互处理器 ---
    function handleWorkCardClick(e) {
      const workCard = e.target.closest('.work-card');
      const closeBtn = e.target.closest('.work-close-btn');
      
      if (workCard) {
        if (closeBtn) {
          workCard.classList.remove('expanded');
          workCard.style.height = '';
          e.stopPropagation();
        } else {
          toggleExpanded(workCard);
        }
      }
    }
  
    function toggleExpanded(card) {
      const isCurrentlyExpanded = card.classList.contains('expanded');
      
      document.querySelectorAll('.work-card.expanded').forEach(otherCard => {
        if (otherCard !== card) {
          otherCard.classList.remove('expanded');
          otherCard.style.height = '';
        }
      });
      
      card.classList.toggle('expanded');
      
      if (!isCurrentlyExpanded) {
        const back = card.querySelector('.work-card-back');
        if (back) {
          card.style.height = 'auto';
          const backHeight = back.offsetHeight;
          card.style.height = '';
          requestAnimationFrame(() => {
            card.style.height = backHeight + 'px';
          });
        }
      } else {
        card.style.height = '';
      }
    }
  
    /**
     * 初始化导航事件监听器
     */
    function initNavigation() {
      elements.navItems.forEach(item => {
        item.addEventListener('click', function (e) {
          e.preventDefault();
          const page = this.getAttribute('data-page');
          if (page) {
            loadPage(page);
          }
        });
      });
    }
  
    /**
     * 初始化历史记录变化监听器
     */
    function initPopstate() {
      window.addEventListener('popstate', function (event) {
        const page = event.state ? event.state.page : 'index';
        loadPage(page, false);
      });
    }
  
    // --- 初始化 ---
    initNavigation();
    initPopstate();
    
    const initialPage = getUrlParameter('page') || 'index';
    loadPage(initialPage);
  });