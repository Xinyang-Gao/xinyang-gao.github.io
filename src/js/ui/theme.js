// /js/ui/theme.js
// 主题切换模块：初始化主题开关并应用用户偏好
// 若用户未主动设置主题，则根据时段自动切换（6:00-18:00 浅色，其余深色）

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme } from '/js/core/page-utils.js';

export function initThemeToggle() {
  const checkbox = document.getElementById('theme-toggle-checkbox');
  if (!checkbox) return;

  /**
   * 应用主题并更新存储
   * @param {string} theme - 'light' 或 'dark'
   * @param {boolean} updateCheckbox - 是否同步复选框状态
   * @param {boolean} isUserAction - 是否为用户手动切换（用于区分自动恢复）
   */
  const setTheme = (theme, updateCheckbox = true, isUserAction = false) => {
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

    // 应用主题
    root.setAttribute('data-theme', theme);

    // 存储主题：仅在用户手动操作时保存，避免自动时段切换覆盖用户偏好
    if (isUserAction && storageController.isAllowed()) {
      storageController.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
    }

    // 同步复选框状态
    if (updateCheckbox) checkbox.checked = theme === 'dark';

    // 触发自定义事件，供其他模块监听（如光标颜色更新）
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  };

  // 复选框变更事件（用户手动操作）
  const handleChange = (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    // 用户主动切换，标记为 isUserAction = true，会保存到 localStorage
    setTheme(theme, false, true);
  };
  checkbox.addEventListener('change', handleChange);

  // ------ 确定初始主题 ------
  // 1. 优先使用 localStorage 中保存的用户选择
  let savedTheme = null;
  if (storageController.isAllowed()) {
    savedTheme = storageController.getItem(CONFIG.STORAGE_KEYS.THEME);
  }

  // 2. 若没有保存值，则根据时段自动选择
  const initialTheme = savedTheme || getTimeBasedTheme();

  // 应用初始主题（非用户操作，不保存）
  document.documentElement.setAttribute('data-theme', initialTheme);
  checkbox.checked = initialTheme === 'dark';

  // ------ 监听系统主题变化（仅在用户未保存时生效） ------
  // 如果用户已保存主题，系统变化不应覆盖用户选择
  // 但若用户从未保存（savedTheme === null），则系统变化时重新按时段计算
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    // 仅当用户没有主动保存过主题时，才跟随时段
    if (!savedTheme) {
      const newTheme = getTimeBasedTheme();
      setTheme(newTheme, true, false); // 不保存，仅应用
    }
  });

  // 可选：暴露 setTheme 供其他模块调用（如无刷新导航后恢复）
  window.__themeSet = setTheme;
}