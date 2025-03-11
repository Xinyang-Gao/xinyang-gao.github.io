(() => {
    // 视差控制参数
    const parallaxConfig = {
        sensitivity: 0.03, // 灵敏度系数
        layers: [
            { element: null, depth: 500 },  // 近景层
            { element: null, depth: 1000 }, // 中景层
            { element: null, depth: 1500 }  // 远景层
        ]
    };

    let isScrolled = false;
    let mainContent, heroSection;

    const initParallaxLayers = () => {
        parallaxConfig.layers.forEach((layer, index) => {
            const layerElement = document.getElementById(`layer${index + 1}`);
            if (layerElement) {
                layer.element = layerElement;
                createStars(layerElement, 200, index + 1); // 每层200颗星星
            }
        });
    };

    const handleMouseMove = (e) => {
        window.requestAnimationFrame(() => {
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
        });
    };

    const createStars = (container, count, layer) => {
        for (let i = 0; i < count; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animation = `star-flow ${Math.random() * 8 + 6}s linear ${Math.random() * 7}s infinite`;
            star.style.width = `${0.5 + layer * 0.3}px`;
            star.style.height = star.style.width;
            star.style.opacity = 0; // 初始隐藏
            container.appendChild(star);
        }
    };

    const typeWriter = (text, element, speed, callback) => {
        let i = 0;
        element.innerHTML = '';
        element.style.opacity = 1;
        const type = () => {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                setTimeout(type, speed);
            } else if (callback) {
                callback();
            }
        };
        type();
    };

    const handleExploreClick = () => {
        // 隐藏hero区并显示主内容
        heroSection.classList.add('hidden');
        setTimeout(() => {
            heroSection.style.display = 'none';
            // 如有需要，可在此添加标题容器
        }, 500);
        mainContent.style.display = 'block';
        window.scrollTo({ top: mainContent.offsetTop, behavior: 'smooth' });
        
        // 延迟显示瀑布流卡片动画
        const cards = document.querySelectorAll('.portfolio-card');
        cards.forEach((card, index) => {
            card.style.setProperty('--animation-delay', `${index * 0.1}s`);
            card.style.opacity = 1;
            card.style.animation = 'cardFadeIn 0.5s ease forwards, cardZoomIn 0.5s ease forwards';
        });
    };

    const handleCardClick = (url) => {
        window.open('./docs/index.html?md=' + url + '.md', '_blank'); // 在新窗口中打开文章页面
    };

    // 合并滚动及滚轮、触摸监听
    const preventScrollHandler = (e) => {
        if (window.scrollY < mainContent.offsetTop && isScrolled) {
            e.preventDefault();
        }
    };

    const scrollHandler = () => {
        const currentScroll = window.scrollY;
        if (currentScroll < mainContent.offsetTop && isScrolled) {
            // 允许向上滚动到星空区域
            return;
        }
        if (currentScroll >= mainContent.offsetOnTop || currentScroll >= mainContent.offsetTop) {
            isScrolled = true;
        }
    };

    const init = () => {
        mainContent = document.getElementById('mainContent');
        heroSection = document.querySelector('.hero-section');

        initParallaxLayers();
        document.addEventListener('mousemove', handleMouseMove);

        typeWriter('Hi ！我是高新炀', document.getElementById('title'), 50, () => {
            typeWriter('欢迎来到我的个人网站', document.getElementById('subtitle'), 40, () => {
                document.getElementById('startButton').style.opacity = 1;
            });
        });

        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.addEventListener('click', handleExploreClick);
        }

        // 汉堡菜单绑定保持不变
        const hamburger = document.getElementById('hamburger');
        const navLinks = document.getElementById('navLinks');
        if (hamburger && navLinks) {
            hamburger.addEventListener('click', () => {
                navLinks.classList.toggle('active');
                hamburger.classList.toggle('active');
            });
            navLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        navLinks.classList.remove('active');
                        hamburger.classList.remove('active');
                    }
                });
            });
        }
        
        window.addEventListener('scroll', scrollHandler);
        window.addEventListener('wheel', preventScrollHandler, { passive: false });
        window.addEventListener('touchmove', preventScrollHandler, { passive: false });
        
        // 窗口调整事件
        window.addEventListener('resize', () => {
            parallaxConfig.layers.forEach(layer => {
                if (layer.element) {
                    layer.element.innerHTML = '';
                    createStars(layer.element, 200, layer.depth / 500);
                }
            });
        });

        const cards = document.querySelectorAll('.portfolio-card');
        cards.forEach((card, index) => {
            card.addEventListener('click', () => {
                const url = card.getAttribute('data-url');
                if (url) {
                    handleCardClick(url);
                }
            });
        });
    };

    document.addEventListener('DOMContentLoaded', init);
})();