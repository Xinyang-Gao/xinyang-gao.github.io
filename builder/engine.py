#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
构建引擎：加载输入，按生成器依赖执行，支持增量判断和并行执行。
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Callable, Tuple
from pathlib import Path

# 全部改为相对导入（从当前包导入）
from .common import log_info, log_error, log_warning, load_build_state, save_build_state
from .build_context import BuildContext
from .input_loader import load_all
from .generators.base import OutputGenerator

class BuildEngine:
    def __init__(self):
        self.generators: List[OutputGenerator] = []
        self.state = load_build_state()

    def register(self, generator: OutputGenerator) -> None:
        self.generators.append(generator)
        log_info(f"注册生成器: {generator.name}")

    def run(self, force: bool = False, target_names: Optional[List[str]] = None,
            parallel: bool = True, max_workers: int = 4,
            progress_callback: Optional[Callable[[str, str], None]] = None) -> bool:
        """
        执行构建。
        :param force: 强制重建所有
        :param target_names: 指定要运行的生成器名称列表，若为 None 则运行所有
        :param parallel: 是否在无依赖的生成器间并行
        :param max_workers: 并行线程数
        :param progress_callback: 进度回调 (msg, tag)
        """
        # 加载输入
        ctx = load_all(force_articles=force)

        # 过滤生成器
        selected = self.generators
        if target_names:
            selected = [g for g in self.generators if g.name in target_names]
            if len(selected) != len(target_names):
                missing = set(target_names) - {g.name for g in selected}
                log_warning(f"未找到生成器: {missing}")

        if not selected:
            log_warning("没有可执行的生成器")
            return False

        # 确定执行顺序（按依赖分组，这里简化为所有生成器都依赖 articles, works 等，但可并行）
        # 由于所有生成器都依赖输入数据，但彼此无交叉依赖，可以全部并行
        if parallel:
            return self._run_parallel(selected, ctx, force, max_workers, progress_callback)
        else:
            return self._run_sequential(selected, ctx, force, progress_callback)

    def _run_sequential(self, generators, ctx, force, callback):
        for gen in generators:
            if not force and gen.is_up_to_date(ctx, self.state):
                log_info(f"生成器 {gen.name} 已是最新，跳过")
                continue
            log_info(f"开始执行生成器: {gen.name}")
            if callback:
                callback(f"开始生成 {gen.name}", "INFO")
            if gen.generate(ctx, force):
                gen.update_state(self.state, ctx)
                save_build_state(self.state)
                if callback:
                    callback(f"生成器 {gen.name} 完成", "SUCCESS")
            else:
                log_error(f"生成器 {gen.name} 失败")
                if callback:
                    callback(f"生成器 {gen.name} 失败", "ERROR")
                return False
        return True

    def _run_parallel(self, generators, ctx, force, max_workers, callback):
        # 预先过滤出需要执行的生成器
        to_run = []
        for gen in generators:
            if not force and gen.is_up_to_date(ctx, self.state):
                log_info(f"生成器 {gen.name} 已是最新，跳过")
                continue
            to_run.append(gen)

        if not to_run:
            log_info("所有生成器均已最新，无需执行")
            return True

        with ThreadPoolExecutor(max_workers=min(max_workers, len(to_run))) as executor:
            future_to_gen = {executor.submit(self._run_one, gen, ctx, force, callback): gen for gen in to_run}
            success = True
            for future in as_completed(future_to_gen):
                gen = future_to_gen[future]
                try:
                    if not future.result():
                        success = False
                        log_error(f"生成器 {gen.name} 失败，停止后续")
                        # 取消其他任务
                        for f in future_to_gen:
                            f.cancel()
                        break
                except Exception as e:
                    log_error(f"生成器 {gen.name} 异常: {e}")
                    success = False
                    break
        if success:
            log_info("所有生成器执行成功")
        return success

    def _run_one(self, gen, ctx, force, callback):
        log_info(f"开始执行生成器: {gen.name}")
        if callback:
            callback(f"开始生成 {gen.name}", "INFO")
        try:
            if gen.generate(ctx, force):
                gen.update_state(self.state, ctx)
                save_build_state(self.state)
                if callback:
                    callback(f"生成器 {gen.name} 完成", "SUCCESS")
                return True
            else:
                if callback:
                    callback(f"生成器 {gen.name} 失败", "ERROR")
                return False
        except Exception as e:
            log_error(f"生成器 {gen.name} 异常: {e}")
            if callback:
                callback(f"生成器 {gen.name} 异常: {e}", "ERROR")
            return False