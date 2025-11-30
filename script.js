﻿document.addEventListener('DOMContentLoaded', function() {
    // 缓存DOM元素
    const $ = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);
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
        scrollHint: $('.scroll-hint'),
        backHint: $('.back-hint'),
        floatingElementsContainer: $('.floating-elements'),
        navbar: $('.navbar'),
        navItems: $$('.nav-item'),
        mobileToggle: $('.mobile-toggle'),
        navItemsContainer: $('.nav-items'),
        pageTransition: $('#pageTransition'),
        container: $('.container') // 添加容器引用
    };

    let isWheelMode = false, isAnimating = false, lastMouseMoveTime = 0, parallaxId = null, scrollDelta = 0, scrollTimeout = null;

    function init() {
        createFloatingElements();
        setupEventListeners();
        setupSPANavigation();
        setupWorkCardsInteraction();
        // 首次加载时根据URL参数或默认加载首页内容
        let page = (new URLSearchParams(location.search).get('page')) || 'index';
        loadPage(page, false);
    }

    function createFloatingElements() {
        for (let i = 0; i < 12; i++) {
            const el = document.createElement('div');
            el.className = 'floating-element';
            const size = Math.random() * 4 + 2;
            Object.assign(el.style, {
                left: `${Math.random() * window.innerWidth}px`,
                top: `${Math.random() * window.innerHeight}px`,
                width: `${size}px`,
                height: `${size}px`,
                animation: `float ${Math.random() * 10000 + 10000}ms infinite ease-in-out`,
                animationDelay: `${Math.random() * 2000}ms`,
                opacity: Math.random() * 0.5 + 0.2
            });
            elements.floatingElementsContainer.appendChild(el);
        }
    }

    function setupEventListeners() {
        document.addEventListener('mouseenter', () => elements.cursor.classList.add('visible'));
        document.addEventListener('mouseleave', () => elements.cursor.classList.remove('visible'));
        document.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('wheel', handleScroll, { passive: true });
        window.addEventListener('DOMMouseScroll', handleScroll, { passive: true });
        document.addEventListener('click', createRipple);
        
        // 添加点击进入功能 - 点击容器任意位置进入内容
        elements.container.addEventListener('click', function(e) {
            // 如果不在wheelMode且不是点击特定元素（如导航栏）
            if (!isWheelMode && !isAnimating && !e.target.closest('.navbar')) {
                activateWheelMode();
            }
        });
        
        elements.dot.addEventListener('click', e => isWheelMode && createRipple(e));
        elements.backHint.addEventListener('click', deactivateWheelMode);
        elements.navItems.forEach(item => item.addEventListener('click', function() {
            elements.navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        }));
        elements.mobileToggle.addEventListener('click', () => elements.navItemsContainer.classList.toggle('active'));

        // 触屏端适配：下滑进入界面
        let touchStartY = 0, touchMoveY = 0, touchDelta = 0, touchActive = false;
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isTouchDevice) {
            window.addEventListener('touchstart', function(e) {
                if (e.touches.length === 1) {
                    touchStartY = e.touches[0].clientY;
                    touchMoveY = touchStartY;
                    touchActive = true;
                }
            }, { passive: true });
            window.addEventListener('touchmove', function(e) {
                if (!touchActive) return;
                touchMoveY = e.touches[0].clientY;
            }, { passive: true });
            window.addEventListener('touchend', function(e) {
                if (!touchActive) return;
                touchDelta = touchMoveY - touchStartY;
                // 向上滑动（页面下滑）进入界面
                if (touchDelta < -60 && !isWheelMode) {
                    activateWheelMode();
                }
                // 向下滑动（页面上滑）返回
                if (touchDelta > 60 && isWheelMode && elements.content.scrollTop <= 0) {
                    deactivateWheelMode();
                }
                touchActive = false;
            }, { passive: true });
        }
    }

    // SPA导航功能
    function setupSPANavigation() {
        // 拦截导航项点击事件
        elements.navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const page = this.getAttribute('data-page');
                if (page) {
                    loadPage(page);
                }
            });
        });

        // 处理浏览器前进后退
        window.addEventListener('popstate', function(e) {
            if (e.state && e.state.page) {
                loadPage(e.state.page, false);
            }
        });
    }

    // 加载页面内容
