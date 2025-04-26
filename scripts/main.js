// 返回顶部按钮功能
const backToTopButton = document.getElementById('back-to-top');

// 监听滚动事件
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        backToTopButton.classList.add('show');
    } else {
        backToTopButton.classList.remove('show');
    }
});

// 点击按钮平滑滚动到顶部
backToTopButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// 主题切换功能
const themeToggle = document.querySelector('.theme-toggle');
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    // 可以添加本地存储来记住用户偏好
});

// 语言切换功能
const languageToggle = document.querySelector('.language-toggle');
languageToggle.addEventListener('click', () => {
    // 这里可以添加语言切换逻辑
    alert('语言切换功能正在开发中！');
    // 例如，使用本地存储来记住用户的语言偏好
});

// 汉堡菜单功能
const hamburger = document.querySelector('.hamburger');
const hamburgerMenu = document.querySelector('.hamburger-menu');
hamburger.addEventListener('click', () => {
    hamburgerMenu.classList.toggle('show');
});

// 点击菜单外区域关闭菜单
document.addEventListener('click', (e) => {
    if (!e.target.closest('.hamburger') && !e.target.closest('.hamburger-menu')) {
        hamburgerMenu.classList.remove('show');
    }
});

// 加载内容
window.addEventListener('DOMContentLoaded', () => {
    fetch('content.html')
        .then(response => response.text())
        .then(html => {
            document.querySelector('.content').innerHTML = html;
        })
        .catch(err => {
            console.error('加载内容失败:', err);
            document.querySelector('.content').innerHTML = '<h1>欢迎来到我的网站</h1><p>……数据丢失了，试试刷新能否找到它们吧！</p>';
        });
});