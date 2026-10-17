// /js/ui/ground.ts
// 全局地面：一条地平线，把页面分成"地面上"与"地面下"。
// 地面之上是各页内容（首页为天空 / 半空 / 一言，其余页为卡片），地面之下是页脚。

/** 地面容器 id */
const GROUND_ID = 'site-ground';
/** 地面上放内容的插槽 id（首页注入快捷导航） */
const SLOT_ID = 'ground-slot';

/** 地平线剪影：三条起伏的丘线叠出层次，viewBox 与 preserveAspectRatio 保证横向任意拉伸 */
const RIDGE_SVG = `<svg class="ground-ridge" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 22 Q 120 12 260 20 Q 400 28 540 18 Q 680 8 820 19 Q 960 30 1080 20 Q 1140 15 1200 18 L1200 40 L0 40 Z" />
</svg>`;

/**
 * 草：简笔勾线的几簇，疏密不一。
 * 用 stroke 而非填充，与站点"简笔勾勒"的云朵保持同一套语言。
 */
const FLORA_SVG = `<svg class="ground-flora-svg" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
  <path d="M60 58 C 54 44 52 36 60 28 M60 58 C 66 46 70 40 66 30 M60 58 C 58 46 56 40 60 34" />
  <path d="M180 58 C 176 48 174 42 180 34 M180 58 C 186 48 190 44 187 36" />
  <path d="M320 58 C 314 42 312 32 320 24 M320 58 C 328 44 332 38 328 28 M320 58 C 318 46 316 40 320 32" />
  <path d="M470 58 C 466 48 464 42 470 34" />
  <path d="M610 58 C 604 40 602 30 610 22 M610 58 C 618 42 622 36 618 26" />
  <path d="M760 58 C 756 48 754 40 760 32 M760 58 C 766 48 770 44 767 36" />
  <path d="M900 58 C 894 42 892 32 900 24 M900 58 C 908 46 912 38 908 30" />
  <path d="M1040 58 C 1036 48 1034 42 1040 34" />
  <path d="M1140 58 C 1134 44 1132 34 1140 26 M1140 58 C 1148 46 1152 40 1148 30" />
</svg>`;

let groundEl: HTMLElement | null = null;

/**
 * 幂等创建地面，并插到页脚占位符之前。
 * 页脚由 router 异步 fetch 注入，所以这里只认 `#footer-placeholder` 这个固定容器，
 * 不依赖页脚内容是否已到位。
 */
export function ensureGround(): HTMLElement | null {
  const existing = document.getElementById(GROUND_ID);
  if (existing) return existing;

  const placeholder = document.getElementById('footer-placeholder');
  if (!placeholder || !placeholder.parentNode) return null;

  const el = document.createElement('div');
  el.id = GROUND_ID;
  el.className = 'site-ground';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="ground-flora">${FLORA_SVG}</div>
    ${RIDGE_SVG}
    <div class="ground-body"></div>
    <div class="ground-slot" id="${SLOT_ID}"></div>
  `;

  placeholder.parentNode.insertBefore(el, placeholder);
  groundEl = el;
  return el;
}

/** 取得地面上的插槽（不存在则先创建地面） */
export function getGroundSlot(): HTMLElement | null {
  if (!groundEl && !ensureGround()) return null;
  return document.getElementById(SLOT_ID);
}

/** 往地面上放内容（首页快捷导航）；传空串即清空 */
export function setGroundContent(html: string): void {
  const slot = getGroundSlot();
  if (!slot) return;
  slot.innerHTML = html;
  // 插槽里的链接要能被点到：容器整体 aria-hidden，这里逐个解除
  slot.querySelectorAll('a').forEach((a) => a.removeAttribute('aria-hidden'));
}

/** 离开首页时清空地面上的内容，避免导航残留到别的页面 */
export function clearGroundContent(): void {
  const slot = document.getElementById(SLOT_ID);
  if (slot) slot.innerHTML = '';
}
