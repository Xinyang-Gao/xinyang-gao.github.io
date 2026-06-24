#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
解析网站更新日志，生成版本编号 JSON。
输入：/assets/网站更新日志.md
输出：/json/version.json
每个版本分配自增 ID（从 1 开始，按日期升序）
"""

import re
from pathlib import Path
from datetime import datetime

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error,
    save_json, load_json, get_current_datetime_iso
)

# 正则表达式
VERSION_PATTERN = re.compile(
    r'^(#{2,4})\s+(v[\d.]+(?:\d+)?)\s*\((\d{4}-\d{2}-\d{2})\)'
)
CHANGE_PATTERN = re.compile(
    r'^-\s+\*\*([^*]+)\*\*:\s*(.*)$'
)

def parse_changelog(md_text: str) -> list:
    """
    解析更新日志文本，返回版本列表（按日期升序）。
    每个版本字典：{'version': str, 'date': str, 'changes': [{'type': str, 'description': str}]}
    """
    lines = md_text.splitlines()
    versions = []
    current_version = None
    current_date = None
    changes = []
    current_change = None
    description_lines = []

    def flush_change():
        nonlocal current_change, description_lines
        if current_change is not None:
            desc = '\n'.join(description_lines).strip()
            current_change['description'] = desc
            changes.append(current_change)
            current_change = None
            description_lines = []

    def flush_version():
        nonlocal current_version, current_date, changes
        if current_version is not None:
            flush_change()
            versions.append({
                'version': current_version,
                'date': current_date,
                'changes': changes
            })
            current_version = None
            current_date = None
            changes = []
            current_change = None
            description_lines = []

    for line in lines:
        stripped = line.strip()

        # 版本标题
        m = VERSION_PATTERN.match(line)
        if m:
            flush_version()
            current_version = m.group(2)
            current_date = m.group(3)
            continue

        # 变更条目
        m = CHANGE_PATTERN.match(line)
        if m:
            flush_change()
            change_type = m.group(1).strip()
            initial_desc = m.group(2).strip()
            current_change = {'type': change_type, 'description': ''}
            description_lines.append(initial_desc) if initial_desc else None
            continue

        # 描述延续行
        if current_change is not None:
            description_lines.append(line.rstrip())

    flush_version()
    return versions

def main():
    print("=" * 60)
    log_info("更新日志版本编号生成器启动")
    print("=" * 60)

    input_file = PROJECT_ROOT / "assets" / "网站更新日志.md"
    if not input_file.exists():
        log_error(f"文件不存在: {input_file}")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        md_content = f.read()

    versions = parse_changelog(md_content)
    if not versions:
        log_error("未解析到任何版本")
        return

    # 按日期升序排序（格式统一为 YYYY-MM-DD）
    versions.sort(key=lambda x: x['date'])

    # 分配 ID
    for idx, ver in enumerate(versions, start=1):
        ver['id'] = idx

    # 构建输出数据
    output_data = {
        "generated_at": get_current_datetime_iso(),
        "total_versions": len(versions),
        "versions": versions
    }

    output_path = JSON_OUTPUT_DIR / "version.json"
    if save_json(output_data, output_path):
        log_info(f"成功生成版本编号文件: {output_path} (共 {len(versions)} 个版本)")
    else:
        log_error("保存 version.json 失败")

if __name__ == "__main__":
    main()