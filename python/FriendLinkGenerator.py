#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from pathlib import Path
from datetime import datetime
from html import escape

# ========== 路径配置 ==========
PROJECT_ROOT = Path(__file__).parent.parent
JSON_DIR = PROJECT_ROOT / "json"
HTML_DIR = PROJECT_ROOT

FRIENDS_JSON = JSON_DIR / "friends.json"
OUTPUT_HTML = HTML_DIR / "friends.html"

# ========== 日志 ==========
def log_info(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}")

def log_error(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}")

# ========== 加载 friends.json ==========
def load_friends_data() -> list:
    if not FRIENDS_JSON.exists():
        log_error(f"文件不存在: {FRIENDS_JSON}")
        return []

    try:
        with open(FRIENDS_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "friends" in data and isinstance(data["friends"], list):
            return data["friends"]
        else:
            log_error(f"friends.json 格式错误: 应为数组或包含 'friends' 键的对象")
            return []
    except json.JSONDecodeError as e:
        log_error(f"解析 friends.json 失败: {e}")
        return []

# ========== 辅助函数 ==========
def get_avatar_initial(name: str) -> str:
    if not name:
        return "?"
    first_char = name.strip()[0].upper()
    # 如果是中文，直接返回，否则返回大写字母
    return first_char

def get_display_url(link: str) -> str:
    if not link or link in ("#", "javascript:void(0)"):
        return ""
    raw = link.strip()
    try:
        if not raw.startswith(("http://", "https://")):
            raw = "https://" + raw
        from urllib.parse import urlparse
        parsed = urlparse(raw)
        host = parsed.hostname or ""
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        cleaned = raw.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
        return cleaned or ""

# ========== 生成友链卡片 HTML（头像加载失败/缓慢显示占位）==========
def render_friends_cards(friends_list: list) -> str:
    if not friends_list:
        return '<div class="friends-empty"><p>暂无友链数据，期待新的朋友～</p><p style="font-size:0.85rem; margin-top:12px;">您可以成为第一个友链！</p></div>'

    valid = [f for f in friends_list if f.get("name") and f.get("link")]
    if not valid:
        return '<div class="friends-empty">暂无可展示的有效友链</div>'

    # 统计信息
    stats_html = f'<div id="friends-stats-area" class="friends-stats">共 {len(valid)} 位小伙伴 · 点击卡片访问友站</div>'

    cards_html = '<div class="friends-grid" id="friends-list-container-inner">'
    for friend in valid:
        name = escape(friend.get("name", "未知站点"))
        link = escape(friend.get("link", "#"))
        desc = escape(friend.get("desc", "暂无简介"))
        avatar_url = friend.get("avatar", "")
        initial = get_avatar_initial(name)
        
        # 检查是否有有效的头像URL
        has_avatar = avatar_url and (avatar_url.startswith("http") or avatar_url.startswith("/"))
        
        if has_avatar:
            # 使用 avatar-wrapper 包裹占位符和图片
            # 图片加载成功后隐藏占位符，加载失败则隐藏图片显示占位符
            avatar_html = f'''
                    <div class="avatar-wrapper">
                        <div class="avatar-placeholder" style="background: var(--accent-color);">{initial}</div>
                        <img class="avatar-img" src="{escape(avatar_url)}" alt="{name}的头像" 
                             loading="lazy" 
                             onload="this.style.opacity='1'; this.previousElementSibling.style.display='none';"
                             onerror="this.style.display='none'; this.previousElementSibling.style.display='flex';">
                    </div>
                    '''
        else:
            # 没有头像URL，只显示占位符
            avatar_html = f'<div class="avatar-wrapper"><div class="avatar-placeholder" style="background: var(--accent-color);">{initial}</div></div>'

        display_url = get_display_url(friend.get("link", ""))
        url_section = f'<div class="friend-url">{escape(display_url)}</div>' if display_url else ""

        cards_html += f'''
                    <a href="{link}" class="friend-card" target="_blank" rel="noopener noreferrer">
                        <div class="friend-avatar">{avatar_html}</div>
                        <div class="friend-info">
                            <h3 class="friend-name">{name}</h3>
                            <p class="friend-desc">{desc}</p>
                            {url_section}
                        </div>
                    </a>
                '''
    cards_html += '</div>'
    return stats_html + cards_html

# ========== 生成完整 HTML ==========
def generate_html(cards_html: str) -> str:
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>友情链接 - 高新炀的小站</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="/css/friends.css">
    <link rel="stylesheet" href="/css/twikoo.css">
    <style>
        /* 头像加载优化样式 */
        .avatar-wrapper {{
            position: relative;
            width: 100%;
            height: 100%;
        }}
        
        .avatar-placeholder {{
            width: 100%;
            height: 100%;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.8rem;
            font-weight: bold;
            color: white;
            background: var(--accent-color);
        }}
        
        .avatar-img {{
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.3s ease;
        }}
        
        /* 兼容旧版样式 */
        .friend-avatar {{
            width: 60px;
            height: 60px;
            flex-shrink: 0;
        }}
    </style>
</head>
<body>

    <div id="navbar-placeholder"></div>
    
    <div class="two-column-layout">
        <aside class="sidebar-profile">
            <div id="personal-card-container"></div>
        </aside>

        <main class="main-content-area">
            <div class="container">
                <h2>我的朋友们</h2>
                <p style="margin-bottom: 8px;">「 志合者，不以山海为远 」欢迎互访交流</p>

                {cards_html}

                <div class="info-card">
                    <div class="info-title">友情提示</div>
                    
                    <div class="requirements-section">
                        <div class="section-subtitle">申请要求</div>
                        <div class="requirements-grid">
                            <div class="requirement-item">
                                <div class="requirement-title">友链互换</div>
                                <p class="requirement-desc">请先添加本站友链，并确保您的站点可以被正常访问，双向奔赴才更有意义。</p>
                            </div>
                            <div class="requirement-item">
                                <div class="requirement-title">信息完整</div>
                                <p class="requirement-desc">请确保您的站点有清晰的名称、描述和头像，便于朋友们互相了解。</p>
                            </div>
                            <div class="requirement-item">
                                <div class="requirement-title">内容合规</div>
                                <p class="requirement-desc">拥有原创内容，符合中华人民共和国法律法规，共同维护纯净网络空间。</p>
                            </div>
                            <div class="requirement-item">
                                <div class="requirement-title">持续更新</div>
                                <p class="requirement-desc">建议保持一定的更新频率，热爱分享与交流。不限内容类型，期待多元碰撞。</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="myinfo-section">
                        <div class="myinfo-header">我的信息</div>
                        <div class="info-hint">如果您希望交换友链，可以按照下面的 JSON 提供您的站点信息</div>
                        <div class="code-block-wrapper">
                            <div class="code-header">
                                <button class="copy-btn" id="copyJsonBtn">复制</button>
                            </div>
                            <pre><code id="friendJsonExample">{{
    "name": "高新炀的小站",
    "link": "https://xinyang-gao.github.io",
    "desc": "一个装着些稀奇古怪东西的个人小站，欢迎来逛逛~",
    "avatar": "https://xinyang-gao.github.io/avatar.webp"
}}</code></pre>
                        </div>
                    </div>
                    
                    <div class="warning-note">
                        注意如果有<strong>违法、侵权、恶意广告</strong>等违规内容将会被撤下链接哟
                    </div>
                </div>

                <!-- 评论区 -->
                <div id="twikoo-comments" class="twikoo-container"></div>

                <div class="contact-note">
                    <p>
                        友情提示部分参考了 
                        <a href="https://blog.tianhw.top/friends/" style="color: var(--accent-color);"> THW 大佬</a> 
                        的友链申请要求，感谢~
                    </p>
                </div>
            </div>
        </main>
    </div>

    <div id="footer-placeholder"></div>

    <script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
    <script src="https://registry.npmmirror.com/twikoo/1.7.11/files/dist/twikoo.nocss.js"></script>
    <script src="/js/main.js" type="module"></script>
    <script src="/js/busuanzi.min.js"></script>
    <script src="/js/friends.js" type="module"></script>

</body>
</html>'''

# ========== 主函数 ==========
def main():
    print("=" * 60)
    log_info("友链页面生成器启动（服务端渲染卡片，头像加载优化）")
    print("=" * 60)

    friends = load_friends_data()
    log_info(f"加载到 {len(friends)} 条友链数据")
    cards_html = render_friends_cards(friends)

    full_html = generate_html(cards_html)
    try:
        with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
            f.write(full_html)
        log_info(f"成功生成 {OUTPUT_HTML}")
    except OSError as e:
        log_error(f"写入 HTML 失败: {e}")
        sys.exit(1)

    log_info("友链页面生成器完成（头像已优化：网络缓慢/加载失败时显示占位符）")

if __name__ == "__main__":
    main()