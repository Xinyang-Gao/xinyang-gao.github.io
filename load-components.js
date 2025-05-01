// 加载公共组件
function loadCommonComponents() {
    // 加载导航栏
    fetch('/navbar.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
            // 初始化导航栏相关功能
            initNavbar();
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

// 初始化导航栏功能
function initNavbar() {
    // 这里可以放置导航栏的交互逻辑
    // 例如：主题切换、菜单展开等
    console.log('导航栏初始化完成');
}

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    loadCommonComponents();
});