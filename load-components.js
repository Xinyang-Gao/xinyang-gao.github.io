// 加载公共组件
function loadCommonComponents() {
    // 加载导航栏
    fetch('/navbar.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
            // 初始化导航栏功能
            initNavbar();
            // 设置当前页面高亮
            highlightCurrentPage();
        })
        .catch(error => console.error('加载导航栏失败:', error));
    
    // 加载页脚
    fetch('/footer.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('footer-container').innerHTML = html;
        })
        .catch(error => console.error('加载页脚失败:', error));
}

// 高亮当前页面
function highlightCurrentPage() {
    // 获取当前页面路径
    const currentPath = window.location.pathname;
    
    // 定义页面匹配规则
    const pageMap = {
        '/': 'home',
        '/index.html': 'home',
        '/blog/blog.html': 'blog',
        '/file/file.html': 'file'
    };
    
    // 获取当前页面标识
    let currentPage = pageMap[currentPath] || '';
    
    // 如果没有匹配到，尝试从路径推断
    if (!currentPage) {
        if (currentPath.includes('blog')) currentPage = 'blog';
        if (currentPath.includes('file')) currentPage = 'file';
    }
    
    // 高亮对应的导航链接
    if (currentPage) {
        const activeLinks = document.querySelectorAll(`.nav-link[data-page="${currentPage}"]`);
        activeLinks.forEach(link => {
            link.classList.add('active');
        });
    }
}

// 初始化导航栏功能
function initNavbar() {
    // 主题切换
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // 汉堡菜单
    const hamburger = document.querySelector('.hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', toggleHamburgerMenu);
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    // 可以添加本地存储逻辑保存主题偏好
}

function toggleHamburgerMenu() {
    const menu = document.querySelector('.hamburger-menu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    loadCommonComponents();
});