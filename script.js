    <script>
        // 视差控制参数
        const parallaxConfig = {
            sensitivity: 0.03, // 灵敏度系数
            layers: [
                { element: null, depth: 500 },  // 近景层
                { element: null, depth: 1000 }, // 中景层
                { element: null, depth: 1500 }  // 远景层
            ]
        };

        // 初始化视差层
        function initParallaxLayers() {
            parallaxConfig.layers.forEach((layer, index) => {
                const layerElement = document.getElementById(`layer${index + 1}`);
                layer.element = layerElement;
                createStars(layerElement, 200, index + 1); // 每层200颗星星
            });
        }

        // 改进的鼠标移动处理
        function handleMouseMove(e) {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const offsetX = (centerX - e.clientX) * parallaxConfig.sensitivity;
            const offsetY = (centerY - e.clientY) * parallaxConfig.sensitivity;

            parallaxConfig.layers.forEach(layer => {
                const depthFactor = layer.depth / 1500;
                layer.element.style.transform = `
                    translateX(${offsetX * depthFactor}px)
                    translateY(${offsetY * depthFactor}px)
                    translateZ(-${layer.depth}px)
                `;
            });
        }

        // 生成带视差的星星
        function createStars(container, count, layer) {
            for (let i = 0; i < count; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                
                // 随机位置和动画参数
                star.style.left = Math.random() * 100 + '%';
                star.style.top = Math.random() * 100 + '%';
                star.style.animation = `
                    star-flow ${Math.random() * 8 + 6}s linear ${Math.random() * 7}s infinite
                `;

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

        // 初始化
        window.addEventListener('DOMContentLoaded', () => {
            initParallaxLayers();
            document.addEventListener('mousemove', handleMouseMove);

            typeWriter('欢迎来到我的个人网站', document.getElementById('title'), 50, () => {
                typeWriter('这里有我的个人作品和文章等等......还有其他一些稀奇古怪的东西', document.getElementById('subtitle'), 40, () => {
                    document.getElementById('startButton').style.opacity = 1;
                });
            });
        });

        // 点击事件
        document.getElementById('startButton').addEventListener('click', function() {
            const content = document.querySelector('.hero-section');
            const mainContent = document.getElementById('mainContent');

            content.style.animation = 'content-expand 3s linear forwards';
            content.addEventListener('animationend', () => {
                mainContent.style.display = 'block';
                window.scrollTo({
                    top: mainContent.offsetTop - 80,
                    behavior: 'smooth'
                });
            });
        });

        // 汉堡菜单交互
        const hamburger = document.getElementById('hamburger');
        const navLinks = document.getElementById('navLinks');

        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('active');
        });

        // 点击链接后关闭菜单（移动端）
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    navLinks.classList.remove('active');
                    hamburger.classList.remove('active');
                }
            });
        });

        // 窗口调整时重置
        window.addEventListener('resize', () => {
            parallaxConfig.layers.forEach(layer => {
                layer.element.innerHTML = '';
                createStars(layer.element, 200, layer.depth / 500);
            });
        });