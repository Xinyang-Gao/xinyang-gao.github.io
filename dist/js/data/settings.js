// /js/data/settings.js (添加清除缓存功能)

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';

const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled'
};

const DEFAULTS = {
  [SETTINGS_KEYS.CURSOR_ENABLED]: true,
  [SETTINGS_KEYS.LINK_WARNING_ENABLED]: true
};

let cursorCheckbox, linkWarningCheckbox;
let consentAlertDiv;

function getSetting(key, defaultValue = true) {
  if (storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) return stored === 'true';
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === 'true';
  } catch (e) {}
  return defaultValue;
}

function setSetting(key, value) {
  const boolVal = value === true || value === 'true';
  if (storageController.isAllowed()) {
    storageController.setItem(key, boolVal ? 'true' : 'false');
  } else {
    try {
      localStorage.setItem(key, boolVal ? 'true' : 'false');
    } catch (e) {}
  }
}

function refreshToggleUI() {
  if (!cursorCheckbox || !linkWarningCheckbox) return;
  cursorCheckbox.checked = getSetting(SETTINGS_KEYS.CURSOR_ENABLED, true);
  linkWarningCheckbox.checked = getSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);
}

function handleCursorChange(e) {
  const enabled = e.target.checked;
  setSetting(SETTINGS_KEYS.CURSOR_ENABLED, enabled);
  showRefreshTip('鼠标样式设置已保存，刷新后生效');
}

function handleLinkWarningChange(e) {
  const enabled = e.target.checked;
  setSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, enabled);
  showRefreshTip('外链拦截设置已保存，刷新后生效');
}

let toastTimer = null;
function showRefreshTip(msg) {
  let toast = document.querySelector('.settings-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'settings-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--accent-color);
      color: white;
      padding: 10px 24px;
      border-radius: 40px;
      font-size: 0.9rem;
      z-index: 10000;
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(8px);
      transition: opacity 0.2s;
      font-weight: 500;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// 新增：清除 Service Worker 所有缓存
async function clearSWCacheAndReload() {
  const confirmed = confirm('⚠️ 确定清除所有 Service Worker 缓存吗？\n这将删除所有离线缓存数据，页面将重新加载以应用最新版本。');
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
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      window.location.reload();
    }
  }
}

async function clearAllStorageAndReload() {
  const confirmed = confirm('⚠️ 确定删除所有本地数据吗？\n这将清除：\n- 主题偏好、搜索缓存、作品/文章缓存\n- Cookie同意状态（下次访问将再次显示横幅）\n- 所有设置项（鼠标、外链拦截等）\n\n网站将会重新加载，且存储功能将被禁用。');
  if (!confirmed) return;

  const allStoreKeys = Object.values(CONFIG.STORAGE_KEYS);
  const settingsKeys = Object.values(SETTINGS_KEYS);
  const keysToRemove = [...allStoreKeys, ...settingsKeys];
  keysToRemove.forEach(key => { try { localStorage.removeItem(key); } catch(e) {} });
  try {
    const allLocalKeys = Object.keys(localStorage);
    allLocalKeys.forEach(k => {
      if (k.startsWith('settings_') || allStoreKeys.includes(k)) localStorage.removeItem(k);
    });
  } catch(e) {}

  if (storageController) {
    storageController.disableStorage();
    storageController.clearAllData();
  }
  localStorage.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, 'false');
  window.location.reload();
}

function updateConsentWarning() {
  const consentGiven = storageController.isAllowed();
  if (!consentAlertDiv) return;
  if (!consentGiven) {
    consentAlertDiv.style.display = 'block';
    const acceptLink = document.getElementById('acceptCookiesLink');
    if (acceptLink) {
      acceptLink.onclick = (e) => {
        e.preventDefault();
        const consentManager = new CookieConsentManager(storageController);
        consentManager.setConsented(true);
        window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
        setTimeout(() => { window.location.reload(); }, 200);
      };
    }
  } else {
    consentAlertDiv.style.display = 'none';
  }
}

function initSettings() {
  cursorCheckbox = document.getElementById('cursorToggleCheckbox');
  linkWarningCheckbox = document.getElementById('linkWarningCheckbox');
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
  
  // 新增：清除 SW 缓存按钮
  const clearSWBtn = document.getElementById('clearSWCacheBtn');
  if (clearSWBtn) clearSWBtn.addEventListener('click', clearSWCacheAndReload);
  
  updateConsentWarning();
  window.addEventListener('cookieConsentChanged', () => {
    updateConsentWarning();
    refreshToggleUI();
  });
  
  window.addEventListener('ajax:navigation', () => {
    cursorCheckbox = document.getElementById('cursorToggleCheckbox');
    linkWarningCheckbox = document.getElementById('linkWarningCheckbox');
    consentAlertDiv = document.getElementById('consentAlert');
    if (cursorCheckbox && linkWarningCheckbox) {
      refreshToggleUI();
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettings);
} else {
  initSettings();
}