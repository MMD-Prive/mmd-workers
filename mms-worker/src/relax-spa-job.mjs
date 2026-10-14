// Dedicated quote producer: never invokes the general MMS 70/30 pricing path.
const fail = code => { throw Object.assign(new Error(code), { status: 409, code }); };
export async function spaJobId(serviceId) {
  if (!/^spasvc_[a-f0-9]{32}$/.test(serviceId || '')) fail('SERVICE_ID_INVALID');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('relax-spa:v3:'+serviceId));
  return 'mmsjob_'+Array.from(new Uint8Array(bytes), n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
}
export async function produceSpaJob(env, service) {
  const a=service.agreement, plan=service.quote_preview, c=service.job_creation;
  if (a?.schema_version !== 3 || !c || !plan) fail('CONFIRMED_QUOTE_REQUIRED');
  const table = key => {
    const v=env['AIRTABLE_'+key+'_TABLE_ID'];
    if (!/^tbl[A-Za-z0-9]{14}$/.test(v || '')) fail('CANONICAL_STORE_UNAVAILABLE');
    return v;
  };
  if (!/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || '') || !env.AIRTABLE_API_TOKEN) fail('CANONICAL_STORE_UNAVAILABLE');
  if (!env.MMS_DISPATCH_COORDINATOR?.get || !env.MMS_DISPATCH_COORDINATOR?.idFromName) fail('DISPATCH_NOT_CONFIGURED');
  async function api(tableId, query='', init={}) {
    const r=await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}${query}`, {
      ...init, headers:{authorization:'Bearer '+env.AIRTABLE_API_TOKEN,'content-type':'application/json'},signal:AbortSignal.timeout(10000),
    });
    const p=await r.json();
    if (!r.ok) fail('CANONICAL_WRITE_UNCONFIRMED');
    return p;
  }
  async function lookup(tableId, field, value) {
    const q=new URLSearchParams({maxRecords:'2',filterByFormula:`{${field}}='${value}'`});
    const p=await api(tableId,'?'+q);
    if (!Array.isArray(p.records) || p.records.length>1) fail('CANONICAL_RECORD_UNRESOLVED');
    return p.records[0] || null;
  }
  async function upsert(tableId, field, fields) {
    const p=await api(tableId,'',{method:'PATCH',body:JSON.stringify({performUpsert:{fieldsToMergeOn:[field]},records:[{fields}],typecast:false})});
    if (!Array.isArray(p.records) || p.records.length!==1) fail('CANONICAL_WRITE_UNCONFIRMED');
    return p.records[0];
  }
  const therapist=await lookup(table('THERAPISTS'),'Therapist ID',a.therapist_id);
  if (therapist?.fields?.Status!=='Active' || therapist.fields['MY MMS Access']!=='Approved') fail('THERAPIST_NOT_ACTIVE');
  const quote={ service_id:service.id, agreement:a, preview:plan, venue_id:a.spa_id, travel_included_confirmed:true };
  const now=new Date().toISOString(), offerId='mmsoffer_'+c.job_id.slice(7);
  const note=`ค่าตัวรวมเดินทาง ${(a.therapist_amount/100).toFixed(2)} บาท · รายการหักที่ตกลง ${((a.therapist_amount-plan.shares.therapist)/100).toFixed(2)} บาท · รับสุทธิ ${(plan.shares.therapist/100).toFixed(2)} บาท`;
  const fields={ 'Job ID':c.job_id, Service:'Relax Spa by 9 · '+a.room.type, 'Duration Minutes':a.duration_minutes,
    'Service Start At':c.service_start_at, 'Safe Area Label':'Relax Spa by 9', 'Travel Label':'รวมเดินทางไปกลับในค่าตัวแล้ว',
    'Therapist Payout THB':plan.shares.therapist/100, 'Payout Note':note, 'Job Status':'Offered',
    'Internal Payload JSON':JSON.stringify({spa_quote:quote}), Version:1,'Created At':now,'Updated At':now };
  const existing=await lookup(table('JOBS'),'Job ID',c.job_id);
  if (existing) {
    let stored;try{stored=JSON.parse(existing.fields?.['Internal Payload JSON'] || '{}').spa_quote;}catch{fail('JOB_SNAPSHOT_MISMATCH');}
    if (JSON.stringify(stored)!==JSON.stringify(quote) || existing.fields['Duration Minutes']!==a.duration_minutes || existing.fields['Therapist Payout THB']!==plan.shares.therapist/100) fail('JOB_SNAPSHOT_MISMATCH');
    if (['Cancelled','Expired'].includes(existing.fields['Job Status'])) fail('CANONICAL_JOB_MISMATCH');
  } else await upsert(table('JOBS'),'Job ID',fields);
  // Offers expose only the agreed Therapist amount and approved deductions.
  const expires=Date.parse(c.service_start_at)+a.duration_minutes*60000;
  const oldOffer=await lookup(table('OFFERS'),'Offer ID',offerId);
  if (oldOffer) {
    if (oldOffer.fields['Job ID']!==c.job_id || oldOffer.fields['Therapist ID']!==a.therapist_id || oldOffer.fields['Payout THB']!==plan.shares.therapist/100) fail('JOB_SNAPSHOT_MISMATCH');
  } else await upsert(table('OFFERS'),'Offer ID',{
    'Offer ID':offerId,'Job ID':c.job_id,'Therapist ID':a.therapist_id,'Offer Status':'Offered','Offered At':now,
    'Expires At':new Date(expires).toISOString(),'Match Rank':1,'Payout THB':plan.shares.therapist/100,
    'Safe Area Label':'Relax Spa by 9','Travel Label':'รวมเดินทางไปกลับในค่าตัวแล้ว',
    'Safe Payload JSON':JSON.stringify({job_id:c.job_id,service_label:fields.Service,duration_minutes:a.duration_minutes,service_start_at:c.service_start_at,area_label:'Relax Spa by 9',travel_label:fields['Travel Label'],payout_thb:plan.shares.therapist/100,payout_note:note,expires_at:new Date(expires).toISOString()}),
    Version:1,'Created At':now,'Updated At':now,
  });
  const stub=env.MMS_DISPATCH_COORDINATOR.get(env.MMS_DISPATCH_COORDINATOR.idFromName(c.job_id));
  const initialized=await stub.initialize(c.job_id,[{therapist_id:a.therapist_id,offer_id:offerId,expires_at:expires}],Date.now());
  if (!initialized?.job || initialized.job.job_id!==c.job_id || !['OFFERED','ACCEPTED','IN_PROGRESS','COMPLETED'].includes(initialized.job.state)) fail('DISPATCH_INITIALIZATION_UNCONFIRMED');
  return {job_id:c.job_id};
}
