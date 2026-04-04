# markdown2html.py
import html
import math
import os
import re
import sys
import json
from pathlib import Path
from datetime import datetime

# 尝试导入markdown库，如果没有则提示安装
try:
    import markdown
except ImportError:
    print("请先安装markdown库: pip install markdown")
    sys.exit(1)

# 配置路径
BASE_DIR = Path(__file__).parent  # 脚本所在目录
ARTICLES_DIR = BASE_DIR / "articles" / "articles"  # md文件所在目录
OUTPUT_DIR = BASE_DIR / "articles"  # HTML输出目录（与css/js同目录）

# 确保输出目录存在
OUTPUT_DIR.mkdir(exist_ok=True)


def extract_metadata(content: str) -> tuple[dict[str, str], str]:
    """
    从markdown内容中提取元数据（---格式）
    返回: (metadata_dict, cleaned_content)
    支持: title, date, description, tag, author 等字段
    """
    # 匹配 --- ... --- 格式的元数据（YAML front matter）
    meta_pattern = r'^\s*---\s*\n([\s\S]+?)\n\s*---\s*\n([\s\S]*)$'
    match = re.match(meta_pattern, content, re.MULTILINE)

    if match:
        meta_content = match.group(1)
        cleaned_content = match.group(2)
        metadata = {}

        for line in meta_content.split('\n'):
            line = line.strip()
            if not line:
                continue
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()

                # 处理 tag 字段（可能包含多个标签）
                if key == 'tag':
                    # 支持多种格式: [tag1][tag2] 或 [tag1, tag2] 或 tag1, tag2
                    tags = []
                    # 处理 [tag1][tag2] 格式
                    bracket_pattern = r'\[([^\[\]]+)\]'
                    bracket_matches = re.findall(bracket_pattern, value)
                    if bracket_matches:
                        for match in bracket_matches:
                            sub_tags = [t.strip() for t in re.split(r'[,\s]+', match) if t.strip()]
                            tags.extend(sub_tags)
                    else:
                        # 处理普通逗号分隔格式
                        tags = [t.strip() for t in re.split(r'[,\s]+', value) if t.strip()]
                    metadata[key] = tags
                else:
                    metadata[key] = value

        return metadata, cleaned_content

    # 如果没有元数据，返回空字典和原内容
    return {}, content


def extract_headings(content: str) -> list:
    """
    提取所有标题，用于生成目录
    返回: [{'level': 1, 'text': '标题', 'id': 'heading-0'}, ...]
    """
    heading_pattern = r'^(#{1,4})\s+(.+)$'
    headings = []
    heading_counter = 0

    for line in content.split('\n'):
        match = re.match(heading_pattern, line)
        if match:
            heading_level = len(match.group(1))
            heading_text = match.group(2).strip()
            heading_id = f"heading-{heading_counter}"
            heading_counter += 1

            headings.append({
                'level': heading_level,
                'text': heading_text,
                'id': heading_id
            })

    return headings


def add_heading_ids(content: str, headings: list) -> str:
    """
    为内容中的标题添加id属性
    """
    lines = content.split('\n')
    heading_pattern = r'^(#{1,4})\s+(.+)$'
    heading_idx = 0

    for i, line in enumerate(lines):
        match = re.match(heading_pattern, line)
        if match:
            if heading_idx < len(headings):
                heading_id = headings[heading_idx]['id']
                heading_level = len(match.group(1))
                heading_text = match.group(2)
                lines[i] = f'<h{heading_level} id="{heading_id}">{heading_text}</h{heading_level}>'
                heading_idx += 1

    return '\n'.join(lines)


def convert_markdown_to_html(md_content: str) -> str:
    """
    将markdown内容转换为HTML，通过 sane_lists 扩展原生支持两空格缩进的列表
    """
    # 配置markdown扩展
    extensions = [
        'extra',           # 支持表格、脚注等
        'codehilite',      # 代码高亮
        'nl2br',           # 换行转<br>
        'sane_lists',      # 更智能的列表支持（包括两空格缩进）
    ]

    # tab_length=2 使制表符被视为2个空格，与两空格缩进风格一致
    html_content = markdown.markdown(md_content, extensions=extensions, tab_length=2)
    return html_content


