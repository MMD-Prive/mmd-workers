import {readTravelSession, travelBinding} from './model-travel-store.mjs';
import {notificationDigest} from './payment-notification-outbox.mjs';
const unavailable = () => ({status:'unavailable', timeline:[], submissions:null, images:null, unique_images:null});
const denied = () => {throw Object.assign(new Error('co_model_scope_changed'), {status:403});};
// Only GETs. Do not reuse projectTravel: it expires reservations and deletes files.
export async function readCoModelEvidence(env, {role, sessionId, recordId, authorize}) {
  if (!['owner','partner'].includes(role) || typeof authorize!=='function') denied();
  await authorize();
  if (!env.PRIVATE_MODEL_MEDIA?.get) return unavailable();
  let result;
  try {
    const record=await readTravelSession(env,sessionId);
    if(record.id!==recordId) throw Error('identity_mismatch');
    const binding=await travelBinding(record), bucket=env.PRIVATE_MODEL_MEDIA;
    const root='job-travel/v1/'+await notificationDigest(sessionId)+'/';
    const read=async key=>{const obj=await bucket.get(key);if(!obj)return null;if(!Number.isFinite(obj.size)||obj.size>256000)throw Error('invalid_object');return JSON.parse(await obj.text());};
    const ledger=await read(root+'ledger.json');
    if(!ledger) result={...unavailable(),status:'not_recorded'};
    else {
      if(ledger.version!==1||!Number.isSafeInteger(ledger.revision)||!ledger.entries||Array.isArray(ledger.entries)||typeof ledger.entries!=='object'||Object.keys(ledger.entries).length>64)throw Error('invalid_ledger');
      const timeline=[], hashes=new Set();let images=0;
      for(const [id,e] of Object.entries(ledger.entries)) {
        if(!e||e.state!=='saved'||e.binding!==binding)continue;
        const sender=e.sender_role||'model';
        // Partner receives model submission metadata, never customer conversation or media.
        if(role==='partner'&&sender!=='model')continue;
        if(!['model','customer'].includes(sender)||!/^[a-f0-9]{64}$/.test(id)||e.id!==id||!Number.isFinite(Date.parse(e.saved_at))||!Array.isArray(e.photos)||e.photos.length>10)throw Error('invalid_entry');
        if(sender==='model'&&(e.sender_id||e.model_id)!==record.fields['Canonical Model'][0])throw Error('sender_mismatch');
        if(sender==='customer'&&e.sender_id!=='customer:'+binding)throw Error('sender_mismatch');
        for(const photo of e.photos){if(!/^[a-f0-9]{64}$/.test(photo.sha256)||photo.type!=='image/jpeg')throw Error('invalid_photo');hashes.add(photo.sha256);}
        images+=e.photos.length;
        let notice='unavailable';
        try {
          const nid=await notificationDigest('model-travel:'+sessionId+':'+binding+':'+id);
          const prefix='payment-notifications/v1/model-travel/';
          const receipt=await read(prefix+'receipts/'+nid+'.json')||await read(prefix+'records/'+nid+'.json');
          if(!receipt)notice='not_recorded';
          else if(receipt.id===nid&&receipt.schema==='payment_notification_v1'&&receipt.payload?.session_id===sessionId&&receipt.payload?.binding===binding&&receipt.payload?.kind==='submission')
            notice=receipt.status==='delivered'?'provider_accepted':['pending','manual_review'].includes(receipt.status)?receipt.status:'unknown';
        } catch { /* unknown delivery is never a retry authorization */ }
        timeline.push({id,source:'MY MMD',sender_role:sender,saved_at:e.saved_at,has_text:typeof e.text==='string'&&e.text.length>0,images:e.photos.length,line_notice:notice});
      }
      timeline.sort((a,b)=>Date.parse(a.saved_at)-Date.parse(b.saved_at)||a.id.localeCompare(b.id));
      result={status:'available',scope:role==='partner'?'model_metadata_only':'submission_metadata_only',revision:ledger.revision,timeline,submissions:timeline.length,images,unique_images:hashes.size};
    }
    const fresh=await readTravelSession(env,sessionId);
    if(fresh.id!==recordId||await travelBinding(fresh)!==binding)throw Error('binding_changed');
  } catch { result=unavailable(); }
  await authorize();
  return result;
}
