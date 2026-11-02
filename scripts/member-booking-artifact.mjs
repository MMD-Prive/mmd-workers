// Local artifact construction only. No network, upload, deployment or config writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
export const BASE_HASH='9bbe9bf7ad95ed49de8f64cd485883507e2fd142d47df2e5ae0ac28bfb34f523';
export const hash=x=>createHash('sha256').update(x).digest('hex');
const contract=JSON.parse(fs.readFileSync(new URL('./member-booking-release-contract.json',import.meta.url),'utf8'));
const manifest={hashes:contract.source_hashes};
function reviewed(p){const bytes=fs.readFileSync(join(root,p));assert.equal(hash(bytes),manifest.hashes[p],'reviewed source drift: '+p);return bytes.toString();}
export function buildMemberBookingArtifact(baseline){
 assert.equal(hash(baseline),BASE_HASH,'active artifact drift');
 const result=transformBookingArtifact(baseline);assert.equal(result.sha256,contract.member.candidate_sha256,'candidate bytes drift');return result;
}
// Pure transformation supports small fixtures; release always calls the pinned builder above.
export function transformBookingArtifact(baseline){
 let text=baseline.toString('utf8');assert.ok(Buffer.from(text).equals(baseline),'invalid UTF8');assert.ok(!text.includes('__memberBookingExtension'));
 const edits=[];
 const replace=(label,before,after)=>{assert.equal(text.split(before).length,2,'ambiguous/missing '+label);assert.ok(!text.includes(after),'already applied '+label);edits.push({label,before,after});text=text.replace(before,()=>after);};
 const flow=reviewed('member-pages-worker/src/member-booking-flow.js');
 const imports=["import { readBoundedJsonObject } from './bounded-json.js';\n","import { readMemberAppSession } from './member-app-api-runtime.js';\n","import { resolveCanonicalClientForLine } from './member-app-client-history.js';\n"];
 let gateway=flow;for(const line of imports){assert.equal(gateway.split(line).length,2);gateway=gateway.replace(line,'');}
 let actor=reviewed('member-pages-worker/src/member-booking-coordinator.js');const actorImport="import { digest, reply } from './member-booking-flow.js';\n";assert.equal(actor.split(actorImport).length,2);actor=actor.replace(actorImport,'');
 const ui=reviewed('member-pages-worker/src/liff-member-booking.js');
 const unexport=s=>s.replace(/^export /gm,'');
 const extension='\n// Booking-only extension: uses existing active session/client/bounded-body helpers unchanged.\nconst __memberBookingExtension = (() => {\n'+unexport(gateway)+'\n'+unexport(actor)+'\n'+unexport(ui)+'\nreturn {isMemberBookingPath,handleMemberBooking,MemberBookingCoordinator,renderMemberBooking,createMemberBookingUI,MEMBER_BOOKING_CSS};\n})();\nconst MemberBookingCoordinator = __memberBookingExtension.MemberBookingCoordinator;\n';
 replace('extension-export','export {\n',extension+'export {\n  MemberBookingCoordinator,\n');
 replace('gateway-dispatch','    const response3 = await worker.fetch(request, env, ctx);','    const response3 = __memberBookingExtension.isMemberBookingPath(request) ? await __memberBookingExtension.handleMemberBooking(request, env) : await worker.fetch(request, env, ctx);');
 replace('login-return-keys','["intent", "liff_intent", "campaign", "view", "lang"]','["intent", "liff_intent", "campaign", "view", "lang", "booking_model", "booking_scope"]');
 replace('login-return-selector','    // Browser-controlled world/audience hints are never identity or entitlement.','    bookingScope: url2.searchParams.get("booking_scope") === "private" ? "private" : "public",\n    bookingModel: /^rec[A-Za-z0-9]{14,24}$/.test(url2.searchParams.get("booking_model") || "") ? url2.searchParams.get("booking_model") : "",\n    // Browser-controlled world/audience hints are never identity or entitlement.');
 replace('booking-queued-guard','  function memberApiFetch(url, init = {}) {\n    const run = memberApiChain.then(async () => {\n','  function memberApiFetch(url, init = {}) {\n    const valid = arguments[2] || (() => true);\n    const run = memberApiChain.then(async () => {\n      if (!valid()) throw Object.assign(new Error("member_request_stale"), {code:"member_request_not_started"});\n');
 replace('booking-style','${MY_MMD_LIFF_LV15_CSS}\n</style>','${MY_MMD_LIFF_LV15_CSS}\n${__memberBookingExtension.MEMBER_BOOKING_CSS}\n</style>');
 replace('booking-jobs-view','    <section id="jobs" class="panel digital-view" aria-label="Jobs">','    <section id="jobs" class="panel digital-view" aria-label="Jobs">\n      ${__memberBookingExtension.renderMemberBooking()}');
 replace('booking-ui','  const personalMainUI =','  const memberBookingUI = (${__memberBookingExtension.createMemberBookingUI.toString()})(document.getElementById("member-booking"), memberApiFetch, () => profileReady ? currentMemberRef : "", CONFIG.bookingModel, CONFIG.bookingScope);\n  const personalMainUI =');
 replace('booking-leave','    const target = document.getElementById(targetId) || document.getElementById("home");','    const target = document.getElementById(targetId) || document.getElementById("home");\n    if (target.id !== "jobs") memberBookingUI.leave();');
 replace('booking-reader','    const readers = {','    const readers = {\n      jobs: () => memberBookingUI.load(),');
 replace('booking-clear','    accountUI.reset();','    memberBookingUI.reset();\n    accountUI.reset();');
 const bytes=Buffer.from(text);verifyPreservation(baseline,bytes,edits);
 return {bytes,edits,sha256:hash(bytes),activeHelpers:['readBoundedJsonObject','readMemberAppSession','resolveCanonicalClientForLine'].map(name=>{const pattern=new RegExp('^(?:async )?function '+name+'\\b','m');const start=baseline.toString().search(pattern);assert.ok(start>=0);const end=baseline.toString().indexOf('__name('+name+',',start);assert.ok(end>start);const part=baseline.toString().slice(start,end);assert.ok(text.includes(part),'active helper changed');return {name,sha256:hash(part)};})};
}
export function verifyPreservation(baseline,candidate,edits){let inverse=candidate.toString();for(const e of [...edits].reverse()){assert.equal(inverse.split(e.after).length,2,'inverse drift '+e.label);inverse=inverse.replace(e.after,()=>e.before);}assert.ok(Buffer.from(inverse).equals(baseline),'unrelated active bytes changed');return true;}
