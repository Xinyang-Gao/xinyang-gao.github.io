#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from collections import defaultdict
from datetime import datetime
from pathlib import Path

from common import PROJECT_ROOT, JSON_OUTPUT_DIR, log_info, log_error, save_json

EXCLUDE_DIRS = {
    '.git', 'node_modules', '__pycache__', 'venv', 'env',
    '.venv', '.idea', '.vscode', 'dist', 'build', '.cache',
    '.pytest_cache', '.mypy_cache', '.coverage', 'htmlcov'
}
EXCLUDE_FILES = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
INCLUDE_EXTENSIONS = None  # 统计所有文件

def should_ignore(path: Path, root: Path) -> bool:
    for part in path.relative_to(root).parts:
        if part in EXCLUDE_DIRS:
            return True
    return path.name in EXCLUDE_FILES

def count_lines(file_path: Path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        total = len(lines)
        non_empty = sum(1 for l in lines if l.strip())
        return total, non_empty
    except Exception as e:
        log_error(f"读取文件失败 {file_path}: {e}")
        return 0, 0

def analyze_project(root_dir: Path) -> dict:
    stats = defaultdict(lambda: {'count': 0, 'total_size_bytes': 0, 'total_lines': 0, 'non_empty_lines': 0})
    total_files = total_size = total_lines = total_non_empty = 0

    for fp in root_dir.rglob('*'):
        if not fp.is_file() or should_ignore(fp, root_dir):
            continue
        ext = fp.suffix.lower() if fp.suffix else 'no_extension'
        if INCLUDE_EXTENSIONS is not None and ext not in INCLUDE_EXTENSIONS:
            continue
        lines, non_empty = count_lines(fp)
        size = fp.stat().st_size
        stats[ext]['count'] += 1
        stats[ext]['total_size_bytes'] += size
        stats[ext]['total_lines'] += lines
        stats[ext]['non_empty_lines'] += non_empty
        total_files += 1
        total_size += size
        total_lines += lines
        total_non_empty += non_empty

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

    return {
        'generated_at': datetime.now().isoformat(),
        'root_dir': str(root_dir.absolute()),
        'total_files': total_files,
        'total_size_bytes': total_size,
        'total_lines': total_lines,
        'non_empty_lines': total_non_empty,
        'by_extension': ext_list
    }

def main():
    print("=" * 60)
    log_info("代码分析器启动")
    print("=" * 60)
    result = analyze_project(PROJECT_ROOT)
    output = JSON_OUTPUT_DIR / "code_analysis.json"
    if save_json(result, output):
        log_info(f"分析完成: 总文件 {result['total_files']}, 总行数 {result['total_lines']}")
    else:
        log_error("保存分析结果失败")

if __name__ == "__main__":
    main()