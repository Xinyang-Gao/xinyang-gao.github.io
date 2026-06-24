#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from collections import Counter
from datetime import datetime
from pathlib import Path

from common import (
    JSON_OUTPUT_DIR, log_info, log_error, load_json, save_json,
    get_current_date_iso, get_current_datetime_iso
)

def build_counted_list(counter: Counter) -> list:
    items = [{"name": name, "count": count} for name, count in counter.items()]
    items.sort(key=lambda x: (-x["count"], x["name"]))
    return items

def main():
    print("=" * 60)
    log_info("统计生成器启动")
    print("=" * 60)

    articles_data = load_json(JSON_OUTPUT_DIR / "articles.json", {})
    works_data = load_json(JSON_OUTPUT_DIR / "works.json", {})

    articles_all = articles_data.get("articles", [])
    visible_articles = [a for a in articles_all if not a.get("hidden", False)]
    works = works_data.get("works", [])

    # 日期提取
    all_dates = []
    if "generated_at" in articles_data:
        all_dates.append(articles_data["generated_at"][:10])
    for art in visible_articles:
        if art.get("date"):
            all_dates.append(art["date"][:10])
    for w in works:
        if w.get("date"):
            all_dates.append(w["date"][:10])

    last_updated = max(all_dates) if all_dates else get_current_date_iso()

    # 文章统计
    total_articles = len(visible_articles)
    total_word_count = sum(a.get("word_count", 0) for a in visible_articles)
    avg_word = int(total_word_count / total_articles) if total_articles else 0

    article_tag_cnt = Counter()
    article_cat_cnt = Counter()
    article_author_cnt = Counter()
    for art in visible_articles:
        for tag in art.get("tags", []):
            if tag:
                article_tag_cnt[tag] += 1
        cat = art.get("category")
        if cat:
            article_cat_cnt[cat] += 1
        auth = art.get("author")
        if auth:
            article_author_cnt[auth] += 1

    # 作品统计
    work_tag_cnt = Counter()
    work_author_cnt = Counter()
    for w in works:
        for tag in w.get("tag", []):
            if tag:
                work_tag_cnt[tag] += 1
        auth = w.get("author")
        if auth:
            work_author_cnt[auth] += 1

    unique_authors = set(article_author_cnt.keys()) | set(work_author_cnt.keys())
    update_days = sorted(set(all_dates))

    # ---------- 版本号改为从 version.json 读取 ----------
    version_json_path = JSON_OUTPUT_DIR / "version.json"
    if version_json_path.exists():
        version_data = load_json(version_json_path, {})
        versions = version_data.get("versions", [])
        if versions:
            latest = max(versions, key=lambda v: v.get('id', 0))
            version = latest.get('id', 0)
        else:
            version = 0
    else:
        log_warning("version.json 不存在，将 version 设为 0")
        version = 0

    statistics = {
        "version": version,
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

    save_json(statistics, JSON_OUTPUT_DIR / "statistics.json")
    log_info(f"统计完成: 文章 {total_articles} 篇, 总字数 {total_word_count}, 作品 {len(works)} 个，版本 ID {version}")

if __name__ == "__main__":
    main()