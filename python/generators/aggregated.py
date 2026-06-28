#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
聚合生成器：一次性生成统计 JSON、RSS、站点地图、文章列表页、作品列表页、无JS索引。
所有生成共享一次加载的数据，减少 I/O。
"""

import json
import sys
from pathlib import Path
from html import escape
from datetime import datetime
from collections import Counter
from xml.etree import ElementTree as ET

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_warning, log_error,
    load_json, save_json, format_date, format_date_iso,
    get_current_date_iso, get_current_datetime_iso,
    compute_content_hash
)
from build_context import BuildContext
from generators.base import OutputGenerator

# 输出路径
RSS_OUTPUT = PROJECT_ROOT / "rss.xml"
SITEMAP_OUTPUT = PROJECT_ROOT / "sitemap.xml"
ARTICLES_HTML = PROJECT_ROOT / "articles.html"
WORKS_HTML = PROJECT_ROOT / "works.html"
NOJS_HTML = PROJECT_ROOT / "nojs.html"
STATISTICS_JSON = JSON_OUTPUT_DIR / "statistics.json"

class AggregatedGenerator(OutputGenerator):
    name = "aggregated"
    inputs = {"articles", "works", "friends", "version"}
    outputs = [
        RSS_OUTPUT, SITEMAP_OUTPUT, ARTICLES_HTML, WORKS_HTML, NOJS_HTML, STATISTICS_JSON
    ]

    def generate(self, context: BuildContext, force: bool) -> bool:
        log_info("开始聚合生成...")
        try:
            self._build_statistics(context)
            self._generate_rss(context)
            self._generate_sitemap(context)
            self._generate_articles_page(context)
            self._generate_works_page(context)
            self._generate_nojs_index(context)
            log_info("聚合生成完成")
            return True
        except Exception as e:
            log_error(f"聚合生成失败: {e}")
            return False

    # ---------- 统计 ----------
    def _build_statistics(self, context: BuildContext) -> None:
        articles = [a for a in context.articles if not a.hidden]
        works = context.works

        # 日期统计
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

        # 版本号
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
        # 存入 context 供其他生成器使用（虽然本聚合内不用）
        context.statistics = statistics
        log_info(f"统计完成: 文章 {total_articles} 篇, 总字数 {total_word_count}, 作品 {len(works)} 个")

    # ---------- RSS ----------
    def _generate_rss(self, context: BuildContext) -> None:
        from xml.sax.saxutils import escape as xml_escape
        from common import load_json

        config = load_json(Path(__file__).parent.parent / "rss_config.json", {})
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

        # 排序
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

        # 固定页面
        default_pages = {
            "/": {"changefreq": "weekly", "priority": "1.0"},
            "/about.html": {"changefreq": "weekly", "priority": "0.8"},
            "/articles.html": {"changefreq": "daily", "priority": "0.9"},
            "/works.html": {"changefreq": "weekly", "priority": "0.8"},
            "/friends.html": {"changefreq": "weekly", "priority": "0.7"},
            "/rss.xml": {"changefreq": "daily", "priority": "0.5"},
        }
        for rel, cfg in default_pages.items():
            add_url(base_url + rel, get_current_date_iso(), cfg["changefreq"], cfg["priority"])

        # 其他根目录 HTML
        for fp in PROJECT_ROOT.glob("*.html"):
            if fp.name in {"navbar.html", "footer.html", "404.html"} or fp.name.startswith("_"):
                continue
            rel = "/" + fp.relative_to(PROJECT_ROOT).as_posix()
            if rel in default_pages or rel.startswith("/articles/"):  # 已处理
                continue
            if rel == "/index.html":
                rel = "/"
            add_url(base_url + rel, get_current_date_iso(), "monthly", "0.5")

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
        with open(ARTICLES_HTML, 'w', encoding='utf-8') as f:
            f.write(html_content)
        log_info(f"文章列表页生成: {ARTICLES_HTML}")

    # ---------- 作品列表页 ----------
    def _generate_works_page(self, context: BuildContext) -> None:
        works = context.works
        # 转为类似字典以便模板使用
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
        with open(WORKS_HTML, 'w', encoding='utf-8') as f:
            f.write(html_content)
        log_info(f"作品列表页生成: {WORKS_HTML}")

    def _render_list_page(self, items, title, desc, type_name, json_key, is_work=False):
        # 生成标签过滤
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

        # 生成列表项
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
                    # 作品卡片
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
                    # 文章卡片
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

        # 完整 HTML
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
            for a in articles[:20]:  # 只显示最近20篇
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
    <a href="/articles.html" style="margin-right:1.5rem;">[文章]</a>
    <a href="/works.html" style="margin-right:1.5rem;">[作品]</a>
    <a href="/friends.html" style="margin-right:1.5rem;">[友链]</a>
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