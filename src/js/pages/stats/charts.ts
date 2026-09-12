// /js/pages/stats/charts.ts
// 所有图表的具体渲染逻辑，通过 registerChart 注册
// 主类 StatsManager 通过 import 触发本模块的副作用（自注册）

import { registerChart } from './chart-registry.js';
import { Utils } from '/js/core/core.js';

// ==================== 调色板 ====================

const PALETTE = ['#b45b63', '#cd8189', '#e3a5a9', '#9e5e66', '#d99ca2', '#c06f78', '#e9b3b7'];
const PALETTE_ALT = ['#4ea8ff', '#7dcea0', '#f9b5a4', '#b45b63', '#cd8189', '#e6c3a0', '#9ba5c9'];
const PALETTE_CODE = ['#b45b63', '#4ea8ff', '#7dcea0', '#f4b942', '#c97e5a', '#9b59b6', '#95a5a6'];

// ==================== 工具 ====================

/** 解析日期字符串为 YYYY-MM 格式，失败返回 null */
function toMonthKey(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 标签提取统一走 Utils.getTags（内部兼容 tag / tags 字段），
// 原 getWorkTags 本地实现已删除。

// ==================== 1. 文章发布趋势 ====================

registerChart({
  id: 'trendChart',
  title: '文章发布趋势',
  subtitle: '月度波动',
  render: ({ ctx, data, colors, Chart, register }) => {
    const monthMap = new Map<string, number>();
    for (const art of data.articlesList) {
      if (!art.date) continue;
      const key = toMonthKey(art.date);
      if (!key) continue;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }
    const sorted = Array.from(monthMap.keys()).sort();
    const labels = sorted.map((m) => m.replace('-', '年') + '月');
    const values = sorted.map((m) => monthMap.get(m)!);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '发布数',
            data: values,
            borderColor: colors.accent,
            backgroundColor: 'rgba(180,91,99,0.1)',
            tension: 0.3,
            fill: true,
            pointBackgroundColor: colors.accent,
            pointBorderColor: '#fff',
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: { mode: 'index', intersect: false },
          legend: { labels: { color: colors.textColor } },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: colors.gridColor },
            ticks: { color: colors.textColor },
          },
          x: { ticks: { color: colors.textColor, maxRotation: 45 } },
        },
      },
    });
    register(chart);
  },
});

// ==================== 2. 文章分类 ====================

registerChart({
  id: 'categoryChart',
  title: '文章分类',
  subtitle: '占比',
  render: ({ ctx, data, colors, Chart, register }) => {
    let categories = data.statistics.article_categories || [];
    if (!categories.length) {
      const catMap = new Map<string, number>();
      for (const art of data.articlesList) {
        if (art.category) catMap.set(art.category, (catMap.get(art.category) || 0) + 1);
      }
      categories = Array.from(catMap.entries()).map(([name, count]) => ({ name, count }));
    }

    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: categories.map((c) => c.name),
        datasets: [
          {
            data: categories.map((c) => c.count),
            backgroundColor: PALETTE,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (c: any) => {
                const total = (c.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : '0.0';
                return `${c.label}: ${c.raw} 篇 (${pct}%)`;
              },
            },
          },
          legend: {
            position: 'right',
            labels: { color: colors.textColor, font: { size: 11 } },
          },
        },
      },
    });
    register(chart);
  },
});

// ==================== 3. 热门文章标签 TOP10 ====================

registerChart({
  id: 'articleTagsChart',
  title: '热门文章标签',
  subtitle: 'TOP 10',
  render: ({ ctx, data, colors, Chart, register }) => {
    let tags = data.statistics.article_tags || [];
    if (!tags.length) {
      const tagMap = new Map<string, number>();
      for (const art of data.articlesList) {
        for (const t of art.tags || []) {
          tagMap.set(t, (tagMap.get(t) || 0) + 1);
        }
      }
      tags = Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
    }
    const top10 = [...tags].sort((a, b) => b.count - a.count).slice(0, 10);

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map((t) => t.name),
        datasets: [
          {
            label: '引用次数',
            data: top10.map((t) => t.count),
            backgroundColor: colors.accent,
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { labels: { color: colors.textColor } } },
        scales: {
          x: { ticks: { color: colors.textColor }, grid: { color: colors.gridColor } },
          y: { ticks: { color: colors.textColor } },
        },
      },
    });
    register(chart);
  },
});

// ==================== 4. 作品标签云 ====================

registerChart({
  id: 'workTagsChart',
  title: '作品标签云',
  subtitle: '分类',
  render: ({ ctx, data, colors, Chart, register }) => {
    let workTags = data.statistics.work_tags || [];
    if (!workTags.length) {
      const tagMap = new Map<string, number>();
      for (const w of data.worksList) {
        // 统一走 Utils.getTags：内部兼容 tag / tags 两种字段
        for (const t of Utils.getTags(w)) {
          tagMap.set(t, (tagMap.get(t) || 0) + 1);
        }
      }
      workTags = Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
    }

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: workTags.map((t) => t.name),
        datasets: [
          {
            data: workTags.map((t) => t.count),
            backgroundColor: PALETTE_ALT,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: { callbacks: { label: (c: any) => `${c.label}: ${c.raw} 次` } },
          legend: { position: 'right', labels: { color: colors.textColor } },
        },
      },
    });
    register(chart);
  },
});

