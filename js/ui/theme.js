// /js/ui/theme.js
// 主题切换模块：初始化主题开关并应用用户偏好

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme } from '/js/core/page-utils.js';

export function initThemeToggle() {
  const checkbox = document.getElementById('theme-toggle-checkbox');
  if (!checkbox) return;

  const setTheme = (theme, updateCheckbox = true) => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    if (currentTheme === theme) return;
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${theme === 'dark' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    setTimeout(() => {
      overlay.remove();
      document.body.style.transition = '';
    }, 400);
    root.setAttribute('data-theme', theme);
    if (storageController.isAllowed()) {
      storageController.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
    }
    if (updateCheckbox) checkbox.checked = theme === 'dark';
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  };

  const handleChange = (e) => setTheme(e.target.checked ? 'dark' : 'light', false);
  checkbox.addEventListener('change', handleChange);

  let savedTheme = null;
  if (storageController.isAllowed()) {
    savedTheme = storageController.getItem(CONFIG.STORAGE_KEYS.THEME);
  }
  const initialTheme = savedTheme || 'dark';
  document.documentElement.setAttribute('data-theme', initialTheme);
  checkbox.checked = initialTheme === 'dark';

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!savedTheme) setTheme(getTimeBasedTheme(), true);
  });
}
