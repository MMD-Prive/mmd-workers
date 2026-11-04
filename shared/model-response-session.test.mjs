import test from 'node:test';
import assert from 'node:assert/strict';
import {projectConsoleSession,snapshotAuthority} from './model-response-session.mjs';

test('authority snapshot does not retain a mutable cached authority reference',()=>{
 const cached={ok:true,allowed:true,model_id:'m',session_id:'s',offer_revision:'r',binding:'b'};
 const saved=snapshotAuthority(cached);
 cached.binding='changed';cached.allowed=false;
 assert.equal(saved.binding,'b');assert.equal(saved.allowed,true);assert.ok(Object.isFrozen(saved));
 assert.equal(snapshotAuthority({...cached,binding:{id:'b'}}),null);
});

test('private Console terms and actions are detached copies without internal fields',()=>{
 const source={session_id:'s',model_work_lane:'private_model',package_code:null,pay_model_thb:null,allowed_actions:['start_travel'],payout_terms:{policy_version:'v',money_lane:'private_model',compensation_mode:'negotiated',base_payout_thb:123,public_package_matrix_applies:false,public_ot_matrix_applies:false,extension_rate_mode:'approval',extension_requires_model_approval:true,extension_requires_mmd_confirmation:true,reimbursable_expenses:['parking'],secret:'hidden'},token:'hidden'};
 const result=projectConsoleSession(source,'s');
 assert.equal(result.payout_terms.base_payout_thb,123);
 assert.equal(result.payout_terms.public_package_matrix_applies,false);
 assert.equal(result.token,undefined);assert.equal(result.payout_terms.secret,undefined);
 source.allowed_actions.push('finish');source.payout_terms.reimbursable_expenses.push('other');source.payout_terms.base_payout_thb=999;
 assert.deepEqual(result.allowed_actions,['start_travel']);
 assert.deepEqual(result.payout_terms.reimbursable_expenses,['parking']);
 assert.equal(result.payout_terms.base_payout_thb,123);
});

test('nullable Console terms are retained and mismatched or malformed sessions rejected',()=>{
 assert.deepEqual(projectConsoleSession({session_id:'s',payout_terms:null,pay_model_thb:null},'s'),{session_id:'s',payout_terms:null,pay_model_thb:null});
 assert.equal(projectConsoleSession({session_id:'other'},'s'),null);
 assert.equal(projectConsoleSession({session_id:'s',allowed_actions:[{}]},'s'),null);
 assert.equal(projectConsoleSession({session_id:'s',payout_terms:{base_payout_thb:Infinity}},'s'),null);
});
