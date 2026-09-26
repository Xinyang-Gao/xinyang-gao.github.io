// /js/data/settings.ts
// 站点设置：读写本地存储 / 应用设置 / 绑定设置面板控件
// 所有设置键统一来自 core.ts 的 CONFIG.STORAGE_KEYS，禁止在此处硬编码

import { CONFIG, safeLocal, safeSession, storageController } from '/js/core/core.js';
import { themeController, type ThemeMode } from '/js/core/theme-controller.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';
import { showBackgroundImage } from '/js/core/page-runtime.js';

const K = CONFIG.STORAGE_KEYS;

/** 允许被本模块读写/应用的设置键 */
type SettingKey =
  | typeof K.CURSOR_ENABLED
  | typeof K.LINK_WARNING_ENABLED
  | typeof K.THEME_MODE
  | typeof K.FONT_SCALE
  | typeof K.REVEAL_ENABLED
  | typeof K.BG_IMAGE_ENABLED;

// ==================== 通用读写（唯一出口） ====================
export function getSetting(
  key: SettingKey,
  defaultValue: boolean | string | number = true
): boolean | string {
  const stored = storageController.getItem(key);
  if (stored !== null) {
    if (stored === 'true' || stored === 'false') return stored === 'true';
    return stored;
  }
  return defaultValue as boolean | string;
}

export function setSetting(key: SettingKey, value: boolean | string | number): void {
  storageController.setItem(key, String(value));
}

/**
 * 便捷布尔判断：语义等于 `getSetting(key, default) === true`，
 * 但意图更清晰。供 UI 模块（如 ui-effects）判断功能开关。
 */
export function isEnabled(key: SettingKey, defaultValue = true): boolean {
  return getSetting(key, defaultValue) as boolean;
}

/**
 * 读取数值型设置。
 * localStorage 只存字符串，直接 `as number` 拿到的是 "110" 这样的假类型，
 * 靠后续 `/` 的隐式转换才不出错。这里显式转换并做有限性校验。
 */
export function getNumberSetting(key: SettingKey, defaultValue: number): number {
  const raw = getSetting(key, defaultValue);
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : defaultValue;
}

// ==================== 清理工具 ====================
export async function clearSWCacheAndReload(): Promise<void> {
  // 清空 DataService 内存缓存
  const { dataService } = await import('/js/core/data-service.js');
  dataService.clearCache();

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    } catch (e) {
      console.warn('[Settings] 注销 Service Worker 失败:', e);
    }
  }
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  } catch (e) {
    console.warn('[Settings] 清空 CacheStorage 失败:', e);
  }
  window.location.reload();
}

export async function clearAllStorageAndReload(): Promise<void> {
  // 无痕模式下这里会抛异常，必须兜住，否则后面的注销与刷新都不会执行
  safeLocal.clear();
  safeSession.clear();

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    } catch (e) {
      console.warn('[Settings] 注销 Service Worker 失败:', e);
    }
  }
  window.location.reload();
}

// ==================== 应用函数 ====================

/**
 * 应用主题模式。
 * 实际状态由 themeController 管理；本函数只负责转发并同步面板 UI。
 */
function applyThemeMode(mode: string): void {
  const validMode: ThemeMode = mode === 'light' || mode === 'dark' ? mode : 'auto';
  themeController.setMode(validMode);

  // 同步面板控件
  const themeSelect = document.getElementById('themeModeSelect') as HTMLSelectElement | null;
  if (themeSelect) themeSelect.value = validMode;

  const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = themeController.getTheme() === 'dark';
}

function applyFontScale(scale: number): void {
  const base = 16;
  const newSize = base * (scale / 100);
  document.documentElement.style.fontSize = newSize + 'px';
}

function applyRevealEnabled(enabled: boolean): void {
  const inst = (window as any).scrollRevealInstance;
  if (inst) {
    if (enabled) {
      inst.refresh();
    } else {
      inst.destroy();
      (window as any).scrollRevealInstance = null;
    }
  } else if (enabled) {
    import('/js/ui/ui-effects.js').then(({ ensureScrollReveal }) => {
      ensureScrollReveal();
    });
  }
}

/**
 * 控制背景图显示状态。
 *
 * 关闭时只清空 background-image，保留 overlay 上记录的壁纸 URL，
 * 因此重新开启可以直接恢复，**无需再次下载**。
 */
function applyBgImageEnabled(enabled: boolean): void {
  const overlay = document.getElementById('bg-image-overlay') as HTMLElement | null;

  if (!enabled) {
    if (overlay) {
      overlay.style.backgroundImage = 'none';
      overlay.style.opacity = '0';
      overlay.classList.remove('active');
    }
    return;
  }

  showBackgroundImage();
}

// ==================== 应用所有存储的设置 ====================
/**
 * 页面加载 / SPA 导航时调用。
 * 主题状态由 themeController 内部维护，此函数只负责同步 UI 与其它设置。
 */
export function applyStoredSettings(): void {
  // 1. 主题：确保 controller 已初始化，并把当前模式同步到控件
  themeController.init();

  const themeSelect = document.getElementById('themeModeSelect') as HTMLSelectElement | null;
  if (themeSelect) themeSelect.value = themeController.getMode();

  const themeCheckbox = document.getElementById(
    'theme-toggle-checkbox'
  ) as HTMLInputElement | null;
  if (themeCheckbox) themeCheckbox.checked = themeController.getTheme() === 'dark';

  // 2. 字体大小
  const scale = getNumberSetting(K.FONT_SCALE, 100);
  applyFontScale(scale);

  // 3. 滚动揭示
  const reveal = isEnabled(K.REVEAL_ENABLED, true);
  applyRevealEnabled(reveal);

  // 4. 背景图
  const bg = isEnabled(K.BG_IMAGE_ENABLED, true);
  applyBgImageEnabled(bg);
}

