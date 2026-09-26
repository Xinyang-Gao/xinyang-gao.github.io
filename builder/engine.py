#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
构建引擎：加载输入，按生成器依赖分层执行，支持增量判断与线程安全并行。
"""

import time
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional, Callable, Dict, Set

from .common import (
    DIST_ROOT,
    clean_dir, ensure_build_dirs,
    log_info, log_error, log_warning,
    load_build_state, save_build_state,
)
from .build_context import BuildContext
from .config import BuildConfig, log_config
from .input_loader import load_all
from .generators.base import OutputGenerator


@dataclass
class GeneratorResult:
    name: str
    success: bool
    duration: float
    skipped: bool = False
    error: Optional[str] = None


@dataclass
class BuildReport:
    """一次构建的汇总结果，便于 CLI 输出与 CI 日志。"""

    results: List[GeneratorResult]
    elapsed: float

    @property
    def ok(self) -> bool:
        return all(r.success for r in self.results)

    @property
    def skipped(self) -> int:
        return sum(1 for r in self.results if r.skipped)

    def summary(self) -> str:
        parts = []
        for r in self.results:
            state = "SKIP" if r.skipped else ("OK" if r.success else "FAIL")
            parts.append(f"{r.name}={state}({r.duration:.2f}s)")
        return f"总计 {len(self.results)} 个生成器，耗时 {self.elapsed:.2f}s -> " + "，".join(parts)


class BuildEngine:
    def __init__(self, config: Optional[BuildConfig] = None):
        self.generators: Dict[str, OutputGenerator] = {}
        self.state_lock = threading.Lock()
        self.config = config or BuildConfig()
        # 清理构建产物后，旧的增量状态不再有效
        if self.config.clean:
            clean_dir(DIST_ROOT)
            self.state = {}
        else:
            self.state = load_build_state()

    # ---------- 注册 ----------
    def register(self, generator: OutputGenerator) -> None:
        if generator.name in self.generators:
            raise ValueError(f"生成器 '{generator.name}' 已注册")
        self.generators[generator.name] = generator
        log_info(f"注册生成器: {generator.name}")

    # ---------- 依赖解析 ----------
    def _select_targets(self, target_names: Optional[List[str]]) -> List[str]:
        if not target_names:
            return list(self.generators.keys())
        missing = set(target_names) - set(self.generators.keys())
        if missing:
            raise ValueError(f"未找到生成器: {missing}")
        # 自动补全依赖（传递闭包）
        selected: Set[str] = set()
        stack = list(target_names)
        while stack:
            name = stack.pop()
            if name in selected:
                continue
            selected.add(name)
            gen = self.generators[name]
            for dep in gen.dependencies:
                if dep not in self.generators:
                    raise ValueError(f"生成器 '{name}' 依赖未注册的 '{dep}'")
                stack.append(dep)
        return [n for n in self.generators if n in selected]

    def _resolve_batches(self, selected: List[str]) -> List[List[str]]:
        """Kahn 拓扑排序，按层分批 —— 同批内可并行。"""
        selected_set = set(selected)
        in_degree = {n: 0 for n in selected}
        graph: Dict[str, List[str]] = {n: [] for n in selected}

        for name in selected:
            for dep in self.generators[name].dependencies:
                if dep in selected_set:
                    graph[dep].append(name)
                    in_degree[name] += 1

        batches: List[List[str]] = []
        remaining = set(selected)
        while remaining:
            batch = [n for n in remaining if in_degree[n] == 0]
            if not batch:
                raise RuntimeError(f"检测到循环依赖: {remaining}")
            # 按注册顺序保持稳定
            batch.sort(key=lambda n: selected.index(n))
            batches.append(batch)
            for n in batch:
                remaining.discard(n)
                for succ in graph[n]:
                    in_degree[succ] -= 1
        return batches

    # ---------- 入口 ----------
    def run(
        self,
        force: bool = False,
        target_names: Optional[List[str]] = None,
        parallel: bool = True,
        max_workers: int = 4,
        progress_callback: Optional[Callable[[str, str], None]] = None,
        force_overrides: Optional[Dict[str, bool]] = None,
        dry_run: bool = False,
        config: Optional[BuildConfig] = None,
    ) -> bool:
        return self.run_report(
            force=force,
            target_names=target_names,
            parallel=parallel,
            max_workers=max_workers,
            progress_callback=progress_callback,
            force_overrides=force_overrides,
            dry_run=dry_run,
            config=config,
        ).ok

    def run_report(
        self,
        force: bool = False,
        target_names: Optional[List[str]] = None,
        parallel: bool = True,
        max_workers: int = 4,
        progress_callback: Optional[Callable[[str, str], None]] = None,
        force_overrides: Optional[Dict[str, bool]] = None,
        dry_run: bool = False,
        config: Optional[BuildConfig] = None,
    ) -> BuildReport:
        """执行一次构建并返回 :class:`BuildReport`（失败也会返回报告）。"""
        started = time.monotonic()

        # 兼容旧的散参调用方式：未显式提供 config 时由参数组装
        if config is None:
            config = BuildConfig(
                force=force,
                parallel=parallel,
                max_workers=max_workers,
                dry_run=dry_run,
                force_overrides=dict(force_overrides or {}),
            )
        if force_overrides:
            merged = dict(config.force_overrides)
            merged.update(force_overrides)
            config.force_overrides = merged
        if force:
            config.force = True
        if dry_run:
            config.dry_run = True
        if not parallel:
            config.parallel = False
        if max_workers and max_workers != 4:
            config.max_workers = max_workers
        self.config = config

        log_config(config)
        ensure_build_dirs()

        ctx = load_all(force_articles=config.force)
        ctx.options = config

        try:
            selected = self._select_targets(target_names)
        except ValueError as e:
            log_error(str(e))
            return BuildReport([], time.monotonic() - started)

        if not selected:
            log_warning("没有可执行的生成器")
            return BuildReport([], time.monotonic() - started)

        try:
            batches = self._resolve_batches(selected)
        except RuntimeError as e:
            log_error(str(e))
            return BuildReport([], time.monotonic() - started)

        log_info(f"执行计划: {len(batches)} 批 / {len(selected)} 个生成器")

        total = len(selected)
        done = 0
        results: List[GeneratorResult] = []
        for batch_idx, batch in enumerate(batches):
            log_info(f"--- 批次 {batch_idx + 1}/{len(batches)}: {batch} ---")
            if config.dry_run:
                for name in batch:
                    log_info(f"[dry-run] 将执行 {name}")
                results.extend(GeneratorResult(name, True, 0.0, skipped=True) for name in batch)
                done += len(batch)
                continue

            if config.parallel and len(batch) > 1:
                batch_results = self._run_batch_parallel(batch, ctx, config.max_workers,
                                                         progress_callback)
            else:
                batch_results = self._run_batch_sequential(batch, ctx, progress_callback)

            # 统计
            for r in batch_results:
                done += 1
                tag = "SKIP" if r.skipped else ("OK" if r.success else "FAIL")
                log_info(f"[{done}/{total}] {r.name} -> {tag} ({r.duration:.2f}s)")
                results.append(r)

            if any((not r.success) and (not r.skipped) for r in batch_results):
                failed = [r.name for r in batch_results if not r.success and not r.skipped]
                log_error(f"生成器 {failed} 失败，终止后续批次")
                break

        report = BuildReport(results, time.monotonic() - started)
        if report.ok:
            log_info(f"构建完成：{report.summary()}")
        else:
            log_error(f"构建失败：{report.summary()}")
        return report

    # ---------- 单批执行 ----------
    def _should_skip(self, name: str, ctx: BuildContext) -> bool:
        if self.config.is_forced(name):
            return False
        return self.generators[name].is_up_to_date(ctx, self.state)

    def _run_one(self, name: str, ctx: BuildContext,
                 callback: Optional[Callable[[str, str], None]]) -> GeneratorResult:
        gen = self.generators[name]
        force = self.config.is_forced(name)
        start = time.monotonic()
        if callback:
            callback(f"开始生成 {name}", "INFO")
        try:
            ok = gen.generate(ctx, force)
            duration = time.monotonic() - start
            if ok:
                # 线程安全地写入状态
                with self.state_lock:
                    self.state[name] = gen.build_state_entry(ctx)
                    save_build_state(self.state)
                if callback:
                    callback(f"生成器 {name} 完成", "SUCCESS")
                return GeneratorResult(name, True, duration)
            else:
                if callback:
                    callback(f"生成器 {name} 返回失败", "ERROR")
                return GeneratorResult(name, False, time.monotonic() - start,
                                       error="generate() returned False")
        except Exception as e:
            tb = traceback.format_exc()
            log_error(f"生成器 {name} 异常:\n{tb}")
            if callback:
                callback(f"生成器 {name} 异常: {e}", "ERROR")
            return GeneratorResult(name, False, time.monotonic() - start, error=str(e))

    def _run_batch_sequential(self, batch, ctx, callback):
        results = []
        for name in batch:
            if self._should_skip(name, ctx):
                log_info(f"生成器 {name} 已是最新，跳过")
                results.append(GeneratorResult(name, True, 0.0, skipped=True))
                continue
            log_info(f"开始执行生成器: {name}")
            results.append(self._run_one(name, ctx, callback))
        return results

    def _run_batch_parallel(self, batch, ctx, max_workers, callback):
        to_run = []
        results: List[GeneratorResult] = []
        for name in batch:
            if self._should_skip(name, ctx):
                log_info(f"生成器 {name} 已是最新，跳过")
                results.append(GeneratorResult(name, True, 0.0, skipped=True))
            else:
                to_run.append(name)

        if not to_run:
            return results

        with ThreadPoolExecutor(max_workers=min(max_workers, len(to_run))) as executor:
            future_map = {
                executor.submit(self._run_one, name, ctx, callback): name
                for name in to_run
            }
            # 收集所有结果（不再 break，让已提交任务自然结束）
            for future in as_completed(future_map):
                try:
                    results.append(future.result())
                except Exception as e:
                    name = future_map[future]
                    log_error(f"生成器 {name} 未捕获异常: {e}")
                    results.append(GeneratorResult(name, False, 0.0, error=str(e)))

        # 按原始顺序稳定输出
        order = {name: i for i, name in enumerate(batch)}
        results.sort(key=lambda r: order[r.name])
        return results