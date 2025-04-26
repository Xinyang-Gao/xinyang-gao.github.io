// 粒子效果 - 改进版
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');

    // 设置canvas尺寸
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // 粒子系统参数
    const particleSystem = {
        maxParticles: 20,// 最大粒子数
        spawnRate: 2, // 每帧生成粒子数
        particles: [],
        mouse: {
            x: null,
            y: null,
            radius: 100
        }
    };

    // 粒子类
    class Particle {
        constructor() {
            this.reset();
            // 初始位置随机分布在屏幕边缘
            const edge = Math.floor(Math.random() * 4);// 随机选择边缘
            switch(edge) {
                case 0: // 上边缘
                    this.x = Math.random() * canvas.width;
                    this.y = 100;
                    break;
                case 1: // 右边缘
                    this.x = canvas.width;
                    this.y = Math.random() * canvas.height;
                    break;
                case 2: // 下边缘
                    this.x = Math.random() * canvas.width;
                    this.y = canvas.height;
                    break;
                case 3: // 左边缘
                    this.x = 100;
                    this.y = Math.random() * canvas.height;
                    break;
            }
        }
        
        reset() {
            this.life = 100 + Math.random() * 500; // 生命周期(帧数)
            this.age = 0;
            this.size = Math.random() * 1 + 1;// 粒子大小
            this.color = `hsl(${Math.random() * 360}, 80%, 60%)`;
            this.speed = 0.5 + Math.random() * 0.1;// 粒子速度
            this.angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(this.angle) * this.speed;
            this.vy = Math.sin(this.angle) * this.speed;
            this.opacity = 0; // 初始透明
            this.fadeIn = 20; // 淡入帧数
        }
        
        update() {
            // 移动粒子
            this.x += this.vx;
            this.y += this.vy;
            
            // 生命周期
            this.age++;
            
            // 淡入效果
            if (this.age < this.fadeIn) {
                this.opacity = this.age / this.fadeIn;
            }
            // 淡出效果
            else if (this.age > this.life - this.fadeIn) {
                this.opacity = (this.life - this.age) / this.fadeIn;
            } else {
                this.opacity = 1;
            }
            
            // 鼠标交互
            const dx = particleSystem.mouse.x - this.x;
            const dy = particleSystem.mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < particleSystem.mouse.radius) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (particleSystem.mouse.radius - distance) / particleSystem.mouse.radius * 0.6;
                
                this.x -= forceDirectionX * force * 5;
                this.y -= forceDirectionY * force * 5;
            }
            
            // 检查是否超出边界
            if (this.x < -50 || this.x > canvas.width + 50 || 
                this.y < -50 || this.y > canvas.height + 50) {
                return false; // 标记为可移除
            }
            
            // 检查生命周期是否结束
            if (this.age >= this.life) {
                return false; // 标记为可移除
            }
            
            return true; // 粒子仍然活跃
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = this.color.replace(')', `, ${this.opacity})`).replace('hsl', 'hsla');
            ctx.fill();
        }
    }

    // 初始化粒子系统
    function initParticles() {
        particleSystem.particles = [];
        for (let i = 0; i < particleSystem.maxParticles * 0.5; i++) {
            particleSystem.particles.push(new Particle());
        }
    }

    // 生成新粒子
    function spawnParticles() {
        for (let i = 0; i < particleSystem.spawnRate; i++) {
            if (particleSystem.particles.length < particleSystem.maxParticles) {
                particleSystem.particles.push(new Particle());
            }
        }
    }

    // 连接粒子
    function connectParticles() {
        const maxDistance = 100;
        
        for (let i = 0; i < particleSystem.particles.length; i++) {
            const p1 = particleSystem.particles[i];
            
            for (let j = i + 1; j < particleSystem.particles.length; j++) {
                const p2 = particleSystem.particles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < maxDistance) {
                    const opacity = 0.7 * (1 - distance / maxDistance) * Math.min(p1.opacity, p2.opacity);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
    }

    // 动画循环
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 生成新粒子
        spawnParticles();
        
        // 更新和绘制粒子
        for (let i = particleSystem.particles.length - 1; i >= 0; i--) {
            const particle = particleSystem.particles[i];
            const isAlive = particle.update();
            
            if (isAlive) {
                particle.draw();
            } else {
                particleSystem.particles.splice(i, 1);
            }
        }
        
        // 连接粒子
        connectParticles();
        
        requestAnimationFrame(animateParticles);
    }

    // 监听鼠标移动
    window.addEventListener('mousemove', function(event) {
        particleSystem.mouse.x = event.x;
        particleSystem.mouse.y = event.y;
    });

    // 窗口大小调整
    window.addEventListener('resize', function() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    });

    // 初始化并启动粒子系统
    initParticles();
    animateParticles();
});