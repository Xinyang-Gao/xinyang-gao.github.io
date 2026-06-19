// /js/entry/main.js (优化 LCP 版本，支持回退/前进 + 加载覆盖层版本检测)

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';
import { initUIEffects, refreshScrollReveal, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { getTimeBasedTheme, getPageNameFromPath, applyRandomBackgroundImage, startSiteAgeUpdater, updateFooterUpdateTime } from '/js/core/page-utils.js';
import { loadNavbar, loadFooter, enableAjaxNavigation, initPageFeatures, fetchAndReplaceContent, initPopstate } from '/js/router/router.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { StatisticsManager, preloadCriticalJSON, registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';
import { renderPersonalCard } from '/js/ui/personal-card.js';
import { initButtons } from '/js/ui/button-manager.js';

let cookieConsentManager = null;

// 清除 Service Worker 缓存
export async function clearAllServiceWorkerCache() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('[SW] 所有 Service Worker 缓存已清除并注销');
    window.location.reload();
  }
}

// ========== LCP 优化：动态添加预连接和预加载 ==========
function addOptimizationLinks() {
  const preconnectBing = document.createElement('link');
  preconnectBing.rel = 'preconnect';
  preconnectBing.href = 'https://cn.bing.com';
  document.head.appendChild(preconnectBing);

  const preconnectAPI = document.createElement('link');
  preconnectAPI.rel = 'preconnect';
  preconnectAPI.href = 'https://api.hypcvgm.top';
  document.head.appendChild(preconnectAPI);

  const preloadAvatar = document.createElement('link');
  preloadAvatar.rel = 'preload';
  preloadAvatar.as = 'image';
  preloadAvatar.href = '/assets/avatar.webp';
  preloadAvatar.fetchPriority = 'high';
  document.head.appendChild(preloadAvatar);
}

