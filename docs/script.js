// ��URL������ȡmd�ļ�·��
const urlParams = new URLSearchParams(window.location.search);
const mdFile = urlParams.get('md') || './404.md';  // Ĭ��ֵ

// ��ʼ��marked����
marked.setOptions({
    highlight: function(code, lang) {
        return hljs.highlightAuto(code).value;
    }
});

// ͼƬ�����߼�
fetch(mdFile)
    .then(response => {
        if (!response.ok) throw new Error(`HTTP���� ${response.status}`);
        return response.text();
    })
    .then(text => {
        const metaMatch = text.match(/^---\n([\s\S]*?)\n---/);
        if (metaMatch) {
            const meta = metaMatch[1].split('\n').reduce((acc, line) => {
                const [key, ...values] = line.split(':');
                acc[key.trim()] = values.join(':').trim();
                return acc;
            }, {});

            // ����CSS������Ϊ����ͼ
            document.querySelector('.header').style.setProperty(
                '--cover-image', 
                `url('${meta.image}')`
            );
            
            document.getElementById('title').textContent = meta.title;
            document.getElementById('date').textContent = `����ʱ��: ${meta.date}`;
            document.getElementById('author').textContent = `����: ${meta.author}`;
            document.getElementById('tag').textContent = `��ǩ: ${meta.tag}`;
        }

        // ��Ⱦ����
        const content = text.replace(/^---\n[\s\S]*?---/, '');
        document.getElementById('content').innerHTML = marked.parse(content);

        // ����Ŀ¼
        generateTOC();
    })
    .catch(error => {
        console.error('����ʧ��:', error);
        document.getElementById('content').innerHTML = `<p style="color:red">�ļ�����ʧ�ܣ�${error}</p>`;
    });

// ����Ŀ¼����
function generateTOC() {
    const headings = document.querySelectorAll('.content h2, .content h3');
    const toc = document.getElementById('toc');
    
    headings.forEach(heading => {
        // ���ê��
        const id = heading.textContent.toLowerCase().replace(/\s+/g, '-');
        heading.id = id;

        // ����Ŀ¼��
        const tocItem = document.createElement('div');
        tocItem.className = `toc-item ${heading.tagName.toLowerCase()}`;
        tocItem.textContent = heading.textContent;
        tocItem.dataset.target = id;
        
        // �������
        tocItem.addEventListener('click', () => {
            heading.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        });

        toc.appendChild(tocItem);
    });

    // ��ʼ�������۲���
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

// �ڹ���ʱͬ��Ŀ¼λ��
document.querySelector('.content').addEventListener('scroll', () => {
    const sidebar = document.getElementById('toc');
    sidebar.scrollTop = document.querySelector('.content').scrollTop;
});

// �����������ܴ���
let isDragging = false;
let startX;
let startWidth;

// �϶����ڿ�ȹ���
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

// �л���ʾ/���ع���
document.getElementById('toggleBtn').addEventListener('click', () => {
    const sidebar = document.getElementById('toc');
    const button = document.getElementById('toggleBtn');
    
    sidebar.classList.toggle('collapsed');
    button.textContent = sidebar.classList.contains('collapsed') ? '?' : '?';
    button.style.left = sidebar.classList.contains('collapsed') ? '8px' : (sidebar.offsetWidth + 8) + 'px';
});

// ��ʼ����������
document.getElementById('toc').style.width = '300px';

// ��Ӵ���resize����
window.addEventListener('resize', () => {
    document.querySelector('.sidebar').style.height = 
        `${window.innerHeight}px`;
    document.querySelector('.content').style.minHeight = 
        `${window.innerHeight + 200}px`;
});

// ��ʼ����
document.querySelector('.sidebar').style.height = 
    `${window.innerHeight}px`;
document.querySelector('.content').style.minHeight = 
    `${window.innerHeight + 200}px`;
