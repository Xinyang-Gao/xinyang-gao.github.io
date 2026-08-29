#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
友链主题色生成器，作为独立构建单元。
"""

"""
友链主题色生成器，作为独立构建单元。
"""

import json
import hashlib
import tempfile
import colorsys              # 新增：用于 HSV 转换
from pathlib import Path
from io import BytesIO
from typing import List, Dict, Tuple, Optional

import requests
from PIL import Image
from collections import Counter

from ..common import (
    PROJECT_ROOT, ASSETS_DIR, FRIEND_COLORS_JSON,
    log_info, log_warning, log_error,
    load_json, save_json
)
from ..build_context import BuildContext, Friend
from .base import OutputGenerator

# ---------- 颜色提取函数 ----------
TIMEOUT = 10
IMAGE_SIZE = (64, 64)
QUANTIZE_COLORS = 16

def _is_valid_color(rgb: Tuple[int, int, int]) -> bool:
    """检查颜色是否过于极端（黑、白、灰）"""
    r, g, b = rgb
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    # 亮度太低或太高，或饱和度太低 -> 视为无效
    if v < 0.15 or v > 0.85 or s < 0.20:
        return False
    return True

def _select_best_color(color_counts: List[Tuple[Tuple[int, int, int], int]]) -> Optional[Tuple[int, int, int]]:
    """
    从量化后的颜色及计数中，选择最合适的颜色。
    优先选择饱和度适中且频次较高的颜色。
    """
    if not color_counts:
        return None

    # 第一轮：过滤掉极端颜色，然后按 (频次 * 饱和度系数) 评分
    candidates = []
    for (r, g, b), count in color_counts:
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        if _is_valid_color((r, g, b)):
            score = count * (s * 0.8 + 0.2)   # 兼顾频次与饱和度
            candidates.append((score, (r, g, b)))
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    # 第二轮：没有符合条件的，则选择亮度适中的颜色（容忍低饱和度）
    candidates2 = []
    for (r, g, b), count in color_counts:
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        if 0.15 < v < 0.85:   # 只要亮度不极端，不管饱和度
            candidates2.append((count, (r, g, b)))
    if candidates2:
        candidates2.sort(key=lambda x: x[0], reverse=True)
        return candidates2[0][1]

    # 第三轮：直接选频次最高的（即使极端）
    color_counts.sort(key=lambda x: x[1], reverse=True)
    return color_counts[0][0] if color_counts else None

def get_dominant_color_from_image(image_data: bytes) -> Optional[Tuple[int, int, int]]:
    try:
        img = Image.open(BytesIO(image_data))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.thumbnail(IMAGE_SIZE, Image.Resampling.LANCZOS)
        img = img.quantize(colors=QUANTIZE_COLORS).convert('RGB')
        pixels = list(img.getdata())
        counter = Counter(pixels)
        # 转换为列表以便处理
        color_counts = list(counter.items())   # [( (r,g,b), count ), ...]
        best = _select_best_color(color_counts)
        if best is None:
            log_warning("无法从图片中提取有效颜色，将使用默认灰色")
        return best
    except Exception as e:
        log_warning(f"图片处理失败: {e}")
        return None

def fetch_avatar_color(avatar_url: str, cache_dir: Optional[Path] = None) -> Optional[Tuple[int, int, int]]:
    if cache_dir is None:
        cache_dir = Path(tempfile.gettempdir()) / "friend_avatar_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    url_hash = hashlib.md5(avatar_url.encode()).hexdigest()
    cache_file = cache_dir / f"{url_hash}.img"
    if cache_file.exists():
        with open(cache_file, 'rb') as f:
            image_data = f.read()
    else:
        try:
            resp = requests.get(avatar_url, timeout=TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            image_data = resp.content
            with open(cache_file, 'wb') as f:
                f.write(image_data)
        except Exception as e:
            log_warning(f"下载头像失败 {avatar_url}: {e}")
            return None
    return get_dominant_color_from_image(image_data)

# ---------- 生成器实现 ----------
class FriendColorsGenerator(OutputGenerator):
    name = "friend_colors"
    inputs = {"friends"}
    outputs = [FRIEND_COLORS_JSON]

    def generate(self, context: BuildContext, force: bool) -> bool:
        log_info("开始生成友链主题色...")
        friends = context.friends
        if not friends:
            log_info("没有友链数据，跳过颜色生成")
            return True

        # 检查依赖库
        try:
            import requests
            import PIL
        except ImportError as e:
            log_error(f"缺少依赖库: {e}，请安装 requests 和 pillow")
            return False

        # 加载现有颜色映射
        existing_colors = {}
        if not force and FRIEND_COLORS_JSON.exists():
            existing_colors = load_json(FRIEND_COLORS_JSON, {})
            if not isinstance(existing_colors, dict):
                existing_colors = {}

        def normalize_link(link: str) -> str:
            return link.rstrip('/')

        new_colors = existing_colors.copy()
        updated = False

        for friend in friends:
            link = friend.link
            avatar = friend.avatar
            if not link or not avatar:
                log_warning(f"跳过友链（缺少 link 或 avatar）: {friend.name}")
                continue

            norm_link = normalize_link(link)
            if not force and norm_link in new_colors:
                continue

            log_info(f"处理友链颜色: {friend.name} ({link})")
            color = fetch_avatar_color(avatar)
            if color:
                new_colors[norm_link] = list(color)
                updated = True
            else:
                if norm_link not in new_colors:
                    new_colors[norm_link] = [200, 200, 200]
                    updated = True
                    log_info(f"  使用默认灰色")
                else:
                    log_info(f"  保留已有颜色")

        if updated or force:
            success = save_json(new_colors, FRIEND_COLORS_JSON)
            log_info(f"友链主题色已更新至 {FRIEND_COLORS_JSON}")
            return success
        else:
            log_info("友链主题色无变化，未更新")
            return True