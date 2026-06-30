// /js/pages/stats-init.js
// 统计页面入口，配合 router 与无刷新导航
import { StatsManager } from '/js/pages/stats-manager.js';

let currentStatsManager = null;

async function initStatsPage() {
    if (currentStatsManager) {
        currentStatsManager.destroy();
        currentStatsManager = null;
    }
    const manager = new StatsManager();
    await manager.init();
    currentStatsManager = manager;
    window._statsManager = manager; // 便于调试
    // 确保滚动揭示刷新，不影响其他组件
    if (window.refreshScrollReveal) window.refreshScrollReveal();
}

// 如果当前页面是统计页面（由 router 调用或直接加载），自动启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('stats.html')) initStatsPage();
    });
} else {
    if (window.location.pathname.includes('stats.html')) initStatsPage();
}

// 暴露给 router 的初始化函数
export { initStatsPage };