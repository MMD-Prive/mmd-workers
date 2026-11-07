(function(){
'use strict';
if(window.__mmdGlobalPublicHeaderV1)return;
window.__mmdGlobalPublicHeaderV1=true;
var path=location.pathname||'/';
while(path.length>1&&path.charAt(path.length-1)==='/')path=path.slice(0,-1);
var publicMembership=path==='/pay/membership'||path==='/member/membership';
function isRoute(path,prefix){return path===prefix||path.indexOf(prefix+'/')===0;}
var excluded=['/internal','/api','/sigil','/partner','/member','/my-mmd','/pay','/confirm','/recovery','/coupon','/coupon-ws','/model','/app','/admin','/kenji','/control-room','/shop/admin','/shop/supplier','/male-massage','/apply/mms-therapist','/therapists','/password-reset','/onboarding','/form','/assigned','/accept','/phase','/system','/template'];
if(!publicMembership&&excluded.some(function(prefix){return isRoute(path,prefix)}))return;
var excludedExact=['/404','/401','/footer','/blackcard/confirm','/mmd-shop/order','/mms-partner-briefing'];
if(excludedExact.indexOf(path)>=0||path.indexOf('/docs/confidential')===0||path.indexOf('/docs/private-')===0||path.indexOf('/rules/model/private-')===0||path.indexOf('-preview')>=0)return;

function boot(){
 if(document.querySelector('[data-mmdh-header],#mmd-global-public-header'))return;
 var earlyHeaders=document.querySelectorAll('header,[role="banner"],.w-nav');
 for(var i=0;i<earlyHeaders.length;i++){
  var rect=earlyHeaders[i].getBoundingClientRect();
  if(rect.top<140&&earlyHeaders[i].querySelector('nav,.w-nav-menu'))return;
 }
 var markup='<header id="mmd-global-public-header" data-mmd-global-public-header><div class="mmdg-inner"><nav class="mmdg-nav" aria-label="MMD Privé main navigation"><a href="/profiles">Profiles</a><a href="/booking">ส่งคำขอ</a><a href="/member/liff?intent=signup&amp;world=public">Membership</a><a href="/member/liff?intent=status&amp;world=public">My MMD</a></nav><button class="mmdg-menu-button" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mmdg-mobile-menu"><span></span><span></span></button></div><div class="mmdg-mobile-menu" id="mmdg-mobile-menu" hidden><nav aria-label="Mobile navigation"><a href="/">Home <span>↗</span></a><a href="/profiles">Profiles <span>↗</span></a><a href="/#mmdh-services">Experiences <span>↗</span></a><a href="/tmib">TMIB <span>↗</span></a><a href="/member/liff?intent=signup&amp;world=public">Membership <span>↗</span></a><a href="/apply/public-model">Work with MMD <span>↗</span></a><a href="/partner/apply">Become a partner <span>↗</span></a><a href="/member/liff?intent=status&amp;world=public">My MMD <span>↗</span></a><a href="https://t.me/per_mmd">Contact <span>↗</span></a></nav></div></header>';
 var template=document.createElement('template');template.innerHTML=markup;
 var header=template.content.firstElementChild;if(!header)return;
 var body=document.body;if(!body)return;
 body.insertBefore(header,body.firstChild);
 var button=header.querySelector('.mmdg-menu-button'),menu=header.querySelector('.mmdg-mobile-menu');
 function setOpen(open){button.setAttribute('aria-expanded',open?'true':'false');menu.hidden=!open;}
 button.addEventListener('click',function(){setOpen(button.getAttribute('aria-expanded')!=='true')});
 menu.addEventListener('click',function(event){if(event.target.closest('a'))setOpen(false)});
 document.addEventListener('keydown',function(event){if(event.key==='Escape')setOpen(false)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();