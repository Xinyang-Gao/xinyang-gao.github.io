// /js/data/settings.ts
// 站点设置：读写本地存储 / 应用设置 / 绑定设置面板控件
// 所有设置键统一来自 core.ts 的 CONFIG.STORAGE_KEYS，禁止在此处硬编码

import { CONFIG, safeLocal, safeSession, storageController } from '/js/core/core.js';
import { themeController, type ThemeMode } from '/js/core/theme-controller.js';
import { showDetailDialog } from '/js/ui/detail-dialog.js';
import {
  getSkyCloudSpeed,
  getSkyCloudSpeedText,
  getSkyPhase,
  getSkyWeatherMode,
  getSkyWeatherText,
  isSkyEnabled,
  setSkyEnabled,
  setSkyCloudSpeed,
  setSkyPhase,
  setSkyWeatherMode,
  type SkyPhase,
  type SkyWeatherMode,
} from '/js/ui/sky-backdrop.js';

const K = CONFIG.STORAGE_KEYS;

/** 允许被本模块读写/应用的设置键 */
type SettingKey =
  | typeof K.LINK_WARNING_ENABLED
  | typeof K.THEME_MODE
  | typeof K.FONT_SCALE
  | typeof K.REVEAL_ENABLED
  | typeof K.SKY_TIME
  | typeof K.SKY_ENABLED
  | typeof K.SKY_WEATHER
  | typeof K.CLOUD_SPEED;

