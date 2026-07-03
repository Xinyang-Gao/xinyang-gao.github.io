import{__commonJSMin as e}from"../../_virtual/_rolldown/runtime.js";import{CONFIG as t,CookieConsentManager as n,init_core as r,storageController as i}from"../core/core.js";var a=e((()=>{r();var e={CURSOR_ENABLED:`settings_cursor_enabled`,LINK_WARNING_ENABLED:`settings_link_warning_enabled`};e.CURSOR_ENABLED,e.LINK_WARNING_ENABLED;var a,o,s;function c(e,t=!0){if(i.isAllowed()){let t=i.getItem(e);if(t!==null)return t===`true`}try{let t=localStorage.getItem(e);if(t!==null)return t===`true`}catch{}return t}function l(e,t){let n=t===!0||t===`true`;if(i.isAllowed())i.setItem(e,n?`true`:`false`);else try{localStorage.setItem(e,n?`true`:`false`)}catch{}}function u(){!a||!o||(a.checked=c(e.CURSOR_ENABLED,!0),o.checked=c(e.LINK_WARNING_ENABLED,!0))}function d(t){let n=t.target.checked;l(e.CURSOR_ENABLED,n),m(`鼠标样式设置已保存，刷新后生效`)}function f(t){let n=t.target.checked;l(e.LINK_WARNING_ENABLED,n),m(`外链拦截设置已保存，刷新后生效`)}var p=null;function m(e){let t=document.querySelector(`.settings-toast`);t||(t=document.createElement(`div`),t.className=`settings-toast`,t.style.cssText=`
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--accent-color);
      color: white;
      padding: 10px 24px;
      border-radius: 40px;
      font-size: 0.9rem;
      z-index: 10000;
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(8px);
      transition: opacity 0.2s;
      font-weight: 500;
      pointer-events: none;
    `,document.body.appendChild(t)),t.textContent=e,t.style.opacity=`1`,p&&clearTimeout(p),p=setTimeout(()=>{t.style.opacity=`0`},2800)}async function h(){if(confirm(`⚠️ 确定清除所有 Service Worker 缓存吗？
这将删除所有离线缓存数据，页面将重新加载以应用最新版本。`)){if(typeof window.clearAllServiceWorkerCache==`function`)await window.clearAllServiceWorkerCache();else if(`serviceWorker`in navigator){let e=await navigator.serviceWorker.getRegistrations();for(let t of e)await t.unregister();let t=await caches.keys();await Promise.all(t.map(e=>caches.delete(e))),window.location.reload()}}}async function g(){if(!confirm(`⚠️ 确定删除所有本地数据吗？
这将清除：
- 主题偏好、搜索缓存、作品/文章缓存
- Cookie同意状态（下次访问将再次显示横幅）
- 所有设置项（鼠标、外链拦截等）

网站将会重新加载，且存储功能将被禁用。`))return;let n=Object.values(t.STORAGE_KEYS),r=Object.values(e);[...n,...r].forEach(e=>{try{localStorage.removeItem(e)}catch{}});try{Object.keys(localStorage).forEach(e=>{(e.startsWith(`settings_`)||n.includes(e))&&localStorage.removeItem(e)})}catch{}i&&(i.disableStorage(),i.clearAllData()),localStorage.setItem(t.STORAGE_KEYS.COOKIE_CONSENT,`false`),window.location.reload()}function _(){let e=i.isAllowed();if(s)if(e)s.style.display=`none`;else{s.style.display=`block`;let e=document.getElementById(`acceptCookiesLink`);e&&(e.onclick=e=>{e.preventDefault(),new n(i).setConsented(!0),window.dispatchEvent(new CustomEvent(`cookieConsentAccepted`)),setTimeout(()=>{window.location.reload()},200)})}}function v(){if(a=document.getElementById(`cursorToggleCheckbox`),o=document.getElementById(`linkWarningCheckbox`),s=document.getElementById(`consentAlert`),!a||!o){console.warn(`[Settings] 未找到设置开关元素`);return}u(),a.addEventListener(`change`,d),o.addEventListener(`change`,f);let e=document.getElementById(`clearCookiesBtn`);e&&e.addEventListener(`click`,g);let t=document.getElementById(`clearSWCacheBtn`);t&&t.addEventListener(`click`,h),_(),window.addEventListener(`cookieConsentChanged`,()=>{_(),u()}),window.addEventListener(`ajax:navigation`,()=>{a=document.getElementById(`cursorToggleCheckbox`),o=document.getElementById(`linkWarningCheckbox`),s=document.getElementById(`consentAlert`),a&&o&&(u(),a.removeEventListener(`change`,d),o.removeEventListener(`change`,f),a.addEventListener(`change`,d),o.addEventListener(`change`,f),_());let e=document.getElementById(`clearSWCacheBtn`);e&&e.addEventListener(`click`,h)})}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,v):v()}));export default a();