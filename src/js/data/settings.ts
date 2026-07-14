// /js/data/settings.ts

import { CONFIG, storageController, CookieConsentManager } from '/js/core/core.js';

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
  // 如果已存在则关闭
  const existing = document.querySelector('.settings-panel-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'settings-panel-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.style.cssText = `
    background: var(--surface-color, #fff);
    border-radius: 20px;
    max-width: 620px;
    width: 92%;
    max-height: 85vh;
    overflow-y: auto;
    padding: 28px 32px;
    box-shadow: 0 25px 80px rgba(0,0,0,0.4);
    transform: scale(0.92);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    color: var(--text-color, #1a1a1a);
  `;

  // 内联样式
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .settings-group {
      background: var(--surface-color, #f8f8f8);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      transition: border-color 0.2s;
    }
    .settings-group:hover {
      border-color: var(--accent-light, #c9a0a0);
    }
    .settings-group h3 {
      margin-top: 0;
      margin-bottom: 8px;
      font-size: 1.3rem;
      display: flex;
      align-items: center;
      gap: 10px;
      border-left: 4px solid var(--accent-color, #b45b63);
      padding-left: 14px;
    }
    .settings-group h3 i {
      color: var(--accent-color, #b45b63);
    }
    .setting-desc {
      color: var(--text-secondary, #666);
      font-size: 0.9rem;
      margin-bottom: 16px;
      border-left: 2px solid var(--border-color, #e0e0e0);
      padding-left: 12px;
    }
    .toggle-switch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      margin: 12px 0 4px;
    }
    .toggle-label {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text-color, #1a1a1a);
    }
    .settings-toggle {
      position: relative;
      display: inline-block;
      width: 52px;
      height: 26px;
      flex-shrink: 0;
    }
    .settings-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .settings-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border-color, #ccc);
      transition: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      border-radius: 34px;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
    }
    .settings-slider:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background-color: #fff;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
    input:checked + .settings-slider {
      background: linear-gradient(135deg, var(--accent-color, #b45b63), var(--accent-dark, #8a454d));
    }
    input:checked + .settings-slider:before {
      transform: translateX(26px);
    }
    .danger-btn {
      background: #e74c3c;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 40px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }
    .danger-btn:hover {
      background: #c0392b;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(231,76,60,0.3);
    }
    .warning-message {
      background: rgba(231,76,60,0.08);
      border-left: 4px solid #e74c3c;
      padding: 12px 16px;
      border-radius: 8px;
      margin: 16px 0 12px;
      font-size: 0.9rem;
      color: var(--text-color, #1a1a1a);
    }
    .settings-action {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
    }
    @media (max-width: 640px) {
      .settings-panel {
        padding: 20px 16px;
      }
      .settings-group {
        padding: 16px;
      }
      .toggle-switch {
        flex-direction: column;
        align-items: flex-start;
      }
      .settings-action {
        flex-direction: column;
        align-items: stretch;
      }
      .danger-btn {
        justify-content: center;
      }
    }
  `;
  panel.appendChild(styleEl);

  // 关闭按钮（先添加，确保不被覆盖）
  const closeBtn = document.createElement('button');
  closeBtn.className = 'settings-close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = `
    position: absolute;
    top: 16px;
    right: 20px;
    background: none;
    border: none;
    font-size: 30px;
    color: var(--text-secondary, #888);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.2s;
  `;
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(0,0,0,0.05)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'transparent';
  });
  panel.appendChild(closeBtn);

  // 设置内容 HTML（不包含 style 和 closeBtn）
  const settingsHTML = `
    <h2 style="margin-top: 0; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
      <i class="fas fa-sliders-h" style="color: var(--accent-color, #b45b63);"></i> 站点设置
    </h2>
    <p style="color: var(--text-secondary, #666); margin-bottom: 24px; font-size: 0.95rem;">
      所有设置将保存在本地，仅对当前设备生效，<strong>即时生效</strong>。
    </p>

    <div class="settings-group">
      <h3><i class="fas fa-magic"></i> 外观效果</h3>
      <div class="setting-desc">个性化光标跟随动画，为桌面端带来更细腻的交互质感。</div>
      <div class="toggle-switch">
        <span class="toggle-label"><i class="fas fa-arrow-pointer"></i> 自定义鼠标样式 (仅桌面端)</span>
        <label class="settings-toggle">
          <input type="checkbox" id="cursorToggleCheckbox">
          <span class="settings-slider"></span>
        </label>
      </div>
      <div class="setting-desc" style="margin-top: 6px;"><strong>可能有性能影响，</strong>关闭后恢复浏览器默认光标。</div>
    </div>

    <div class="settings-group">
      <h3><i class="fas fa-shield-alt"></i> 浏览安全</h3>
      <div class="setting-desc">开启后点击外部链接会显示确认弹窗，帮助避免误触可疑站点。</div>
      <div class="toggle-switch">
        <span class="toggle-label"><i class="fas fa-external-link-alt"></i> 外链拦截弹窗</span>
        <label class="settings-toggle">
          <input type="checkbox" id="linkWarningCheckbox">
          <span class="settings-slider"></span>
        </label>
      </div>
    </div>

    <div class="settings-group">
      <h3><i class="fas fa-database"></i> 隐私与数据</h3>
      <div class="setting-desc">收回对本站隐私政策的同意。<br>清除站点存储的所有偏好设置以及 Cookie 同意记录。<br>清除后网站将恢复初始状态，并重新请求 Cookie 权限。</div>
      <div class="warning-message">
        <i class="fas fa-trash-alt" style="margin-right: 8px;"></i>
        删除后您将退出当前个性化配置，下次访问需要重新同意 Cookie。
      </div>
      <div class="settings-action">
        <button id="clearSWCacheBtn" class="danger-btn">清除 Service Worker 缓存</button>
        <button id="clearCookiesBtn" class="danger-btn"><i class="fas fa-trash-can"></i> 删除所有存储数据</button>
      </div>
    </div>
  `;

  panel.insertAdjacentHTML('beforeend', settingsHTML);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // 绑定控件（在内容插入后）
  bindSettingsControls(panel);

  // 关闭功能
  const closePanel = () => {
    overlay.style.opacity = '0';
    panel.style.transform = 'scale(0.92)';
    setTimeout(() => overlay.remove(), 300);
  };

  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  // 入场动画
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    panel.style.transform = 'scale(1)';
  });
}