// ==================== 5. 代码文件分布 ====================

registerChart({
  id: 'codeExtensionChart',
  title: '代码文件分布',
  subtitle: '按扩展名',
  render: ({ ctx, data, colors, Chart, register }) => {
    const exts = data.codeAnalysis.by_extension || [];
    if (!exts.length) {
      register(
        new Chart(ctx, {
          type: 'pie',
          data: { labels: ['暂无数据'], datasets: [{ data: [1] }] },
        })
      );
      return;
    }
    const sorted = [...exts].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 6);
    const othersCount = sorted.slice(6).reduce((s, e) => s + e.count, 0);
    if (othersCount) {
      top.push({ extension: '其他', count: othersCount } as any);
    }

    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: top.map((e) => (e.extension === 'no_extension' ? '无后缀' : e.extension)),
        datasets: [{ data: top.map((e) => e.count), backgroundColor: PALETTE_CODE }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: colors.textColor, font: { size: 10 } },
          },
        },
      },
    });
    register(chart);
  },
});

// ==================== 6. 文章字数分布 ====================

registerChart({
  id: 'wordHistogramChart',
  title: '文章字数分布',
  subtitle: '区间密度',
  render: ({ ctx, data, colors, Chart, register }) => {
    const labels = ['<500', '500-999', '1000-1999', '2000-4999', '5000-9999', '≥10000'];
    const counts = new Array(6).fill(0);
    for (const a of data.articlesList) {
      const w = a.word_count || 0;
      if (w <= 0) continue;
      if (w < 500) counts[0]++;
      else if (w < 1000) counts[1]++;
      else if (w < 2000) counts[2]++;
      else if (w < 5000) counts[3]++;
      else if (w < 10000) counts[4]++;
      else counts[5]++;
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '文章数量',
            data: counts,
            backgroundColor: colors.accent,
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor },
          },
          x: { ticks: { color: colors.textColor } },
        },
        plugins: {
          tooltip: { callbacks: { label: (c: any) => `${c.raw} 篇文章` } },
          legend: { labels: { color: colors.textColor } },
        },
      },
    });
    register(chart);
  },
});

// ==================== 7. 代码行数占比 ====================

registerChart({
  id: 'codeLineChart',
  title: '代码行数占比',
  subtitle: '非空行',
  render: ({ ctx, data, colors, Chart, register }) => {
    const exts = data.codeAnalysis.by_extension || [];
    if (!exts.length) {
      register(
        new Chart(ctx, {
          type: 'doughnut',
          data: { labels: ['暂无数据'], datasets: [{ data: [1] }] },
        })
      );
      return;
    }
    let valid = exts.filter((e) => (e.non_empty_lines || e.total_lines || 0) > 0);
    if (valid.length === 0) valid = exts;

    const sorted = [...valid].sort(
      (a, b) => (b.non_empty_lines || 0) - (a.non_empty_lines || 0)
    );
    const top = sorted.slice(0, 6);
    const othersLines = sorted.slice(6).reduce((s, e) => s + (e.non_empty_lines || 0), 0);
    if (othersLines > 0) {
      top.push({ extension: '其他', non_empty_lines: othersLines } as any);
    }

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: top.map((e) => (e.extension === 'no_extension' ? '无后缀' : e.extension)),
        datasets: [
          {
            data: top.map((e) => e.non_empty_lines || e.total_lines || 0),
            backgroundColor: PALETTE_CODE,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (c: any) => {
                const total = (c.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : '0.0';
                return `${c.label}: ${c.raw.toLocaleString()} 行 (${pct}%)`;
              },
            },
          },
          legend: {
            position: 'right',
            labels: { color: colors.textColor, font: { size: 10 } },
          },
        },
      },
    });
    register(chart);
  },
});

// ==================== 8. 作品年份分布 ====================

registerChart({
  id: 'worksYearChart',
  title: '作品年份分布',
  subtitle: '按年份',
  render: ({ ctx, data, colors, Chart, register }) => {
    const yearMap = new Map<number, number>();
    for (const w of data.worksList) {
      if (!w.date) continue;
      const y = new Date(w.date as string).getFullYear();
      if (!isNaN(y)) yearMap.set(y, (yearMap.get(y) || 0) + 1);
    }
    const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
    const counts = years.map((y) => yearMap.get(y)!);

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: years,
        datasets: [
          {
            label: '作品数量',
            data: counts,
            backgroundColor: colors.accent,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: colors.textColor } } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor },
          },
          x: { ticks: { color: colors.textColor } },
        },
      },
    });
    register(chart);
  },
});