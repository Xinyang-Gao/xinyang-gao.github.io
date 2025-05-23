// 加载公共组件
function loadCommonComponents() {
    // 加载导航栏
    fetch('navbar.html')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.text();
        })
        .then(data => {
            const container = document.getElementById('navbar-container');
            if (!container) return;
            
            container.innerHTML = data;
            
            // 检查元素是否存在再初始化
            if (document.querySelector('.theme-toggle')) setupThemeToggle();
            if (document.querySelector('.language-toggle')) setupLanguageToggle();
            if (document.querySelector('.hamburger')) setupHamburgerMenu();
            setupSmoothScrolling();
            highlightCurrentPage();
        })
        .catch(error => console.error('加载导航栏失败:', error));
    
    // 加载底部
    fetch('footer.html')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.text();
        })
        .then(data => {
            const container = document.getElementById('footer-container');
            if (!container) return;
            
            container.innerHTML = data;
            
            // 检查按钮是否存在再初始化
            if (document.getElementById('back-to-top')) {
                setupBackToTopButton();
            }
        })
        .catch(error => console.error('加载底部失败:', error));
}

// 粒子系统全局变量
const particleSystem = {
    maxParticles: 150,
    spawnRate: 3,
    particles: [],
    mouse: {
        x: null,
        y: null,
        radius: 120
    }
};

// 粒子类
class Particle {
    constructor(canvas) {
        this.canvas = canvas;
        this.reset();
        // 初始位置随机分布在屏幕边缘
        const edge = Math.floor(Math.random() * 4);
        switch(edge) {
            case 0:
                this.x = Math.random() * canvas.width;
                this.y = 0;
                break;
            case 1:
                this.x = canvas.width;
                this.y = Math.random() * canvas.height;
                break;
            case 2:
                this.x = Math.random() * canvas.width;
                this.y = canvas.height;
                break;
            case 3:
                this.x = 0;
                this.y = Math.random() * canvas.height;
                break;
        }
    }
    
    reset() {
        this.life = 800 + Math.random() * 1000;
        this.age = 0;
        this.size = Math.random() * 2 + 1;
        // 修改颜色生成，根据当前主题调整
        this.color = document.body.classList.contains('light-mode') 
            ? `hsl(${Math.random() * 60 + 200}, 50%, 50%)` 
            : `hsl(${Math.random() * 60 + 200}, 80%, 60%)`;
        this.speed = 0.2 + Math.random() * 0.2;
        this.angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.opacity = 0;
        this.fadeIn = 40;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.age++;
        
        // 淡入淡出效果
        if (this.age < this.fadeIn) {
            this.opacity = this.age / this.fadeIn;
        }
        else if (this.age > this.life - this.fadeIn) {
            this.opacity = (this.life - this.age) / this.fadeIn;
        } else {
            this.opacity = 1;
        }
        
        // 鼠标交互
        if (particleSystem.mouse.x && particleSystem.mouse.y) {
            const dx = particleSystem.mouse.x - this.x;
            const dy = particleSystem.mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < particleSystem.mouse.radius) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (particleSystem.mouse.radius - distance) / particleSystem.mouse.radius * 0.6;
                
                this.x -= forceDirectionX * force * 6;
                this.y -= forceDirectionY * force * 6;
            }
        }
        
        // 边界检查
        if (this.x < -50 || this.x > this.canvas.width + 50 || 
            this.y < -50 || this.y > this.canvas.height + 50) {
            return false;
        }
        
        // 生命周期检查
        if (this.age >= this.life) {
            return false;
        }
        
        return true;
    }
    
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = this.color.replace(')', `, ${this.opacity * 0.6})`).replace('hsl', 'hsla');
        ctx.fill();
    }
}

// 初始化粒子
function initParticles(canvas) {
    for (let i = 0; i < particleSystem.maxParticles * 0.5; i++) {
        particleSystem.particles.push(new Particle(canvas));
    }
}

// 生成新粒子
function spawnParticles(canvas) {
    for (let i = 0; i < particleSystem.spawnRate; i++) {
        if (particleSystem.particles.length < particleSystem.maxParticles) {
            particleSystem.particles.push(new Particle(canvas));
        }
    }
}

