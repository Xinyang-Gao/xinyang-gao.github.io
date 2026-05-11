// /js/settings.js
// 设置页面专用模块：读取/保存配置、控制UI开关、删除cookies等

import { CONFIG, storageController, CookieConsentManager } from '/js/core.js';

// 设置项键名
const SETTINGS_KEYS = {
  CURSOR_ENABLED: 'settings_cursor_enabled',
  LINK_WARNING_ENABLED: 'settings_link_warning_enabled'
};

// 默认值（均为开启）
const DEFAULTS = {
  [SETTINGS_KEYS.CURSOR_ENABLED]: true,
  [SETTINGS_KEYS.LINK_WARNING_ENABLED]: true
};

// 全局元素
let cursorCheckbox, linkWarningCheckbox;
let consentAlertDiv;

// 辅助函数：读取设置（优先store，fallback默认）
function getSetting(key, defaultValue = true) {
  if (storageController.isAllowed()) {
    const stored = storageController.getItem(key);
    if (stored !== null) return stored === 'true';
  }
  // 若storage不可用或未保存，尝试 localStorage 直接读取（备用）
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === 'true';
  } catch (e) {}
  return defaultValue;
}

// 保存设置
function setSetting(key, value) {
  const boolVal = value === true || value === 'true';
  if (storageController.isAllowed()) {
    storageController.setItem(key, boolVal ? 'true' : 'false');
  } else {
    // 未同意cookie时降级写入localStorage（临时有效，刷新后丢失，但至少本次会话可读）
    try {
      localStorage.setItem(key, boolVal ? 'true' : 'false');
    } catch (e) {}
  }
}

// 应用UI开关状态
function refreshToggleUI() {
  if (!cursorCheckbox || !linkWarningCheckbox) return;
  cursorCheckbox.checked = getSetting(SETTINGS_KEYS.CURSOR_ENABLED, true);
  linkWarningCheckbox.checked = getSetting(SETTINGS_KEYS.LINK_WARNING_ENABLED, true);
}

// 处理开关变更（带提示刷新）
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
  // 简单toast提示
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
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2800);
}

// 删除所有cookies与存储数据
async function clearAllStorageAndReload() {
  const confirmed = confirm('⚠️ 确定删除所有本地数据吗？\n这将清除：\n- 主题偏好、搜索缓存、作品/文章缓存\n- Cookie同意状态（下次访问将再次显示横幅）\n- 所有设置项（鼠标、外链拦截等）\n\n网站将会重新加载，且存储功能将被禁用。');
  if (!confirmed) return;

  // 1. 清除 localStorage 中所有站点相关key（包含设置键、所有 STORAGE_KEYS）
  const allStoreKeys = Object.values(CONFIG.STORAGE_KEYS);
  const settingsKeys = Object.values(SETTINGS_KEYS);
  const keysToRemove = [...allStoreKeys, ...settingsKeys];
  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch(e) {}
  });
  
  // 额外兜底清除所有可能前缀
  try {
    const allLocalKeys = Object.keys(localStorage);
    allLocalKeys.forEach(k => {
      if (k.startsWith('settings_') || allStoreKeys.includes(k)) {
        localStorage.removeItem(k);
      }
    });
  } catch(e) {}

  // 2. 通过storageController彻底清空并禁用存储
  if (storageController) {
    storageController.disableStorage();
    storageController.clearAllData();
  }
  
  // 3. 重置 Cookie 同意记录的 localStorage 条目
  localStorage.setItem(CONFIG.STORAGE_KEYS.COOKIE_CONSENT, 'false');
  
  // 4. 重新加载页面，一切恢复初始
  window.location.reload();
}

// 检查cookie同意状态并展示警告条
function updateConsentWarning() {
  const consentGiven = storageController.isAllowed();
  if (!consentAlertDiv) return;
  if (!consentGiven) {
    consentAlertDiv.style.display = 'block';
    // 让用户可快速同意，便于保存设置
    const acceptLink = document.getElementById('acceptCookiesLink');
    if (acceptLink) {
      acceptLink.onclick = (e) => {
        e.preventDefault();
        // 触发同意cookie
        const consentManager = new CookieConsentManager(storageController);
        consentManager.setConsented(true);
        window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
        // 刷新当前设置页面，重新加载存储状态
        setTimeout(() => {
          window.location.reload();
        }, 200);
      };
    }
  } else {
    consentAlertDiv.style.display = 'none';
  }
}

// 初始化设置页面，绑定事件，初始化UI
function initSettings() {
  cursorCheckbox = document.getElementById('cursorToggleCheckbox');
  linkWarningCheckbox = document.getElementById('linkWarningCheckbox');
  consentAlertDiv = document.getElementById('consentAlert');
  
  if (!cursorCheckbox || !linkWarningCheckbox) {
    console.warn('[Settings] 未找到设置开关元素');
    return;
  }
  
  // 刷新开关状态
  refreshToggleUI();
  
  // 绑定变更事件
  cursorCheckbox.addEventListener('change', handleCursorChange);
  linkWarningCheckbox.addEventListener('change', handleLinkWarningChange);
  
  // 删除Cookies按钮
  const clearBtn = document.getElementById('clearCookiesBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearAllStorageAndReload);
  
  // 检查存储许可状态并显示横幅
  updateConsentWarning();
  
  // 监听存储许可变更 (例如在其他tab同意后刷新)
  window.addEventListener('cookieConsentChanged', () => {
    updateConsentWarning();
    refreshToggleUI(); // 重新拉取存储设置
  });
  
  // 无刷新导航后再次确保绑定（若页面通过ajax导航，需要重新执行绑定）
  window.addEventListener('ajax:navigation', () => {
    // 重新获取元素（可能DOM更新）
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
  });
}

// 页面完全初始化时运行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettings);
} else {
  initSettings();
}