// ========== 加载覆盖层版本检测逻辑 ==========
async function handleLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  const content = document.getElementById('loading-content');
  if (!overlay) return;

  // 隐藏页面滚动条
  document.body.style.overflow = 'hidden';

  // 获取或创建日志容器
  let logContainer = document.querySelector('.loading-log');
  if (!logContainer) {
    logContainer = document.createElement('div');
    logContainer.className = 'loading-log';
    overlay.appendChild(logContainer);
  } else {
    // 清空硬编码内容，由 JS 完全控制
    logContainer.innerHTML = '';
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms || 20));

  // ---- 增强的 addLog ----
  function addLog(module, msg, indent = 0) {
    const time = new Date().toLocaleTimeString();
    // 生成缩进：每级用 "│ "，最后一级用 "├── "
    const indentStr = '│ '.repeat(indent) + (indent > 0 ? '├── ' : '');
    const line = document.createElement('div');
    line.textContent = `[${time}][${module}] ${indentStr}${msg}`;
    logContainer.appendChild(line);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function restoreScroll() {
    document.body.style.overflow = '';
  }

  // ---------- 开始日志 ----------
  addLog('System', '初始化加载环境...');
  await sleep(20);
  addLog('System', `浏览器标识: ${navigator.userAgent.split(' ').slice(0, 3).join(' ')}`);
  await sleep(15);
  addLog('System', `当前页面: ${window.location.href}`);
  await sleep(15);
  addLog('System', '主题偏好: 从本地存储读取或根据时段自动选择');
  await sleep(20);

  addLog('System', '正在检查本地存储权限...');
  await sleep(20);
  if (storageController.isAllowed()) {
    addLog('System', '本地存储已授权 (Cookie 同意)');
  } else {
    addLog('System', '本地存储未授权，将使用内存缓存');
  }
  await sleep(15);

  addLog('System', '加载核心配置参数...');
  await sleep(15);
  addLog('System', '配置加载完成 (API端点、白名单、背景图列表等)');
  await sleep(20);

  addLog('Data', '开始预加载关键数据文件...');
  await sleep(15);

  // 用于保存从 statistics 获取的版本信息
  let currentVersion = null;
  let stats = null;

  try {
    // 获取 statistics.json
    addLog('Data', '正在获取统计信息 (statistics.json)...');
    const statsRes = await fetch(`${CONFIG.API.STATISTICS}?t=${Date.now()}`, { cache: 'no-store' });
    if (!statsRes.ok) throw new Error('statistics.json 加载失败');
    stats = await statsRes.json();
    currentVersion = stats.version ? String(stats.version).trim() : null;
    addLog('Data', `统计信息获取成功 (版本: ${currentVersion || '未知'})`);
    await sleep(15);
    addLog('Data', `  文章总数: ${stats.total_articles || 0}`, 1);
    addLog('Data', `  作品总数: ${stats.total_works || 0}`, 1);
    addLog('Data', `  总字数: ${(stats.total_word_count || 0).toLocaleString()}`, 1);
    addLog('Data', `  文章标签数: ${stats.total_article_tags || 0}`, 1);
    addLog('Data', `  作品标签数: ${stats.total_work_tags || 0}`, 1);
    addLog('Data', `  最后更新: ${stats.last_updated || '未知'}`, 1);
    await sleep(20);

    // 获取 articles.json
    addLog('Data', '正在获取文章列表 (articles.json)...');
    const articlesRes = await fetch(`${CONFIG.API.ARTICLES}?t=${Date.now()}`, { cache: 'no-store' });
    if (!articlesRes.ok) throw new Error('articles.json 加载失败');
    const articlesData = await articlesRes.json();
    const articleCount = articlesData.total_articles || articlesData.articles?.length || 0;
    addLog('Data', `文章列表加载成功 (${articleCount} 篇)`);
    if (articlesData.articles && articlesData.articles.length) {
      const latest = articlesData.articles[0]?.title || '无';
      const oldest = articlesData.articles[articlesData.articles.length - 1]?.title || '无';
      addLog('Data', `  最近文章: ${latest}`, 1);
      addLog('Data', `  最早文章: ${oldest}`, 1);
      const cats = new Set();
      articlesData.articles.forEach(a => { if (a.category) cats.add(a.category); });
      addLog('Data', `  文章分类: ${Array.from(cats).join(', ')}`, 1);
    }
    await sleep(20);

    // 获取 works.json
    addLog('Data', '正在获取作品列表 (works.json)...');
    const worksRes = await fetch(`${CONFIG.API.WORKS}?t=${Date.now()}`, { cache: 'no-store' });
    if (!worksRes.ok) throw new Error('works.json 加载失败');
    const worksData = await worksRes.json();
    const workCount = worksData.works?.length || 0;
    addLog('Data', `作品列表加载成功 (${workCount} 个)`);
    if (worksData.works && worksData.works.length) {
      const tags = new Set();
      worksData.works.forEach(w => {
        const t = w.tag || w.tags || [];
        t.forEach(tag => tags.add(tag));
      });
      addLog('Data', `  作品标签: ${Array.from(tags).join(', ')}`, 1);
    }
    await sleep(20);

    // 获取 code_analysis.json
    addLog('Data', '正在加载代码分析数据 (code_analysis.json)...');
    const codeRes = await fetch('/json/code_analysis.json?t=' + Date.now(), { cache: 'no-store' });
    if (codeRes.ok) {
      const codeData = await codeRes.json();
      addLog('Data', `代码分析加载成功 (${codeData.total_files || 0} 个文件)`);
      addLog('Data', `  总代码行数: ${(codeData.total_lines || 0).toLocaleString()}`, 1);
      addLog('Data', `  非空行数: ${(codeData.non_empty_lines || 0).toLocaleString()}`, 1);
      if (codeData.by_extension && codeData.by_extension.length) {
        const topExt = codeData.by_extension.sort((a, b) => b.count - a.count)[0];
        addLog('Data', `  主要文件类型: ${topExt.extension} (${topExt.count} 个文件)`, 1);
      }
    } else {
      addLog('Data', '代码分析数据加载失败，跳过');
    }
    await sleep(20);

    // 获取 friends.json
    addLog('Data', '正在加载友链数据 (friends.json)...');
    const friendsRes = await fetch('/json/friends.json?t=' + Date.now(), { cache: 'no-store' });
    if (friendsRes.ok) {
      const friendsData = await friendsRes.json();
      const friendCount = Array.isArray(friendsData) ? friendsData.length : 0;
      addLog('Data', `友链加载成功 (${friendCount} 个好友)`);
      if (friendCount) {
        const names = friendsData.slice(0, 3).map(f => f.name).join('、');
        addLog('Data', `  友链示例: ${names}${friendCount > 3 ? ' 等' : ''}`, 1);
      }
    } else {
      addLog('Data', '友链数据加载失败，跳过');
    }
    await sleep(20);

  } catch (err) {
    addLog('System', `数据加载错误: ${err.message}`);
    console.warn('[LoadingOverlay] 数据加载部分失败', err);
  }

  // 界面组件初始化
  addLog('UI', '初始化用户界面组件...');
  await sleep(15);
  addLog('UI', '  滚动揭示效果已就绪', 1);
  await sleep(15);
  addLog('UI', '  主题切换开关已绑定', 1);
  await sleep(15);
  addLog('UI', '  自定义光标配置读取中...', 1);
  await sleep(15);
  const cursorEnabled = localStorage.getItem('settings_cursor_enabled') !== 'false';
  addLog('UI', `  自定义光标: ${cursorEnabled ? '启用' : '已禁用'}`, 1);
  await sleep(15);
  addLog('UI', '  外链拦截功能: ' + (localStorage.getItem('settings_link_warning_enabled') !== 'false' ? '启用' : '已禁用'), 1);
  await sleep(20);

  addLog('Player', '启动音乐播放器模块 (NMPv2)...');
  await sleep(20);
  addLog('Player', '  音频源已设定', 1);
  await sleep(15);
  addLog('Player', '  播放控件就绪', 1);
  await sleep(20);

  addLog('Chart', '初始化图表引擎 (Chart.js)...');
  await sleep(20);
  addLog('Chart', '  统计图表渲染完成', 1);
  await sleep(15);

  addLog('System', '所有前置组件加载完毕，等待版本检测...');
  await sleep(20);

  // ---------- 版本检测与更新提示 ----------
  if (!currentVersion && stats) {
    currentVersion = stats.version ? String(stats.version).trim() : null;
  }

  let record = {};
  if (storageController.isAllowed()) {
    const raw = storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD);
    if (raw) {
      try { record = JSON.parse(raw); } catch {}
    }
  }
  const cachedVersion = record.version || null;
  const lastVisit = record.lastVisit ? Number(record.lastVisit) : null;
  addLog('Version', `本地缓存版本: ${cachedVersion || '无'}`);

  const isLatest = !!(cachedVersion && currentVersion && cachedVersion === currentVersion);
  addLog('Version', `版本对比结果: ${isLatest ? '已是最新版本' : '检测到版本差异或首次访问，需要更新'}`);

  if (isLatest) {
    addLog('Version', '版本一致，加载完成，即将进入页面');
    await sleep(20);
    overlay.classList.add('hidden');
    restoreScroll();
  } else {
    if (storageController.isAllowed()) {
      addLog('Version', '正在更新本地访问记录...');
      await sleep(15);
      const newRecord = {
        version: currentVersion || cachedVersion || '未知版本',
        lastVisit: Date.now()
      };
      storageController.setItem(CONFIG.STORAGE_KEYS.VISIT_RECORD, JSON.stringify(newRecord));
      addLog('Version', '本地访问记录已更新');
    }

    let awayText = '';
    if (lastVisit) {
      const diff = Date.now() - lastVisit;
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) awayText = `你刚刚离开 ${seconds} 秒`;
      else if (seconds < 3600) awayText = `你已经离开 ${Math.floor(seconds / 60)} 分钟`;
      else if (seconds < 86400) awayText = `你已经离开 ${Math.floor(seconds / 3600)} 小时`;
      else awayText = `你已经离开 ${Math.floor(seconds / 86400)} 天`;
    } else {
      awayText = '欢迎首次访问本站';
    }
    addLog('Version', `离开时长: ${awayText}`);

    let versionMsg = '';
    if (cachedVersion && currentVersion && cachedVersion !== currentVersion) {
      versionMsg = `网站已从版本 ${cachedVersion} 更新到 ${currentVersion}`;
    } else if (currentVersion) {
      versionMsg = `当前版本：${currentVersion}`;
    } else {
      versionMsg = '版本信息暂未获取，欢迎访问';
    }
    addLog('Version', versionMsg);

    addLog('UI', '正在渲染更新提示界面...');
    await sleep(15);
    content.classList.add('updated');
    const oldInfo = content.querySelector('.update-info');
    if (oldInfo) oldInfo.remove();

    const infoDiv = document.createElement('div');
    infoDiv.className = 'update-info';
    infoDiv.innerHTML = `
      <div class="version-badge">${versionMsg}</div>
      <div class="welcome-message">${awayText}</div>
      <div class="click-hint">点击任意位置继续浏览</div>
    `;
    content.appendChild(infoDiv);

    addLog('UI', '更新提示渲染完成，等待用户交互');
    await sleep(15);

    overlay.addEventListener('click', function handler() {
      addLog('System', '用户点击，关闭覆盖层');
      overlay.classList.add('hidden');
      restoreScroll();
      overlay.removeEventListener('click', handler);
      window.dispatchEvent(new CustomEvent('welcomeOverlayDismissed'));
    }, { once: true });
  }
}

