#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import logging
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from xml.sax.saxutils import escape

try:
    from dateutil import parser as date_parser
    HAS_DATEUTIL = True
except ImportError:
    HAS_DATEUTIL = False

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_warning, log_error,
    load_json, get_current_datetime_iso, get_current_date_iso
)

DEFAULT_CONFIG = {
    "site": {
        "title": "高新炀的个人网站",
        "link": "https://gxy.cn.mt",
        "description": "学生 · 开发者 · 写作者，用代码和文字探索世界",
        "language": "zh-CN",
        "generator": "RssGenerator (Python)"
    },
    "paths": {
        "json_dir": "json",
        "output_rss": "rss.xml"
    },
    "include": {
        "articles": True,
        "works": False
    },
    "filters": {
        "skip_hidden": True,
        "min_date": None,
        "max_items": None
    }
}

def load_config(config_path: Path = None) -> Dict[str, Any]:
    if config_path is None:
        config_path = Path(__file__).parent / "rss_config.json"
    if config_path.exists():
        user = load_json(config_path, {})
        # 简单合并
        merged = DEFAULT_CONFIG.copy()
        for k, v in user.items():
            if k in merged and isinstance(merged[k], dict) and isinstance(v, dict):
                merged[k].update(v)
            else:
                merged[k] = v
        return merged
    return DEFAULT_CONFIG

def parse_date_to_rfc822(date_str: str) -> Optional[str]:
    if not date_str or date_str == "未指定日期":
        return None
    if HAS_DATEUTIL:
        try:
            dt = date_parser.parse(date_str, fuzzy=True)
            return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
        except Exception:
            pass
    formats = ["%Y-%m-%d", "%Y年%m月%d日", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d"]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            if fmt in ("%Y-%m-%d", "%Y年%m月%d日", "%Y/%m/%d"):
                return dt.strftime("%a, %d %b %Y 00:00:00 GMT")
            else:
                return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
        except ValueError:
            continue
    log_warning(f"无法解析日期: {date_str}")
    return None

def make_absolute_url(path: str, site_link: str) -> str:
    if path.startswith(("http://", "https://")):
        return path
    if path.startswith("./"):
        path = path[1:]
    if not path.startswith("/"):
        path = "/" + path
    return site_link.rstrip("/") + path

def build_items_from_list(data_key: str, source_file: Path, site_link: str,
                          skip_hidden: bool, date_min: Optional[str] = None) -> List[Dict]:
    items = []
    data = load_json(source_file, {})
    entries = data.get(data_key, []) if isinstance(data, dict) else []
    min_date_dt = datetime.strptime(date_min, "%Y-%m-%d") if date_min else None

    for entry in entries:
        if skip_hidden and entry.get("hidden", False):
            continue
        title = entry.get("title", "无标题")
        url = entry.get("url") or entry.get("link")
        if not url:
            log_warning(f"条目 '{title}' 缺少 URL，跳过")
            continue
        date_str = entry.get("date", "")
        pub_date = parse_date_to_rfc822(date_str)
        if pub_date is None:
            log_warning(f"条目 '{title}' 日期无效 ({date_str})，跳过")
            continue
        if min_date_dt:
            try:
                dt_parsed = datetime.strptime(date_str[:10], "%Y-%m-%d")
                if dt_parsed < min_date_dt:
                    continue
            except Exception:
                pass
        link = make_absolute_url(url, site_link)
        desc = entry.get("description", "")
        author = entry.get("author", "")
        tags = entry.get("tags", [])
        if not isinstance(tags, list):
            tags = [tags] if tags else []
        items.append({
            "title": title,
            "link": link,
            "description": desc,
            "pubDate": pub_date,
            "author": author,
            "categories": tags
        })
    return items

def generate_rss(items: List[Dict], config: Dict, output_path: Path) -> bool:
    items.sort(key=lambda x: x["pubDate"], reverse=True)
    max_items = config["filters"].get("max_items")
    if max_items and len(items) > max_items:
        items = items[:max_items]
        log_info(f"限制条目数为 {max_items}")

    site = config["site"]
    last_build = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        f'    <title>{escape(site["title"])}</title>',
        f'    <link>{escape(site["link"])}</link>',
        f'    <description>{escape(site["description"])}</description>',
        f'    <lastBuildDate>{last_build}</lastBuildDate>',
        f'    <language>{escape(site["language"])}</language>',
        f'    <generator>{escape(site["generator"])}</generator>',
        f'    <atom:link href="{site["link"]}/rss.xml" rel="self" type="application/rss+xml" />'
    ]
    for it in items:
        lines.append('    <item>')
        lines.append(f'      <title>{escape(it["title"])}</title>')
        lines.append(f'      <link>{escape(it["link"])}</link>')
        lines.append(f'      <description><![CDATA[{it["description"]}]]></description>')
        lines.append(f'      <pubDate>{it["pubDate"]}</pubDate>')
        if it["author"]:
            lines.append(f'      <author>{escape(it["author"])}</author>')
        for cat in it["categories"]:
            if cat:
                lines.append(f'      <category>{escape(cat)}</category>')
        lines.append('    </item>')
    lines.append('  </channel>')
    lines.append('</rss>')
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        log_info(f"成功生成 RSS Feed ({len(items)} 条): {output_path}")
        return True
    except OSError as e:
        log_error(f"无法写入 {output_path}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="RSS Feed 生成器")
    parser.add_argument("-c", "--config", help="配置文件路径 (JSON)")
    parser.add_argument("-v", "--verbose", action="store_true", help="显示调试信息")
    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=level, format='[%(asctime)s] [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    # 重定向 common 的日志级别
    from common import _logger
    _logger.setLevel(level)

    config = load_config(Path(args.config) if args.config else None)
    json_dir = PROJECT_ROOT / config["paths"]["json_dir"]
    output_file = PROJECT_ROOT / config["paths"]["output_rss"]

    log_info("RSS Feed 生成器启动")
    log_info(f"包含文章: {config['include']['articles']}, 包含作品: {config['include']['works']}")

    all_items = []
    filters = config["filters"]
    skip_hidden = filters.get("skip_hidden", True)
    date_min = filters.get("min_date")

    if config["include"]["articles"]:
        items = build_items_from_list(
            "articles", json_dir / "articles.json", config["site"]["link"],
            skip_hidden, date_min
        )
        all_items.extend(items)
        log_info(f"从 articles.json 加载 {len(items)} 条")
    if config["include"]["works"]:
        items = build_items_from_list(
            "works", json_dir / "works.json", config["site"]["link"],
            skip_hidden, date_min
        )
        all_items.extend(items)
        log_info(f"从 works.json 加载 {len(items)} 条")

    if not all_items:
        log_warning("没有收集到任何有效条目")
    else:
        log_info(f"共收集到 {len(all_items)} 个有效条目")

    if generate_rss(all_items, config, output_file):
        log_info("RSS 生成完成")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()