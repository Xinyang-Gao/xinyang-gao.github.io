#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
友链头像主题色生成工具
从 src/assets/friends.json 读取友链，下载头像图片，提取主色，
更新 src/assets/friend_colors.json。

依赖：
    pip install requests pillow
"""

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
import hashlib
import tempfile
import shutil
from io import BytesIO

import requests
from PIL import Image
from collections import Counter

# ---------- 配置 ----------
PROJECT_ROOT = Path(__file__).parent.parent
ASSETS_DIR = PROJECT_ROOT / "src" / "assets"
FRIENDS_JSON = ASSETS_DIR / "friends.json"
COLORS_JSON = ASSETS_DIR / "friend_colors.json"
TIMEOUT = 10          # 下载超时（秒）
IMAGE_SIZE = (64, 64) # 缩放尺寸（平衡速度与精度）
QUANTIZE_COLORS = 16  # 量化颜色数

# ---------- 颜色提取函数 ----------
def get_dominant_color_from_image(image_data: bytes) -> tuple:
    """
    从图片二进制数据中提取主色，返回 (R, G, B) 元组。
    使用缩放 + 颜色量化 + 频率统计。
    """
    try:
        img = Image.open(BytesIO(image_data))
        # 转换为 RGB（处理 PNG 透明通道等）
        if img.mode != 'RGB':
            img = img.convert('RGB')
        # 缩小以加速处理
        img.thumbnail(IMAGE_SIZE, Image.Resampling.LANCZOS)
        # 量化颜色（减少颜色数）
        img = img.quantize(colors=QUANTIZE_COLORS).convert('RGB')
        # 统计颜色频率
        pixels = list(img.getdata())
        counter = Counter(pixels)
        # 返回出现次数最多的颜色
        dominant = counter.most_common(1)[0][0]
        return dominant
    except Exception as e:
        print(f"  图片处理失败: {e}")
        return None

def fetch_avatar_color(avatar_url: str, cache_dir: Path = None) -> tuple:
    """
    下载头像并提取主色，返回 (R,G,B)。
    使用缓存避免重复下载（基于 URL 哈希）。
    """
    if cache_dir is None:
        cache_dir = Path(tempfile.gettempdir()) / "friend_avatar_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    # 根据 URL 生成缓存文件名
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
            # 保存到缓存
            with open(cache_file, 'wb') as f:
                f.write(image_data)
        except Exception as e:
            print(f"  下载失败: {e}")
            return None

    return get_dominant_color_from_image(image_data)

# ---------- 主逻辑 ----------
def main(force=False):
    if not FRIENDS_JSON.exists():
        print(f"错误：找不到 {FRIENDS_JSON}")
        sys.exit(1)

    # 读取友链数据
    with open(FRIENDS_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    friends = data.get("friends", [])
    if not friends:
        print("没有找到友链数据。")
        return

    # 读取现有颜色映射（增量更新）
    existing_colors = {}
    if COLORS_JSON.exists() and not force:
        try:
            with open(COLORS_JSON, 'r', encoding='utf-8') as f:
                existing_colors = json.load(f)
        except:
            existing_colors = {}

    # 标准化链接（去除尾部斜杠）
    def normalize_link(link):
        return link.rstrip('/')

    new_colors = existing_colors.copy()
    updated = False

    for friend in friends:
        link = friend.get("link")
        avatar = friend.get("avatar")
        if not link or not avatar:
            print(f"跳过友链（缺少 link 或 avatar）: {friend.get('name')}")
            continue

        norm_link = normalize_link(link)
        # 如果已存在且不强制，跳过
        if not force and norm_link in new_colors:
            print(f"已存在颜色，跳过: {friend.get('name')} ({link})")
            continue

        print(f"处理: {friend.get('name')} ({link})")
        color = fetch_avatar_color(avatar)
        if color:
            new_colors[norm_link] = list(color)
            updated = True
            print(f"  主色: RGB{color}")
        else:
            # 如果提取失败，保留现有或设置为默认灰色
            if norm_link not in new_colors:
                new_colors[norm_link] = [200, 200, 200]
                print("  使用默认灰色")

    # 写入文件
    if updated or force:
        with open(COLORS_JSON, 'w', encoding='utf-8') as f:
            json.dump(new_colors, f, ensure_ascii=False, indent=2)
        print(f"已更新 {COLORS_JSON}")
    else:
        print("没有变化，无需更新。")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="从友链头像生成主题色")
    parser.add_argument("--force", action="store_true", help="强制重新生成所有颜色")
    args = parser.parse_args()
    main(force=args.force)