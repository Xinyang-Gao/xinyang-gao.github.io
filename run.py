#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
统一构建入口
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from builder.common import PROJECT_ROOT, log_info, log_error, log_warning
from builder.engine import BuildEngine
from builder.generators.aggregated import AggregatedGenerator


def console_main(args):
    print("=" * 60)
    log_info("统一构建系统启动 (命令行)")
    print("=" * 60)

    engine = BuildEngine()
    engine.register(AggregatedGenerator())

    target = args.targets if args.targets else None
    force = args.force
    parallel = not args.no_parallel
    max_workers = args.workers

    def callback(msg, tag):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{tag}] {msg}")

    success = engine.run(force=force, target_names=target,
                         parallel=parallel, max_workers=max_workers,
                         progress_callback=callback)
    if not success:
        sys.exit(1)
    log_info("构建完成")


def setup_argparse():
    parser = argparse.ArgumentParser(description="统一构建系统")
    parser.add_argument("--force", action="store_true", help="强制重新生成所有输出")
    parser.add_argument("--targets", nargs="+", help="指定生成器名称（如 aggregated）")
    parser.add_argument("--no-parallel", action="store_true", help="禁用并行执行")
    parser.add_argument("--workers", type=int, default=4, help="并行线程数")
    return parser


def main():
    parser = setup_argparse()
    args = parser.parse_args()
    console_main(args)


if __name__ == "__main__":
    main()