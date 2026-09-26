#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
公共模块：日志、路径、哈希、文件读写等通用工具。

设计约定：
  * 本模块 **无导入副作用**（不在 import 时创建目录/写文件），便于单测与复用；
  * 所有文本输出统一使用 LF 换行，保证 Windows 与 Linux（CI）构建产物一致；
  * 日志在 CI 或 NO_COLOR 环境下自动降级为纯文本。
"""

import io
import os
import sys
import json
import logging
import hashlib
import shutil
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Union

# ------------------------------------------------------------------
# 路径常量
# ------------------------------------------------------------------
# ---------- 项目根目录（builder 目录的父级） ----------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

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
JSON_OUTPUT_DIR = DIST_ROOT / "json"                  # 生成的 JSON 数据
CSS_DIST_DIR = DIST_ROOT / "css"                      # 复制/压缩后的 CSS
JS_DIST_DIR = DIST_ROOT / "js"                        # 构建后的 JS
ASSETS_DIST_DIR = DIST_ROOT / "assets"                # 复制后的静态素材
RSS_OUTPUT = DIST_ROOT / "rss.xml"
SITEMAP_OUTPUT = DIST_ROOT / "sitemap.xml"

# 需要保证存在的输出目录（按需创建，不在导入时创建）
_OUTPUT_DIRS = (
    DIST_ROOT,
    ARTICLES_OUTPUT_DIR,
    JSON_OUTPUT_DIR,
    CSS_DIST_DIR,
    JS_DIST_DIR,
    ASSETS_DIST_DIR,
)

# ------------------------------------------------------------------
# 环境
# ------------------------------------------------------------------
TRUTHY = {"1", "true", "yes", "on"}

def env_flag(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in TRUTHY

def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default

#: 是否运行在 CI（GitHub Actions / GitLab CI / Jenkins 等通用检测）
IS_CI = any(env_flag(v) for v in ("CI", "GITHUB_ACTIONS", "GITLAB_CI", "TF_BUILD"))

#: 日志是否允许输出 ANSI 颜色
USE_COLOR = (not env_flag("NO_COLOR")) and (env_flag("FORCE_COLOR") or (not IS_CI and sys.stdout.isatty()))

# Windows 控制台默认 GBK，会把中文日志打成乱码：统一切到 UTF-8
def _configure_stream(stream: Optional[io.TextIOBase]) -> None:
    if stream is None:
        return
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError, io.UnsupportedOperation):
        pass

def set_ci_mode(enabled: bool = True) -> None:
    """切换 CI 模式（纯文本日志、禁用颜色）。可由 --ci / 环境变量触发。"""
    global USE_COLOR, IS_CI
    if enabled:
        os.environ["CI"] = "true"
        IS_CI = True
        USE_COLOR = False
    elif not env_flag("NO_COLOR"):
        USE_COLOR = env_flag("FORCE_COLOR") or (not IS_CI and sys.stdout.isatty())
    for handler in _logger.handlers:
        handler.setFormatter(_ColorFormatter(USE_COLOR))


def configure_console() -> None:
    """配置标准输出编码（幂等）。仅在顶层入口调用。"""
    _configure_stream(getattr(sys, "stdout", None))
    _configure_stream(getattr(sys, "stderr", None))
    # Windows 上子进程（npm/vite）同样使用 UTF-8
    if os.name == "nt":
        os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# ------------------------------------------------------------------
# 目录工具
# ------------------------------------------------------------------
def ensure_dir(path: Union[str, Path]) -> Path:
    """确保目录存在并返回 Path。"""
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path

def ensure_build_dirs() -> None:
    """创建构建产物需要的目录树（由引擎在启动时显式调用）。"""
    for d in _OUTPUT_DIRS:
        ensure_dir(d)

def clean_dir(path: Union[str, Path]) -> None:
    """清空目录（不存在则视为已清理）。"""
    path = Path(path)
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()

def relative_posix(path: Union[str, Path], base: Union[str, Path] = PROJECT_ROOT) -> str:
    return Path(path).resolve().relative_to(Path(base).resolve()).as_posix()

# ------------------------------------------------------------------
# 统一日志配置
# ------------------------------------------------------------------
class _ColorFormatter(logging.Formatter):
    LEVEL_COLORS = {
        logging.DEBUG: "\033[36m",
        logging.INFO: "\033[32m",
        logging.WARNING: "\033[33m",
        logging.ERROR: "\033[31m",
        logging.CRITICAL: "\033[35m",
    }
    RESET = "\033[0m"

    def __init__(self, use_color: bool) -> None:
        super().__init__("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
        self.use_color = use_color

    def format(self, record: logging.LogRecord) -> str:
        text = super().format(record)
        if not self.use_color:
            return text
        color = self.LEVEL_COLORS.get(record.levelno)
        return f"{color}{text}{self.RESET}" if color else text


def setup_logger(name: Optional[str] = None, level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(stream=sys.stderr)
        handler.setFormatter(_ColorFormatter(USE_COLOR))
        logger.addHandler(handler)
        logger.setLevel(level)
        logger.propagate = False
    return logger


# 默认全局日志器：级别可通过 LOG_LEVEL 覆盖（本地排错用 debug）
_logger = setup_logger(level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO))

def log_debug(msg: str) -> None:
    _logger.debug(msg)

def log_info(msg: str) -> None:
    _logger.info(msg)

def log_warning(msg: str) -> None:
    _logger.warning(msg)

def log_error(msg: str) -> None:
    _logger.error(msg)

# ------------------------------------------------------------------
# 日期处理
# ------------------------------------------------------------------
def format_date(date_str: str, default: Optional[str] = None) -> str:
    if not date_str or date_str == "未指定":
        return default if default is not None else "未指定日期"
    try:
        if re.match(r'\d{4}-\d{1,2}-\d{1,2}', date_str):
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime("%Y年%m%d日")
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

# ------------------------------------------------------------------
# JSON 读写
# ------------------------------------------------------------------
def load_json(filepath: Union[str, Path], default: Any = None) -> Any:
    filepath = Path(filepath)
    if not filepath.exists():
        return default
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log_error(f"读取 {filepath} 失败: {e}")
        return default

def save_json(data: Any, filepath: Union[str, Path], indent: int = 2) -> bool:
    """序列化 JSON。统一使用 LF 换行，保证跨平台产物一致。"""
    filepath = Path(filepath)
    try:
        ensure_dir(filepath.parent)
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
            f.write("\n")
        return True
    except OSError as e:
        log_error(f"写入 {filepath} 失败: {e}")
        return False

# ------------------------------------------------------------------
# 文本读写
# ------------------------------------------------------------------
def write_text(content: str, filepath: Union[str, Path], newline: str = "\n") -> None:
    """写入文本文件并自动创建父目录（统一 LF）。"""
    filepath = Path(filepath)
    ensure_dir(filepath.parent)
    with open(filepath, 'w', encoding='utf-8', newline=newline) as f:
        f.write(content)

# ------------------------------------------------------------------
# 哈希处理
# ------------------------------------------------------------------
# 说明：统一使用 BLAKE2b（digest_size=16，等价于 128bit）。相比 MD5 更快、
# 无加密用途限制（在开启 FIPS 的运行环境不会抛错）。
_HASH_DIGEST_SIZE = 16

def _blake2b(data: bytes) -> str:
    return hashlib.blake2b(data, digest_size=_HASH_DIGEST_SIZE).hexdigest()

def compute_content_hash(content: str) -> str:
    _ensure_text(content, "content")
    return _blake2b(content.encode('utf-8'))

def compute_object_hash(obj: Any) -> str:
    try:
        json_str = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)
        return _blake2b(json_str.encode('utf-8'))
    except TypeError:
        return _blake2b(repr(obj).encode('utf-8'))

def compute_bytes_hash(data: bytes) -> str:
    return _blake2b(data)

def compute_file_hash(filepath: Union[str, Path]) -> str:
    filepath = Path(filepath)
    if not filepath.is_file():
        return ""
    hasher = hashlib.blake2b(digest_size=_HASH_DIGEST_SIZE)
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):   # 分块读取，避免大文件占用内存
            hasher.update(chunk)
    return hasher.hexdigest()

def _ensure_text(value: Any, name: str) -> None:
    if not isinstance(value, str):
        raise TypeError(f"{name} 必须是 str，实际为 {type(value).__name__}")

# ------------------------------------------------------------------
# 字符串处理
# ------------------------------------------------------------------
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

# ------------------------------------------------------------------
# 路径工具
# ------------------------------------------------------------------
def get_relative_path(file_path: Union[str, Path]) -> str:
    return Path(file_path).resolve().relative_to(PROJECT_ROOT).as_posix()

# ------------------------------------------------------------------
# 构建状态
# ------------------------------------------------------------------
BUILD_STATE_FILE = PROJECT_ROOT / ".build_state.json"
BUILD_STATE_VERSION = 2   # 哈希算法升级后失效旧状态

def load_build_state() -> Dict:
    state = load_json(BUILD_STATE_FILE, {}) or {}
    if isinstance(state, dict) and state.get("_version") != BUILD_STATE_VERSION:
        # 状态格式或哈希算法变更 -> 丢弃，退化为全量构建
        return {}
    return state

def save_build_state(state: Dict) -> None:
    if not isinstance(state, dict):
        return
    payload = dict(state)
    payload["_version"] = BUILD_STATE_VERSION
    save_json(payload, BUILD_STATE_FILE)

# ------------------------------------------------------------------
# 目录哈希
# ------------------------------------------------------------------
def iter_files(root: Union[str, Path], patterns: Optional[Iterable[str]] = None) -> List[Path]:
    """列出目录下的文件（递归），可按 glob 模式过滤，结果稳定排序。"""
    root = Path(root)
    if not root.exists():
        return []
    files: List[Path] = []
    if patterns:
        seen = set()
        for pat in patterns:
            for p in root.rglob(pat):
                if p.is_file() and p not in seen:
                    seen.add(p)
                    files.append(p)
    else:
        files = [p for p in root.rglob("*") if p.is_file()]
    return sorted(files, key=lambda p: p.relative_to(root).as_posix())

def compute_dir_hash(directory: Union[str, Path], patterns: Optional[List[str]] = None,
                     ignore_patterns: Optional[List[str]] = None) -> str:
    """计算目录下所有文件的组合哈希，用于检测前端资源是否变化。"""
    directory = Path(directory)
    if not directory.exists():
        return ""
    hasher = hashlib.blake2b(digest_size=_HASH_DIGEST_SIZE)
    for file_path in iter_files(directory, patterns):
        rel = file_path.relative_to(directory).as_posix()
        if ignore_patterns and any(part in ignore_patterns for part in file_path.parts):
            continue
        hasher.update(rel.encode('utf-8'))
        hasher.update(compute_file_hash(file_path).encode('utf-8'))
    return hasher.hexdigest()
