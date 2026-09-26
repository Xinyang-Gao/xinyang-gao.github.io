#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""构建选项：集中描述一次构建的行为开关。

通过 dataclass 而非散落的布尔参数传递，便于后续扩展（新增开关只需加字段），
也便于在 GitHub Actions 中通过环境变量统一配置。
"""

from dataclasses import dataclass, field
import os
from typing import Dict, Optional

from .common import IS_CI, env_flag, env_int, log_info


@dataclass
class BuildConfig:
    """一次构建的运行参数。"""

    #: 忽略增量状态，强制重跑所有生成器
    force: bool = False
    #: 构建前清空 dist 目录
    clean: bool = False
    #: 跳过前端编译（Vite）与前端资源复制，仅做内容侧产物
    skip_frontend: bool = False
    #: 前端编译失败时是否中止构建（CI 必须为 True，避免部署半成品）
    strict: bool = True
    #: 离线模式：跳过一切网络请求（友链头像抓取等）
    offline: bool = False
    #: 是否并行执行同批次生成器
    parallel: bool = True
    #: 并行线程数
    max_workers: int = 4
    #: 只打印计划，不真正生成
    dry_run: bool = False
    #: CI 环境标记（影响日志与严格策略）
    ci: bool = IS_CI

    #: 覆盖特定生成器的 force（如 {"friend_colors": True}）
    force_overrides: Dict[str, bool] = field(default_factory=dict)

    def is_forced(self, name: str) -> bool:
        return bool(self.force_overrides.get(name, self.force))

    @classmethod
    def from_env(cls, *, force: bool = False, clean: bool = False,
                 skip_frontend: bool = False, offline: bool = False,
                 strict: bool = True, parallel: bool = True,
                 max_workers: Optional[int] = None, dry_run: bool = False,
                 force_overrides: Optional[Dict[str, bool]] = None) -> "BuildConfig":
        """结合环境变量默认值构造配置（显式参数优先）。"""
        return cls(
            force=force,
            clean=clean,
            skip_frontend=skip_frontend,
            offline=offline or env_flag("SKIP_NETWORK"),
            strict=strict,
            parallel=parallel,
            max_workers=max_workers or _default_workers(),
            dry_run=dry_run,
            ci=IS_CI,
            force_overrides=dict(force_overrides or {}),
        )


def _default_workers() -> int:
    """默认并行度：CI 通常为 2 核，本地取 CPU 数量但不超过 8。"""
    env = env_int("BUILD_WORKERS", 0)
    if env > 0:
        return env
    if IS_CI:
        return 4
    return max(2, min(8, (os.cpu_count() or 4)))


def describe(config: "BuildConfig") -> str:
    """人类可读的配置摘要，用于构建开始时输出。"""
    flags = []
    if config.force:
        flags.append("force")
    if config.clean:
        flags.append("clean")
    if config.skip_frontend:
        flags.append("skip-frontend")
    if config.dry_run:
        flags.append("dry-run")
    if config.ci:
        flags.append("ci")
    return f"workers={config.max_workers}, strict={config.strict}" + (f", flags=[{','.join(flags)}]" if flags else "")


def log_config(config: "BuildConfig") -> None:
    log_info(f"构建配置: {describe(config)}")
