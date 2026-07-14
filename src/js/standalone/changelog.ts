// /js/standalone/changelog.ts

declare const marked: {
  parse(src: string): string;
};

// ---------- 类型定义 ----------
interface Change {
  type: string;
  description: string;
}

interface Version {
  id: number;
  version: string;
  date: string;
  changes: Change[];
}

interface VersionData {
  versions: Version[];
}

interface ParsedChange {
  type: string;
  scope: string | null;
  descriptionHtml: string;
}

// ---------- 配置 ----------
const BATCH_SIZE = 15;

const TYPE_COLORS: Record<string, string> = {
  feat: '#4CAF50',
  fix: '#f44336',
  perf: '#FF9800',
  style: '#9C27B0',
  refactor: '#2196F3',
  chore: '#607D8B',
  docs: '#00BCD4',
  revert: '#FF5722',
  ci: '#795548',
};

const DEFAULT_COLOR = '#6b6b6b';

// ---------- DOM 引用 ----------
const container = document.getElementById('changelog-container') as HTMLElement;
const loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
const counterEl = document.getElementById('version-counter') as HTMLSpanElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchField = document.getElementById('search-field') as HTMLSelectElement;

// ---------- 状态 ----------
let allVersions: Version[] = [];
let currentCount = 0;
let allLoaded = false;

// ---------- 工具函数 ----------
function formatDate(dateStr: string): string {
  if (!dateStr) return '日期不详';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
  }
  return dateStr;
}

function parseChange(change: Change): ParsedChange {
  const rawType = change.type.trim();
  let rawDesc = change.description.trim();
  let finalType = rawType;
  let scope: string | null = null;
  let msg = rawDesc;

  const match = rawDesc.match(/^(\w+)\(([^)]+)\)\s*[:：]\s*(.*)$/);
  if (match) {
    const inlineType = match[1];
    const inlineScope = match[2];
    const rest = match[3].trim();
    if (!rawType || rawType === inlineType) {
      finalType = inlineType;
      scope = inlineScope;
      msg = rest;
    }
  }

  // 列表项前插入空行，优化 Markdown 渲染
  const lines = msg.split('\n');
  const newLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trimStart();
    if (i > 0 && /^[-*+]\s/.test(stripped) && lines[i - 1].trim() !== '') {
      newLines.push('');
    }
    newLines.push(line);
  }
  msg = newLines.join('\n');

  let descHtml: string;
  try {
    // 使用全局 marked 对象的 parse 方法
    descHtml = marked.parse(msg);
  } catch {
    descHtml = msg.replace(/\n/g, '<br>');
  }

  return {
    type: finalType,
    scope,
    descriptionHtml: descHtml,
  };
}

function renderVersion(ver: Version): string {
  const { id, version, date, changes } = ver;
  const dateDisplay = formatDate(date);

  let changesHtml: string;
  if (changes.length) {
    const items = changes.map((chg) => {
      const parsed = parseChange(chg);
      const color = TYPE_COLORS[parsed.type] || DEFAULT_COLOR;
      const typeTag = `<span class="change-type" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${parsed.type}</span>`;
      let scopeTag = '';
      if (parsed.scope) {
        scopeTag = `<span class="change-scope" style="color:${color}; font-weight:500; background:${color}10; padding:0 8px; border-radius:8px; font-size:0.8rem;">${parsed.scope}</span>`;
      }
      return `<li class="change-item">
                <div class="change-meta">${typeTag} ${scopeTag}</div>
                <div class="change-desc">${parsed.descriptionHtml}</div>
              </li>`;
    }).join('');
    changesHtml = `<ul class="change-list">${items}</ul>`;
  } else {
    changesHtml = '<p class="no-changes">无变更记录</p>';
  }

  const searchText = `${version} ${dateDisplay} ${id} ${changes.map(c => c.description).join(' ')}`;

  return `<div class="changelog-version" data-search="${searchText}" data-version-id="${id}">
            <div class="version-header">
              <span class="version-tag">${version}</span>
              <span class="version-date">${dateDisplay}</span>
              <span class="version-id">#${id}</span>
            </div>
            ${changesHtml}
          </div>`;
}

