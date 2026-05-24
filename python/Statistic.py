#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from pathlib import Path
from datetime import datetime
from collections import Counter

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
    """提取文章生成时间和各文章的日期（仅非隐藏文章）"""
    dates = []
    if 'generated_at' in articles_data:
        dates.append(articles_data['generated_at'][:10])
    for article in articles_data.get('articles', []):
        if article.get('hidden', False):
            continue
        if 'date' in article:
            dates.append(article['date'][:10])
    return dates

def extract_dates_from_works(works_data):
    """提取作品的日期（所有作品均视为公开）"""
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

def build_counted_list(counter: Counter) -> list:
    """将 Counter 对象转换为 [{name, count}, ...] 列表，按 count 降序、name 升序排列"""
    items = [{"name": name, "count": count} for name, count in counter.items()]
    items.sort(key=lambda x: (-x["count"], x["name"]))
    return items

def main():
    print("=" * 60)
    log_info("统计生成器启动")
    print("=" * 60)

    works_data = load_json(JSON_DIR / 'works.json')
    articles_data = load_json(JSON_DIR / 'articles.json')

    if works_data is None or articles_data is None:
        log_error("无法生成统计文件，请确保 works.json 和 articles.json 存在于 json/ 目录")
        return

    # ---------- 过滤非隐藏文章 ----------
    articles_all = articles_data.get('articles', [])
    visible_articles = [a for a in articles_all if not a.get('hidden', False)]

    # ---------- 日期处理 ----------
    all_dates = (extract_dates_from_articles(articles_data) +
                 extract_dates_from_works(works_data))
    last_updated = get_latest_date(all_dates)
    now_precise = datetime.now().astimezone().isoformat(timespec="seconds")

    # ---------- 文章统计 ----------
    total_articles = len(visible_articles)
    total_word_count = sum(a.get('word_count', 0) for a in visible_articles)
    average_article_word_count = int(total_word_count / total_articles) if total_articles else 0

    # 文章标签计数（从可见文章中收集）
    article_tag_counter = Counter()
    for art in visible_articles:
        tags = art.get('tags', [])
        if isinstance(tags, list):
            article_tag_counter.update(tags)
        elif isinstance(tags, str):
            article_tag_counter.update([tags])

    # 文章分类计数
    article_cat_counter = Counter()
    for art in visible_articles:
        cat = art.get('category')
        if cat:
            article_cat_counter.update([cat])

    # 文章作者计数
    article_author_counter = Counter()
    for art in visible_articles:
        author = art.get('author')
        if author:
            article_author_counter.update([author])

    # ---------- 作品统计 ----------
    works = works_data.get('works', [])
    total_works = len(works)

    # 作品标签计数
    work_tag_counter = Counter()
    for work in works:
        tags = work.get('tag', [])
        if isinstance(tags, list):
            work_tag_counter.update(tags)
        elif isinstance(tags, str):
            work_tag_counter.update([tags])

    # 作品作者计数
    work_author_counter = Counter()
    for work in works:
        author = work.get('author')
        if author:
            work_author_counter.update([author])

    # ---------- 合并作者 & 更新天数 ----------
    unique_authors = set(article_author_counter.keys()) | set(work_author_counter.keys())
    update_days = sorted(set(all_dates))

    # ---------- 构建带计数的列表 ----------
    article_tags_with_count = build_counted_list(article_tag_counter)
    article_categories_with_count = build_counted_list(article_cat_counter)
    work_tags_with_count = build_counted_list(work_tag_counter)

    # ---------- 版本管理 ----------
    output_path = JSON_DIR / 'statistics.json'
    existing_statistics = load_json(output_path)
    version = 1
    if isinstance(existing_statistics, dict) and isinstance(existing_statistics.get('version'), int):
        version = existing_statistics['version'] + 1

    # ---------- 最终 JSON 结构 ----------
    statistics = {
        "version": version,
        "last_updated": last_updated,
        "last_updated_full": now_precise,
        "total_articles": total_articles,
        "total_word_count": total_word_count,
        "average_article_word_count": average_article_word_count,
        "total_works": total_works,
        "total_article_categories": len(article_cat_counter),
        "total_article_tags": len(article_tag_counter),
        "total_work_tags": len(work_tag_counter),
        "total_authors": len(unique_authors),
        "total_update_days": len(update_days),
        # 新增：带计数的标签/分类列表
        "article_tags": article_tags_with_count,               # 原字段替换为计数列表
        "article_categories": article_categories_with_count,   # 原字段替换为计数列表
        "work_tags": work_tags_with_count,                     # 原字段替换为计数列表
        # 保留纯列表（可选，便于旧版前端过渡，若不需要可删除下面三行）
        "article_tags_list": sorted(article_tag_counter.keys()),
        "article_categories_list": sorted(article_cat_counter.keys()),
        "work_tags_list": sorted(work_tag_counter.keys())
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(statistics, f, ensure_ascii=False, indent=2)

    log_info(f"统计文件已生成: {output_path}")
    log_info(f"最后更新: {last_updated}, 文章数: {total_articles}, 总字数: {total_word_count}, 作品数: {total_works}")
    log_info("统计生成器完成")

if __name__ == '__main__':
    main()