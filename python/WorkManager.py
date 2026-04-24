#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from pathlib import Path
from datetime import datetime

# ========== 统一日志函数 ==========
def log_info(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}")

def log_warning(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [WARNING] {msg}")

def log_error(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}")

# ========== 路径配置 ==========
PROJECT_ROOT = Path(__file__).parent.parent
WORKS_ROOT = PROJECT_ROOT / "works"
JSON_OUTPUT_DIR = PROJECT_ROOT / "json"

JSON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def main():
    print("=" * 60)
    log_info("作品管理器启动")
    print("=" * 60)

    if not WORKS_ROOT.exists() or not WORKS_ROOT.is_dir():
        log_error(f"目录不存在: {WORKS_ROOT}")
        sys.exit(1)

    works_list = []

    for subdir in WORKS_ROOT.iterdir():
        if not subdir.is_dir():
            continue

        title = subdir.name
        metadata_path = subdir / "metadata.json"

        description = ""
        author = ""
        date = ""
        tag = []
        link = ""

        if metadata_path.exists() and metadata_path.is_file():
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                description = meta.get("description", "")
                author = meta.get("author", "")
                date = meta.get("date", "")
                tag = meta.get("tag", [])
                link = meta.get("link", "")
            except (json.JSONDecodeError, OSError) as e:
                log_warning(f"读取 {metadata_path} 失败: {e}")
        else:
            log_warning(f"{metadata_path} 不存在，使用默认值")

        if not link.strip():
            link = f"./works/{title}/"

        if not isinstance(tag, list):
            log_warning(f"{metadata_path} 中的 'tag' 不是列表，转为单元素列表")
            tag = [tag] if tag else []

        # 隐藏标签过滤
        if "隐藏" in tag:
            log_info(f"作品 '{title}' 含有“隐藏”标签，已排除")
            continue

        works_list.append({
            "title": title,
            "description": description,
            "author": author,
            "date": date,
            "tag": tag,
            "link": link
        })

    # 按日期降序排序
    works_list.sort(key=lambda x: x.get('date', ''), reverse=True)

    output_path = JSON_OUTPUT_DIR / "works.json"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({"works": works_list}, f, ensure_ascii=False, indent=2)
        log_info(f"成功生成 {output_path}")
    except OSError as e:
        log_error(f"无法写入 {output_path}: {e}")
        sys.exit(1)

    log_info("作品管理器完成")

if __name__ == "__main__":
    main()