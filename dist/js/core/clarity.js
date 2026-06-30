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

// 供外部调用的同意初始化
export function initClarityOnConsent() {
  // 如果已经加载过，不再重复
  if (clarityLoaded) return;
  
  // 检查是否已同意 Cookie
  const consent = localStorage.getItem("cookieConsentAccepted");
  if (consent === "true") {
    loadClarity();
  } else {
    // 监听同意事件（你的网站已定义）
    const handleConsent = () => {
      loadClarity();
      window.removeEventListener("cookieConsentAccepted", handleConsent);
    };
    window.addEventListener("cookieConsentAccepted", handleConsent);
  }
}