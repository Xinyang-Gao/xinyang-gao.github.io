// article.js - 用于静态HTML页面
document.addEventListener('DOMContentLoaded', function () {
    // 存储滚动位置
    const scrollPositionKey = `scrollPosition_${window.location.pathname}${window.location.search}`;
    
    // 恢复滚动位置
    const savedScrollPosition = sessionStorage.getItem(scrollPositionKey);
    if (savedScrollPosition) {
        setTimeout(() => {
            window.scrollTo(0, parseInt(savedScrollPosition));
        }, 100);
    }

    // 监听滚动事件，保存位置
    let scrollTimer;
    window.addEventListener('scroll', function() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            sessionStorage.setItem(scrollPositionKey, window.scrollY);
        }, 250);
    });

    // 动态生成目录
    generateTOC();

    // 初始化图片功能
    initImageFeatures();

    // 初始化阅读进度条
    initReadingProgress();

    // 初始化滚动监听和高亮功能
    initScrollSpy();

    // 添加浮动按钮（评论区跳转 & 返回顶部）
    addFloatingButtons();
    
    // 重新触发动画
    resetAnimations();

    // 动态生成目录
    function generateTOC() {
        const container = document.getElementById('toc-list-container');
        if (!container) return;
        
        // 从全局变量获取标题数据
        const headings = window.ARTICLE_HEADINGS || [];
        
        if (headings.length === 0) {
            container.innerHTML = '<p class="no-toc">暂无目录</p>';
            return;
        }
        
        // 生成目录HTML
        let tocHTML = '<ul class="toc-list">';
        
        headings.forEach(heading => {
            const levelClass = `toc-h${heading.level}`;
            tocHTML += `
                <li class="${levelClass}" data-target-id="${heading.id}">
                    <a href="#${heading.id}">${escapeHtml(heading.text)}</a>
                </li>
            `;
        });
        
        tocHTML += '</ul>';
        container.innerHTML = tocHTML;
        
        // 为目录链接添加平滑滚动事件
        container.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = this.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    smoothScrollTo(targetElement);
                    updateActiveTOCItem(targetId);
                }
            });
        });
    }
    
    // HTML转义函数，防止XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 初始化滚动监听和高亮功能
    function initScrollSpy() {
        const observerOptions = {
            root: null,
            rootMargin: '-100px 0px -70% 0px',
            threshold: [0, 0.1, 0.5, 1]
        };

        const observer = new IntersectionObserver((entries) => {
            let mostVisible = null;
            let highestRatio = 0;
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > highestRatio) {
                    highestRatio = entry.intersectionRatio;
                    mostVisible = entry.target.id;
                }
            });
            if (mostVisible) {
                updateActiveTOCItem(mostVisible);
            }
        }, observerOptions);

        // 观察所有标题
        document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4')
            .forEach(heading => {
                observer.observe(heading);
            });
    }

    function updateActiveTOCItem(activeId) {
        const tocItems = document.querySelectorAll('#toc-list-container li');
        tocItems.forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`#toc-list-container li[data-target-id="${activeId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            // 确保活动项在目录容器中可见
            const tocContainer = document.querySelector('.toc-container');
            if (tocContainer) {
                const itemTop = activeItem.offsetTop;
                const containerHeight = tocContainer.clientHeight;
                if (itemTop > tocContainer.scrollTop + containerHeight - 50 || itemTop < tocContainer.scrollTop) {
                    tocContainer.scrollTo({
                        top: itemTop - 50,
                        behavior: 'smooth'
                    });
                }
            }
        }
    }

    function smoothScrollTo(element, offset = 90) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }

    // 图片功能初始化
    function initImageFeatures() {
        // 为所有图片添加点击预览功能
        const images = document.querySelectorAll('#articleBody img');
        images.forEach(img => {
            img.classList.add('lazy-image', 'loaded');
            img.addEventListener('click', function(e) {
                e.stopPropagation();
                showImageModal(this);
            });
        });
        
        // 设置图片预览模态框
        setupImageModal();
    }

    // 设置图片预览模态框
    function setupImageModal() {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const captionText = document.getElementById('imageCaption');
        const closeBtn = document.querySelector('.close');
        
        if (!modal) return;
        
        closeBtn.addEventListener('click', hideImageModal);
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideImageModal();
            }
        });
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                hideImageModal();
            }
        });
    }

    function showImageModal(imgElement) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const captionText = document.getElementById('imageCaption');
        
        modal.style.display = 'block';
        modalImg.src = imgElement.src;
        captionText.textContent = imgElement.alt || imgElement.title || '';
        
        sessionStorage.setItem('scrollPositionBeforeModal', window.scrollY);
    }

    function hideImageModal() {
        const modal = document.getElementById('imageModal');
        modal.style.display = 'none';
        
        const savedScrollPosition = sessionStorage.getItem('scrollPositionBeforeModal');
        if (savedScrollPosition) {
            window.scrollTo(0, parseInt(savedScrollPosition));
            sessionStorage.removeItem('scrollPositionBeforeModal');
        }
    }

    function initReadingProgress() {
        const progressBar = document.getElementById('progress-bar');
        
        function updateReadingProgress() {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollTop = window.pageYOffset;
            const progress = Math.max(0, Math.min(100, (scrollTop / totalHeight) * 100));
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
        }
        
        window.addEventListener('scroll', updateReadingProgress);
        updateReadingProgress();
    }

    function resetAnimations() {
        const title = document.getElementById('articleTitle');
        const meta = document.getElementById('articleMeta');
        const body = document.getElementById('articleBody');

        if (title) {
            title.style.animation = 'none';
            title.offsetHeight;
            title.style.animation = '';
        }

        if (meta) {
            meta.style.animation = 'none';
            meta.offsetHeight;
            meta.style.animation = '';
        }

        if (body) {
            body.style.animation = 'none';
            body.offsetHeight;
            body.style.animation = '';
        }

        // 等待目录生成后再触发动画
        setTimeout(() => {
            const tocItems = document.querySelectorAll('.toc-list li');
            tocItems.forEach((item, index) => {
                item.style.animation = 'none';
                item.offsetHeight;
                item.style.animation = '';
                // 重新设置动画延迟
                if (index < 5) {
                    item.style.animationDelay = `${0.1 + index * 0.1}s`;
                } else {
                    item.style.animationDelay = '0.6s';
                }
            });
        }, 100);
    }

    // 新增：添加浮动按钮（评论区跳转 & 返回顶部）
    function addFloatingButtons() {
        // 检查是否已经存在按钮容器，避免重复添加
        if (document.getElementById('floating-buttons')) return;

        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'floating-buttons';
        buttonContainer.className = 'floating-buttons';

        // 创建“评论”按钮
        const commentBtn = document.createElement('button');
        commentBtn.id = 'goto-comments';
        commentBtn.className = 'floating-btn comment-btn';
        commentBtn.innerHTML = '评论';
        commentBtn.title = '跳转到评论区';
        commentBtn.addEventListener('click', () => {
            const commentsSection = document.querySelector('.comments-card');
            if (commentsSection) {
                smoothScrollTo(commentsSection, 20); // 偏移量小一点，让标题更靠近顶部
            } else {
                console.warn('未找到评论区卡片');
            }
        });

        // 创建“返回顶部”按钮
        const topBtn = document.createElement('button');
        topBtn.id = 'back-to-top';
        topBtn.className = 'floating-btn top-btn';
        topBtn.innerHTML = '↑';
        topBtn.title = '返回页面顶部';
        topBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // 将按钮添加到容器
        buttonContainer.appendChild(commentBtn);
        buttonContainer.appendChild(topBtn);

        // 将容器添加到body
        document.body.appendChild(buttonContainer);
    }
});