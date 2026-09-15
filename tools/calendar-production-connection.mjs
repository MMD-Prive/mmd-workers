import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const config=JSON.parse(readFileSync(new URL('../admin-worker/calendar-routes.json',import.meta.url),'utf8'));
const expected=['mmdbkk.com/internal/admin/calendar*','www.mmdbkk.com/internal/admin/calendar*','mmdbkk.com/v1/admin/calendar*','www.mmdbkk.com/v1/admin/calendar*'];
assert.equal(config.worker,'admin-worker');assert.deepEqual(config.patterns,expected);
if(process.argv.includes('--validate')){console.log('Calendar route manifest valid: four narrow routes, no writes');process.exit(0);}
assert.ok(process.argv.includes('--connect'),'explicit --connect required');
assert.equal(process.env.GITHUB_REF,'refs/heads/main','production connection only from main');
const secret=name=>String(process.env[name]||'').replace(/[\r\n\u2028\u2029]/g,'').trim();
const credential=secret('ADMIN_LOGIN_CREDENTIAL'),routesToken=secret('CLOUDFLARE_ROUTES_API_TOKEN');
assert.ok(credential&&routesToken,'required deployment credentials missing');
const origins=['https://mmdbkk.com','https://www.mmdbkk.com'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const opts={redirect:'manual'};
async function get(url,headers={}){return fetch(url,{...opts,headers,signal:AbortSignal.timeout(25000)});}
async function login(origin){
  const r=await fetch(origin+'/internal/admin/login/session',{...opts,method:'POST',signal:AbortSignal.timeout(20000),headers:{Origin:origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({credential,next:'/internal/admin/calendar'})});
  const destination=new URL(r.headers.get('location')||'/',origin);
  assert.equal(r.status,303,'owner login failed');assert.equal(destination.origin,origin,'external handoff rejected');assert.ok(destination.pathname.startsWith('/internal/admin/'),'invalid handoff');
  const cookie=r.headers.getSetCookie().map(x=>x.split(';',1)[0]).join('; ');assert.ok(/mmd_admin_gate_v1=.+/.test(cookie),'session absent');
  const headers={Cookie:cookie,Origin:origin,Accept:'application/json'};
  const auth=await get(origin+'/v1/admin/auth/me',headers);const me=await auth.json();
  assert.ok(auth.ok&&me.ok===true&&me.authenticated===true&&me.scope==='internal_admin','admin session rejected');
  return headers;
}
const sessions=new Map();for(const origin of origins)sessions.set(origin,await login(origin));
async function cf(path,options={}){
  const r=await fetch('https://api.cloudflare.com/client/v4'+path,{...options,signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+routesToken,'content-type':'application/json'}});
  const body=await r.json();assert.ok(r.ok&&body.success===true,'Cloudflare route operation failed: HTTP '+r.status);return body.result;
}
const routePath='/zones/2d62396174fa2ddadbbcd0e8cf0f3367/workers/routes';
const existing=await cf(routePath);
assert.equal(existing.filter(x=>expected.includes(x.pattern)&&x.script!==config.worker).length,0,'route conflict: no route was overwritten');
for(const pattern of expected)if(!existing.some(x=>x.pattern===pattern&&x.script===config.worker)){
  await cf(routePath,{method:'POST',body:JSON.stringify({pattern,script:config.worker})});console.log('Created calendar route '+pattern);
}
const verified=await cf(routePath);assert.ok(expected.every(pattern=>verified.some(x=>x.pattern===pattern&&x.script===config.worker)),'calendar route verification failed');
async function page(origin){
  let latest;
  for(let attempt=0;attempt<12;attempt++){
    const r=await get(origin+'/internal/admin/calendar?date=2026-09-17',sessions.get(origin));
    const html=await r.text();
    if(r.ok&&r.headers.get('x-mmd-calendar-surface')==='admin-worker-v1.4'){
      assert.ok(html.includes('id="calendar-date"')&&html.includes('/v1/admin/calendar'),'calendar functionality absent');
      const encoded=html.match(/id="calendar-connection-state">([\s\S]*?)<\/script>/)?.[1];assert.ok(encoded,'connection diagnostics absent');
      return {html,connection:JSON.parse(encoded)};
    }
    latest=r.status;if(attempt<11)await wait(4000);
  }
  throw Error('Calendar deployment unavailable: HTTP '+latest);
}
let before=await page(origins[0]);
const provisioning=[];
function putSecret(worker,name,value){
  assert.ok(['admin-worker','cal-sync-worker'].includes(worker));assert.ok(['AIRTABLE_API_KEY','CAL_API_KEY'].includes(name));
  const token=secret('CLOUDFLARE_API_TOKEN');assert.ok(token,'Cloudflare secret provisioning credential unavailable');
  // The value is stdin only; neither arguments, logs nor artifacts contain it.
  const result=spawnSync('npx',['--yes','wrangler@4','secret','put',name,'--name',worker,'--config',worker+'/wrangler.toml'],{
    input:value,encoding:'utf8',timeout:90000,env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:'b176eda1172b741fd2e58904cc9d77c5'},
  });
  assert.equal(result.status,0,'secret provisioning failed for '+worker+':'+name);
  provisioning.push({worker,name,provisioned:true});
}
if(before.connection.inbound.reachable&&!before.connection.inbound.mapping_ledger_configured){
  const key=secret('AIRTABLE_EXISTING_KEY');
  if(key){
    const r=await get('https://api.airtable.com/v0/appsV1ILPRfIjkaYg/tbl6saWYEQrEdnMIK?maxRecords=1',{authorization:'Bearer '+key});
    assert.ok(r.ok,'existing Airtable credential cannot read the Cal ledger');await r.body?.cancel();
    putSecret('cal-sync-worker','AIRTABLE_API_KEY',key);
  }else provisioning.push({worker:'cal-sync-worker',name:'AIRTABLE_API_KEY',provisioned:false,reason:'existing_repository_secret_unavailable'});
}
if(!before.connection.outbound.configured){
  const key=secret('CAL_EXISTING_KEY');
  if(key){
    const r=await get('https://api.cal.com/v2/event-types/7057823',{authorization:'Bearer '+key,'cal-api-version':'2024-06-14'});const body=await r.json();
    assert.ok(r.ok&&body.status==='success'&&Number(body.data?.id)===7057823,'existing Cal credential is not authorized for MMD Internal Hold');
    putSecret('admin-worker','CAL_API_KEY',key);
  }else provisioning.push({worker:'admin-worker',name:'CAL_API_KEY',provisioned:false,reason:'existing_repository_secret_unavailable'});
}
const results=[];
for(const origin of origins){
  const view=await page(origin);
  const dates=[new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),'2026-09-17'];
  const days=[];
  for(const date of new Set(dates)){
    const r=await get(origin+'/v1/admin/calendar?date='+date,sessions.get(origin));const body=await r.json();
    assert.ok(r.ok&&body.ok===true&&body.schema==='mmd.admin.calendar.v1'&&Array.isArray(body.items),'calendar API failed');
    assert.match(r.headers.get('cache-control')||'',/no-store/);
    days.push({date,items:body.items.length,cal_linked:body.items.filter(x=>x.cal?.booking_uid).length});
  }
  const publicApi=await get(origin+'/v1/admin/calendar?date=2026-09-17');assert.equal(publicApi.status,401,'unauthenticated data exposed');await publicApi.body?.cancel();
  const publicPage=await get(origin+'/internal/admin/calendar');assert.ok([302,303].includes(publicPage.status),'page gate missing');await publicPage.body?.cancel();
  results.push({origin,surface:'admin-worker-v1.4',days,connection:view.connection});
}
const ready=results.every(x=>x.connection.outbound.api_verified&&x.connection.inbound.webhook_secret_configured&&x.connection.inbound.mapping_ledger_configured);
const receipt={checked_at:new Date().toISOString(),status:ready?'calendar_live_cal_read_connection_verified':'calendar_live_cal_configuration_incomplete',provisioning,results,booking_created:false,financial_mutations:false};
console.log(JSON.stringify(receipt));
writeFileSync(process.env.RUNNER_TEMP+'/calendar-connection-receipt.json',JSON.stringify(receipt,null,2));