// 连接粒子
function connectParticles(ctx, canvas) {
    const maxDistance = 150;
    
    for (let i = 0; i < particleSystem.particles.length; i++) {
        const p1 = particleSystem.particles[i];
        
        for (let j = i + 1; j < particleSystem.particles.length; j++) {
            const p2 = particleSystem.particles[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < maxDistance) {
                const opacity = 0.4 * (1 - distance / maxDistance) * Math.min(p1.opacity, p2.opacity);
                ctx.strokeStyle = `rgba(100, 200, 255, ${opacity})`;
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }
}

// 动画循环
function animate(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    spawnParticles(canvas);
    
    // 更新和绘制粒子
    for (let i = particleSystem.particles.length - 1; i >= 0; i--) {
        const particle = particleSystem.particles[i];
        const isAlive = particle.update();
        
        if (isAlive) {
            particle.draw(ctx);
        } else {
            particleSystem.particles.splice(i, 1);
        }
    }
    
    connectParticles(ctx, canvas);
    
    requestAnimationFrame(() => animate(canvas, ctx));
}

// 文字动画效果
function animateText(element, text, delay = 0) {
    setTimeout(() => {
        let currentText = '';
        let iterations = 0;
        const maxIterations = 20;
        const randomChars = '欢迎访问我的个人网站高新炀爱好编程的初中生进入网站';//随机字符集
        
        const interval = setInterval(() => {
            currentText = '';
            for (let i = 0; i < text.length; i++) {
                if (iterations > i * maxIterations / text.length) {
                    currentText += text[i];
                } else {
                    currentText += randomChars[Math.floor(Math.random() * randomChars.length)];
                }
            }
            
            element.textContent = currentText;
            
            iterations++;
            if (iterations >= maxIterations) {
                clearInterval(interval);
                element.textContent = text;
            }
        }, 50);
    }, delay);
}

// 初始化粒子效果
function initParticleEffect() {
    const canvas = document.getElementById('particles-background');
    const ctx = canvas.getContext('2d');

    // 设置canvas尺寸
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 鼠标交互
    window.addEventListener('mousemove', function(event) {
        particleSystem.mouse.x = event.clientX;
        particleSystem.mouse.y = event.clientY;
    });

    window.addEventListener('mouseout', function() {
        particleSystem.mouse.x = null;
        particleSystem.mouse.y = null;
    });

    // 初始化并启动粒子系统
    initParticles(canvas);
    animate(canvas, ctx);
}

// 返回顶部按钮功能
function setupBackToTopButton() {
    const backToTopButton = document.getElementById('back-to-top');
    
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTopButton.classList.add('show');
        } else {
            backToTopButton.classList.remove('show');
        }
    });
    
    backToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// 主题切换功能
function setupThemeToggle() {
    const themeToggle = document.querySelector('.theme-toggle');
    if (!themeToggle) return;

    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isLightMode = document.body.classList.contains('light-mode');
        const overlay = document.createElement('div');
        overlay.className = 'theme-switch-overlay';
        
        // 获取鼠标点击位置
        overlay.style.left = `${e.clientX}px`;
        overlay.style.top = `${e.clientY}px`;
        overlay.style.transformOrigin = 'center';
        
        // 设置初始颜色
        overlay.style.backgroundColor = isLightMode ? '#1a1a1a' : '#ffffff';
        
        document.body.appendChild(overlay);
        
        // 计算确保覆盖屏幕所需缩放比例，初始圆半径为20px
        const bodyRect = document.body.getBoundingClientRect();
        const maxDimension = Math.max(
            Math.max(e.clientX, bodyRect.width - e.clientX),
            Math.max(e.clientY, bodyRect.height - e.clientY)
        );
        const scaleNeeded = (maxDimension / 20) * 2; 
        
        // 开始扩散动画
        requestAnimationFrame(() => {
            overlay.style.transform = `scale(${scaleNeeded})`;
            overlay.style.transition = `transform 1s cubic-bezier(0.77, 0, 0.175, 1), background-color 0.8s ease`;
            
            // 动画中途切换主题
            setTimeout(() => {
                document.body.classList.toggle('light-mode');
                overlay.style.backgroundColor = isLightMode ? '#ffffff' : '#1a1a1a';
                localStorage.setItem('theme', isLightMode ? 'dark' : 'light');
                updateParticleColors();
                
                // 开始收缩动画
                overlay.style.transform = 'scale(0)';
                overlay.style.transition = `transform 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)`;
                
                // 移除覆盖层
                setTimeout(() => {
                    overlay.remove();
                }, 800);
            }, 600);
        });
    });

    // 初始化主题
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }
}

