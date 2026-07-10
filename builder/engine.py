#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
构建引擎：加载输入，按生成器依赖执行，支持增量判断和并行执行。
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Callable, Tuple, Dict

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
            progress_callback: Optional[Callable[[str, str], None]] = None,
            force_overrides: Optional[Dict[str, bool]] = None) -> bool:
        """
        执行构建。
        :param force: 全局强制标志，若 force_overrides 中未指定则使用此值
        :param target_names: 指定要运行的生成器名称列表，若为 None 则运行所有
        :param parallel: 是否在无依赖的生成器间并行
        :param max_workers: 并行线程数
        :param progress_callback: 进度回调 (msg, tag)
        :param force_overrides: 对特定生成器的强制覆盖，键为生成器名称，值为布尔值
        """
        ctx = load_all(force_articles=force)

        selected = self.generators
        if target_names:
            selected = [g for g in self.generators if g.name in target_names]
            if len(selected) != len(target_names):
                missing = set(target_names) - {g.name for g in selected}
                log_warning(f"未找到生成器: {missing}")

        if not selected:
            log_warning("没有可执行的生成器")
            return False

        if parallel:
            return self._run_parallel(selected, ctx, force, max_workers, progress_callback, force_overrides)
        else:
            return self._run_sequential(selected, ctx, force, progress_callback, force_overrides)

    def _run_sequential(self, generators, ctx, force, callback, force_overrides):
        for gen in generators:
            actual_force = force_overrides.get(gen.name, force) if force_overrides else force
            if not actual_force and gen.is_up_to_date(ctx, self.state):
                log_info(f"生成器 {gen.name} 已是最新，跳过")
                continue
            log_info(f"开始执行生成器: {gen.name}")
            if callback:
                callback(f"开始生成 {gen.name}", "INFO")
            if gen.generate(ctx, actual_force):
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

    def _run_parallel(self, generators, ctx, force, max_workers, callback, force_overrides):
        to_run = []
        for gen in generators:
            actual_force = force_overrides.get(gen.name, force) if force_overrides else force
            if not actual_force and gen.is_up_to_date(ctx, self.state):
                log_info(f"生成器 {gen.name} 已是最新，跳过")
                continue
            to_run.append((gen, actual_force))

        if not to_run:
            log_info("所有生成器均已最新，无需执行")
            return True

        with ThreadPoolExecutor(max_workers=min(max_workers, len(to_run))) as executor:
            future_to_gen = {
                executor.submit(self._run_one, gen, ctx, actual_force, callback): gen
                for gen, actual_force in to_run
            }
            success = True
            for future in as_completed(future_to_gen):
                gen = future_to_gen[future]
                try:
                    if not future.result():
                        success = False
                        log_error(f"生成器 {gen.name} 失败，停止后续")
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