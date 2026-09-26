#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Set, List, FrozenSet
from datetime import datetime

from ..build_context import BuildContext
from ..common import compute_object_hash
from ..config import BuildConfig


class OutputGenerator(ABC):
    """所有生成器的抽象基类。

    子类只需声明：name / inputs / outputs / generate。
    依赖关系通过 dependencies 声明，引擎会做拓扑排序。

    运行期开关统一从 ``context.options``（:class:`BuildConfig`）读取，
    不再依赖模块级全局变量，便于并行执行与测试。
    """

    # ---------- 必须实现的抽象属性 ----------
    @property
    @abstractmethod
    def name(self) -> str:
        """生成器唯一标识，用于状态记录与 --targets 选择。"""

    @property
    @abstractmethod
    def inputs(self) -> Set[str]:
        """依赖的 BuildContext 属性名，如 {'articles', 'works'}。"""

    @property
    @abstractmethod
    def outputs(self) -> List[Path]:
        """生成的文件路径，用于增量判断。"""

    @abstractmethod
    def generate(self, context: BuildContext, force: bool) -> bool:
        """执行生成，返回是否成功。异常由引擎统一处理。"""

    # ---------- 可选扩展 ----------
    @property
    def dependencies(self) -> FrozenSet[str]:
        """必须在这些生成器之后运行（默认无依赖）。"""
        return frozenset()

    @property
    def timeout(self) -> float:
        """单次生成的超时秒数（0 表示不限制）。"""
        return 0.0

    # ---------- 运行时配置 ----------
    @staticmethod
    def get_config(context: BuildContext) -> BuildConfig:
        """获取本次构建的配置（缺省时返回默认配置）。"""
        return getattr(context, "options", None) or BuildConfig()

    # ---------- 状态计算 ----------
    def compute_input_hash(self, context: BuildContext) -> str:
        parts = []
        for key in sorted(self.inputs):
            data = getattr(context, key, None)
            if data is not None:
                parts.append(compute_object_hash(data))
        return compute_object_hash("".join(parts))

    def is_up_to_date(self, context: BuildContext, state: dict) -> bool:
        """基于输出文件存在性 + 输入哈希判断。"""
        if not all(p.exists() for p in self.outputs):
            return False
        old = state.get(self.name, {})
        return old.get("input_hash") == self.compute_input_hash(context)

    def build_state_entry(self, context: BuildContext) -> dict:
        """返回要写入状态文件的条目（由引擎统一合并，避免竞争）。"""
        return {
            "input_hash": self.compute_input_hash(context),
            "timestamp": datetime.now().isoformat(),
        }