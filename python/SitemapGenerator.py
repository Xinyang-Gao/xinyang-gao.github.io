#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_warning, log_error,
    load_json, get_current_date_iso
)

BASE_URL = "https://xinyang-gao.github.io"
OUTPUT_SITEMAP = PROJECT_ROOT / "sitemap.xml"
EXCLUDED_HTML = {"navbar.html", "footer.html", "404.html"}
EXCLUDE_PREFIX = ("_",)
DEFAULT_PAGE_CONFIG = {
    "/index.html": {"changefreq": "weekly", "priority": "1.0"},
    "/about.html": {"changefreq": "weekly", "priority": "0.8"},
    "/articles.html": {"changefreq": "daily", "priority": "0.9"},
    "/archive.html": {"changefreq": "weekly", "priority": "0.8"},
    "/works.html": {"changefreq": "weekly", "priority": "0.8"},
    "/friends.html": {"changefreq": "weekly", "priority": "0.7"},
    "/contact.html": {"changefreq": "weekly", "priority": "0.7"},
    "/rss.xml": {"changefreq": "daily", "priority": "0.5"},
}
ARTICLE_CHANGEFREQ = "weekly"
ARTICLE_PRIORITY = "0.9"

def format_lastmod(date_value) -> str:
    if not date_value:
        return get_current_date_iso()
    try:
        if "T" in date_value:
            dt = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        else:
            dt = datetime.strptime(str(date_value)[:10], "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return get_current_date_iso()

def get_file_lastmod(file_path: Path) -> str:
    try:
        mtime = file_path.stat().st_mtime
        return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
    except Exception:
        return get_current_date_iso()

def generate_sitemap(base_url: str = BASE_URL, output_path: Path = OUTPUT_SITEMAP) -> bool:
    base_url = base_url.rstrip('/')
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    added = set()

    # 文章
    articles_data = load_json(JSON_OUTPUT_DIR / "articles.json", {})
    articles = articles_data.get("articles", [])
    for art in articles:
        if art.get("hidden"):
            continue
        url_path = art.get("url")
        if not url_path:
            continue
        if not url_path.startswith("/"):
            url_path = "/" + url_path
        lastmod_raw = art.get("last_updated") or art.get("date")
        lastmod = format_lastmod(lastmod_raw)
        full = base_url + url_path
        added.add(full)
        elem = ET.SubElement(urlset, "url")
        ET.SubElement(elem, "loc").text = full
        ET.SubElement(elem, "lastmod").text = lastmod
        ET.SubElement(elem, "changefreq").text = ARTICLE_CHANGEFREQ
        ET.SubElement(elem, "priority").text = ARTICLE_PRIORITY
    log_info(f"已添加 {len([a for a in articles if not a.get('hidden')])} 篇文章")

    # 根目录 HTML 和 RSS
    for fp in PROJECT_ROOT.glob("*.html"):
        if fp.name in EXCLUDED_HTML or fp.name.startswith(EXCLUDE_PREFIX):
            continue
        rel = "/" + fp.relative_to(PROJECT_ROOT).as_posix()
        full = base_url + rel
        if full in added:
            continue
        added.add(full)
        lastmod = get_file_lastmod(fp)
        cfg = DEFAULT_PAGE_CONFIG.get(rel, {})
        changefreq = cfg.get("changefreq", "monthly")
        priority = cfg.get("priority", "0.5")
        loc = base_url + "/" if rel == "/index.html" else full
        elem = ET.SubElement(urlset, "url")
        ET.SubElement(elem, "loc").text = loc
        ET.SubElement(elem, "lastmod").text = lastmod
        ET.SubElement(elem, "changefreq").text = changefreq
        ET.SubElement(elem, "priority").text = priority

    rss_file = PROJECT_ROOT / "rss.xml"
    if rss_file.exists():
        rel = "/rss.xml"
        full = base_url + rel
        if full not in added:
            added.add(full)
            elem = ET.SubElement(urlset, "url")
            ET.SubElement(elem, "loc").text = full
            ET.SubElement(elem, "lastmod").text = get_file_lastmod(rss_file)
            ET.SubElement(elem, "changefreq").text = "daily"
            ET.SubElement(elem, "priority").text = "0.5"

    # 写入
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(urlset, encoding="unicode", method="xml")
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(xml_str)
        log_info(f"站点地图已生成: {output_path}，包含 {len(added)} 个 URL")
        return True
    except OSError as e:
        log_error(f"写入失败: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="生成站点地图 sitemap.xml")
    parser.add_argument("--base-url", default=BASE_URL, help="网站根地址")
    parser.add_argument("--output", default=str(OUTPUT_SITEMAP), help="输出路径")
    args = parser.parse_args()
    generate_sitemap(base_url=args.base_url, output_path=Path(args.output))

if __name__ == "__main__":
    main()