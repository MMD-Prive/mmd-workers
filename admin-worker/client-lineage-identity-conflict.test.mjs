import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCreateSessionClientLineageRequest as handle, CREATE_SESSION_CLIENT_RECENT_PATH as path} from './src/create-session-client-lineage-runtime.js';
import {createCredentialBoundAdminSession} from './src/credential-bound-admin-session.js';

const env = {AIRTABLE_API_KEY:'synthetic',AIRTABLE_BASE_ID:'fixture',INTERNAL_TOKEN:'synthetic',AIRTABLE_TABLE_CLIENTS_ID:'clients',AIRTABLE_TABLE_MEMBERS_ID:'members',AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID:'entitlements',AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID:'staging'};
const member = (id, fields) => ({id,fields:{member_id:id,'Membership Tier':'Premium',...fields}});
async function lookup(t, members, {client={},entitlements=[],authorized=true,cookieRole=''}={}) {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    const method=init.method || input.method || 'GET';
    calls.push({host:url.hostname,method});
    assert.equal(url.hostname,'api.airtable.com');
    assert.equal(method,'GET');
    const data={clients:[{id:'recClient1',fields:{'Client Name':'Customer',...client}}],members,entitlements,staging:[]};
    return Response.json({records:data[url.pathname.split('/').at(-1)] || []});
  });
  const load=async()=>{
    const cookieEnv={...env,ADMIN_LOGIN_CREDENTIAL:'fixture-only-credential'};
    const origin=cookieRole?'https://www.mmdbkk.com':'https://fixture.invalid';
    const cookie=cookieRole?await createCredentialBoundAdminSession(new Request(origin),{id:'fixture-owner',role:cookieRole},cookieEnv):'';
    const headers=cookieRole?{Cookie:`mmd_admin_gate_v1=${cookie}`}:(authorized?{Authorization:'Bearer synthetic'}:{});
    const response=await handle(new Request(origin+path,{headers}),cookieRole?cookieEnv:env);
    return {status:response.status,body:await response.json()};
  };
  const first=await load(),reload=await load();
  assert.deepEqual(reload,first);
  assert.ok(calls.every(c=>c.method==='GET'));
  return {...first,calls};
}
function conflict(result) {
  assert.equal(result.status,200);
  const row=result.body.records[0];
  assert.equal(row.client_name,'Customer');
  assert.equal(row.identity_status,'conflict_review_required');
  assert.equal(row.member_id,'');
  assert.equal(row.tier,'');
  assert.equal(row.package_code,'');
  assert.equal(row.entitlement_snapshot_source,'none');
  assert.ok(result.body.degraded_sources.includes('member_identity_conflict'));
  assert.ok(!JSON.stringify(result.body).includes('Other Person'));
}
test('different email and LINE candidates do not blend member identity into the client',async t=>{
  conflict(await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test','Full Name':'Other Person A'}),member('recMemberB',{line_id:'U-B','Full Name':'Other Person B'})],{client:{email:'a@example.test',line_user_id:'U-B'}}));
});
for(const key of ['email','line','username']) for(const reverse of [false,true]) test(`duplicate ${key} is ambiguous in either source order: ${reverse}`,async t=>{
  const pairs={email:[{'Contact Email':'same@example.test'},{email:'same@example.test'}],line:[{line_id:'U-shared'},{line_user_id:'U-shared'}],username:[{username:'shared'},{username:'shared'}]};
  const [fields,client]=pairs[key];
  const records=[member('recMemberA',fields),member('recMemberB',fields)];
  conflict(await lookup(t,reverse?records.reverse():records,{client}));
});
test('email and username disagreements are also ambiguous',async t=>{
  conflict(await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test'}),member('recMemberB',{username:'other'})],{client:{email:'a@example.test',username:'other'}}));
});
test('unique agreeing shared keys retain the existing fallback',async t=>{
  const result=await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test',line_id:'U-A',username:'same'})],{client:{email:'A@example.test',line_user_id:'U-A',username:'same'}});
  assert.equal(result.body.records[0].member_id,'recMemberA');
});
test('canonical entitlement keeps precedence over disagreeing fallback keys',async t=>{
  const result=await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test'}),member('recMemberB',{line_id:'U-B'})],{client:{email:'a@example.test',line_user_id:'U-B'},entitlements:[{id:'recEnt1',fields:{client:['recClient1'],member:['recMemberB']}}]});
  assert.equal(result.body.records[0].member_id,'recMemberB');
});
test('unauthenticated request makes zero upstream calls',async t=>{
  const result=await lookup(t,[],{authorized:false});
  assert.equal(result.status,401); assert.equal(result.calls.length,0);
});
test('conflict suppresses indirectly matched entitlement on a fresh request',async t=>{
  conflict(await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test'}),member('recMemberB',{line_id:'U-B'})],{client:{email:'a@example.test',line_user_id:'U-B'},entitlements:[{id:'recEntA',fields:{member:['recMemberA'],member_email:'a@example.test',package_code:'Premium',entitlement_level:'premium'}}]}));
});
test('credential-bound owner session receives the same conflict protection',async t=>{
  conflict(await lookup(t,[member('recMemberA',{username:'same'}),member('recMemberB',{username:'same'})],{client:{username:'same'},cookieRole:'owner'}));
});
test('credential-bound customer role is denied with zero upstream calls',async t=>{
  const result=await lookup(t,[],{cookieRole:'customer'});
  assert.equal(result.status,401); assert.equal(result.calls.length,0);
});
for (const foreign of [{client:['recOtherClient']},{member:['recOtherMember']},{client:['recClient1','recOtherClient']}]) test(`indirect entitlement cannot override canonical ownership: ${JSON.stringify(foreign)}`,async t=>{
  const result=await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test'})],{client:{email:'a@example.test',line_user_id:'U-B'},entitlements:[
    {id:'recOwnEnt',fields:{client:['recClient1'],member:['recMemberA'],package_code:'Standard',entitlement_level:'standard'}},
    {id:'recForeignEnt',fields:{...foreign,line_user_id:'U-B',member_email:'a@example.test',package_code:'FOREIGN',entitlement_level:'FOREIGN',access_status:'active',member_status:'active'}}
  ]});
  assert.equal(result.body.records[0].package_code,'Standard');
  assert.ok(!JSON.stringify(result.body).includes('FOREIGN'));
});
test('email match alone cannot borrow entitlement explicitly linked to another client',async t=>{
  const result=await lookup(t,[],{client:{email:'shared@example.test'},entitlements:[{id:'recForeignEnt',fields:{client:['recOtherClient'],member_email:'shared@example.test',package_code:'FOREIGN'}}]});
  assert.equal(result.body.records[0].entitlement_snapshot_source,'none');
  assert.ok(!JSON.stringify(result.body).includes('FOREIGN'));
});
test('member-only entitlement may enrich its resolved member when no foreign client is linked',async t=>{
  const result=await lookup(t,[member('recMemberA',{'Contact Email':'a@example.test'})],{client:{email:'a@example.test'},entitlements:[{id:'recOwnEnt',fields:{member:['recMemberA'],package_code:'Premium'}}]});
  assert.equal(result.body.records[0].package_code,'Premium');
});
