document.addEventListener('DOMContentLoaded', function () {
    // --- 配置 marked ---
    // 启用 breaks 选项，使单个换行符也转换为 <br>
    marked.setOptions({
        breaks: true, // 这是关键设置
    });
    // --- 配置结束 ---

    // 从URL获取文章标识
    const articleId = getUrlParameter('article');
    if (!articleId) {
        document.getElementById('articleContent').innerHTML = `
            <h2>无法定位文章！</h2>
            <p>请提供有效的文章标识！</p>
        `;
        return;
    }

    // 构建文章路径
    const articlePath = `../articles/${articleId}`;

    // 加载并解析Markdown文件
    fetch(articlePath)
        .then(response => {
            if (!response.ok) {
                throw new Error(`找不到文章！（${response.status}）`);
            }
            return response.text();
        })
        .then(markdown => {
            // 提取元数据并清理Markdown
            const { meta, cleanedMarkdown } = extractMetaAndCleanMarkdown(markdown);
            const html = marked.parse(cleanedMarkdown);

            // 设置文章标题
            const title = meta.title || 'ERROR:标题获取失败！';
            document.getElementById('articleTitle').textContent = `═══ ${title} ═══`;

             // 设置文章标题
            const date = meta.date || 'ERROR:时间获取失败！';
            document.getElementById('articleMeta').textContent = date;

            // 设置文章内容
            document.getElementById('articleBody').innerHTML = html;

            // 生成TOC
            generateTOC();
        })
        .catch(error => {
            console.error('加载文章失败:', error);
            document.getElementById('articleContent').innerHTML = `
                <h2>加载失败！</h2>
                <p>${error.message}</p>
            `;
        });

    // 从Markdown中提取元数据并清理
    function extractMetaAndCleanMarkdown(markdown) {
        const lines = markdown.split('\n');
        const meta = {};
        let inMeta = false;
        let metaEndIndex = -1;
        // 查找元数据部分
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                if (inMeta) {
                    metaEndIndex = i;
                    break;
                } else {
                    inMeta = true;
                }
            } else if (inMeta && lines[i].includes(':')) {
                const [key, value] = lines[i].split(':').map(s => s.trim());
                meta[key] = value;
            }
        }
        // 如果找到元数据部分，移除元数据部分
        if (metaEndIndex !== -1) {
            const cleanedLines = lines.slice(metaEndIndex + 1);
            return { meta, cleanedMarkdown: cleanedLines.join('\n') };
        } else {
            return { meta, cleanedMarkdown: markdown };
        }
    }

    // 生成TOC (包含所有标题级别，有层次结构)
    function generateTOC() {
        const tocList = document.getElementById('tocList');
        tocList.innerHTML = '';
        // 获取所有标题
        const headings = document.querySelectorAll('#articleBody h1, #articleBody h2, #articleBody h3, #articleBody h4');

        // 为每个标题生成链接
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1));
            const id = `heading-${index}`;
            heading.id = id;

            // 创建导航项
            const link = document.createElement('a');
            link.href = `#${id}`;
            link.textContent = heading.textContent;

            // 创建列表项
            const listItem = document.createElement('li');

            // 根据标题级别添加缩进和样式
            if (level === 1) {
                listItem.appendChild(link);
            } else if (level === 2) {
                const h2 = document.createElement('h2');
                h2.appendChild(link);
                listItem.appendChild(h2);
            } else if (level === 3) {
                const h3 = document.createElement('h3');
                h3.appendChild(link);
                listItem.appendChild(h3);
            } else if (level === 4) {
                const h4 = document.createElement('h4');
                h4.appendChild(link);
                listItem.appendChild(h4);
            }

            tocList.appendChild(listItem);
        });
    }

    // 从URL获取参数
    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
});