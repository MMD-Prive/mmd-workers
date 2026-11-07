/*!
 * Job Model — partner neutral mode v1
 * Source of truth for the Webflow inline blocks `mmd-model-neutral-v1` (style) + `mmd-model-neutral-v1-js`, now loaded as a pinned hosted script.
 * Cosmetic only; authority stays server-side.
 */
/* Partner-issued model links carry a signed neutral claim. Cosmetic only: hide MMD branding, set a neutral tab title and icon. Authority stays server-side. */
(function(){
var CSS="html[data-mmd-neutral] body #mmd-model-confirm-v15 .mm15__brand,\nhtml[data-mmd-neutral] body #mmd-model-confirm-v15 .mm15__success>a,\nhtml[data-mmd-neutral] body #mmd-model-confirm-v15 .mmd-model-current-photo-v1,\nhtml[data-mmd-neutral] body #mmd-model-confirm-v15 .mmd-confirm-rules-btn{display:none!important}\nhtml[data-mmd-neutral] body #mmd-model-confirm-v15::before{background:radial-gradient(40rem 26rem at 70% 0%,rgba(227,189,124,.10),transparent 70%),linear-gradient(180deg,#0d0b0a,#080605)!important;filter:none!important}\nhtml[data-mmd-neutral] body #mmd-model-confirm-v15::after{background:none!important}";
function inject(){if(document.getElementById("mmd-model-neutral-v1"))return;var s=document.createElement("style");s.id="mmd-model-neutral-v1";s.textContent=CSS;(document.head||document.documentElement).appendChild(s)}
try{
var t=new URL(location.href).searchParams.get("t")||"";var e=t.split(".")[0];
if(!/^[A-Za-z0-9_-]{1,4096}$/.test(e))return;
var b=e.replace(/-/g,"+").replace(/_/g,"/");b+="=".repeat((4-b.length%4)%4);
var p=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b),function(c){return c.charCodeAt(0)})));
if(!p||p.neutral!==true||p.via!=="partner")return;
document.documentElement.setAttribute("data-mmd-neutral","1");
inject();
var apply=function(){document.title="Job confirmation";document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="shortcut icon"]').forEach(function(l){l.remove()})};
apply();document.addEventListener("DOMContentLoaded",apply);window.addEventListener("load",apply);
}catch(_){}})();
