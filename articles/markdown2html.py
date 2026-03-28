import os
import re
import sys
import json
from pathlib import Path
from typing import Dict, Tuple
from datetime import datetime

# 尝试导入markdown库，如果没有则提示安装
try:
    import markdown
except ImportError:
    print("请先安装markdown库: pip install markdown")
    sys.exit(1)

# 配置路径
BASE_DIR = Path(__file__).parent  # 脚本所在目录
ARTICLES_DIR = BASE_DIR / "articles"  # md文件所在目录
OUTPUT_DIR = BASE_DIR  # HTML输出目录（与css/js同目录）

# 确保输出目录存在
OUTPUT_DIR.mkdir(exist_ok=True)


def extract_metadata(content: str) -> Tuple[Dict[str, str], str]:
    """
    从markdown内容中提取元数据（---格式）
    返回: (metadata_dict, cleaned_content)
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
                metadata[key.strip()] = value.strip()
        
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
    将markdown内容转换为HTML
    """
    # 配置markdown扩展
    extensions = [
        'extra',  # 支持表格、脚注等
        'codehilite',  # 代码高亮
        'nl2br',  # 换行转<br>
    ]
    
    # 转换markdown为HTML
    html = markdown.markdown(md_content, extensions=extensions)
    return html


def create_html_page(title: str, date: str, content_html: str, headings_json: str) -> str:
    """
    生成完整的HTML页面，与主站样式保持一致
    """
    # 如果date是"未指定"或空，尝试使用当前日期
    if not date or date == "未指定":
        date = datetime.now().strftime("%Y年%m月%d日")
    
    html_template = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - GaoXinYang's website</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="article.css">
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

        <!-- 主文章内容区 -->
        <div class="article-content-wrapper">
            <h1 class="article-title" id="articleTitle">═══ {title} ═══</h1>
            <div class="article-meta" id="articleMeta">{date}</div>
            <div class="article-body" id="articleBody">
                {content_html}
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
    <script src="/script.js"></script>
    <script src="article.js"></script>
</body>
</html>'''
    
    return html_template


def process_markdown_file(md_file_path: Path) -> str:
    """
    处理单个markdown文件，生成HTML
    返回生成的HTML文件路径
    """
    print(f"处理文件: {md_file_path}")
    
    # 读取markdown文件
    with open(md_file_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    # 提取元数据
    metadata, cleaned_content = extract_metadata(md_content)
    
    # 获取标题和日期
    title = metadata.get('title', '未命名文章')
    date = metadata.get('date', '未指定日期')
    
    # 提取标题信息（用于生成目录）
    headings = extract_headings(cleaned_content)
    
    # 为标题添加ID
    content_with_ids = add_heading_ids(cleaned_content, headings)
    
    # 转换markdown为HTML
    content_html = convert_markdown_to_html(content_with_ids)
    
    # 将标题数据转换为JSON字符串
    headings_json = json.dumps(headings, ensure_ascii=False)
    
    # 生成完整HTML页面
    full_html = create_html_page(title, date, content_html, headings_json)
    
    # 确定输出文件名
    output_filename = md_file_path.stem + '.html'
    output_path = OUTPUT_DIR / output_filename
    
    # 写入HTML文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_html)
    
    print(f"  已生成: {output_path}")
    return str(output_path)


def process_all_markdown_files():
    """
    处理articles目录下的所有markdown文件
    """
    if not ARTICLES_DIR.exists():
        print(f"错误: 文章目录不存在 - {ARTICLES_DIR}")
        return
    
    # 查找所有.md文件
    md_files = list(ARTICLES_DIR.glob('*.md'))
    
    if not md_files:
        print(f"在 {ARTICLES_DIR} 中未找到任何.md文件")
        return
    
    print(f"找到 {len(md_files)} 个markdown文件")
    print("-" * 50)
    
    generated_files = []
    for md_file in md_files:
        try:
            output_path = process_markdown_file(md_file)
            generated_files.append(output_path)
        except Exception as e:
            print(f"  处理失败: {e}")
    
    print("-" * 50)
    print(f"成功生成 {len(generated_files)} 个HTML文件")
    
    # 可选：生成索引文件
    generate_index(generated_files)


def generate_index(html_files: list):
    """
    生成文章列表索引页面
    """
    if not html_files:
        return
    
    # 提取文章信息
    articles = []
    for html_file in html_files:
        # 从文件名获取文章ID
        article_id = Path(html_file).stem
        articles.append({
            'id': article_id,
            'title': article_id,  # 可以后续从HTML中提取，这里简单处理
            'url': article_id + '.html'
        })
    
    # 生成简单的文章列表
    index_html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>文章列表 - GaoXinYang's website</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div id="navbar-placeholder"></div>
    
    <div class="container" style="max-width: 800px; margin: 100px auto 40px;">
        <h1>文章列表</h1>
        <ul class="article-list">
'''
    
    for article in articles:
        index_html += f'            <li><a href="{article["url"]}">{article["title"]}</a></li>\n'
    
    index_html += '''        </ul>
    </div>
    
    <script src="/script.js"></script>
</body>
</html>'''
    
    index_path = OUTPUT_DIR / 'articles_list.html'
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_html)
    
    print(f"已生成文章索引: {index_path}")


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
            process_markdown_file(md_file_path)
        else:
            print(f"错误: 文件不存在或不是markdown文件 - {md_file_path}")
    else:
        # 处理所有文件
        process_all_markdown_files()
    
    print("\n完成!")


if __name__ == "__main__":
    main()