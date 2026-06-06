// ==================== /js/standalong/friends.js ====================
// 仅负责：Twikoo 评论初始化、复制 JSON、等待导航栏加载
// 友链卡片已由服务端直接渲染在 HTML 中，不再动态请求数据

function initTwikooComments() {
    if (typeof twikoo === 'undefined') {
        console.warn('Twikoo 尚未加载，稍后重试');
        setTimeout(initTwikooComments, 300);
        return;
    }
    const container = document.getElementById('twikoo-comments');
    if (!container) return;
    if (container.getAttribute('data-init') === 'true') return;
    container.setAttribute('data-init', 'true');
    twikoo.init({
        envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
        el: '#twikoo-comments',
        lang: 'zh-CN',
        enableComment: true,
    }).then(() => {
        console.log('Twikoo 留言板初始化成功 (friends页面)');
    }).catch(err => {
        console.error('Twikoo 初始化失败:', err);
    });
}

function setupCopyJson() {
    const copyBtn = document.getElementById('copyJsonBtn');
    if (!copyBtn) return;
    const codeElement = document.getElementById('friendJsonExample');
    const originalText = codeElement?.innerText || '';
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(originalText);
            const originalBtnText = copyBtn.innerText;
            copyBtn.innerText = '已复制';
            copyBtn.style.background = 'var(--accent-color)';
            copyBtn.style.color = 'white';
            setTimeout(() => {
                copyBtn.innerText = originalBtnText;
                copyBtn.style.background = '';
                copyBtn.style.color = '';
            }, 1800);
        } catch (err) {
            console.error('复制失败', err);
            const textarea = document.createElement('textarea');
            textarea.value = originalText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            copyBtn.innerText = '已复制';
            setTimeout(() => { copyBtn.innerText = '复制'; }, 1200);
        }
    });
}

function waitForNavbarAndInit() {
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (navbarPlaceholder && navbarPlaceholder.innerHTML.trim() !== '') {
        initTwikooComments();
        setupCopyJson();
        document.title = '友情链接 - GaoXinYang\'s Friends';
    } else {
        const checkInterval = setInterval(() => {
            if (navbarPlaceholder && navbarPlaceholder.innerHTML.trim() !== '') {
                clearInterval(checkInterval);
                initTwikooComments();
                setupCopyJson();
                document.title = '友情链接 - GaoXinYang\'s Friends';
            }
        }, 50);
        setTimeout(() => {
            clearInterval(checkInterval);
            if (navbarPlaceholder && navbarPlaceholder.innerHTML.trim() === '') {
                console.warn('导航栏加载超时，仍执行初始化');
                initTwikooComments();
                setupCopyJson();
            }
        }, 5000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(waitForNavbarAndInit, 100);
    });
} else {
    setTimeout(waitForNavbarAndInit, 100);
}