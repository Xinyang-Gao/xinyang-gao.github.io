#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from xml.sax.saxutils import escape

# ========== 网站配置 ==========
SITE_TITLE = "高新炀的个人网站"
SITE_LINK = "https://xinyang-gao.github.io"
SITE_DESCRIPTION = "学生 · 开发者 · 写作者，用代码和文字探索世界"

INCLUDE_ARTICLES = True
INCLUDE_WORKS = True

# ========== 统一日志函数 ==========
def log_info(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}")

def log_warning(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [WARNING] {msg}")

def log_error(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}")

# ========== 路径配置 ==========
PROJECT_ROOT = Path(__file__).parent.parent
JSON_DIR = PROJECT_ROOT / "json"
OUTPUT_RSS = PROJECT_ROOT / "rss.xml"   # 输出到根目录

def parse_date_to_rfc822(date_str: str) -> Optional[str]:
    """转换日期格式为 RFC 822"""
    if not date_str or date_str == "未指定日期":
        return None
    for fmt in ("%Y-%m-%d", "%Y年%m月%d日"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%a, %d %b %Y 00:00:00 GMT")
        except ValueError:
            continue
    return None

def make_absolute_url(path: str) -> str:
    if path.startswith(("http://", "https://")):
        return path
    if path.startswith("./"):
        path = path[1:]
    if not path.startswith("/"):
        path = "/" + path
    return SITE_LINK.rstrip("/") + path

def load_json_file(filepath: Path) -> Optional[Dict[str, Any]]:
    if not filepath.exists():
        log_warning(f"文件不存在: {filepath}")
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log_error(f"读取 {filepath} 失败: {e}")
        return None

def build_items() -> List[Dict[str, Any]]:
    items = []

    if INCLUDE_ARTICLES:
        articles_data = load_json_file(JSON_DIR / "articles.json")
        if articles_data and "articles" in articles_data:
            for art in articles_data["articles"]:
                title = art.get("title", "无标题")
                url = art.get("url")
                if not url:
                    continue
                link = make_absolute_url(url)
                description = art.get("description", "")
                author = art.get("author", "")
                date_str = art.get("date", "")
                tags = art.get("tags", [])
                pub_date = parse_date_to_rfc822(date_str)
                if pub_date is None:
                    log_warning(f"文章 '{title}' 日期无效 ({date_str})，跳过")
                    continue
                items.append({
                    "title": title, "link": link, "description": description,
                    "pubDate": pub_date, "author": author, "categories": tags if isinstance(tags, list) else []
                })
        else:
            log_warning("未找到有效的 articles.json 数据")

    if INCLUDE_WORKS:
        works_data = load_json_file(JSON_DIR / "works.json")
        if works_data and "works" in works_data:
            for work in works_data["works"]:
                title = work.get("title", "无标题")
                link_raw = work.get("link", "")
                if not link_raw:
                    continue
                link = make_absolute_url(link_raw)
                description = work.get("description", "")
                author = work.get("author", "")
                date_str = work.get("date", "")
                tags = work.get("tag", [])
                pub_date = parse_date_to_rfc822(date_str)
                if pub_date is None:
                    log_warning(f"作品 '{title}' 日期无效 ({date_str})，跳过")
                    continue
                items.append({
                    "title": title, "link": link, "description": description,
                    "pubDate": pub_date, "author": author, "categories": tags if isinstance(tags, list) else []
                })
        else:
            log_warning("未找到有效的 works.json 数据")

    items.sort(key=lambda x: x["pubDate"], reverse=True)
    return items

def generate_rss(items: List[Dict[str, Any]], output_path: Path) -> bool:
    if not items:
        log_warning("没有任何有效内容，将生成空 Feed")

    last_build = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        f'    <title>{escape(SITE_TITLE)}</title>',
        f'    <link>{escape(SITE_LINK)}</link>',
        f'    <description>{escape(SITE_DESCRIPTION)}</description>',
        f'    <lastBuildDate>{last_build}</lastBuildDate>',
        '    <language>zh-CN</language>',
        '    <generator>RssGenerator (Python)</generator>',
        f'    <atom:link href="{SITE_LINK}/rss.xml" rel="self" type="application/rss+xml" />'
    ]

    for item in items:
        xml_lines.append('    <item>')
        xml_lines.append(f'      <title>{escape(item["title"])}</title>')
        xml_lines.append(f'      <link>{escape(item["link"])}</link>')
        desc = item["description"] or ""
        xml_lines.append(f'      <description><![CDATA[{desc}]]></description>')
        xml_lines.append(f'      <pubDate>{item["pubDate"]}</pubDate>')
        if item["author"]:
            xml_lines.append(f'      <author>{escape(item["author"])}</author>')
        for cat in item["categories"]:
            if cat:
                xml_lines.append(f'      <category>{escape(cat)}</category>')
        xml_lines.append('    </item>')

    xml_lines.append('  </channel>')
    xml_lines.append('</rss>')

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(xml_lines))
        log_info(f"成功生成 RSS Feed: {output_path}")
        return True
    except OSError as e:
        log_error(f"无法写入 {output_path}: {e}")
        return False

def main():
    print("=" * 60)
    log_info("RSS Feed 生成器启动")
    print("=" * 60)
    log_info(f"包含文章: {INCLUDE_ARTICLES}, 包含作品: {INCLUDE_WORKS}")
    print("-" * 40)

    items = build_items()
    log_info(f"共收集到 {len(items)} 个有效条目（已按日期降序排列）")

    if generate_rss(items, OUTPUT_RSS):
        log_info("RSS 生成完成")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()