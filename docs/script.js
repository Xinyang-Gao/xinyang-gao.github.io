// 从URL参数获取md文件路径
const urlParams = new URLSearchParams(window.location.search);
const mdFileParam = urlParams.get('md') || '404.md';  // 默认值
const mdFile = `/docs/posts/${mdFileParam}`;  // 修改前: './posts/${mdFileParam}'

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
            // 如果文件不存在则加载默认的404.md文件
            return fetch('/docs/posts/404.md', { mode: 'cors' }).then(res => res.text());
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
    // 使用正则表达式匹配YAML元数据
    const metaRegex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]+/;
    const metaMatch = text.match(metaRegex);
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
    // 当存在元数据时，去除YAML头部；否则原样处理文本
    const content = metaMatch ? text.replace(metaRegex, '') : text;
    // 直接注入已转换好的HTML内容，不再调用 marked.parse
    document.getElementById('content').innerHTML = content;
    // 新增：移除内容区的第一个 <h1>
    const contentElement = document.getElementById('content');
    const firstH1 = contentElement.querySelector('h1');
    if (firstH1) {
        firstH1.remove();
    }
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

// 添加防抖函数，用于优化resize事件性能
function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// 替换原resize监听，使用防抖包装
window.addEventListener('resize', debounce(() => {
    document.querySelector('.sidebar').style.height = `${window.innerHeight}px`;
    document.querySelector('.content').style.minHeight = `${window.innerHeight + 200}px`;
}, 200));

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