#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
聚合生成器：一次性生成统计 JSON、RSS、站点地图、列表页、子目录页面、复制静态资源。
所有生成共享一次加载的数据，减少 I/O。
"""

import json
import sys
import shutil
from pathlib import Path
from html import escape
from datetime import datetime
from collections import Counter
from xml.etree import ElementTree as ET
import subprocess
from rcssmin import cssmin

# 使用相对导入
from ..common import (
    PROJECT_ROOT, SRC_ROOT, TEMPLATES_DIR, CSS_SRC_DIR, JS_SRC_DIR, ASSETS_DIR,
    DIST_ROOT, ARTICLES_OUTPUT_DIR, JSON_OUTPUT_DIR, CSS_DIST_DIR, JS_DIST_DIR, ASSETS_DIST_DIR,
    RSS_OUTPUT, SITEMAP_OUTPUT,
    log_info, log_warning, log_error,
    load_json, save_json, format_date, format_date_iso,
    get_current_date_iso, get_current_datetime_iso,
    compute_content_hash
)
from ..build_context import BuildContext
from .base import OutputGenerator

# 输出路径（在 dist/ 下）—— 改为 /articles/ 和 /works/
ARTICLES_LIST_HTML = DIST_ROOT / "articles" / "index.html"
WORKS_LIST_HTML = DIST_ROOT / "works" / "index.html"
NOJS_HTML = DIST_ROOT / "nojs.html"
STATISTICS_JSON = JSON_OUTPUT_DIR / "statistics.json"

# 需要从模板生成到子目录的页面（模板名 -> 目标子目录）
PAGE_TEMPLATES = {
    "about.html": "about",
    "archive.html": "archive",
    "stats.html": "stats",
    "settings.html": "settings",
    "contact.html": "contact",
    "friends.html": "friends",
}

class AggregatedGenerator(OutputGenerator):
    name = "aggregated"
    inputs = {"articles", "works", "friends", "version"}
    outputs = [
        RSS_OUTPUT, SITEMAP_OUTPUT, ARTICLES_LIST_HTML, WORKS_LIST_HTML, NOJS_HTML, STATISTICS_JSON
    ] + [DIST_ROOT / f"{key}" / "index.html" for key in PAGE_TEMPLATES.values()]

    def generate(self, context: BuildContext, force: bool) -> bool:
        log_info("开始聚合生成...")
        try:
            self._build_statistics(context)
            self._generate_rss(context)
            self._generate_sitemap(context)
            self._generate_articles_page(context)
            self._generate_works_page(context)
            self._generate_nojs_index(context)
            self._copy_static_assets()
            self._generate_subdir_pages(context)
            log_info("聚合生成完成")
            return True
        except Exception as e:
            log_error(f"聚合生成失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    # ---------- 统计 ----------
    def _build_statistics(self, context: BuildContext) -> None:
        articles = [a for a in context.articles if not a.hidden]
        works = context.works

        all_dates = []
        for art in articles:
            if art.date and art.date != "未指定日期":
                all_dates.append(art.date[:10])
        for w in works:
            if w.date and w.date != "未指定日期":
                all_dates.append(w.date[:10])
        last_updated = max(all_dates) if all_dates else get_current_date_iso()

        total_articles = len(articles)
        total_word_count = sum(a.word_count for a in articles)
        avg_word = int(total_word_count / total_articles) if total_articles else 0

        article_tag_cnt = Counter()
        article_cat_cnt = Counter()
        article_author_cnt = Counter()
        for art in articles:
            for tag in art.tags:
                if tag:
                    article_tag_cnt[tag] += 1
            if art.category:
                article_cat_cnt[art.category] += 1
            if art.author:
                article_author_cnt[art.author] += 1

        work_tag_cnt = Counter()
        work_author_cnt = Counter()
        for w in works:
            for tag in w.tag:
                if tag:
                    work_tag_cnt[tag] += 1
            if w.author:
                work_author_cnt[w.author] += 1

        unique_authors = set(article_author_cnt.keys()) | set(work_author_cnt.keys())
        update_days = sorted(set(all_dates))

        versions = context.version.get("versions", [])
        if versions:
            latest = max(versions, key=lambda v: v.get('id', 0))
            version_id = latest.get('id', 0)
        else:
            version_id = 0

        def build_counted_list(counter):
            items = [{"name": name, "count": count} for name, count in counter.items()]
            items.sort(key=lambda x: (-x["count"], x["name"]))
            return items

        statistics = {
            "version": version_id,
            "last_updated": last_updated,
            "last_updated_full": get_current_datetime_iso(),
            "total_articles": total_articles,
            "total_word_count": total_word_count,
            "average_article_word_count": avg_word,
            "total_works": len(works),
            "total_article_categories": len(article_cat_cnt),
            "total_article_tags": len(article_tag_cnt),
            "total_work_tags": len(work_tag_cnt),
            "total_authors": len(unique_authors),
            "total_update_days": len(update_days),
            "article_tags": build_counted_list(article_tag_cnt),
            "article_categories": build_counted_list(article_cat_cnt),
            "work_tags": build_counted_list(work_tag_cnt),
            "article_tags_list": sorted(article_tag_cnt.keys()),
            "article_categories_list": sorted(article_cat_cnt.keys()),
            "work_tags_list": sorted(work_tag_cnt.keys())
        }
        save_json(statistics, STATISTICS_JSON)
        context.statistics = statistics
        log_info(f"统计完成: 文章 {total_articles} 篇, 总字数 {total_word_count}, 作品 {len(works)} 个")

    # ---------- RSS ----------
    def _generate_rss(self, context: BuildContext) -> None:
        from xml.sax.saxutils import escape as xml_escape

        config = load_json(PROJECT_ROOT / "rss_config.json", {})
        site = config.get("site", {
            "title": "高新炀的个人网站",
            "link": "https://gxy.cn.mt",
            "description": "学生 · 开发者 · 写作者",
            "language": "zh-CN",
            "generator": "AggregatedGenerator"
        })
        base_url = site.get("link", "https://gxy.cn.mt").rstrip('/')

        def parse_date_rfc822(date_str):
            if not date_str or date_str == "未指定日期":
                return None
            try:
                from dateutil import parser
                dt = parser.parse(date_str, fuzzy=True)
                return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
            except:
                formats = ["%Y-%m-%d", "%Y年%m月%d日", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d"]
                for fmt in formats:
                    try:
                        dt = datetime.strptime(date_str, fmt)
                        if fmt in ("%Y-%m-%d", "%Y年%m月%d日", "%Y/%m/%d"):
                            return dt.strftime("%a, %d %b %Y 00:00:00 GMT")
                        else:
                            return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
                    except:
                        continue
            return None

        items = []
        for art in context.articles:
            if art.hidden:
                continue
            pub = parse_date_rfc822(art.date)
            if not pub:
                continue
            link = base_url + art.url
            items.append({
                "title": art.title,
                "link": link,
                "description": art.description,
                "pubDate": pub,
                "author": art.author,
                "categories": art.tags
            })
        for w in context.works:
            pub = parse_date_rfc822(w.date)
            if not pub:
                continue
            link = w.link if w.link.startswith(('http://','https://')) else base_url + w.link
            items.append({
                "title": w.title,
                "link": link,
                "description": w.description,
                "pubDate": pub,
                "author": w.author,
                "categories": w.tag
            })

        items.sort(key=lambda x: x["pubDate"], reverse=True)
        max_items = config.get("filters", {}).get("max_items")
        if max_items and len(items) > max_items:
            items = items[:max_items]

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
            '  <channel>',
            f'    <title>{xml_escape(site["title"])}</title>',
            f'    <link>{xml_escape(base_url)}</link>',
            f'    <description>{xml_escape(site["description"])}</description>',
            f'    <lastBuildDate>{datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")}</lastBuildDate>',
            f'    <language>{xml_escape(site["language"])}</language>',
            f'    <generator>{xml_escape(site["generator"])}</generator>',
            f'    <atom:link href="{base_url}/rss.xml" rel="self" type="application/rss+xml" />'
        ]
        for it in items:
            lines.append('    <item>')
            lines.append(f'      <title>{xml_escape(it["title"])}</title>')
            lines.append(f'      <link>{xml_escape(it["link"])}</link>')
            lines.append(f'      <description><![CDATA[{it["description"]}]]></description>')
            lines.append(f'      <pubDate>{it["pubDate"]}</pubDate>')
            if it["author"]:
                lines.append(f'      <author>{xml_escape(it["author"])}</author>')
            for cat in it["categories"]:
                if cat:
                    lines.append(f'      <category>{xml_escape(cat)}</category>')
            lines.append('    </item>')
        lines.append('  </channel>')
        lines.append('</rss>')
        with open(RSS_OUTPUT, 'w', encoding='utf-8') as f:
            f.write("\n".join(lines))
        log_info(f"RSS 生成成功 ({len(items)} 条)")

    # ---------- 站点地图 ----------
    def _generate_sitemap(self, context: BuildContext) -> None:
        base_url = "https://gxy.cn.mt"
        urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        added = set()

        def add_url(loc, lastmod, changefreq="weekly", priority="0.5"):
            if loc in added:
                return
            added.add(loc)
            elem = ET.SubElement(urlset, "url")
            ET.SubElement(elem, "loc").text = loc
            ET.SubElement(elem, "lastmod").text = lastmod
            ET.SubElement(elem, "changefreq").text = changefreq
            ET.SubElement(elem, "priority").text = priority

        # 文章
        for art in context.articles:
            if art.hidden:
                continue
            lastmod = art.last_updated if art.last_updated else art.date
            if lastmod == "未指定日期":
                lastmod = get_current_date_iso()
            add_url(base_url + art.url, lastmod[:10], "weekly", "0.9")

        # 固定页面（干净 URL）—— 已改为 /articles/ 和 /works/
        default_pages = {
            "/": {"changefreq": "weekly", "priority": "1.0"},
            "/about/": {"changefreq": "weekly", "priority": "0.8"},
            "/articles/": {"changefreq": "daily", "priority": "0.9"},
            "/works/": {"changefreq": "weekly", "priority": "0.8"},
            "/archive/": {"changefreq": "weekly", "priority": "0.7"},
            "/stats/": {"changefreq": "weekly", "priority": "0.6"},
            "/settings/": {"changefreq": "monthly", "priority": "0.5"},
            "/contact/": {"changefreq": "monthly", "priority": "0.5"},
            "/friends/": {"changefreq": "weekly", "priority": "0.7"},
            "/rss.xml": {"changefreq": "daily", "priority": "0.5"},
            "/sitemap.xml": {"changefreq": "monthly", "priority": "0.3"},
        }
        for rel, cfg in default_pages.items():
            add_url(base_url + rel, get_current_date_iso(), cfg["changefreq"], cfg["priority"])

        xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(urlset, encoding="unicode", method="xml")
        with open(SITEMAP_OUTPUT, 'w', encoding='utf-8') as f:
            f.write(xml_str)
        log_info(f"站点地图生成成功 ({len(added)} 个 URL)")

    # ---------- 文章列表页 ----------
    def _generate_articles_page(self, context: BuildContext) -> None:
        articles = [a for a in context.articles if not a.hidden]
        html_content = self._render_list_page(
            items=articles,
            title="文章",
            desc="这里有一些随便写的作文、技术博客……",
            type_name="article",
            json_key="__STATIC_ARTICLES_DATA"
        )
        ARTICLES_LIST_HTML.parent.mkdir(parents=True, exist_ok=True)
        with open(ARTICLES_LIST_HTML, 'w', encoding='utf-8') as f:
            f.write(html_content)
        log_info(f"文章列表页生成: {ARTICLES_LIST_HTML}")

    # ---------- 作品列表页 ----------
    def _generate_works_page(self, context: BuildContext) -> None:
        works = context.works
        work_dicts = [{"title": w.title, "description": w.description, "date": w.date,
                      "tags": w.tag, "link": w.link, "author": w.author} for w in works]
        html_content = self._render_list_page(
            items=work_dicts,
            title="作品",
            desc="这里有一些我做的东西（可能有些稀奇古怪的小玩意？）",
            type_name="work",
            json_key="__STATIC_WORKS_DATA",
            is_work=True
        )
        WORKS_LIST_HTML.parent.mkdir(parents=True, exist_ok=True)
        with open(WORKS_LIST_HTML, 'w', encoding='utf-8') as f:
            f.write(html_content)
        log_info(f"作品列表页生成: {WORKS_LIST_HTML}")

    def _render_list_page(self, items, title, desc, type_name, json_key, is_work=False):
        tag_counter = Counter()
        for item in items:
            tags = item.get("tags", []) if isinstance(item, dict) else item.tags
            for t in tags:
                if t:
                    tag_counter[t] += 1
        tags_html = ""
        if tag_counter:
            sorted_tags = sorted(tag_counter.items(), key=lambda x: x[0])
            btns = [f'<button type="button" class="tag-button" data-tag="{escape(tag)}">{escape(tag)} ({cnt})</button>' for tag, cnt in sorted_tags]
            clear_btn = '<button type="button" class="tag-button" style="margin-left: auto;">清除筛选</button>'
            tags_html = f'''
            <div id="{type_name}s-tags-filter" class="tags-filter">
                <span class="filter-label">按标签筛选:</span>
                {''.join(btns)}
                {clear_btn}
            </div>
            '''

        list_html = ""
        if not items:
            list_html = f'<div class="{type_name}s-list"><p>暂无{title}，敬请期待～</p></div>'
        else:
            list_items = []
            for idx, item in enumerate(items):
                if isinstance(item, dict):
                    t = item.get("title", "无标题")
                    url = item.get("url", "#")
                    desc_text = item.get("description", "暂无描述")
                    date = format_date_iso(item.get("date", ""))
                    tags = item.get("tags", [])
                    author = item.get("author", "")
                    word_count = item.get("word_count", 0)
                    read_time = item.get("read_time", "")
                else:
                    t = item.title
                    url = item.url
                    desc_text = item.description
                    date = format_date_iso(item.date)
                    tags = item.tags
                    author = item.author
                    word_count = item.word_count
                    read_time = item.read_time

                if is_work:
                    work_info = {"title": t, "description": desc_text, "link": item.get("link", "#"), "tags": tags}
                    work_info_str = json.dumps(work_info, ensure_ascii=False)
                    list_items.append(f'''
                    <div class="list-item" data-work-info="{escape(work_info_str)}" data-type="{type_name}" data-index="{idx}">
                        <div class="list-item-header"><h3 class="list-item-title">{escape(t)}</h3><div class="list-item-meta"><span class="list-item-date">{date}</span></div></div>
                        <p class="list-item-description">{escape(desc_text)}</p>
                        <div class="tags">{"".join(f'<span class="tag">{escape(tag)}</span>' for tag in tags)}</div>
                    </div>
                    ''')
                else:
                    publish_html = f'<span class="publish-date">发布于 {date}</span>' if date else ''
                    meta_html = f'''
                    <div class="article-meta-info">
                        <span class="article-author">{escape(author)}</span>
                        {f'<span class="article-word-count">{word_count} 字</span>' if word_count else ''}
                        {f'<span class="article-read-time"><i class="far fa-clock"></i> {escape(read_time)}</span>' if read_time else ''}
                    </div>
                    '''
                    list_items.append(f'''
                    <div class="list-item" data-url="{url}" data-type="{type_name}" data-index="{idx}">
                        <div class="list-item-header">
                            <h3 class="list-item-title"><a href="{url}">{escape(t)}</a></h3>
                            <div class="article-dates-top-right">{publish_html}</div>
                        </div>
                        {meta_html}
                        <p class="list-item-description">{escape(desc_text)}</p>
                        <div class="tags">{"".join(f'<span class="tag">{escape(tag)}</span>' for tag in tags)}</div>
                    </div>
                    ''')
            list_html = f'<div class="{type_name}s-list">{"".join(list_items)}</div>'

        json_str = json.dumps(items, ensure_ascii=False, default=lambda o: o.__dict__ if hasattr(o, '__dict__') else str(o))
        return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>{title} - 高新炀的小站</title>
<link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/pages/friends.css"><link rel="stylesheet" href="/css/components/comments.css"></head>
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
                <h2>{title}</h2>
                <p>{desc}</p>
                <div id="search-container"><input type="text" id="search-input" placeholder="搜索{title}..."><select id="search-field"><option value="all">全部</option><option value="title">标题</option><option value="tag">标签</option><option value="date">日期</option></select></div>
                {tags_html}
                <div class="sort-controls"><label for="sort-order">排序方式：</label><select id="sort-order"><option value="updated_asc">按更新时间升序</option><option value="updated_desc" selected>按更新时间降序</option><option value="wordcount_asc">按字数升序</option><option value="wordcount_desc">按字数降序</option><option value="date_asc">按发布日期升序</option><option value="date_desc">按发布日期降序</option></select></div>
                <div id="{type_name}s-list-container">{list_html}</div>
            </div>
        </main>
    </div>
</div>
<div id="footer-placeholder"></div>
<script>window.{json_key} = {json_str};</script>
<script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
<script src="/js/vendor/busuanzi.min.js" defer></script>
<script src="/js/entry/main.js" type="module"></script>
</body></html>'''

    # ---------- 无JS索引页 ----------
    def _generate_nojs_index(self, context: BuildContext) -> None:
        articles = [a for a in context.articles if not a.hidden]
        works = context.works
        friends = context.friends

        stats = {
            "total_articles": len(articles),
            "total_word_count": sum(a.word_count for a in articles),
            "total_works": len(works),
            "total_authors": len(set(a.author for a in articles if a.author) | set(w.author for w in works if w.author)),
            "last_updated": context.statistics.get("last_updated", get_current_date_iso()) if context.statistics else get_current_date_iso()
        }

        def render_articles():
            if not articles:
                return '<p>暂无文章。</p>'
            items = []
            for a in articles[:20]:
                tags_html = ''.join(f'<span class="tag">{escape(tag)}</span>' for tag in a.tags) if a.tags else ''
                items.append(f'''
                <div class="article-item">
                    <h3 class="item-title"><a href="{a.url}">{escape(a.title)}</a></h3>
                    <div class="item-meta"><span>日期：{a.date}</span><span>字数：{a.word_count}</span></div>
                    <p class="item-desc">{escape(a.description)}</p>
                    {f'<div class="tags">{tags_html}</div>' if tags_html else ''}
                </div>
                ''')
            return ''.join(items)

        def render_works():
            if not works:
                return '<p>暂无作品。</p>'
            items = []
            for w in works[:10]:
                tags_html = ''.join(f'<span class="tag">{escape(tag)}</span>' for tag in w.tag) if w.tag else ''
                items.append(f'''
                <div class="work-item">
                    <h3 class="item-title"><a href="{w.link}">{escape(w.title)}</a></h3>
                    <div class="item-meta"><span>日期：{w.date}</span></div>
                    <p class="item-desc">{escape(w.description)}</p>
                    {f'<div class="tags">{tags_html}</div>' if tags_html else ''}
                </div>
                ''')
            return ''.join(items)

        def render_friends():
            if not friends:
                return ''
            cards = []
            for f in friends:
                cards.append(f'''
                <a href="{f.link}" class="friend-card" target="_blank" rel="noopener noreferrer">
                    <div class="friend-name">{escape(f.name)}</div>
                    <p class="friend-desc">{escape(f.desc)}</p>
                    <div class="friend-url">{escape(f.link)}</div>
                </a>
                ''')
            return f'<div class="friends-grid">{"".join(cards)}</div>'

        html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>高新炀的小站 · 静态镜像</title>
<link rel="stylesheet" href="/css/main.css">
<style>
.nojs-alert {{ background: var(--accent-color,#b45b63); color: white; text-align: center; padding: 8px; }}
.section-header {{ margin-top: 2rem; border-bottom: 2px solid var(--accent-color,#b45b63); display: inline-block; }}
.article-item, .work-item {{ margin-bottom: 1.8rem; border-bottom: 1px solid var(--border-color,#e8e2db); }}
.item-title {{ font-size: 1.3rem; margin: 0; }}
.item-title a {{ text-decoration: none; color: var(--accent-color,#b45b63); }}
.item-meta {{ font-size: 0.85rem; color: var(--text-secondary,#6b6b6b); display: flex; gap: 1rem; }}
.tags {{ display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }}
.tag {{ background: var(--tag-bg,#f0ebe5); padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; }}
.friends-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap: 1.2rem; }}
.friend-card {{ background: var(--surface-color-secondary,#f5f2ef); border: 1px solid var(--border-color,#e8e2db); border-radius: 16px; padding: 1rem; text-decoration: none; color: var(--text-color,#2c2c2c); }}
.friend-name {{ font-weight: 600; }}
.stats-row {{ display: flex; gap: 1.5rem; background: var(--surface-color-secondary,#f5f2ef); padding: 1rem; border-radius: 20px; }}
.stat-number {{ font-size: 2rem; font-weight: 700; color: var(--accent-color,#b45b63); }}
</style>
</head>
<body>
<div class="nojs-alert">[静态模式] 全部内容可直接访问。 <a href="/" style="color:white;">点击进入主站</a>。</div>
<nav style="max-width:1280px;margin:1rem auto 0;padding:0 20px;">
    <a href="/" style="margin-right:1.5rem;">[首页]</a>
    <a href="/articles/" style="margin-right:1.5rem;">[文章]</a>
    <a href="/works/" style="margin-right:1.5rem;">[作品]</a>
    <a href="/friends/" style="margin-right:1.5rem;">[友链]</a>
</nav>
<main class="container" style="margin-top:1rem;">
    <h1>高新炀的小站 · 静态镜像</h1>
    <div class="stats-row">
        <div><div class="stat-number">{stats["total_articles"]}</div><div>文章</div></div>
        <div><div class="stat-number">{stats["total_word_count"]:,}</div><div>总字数</div></div>
        <div><div class="stat-number">{stats["total_works"]}</div><div>作品</div></div>
    </div>
    <p>最后更新：{stats["last_updated"]}</p>

    <h2 class="section-header">[文章]</h2>
    {render_articles()}
    <h2 class="section-header">[作品]</h2>
    {render_works()}
    <h2 class="section-header">[友情链接]</h2>
    {render_friends()}
</main>
<footer style="margin-top:3rem;text-align:center;border-top:1px solid var(--border-color,#e8e2db);padding-top:1.5rem;">
    <p>© {datetime.now().year} 高新炀 · 静态镜像，无需 JavaScript</p>
</footer>
</body>
</html>'''
        with open(NOJS_HTML, 'w', encoding='utf-8') as f:
            f.write(html)
        log_info(f"无JS索引页生成: {NOJS_HTML}")

    # ---------- 复制静态资源 ----------
    def _copy_static_assets(self):
        # ---------- 1. 调用 Vite 构建 TypeScript ----------
        try:
            result = subprocess.run(
                ["npm", "run", "build"],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                encoding='utf-8',
                shell=True
            )
            if result.returncode != 0:
                log_error(f"Vite 构建失败 (返回码 {result.returncode})")
                log_error(f"stdout: {result.stdout}")
                log_error(f"stderr: {result.stderr}")
                raise RuntimeError("前端 TypeScript 编译失败")
            log_info("Vite 构建完成 (TypeScript -> JavaScript)")
        except FileNotFoundError:
            log_warning("未找到 npm，请确保 Node.js 已安装。跳过 TypeScript 编译。")
            if JS_SRC_DIR.exists():
                shutil.copytree(JS_SRC_DIR, JS_DIST_DIR, dirs_exist_ok=True)
                log_info("回退：直接复制 JS 文件")

        # ---------- 2. 复制所有未被 Vite 处理的 .js 文件（不覆盖已存在的） ----------
        if JS_SRC_DIR.exists():
            for js_file in JS_SRC_DIR.rglob("*.js"):
                rel_path = js_file.relative_to(JS_SRC_DIR)
                dst_file = JS_DIST_DIR / rel_path
                if not dst_file.exists():
                    dst_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(js_file, dst_file)
                    log_info(f"复制额外 JS: {rel_path}")

        # ---------- 3. 压缩并复制 CSS ----------
        if CSS_SRC_DIR.exists():
            for css_file in CSS_SRC_DIR.rglob("*.css"):
                rel_path = css_file.relative_to(CSS_SRC_DIR)
                dst_file = CSS_DIST_DIR / rel_path
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                with open(css_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                try:
                    minified = cssmin(content)
                except Exception as e:
                    log_warning(f"压缩 CSS 失败 {rel_path}: {e}，使用原内容")
                    minified = content
                with open(dst_file, 'w', encoding='utf-8') as f:
                    f.write(minified)
                log_info(f"压缩 CSS: {rel_path}")
            log_info("CSS 压缩完成")
        else:
            log_warning(f"CSS 源目录不存在: {CSS_SRC_DIR}")

        # ---------- 4. 复制 assets 素材（排除 source, avatars, 网站更新日志.md, js, css） ----------
        if ASSETS_DIR.exists():
            shutil.copytree(
                ASSETS_DIR,
                ASSETS_DIST_DIR,
                dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('source', 'avatars', '网站更新日志.md', 'js', 'css')
            )
            log_info("复制 assets 素材完成（排除 source, avatars, 网站更新日志.md, js, css）")
        else:
            log_warning(f"assets 源目录不存在: {ASSETS_DIR}")

        # ---------- 5. 复制 favicon ----------
        favicon = PROJECT_ROOT / "favicon.ico"
        if favicon.exists():
            shutil.copy(favicon, DIST_ROOT / "favicon.ico")
            log_info("复制 favicon.ico")

        # ---------- 6. 复制 works 目录（包含作品静态资源） ----------
        works_src = SRC_ROOT / "works"
        works_dst = DIST_ROOT / "works"
        if works_src.exists():
            def ignore_metadata(dirname, filenames):
                return ['metadata.json'] if 'metadata.json' in filenames else []
            shutil.copytree(works_src, works_dst, dirs_exist_ok=True, ignore=ignore_metadata)
            log_info("复制 works 目录（排除 metadata.json）")
        else:
            log_warning(f"works 源目录不存在: {works_src}")

    # ---------- 生成子目录页面 ----------
    def _generate_subdir_pages(self, context: BuildContext):
        index_template = TEMPLATES_DIR / "index.html"
        if index_template.exists():
            shutil.copy(index_template, DIST_ROOT / "index.html")
            log_info("复制 index.html 到 dist/")
        else:
            log_error("index.html 模板缺失")

        for template_name, subdir in PAGE_TEMPLATES.items():
            template_path = TEMPLATES_DIR / template_name
            if not template_path.exists():
                log_warning(f"模板 {template_name} 不存在，跳过")
                continue
            target_dir = DIST_ROOT / subdir
            target_dir.mkdir(parents=True, exist_ok=True)
            target_file = target_dir / "index.html"
            shutil.copy(template_path, target_file)
            log_info(f"生成 {subdir}/index.html 从 {template_name}")

        src_404 = TEMPLATES_DIR / "404.html"
        if src_404.exists():
            shutil.copy(src_404, DIST_ROOT / "404.html")
            log_info("复制 404.html 到 dist/")

        for fragment in ["navbar.html", "footer.html"]:
            src = TEMPLATES_DIR / fragment
            if src.exists():
                shutil.copy(src, DIST_ROOT / fragment)
                log_info(f"复制 {fragment} 到 dist/")