function loadPage(pageName, pushState = true) {
    // 显示页面过渡动画
    elements.pageTransition.classList.add('active');
    
    // 模拟加载延迟
    setTimeout(() => {
        let content = '';
        let pageTitle = 'GXY\'s website';
        
        // 从HTML模板获取内容
        const templateId = pageName + '-content';
        const template = document.getElementById(templateId);
        
        if (template) {
            content = template.innerHTML;
        }
        
        switch(pageName) {
            case 'about':
                pageTitle = '关于 - GXY\'s website';
                break;
            case 'articles':
                pageTitle = '文章 - GXY\'s website';
                break;
            case 'works':
                pageTitle = '作品 - GXY\'s website';
                // 异步加载作品数据
                fetchWorksData().then(worksData => {
                    elements.content.innerHTML = generateWorksHTML(worksData);
                }).catch(error => {
                    elements.content.innerHTML = '<h2>作品集</h2><p>哎呀！加载失败了……要不重新试试？</p>';
                });
                break;
            case 'contact':
                pageTitle = '联系 - GXY\'s website';
                break;
            default:
                pageTitle = 'GXY\'s website';
                pageName = 'index';
        }
        
        // 更新页面内容（作品页面除外）
        if (pageName !== 'works') {
            elements.content.innerHTML = content;
        }
        document.title = pageTitle;
        
        // 更新URL历史记录
        if (pushState) {
            window.history.pushState({page: pageName}, pageTitle, `?page=${pageName}`);
        }
        
        // 隐藏页面过渡动画
        elements.pageTransition.classList.remove('active');
        
        // 激活当前导航项
        elements.navItems.forEach(item => {
            if (item.getAttribute('data-page') === pageName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }, 300); // 模拟网络延迟
}

    // 获取作品数据
    async function fetchWorksData() {
        try {
            const response = await fetch('works.json');
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error('Error fetching works data:', error);
            throw error;
        }
    }

    // 生成作品HTML
    function generateWorksHTML(data) {
        return `
            <h2>我的作品</h2>
            <div class="works-grid">
                ${data.works.map(work => `
                    <div class="work-card" data-id="${work.id}">
                        <div class="work-card-inner">
                            <div class="work-card-front">
                                ${work.image ? `<img src="${work.image}" alt="${work.title}" class="work-image">` : ''}
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
                                <p class="work-details">${work.details}</p>
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
    }

    // 处理作品卡片点击事件
    function setupWorkCardsInteraction() {
        elements.content.addEventListener('click', function(e) {
            const workCard = e.target.closest('.work-card');
            const closeBtn = e.target.closest('.work-close-btn');

            // 只允许一个卡片展开
            if (workCard && !closeBtn) {
                document.querySelectorAll('.work-card.expanded').forEach(card => {
                    if (card !== workCard) {
                        card.classList.remove('expanded');
                        card.style.minHeight = '';
                        card.style.height = '';
                    }
                });
                workCard.classList.toggle('expanded');
                // 展开后自适应高度
                if (workCard.classList.contains('expanded')) {
                    const back = workCard.querySelector('.work-card-back');
                    // 让卡片高度自适应详细内容
                    workCard.style.minHeight = '';
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

        // 窗口调整时，自动适配
        window.addEventListener('resize', function() {
            document.querySelectorAll('.work-card.expanded').forEach(card => {
                const back = card.querySelector('.work-card-back');
                card.style.height = back.scrollHeight + 'px';
            });
        });
    }

    function handleMouseMove(e) {
        const { clientX: x, clientY: y } = e;
        lastMouseMoveTime = Date.now();
        Object.assign(elements.cursor.style, { left: x + 'px', top: y + 'px' });
        if (!parallaxId) updateParallax(x, y);
    }

    function updateParallax(x, y) {
        if (Date.now() - lastMouseMoveTime > 1000) return parallaxId = null;
        const mx = (x / window.innerWidth - 0.5) * 40, my = (y / window.innerHeight - 0.5) * 40;
        elements.grid.style.transform = `translate(${mx * 0.7}px,${my * 0.7}px)`;
        elements.gridBack.style.transform = `translate(${mx * 0.3}px,${my * 0.3}px)`;
        if (!isWheelMode) elements.dot.style.transform = `translate(${mx * 0.4}px,${my * 0.4}px)`;
        $$('.floating-element').forEach(el => {
            const speed = parseFloat(el.style.width) * 0.1;
            el.style.transform = `translate(${mx * speed * 0.3}px,${my * speed * 0.3}px)`;
        });
        parallaxId = requestAnimationFrame(() => updateParallax(x, y));
    }

    function handleScroll(e) {
        if (isAnimating) return;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        const delta = e.deltaY || e.detail || (-e.wheelDelta);
        scrollDelta += delta;
        if (scrollDelta > 50 && !isWheelMode) {
            activateWheelMode();
            scrollDelta = 0;
        }
        if (scrollDelta < -50 && isWheelMode && elements.content.scrollTop <= 0) {
            deactivateWheelMode();
            scrollDelta = 0;
            e.preventDefault && e.preventDefault();
            return;
        }
        scrollTimeout = setTimeout(() => { scrollDelta = 0; }, 200);
    }

    function activateWheelMode() {
        if (isWheelMode || isAnimating) return;
        isAnimating = true; isWheelMode = true;
        elements.scrollHint.style.opacity = '0';
        elements.lines.forEach(line => line.classList.add('hidden'));
        elements.navbar.classList.add('visible');
        
        // 隐藏文字和中心点
        elements.text.classList.add('hidden-element');
        elements.dot.classList.add('hidden-element');
        
        setTimeout(() => {
            elements.content.classList.add('visible');
            isAnimating = false;
        }, 800);
        setTimeout(() => elements.backHint.classList.add('visible'), 1500);
    }

    function deactivateWheelMode() {
        if (!isWheelMode || isAnimating) return;
        isAnimating = true; isWheelMode = false;
        elements.backHint.classList.remove('visible');
        elements.content.classList.remove('visible');
        elements.navbar.classList.remove('visible');
        elements.dot.classList.remove('wheel');
        while (elements.dot.firstChild) elements.dot.removeChild(elements.dot.firstChild);
        elements.lines.forEach(line => line.classList.remove('hidden'));
        
        // 显示文字和中心点
        elements.text.classList.remove('hidden-element');
        elements.dot.classList.remove('hidden-element');
        
        setTimeout(() => {
            elements.scrollHint.style.opacity = '0.8';
            isAnimating = false;
        }, 1000);
    }

    function createRipple(e) {
        elements.cursor.classList.add('click');
        setTimeout(() => elements.cursor.classList.remove('click'), 200);
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        Object.assign(ripple.style, {
            left: e.clientX + 'px',
            top: e.clientY + 'px',
            width: '0',
            height: '0',
            animation: 'ripple-effect 1500ms forwards'
        });
        elements.body.appendChild(ripple);
        createParticles(e.clientX, e.clientY);
        setTimeout(() => ripple.remove(), 1500);
    }

    function createParticles(x, y) {
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 3 + 2, angle = Math.random() * Math.PI * 2, dist = Math.random() * 100 + 50;
            Object.assign(p.style, {
                width: `${size}px`,
                height: `${size}px`,
                left: `${x}px`,
                top: `${y}px`,
                backgroundColor: `hsl(${Math.random() * 60 + 180},100%,70%)`,
                boxShadow: `0 0 5px hsl(${Math.random() * 60 + 180},100%,70%)`,
                animation: `particle-float ${Math.random() * 1000 + 500}ms forwards`
            });
            p.style.setProperty('--x', `${Math.cos(angle) * dist}px`);
            p.style.setProperty('--y', `${Math.sin(angle) * dist}px`);
            elements.particlesContainer.appendChild(p);
            setTimeout(() => p.remove(), 1500);
        }
    }

    init();
});