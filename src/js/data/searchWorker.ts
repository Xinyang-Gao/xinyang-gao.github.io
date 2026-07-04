// /js/data/searchWorker.ts
// Web Worker: 负责数据的过滤、排序和标签提取（TypeScript 重构版）

interface Item {
  title: string;
  date?: string;
  last_updated?: string;
  description?: string;
  word_count?: number;
  tags?: string[];
  tag?: string[];
  [key: string]: any; // 兼容其他字段
}

interface FilterAndSortOptions {
  items: Item[];
  query: string;
  field: string;
  selectedTags: string[];
  sortOrder: string;
  requestId: number;
}

interface ExtractTagsOptions {
  items: Item[];
  requestId?: number;
}

// ---- 工具函数 ----

/** 解析日期字符串，支持 "2026年05月24日" 和标准格式，返回时间戳 */
function parseDateString(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const str = String(dateStr);

  const chineseMatch = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (chineseMatch) {
    const year = parseInt(chineseMatch[1], 10);
    const month = parseInt(chineseMatch[2], 10) - 1;
    const day = parseInt(chineseMatch[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date.getTime();
}

/** 从 Item 中提取标签数组（兼容 tags 和 tag 字段） */
function getItemTags(item: Item): string[] {
  if (item.tags && Array.isArray(item.tags)) return item.tags;
  if (item.tag && Array.isArray(item.tag)) return item.tag;
  return [];
}

/** 根据排序规则对项目数组进行排序 */
function sortByField(items: Item[], order: string): Item[] {
  const sortedItems = [...items];
  switch (order) {
    case 'updated_asc':
      sortedItems.sort((a, b) => {
        const timeA = parseDateString(a.last_updated || a.date) || 0;
        const timeB = parseDateString(b.last_updated || b.date) || 0;
        return timeA - timeB;
      });
      break;
    case 'updated_desc':
      sortedItems.sort((a, b) => {
        const timeA = parseDateString(a.last_updated || a.date) || 0;
        const timeB = parseDateString(b.last_updated || b.date) || 0;
        return timeB - timeA;
      });
      break;
    case 'wordcount_asc':
      sortedItems.sort((a, b) => (a.word_count || 0) - (b.word_count || 0));
      break;
    case 'wordcount_desc':
      sortedItems.sort((a, b) => (b.word_count || 0) - (a.word_count || 0));
      break;
    case 'date_asc':
      sortedItems.sort((a, b) => {
        const timeA = parseDateString(a.date) || 0;
        const timeB = parseDateString(b.date) || 0;
        return timeA - timeB;
      });
      break;
    case 'date_desc':
    default:
      sortedItems.sort((a, b) => {
        const timeA = parseDateString(a.date) || 0;
        const timeB = parseDateString(b.date) || 0;
        return timeB - timeA;
      });
      break;
  }
  return sortedItems;
}

// ---- Worker 消息处理 ----

self.addEventListener('message', (e: MessageEvent) => {
  const { type, options } = e.data;

  if (type === 'filterAndSort') {
    const { items, query, field, selectedTags, sortOrder, requestId } =
      options as FilterAndSortOptions;

    let result = [...items];

    // 1. 标签筛选
    if (selectedTags && selectedTags.length > 0) {
      result = result.filter((item) => {
        const itemTags = getItemTags(item);
        return itemTags.some((t) => selectedTags.includes(t));
      });
    }

    // 2. 搜索筛选
    if (query && query.trim() !== '') {
      const ql = query.toLowerCase().trim();
      result = result.filter((item) => {
        switch (field) {
          case 'title':
            return item.title.toLowerCase().includes(ql);
          case 'tag': {
            const itemTags = getItemTags(item);
            return itemTags.some((t) => t.toLowerCase().includes(ql));
          }
          case 'date':
            return item.date?.includes(query) || false;
          default: // 'all'
            return (
              item.title.toLowerCase().includes(ql) ||
              getItemTags(item).some((t) => t.toLowerCase().includes(ql)) ||
              (item.date?.includes(query) || false)
            );
        }
      });
    }

    // 3. 排序
    result = sortByField(result, sortOrder);

    self.postMessage({
      type: 'filterAndSortResult',
      data: result,
      requestId,
    });
  }

  if (type === 'extractTags') {
    const { items } = options as ExtractTagsOptions;
    const tagsSet = new Set<string>();
    items.forEach((item) => {
      getItemTags(item).forEach((t) => tagsSet.add(t));
    });
    self.postMessage({
      type: 'extractTagsResult',
      data: Array.from(tagsSet).sort(),
      requestId: options.requestId,
    });
  }
});

// 空导出，使此文件成为模块（TypeScript 要求）
export {};