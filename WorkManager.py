#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from pathlib import Path

def main():
    work_dir = Path.cwd()
    works_root = work_dir / "works"

    if not works_root.exists() or not works_root.is_dir():
        print(f"错误：目录 '{works_root}' 不存在或不是一个目录", file=sys.stderr)
        sys.exit(1)

    works_list = []

    for subdir in works_root.iterdir():
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
                print(f"警告：读取 {metadata_path} 失败 - {e}", file=sys.stderr)
        else:
            print(f"警告：{metadata_path} 不存在，使用默认值", file=sys.stderr)

        if not link.strip():
            link = f"./works/{title}/"

        if not isinstance(tag, list):
            print(f"警告：{metadata_path} 中的 'tag' 不是列表，将转为单元素列表", file=sys.stderr)
            tag = [tag] if tag else []

        # 如果标签中包含“隐藏”，则跳过该作品，不写入 JSON
        if "隐藏" in tag:
            print(f"信息：作品 '{title}' 含有“隐藏”标签，已从 works.json 中排除", file=sys.stderr)
            continue

        works_list.append({
            "title": title,
            "description": description,
            "author": author,
            "date": date,
            "tag": tag,
            "link": link
        })

    # 按日期降序排序（日期越晚越靠前），空日期排在最后
    works_list.sort(key=lambda x: x.get('date', ''), reverse=True)

    output_path = work_dir / "works.json"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({"works": works_list}, f, ensure_ascii=False, indent=2)
        print(f"成功生成 {output_path}")
    except OSError as e:
        print(f"错误：无法写入 {output_path} - {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()