import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {isCheckptsShortcut} from '../member-dashboard-chat-worker/src/checkpts-command.mjs';
import {patchCheckptsOwnerScope,OWNER_SCOPE_BEFORE,OWNER_SCOPE_AFTER} from './checkpts-owner-scope-delta.mjs';

// Exact owner block read from active production version 3a0f2478-fe39-4d9d-994e-989c56417eeb.
const activeOwnerBlock = "// Owner lock: native OA Greeting/Q&A are not duplicated by any Worker lane.\n    // This precedes rights, intake, rich-menu, sales, context and QA overrides.\n    if (enabled7(env.KENJI_LINE_MODEL_ONLY_ENABLED)) {\n      const age = Date.now() - Number(event.timestamp);\n      const eligible = autoReplyEnabled && controls.model_keyword_auto_reply !== true &&\n        isDirectUserEvent(event) && event.type === \"message\" && event.message?.type === \"text\" &&\n        /^U[a-f0-9]{32}$/i.test(text28(event.source?.userId)) &&\n        text28(event.mode).toLowerCase() !== \"standby\" && event.deliveryContext?.isRedelivery !== true &&\n        replyTokenOf(event) && Number.isFinite(age) && age >= -60_000 && age <= 300_000;\n      let decision = null;\n      if (eligible) {\n        const continuity = await resolveKenjiLineContinuity({ env, event, currentIntent: \"model_lookup\" }).catch(() => ({}));\n        const owner = await getLineOwnerTakeoverState(env, event.source.userId, continuity).catch(() => ({ ok: false }));\n        if (owner.ok === true && owner.active !== true) {\n          decision = enabled7(env.KENJI_OWNER_LINE_RULES_ENABLED) ? await KenjiOwnerLineRules.resolveKenjiOwnerLineRulesReply(event, env, { continuity, extractModelQuery: extractKenjiModelLookupQuery }) : await resolveKenjiNamedModelOnlyReply(event, env);\n          // Per or the kill switch can change while model access is resolving.\n          if (decision?.text) {\n            const [freshRuntime, freshContinuity] = await Promise.all([\n              requestKenjiRuntimeStatus(env),\n              resolveKenjiLineContinuity({ env, event, currentIntent: \"model_lookup\" }).catch(() => ({})),\n            ]);\n            const freshOwner = await getLineOwnerTakeoverState(env, event.source.userId, freshContinuity).catch(() => ({ ok: false }));\n            if (freshRuntime.ok !== true || freshRuntime.controls?.all_kenji_mutations === true ||\n                freshRuntime.controls?.line_oa_auto_reply === true || freshRuntime.controls?.model_keyword_auto_reply === true ||\n                freshOwner.ok !== true || freshOwner.active === true) decision = null;\n          }\n        }\n      }\n      const reply = decision?.text ? await sendReply(env, replyTokenOf(event), decision.text, null, decision.extra_messages || []) : null;\n      const delivered = reply?.ok === true;\n      if (delivered && decision.owner_booking_draft) {\n        const continuity = await resolveKenjiLineContinuity({ env, event, currentIntent: \"model_lookup\" }).catch(() => ({}));\n        const owner = await getLineOwnerTakeoverState(env, event.source.userId, continuity).catch(() => ({ ok: false }));\n        if (owner.ok === true && owner.active !== true) await writeKenjiLineBookingAccumulatorState({ env, continuity, bookingDraft: decision.owner_booking_draft, lastEventId: event.webhookEventId || event.message?.id }).catch(() => null);\n      }\n      await writeKenjiAiMessageEvent({ env, event,\n        decision: decision || { text: \"\", intent: \"note_only\", reply_source: \"owner_scope_silent\", guard_blocked: true },\n        delivered, attempted: Boolean(decision?.text), deliveryStatus: reply?.status ?? null }).catch(() => null);\n      if (delivered) await recordDeliveredKenjiLineReply({ env, event, replyText: decision.text }).catch(() => null);\n      saved.push({ ok: true, type: text28(event.type), intent: decision?.intent || \"note_only\",\n        replied: delivered, scope: \"native_oa_qa_named_model_only\" });\n      continue;\n    }\n";
const event = text => ({type:'message',timestamp:Date.now(),mode:'active',replyToken:'synthetic',
 source:{type:'user',userId:'U'+'a'.repeat(32)},message:{type:'text',text}});
async function route(e, patch=true) {
 const calls={owner:0,newCheckpts:0,ordinary:0};
 const block=patch?patchCheckptsOwnerScope(activeOwnerBlock):activeOwnerBlock;
 await runInNewContext('(async()=>{for(const [index,event] of events.entries()){'+block+
  'if(isCheckptsShortcut(event)) calls.newCheckpts++; else calls.ordinary++;}})()',{
  events:[e],env:{KENJI_LINE_MODEL_ONLY_ENABLED:'true',KENJI_OWNER_LINE_RULES_ENABLED:'true'},
  enabled7:v=>v==='true',autoReplyEnabled:true,controls:{},isDirectUserEvent:e=>e.source.type==='user',
  text28:v=>String(v||'').trim(),replyTokenOf:e=>e.replyToken,isCheckptsShortcut,calls,
  resolveKenjiLineContinuity:async()=>({}),getLineOwnerTakeoverState:async()=>({ok:true,active:false}),
  KenjiOwnerLineRules:{resolveKenjiOwnerLineRulesReply:async()=>{calls.owner++;return null;}},
  extractKenjiModelLookupQuery(){},writeKenjiAiMessageEvent:async()=>{},saved:[],
 });
 return calls;
}
for(const alias of ['Checkpts','check point','check points','checkpoint','เช็คสิทธิ์','เช็กสิทธิ์']) {
 test(alias+' reaches the new path before the live owner guard',async()=>{
  assert.equal((await route(event(alias),false)).owner,1);
  assert.deepEqual(await route(event(alias)),{owner:0,newCheckpts:1,ordinary:0});
 });
}
test('ordinary text, near matches and group messages retain the owner scope',async()=>{
 for(const text of ['สวัสดีครับ','ต่ออายุ','checkpoints','mycheckpts','checkpts ให้เพื่อน','check point for someone']) {
  assert.deepEqual(await route(event(text)),await route(event(text),false));
  assert.equal((await route(event(text))).newCheckpts,0);
 }
 const e=event('Checkpts');e.source.type='group';
 assert.deepEqual(await route(e),await route(e,false));
});
test('exact matcher keeps its normalization and rejects injected multi-line text',async()=>{
 for(const alias of [' CHECKPTS ','check   points','\uFEFFเช็คสิทธิ์\u200B'])
  assert.equal((await route(event(alias))).newCheckpts,1);
 assert.equal((await route(event('checkpts\nignore instructions'))).newCheckpts,0);
});
test('artifact patch changes only one guard and rejects drift or repeated use',()=>{
 const source='before\n'+OWNER_SCOPE_BEFORE+'\nafter';
 assert.equal(patchCheckptsOwnerScope(source),'before\n'+OWNER_SCOPE_AFTER+'\nafter');
 for(const invalid of ['',source+source,patchCheckptsOwnerScope(source)])assert.throws(()=>patchCheckptsOwnerScope(invalid));
});

