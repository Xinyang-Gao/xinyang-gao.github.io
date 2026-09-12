#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
统一构建入口
"""

import argparse
import sys
from datetime import datetime

from builder.common import log_info, log_error
from builder.engine import BuildEngine
from builder.generators.aggregated import AggregatedGenerator
from builder.generators.friend_colors import FriendColorsGenerator


def console_main(args):
    print("=" * 60)
    log_info("统一构建系统启动 (命令行)")
    print("=" * 60)

    engine = BuildEngine()
    engine.register(FriendColorsGenerator())
    engine.register(AggregatedGenerator())

    target = args.targets if args.targets else None
    force = args.force
    parallel = not args.no_parallel
    max_workers = args.workers
    dry_run = args.dry_run

    force_overrides = {"friend_colors": args.force_colors}

    def callback(msg, tag):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts}] [{tag}] {msg}")

    success = engine.run(
        force=force,
        target_names=target,
        parallel=parallel,
        max_workers=max_workers,
        progress_callback=callback,
        force_overrides=force_overrides,
        dry_run=dry_run,
    )
    if not success:
        sys.exit(1)
    log_info("构建完成")


def setup_argparse():
    parser = argparse.ArgumentParser(description="统一构建系统")
    parser.add_argument("--force", action="store_true",
                        help="强制重新生成所有输出")
    parser.add_argument("--force-colors", action="store_true",
                        help="强制重新生成友链主题色")
    parser.add_argument("--targets", nargs="+",
                        help="指定生成器名称（如 aggregated）")
    parser.add_argument("--no-parallel", action="store_true",
                        help="禁用并行执行")
    parser.add_argument("--workers", type=int, default=4,
                        help="并行线程数（默认 4）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印执行计划，不实际生成")
    return parser


def main():
    args = setup_argparse().parse_args()
    console_main(args)


if __name__ == "__main__":
    main()