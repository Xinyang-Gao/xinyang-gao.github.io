#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RSS Feed 生成器 - 从 JSON 数据生成 RSS 2.0 订阅文件
支持文章（articles.json）和作品（works.json）的引入，可按配置过滤、排序。
"""

import json
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from xml.sax.saxutils import escape

# ========== 第三方库可选支持 ==========
try:
    from dateutil import parser as date_parser
    HAS_DATEUTIL = True
except ImportError:
    HAS_DATEUTIL = False

# ========== 配置加载（可外置） ==========
DEFAULT_CONFIG = {
    "site": {
        "title": "高新炀的个人网站",
        "link": "https://xinyang-gao.github.io",
        "description": "学生 · 开发者 · 写作者，用代码和文字探索世界",
        "language": "zh-CN",
        "generator": "RssGenerator (Python)"
    },
    "paths": {
        "json_dir": "json",           # 相对于项目根目录
        "output_rss": "rss.xml"       # 输出文件名
    },
    "include": {
        "articles": True,
        "works": False
    },
    "filters": {
        "skip_hidden": True,          # 跳过标记为 hidden 的条目
        "min_date": None,             # 示例: "2024-01-01"，仅包含此日期之后的条目
        "max_items": None             # 最大条目数（按日期排序后取前N条）
    }
}

# 尝试加载外部配置文件（可选）
def load_config(config_path: Path = None) -> Dict[str, Any]:
    """从 JSON 文件加载配置，若文件不存在则返回默认配置"""
    if config_path is None:
        config_path = Path(__file__).parent / "rss_config.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                user_cfg = json.load(f)
                # 深度合并默认配置
                merged = DEFAULT_CONFIG.copy()
                for key, value in user_cfg.items():
                    if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
                        merged[key].update(value)
                    else:
                        merged[key] = value
                return merged
        except Exception as e:
            logging.warning(f"加载配置文件失败，使用默认配置: {e}")
    return DEFAULT_CONFIG

# ========== 日志配置 ==========
def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

# ========== 路径与辅助函数 ==========
def get_project_root() -> Path:
    """获取项目根目录（脚本所在目录的父目录）"""
    return Path(__file__).parent.parent

def make_absolute_url(path: str, site_link: str) -> str:
    """将相对路径转换为绝对 URL"""
    if path.startswith(("http://", "https://")):
        return path
    if path.startswith("./"):
        path = path[1:]
    if not path.startswith("/"):
        path = "/" + path
    return site_link.rstrip("/") + path

def parse_date_to_rfc822(date_str: str) -> Optional[str]:
    """
    将多种常见日期格式转换为 RFC 822 格式。
    若解析失败返回 None。
    """
    if not date_str or date_str == "未指定日期":
        return None

    # 尝试使用 dateutil（支持更多格式）
    if HAS_DATEUTIL:
        try:
            dt = date_parser.parse(date_str, fuzzy=True)
            return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
        except Exception:
            pass

    # 内置支持的格式列表
    formats = [
        "%Y-%m-%d",
        "%Y年%m月%d日",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d"
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            # 若时间部分缺失，补零
            if fmt in ("%Y-%m-%d", "%Y年%m月%d日", "%Y/%m/%d"):
                return dt.strftime("%a, %d %b %Y 00:00:00 GMT")
            else:
                return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
        except ValueError:
            continue
    logging.warning(f"无法解析日期: {date_str}")
    return None

def load_json_data(filepath: Path) -> Optional[Dict[str, Any]]:
    """安全加载 JSON 文件，失败时返回 None 并记录错误"""
    if not filepath.exists():
        logging.warning(f"文件不存在: {filepath}")
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logging.error(f"读取 {filepath} 失败: {e}")
        return None

def build_items_from_list(data_key: str,
                          source_file: Path,
                          site_link: str,
                          skip_hidden: bool,
                          date_min: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    通用方法：从 JSON 文件中提取条目列表并转换为 RSS item 格式。
    data_key: JSON 中的数组键名，如 'articles' 或 'works'
    source_file: JSON 文件路径
    site_link: 网站根 URL
    skip_hidden: 是否跳过 hidden=True 的条目
    date_min: 最小日期过滤（ISO格式 YYYY-MM-DD）
    """
    items = []
    data = load_json_data(source_file)
    if not data or data_key not in data:
        logging.warning(f"{source_file} 中没有找到 '{data_key}' 字段")
        return items

    min_date_dt = datetime.strptime(date_min, "%Y-%m-%d") if date_min else None

    for entry in data[data_key]:
        # 隐藏过滤
        if skip_hidden and entry.get("hidden", False):
            logging.debug(f"跳过隐藏条目: {entry.get('title', '无标题')}")
            continue

        title = entry.get("title", "无标题")
        url = entry.get("url") or entry.get("link")
        if not url:
            logging.warning(f"条目 '{title}' 缺少 URL，跳过")
            continue

        date_str = entry.get("date", "")
        pub_date = parse_date_to_rfc822(date_str)
        if pub_date is None:
            logging.warning(f"条目 '{title}' 日期无效 ({date_str})，跳过")
            continue

        # 日期过滤
        if min_date_dt:
            try:
                dt_parsed = datetime.strptime(date_str.split()[0], "%Y-%m-%d") if " " in date_str else datetime.strptime(date_str, "%Y-%m-%d")
                if dt_parsed < min_date_dt:
                    logging.debug(f"条目 '{title}' 日期早于最小日期，跳过")
                    continue
            except Exception:
                pass

        link = make_absolute_url(url, site_link)
        description = entry.get("description", "")
        author = entry.get("author", "")
        tags = entry.get("tags", [])
        if not isinstance(tags, list):
            tags = [tags] if tags else []

        items.append({
            "title": title,
            "link": link,
            "description": description,
            "pubDate": pub_date,
            "author": author,
            "categories": tags
        })
    return items

