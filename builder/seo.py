#!/usr/bin/env python3

"""SEO <head> 片段生成。

构建期产出的页面（文章页、列表页、友链页）通过本模块统一注入
canonical / Open Graph / Twitter Card / RSS 自动发现 / favicon / JSON-LD，
避免每处手写一份、漏一处就少一张分享卡片。

静态模板（src/templates/*.html）不经过 Python 渲染，使用 `{{SITE_URL}}`
占位符（由 builder.static_assets.render_placeholders 展开），两边共用
同一份 :data:`builder.common.SITE_URL`，换域名只改一处。

用法::

    from builder.seo import seo_head_tags, json_ld_webpage
    head = seo_head_tags(
        title="家乡的秋天",
        description="从影子的角度描绘城市的秋景。",
        path="/articles/家乡的秋天.html",
        page_type="article",
        image="/assets/avatar.webp",
    )
"""

from __future__ import annotations

import json
from html import escape
from urllib.parse import quote

from .common import SITE_URL

#: 站点名（与模板 <title> 后缀保持一致）
SITE_NAME = "高新炀的小站"
#: 默认分享图（相对路径，输出为绝对地址）
DEFAULT_OG_IMAGE = "/assets/avatar.webp"
#: favicon（相对路径）
FAVICON_PATH = "/favicon.ico"


def absolute_url(path: str = "/") -> str:
    """把站内路径拼成绝对地址；已是 http(s) 的原样返回。

    路径中的非 ASCII（中文标题文件名）会做百分号编码，
    与 sitemap / 浏览器地址栏的规范化形态保持一致。
    """
    if path.startswith(("http://", "https://")):
        return path
    if not path.startswith("/"):
        path = "/" + path
    return SITE_URL + quote(path, safe="/:@")


def seo_head_tags(*, title: str, description: str, path: str,
                  page_type: str = "website", image: str | None = None,
                  extra_meta: str = "") -> str:
    """返回可直接放进 `<head>` 的 SEO 标签串（多行缩进）。

    :param title: 页面标题（不含站点名后缀）
    :param description: meta/OG 描述，会同时用于 twitter:description
    :param path: 站内路径，如 ``/articles/foo.html``（用于 canonical/og:url）
    :param page_type: OG 类型，``website`` / ``article``
    :param image: 分享图站内路径，默认 ``/assets/avatar.webp``
    :param extra_meta: 额外标签（如 article:published_time），原样拼接
    """
    url = absolute_url(path)
    image_url = absolute_url(image or DEFAULT_OG_IMAGE)
    full_title = title if title == SITE_NAME else f"{title} - {SITE_NAME}"
    desc = escape(description or "", quote=True)

    tags = [
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:type" content="{page_type}">',
        f'<meta property="og:site_name" content="{escape(SITE_NAME, quote=True)}">',
        f'<meta property="og:title" content="{escape(full_title, quote=True)}">',
        f'<meta property="og:description" content="{desc}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{image_url}">',
        '<meta property="og:locale" content="zh_CN">',
        '<meta name="twitter:card" content="summary">',
        f'<meta name="twitter:title" content="{escape(full_title, quote=True)}">',
        f'<meta name="twitter:description" content="{desc}">',
        f'<meta name="twitter:image" content="{image_url}">',
        f'<link rel="icon" href="{FAVICON_PATH}" sizes="any">',
        '<link rel="alternate" type="application/rss+xml" '
        f' title="{escape(SITE_NAME, quote=True)} RSS" href="{SITE_URL}/rss.xml">',
    ]
    if extra_meta:
        tags.append(extra_meta.rstrip())
    return "\n    ".join(tags)


def json_ld_webpage(*, name: str, description: str, path: str,
                    page_type: str = "WebPage") -> str:
    """返回一段 JSON-LD（WebSite/Article/WebPage），放进 `<script type="application/ld+json">`。"""
    data = {
        "@context": "https://schema.org",
        "@type": page_type,
        "name": name,
        "description": description,
        "url": absolute_url(path),
        "inLanguage": "zh-CN",
        "image": absolute_url(DEFAULT_OG_IMAGE),
        "author": {"@type": "Person", "name": "高新炀"},
    }
    if page_type == "Article":
        data["publisher"] = {"@type": "Person", "name": "高新炀"}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f'<script type="application/ld+json">{payload}</script>'


def web_site_json_ld(home_title: str = SITE_NAME, search_path: str = "/articles/") -> str:
    """首页用的 WebSite schema（含 SearchAction，利于站内搜索框展示）。"""
    data = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": home_title,
        "url": SITE_URL + "/",
        "inLanguage": "zh-CN",
        "potentialAction": {
            "@type": "SearchAction",
            "target": {"@type": "EntryPoint", "urlTemplate": f"{SITE_URL}{search_path}?q={{search_term_string}}"},
            "query-input": "required name=search_term_string",
        },
    }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f'<script type="application/ld+json">{payload}</script>'
