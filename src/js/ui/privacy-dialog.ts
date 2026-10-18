// /js/ui/privacy-dialog.ts
// 页脚「隐私政策」就地弹窗（与「站点设置」同一套 detail-dialog 外壳）。
//
// 内容不再有独立页面：正文与样式都在 /js/data/privacy-content.ts 里，
// 这里按需动态 import —— 用户不点开，这段内容就不会被下载/解析。
// 因此也不存在"取不到"的情况，也就没有退回整页跳转的分支。

import { showDetailDialog } from '/js/ui/detail-dialog.js';

/** 注入的样式标签 id：只插一次，重复打开不堆积 */
const STYLE_ID = 'privacy-dialog-style';

function ensureStyle(css: string): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
}

/** 打开隐私政策弹窗（内容来自 TS 模块，按需加载） */
export async function openPrivacyDialog(): Promise<void> {
  const { PRIVACY_HTML, PRIVACY_CSS } = await import('/js/data/privacy-content.js');
  ensureStyle(PRIVACY_CSS);

  showDetailDialog({
    title: '隐私政策',
    htmlContent: `<div class="privacy-dialog-body">${PRIVACY_HTML}</div>`,
    source: 'privacy',
  });
}

/**
 * 绑定页脚（及任何地方）的隐私政策入口。
 *
 * 入口是 `<button data-privacy-dialog>` 而不是 `<a href="/privacy/">`：
 * 独立页面已经不存在了，留一个会 404 的链接反而是错的。
 */
export function bindPrivacyLinks(root: HTMLElement | Document = document): void {
  root.querySelectorAll<HTMLElement>('[data-privacy-dialog]').forEach((el) => {
    if (el.dataset.privacyBound === '1') return;
    el.dataset.privacyBound = '1';

    el.addEventListener('click', (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      e.preventDefault();
      // router 在 document 上监听点击做 SPA 跳转，且不检查 defaultPrevented，
      // 掐断冒泡避免弹窗开了页面也跳走
      e.stopPropagation();
      void openPrivacyDialog();
    });

    // 键盘可达：button 原生支持 Enter / Space，这里只需保证焦点可见
    if (el.tagName === 'BUTTON' && !el.hasAttribute('type')) {
      el.setAttribute('type', 'button');
    }
  });
}
