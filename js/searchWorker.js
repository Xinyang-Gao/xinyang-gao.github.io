// ==================== /js/searchWorker.js ====================
// Web Worker: 负责数据的过滤、排序和标签提取

self.addEventListener('message', async (e) => {
  const { type, data, options } = e.data;
  
  if (type === 'filterAndSort') {
    const { items, query, field, selectedTags, sortOrder } = options;
    let result = [...items];
    
    // 标签筛选
    if (selectedTags && selectedTags.length) {
      result = result.filter(item => {
        const itemTags = getItemTags(item);
        return itemTags && itemTags.some(t => selectedTags.includes(t));
      });
    }
    
    // 搜索筛选
    if (query && query.trim() !== '') {
      const ql = query.toLowerCase().trim();
      result = result.filter(item => {
        switch (field) {
          case 'title': 
            return item.title.toLowerCase().includes(ql);
          case 'tag': {
            const itemTags = getItemTags(item);
            return itemTags && itemTags.some(t => t.toLowerCase().includes(ql));
          }
          case 'date': 
            return item.date && item.date.includes(query);
          default: 
            return item.title.toLowerCase().includes(ql) || 
                   (getItemTags(item).some(t => t.toLowerCase().includes(ql))) || 
                   (item.date && item.date.includes(query));
        }
      });
    }
    
    // 排序
    result = sortByField(result, sortOrder);
    
    self.postMessage({
      type: 'filterAndSortResult',
      data: result,
      requestId: options.requestId
    });
  }
  
  if (type === 'extractTags') {
    const { items } = data;
    const tagsSet = new Set();
    items.forEach(item => {
      const itemTags = getItemTags(item);
      if (itemTags && Array.isArray(itemTags)) {
        itemTags.forEach(t => tagsSet.add(t));
      }
    });
    self.postMessage({
      type: 'extractTagsResult',
      data: Array.from(tagsSet).sort(),
      requestId: options.requestId
    });
  }
});

function getItemTags(item) {
  if (item.tags && Array.isArray(item.tags)) return item.tags;
  if (item.tag && Array.isArray(item.tag)) return item.tag;
  return [];
}

function sortByField(items, order) {
  const sortedItems = [...items];
  switch(order) {
    case 'updated_asc':
      sortedItems.sort((a, b) => new Date(a.last_updated || a.date) - new Date(b.last_updated || b.date));
      break;
    case 'updated_desc':
      sortedItems.sort((a, b) => new Date(b.last_updated || b.date) - new Date(a.last_updated || a.date));
      break;
    case 'wordcount_asc':
      sortedItems.sort((a, b) => (a.word_count || 0) - (b.word_count || 0));
      break;
    case 'wordcount_desc':
      sortedItems.sort((a, b) => (b.word_count || 0) - (a.word_count || 0));
      break;
    case 'date_asc':
      sortedItems.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case 'date_desc':
      sortedItems.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    default:
      sortedItems.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return sortedItems;
}