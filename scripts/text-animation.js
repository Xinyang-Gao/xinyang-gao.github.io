// 文字动画效果
document.addEventListener('DOMContentLoaded', function() {
    // 标题和副标题文本
    const titleText = "欢迎访问!";
    const titleText2 = "我的个人网站";
    const subtitleText = "GaoXinyang";
    
    // 获取元素
    const heroTitle = document.querySelector('.hero-title');
    const heroTitle2 = document.querySelector('.hero-title2');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    
    // 文字动画函数
    function animateText(element, text, delay = 0) {
        setTimeout(() => {
            // 初始随机字符
            let randomChars = '欢迎访问我的个人网站GaoXinyang';// 随机字符集
            let currentText = '';// 当前显示的文本
            let iterations = 0;// 当前迭代次数
            const maxIterations = 20;// 最大迭代次数
            
            // 创建间隔
            const interval = setInterval(() => {
                // 生成随机文本
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
            }, 40);
        }, delay);
    }
    
    // 执行动画
    animateText(heroTitle, titleText);
    animateText(heroTitle2, titleText2, 400);
    animateText(heroSubtitle, subtitleText, 800);
});