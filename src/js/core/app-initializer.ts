// /js/core/app-initializer.ts
// 应用启动编排器 + 全站导航后刷新入口

import { CONFIG, IS_DEV, scheduleIdle, onNavigation } from '/js/core/core.js';
import { Utils } from '/js/core/core.js';
import { themeController } from '/js/core/theme-controller.js';
import {
  applyRandomBackgroundImage,
  startSiteAgeUpdater,
  updateFooterUpdateTime,
} from '/js/core/page-runtime.js';
import {
  loadNavbar,
  loadFooter,
  enableAjaxNavigation,
  initPageFeatures,
  initPopstate,
} from '/js/router/router.js';
import { initUIEffects, ensureScrollReveal } from '/js/ui/ui-effects.js';
import { LazyImageLoader, GlobalImageManager } from '/js/ui/image-manager.js';
import { initButtons, refreshButtonsOnNavigation } from '/js/ui/button-manager.js';
import { renderPersonalCard } from '/js/ui/personal-card.js';
import { initClarityOnConsent, updateClarityPage } from '/js/core/clarity.js';
import { registerServiceWorker, initFooterStats } from '/js/data/site-state.js';
import { handleListItemClick } from '/js/ui/list-events.js';
import { LoadingOverlayManager } from '/js/ui/loading-overlay-manager.js';
import { dataService } from '/js/core/data-service.js';
import { applyStoredSettings } from '/js/data/settings.js';
import type { NavbarManager } from '/js/ui/navbar-manager.js';

export class AppInitializer {
  private static navbarInstance: NavbarManager | null = null;

  /**
   * 启动应用。
   * 顶层按阶段编排；导航后的刷新统一注册在 initNavigationHandlers()。
   */
  public static async start(): Promise<void> {
    document.body.classList.add('loading');

    // 阶段 1：基础设施（同步，极快）
    this.initInfrastructure();

    // 阶段 2：页面骨架（等待导航栏）
    await this.initShell();

    // 阶段 3：空闲任务（不阻塞交互）
    this.scheduleDeferredTasks();

    // 阶段 4：收尾
    await this.finalizeAndReveal();

    // 阶段 5：注册全站导航后刷新（唯一入口）
    this.initNavigationHandlers();
  }

  // ---------- 阶段 1：基础设施 ----------

  private static initInfrastructure(): void {
    this.addOptimizationLinks();
    ensureScrollReveal();
    themeController.init();

    // 背景图延迟加载：尊重用户设置
    scheduleIdle(
      () => {
        if (this.isBgImageEnabled()) {
          applyRandomBackgroundImage({ force: true });
        }
      },
      { timeout: 100 }
    );
  }

  // ---------- 阶段 2：页面骨架 ----------

  private static async initShell(): Promise<void> {
    // 1. 加载导航栏（必须等待）
    this.navbarInstance = await loadNavbar();

    // 2. 应用所有本地设置（含字体大小、滚动揭示、背景图开关等）
    applyStoredSettings();

    // 3. 加载页脚（非阻塞）
    loadFooter().catch(console.warn);

    // 4. 渲染个人卡片
    renderPersonalCard();

    // 5. 站点年龄更新
    startSiteAgeUpdater(CONFIG.SITE_BIRTH);

    // 6. 浮动按钮
    initButtons();
  }

  // ---------- 阶段 3：空闲任务 ----------

  private static scheduleDeferredTasks(): void {
    // 无刷新导航和列表点击
    scheduleIdle(() => {
      enableAjaxNavigation();
      document.addEventListener('click', handleListItemClick);
    }, { timeout: 500 });

    // 当前页面特性初始化
    scheduleIdle(() => {
      let currentPage = Utils.getPageNameFromPath(window.location.pathname) || 'index';
      if (
        document.querySelector('.article-page-container') ||
        document.getElementById('articleBody')
      ) {
        currentPage = 'article-detail';
      }
      initPageFeatures(currentPage).catch(console.warn);
    }, { timeout: 800 });

    // 其他非关键功能
    scheduleIdle(() => {
      initUIEffects();
      dataService.warmup();
      LazyImageLoader.init();
      GlobalImageManager.init();
      updateFooterUpdateTime().catch(console.warn);
      initFooterStats().catch(console.warn);
    }, { timeout: 3000 });

    // 音乐播放器（更晚，避免抢带宽）
    scheduleIdle(() => {
      import('/js/vendor/global-music-player.js').catch(() => {});
    }, { timeout: 5000 });
  }

  // ---------- 阶段 4：收尾 ----------

  private static async finalizeAndReveal(): Promise<void> {
    // Clarity 初始化（站点默认同意存储与统计）
    initClarityOnConsent();

    // 浏览器回退/前进支持
    initPopstate();

    // 加载覆盖层（等待用户交互或版本确认）
    const overlayManager = new LoadingOverlayManager();
    await overlayManager.show();

    // 覆盖层有 0.8s 淡出：等它彻底不可见，再让导航栏入场并勾边 LOGO
    await this.waitOverlayFullyHidden();
    if (
      this.navbarInstance &&
      typeof this.navbarInstance.playEntranceAnimation === 'function'
    ) {
      this.navbarInstance.playEntranceAnimation();
    }

    // 导航栏入场过半后开始勾边（2s），避免两个动画抢视觉焦点
    window.setTimeout(() => {
      this.navbarInstance?.playLogoDraw();
    }, 260);

    document.body.setAttribute('data-loaded', 'true');
    console.log('[AppInitializer] 初始化完成');

    // Service Worker 注册（仅生产环境）
    this.registerServiceWorkerByEnv();
  }

  // ---------- 阶段 5：导航后刷新（唯一入口） ----------

  /**
   * 全站所有"SPA 导航后需要重新执行"的动作集中在此。
   * 各模块自身不得再 `window.addEventListener('ajax:navigation', ...)`。
   */
  private static initNavigationHandlers(): void {
    onNavigation(() => {
      // 同步：立即重新计算 UI 状态
      renderPersonalCard();
      refreshButtonsOnNavigation();
      applyStoredSettings();
      updateClarityPage();

      // 延迟：等待新 DOM 插入后再更新（避免拿到旧 DOM）
      window.setTimeout(() => {
        initFooterStats().catch(console.warn);
        updateFooterUpdateTime().catch(console.warn);
      }, 100);
    });
  }

  // ---------- 内部辅助 ----------

  /**
   * 等待加载覆盖层淡出完成（opacity → 0 且 visibility → hidden）。
   * 用 transitionend 精确收尾，超时兜底避免动画事件丢失时卡住后续流程。
   */
  private static waitOverlayFullyHidden(timeout = 1000): Promise<void> {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return Promise.resolve();

    return new Promise((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        overlay.removeEventListener('transitionend', onEnd);
        resolve();
      };
      const onEnd = (event: TransitionEvent): void => {
        if (event.target === overlay && event.propertyName === 'opacity') done();
      };
      const timer = window.setTimeout(done, timeout);

      overlay.addEventListener('transitionend', onEnd);
      // 覆盖层可能早已可见/不存在过渡（例如被直接移除）
      if (getComputedStyle(overlay).opacity === '0') done();
    });
  }

  private static isBgImageEnabled(): boolean {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.BG_IMAGE_ENABLED);
    return stored === null ? true : stored !== 'false';
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