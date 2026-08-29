// /js/data/settings.ts

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';
import { getTimeBasedTheme, applyRandomBackgroundImage } from '/js/core/page-utils.js';

// 扩展设置键
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled',
  THEME_MODE: 'settings_theme_mode',       // 'auto' | 'light' | 'dark'
  FONT_SCALE: 'settings_font_scale',       // 90, 100, 110, 120 (百分比)
  REVEAL_ENABLED: 'settings_reveal_enabled',
  BG_IMAGE_ENABLED: 'settings_bg_image_enabled',
} as const;

type SettingKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

export function getSetting(key: SettingKey, defaultValue = true): boolean | string {
  if (storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) {
      if (stored === 'true' || stored === 'false') return stored === 'true';
      return stored;
    }
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      if (raw === 'true' || raw === 'false') return raw === 'true';
      return raw;
    }
  } catch { /* ignore */ }
  return defaultValue;
}

export function setSetting(key: SettingKey, value: boolean | string | number): void {
  const strVal = String(value);
  if (storageController.isAllowed()) {
    storageController.setItem(key, strVal);
  } else {
    try {
      localStorage.setItem(key, strVal);
    } catch { /* ignore */ }
  }
}

export async function clearSWCacheAndReload(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
  }
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  window.location.reload();
}

export async function clearAllStorageAndReload(): Promise<void> {
  localStorage.clear();
  sessionStorage.clear();
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
  }
  window.location.reload();
}

// ---------- 应用函数 ----------

function applyThemeMode(mode: string): void {
  const root = document.documentElement;
  if (mode === 'auto') {
    storageController.removeItem(CONFIG.STORAGE_KEYS.THEME);
    const theme = getTimeBasedTheme();
    root.setAttribute('data-theme', theme);
    const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = (theme === 'dark');
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  } else {
    root.setAttribute('data-theme', mode);
    storageController.setItem(CONFIG.STORAGE_KEYS.THEME, mode);
    const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = (mode === 'dark');
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: mode } }));
  }
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
 * 控制背景图显示状态
 * @param enabled 是否启用
 * @param force 是否强制重新加载（仅在启用时生效）
 */
function applyBgImageEnabled(enabled: boolean, force = false): void {
  const overlay = document.getElementById('bg-image-overlay') as HTMLElement;
  if (!enabled) {
    if (overlay) {
      overlay.style.backgroundImage = 'none';
      overlay.style.opacity = '0';
    }
    return;
  }

  // 启用时：如果已有背景图且正在显示，则不重新加载（除非 force）
  if (overlay) {
    const hasImage = overlay.style.backgroundImage && overlay.style.backgroundImage !== 'none';
    const isActive = overlay.classList.contains('active') && overlay.style.opacity === '1';
    if (hasImage && isActive && !force) {
      // 背景已存在且可见，无需操作
      return;
    }
  }

  // 否则加载新背景图
  applyRandomBackgroundImage({ force: true });
}

// ---------- 应用存储的所有设置（页面加载/导航时调用） ----------
export function applyStoredSettings(): void {
  const themeMode = getSetting(SETTINGS_KEYS.THEME_MODE, 'auto') as string;
  applyThemeMode(themeMode);

  const scale = getSetting(SETTINGS_KEYS.FONT_SCALE, 100) as number;
  applyFontScale(scale);

  const reveal = getSetting(SETTINGS_KEYS.REVEAL_ENABLED, true) as boolean;
  applyRevealEnabled(reveal);

  const bg = getSetting(SETTINGS_KEYS.BG_IMAGE_ENABLED, true) as boolean;
  applyBgImageEnabled(bg, false); // 不强制重载
}

// ---------- 绑定设置控件 ----------
export function bindSettingsControls(container: HTMLElement): void {
  const cursorCheckbox = container.querySelector('#cursorToggleCheckbox') as HTMLInputElement;
  const linkCheckbox = container.querySelector('#linkWarningCheckbox') as HTMLInputElement;
  const themeSelect = container.querySelector('#themeModeSelect') as HTMLSelectElement;
  const fontScaleSelect = container.querySelector('#fontScaleSelect') as HTMLSelectElement;
  const revealCheckbox = container.querySelector('#revealCheckbox') as HTMLInputElement;
  const bgImageCheckbox = container.querySelector('#bgImageCheckbox') as HTMLInputElement;
  const clearSWBtn = container.querySelector('#clearSWCacheBtn') as HTMLButtonElement;
  const clearCookiesBtn = container.querySelector('#clearCookiesBtn') as HTMLButtonElement;

  // ----- 初始化控件状态（仅设置值，不应用） -----
  cursorCheckbox.checked = getSetting(SETTINGS_KEYS.CURSOR_ENABLED, true) as boolean;
  linkCheckbox.checked = getSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, true) as boolean;

  let themeMode = getSetting(SETTINGS_KEYS.THEME_MODE, 'auto') as string;
  // 兼容旧存储：如果之前没有 theme_mode，但有 theme 存储，则根据该值推断
  if (themeMode === 'auto') {
    const storedTheme = storageController.getItem(CONFIG.STORAGE_KEYS.THEME);
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
      themeMode = storedTheme;
    }
  }
  themeSelect.value = themeMode;

  const fontScale = getSetting(SETTINGS_KEYS.FONT_SCALE, 100) as number;
  fontScaleSelect.value = String(fontScale);

  revealCheckbox.checked = getSetting(SETTINGS_KEYS.REVEAL_ENABLED, true) as boolean;
  bgImageCheckbox.checked = getSetting(SETTINGS_KEYS.BG_IMAGE_ENABLED, true) as boolean;

  // ----- 事件绑定（用户操作时应用并保存） -----
  cursorCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.CURSOR_ENABLED, enabled);
    import('/js/ui/ui-effects.js').then(module => {
      if (module.refreshUIEffects) module.refreshUIEffects();
    });
  });

  linkCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, enabled);
    import('/js/ui/ui-effects.js').then(module => {
      if (module.refreshUIEffects) module.refreshUIEffects();
    });
  });

  themeSelect.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    setSetting(SETTINGS_KEYS.THEME_MODE, mode);
    applyThemeMode(mode);
  });

  fontScaleSelect.addEventListener('change', (e) => {
    const scale = parseInt((e.target as HTMLSelectElement).value, 10);
    setSetting(SETTINGS_KEYS.FONT_SCALE, scale);
    applyFontScale(scale);
  });

  revealCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.REVEAL_ENABLED, enabled);
    applyRevealEnabled(enabled);
  });

  bgImageCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.BG_IMAGE_ENABLED, enabled);
    // 用户切换时，若启用则强制加载新图，若禁用则隐藏
    applyBgImageEnabled(enabled, true);
  });

  clearSWBtn?.addEventListener('click', clearSWCacheAndReload);
  clearCookiesBtn?.addEventListener('click', clearAllStorageAndReload);
}

// ---------- 显示设置面板 ----------
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
    bindSettingsControls(contentEl);
  }
}

// ---------- 自动初始化 ----------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyStoredSettings);
} else {
  applyStoredSettings();
}

// SPA 导航后重新应用设置（确保主题等全局状态一致）
window.addEventListener('ajax:navigation', () => {
  applyStoredSettings();
});