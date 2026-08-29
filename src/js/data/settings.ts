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

// 现有 getSetting / setSetting 保持不变
export function getSetting(key: SettingKey, defaultValue = true): boolean | string {
  if (storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) {
      // 对于布尔值，存储为 'true'/'false'，其余保持字符串
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

// 清除 SW 缓存（保留）
export async function clearSWCacheAndReload(): Promise<void> {
  // ... 与原来相同，省略 ...
}

// 清除所有数据（保留）
export async function clearAllStorageAndReload(): Promise<void> {
  // ... 与原来相同，省略 ...
}

// ---------- 应用设置函数 ----------
function applyThemeMode(mode: string): void {
  const root = document.documentElement;
  if (mode === 'auto') {
    // 自动模式：删除存储的固定主题，按时段或系统决定
    storageController.removeItem(CONFIG.STORAGE_KEYS.THEME);
    const theme = getTimeBasedTheme();
    root.setAttribute('data-theme', theme);
    // 同步导航栏复选框（如果存在）
    const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = (theme === 'dark');
    // 触发主题变更事件
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  } else {
    // 固定浅色/深色
    root.setAttribute('data-theme', mode);
    storageController.setItem(CONFIG.STORAGE_KEYS.THEME, mode);
    const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = (mode === 'dark');
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: mode } }));
  }
}

function applyFontScale(scale: number): void {
  // 设置根元素字体大小（基准 16px）
  const base = 16;
  const newSize = base * (scale / 100);
  document.documentElement.style.fontSize = newSize + 'px';
}

function applyRevealEnabled(enabled: boolean): void {
  // 通过全局实例控制滚动揭示
  const inst = (window as any).scrollRevealInstance;
  if (inst) {
    if (enabled) {
      // 重新观察未揭示的元素
      inst.refresh();
    } else {
      // 禁用：移除所有已观察元素并停止监听
      inst.destroy();
      // 重新创建一个不工作的占位？为了简单，我们只销毁，并标记为禁用
      // 当再次启用时，需要重新创建
      (window as any).scrollRevealInstance = null;
      // 后续可重新初始化
    }
  } else if (enabled) {
    // 如果实例不存在且需要启用，则重新创建
    import('/js/ui/ui-effects.js').then(({ ensureScrollReveal }) => {
      ensureScrollReveal();
    });
  }
}

function applyBgImageEnabled(enabled: boolean): void {
  const overlay = document.getElementById('bg-image-overlay') as HTMLElement;
  if (enabled) {
    // 启用：加载一张随机背景图
    applyRandomBackgroundImage({ force: true });
  } else {
    // 禁用：移除背景图并隐藏遮罩
    if (overlay) {
      overlay.style.backgroundImage = 'none';
      overlay.style.opacity = '0';
    }
  }
}

