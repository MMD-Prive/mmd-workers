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
test('current profile keeps server/session verification before returning to Lovable',async()=>{
 const {rewritten}=await shell();const code=extract(rewritten,'async function readProfile(','function requestId()');
 for(const [status,payload,expected] of [[200,{ok:true,data:{membership_status:'review_required'}},1],[401,{ok:false},0],[200,{ok:false},0],[200,null,0]]){
  const redirects=[],reads=[];
  await runInNewContext(code+'\nreadProfile({hydrate:false,silent:true})',{
   profileGeneration:0,hideMemberProfile(){},clearMemberProfile(){},CONFIG:{profileEndpoint:'/member/api/liff/profile'},
   memberApiFetch:async(url,opts)=>{reads.push({url,opts});return Response.json(payload,{status});},
   window:{location:{replace:url=>redirects.push(url)}},renderProfile(){throw Error('old home must not hydrate');},
  });
  assert.equal(redirects.length,expected);if(expected)assert.equal(redirects[0],'/my-mmd/');
  assert.equal(reads[0].opts.credentials,'same-origin');assert.equal(reads[0].url,'/member/api/liff/profile');
 }
});
test('current start requires Worker acceptance and preserves unrelated POST responses',async()=>{
 const {rewritten}=await shell();const code=extract(rewritten,'async function call(endpoint, body)','function normalizeCanonicalHistory(');
 for(const [status,payload,endpoint,expected] of [[200,{ok:true,data:{member_resolved:true}},'/member/api/liff/start',1],[200,{ok:true,data:{member_resolved:false}},'/member/api/liff/start',1],[401,{ok:false},'/member/api/liff/start',0],[200,{ok:false},'/member/api/liff/start',0],[200,{ok:true,data:{}},'/member/api/liff/intent',0]]){
  const redirects=[],reads=[];
  await runInNewContext(code+'\ncall(endpoint,{id_token:"synthetic"})',{
   endpoint,CONFIG:{startEndpoint:'/member/api/liff/start'},JSON,
   fetch:async(url,opts)=>{reads.push({url,opts});return Response.json(payload,{status});},
   render(){},showTemporaryError(){},safeDiagnosticCode(){return '';},window:{location:{replace:url=>redirects.push(url)}},
  });
  assert.equal(redirects.length,expected);assert.equal(reads[0].opts.credentials,'same-origin');assert.equal(reads[0].opts.method,'POST');
 }
});
test('LINE preflight requires logged-in SDK, ID token and successful server verification',async()=>{
 const {rewritten}=await shell();const code=extract(rewritten,'async function preflightWelcomeIdentity()','async function resolveInitialWelcomeContext()');
 for(const [loggedIn,token,status,ok,expected] of [[true,'synthetic',200,true,1],[false,'',200,true,0],[true,'',200,true,0],[true,'synthetic',401,false,0],[true,'synthetic',200,false,0]]){
  const redirects=[];
  await runInNewContext(code+'\npreflightWelcomeIdentity()',{
   CONFIG:{intent:'status',liffId:'2000000000-test',startEndpoint:'/member/api/liff/start'},
   window:{liff:{init:async()=>{},isLoggedIn:()=>loggedIn,getIDToken:()=>token},location:{replace:url=>redirects.push(url)}},
   customerLoading:{waitFor:fn=>fn()},preflightVerifiedSession:false,fetch:async()=>Response.json({ok},{status}),readProfile:async()=>null,
  });assert.equal(redirects.length,expected);
 }
});
test('default and encoded LINE state use Lovable; campaigns, renewal, albums and hostile targets stay bounded',async()=>{
 for(const query of ['','?intent=status','?liff_intent=unknown','?liff.state='+encodeURIComponent('/member/liff?intent=status')]){
  const {request,rewritten}=await shell(query);assert.equal(I.statusReturnTarget(request),'/my-mmd/');assert.match(rewritten,/mmd-liff-lovable-return-v1/);
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
  if(status===200){assert.equal(response.headers.get('x-mmd-liff-return-target'),'/my-mmd/');assert.match(response.headers.get('cache-control'),/no-store/);assert.match(body,/mmd-liff-lovable-return-v1/);}else assert.equal(body,html);
 }
});
