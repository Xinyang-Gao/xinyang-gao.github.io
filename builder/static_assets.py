#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""静态资源（非构建资源）同步。

设计目标：
  * **单一声明**：所有“原样复制”的产物都在 :data:`STATIC_ASSET_RULES` 中声明，
    构建流程里不再散落 `shutil.copytree` / `shutil.copy` 调用，也不需要为
    单个文件（如 `friends.json`）手写复制代码；
  * **约定优先**：新增站点根文件放进 `src/public/`，新增对外 JSON 放进
    `src/assets/`，均无需改动任何代码即可发布；
  * **内容寻址增量复制**：目标文件与源一致时跳过写入，避免无意义的写盘与
    mtime 抖动（CI 与本地产物更稳定）。

规则语义（`source` 相对项目根，`destination` 相对 `dist`）：
  * `source` 为目录：递归复制，按 `include` / `exclude` 过滤，保持相对结构；
  * `source` 为 glob：复制所有匹配文件，保持相对“通配根”的结构；
  * `source` 为单文件：复制到 `destination`（可顺便重命名，如模板页 → 子目录页）。

本模块无导入副作用，可被生成器、单元测试直接调用。
"""

from __future__ import annotations

import fnmatch
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from .common import (
    DIST_ROOT,
    PROJECT_ROOT,
    compute_file_hash,
    compute_object_hash,
    ensure_dir,
    log_debug,
    log_error,
    log_info,
    log_warning,
)

#: 同步并发上限（文件复制是 IO 密集任务，过多线程无收益）
MAX_SYNC_WORKERS = 8

#: 任何规则都会额外排除的条目（版本控制元数据、编辑器垃圾文件等）。
#: 注意 `.well-known/` 这类需要发布的点目录**不在**其中。
DEFAULT_EXCLUDES: Tuple[str, ...] = (
    ".git", ".gitignore", ".gitattributes", ".gitmodules",
    ".github", ".svn", ".hg", ".DS_Store",
    "__pycache__", "*.pyc", "*.pyo",
)

_WILDCARDS = "*?["


@dataclass(frozen=True)
class AssetRule:
    """一条“原样复制”规则。"""

    #: 相对项目根目录的路径：目录 / glob / 单文件
    source: str
    #: 相对 `dist/` 的目标：目录与 glob 规则为目录，单文件规则为目标文件名
    destination: str
    #: 仅复制命中任一 glob 的相对路径（相对源目录/通配根），为空表示全部
    include: Tuple[str, ...] = ()
    #: 命中任一 glob 的相对路径或其祖先目录会被排除
    exclude: Tuple[str, ...] = ()
    #: 源缺失时是否记为错误（否则仅告警）
    required: bool = False
    #: 人类可读说明，用于日志与文档
    note: str = ""

    @property
    def source_path(self) -> Path:
        return PROJECT_ROOT / self.source

    @property
    def is_pattern(self) -> bool:
        return any(ch in self.source for ch in _WILDCARDS)


#: 模板页 → 输出子目录（复制为 `<子目录>/index.html`）
PAGE_TEMPLATES: Dict[str, str] = {
    "about.html": "about",
    "timeline.html": "timeline",
    "stats.html": "stats",
    "contact.html": "contact",
    "privacy.html": "privacy",
}

#: 全站静态资源规则 —— 新增资源只需在此追加一条，无需改动生成器代码
STATIC_ASSET_RULES: Tuple[AssetRule, ...] = (
    AssetRule(
        "src/public", ".", required=True,
        note="站点根文件：favicon / robots / 域名验证文件",
    ),
    AssetRule(
        "src/assets", "assets", exclude=("source", "source/**"),
        note="全局素材：头像、图片、更新日志（source/ 为 Markdown 源，不发布）",
    ),
    AssetRule(
        "src/works", "works", exclude=("**/metadata.json",),
        note="作品子页面（metadata.json 仅构建期使用）",
    ),
    AssetRule(
        "src/assets/*.json", "json",
        note="友链数据与主题色：直接作为 /json 接口发布",
    ),
    AssetRule("src/templates/index.html", "index.html", required=True, note="站点首页"),
    AssetRule("src/templates/404.html", "404.html", note="404 页面"),
    AssetRule("src/templates/footer.html", "footer.html", note="页脚片段（SPA 运行时 fetch）"),
) + tuple(
    AssetRule(f"src/templates/{name}", f"{subdir}/index.html", note=f"{subdir} 子目录页面")
    for name, subdir in PAGE_TEMPLATES.items()
)


# ------------------------------------------------------------------
# 规则解析
# ------------------------------------------------------------------
def _pattern_root(pattern: str) -> str:
    """返回 glob 中不含通配符的前缀目录（如 `src/assets/*.json` -> `src/assets`）。"""
    idx = min((pattern.index(ch) for ch in _WILDCARDS if ch in pattern), default=-1)
    head = pattern[:idx] if idx >= 0 else pattern
    return head.rsplit("/", 1)[0] if "/" in head else ""


def _match_any(rel: str, patterns: Sequence[str]) -> bool:
    """按 glob 匹配相对路径；同时支持目录级排除（命中任一祖先目录即排除）。"""
    for pattern in patterns:
        if fnmatch.fnmatch(rel, pattern):
            return True
        parts = rel.split("/")
        for i in range(1, len(parts)):
            if fnmatch.fnmatch("/".join(parts[:i]), pattern):
                return True
    return False


def _dest_root(rule: AssetRule) -> Path:
    dest = rule.destination.strip().replace("\\", "/").strip("/")
    return DIST_ROOT if dest in ("", ".") else DIST_ROOT / dest


def collect_rule_files(rule: AssetRule) -> List[Tuple[Path, Path]]:
    """展开一条规则，返回 `(源文件, 目标文件)` 列表（顺序稳定）。"""
    source = rule.source_path
    dest = _dest_root(rule)

    # 单文件规则：destination 即目标文件路径（可重命名）
    if not rule.is_pattern and source.is_file():
        target = dest if rule.destination and not rule.destination.endswith("/") else dest / source.name
        return [(source, target)]

    if rule.is_pattern:
        base = PROJECT_ROOT / _pattern_root(rule.source)
        candidates = [p for p in PROJECT_ROOT.glob(rule.source) if p.is_file()]
    elif source.is_dir():
        base = source
        candidates = [p for p in source.rglob("*") if p.is_file()]
    else:
        return []

    pairs: List[Tuple[Path, Path]] = []
    for path in sorted(candidates):
        rel = path.relative_to(base).as_posix()
        if rule.include and not _match_any(rel, rule.include):
            continue
        if _match_any(rel, rule.exclude) or _match_any(rel, DEFAULT_EXCLUDES):
            continue
        pairs.append((path, dest / rel))
    return pairs


def iter_rule_files(rules: Sequence[AssetRule] = STATIC_ASSET_RULES) -> List[Tuple[Path, Path]]:
    """展开全部规则（去重，按目标路径稳定排序）。"""
    seen: Dict[Path, Path] = {}
    for rule in rules:
        for src, dst in collect_rule_files(rule):
            seen[dst] = src
    return [(seen[dst], dst) for dst in sorted(seen, key=lambda p: p.as_posix())]


# ------------------------------------------------------------------
# 同步
# ------------------------------------------------------------------
@dataclass
class SyncStats:
    """一次静态资源同步的统计信息。"""

    copied: int = 0
    skipped: int = 0
    missing: int = 0
    bytes_copied: int = 0
    duration: float = 0.0
    #: 缺失且标记为 required 的规则源
    failed: List[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.copied + self.skipped

    @property
    def ok(self) -> bool:
        return not self.failed

    def describe(self) -> str:
        return (f"复制 {self.copied} 个 / 跳过 {self.skipped} 个"
                f"（合计 {self.total} 个文件，{self.bytes_copied / 1024:.1f} KB，"
                f"耗时 {self.duration:.2f}s）")


def _needs_sync(src: Path, dst: Path) -> bool:
    """mtime + size 快速判断，必要时退化为内容哈希比对。"""
    if not dst.is_file():
        return True
    try:
        s, d = src.stat(), dst.stat()
    except OSError:
        return True
    if s.st_size != d.st_size:
        return True
    # copy2 会保留 mtime：一致即视为同一次复制的产物
    if s.st_mtime_ns == d.st_mtime_ns:
        return False
    return compute_file_hash(src) != compute_file_hash(dst)


def _sync_one(pair: Tuple[Path, Path]) -> Tuple[str, int]:
    src, dst = pair
    if not _needs_sync(src, dst):
        return "skipped", 0
    ensure_dir(dst.parent)
    shutil.copy2(src, dst)
    return "copied", src.stat().st_size


def sync_static_assets(rules: Sequence[AssetRule] = STATIC_ASSET_RULES, *,
                       parallel: bool = True,
                       max_workers: int = MAX_SYNC_WORKERS) -> SyncStats:
    """按规则同步静态资源到 `dist/`，返回 :class:`SyncStats`。"""
    started = time.monotonic()
    stats = SyncStats()

    pairs: List[Tuple[Path, Path]] = []
    for rule in rules:
        rule_pairs = collect_rule_files(rule)
        if not rule_pairs:
            if rule.source_path.exists():
                log_debug(f"静态资源规则无匹配文件（目录为空？）: {rule.source}")
                continue
            message = f"静态资源源缺失: {rule.source}" + (f"（{rule.note}）" if rule.note else "")
            if rule.required:
                stats.failed.append(rule.source)
                log_error(message)
            else:
                log_warning(message)
            stats.missing += 1
            continue
        log_debug(f"规则 {rule.source} -> {rule.destination or '.'}: {len(rule_pairs)} 个文件")
        pairs.extend(rule_pairs)

    # 同一目标被多条规则命中时以最后一条为准，避免重复写盘
    unique: Dict[Path, Path] = {}
    for src, dst in pairs:
        unique[dst] = src
    pairs = [(unique[dst], dst) for dst in sorted(unique, key=lambda p: p.as_posix())]

    if pairs:
        workers = min(max_workers, len(pairs)) if parallel else 1
        if workers <= 1:
            results = [_sync_one(pair) for pair in pairs]
        else:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                results = list(pool.map(_sync_one, pairs))
        stats.copied = sum(1 for state, _ in results if state == "copied")
        stats.skipped = sum(1 for state, _ in results if state == "skipped")
        stats.bytes_copied = sum(size for _, size in results)

    stats.duration = time.monotonic() - started
    if stats.ok:
        log_info(f"静态资源同步完成：{stats.describe()}")
    else:
        log_error(f"静态资源同步存在缺失：{stats.describe()}，缺失源 {stats.failed}")
    return stats


# ------------------------------------------------------------------
# 增量判断
# ------------------------------------------------------------------
def static_sources_hash(rules: Sequence[AssetRule] = STATIC_ASSET_RULES) -> str:
    """计算所有静态资源源的组合哈希（目标路径 + 内容），用于增量判断。"""
    parts = []
    for src, dst in iter_rule_files(rules):
        try:
            rel = dst.relative_to(DIST_ROOT).as_posix()
        except ValueError:      # pragma: no cover - 理论上不会发生
            rel = dst.as_posix()
        parts.append(f"{rel}:{compute_file_hash(src)}")
    return compute_object_hash(sorted(parts))
