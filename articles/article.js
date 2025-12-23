document.addEventListener('DOMContentLoaded', function () {
    // --- 配置 marked ---
    marked.setOptions({ breaks: true });
    // --- 配置结束 ---

    // 从URL获取文章标识
    const articleId = getUrlParameter('article');
    if (!articleId) {
        document.getElementById('articleContent').innerHTML = `
            <h2>文章标识缺失！</h2>
            <p>请在URL中添加有效的文章标识，例如：?article=example</p>
        `;
        return;
    }

    // 构建文章路径
    const articlePath = `/articles/articles/${articleId}`;

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
            if (!meta.title) {
                throw new Error("元数据缺失：标题未定义");
            }
            const html = marked.parse(cleanedMarkdown);

            // 设置文章标题
            document.getElementById('articleTitle').textContent = `═══ ${meta.title} ═══`;
            
            // 设置文章元数据
            document.getElementById('articleMeta').textContent = meta.date || '未指定日期';
            
            // 设置文章内容
            document.getElementById('articleBody').innerHTML = html;

            // 生成TOC
            generateTOC();
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


    // 从Markdown中提取元数据并清理
    function extractMetaAndCleanMarkdown(markdown) {
        // 1. 移除可能的 BOM（以防万一）
        if (markdown.charCodeAt(0) === 0xFEFF) {
            markdown = markdown.substring(1);
        }
    
        // 2. 跳过所有前导空行
        const lines = markdown.split(/\r\n|\n/);
        let i = 0;
        while (i < lines.length && lines[i].trim() === '') {
            i++;
        }
    
        // 3. 从第一个非空行开始查找元数据
        const meta = {};
        let inMeta = false;
        let metaEndIndex = -1;
    
        // 如果第一个非空行是 '---'，则开始解析元数据
        if (i < lines.length && lines[i].trim() === '---') {
            inMeta = true;
            i++; // 跳过第一个 '---'
    
            // 读取元数据内容，直到遇到第二个 '---'
            while (i < lines.length) {
                if (lines[i].trim() === '---') {
                    metaEndIndex = i;
                    break;
                }
                if (inMeta && lines[i].includes(':')) {
                    const [key, value] = lines[i].split(':').map(s => s.trim());
                    meta[key] = value;
                }
                i++;
            }
        }
    
        // 4. 返回结果（如果没找到元数据，用默认值）
        if (metaEndIndex !== -1) {
            return { 
                meta, 
                cleanedMarkdown: lines.slice(metaEndIndex + 1).join('\n') 
            };
        } else {
            return { 
                meta: { title: '未命名文章', date: '未指定' }, 
                cleanedMarkdown: markdown 
            };
        }
    }

    // 生成TOC (包含所有标题级别)
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
            
            // 根据级别添加缩进
            const listItem = document.createElement('li');
            listItem.style.paddingLeft = `${(level - 1) * 15}px`;
            listItem.appendChild(link);
            
            tocList.appendChild(listItem);
        });
    }

    // 从URL获取参数
    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
});