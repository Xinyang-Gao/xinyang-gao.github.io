#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SitemapGenerator.py - 生成站点地图 sitemap.xml

功能：
1. 从 articles.json 读取所有非隐藏文章，生成文章页面 URL
2. 扫描项目根目录下的 .html 文件（排除导航、页脚、404 等片段文件）
3. 生成符合 sitemap 协议的 XML 文件
4. 自动处理 URL 编码，支持自定义网站根地址
5. 可集成到 run.py 中自动化执行

使用方法：
    1. 修改下面的 BASE_URL 为你的实际网站根地址（如 https://xinyang-gao.github.io）
    2. 在项目根目录下运行：
        python python/SitemapGenerator.py
    3. 或者通过命令行指定根地址：
        python python/SitemapGenerator.py --base-url https://your-site.com

集成到 run.py：
    在 run.py 末尾添加类似代码：
        from SitemapGenerator import generate_sitemap
        generate_sitemap(base_url="https://your-site.com")
"""

import os
import sys
import json
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

# ---------------------------- 配置项（可按需修改） ----------------------------
# 网站根地址（末尾不要加斜杠）
BASE_URL = "https://xinyang-gao.github.io"

# 项目根目录（脚本位于 python/ 目录下，自动推导）
PROJECT_ROOT = Path(__file__).parent.parent.absolute()

# 各数据文件相对于项目根目录的路径
ARTICLES_JSON = PROJECT_ROOT / "json" / "articles.json"
OUTPUT_SITEMAP = PROJECT_ROOT / "sitemap.xml"

# 需要排除的 HTML 文件（片段页面、错误页等）
EXCLUDED_HTML = {
    "navbar.html",
    "footer.html",
    "404.html",
}

# 可选：额外排除以某些字符开头的文件（如 _ 开头的模板）
EXCLUDE_PREFIX = ("_",)

# 对于常规页面，默认的更新频率和优先级
DEFAULT_PAGE_CONFIG = {
    "/index.html": {"changefreq": "weekly", "priority": "1.0"},
    "/about.html": {"changefreq": "weekly", "priority": "0.8"},
    "/articles.html": {"changefreq": "daily", "priority": "0.9"},
    "/works.html": {"changefreq": "weekly", "priority": "0.8"},
    "/friends.html": {"changefreq": "weekly", "priority": "0.7"},
    "/contact.html": {"changefreq": "weekly", "priority": "0.7"},
    "/rss.xml": {"changefreq": "daily", "priority": "0.5"},   # RSS Feed 也可纳入
}

# 文章页面的统一配置
ARTICLE_CHANGEFREQ = "weekly"
ARTICLE_PRIORITY = "0.9"
# ----------------------------------------------------------------------------

def format_lastmod(date_value):
    """
    将日期字符串或时间戳转换为 ISO 8601 格式（仅日期，也可保留时间）
    支持格式：YYYY-MM-DD 或 YYYY-MM-DDTHH:MM:SS
    """
    if not date_value:
        return datetime.now().strftime("%Y-%m-%d")
    
    try:
        # 若已经是完整时间戳格式，直接解析
        if "T" in date_value:
            dt = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        else:
            dt = datetime.strptime(str(date_value), "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return datetime.now().strftime("%Y-%m-%d")


def get_file_lastmod(file_path):
    """获取文件的最后修改日期（仅日期）"""
    try:
        mtime = os.path.getmtime(file_path)
        return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
    except Exception:
        return datetime.now().strftime("%Y-%m-%d")


def generate_sitemap(base_url=BASE_URL, output_path=OUTPUT_SITEMAP):
    """
    主函数：生成 sitemap.xml
    :param base_url: 网站根地址，例如 https://xinyang-gao.github.io
    :param output_path: 输出文件路径（Path 对象或字符串）
    """
    base_url = base_url.rstrip('/')
    output_path = Path(output_path)
    
    # 创建根元素
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    
    # 1. 处理文章页面（从 articles.json 读取）
    articles_data = {}
    if ARTICLES_JSON.exists():
        try:
            with open(ARTICLES_JSON, 'r', encoding='utf-8') as f:
                articles_data = json.load(f)
        except Exception as e:
            print(f"警告：无法读取 {ARTICLES_JSON}，跳过文章处理。错误: {e}")
    
    articles = articles_data.get("articles", [])
    added_urls = set()   # 用于去重
    
    for article in articles:
        # 跳过隐藏文章
        if article.get("hidden", False):
            continue
        
        url_path = article.get("url")
        if not url_path:
            continue
        
        # 确保 url 以 / 开头
        if not url_path.startswith("/"):
            url_path = "/" + url_path
        
        # 获取最后更新日期（优先 last_updated，否则 date）
        lastmod_raw = article.get("last_updated") or article.get("date")
        lastmod = format_lastmod(lastmod_raw)
        
        # 生成完整 URL
        full_url = base_url + url_path
        added_urls.add(full_url)
        
        # 添加 <url> 节点
        url_elem = ET.SubElement(urlset, "url")
        ET.SubElement(url_elem, "loc").text = full_url
        ET.SubElement(url_elem, "lastmod").text = lastmod
        ET.SubElement(url_elem, "changefreq").text = ARTICLE_CHANGEFREQ
        ET.SubElement(url_elem, "priority").text = ARTICLE_PRIORITY
    
    print(f"已添加 {len(articles) - len([a for a in articles if a.get('hidden')])} 篇文章")
    
    # 2. 扫描根目录下的 HTML 文件（不包含 articles 等子目录）
    root_html_files = []
    for html_file in PROJECT_ROOT.glob("*.html"):
        filename = html_file.name
        if filename in EXCLUDED_HTML:
            continue
        if filename.startswith(EXCLUDE_PREFIX):
            continue
        root_html_files.append(html_file)
    
    # 另外加入 RSS 文件（如果存在）
    rss_file = PROJECT_ROOT / "rss.xml"
    if rss_file.exists():
        root_html_files.append(rss_file)   # 虽非 HTML，但可纳入 sitemap
    
    print(f"扫描到 {len(root_html_files)} 个根目录页面/RSS 文件")
    
    for file_path in root_html_files:
        # 构建相对路径（相对于项目根目录）
        rel_path = "/" + file_path.relative_to(PROJECT_ROOT).as_posix()
        full_url = base_url + rel_path
        
        # 去重（防止和文章重复，但文章都在 articles/ 下，一般不会冲突）
        if full_url in added_urls:
            continue
        
        added_urls.add(full_url)
        
        # 获取最后修改时间
        lastmod = get_file_lastmod(file_path)
        
        # 根据文件路径获取配置（如果存在）
        config = DEFAULT_PAGE_CONFIG.get(rel_path, {})
        changefreq = config.get("changefreq", "monthly")
        priority = config.get("priority", "0.5")
        
        # 针对 index.html 的特殊处理：实际上首页应为 /
        loc = full_url
        if rel_path == "/index.html":
            loc = base_url + "/"
        
        url_elem = ET.SubElement(urlset, "url")
        ET.SubElement(url_elem, "loc").text = loc
        ET.SubElement(url_elem, "lastmod").text = lastmod
        ET.SubElement(url_elem, "changefreq").text = changefreq
        ET.SubElement(url_elem, "priority").text = priority
    
    # 3. 生成 XML 树并写入文件
    tree = ET.ElementTree(urlset)
    # 设置 XML 声明
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_str += ET.tostring(urlset, encoding="unicode", method="xml")
    
    # 写入文件
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(xml_str)
        print(f"✅ 站点地图已生成：{output_path.absolute()}")
        print(f"   包含 {len(added_urls)} 个 URL")
    except Exception as e:
        print(f"❌ 写入站点地图失败：{e}")
        return False
    
    return True


def main():
    parser = argparse.ArgumentParser(description="生成个人网站的 sitemap.xml")
    parser.add_argument("--base-url", type=str, default=BASE_URL,
                        help="网站根地址，例如 https://xinyang-gao.github.io")
    parser.add_argument("--output", type=str, default=str(OUTPUT_SITEMAP),
                        help="输出 sitemap.xml 的路径（默认项目根目录）")
    args = parser.parse_args()
    
    generate_sitemap(base_url=args.base_url, output_path=args.output)


if __name__ == "__main__":
    main()