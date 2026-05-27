// ==================== /js/friends.js ====================
// 友情链接页面模块：加载并渲染友链卡片，提供 Twikoo 评论和复制 JSON 功能
import { Utils } from '/js/core.js';

const FRIENDS_DATA_URL = '/json/friends.json';

// 获取头像首字母（用于占位）
function getAvatarInitial(name) {
    if (!name) return '?';
    const firstChar = name.trim().charAt(0).toUpperCase();
    return /[\u4e00-\u9fa5]/.test(firstChar) ? firstChar : firstChar;
}

/**
 * 从友链 URL 中提取简洁域名用于显示 (右下角灰色小字)
 * 规则: 去除 https:// 或 http:// 协议头，去除 www. 前缀，只保留域名部分（不含路径）
 * 若解析失败则降级展示去除协议头的原始链接前段
 */
function getDisplayUrlFromLink(link) {
    if (!link || link === '#' || link === 'javascript:void(0)') return '';
    let rawLink = link.trim();
    try {
        // 补全协议便于 URL 解析
        let urlToParse = rawLink;
        if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
            urlToParse = 'https://' + urlToParse;
        }
        const urlObj = new URL(urlToParse);
        let host = urlObj.hostname;
        if (host.startsWith('www.')) {
            host = host.slice(4);
        }
        return host;
    } catch (e) {
        // 降级: 手动去除协议头和 www，取第一段
        let cleaned = rawLink.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
        return cleaned || '';
    }
}

// 渲染友链卡片
function renderFriends(friendsArray) {
    const container = document.getElementById('friends-list-container');
    if (!container) return;

    if (!friendsArray || friendsArray.length === 0) {
        container.innerHTML = `<div class="friends-empty"><p>暂无友链数据，期待新的朋友～</p><p style="font-size:0.85rem; margin-top:12px;">您可以成为第一个友链！</p></div>`;
        const statsDiv = document.getElementById('friends-stats-area');
        if (statsDiv) statsDiv.style.display = 'none';
        return;
    }

    const validFriends = friendsArray.filter(f => f.name && f.link);
    if (validFriends.length === 0) {
        container.innerHTML = `<div class="friends-empty">暂无可展示的有效友链</div>`;
        const statsDiv = document.getElementById('friends-stats-area');
        if (statsDiv) statsDiv.style.display = 'none';
        return;
    }

    let cardsHtml = '';
    for (let i = 0; i < validFriends.length; i++) {
        const friend = validFriends[i];
        const name = friend.name || '未知站点';
        const link = friend.link || '#';
        const desc = friend.desc || '暂无简介';
        let avatarUrl = friend.avatar || '';
        const hasAvatar = avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('/'));
        const initial = getAvatarInitial(name);
        let avatarContent = '';
        if (hasAvatar) {
            avatarContent = `<img src="${Utils.escapeHtml(avatarUrl)}" alt="${Utils.escapeHtml(name)}的头像" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\'avatar-placeholder\' style=\'background: var(--accent-color);\'>${Utils.escapeHtml(initial)}</div>';">`;
        } else {
            avatarContent = `<div class="avatar-placeholder">${Utils.escapeHtml(initial)}</div>`;
        }

        // 生成右下角简洁网址
        const displayUrl = getDisplayUrlFromLink(link);
        const urlSection = displayUrl ? `<div class="friend-url">${Utils.escapeHtml(displayUrl)}</div>` : '';

        cardsHtml += `
      <a href="${Utils.escapeHtml(link)}" class="friend-card" data-friend-link="${Utils.escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        <div class="friend-avatar">${avatarContent}</div>
        <div class="friend-info">
          <h3 class="friend-name">${Utils.escapeHtml(name)}</h3>
          <p class="friend-desc">${Utils.escapeHtml(desc)}</p>
          ${urlSection}
        </div>
      </a>
    `;
    }
    container.innerHTML = cardsHtml;
    const statsDiv = document.getElementById('friends-stats-area');
    if (statsDiv) {
        statsDiv.style.display = 'block';
        statsDiv.innerHTML = `共 ${validFriends.length} 位小伙伴 · 点击卡片访问友站`;
    }
}

