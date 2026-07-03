import{CONFIG as e,init_core as t,storageController as n}from"../core/core.js";import{getTimeBasedTheme as r}from"../core/page-utils.js";t();function i(){let t=document.getElementById(`theme-toggle-checkbox`);if(!t)return;let i=(r,i=!0,a=!1)=>{let o=document.documentElement;if(o.getAttribute(`data-theme`)===r)return;document.body.style.transition=`background-color 0.3s ease, color 0.3s ease`;let s=document.createElement(`div`);s.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${r===`dark`?`rgba(0,0,0,0.1)`:`rgba(255,255,255,0.1)`};
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
    `,document.body.appendChild(s),requestAnimationFrame(()=>{s.style.opacity=`1`}),setTimeout(()=>{s.remove(),document.body.style.transition=``},400),o.setAttribute(`data-theme`,r),a&&n.isAllowed()&&n.setItem(e.STORAGE_KEYS.THEME,r),i&&(t.checked=r===`dark`),window.dispatchEvent(new CustomEvent(`themeChanged`,{detail:{theme:r}}))};t.addEventListener(`change`,e=>{i(e.target.checked?`dark`:`light`,!1,!0)});let a=null;n.isAllowed()&&(a=n.getItem(e.STORAGE_KEYS.THEME));let o=a||r();document.documentElement.setAttribute(`data-theme`,o),t.checked=o===`dark`,window.matchMedia(`(prefers-color-scheme: dark)`).addEventListener(`change`,()=>{a||i(r(),!0,!1)}),window.__themeSet=i}export{i as initThemeToggle};