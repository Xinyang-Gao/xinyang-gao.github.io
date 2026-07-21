#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
InputLoader：从文件系统加载文章、作品、友链、版本等，返回 BuildContext 对象。
包含自动解析网站更新日志生成 version.json 的功能，以及文章 Markdown 转 HTML 的完整流程。
"""

import sys
import re
import json
import html
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from urllib.parse import quote

# 导入公共模块（使用相对导入）
from .common import (
    PROJECT_ROOT, SRC_ROOT, ASSETS_SOURCE_DIR, ASSETS_DIR,
    ARTICLES_OUTPUT_DIR, JSON_OUTPUT_DIR, WORKS_SRC_DIR,
    log_info, log_warning, log_error,
    load_json, save_json, compute_content_hash, compute_file_hash,
    get_relative_path, format_date, format_date_iso,
    get_current_date_iso, get_current_datetime_iso,
    count_words, calculate_read_time, slugify, ensure_dir
)

# 导入数据结构
from .build_context import Article, Work, Friend, BuildContext

# ---------- Markdown 解析依赖检查 ----------
try:
    import markdown
except ImportError:
    log_error("请安装 markdown 库: pip install markdown")
    sys.exit(1)

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False
    log_warning("PyYAML 未安装，将使用简易 frontmatter 解析")

# 删除线扩展
try:
    from markdown.extensions import Extension
    from markdown.inlinepatterns import SimpleTagInlineProcessor

    class StrikeExtension(Extension):
        def extendMarkdown(self, md):
            STRIKE_RE = r'(~~)(.+?)(~~)'
            md.inlinePatterns.register(SimpleTagInlineProcessor(STRIKE_RE, 'del'), 'strikethrough', 175)
except Exception:
    StrikeExtension = None

# 图片懒加载占位符
LAZY_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"

# ---------- 版本日志解析 ----------
VERSION_PATTERN = re.compile(r'^(#{2,4})\s+(v[\d.]+(?:\d+)?)\s*\((\d{4}-\d{2}-\d{2})\)')
CHANGE_PATTERN = re.compile(r'^-\s+\*\*([^*]+)\*\*:\s*(.*)$')

def parse_changelog(md_text: str) -> Dict:
    lines = md_text.splitlines()
    version_map = {}
    current_version = None
    current_date = None
    changes = []
    current_change = None
    description_lines = []

    def flush_change():
        nonlocal current_change, description_lines
        if current_change is not None:
            desc = '\n'.join(description_lines).strip()
            current_change['description'] = desc
            changes.append(current_change)
            current_change = None
            description_lines = []

    def flush_version():
        nonlocal current_version, current_date, changes
        if current_version is not None:
            flush_change()
            if current_version not in version_map:
                version_map[current_version] = {
                    'date': current_date,
                    'changes': changes.copy()
                }
            else:
                log_warning(f"重复的版本号: {current_version}，已忽略后出现的条目")
            current_version = None
            current_date = None
            changes = []
            current_change = None
            description_lines = []

    for line in lines:
        stripped = line.strip()
        m = VERSION_PATTERN.match(line)
        if m:
            flush_version()
            current_version = m.group(2)
            current_date = m.group(3)
            continue

        m = CHANGE_PATTERN.match(line)
        if m:
            flush_change()
            change_type = m.group(1).strip()
            initial_desc = m.group(2).strip()
            current_change = {'type': change_type, 'description': ''}
            if initial_desc:
                description_lines.append(initial_desc)
            continue

        if current_change is not None:
            description_lines.append(line.rstrip())

    flush_version()
    return version_map

def sort_versions(version_strings: list) -> list:
    try:
        from packaging import version
        return sorted(version_strings, key=lambda v: version.parse(v.lstrip('v')))
    except ImportError:
        log_warning("packaging.version 未安装，使用字符串排序")
        return sorted(version_strings)

def load_version(force: bool = False) -> Dict:
    changelog_path = ASSETS_DIR / "网站更新日志.md"
    version_json_path = JSON_OUTPUT_DIR / "version.json"

    if not force and version_json_path.exists():
        old_data = load_json(version_json_path, {})
        stored_hash = old_data.get("changelog_hash", "")
        current_hash = compute_file_hash(changelog_path)
        if stored_hash == current_hash:
            log_info("更新日志未变化，直接加载已有 version.json")
            return old_data
        else:
            log_info("更新日志已变化，重新生成 version.json")

    if not changelog_path.exists():
        log_error(f"更新日志文件不存在: {changelog_path}")
        return {}

    with open(changelog_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    version_map = parse_changelog(md_content)
    if not version_map:
        log_error("未解析到任何版本")
        return {}

    sorted_versions = sort_versions(version_map.keys())
    log_info(f"共解析到 {len(sorted_versions)} 个唯一版本")

    version_list = []
    for idx, ver_str in enumerate(sorted_versions, start=1):
        data = version_map[ver_str]
        version_list.append({
            'id': idx,
            'version': ver_str,
            'date': data['date'],
            'changes': data['changes']
        })

    output_data = {
        "generated_at": get_current_datetime_iso(),
        "total_versions": len(version_list),
        "versions": version_list,
        "changelog_hash": compute_file_hash(changelog_path)
    }

    save_json(output_data, version_json_path)
    return output_data

# ---------- 文章加载（包含 Markdown 处理及 HTML 生成） ----------
def _extract_headings(content: str) -> List[Dict]:
    headings = []
    seen = {}
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^\s*(#{1,4})\s+(.+?)\s*$', line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            base_id = slugify(text)
            cnt = seen.get(base_id, 0)
            hid = f"{base_id}-{cnt}" if cnt else base_id
            seen[base_id] = cnt + 1
            headings.append({'level': level, 'text': text, 'id': hid})
            i += 1
            continue
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if re.match(r'^={3,}$', next_line):
                level = 1
                text = line.strip()
                if text:
                    base_id = slugify(text)
                    cnt = seen.get(base_id, 0)
                    hid = f"{base_id}-{cnt}" if cnt else base_id
                    seen[base_id] = cnt + 1
                    headings.append({'level': level, 'text': text, 'id': hid})
                    i += 2
                    continue
            elif re.match(r'^-{3,}$', next_line):
                level = 2
                text = line.strip()
                if text:
                    base_id = slugify(text)
                    cnt = seen.get(base_id, 0)
                    hid = f"{base_id}-{cnt}" if cnt else base_id
                    seen[base_id] = cnt + 1
                    headings.append({'level': level, 'text': text, 'id': hid})
                    i += 2
                    continue
        i += 1
    return headings

def _convert_markdown_to_html(md_content: str, headings: List[Dict]) -> str:
    extensions = ['extra', 'codehilite', 'sane_lists', 'fenced_code', 'attr_list', 'footnotes']
    if StrikeExtension is not None:
        extensions.append(StrikeExtension())
    md = markdown.Markdown(extensions=extensions, tab_length=2)
    html_content = md.convert(md_content)

    html_content = re.sub(
        r'<img\s+([^>]*?)src=(["\'])([^"\']+)\2([^>]*)>',
        lambda m: f'<img {m.group(1)}data-src={m.group(2)}{m.group(3)}{m.group(2)} src="{LAZY_PLACEHOLDER}" class="lazy-image" {m.group(4)}>',
        html_content
    )

    if headings:
        pattern = re.compile(r'(<h([1-4])([^>]*?)>)', re.IGNORECASE)
        idx = 0
        def replacer(match):
            nonlocal idx
            if idx >= len(headings):
                return match.group(0)
            tag_open = match.group(1)
            level = int(match.group(2))
            existing_attrs = match.group(3)
            hid = headings[idx]['id']
            idx += 1
            if re.search(r'\sid=["\'][^"\']*["\']', existing_attrs):
                new_attrs = re.sub(r'\sid=["\'][^"\']*["\']', f' id="{hid}"', existing_attrs)
            else:
                new_attrs = f'{existing_attrs} id="{hid}"'
            return f'<h{level}{new_attrs}>'
        html_content = pattern.sub(replacer, html_content)

    return html_content

# ---------- 新增：TOC 渲染 ----------
def _render_toc_html(headings: List[Dict]) -> str:
    """递归构建 TOC 的 HTML 嵌套列表"""
    if not headings:
        return ''

    def build_tree(items):
        root = {'children': []}
        stack = [{'node': root, 'level': 0}]
        for h in items:
            new_node = {'id': h['id'], 'level': h['level'], 'text': h['text'], 'children': []}
            while len(stack) > 0 and stack[-1]['level'] >= h['level']:
                stack.pop()
            parent = stack[-1]['node']
            parent['children'].append(new_node)
            stack.append({'node': new_node, 'level': h['level']})
        return root['children']

    def render_children(children):
        if not children:
            return ''
        html_out = '<ul class="toc-list">'
        for node in children:
            html_out += f'<li data-id="{node["id"]}" class="toc-depth-{node["level"]}">'
            html_out += f'<a href="#{node["id"]}" class="toc-link">{html.escape(node["text"])}</a>'
            html_out += render_children(node['children'])
            html_out += '</li>'
        html_out += '</ul>'
        return html_out

    tree = build_tree(headings)
    return render_children(tree)

# ---------- 生成完整的文章 HTML ----------
def _create_html_page(title, date, content_html, headings_json, description, tags, author,
                      word_count, read_time_str, category, last_updated, modify_count):
    formatted_date = format_date(date)
    formatted_last_updated = format_date(last_updated) if last_updated else ""

    footer_tags_html = ""
    if tags:
        tag_links = []
        for tag in tags:
            tag_raw = tag.strip()
            if not tag_raw:
                continue
            display = f"#{html.escape(tag_raw)}"
            href = f"/articles/?tags={quote(tag_raw, safe='')}"
            tag_links.append(f'<a class="tag" href="{href}">{display}</a>')
        footer_tags_html = f'<div class="article-tags">{" ".join(tag_links)}</div>'

    meta_html = f'''
    <div class="article-meta-line">
        <span class="meta-item"><i class="fas fa-calendar-alt"></i> {formatted_date}</span>
        <span class="meta-item"><i class="fas fa-user"></i> {author if author else "高新炀"}</span>
        <span class="meta-item"><i class="fas fa-folder-open"></i> {html.escape(category) if category else "未分类"}</span>
        <span class="meta-item"><i class="fas fa-file-alt"></i> {word_count}字</span>
        <span class="meta-item"><i class="fas fa-clock"></i> {read_time_str}</span>
    </div>
    '''
    if formatted_last_updated:
        meta_html += f'<div class="article-meta-line article-meta-updated"><span class="meta-item"><i class="fas fa-edit"></i> 更新于 {formatted_last_updated}</span></div>'

    meta_description = description if description else f"{title} - GaoXinYang的文章"

    # 生成 TOC HTML
    headings = json.loads(headings_json) if headings_json else []
    toc_html = _render_toc_html(headings)

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="{meta_description}">
    <meta name="author" content="{author if author else 'GaoXinYang'}">
    {f'<meta name="keywords" content="{", ".join(tags) if tags else ""}">' if tags else ''}
    <title>{title} - 高新炀的小站</title>
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="/css/pages/article.css">
    <link rel="stylesheet" href="/css/components/comments.css">
</head>
<body>
<div id="loading-overlay" role="status" aria-label="页面加载中"><div class="loading-log"><div>[START] 正在等待 JavaScript，这可能需要几秒</div></div><div class="loading-glow"></div><div id="loading-content"><span class="loading-title">GaoXinYang</span></div></div>
    <div id="navbar-placeholder"></div>

    <div id="router-view">
        <div id="reading-progress" class="reading-progress-bar">
            <div id="progress-bar" class="progress-bar"></div>
        </div>

        <main class="article-grid">
            <article class="article-main">
                <div class="article-card">
                    <h1 class="article-title">{title}</h1>
                    {f'<p class="article-subtitle">{description}</p>' if description else ''}
                    {meta_html}

                    <div class="article-body" id="articleBody">{content_html}</div>

                    {footer_tags_html}
                </div>

                <div class="comments-card">
                    <h3>💬 评论</h3>
                    <div id="twikoo-comments"></div>
                </div>
            </article>

            <aside class="article-sidebar">
                <div class="sidebar-card toc-card">
                    <div class="toc-header">
                        <i class="fas fa-list-ul"></i>
                        <span>目录</span>
                    </div>
                    <nav class="toc-nav" id="toc-list-container">
                        {toc_html}
                    </nav>
                </div>

                <div class="sidebar-card info-card">
                    <div class="info-item">
                        <i class="fas fa-chart-line"></i>
                        <div>
                            <span class="info-label">阅读量</span>
                            <span class="info-value" id="vercount_value_page_pv">加载中...</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-users"></i>
                        <div>
                            <span class="info-label">访客数</span>
                            <span class="info-value" id="vercount_value_page_uv">加载中...</span>
                        </div>
                    </div>
                    {f'<div class="info-item"><i class="fas fa-code-branch"></i><div><span class="info-label">修订次数</span><span class="info-value">{modify_count}</span></div></div>' if modify_count is not None else ''}
                </div>
            </aside>
        </main>

        <div id="imageModal" class="image-modal">
            <span class="close">&times;</span>
            <img id="modalImage" src="" alt="">
        </div>
    </div>

    <div id="footer-placeholder"></div>

    <script>window.ARTICLE_HEADINGS = {headings_json};</script>
    <script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
    <script src="https://vercount.one/js" defer></script>
    <script src="/js/entry/main.js" type="module"></script>
    <script src="/js/pages/article.js" type="module"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.getElementById('articleBody'), {{delimiters: [{{left: '$$', right: '$$', display: true}}, {{left: '$', right: '$', display: false}}]}});"></script>
</body>
</html>'''

def _process_markdown_file(md_file_path: Path, old_article: Optional[Dict] = None, category: str = None) -> Article:
    with open(md_file_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    current_hash = compute_content_hash(md_content)
    rel_path = get_relative_path(md_file_path)

    # ---------- 初始化元数据（无论是否匹配，均赋默认值） ----------
    metadata = {}
    cleaned = md_content

    # ---------- 提取 frontmatter ----------
    frontmatter_pattern = r'^\s*---\s*\n([\s\S]+?)\n\s*---\s*\n([\s\S]*)$'
    match = re.match(frontmatter_pattern, md_content, re.MULTILINE)
    if match:
        meta_text = match.group(1)
        cleaned = match.group(2)
        if HAS_YAML:
            try:
                yaml_data = yaml.safe_load(meta_text)
                if isinstance(yaml_data, dict):
                    metadata = yaml_data
                    if 'date' in metadata and hasattr(metadata['date'], 'isoformat'):
                        metadata['date'] = metadata['date'].isoformat()
                    if 'tag' in metadata:
                        tags = metadata['tag']
                        if isinstance(tags, str):
                            metadata['tag'] = [t.strip() for t in re.split(r'[,\s]+', tags) if t.strip()]
                        elif isinstance(tags, list):
                            metadata['tag'] = [str(t).strip() for t in tags if str(t).strip()]
            except yaml.YAMLError:
                pass
        else:
            # 简易解析（当 yaml 不可用时）
            for line in meta_text.split('\n'):
                line = line.strip()
                if not line or ':' not in line:
                    continue
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()
                if key == 'tag':
                    tags = []
                    bracket = re.findall(r'\[([^\[\]]+)\]', value)
                    if bracket:
                        for m in bracket:
                            tags.extend([t.strip() for t in re.split(r'[,\s]+', m) if t.strip()])
                    else:
                        tags = [t.strip() for t in re.split(r'[,\s]+', value) if t.strip()]
                    metadata[key] = tags
                else:
                    metadata[key] = value

    # ---------- 类别处理 ----------
    if 'category' in metadata and metadata['category']:
        final_category = metadata['category']
    elif category:
        final_category = category
    else:
        final_category = md_file_path.parent.name if md_file_path.parent != ASSETS_SOURCE_DIR else "未分类"

    # ---------- 标题、日期等基本信息 ----------
    title = metadata.get('title', '未命名文章')
    date_raw = metadata.get('date', '')
    # 如果被解析为日期对象，转为 ISO 字符串
    if hasattr(date_raw, 'isoformat'):
        date_raw = date_raw.isoformat()
    if not date_raw:
        date = '未指定日期'
    else:
        date = format_date(date_raw, '')

    description = metadata.get('description', '')
    author = metadata.get('author', '高新炀')
    tags = metadata.get('tag', [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(',') if t.strip()]

    # ---------- 核心：last_updated 优先使用 frontmatter，否则自动 ----------
    manual_last_updated = metadata.get('last_updated', '')
    if hasattr(manual_last_updated, 'isoformat'):
        manual_last_updated = manual_last_updated.isoformat()
    if old_article:
        last_updated = old_article.get('last_updated', '')
        modify_count = old_article.get('modify_count', 0)
    else:
        last_updated = ''
        modify_count = 0

    today = get_current_date_iso()

    if manual_last_updated:
        # 使用手动日期
        last_updated = manual_last_updated
        if not old_article:
            modify_count = 1
        # 若旧文章存在，保留原 modify_count（不自动递增）
    else:
        # 自动检测
        if not old_article:
            last_updated = today
            modify_count = 1
        elif current_hash != old_article.get('hash', ''):
            last_updated = today
            modify_count += 1

    # ---------- 字数、阅读时间、目录 ----------
    word_count = count_words(cleaned)
    read_time = calculate_read_time(word_count)
    headings = _extract_headings(cleaned)
    content_html = _convert_markdown_to_html(cleaned, headings)
    headings_json = json.dumps(headings, ensure_ascii=False)

    # ---------- 隐藏判断 ----------
    hidden = "隐藏" in tags
    output_filename = md_file_path.stem + '.html'
    if hidden:
        output_path = ARTICLES_OUTPUT_DIR / ".hidden" / output_filename
        output_path.parent.mkdir(exist_ok=True)
    else:
        output_path = ARTICLES_OUTPUT_DIR / output_filename

    # ---------- 生成完整 HTML ----------
    full_html = _create_html_page(
        title, date, content_html, headings_json,
        description, tags, author, word_count, read_time,
        category=final_category, last_updated=last_updated, modify_count=modify_count
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_html)

    # ---------- 返回 Article 对象 ----------
    return Article(
        relative_path=rel_path,
        hash=current_hash,
        last_updated=last_updated,
        modify_count=modify_count,
        hidden=hidden,
        title=title,
        date=format_date_iso(date),
        description=description,
        author=author,
        tags=tags,
        category=final_category,
        url=f'/articles/{output_filename}' if not hidden else f'/articles/.hidden/{output_filename}',
        word_count=word_count,
        read_time=read_time
    )

def load_articles(force_refresh: bool = False) -> List[Article]:
    old_articles = load_json(JSON_OUTPUT_DIR / "articles.json", {})
    old_dict = {a['relative_path']: a for a in old_articles.get('articles', [])}
    new_articles = []
    changed_count = 0

    if ASSETS_SOURCE_DIR.exists():
        for category_dir in ASSETS_SOURCE_DIR.iterdir():
            if not category_dir.is_dir():
                continue
            cat_name = category_dir.name
            for md_file in category_dir.glob('*.md'):
                rel = get_relative_path(md_file)
                old = old_dict.get(rel)
                with open(md_file, 'r', encoding='utf-8') as f:
                    current_hash = compute_content_hash(f.read())
                if not force_refresh and old and old.get('hash') == current_hash:
                    article = Article(
                        relative_path=rel,
                        hash=old['hash'],
                        last_updated=old['last_updated'],
                        modify_count=old['modify_count'],
                        hidden=old.get('hidden', False),
                        title=old['title'],
                        date=old['date'],
                        description=old.get('description', ''),
                        author=old.get('author', '高新炀'),
                        tags=old.get('tags', []),
                        category=old.get('category', cat_name),
                        url=old['url'],
                        word_count=old.get('word_count', 0),
                        read_time=old.get('read_time', '')
                    )
                    new_articles.append(article)
                    continue
                try:
                    article = _process_markdown_file(md_file, old, category=cat_name)
                    new_articles.append(article)
                    changed_count += 1
                    if article.hidden:
                        log_info(f"文章 '{article.title}' 含有“隐藏”标签")
                except Exception as e:
                    log_error(f"处理失败 {md_file.name}: {e}")
    else:
        log_error(f"文章源目录不存在: {ASSETS_SOURCE_DIR}")

    # 处理 README.md（如果放置在项目根目录）
    readme_path = PROJECT_ROOT / "README.md"
    if readme_path.exists():
        rel = get_relative_path(readme_path)
        old = old_dict.get(rel)
        with open(readme_path, 'r', encoding='utf-8') as f:
            current_hash = compute_content_hash(f.read())
        if not force_refresh and old and old.get('hash') == current_hash:
            article = Article(
                relative_path=rel,
                hash=old['hash'],
                last_updated=old['last_updated'],
                modify_count=old['modify_count'],
                hidden=old.get('hidden', False),
                title=old.get('title', 'README'),
                date=old['date'],
                description=old.get('description', ''),
                author=old.get('author', '高新炀'),
                tags=old.get('tags', []),
                category=old.get('category', 'README文档自动构建'),
                url=old['url'],
                word_count=old.get('word_count', 0),
                read_time=old.get('read_time', '')
            )
            new_articles.append(article)
        else:
            try:
                article = _process_markdown_file(readme_path, old, category="README文档自动构建")
                if article.title == '未命名文章':
                    article.title = 'README'
                new_articles.append(article)
                changed_count += 1
            except Exception as e:
                log_error(f"处理 README.md 失败: {e}")

    existing_rels = {a.relative_path for a in new_articles}
    for rel, old in old_dict.items():
        if rel not in existing_rels:
            log_info(f"移除已删除文章: {old.get('title', rel)}")

    articles_data = {
        'generated_at': get_current_datetime_iso(),
        'total_articles': len([a for a in new_articles if not a.hidden]),
        'total_word_count': sum(a.word_count for a in new_articles if not a.hidden),
        'articles': [{
            'relative_path': a.relative_path,
            'hash': a.hash,
            'last_updated': a.last_updated,
            'modify_count': a.modify_count,
            'hidden': a.hidden,
            'title': a.title,
            'date': a.date,
            'description': a.description,
            'author': a.author,
            'tags': a.tags,
            'category': a.category,
            'url': a.url,
            'word_count': a.word_count,
            'read_time': a.read_time
        } for a in new_articles]
    }
    save_json(articles_data, JSON_OUTPUT_DIR / "articles.json")

    log_info(f"共加载 {len(new_articles)} 篇文章（含隐藏），其中变动 {changed_count} 篇")
    return new_articles

# ---------- 作品加载 ----------
def load_works() -> List[Work]:
    works_list = []
    works_root = WORKS_SRC_DIR
    if not works_root.exists():
        log_warning(f"作品目录不存在: {works_root}")
        return works_list

    for subdir in works_root.iterdir():
        if not subdir.is_dir():
            continue
        title = subdir.name
        metadata_path = subdir / "metadata.json"
        description = ""
        author = ""
        date = ""
        tag = []
        link = ""
        if metadata_path.exists():
            meta = load_json(metadata_path, {})
            description = meta.get("description", "")
            author = meta.get("author", "")
            date = meta.get("date", "")
            tag = meta.get("tag", [])
            link = meta.get("link", "")
        if isinstance(tag, str):
            tag = [t.strip() for t in re.split(r'[,\s，、]+', tag) if t.strip()]
        elif not isinstance(tag, list):
            tag = [str(tag)] if tag else []
        if not date:
            date = "未指定日期"
        if not link.strip():
            link = f"/works/{title}/"
        if "隐藏" in tag:
            log_info(f"作品 '{title}' 含有“隐藏”标签，已排除")
            continue
        works_list.append(Work(
            title=title,
            description=description,
            author=author,
            date=date,
            tag=tag,
            link=link
        ))

    works_list.sort(key=lambda x: x.date, reverse=True)
    log_info(f"加载到 {len(works_list)} 个作品")
    return works_list

# ---------- 友链加载 ----------
def load_friends() -> List[Friend]:
    friends_src = ASSETS_DIR / "friends.json"
    data = load_json(friends_src, {})
    if isinstance(data, list):
        friends_data = data
    elif isinstance(data, dict):
        friends_data = data.get("friends", [])
    else:
        friends_data = []
    friends = []
    for f in friends_data:
        if f.get("name") and f.get("link"):
            friends.append(Friend(
                name=f.get("name"),
                link=f.get("link"),
                desc=f.get("desc", ""),
                avatar=f.get("avatar", "")
            ))
    log_info(f"加载到 {len(friends)} 条友链")
    return friends

# ---------- 全量加载 ----------
def load_all(force_articles: bool = False, force_version: bool = False) -> BuildContext:
    log_info("开始加载所有输入数据...")
    ctx = BuildContext()
    ctx.articles = load_articles(force_refresh=force_articles)
    ctx.works = load_works()
    ctx.friends = load_friends()
    ctx.version = load_version(force=force_version)
    log_info("所有数据加载完成")
    return ctx