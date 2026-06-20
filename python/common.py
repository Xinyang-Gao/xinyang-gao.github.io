#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
公共模块：日志、路径、工具函数
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# ---------- 项目根目录 ----------
PROJECT_ROOT = Path(__file__).parent.parent

# ---------- 常用子目录 ----------
SOURCE_DIR = PROJECT_ROOT / "assets" / "source"
HTML_OUTPUT_DIR = PROJECT_ROOT / "articles"
JSON_OUTPUT_DIR = PROJECT_ROOT / "json"
WORKS_ROOT = PROJECT_ROOT / "works"

# 确保必要的目录存在
JSON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
HTML_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------- 统一日志配置 ----------
def setup_logger(name: str = None, level=logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '[%(asctime)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(level)
    return logger

# 默认全局日志器
_logger = setup_logger()

def log_info(msg: str) -> None:
    _logger.info(msg)

def log_warning(msg: str) -> None:
    _logger.warning(msg)

def log_error(msg: str) -> None:
    _logger.error(msg)

# ---------- 日期处理 ----------
def format_date(date_str: str, default: str = None) -> str:
    """
    将 YYYY-MM-DD 或 YYYY年MM月DD日 转为 YYYY年MM月DD日。
    若 date_str 为空或“未指定”，返回 default（若为 None 则返回“未指定日期”）。
    """
    if not date_str or date_str == "未指定":
        return default if default is not None else "未指定日期"
    try:
        if re.match(r'\d{4}-\d{1,2}-\d{1,2}', date_str):
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime("%Y年%m月%d日")
    except ValueError:
        pass
    # 尝试解析中文格式
    try:
        dt = datetime.strptime(date_str, "%Y年%m月%d日")
        return dt.strftime("%Y年%m月%d日")
    except ValueError:
        pass
    return date_str  # 保留原样

def format_date_iso(date_str: str) -> str:
    """返回 YYYY-MM-DD 格式，用于排序和元数据。若无效则返回“未指定日期”"""
    if not date_str or date_str == "未指定":
        return "未指定日期"
    try:
        if re.match(r'\d{4}-\d{1,2}-\d{1,2}', date_str):
            return date_str[:10]
        dt = datetime.strptime(date_str, "%Y年%m月%d日")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return "未指定日期"

def get_current_date_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d")

def get_current_datetime_iso() -> str:
    return datetime.now().isoformat()

# ---------- JSON 读写 ----------
def load_json(filepath: Path, default: Any = None) -> Any:
    """安全加载 JSON，失败返回 default"""
    if not filepath.exists():
        log_warning(f"文件不存在: {filepath}")
        return default
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log_error(f"读取 {filepath} 失败: {e}")
        return default

def save_json(data: Any, filepath: Path, indent: int = 2) -> bool:
    """保存 JSON 数据，返回是否成功"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
        log_info(f"已保存 {filepath}")
        return True
    except OSError as e:
        log_error(f"写入 {filepath} 失败: {e}")
        return False

# ---------- 字符串处理 ----------
def compute_content_hash(content: str) -> str:
    import hashlib
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def slugify(text: str) -> str:
    """生成用于 HTML id 的 slug"""
    s = re.sub(r'<[^>]+>', '', text)
    s = s.strip().lower()
    s = re.sub(r"[\s]+", '-', s)
    s = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff\-]", '', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s or 'heading'

def count_words(text: str) -> int:
    """统计非空白字符数（中英文均算一个字符）"""
    return len(re.sub(r'\s+', '', text))

def calculate_read_time(word_count: int, words_per_minute: int = 300) -> str:
    if word_count <= 0:
        return "<1分钟"
    minutes = max(1, (word_count + words_per_minute - 1) // words_per_minute)
    return f"{minutes}分钟"

# ---------- 路径工具 ----------
def get_relative_path(file_path: Path) -> str:
    """返回相对于项目根目录的路径"""
    return file_path.relative_to(PROJECT_ROOT).as_posix()

def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)