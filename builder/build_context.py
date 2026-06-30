#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class Article:
    relative_path: str
    hash: str
    last_updated: str
    modify_count: int
    hidden: bool
    title: str
    date: str          # ISO 格式
    description: str
    author: str
    tags: List[str]
    category: str
    url: str
    word_count: int
    read_time: str

@dataclass
class Work:
    title: str
    description: str
    author: str
    date: str
    tag: List[str]
    link: str

@dataclass
class Friend:
    name: str
    link: str
    desc: str
    avatar: str

@dataclass
class BuildContext:
    articles: List[Article] = field(default_factory=list)
    works: List[Work] = field(default_factory=list)
    friends: List[Friend] = field(default_factory=list)
    version: Dict = field(default_factory=dict)   # 来自 version.json
    statistics: Dict = field(default_factory=dict)  # 由统计生成器填充
    code_analysis: Dict = field(default_factory=dict)  # 可选