#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from pathlib import Path
from html import escape
from urllib.parse import urlparse

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, load_json, save_json, get_current_datetime_iso
)

FRIENDS_JSON = JSON_OUTPUT_DIR / "friends.json"
OUTPUT_HTML = PROJECT_ROOT / "friends.html"

def get_avatar_initial(name: str) -> str:
    if not name:
        return "?"
    first = name.strip()[0].upper()
    return first

def get_display_url(link: str) -> str:
    if not link or link in ("#", "javascript:void(0)"):
        return ""
    raw = link.strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    try:
        host = urlparse(raw).hostname or ""
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return raw.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]

def render_friends_cards(friends_list: list) -> str:
    if not friends_list:
        return '<div class="friends-empty"><p>暂无友链数据，期待新的朋友～</p><p style="font-size:0.85rem; margin-top:12px;">您可以成为第一个友链！</p></div>'

    valid = [f for f in friends_list if f.get("name") and f.get("link")]
    if not valid:
        return '<div class="friends-empty">暂无可展示的有效友链</div>'

    stats_html = f'<div id="friends-stats-area" class="friends-stats">共 {len(valid)} 位小伙伴 · 点击卡片访问友站</div>'
    cards_html = '<div class="friends-grid" id="friends-list-container-inner">'

    for friend in valid:
        name = escape(friend.get("name", "未知站点"))
        link = escape(friend.get("link", "#"))
        desc = escape(friend.get("desc", "暂无简介"))
        avatar_url = friend.get("avatar", "")
        initial = get_avatar_initial(name)

        has_avatar = avatar_url and (avatar_url.startswith("http") or avatar_url.startswith("/"))
        if has_avatar:
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

def generate_html(cards_html: str) -> str:
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>友情链接 - 高新炀的小站</title>
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="/css/pages/friends.css">
    <link rel="stylesheet" href="/css/components/comments.css">
</head>
<body>
<div id="loading-overlay" role="status" aria-label="页面加载中"><div class="loading-log"><div>[START] 正在等待 JavaScript，这可能需要几秒</div></div><div class="loading-glow"></div><div id="loading-content"><span class="loading-title">GaoXinYang</span></div></div>
    <div id="navbar-placeholder"></div>
    <div id="router-view">
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
                        <div class="contact-note"><p>注意如果有<strong>违法、侵权、恶意广告</strong>等违规内容将会被撤下链接哟</p></div>
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
    "avatar": "https://xinyang-gao.github.io/assets/avatar.webp"
}}</code></pre>
                            </div>
                        </div>
                    </div>
                    <div id="twikoo-comments" class="twikoo-container"></div>
                </div>
            </main>
        </div>
    </div>
    <div id="footer-placeholder"></div>
    <script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
    <script src="https://registry.npmmirror.com/twikoo/1.7.12/files/dist/twikoo.nocss.js"></script>
    <script src="/js/entry/main.js" type="module"></script>
    <script src="/js/vendor/busuanzi.min.js"></script>
</body>
</html>'''

def main():
    print("=" * 60)
    log_info("友链页面生成器启动")
    print("=" * 60)

    data = load_json(FRIENDS_JSON, [])
    if isinstance(data, dict) and "friends" in data:
        friends = data["friends"]
    elif isinstance(data, list):
        friends = data
    else:
        log_error("friends.json 格式错误，应为数组或包含 'friends' 键的对象")
        sys.exit(1)

    log_info(f"加载到 {len(friends)} 条友链数据")
    cards_html = render_friends_cards(friends)
    full_html = generate_html(cards_html)

    try:
        with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
            f.write(full_html)
        log_info(f"成功生成 {OUTPUT_HTML}")
    except OSError as e:
        log_error(f"写入失败: {e}")
        sys.exit(1)

    log_info("友链页面生成器完成")

if __name__ == "__main__":
    main()