def calculate_read_time(word_count: int) -> str:
    """
    根据字数计算阅读时间（按200~500字/分钟估算）
    返回格式如："<1分钟" / "3分钟" / "3-5分钟"
    """
    if word_count <= 0:
        return "<1分钟"

    min_minutes = math.ceil(word_count / 500)   # 快速阅读
    max_minutes = math.ceil(word_count / 200)   # 慢速阅读

    if max_minutes == 0:
        return "<1分钟"
    if min_minutes == max_minutes:
        return f"{min_minutes}分钟"
    else:
        return f"{min_minutes}-{max_minutes}分钟"


def create_html_page(title: str, date: str, content_html: str, headings_json: str,
                     description: str = "", tags: list = None, author: str = "",
                     word_count: int = 0, read_time_str: str = None) -> str:
    """
    生成完整的HTML页面，与主站样式保持一致，并集成Twikoo评论系统
    标签已从元数据区移至正文末尾，以 #标签 的形式显示
    评论区独立为卡片，与内容区分离
    元数据仅显示图标和数值，悬浮显示说明（通过 data-label 实现）
    新增阅读时间字段（若未提供则自动计算）
    """
    # 如果未提供阅读时间字符串，则基于字数计算
    if read_time_str is None:
        read_time_str = calculate_read_time(word_count)

    # 如果date是"未指定"或空，尝试使用当前日期
    if not date or date == "未指定":
        date = datetime.now().strftime("%Y年%m月%d日")

    # 格式化日期显示
    try:
        if re.match(r'\d{4}-\d{1,2}-\d{1,2}', date):
            dt = datetime.strptime(date, '%Y-%m-%d')
            formatted_date = dt.strftime("%Y年%m月%d日")
        else:
            formatted_date = date
    except:
        formatted_date = date

    # 处理标签显示（正文末尾的 #标签 样式）
    footer_tags_html = ""
    if tags and len(tags) > 0:
        tag_spans = []
        for tag in tags:
            safe_tag = html.escape(tag.strip())
            tag_spans.append(f'<span class="footer-tag">#{safe_tag}</span>')
        footer_tags_html = f'<div class="article-footer-tags">{" ".join(tag_spans)}</div>'

    # 副标题（原description）
    subtitle_html = ""
    if description:
        subtitle_html = f'<div class="article-subtitle">{description}</div>'

    # 优化后的元数据区域：只显示图标和数值，悬浮时通过 data-label 显示说明
    # 在字数后面增加阅读时间项
    meta_html = f'''
    <div class="article-meta" id="articleMeta">
        <div class="meta-grid">
            <div class="meta-item" data-label="发布日期">
                <i class="fas fa-calendar-alt"></i>
                <span class="meta-value">{formatted_date}</span>
            </div>
            <div class="meta-item" data-label="作者">
                <i class="fas fa-user"></i>
                <span class="meta-value">{author if author else "高新炀"}</span>
            </div>
            <div class="meta-item" data-label="字数">
                <i class="fas fa-file-alt"></i>
                <span class="meta-value">{word_count}</span>
            </div>
            <div class="meta-item" data-label="阅读时间（200~500字/分钟）">
                <i class="fas fa-clock"></i>
                <span class="meta-value">{read_time_str}</span>
            </div>
            <div class="meta-item" data-label="访客数">
                <i class="fas fa-users"></i>
                <span class="meta-value" id="busuanzi_page_uv">加载中...</span>
            </div>
            <div class="meta-item" data-label="阅读量">
                <i class="fas fa-eye"></i>
                <span class="meta-value" id="busuanzi_page_pv">加载中...</span>
            </div>
        </div>
    </div>
    '''

    # 处理描述显示（用于meta标签）
    meta_description = description if description else f"{title} - GaoXinYang的文章"

    html_template = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="{meta_description}">
    <meta name="author" content="{author if author else 'GaoXinYang'}">
    {f'<meta name="keywords" content="{", ".join(tags) if tags else ""}">' if tags else ''}
    <title>{title} - GaoXinYang's website</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="article.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body>
    <div id="navbar-placeholder"></div>
    
    <!-- 阅读进度条 -->
    <div id="reading-progress" class="reading-progress-bar">
        <div id="progress-bar" class="progress-bar"></div>
    </div>

    <!-- 主内容区域 -->
    <div class="article-page-container">
        <!-- 目录容器 - 将由JS动态生成 -->
        <div class="toc-container">
            <h2 class="toc-title">目录</h2>
            <div id="toc-list-container"></div>
        </div>

        <!-- 右侧内容列：文章卡片 + 评论卡片 -->
        <div class="article-right-column">
            <!-- 主文章内容区 -->
            <div class="article-content-wrapper">
                <h1 class="article-title" id="articleTitle">{title}</h1>
                {subtitle_html}
                {meta_html}
                <div class="article-body" id="articleBody">
                    {content_html}
                </div>
                <!-- 标签 -->
                {footer_tags_html}
            </div>

            <!-- 独立评论卡片 -->
            <div class="comments-card">
                <div class="comments-container">
                    <h3>评论区</h3>
                    <div id="twikoo-comments"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 图片预览模态框 -->
    <div id="imageModal" class="image-modal">
        <span class="close">&times;</span>
        <div class="modal-content">
            <img id="modalImage" src="" alt="">
        </div>
        <div class="image-info">
            <span id="imageCaption"></span>
        </div>
    </div>

    <script>
        // 将标题数据注入到全局变量
        window.ARTICLE_HEADINGS = {headings_json};
    </script>
    <script src="//cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.min.js" defer></script>
    <script src="/script.js"></script>
    <script src="article.js"></script>
    
    <!-- Twikoo 评论系统 -->
    <script src="https://cdn.jsdelivr.net/npm/twikoo@1.7.4/dist/twikoo.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function () {{
            if (typeof twikoo !== 'undefined') {{
                twikoo.init({{
                    envId: 'https://twikoo-gxy.netlify.app/.netlify/functions/twikoo',
                    el: '#twikoo-comments',
                    path: window.location.pathname,
                    lang: 'zh-CN',
                }});
            }} else {{
                console.warn('Twikoo 加载失败，请检查网络或 CDN 地址');
            }}
        }});
    </script>
