// /js/core/clarity.ts
// Microsoft Clarity 接入（站点默认同意统计，直接加载）

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

const CLARITY_PROJECT_ID = 'wnxwo9anpg';

let clarityLoaded = false;

function loadClarity(): void {
  if (clarityLoaded) return;
  clarityLoaded = true;

  // Clarity 官方注入片段：先用队列函数占位，真实脚本就绪后自动回放调用
  if (!window.clarity) {
    const queue: unknown[][] = [];
    const stub = ((...args: unknown[]) => {
      queue.push(args);
    }) as ClarityFn;
    stub.q = queue;
    window.clarity = stub;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  // 初始化后立即记录当前页面（未就绪时会入队，稍后自动回放）
  updateClarityPage();
}

/** 用于 SPA 导航时更新页面视图 */
export function updateClarityPage(): void {
  if (typeof window.clarity === 'function') {
    window.clarity('set', 'page', window.location.href);
  }
}

/**
 * 初始化 Clarity。
 * 由于站点默认同意存储/统计，直接加载即可。
 * 保留此函数名以兼容现有调用点。
 */
export function initClarityOnConsent(): void {
  if (clarityLoaded) return;
  loadClarity();
}
