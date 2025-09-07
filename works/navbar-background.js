// 导航栏和背景交互功能
document.addEventListener('DOMContentLoaded', function() {
    // 缓存DOM元素
    const $ = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);
    
    const elements = {
        grid: $('.grid'),
        gridBack: $('.grid-back'),
        navbar: $('.navbar'),
        navItemsContainer: $('.nav-items'),
        mobileToggle: $('.mobile-toggle'),
        navItems: $$('.nav-item')
    };

    // 初始化函数
    function initNavbarAndBackground() {
        setupNavbarInteractions();
        setupParallaxEffect();
    }

    // 设置导航栏交互
    function setupNavbarInteractions() {
        // 移动端菜单切换
        if (elements.mobileToggle) {
            elements.mobileToggle.addEventListener('click', () => {
                elements.navItemsContainer.classList.toggle('active');
            });
        }

        // 导航项点击事件
        elements.navItems.forEach(item => {
            item.addEventListener('click', function() {
                elements.navItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                
                // 在移动端点击后关闭菜单
                if (window.innerWidth <= 992) {
                    elements.navItemsContainer.classList.remove('active');
                }
            });
        });
    }

    // 设置视差效果
    function setupParallaxEffect() {
        let lastMouseMoveTime = 0;
        let parallaxId = null;
        
        // 鼠标移动处理
        document.addEventListener('mousemove', handleMouseMove);
        
        function handleMouseMove(e) {
            const { clientX: x, clientY: y } = e;
            lastMouseMoveTime = Date.now();
            
            if (!parallaxId) {
                updateParallax(x, y);
            }
        }

        function updateParallax(x, y) {
            if (Date.now() - lastMouseMoveTime > 1000) {
                parallaxId = null;
                return;
            }
            
            const mx = (x / window.innerWidth - 0.5) * 40;
            const my = (y / window.innerHeight - 0.5) * 40;
            
            if (elements.grid) {
                elements.grid.style.transform = `translate(${mx * 0.7}px,${my * 0.7}px)`;
            }
            
            if (elements.gridBack) {
                elements.gridBack.style.transform = `translate(${mx * 0.3}px,${my * 0.3}px)`;
            }
            
            parallaxId = requestAnimationFrame(() => updateParallax(x, y));
        }
    }

    // 显示导航栏
    function showNavbar() {
        if (elements.navbar) {
            elements.navbar.classList.add('visible');
        }
    }

    // 隐藏导航栏
    function hideNavbar() {
        if (elements.navbar) {
            elements.navbar.classList.remove('visible');
        }
    }

    // 初始化
    initNavbarAndBackground();

    // 导出函数供主脚本使用
    window.navbarBackground = {
        showNavbar,
        hideNavbar
    };
});