function updateParticleColors() {
    const isLightMode = document.body.classList.contains('light-mode');
    particleSystem.particles.forEach(particle => {
        particle.color = isLightMode 
            ? `hsl(${Math.random() * 60 + 200}, 50%, 50%)` 
            : `hsl(${Math.random() * 60 + 200}, 80%, 60%)`;
    });
}

// 语言切换功能
function setupLanguageToggle() {
    const languageToggle = document.querySelector('.language-toggle');
    languageToggle.addEventListener('click', () => {
        alert('语言切换功能还在开发中……');
    });
}

// 汉堡菜单功能
function setupHamburgerMenu() {
    const hamburger = document.querySelector('.hamburger');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    
    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburger.classList.toggle('active');
        hamburgerMenu.classList.toggle('show');
        
        // 禁用/启用页面滚动
        document.body.style.overflow = hamburgerMenu.classList.contains('show') ? 'hidden' : '';
    });
    
    // 点击菜单外区域关闭菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hamburger') && !e.target.closest('.hamburger-menu')) {
            hamburger.classList.remove('active');
            hamburgerMenu.classList.remove('show');
            document.body.style.overflow = '';
        }
    });
    
    // 点击菜单项关闭菜单
    hamburgerMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            hamburgerMenu.classList.remove('show');
            document.body.style.overflow = '';
        });
    });
}

// 平滑滚动
function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 60,
                    behavior: 'smooth'
                });
                
                // 关闭汉堡菜单
                const hamburgerMenu = document.querySelector('.hamburger-menu');
                hamburgerMenu.classList.remove('show');
                document.querySelector('.hamburger').classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
}

// 高亮当前页面
function highlightCurrentPage() {
    const currentPath = window.location.pathname;
    const pageMap = {
        '/': 'home',
        '/index.html': 'home',
        '/blog/blog.html': 'blog',
        '/file/file.html': 'file'
    };
    
    let currentPage = pageMap[currentPath] || '';
    
    if (!currentPage) {
        if (currentPath.includes('blog')) currentPage = 'blog';
        if (currentPath.includes('file')) currentPage = 'file';
    }
    
    if (currentPage) {
        document.querySelectorAll(`.nav-link[data-page="${currentPage}"]`).forEach(link => {
            link.classList.add('active');
            
            // 为汉堡菜单添加活动状态
            if (link.closest('.hamburger-menu')) {
                link.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
            }
        });
    }
}

// 初始化英雄区域文本动画
function initHeroTextAnimation() {
    const heroTitle = document.querySelector('.hero-title');
    const heroTitle2 = document.querySelector('.hero-title2');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    
     // 元素存在性检查
    if (!heroTitle || !heroTitle2 || !heroSubtitle) {
         console.debug('Hero section elements not found - skipping animation');
         return;
     }

    animateText(heroTitle, heroTitle.textContent);
    animateText(heroTitle2, heroTitle2.textContent, 400);
    animateText(heroSubtitle, heroSubtitle.textContent, 800);
}

// 修改主初始化函数
document.addEventListener('DOMContentLoaded', function() {
    // 先加载公共组件
    loadCommonComponents();
    
    // 检查canvas元素是否存在
    if (document.getElementById('particles-background')) {
        initParticleEffect();
    }
    
    // 只在有英雄区域的页面初始化文本动画
    if (document.querySelector('.hero-section')) {
        initHeroTextAnimation();
    }
});