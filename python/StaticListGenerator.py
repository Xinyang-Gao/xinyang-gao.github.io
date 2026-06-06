#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
import argparse
from pathlib import Path
from html import escape

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, load_json, save_json,
    format_date_iso, get_current_datetime_iso
)

ARTICLES_JSON = JSON_OUTPUT_DIR / "articles.json"
WORKS_JSON = JSON_OUTPUT_DIR / "works.json"
OUTPUT_ARTICLES = PROJECT_ROOT / "articles.html"
OUTPUT_WORKS = PROJECT_ROOT / "works.html"

def format_date_short(date_str: str) -> str:
    """返回 YYYY-MM-DD"""
    return format_date_iso(date_str) if date_str else "未知日期"

def get_tags_html(tags: list) -> str:
    if not tags:
        return ""
    tags_html = '<div class="tags">'
    for tag in tags:
        tags_html += f'<span class="tag">{escape(tag)}</span>'
    tags_html += '</div>'
    return tags_html

# -------------------- 文章列表 --------------------
def generate_article_card(article: dict, index: int) -> str:
    title = escape(article.get("title", "无标题"))
    url = escape(article.get("url", "#"))
    description = escape(article.get("description", "暂无描述"))
    date = format_date_short(article.get("date", ""))
    last_updated = format_date_short(article.get("last_updated", ""))
    author = escape(article.get("author", "未知作者"))
    word_count = article.get("word_count", 0)
    read_time = escape(article.get("read_time", ""))
    tags = article.get("tags", [])

    publish_html = f'<span class="publish-date">发布于 {date}</span>' if date else ''
    update_html = ''
    if last_updated and last_updated != date:
        update_html = f'<span class="update-date">更新: {last_updated}</span>'
    date_info = f'<div class="article-dates-top-right">{publish_html}{update_html}</div>' if (publish_html or update_html) else ''

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
            {date_info}
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
    for art in articles:
        for tag in art.get("tags", []):
            tag_count[tag] = tag_count.get(tag, 0) + 1
    if not tag_count:
        return '<div id="articles-tags-filter" class="tags-filter"><span class="filter-label">按标签筛选:</span><span>暂无标签</span></div>'
    sorted_tags = sorted(tag_count.items(), key=lambda x: x[0])
    btns = [f'<button type="button" class="tag-button" data-tag="{escape(tag)}">{escape(tag)} ({cnt})</button>' for tag, cnt in sorted_tags]
    clear_btn = '<button type="button" class="tag-button" style="margin-left: auto;">清除筛选</button>'
    return f'''
    <div id="articles-tags-filter" class="tags-filter">
        <span class="filter-label">按标签筛选:</span>
        {''.join(btns)}
        {clear_btn}
    </div>
    '''

