// 视差控制参数
const parallaxConfig = {
    sensitivity: 0.03, // 灵敏度系数
    layers: [
        { element: null, depth: 500 },  // 近景层
        { element: null, depth: 1000 }, // 中景层
        { element: null, depth: 1500 }  // 远景层
    ]
};

// 定义 isScrolled 变量
let isScrolled = false;

// 初始化视差层
function initParallaxLayers() {
    parallaxConfig.layers.forEach((layer, index) => {
        const layerElement = document.getElementById(`layer${index + 1}`);
        if (layerElement) {
            layer.element = layerElement;
            createStars(layerElement, 200, index + 1); // 每层200颗星星
        }
    });
}

// 处理鼠标移动事件
function handleMouseMove(e) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const offsetX = (centerX - e.clientX) * parallaxConfig.sensitivity;
    const offsetY = (centerY - e.clientY) * parallaxConfig.sensitivity;

    parallaxConfig.layers.forEach(layer => {
        if (layer.element) {
            const depthFactor = layer.depth / 1500;
            layer.element.style.transform = `
                translateX(${offsetX * depthFactor}px)
                translateY(${offsetY * depthFactor}px)
                translateZ(-${layer.depth}px)
            `;
        }
    });
}

// 生成星星
function createStars(container, count, layer) {
    for (let i = 0; i < count; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        
        // 随机位置和动画参数
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animation = `star-flow ${Math.random() * 8 + 6}s linear ${Math.random() * 7}s infinite`;

        // 根据层级设置属性
        star.style.width = `${0.5 + layer * 0.3}px`;
        star.style.height = star.style.width;
        star.style.opacity = 0; // 初始隐藏

        container.appendChild(star);
    }
}

// 文字动画
function typeWriter(text, element, speed, callback) {
    let i = 0;
    element.innerHTML = '';
    element.style.opacity = 1;
    
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        } else if (callback) {
            callback();
        }
    }
    type();
}

// 处理探索按钮点击事件
function handleExploreClick() {
    const content = document.querySelector('.hero-section');
    const mainContent = document.getElementById('mainContent');
    const titleContainer = document.createElement('div');

    // 设置容器样式
    titleContainer.className = 'title-container';

    // 隐藏hero-section
    content.classList.add('hidden');
    setTimeout(() => {
        content.style.display = 'none';
        document.body.appendChild(titleContainer);
    }, 500);

    // 显示主内容并滚动
    mainContent.style.display = 'block';
    window.scrollTo({
        top: mainContent.offsetTop,
        behavior: 'smooth'
    });

    // 延迟显示瀑布流卡片动画
        const cards = document.querySelectorAll('.portfolio-card');
        cards.forEach((card, index) => {
            card.style.setProperty('--animation-delay', `${index * 0.1}s`);
            card.style.opacity = 1; // 确保卡片可见
            card.style.animation = 'cardFadeIn 0.5s ease forwards, cardZoomIn 0.5s ease forwards'; // 添加动画
        });

    // 锁定滚动控制
    window.addEventListener('scroll', function scrollHandler() {
        const currentScroll = window.scrollY;
        
        if (currentScroll < mainContent.offsetTop && isScrolled) {
            window.scrollTo({
                top: mainContent.offsetTop,
                behavior: 'auto'
            });
        }
        
        if (currentScroll >= mainContent.offsetTop) {
            isScrolled = true;
        }
    });

    // 禁用鼠标滚轮（可选）
    window.addEventListener('wheel', function(e) {
        if (e.deltaY < 0 && isScrolled) {
            e.preventDefault();
        }
    }, { passive: false });

    // 禁用触摸滑动（移动端）
    window.addEventListener('touchmove', function(e) {
        if (window.scrollY < mainContent.offsetTop && isScrolled) {
            e.preventDefault();
        }
    }, { passive: false });
}

// 初始化函数
function init() {
    // 视差初始化
    initParallaxLayers();
    document.addEventListener('mousemove', handleMouseMove);

    // 文字动画
    typeWriter('Hi ！我是高新炀', document.getElementById('title'), 50, () => {
        typeWriter('欢迎来到我的个人网站',
            document.getElementById('subtitle'), 40, () => {
                document.getElementById('startButton').style.opacity = 1;
            });
    });

    // 按钮事件绑定
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.addEventListener('click', handleExploreClick);
    }

    // 汉堡菜单绑定
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('active');
        });

        // 菜单链接点击事件
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    navLinks.classList.remove('active');
                    hamburger.classList.remove('active');
                }
            });
        });
    }

    // 窗口调整事件
    window.addEventListener('resize', () => {
        parallaxConfig.layers.forEach(layer => {
            if (layer.element) {
                layer.element.innerHTML = '';
                createStars(layer.element, 200, layer.depth / 500);
            }
        });
    });
}

// 页面加载完成后执行初始化
document.addEventListener('DOMContentLoaded', init);