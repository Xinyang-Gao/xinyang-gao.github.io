// 从URL参数获取md文件路径
const urlParams = new URLSearchParams(window.location.search);
const mdFileParam = urlParams.get('md') || '404.md';  // 默认值
const mdFile = `../posts/${mdFileParam}`;  // 修改前: './posts/${mdFileParam}'

// 对文件路径进行URL编码
const encodedMdFile = encodeURI(mdFile);

console.log('请求的Markdown文件路径:', encodedMdFile); // 调试输出

// 初始化marked配置
marked.setOptions({
    highlight: function(code, lang) {
        return hljs.highlightAuto(code).value;
    }
});

// 替换 JSONP 请求为 fetch 获取 Markdown 文件，并配置 CORS
fetch(encodedMdFile, { mode: 'cors' })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.text();
    })
    .then(text => handleResponse(text))
    .catch(error => {
        console.error("CORS fetch failed:", error);
        document.getElementById('content').innerHTML = `<p style="color:red">文件加载失败</p>`;
    });

// 将原 handleJsonpResponse 的逻辑改为普通函数处理响应
function handleResponse(text) {
    // 提取元数据
    const metaMatch = text.match(/^---\n([\s\S]*?)\n---/);
    if (metaMatch) {
        const meta = metaMatch[1].split('\n').reduce((acc, line) => {
            const [key, ...values] = line.split(':');
            acc[key.trim()] = values.join(':').trim();
            return acc;
        }, {});
        // 设置CSS变量作为背景图
        document.querySelector('.header').style.setProperty('--cover-image', `url('${meta.image}')`);
        // 设置页面元素内容
        document.getElementById('title').textContent = meta.title;
        document.getElementById('date').textContent = `创作时间: ${meta.date}`;
        document.getElementById('author').textContent = `作者: ${meta.author}`;
        document.getElementById('tag').textContent = `标签: ${meta.tag}`;
    }
    // 渲染Markdown内容
    const content = text.replace(/^---\n[\s\S]*?---/, '');
    document.getElementById('content').innerHTML = marked.parse(content);
    // 生成目录
    generateTOC();
}

// 生成目录函数
function generateTOC() {
    const headings = document.querySelectorAll('.content h2, .content h3');
    const toc = document.getElementById('toc');
    
    headings.forEach(heading => {
        // 添加锚点
        const id = heading.textContent.toLowerCase().replace(/\s+/g, '-');
        heading.id = id;

        // 创建目录项
        const tocItem = document.createElement('div');
        tocItem.className = `toc-item ${heading.tagName.toLowerCase()}`;
        tocItem.textContent = heading.textContent;
        tocItem.dataset.target = id;
        
        // 点击滚动
        tocItem.addEventListener('click', () => {
            heading.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        });

        toc.appendChild(tocItem);
    });

    // 初始化滚动观察器
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const id = entry.target.id;
            const tocItem = toc.querySelector(`[data-target="${id}"]`);
            if (entry.intersectionRatio > 0) {
                tocItem.classList.add('active');
            } else {
                tocItem.classList.remove('active');
            }
        });
    }, { threshold: 0.5 });

    headings.forEach(heading => observer.observe(heading));
}

// 在滚动时同步目录位置
document.querySelector('.content').addEventListener('scroll', () => {
    const sidebar = document.getElementById('toc');
    sidebar.scrollTop = document.querySelector('.content').scrollTop;
});

// 拖动调节宽度功能
let isDragging = false;
let startX;
let startWidth;

document.getElementById('resizer').addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = document.getElementById('toc').offsetWidth;
    document.body.style.cursor = 'col-resize';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const sidebar = document.getElementById('toc');
    const newWidth = startWidth + (e.clientX - startX);
    sidebar.style.width = Math.max(200, Math.min(400, newWidth)) + 'px';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.cursor = 'default';
});

// 切换显示/隐藏功能
document.getElementById('toggleBtn').addEventListener('click', () => {
    const sidebar = document.getElementById('toc');
    const button = document.getElementById('toggleBtn');
    
    sidebar.classList.toggle('collapsed');
    button.textContent = sidebar.classList.contains('collapsed') ? '展开' : '收起';
    button.style.left = sidebar.classList.contains('collapsed') ? '8px' : (sidebar.offsetWidth + 8) + 'px';
});

// 初始化侧边栏宽度
document.getElementById('toc').style.width = '300px';

// 添加窗口resize监听
window.addEventListener('resize', () => {
    document.querySelector('.sidebar').style.height = 
        `${window.innerHeight}px`;
    document.querySelector('.content').style.minHeight = 
        `${window.innerHeight + 200}px`;
});

// 初始设置
document.querySelector('.sidebar').style.height = 
    `${window.innerHeight}px`;
document.querySelector('.content').style.minHeight = 
    `${window.innerHeight + 200}px`;

// 检查并应用首选颜色模式
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
const currentTheme = localStorage.getItem("theme");

if (currentTheme == "dark") {
    document.body.classList.add("dark-mode");
} else if (currentTheme == "light") {
    document.body.classList.add("light-mode");
} else if (prefersDarkScheme.matches) {
    document.body.classList.add("dark-mode");
} else {
    document.body.classList.add("light-mode");
}

// 切换模式按钮事件
document.getElementById("modeToggle").addEventListener("click", () => {
    if (document.body.classList.contains("dark-mode")) {
        document.body.classList.remove("dark-mode");
        document.body.classList.add("light-mode");
        localStorage.setItem("theme", "light");
    } else {
        document.body.classList.remove("dark-mode");
        document.body.classList.add("dark-mode");
        localStorage.setItem("theme", "dark");
    }
});