def generate_articles_page(articles: list) -> str:
    articles_html = generate_all_articles_html(articles)
    tags_filter = generate_article_tags_filter(articles)
    articles_json_str = json.dumps(articles, ensure_ascii=False)
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>文章 - 高新炀的小站</title>
<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/friends.css"><link rel="stylesheet" href="/css/twikoo.css"></head>
<body>
<div id="navbar-placeholder"></div>
<div class="two-column-layout"><aside class="sidebar-profile"><div id="personal-card-container"></div></aside>
<main class="main-content-area"><div class="container"><h2>文章</h2><p>这里有一些随便写的作文、技术博客……</p>
<div id="search-container"><input type="text" id="search-input" placeholder="搜索文章..."><select id="search-field"><option value="all">全部</option><option value="title">标题</option><option value="tag">标签</option><option value="date">日期</option></select></div>
{tags_filter}
<div class="sort-controls"><label for="sort-order">排序方式：</label><select id="sort-order"><option value="updated_asc">按更新时间升序</option><option value="updated_desc" selected>按更新时间降序</option><option value="wordcount_asc">按字数升序</option><option value="wordcount_desc">按字数降序</option><option value="date_asc">按发布日期升序</option><option value="date_desc">按发布日期降序</option></select></div>
<div id="articles-list-container">{articles_html}</div>
</div></main></div>
<button id="backToTopBtn" class="back-to-top-btn" title="返回顶部">↑</button>
<div id="pageTransition" class="page-transition"></div>
<div id="footer-placeholder"></div>
<script>window.__STATIC_ARTICLES_DATA = {articles_json_str};</script>
<script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
<script src="/js/vendor/busuanzi.min.js" defer></script>
<script src="/js/entry/main.js" type="module"></script>
</body></html>'''

# -------------------- 作品列表 --------------------
def generate_work_card(work: dict, index: int) -> str:
    title = escape(work.get("title", "无标题"))
    description = escape(work.get("description", "暂无描述"))
    date = format_date_short(work.get("date", ""))
    tags = work.get("tags", work.get("tag", []))
    work_info = {"title": title, "description": description, "link": work.get("link", ""), "tags": tags}
    work_info_str = json.dumps(work_info, ensure_ascii=False)
    tags_html = get_tags_html(tags)
    return f'''
    <div class="list-item" data-work-info="{escape(work_info_str)}" data-type="work" data-index="{index}">
        <div class="list-item-header"><h3 class="list-item-title">{title}</h3><div class="list-item-meta"><span class="list-item-date">{date}</span></div></div>
        <p class="list-item-description">{description}</p>
        {tags_html}
    </div>
    '''

def generate_all_works_html(works: list) -> str:
    if not works:
        return '<div class="works-list"><p>暂无作品，敬请期待～</p></div>'
    cards = [generate_work_card(w, idx) for idx, w in enumerate(works)]
    return f'<div class="works-list">{"".join(cards)}</div>'

def generate_works_tags_filter(works: list) -> str:
    tag_count = {}
    for w in works:
        for tag in w.get("tags", w.get("tag", [])):
            tag_count[tag] = tag_count.get(tag, 0) + 1
    if not tag_count:
        return '<div id="works-tags-filter" class="tags-filter"><span class="filter-label">按标签筛选:</span><span>暂无标签</span></div>'
    sorted_tags = sorted(tag_count.items(), key=lambda x: x[0])
    btns = [f'<button type="button" class="tag-button" data-tag="{escape(tag)}">{escape(tag)} ({cnt})</button>' for tag, cnt in sorted_tags]
    clear_btn = '<button type="button" class="tag-button" style="margin-left: auto;">清除筛选</button>'
    return f'''
    <div id="works-tags-filter" class="tags-filter">
        <span class="filter-label">按标签筛选:</span>
        {''.join(btns)}
        {clear_btn}
    </div>
    '''

def generate_works_page(works: list) -> str:
    works_html = generate_all_works_html(works)
    tags_filter = generate_works_tags_filter(works)
    works_json_str = json.dumps(works, ensure_ascii=False)
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>作品 - 高新炀的小站</title>
<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/friends.css"><link rel="stylesheet" href="/css/twikoo.css"></head>
<body>
<div id="navbar-placeholder"></div>
<div class="two-column-layout"><aside class="sidebar-profile"><div id="personal-card-container"></div></aside>
<main class="main-content-area"><div class="container"><h2>作品</h2><p>这里有一些我做的东西（可能有些稀奇古怪的小玩意？）</p>
<div id="search-container"><input type="text" id="search-input" placeholder="搜索作品..."><select id="search-field"><option value="all">全部</option><option value="title">标题</option><option value="tag">标签</option><option value="date">日期</option></select></div>
{tags_filter}
<div class="sort-controls"><label for="sort-order">排序方式：</label><select id="sort-order"><option value="updated_asc">按更新时间升序</option><option value="updated_desc" selected>按更新时间降序</option><option value="wordcount_asc">按字数升序</option><option value="wordcount_desc">按字数降序</option><option value="date_asc">按发布日期升序</option><option value="date_desc">按发布日期降序</option></select></div>
<div id="works-list-container">{works_html}</div>
</div></main></div>
<button id="backToTopBtn" class="back-to-top-btn" title="返回顶部">↑</button>
<div id="pageTransition" class="page-transition"></div>
<div id="footer-placeholder"></div>
<script>window.__STATIC_WORKS_DATA = {works_json_str};</script>
<script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
<script src="/js/vendor/busuanzi.min.js" defer></script>
<script src="/js/entry/main.js" type="module"></script>
</body></html>'''

# -------------------- 主函数 --------------------
def main():
    parser = argparse.ArgumentParser(description="生成文章或作品静态列表页")
    parser.add_argument("--type", choices=["articles", "works", "all"], default="all")
    args = parser.parse_args()

    print("=" * 60)
    log_info("静态列表页生成器启动")
    print("=" * 60)

    success = True
    if args.type in ("articles", "all"):
        log_info("生成文章列表页...")
        data = load_json(ARTICLES_JSON, {})
        articles = [a for a in data.get("articles", []) if not a.get("hidden", False)]
        log_info(f"加载到 {len(articles)} 篇文章")
        html = generate_articles_page(articles)
        try:
            with open(OUTPUT_ARTICLES, "w", encoding="utf-8") as f:
                f.write(html)
            log_info(f"成功生成 {OUTPUT_ARTICLES}")
        except OSError as e:
            log_error(f"写入失败: {e}")
            success = False

    if args.type in ("works", "all"):
        log_info("生成作品列表页...")
        data = load_json(WORKS_JSON, {})
        works = data.get("works", [])
        log_info(f"加载到 {len(works)} 个作品")
        html = generate_works_page(works)
        try:
            with open(OUTPUT_WORKS, "w", encoding="utf-8") as f:
                f.write(html)
            log_info(f"成功生成 {OUTPUT_WORKS}")
        except OSError as e:
            log_error(f"写入失败: {e}")
            success = False

    if not success:
        sys.exit(1)
    log_info("静态列表页生成完成")

if __name__ == "__main__":
    main()