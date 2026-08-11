// /js/data/settings.ts

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';

const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled',
} as const;

type SettingKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

export function getSetting(key: SettingKey, defaultValue = true): boolean {
  if (storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) return stored === 'true';
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === 'true';
  } catch { /* ignore */ }
  return defaultValue;
}

export function setSetting(key: SettingKey, value: boolean): void {
  const boolVal = value === true;
  if (storageController.isAllowed()) {
    storageController.setItem(key, boolVal ? 'true' : 'false');
  } else {
    try {
      localStorage.setItem(key, boolVal ? 'true' : 'false');
    } catch { /* ignore */ }
  }
}

export async function clearSWCacheAndReload(): Promise<void> {
  const confirmed = confirm(
    '⚠️ 确定清除所有 Service Worker 缓存吗？\n这将删除所有离线缓存数据，页面将重新加载以应用最新版本。'
  );
  if (!confirmed) return;

  if (typeof window.clearAllServiceWorkerCache === 'function') {
    await window.clearAllServiceWorkerCache();
  } else {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      window.location.reload();
    }
  }
}

export async function clearAllStorageAndReload(): Promise<void> {
  const confirmed = confirm(
    '⚠️ 确定删除所有本地数据吗？\n这将清除：\n- 主题偏好、搜索缓存、作品/文章缓存\n- Cookie同意状态（下次访问将再次显示横幅）\n- 所有设置项（鼠标、外链拦截等）\n\n网站将会重新加载，且存储功能将被禁用。'
  );
  if (!confirmed) return;

  const allStoreKeys = Object.values(CONFIG.STORAGE_KEYS);
  const settingsKeys = Object.values(SETTINGS_KEYS);
  const keysToRemove = [...allStoreKeys, ...settingsKeys];
  keysToRemove.forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  try {
    const allLocalKeys = Object.keys(localStorage);
    allLocalKeys.forEach((k) => {
      if (k.startsWith('settings_') || allStoreKeys.includes(k)) {
        localStorage.removeItem(k);
      }
    });
  } catch { /* ignore */ }

  storageController.disableStorage();
  localStorage.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, 'false');
  window.location.reload();
}

export function bindSettingsControls(container: HTMLElement): void {
  const cursorCheckbox = container.querySelector('#cursorToggleCheckbox') as HTMLInputElement;
  const linkCheckbox = container.querySelector('#linkWarningCheckbox') as HTMLInputElement;
  const clearSWBtn = container.querySelector('#clearSWCacheBtn') as HTMLButtonElement;
  const clearCookiesBtn = container.querySelector('#clearCookiesBtn') as HTMLButtonElement;

  if (cursorCheckbox) {
    cursorCheckbox.checked = getSetting(SETTINGS_KEYS.CURSOR_ENABLED, true);
    cursorCheckbox.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      setSetting(SETTINGS_KEYS.CURSOR_ENABLED, enabled);
      import('/js/ui/ui-effects.js').then(module => {
        if (module.refreshUIEffects) module.refreshUIEffects();
      });
    });
  }

  if (linkCheckbox) {
    linkCheckbox.checked = getSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);
    linkCheckbox.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      setSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, enabled);
      import('/js/ui/ui-effects.js').then(module => {
        if (module.refreshUIEffects) module.refreshUIEffects();
      });
    });
  }

  if (clearSWBtn) {
    clearSWBtn.addEventListener('click', clearSWCacheAndReload);
  }

  if (clearCookiesBtn) {
    clearCookiesBtn.addEventListener('click', clearAllStorageAndReload);
  }
}

export function showSettingsPanel(): void {
  // 构建设置内容的 HTML（不包含关闭按钮和外部遮罩）
  const settingsHTML = `
      <div class="settings-group">
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-arrow-pointer"></i> 自定义光标</span>
            <span class="setting-desc">启用独特的鼠标跟随动画效果 (仅桌面端)</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="cursorToggleCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-shield-alt"></i> 外链安全拦截</span>
            <span class="setting-desc">点击外部链接时显示确认弹窗，防止误触</span>
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
          <button id="clearSWCacheBtn" class="btn-outline">
            <i class="fas fa-broom"></i> 清除缓存
          </button>
          <button id="clearCookiesBtn" class="btn-danger">
            <i class="fas fa-trash-can"></i> 重置所有数据
          </button>
        </div>
        <p class="danger-hint">重置后将清除所有本地偏好设置并恢复初始状态。</p>
      </div>
  `;

  // 显示通用弹窗
  const { close } = showDetailDialog({
    title: '站点设置',
    htmlContent: settingsHTML,
    source: 'settings',
  });

  // 弹窗内容已插入 DOM，绑定控件事件
  const contentEl = document.querySelector('.work-details-content');
  if (contentEl) {
    // 注意：原有的 bindSettingsControls 接受一个容器，我们传入内容区域
    bindSettingsControls(contentEl);
  }
}