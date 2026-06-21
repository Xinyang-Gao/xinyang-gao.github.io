#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
import argparse
import hashlib
from pathlib import Path
from html import escape
from urllib.parse import urlparse
import requests
from colorthief import ColorThief

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, load_json, save_json
)

FRIENDS_JSON = JSON_OUTPUT_DIR / "friends.json"
OUTPUT_HTML = PROJECT_ROOT / "friends.html"
COLOR_CACHE_FILE = JSON_OUTPUT_DIR / "friend_colors.json"
AVATAR_CACHE_DIR = PROJECT_ROOT / "assets" / "avatars"

DEFAULT_LIGHT_COLOR = "rgba(180, 91, 99, 0.24)"  # 默认淡色

# ---------- 工具函数 ----------
def ensure_avatar_cache_dir():
    AVATAR_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    log_info(f"头像缓存目录: {AVATAR_CACHE_DIR}")

def get_avatar_cache_path(link: str, avatar_url: str) -> Path:
    link_hash = hashlib.md5(link.encode('utf-8')).hexdigest()
    ext = '.jpg'
    if avatar_url:
        parsed = urlparse(avatar_url)
        path = parsed.path
        if '.' in path:
            ext_candidate = '.' + path.split('.')[-1].split('?')[0]
            if ext_candidate.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'):
                ext = ext_candidate.lower()
    return AVATAR_CACHE_DIR / (link_hash + ext)

def get_avatar_initial(name: str) -> str:
    return name.strip()[0].upper() if name else "?"

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

