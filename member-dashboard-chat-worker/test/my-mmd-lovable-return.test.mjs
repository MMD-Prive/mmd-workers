import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import worker, { MMD_LIFF_STABILITY_INTERNALS as I } from '../src/mms-line-front-gate.js';
import { handleLiffMemberShell } from '../../member-pages-worker/src/liff-member-shell.js';
async function shell(query='?intent=status') {
 const request=new Request('https://www.mmdbkk.com/member/liff'+query);
 const html=await handleLiffMemberShell(request,{LINE_LIFF_ID:'2000000000-test'}).text();
 return {request,html,rewritten:I.stabilizeStatusShell(html,request)};
}
function extract(html,start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
test('current profile renders verified data locally and fails closed without redirecting',async()=>{
 const {rewritten}=await shell();const code=extract(rewritten,'async function readProfile(','function requestId()');
 for(const [status,payload,expected] of [[200,{ok:true,data:{membership_status:'review_required'}},1],[401,{ok:false},0],[503,{ok:false,error:{code:'MEMBER_PROFILE_REFRESH_UNAVAILABLE'}},0],[200,{ok:false},0],[200,null,0]]){
  const redirects=[],reads=[],renders=[];
  await runInNewContext(code+'\nreadProfile({hydrate:false,silent:true})',{
   profileGeneration:0,hideMemberProfile(){},clearMemberProfile(){},CONFIG:{profileEndpoint:'/member/api/liff/profile'},
   memberApiFetch:async(url,opts)=>{reads.push({url,opts});return Response.json(payload,{status});},
   window:{location:{replace:url=>redirects.push(url)}},renderProfile:data=>renders.push(data),
   renderCustomerContact(){},personalMainUI:{load(){}},readQuickMembershipStatus(){},readOwnHistoryPreview(){},
  });
  assert.equal(redirects.length,0);assert.equal(renders.length,expected);
  if(expected)assert.equal(renders[0].membership_status,'review_required');
  assert.equal(reads[0].opts.credentials,'same-origin');assert.equal(reads[0].url,'/member/api/liff/profile');
 }
});
test('current start stays in the shell and preserves unrelated POST responses',async()=>{
 const {rewritten}=await shell();const code=extract(rewritten,'async function call(endpoint, body)','function normalizeCanonicalHistory(');
 for(const [status,payload,endpoint,expected] of [[200,{ok:true,data:{member_resolved:true}},'/member/api/liff/start',1],[200,{ok:true,data:{member_resolved:false}},'/member/api/liff/start',1],[401,{ok:false},'/member/api/liff/start',0],[503,{ok:false},'/member/api/liff/start',0],[200,{ok:false},'/member/api/liff/start',0],[200,{ok:true,data:{}},'/member/api/liff/intent',1]]){
  const redirects=[],reads=[],renders=[];
  const transport=async(url,opts)=>{reads.push({url,opts});return Response.json(payload,{status});};
  await runInNewContext(code+'\ncall(endpoint,{id_token:"synthetic"})',{
   endpoint,CONFIG:{startEndpoint:'/member/api/liff/start'},JSON,
   fetch:transport,memberApiFetch:transport,
   render:data=>renders.push(data),showTemporaryError(){},safeDiagnosticCode(){return '';},window:{location:{replace:url=>redirects.push(url)}},
  });
  assert.equal(redirects.length,0);assert.equal(renders.length,expected);assert.equal(reads[0].opts.credentials,'same-origin');assert.equal(reads[0].opts.method,'POST');
 }
});
test('LINE preflight requires logged-in SDK, ID token and successful server verification',async()=>{
 const {rewritten}=await shell();const code=extract(rewritten,'async function preflightWelcomeIdentity()','async function resolveInitialWelcomeContext()');
 for(const [loggedIn,token,status,ok,expected] of [[true,'synthetic',200,true,1],[false,'',200,true,0],[true,'',200,true,0],[true,'synthetic',401,false,0],[true,'synthetic',200,false,0]]){
  const redirects=[],profileReads=[];
  const accepted=await runInNewContext(code+'\npreflightWelcomeIdentity()',{
   CONFIG:{intent:'status',liffId:'2000000000-test',startEndpoint:'/member/api/liff/start'},
   window:{liff:{init:async()=>{},isLoggedIn:()=>loggedIn,getIDToken:()=>token},location:{replace:url=>redirects.push(url)}},
   customerLoading:{waitFor:fn=>fn()},preflightVerifiedSession:false,existingProfilePromise:null,
   memberApiFetch:async()=>Response.json({ok},{status}),readProfile:async()=>{profileReads.push(true);return null;},
  });assert.equal(redirects.length,0);assert.equal(accepted,Boolean(expected));assert.equal(profileReads.length,expected);
 }
});
test('default and encoded LINE state keep native home; other intents and hostile targets stay bounded',async()=>{
 for(const query of ['','?intent=status','?liff_intent=unknown','?liff.state='+encodeURIComponent('/member/liff?intent=status')]){
  const {request,html,rewritten}=await shell(query);assert.equal(I.statusReturnTarget(request),'/my-mmd/');assert.equal(rewritten,html);
  for(const match of rewritten.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(!match[1].trim().startsWith('{'))new Function(match[1]);
 }
 for(const query of ['?intent=renew','?intent=signup','?intent=promo&campaign=care_back','?intent=status&campaign=care_back','?intent=status&view=ems_albums','?intent=status&view=gws_albums','?intent=status&return_to=https://evil.example/']){
  const {html,rewritten}=await shell(query);assert.equal(rewritten,html,query);
 }
});
test('wrapper preserves host-only cookie, same-origin session, failures and no-store response',async()=>{
 const request=new Request('https://www.mmdbkk.com/member/liff?intent=status',{headers:{cookie:'__Host-mmd_liff_session=synthetic'}});
 const {html}=await shell();const cookie='__Host-mmd_liff_session=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax';
 for(const status of [200,503]){
  const env={MEMBER_PAGES_WORKER:{fetch:async incoming=>{assert.equal(incoming.headers.get('cookie'),request.headers.get('cookie'));return new Response(html,{status,headers:{'content-type':'text/html','set-cookie':cookie}});}}};
  const response=await worker.fetch(request,env);assert.equal(response.headers.get('set-cookie'),cookie);const body=await response.text();
  if(status===200){assert.equal(response.headers.get('x-mmd-liff-return-target'),null);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(body,/mmd-liff-lovable-return-v1|mmd-ems-login-return|window\.location\.replace\("\/my-mmd\/"\)/);}else assert.equal(body,html);
 }
});
test('explicit coupon still redirects only after server-verified profile',async()=>{
 const {rewritten}=await shell('?intent=status&return_to=coupon');
 const code=extract(rewritten,'async function readProfile(','function requestId()');
 for(const status of [200,401,503]){
  const redirects=[];
  await runInNewContext(code+'\nreadProfile({hydrate:false,silent:true})',{
   profileGeneration:0,hideMemberProfile(){},clearMemberProfile(){},CONFIG:{profileEndpoint:'/member/api/liff/profile'},
   memberApiFetch:async()=>Response.json({ok:status===200,data:{}},{status}),
   window:{location:{replace:url=>redirects.push(url)}},renderProfile(){throw Error('explicit bridge must not hydrate');},
  });
  assert.deepEqual(redirects,status===200?['/my-mmd/coupons']:[]);
 }
});
test('outer and inner wrappers keep status Home local for both skins and encoded CTA state',async()=>{
 const {html}=await shell();
 for(const nightline of [true,false])for(const query of ['?intent=status&view=overview','?liff.state='+encodeURIComponent('/?intent=status&view=overview')]){
  const input=html.replace(/data-mmd-skin="nightline"/g,'')
   .replace(/<body\b/,'<body'+(nightline?' data-mmd-skin="nightline"':''));
  let calls=0;
  const response=await worker.fetch(new Request('https://www.mmdbkk.com/member/liff'+query),{
   MEMBER_PAGES_WORKER:{fetch:async()=>{calls++;return new Response(input,{headers:{'content-type':'text/html','x-mmd-liff-return-target':'/my-mmd/'}});}},
  });
  const body=await response.text();
  assert.equal(calls,1);assert.equal(response.status,200);
  assert.equal(response.headers.get('x-mmd-liff-return-target'),null);
  assert.equal(response.headers.get('x-mmd-liff-ui-mode'),nightline?'nightline-home':'native-home');
  assert.doesNotMatch(body,/mmd-ems-login-return|mmd-liff-lovable-return-v1|window\.location\.replace\("\/my-mmd\/"\)/);
  assert.match(body,/renderProfile\(payload\.data/);
  assert.match(body,/existingProfilePromise = readProfile/);
 }
});
test('profile 503 is forwarded without redirect, session forgery or hiding the error',async()=>{
 const payload={ok:false,state:'checking',error:{code:'MEMBER_PROFILE_REFRESH_UNAVAILABLE'}};
 let calls=0;
 const response=await worker.fetch(new Request('https://www.mmdbkk.com/member/api/liff/profile'),{
  MEMBER_PAGES_WORKER:{fetch:async()=>{calls++;return Response.json(payload,{status:503});}},
 });
 assert.equal(calls,1);assert.equal(response.status,503);
 assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),payload);
});