// 加载 friends.json 数据（缓存10分钟）
async function loadFriendsData() {
    const container = document.getElementById('friends-list-container');
    if (!container) return;
    container.innerHTML = `<div class="friends-loading"><div class="spinner"></div><div>正在加载友情链接...</div></div>`;

    try {
        const CACHE_KEY = 'friends_data';
        const CACHE_TTL = 10 * 60 * 1000;
        let cachedData = null;
        let useCache = true;
        try {
            const rawCache = localStorage.getItem(CACHE_KEY);
            if (rawCache) {
                const parsed = JSON.parse(rawCache);
                if (parsed._timestamp && (Date.now() - parsed._timestamp) < CACHE_TTL && Array.isArray(parsed.friends)) {
                    cachedData = parsed.friends;
                    console.log('📦 从缓存加载友链数据');
                } else {
                    useCache = false;
                }
            } else {
                useCache = false;
            }
        } catch (e) { useCache = false; }

        let friends = null;
        if (useCache && cachedData) {
            friends = cachedData;
        } else {
            console.log('🌐 从服务器获取 friends.json');
            const response = await fetch(FRIENDS_DATA_URL, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            let data = await response.json();
            if (Array.isArray(data)) friends = data;
            else if (data && Array.isArray(data.friends)) friends = data.friends;
            else throw new Error('无效的数据格式');
            localStorage.setItem(CACHE_KEY, JSON.stringify({ friends: friends, _timestamp: Date.now() }));
        }
        if (!friends || !Array.isArray(friends)) throw new Error('数据格式不正确');
        renderFriends(friends);
        // 滚动渐显辅助
        setTimeout(() => {
            if (typeof initScrollReveal === 'function') initScrollReveal();
            else {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.style.animation = 'fadeInUp 0.5s cubic-bezier(0.2, 0.9, 0.4, 1.1) forwards';
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.1 });
                document.querySelectorAll('.friend-card').forEach(card => observer.observe(card));
            }
        }, 100);
    } catch (error) {
        console.error('加载友链失败:', error);
        const containerElem = document.getElementById('friends-list-container');
        if (containerElem) {
            containerElem.innerHTML = `<div class="friends-error"><div>⚠️</div><p>加载友情链接失败，请检查网络或稍后再试。</p><button id="retry-friends-btn" style="margin-top: 16px; background: var(--accent-color); color: white; border: none; padding: 8px 24px; border-radius: 40px; cursor: pointer;">重新加载</button></div>`;
            const retryBtn = document.getElementById('retry-friends-btn');
            if (retryBtn) retryBtn.addEventListener('click', () => loadFriendsData());
        }
        const statsDiv = document.getElementById('friends-stats-area');
        if (statsDiv) statsDiv.style.display = 'none';
    }
}

// 等待导航栏加载完成后再加载友链
function waitForNavbarAndInit() {
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (navbarPlaceholder && navbarPlaceholder.innerHTML.trim() !== '') {
        loadFriendsData();
    } else {
        const checkInterval = setInterval(() => {
            if (navbarPlaceholder && navbarPlaceholder.innerHTML.trim() !== '') {
                clearInterval(checkInterval);
                loadFriendsData();
            }
        }, 50);
        setTimeout(() => {
            clearInterval(checkInterval);
            if (navbarPlaceholder && navbarPlaceholder.innerHTML.trim() === '') {
                console.warn('导航栏加载超时，手动加载友链');
                loadFriendsData();
            }
        }, 5000);
    }
}

// 初始化 Twikoo 评论区
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

// 复制JSON功能
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

// 页面启动时执行所有任务
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            waitForNavbarAndInit();
            initTwikooComments();
            setupCopyJson();
            document.title = '友情链接 - GaoXinYang\'s Friends';
        }, 100);
    });
} else {
    setTimeout(() => {
        waitForNavbarAndInit();
        initTwikooComments();
        setupCopyJson();
        document.title = '友情链接 - GaoXinYang\'s Friends';
    }, 100);
}