# Custom Cursor（已弃用）

> 归档目录：`deprecated/custom-cursor/`

本目录保存从站点移除的「自定义鼠标」功能，仅作归档，不再参与构建与部署。

## 移除范围

| 项目 | 原位置 |
|---|---|
| 鼠标特效引擎 + 自定义光标 | `src/js/ui/mouse-effects.ts` |
| 自定义光标样式 | `src/css/core/components.css`（见下方 `custom-cursor.css`） |
| 层级变量 | `src/css/core/variables.css` 的 `--z-cursor` |
| 设置开关 | `src/js/data/settings.ts` 的「自定义光标」开关、`src/js/core/core.ts` 的 `CURSOR_ENABLED` |
| 编排引用 | `src/js/ui/ui-effects.ts` 的 `CustomCursor` 实例化与重新导出 |

## 功能说明

- **自定义光标**：圆点 + 圆环，纯 DOM + transform。延迟跟随、悬停贴合、文本竖条、滚动拖尾、点击弹簧、空闲暂停
- **鼠标特效**：Canvas 渲染的长按连线拖拽 + 释放爆发粒子，帧率自适应
- 自动探测 Cursor FX 用户脚本，若存在则让出控制权

## 恢复方法

1. 把 `mouse-effects.ts` 放回 `src/js/ui/`
2. 把 `custom-cursor.css` 的内容并入 `src/css/core/components.css`，并在 `variables.css` 补回 `--z-cursor: 1000000;`
3. 在 `core.ts` 的 `STORAGE_KEYS` 补回 `CURSOR_ENABLED: 'settings_cursor_enabled'`
4. 在 `settings.ts` 补回设置项与事件绑定
5. 在 `ui-effects.ts` 补回 `import { CustomCursor }` 与 `refreshUIEffects()` 里的实例化
