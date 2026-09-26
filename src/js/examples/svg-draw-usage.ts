// examples/svg-draw-usage.ts
// 组件用法示例：从主页/关于页/作品页等任意 TS 模块中导入调用
// 本文件仅作参考，不需要被构建（未被任何入口 import）。

import { PageBase } from '/js/core/page-manager.js';
import {
  createSvgDraw,
  mountSvgDraw,
  initSvgDraw,
  type SvgDrawAnimation,
} from '/js/ui/svg-draw-animation.js';

/* ==========================================================================
   用法一（推荐）：在页面管理器中挂载，随页面销毁自动释放
   --------------------------------------------------------------------------
   适用于首页 Logo、关于页头像边框、作品卡片图标等页面内元素。
   ========================================================================== */
export class AboutPageManager extends PageBase {
  protected async mount(): Promise<void> {
    // 1) 最简单：传容器 + SVG 路径，其余走默认值
    const logo = await createSvgDraw({
      container: '#about-logo',
      source: '/assets/logo.svg',
    });
    this.stack.add(() => logo.destroy());

    // 2) 完整传参：进入视口才播、匀速、循环
    const signature = await createSvgDraw({
      container: document.getElementById('signature') as HTMLElement,
      source: '/assets/signature.svg',
      duration: 3200,
      easing: 'out',
      delay: 200,
      evenSpeed: true,          // 按路径长度分配时长 → 所有笔同时收笔
      minSegmentDuration: 200,
      fillAfterDraw: true,
      fadeDuration: 600,
      roundCaps: true,
      trigger: 'visible',       // 滚到可见时起笔
      once: true,
      loop: false,
      strokeFallbackColor: 'currentColor', // 无描边图形补色，随主题变化
      onReady: (info) => console.log(`[logo] 共 ${info.pathCount} 条路径`),
      onFinish: () => console.log('[logo] 绘制完成'),
      onError: (e) => console.warn('[logo] 失败', e),
    });
    this.stack.add(() => signature.destroy());

    // 3) 运行时改参数并重播
    document.getElementById('slow-btn')?.addEventListener('click', () => {
      signature.update({ duration: 6000, easing: 'linear' }, true);
    });
  }
}

/* ==========================================================================
   用法二：同步挂载（不等加载），适合不阻塞首屏的场景
   ========================================================================== */
export function mountHeaderIcon(): SvgDrawAnimation {
  return mountSvgDraw({
    container: '.site-icon',
    source: '/assets/icon.svg',
    duration: 1200,
    easing: 'sine',
    trigger: 'visible',
  });
}

/* ==========================================================================
   用法三：内联 SVG 源码 / 页面已有 <svg> 元素
   ========================================================================== */
export async function drawInline(): Promise<void> {
  // 源码字符串（含 <svg 即视为源码，不发起请求）
  await createSvgDraw({
    container: '#box-a',
    source: '<svg viewBox="0 0 24 24"><path d="M4 12h16" stroke="currentColor" fill="none"/></svg>',
    duration: 800,
  });

  // 已有元素（默认克隆，原节点不受影响）
  const existing = document.querySelector<SVGSVGElement>('#box-b svg');
  if (existing) {
    await createSvgDraw({ container: '#box-b', source: existing, duration: 1500 });
  }
}

/* ==========================================================================
   用法四：零配置批量初始化（模板里只写 data 属性）
   --------------------------------------------------------------------------
   HTML：
     <div data-svg-draw data-svg-src="/assets/logo.svg"
          data-svg-duration="2400" data-svg-easing="smooth"
          data-svg-trigger="visible" data-svg-even="true"></div>
   TS：
     const dispose = initSvgDraw(document, { roundCaps: false });  // 第二参为公共默认值
     stack.add(dispose);   // 页面销毁
   ========================================================================== */
export function initAllIcons(stack: { add: (fn: () => void) => void }): void {
  stack.add(initSvgDraw(document, { duration: 1800, easing: 'smooth' }));
}

/* ==========================================================================
   用法五：SPA 导航后重新初始化
   --------------------------------------------------------------------------
   组件本身不监听 ajax:navigation（遵循「导航后刷新统一收口」约定），
   由页面管理器的 mount() 自行创建即可；如需全局扫描：
   ========================================================================== */
// import { onNavigation } from '/js/core/core.js';
// let dispose: (() => void) | null = null;
// onNavigation(() => {
//   dispose?.();
//   dispose = initSvgDraw(document);
// });
