#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Set, List, Any
from datetime import datetime

from ..build_context import BuildContext
from ..common import compute_object_hash, log_info, log_warning

class OutputGenerator(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def inputs(self) -> Set[str]:
        """依赖的上下文属性名，如 'articles', 'works'"""
        pass

    @property
    @abstractmethod
    def outputs(self) -> List[Path]:
        """生成的文件路径列表"""
        pass

    @abstractmethod
    def generate(self, context: BuildContext, force: bool) -> bool:
        """执行生成，返回是否成功"""
        pass

    def compute_input_hash(self, context: BuildContext) -> str:
        """计算所有输入数据的组合哈希"""
        parts = []
        for key in sorted(self.inputs):
            data = getattr(context, key, None)
            if data is not None:
                parts.append(compute_object_hash(data))
        return compute_object_hash("".join(parts))

    def is_up_to_date(self, context: BuildContext, state: dict) -> bool:
        """根据状态文件判断是否需要重新生成"""
        old = state.get(self.name, {})
        return old.get("input_hash") == self.compute_input_hash(context)

    def update_state(self, state: dict, context: BuildContext) -> None:
        """更新状态文件中的记录"""
        state[self.name] = {
            "input_hash": self.compute_input_hash(context),
            "timestamp": datetime.now().isoformat()
        }