// ---------- 绑定设置控件 ----------
export function bindSettingsControls(container: HTMLElement): void {
  // 获取所有控件
  const cursorCheckbox = container.querySelector('#cursorToggleCheckbox') as HTMLInputElement;
  const linkCheckbox = container.querySelector('#linkWarningCheckbox') as HTMLInputElement;
  const themeSelect = container.querySelector('#themeModeSelect') as HTMLSelectElement;
  const fontScaleSelect = container.querySelector('#fontScaleSelect') as HTMLSelectElement;
  const revealCheckbox = container.querySelector('#revealCheckbox') as HTMLInputElement;
  const bgImageCheckbox = container.querySelector('#bgImageCheckbox') as HTMLInputElement;
  const clearSWBtn = container.querySelector('#clearSWCacheBtn') as HTMLButtonElement;
  const clearCookiesBtn = container.querySelector('#clearCookiesBtn') as HTMLButtonElement;

  // ----- 初始化控件状态 -----
  // 光标
  cursorCheckbox.checked = getSetting(SETTINGS_KEYS.CURSOR_ENABLED, true) as boolean;
  // 外链拦截
  linkCheckbox.checked = getSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, true) as boolean;
  // 主题模式
  let themeMode = getSetting(SETTINGS_KEYS.THEME_MODE, 'auto') as string;
  // 兼容旧存储：如果之前没有 theme_mode，但有 theme 存储，则根据该值推断
  if (themeMode === 'auto') {
    const storedTheme = storageController.getItem(CONFIG.STORAGE_KEYS.THEME);
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
      themeMode = storedTheme;
    }
  }
  themeSelect.value = themeMode;
  // 字体缩放
  const fontScale = getSetting(SETTINGS_KEYS.FONT_SCALE, 100) as number;
  fontScaleSelect.value = String(fontScale);
  // 滚动揭示
  revealCheckbox.checked = getSetting(SETTINGS_KEYS.REVEAL_ENABLED, true) as boolean;
  // 背景图片
  bgImageCheckbox.checked = getSetting(SETTINGS_KEYS.BG_IMAGE_ENABLED, true) as boolean;

  // ----- 事件绑定 -----
  // 光标
  cursorCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.CURSOR_ENABLED, enabled);
    import('/js/ui/ui-effects.js').then(module => {
      if (module.refreshUIEffects) module.refreshUIEffects();
    });
  });

  // 外链拦截
  linkCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, enabled);
    import('/js/ui/ui-effects.js').then(module => {
      if (module.refreshUIEffects) module.refreshUIEffects();
    });
  });

  // 主题模式
  themeSelect.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    setSetting(SETTINGS_KEYS.THEME_MODE, mode);
    applyThemeMode(mode);
  });

  // 字体大小
  fontScaleSelect.addEventListener('change', (e) => {
    const scale = parseInt((e.target as HTMLSelectElement).value, 10);
    setSetting(SETTINGS_KEYS.FONT_SCALE, scale);
    applyFontScale(scale);
  });

  // 滚动揭示
  revealCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.REVEAL_ENABLED, enabled);
    applyRevealEnabled(enabled);
  });

  // 背景图片
  bgImageCheckbox.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(SETTINGS_KEYS.BG_IMAGE_ENABLED, enabled);
    applyBgImageEnabled(enabled);
  });

  // 清除缓存
  clearSWBtn?.addEventListener('click', clearSWCacheAndReload);
  // 重置所有数据
  clearCookiesBtn?.addEventListener('click', clearAllStorageAndReload);

  // 首次加载时，应用所有设置（确保一致性）
  applyThemeMode(themeMode);
  applyFontScale(parseInt(fontScaleSelect.value, 10));
  applyRevealEnabled(revealCheckbox.checked);
  applyBgImageEnabled(bgImageCheckbox.checked);
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

  // 绑定控件
  const contentEl = document.querySelector('.work-details-content');
  if (contentEl) {
    bindSettingsControls(contentEl);
  }
}

// 自动导入时应用已保存的设置（用于页面初始化）
export function applyStoredSettings(): void {
  // 主题
  const themeMode = getSetting(SETTINGS_KEYS.THEME_MODE, 'auto') as string;
  applyThemeMode(themeMode);
  // 字体
  const scale = getSetting(SETTINGS_KEYS.FONT_SCALE, 100) as number;
  applyFontScale(scale);
  // 滚动揭示（默认启用）
  const reveal = getSetting(SETTINGS_KEYS.REVEAL_ENABLED, true) as boolean;
  applyRevealEnabled(reveal);
  // 背景图片（默认启用）
  const bg = getSetting(SETTINGS_KEYS.BG_IMAGE_ENABLED, true) as boolean;
  applyBgImageEnabled(bg);
  // 光标和外链拦截由 ui-effects 处理，无需重复
}

// 页面加载完成后应用设置
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyStoredSettings);
} else {
  applyStoredSettings();
}

// 监听无刷新导航，重新应用设置（例如字体缩放可能在切换页面时丢失）
window.addEventListener('ajax:navigation', () => {
  applyStoredSettings();
});