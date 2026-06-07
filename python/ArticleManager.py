#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import html
import json
import re
import sys
from pathlib import Path
from datetime import datetime
from urllib.parse import quote
from typing import Dict, List, Optional

try:
    import markdown
except ImportError:
    print("[错误] 请先安装markdown库: pip install markdown")
    sys.exit(1)

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

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

from common import (
    PROJECT_ROOT, SOURCE_DIR, HTML_OUTPUT_DIR, JSON_OUTPUT_DIR,
    log_info, log_warning, log_error,
    format_date, get_current_date_iso, get_current_datetime_iso,
    compute_content_hash, get_relative_path, slugify,
    count_words, calculate_read_time, load_json, save_json, ensure_dir
)

ARTICLES_JSON_PATH = JSON_OUTPUT_DIR / "articles.json"
LAZY_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"

# ----------------------------------------------------------------------
def load_articles() -> List[dict]:
    data = load_json(ARTICLES_JSON_PATH, {})
    return data.get('articles', [])

def save_articles(articles: List[dict]) -> None:
    visible = [a for a in articles if not a.get('hidden', False)]
    data = {
        'generated_at': get_current_datetime_iso(),
        'total_articles': len(visible),
        'total_word_count': sum(a.get('word_count', 0) for a in visible),
        'articles': sorted(articles, key=lambda x: x.get('date', ''), reverse=True)
    }
    save_json(data, ARTICLES_JSON_PATH)

# ----------------------------------------------------------------------
def extract_metadata(content: str) -> tuple[Dict[str, str], str]:
    frontmatter_pattern = r'^\s*---\s*\n([\s\S]+?)\n\s*---\s*\n([\s\S]*)$'
    match = re.match(frontmatter_pattern, content, re.MULTILINE)

    if match:
        meta_text = match.group(1)
        cleaned = match.group(2)
        metadata = {}

        if HAS_YAML:
            try:
                yaml_data = yaml.safe_load(meta_text)
                if isinstance(yaml_data, dict):
                    metadata = yaml_data
                    # 修复：将 datetime.date/datetime 对象转为字符串
                    if 'date' in metadata:
                        date_val = metadata['date']
                        if hasattr(date_val, 'isoformat'):
                            metadata['date'] = date_val.isoformat()
                    if 'tag' in metadata:
                        tags = metadata['tag']
                        if isinstance(tags, str):
                            metadata['tag'] = [t.strip() for t in re.split(r'[,\s]+', tags) if t.strip()]
                        elif isinstance(tags, list):
                            metadata['tag'] = [str(t).strip() for t in tags if str(t).strip()]
                    return metadata, cleaned
            except yaml.YAMLError:
                pass

        # 降级解析（保持不变）
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
        return metadata, cleaned

    return {}, content

