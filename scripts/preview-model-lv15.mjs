// LOCAL ONLY: serve real presentation/runtime against isolated in-memory fixtures.
// The server never forwards any request and never loads credentials.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {buildBundle} from './build-my-model-workspace-bundle.mjs';
import {buildLovableSkinEmbed} from './build-my-model-lovable-skin-embed.mjs';
import {buildConsoleEmbed,buildConsoleDeclineEmbed} from './build-model-console-atelier-embed.mjs';
import {buildLv15Embed} from './build-model-lv15-skin.mjs';
import {modelDigitalDashboardHtml} from '../model-dashboard-presentation-worker/src/model-digital-dashboard.js';
import {MODEL_MEDIA_UPLOAD_CSS,MODEL_MEDIA_UPLOAD_JS} from '../model-dashboard-presentation-worker/src/model-media-upload-presentation.js';
import {FIXTURE_STATES,makeFixture,fixtureSession,applyFixtureAction,fixtureTravel} from './model-lv15-fixtures.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const defaultShellPath=fileURLToPath(new URL('./fixtures/model-lv15/console-shell.html',import.meta.url));
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.prod.website-files.com https://fonts.googleapis.com; img-src 'self' data: blob: https://cdn.prod.website-files.com https://s3.amazonaws.com https://assets-global.website-files.com; font-src 'self' https://cdn.prod.website-files.com https://fonts.gstatic.com; object-src 'none'; frame-src 'none'; form-action 'self'; base-uri 'none'";
function bootstrap(url){
 const world=url.searchParams.get('fixture_world')==='private'?'private':'public';
 const state=FIXTURE_STATES.includes(url.searchParams.get('fixture_state'))?url.searchParams.get('fixture_state'):'confirmed';
 return `<style>html{scroll-padding-top:62px!important}body{margin:0!important;padding-top:82px!important}#lv15-preview-bar{position:fixed;inset:0 0 auto;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;min-height:48px;padding:5px 10px;border-bottom:1px solid #7775;background:#efeee7;color:#252820;font:10px/1.4 system-ui}#lv15-preview-bar label{display:flex;align-items:center;gap:4px}#lv15-preview-bar select{max-width:140px;min-height:32px;border:1px solid #aaa;border-radius:8px;background:white;color:#242621;font:11px system-ui}#lv15-preview-message{position:fixed;z-index:2147483647;bottom:100px;left:50%;transform:translateX(-50%);background:#eee;color:#222;padding:13px 20px;max-width:90vw;border-radius:15px;font:13px/1.6 system-ui}#lv15-preview-bar,#lv15-preview-bar *{box-sizing:border-box!important}#lv15-preview-bar{height:78px!important;min-height:0!important;padding:4px 8px!important;gap:2px 8px!important}#lv15-preview-bar label{font:9px/1.2 system-ui!important;margin:0!important;padding:0!important}#lv15-preview-bar strong{font:600 9px/1.2 system-ui!important}#lv15-preview-bar select{height:28px!important;min-height:28px!important;max-height:28px!important;max-width:125px!important;padding:2px 4px!important;margin:0!important;font:10px/1.2 system-ui!important}#lv15-preview-bar a{color:#8e1020!important;text-decoration:underline}@media(max-width:380px){#lv15-preview-bar{gap:4px;font-size:8px}#lv15-preview-bar select{max-width:110px}}</style><aside id="lv15-preview-bar" aria-label="Local preview controls"><strong>LOCAL FIXTURE · LV15</strong><label>World<select id="lv15-fixture-world"><option value="public"${world==='public'?' selected':''}>Public</option><option value="private"${world==='private'?' selected':''}>Private</option></select></label><label>State<select id="lv15-fixture-state">${FIXTURE_STATES.map(s=>`<option${s===state?' selected':''}>${s}</option>`).join('')}</select></label><a href="/sigil/model/dashboard">MY MODEL</a></aside><p id="lv15-preview-message" hidden role="status"></p><script>(function(){
 const source=new URL(location.href);const keys=['fixture_world','fixture_state','fixture_run'];
 const msg=x=>{const p=document.querySelector('#lv15-preview-message');p.textContent=x;p.hidden=false;setTimeout(()=>p.hidden=true,4500)};
 const F=window.fetch.bind(window);window.fetch=(input,init)=>{const u=new URL(input instanceof Request?input.url:input,location.href);if(u.origin!==location.origin)return Promise.reject(new Error('Local preview blocks external API'));return F(input,init)};
 window.open=()=>{msg('พรีวิวในเครื่อง · ไม่เปิดลิงก์หรือส่งข้อความจริง');return null};
 document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;let u;try{u=new URL(a.href,location.href)}catch{return}if(u.origin!==location.origin){e.preventDefault();e.stopImmediatePropagation();msg('ลิงก์ภายนอกถูกพักไว้ในพรีวิว · ไม่มีการส่งข้อมูลจริง');return}if(!a.getAttribute('href').startsWith('#')){for(const k of keys)if(source.searchParams.has(k))u.searchParams.set(k,source.searchParams.get(k));a.href=u.href}},true);
 for(const id of ['lv15-fixture-world','lv15-fixture-state'])document.getElementById(id).addEventListener('change',()=>{const u=new URL(location.href);u.searchParams.set('fixture_world',document.getElementById('lv15-fixture-world').value);u.searchParams.set('fixture_state',document.getElementById('lv15-fixture-state').value);u.searchParams.set('fixture_run',String(Date.now()));location.assign(u)});
 document.addEventListener('submit',e=>{if(e.target.action&&new URL(e.target.action,location.href).origin!==location.origin){e.preventDefault();e.stopImmediatePropagation();msg('พรีวิวไม่ส่งฟอร์มไป Production')}},true);
})();</script>`;
}
function stripRemoteScripts(html){return html.replace(/<script\b[^>]*\bsrc\s*=\s*["']https?:[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,'');}
function decorate(html,url){
 html=stripRemoteScripts(html);
 return html.replace(/<body([^>]*)>/i,(_,attrs)=>`<body${attrs}>${bootstrap(url)}`);
}
function shellParts(input){
 const dom=new JSDOM(fs.readFileSync(input,'utf8')),doc=dom.window.document,root=doc.querySelector('#sigil-model-console-v3');
 if(!root)throw Error('Captured Console root not found');
 root.querySelectorAll('script').forEach(n=>n.remove());
 for(const a of ['data-ready','data-i18n-runtime-ready','data-console-atelier','data-console-lane'])root.removeAttribute(a);
 root.dataset.currentEndpoint='/v1/model/session/current';root.dataset.actionEndpoint='/v1/model/session/action';root.dataset.hypeUrl='/__preview/no-send';
 const styles=[...doc.querySelectorAll('style')].map(n=>n.outerHTML).join('\n');
 const links=[...doc.querySelectorAll('link[rel=stylesheet]')].filter(n=>/^(https:\/\/cdn\.prod\.website-files\.com\/|https:\/\/fonts\.googleapis\.com\/)/.test(n.href)).map(n=>n.outerHTML).join('\n');
 const result={markup:root.outerHTML,styles,links};dom.window.close();return result;
}
export function createModelLv15Preview({shellPath=defaultShellPath}={}){
 const shell=shellParts(shellPath), home=buildBundle()+buildLovableSkinEmbed()+buildLv15Embed();
 const consoleHtml='<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+shell.links+shell.styles+'</head><body>'+shell.markup+buildConsoleDeclineEmbed()+buildConsoleEmbed()+read('webflow/sigil/model/model-console-payout-summary-v2.html')+'<script>'+read('webflow/sigil/model/model-console-rules-links-v1.js')+'</script>'+buildLv15Embed()+'</body></html>';
 const fixtures=new Map(),counts=new Map();
 function context(req,url){let ref;try{ref=new URL(req.headers.referer||url)}catch{ref=url}if(!ref.hostname.match(/^(127\.0\.0\.1|localhost)$/))ref=url;
  const world=ref.searchParams.get('fixture_world')==='private'?'private':'public',candidate=ref.searchParams.get('fixture_state'),state=FIXTURE_STATES.includes(candidate)?candidate:'confirmed';
  const key=[world,state,ref.searchParams.get('fixture_run')||'default'].join(':');if(!fixtures.has(key))fixtures.set(key,makeFixture(world,state));return fixtures.get(key);
 }
 async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('fixture body too large')}try{return JSON.parse(raw||'{}')}catch{return {}}}
 function send(res,value,status=200,type='application/json; charset=utf-8'){res.writeHead(status,{'content-type':type,'cache-control':'no-store','content-security-policy':csp,'x-mmd-preview':'local-fixture-only'});res.end(type.startsWith('application/json')?JSON.stringify(value):value);}
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+server.address().port),p=url.pathname,method=req.method||'GET';
  counts.set(method+' '+p,(counts.get(method+' '+p)||0)+1);
  try{
   if(p==='/__fixture/receipt'&&method==='GET')return send(res,{local_fixture_only:true,production_requests:0,requests:Object.fromEntries(counts)});
   if(p.startsWith('/sigil/model/dashboard-assets/')){if(method!=='GET')return send(res,{ok:false},405);if(p.endsWith('model-media-upload-v1.css'))return send(res,MODEL_MEDIA_UPLOAD_CSS,200,'text/css; charset=utf-8');if(p.endsWith('model-media-upload-v1.js'))return send(res,MODEL_MEDIA_UPLOAD_JS,200,'text/javascript; charset=utf-8');return send(res,{ok:false},404);}
   if(p.startsWith('/v1/')){
    const f=context(req,url),data=['POST','PATCH','DELETE','PUT'].includes(method)?await body(req):{};
    if(['auth','review','error'].includes(f.state)){const status=f.state==='auth'?401:f.state==='review'?403:503;return send(res,{ok:false,error:f.state==='auth'?'model_session_required':f.state==='review'?'identity_review_required':'fixture_unavailable'},status);}
    if(p==='/v1/model/profile'&&method==='GET')return send(res,{ok:true,model:f.profile});
    if(p==='/v1/model/profile'&&method==='PATCH'){for(const k of ['height_cm','weight_kg','languages','skills_summary','experience_summary','availability_status','available_now'])if(Object.hasOwn(data,k))f.profile[k]=data[k];return send(res,{ok:true,model:f.profile,local_fixture_only:true});}
    if(p==='/v1/model/media'&&method==='GET')return send(res,{ok:true,media:[],items:[]});
    if(p==='/v1/model/history'&&method==='GET')return send(res,{ok:true,items:[],summary:{earned_total_thb:null,paid_confirmed_total_thb:null}});
    if(p==='/v1/model/session/current'&&method==='GET'){
     // Existing Dashboard contract uses a 404 for confirmed no-active-job;
     // existing Console contract uses successful session:null.
     let fromConsole=false;try{fromConsole=new URL(req.headers.referer||url).pathname==='/sigil/model/console'}catch{}
     if(f.state==='empty'&&!fromConsole)return send(res,{ok:false,error:'active_session_not_found'},404);
     return send(res,{ok:true,session:fixtureSession(f)});
    }
    if(p==='/v1/model/session/action'&&method==='POST'){const result=applyFixtureAction(f,data);return send(res,result,result.ok?200:409);}
    if(p==='/v1/model/session/travel'&&method==='GET')return send(res,fixtureTravel(f));
    if(p==='/v1/model/session/travel'&&method==='POST'){if(!['en_route','nearby'].includes(f.state))return send(res,{ok:false,error:'fixture_action_not_allowed'},409);if(data.eta_minutes)f.etaMinutes=Math.min(240,Math.max(1,Number(data.eta_minutes)||45));f.revision++;return send(res,{...fixtureTravel(f),delivery:{status:'not_sent',local_fixture_only:true},receipt:{local_fixture_only:true,notification_sent:false}});}
    if(p==='/v1/model/settings/gps-visibility'&&['GET','PATCH'].includes(method)){if(method==='PATCH')f.gps=data.enabled===true;return send(res,{ok:true,enabled:f.gps,data:{enabled:f.gps}});}
    if(p==='/v1/model/settings/customer-visibility'&&method==='GET')return send(res,{ok:true,revision:1,items:[],blocked_session_ids:[]});
    if(p==='/v1/model/telegram/bind'&&method==='POST')return send(res,{ok:true,telegram_connected:true,local_fixture_only:true});
    return send(res,{ok:false,error:'local_fixture_endpoint_not_available'},method==='GET'?404:405);
   }
   if(method!=='GET'&&method!=='HEAD')return send(res,{ok:false,error:'preview_method_blocked'},405);
   if(p==='/__preview/no-send')return send(res,'<!doctype html><html><body><h1>LOCAL PREVIEW</h1><p>ไม่มีการส่งข้อความจริง</p><a href="/sigil/model/dashboard">กลับ MY MODEL</a></body></html>',200,'text/html; charset=utf-8');
   if(p==='/')return send(res,decorate('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><h1>MY MODEL LV15</h1><a href="/sigil/model/dashboard?fixture_world=public">Public</a> · <a href="/sigil/model/dashboard?fixture_world=private">Private</a></main></body></html>',url),200,'text/html; charset=utf-8');
   if(p==='/sigil/model/console')return send(res,decorate(consoleHtml,url),200,'text/html; charset=utf-8');
   if(p==='/sigil/model/dashboard'||p==='/sigil/model/dashboard/')return send(res,decorate('<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+home+'</body></html>',url),200,'text/html; charset=utf-8');
   if(/^\/sigil\/model\/dashboard\/(jobs|profile|availability|photos|support|more)\/?$/.test(p))return send(res,decorate(modelDigitalDashboardHtml(new Request(url.href),{miniAppUrl:url.origin+'/__preview/no-send'}),url),200,'text/html; charset=utf-8');
   return send(res,{ok:false,error:'local_preview_route_not_available'},404);
  }catch(error){return send(res,{ok:false,error:'local_preview_error',message:error.message},500);}
 });
 return {server,counts,fixtures};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const shellPath=process.argv[2]||defaultShellPath;
 const {server}=createModelLv15Preview({shellPath});server.listen(4203,'127.0.0.1',()=>console.log('MY MODEL real-runtime fixture preview: http://127.0.0.1:4203/sigil/model/dashboard?fixture_world=public'));
}
