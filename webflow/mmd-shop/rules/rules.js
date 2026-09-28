(function(){
"use strict";
var root=document.getElementById("mmdshop-rules-v1");
if(!root||root.dataset.bound==="1")return;
root.dataset.bound="1";
root.dataset.ready="1";
var hash=location.hash?location.hash.slice(1):"";
if(!hash)return;
var target=document.getElementById(hash);
if(!target||!root.contains(target))return;
if(target.tagName&&target.tagName.toLowerCase()==="details")target.open=true;
window.setTimeout(function(){
  try{
    target.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
    var summary=target.querySelector("summary");
    if(summary)summary.focus({preventScroll:true});
  }catch(e){}
},60);
})();