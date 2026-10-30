import { myMmdSessionPanel } from './my-mmd-session-panel.js';
const SOURCE='https://mmdprive.webflow.io/member/dashboard?mmd_release=20261030-native-2';
const VIEWS=new Set(['membership','points','coupons','history','profile','booking','wallet','activity','account','attention']);
export async function myMmdWebflowPage(request){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
 const url=new URL(request.url),suffix=url.pathname.replace(/^\/my-mmd\/?/,'').replace(/\/$/,'');
 if(suffix&&VIEWS.has(suffix)){url.pathname='/my-mmd/';url.hash='/'+suffix;return Response.redirect(url,302);}
 if(suffix)return new Response('Not Found',{status:404});
 let upstream;try{upstream=await fetch(new Request(SOURCE,{headers:{accept:'text/html','cache-control':'no-cache'},redirect:'follow'}));}catch{return unavailable("upstream-network");}
 if(!upstream.ok)return unavailable("upstream-status-"+upstream.status);
 const source=await upstream.text();
 if(!source.includes('mymmd-wf')||source.includes('id="mmd-my-mmd-v3-webflow-gateway"'))return unavailable('upstream-stale');
 const html=source.replace(/<body\b([^>]*)>/i, (_match, attributes) => `<body${attributes}>` + myMmdSessionPanel()).replace(/(<nav\b[^>]*aria-label="อัลบั้มสมาชิก"[^>]*>[\s\S]*?)(<\/nav>)/i, '$1<a href="/my-mmd/gws" style="display:inline-block;margin-left:12px;padding:10px 18px;background:#5a1325;color:#fff;border-radius:999px;text-decoration:none">อัลบั้ม GWs →</a>$2').replaceAll('/member/liff?intent=status','https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=my_mmd');
 return new Response(request.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-mmd-ui-source':'webflow:member-dashboard','x-mmd-presentation-owner':'webflow','x-mmd-behavior-owner':'mmd-workers','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
}
function unavailable(reason="unavailable"){return new Response('<!-- presentation: '+reason+' --><!doctype html><html lang="th"><meta charset="utf-8"><title>MY MMD</title><h1>MY MMD</h1><p>ยังเปิดหน้าสมาชิกไม่ได้ กรุณาลองอีกครั้ง</p><a href="/my-mmd/">ลองอีกครั้ง</a></html>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
