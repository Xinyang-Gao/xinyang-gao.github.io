// /js/core/app-initializer.ts
// 应用启动编排器

import { CONFIG, IS_DEV, scheduleIdle } from '/js/core/core.js';
import { themeController } from '/js/core/theme-controller.js';
import {
  applyRandomBackgroundImage,
  getPageNameFromPath,
  startSiteAgeUpdater,
  updateFooterUpdateTime,
} from '/js/core/page-utils.js';
import {
  loadNavbar,
  loadFooter,
  enableAjaxNavigation,
  initPageFeatures,
  initPopstate,
} from '/js/router/router.js';
import { initUIEffects, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { initButtons } from '/js/ui/button-manager.js';
import { renderPersonalCard } from '/js/ui/personal-card.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';
import { registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import { LoadingOverlayManager } from '/js/ui/loading-overlay-manager.js';
import { dataService } from '/js/core/data-service.js';
import type { NavbarManager } from '/js/ui/navbar-manager.js';

export class AppInitializer {
  private static navbarInstance: NavbarManager | null = null;

  /**
   * 启动应用。
   * 顶层只负责按阶段编排，具体步骤下沉到 4 个子方法。
   */
  public static async start(): Promise<void> {
    document.body.classList.add('loading');

    // 阶段 1：基础设施（同步，极快）
    this.initInfrastructure();

    // 阶段 2：页面骨架（等待导航栏）
    await this.initShell();

    // 阶段 3：空闲任务（不阻塞交互）
    this.scheduleDeferredTasks();

    // 阶段 4：收尾（Clarity / popstate / 覆盖层 / 入场动画 / SW）
    await this.finalizeAndReveal();
  }

  // ---------- 阶段 1：基础设施 ----------

  private static initInfrastructure(): void {
    // 1. 添加优化标签（预连接、预加载）
    this.addOptimizationLinks();

    // 2. 滚动揭示
    ensureScrollReveal();

    // 3. 主题同步
    themeController.init();

    // 4. 背景图加载（空闲，不阻塞 LCP）
    scheduleIdle(
      () => applyRandomBackgroundImage({ force: true }),
      { timeout: 100 }
    );
  }

  // ---------- 阶段 2：页面骨架 ----------

  private static async initShell(): Promise<void> {
    // 5. 加载导航栏（必须等待）
    this.navbarInstance = await loadNavbar();

    // 6. 加载页脚（非阻塞）
    loadFooter().catch(console.warn);

    // 7. 渲染个人卡片
    renderPersonalCard();

    // 8. 站点年龄更新
    startSiteAgeUpdater(CONFIG.SITE_BIRTH);

    // 9. 浮动按钮（返回顶部、设置、TOC）
    initButtons();
  }

  // ---------- 阶段 3：空闲任务 ----------

  private static scheduleDeferredTasks(): void {
    // 10. 无刷新导航和列表点击
    scheduleIdle(() => {
      enableAjaxNavigation();
      document.addEventListener('click', handleListItemClick);
    }, { timeout: 500 });

    // 11. 当前页面特性初始化
    scheduleIdle(() => {
      let currentPage = getPageNameFromPath(window.location.pathname) || 'index';
      if (
        document.querySelector('.article-page-container') ||
        document.getElementById('articleBody')
      ) {
        currentPage = 'article-detail';
      }
      initPageFeatures(currentPage).catch(console.warn);
    }, { timeout: 800 });

    // 12. 其他非关键功能
    scheduleIdle(() => {
      initUIEffects();
      // 预热常用数据（单例内部统一管理缓存与去重）
      dataService.warmup();
      LazyImageLoader.init();
      GlobalImageManager.init();
      updateFooterUpdateTime().catch(console.warn);
      initFooterStats().catch(console.warn);
    }, { timeout: 3000 });

    // 13. 音乐播放器（更晚，避免抢带宽）
    scheduleIdle(() => {
      import('/js/vendor/global-music-player.js').catch(() => {});
    }, { timeout: 5000 });
  }

  // ---------- 阶段 4：收尾 ----------

  private static async finalizeAndReveal(): Promise<void> {
    // 14. Clarity 初始化（站点默认同意存储与统计，无需等待用户交互）
    initClarityOnConsent();
    window.addEventListener('ajax:navigation', () => updateClarityPage());

    // 15. 浏览器回退/前进支持
    initPopstate();

    // 16. 处理加载覆盖层（等待用户交互或版本确认）
    const overlayManager = new LoadingOverlayManager();
    await overlayManager.show();

    // 17. 等待 500ms 后播放导航栏入场动画
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (
      this.navbarInstance &&
      typeof this.navbarInstance.playEntranceAnimation === 'function'
    ) {
      this.navbarInstance.playEntranceAnimation();
    }

    // 18. 标记加载完成
    document.body.setAttribute('data-loaded', 'true');
    console.log('[AppInitializer] 初始化完成');

    // 19. Service Worker 注册（仅生产环境）
    this.registerServiceWorkerByEnv();
  }

  private static registerServiceWorkerByEnv(): void {
    if (!IS_DEV) {
      registerServiceWorker();
      return;
    }

    console.log('[Main] 开发环境，跳过 Service Worker 注册');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((r) => r.unregister());
      });
    }
  }

  // ---------- 内部辅助 ----------

  /**
   * 添加预连接、预加载等优化标签。
   * 注意：若站点将来需要更细粒度的资源提示控制，可迁移到 HTML <head> 中硬编码。
   */
  private static addOptimizationLinks(): void {
    const head = document.head;

    const preconnectBing = document.createElement('link');
    preconnectBing.rel = 'preconnect';
    preconnectBing.href = 'https://cn.bing.com';
    head.appendChild(preconnectBing);

    const preconnectAPI = document.createElement('link');
    preconnectAPI.rel = 'preconnect';
    preconnectAPI.href = 'https://api.hypcvgm.top';
    head.appendChild(preconnectAPI);

    const preloadAvatar = document.createElement('link');
    preloadAvatar.rel = 'preload';
    preloadAvatar.as = 'image';
    preloadAvatar.href = '/assets/avatar.webp';
    preloadAvatar.fetchPriority = 'high';
    head.appendChild(preloadAvatar);
  }
}