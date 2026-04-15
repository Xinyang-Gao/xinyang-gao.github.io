#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
RSS 生成器
从 articles.json 和 works.json 读取数据，生成 rss.xml
支持配置是否包含文章/作品，不进行“隐藏”标签过滤，最新内容优先排列
"""

import json
import os
import sys
from datetime import datetime
from typing import List, Dict, Any, Optional
from xml.sax.saxutils import escape

# =====================================================================
SITE_TITLE = "高新炀的个人网站"
SITE_LINK = "https://xinyang-gao.github.io"
SITE_DESCRIPTION = "学生 · 开发者 · 写作者，用代码和文字探索世界"

INCLUDE_ARTICLES = True
INCLUDE_WORKS = True
# =====================================================================


def parse_date_to_rfc822(date_str: str) -> Optional[str]:
    """
    将常见日期格式转换为 RFC 822 格式 (如 Mon, 07 Apr 2025 00:00:00 GMT)
    支持格式: YYYY-MM-DD, YYYY年MM月DD日
    若解析失败返回 None
    """
    if not date_str or date_str == "未指定日期":
        return None

    # 尝试解析 YYYY-MM-DD
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%a, %d %b %Y 00:00:00 GMT")
    except ValueError:
        pass

    # 尝试解析 YYYY年MM月DD日
    try:
        dt = datetime.strptime(date_str, "%Y年%m月%d日")
        return dt.strftime("%a, %d %b %Y 00:00:00 GMT")
    except ValueError:
        pass

    # 可继续添加其他格式，如无法解析则返回 None
    return None


def make_absolute_url(path: str) -> str:
    """将相对路径转换为绝对 URL，若已经是绝对路径则直接返回"""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    # 去除开头的 ./ 或 /
    if path.startswith("./"):
        path = path[1:]
    if not path.startswith("/"):
        path = "/" + path
    return SITE_LINK.rstrip("/") + path


def load_json_file(filepath: str) -> Optional[Dict[str, Any]]:
    """安全加载 JSON 文件，出错返回 None"""
    if not os.path.exists(filepath):
        print(f"警告: 文件 {filepath} 不存在，跳过", file=sys.stderr)
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"警告: 读取 {filepath} 失败 - {e}", file=sys.stderr)
        return None


def build_items() -> List[Dict[str, Any]]:
    """
    根据配置读取文章和作品，构建 RSS item 列表
    每个 item 包含 title, link, description, pubDate, author, categories
    """
    items = []

    # 处理文章
    if INCLUDE_ARTICLES:
        articles_data = load_json_file("articles.json")
        if articles_data and "articles" in articles_data:
            for article in articles_data["articles"]:
                # 必要字段检查
                title = article.get("title", "无标题")
                url = article.get("url", "")
                if not url:
                    continue
                link = make_absolute_url(url)

                description = article.get("description", "")
                author = article.get("author", "")
                date_str = article.get("date", "")
                tags = article.get("tags", [])

                pub_date = parse_date_to_rfc822(date_str)
                # 日期无效则跳过（不生成该条目）
                if pub_date is None:
                    print(f"信息: 文章 '{title}' 日期无效 ({date_str})，已跳过", file=sys.stderr)
                    continue

                items.append({
                    "title": title,
                    "link": link,
                    "description": description,
                    "pubDate": pub_date,
                    "author": author,
                    "categories": tags if isinstance(tags, list) else [],
                })
        else:
            print("未找到有效的 articles.json 数据", file=sys.stderr)

    # 处理作品
    if INCLUDE_WORKS:
        works_data = load_json_file("works.json")
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
                    print(f"信息: 作品 '{title}' 日期无效 ({date_str})，已跳过", file=sys.stderr)
                    continue

                items.append({
                    "title": title,
                    "link": link,
                    "description": description,
                    "pubDate": pub_date,
                    "author": author,
                    "categories": tags if isinstance(tags, list) else [],
                })
        else:
            print("未找到有效的 works.json 数据", file=sys.stderr)

    # 按日期降序排序（最新在前）
    items.sort(key=lambda x: x["pubDate"], reverse=True)
    return items


def generate_rss(items: List[Dict[str, Any]], output_path: str = "rss.xml") -> bool:
    """
    生成 RSS XML 文件
    返回是否成功
    """
    if not items:
        print("警告: 没有任何有效内容，将生成空 Feed", file=sys.stderr)

    # 计算 lastBuildDate（当前时间）
    last_build = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

    # 构建 XML 字符串
    xml_lines = []
    xml_lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    xml_lines.append('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    xml_lines.append('  <channel>')

    # Channel 基本信息
    xml_lines.append(f'    <title>{escape(SITE_TITLE)}</title>')
    xml_lines.append(f'    <link>{escape(SITE_LINK)}</link>')
    xml_lines.append(f'    <description>{escape(SITE_DESCRIPTION)}</description>')
    xml_lines.append(f'    <lastBuildDate>{last_build}</lastBuildDate>')
    xml_lines.append('    <language>zh-CN</language>')
    xml_lines.append(f'    <generator>RssGenerator (Python)</generator>')
    # 添加 atom:link 便于自发现
    xml_lines.append(f'    <atom:link href="{SITE_LINK}/rss.xml" rel="self" type="application/rss+xml" />')

    # 每个 item
    for item in items:
        xml_lines.append('    <item>')
        xml_lines.append(f'      <title>{escape(item["title"])}</title>')
        xml_lines.append(f'      <link>{escape(item["link"])}</link>')
        # description 可能包含 HTML，放入 CDATA
        desc = item["description"] or ""
        xml_lines.append(f'      <description><![CDATA[{desc}]]></description>')
        xml_lines.append(f'      <pubDate>{item["pubDate"]}</pubDate>')
        if item["author"]:
            xml_lines.append(f'      <author>{escape(item["author"])}</author>')
        # 添加分类 (category)
        for cat in item["categories"]:
            if cat:
                xml_lines.append(f'      <category>{escape(cat)}</category>')
        xml_lines.append('    </item>')

    xml_lines.append('  </channel>')
    xml_lines.append('</rss>')

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(xml_lines))
        print(f"成功生成 RSS Feed: {output_path}")
        return True
    except OSError as e:
        print(f"错误: 无法写入 {output_path} - {e}", file=sys.stderr)
        return False


def main():
    print("=" * 50)
    print("RSS Feed 生成器")
    print("=" * 50)
    print(f"包含文章: {INCLUDE_ARTICLES}")
    print(f"包含作品: {INCLUDE_WORKS}")
    print("-" * 50)

    items = build_items()
    print(f"共收集到 {len(items)} 个有效条目（已按日期降序排列）")

    if generate_rss(items):
        print("完成！")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()