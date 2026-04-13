#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from datetime import datetime, timezone

def load_json(filepath):
    """加载 JSON 文件，若文件不存在则返回 None"""
    if not os.path.exists(filepath):
        print(f"错误：文件 {filepath} 不存在")
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def extract_dates_from_articles(articles_data):
    """从文章数据中提取所有日期（包括 generated_at 和每篇文章的 date）"""
    dates = []
    if 'generated_at' in articles_data:
        # 取前10位作为日期 YYYY-MM-DD
        dates.append(articles_data['generated_at'][:10])
    for article in articles_data.get('articles', []):
        if 'date' in article:
            dates.append(article['date'][:10])
    return dates

def extract_dates_from_works(works_data):
    """从作品数据中提取所有日期（每件作品的 date）"""
    dates = []
    for work in works_data.get('works', []):
        if 'date' in work:
            dates.append(work['date'][:10])
    return dates

def get_latest_date(dates):
    """从日期字符串列表中找出最新的日期，若列表为空则返回今天的日期"""
    if not dates:
        return datetime.now().strftime('%Y-%m-%d')
    # 转换为 datetime 对象比较
    max_date = max(datetime.strptime(d, '%Y-%m-%d') for d in dates)
    return max_date.strftime('%Y-%m-%d')

def unique_sorted(items):
    """去重并排序（字符串按字母顺序）"""
    return sorted(set(items))

def main():
    # 1. 加载两个 JSON 文件
    works_data = load_json('works.json')
    articles_data = load_json('articles.json')
    
    if works_data is None or articles_data is None:
        print("无法生成统计文件，请确保两个 JSON 文件存在且格式正确。")
        return
    
    # 2. 提取所有日期并计算最后更新时间
    all_dates = []
    all_dates.extend(extract_dates_from_articles(articles_data))
    all_dates.extend(extract_dates_from_works(works_data))
    last_updated = get_latest_date(all_dates)
    now_precise = datetime.now().astimezone().isoformat(timespec="seconds")

    # 3. 文章统计
    articles = articles_data.get('articles', [])
    total_articles = len(articles)
    total_word_count = articles_data.get('total_word_count', 0)
    
    # 4. 作品统计
    works = works_data.get('works', [])
    total_works = len(works)
    
    # 5. 提取文章的所有 tag（每个文章有 tags 字段）
    article_tags = []
    for article in articles:
        tags = article.get('tags', [])
        if isinstance(tags, list):
            article_tags.extend(tags)
    article_tags = unique_sorted(article_tags)
    
    # 6. 提取文章的所有分类
    article_categories = []
    for article in articles:
        category = article.get('category')
        if category:
            article_categories.append(category)
    article_categories = unique_sorted(article_categories)
    
    # 7. 提取作品的所有 tag（每个作品有 tag 字段）
    work_tags = []
    for work in works:
        tags = work.get('tag', [])
        if isinstance(tags, list):
            work_tags.extend(tags)
    work_tags = unique_sorted(work_tags)
    
    # 8. 组装统计结果
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

    with open('statistics.json', 'w', encoding='utf-8') as f:
        json.dump(statistics, f, ensure_ascii=False, indent=2)
    
    print(f"统计文件已生成：statistics.json")
    print(f"最后更新时间：{last_updated}")
    print(f"文章总数：{total_articles}，总字数：{total_word_count}")
    print(f"作品总数：{total_works}")

if __name__ == '__main__':
    main()