def extract_headings(content: str) -> List[Dict]:
    headings = []
    seen = {}
    for line in content.split('\n'):
        m = re.match(r'^(#{1,4})\s+(.+?)\s*$', line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            base_id = slugify(text)
            cnt = seen.get(base_id, 0)
            hid = f"{base_id}-{cnt}" if cnt else base_id
            seen[base_id] = cnt + 1
            headings.append({'level': level, 'text': text, 'id': hid})
    return headings

def add_heading_ids(content: str, headings: List[Dict]) -> str:
    lines = content.split('\n')
    idx = 0
    for i, line in enumerate(lines):
        m = re.match(r'^(#{1,4})\s+(.+?)\s*$', line)
        if m and idx < len(headings):
            lines[i] = f"{m.group(1)} {m.group(2)} {{#{headings[idx]['id']}}}"
            idx += 1
    return '\n'.join(lines)

def convert_markdown_to_html(md_content: str) -> str:
    extensions = ['extra', 'codehilite', 'sane_lists', 'fenced_code', 'attr_list', 'footnotes']
    if StrikeExtension is not None:
        extensions.append(StrikeExtension())
    html_content = markdown.markdown(md_content, extensions=extensions, tab_length=2)
    # 图片懒加载
    html_content = re.sub(
        r'<img\s+([^>]*?)src=(["\'])([^"\']+)\2([^>]*)>',
        lambda m: f'<img {m.group(1)}data-src={m.group(2)}{m.group(3)}{m.group(2)} src="{LAZY_PLACEHOLDER}" class="lazy-image" {m.group(4)}>',
        html_content
    )
    return html_content

def create_html_page(title: str, date: str, content_html: str, headings_json: str,
                     description: str = "", tags: Optional[List] = None, author: str = "",
                     word_count: int = 0, read_time_str: str = None, category: str = "",
                     last_updated: str = None, modify_count: int = None) -> str:
    if read_time_str is None:
        read_time_str = calculate_read_time(word_count)

    formatted_date = format_date(date)
    formatted_last_updated = format_date(last_updated) if last_updated else ""

    # 标签 HTML
    footer_tags_html = ""
    if tags:
        tag_links = []
        for tag in tags:
            tag_raw = tag.strip()
            if not tag_raw:
                continue
            display = f"#{html.escape(tag_raw)}"
            href = f"/articles.html?tags={quote(tag_raw, safe='')}"
            tag_links.append(
                f'<a class="footer-tag" href="{href}" style="text-decoration: none; color: inherit; cursor: pointer;" '
                f'title="查看「{html.escape(tag_raw)}」相关文章">{display}</a>'
            )
        footer_tags_html = f'<div class="article-footer-tags">{" ".join(tag_links)}</div>'

    subtitle_html = f'<div class="article-subtitle">{description}</div>' if description else ""

    meta_items = [
        ('发布日期', 'fas fa-calendar-alt', formatted_date),
        ('作者', 'fas fa-user', author if author else "高新炀"),
        ('分类', 'fas fa-folder-open', html.escape(category) if category else "未分类"),
        ('字数', 'fas fa-file-alt', str(word_count)),
        ('阅读时间', 'fas fa-clock', read_time_str),
        ('访客数', 'fas fa-users', '<span id="busuanzi_page_uv">加载中...</span>'),
        ('阅读量', 'fas fa-eye', '<span id="busuanzi_page_pv">加载中...</span>')
    ]
    if formatted_last_updated:
        meta_items.insert(1, ('最后更新', 'fas fa-edit', formatted_last_updated))
    if modify_count is not None:
        meta_items.append(('修订次数', 'fas fa-code-branch', str(modify_count)))

    meta_html = '<div class="article-meta" id="articleMeta"><div class="meta-grid">'
    for label, icon, value in meta_items:
        meta_html += f'''
            <div class="meta-item" data-label="{label}">
                <i class="{icon}"></i>
                <span class="meta-value">{value}</span>
            </div>'''
    meta_html += '</div></div>'

    meta_description = description if description else f"{title} - GaoXinYang的文章"

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="{meta_description}">
    <meta name="author" content="{author if author else 'GaoXinYang'}">
    {f'<meta name="keywords" content="{", ".join(tags) if tags else ""}">' if tags else ''}
    <title>{title} - 高新炀的小站</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="/css/article.css">
    <link rel="stylesheet" href="/css/twikoo.css">
</head>
<body>
    <div id="navbar-placeholder"></div>
    <div id="reading-progress" class="reading-progress-bar"><div id="progress-bar" class="progress-bar"></div></div>
    <div class="article-page-container">
        <div class="toc-container"><h2 class="toc-title">目录</h2><div id="toc-list-container"></div></div>
        <div class="article-right-column">
            <div class="article-content-wrapper">
                <h1 class="article-title" id="articleTitle">{title}</h1>
                {subtitle_html}
                {meta_html}
                <div class="article-body" id="articleBody">{content_html}</div>
                {footer_tags_html}
            </div>
            <div class="comments-card"><div class="comments-container"><h3>评论区</h3><div id="twikoo-comments"></div></div></div>
        </div>
    </div>
    <div id="imageModal" class="image-modal"><span class="close">&times;</span><div class="modal-content"><img id="modalImage" src="" alt=""></div><div class="image-info"><span id="imageCaption"></span></div></div>
    <div id="footer-placeholder"></div>
    <script>window.ARTICLE_HEADINGS = {headings_json};</script>
    <script src="https://kit.fontawesome.com/a3c3c05703.js" crossorigin="anonymous"></script>
    <script src="/js/vendor/busuanzi.min.js" defer></script>
    <script src="/js/entry/main.js" type="module"></script>
    <script src="/js/pages/article.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script src="https://registry.npmmirror.com/twikoo/1.7.11/files/dist/twikoo.nocss.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {{
            if (typeof twikoo !== 'undefined') {{
                twikoo.init({{ envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo', el: '#twikoo-comments', path: window.location.pathname, lang: 'zh-CN' }});
            }} else {{ console.warn('Twikoo 加载失败'); }}
        }});
    </script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.getElementById('articleBody'), {{delimiters: [{{left: '$$', right: '$$', display: true}}, {{left: '$', right: '$', display: false}}]}});"></script>