// ==================== 绑定设置控件 ====================
export function bindSettingsControls(container: HTMLElement): void {
  const cursorCheckbox = container.querySelector('#cursorToggleCheckbox') as HTMLInputElement | null;
  const linkCheckbox = container.querySelector('#linkWarningCheckbox') as HTMLInputElement | null;
  const themeSelect = container.querySelector('#themeModeSelect') as HTMLSelectElement | null;
  const fontScaleSelect = container.querySelector('#fontScaleSelect') as HTMLSelectElement | null;
  const revealCheckbox = container.querySelector('#revealCheckbox') as HTMLInputElement | null;
  const bgImageCheckbox = container.querySelector('#bgImageCheckbox') as HTMLInputElement | null;
  const clearSWBtn = container.querySelector('#clearSWCacheBtn') as HTMLButtonElement | null;
  const clearCookiesBtn = container.querySelector('#clearCookiesBtn') as HTMLButtonElement | null;

  // ---------- 初始化控件状态（仅设置值，不触发应用） ----------
  if (cursorCheckbox) {
    cursorCheckbox.checked = isEnabled(K.CURSOR_ENABLED, true);
  }
  if (linkCheckbox) {
    linkCheckbox.checked = isEnabled(K.LINK_WARNING_ENABLED, true);
  }
  if (themeSelect) {
    // 直接读 themeController；旧键 'theme' 的迁移已由控制器内部处理
    themeSelect.value = themeController.getMode();
  }
  if (fontScaleSelect) {
    const fontScale = getNumberSetting(K.FONT_SCALE, 100);
    fontScaleSelect.value = String(fontScale);
  }
  if (revealCheckbox) {
    revealCheckbox.checked = isEnabled(K.REVEAL_ENABLED, true);
  }
  if (bgImageCheckbox) {
    bgImageCheckbox.checked = isEnabled(K.BG_IMAGE_ENABLED, true);
  }

  // ---------- 事件绑定 ----------

  cursorCheckbox?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(K.CURSOR_ENABLED, enabled);
    import('/js/ui/ui-effects.js').then((module) => {
      if (module.refreshUIEffects) module.refreshUIEffects();
    });
  });

  linkCheckbox?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(K.LINK_WARNING_ENABLED, enabled);
    import('/js/ui/ui-effects.js').then((module) => {
      if (module.refreshUIEffects) module.refreshUIEffects();
    });
  });

  themeSelect?.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    applyThemeMode(mode);
  });

  fontScaleSelect?.addEventListener('change', (e) => {
    const scale = parseInt((e.target as HTMLSelectElement).value, 10);
    setSetting(K.FONT_SCALE, scale);
    applyFontScale(scale);
  });

  revealCheckbox?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(K.REVEAL_ENABLED, enabled);
    applyRevealEnabled(enabled);
  });

  bgImageCheckbox?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(K.BG_IMAGE_ENABLED, enabled);
    // 启用时恢复已缓存的壁纸（不重新下载 UHD 大图），禁用时隐藏
    applyBgImageEnabled(enabled);
  });

  clearSWBtn?.addEventListener('click', clearSWCacheAndReload);
  clearCookiesBtn?.addEventListener('click', clearAllStorageAndReload);
}

// ==================== 显示设置面板 ====================
export function showSettingsPanel(): void {
  const settingsHTML = `
    <div class="settings-panel">
      <div class="settings-group">
        <div class="group-header"><h3><i class="fas fa-paint-brush"></i> 外观与交互</h3></div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-sun"></i> 主题模式</span>
            <span class="setting-desc">选择浅色、深色或自动跟随时段</span>
          </div>
          <select id="themeModeSelect" class="setting-select">
            <option value="auto">自动</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-font"></i> 字体大小</span>
            <span class="setting-desc">调整页面文字大小</span>
          </div>
          <select id="fontScaleSelect" class="setting-select">
            <option value="90">90%</option>
            <option value="100" selected>100%</option>
            <option value="110">110%</option>
            <option value="120">120%</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-arrow-pointer"></i> 自定义光标</span>
            <span class="setting-desc">启用独特的鼠标跟随动画效果</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="cursorToggleCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-arrow-down"></i> 滚动揭示动画</span>
            <span class="setting-desc">滚动时内容渐进显示</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="revealCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group">
        <div class="group-header"><h3><i class="fas fa-cog"></i> 内容与数据</h3></div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-image"></i> 背景图片</span>
            <span class="setting-desc">显示每日 Bing 壁纸作为背景</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="bgImageCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-shield-alt"></i> 外链拦截</span>
            <span class="setting-desc">点击外部链接时显示确认弹窗</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="linkWarningCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group danger-zone">
        <div class="group-header">
          <h3><i class="fas fa-database"></i> 数据管理</h3>
        </div>
        <div class="action-buttons">
          <button id="clearSWCacheBtn" class="btn-outline">清除缓存</button>
          <button id="clearCookiesBtn" class="btn-danger"><i class="fas fa-trash-can"></i> 重置所有数据</button>
        </div>
        <div class="danger-hint">这将清除所有本地数据，包括主题、搜索历史等</div>
      </div>
    </div>
  `;

  const { close } = showDetailDialog({
    title: '站点设置',
    htmlContent: settingsHTML,
    source: 'settings',
  });

  const contentEl = document.querySelector('.work-details-content');
  if (contentEl) {
    bindSettingsControls(contentEl as HTMLElement);
  }
}