// /js/ui/theme.js
// 主题切换模块：初始化主题开关并应用用户偏好
// 若用户未主动设置主题，则根据时段自动切换（6:00-18:00 浅色，其余深色）

import { CONFIG, storageController } from '/js/core/core.js';
import { getTimeBasedTheme } from '/js/core/page-utils.js';

export function initThemeToggle() {
  const checkbox = document.getElementById('theme-toggle-checkbox');
  if (!checkbox) return;

  const setTheme = (theme, updateCheckbox = true, isUserAction = false) => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    if (currentTheme === theme) return;

    // 直接应用主题，CSS transition 会处理背景色和文字颜色的平滑变化
    root.setAttribute('data-theme', theme);

    // 用户手动操作时保存偏好
    if (isUserAction && storageController.isAllowed()) {
      storageController.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
    }

    // 同步复选框状态
    if (updateCheckbox) checkbox.checked = theme === 'dark';

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    
    // 切换主题后，添加临时类触发 CSS 动画
    document.body.classList.add('theme-changing');
    setTimeout(() => {
      document.body.classList.remove('theme-changing');
    }, 600);
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