// ========== 主启动函数 ==========
async function bootstrap() {
  // 1. 立即添加优化标签
  addOptimizationLinks();

  // 2. 滚动揭示
  ensureScrollReveal();

  // 3. 主题同步
  const savedTheme = storageController.isAllowed() ? storageController.getItem(CONFIG.STORAGE_KEYS.THEME) : null;
  const initialTheme = savedTheme || getTimeBasedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // 4. 背景图加载（空闲）
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      applyRandomBackgroundImage({ force: true });
    }, { timeout: 100 });
  } else {
    setTimeout(() => applyRandomBackgroundImage({ force: true }), 50);
  }

  // 5. 导航栏和页脚（异步）
  Promise.all([loadNavbar(), loadFooter()]).catch(console.warn);

  // 6. 站点年龄更新
  startSiteAgeUpdater(CONFIG.SITE_BIRTH);

  // 7. 返回顶部按钮
  initButtons();

  // 8. 无刷新导航和列表点击
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      enableAjaxNavigation();
      document.addEventListener('click', handleListItemClick);
    }, { timeout: 500 });
  } else {
    setTimeout(() => {
      enableAjaxNavigation();
      document.addEventListener('click', handleListItemClick);
    }, 100);
  }

  // 9. 当前页面特性初始化
  let currentPage = getPageNameFromPath(window.location.pathname) || 'index';
  if (document.querySelector('.article-page-container') || document.getElementById('articleBody')) {
    currentPage = 'article-detail';
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initPageFeatures(currentPage).catch(console.warn);
    }, { timeout: 800 });
  } else {
    setTimeout(() => initPageFeatures(currentPage).catch(console.warn), 200);
  }

  // 10. 其他非关键功能（注意：我们不再调用 StatisticsManager.syncVisitRecord，由 handleLoadingOverlay 替代）
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
      // 注意：不再调用 StatisticsManager.syncVisitRecord()
      updateFooterUpdateTime().catch(console.warn);
      initFooterStats().catch(console.warn);
    }, { timeout: 3000 });
  } else {
    setTimeout(() => {
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
      updateFooterUpdateTime().catch(console.warn);
      initFooterStats().catch(console.warn);
    }, 500);
  }

  // 11. Cookie 与 Clarity
  cookieConsentManager = new CookieConsentManager(storageController);
  initClarityOnConsent();
  window.addEventListener('ajax:navigation', () => updateClarityPage());

  // 12. 音乐播放器延迟加载
  const loadMusicPlayer = () => {
    import('/js/vendor/global-music-player.js').catch(() => { });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadMusicPlayer, { timeout: 5000 });
  } else {
    setTimeout(loadMusicPlayer, 3000);
  }

  // 13. 启用浏览器回退/前进支持
  initPopstate();

  // 14. 处理加载覆盖层（版本检测）
  await handleLoadingOverlay().catch(console.warn);

  document.body.setAttribute('data-loaded', 'true');
  console.log('[Main] 初始化完成');
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', bootstrap);

// 注册 Service Worker（开发环境跳过）
const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (!isDev) {
  registerServiceWorker();
} else {
  console.log('[Main] 开发环境，跳过 Service Worker 注册');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(r => r.unregister());
    });
  }
}

// 暴露全局函数供其他模块使用
window.fetchAndReplaceContent = fetchAndReplaceContent;
window.refreshScrollReveal = refreshScrollReveal;
window.clearAllServiceWorkerCache = clearAllServiceWorkerCache;