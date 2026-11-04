// Session-scoped serialization and durable uncertainty; no timed lease or automatic replay.
const PREFIX = 'owner-model-payout-operations/v1/';
const privateHeaders = {'cache-control':'no-store, private'};
export async function payoutOperationHash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), n=>n.toString(16).padStart(2,'0')).join('');
}
async function read(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  const doc = JSON.parse(await object.text());
  if (!object.etag || doc?.version !== 1) throw Error('invalid journal');
  return {doc, etag:object.etag};
}
async function sessionEntry(bucket, sessionId) {
  const key = PREFIX+'sessions/'+await payoutOperationHash(sessionId)+'.json';
  const entry = await read(bucket,key);
  if (entry && (entry.doc.session_id!==sessionId || !['ready','busy'].includes(entry.doc.state) || !entry.doc.commands || typeof entry.doc.commands!=='object' || Array.isArray(entry.doc.commands))) throw Error('invalid session journal');
  return {key,entry};
}
export async function readPayoutOperation(bucket, sessionId) {
  if (!bucket) return {state:'unavailable',review_required:true};
  try {
    const {entry}=await sessionEntry(bucket,sessionId);
    return {state:entry?.doc.state || 'not_started',review_required:entry?.doc.state==='busy',phase:entry?.doc.pending?.phase || null};
  } catch { return {state:'unavailable',review_required:true}; }
}
export async function withPayoutOperation(bucket, sessionId, callerKey, identity, callback) {
  if (!bucket?.get || !bucket?.put) return Response.json({ok:false,error:'payout_journal_unavailable',retryable:false}, {status:503,headers:privateHeaders});
  let op, etag, key;
  try {
    const commandId=await payoutOperationHash(callerKey), commandKey=PREFIX+'commands/'+commandId+'.json';
    const reserved=await read(bucket,commandKey);
    if (reserved && reserved.doc.identity!==identity) return Response.json({ok:false,error:'idempotency_key_conflict'},{status:409,headers:privateHeaders});
    if (!reserved) {
      const saved=await bucket.put(commandKey,JSON.stringify({version:1,identity}),{onlyIf:{etagDoesNotMatch:'*'}});
      if (!saved?.etag) return Response.json({ok:false,error:'payout_operation_conflict'},{status:409,headers:privateHeaders});
    }
    const found=await sessionEntry(bucket,sessionId);key=found.key;
    if(found.entry?.doc.state==='busy') return Response.json({ok:false,error:'payout_operation_unresolved',retryable:false,review_required:true},{status:409,headers:privateHeaders});
    const doc=found.entry?structuredClone(found.entry.doc):{version:1,session_id:sessionId,state:'ready',commands:{}};
    const completed=doc.commands[commandId];
    if(completed && completed.identity!==identity) throw Error('invalid command identity');
    doc.state='busy';doc.pending={command_id:commandId,phase:'checking'};
    const claimed=await bucket.put(key,JSON.stringify(doc),{onlyIf:found.entry?{etagMatches:found.entry.etag}:{etagDoesNotMatch:'*'}});
    if(!claimed?.etag) return Response.json({ok:false,error:'payout_operation_conflict'},{status:409,headers:privateHeaders});
    etag=claimed.etag;
    op={doc,completed:Boolean(completed),sideEffectStarted:false,async stage(phase){
      const next={...structuredClone(op.doc),pending:{command_id:commandId,phase}};
      const saved=await bucket.put(key,JSON.stringify(next),{onlyIf:{etagMatches:etag}});
      if(!saved?.etag)throw Error('journal update unconfirmed');
      etag=saved.etag;op.doc=next;
      // Set before returning: a crash after this persisted intent stays quarantined.
      op.sideEffectStarted=true;
    }};
    const response=await callback(op);
    const body=await response.clone().json();
    if(op.sideEffectStarted && !response.ok) throw Error('upstream write unconfirmed');
    const next={...structuredClone(op.doc),state:'ready',pending:null};
    if(response.ok)next.commands[commandId]={identity};
    const saved=await bucket.put(key,JSON.stringify(next),{onlyIf:{etagMatches:etag}});
    if(!saved?.etag)throw Error('journal completion unconfirmed');
    return Response.json({...body, payout_write_state: response.ok ? "saved" : "not_attempted"},{status:response.status,headers:privateHeaders});
  }catch{
    if (op && !op.sideEffectStarted) {
      // A failed read before the first upstream write can safely release only our exact claim.
      try {
        const saved=await bucket.put(key,JSON.stringify({...op.doc,state:"ready",pending:null}),{onlyIf:{etagMatches:etag}});
        if(saved?.etag)return Response.json({ok:false,error:"payout_upstream_unavailable",payout_write_state:"not_attempted",retryable:true},{status:503,headers:privateHeaders});
      } catch {}
    }
    // Leave the persisted claim intact. Never delete ledger evidence, steal a lease,
    // or infer successful commit merely because a later total happens to match.
    return Response.json({ok:false,error:'payout_operation_unconfirmed',payout_write_state:op?.sideEffectStarted?"unknown":"not_attempted",retryable:false,review_required:true},{status:503,headers:privateHeaders});
  }
}