def generate_rss(items: List[Dict[str, Any]],
                 config: Dict[str, Any],
                 output_path: Path) -> bool:
    """生成最终的 RSS XML 文件"""
    if not items:
        logging.warning("没有任何有效内容，将生成空的 RSS Feed")

    # 按发布日期倒序排列
    items.sort(key=lambda x: x["pubDate"], reverse=True)

    # 限制最大条目数
    max_items = config["filters"].get("max_items")
    if max_items and len(items) > max_items:
        items = items[:max_items]
        logging.info(f"已将条目数量限制为 {max_items}")

    site = config["site"]
    last_build = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

    xml_lines = [
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

    for item in items:
        xml_lines.append('    <item>')
        xml_lines.append(f'      <title>{escape(item["title"])}</title>')
        xml_lines.append(f'      <link>{escape(item["link"])}</link>')
        # description 使用 CDATA 保护原始 HTML/特殊字符
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
        logging.info(f"成功生成 RSS Feed ({len(items)} 条): {output_path}")
        return True
    except OSError as e:
        logging.error(f"无法写入 {output_path}: {e}")
        return False

def main():
    # 解析命令行参数（简单版）
    import argparse
    parser = argparse.ArgumentParser(description="RSS Feed 生成器")
    parser.add_argument("-c", "--config", help="配置文件路径 (JSON)")
    parser.add_argument("-v", "--verbose", action="store_true", help="显示调试信息")
    args = parser.parse_args()

    setup_logging(args.verbose)

    # 加载配置
    config_path = Path(args.config) if args.config else None
    config = load_config(config_path)

    # 获取路径
    project_root = get_project_root()
    json_dir = project_root / config["paths"]["json_dir"]
    output_file = project_root / config["paths"]["output_rss"]

    logging.info("RSS Feed 生成器启动")
    logging.info(f"包含文章: {config['include']['articles']}, 包含作品: {config['include']['works']}")
    logging.info(f"JSON 目录: {json_dir}")
    logging.info(f"输出文件: {output_file}")

    # 收集条目
    all_items = []
    filters = config["filters"]
    skip_hidden = filters.get("skip_hidden", True)
    date_min = filters.get("min_date")

    if config["include"]["articles"]:
        articles_path = json_dir / "articles.json"
        items = build_items_from_list(
            "articles", articles_path, config["site"]["link"],
            skip_hidden, date_min
        )
        all_items.extend(items)
        logging.info(f"从 articles.json 加载 {len(items)} 条")

    if config["include"]["works"]:
        works_path = json_dir / "works.json"
        items = build_items_from_list(
            "works", works_path, config["site"]["link"],
            skip_hidden, date_min
        )
        all_items.extend(items)
        logging.info(f"从 works.json 加载 {len(items)} 条")

    if not all_items:
        logging.warning("没有收集到任何有效条目")
    else:
        logging.info(f"共收集到 {len(all_items)} 个有效条目")

    # 生成 RSS
    if generate_rss(all_items, config, output_file):
        logging.info("RSS 生成完成")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()