// ---------- 渲染控制 ----------
function renderBatch(count: number): void {
  const items = container.querySelectorAll<HTMLElement>('.changelog-version');
  let visible = 0;
  items.forEach((el, idx) => {
    if (idx < count) {
      el.style.display = '';
      visible++;
    } else {
      el.style.display = 'none';
    }
  });
  currentCount = visible;
  allLoaded = visible >= items.length;
  updateControls();
}

function showAll(): void {
  const items = container.querySelectorAll<HTMLElement>('.changelog-version');
  items.forEach(el => el.style.display = '');
  allLoaded = true;
  updateControls();
}

function updateControls(): void {
  const total = allVersions.length;
  if (loadMoreBtn) {
    if (allLoaded || currentCount >= total) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'inline-block';
      loadMoreBtn.textContent = `加载更多版本 (${total - currentCount} 个剩余)`;
    }
  }
  if (counterEl) {
    const searching = searchInput.value.trim() !== '';
    if (searching) {
      const visible = container.querySelectorAll<HTMLElement>(
        '.changelog-version[style*="display: block"], .changelog-version:not([style*="display: none"])'
      ).length;
      counterEl.textContent = `匹配 ${visible} / 共 ${total} 个版本`;
    } else {
      counterEl.textContent = `显示 ${currentCount} / 共 ${total} 个版本`;
    }
  }
}

// ---------- 数据加载 ----------
async function loadData(): Promise<void> {
  try {
    const response = await fetch('/json/version.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: VersionData = await response.json();
    const versions = data.versions || [];
    versions.sort((a, b) => (b.id || 0) - (a.id || 0));
    allVersions = versions;

    if (!versions.length) {
      container.innerHTML = '<p style="text-align:center; padding:2rem;">暂无更新记录</p>';
      return;
    }

    const cardsHtml = versions.map(renderVersion).join('');
    container.innerHTML = cardsHtml;
    renderBatch(BATCH_SIZE);
  } catch (err: any) {
    container.innerHTML = `<p style="text-align:center; padding:2rem; color:var(--text-secondary);">加载失败：${err.message}</p>`;
    console.error('Changelog load error:', err);
  }
}

// ---------- 搜索过滤 ----------
function filterVersions(): void {
  const keyword = searchInput.value.trim().toLowerCase();
  const field = searchField.value;
  const items = container.querySelectorAll<HTMLElement>('.changelog-version');

  if (!keyword) {
    allLoaded = false;
    renderBatch(BATCH_SIZE);
    return;
  }

  showAll();
  let matchCount = 0;
  items.forEach(el => {
    const searchData = el.dataset.search || '';
    let match = false;
    if (field === 'all') {
      match = searchData.toLowerCase().includes(keyword);
    } else if (field === 'version') {
      const tag = el.querySelector('.version-tag');
      match = tag?.textContent?.toLowerCase().includes(keyword) ?? false;
    } else if (field === 'date') {
      const dateEl = el.querySelector('.version-date');
      match = dateEl?.textContent?.toLowerCase().includes(keyword) ?? false;
    } else if (field === 'desc') {
      const descEls = el.querySelectorAll('.change-desc');
      let descText = '';
      descEls.forEach(d => descText += d.textContent);
      match = descText.toLowerCase().includes(keyword);
    }
    if (match) {
      el.style.display = '';
      matchCount++;
    } else {
      el.style.display = 'none';
    }
  });

  if (counterEl) {
    counterEl.textContent = `匹配 ${matchCount} / 共 ${allVersions.length} 个版本`;
  }
}

function loadMore(): void {
  if (allLoaded) return;
  const nextCount = Math.min(currentCount + BATCH_SIZE, allVersions.length);
  renderBatch(nextCount);
}

// ---------- 初始化 ----------
function init(): void {
  loadData();
  loadMoreBtn.addEventListener('click', loadMore);
  searchInput.addEventListener('input', filterVersions);
  searchField.addEventListener('change', filterVersions);
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}