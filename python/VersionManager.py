#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
解析网站更新日志，生成版本编号 JSON。
输入：/assets/网站更新日志.md
输出：/json/version.json
特性：
- 按版本号语义排序（v7.19.14 > v7.19.13）
- 去重：相同版本号只保留第一次出现
- 分配自增 ID（从 1 开始，按版本号升序）
"""

import re
from pathlib import Path
from packaging import version  # 需要安装：pip install packaging

from common import (
    PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, log_warning,
    save_json, load_json, get_current_datetime_iso
)

VERSION_PATTERN = re.compile(
    r'^(#{2,4})\s+(v[\d.]+(?:\d+)?)\s*\((\d{4}-\d{2}-\d{2})\)'
)
CHANGE_PATTERN = re.compile(
    r'^-\s+\*\*([^*]+)\*\*:\s*(.*)$'
)

def parse_changelog(md_text: str) -> dict:
    """
    解析更新日志，返回字典 {version_str: {'date': str, 'changes': list}}
    自动去重（保留第一次出现的版本）
    """
    lines = md_text.splitlines()
    version_map = {}
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
            # 如果该版本号已存在，不覆盖（保留第一次）
            if current_version not in version_map:
                version_map[current_version] = {
                    'date': current_date,
                    'changes': changes.copy()
                }
            else:
                log_warning(f"重复的版本号: {current_version}，已忽略后出现的条目")
            # 清空当前累积
            current_version = None
            current_date = None
            changes = []
            current_change = None
            description_lines = []

    for line in lines:
        stripped = line.strip()

        m = VERSION_PATTERN.match(line)
        if m:
            flush_version()
            current_version = m.group(2)
            current_date = m.group(3)
            continue

        m = CHANGE_PATTERN.match(line)
        if m:
            flush_change()
            change_type = m.group(1).strip()
            initial_desc = m.group(2).strip()
            current_change = {'type': change_type, 'description': ''}
            if initial_desc:
                description_lines.append(initial_desc)
            continue

        if current_change is not None:
            description_lines.append(line.rstrip())

    flush_version()
    return version_map

def sort_versions(version_strings: list) -> list:
    """按语义化版本排序（升序）"""
    try:
        return sorted(version_strings, key=lambda v: version.parse(v.lstrip('v')))
    except Exception:
        # 降级：按字符串排序
        return sorted(version_strings)

def main():
    print("=" * 60)
    log_info("更新日志版本编号生成器（去重+语义排序）启动")
    print("=" * 60)

    input_file = PROJECT_ROOT / "assets" / "网站更新日志.md"
    if not input_file.exists():
        log_error(f"文件不存在: {input_file}")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        md_content = f.read()

    version_map = parse_changelog(md_content)
    if not version_map:
        log_error("未解析到任何版本")
        return

    # 按语义版本升序排序
    sorted_versions = sort_versions(version_map.keys())
    log_info(f"共解析到 {len(sorted_versions)} 个唯一版本")

    # 分配 ID
    version_list = []
    for idx, ver_str in enumerate(sorted_versions, start=1):
        data = version_map[ver_str]
        version_list.append({
            'id': idx,
            'version': ver_str,
            'date': data['date'],
            'changes': data['changes']
        })

    output_data = {
        "generated_at": get_current_datetime_iso(),
        "total_versions": len(version_list),
        "versions": version_list
    }

    output_path = JSON_OUTPUT_DIR / "version.json"
    if save_json(output_data, output_path):
        log_info(f"成功生成版本编号文件: {output_path} (共 {len(version_list)} 个版本)")
        # 打印前三个版本信息供检查
        for v in version_list[:3]:
            log_info(f"  {v['id']}: {v['version']} ({v['date']})")
    else:
        log_error("保存 version.json 失败")

if __name__ == "__main__":
    main()