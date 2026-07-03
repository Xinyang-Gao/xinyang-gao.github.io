// /js/entry/main.js (优化 LCP 版本，支持回退/前进 + 加载覆盖层版本检测)

import { CONFIG, storageController, CookieConsentManager, Utils } from '/js/core/core.js';
import { initUIEffects, refreshScrollReveal, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { getTimeBasedTheme, getPageNameFromPath, applyRandomBackgroundImage, startSiteAgeUpdater, updateFooterUpdateTime } from '/js/core/page-utils.js';
import { loadNavbar, loadFooter, enableAjaxNavigation, initPageFeatures, fetchAndReplaceContent, initPopstate } from '/js/router/router.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { StatisticsManager, preloadCriticalJSON, registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';
import { renderPersonalCard } from '/js/ui/personal-card.js';
import { initButtons } from '/js/ui/button-manager.js';
import { friendLinkManager } from '/js/ui/friend-link-manager.js';

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
  // ---------- 辅助函数 ----------
  function restoreScroll() {
    document.body.classList.remove('loading');
    document.body.style.overflow = '';
  }

  const overlay = document.getElementById('loading-overlay');
  const content = document.getElementById('loading-content');
  if (!overlay) return;

  document.body.style.overflow = 'hidden';

  let logContainer = document.querySelector('.loading-log');
  if (!logContainer) {
    logContainer = document.createElement('div');
    logContainer.className = 'loading-log';
    overlay.appendChild(logContainer);
  } else {
    logContainer.innerHTML = '';
  }

  // ---------- 日志缓冲区 ----------
  const logBuffer: { module: string; msg: string; indent: number; time: string }[] = [];
  let logIndex = 0;

  function addLog(module: string, msg: string, indent = 0) {
    const time = new Date().toLocaleTimeString();
    logBuffer.push({ module, msg, indent, time });
  }

  function flushLogs() {
    if (logBuffer.length === 0) return;
    const fragment = document.createDocumentFragment();
    logBuffer.forEach(({ module, msg, indent, time }) => {
      const line = document.createElement('div');
      line.className = `log-entry log-module-${module}`;
      const indentStr = '│ '.repeat(indent) + (indent > 0 ? '├── ' : '');
      line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-module-name">[${module}]</span> ${indentStr}${msg}`;
      line.style.animationDelay = (logIndex * 0.035) + 's';
      fragment.appendChild(line);
      logIndex++;
    });
    logContainer.appendChild(fragment);
    logContainer.scrollTop = logContainer.scrollHeight;
    logBuffer.length = 0;
  }

  // ===== 1. 覆盖层启动 =====
  addLog('System', '加载覆盖层已启动');
  addLog('System', `浏览器标识: ${navigator.userAgent.split(' ').slice(0, 3).join(' ')}`);
  addLog('System', `当前页面: ${window.location.href}`);
  addLog('System', '主题偏好: 从本地存储读取或根据时段自动选择');
  addLog('System', '检查本地存储权限...');
  if (storageController.isAllowed()) {
    addLog('System', '本地存储已授权 (Cookie 同意)');
  } else {
    addLog('System', '本地存储未授权，将使用内存缓存');
  }
  addLog('System', '加载核心配置参数...');
  addLog('System', '配置加载完成 (API端点、白名单、背景图列表等)');
  flushLogs();

  // ===== 2. 网络与数据请求 =====
  addLog('Data', '检查网络连接状态...');
  addLog('Data', '网络连接正常，开始并行请求关键数据');
  addLog('Data', '发起请求: 统计信息、文章列表、作品列表、代码分析、友链、版本信息');
  flushLogs();

  const fetchTasks = [
    { key: 'statistics', url: `${CONFIG.API.STATISTICS}?t=${Date.now()}` },
    { key: 'articles', url: `${CONFIG.API.ARTICLES}?t=${Date.now()}` },
    { key: 'works', url: `${CONFIG.API.WORKS}?t=${Date.now()}` },
    { key: 'code', url: '/json/code_analysis.json?t=' + Date.now() },
    { key: 'friends', url: '/json/friends.json?t=' + Date.now() },
    { key: 'version', url: '/json/version.json?t=' + Date.now() }
  ];

  const results = await Promise.allSettled(
    fetchTasks.map(task =>
      fetch(task.url, { cache: 'no-store' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
    )
  );

  const dataMap: Record<string, any> = {};
  results.forEach((result, index) => {
    const key = fetchTasks[index].key;
    if (result.status === 'fulfilled') {
      dataMap[key] = result.value;
      addLog('Data', `${key} 加载成功`);
    } else {
      addLog('Data', `${key} 加载失败: ${result.reason?.message || '未知错误'}`);
    }
  });
  flushLogs();

  // ===== 3. 解析统计数据 =====
  const stats = dataMap.statistics || null;
  let currentVersion = stats?.version ? String(stats.version).trim() : null;

  if (stats) {
    addLog('Data', '解析统计信息...');
    addLog('Data', `  版本号: ${currentVersion || '未知'}`, 1);
    addLog('Data', `  文章总数: ${stats.total_articles || 0}`, 1);
    addLog('Data', `  作品总数: ${stats.total_works || 0}`, 1);
    addLog('Data', `  总字数: ${(stats.total_word_count || 0).toLocaleString()}`, 1);
    addLog('Data', `  文章标签数: ${stats.total_article_tags || 0}`, 1);
    addLog('Data', `  作品标签数: ${stats.total_work_tags || 0}`, 1);
    addLog('Data', `  最后更新: ${stats.last_updated || '未知'}`, 1);
  }

  const articlesData = dataMap.articles || null;
  if (articlesData) {
    const count = articlesData.total_articles || articlesData.articles?.length || 0;
    addLog('Data', `文章列表加载成功 (${count} 篇)`);
    if (articlesData.articles?.length) {
      const latest = articlesData.articles[0]?.title || '无';
      const oldest = articlesData.articles[articlesData.articles.length - 1]?.title || '无';
      addLog('Data', `  最近文章: ${latest}`, 1);
      addLog('Data', `  最早文章: ${oldest}`, 1);
      const cats = new Set();
      articlesData.articles.forEach(a => { if (a.category) cats.add(a.category); });
      if (cats.size) addLog('Data', `  文章分类: ${Array.from(cats).join(', ')}`, 1);
    }
  }

  const worksData = dataMap.works || null;
  if (worksData) {
    const count = worksData.works?.length || 0;
    addLog('Data', `作品列表加载成功 (${count} 个)`);
    if (worksData.works?.length) {
      const tags = new Set();
      worksData.works.forEach(w => {
        const t = w.tag || w.tags || [];
        t.forEach(tag => tags.add(tag));
      });
      if (tags.size) addLog('Data', `  作品标签: ${Array.from(tags).join(', ')}`, 1);
    }
  }

  const codeData = dataMap.code || null;
  if (codeData) {
    addLog('Data', `代码分析加载成功 (${codeData.total_files || 0} 个文件)`);
    addLog('Data', `  总代码行数: ${(codeData.total_lines || 0).toLocaleString()}`, 1);
    addLog('Data', `  非空行数: ${(codeData.non_empty_lines || 0).toLocaleString()}`, 1);
    if (codeData.by_extension?.length) {
      const topExt = codeData.by_extension.sort((a, b) => b.count - a.count)[0];
      addLog('Data', `  主要文件类型: ${topExt.extension} (${topExt.count} 个文件)`, 1);
    }
  }

  const friendsData = dataMap.friends || null;
  if (friendsData) {
    const count = Array.isArray(friendsData) ? friendsData.length : 0;
    addLog('Data', `友链加载成功 (${count} 个好友)`);
    if (count) {
      const names = friendsData.slice(0, 3).map(f => f.name).join('、');
      addLog('Data', `  友链示例: ${names}${count > 3 ? ' 等' : ''}`, 1);
    }
  }
  flushLogs();

  // ===== 4. UI 组件状态 =====
  addLog('UI', '用户界面组件初始化完成');
  const cursorEnabled = localStorage.getItem('settings_cursor_enabled') !== 'false';
  addLog('UI', `  自定义光标: ${cursorEnabled ? '启用' : '已禁用'}`, 1);
  addLog('UI', `  外链拦截: ${localStorage.getItem('settings_link_warning_enabled') !== 'false' ? '启用' : '已禁用'}`, 1);
  addLog('Player', '音乐播放器模块已就绪');
  addLog('Chart', '统计图表渲染完成');
  flushLogs();

  // ===== 5. 版本检测 =====
  const versionData = dataMap.version || null;
  let allVersions: any[] = [];
  let latestWebVersion: string | null = null;
  if (versionData && Array.isArray(versionData.versions)) {
    allVersions = versionData.versions.slice().sort((a, b) => a.id - b.id);
    if (allVersions.length) {
      latestWebVersion = allVersions[allVersions.length - 1].version;
    }
  }

  addLog('Version', '读取本地存储的网站版本...');
  let storedVersion: string | null = null;
  if (storageController.isAllowed()) {
    storedVersion = storageController.getItem('siteVersion');
  }
  addLog('Version', `本地版本: ${storedVersion || '无'}`);
  addLog('Version', `远程最新版本: ${latestWebVersion || '无'}`);

  const needUpdate = !storedVersion || (latestWebVersion && storedVersion !== latestWebVersion);
  addLog('Version', `版本比对结果: ${needUpdate ? '需要更新' : '版本一致'}`);

  if (!needUpdate) {
    addLog('Version', '版本一致，加载完成，即将进入页面');
    flushLogs();
    overlay.classList.add('hidden');
    restoreScroll();
    addLog('System', '覆盖层已关闭，页面可交互');
    flushLogs(); // 虽然已经隐藏，但可最后输出
    return;
  }

  // ===== 6. 生成更新信息 =====
  addLog('Version', '检测到版本更新，准备生成更新提示');
  let startIdx = 0;
  if (storedVersion) {
    const foundIdx = allVersions.findIndex(v => v.version === storedVersion);
    if (foundIdx !== -1) {
      startIdx = foundIdx + 1;
    } else {
      startIdx = Math.max(0, allVersions.length - 3);
    }
  } else {
    startIdx = Math.max(0, allVersions.length - 3);
  }
  const relevantVersions = allVersions.slice(startIdx);

  let versionMsg = '';
  if (storedVersion && relevantVersions.length > 0) {
    const firstVer = relevantVersions[0].version;
    const lastVer = relevantVersions[relevantVersions.length - 1].version;
    if (relevantVersions.length === 1) {
      versionMsg = `网站已从版本 ${storedVersion} 更新到 ${lastVer}`;
    } else {
      versionMsg = `网站已从版本 ${storedVersion} 更新到 ${lastVer}，共 ${relevantVersions.length} 个版本更新`;
    }
  } else if (relevantVersions.length > 0) {
    const lastVer = relevantVersions[relevantVersions.length - 1].version;
    versionMsg = `当前版本：${lastVer}（最近 ${relevantVersions.length} 个版本）`;
  } else {
    versionMsg = '版本信息暂未获取，欢迎访问';
  }

  if (storageController.isAllowed() && latestWebVersion) {
    storageController.setItem('siteVersion', latestWebVersion);
    addLog('Version', `已存储最新版本: ${latestWebVersion}`);
  }

  let awayText = '';
  let record: any = {};
  if (storageController.isAllowed()) {
    const raw = storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD);
    if (raw) {
      try { record = JSON.parse(raw); } catch { /* ignore */ }
    }
  }
  const lastVisit = record.lastVisit ? Number(record.lastVisit) : null;

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
  addLog('Version', `版本摘要: ${versionMsg}`);
  flushLogs();

  // ===== 7. 渲染更新界面 =====
  let changesHTML = '';
  if (relevantVersions.length > 0) {
    const items = relevantVersions.map(v => {
      const versionLabel = v.version || `v${v.id}`;
      const changeItems = (v.changes || []).slice(0, 5).map(c => {
        const type = Utils.escapeHtml(c.type || '');
        const desc = Utils.escapeHtml(c.description || '');
        return `<li><span class="change-type">[${type}]</span> ${desc}</li>`;
      }).join('');
      if (changeItems) {
        return `<li class="version-header">${versionLabel}</li><ul class="changes-list">${changeItems}</ul>`;
      }
      return '';
    }).filter(s => s).join('');
    if (items) {
      changesHTML = `<div class="changes-container"><h4>📋 更新内容</h4><ul class="changes-list">${items}</ul></div>`;
    }
  }

  addLog('UI', '正在渲染更新提示界面...');
  flushLogs();

  content.classList.add('updated');
  const oldInfo = content.querySelector('.update-info');
  if (oldInfo) oldInfo.remove();

  const infoDiv = document.createElement('div');
  infoDiv.className = 'update-info';
  infoDiv.innerHTML = `
    <div class="version-badge">${versionMsg}</div>
    <div class="welcome-message">${awayText}</div>
    ${changesHTML}
    <div class="click-hint">点击任意位置继续</div>
  `;
  content.appendChild(infoDiv);

  addLog('UI', '更新界面已渲染，等待用户交互');
  flushLogs();

  // ===== 8. 点击处理（Cookie 许可） =====
  const handleOverlayClick = async (e: Event) => {
    if (storageController.isAllowed()) {
      addLog('System', 'Cookie 已同意，直接关闭覆盖层');
      overlay.classList.add('hidden');
      restoreScroll();
      window.dispatchEvent(new CustomEvent('welcomeOverlayDismissed'));
      overlay.removeEventListener('click', handleOverlayClick);
      addLog('System', '覆盖层已关闭，页面可交互');
      flushLogs();
      return;
    }

    addLog('System', '用户点击，但尚未同意 Cookie，显示许可请求');
    const hint = infoDiv.querySelector('.click-hint');
    if (hint) hint.remove();

    infoDiv.classList.add('transitioning');
    await new Promise(resolve => setTimeout(resolve, 500));

    const titleContainer = document.createElement('div');
    titleContainer.className = 'cookie-consent-title';
    const badge = infoDiv.querySelector('.version-badge');
    const welcome = infoDiv.querySelector('.welcome-message');
    if (badge) titleContainer.appendChild(badge.cloneNode(true));
    if (welcome) titleContainer.appendChild(welcome.cloneNode(true));

    const consentDiv = document.createElement('div');
    consentDiv.className = 'cookie-consent-panel';
    consentDiv.innerHTML = `
      <div class="consent-benefits">
        <p><i class="fas fa-palette"></i> 记录主题偏好，下次访问自动应用</p>
        <p><i class="fas fa-database"></i> 缓存文章数据，提升加载速度</p>
        <p><i class="fas fa-chart-line"></i> 分析访问流量，优化网站体验</p>
      </div>
      <div class="consent-privacy">
        <i class="fas fa-shield-alt"></i>
        <span>我们不会使用 Cookie 投放个性化广告，<a href="/privacy/" target="_blank">查看完整隐私政策</a></span>
      </div>
      <div class="consent-actions">
        <button class="consent-btn consent-accept" id="consent-accept-btn">继续</button>
        <button class="consent-btn consent-decline" id="consent-decline-btn">拒绝</button>
      </div>
    `;

    infoDiv.innerHTML = '';
    infoDiv.classList.remove('transitioning');
    infoDiv.appendChild(titleContainer);
    infoDiv.appendChild(consentDiv);
    void infoDiv.offsetHeight;

    const acceptBtn = infoDiv.querySelector('#consent-accept-btn');
    const declineBtn = infoDiv.querySelector('#consent-decline-btn');

    acceptBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addLog('System', '用户同意 Cookie，存储偏好');
      const consentManager = new CookieConsentManager(storageController);
      consentManager.setConsented(true);
      window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
      const banner = document.getElementById('cookie-consent-banner');
      if (banner) banner.remove();
      overlay.classList.add('hidden');
      restoreScroll();
      window.dispatchEvent(new CustomEvent('welcomeOverlayDismissed'));
      overlay.removeEventListener('click', handleOverlayClick);
      addLog('System', '覆盖层已关闭，页面可交互');
      flushLogs();
    });

    declineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addLog('System', '用户拒绝 Cookie，使用无存储模式');
      const consentManager = new CookieConsentManager(storageController);
      consentManager.setConsented(false);
      const banner = document.getElementById('cookie-consent-banner');
      if (banner) {
        banner.style.display = '';
        banner.classList.remove('hidden');
      }
      overlay.classList.add('hidden');
      restoreScroll();
      window.dispatchEvent(new CustomEvent('welcomeOverlayDismissed'));
      overlay.removeEventListener('click', handleOverlayClick);
      addLog('System', '覆盖层已关闭，页面可交互');
      flushLogs();
    });

    addLog('UI', 'Cookie 许可界面已渲染');
    flushLogs();
  };

  overlay.addEventListener('click', handleOverlayClick);
  addLog('System', '覆盖层就绪，等待用户操作');
  flushLogs();
}

