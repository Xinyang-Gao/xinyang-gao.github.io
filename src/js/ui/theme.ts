// /js/ui/theme.js
// 主题切换模块：仅负责绑定导航栏开关，所有状态由 themeController 管理

import { themeController } from '/js/core/theme-controller.js';

export function initThemeToggle(): void {
  const checkbox = document.getElementById('theme-toggle-checkbox') as HTMLInputElement | null;
  if (!checkbox) return;

  // 首次同步复选框
  checkbox.checked = themeController.getTheme() === 'dark';

  // 用户操作：写入模式
  checkbox.addEventListener('change', (e) => {
    const theme = (e.target as HTMLInputElement).checked ? 'dark' : 'light';
    themeController.setMode(theme);
  });

  // 外部变更（设置面板、系统偏好）时同步复选框
  themeController.onChange((theme) => {
    checkbox.checked = theme === 'dark';
  });
}