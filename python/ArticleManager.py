#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import html
import math
import os
import re
import sys
import json
import hashlib
import logging
from pathlib import Path
from datetime import datetime
from urllib.parse import quote
from typing import Dict, List, Optional

try:
    import markdown
except ImportError:
    print("[错误] 请先安装markdown库: pip install markdown")
    sys.exit(1)

# 可选 YAML 支持（更可靠的 frontmatter 解析）
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# 删除线扩展 (~~text~~)
try:
    from markdown.extensions import Extension
    from markdown.inlinepatterns import SimpleTagInlineProcessor

    class StrikeExtension(Extension):
        def extendMarkdown(self, md):
            STRIKE_RE = r'(~~)(.+?)(~~)'
            md.inlinePatterns.register(SimpleTagInlineProcessor(STRIKE_RE, 'del'), 'strikethrough', 175)
except Exception:
    StrikeExtension = None

# ========== 配置日志 ==========
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
log_info = logging.info
log_warning = logging.warning
log_error = logging.error

# ========== 路径配置 ==========
PROJECT_ROOT = Path(__file__).parent.parent          # 项目根目录
SOURCE_DIR = PROJECT_ROOT / "articles" / "source"    # 分类源目录（内含子目录）
HTML_OUTPUT_DIR = PROJECT_ROOT / "articles"          # HTML输出目录
JSON_OUTPUT_DIR = PROJECT_ROOT / "json"              # JSON输出目录

# 确保目录存在
HTML_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
JSON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 文章数据统一存储文件（包含元数据、哈希、更新日期、修改次数、隐藏标记）
ARTICLES_JSON_PATH = JSON_OUTPUT_DIR / "articles.json"

# ========== 配置常量 ==========
WORDS_PER_MINUTE = 300  # 阅读速度（字/分钟）
LAZY_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"

