#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from pathlib import Path
from datetime import datetime

# ========== 统一日志函数 ==========
def log_info(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}")

def log_error(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}")

# ========== 路径配置 ==========
PROJECT_ROOT = Path(__file__).parent.parent
JSON_DIR = PROJECT_ROOT / "json"

def load_json(filepath: Path):
    """加载 JSON 文件，不存在则返回 None"""
    if not filepath.exists():
        log_error(f"文件不存在: {filepath}")
        return None
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log_error(f"读取 {filepath} 失败: {e}")
        return None

def extract_dates_from_articles(articles_data):
    dates = []
    if 'generated_at' in articles_data:
        dates.append(articles_data['generated_at'][:10])
    for article in articles_data.get('articles', []):
        if 'date' in article:
            dates.append(article['date'][:10])
    return dates

def extract_dates_from_works(works_data):
    dates = []
    for work in works_data.get('works', []):
        if 'date' in work:
            dates.append(work['date'][:10])
    return dates

def get_latest_date(dates):
    if not dates:
        return datetime.now().strftime('%Y-%m-%d')
    max_date = max(datetime.strptime(d, '%Y-%m-%d') for d in dates)
    return max_date.strftime('%Y-%m-%d')

def unique_sorted(items):
    return sorted(set(items))

def main():
    print("=" * 60)
    log_info("统计生成器启动")
    print("=" * 60)

    works_data = load_json(JSON_DIR / 'works.json')
    articles_data = load_json(JSON_DIR / 'articles.json')

    if works_data is None or articles_data is None:
        log_error("无法生成统计文件，请确保 works.json 和 articles.json 存在于 json/ 目录")
        return

    # 日期处理
    all_dates = (extract_dates_from_articles(articles_data) +
                 extract_dates_from_works(works_data))
    last_updated = get_latest_date(all_dates)
    now_precise = datetime.now().astimezone().isoformat(timespec="seconds")

    articles = articles_data.get('articles', [])
    total_articles = len(articles)
    total_word_count = articles_data.get('total_word_count', 0)

    works = works_data.get('works', [])
    total_works = len(works)

    # 文章标签和分类
    article_tags = unique_sorted([tag for art in articles for tag in art.get('tags', []) if isinstance(art.get('tags'), list)])
    article_categories = unique_sorted([cat for art in articles if (cat := art.get('category'))])

    # 作品标签
    work_tags = unique_sorted([tag for work in works for tag in work.get('tag', []) if isinstance(work.get('tag'), list)])

    statistics = {
        "last_updated": last_updated,
        "last_updated_full": now_precise,
        "total_articles": total_articles,
        "total_word_count": total_word_count,
        "total_works": total_works,
        "article_tags": article_tags,
        "article_categories": article_categories,
        "work_tags": work_tags
    }

    output_path = JSON_DIR / 'statistics.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(statistics, f, ensure_ascii=False, indent=2)

    log_info(f"统计文件已生成: {output_path}")
    log_info(f"最后更新: {last_updated}, 文章数: {total_articles}, 总字数: {total_word_count}, 作品数: {total_works}")
    log_info("统计生成器完成")

if __name__ == '__main__':
    main()