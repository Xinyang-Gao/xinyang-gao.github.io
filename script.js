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
    cursor: $('.cursor'),
    grid: $('.grid'),
    gridBack: $('.grid-back'),
    dot: $('.dot'),
    lines: $$('.line'),
    text: $('.text'),
    particlesContainer: $('.particles'),
    content: $('#mainContent'),
    floatingElementsContainer: $('.floating-elements'),
    navbar: $('.navbar'),
    navItems: $$('.nav-item'),
    mobileToggle: $('.mobile-toggle'),
    navItemsContainer: $('.nav-items'),
    pageTransition: $('#pageTransition'),
    container: $('.container')
  };

  const state = {
    isWheelMode: false,
    isAnimating: false,
    lastMouseMoveTime: 0,
    parallaxId: null,
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
    createFloatingElements();
    setupEventListeners();
    setupSPANavigation();
    setupWorkCardsInteraction();
    let page = (new URLSearchParams(location.search).get('page')) || 'index';
    loadPage(page, false);
    perf.end('init');
  }

  function createFloatingElements() {
    perf.start('createFloatingElements');
    const fragment = document.createDocumentFragment();
    const count = 12;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'floating-element';
      const size = Math.random() * 4 + 2;
      el.style.cssText = `
        left: ${Math.random() * window.innerWidth}px;
        top: ${Math.random() * window.innerHeight}px;
        width: ${size}px;
        height: ${size}px;
        animation: float ${Math.random() * 10000 + 10000}ms infinite ease-in-out;
        animation-delay: ${Math.random() * 2000}ms;
        opacity: ${Math.random() * 0.5 + 0.2}
      `;
      fragment.appendChild(el);
    }
    elements.floatingElementsContainer.appendChild(fragment);
    perf.end('createFloatingElements');
  }

  function setupEventListeners() {
    perf.start('setupEventListeners');
    document.addEventListener('mouseenter', () => elements.cursor.classList.add('visible'));
    document.addEventListener('mouseleave', () => elements.cursor.classList.remove('visible'));
    document.addEventListener('mousemove', throttle(handleMouseMove, 16));
    window.addEventListener('wheel', debounce(handleScroll, 100, false), { passive: true });
    window.addEventListener('DOMMouseScroll', debounce(handleScroll, 100, false), { passive: true });
    document.addEventListener('click', createRipple);
    elements.container.addEventListener('click', function(e) {
      if (!state.isWheelMode && !state.isAnimating && !e.target.closest('.navbar')) {
        activateWheelMode();
      }
    });
    elements.dot.addEventListener('click', e => state.isWheelMode && createRipple(e));
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
        if (state.touchDelta < -60 && !state.isWheelMode) {
          activateWheelMode();
        }
        if (state.touchDelta > 60 && state.isWheelMode && elements.content.scrollTop <= 0) {
          deactivateWheelMode();
        }
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
    perf.start('loadPage');
    elements.pageTransition.classList.add('active');
    setTimeout(() => {
      let content = '';
      let pageTitle = 'GXY\'s website';
      const templateId = pageName + '-content';
      const template = document.getElementById(templateId);
      if (template) {
        content = template.innerHTML;
      }

      switch(pageName) {
        case 'about': pageTitle = '关于 - GXY\'s website'; break;
        case 'articles': pageTitle = '文章 - GXY\'s website'; break;
        case 'works': 
          pageTitle = '作品 - GXY\'s website';
          fetchWorksData().then(worksData => {
            elements.content.innerHTML = generateWorksHTML(worksData);
          }).catch(error => {
            console.error('Failed to load works data:', error);
            elements.content.innerHTML = '<h2>作品集</h2><p>哎呀！加载失败了……要不重新试试？</p>';
          });
          break;
        case 'contact': pageTitle = '联系 - GXY\'s website'; break;
        default: 
          pageTitle = 'GXY\'s website';
          pageName = 'index';
          if (template) content = template.innerHTML;
      }

      if (pageName !== 'works') {
        elements.content.innerHTML = content;
      }
      document.title = pageTitle;

      if (pushState) {
        window.history.pushState({page: pageName}, pageTitle, `?page=${pageName}`);
      }

      elements.pageTransition.classList.remove('active');

      elements.navItems.forEach(item => {
        if (item.getAttribute('data-page') === pageName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      perf.end('loadPage');
    }, 100);
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

  function handleMouseMove(e) {
    const { clientX: x, clientY: y } = e;
    state.lastMouseMoveTime = Date.now();
    requestAnimationFrame(() => {
      elements.cursor.style.left = x + 'px';
      elements.cursor.style.top = y + 'px';
    });
    if (!state.parallaxId) updateParallax(x, y);
  }

  function updateParallax(x, y) {
    if (Date.now() - state.lastMouseMoveTime > 1000) {
      state.parallaxId = null;
      return;
    }
    const mx = (x / window.innerWidth - 0.5) * 40;
    const my = (y / window.innerHeight - 0.5) * 40;
    elements.grid.style.transform = `translate3d(${mx * 0.7}px, ${my * 0.7}px, 0)`;
    elements.gridBack.style.transform = `translate3d(${mx * 0.3}px, ${my * 0.3}px, 0)`;
    if (!state.isWheelMode) {
      elements.dot.style.transform = `translate3d(${mx * 0.4}px, ${my * 0.4}px, 0)`;
    }
    $$('.floating-element').forEach(el => {
      const speed = parseFloat(el.style.width) * 0.1;
      el.style.transform = `translate3d(${mx * speed * 0.3}px, ${my * speed * 0.3}px, 0)`;
    });
    state.parallaxId = requestAnimationFrame(() => updateParallax(x, y));
  }

  function handleScroll(e) {
    if (state.isAnimating) return;
    if (state.scrollTimeout) clearTimeout(state.scrollTimeout);
    const delta = e.deltaY || e.detail || (-e.wheelDelta);
    state.scrollDelta += delta;
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
    state.scrollTimeout = setTimeout(() => {
      state.scrollDelta = 0;
    }, 200);
  }

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

  function createRipple(e) {
    elements.cursor.classList.add('click');
    setTimeout(() => elements.cursor.classList.remove('click'), 200);
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