# ========== 文章数据读写 ==========
def load_articles() -> List[dict]:
    """加载 articles.json，返回文章列表（若文件不存在则返回空列表）"""
    if ARTICLES_JSON_PATH.exists():
        with open(ARTICLES_JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('articles', [])
    return []

def save_articles(articles: List[dict]) -> None:
    """
    保存文章列表到 articles.json，自动计算统计数据（排除 hidden 文章）。
    每篇文章需包含 relative_path、hash、last_updated、modify_count、hidden 等字段。
    """
    # 统计非隐藏文章
    visible_articles = [a for a in articles if not a.get('hidden', False)]
    total_articles = len(visible_articles)
    total_word_count = sum(a.get('word_count', 0) for a in visible_articles)

    json_data = {
        'generated_at': datetime.now().isoformat(),
        'total_articles': total_articles,
        'total_word_count': total_word_count,
        'articles': sorted(articles, key=lambda x: x.get('date', ''), reverse=True)
    }
    with open(ARTICLES_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    log_info(f"已保存文章索引到 {ARTICLES_JSON_PATH}")

def compute_content_hash(content: str) -> str:
    """计算文本内容的 MD5 哈希值"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def get_relative_path(file_path: Path) -> str:
    """获取相对于项目根目录的路径，用作文章的唯一标识"""
    return file_path.relative_to(PROJECT_ROOT).as_posix()

# ========== 改进的元数据处理 ==========
def extract_metadata(content: str) -> tuple[Dict[str, str], str]:
    """
    从markdown内容中提取元数据。
    支持两种格式：
    1. 标准 YAML frontmatter (--- ... ---) —— 推荐
    2. 旧版简单键值对（兼容）
    """
    frontmatter_pattern = r'^\s*---\s*\n([\s\S]+?)\n\s*---\s*\n([\s\S]*)$'
    match = re.match(frontmatter_pattern, content, re.MULTILINE)

    if match:
        meta_text = match.group(1)
        cleaned_content = match.group(2)
        metadata = {}

        if HAS_YAML:
            try:
                yaml_data = yaml.safe_load(meta_text)
                if isinstance(yaml_data, dict):
                    metadata = yaml_data
                    # 标准化 tag 字段
                    if 'tag' in metadata:
                        tags = metadata['tag']
                        if isinstance(tags, str):
                            metadata['tag'] = [t.strip() for t in re.split(r'[,\s]+', tags) if t.strip()]
                        elif isinstance(tags, list):
                            metadata['tag'] = [str(t).strip() for t in tags if str(t).strip()]
                    return metadata, cleaned_content
            except yaml.YAMLError:
                # YAML 解析失败，回退到简单解析
                pass

        # 降级解析：手工解析键值对
        for line in meta_text.split('\n'):
            line = line.strip()
            if not line or ':' not in line:
                continue
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            if key == 'tag':
                tags = []
                bracket_pattern = r'\[([^\[\]]+)\]'
                bracket_matches = re.findall(bracket_pattern, value)
                if bracket_matches:
                    for m in bracket_matches:
                        sub_tags = [t.strip() for t in re.split(r'[,\s]+', m) if t.strip()]
                        tags.extend(sub_tags)
                else:
                    tags = [t.strip() for t in re.split(r'[,\s]+', value) if t.strip()]
                metadata[key] = tags
            else:
                metadata[key] = value

        return metadata, cleaned_content

    return {}, content

def extract_headings(content: str) -> List[Dict]:
    """提取所有标题，用于生成目录"""
    heading_pattern = r'^(#{1,4})\s+(.+?)\s*$'
    headings = []
    seen = {}

    def slugify(text: str) -> str:
        s = re.sub(r'<[^>]+>', '', text)
        s = s.strip().lower()
        s = re.sub(r"[\s]+", '-', s)
        s = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff\-]", '', s)
        s = re.sub(r'-{2,}', '-', s).strip('-')
        return s or 'heading'

    for line in content.split('\n'):
        match = re.match(heading_pattern, line)
        if match:
            level = len(match.group(1))
            text = match.group(2).strip()
            base_id = slugify(text)
            count = seen.get(base_id, 0)
            heading_id = f"{base_id}-{count}" if count else base_id
            seen[base_id] = count + 1
            headings.append({'level': level, 'text': text, 'id': heading_id})

    return headings

def add_heading_ids(content: str, headings: List[Dict]) -> str:
    """为内容中的标题添加id属性（支持 attr_list 扩展语法）"""
    lines = content.split('\n')
    heading_pattern = r'^(#{1,4})\s+(.+?)\s*$'
    idx = 0

    for i, line in enumerate(lines):
        match = re.match(heading_pattern, line)
        if match and idx < len(headings):
            heading_id = headings[idx]['id']
            heading_text = match.group(2)
            # 使用 attr_list 扩展语法 {#id}
            lines[i] = f"{match.group(1)} {heading_text} {{#{heading_id}}}"
            idx += 1

    return '\n'.join(lines)

def convert_markdown_to_html(md_content: str) -> str:
    """markdown转HTML，支持列表缩进、删除线、脚注"""
    extensions = [
        'extra', 'codehilite', 'sane_lists', 'fenced_code', 'attr_list', 'footnotes'
    ]
    if StrikeExtension is not None:
        extensions.append(StrikeExtension())

    html_content = markdown.markdown(md_content, extensions=extensions, tab_length=2)

    # 图片懒加载（仅替换未标记 data-src 的图片）
    # 改进正则：避免影响已有 data-src 或 srcset 的标签
    html_content = re.sub(
        r'<img\s+([^>]*?)src=(["\'])([^"\']+)\2([^>]*)>',
        lambda m: f'<img {m.group(1)}data-src={m.group(2)}{m.group(3)}{m.group(2)} src="{LAZY_PLACEHOLDER}" class="lazy-image" {m.group(4)}>',
        html_content
    )
    return html_content

def calculate_read_time(word_count: int) -> str:
    """根据字数计算阅读时间"""
    if word_count <= 0:
        return "<1分钟"
    minutes = max(1, math.ceil(word_count / WORDS_PER_MINUTE))
    return f"{minutes}分钟"

def count_words(text: str) -> int:
    """统计非空白字符数"""
    return len(re.sub(r'\s+', '', text))

def format_date(date_str: str) -> str:
    """将 YYYY-MM-DD 格式转为 YYYY年MM月DD日，其他原样返回"""
    if not date_str or date_str == "未指定":
        return datetime.now().strftime("%Y年%m月%d日")
    try:
        if re.match(r'\d{4}-\d{1,2}-\d{1,2}', date_str):
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime("%Y年%m月%d日")
    except:
        pass
    return date_str

def create_html_page(title: str, date: str, content_html: str, headings_json: str,
                     description: str = "", tags: Optional[List] = None, author: str = "",
                     word_count: int = 0, read_time_str: str = None, category: str = "",
                     last_updated: str = None, modify_count: int = None) -> str:
    """生成完整HTML页面，增加最后更新日期和修改次数显示"""
    if read_time_str is None:
        read_time_str = calculate_read_time(word_count)

    formatted_date = format_date(date)
    formatted_last_updated = format_date(last_updated) if last_updated else ""

    # 标签HTML（正文末尾）
    footer_tags_html = ""
    if tags:
        tag_links = []
        for tag in tags:
            tag_raw = tag.strip()
            if not tag_raw:
                continue
            display_text = f"#{html.escape(tag_raw)}"
            param_value = quote(tag_raw, safe='')
            href = f"/articles.html?tags={param_value}"
            tag_links.append(
                f'<a class="footer-tag" href="{href}" style="text-decoration: none; color: inherit; cursor: pointer;" '
                f'title="查看「{html.escape(tag_raw)}」相关文章">{display_text}</a>'
            )
        footer_tags_html = f'<div class="article-footer-tags">{" ".join(tag_links)}</div>'

    subtitle_html = f'<div class="article-subtitle">{description}</div>' if description else ""

    # 构建元数据网格
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
    <script src="/js/busuanzi.min.js" defer></script>
    <script src="/js/script.js"></script>
    <script src="/js/article.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script src="https://registry.npmmirror.com/twikoo/1.7.7/files/dist/twikoo.nocss.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {{
            if (typeof twikoo !== 'undefined') {{
                twikoo.init({{ envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo', el: '#twikoo-comments', path: window.location.pathname, lang: 'zh-CN' }});
            }} else {{ console.warn('Twikoo 加载失败'); }}
        }});
    </script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.getElementById('articleBody'), {{delimiters: [{{left: '$$', right: '$$', display: true}}, {{left: '$', right: '$', display: false}}]}});"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/mermaid@10.4.0/dist/mermaid.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {{
            if (window.mermaid) {{
                window.mermaid.initialize({{ startOnLoad: false }});
                document.querySelectorAll('.mermaid').forEach(el => {{
                    try {{ window.mermaid.init(undefined, el); }} catch(e) {{ console.warn(e); }}
                }});
            }}
        }});
    </script>
</body>
</html>'''

def process_markdown_file(md_file_path: Path, old_article: Optional[dict] = None, category: str = None) -> dict:
    """
    处理单个markdown文件，生成HTML，返回文章信息（包含状态字段）。
    若提供 old_article，则复用其中的历史状态（哈希、修改次数等），避免重复读取全局索引。
    """
    log_info(f"处理文件: {md_file_path}")

    with open(md_file_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    current_hash = compute_content_hash(md_content)
    relative_path = get_relative_path(md_file_path)

    # 状态继承
    if old_article:
        old_hash = old_article.get('hash', '')
        last_updated = old_article.get('last_updated', '')
        modify_count = old_article.get('modify_count', 0)
    else:
        old_hash = ''
        last_updated = ''
        modify_count = 0

    is_updated = (current_hash != old_hash)
    today_str = datetime.now().strftime('%Y-%m-%d')

    if not old_article:          # 新文件
        last_updated = today_str
        modify_count = 1
    elif is_updated:             # 内容发生变更
        last_updated = today_str
        modify_count += 1

    metadata, cleaned_content = extract_metadata(md_content)

    # 确定分类
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

    word_count = count_words(cleaned_content)
    read_time_str = calculate_read_time(word_count)

    headings = extract_headings(cleaned_content)
    content_with_ids = add_heading_ids(cleaned_content, headings)
    content_html = convert_markdown_to_html(content_with_ids)
    headings_json = json.dumps(headings, ensure_ascii=False)

    # 判断隐藏（通过标签）
    hidden = "隐藏" in tags

    # 生成 HTML 文件（隐藏文章仍生成，但可放入隐藏目录，也可选择跳过）
    output_filename = md_file_path.stem + '.html'
    if hidden:
        # 隐藏文章放入 .hidden 子目录（可选，避免被直接访问）
        output_path = HTML_OUTPUT_DIR / ".hidden" / output_filename
        output_path.parent.mkdir(exist_ok=True)
    else:
        output_path = HTML_OUTPUT_DIR / output_filename

    full_html = create_html_page(
        title, date, content_html, headings_json,
        description, tags, author, word_count, read_time_str,
        category=final_category,
        last_updated=last_updated,
        modify_count=modify_count
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_html)
    log_info(f"已生成: {output_path}")

    return {
        'relative_path': relative_path,
        'hash': current_hash,
        'last_updated': last_updated,
        'modify_count': modify_count,
        'hidden': hidden,
        'title': title,
        'date': date,
        'description': description,
        'author': author if author else '高新炀',
        'tags': tags,
        'category': final_category,
        'url': f'/articles/{output_filename}' if not hidden else f'/articles/.hidden/{output_filename}',
        'word_count': word_count,
        'read_time': read_time_str
    }

def process_all_markdown_files() -> List[dict]:
    """批量处理所有 markdown 文件，使用内存字典减少 IO 次数"""
    # 一次性加载现有索引
    old_articles_list = load_articles()
    articles_dict = {a['relative_path']: a for a in old_articles_list}

    all_md_paths = set()
    new_articles_dict = {}

    if not SOURCE_DIR.exists():
        log_error(f"文章源目录不存在: {SOURCE_DIR}")
        return []

    for category_dir in SOURCE_DIR.iterdir():
        if not category_dir.is_dir():
            continue
        category_name = category_dir.name
        md_files = list(category_dir.glob('*.md'))
        if not md_files:
            log_warning(f"分类 '{category_name}' 目录下没有 .md 文件，跳过")
            continue
        log_info(f"处理分类: {category_name} (共 {len(md_files)} 个文件)")
        for md_file in md_files:
            rel_path = get_relative_path(md_file)
            all_md_paths.add(rel_path)
            old = articles_dict.get(rel_path)
            try:
                article_info = process_markdown_file(md_file, old_article=old, category=category_name)
                new_articles_dict[rel_path] = article_info
                if article_info.get('hidden'):
                    log_info(f"文章 '{article_info['title']}' 含有“隐藏”标签，将在索引中标记为 hidden")
            except Exception as e:
                log_error(f"处理失败 {md_file.name}: {e}")
        print("-" * 40)

    # 合并：保留仍存在的文章，新生成的文章覆盖旧信息
    final_articles = []
    for rel_path, info in new_articles_dict.items():
        final_articles.append(info)
    # 清理已删除文件的记录
    for rel_path, old_info in articles_dict.items():
        if rel_path not in all_md_paths:
            log_info(f"移除已删除文章: {old_info.get('title', rel_path)}")
    # 最终保存
    save_articles(final_articles)
    log_info(f"共处理 {len(final_articles)} 篇文章（含隐藏）")
    return final_articles

def main():
    print("=" * 60)
    log_info("文章管理器启动（优化版：批量处理 + YAML frontmatter 支持）")
    print("=" * 60)

    if len(sys.argv) > 1:
        # 单文件处理模式（保持向后兼容，但推荐使用批量模式）
        md_file_path = Path(sys.argv[1])
        if md_file_path.exists() and md_file_path.suffix == '.md':
            # 尝试推断分类
            if SOURCE_DIR in md_file_path.parents and md_file_path.parent != SOURCE_DIR:
                inferred_category = md_file_path.parent.name
            else:
                inferred_category = "未分类"
            # 加载已有索引以获取旧状态
            old_articles = load_articles()
            rel_path = get_relative_path(md_file_path)
            old = next((a for a in old_articles if a.get('relative_path') == rel_path), None)
            article_info = process_markdown_file(md_file_path, old_article=old, category=inferred_category)
            # 更新索引
            new_articles = [a for a in old_articles if a.get('relative_path') != rel_path]
            new_articles.append(article_info)
            save_articles(new_articles)
        else:
            log_error(f"文件不存在或不是markdown文件: {md_file_path}")
    else:
        process_all_markdown_files()

    log_info("文章管理器完成")

if __name__ == "__main__":
    main()