// ==================== 通用读写（唯一出口） ====================
export function getSetting(
  key: SettingKey,
  defaultValue: boolean | string | number = true,
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

/** 应用天空时段（auto = 跟随真实时间） */
function applySkyTime(phase: string): void {
  const valid: SkyPhase = isSkyPhase(phase) ? phase : 'auto';
  setSkyPhase(valid);

  const select = document.getElementById('skyTimeSelect') as HTMLSelectElement | null;
  if (select) select.value = valid;
  syncSkyHint();
}

/** 应用天空天气（auto = 跟随真实天气，其余为手动指定） */
function applySkyWeather(mode: string): void {
  const valid: SkyWeatherMode = isSkyWeatherMode(mode) ? mode : 'auto';
  setSkyWeatherMode(valid);

  const select = document.getElementById('skyWeatherSelect') as HTMLSelectElement | null;
  if (select) select.value = valid;
  syncSkyHint();
}

/** 应用云朵飘动速度（默认 1；有真实风级时实际速度 = 本值 × 风力系数） */
function applyCloudSpeed(multiplier: number): void {
  setSkyCloudSpeed(multiplier);
  const select = document.getElementById('cloudSpeedSelect') as HTMLSelectElement | null;
  if (select) select.value = String(multiplier);
  syncCloudSpeedHint();
}

/** 「云朵飘动速度」那行的说明：实际倍率 + 真实风力 */
function syncCloudSpeedHint(): void {
  const hint = document.getElementById('cloudSpeedHint');
  if (hint) hint.textContent = `当前：${getSkyCloudSpeedText()}`;
}

/** 应用天空背景总开关（关掉后回到纯色底） */
function applySkyEnabled(enabled: boolean): void {
  setSkyEnabled(enabled);

  const checkbox = document.getElementById('skyEnabledCheckbox') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = enabled;
}

/** 面板里"当前：xx"的实时说明 */
function syncSkyHint(): void {
  const hint = document.getElementById('skyTimeHint');
  if (hint) hint.textContent = `当前：${getSkyWeatherText()}`;
}

function isSkyWeatherMode(value: string): value is SkyWeatherMode {
  return (
    value === 'auto' ||
    value === 'clear' ||
    value === 'cloudy' ||
    value === 'overcast' ||
    value === 'rain' ||
    value === 'snow' ||
    value === 'sleet' ||
    value === 'storm'
  );
}

function isSkyPhase(value: string): value is SkyPhase {
  return (
    value === 'auto' ||
    value === 'dawn' ||
    value === 'morning' ||
    value === 'noon' ||
    value === 'afternoon' ||
    value === 'dusk' ||
    value === 'night'
  );
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

  const themeCheckbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement | null;
  if (themeCheckbox) themeCheckbox.checked = themeController.getTheme() === 'dark';

  // 2. 字体大小
  const scale = getNumberSetting(K.FONT_SCALE, 100);
  applyFontScale(scale);

  // 3. 滚动揭示
  const reveal = isEnabled(K.REVEAL_ENABLED, true);
  applyRevealEnabled(reveal);

  // 4. 天空背景（时段 + 天气 + 总开关）
  applySkyTime(String(getSetting(K.SKY_TIME, 'auto')));
  applySkyWeather(String(getSetting(K.SKY_WEATHER, 'auto')));
  applyCloudSpeed(getNumberSetting(K.CLOUD_SPEED, 1));
  applySkyEnabled(isEnabled(K.SKY_ENABLED, true));
}

// ==================== 绑定设置控件 ====================
export function bindSettingsControls(container: HTMLElement): void {
  const linkCheckbox = container.querySelector('#linkWarningCheckbox') as HTMLInputElement | null;
  const themeSelect = container.querySelector('#themeModeSelect') as HTMLSelectElement | null;
  const fontScaleSelect = container.querySelector('#fontScaleSelect') as HTMLSelectElement | null;
  const revealCheckbox = container.querySelector('#revealCheckbox') as HTMLInputElement | null;
  const skyTimeSelect = container.querySelector('#skyTimeSelect') as HTMLSelectElement | null;
  const skyWeatherSelect = container.querySelector('#skyWeatherSelect') as HTMLSelectElement | null;
  const cloudSpeedSelect = container.querySelector('#cloudSpeedSelect') as HTMLSelectElement | null;
  const skyEnabledCheckbox = container.querySelector(
    '#skyEnabledCheckbox',
  ) as HTMLInputElement | null;
  const clearSWBtn = container.querySelector('#clearSWCacheBtn') as HTMLButtonElement | null;
  const clearCookiesBtn = container.querySelector('#clearCookiesBtn') as HTMLButtonElement | null;

  // ---------- 初始化控件状态（仅设置值，不触发应用） ----------
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
  if (skyTimeSelect) {
    skyTimeSelect.value = getSkyPhase();
  }
  if (skyWeatherSelect) {
    skyWeatherSelect.value = getSkyWeatherMode();
  }
  if (cloudSpeedSelect) {
    cloudSpeedSelect.value = String(getSkyCloudSpeed());
  }
  if (skyEnabledCheckbox) {
    skyEnabledCheckbox.checked = isSkyEnabled();
  }
  syncSkyHint();
  syncCloudSpeedHint();

  // ---------- 事件绑定 ----------

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

  skyTimeSelect?.addEventListener('change', (e) => {
    const phase = (e.target as HTMLSelectElement).value;
    setSetting(K.SKY_TIME, phase);
    applySkyTime(phase);
  });

  skyWeatherSelect?.addEventListener('change', (e) => {
    const weather = (e.target as HTMLSelectElement).value;
    setSetting(K.SKY_WEATHER, weather);
    applySkyWeather(weather);
  });

  cloudSpeedSelect?.addEventListener('change', (e) => {
    const multiplier = Number.parseFloat((e.target as HTMLSelectElement).value);
    if (!Number.isFinite(multiplier)) return;
    setSetting(K.CLOUD_SPEED, multiplier);
    applyCloudSpeed(multiplier);
  });

  skyEnabledCheckbox?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    setSetting(K.SKY_ENABLED, enabled);
    applySkyEnabled(enabled);
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
            <span class="setting-label"><i class="fas fa-arrow-down"></i> 滚动揭示动画</span>
            <span class="setting-desc">滚动时内容渐进显示</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="revealCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-cloud-sun"></i> 天空时间</span>
            <span class="setting-desc">
              渐变天空与云朵的时段，默认跟随真实时间
              <span class="setting-hint" id="skyTimeHint">当前：自动</span>
            </span>
          </div>
          <select id="skyTimeSelect" class="setting-select">
            <option value="auto">自动</option>
            <option value="dawn">黎明</option>
            <option value="morning">清晨</option>
            <option value="noon">正午</option>
            <option value="afternoon">午后</option>
            <option value="dusk">黄昏</option>
            <option value="night">夜晚</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-cloud-showers-heavy"></i> 天空天气</span>
            <span class="setting-desc">
              默认跟随真实天气（UAPI，半小时一更新）；也可手动指定云量、雨势与闪电
            </span>
          </div>
          <select id="skyWeatherSelect" class="setting-select">
            <option value="auto">自动 · 真实天气</option>
            <option value="clear">晴天</option>
            <option value="cloudy">多云</option>
            <option value="overcast">阴天</option>
            <option value="rain">雨天</option>
            <option value="snow">雪天</option>
            <option value="sleet">雨夹雪</option>
            <option value="storm">雷暴</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-wind"></i> 云朵飘动速度</span>
            <span class="setting-desc">
              默认即为原始速度；拿到真实天气后会再按风力自动加成
              <span class="setting-hint" id="cloudSpeedHint">当前：×1.0</span>
            </span>
          </div>
          <select id="cloudSpeedSelect" class="setting-select">
            <option value="0.5">很慢</option>
            <option value="0.75">较慢</option>
            <option value="1">默认</option>
            <option value="1.5">较快</option>
            <option value="2">很快</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label"><i class="fas fa-sun"></i> 天空背景</span>
            <span class="setting-desc">关闭后回到纯色底，云朵与星空一并隐藏</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="skyEnabledCheckbox">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group">
        <div class="group-header"><h3><i class="fas fa-cog"></i> 内容与数据</h3></div>

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

  // 不解构 close：弹窗已支持 Esc / 点遮罩关闭，此处无需编程式关闭入口
  showDetailDialog({
    title: '站点设置',
    htmlContent: settingsHTML,
    source: 'settings',
  });

  const contentEl = document.querySelector('.work-details-content');
  if (contentEl) {
    bindSettingsControls(contentEl as HTMLElement);
  }
}
