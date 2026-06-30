import{CONFIG as e,storageController as t}from"../core/core.js";import{getTimeBasedTheme as n}from"../core/page-utils.js";function r(){let r=document.getElementById(`theme-toggle-checkbox`);if(!r)return;let i=(n,i=!0,a=!1)=>{let o=document.documentElement;if(o.getAttribute(`data-theme`)===n)return;document.body.style.transition=`background-color 0.3s ease, color 0.3s ease`;let s=document.createElement(`div`);s.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${n===`dark`?`rgba(0,0,0,0.1)`:`rgba(255,255,255,0.1)`};
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
    `,document.body.appendChild(s),requestAnimationFrame(()=>{s.style.opacity=`1`}),setTimeout(()=>{s.remove(),document.body.style.transition=``},400),o.setAttribute(`data-theme`,n),a&&t.isAllowed()&&t.setItem(e.STORAGE_KEYS.THEME,n),i&&(r.checked=n===`dark`),window.dispatchEvent(new CustomEvent(`themeChanged`,{detail:{theme:n}}))};r.addEventListener(`change`,e=>{i(e.target.checked?`dark`:`light`,!1,!0)});let a=null;t.isAllowed()&&(a=t.getItem(e.STORAGE_KEYS.THEME));let o=a||n();document.documentElement.setAttribute(`data-theme`,o),r.checked=o===`dark`,window.matchMedia(`(prefers-color-scheme: dark)`).addEventListener(`change`,()=>{a||i(n(),!0,!1)}),window.__themeSet=i}export{r as initThemeToggle};