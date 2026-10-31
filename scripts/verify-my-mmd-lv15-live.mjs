// GET-only post-release smoke. Never runs LINE JavaScript or authenticates a member.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {MY_MMD_LIFF_LV15_CSS as CSS} from '../member-pages-worker/src/liff-member-lv15-style.js';
export async function inspectLiveLv15(request=fetch){
 const results=[];
 for(const [host,intent] of [['mmdbkk.com','status'],['www.mmdbkk.com','status'],['mmdbkk.com','renew'],['mmdbkk.com','signup']]){
  let url=new URL('https://'+host+'/member/liff?intent='+intent);let response;
  for(let n=0;n<5;n++){
   assert.ok(url.protocol==='https:'&&['mmdbkk.com','www.mmdbkk.com'].includes(url.hostname),'unexpected redirect host');
   response=await request(url.href,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(![301,302,303,307,308].includes(response.status))break;
   assert.ok(response.headers.get('location'),'missing redirect');url=new URL(response.headers.get('location'),url);
  }
  assert.equal(response.status,200,'LIFF response not 200');
  assert.match(response.headers.get('content-type')||'',/text\/html/);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  const html=await response.text();assert.ok(html.length<3_000_000,'oversized LIFF page');
  assert.ok(html.includes(CSS),'reviewed LV15 CSS is not live');
  assert.match(html,/<body[^>]*data-mmd-liff-level="15"/);
  assert.match(html,/<body[^>]*data-brand-audience="unresolved"/);
  assert.match(html,/data-mmd-liff-compact="v4"/);
  for(const id of ['points-total','renewal-action','v2-history','credit-wallet','coupon-wallet','member-logout'])
   assert.ok(html.includes('id="'+id+'"'),'missing original control '+id);
  assert.match(html,/getIDToken\(\)/);
  if(intent==='signup')assert.match(html,/class="signup-mode app-entered world-public"/);
  results.push({requestedHost:host,intent,finalHost:url.hostname,status:response.status,lv15CssExact:true,unresolvedBeforeAuthentication:true,originalControlsPresent:true,signupUnchanged:intent==='signup'?true:undefined});
 }
 return {checked:results.length,results,requestsAreGetOnly:true,customerWrites:0,authenticatedLineAcceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=join(process.env.RUNNER_TEMP||tmpdir(),'member-pages-lv15-live-smoke.json');
 if(process.argv[2]!=='--read-only')throw Error('explicit read-only flag required');
 inspectLiveLv15().then(report=>{writeFileSync(file,JSON.stringify(report,null,2));console.log('LV15 live HTML verified for '+report.checked+' entry variants; authenticated LINE not asserted.');})
 .catch(()=>{writeFileSync(file,JSON.stringify({status:'failed',noAutomaticRollback:true,customerWrites:0}));console.error('LV15 HTML smoke failed. Inspect deployment; do not replay release or change member records.');process.exitCode=1;});
}