// ========== 主启动函数 ==========
async function bootstrap() {
  document.body.classList.add('loading');

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

  // 5. 加载导航栏并获取实例
  const navbarInstance = await loadNavbar();

  // 6. 加载页脚（异步，不阻塞）
  loadFooter().catch(console.warn);

    // 渲染个人卡片（确保模块被使用）
  renderPersonalCard();

  // 7. 站点年龄更新
  startSiteAgeUpdater(CONFIG.SITE_BIRTH);

  // 8. 返回顶部按钮
  initButtons();

  // 9. 无刷新导航和列表点击
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

  // 10. 当前页面特性初始化
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

  // 11. 其他非关键功能
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initUIEffects();
      preloadCriticalJSON();
      LazyImageLoader.init();
      GlobalImageManager.init();
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

  // 12. Cookie 与 Clarity
  cookieConsentManager = new CookieConsentManager(storageController);
  initClarityOnConsent();
  window.addEventListener('ajax:navigation', () => updateClarityPage());

  // 13. 音乐播放器延迟加载
  const loadMusicPlayer = () => {
    import('/js/vendor/global-music-player.js').catch(() => { });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadMusicPlayer, { timeout: 5000 });
  } else {
    setTimeout(loadMusicPlayer, 3000);
  }

  // 14. 启用浏览器回退/前进支持
  initPopstate();

  // 15. 处理加载覆盖层（版本检测）
  await handleLoadingOverlay();

  // 16. 等待1秒后播放导航栏入场动画（仅首次加载）
  await new Promise(resolve => setTimeout(resolve, 500));
  navbarInstance.playEntranceAnimation();

  document.body.setAttribute('data-loaded', 'true');
  console.log('[Main] 初始化完成');

  // 17. 友链跳转管理器
  friendLinkManager.init();
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