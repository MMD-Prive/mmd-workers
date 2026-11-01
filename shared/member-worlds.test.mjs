import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMemberWorlds, serializeMemberWorlds } from './member-worlds.mjs';
const row=(code,created_at=1,extra={})=>({code,created_at,status:'active',end_date:'2027-01-01',...extra});
const project=rows=>projectMemberWorlds(rows,{status:'verified',today:'2026-10-26'});
test('Public and SIGIL coexist with separate expiry and no invented access flag',()=>{
 const result=project([row('elite',2,{end_date:'2027-10-01'}),row('premium',1)]);
 assert.deepEqual(result.public,{state:'active',tier:'Elite',expiresAt:'2027-10-01'});
 assert.deepEqual(result.sigil,{state:'active',tier:'Premium',expiresAt:'2027-01-01'});
 assert.equal(result.access,undefined);
});
test('ambiguous SIGIL does not hide Public; hidden Black Card stays checking',()=>{
 const result=project([row('red_card',3),row('premium',1),row('standard',1)]);
 assert.equal(result.public.tier,'Red Card');assert.equal(result.sigil.state,'checking');
 assert.equal(project([row('black_card')]).sigil.state,'checking');
});
test('dates, refunds, blocking, missing data and absent memberships remain distinct',()=>{
 assert.equal(project([row('mmd_member',1,{end_date:'2026-01-01'})]).public.state,'expired');
 assert.equal(project([row('premium',1,{start_date:'2027-01-01'})]).sigil.state,'checking');
 assert.equal(project([row('premium',1,{status:'refunded'})]).sigil.state,'refunded');
 assert.equal(projectMemberWorlds([row('premium')],{status:'verified',blocked:true}).sigil.state,'restricted');
 assert.equal(projectMemberWorlds([]).public.state,'checking');assert.equal(project([]).public.state,'none');
});
test('wire projection strips injected fields and invalid cross-world tiers',()=>{
 const data=project([row('elite'),row('premium')]);data.public.line_user_id='secret';data.public.access=true;data.sigil.tier='Elite';
 const result=serializeMemberWorlds(data);assert.equal(result.public.line_user_id,undefined);assert.equal(result.public.access,undefined);assert.equal(result.sigil.state,'checking');
});
