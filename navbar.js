// 导航栏相关功能
function setupNavbar() {
    // 使用更现代的DOM缓存方法
    const $ = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);

    // 缓存导航栏相关DOM元素
    const navbarElements = {
        navItems: $$('.nav-item'),
        mobileToggle: $('.mobile-toggle'),
        navItemsContainer: $('.nav-items')
    };

    // SPA导航功能
    function setupSPANavigation() {
        // 拦截导航项点击事件
        navbarElements.navItems.forEach(item => {
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

    // 初始化导航栏功能
    function initNavbar() {
        // 导航项点击事件
        navbarElements.navItems.forEach(item => {
            item.addEventListener('click', function() {
                navbarElements.navItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
            });
        });

        // 移动端菜单切换
        navbarElements.mobileToggle.addEventListener('click', () => {
            navbarElements.navItemsContainer.classList.toggle('active');
        });

        // 初始化SPA导航
        setupSPANavigation();
    }

    // 暴露公共方法
    window.navbar = {
        init: initNavbar,
        setActivePage: function(pageName) {
            navbarElements.navItems.forEach(item => {
                if (item.getAttribute('data-page') === pageName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }
    };

    // 初始化导航栏
    initNavbar();
}

// 确保DOM加载完成后再初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNavbar);
} else {
    setupNavbar();
}