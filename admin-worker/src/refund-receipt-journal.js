const keyFor = id => `owner-refund-operations/v1/${encodeURIComponent(id)}/state.json`;
const clone = value => structuredClone(value);
class ReceiptError extends Error {
  constructor(code,status=503){super(code);this.code=code;this.status=status;}
}
export async function refundReceiptIdentity(values){
  const bytes=values instanceof ArrayBuffer ? values : new TextEncoder().encode(JSON.stringify(values));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
async function read(bucket,id){
  const object=await bucket.get(keyFor(id));
  if(!object)return null;
  let doc;try{doc=JSON.parse(await object.text());}catch{throw new ReceiptError('refund_receipt_journal_invalid');}
  if(doc?.version!==1||doc.inbox_id!==id||!['ready','busy'].includes(doc.state)||!['saved','unknown','writing','not_attempted'].includes(doc.record_state)||!['line','telegram'].every(c=>['pending','sending','sent','skipped','failed','unknown'].includes(doc.channels?.[c]?.state)&&(doc.channels[c].state!=='sent'||doc.channels[c].result?.ok===true))||typeof doc.identity!=='string'||!object.etag)throw new ReceiptError('refund_receipt_journal_invalid');
  return {doc,etag:object.etag};
}
function legacyChannel(payload,channel,legacy){
  const status=payload[channel==='line'?'customer_receipt_delivery_status':'owner_telegram_delivery_status'];
  if(status==='sent')return {state:'sent',result:{ok:true,skipped:true,reason:'already_sent',mode:payload.customer_receipt_delivery_mode||null,message_id:payload.owner_telegram_message_id||null}};
  if(!legacy||status==='skipped')return {state:'pending'};
  // Legacy failure/missing flags do not prove whether a prior send committed.
  return {state:'unknown',result:{ok:false,unknown:true,skipped:false,reason:'legacy_delivery_outcome_unproven'}};
}
export async function withRefundReceiptOperation(bucket,id,identity,payload,legacy,callback){
  let op;
  try{
    const existing=await read(bucket,id);
    if(existing&&identity&&existing.doc.identity!==identity)throw new ReceiptError('refund_receipt_identity_conflict',409);
    if(existing&&existing.doc.state!=='ready')throw new ReceiptError('refund_receipt_operation_unresolved');
    if(existing?.doc.result&&existing.doc.record_state==='saved'&&['line','telegram'].every(c=>existing.doc.channels[c]?.state==='sent')){
      return Response.json({...existing.doc.result,deduped:true},{headers:{'Cache-Control':'no-store, private'}});
    }
    const doc=existing?clone(existing.doc):{version:1,inbox_id:id,identity:identity||'legacy',record_state:legacy?'saved':'not_attempted',channels:{line:legacyChannel(payload,'line',legacy),telegram:legacyChannel(payload,'telegram',legacy)}};
    doc.state='busy';doc.owner=crypto.randomUUID();
    const claimed=await bucket.put(keyFor(id),JSON.stringify(doc),{onlyIf:existing?{etagMatches:existing.etag}:{etagDoesNotMatch:'*'},customMetadata:{schema:'mmd_refund_operation_v1'}});
    if(!claimed?.etag)throw new ReceiptError('refund_receipt_operation_conflict',409);
    let etag=claimed.etag;
    op={doc,async update(change){
      const next={...clone(op.doc),...change};
      const saved=await bucket.put(keyFor(id),JSON.stringify(next),{onlyIf:{etagMatches:etag},customMetadata:{schema:'mmd_refund_operation_v1'}});
      if(!saved?.etag)throw new ReceiptError('refund_receipt_journal_write_unconfirmed');
      etag=saved.etag;op.doc=next;
    },async send(channel,send){
      const previous=op.doc.channels[channel];
      if(previous.state==='sent')return {...previous.result,ok:true,skipped:true,reason:'already_sent'};
      if(previous.state==='unknown'||previous.state==='sending')return {ok:false,unknown:true,skipped:false,reason:'delivery_outcome_unknown'};
      await op.update({channels:{...op.doc.channels,[channel]:{state:'sending'}}});
      let result;try{result=await send();}catch{result={ok:false,unknown:true,skipped:false,reason:'delivery_outcome_unknown'};}
      const rejected=!result.ok&&!result.skipped&&Number(result.status)>=400&&Number(result.status)<500&&Number(result.status)!==408;
      const state=result.unknown?'unknown':result.ok?'sent':result.skipped?'skipped':rejected&&!result.unknown?'failed':'unknown';
      if(state==='unknown')result={...result,ok:false,unknown:true,reason:'delivery_outcome_unknown'};
      await op.update({channels:{...op.doc.channels,[channel]:{state,result}}});
      return result;
    }};
    const response=await callback(op);
    const result=await response.clone().json();
    Object.assign(result,{receipt_storage_state:op.doc.receipt?.state||'not_proven',receipt_record_state:op.doc.record_state,
      review_required:Object.values(op.doc.channels).some(c=>['unknown','sending'].includes(c.state))});
    await op.update({state:'ready',result});
    return Response.json(result,{status:response.status,headers:response.headers});
  }catch(error){
    // Never release a possibly live writer or replay an unknown upstream effect.
    if(op){
      const change={blocked_reason:error?.code||'refund_receipt_save_unconfirmed'};
      if(op.doc.record_state==='writing')change.record_state='unknown';
      if(op.doc.receipt?.state==='writing')change.receipt={...op.doc.receipt,state:'unknown'};
      await op.update(change).catch(()=>{});
    }
    return Response.json({ok:false,error:error instanceof ReceiptError?error.code:'refund_receipt_save_unconfirmed',receipt_storage_state:op?.doc.receipt?.state||'unknown',receipt_record_state:op?.doc.record_state||'unknown',retryable:false,review_required:true},{status:error instanceof ReceiptError?error.status:503,headers:{'Cache-Control':'no-store, private'}});
  }
}
export async function decorateRefundReceiptItem(bucket,item){
  if(!bucket)return {...item,receipt_operation_state:'unavailable'};
  const entry=await read(bucket,item.inbox_id);
  if(!entry)return item;
  const d=entry.doc;
  return {...item,receipt_operation_state:d.state,receipt_storage_state:d.receipt?.state||'not_proven',receipt_record_state:d.record_state,
    customer_receipt_delivery_status:d.channels.line?.state||item.customer_receipt_delivery_status,
    owner_telegram_delivery_status:d.channels.telegram?.state||item.owner_telegram_delivery_status,
    receipt_review_required:d.state!=='ready'||Object.values(d.channels).some(c=>['unknown','sending'].includes(c.state))};
}
