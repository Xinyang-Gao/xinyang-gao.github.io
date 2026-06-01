#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
from html import escape

# ========== 路径配置 ==========
PROJECT_ROOT = Path(__file__).parent.parent
JSON_DIR = PROJECT_ROOT / "json"
HTML_DIR = PROJECT_ROOT

# JSON 文件路径
ARTICLES_JSON = JSON_DIR / "articles.json"
WORKS_JSON = JSON_DIR / "works.json"

# 输出 HTML 路径
OUTPUT_ARTICLES = HTML_DIR / "articles.html"
OUTPUT_WORKS = HTML_DIR / "works.html"

# ========== 日志 ==========
def log_info(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}")

def log_error(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}")

# ========== 加载 JSON 数据 ==========
def load_articles_data() -> dict:
    if not ARTICLES_JSON.exists():
        log_error(f"文件不存在: {ARTICLES_JSON}")
        return {"articles": []}
    try:
        with open(ARTICLES_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "articles" in data and isinstance(data["articles"], list):
            # 过滤隐藏文章
            data["articles"] = [a for a in data["articles"] if not a.get("hidden", False)]
            return data
        else:
            log_error(f"articles.json 格式错误: 缺少 'articles' 键或不是数组")
            return {"articles": []}
    except json.JSONDecodeError as e:
        log_error(f"解析 articles.json 失败: {e}")
        return {"articles": []}

def load_works_data() -> dict:
    if not WORKS_JSON.exists():
        log_error(f"文件不存在: {WORKS_JSON}")
        return {"works": []}
    try:
        with open(WORKS_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "works" in data and isinstance(data["works"], list):
            return data
        else:
            log_error(f"works.json 格式错误: 缺少 'works' 键或不是数组")
            return {"works": []}
    except json.JSONDecodeError as e:
        log_error(f"解析 works.json 失败: {e}")
        return {"works": []}

# ========== 辅助函数 ==========
def format_date(date_str: str) -> str:
    if not date_str:
        return "未知日期"
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return date_str

def get_tags_html(tags: list) -> str:
    if not tags:
        return ""
    tags_html = '<div class="tags">'
    for tag in tags:
        tags_html += f'<span class="tag">{escape(tag)}</span>'
    tags_html += '</div>'
    return tags_html

# ==================== 文章列表生成 ====================
def generate_article_card(article: dict, index: int) -> str:
    title = escape(article.get("title", "无标题"))
    url = escape(article.get("url", "#"))
    description = escape(article.get("description", "暂无描述"))
    date = format_date(article.get("date", ""))
    last_updated = format_date(article.get("last_updated", ""))
    author = escape(article.get("author", "未知作者"))
    word_count = article.get("word_count", 0)
    read_time = escape(article.get("read_time", ""))
    tags = article.get("tags", [])

    publish_date_html = f'<span class="publish-date">发布于 {date}</span>' if date else ''
    update_date_html = ''
    if last_updated and last_updated != date:
        update_date_html = f'<span class="update-date">更新: {last_updated}</span>'
    date_info_html = ''
    if publish_date_html or update_date_html:
        date_info_html = f'<div class="article-dates-top-right">{publish_date_html}{update_date_html}</div>'

    meta_html = f'''
    <div class="article-meta-info">
        <span class="article-author">{author}</span>
        {f'<span class="article-word-count">{word_count} 字</span>' if word_count else ''}
        {f'<span class="article-read-time"><i class="far fa-clock"></i> {read_time}</span>' if read_time else ''}
    </div>
    '''

    tags_html = get_tags_html(tags)

    return f'''
    <div class="list-item" data-url="{url}" data-type="article" data-index="{index}">
        <div class="list-item-header">
            <h3 class="list-item-title"><a href="{url}">{title}</a></h3>
            {date_info_html}
        </div>
        {meta_html}
        <p class="list-item-description">{description}</p>
        {tags_html}
    </div>
    '''

def generate_all_articles_html(articles: list) -> str:
    if not articles:
        return '<div class="articles-list"><p>暂无文章，敬请期待～</p></div>'
    cards = [generate_article_card(art, idx) for idx, art in enumerate(articles)]
    return f'<div class="articles-list">{"".join(cards)}</div>'

def generate_article_tags_filter(articles: list) -> str:
    tag_count = {}
    for article in articles:
        for tag in article.get("tags", []):
            tag_count[tag] = tag_count.get(tag, 0) + 1
    if not tag_count:
        return '<div id="articles-tags-filter" class="tags-filter"><span class="filter-label">按标签筛选:</span><span>暂无标签</span></div>'
    sorted_tags = sorted(tag_count.items(), key=lambda x: x[0])
    buttons = [f'<button type="button" class="tag-button" data-tag="{escape(tag)}">{escape(tag)} ({count})</button>' for tag, count in sorted_tags]
    clear_btn = '<button type="button" class="tag-button" style="margin-left: auto;">清除筛选</button>'
    return f'''
    <div id="articles-tags-filter" class="tags-filter">
        <span class="filter-label">按标签筛选:</span>
        {''.join(buttons)}
        {clear_btn}
    </div>
    '''

def generate_articles_page(articles: list) -> str:
    articles_html = generate_all_articles_html(articles)
    tags_filter_html = generate_article_tags_filter(articles)
    articles_json_str = json.dumps(articles, ensure_ascii=False)

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>文章 - 高新炀的小站</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="/css/friends.css">
    <link rel="stylesheet" href="/css/twikoo.css">
</head>
<body>

    <div id="navbar-placeholder"></div>

    <div class="two-column-layout">
        <aside class="sidebar-profile">
            <div id="personal-card-container"></div>
        </aside>

        <main class="main-content-area">
            <div class="container">
                <h2>文章</h2>
                <p>这里有一些随便写的作文、技术博客……</p>

                <div id="search-container">
                    <input type="text" id="search-input" placeholder="搜索文章...">
                    <select id="search-field">
                        <option value="all">全部</option>
                        <option value="title">标题</option>
                        <option value="tag">标签</option>
                        <option value="date">日期</option>
                    </select>
                </div>

                {tags_filter_html}

                <div class="sort-controls">
                    <label for="sort-order">排序方式：</label>
                    <select id="sort-order">
                        <option value="updated_asc">按更新时间升序</option>
                        <option value="updated_desc" selected>按更新时间降序</option>
                        <option value="wordcount_asc">按字数升序</option>
                        <option value="wordcount_desc">按字数降序</option>
                        <option value="date_asc">按发布日期升序</option>
                        <option value="date_desc">按发布日期降序</option>
                    </select>
                </div>

                <div id="articles-list-container">
                    {articles_html}
                </div>
            </div>
        </main>
    </div>

    <button id="backToTopBtn" class="back-to-top-btn" title="返回顶部">↑</button>
    <div id="pageTransition" class="page-transition"></div>

    <div id="footer-placeholder"></div>

    <script>
        window.__STATIC_ARTICLES_DATA = {articles_json_str};
    </script>

    <script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
    <script src="/js/busuanzi.min.js" defer></script>
    <script src="/js/main.js" type="module"></script>
</body>
</html>'''

# ==================== 作品列表生成 ====================
def generate_work_card(work: dict, index: int) -> str:
    title = escape(work.get("title", "无标题"))
    description = escape(work.get("description", "暂无描述"))
    date = format_date(work.get("date", ""))
    tags = work.get("tags", work.get("tag", []))
    
    work_info = {
        "title": work.get("title", ""),
        "description": work.get("description", ""),
        "link": work.get("link", ""),
        "tags": tags
    }
    work_info_str = json.dumps(work_info, ensure_ascii=False)
    work_info_attr = escape(work_info_str)

    tags_html = get_tags_html(tags)

    return f'''
    <div class="list-item" data-work-info="{work_info_attr}" data-type="work" data-index="{index}">
        <div class="list-item-header">
            <h3 class="list-item-title">{title}</h3>
            <div class="list-item-meta">
                <span class="list-item-date">{date}</span>
            </div>
        </div>
        <p class="list-item-description">{description}</p>
        {tags_html}
    </div>
    '''

def generate_all_works_html(works: list) -> str:
    if not works:
        return '<div class="works-list"><p>暂无作品，敬请期待～</p></div>'
    cards = [generate_work_card(work, idx) for idx, work in enumerate(works)]
    return f'<div class="works-list">{"".join(cards)}</div>'

def generate_works_tags_filter(works: list) -> str:
    tag_count = {}
    for work in works:
        for tag in work.get("tags", work.get("tag", [])):
            tag_count[tag] = tag_count.get(tag, 0) + 1
    if not tag_count:
        return '<div id="works-tags-filter" class="tags-filter"><span class="filter-label">按标签筛选:</span><span>暂无标签</span></div>'
    sorted_tags = sorted(tag_count.items(), key=lambda x: x[0])
    buttons = [f'<button type="button" class="tag-button" data-tag="{escape(tag)}">{escape(tag)} ({count})</button>' for tag, count in sorted_tags]
    clear_btn = '<button type="button" class="tag-button" style="margin-left: auto;">清除筛选</button>'
    return f'''
    <div id="works-tags-filter" class="tags-filter">
        <span class="filter-label">按标签筛选:</span>
        {''.join(buttons)}
        {clear_btn}
    </div>
    '''

def generate_works_page(works: list) -> str:
    works_html = generate_all_works_html(works)
    tags_filter_html = generate_works_tags_filter(works)
    works_json_str = json.dumps(works, ensure_ascii=False)

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>作品 - 高新炀的小站</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="/css/friends.css">
    <link rel="stylesheet" href="/css/twikoo.css">
</head>
<body>

    <div id="navbar-placeholder"></div>

    <div class="two-column-layout">
        <aside class="sidebar-profile">
            <div id="personal-card-container"></div>
        </aside>

        <main class="main-content-area">
            <div class="container">
                <h2>作品</h2>
                <p>这里有一些我做的东西（可能有些稀奇古怪的小玩意？）</p>

                <div id="search-container">
                    <input type="text" id="search-input" placeholder="搜索作品...">
                    <select id="search-field">
                        <option value="all">全部</option>
                        <option value="title">标题</option>
                        <option value="tag">标签</option>
                        <option value="date">日期</option>
                    </select>
                </div>

                {tags_filter_html}

                <div class="sort-controls">
                    <label for="sort-order">排序方式：</label>
                    <select id="sort-order">
                        <option value="updated_asc">按更新时间升序</option>
                        <option value="updated_desc" selected>按更新时间降序</option>
                        <option value="wordcount_asc">按字数升序</option>
                        <option value="wordcount_desc">按字数降序</option>
                        <option value="date_asc">按发布日期升序</option>
                        <option value="date_desc">按发布日期降序</option>
                    </select>
                </div>

                <div id="works-list-container">
                    {works_html}
                </div>
            </div>
        </main>
    </div>

    <button id="backToTopBtn" class="back-to-top-btn" title="返回顶部">↑</button>
    <div id="pageTransition" class="page-transition"></div>

    <div id="footer-placeholder"></div>

    <script>
        window.__STATIC_WORKS_DATA = {works_json_str};
    </script>

    <script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
    <script src="/js/busuanzi.min.js" defer></script>
    <script src="/js/main.js" type="module"></script>
</body>
</html>'''

# ========== 主函数 ==========
def main():
    parser = argparse.ArgumentParser(description="生成文章或作品静态列表页")
    parser.add_argument("--type", choices=["articles", "works", "all"], default="all",
                        help="生成类型: articles(仅文章), works(仅作品), all(两者都生成)")
    args = parser.parse_args()

    print("=" * 60)
    log_info("静态列表页生成器启动")
    print("=" * 60)

    success = True

    if args.type in ("articles", "all"):
        log_info("开始生成文章列表页...")
        articles_data = load_articles_data()
        articles = articles_data.get("articles", [])
        log_info(f"加载到 {len(articles)} 篇文章")
        articles_html = generate_articles_page(articles)
        try:
            with open(OUTPUT_ARTICLES, "w", encoding="utf-8") as f:
                f.write(articles_html)
            log_info(f"成功生成 {OUTPUT_ARTICLES}")
        except OSError as e:
            log_error(f"写入 articles.html 失败: {e}")
            success = False

    if args.type in ("works", "all"):
        log_info("开始生成作品列表页...")
        works_data = load_works_data()
        works = works_data.get("works", [])
        log_info(f"加载到 {len(works)} 个作品")
        works_html = generate_works_page(works)
        try:
            with open(OUTPUT_WORKS, "w", encoding="utf-8") as f:
                f.write(works_html)
            log_info(f"成功生成 {OUTPUT_WORKS}")
        except OSError as e:
            log_error(f"写入 works.html 失败: {e}")
            success = False

    if success:
        log_info("所有生成任务完成")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()