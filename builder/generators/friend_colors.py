#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""友链主题色生成器。

改进点：
  * 头像下载使用带重试的连接池 + 并发抓取，替代逐条串行请求；
  * 网络不可用 / 依赖缺失时降级为默认灰色，不再中断整个构建（CI 更稳）；
  * 抓取失败时保留已有颜色，绝不把已知颜色“降级”为灰色（缓存可信赖）；
  * 内容无变化时跳过写入，避免产生无意义的 diff。

缓存说明：
  ``src/assets/friend_colors.json`` 是本生成器的**持久化缓存**，已随仓库提交，
  因此本地与 GitHub Actions 都能直接复用历史颜色，只为新增友链发起网络请求。
  头像字节缓存默认位于系统临时目录，可用 ``FRIEND_AVATAR_CACHE_DIR`` 覆盖
  （CI 中可配合 actions/cache 持久化，进一步减少重复下载）。
"""

import colorsys
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..common import (
    FRIEND_COLORS_JSON,
    compute_bytes_hash, ensure_dir, env_int, env_str,
    log_info, log_warning, log_error,
    load_json, save_json,
)
from ..build_context import BuildContext
from .base import OutputGenerator

# ---------- 抓取参数 ----------
TIMEOUT = (5, 15)          # (连接, 读取) 秒
MAX_RETRIES = 2
#: 头像字节缓存目录；可用 FRIEND_AVATAR_CACHE_DIR 覆盖（CI 可挂到 actions/cache）
CACHE_DIR = Path(env_str("FRIEND_AVATAR_CACHE_DIR") or (Path(tempfile.gettempdir()) / "friend_avatar_cache"))
DEFAULT_WORKERS = 8

# ---------- 图片处理参数 ----------
IMAGE_SIZE = (64, 64)
QUANTIZE_COLORS = 16
FALLBACK_COLOR = [200, 200, 200]

USER_AGENT = "Mozilla/5.0 (compatible; WebsiteBuilder/2.0; +https://github.com/Xinyang-Gao)"


def _build_session():
    """构造带重试策略的 requests 会话（替换裸 requests.get）。"""
    import requests
    from requests.adapters import HTTPAdapter

    try:
        from urllib3.util.retry import Retry
        retry = Retry(
            total=MAX_RETRIES,
            connect=MAX_RETRIES,
            read=MAX_RETRIES,
            backoff_factor=0.5,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset(["GET", "HEAD"]),
        )
    except Exception:      # pragma: no cover - urllib3 版本差异
        retry = None

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "image/*,*/*;q=0.8"})
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=16)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# ---------- 颜色提取 ----------
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
                   if 0.15 < colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)[2] < 0.85]
    if candidates2:
        return max(candidates2, key=lambda x: x[0])[1]

    # 第三轮：频次最高
    return max(color_counts, key=lambda x: x[1])[0]


def get_dominant_color_from_image(image_data: bytes) -> Optional[Tuple[int, int, int]]:
    try:
        from PIL import Image
    except ImportError:
        return None
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


def _cache_path(avatar_url: str) -> Path:
    return CACHE_DIR / f"{compute_bytes_hash(avatar_url.encode('utf-8'))}.img"


def fetch_avatar_bytes(avatar_url: str, session) -> Optional[bytes]:
    """读取磁盘缓存 / 网络下载头像字节流。"""
    cache_file = _cache_path(avatar_url)
    if cache_file.is_file():
        try:
            return cache_file.read_bytes()
        except OSError as e:
            log_warning(f"读取头像缓存失败 {avatar_url}: {e}")

    if session is None:
        return None

    try:
        resp = session.get(avatar_url, timeout=TIMEOUT)
        resp.raise_for_status()
        image_data = resp.content
    except Exception as e:
        log_warning(f"下载头像失败 {avatar_url}: {e}")
        return None

    try:
        ensure_dir(cache_file.parent)
        cache_file.write_bytes(image_data)
    except OSError as e:
        log_warning(f"写入头像缓存失败: {e}")
    return image_data


def fetch_avatar_color(avatar_url: str, session=None) -> Optional[Tuple[int, int, int]]:
    image_data = fetch_avatar_bytes(avatar_url, session)
    if image_data is None:
        return None
    return get_dominant_color_from_image(image_data)


# ---------- 生成器 ----------
class FriendColorsGenerator(OutputGenerator):
    name = "friend_colors"
    inputs = {"friends"}
    outputs = [FRIEND_COLORS_JSON]

    def generate(self, context: BuildContext, force: bool) -> bool:
        cfg = self.get_config(context)
        friends = context.friends
        if not friends:
            log_info("没有友链数据，跳过友链主题色生成")
            return True

        # 依赖缺失时降级，而不是让整条流水线失败（始终返回 True）
        if not self._dependencies_ready():
            log_warning("缺少 requests / pillow，跳过友链主题色提取（前端将使用默认色）")
            return True

        existing: Dict[str, list] = {}
        if FRIEND_COLORS_JSON.exists():
            raw = load_json(FRIEND_COLORS_JSON, {}) or {}
            existing = raw if isinstance(raw, dict) else {}
            log_info(f"复用已提交的主题色缓存 {FRIEND_COLORS_JSON}（{len(existing)} 条），仅补充缺失项")
        else:
            log_warning(f"主题色缓存不存在: {FRIEND_COLORS_JSON}，将为全部友链发起头像请求"
                        f"（CI 中该文件随仓库提交，缺失通常由误删除/误忽略导致）")

        # 计算需要处理的友链
        pending = []
        seen = set()
        for friend in friends:
            if not friend.link or not friend.avatar:
                log_warning(f"跳过（缺 link/avatar）: {friend.name}")
                continue
            key = friend.link.rstrip('/')
            seen.add(key)
            if not force and isinstance(existing.get(key), list):
                continue
            pending.append((key, friend))

        # 清理已删除友链留下的颜色
        stale = [k for k in existing if k not in seen]

        if not pending and not stale and not force:
            log_info("友链主题色无变化")
            return True

        if cfg.offline or not pending:
            if pending:
                log_info("离线模式：跳过头像抓取，沿用已有/默认主题色")
            new_colors = {k: v for k, v in existing.items() if k in seen}
            for key, _ in pending:
                # 离线/无待处理项时绝不覆盖已有颜色，缺失项才用兜底灰
                new_colors.setdefault(key, existing.get(key) or list(FALLBACK_COLOR))
        else:
            new_colors = dict(existing)
            fetched = self._fetch_colors(pending, cfg, existing)
            new_colors.update(fetched)

        new_colors = {k: new_colors[k] for k in sorted(new_colors) if k in seen}
        if new_colors == existing:
            log_info("友链主题色无变化")
            return True

        save_json(new_colors, FRIEND_COLORS_JSON)
        log_info(f"友链主题色已更新至 {FRIEND_COLORS_JSON}（{len(new_colors)} 条）")
        if cfg.ci:
            log_info("CI 提示：主题色缓存已变更，建议随本次改动一起提交 "
                     "src/assets/friend_colors.json，后续构建即可直接复用、无需再抓头像")
        return True

    # ---------- 内部实现 ----------
    @staticmethod
    def _dependencies_ready() -> bool:
        try:
            from PIL import Image          # noqa: F401
            import requests                # noqa: F401
        except ImportError as e:
            log_error(f"缺少依赖库: {e}（需要 requests 和 pillow）")
            return False
        return True

    def _fetch_colors(self, pending, cfg, existing: Optional[Dict[str, list]] = None) -> Dict[str, list]:
        existing = existing or {}
        workers = env_int("FRIEND_COLOR_WORKERS", 0) or min(DEFAULT_WORKERS, max(1, len(pending)))
        session = _build_session()
        results: Dict[str, list] = {}
        try:
            if workers <= 1:
                for key, friend in pending:
                    results[key] = self._color_or_fallback(friend, session, existing.get(key))
            else:
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    futures = {
                        pool.submit(self._color_or_fallback, friend, session, existing.get(key)): key
                        for key, friend in pending
                    }
                    for future, key in futures.items():
                        try:
                            results[key] = future.result()
                        except Exception as e:
                            log_warning(f"友链颜色处理异常: {e}")
                            results.setdefault(key, existing.get(key) or list(FALLBACK_COLOR))
        finally:
            try:
                session.close()
            except Exception:      # pragma: no cover
                pass
        return results

    @staticmethod
    def _color_or_fallback(friend, session, fallback: Optional[list] = None) -> list:
        """提取头像主色；失败时优先沿用历史颜色，其次才用兜底灰。"""
        log_info(f"处理友链颜色: {friend.name}")
        color = fetch_avatar_color(friend.avatar, session)
        if color:
            return list(color)
        if fallback:
            log_warning(f"{friend.name} 头像抓取失败，保留已有主题色 {fallback}")
            return list(fallback)
        return list(FALLBACK_COLOR)