# ---------- 颜色缓存 ----------
def load_color_cache() -> dict:
    if COLOR_CACHE_FILE.exists():
        try:
            with open(COLOR_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_color_cache(cache: dict):
    try:
        with open(COLOR_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
        log_info(f"颜色缓存已保存: {COLOR_CACHE_FILE}")
    except Exception as e:
        log_error(f"保存颜色缓存失败: {e}")

# ---------- 颜色提取（直接取主色，不做筛选） ----------
def extract_color_from_avatar(avatar_url: str, link: str, force_refresh: bool = False):
    """
    从头像提取主色 (r, g, b)
    支持相对路径补全，优先使用本地缓存图片，失败返回 None
    不缓存失败状态，每次重试都会重新尝试下载/提取
    """
    if not avatar_url:
        log_info("头像 URL 为空，跳过")
        return None

    # 补全相对路径
    if not avatar_url.startswith(('http://', 'https://')):
        parsed_link = urlparse(link)
        if parsed_link.netloc:
            base = f"{parsed_link.scheme}://{parsed_link.netloc}"
            full_url = base + (avatar_url if avatar_url.startswith('/') else '/' + avatar_url)
            log_info(f"相对路径补全: {avatar_url} -> {full_url}")
            avatar_url = full_url
        else:
            log_info(f"无法补全相对路径，link 无效: {link}")
            return None

    ensure_avatar_cache_dir()
    cache_path = get_avatar_cache_path(link, avatar_url)

    # 强制刷新时删除本地缓存
    if force_refresh and cache_path.exists():
        try:
            cache_path.unlink()
            log_info(f"强制刷新，删除旧缓存: {cache_path}")
        except Exception as e:
            log_error(f"删除缓存文件失败: {e}")

    # 如果本地缓存存在，直接提取
    if cache_path.exists():
        try:
            color_thief = ColorThief(str(cache_path))
            dominant = color_thief.get_color(quality=1)
            log_info(f"✅ 使用本地缓存，主色: RGB{dominant}")
            return dominant
        except Exception as e:
            log_error(f"读取本地缓存失败 ({cache_path}): {e}")
            # 删除损坏的缓存文件，下次重新下载
            try:
                cache_path.unlink()
            except:
                pass

    # 下载头像
    try:
        log_info(f"⬇️ 下载头像: {avatar_url}")
        resp = requests.get(avatar_url, timeout=5, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        if resp.status_code != 200:
            log_info(f"下载失败 HTTP {resp.status_code}: {avatar_url}")
            return None
        with open(cache_path, 'wb') as f:
            f.write(resp.content)
        log_info(f"✅ 头像已缓存: {cache_path} ({len(resp.content)} bytes)")

        color_thief = ColorThief(str(cache_path))
        dominant = color_thief.get_color(quality=1)
        log_info(f"🎨 提取主色成功: RGB{dominant}")
        return dominant
    except Exception as e:
        log_error(f"下载或提取失败 ({avatar_url}): {e}")
        # 删除可能损坏的缓存文件
        if cache_path.exists():
            try:
                cache_path.unlink()
            except:
                pass
        return None

def get_friend_background_color(friend: dict, cache: dict, force_refresh: bool = False) -> str:
    link = friend.get("link", "")
    if not link:
        return DEFAULT_LIGHT_COLOR

    # 只从缓存读取成功提取的颜色（不存在 None）
    if not force_refresh and link in cache:
        rgb = cache[link]
        if isinstance(rgb, list) and len(rgb) == 3:
            return f"rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, 0.24)"

    # 提取颜色
    avatar_url = friend.get("avatar", "")
    rgb = extract_color_from_avatar(avatar_url, link, force_refresh)
    if rgb:
        cache[link] = list(rgb)
        save_color_cache(cache)
        return f"rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, 0.24)"
    else:
        # 不缓存失败状态，下次重新尝试
        return DEFAULT_LIGHT_COLOR

# ---------- 渲染友链卡片 ----------
def render_friends_cards(friends_list: list, force_refresh: bool = False) -> str:
    if not friends_list:
        return '<div class="friends-empty"><p>暂无友链数据，期待新的朋友～</p><p style="font-size:0.85rem; margin-top:12px;">您可以成为第一个友链！</p></div>'

    valid = [f for f in friends_list if f.get("name") and f.get("link")]
    if not valid:
        return '<div class="friends-empty">暂无可展示的有效友链</div>'

    color_cache = load_color_cache()
    stats_html = f'<div id="friends-stats-area" class="friends-stats">共 {len(valid)} 位小伙伴 · 点击卡片访问友站</div>'
    cards_html = '<div class="friends-grid" id="friends-list-container-inner">'

    for friend in valid:
        name = escape(friend.get("name", "未知站点"))
        link = escape(friend.get("link", "#"))
        desc = escape(friend.get("desc", "暂无简介"))
        avatar_url = friend.get("avatar", "")
        initial = get_avatar_initial(name)

        bg_color = get_friend_background_color(friend, color_cache, force_refresh)

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

# ---------- 生成完整 HTML ----------
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

# ---------- 主入口 ----------
def main():
    print("=" * 60)
    log_info("友链页面生成器启动")
    print("=" * 60)

    parser = argparse.ArgumentParser(description='生成友链页面，支持头像缓存与颜色提取')
    parser.add_argument('--refresh-cache', action='store_true', help='强制刷新所有头像缓存（重新下载并提取颜色）')
    args = parser.parse_args()
    force_refresh = args.refresh_cache

    data = load_json(FRIENDS_JSON, [])
    if isinstance(data, dict) and "friends" in data:
        friends = data["friends"]
    elif isinstance(data, list):
        friends = data
    else:
        log_error("friends.json 格式错误，应为数组或包含 'friends' 键的对象")
        sys.exit(1)

    log_info(f"加载到 {len(friends)} 条友链数据")
    if force_refresh:
        log_info("强制刷新缓存模式已启用")

    cards_html = render_friends_cards(friends, force_refresh)
    full_html = generate_html(cards_html)

    try:
        with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
            f.write(full_html)
        log_info(f"✅ 成功生成 {OUTPUT_HTML}")
    except OSError as e:
        log_error(f"写入失败: {e}")
        sys.exit(1)

    log_info("友链页面生成器完成")

if __name__ == "__main__":
    main()