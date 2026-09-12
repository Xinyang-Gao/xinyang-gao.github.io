// /js/core/clarity.js

let clarityLoaded = false;

function loadClarity() {
  if (clarityLoaded) return;
  clarityLoaded = true;

  (function(c,l,a,r,i,t,y){
    c[a] = c[a] || function() { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r);
    t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", "wnxwo9anpg");

  // 可选：初始化后立即记录当前页面
  if (window.clarity) {
    window.clarity("set", "page", window.location.href);
  }
}

// 用于 SPA 导航时更新页面视图
export function updateClarityPage() {
  if (window.clarity) {
    window.clarity("set", "page", window.location.href);
    // 或 clarity("upgrade"); 视官方建议，新版通常用 set page
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