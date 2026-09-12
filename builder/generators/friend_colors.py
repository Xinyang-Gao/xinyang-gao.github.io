#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
友链主题色生成器，作为独立构建单元。
"""

import hashlib
import tempfile
import colorsys
from pathlib import Path
from io import BytesIO
from typing import List, Tuple, Optional

import requests
from PIL import Image
from collections import Counter

from ..common import (
    ASSETS_DIR, FRIEND_COLORS_JSON,
    log_info, log_warning, log_error,
    load_json, save_json
)
from ..build_context import BuildContext
from .base import OutputGenerator


# ---------- 颜色提取 ----------
TIMEOUT = 10
IMAGE_SIZE = (64, 64)
QUANTIZE_COLORS = 16

def _is_valid_color(rgb: Tuple[int, int, int]) -> bool:
    r, g, b = rgb
    _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return not (v < 0.15 or v > 0.85 or s < 0.20)


def _select_best_color(color_counts: List[Tuple[Tuple[int, int, int], int]]) -> Optional[Tuple[int, int, int]]:
    if not color_counts:
        return None

    candidates = []
    for (r, g, b), count in color_counts:
        _, s, _ = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        if _is_valid_color((r, g, b)):
            candidates.append((count * (s * 0.8 + 0.2), (r, g, b)))
    if candidates:
        return max(candidates, key=lambda x: x[0])[1]

    # 第二轮：容忍低饱和度
    candidates2 = [(c, rgb) for rgb, c in color_counts
                   if 0.15 < colorsys.rgb_to_hsv(rgb[0]/255, rgb[1]/255, rgb[2]/255)[2] < 0.85]
    if candidates2:
        return max(candidates2, key=lambda x: x[0])[1]

    # 第三轮：频次最高
    return max(color_counts, key=lambda x: x[1])[0]


def get_dominant_color_from_image(image_data: bytes) -> Optional[Tuple[int, int, int]]:
    try:
        img = Image.open(BytesIO(image_data))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.thumbnail(IMAGE_SIZE, Image.Resampling.LANCZOS)
        img = img.quantize(colors=QUANTIZE_COLORS).convert('RGB')
        counter = Counter(img.getdata())
        return _select_best_color(list(counter.items()))
    except Exception as e:
        log_warning(f"图片处理失败: {e}")
        return None


def fetch_avatar_color(avatar_url: str, cache_dir: Optional[Path] = None) -> Optional[Tuple[int, int, int]]:
    cache_dir = cache_dir or Path(tempfile.gettempdir()) / "friend_avatar_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{hashlib.md5(avatar_url.encode()).hexdigest()}.img"

    if cache_file.exists():
        image_data = cache_file.read_bytes()
    else:
        try:
            resp = requests.get(avatar_url, timeout=TIMEOUT,
                                headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            image_data = resp.content
            cache_file.write_bytes(image_data)
        except Exception as e:
            log_warning(f"下载头像失败 {avatar_url}: {e}")
            return None
    return get_dominant_color_from_image(image_data)


# ---------- 生成器 ----------
class FriendColorsGenerator(OutputGenerator):
    name = "friend_colors"
    inputs = {"friends"}
    outputs = [FRIEND_COLORS_JSON]

    def generate(self, context: BuildContext, force: bool) -> bool:
        log_info("开始生成友链主题色...")
        friends = context.friends
        if not friends:
            log_info("没有友链数据，跳过")
            return True

        try:
            import requests  # noqa: F401
            import PIL      # noqa: F401
        except ImportError as e:
            log_error(f"缺少依赖库: {e}（需要 requests 和 pillow）")
            return False

        existing = {}
        if not force and FRIEND_COLORS_JSON.exists():
            existing = load_json(FRIEND_COLORS_JSON, {}) or {}
            if not isinstance(existing, dict):
                existing = {}

        new_colors = dict(existing)
        updated = False
        norm = lambda link: link.rstrip('/')

        for friend in friends:
            if not friend.link or not friend.avatar:
                log_warning(f"跳过（缺 link/avatar）: {friend.name}")
                continue
            key = norm(friend.link)
            if not force and key in new_colors:
                continue
            log_info(f"处理友链颜色: {friend.name}")
            color = fetch_avatar_color(friend.avatar)
            new_colors[key] = list(color) if color else [200, 200, 200]
            updated = True

        if updated or force:
            save_json(new_colors, FRIEND_COLORS_JSON)
            log_info(f"友链主题色已更新至 {FRIEND_COLORS_JSON}")
        else:
            log_info("友链主题色无变化")
        return True