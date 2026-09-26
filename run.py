#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""统一构建入口。

本地开发：
    python run.py                # 增量构建
    python run.py --clean        # 清空 dist 后全量构建
    python run.py --no-frontend  # 只做内容侧产物（跳过 Vite）
CI（GitHub Actions）：
    python run.py --ci           # CI 友好输出 + 严格模式（前端失败即失败）
"""

import argparse
import os
import sys
from datetime import datetime

from builder.common import configure_console, env_flag, set_ci_mode, log_info, log_error
from builder.config import BuildConfig, log_config
from builder.engine import BuildEngine
from builder.generators.aggregated import AggregatedGenerator
from builder.generators.friend_colors import FriendColorsGenerator


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="网站统一构建系统",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--force", action="store_true",
                        help="强制重新生成所有输出")
    parser.add_argument("--force-colors", action="store_true",
                        help="强制重新生成友链主题色（会重新抓取头像）")
    parser.add_argument("--targets", nargs="+", metavar="NAME",
                        help="只运行指定生成器（如 aggregated、friend_colors）")
    parser.add_argument("--no-parallel", action="store_true",
                        help="禁用并行执行")
    parser.add_argument("--workers", type=int, default=0,
                        help="并行线程数（默认自动：CI=4，本地为 CPU 数量且不超过 8）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印执行计划，不实际生成")
    parser.add_argument("--clean", action="store_true",
                        help="构建前清空 dist 目录（推荐发布前使用）")
    parser.add_argument("--no-frontend", action="store_true",
                        help="跳过 Vite 前端编译与 CSS 压缩（静态资源仍会同步），仅生成内容侧产物")
    parser.add_argument("--offline", action="store_true",
                        help="离线模式：跳过所有网络请求（如友链头像抓取）")
    parser.add_argument("--no-strict", action="store_true",
                        help="宽容模式：前端编译失败仍继续构建（默认失败即中止）")
    parser.add_argument("--ci", action="store_true",
                        help="CI 模式：纯文本日志 + 严格模式，等价于 CI=true")
    parser.add_argument("--list", action="store_true",
                        help="列出可用生成器并退出")
    return parser


def make_config(args) -> BuildConfig:
    if args.ci:
        os.environ.setdefault("CI", "true")
        set_ci_mode(True)

    config = BuildConfig.from_env(
        force=args.force,
        clean=args.clean,
        skip_frontend=args.no_frontend,
        offline=args.offline,
        strict=not args.no_strict,
        parallel=not args.no_parallel,
        max_workers=args.workers or None,
        dry_run=args.dry_run,
    )
    if args.force_colors:
        config.force_overrides[FriendColorsGenerator.name] = True
    if args.ci:
        config.ci = True
    return config


def create_engine(config: BuildConfig) -> BuildEngine:
    engine = BuildEngine(config)
    engine.register(FriendColorsGenerator())
    engine.register(AggregatedGenerator())
    return engine


def main(argv=None) -> int:
    configure_console()
    args = build_parser().parse_args(argv)

    started = datetime.now()
    print("=" * 60)
    print(f"构建系统启动  {started.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    config = make_config(args)
    if args.offline or env_flag("SKIP_NETWORK"):
        config.offline = True
    log_config(config)

    engine = create_engine(config)

    if args.list:
        names = [g.name for g in engine.generators.values()]
        log_info(f"可用生成器: {', '.join(names)}")
        return 0

    report = engine.run_report(config=config, target_names=args.targets)

    if not report.results:
        log_error("没有执行任何生成器")
        return 1

    elapsed = (datetime.now() - started).total_seconds()
    log_info(f"结束，墙钟耗时 {elapsed:.2f}s")

    if not report.ok:
        log_error("构建失败：存在生成失败的环节，产物可能不完整")
        return 1
    log_info("构建成功")
    return 0


if __name__ == "__main__":
    sys.exit(main())
