import assert from "node:assert/strict";
import {createHash} from "node:crypto";
export function buildCandidate(baseline, source, pin) {
const hash=b=>createHash("sha256").update(b).digest("hex");
assert.equal(hash(baseline),pin.baselineHash);
let out=baseline.toString("utf8");
assert(Buffer.from(out).equals(baseline));
const edits=[];
function edit(from,to) {
  assert.equal(out.split(from).length,2,"baseline anchor is not unique: "+from.slice(0,100));
  out=out.replace(from,()=>to); edits.push({from,to});
}
const helpers=source("kenji-line-intake-receipt.mjs").replace(/^export /gm,"");
const index=source("index.js");
const lookup=index.match(/^export async function findConfirmedOperationalIntake[\s\S]*?^}/m)[0].replace(/^export /,"");
edit("async function getLineOwnerTakeoverState(",helpers+"\n"+lookup+"\nasync function getLineOwnerTakeoverState(");
edit('if (existing?.id) return { id: existing.id, deduped: true };','if (existing?.id) return { id: existing.id, deduped: true, inbox_id: existing.fields?.inbox_id };');
edit('  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table2)}`, {\n    method: "POST",\n    headers: {\n      authorization: `Bearer ${apiKey}`,\n      "content-type": "application/json"\n    },\n    body: JSON.stringify(buildConsoleInboxRecord(event, profile, intent, metadata)),','  const record = buildConsoleInboxRecord(event, profile, intent, metadata);\n  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table2)}`, {\n    method: "POST",\n    headers: {\n      authorization: `Bearer ${apiKey}`,\n      "content-type": "application/json"\n    },\n    body: JSON.stringify(record),');
edit('return { id: payload?.id || "", deduped: false };','return { id: payload?.id || "", deduped: false, inbox_id: payload?.id ? record.fields.inbox_id : undefined };');
edit('async function syncLineEventAfterReply(env, event, intent, autoReplyEnabled, kenjiEnabled, metadata = null) {',index.match(/^function syncLineEventAfterReply[\s\S]*?^async function persistLineIntake[^\n]*/m)[0]);
edit('async function writeKenjiAiMessageEvent({ env = {}, event = {}, decision = {}, delivered = false, attempted = false, deliveryStatus = null } = {})','async function writeKenjiAiMessageEvent({ env = {}, event = {}, decision = {}, delivered = false, attempted = false, deliveryStatus = null, intakeReceipts = new Map() } = {})');
edit('const sourceEventId = eventIdOf2(event);','const inboxId = await confirmedKenjiInboxId(intakeReceipts, event);');
edit('linked_console_inbox_id: `line_${sourceEventId}`.slice(0, 160),','...(inboxId ? { linked_console_inbox_id: inboxId } : {}),');
edit('async function runLegacyShadow(request, env, ctx, legacyWorker, rawBody, events = [])','async function runLegacyShadow(request, env, ctx, legacyWorker, rawBody, events, intakeReceipts)');
edit('[CHECKPTS_INTAKE]: true };','[CHECKPTS_INTAKE]: true, [KENJI_LINE_INTAKE_RECEIPTS]: intakeReceipts };');
edit('const legacyOutcome = await runLegacyShadow(request, env, ctx, legacyWorker, rawBody, events);','const intakeReceipts = new Map();\n  const legacyOutcome = await runLegacyShadow(request, env, ctx, legacyWorker, rawBody, events, intakeReceipts);');
edit('await writeKenjiAiMessageEvent({ env, event, ...turn }).catch(() => null);','const telemetry = writeKenjiAiMessageEvent({ env, event, ...turn, intakeReceipts }).catch(() => null);\n      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(telemetry);\n      else await telemetry;');
edit('deliveryStatus: replyResult?.status ?? null','deliveryStatus: replyResult?.status ?? null, intakeReceipts');
edit('  return writeKenjiAiMessageEvent({\n    env,\n    event: operational.event,','  const key = kenjiIntakeEventKey(operational.event);\n  const intakeReceipts = new Map(key ? [[key, findConfirmedOperationalIntake(env, operational.event)]] : []);\n  return writeKenjiAiMessageEvent({\n    env,\n    event: operational.event,');
edit('deliveryStatus: operational.delivery_status','deliveryStatus: operational.delivery_status, intakeReceipts');
let restored=out;
for(const {from,to} of edits.toReversed()){
  assert.equal(restored.split(to).length,2);
  restored=restored.replace(to,()=>from);
}
assert(Buffer.from(restored).equals(baseline));
const bytes=Buffer.from(out);
assert.equal(hash(bytes),pin.candidateHash);
return bytes;
}
