#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from pathlib import Path
from html import escape
from urllib.parse import urlparse
import requests
from colorthief import ColorThief
from io import BytesIO

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, load_json, save_json, get_current_datetime_iso
)

FRIENDS_JSON = JSON_OUTPUT_DIR / "friends.json"
OUTPUT_HTML = PROJECT_ROOT / "friends.html"
COLOR_CACHE_FILE = JSON_OUTPUT_DIR / "friend_colors.json"   # 缓存文件

# 默认淡色（当无法提取时使用）
DEFAULT_LIGHT_COLOR = "rgba(180, 91, 99, 0.24)"  # 对应 --accent-color 的淡色

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

def load_color_cache() -> dict:
    """加载颜色缓存"""
    if COLOR_CACHE_FILE.exists():
        try:
            with open(COLOR_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_color_cache(cache: dict):
    """保存颜色缓存"""
    try:
        with open(COLOR_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception as e:
        log_error(f"保存颜色缓存失败: {e}")

def extract_color_from_avatar(avatar_url: str, timeout: int = 3) -> tuple | None:
    """
    从头像 URL 提取主色 (r, g, b)
    返回 None 表示失败
    """
    if not avatar_url:
        return None
    try:
        resp = requests.get(avatar_url, timeout=timeout, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        if resp.status_code != 200:
            return None
        # 从 BytesIO 读取图片
        color_thief = ColorThief(BytesIO(resp.content))
        # 获取主色 (返回 (r, g, b))
        dominant = color_thief.get_color(quality=1)
        return dominant
    except Exception as e:
        log_info(f"提取头像颜色失败 ({avatar_url}): {e}")
        return None

def get_friend_background_color(friend: dict, cache: dict) -> str:
    """
    获取友链卡片背景色（淡色 CSS 值）
    优先使用缓存，若缓存不存在则尝试提取，并保存到缓存
    """
    link = friend.get("link", "")
    if not link:
        return DEFAULT_LIGHT_COLOR

    # 检查缓存
    if link in cache:
        rgb = cache[link]
        if isinstance(rgb, list) and len(rgb) == 3:
            return f"rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, 0.24)"

    # 缓存未命中，尝试提取
    avatar_url = friend.get("avatar", "")
    rgb = extract_color_from_avatar(avatar_url)
    if rgb:
        # 存入缓存
        cache[link] = list(rgb)
        save_color_cache(cache)
        return f"rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, 0.24)"
    else:
        # 提取失败，存入占位标记，避免反复请求（用 None 标记）
        cache[link] = None
        save_color_cache(cache)
        return DEFAULT_LIGHT_COLOR

def render_friends_cards(friends_list: list) -> str:
    if not friends_list:
        return '<div class="friends-empty"><p>暂无友链数据，期待新的朋友～</p><p style="font-size:0.85rem; margin-top:12px;">您可以成为第一个友链！</p></div>'

    valid = [f for f in friends_list if f.get("name") and f.get("link")]
    if not valid:
        return '<div class="friends-empty">暂无可展示的有效友链</div>'

    # 加载颜色缓存
    color_cache = load_color_cache()

    stats_html = f'<div id="friends-stats-area" class="friends-stats">共 {len(valid)} 位小伙伴 · 点击卡片访问友站</div>'
    cards_html = '<div class="friends-grid" id="friends-list-container-inner">'

    for friend in valid:
        name = escape(friend.get("name", "未知站点"))
        link = escape(friend.get("link", "#"))
        desc = escape(friend.get("desc", "暂无简介"))
        avatar_url = friend.get("avatar", "")
        initial = get_avatar_initial(name)

        # 获取该友链的背景色（淡色）
        bg_color = get_friend_background_color(friend, color_cache)

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

        # 卡片内联样式：添加淡色背景（会与原有渐变叠加）
        cards_html += f'''
            <a href="{link}" class="friend-card" target="_blank" rel="noopener noreferrer" style="background-color: {bg_color};">
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
    # （与原来完全相同，省略）
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