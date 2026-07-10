#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
公共模块：日志、路径、工具函数
"""

import json
import logging
import re
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# ---------- 项目根目录（builder 目录的父级） ----------
PROJECT_ROOT = Path(__file__).parent.parent

# ---------- 源码目录（src） ----------
SRC_ROOT = PROJECT_ROOT / "src"
ASSETS_SOURCE_DIR = SRC_ROOT / "assets" / "source"   # Markdown 源文件
ASSETS_DIR = SRC_ROOT / "assets"                     # 全局素材（头像、图片）
FRIEND_COLORS_JSON = ASSETS_DIR / "friend_colors.json"
TEMPLATES_DIR = SRC_ROOT / "templates"               # HTML 模板
CSS_SRC_DIR = SRC_ROOT / "css"                       # 源 CSS
JS_SRC_DIR = SRC_ROOT / "js"                         # 源 JS
WORKS_SRC_DIR = SRC_ROOT / "works"                   # 作品元数据源目录

# ---------- 构建产物目录（dist） ----------
DIST_ROOT = PROJECT_ROOT / "dist"
ARTICLES_OUTPUT_DIR = DIST_ROOT / "articles"          # 生成的 HTML 文章
JSON_OUTPUT_DIR = DIST_ROOT / "json"                 # 生成的 JSON 数据
CSS_DIST_DIR = DIST_ROOT / "css"                     # 复制/压缩后的 CSS
JS_DIST_DIR = DIST_ROOT / "js"                       # 复制/压缩后的 JS
ASSETS_DIST_DIR = DIST_ROOT / "assets"               # 复制后的静态素材
RSS_OUTPUT = DIST_ROOT / "rss.xml"
SITEMAP_OUTPUT = DIST_ROOT / "sitemap.xml"

# 确保必要的目录存在
for d in [DIST_ROOT, ARTICLES_OUTPUT_DIR, JSON_OUTPUT_DIR, CSS_DIST_DIR, JS_DIST_DIR, ASSETS_DIST_DIR]:
    d.mkdir(parents=True, exist_ok=True)

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
    if not date_str or date_str == "未指定":
        return default if default is not None else "未指定日期"
    try:
        if re.match(r'\d{4}-\d{1,2}-\d{1,2}', date_str):
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime("%Y年%m月%d日")
    except ValueError:
        pass
    try:
        dt = datetime.strptime(date_str, "%Y年%m月%d日")
        return dt.strftime("%Y年%m月%d日")
    except ValueError:
        pass
    return date_str

def format_date_iso(date_str: str) -> str:
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
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def compute_object_hash(obj: Any) -> str:
    try:
        json_str = json.dumps(obj, sort_keys=True, ensure_ascii=False)
        return hashlib.md5(json_str.encode('utf-8')).hexdigest()
    except TypeError:
        return hashlib.md5(repr(obj).encode('utf-8')).hexdigest()

def compute_file_hash(filepath: Path) -> str:
    if not filepath.exists():
        return ""
    with open(filepath, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def slugify(text: str) -> str:
    s = re.sub(r'<[^>]+>', '', text)
    s = s.strip().lower()
    s = re.sub(r"[\s]+", '-', s)
    s = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff\-]", '', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s or 'heading'

def count_words(text: str) -> int:
    return len(re.sub(r'\s+', '', text))

def calculate_read_time(word_count: int, words_per_minute: int = 300) -> str:
    if word_count <= 0:
        return "<1分钟"
    minutes = max(1, (word_count + words_per_minute - 1) // words_per_minute)
    return f"{minutes}分钟"

# ---------- 路径工具 ----------
def get_relative_path(file_path: Path) -> str:
    return file_path.relative_to(PROJECT_ROOT).as_posix()

def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

# ---------- 构建状态 ----------
BUILD_STATE_FILE = PROJECT_ROOT / ".build_state.json"

def load_build_state() -> Dict:
    return load_json(BUILD_STATE_FILE, {})

def save_build_state(state: Dict) -> None:
    save_json(state, BUILD_STATE_FILE)

# ---------- 目录哈希 ----------
def compute_dir_hash(directory: Path, patterns: List[str] = None, ignore_patterns: List[str] = None) -> str:
    """
    计算目录下所有文件的组合哈希，用于检测前端资源是否变化。
    :param directory: 目录路径
    :param patterns: 要包含的文件模式列表，如 ['*.css', '*.ts']，默认所有文件
    :param ignore_patterns: 要忽略的模式列表，如 ['*.map']
    """
    if not directory.exists():
        return ""
    hasher = hashlib.md5()
    # 收集所有文件
    files = []
    if patterns:
        for pat in patterns:
            files.extend(directory.rglob(pat))
    else:
        files = list(directory.rglob("*"))
    # 去重并排序
    files = sorted(set(files), key=lambda p: p.relative_to(directory).as_posix())
    # 过滤忽略模式
    if ignore_patterns:
        files = [f for f in files if not any(f.match(p) for p in ignore_patterns)]
    for file_path in files:
        if file_path.is_file():
            rel = file_path.relative_to(directory).as_posix()
            hasher.update(rel.encode('utf-8'))
            hasher.update(compute_file_hash(file_path).encode('utf-8'))
    return hasher.hexdigest()