</body>
</html>'''

def process_markdown_file(md_file_path: Path, old_article: Optional[dict] = None, category: str = None) -> dict:
    log_info(f"处理文件: {md_file_path}")
    with open(md_file_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    current_hash = compute_content_hash(md_content)
    rel_path = get_relative_path(md_file_path)

    # 状态继承
    if old_article:
        old_hash = old_article.get('hash', '')
        last_updated = old_article.get('last_updated', '')
        modify_count = old_article.get('modify_count', 0)
    else:
        old_hash = ''
        last_updated = ''
        modify_count = 0

    today = get_current_date_iso()
    if not old_article:
        last_updated = today
        modify_count = 1
    elif current_hash != old_hash:
        last_updated = today
        modify_count += 1

    metadata, cleaned = extract_metadata(md_content)

    # 分类决定
    if 'category' in metadata and metadata['category']:
        final_category = metadata['category']
    elif category:
        final_category = category
    else:
        final_category = md_file_path.parent.name if md_file_path.parent != SOURCE_DIR else "未分类"

    title = metadata.get('title', '未命名文章')
    date = metadata.get('date', '未指定日期')
    description = metadata.get('description', '')
    author = metadata.get('author', '')
    tags = metadata.get('tag', [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(',') if t.strip()]

    word_count = count_words(cleaned)
    read_time = calculate_read_time(word_count)

    headings = extract_headings(cleaned)
    content_with_ids = add_heading_ids(cleaned, headings)
    content_html = convert_markdown_to_html(content_with_ids)
    headings_json = json.dumps(headings, ensure_ascii=False)

    hidden = "隐藏" in tags
    output_filename = md_file_path.stem + '.html'
    if hidden:
        output_path = HTML_OUTPUT_DIR / ".hidden" / output_filename
        output_path.parent.mkdir(exist_ok=True)
    else:
        output_path = HTML_OUTPUT_DIR / output_filename

    full_html = create_html_page(
        title, date, content_html, headings_json,
        description, tags, author, word_count, read_time,
        category=final_category, last_updated=last_updated, modify_count=modify_count
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_html)
    log_info(f"已生成: {output_path}")

    return {
        'relative_path': rel_path,
        'hash': current_hash,
        'last_updated': last_updated,
        'modify_count': modify_count,
        'hidden': hidden,
        'title': title,
        'date': format_date(date, ""),
        'description': description,
        'author': author if author else '高新炀',
        'tags': tags,
        'category': final_category,
        'url': f'/articles/{output_filename}' if not hidden else f'/articles/.hidden/{output_filename}',
        'word_count': word_count,
        'read_time': read_time
    }

def process_all_markdown_files() -> List[dict]:
    old_articles = load_articles()
    articles_dict = {a['relative_path']: a for a in old_articles}

    all_md_paths = set()
    new_articles = {}

    # 处理分类目录
    if SOURCE_DIR.exists():
        for category_dir in SOURCE_DIR.iterdir():
            if not category_dir.is_dir():
                continue
            cat_name = category_dir.name
            for md_file in category_dir.glob('*.md'):
                rel = get_relative_path(md_file)
                all_md_paths.add(rel)
                old = articles_dict.get(rel)
                try:
                    info = process_markdown_file(md_file, old, category=cat_name)
                    new_articles[rel] = info
                    if info.get('hidden'):
                        log_info(f"文章 '{info['title']}' 含有“隐藏”标签，将在索引中标记为 hidden")
                except Exception as e:
                    log_error(f"处理失败 {md_file.name}: {e}")
    else:
        log_error(f"文章源目录不存在: {SOURCE_DIR}")

    # 处理根目录 README.md
    readme_path = PROJECT_ROOT / "README.md"
    if readme_path.exists():
        rel = get_relative_path(readme_path)
        all_md_paths.add(rel)
        old = articles_dict.get(rel)
        try:
            info = process_markdown_file(readme_path, old, category="README文档自动构建")
            if info['title'] == '未命名文章':
                info['title'] = 'README'
            new_articles[rel] = info
        except Exception as e:
            log_error(f"处理 README.md 失败: {e}")

    final_list = list(new_articles.values())
    # 删除已不存在的文章记录
    for rel, old in articles_dict.items():
        if rel not in all_md_paths:
            log_info(f"移除已删除文章: {old.get('title', rel)}")

    save_articles(final_list)
    log_info(f"共处理 {len(final_list)} 篇文章（含隐藏）")
    return final_list

def main():
    print("=" * 60)
    log_info("文章管理器启动")
    print("=" * 60)

    if len(sys.argv) > 1:
        md_file = Path(sys.argv[1])
        if md_file.exists() and md_file.suffix == '.md':
            if SOURCE_DIR in md_file.parents and md_file.parent != SOURCE_DIR:
                inferred_cat = md_file.parent.name
            else:
                inferred_cat = "未分类"
            old_list = load_articles()
            rel = get_relative_path(md_file)
            old = next((a for a in old_list if a.get('relative_path') == rel), None)
            info = process_markdown_file(md_file, old, category=inferred_cat)
            new_list = [a for a in old_list if a.get('relative_path') != rel]
            new_list.append(info)
            save_articles(new_list)
        else:
            log_error(f"文件不存在或不是markdown文件: {md_file}")
    else:
        process_all_markdown_files()

    log_info("文章管理器完成")

if __name__ == "__main__":
    main()