document.addEventListener('DOMContentLoaded', function () {
    const $ = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);

    const perf = {
        start: function (name) {
            if (window.performance && performance.mark) {
                performance.mark(`${name}-start`);
            }
        },
        end: function (name) {
            if (window.performance && performance.mark) {
                performance.mark(`${name}-end`);
                performance.measure(name, `${name}-start`, `${name}-end`);
            }
        }
    };

    const elements = {
        body: document.body,
        particlesContainer: $('.particles'), // 保留容器，即使内容已清空
        content: $('#mainContent'),
        navbar: $('.navbar'),
        navItems: $$('.nav-item'),
        mobileToggle: $('.mobile-toggle'),
        navItemsContainer: $('.nav-items'),
        pageTransition: $('#pageTransition'),
        container: $('.container')
    };

    const state = {
        isAnimating: false,
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
            const later = function () {
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
        return function () {
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
        setupEventListeners();
        setupSPANavigation();
        setupWorkCardsInteraction();
        let page = (new URLSearchParams(location.search).get('page')) || 'index';
        loadPage(page, false);
        perf.end('init');
    }


    function setupEventListeners() {
        perf.start('setupEventListeners');

        window.addEventListener('wheel', debounce(handleScroll, 100, false), { passive: true });
        window.addEventListener('DOMMouseScroll', debounce(handleScroll, 100, false), { passive: true });

        document.addEventListener('click', createRipple);

        elements.mobileToggle.addEventListener('click', () => {
            elements.navItemsContainer.classList.toggle('active');
        });

        if (state.isTouchDevice) {
            window.addEventListener('touchstart', function (e) {
                if (e.touches.length === 1) {
                    state.touchStartY = e.touches[0].clientY;
                    state.touchMoveY = state.touchStartY;
                    state.touchActive = true;
                }
            }, { passive: true });

            window.addEventListener('touchmove', function (e) {
                if (!state.touchActive) return;
                state.touchMoveY = e.touches[0].clientY;
            }, { passive: true });

            window.addEventListener('touchend', function (e) {
                if (!state.touchActive) return;
                state.touchDelta = state.touchMoveY - state.touchStartY;
                state.touchActive = false;
            }, { passive: true });
        }

        perf.end('setupEventListeners');
    }

    function setupSPANavigation() {
        perf.start('setupSPANavigation');
        elements.navItems.forEach(item => {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                const page = this.getAttribute('data-page');
                if (page) {
                    loadPage(page);
                }
            });
        });

        window.addEventListener('popstate', function (e) {
            if (e.state && e.state.page) {
                loadPage(e.state.page, false);
            }
        });

        perf.end('setupSPANavigation');
    }

    function loadPage(pageName, pushState = true) {
        perf.start('loadPage');

        let content = '';
        let pageTitle = 'GXY\'s website';
        const templateId = pageName + '-content';
        const template = document.getElementById(templateId);

        if (template) {
            content = template.innerHTML;
        }

        switch (pageName) {
            case 'about':
                pageTitle = '关于 - GXY\'s website';
                break;
            case 'articles':
                pageTitle = '文章 - GXY\'s website';
                break;
            case 'works':
                pageTitle = '作品 - GXY\'s website';
                fetchWorksData().then(worksData => {
                    const worksHTML = generateWorksHTML(worksData);
                    performDrawAnimation(worksHTML, pageName, pageTitle, pushState);
                }).catch(error => {
                    console.error('Failed to load works data:', error);
                    const errorHTML = '<h2>作品集</h2><p>哎呀！加载失败了……要不重新试试？</p>';
                    performDrawAnimation(errorHTML, pageName, pageTitle, pushState);
                });
                return;
            case 'contact':
                pageTitle = '联系 - GXY\'s website';
                break;
            default:
                pageTitle = 'GXY\'s website';
                pageName = 'index';
                if (template) content = template.innerHTML;
        }

        performDrawAnimation(content, pageName, pageTitle, pushState);
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
        elements.pageTransition.classList.add('active');

        const containerRect = elements.container.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(elements.container);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);

        const paperElement = document.createElement('div');
        paperElement.className = 'draw-animation-paper container'; // 添加 container 类以复用样式

        paperElement.style.cssText = `
            top: ${containerRect.top + window.scrollY}px;
            left: ${containerRect.left + window.scrollX}px;
            width: ${containerRect.width}px;
            height: ${containerRect.height}px;
            padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;
            /* 初始变换由 CSS 动画 keyframes 定义 */
        `;

        paperElement.innerHTML = content;

        // 使用 animationend 事件确保动画完成后才更新内容
        paperElement.addEventListener('animationend', () => {
            elements.content.innerHTML = content;
            document.title = pageTitle;
            if (pushState) {
                window.history.pushState({ page: pageName }, pageTitle, `?page=${pageName}`);
            }

            elements.navItems.forEach(item => {
                if (item.getAttribute('data-page') === pageName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            if (paperElement.parentNode) {
                paperElement.parentNode.removeChild(paperElement);
            }
            elements.pageTransition.classList.remove('active');

            if (pageName === 'works') {
                setupWorkCardsInteraction();
            }

        }, { once: true }); // 确保只触发一次

        document.body.appendChild(paperElement);
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

        // 使用事件委托处理卡片点击和关闭按钮点击
        elements.content.removeEventListener('click', handleWorkCardClick); // 避免重复绑定
        elements.content.addEventListener('click', handleWorkCardClick);

        window.removeEventListener('resize', debouncedResizeHandler); // 避免重复绑定
        window.addEventListener('resize', debouncedResizeHandler);

        perf.end('setupWorkCardsInteraction');
    }

    // 为工作卡片交互定义独立的处理器
    function handleWorkCardClick(e) {
        const workCard = e.target.closest('.work-card');
        const closeBtn = e.target.closest('.work-close-btn');

        if (workCard) {
            if (closeBtn) {
                // 关闭按钮被点击
                workCard.classList.remove('expanded');
                workCard.style.height = ''; // 重置高度
                e.stopPropagation(); // 阻止事件冒泡触发 toggleExpanded
            } else {
                // 卡片本身被点击
                toggleExpanded(workCard);
            }
        }
    }

    // 窗口大小改变时调整展开卡片的高度
    const debouncedResizeHandler = debounce(function () {
        adjustExpandedCardHeights();
    }, 250);

    // 切换卡片展开/收起状态的辅助函数
    function toggleExpanded(card) {
        const isCurrentlyExpanded = card.classList.contains('expanded');

        // 收起所有其他已展开的卡片
        document.querySelectorAll('.work-card.expanded').forEach(otherCard => {
            if (otherCard !== card) {
                otherCard.classList.remove('expanded');
                otherCard.style.height = ''; // 重置高度
            }
        });

        // 切换当前卡片的展开状态
        card.classList.toggle('expanded');

        if (!isCurrentlyExpanded) { // 如果即将展开
            const back = card.querySelector('.work-card-back');
            if (back) {
                // 触发重排(reflow)以获取正确的 scrollHeight
                card.style.height = 'auto';
                const backHeight = back.offsetHeight;
                card.style.height = ''; // 重置以便动画生效
                requestAnimationFrame(() => {
                     card.style.height = backHeight + 'px';
                });
            }
        } else { // 如果即将收起
            card.style.height = ''; // 重置高度
        }
    }

    // 调整所有展开卡片高度的辅助函数
    function adjustExpandedCardHeights() {
        document.querySelectorAll('.work-card.expanded').forEach(card => {
            const back = card.querySelector('.work-card-back');
            if (back) {
                card.style.height = 'auto'; // 临时设为 auto 获取内容高度
                const backHeight = back.offsetHeight;
                card.style.height = backHeight + 'px'; // 设置为内容高度
            }
        });
    }


    function handleScroll(e) {
        if (state.isAnimating) return;

        if (state.scrollTimeout) clearTimeout(state.scrollTimeout);

        const delta = e.deltaY || e.detail || (-e.wheelDelta);
        state.scrollDelta += delta;


        state.scrollTimeout = setTimeout(() => {
            state.scrollDelta = 0;
        }, 200);
    }


    function createRipple(e) {
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        // 动画样式已在 CSS 中定义

        elements.body.appendChild(ripple);

        // 自动移除波纹元素
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600); // 与 CSS 动画时长匹配
    }


    init();

    window.addEventListener('error', function (e) {
        console.error('Application error:', e.error);
    });
});