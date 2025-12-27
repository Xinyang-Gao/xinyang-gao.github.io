document.addEventListener('DOMContentLoaded', function () {
    // --- 配置 marked ---
    marked.setOptions({ breaks: true });
    // --- 配置结束 ---

    const articleId = getUrlParameter('article');
    if (!articleId) {
        document.getElementById('articleContent').innerHTML = `
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

            generateTOC();
            
            // 初始化滚动监听和高亮功能
            initScrollSpy();
        })
        .catch(error => {
            console.error('加载文章失败:', error);
            document.getElementById('articleContent').innerHTML = `
                <h2>文章加载失败！</h2>
                <p>${error.message}</p>
                <p>请检查：</p>
                <ul>
                    <li>文章ID是否正确（URL中?article=xxx）</li>
                </ul>
            `;
        });

    function extractMetaAndCleanMarkdown(markdown) {
        const metaRegex = /^[\s\uFEFF]*\+\+\+[\s\uFEFF]*\n([\s\S]+?)\n[\s\uFEFF]*\+\+\+[\s\uFEFF]*\n([\s\S]*)$/m;
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
            const trimmed = lines[i].replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');

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
            return {
                meta,
                cleanedMarkdown: lines.slice(metaEnd + 1).join('\n')
            };
        }

        return {
            meta: { title: '═══ 未命名文章 ═══', date: '未指定' },
            cleanedMarkdown: markdown
        };
    }

    function generateTOC() {
        const tocList = document.getElementById('tocList');
        tocList.innerHTML = '';
        
        const headings = document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4');
        
        if (headings.length === 0) {
            tocList.innerHTML = '<li>暂无目录</li>';
            return;
        }
        
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1));
            const id = `heading-${index}`;
            heading.id = id;
            
            const listItem = document.createElement('li');
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
            
            if (itemTop > tocContainer.scrollTop + containerHeight - 50 || 
                itemTop < tocContainer.scrollTop) {
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
});