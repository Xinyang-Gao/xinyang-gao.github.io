#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CodeAnalyzer.py - 分析项目代码成分
从项目根目录开始遍历所有文件，统计不同类型文件的数量、大小、行数等，
输出 JSON 到 json/code_analysis.json。
"""

import json
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ========== 配置 ==========
# 需要排除的目录名（完全匹配）
EXCLUDE_DIRS = {
    '.git', 'node_modules', '__pycache__', 'venv', 'env', 
    '.venv', '.idea', '.vscode', 'dist', 'build', '.cache',
    '.pytest_cache', '.mypy_cache', '.coverage', 'htmlcov'
}

# 需要排除的文件名（完全匹配）
EXCLUDE_FILES = {
    '.DS_Store', 'Thumbs.db', 'desktop.ini'
}

# 需要统计的文件扩展名（留空则统计所有文件，否则只统计这些扩展名）
# 设为 None 表示统计所有文件；如果想限制类型，可设置如 {'.py', '.html', '.css', '.js', '.md', '.json'}
INCLUDE_EXTENSIONS = None   # 统计所有文件

# ========== 日志 ==========
def log_info(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}")

def log_error(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}")

# ========== 统计函数 ==========
def count_lines(file_path: Path) -> tuple[int, int]:
    """
    返回 (总行数, 非空行数)
    """
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        total = len(lines)
        non_empty = sum(1 for line in lines if line.strip())
        return total, non_empty
    except Exception as e:
        log_error(f"读取文件失败 {file_path}: {e}")
        return 0, 0

def get_file_size(file_path: Path) -> int:
    """返回文件大小（字节）"""
    try:
        return file_path.stat().st_size
    except Exception:
        return 0

def should_ignore(path: Path, root_dir: Path) -> bool:
    """
    判断是否应该忽略该文件或目录
    """
    # 忽略特定目录
    for part in path.relative_to(root_dir).parts:
        if part in EXCLUDE_DIRS:
            return True
    # 忽略特定文件名
    if path.name in EXCLUDE_FILES:
        return True
    return False

def analyze_project(root_dir: Path) -> dict:
    """
    递归遍历 root_dir，统计文件信息
    """
    stats = defaultdict(lambda: {
        'count': 0,
        'total_size_bytes': 0,
        'total_lines': 0,
        'non_empty_lines': 0
    })

    total_files = 0
    total_size = 0
    total_lines_all = 0
    total_non_empty_all = 0

    # 遍历所有文件
    for file_path in root_dir.rglob('*'):
        if not file_path.is_file():
            continue
        if should_ignore(file_path, root_dir):
            continue

        ext = file_path.suffix.lower() if file_path.suffix else 'no_extension'
        if INCLUDE_EXTENSIONS is not None and ext not in INCLUDE_EXTENSIONS:
            continue

        # 统计行数和大小
        lines, non_empty = count_lines(file_path)
        size = get_file_size(file_path)

        # 更新扩展名统计
        stats[ext]['count'] += 1
        stats[ext]['total_size_bytes'] += size
        stats[ext]['total_lines'] += lines
        stats[ext]['non_empty_lines'] += non_empty

        # 更新全局统计
        total_files += 1
        total_size += size
        total_lines_all += lines
        total_non_empty_all += non_empty

    # 将扩展名统计转换为列表，并排序
    ext_list = []
    for ext, data in stats.items():
        ext_list.append({
            'extension': ext,
            'count': data['count'],
            'total_size_bytes': data['total_size_bytes'],
            'total_lines': data['total_lines'],
            'non_empty_lines': data['non_empty_lines']
        })
    ext_list.sort(key=lambda x: x['count'], reverse=True)

    # 返回完整报告
    return {
        'generated_at': datetime.now().isoformat(),
        'root_dir': str(root_dir.absolute()),
        'total_files': total_files,
        'total_size_bytes': total_size,
        'total_lines': total_lines_all,
        'non_empty_lines': total_non_empty_all,
        'by_extension': ext_list
    }

def main():
    # 确定项目根目录（脚本位于 python/ 目录下，父目录的父目录即为根目录）
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    log_info(f"开始分析项目代码成分: {project_root}")
    result = analyze_project(project_root)

    # 确保 json 目录存在
    json_dir = project_root / 'json'
    json_dir.mkdir(parents=True, exist_ok=True)

    output_file = json_dir / 'code_analysis.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    log_info(f"分析完成，结果已保存至: {output_file}")
    log_info(f"总文件数: {result['total_files']}, 总大小: {result['total_size_bytes']} 字节, 总行数: {result['total_lines']}")

if __name__ == '__main__':
    main()