// /js/data/settings.ts
// 设置页面交互、存储读写、缓存清除

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';

// ==================== 类型与常量 ====================
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled',
} as const;

type SettingKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

// DOM 元素引用
let cursorCheckbox: HTMLInputElement | null = null;
let linkWarningCheckbox: HTMLInputElement | null = null;
let consentAlertDiv: HTMLElement | null = null;

// ==================== 存储读写（带降级） ====================
function getSetting(key: SettingKey, defaultValue = true): boolean {
  if (storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) return stored === 'true';
  }
  // 降级到 localStorage 直接读取（未经同意也允许读取设置？但设置项不应在未同意时写入，但读取可能有旧值）
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === 'true';
  } catch {
    // ignore
  }
  return defaultValue;
}

function setSetting(key: SettingKey, value: boolean): void {
  const boolVal = value === true;
  if (storageController.isAllowed()) {
    storageController.setItem(key, boolVal ? 'true' : 'false');
  } else {
    // 未同意时仍写入 localStorage 但不保证持久，但可做临时保存
    try {
      localStorage.setItem(key, boolVal ? 'true' : 'false');
    } catch {
      // ignore
    }
  }
}

// ==================== UI 刷新 ====================
function refreshToggleUI(): void {
  if (!cursorCheckbox || !linkWarningCheckbox) return;
  cursorCheckbox.checked = getSetting(SETTINGS_KEYS.CURSOR_ENABLED, true);
  linkWarningCheckbox.checked = getSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);
}

// ==================== 事件处理器 ====================
function handleCursorChange(e: Event): void {
  const target = e.target as HTMLInputElement;
  const enabled = target.checked;
  setSetting(SETTINGS_KEYS.CURSOR_ENABLED, enabled);
  showRefreshTip('鼠标样式设置已保存，刷新后生效');
}

function handleLinkWarningChange(e: Event): void {
  const target = e.target as HTMLInputElement;
  const enabled = target.checked;
  setSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, enabled);
  showRefreshTip('外链拦截设置已保存，刷新后生效');
}

// ==================== Toast 提示 ====================
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showRefreshTip(msg: string): void {
  let toast = document.querySelector('.settings-toast') as HTMLDivElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'settings-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--accent-color)',
      color: 'white',
      padding: '10px 24px',
      borderRadius: '40px',
      fontSize: '0.9rem',
      zIndex: '10000',
      boxShadow: 'var(--shadow-md)',
      backdropFilter: 'blur(8px)',
      transition: 'opacity 0.2s',
      fontWeight: '500',
      pointerEvents: 'none',
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast!.style.opacity = '0';
  }, 2800);
}

// ==================== 缓存清除功能 ====================
export async function clearSWCacheAndReload(): Promise<void> {
  const confirmed = confirm(
    '⚠️ 确定清除所有 Service Worker 缓存吗？\n这将删除所有离线缓存数据，页面将重新加载以应用最新版本。'
  );
  if (!confirmed) return;

  if (typeof window.clearAllServiceWorkerCache === 'function') {
    await window.clearAllServiceWorkerCache();
  } else {
    // 降级处理
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

  // 移除所有相关 localStorage 键
  const allStoreKeys = Object.values(CONFIG.STORAGE_KEYS);
  const settingsKeys = Object.values(SETTINGS_KEYS);
  const keysToRemove = [...allStoreKeys, ...settingsKeys];
  keysToRemove.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  });

  // 额外清除所有以 settings_ 开头的键
  try {
    const allLocalKeys = Object.keys(localStorage);
    allLocalKeys.forEach((k) => {
      if (k.startsWith('settings_') || allStoreKeys.includes(k)) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    // ignore
  }

  // 禁用存储并清空所有数据（storageController 内部会清除）
  storageController.disableStorage();
  // 但 disableStorage 已调用 clearAllData，所以无需重复
  // 强制将同意状态置为 false
  localStorage.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, 'false');

  window.location.reload();
}

// ==================== 更新 Cookie 同意横幅提示 ====================
function updateConsentWarning(): void {
  const consentGiven = storageController.isAllowed();
  if (!consentAlertDiv) return;

  if (!consentGiven) {
    consentAlertDiv.style.display = 'block';
    const acceptLink = document.getElementById('acceptCookiesLink') as HTMLAnchorElement | null;
    if (acceptLink) {
      acceptLink.onclick = (e) => {
        e.preventDefault();
        const consentManager = new CookieConsentManager(storageController);
        consentManager.setConsented(true);
        window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
        setTimeout(() => window.location.reload(), 200);
      };
    }
  } else {
    consentAlertDiv.style.display = 'none';
  }
}

// ==================== 初始化 ====================
function initSettings(): void {
  cursorCheckbox = document.getElementById('cursorToggleCheckbox') as HTMLInputElement | null;
  linkWarningCheckbox = document.getElementById('linkWarningCheckbox') as HTMLInputElement | null;
  consentAlertDiv = document.getElementById('consentAlert');

  if (!cursorCheckbox || !linkWarningCheckbox) {
    console.warn('[Settings] 未找到设置开关元素');
    return;
  }

  refreshToggleUI();

  cursorCheckbox.addEventListener('change', handleCursorChange);
  linkWarningCheckbox.addEventListener('change', handleLinkWarningChange);

  const clearBtn = document.getElementById('clearCookiesBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearAllStorageAndReload);

  const clearSWBtn = document.getElementById('clearSWCacheBtn');
  if (clearSWBtn) clearSWBtn.addEventListener('click', clearSWCacheAndReload);

  updateConsentWarning();

  window.addEventListener('cookieConsentChanged', () => {
    updateConsentWarning();
    refreshToggleUI();
  });

  // 支持 PJAX/无刷新导航后重新绑定
  window.addEventListener('ajax:navigation', () => {
    cursorCheckbox = document.getElementById('cursorToggleCheckbox') as HTMLInputElement | null;
    linkWarningCheckbox = document.getElementById('linkWarningCheckbox') as HTMLInputElement | null;
    consentAlertDiv = document.getElementById('consentAlert');

    if (cursorCheckbox && linkWarningCheckbox) {
      refreshToggleUI();
      // 移除旧监听，避免重复绑定
      cursorCheckbox.removeEventListener('change', handleCursorChange);
      linkWarningCheckbox.removeEventListener('change', handleLinkWarningChange);
      cursorCheckbox.addEventListener('change', handleCursorChange);
      linkWarningCheckbox.addEventListener('change', handleLinkWarningChange);
      updateConsentWarning();
    }

    const clearSWBtn = document.getElementById('clearSWCacheBtn');
    if (clearSWBtn) clearSWBtn.addEventListener('click', clearSWCacheAndReload);
  });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettings);
} else {
  initSettings();
}