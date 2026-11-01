import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL, ROOT, OWNER_PAGE, SHOPS, sha, verifyLine, handleVerification, handleStore } from './src/mms-partner-line-verification.mjs';
import { APP_JS, OWNER_HTML, SHOP_BRANDS } from './src/mms-partner-line-ui.mjs';
import liveEntry from './src/admin-login-hero-worker.js';
import { MmsPartnerAuthStore } from './src/mms-partner-auth-store.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';

const tables={shops:'tbl09N5ug8rmEQCyi',accounts:'tbliSftcsqqTt78mG',claims:'tblnXtbI7jj9DbKex',grants:'tblVlfHwFyZrtmXmV'};
test('approved logos map to separate shop keys without modifying LINE channel or Owner controls',()=>{
 assert.deepEqual(Object.keys(SHOP_BRANDS),['kalima','relax']);
 for(const key of ['kalima','relax']){assert.equal(SHOP_BRANDS[key].name,SHOPS[key].name);assert.match(SHOP_BRANDS[key].logo,/^https:\/\/cdn\.prod\.website-files\.com\/68f879d546d2f4e2ab186e90\//);}
 assert.notEqual(SHOP_BRANDS.kalima.logo,SHOP_BRANDS.relax.logo);
 assert.ok(APP_JS.includes('updateShopBrand();status.textContent'));
 assert.ok(APP_JS.includes('image.alt=brand.name'));
 assert.ok(!OWNER_HTML.includes(SHOP_BRANDS.kalima.logo));assert.ok(!OWNER_HTML.includes(SHOP_BRANDS.relax.logo));
});
const subject='U'+'a'.repeat(32), token='test-id-token-never-persist-this-value';
function fixture(){
  const data=Object.fromEntries(Object.values(tables).map(t=>[t,[]]));let seq=0,failClaimPatch=false,lineCalls=0,failCreate='';
  for(const shop of Object.values(SHOPS))data[tables.shops].push({id:shop.id,fields:{'Shop Name':shop.name,'Identity Status':'Pending verification'}});
  const env={AIRTABLE_API_KEY:'fixture-key',AIRTABLE_BASE_ID:'appsV1ILPRfIjkaYg'};
  const stores=new Map();env.MMS_PARTNER_AUTH={idFromName:n=>n,get:n=>{if(!stores.has(n)){const saved=new Map();stores.set(n,new MmsPartnerAuthStore({storage:{get:async k=>saved.get(k),put:async(k,v)=>saved.set(k,v)}},env));};return stores.get(n);}};
  const fetcher=async(input,init={})=>{
    const u=new URL(String(input));
    if(u.hostname==='api.line.me'){lineCalls++;assert.equal(new URLSearchParams(init.body).get('client_id'),CHANNEL);return Response.json({aud:CHANNEL,iss:'https://access.line.me',sub:subject,exp:Math.floor(Date.now()/1000)+600});}
    assert.equal(u.hostname,'api.airtable.com');const parts=u.pathname.split('/'),table=parts[3],id=parts[4],rows=data[table];assert.ok(rows);
    if((init.method||'GET')==='GET'){
      if(id)return rows.find(r=>r.id===id)?Response.json(rows.find(r=>r.id===id)):Response.json({}, {status:404});
      const formula=u.searchParams.get('filterByFormula'),m=formula?.match(/^\{([^}]+)\}='(.*)'$/);return Response.json({records:m?rows.filter(r=>r.fields[m[1]]===m[2]):rows});
    }
    const fields=JSON.parse(init.body).fields;assert.equal(JSON.parse(init.body).typecast,false);
    if(init.method==='PATCH'){
      if(failClaimPatch&&table===tables.claims)return Response.json({}, {status:503});const row=rows.find(r=>r.id===id);Object.assign(row.fields,fields);return Response.json(row);
    }
    if(failCreate===table)return Response.json({}, {status:503});
    const row={id:'rec'+String(++seq).padStart(14,'0'),fields};rows.push(row);return Response.json(row);
  };
  return {env,data,fetcher,lineCalls:()=>lineCalls,failClaimPatch:value=>{failClaimPatch=value;},failCreate:table=>{failCreate=tables[table];}};
}
const post=(path,body,origin='https://www.mmdbkk.com')=>new Request('https://www.mmdbkk.com'+ROOT+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const owner={id:'fixture-owner',role:'owner'};
const options={readOwner:async()=>owner,appJs:APP_JS,ownerHtml:OWNER_HTML};
test('diagnostics distinguish account and claim write failures without storing identity or approving anything',()=>withFixture(async f=>{
 for(const table of ['accounts','claims']){
   f.failCreate(table);const response=await request(f);assert.equal(response.status,503);
   const p=await (await handleVerification(new Request('https://www.mmdbkk.com'+ROOT+'/diagnostics?shop=kalima'),f.env,options)).json();
   assert.ok(p.events.some(e=>e.stage==='line_verified'&&e.code==='OK'));
   assert.deepEqual(p.events.at(-1).stage,table==='accounts'?'account_write':'claim_write');assert.equal(p.events.at(-1).code,'REGISTRY_WRITE_UNAVAILABLE');
   assert.ok(p.events.every(e=>Object.keys(e).join(',')==='at,shop,stage,code'));
   assert.doesNotMatch(JSON.stringify(p),new RegExp(token+'|'+subject));
   assert.equal(f.data[tables.grants].length,0);
 }
}));
async function request(f,key='kalima'){return handleVerification(post('/request',{shop_key:key,id_token:token,consent:true}),f.env,options);}
async function status(f,key){return (await handleVerification(post('/status',{shop_key:key,id_token:token}),f.env,options)).json();}
async function review(f,key,claim,decision='approve'){return handleVerification(post('/review',{shop_key:key,claim_id:claim,decision}),f.env,options);}
function verifyShops(f){f.data[tables.shops].forEach((r,i)=>Object.assign(r.fields,{'Identity Status':'Verified','Canonical Shop ID':'fixture-shop-'+i}));}
async function withFixture(run){const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;try{return await run(f);}finally{globalThis.fetch=original;}}

test('LINE identity requires correct audience, issuer, subject and live expiry',async()=>{
 for(const values of [{aud:'wrong'},{iss:'https://evil.invalid'},{sub:'browser-supplied-name'},{exp:1}])await assert.rejects(()=>verifyLine(token,async()=>Response.json({aud:CHANNEL,iss:'https://access.line.me',sub:subject,exp:Math.floor(Date.now()/1000)+600,...values})),/LINE_TOKEN_INVALID/);
 assert.equal((await verifyLine(token,async()=>Response.json({aud:CHANNEL,iss:'https://access.line.me',sub:subject,exp:Math.floor(Date.now()/1000)+600}))).length,64);
});
test('both shops enroll separately with one LINE account and no automatic grants',()=>withFixture(async f=>{
 const a=await (await request(f)).json(),b=await (await request(f,'relax')).json();assert.equal(a.claim.shop_name,'Kalima Massage');assert.equal(b.claim.shop_name,'Relax Spa by 9');assert.notEqual(a.claim.claim_id,b.claim.claim_id);assert.equal(f.data[tables.accounts].length,1);assert.equal(f.data[tables.claims].length,2);assert.equal(f.data[tables.grants].length,0);assert.ok(f.data[tables.claims].every(r=>r.fields['Claim Status']==='Pending Owner Review'));
 const persisted=JSON.stringify(f.data);assert.ok(!persisted.includes(subject));assert.ok(!persisted.includes(token));assert.ok(!JSON.stringify(a).includes(await sha(subject)));
}));
test('concurrent retries are serialized and do not duplicate claims or accounts',()=>withFixture(async f=>{
 const responses=await Promise.all([request(f),request(f),request(f)]);const claims=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(claims.map(x=>x.claim.claim_id)).size,1);assert.equal(f.data[tables.claims].length,1);assert.equal(f.data[tables.accounts].length,1);
}));
test('unverified shop blocks approval and cross-shop review fails closed',()=>withFixture(async f=>{
 const c=(await (await request(f)).json()).claim;assert.equal((await review(f,'kalima',c.claim_id)).status,409);assert.equal((await review(f,'relax',c.claim_id)).status,403);assert.equal(f.data[tables.grants].length,0);
}));
test('approving Kalima never authorizes Relax; revocation removes effective access',()=>withFixture(async f=>{
 verifyShops(f);const a=(await (await request(f)).json()).claim;await request(f,'relax');assert.equal((await review(f,'kalima',a.claim_id)).status,200);assert.equal((await status(f,'kalima')).access,'approved_for_this_shop');assert.equal((await status(f,'relax')).access,'not_granted');assert.equal(f.data[tables.grants].length,1);assert.equal(f.data[tables.grants][0].fields['Shop Registry Key'],SHOPS.kalima.id);f.data[tables.grants][0].fields['Grant Status']='Revoked';assert.equal((await status(f,'kalima')).access,'not_granted');
}));
test('canonical collision prevents grants',()=>withFixture(async f=>{
 verifyShops(f);f.data[tables.shops][1].fields['Canonical Shop ID']='fixture-shop-0';const c=(await (await request(f)).json()).claim;assert.equal((await review(f,'kalima',c.claim_id)).status,409);assert.equal(f.data[tables.grants].length,0);
}));
test('partial approval failure cannot grant access and retry completes without duplicates',()=>withFixture(async f=>{
 verifyShops(f);const c=(await (await request(f)).json()).claim;f.failClaimPatch(true);assert.equal((await review(f,'kalima',c.claim_id)).status,503);assert.equal((await status(f,'kalima')).access,'not_granted');f.failClaimPatch(false);assert.equal((await review(f,'kalima',c.claim_id)).status,200);assert.equal(f.data[tables.grants].length,1);assert.equal((await status(f,'kalima')).access,'approved_for_this_shop');
}));
test('Owner queue and review reject absent or Partner identity including spoofed headers',()=>withFixture(async f=>{
 const r=new Request('https://www.mmdbkk.com'+ROOT+'/requests?shop=kalima',{headers:{'x-mmd-admin-role':'owner','x-mmd-admin-actor':'per'}});assert.equal((await handleVerification(r,f.env,{readOwner:async()=>null})).status,401);assert.equal((await handleVerification(r,f.env,{readOwner:async()=>({id:'partner',role:'mms_partner'})})).status,403);
}));
test('unknown fields, missing consent and wrong origin cannot reach identity or registry writes',()=>withFixture(async f=>{
 assert.equal((await handleVerification(post('/request',{shop_key:'kalima',id_token:token,consent:true,line_subject:subject}),f.env,options)).status,400);assert.equal((await handleVerification(post('/request',{shop_key:'kalima',id_token:token,consent:true},'https://evil.invalid'),f.env,options)).status,403);assert.equal((await handleVerification(post('/request',{shop_key:'kalima',id_token:token}),f.env,options)).status,400);assert.equal(f.lineCalls(),0);assert.equal(f.data[tables.accounts].length,0);
}));
test('browser programs parse and use textContent for Airtable-controlled values',()=>{
 new Function(APP_JS);for(const script of OWNER_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script[1]);assert.ok(OWNER_HTML.includes('text.textContent=c.account_key'));assert.ok(APP_JS.includes('getIDToken'));assert.ok(!APP_JS.includes('getDecodedIDToken'));assert.ok(!APP_JS.includes('localStorage'));
});
test('public configuration proves access to exact existing shop rows without disclosing private fields',()=>withFixture(async f=>{
 const r=await handleVerification(new Request('https://www.mmdbkk.com'+ROOT+'/config'),f.env,options),p=await r.json();assert.equal(p.registry_ready,true);assert.equal(p.shops.length,2);assert.ok(!JSON.stringify(p).includes(SHOPS.kalima.id));f.data[tables.shops][0].fields['Shop Name']='wrong shop';assert.equal((await handleVerification(new Request('https://www.mmdbkk.com'+ROOT+'/config'),f.env,options)).status,409);
}));
test('Owner page redirects signed-out users to the established login and only renders for Owner',()=>withFixture(async f=>{
 const req=new Request('https://www.mmdbkk.com'+OWNER_PAGE);const r=await handleVerification(req,f.env,{...options,readOwner:async()=>null});assert.equal(r.status,303);assert.ok(r.headers.get('location').endsWith('next=%2Finternal%2Fadmin%2Fmms%2Fpartner-line'));assert.equal((await handleVerification(req,f.env,options)).status,200);assert.equal((await handleVerification(req,f.env,{...options,readOwner:async()=>({id:'partner',role:'mms_partner'})})).status,403);
}));

test('production entry serves public assets before Admin gate but keeps Owner review protected',()=>withFixture(async f=>{
 for(const origin of ['https://www.mmdbkk.com','https://mmdbkk.com']){
  const config=await liveEntry.fetch(new Request(origin+ROOT+'/config'),f.env,{});
  assert.equal(config.status,200);assert.equal((await config.json()).registry_ready,true);
  const script=await liveEntry.fetch(new Request(origin+ROOT+'/app.js'),f.env,{});
  assert.equal(script.status,200);assert.equal(await script.text(),APP_JS);
  for(const suffix of ['/requests?shop=kalima','/requests?shop=relax']){
   const r=await liveEntry.fetch(new Request(origin+ROOT+suffix,{headers:{'x-mmd-admin-role':'owner'}}),f.env,{});
   assert.equal(r.status,401);assert.equal((await r.json()).error,'OWNER_REQUIRED');
  }
  assert.equal((await liveEntry.fetch(new Request(origin+OWNER_PAGE),f.env,{})).status,303);
 }
 assert.equal(f.data[tables.accounts].length,0);assert.equal(f.data[tables.grants].length,0);
}));

test('production entry accepts verified LINE requests for both canonical rows without auto approval',()=>withFixture(async f=>{
 verifyShops(f);f.data[tables.shops].forEach(r=>r.fields['Canonical Shop ID']=r.id);
 for(const key of ['kalima','relax']){
  const r=await liveEntry.fetch(post('/request',{shop_key:key,id_token:token,consent:true}),f.env,{});
  assert.equal(r.status,200);const p=await r.json();assert.equal(p.claim.shop_key,key);assert.equal(p.claim.status,'Pending Owner Review');
 }
 assert.equal(f.data[tables.shops].length,2);assert.equal(f.data[tables.accounts].length,1);assert.equal(f.data[tables.claims].length,2);assert.equal(f.data[tables.grants].length,0);
 const denied=await liveEntry.fetch(post('/request',{shop_key:'kalima',id_token:'invalid',consent:true}),f.env,{});
 assert.equal(denied.status,401);assert.equal(f.data[tables.claims].length,2);
}));

test('production entry uses signed Owner sessions and refuses Partner sessions for approval',()=>withFixture(async f=>{
 verifyShops(f);f.data[tables.shops].forEach(r=>r.fields['Canonical Shop ID']=r.id);
 f.env.ADMIN_LOGIN_CREDENTIAL='fixture-credential';f.env.ADMIN_SESSION_SECRET='fixture-session-secret';
 const claim=(await (await liveEntry.fetch(post('/request',{shop_key:'kalima',id_token:token,consent:true}),f.env,{})).json()).claim;
 async function signedReview(role){
  const req=post('/review',{shop_key:'kalima',claim_id:claim.claim_id,decision:'approve'});
  const session=await createCredentialBoundAdminSession(req,{id:'fixture-'+role,role},f.env);
  req.headers.set('cookie','mmd_admin_gate_v1='+session);
  return liveEntry.fetch(req,f.env,{});
 }
 assert.equal((await signedReview('mms_partner')).status,403);assert.equal(f.data[tables.grants].length,0);
 assert.equal((await signedReview('owner')).status,200);assert.equal(f.data[tables.grants].length,1);
 assert.equal(f.data[tables.grants][0].fields['Shop Registry Key'],SHOPS.kalima.id);
}));
