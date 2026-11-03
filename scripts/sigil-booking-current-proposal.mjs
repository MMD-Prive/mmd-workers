// Offline artifact overlay proposal; no release adapter imports this module.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {hash,verifyPreservation} from './member-booking-artifact.mjs';
export const SIGIL_CURRENT_HASH='f8fdd9ec081d5cb30ab1293addf9209f19f3d868940b65a1b356687d0a0f5d29';
const SOURCE_HASHES=Object.freeze({
 'member-booking-service.js':'ede7ce028819603be890569a3b97e8d4ee9f39b397e84dac3787cc3d29c72400',
 'current-private-access.js':'ede852e5afcd3b557efcaf0360b74adb60a7177e1cc84b617194a151e5066ea5'
});
function reviewedSource(name){
 const bytes=fs.readFileSync(new URL('../sigil-booking-worker/src/'+name,import.meta.url));
 assert.equal(hash(bytes),SOURCE_HASHES[name],'SIGIL reviewed source drift: '+name);
 return bytes.toString('utf8');
}
function replaceGuard(text,label,before,after){
 assert.equal(text.split(before).length,2,'missing/ambiguous guard '+label);
 return text.replace(before,()=>after);
}
export function hardenMemberReferenceGuard(service){
 // Guard every reference alias accepted by the active intake; do not move guard inside internal dispatch.
 service=replaceGuard(service,'reference-aliases',"if(!REF.test(ref))return null;", "const aliases=[body?.booking_ref,body?.request_id,body?.session_id].filter(v=>typeof v==='string'&&v.length>0);if(aliases.some(v=>v.length>160))return json({ok:false},400);if(!aliases.length)return null;");
 service=replaceGuard(service,'reference-owner-lookup',"try {const rows=await read(env,`{booking_ref}='${ref}'`);if(rows.length)return json({ok:false,error:'member_owned_request'},403);}", "try {for(const alias of aliases){const value=JSON.stringify(alias);const rows=await read(env,`OR({booking_ref}=${value},{Request ID}=${value},{session_id}=${value})`);if(rows.some(row=>parse(row.fields?.resolver_payload_json).my_mmd_owner)||REF.test(alias)&&rows.length)return json({ok:false,error:'member_owned_request'},403);}}" );
 return service;
}
export function buildCurrentSigilProposal(baseline){
 assert.equal(hash(baseline),SIGIL_CURRENT_HASH,'SIGIL proposal baseline drift');let text=baseline.toString();const edits=[];
 const replace=(label,before,after)=>{assert.equal(text.split(before).length,2,'missing/ambiguous '+label);text=text.replace(before,()=>after);edits.push({label,before,after});};
 let service=reviewedSource('member-booking-service.js').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
 service=hardenMemberReferenceGuard(service);
 const access=reviewedSource('current-private-access.js');
 const read=access.slice(access.indexOf('async function read('),access.indexOf('// Service caller')).replace('async function read(','async function contextRead(');
 const context=access.slice(access.indexOf('export async function currentPrivateContext')).replace(/^export /,'').replace('await read(env,','await contextRead(env,');
 const extension='\nconst __currentMemberBooking = (() => {\n'+read+context+'\n'+service+'\nreturn {isMemberBookingService,handleMemberBookingService,protectMemberBookingReference};\n})();\n';
 replace('internal-extension','// src/runtime-index.js\n',extension+'// src/runtime-index.js\n');
 replace('internal-dispatch','    const path = normalizePath5(url.pathname);\n    const method = request.method.toUpperCase();','    const path = normalizePath5(url.pathname);\n    const method = request.method.toUpperCase();\n    if (__currentMemberBooking.isMemberBookingService(request)) return __currentMemberBooking.handleMemberBookingService(request,env,(r,context)=>new URL(r.url).pathname.endsWith("/search") ? model_image_policy_worker_default.fetch(r,env,ctx,context) : entitlement_runtime_worker_default.fetch(r,env,ctx,context));');
 replace('browser-reference-guard','    if (method === "POST" && [CLIENT_RESOLVE_PATH2, BOOKING_INTAKE_PATH2].includes(path)) {','    if (method === "POST" && [CLIENT_RESOLVE_PATH2, BOOKING_INTAKE_PATH2].includes(path)) {\n      const blocked=await __currentMemberBooking.protectMemberBookingReference(request,env);if(blocked)return blocked;');
 replace('media-context','var model_image_policy_worker_default = {\n  async fetch(request, env, ctx) {','var model_image_policy_worker_default = {\n  async fetch(request, env, ctx, memberContext = null) {');
 replace('media-forward','    const response = await index_default.fetch(request, env, ctx);\n    if (!["GET", "POST"].includes(method)', '    const response = await index_default.fetch(request, env, ctx, memberContext);\n    if (!["GET", "POST"].includes(method)');
 replace('search-forward','await handleModelSearch(req, env, url)','await handleModelSearch(req, env, url, memberContext)');
 replace('search-context','async function handleModelSearch(req, env, url) {','async function handleModelSearch(req, env, url, memberContext = null) {');
 replace('search-member','  const storedAccess = await lookupStoredBookingAccess(env, { bookingRef, sessionId });','  const storedAccess = memberContext?.memberRecordId ? {member_record_id:memberContext.memberRecordId} : await lookupStoredBookingAccess(env, { bookingRef, sessionId });');
 replace('exact-selected','  const records = q ? await searchModels(env, q, 40) : await listModels(env, 500);','  const selectedId=/^rec[A-Za-z0-9]{14,24}$/.test(memberContext?.selectedModelId || "") ? memberContext.selectedModelId : "";\n  const records = selectedId ? await airtableList(env, env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models", `RECORD_ID()=${JSON.stringify(selectedId)}`, 2) : q ? await searchModels(env, q, 40) : await listModels(env, 500);');
 // Keep current intake identity/owner implementation. Only supply reviewed private request class.
 replace('private-review','job_class: intakeScope === "public" ? "travel" : normalizeJobClass(body.job_class),','job_class: intakeScope === "public" ? "travel" : memberContext?.ownerMetadata ? "private_review" : normalizeJobClass(body.job_class),');
 const bytes=Buffer.from(text);verifyPreservation(baseline,bytes,edits);return {bytes,sha256:hash(bytes),edits,baselineSha256:SIGIL_CURRENT_HASH,proposalOnly:true,releaseAuthorized:false};
}
