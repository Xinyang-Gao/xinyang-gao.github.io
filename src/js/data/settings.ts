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

  // 遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'settings-panel-overlay';

  // 主面板
  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'settings-close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', '关闭设置面板');
  panel.appendChild(closeBtn);

  // ----- 内容 HTML -----
  const settingsHTML = `
    <div class="settings-panel-header">
      <h2><i class="fas fa-sliders-h"></i> 站点设置</h2>
      <p class="settings-subtitle">
        所有设置将保存在本地，仅对当前设备生效，<strong>即时生效</strong>。
      </p>
    </div>

    <div class="settings-section">
      <div class="settings-section-header">
        <h3><i class="fas fa-magic"></i> 外观效果</h3>
        <p class="settings-section-desc">个性化光标跟随动画，为桌面端带来更细腻的交互质感。</p>
      </div>
      <div class="settings-item">
        <span class="settings-item-label"><i class="fas fa-arrow-pointer"></i> 自定义鼠标样式 <span style="font-weight:400;color:var(--text-secondary);font-size:0.8rem;">(仅桌面端)</span></span>
        <span class="settings-item-control">
          <label class="settings-toggle">
            <input type="checkbox" id="cursorToggleCheckbox">
            <span class="settings-slider"></span>
          </label>
        </span>
      </div>
      <div class="settings-item-hint"><i class="fas fa-info-circle"></i> 可能有性能影响，关闭后恢复浏览器默认光标。</div>
    </div>

    <div class="settings-section">
      <div class="settings-section-header">
        <h3><i class="fas fa-shield-alt"></i> 浏览安全</h3>
        <p class="settings-section-desc">开启后点击外部链接会显示确认弹窗，帮助避免误触可疑站点。</p>
      </div>
      <div class="settings-item">
        <span class="settings-item-label"><i class="fas fa-external-link-alt"></i> 外链拦截弹窗</span>
        <span class="settings-item-control">
          <label class="settings-toggle">
            <input type="checkbox" id="linkWarningCheckbox">
            <span class="settings-slider"></span>
          </label>
        </span>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-header">
        <h3><i class="fas fa-database"></i> 隐私与数据</h3>
        <p class="settings-section-desc">
          收回对本站隐私政策的同意。<br>清除站点存储的所有偏好设置以及 Cookie 同意记录。<br>清除后网站将恢复初始状态，并重新请求 Cookie 权限。
        </p>
      </div>
      <div class="settings-warning">
        <i class="fas fa-trash-alt"></i>
        删除后您将退出当前个性化配置，下次访问需要重新同意 Cookie。
      </div>
      <div class="settings-actions">
        <button id="clearSWCacheBtn" class="danger-btn"><i class="fas fa-broom"></i> 清除 Service Worker 缓存</button>
        <button id="clearCookiesBtn" class="danger-btn"><i class="fas fa-trash-can"></i> 删除所有存储数据</button>
      </div>
    </div>
  `;

  panel.insertAdjacentHTML('beforeend', settingsHTML);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // 绑定控件
  bindSettingsControls(panel);

  // ----- 关闭逻辑 -----
  const closePanel = () => {
    overlay.classList.remove('active');
    panel.classList.remove('active');
    setTimeout(() => overlay.remove(), 350);
  };

  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  // ----- 入场动画 -----
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    panel.classList.add('active');
  });
}