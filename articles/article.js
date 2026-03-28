// article.js
document.addEventListener('DOMContentLoaded', function () {
    // --- 配置 marked ---
    marked.setOptions({
        breaks: true
    });
    // --- 配置结束 ---

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

    const articleId = getUrlParameter('article');
    if (!articleId) {
        document.getElementById('articleBody').innerHTML = `
            <h2>文章标识缺失！</h2>
            <p>请在URL中添加有效的文章标识，例如：?article=example</p>
        `;
        return;
    }

    const articlePath = `/articles/articles/${articleId}.md`;
    fetch(articlePath)
        .then(response => {
            if (!response.ok) {
                throw new Error(`找不到文章！（${response.status}）`);
            }
            return response.text();
        })
        .then(markdown => {
            const { meta, cleanedMarkdown } = extractMetaAndCleanMarkdown(markdown);

            if (!meta.title) {
                throw new Error("元数据缺失：标题未定义");
            }

            const html = marked.parse(cleanedMarkdown);

            document.getElementById('articleTitle').textContent = `═══ ${meta.title} ═══`;
            document.getElementById('articleMeta').textContent = meta.date || '未指定日期';
            document.getElementById('articleBody').innerHTML = html;

            // 初始化图片功能
            initImageFeatures();

            // 初始化阅读进度条
            initReadingProgress();

            // 重新触发动画
            resetAnimations();

            generateTOC(); // 生成目录
            initScrollSpy(); // 初始化滚动监听和高亮功能
        })
        .catch(error => {
            console.error('加载文章失败:', error);
            document.getElementById('articleBody').innerHTML = `
                <h2>文章加载失败！</h2>
                <p>${error.message}</p>
                <p>请检查：</p>
                <ul>
                    <li>文章ID是否正确（URL中?article=xxx）</li>
                </ul>
            `;
        });

    function extractMetaAndCleanMarkdown(markdown) {
        // ... (extractMetaAndCleanMarkdown 函数内容保持不变)
        const metaRegex = /^[\s﻿]*\+\+\+[\s﻿]*\n([\s\S]+?)\n[\s﻿]*\+\+\+[\s﻿]*\n([\s\S]*)$/m;
        const match = markdown.match(metaRegex);
        if (match) {
            const metaContent = match[1];
            const cleanedMarkdown = match[2];
            const meta = {};
            metaContent.split(/\r?\n/).forEach(line => {
                line = line.trim();
                if (!line) return;
                const colonIndex = line.indexOf(':');
                if (colonIndex !== -1) {
                    const key = line.substring(0, colonIndex).trim();
                    const value = line.substring(colonIndex + 1).trim();
                    meta[key] = value;
                }
            });
            return { meta, cleanedMarkdown };
        }

        // 备用方案
        const lines = markdown.split(/\r?\n/);
        let metaStart = -1;
        let metaEnd = -1;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].replace(/^[\s﻿]+|[\s﻿]+$/g, '');
            if (trimmed === '+++') {
                if (metaStart === -1) {
                    metaStart = i;
                } else {
                    metaEnd = i;
                    break;
                }
            }
        }

        if (metaStart !== -1 && metaEnd !== -1 && metaEnd > metaStart) {
            const meta = {};
            for (let i = metaStart + 1; i < metaEnd; i++) {
                const line = lines[i];
                if (line.includes(':')) {
                    const [key, value] = line.split(':').map(s => s.trim());
                    meta[key] = value;
                }
            }
            return { meta, cleanedMarkdown: lines.slice(metaEnd + 1).join('\n') };
        }

        return { meta: { title: '═══ 未命名文章 ═══', date: '未指定' }, cleanedMarkdown: markdown };
    }

    function generateTOC() {
        const tocList = document.getElementById('tocList');
        tocList.innerHTML = ''; // 清空现有目录

        const headings = document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4');

        if (headings.length === 0) {
            tocList.innerHTML = '<li>暂无目录</li>';
            return;
        }

        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1)); // 获取标题级别 (1, 2, 3, 4)
            const id = `heading-${index}`;
            heading.id = id; // 为原标题设置ID以便链接

            const listItem = document.createElement('li');
            // --- 优化：根据标题级别添加CSS类 ---
            listItem.classList.add(`toc-h${level}`);
            // --- 优化结束 ---
            listItem.dataset.targetId = id;

            const link = document.createElement('a');
            link.href = `#${id}`;
            link.textContent = heading.textContent;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                smoothScrollTo(heading);
                updateActiveTOCItem(id);
            });

            listItem.appendChild(link);
            tocList.appendChild(listItem);
        });
    }

    function initScrollSpy() {
        const observerOptions = {
            root: null,
            rootMargin: '-100px 0px -70% 0px', // 调整视口范围
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
        const tocItems = document.querySelectorAll('#tocList li');
        tocItems.forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`#tocList li[data-target-id="${activeId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            // 确保活动项在目录容器中可见
            const tocContainer = document.querySelector('.toc-container');
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

    function smoothScrollTo(element) {
        const offset = 90; // 导航栏高度
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }

    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
    
    // 图片功能初始化
    function initImageFeatures() {
        // 为所有图片添加懒加载属性和占位符
        const images = document.querySelectorAll('#articleBody img');
        images.forEach(img => {
            // 保存原始src
            const originalSrc = img.src;
            img.setAttribute('data-src', originalSrc);
            img.removeAttribute('src');
            
            // 添加占位符类
            img.classList.add('lazy-image');
            
            // 添加默认占位符
            img.style.backgroundColor = '#f0f0f0';
            img.style.borderRadius = '4px';
            img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            
            // 创建占位符元素
            const placeholder = document.createElement('div');
            placeholder.className = 'image-placeholder';
            placeholder.textContent = '加载中……';
            img.parentNode.insertBefore(placeholder, img);
            
            // 添加点击事件用于大图预览
            img.addEventListener('click', function(e) {
                e.stopPropagation();
                showImageModal(this);
            });
        });
        
        // 设置懒加载
        setupLazyLoading();
        
        // 设置图片预览模态框
        setupImageModal();
    }
    
    // 设置懒加载
    function setupLazyLoading() {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const placeholder = img.previousElementSibling;
                    
                    // 创建新的图片对象来预加载
                    const newImg = new Image();
                    newImg.onload = function() {
                        // 替换占位符为实际图片
                        img.src = this.src;
                        img.classList.add('loaded');
                        
                        // 移除占位符
                        if (placeholder && placeholder.classList.contains('image-placeholder')) {
                            placeholder.remove();
                        }
                        
                        // 移除观察器
                        observer.unobserve(img);
                    };
                    
                    newImg.onerror = function() {
                        // 加载失败时的处理
                        if (placeholder) {
                            placeholder.textContent = 'Image failed to load';
                        }
                        observer.unobserve(img);
                    };
                    
                    newImg.src = img.getAttribute('data-src');
                }
            });
        }, {
            rootMargin: '50px' // 提前50px开始加载
        });
        
        // 开始观察所有懒加载图片
        document.querySelectorAll('#articleBody .lazy-image').forEach(img => {
            imageObserver.observe(img);
        });
    }
    
    // 设置图片预览模态框
    function setupImageModal() {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const captionText = document.getElementById('imageCaption');
        const closeBtn = document.querySelector('.close');
        
        // 点击关闭按钮
        closeBtn.addEventListener('click', hideImageModal);
        
        // 点击模态框背景关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideImageModal();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                hideImageModal();
            }
        });
    }
    
    // 显示图片预览模态框
    function showImageModal(imgElement) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const captionText = document.getElementById('imageCaption');
        
        modal.style.display = 'block';
        modalImg.src = imgElement.src;
        captionText.textContent = imgElement.alt || imgElement.title || '';
        
        // 保存当前滚动位置
        sessionStorage.setItem('scrollPositionBeforeModal', window.scrollY);
    }
    
    // 隐藏图片预览模态框
    function hideImageModal() {
        const modal = document.getElementById('imageModal');
        modal.style.display = 'none';
        
        // 恢复之前的滚动位置
        const savedScrollPosition = sessionStorage.getItem('scrollPositionBeforeModal');
        if (savedScrollPosition) {
            window.scrollTo(0, parseInt(savedScrollPosition));
            sessionStorage.removeItem('scrollPositionBeforeModal');
        }
    }
    
    // 初始化阅读进度条
    function initReadingProgress() {
        const progressBar = document.getElementById('progress-bar');
        const articleBody = document.getElementById('articleBody');
        
        // 监听滚动事件更新进度
        window.addEventListener('scroll', updateReadingProgress);
        
        // 初始更新
        updateReadingProgress();
        
        function updateReadingProgress() {
            // 计算页面总高度
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            
            // 当前滚动位置
            const scrollTop = window.pageYOffset;
            
            // 计算进度百分比
            const progress = Math.max(0, Math.min(100, (scrollTop / totalHeight) * 100));
            
            // 更新进度条宽度
            progressBar.style.width = `${progress}%`;
        }
    }
});

// 重新触发动画的函数
function resetAnimations() {
    // 强制重新触发动画
    const title = document.getElementById('articleTitle');
    const meta = document.getElementById('articleMeta');
    const body = document.getElementById('articleBody');

    if (title) {
        title.style.animation = 'none';
        title.offsetHeight; // 触发重绘
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

    // 重新触目录动画
    const tocItems = document.querySelectorAll('.toc-list li');
    tocItems.forEach((item, index) => {
        item.style.animation = 'none';
        item.offsetHeight;
        item.style.animation = '';
    });
}