</body>
</html>'''

    return html_template


def count_words(text: str) -> int:
    """
    统计文本中的非空白字符数量（中文字符、英文字母、数字等）
    去除所有空白字符后计算长度。
    """
    # 去除所有空白字符（空格、换行、制表符等）
    no_whitespace = re.sub(r'\s+', '', text)
    return len(no_whitespace)


def process_markdown_file(md_file_path: Path) -> dict:
    """
    处理单个markdown文件，生成HTML
    返回文章信息字典（包含阅读时间）
    """
    print(f"处理文件: {md_file_path}")

    # 读取markdown文件
    with open(md_file_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # 提取元数据
    metadata, cleaned_content = extract_metadata(md_content)

    # 获取元数据字段
    title = metadata.get('title', '未命名文章')
    date = metadata.get('date', '未指定日期')
    description = metadata.get('description', '')
    author = metadata.get('author', '')
    tags = metadata.get('tag', [])

    # 如果tags是字符串，转换为列表
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(',') if t.strip()]

    # 计算文章字数（基于 cleaned_content）
    word_count = count_words(cleaned_content)

    # 计算阅读时间
    read_time_str = calculate_read_time(word_count)

    # 提取标题信息（用于生成目录）
    headings = extract_headings(cleaned_content)

    # 为标题添加ID
    content_with_ids = add_heading_ids(cleaned_content, headings)

    # 转换markdown为HTML（已支持两空格缩进）
    content_html = convert_markdown_to_html(content_with_ids)

    # 将标题数据转换为JSON字符串
    headings_json = json.dumps(headings, ensure_ascii=False)

    # 生成完整HTML页面（传入阅读时间）
    full_html = create_html_page(title, date, content_html, headings_json,
                                 description, tags, author, word_count, read_time_str)

    # 确定输出文件名
    output_filename = md_file_path.stem + '.html'
    output_path = OUTPUT_DIR / output_filename

    # 写入HTML文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_html)

    print(f"  已生成: {output_path}")

    # 返回文章信息用于JSON索引（添加 read_time 字段）
    article_info = {
        'title': title,
        'date': date,
        'description': description,
        'author': author if author else '高新炀',
        'tags': tags,
        'url': f'/articles/{output_filename}',
        'word_count': word_count,
        'read_time': read_time_str   # 新增阅读时间字段
    }

    return article_info


def process_all_markdown_files() -> list:
    """
    处理articles目录下的所有markdown文件
    返回所有文章信息列表
    """
    if not ARTICLES_DIR.exists():
        print(f"错误: 文章目录不存在 - {ARTICLES_DIR}")
        return []

    # 查找所有.md文件
    md_files = list(ARTICLES_DIR.glob('*.md'))

    if not md_files:
        print(f"在 {ARTICLES_DIR} 中未找到任何.md文件")
        return []

    print(f"找到 {len(md_files)} 个markdown文件")
    print("-" * 50)

    articles_info = []
    for md_file in md_files:
        try:
            article_info = process_markdown_file(md_file)
            articles_info.append(article_info)
        except Exception as e:
            print(f"  处理失败: {e}")

    print("-" * 50)
    print(f"成功生成 {len(articles_info)} 个HTML文件")

    # 生成文章索引和JSON文件
    generate_index(articles_info)
    generate_articles_json(articles_info)

    return articles_info


def generate_index(articles_info: list):
    """
    生成文章列表索引页面（原函数为空，保留以兼容）
    """
    if not articles_info:
        return

    # 按日期排序（最新的在前）
    sorted_articles = sorted(articles_info,
                             key=lambda x: x.get('date', ''),
                             reverse=True)


def generate_articles_json(articles_info: list):
    """
    在根目录生成 articles.json 文件，包含所有文章的元数据
    移除了每个文章的 id 字段，添加了 total_word_count 总字数统计
    同时包含每篇文章的 read_time 阅读时间
    """
    if not articles_info:
        return

    # 计算所有文章的总字数
    total_word_count = sum(article.get('word_count', 0) for article in articles_info)

    # 准备JSON数据
    json_data = {
        'generated_at': datetime.now().isoformat(),
        'total_articles': len(articles_info),
        'total_word_count': total_word_count,
        'articles': sorted(articles_info,
                           key=lambda x: x.get('date', ''),
                           reverse=True)
    }

    # 保存到根目录
    json_path = BASE_DIR / 'articles.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"已生成文章JSON索引: {json_path}")


def main():
    """
    主函数
    """
    print("=" * 50)
    print("Markdown 转 HTML 工具")
    print("=" * 50)

    # 检查参数
    if len(sys.argv) > 1:
        # 如果指定了文件，只处理该文件
        md_file_path = Path(sys.argv[1])
        if md_file_path.exists() and md_file_path.suffix == '.md':
            article_info = process_markdown_file(md_file_path)
            # 更新单个文件的JSON（读取现有JSON并更新）
            update_single_article_json(article_info)
        else:
            print(f"错误: 文件不存在或不是markdown文件 - {md_file_path}")
    else:
        # 处理所有文件
        articles_info = process_all_markdown_files()

    print("\n完成!")


def update_single_article_json(new_article: dict):
    """
    更新单个文章的JSON索引
    确保删除旧文章中的 id 字段，并重新计算总字数
    同时保留 read_time 字段
    """
    json_path = BASE_DIR / 'articles.json'
    articles_info = []

    # 读取现有JSON
    if json_path.exists():
        with open(json_path, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
            articles_info = existing_data.get('articles', [])

    # 删除现有文章中可能存在的 id 字段
    for article in articles_info:
        if 'id' in article:
            del article['id']

    # 更新或添加文章
    found = False
    for i, article in enumerate(articles_info):
        # 通过 url 或 title+date 来判断是否为同一篇文章（这里用 url 作为唯一标识）
        if article.get('url') == new_article.get('url'):
            articles_info[i] = new_article
            found = True
            break

    if not found:
        articles_info.append(new_article)

    # 排序并计算总字数
    articles_info.sort(key=lambda x: x.get('date', ''), reverse=True)
    total_word_count = sum(article.get('word_count', 0) for article in articles_info)

    json_data = {
        'generated_at': datetime.now().isoformat(),
        'total_articles': len(articles_info),
        'total_word_count': total_word_count,
        'articles': articles_info
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"已更新文章JSON索引: {json_path}")


if __name__ == "__main__":
    main()