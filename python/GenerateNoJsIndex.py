#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GenerateNoJsIndex.py - 生成无 JS 依赖、无 Emoji、无图片的静态索引页
为禁用 JavaScript 的浏览器、搜索引擎爬虫、AI 提供网站核心信息：
- 网站基础信息（标题、描述、统计）
- 所有文章列表（标题、日期、描述、标签、链接）
- 所有作品列表（标题、日期、描述、标签、链接）
- 友情链接（纯文本，无头像）
"""

import sys
from pathlib import Path
from html import escape
from datetime import datetime
from typing import List, Dict, Any

# 添加当前目录到路径以导入 common
sys.path.insert(0, str(Path(__file__).parent))
from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, load_json,
    format_date, get_current_datetime_iso
)

OUTPUT_NOJS = PROJECT_ROOT / "nojs.html"

def safe_str(value: Any, default: str = "") -> str:
    return str(value) if value else default

def format_date_short(date_str: str) -> str:
    if not date_str or date_str == "未指定日期":
        return "日期不详"
    return format_date(date_str, "")

def build_html_head() -> str:
    return '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="robots" content="index, follow">
    <meta name="description" content="高新炀的个人网站 - 文章、作品、友链。无需 JavaScript 即可访问全部内容。">
    <title>高新炀的小站 · 静态镜像</title>
    <link rel="stylesheet" href="/css/main.css">
    <style>
        /* 无JS增强样式：确保基本内容在任何环境下都清晰可读，且无图片占位 */
        .nojs-alert {
            background: var(--accent-color, #b45b63);
            color: white;
            text-align: center;
            padding: 8px 16px;
            font-size: 0.85rem;
            border-radius: 0 0 8px 8px;
        }
        .nojs-alert a {
            color: white;
            text-decoration: underline;
        }
        .section-header {
            margin-top: 2rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--accent-color, #b45b63);
            display: inline-block;
        }
        .article-item, .work-item {
            margin-bottom: 1.8rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color, #e8e2db);
        }
        .item-title {
            font-size: 1.3rem;
            margin: 0 0 0.4rem 0;
        }
        .item-title a {
            text-decoration: none;
            color: var(--accent-color, #b45b63);
        }
        .item-title a:hover {
            text-decoration: underline;
        }
        .item-meta {
            font-size: 0.85rem;
            color: var(--text-secondary, #6b6b6b);
            margin-bottom: 0.5rem;
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
        }
        .item-desc {
            margin: 0.5rem 0;
            color: var(--text-color, #2c2c2c);
        }
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
        }
        .tag {
            background: var(--tag-bg, #f0ebe5);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            color: var(--tag-color, #4a4a4a);
            display: inline-block;
        }
        .friends-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 1.2rem;
            margin: 1.5rem 0;
        }
        .friend-card {
            background: var(--surface-color-secondary, rgba(245,242,239));
            border: 1px solid var(--border-color, #e8e2db);
            border-radius: 16px;
            padding: 1rem;
            transition: 0.2s;
            text-decoration: none;
            color: var(--text-color, #2c2c2c);
            display: block;
        }
        .friend-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.08);
            border-color: var(--accent-color, #b45b63);
        }
        .friend-name {
            font-size: 1.1rem;
            font-weight: 600;
            margin: 0 0 4px 0;
        }
        .friend-desc {
            font-size: 0.8rem;
            color: var(--text-secondary, #6b6b6b);
            margin: 0;
        }
        .friend-url {
            font-size: 0.75rem;
            color: var(--accent-color, #b45b63);
            word-break: break-all;
            margin-top: 6px;
        }
        .stats-row {
            display: flex;
            flex-wrap: wrap;
            gap: 1.5rem;
            background: var(--surface-color-secondary, rgba(245,242,239));
            padding: 1rem 1.5rem;
            border-radius: 20px;
            margin: 1rem 0;
        }
        .stat-item {
            text-align: center;
        }
        .stat-number {
            font-size: 2rem;
            font-weight: 700;
            color: var(--accent-color, #b45b63);
            line-height: 1;
        }
        .stat-label {
            font-size: 0.85rem;
            color: var(--text-secondary, #6b6b6b);
        }
        footer {
            margin-top: 3rem;
            text-align: center;
            font-size: 0.85rem;
            color: var(--text-secondary, #6b6b6b);
            border-top: 1px solid var(--border-color, #e8e2db);
            padding-top: 1.5rem;
        }
        @media (max-width: 640px) {
            .stats-row { justify-content: center; }
        }
    </style>
</head>
<body>
    <div class="nojs-alert">
        [静态模式] 您当前正在浏览无需 JavaScript 的静态镜像页面，全部内容均可直接访问。 
        完整站点支持动态交互，<a href="/">点击进入主站</a>。
    </div>
    <div id="router-view">
'''

def build_nav() -> str:
    return '''
        <nav style="max-width: 1280px; margin: 1rem auto 0; padding: 0 20px;">
            <a href="/" style="margin-right: 1.5rem;">[首页]</a>
            <a href="/articles.html" style="margin-right: 1.5rem;">[文章]</a>
            <a href="/works.html" style="margin-right: 1.5rem;">[作品]</a>
            <a href="/friends.html" style="margin-right: 1.5rem;">[友链]</a>
            <a href="/about.html">[关于]</a>
        </nav>
'''

def build_hero(stats: Dict) -> str:
    total_articles = stats.get("total_articles", 0)
    total_words = stats.get("total_word_count", 0)
    last_updated = stats.get("last_updated", "")
    return f'''
        <main class="container" style="margin-top: 1rem;">
            <h1>高新炀的小站 · 静态镜像</h1>
            <p style="font-size: 1.1rem;">学生 · 开发者 · 写作者。用代码和文字探索世界，这里收录了我的文章与作品。</p>
            <div class="stats-row">
                <div class="stat-item"><div class="stat-number">{total_articles}</div><div class="stat-label">原创文章</div></div>
                <div class="stat-item"><div class="stat-number">{total_words:,}</div><div class="stat-label">累计字数</div></div>
                <div class="stat-item"><div class="stat-number">{stats.get("total_works", 0)}</div><div class="stat-label">作品/项目</div></div>
                <div class="stat-item"><div class="stat-number">{stats.get("total_authors", 1)}</div><div class="stat-label">创作者</div></div>
            </div>
            <p>最后更新：{last_updated} | <a href="/rss.xml">订阅 RSS</a></p>
        </main>
'''

def build_articles_section(articles: List[Dict]) -> str:
    if not articles:
        return '<section><h2 class="section-header">[文章]</h2><p>暂无文章。</p></section>'

    items_html = []
    for art in articles:
        title = escape(art.get("title", "无标题"))
        url = escape(art.get("url", "#"))
        date = format_date_short(art.get("date", ""))
        desc = escape(art.get("description", "暂无描述"))
        tags = art.get("tags", [])
        word_count = art.get("word_count", 0)
        read_time = art.get("read_time", "")

        tags_html = ''.join(f'<span class="tag">{escape(tag)}</span>' for tag in tags) if tags else ''
        meta_html = f'''
            <div class="item-meta">
                <span>日期：{date}</span>
                <span>字数：{word_count}</span>
                {f'<span>阅读：{read_time}</span>' if read_time else ''}
            </div>
        '''

        items_html.append(f'''
            <div class="article-item">
                <h3 class="item-title"><a href="{url}">{title}</a></h3>
                {meta_html}
                <p class="item-desc">{desc}</p>
                {f'<div class="tags">{tags_html}</div>' if tags_html else ''}
            </div>
        ''')
    return f'''
        <section style="margin-top: 2rem;">
            <h2 class="section-header">[文章] 共 {len(articles)} 篇</h2>
            <div style="margin-top: 1.5rem;">{"".join(items_html)}</div>
        </section>
    '''

def build_works_section(works: List[Dict]) -> str:
    if not works:
        return '<section><h2 class="section-header">[作品]</h2><p>暂无作品。</p></section>'

    items_html = []
    for w in works:
        title = escape(w.get("title", "无标题"))
        link = escape(w.get("link", "#"))
        date = format_date_short(w.get("date", ""))
        desc = escape(w.get("description", "暂无描述"))
        tags = w.get("tag", [])
        if not isinstance(tags, list):
            tags = []

        tags_html = ''.join(f'<span class="tag">{escape(tag)}</span>' for tag in tags) if tags else ''
        items_html.append(f'''
            <div class="work-item">
                <h3 class="item-title"><a href="{link}">{title}</a></h3>
                <div class="item-meta"><span>日期：{date}</span></div>
                <p class="item-desc">{desc}</p>
                {f'<div class="tags">{tags_html}</div>' if tags_html else ''}
            </div>
        ''')
    return f'''
        <section style="margin-top: 2rem;">
            <h2 class="section-header">[作品] 共 {len(works)} 个</h2>
            <div style="margin-top: 1.5rem;">{"".join(items_html)}</div>
        </section>
    '''

def build_friends_section(friends: List[Dict]) -> str:
    if not friends:
        return ''

    cards = []
    for f in friends:
        name = escape(f.get("name", "友站"))
        link = escape(f.get("link", "#"))
        desc = escape(f.get("desc", ""))
        # 不加载图片，仅显示站点名称和描述，可选 URL
        cards.append(f'''
            <a href="{link}" class="friend-card" target="_blank" rel="noopener noreferrer">
                <div class="friend-name">{name}</div>
                <p class="friend-desc">{desc}</p>
                <div class="friend-url">{link}</div>
            </a>
        ''')
    return f'''
        <section style="margin-top: 2rem;">
            <h2 class="section-header">[友情链接]</h2>
            <div class="friends-grid">{"".join(cards)}</div>
            <p style="font-size: 0.85rem;">志合者，不以山海为远。欢迎交换友链，详见 <a href="/friends.html">友链页</a>。</p>
        </section>
    '''

def build_footer() -> str:
    year = datetime.now().year
    return f'''
        <footer>
            <p>© {year} 高新炀 · 内容基于 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a> 许可</p>
            <p>联系：<a href="mailto:gaoxinyang060609@126.com">gaoxinyang060609@126.com</a> · <a href="https://github.com/Xinyang-Gao">GitHub</a></p>
            <p>本页面为静态镜像，无需 JavaScript 即可访问全部文章与作品，且不含任何图片和表情符号。</p>
        </footer>
    </div>
</body>
</html>
'''

def main():
    print("=" * 60)
    log_info("无 JS、无 Emoji、无图片静态索引页生成器启动")
    print("=" * 60)

    articles_data = load_json(JSON_OUTPUT_DIR / "articles.json", {})
    works_data = load_json(JSON_OUTPUT_DIR / "works.json", {})
    stats_data = load_json(JSON_OUTPUT_DIR / "statistics.json", {})
    friends_data = load_json(JSON_OUTPUT_DIR / "friends.json", [])

    raw_articles = articles_data.get("articles", [])
    visible_articles = [
        a for a in raw_articles
        if not a.get("hidden", False) and "隐藏" not in a.get("tags", [])
    ]
    visible_articles.sort(key=lambda x: x.get("date", ""), reverse=True)

    raw_works = works_data.get("works", [])
    visible_works = [
        w for w in raw_works
        if "隐藏" not in w.get("tag", [])
    ]
    visible_works.sort(key=lambda x: x.get("date", ""), reverse=True)

    if isinstance(friends_data, dict) and "friends" in friends_data:
        friends_list = friends_data["friends"]
    elif isinstance(friends_data, list):
        friends_list = friends_data
    else:
        friends_list = []

    stats = {
        "total_articles": len(visible_articles),
        "total_word_count": sum(a.get("word_count", 0) for a in visible_articles),
        "total_works": len(visible_works),
        "total_authors": stats_data.get("total_authors", 1),
        "last_updated": stats_data.get("last_updated", get_current_datetime_iso()[:10])
    }

    log_info(f"加载文章 {len(visible_articles)} 篇，作品 {len(visible_works)} 个，友链 {len(friends_list)} 条")

    html_parts = [
        build_html_head(),
        build_nav(),
        build_hero(stats),
        '<div class="container" style="margin-top: 1rem;">',
        build_articles_section(visible_articles),
        build_works_section(visible_works),
        build_friends_section(friends_list),
        '</div>',
        build_footer()
    ]

    full_html = "\n".join(html_parts)

    try:
        OUTPUT_NOJS.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_NOJS, "w", encoding="utf-8") as f:
            f.write(full_html)
        log_info(f"成功生成静态索引页: {OUTPUT_NOJS}")
        print(f"文件位置: {OUTPUT_NOJS}")
    except OSError as e:
        log_error(f"写入文件失败: {e}")
        sys.exit(1)

    log_info("生成完成")

if __name__ == "__main__":
    main()