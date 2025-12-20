document.addEventListener('DOMContentLoaded', function() {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const perf = {
      start: function(name) {
          if (window.performance && performance.mark) {
              performance.mark(`${name}-start`);
          }
      },
      end: function(name) {
          if (window.performance && performance.mark) {
              performance.mark(`${name}-end`);
              performance.measure(name, `${name}-start`, `${name}-end`);
          }
      }
  };

  const elements = {
      body: document.body,
      // cursor: $('.cursor'), // Removed custom cursor element
      // grid: $('.grid'), // Removed parallax grid element
      // gridBack: $('.grid-back'), // Removed parallax grid back element
      // dot: $('.dot'), // Removed central dot element
      // lines: $$('.line'), // Removed line elements
      // text: $('.text'), // Removed text element
      particlesContainer: $('.particles'),
      content: $('#mainContent'),
      // floatingElementsContainer: $('.floating-elements'), // Removed floating elements container
      navbar: $('.navbar'),
      navItems: $$('.nav-item'),
      mobileToggle: $('.mobile-toggle'),
      navItemsContainer: $('.nav-items'),
      pageTransition: $('#pageTransition'),
      container: $('.container')
  };

  const state = {
      // isWheelMode: false, // Kept as it seems part of the core logic
      isAnimating: false,
      // lastMouseMoveTime: 0, // Removed mouse move time tracking
      // parallaxId: null, // Removed parallax animation ID
      scrollDelta: 0,
      scrollTimeout: null,
      touchStartY: 0,
      touchMoveY: 0,
      touchDelta: 0,
      touchActive: false,
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0
  };

  function debounce(func, wait, immediate) {
      let timeout;
      return function executedFunction() {
          const context = this;
          const args = arguments;
          const later = function() {
              timeout = null;
              if (!immediate) func.apply(context, args);
          };
          const callNow = immediate && !timeout;
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
          if (callNow) func.apply(context, args);
      };
  }

  function throttle(func, limit) {
      let inThrottle;
      return function() {
          const args = arguments;
          const context = this;
          if (!inThrottle) {
              func.apply(context, args);
              inThrottle = true;
              setTimeout(() => inThrottle = false, limit);
          }
      };
  }

  function init() {
      perf.start('init');
      // createFloatingElements(); // Removed floating elements creation
      setupEventListeners();
      setupSPANavigation();
      setupWorkCardsInteraction();
      let page = (new URLSearchParams(location.search).get('page')) || 'index';
      loadPage(page, false);
      perf.end('init');
  }

  // Removed createFloatingElements function

  function setupEventListeners() {
      perf.start('setupEventListeners');

      // Removed custom cursor event listeners
      /*
      document.addEventListener('mouseenter', () => elements.cursor.classList.add('visible'));
      document.addEventListener('mouseleave', () => elements.cursor.classList.remove('visible'));
      document.addEventListener('mousemove', throttle(handleMouseMove, 16)); // Throttled mousemove removed
      */

      window.addEventListener('wheel', debounce(handleScroll, 100, false), { passive: true });
      window.addEventListener('DOMMouseScroll', debounce(handleScroll, 100, false), { passive: true });

      document.addEventListener('click', createRipple);

      /*
      elements.container.addEventListener('click', function(e) {
          if (!state.isWheelMode && !state.isAnimating && !e.target.closest('.navbar')) {
              activateWheelMode();
          }
      });
      */

      /*
      elements.dot.addEventListener('click', e => state.isWheelMode && createRipple(e));
      */

      elements.mobileToggle.addEventListener('click', () => {
          elements.navItemsContainer.classList.toggle('active');
      });

      if (state.isTouchDevice) {
          window.addEventListener('touchstart', function(e) {
              if (e.touches.length === 1) {
                  state.touchStartY = e.touches[0].clientY;
                  state.touchMoveY = state.touchStartY;
                  state.touchActive = true;
              }
          }, { passive: true });

          window.addEventListener('touchmove', function(e) {
              if (!state.touchActive) return;
              state.touchMoveY = e.touches[0].clientY;
          }, { passive: true });

          window.addEventListener('touchend', function(e) {
              if (!state.touchActive) return;
              state.touchDelta = state.touchMoveY - state.touchStartY;
              /*
              if (state.touchDelta < -60 && !state.isWheelMode) {
                  activateWheelMode();
              }
              if (state.touchDelta > 60 && state.isWheelMode && elements.content.scrollTop <= 0) {
                  deactivateWheelMode();
              }
              */
              state.touchActive = false;
          }, { passive: true });
      }

      perf.end('setupEventListeners');
  }

  function setupSPANavigation() {
      perf.start('setupSPANavigation');
      elements.navItems.forEach(item => {
          item.addEventListener('click', function(e) {
              e.preventDefault();
              const page = this.getAttribute('data-page');
              if (page) {
                  loadPage(page);
              }
          });
      });

      window.addEventListener('popstate', function(e) {
          if (e.state && e.state.page) {
              loadPage(e.state.page, false);
          }
      });

      perf.end('setupSPANavigation');
  }

  function loadPage(pageName, pushState = true) {
      // 使用性能监控开始标记
      perf.start('loadPage');

      // 获取目标页面内容
      let content = '';
      let pageTitle = 'GXY\'s website';
      const templateId = pageName + '-content';
      const template = document.getElementById(templateId);

      if (template) {
          content = template.innerHTML;
      }

      // 设置页面标题
      switch(pageName) {
          case 'about':
              pageTitle = '关于 - GXY\'s website';
              break;
          case 'articles':
              pageTitle = '文章 - GXY\'s website';
              break;
          case 'works':
              pageTitle = '作品 - GXY\'s website';
              // 特殊处理 works 页面，需要异步加载数据
              fetchWorksData().then(worksData => {
                  // 注意：这里不再直接操作 elements.content，而是交给动画处理
                  const worksHTML = generateWorksHTML(worksData);
                  performDrawAnimation(worksHTML, pageName, pageTitle, pushState);
              }).catch(error => {
                  console.error('Failed to load works data:', error);
                  const errorHTML = '<h2>作品集</h2><p>哎呀！加载失败了……要不重新试试？</p>';
                  performDrawAnimation(errorHTML, pageName, pageTitle, pushState);
              });
              // 提前返回，因为是异步操作
              return;
          case 'contact':
              pageTitle = '联系 - GXY\'s website';
              break;
          default:
              pageTitle = 'GXY\'s website';
              pageName = 'index';
              if (template) content = template.innerHTML;
      }

      // 对于非 'works' 页面，执行动画
      performDrawAnimation(content, pageName, pageTitle, pushState);

      // 结束性能监控
      perf.end('loadPage');
  }


  /**
   * 执行抽纸动画的核心函数
   * @param {string} content - 要显示的新页面内容 HTML 字符串
   * @param {string} pageName - 当前加载的页面名称
   * @param {string} pageTitle - 当前加载的页面标题
   * @param {boolean} pushState - 是否更新浏览器历史记录
   */
  function performDrawAnimation(content, pageName, pageTitle, pushState) {
      // 1. 显示全局过渡遮罩（可选，增加视觉反馈）
      elements.pageTransition.classList.add('active');

      // 2. 获取当前主容器 (.container) 的几何信息
      const containerRect = elements.container.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(elements.container);
      const paddingTop = parseFloat(computedStyle.paddingTop);
      const paddingRight = parseFloat(computedStyle.paddingRight);
      const paddingBottom = parseFloat(computedStyle.paddingBottom);
      const paddingLeft = parseFloat(computedStyle.paddingLeft);

      // 3. 创建临时的抽纸动画容器
      const paperElement = document.createElement('div');
      paperElement.className = 'draw-animation-paper';

      // 4. 动态设置临时容器的位置、尺寸和内边距，使其精确匹配当前 .container
      // 并设置初始动画偏移量
      paperElement.style.cssText = `
          top: ${containerRect.top + window.scrollY}px;
          left: ${containerRect.left + window.scrollX}px;
          width: ${containerRect.width}px;
          height: ${containerRect.height}px;
          padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;
          /* 初始变换：从自身高度的下方开始 */
          transform: translateY(${containerRect.height}px) scale(0.98);
      `;

      // 5. 注入新内容
      paperElement.innerHTML = content;

      // 6. 将临时容器添加到 body 中，触发动画
      document.body.appendChild(paperElement);

      // 7. 等待动画完成 (匹配 CSS 动画时长)
      setTimeout(() => {
          // 8. 动画结束后，更新原始容器的内容
          elements.content.innerHTML = content;

          // 9. 更新文档标题
          document.title = pageTitle;

          // 10. 更新浏览器历史记录
          if (pushState) {
              window.history.pushState({page: pageName}, pageTitle, `?page=${pageName}`);
          }

          // 11. 更新导航栏激活状态
          elements.navItems.forEach(item => {
              if (item.getAttribute('data-page') === pageName) {
                  item.classList.add('active');
              } else {
                  item.classList.remove('active');
              }
          });

          // 12. 移除临时动画元素
          if (paperElement.parentNode) {
              paperElement.parentNode.removeChild(paperElement);
          }

          // 13. 隐藏全局过渡遮罩
          elements.pageTransition.classList.remove('active');

          // 14. 可选：为新内容中的交互元素重新绑定事件（如果有的话）
          if (pageName === 'works') {
              setupWorkCardsInteraction();
          }

      }, 600); // 动画时长 0.6s
  }


  async function fetchWorksData() {
      perf.start('fetchWorksData');
      try {
          const response = await fetch('works.json');
          if (!response.ok) throw new Error('Network response was not ok');
          const data = await response.json();
          perf.end('fetchWorksData');
          return data;
      } catch (error) {
          console.error('Error fetching works data:', error);
          perf.end('fetchWorksData');
          throw error;
      }
  }

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
                                      <strong>技术栈:</strong>
                                      ${work.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
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

  function setupWorkCardsInteraction() {
      perf.start('setupWorkCardsInteraction');
      elements.content.addEventListener('click', function(e) {
          const workCard = e.target.closest('.work-card');
          const closeBtn = e.target.closest('.work-close-btn');

          if (workCard && !closeBtn) {
              document.querySelectorAll('.work-card.expanded').forEach(card => {
                  if (card !== workCard) {
                      card.classList.remove('expanded');
                      card.style.minHeight = '';
                      card.style.height = '';
                  }
              });

              workCard.classList.toggle('expanded');
              if (workCard.classList.contains('expanded')) {
                  const back = workCard.querySelector('.work-card-back');
                  workCard.style.height = back.scrollHeight + 'px';
              } else {
                  workCard.style.height = '';
              }
          }

          if (closeBtn) {
              const workCard = closeBtn.closest('.work-card');
              workCard.classList.remove('expanded');
              workCard.style.height = '';
              e.stopPropagation();
          }
      });

      window.addEventListener('resize', debounce(function() {
          document.querySelectorAll('.work-card.expanded').forEach(card => {
              const back = card.querySelector('.work-card-back');
              card.style.height = back.scrollHeight + 'px';
          });
      }, 250));

      perf.end('setupWorkCardsInteraction');
  }

  // Removed handleMouseMove and updateParallax functions related to cursor/parallax

  function handleScroll(e) {
      if (state.isAnimating) return;

      if (state.scrollTimeout) clearTimeout(state.scrollTimeout);

      const delta = e.deltaY || e.detail || (-e.wheelDelta);
      state.scrollDelta += delta;

      /*
      if (state.scrollDelta > 50 && !state.isWheelMode) {
          activateWheelMode();
          state.scrollDelta = 0;
      }
      if (state.scrollDelta < -50 && state.isWheelMode && elements.content.scrollTop <= 0) {
          deactivateWheelMode();
          state.scrollDelta = 0;
          e.preventDefault && e.preventDefault();
          return;
      }
      */

      state.scrollTimeout = setTimeout(() => {
          state.scrollDelta = 0;
      }, 200);
  }

  /*
  function activateWheelMode() {
      if (state.isWheelMode || state.isAnimating) return;
      perf.start('activateWheelMode');
      state.isAnimating = true;
      state.isWheelMode = true;
      elements.lines.forEach(line => line.classList.add('hidden'));
      elements.navbar.classList.add('visible');
      elements.text.classList.add('hidden-element');
      elements.dot.classList.add('hidden-element');
      setTimeout(() => {
          elements.content.classList.add('visible');
          state.isAnimating = false;
          perf.end('activateWheelMode');
      }, 800);
  }

  function deactivateWheelMode() {
      if (!state.isWheelMode || state.isAnimating) return;
      perf.start('deactivateWheelMode');
      state.isAnimating = true;
      state.isWheelMode = false;
      elements.content.classList.remove('visible');
      elements.navbar.classList.remove('visible');
      elements.dot.classList.remove('wheel');
      while (elements.dot.firstChild) {
          elements.dot.removeChild(elements.dot.firstChild);
      }
      elements.lines.forEach(line => line.classList.remove('hidden'));
      elements.text.classList.remove('hidden-element');
      elements.dot.classList.remove('hidden-element');
      setTimeout(() => {
          state.isAnimating = false;
          perf.end('deactivateWheelMode');
      }, 1000);
  }
  */

  function createRipple(e) {
      // Removed custom cursor click effect
      /*
      elements.cursor.classList.add('click');
      setTimeout(() => elements.cursor.classList.remove('click'), 200);
      */

      const ripple = document.createElement('div');
      ripple.className = 'ripple';
      ripple.style.cssText = `
          left: ${e.clientX}px;
          top: ${e.clientY}px;
          width: 0;
          height: 0;
          animation: ripple-effect 1500ms forwards
      `;
      elements.body.appendChild(ripple);

      createParticles(e.clientX, e.clientY);

      setTimeout(() => {
          if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 1500);
  }

  function createParticles(x, y) {
      const fragment = document.createDocumentFragment();
      const count = 20;

      for (let i = 0; i < count; i++) {
          const p = document.createElement('div');
          p.className = 'particle';
          const size = Math.random() * 3 + 2;
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 100 + 50;
          const hue = Math.random() * 60 + 180;
          p.style.cssText = `
              width: ${size}px;
              height: ${size}px;
              left: ${x}px;
              top: ${y}px;
              background-color: hsl(${hue}, 100%, 70%);
              box-shadow: 0 0 5px hsl(${hue}, 100%, 70%);
              animation: particle-float ${Math.random() * 1000 + 500}ms forwards
          `;
          p.style.setProperty('--x', `${Math.cos(angle) * dist}px`);
          p.style.setProperty('--y', `${Math.sin(angle) * dist}px`);
          fragment.appendChild(p);

          setTimeout(() => {
              if (p.parentNode) p.parentNode.removeChild(p);
          }, 1500);
      }

      elements.particlesContainer.appendChild(fragment);
  }

  init();

  window.addEventListener('error', function(e) {
      console.error('Application error:', e.error);
  });
});