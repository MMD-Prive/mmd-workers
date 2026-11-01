import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { renderOwnerJobEdit } from './owner-job-edit-page.js';

export const EDIT_PAGE = '/internal/admin/jobs/edit';
export const EDIT_API = '/v1/admin/jobs/edit';
export const S = Object.freeze({id:'fldLTq2kZbyRv22IA', model:'fldrXQAyOMPCvbOaY', name:'flddVz6eoWRHrzIQr', assigned:'fldJNvoNRc3s5IgiV', client:'fldMvnQ0BzDfHUYjT', date:'fldpnqoIsUMfN7y3c', start:'fldBeG0FkWwa8kgnp', end:'fldiDSz0wW9Ct9I3P', location:'fldIiRpaxoafjTkFt', map:'fldoUDQ8sH93idPx0', amount:'fldhwC79ndbnEXSZz', payout:'fldlTO5aNfqUmlNWm', deposit:'fldooTlKtkY8VJy7L', received:'fldAdtXEaedGdfOKc', due:'fldvJowquu8RrsOMc', travel:'fld703jI4zQ0CYMHh', modelTravel:'fldqYkGm9Vd3P366W', note:'fldEcDkF7CH9VixWM', notes:'fldwl9Gs5tYlXG5ls', status:'fldmwuvOaiCFdzzRa', state:'fld57fhdWqIcOy4Jp', stateAt:'fldFJI1Leni6wvzR4', ack:'fldFgkHXivIAThfDz', ackIp:'fldSte6x9NnNJyF5s', customerAck:'fldJSS5GNN7quJwa8', customerAckIp:'fldTzhupkA2laZDkF', ready:'fldEBdh1jmSPsj3zd', reconfirmAck:'fldMtFsIZicREiCzG', reconfirm:'fldIvBZDv6541YZR8', source:'fldxyZ7S3tjF8chGR', partner:'fld0jkscGAtyX7i2J', locked:'fldYgTgfGDpFQsKvZ'});
export const J = Object.freeze({id:'fldTR8yO6xv40HjOX', model:'fldscPK15ejBw0BAH', name:'fldA0qyACFQA2AqhB', amount:'fldSspHLxJPQOg7wA', note:'fldAvaj1azv3lAavo', location:'fldXxOmiDiefa2Sdk', travel:'fld4IeVVICmQBv5Kr', modelTravel:'fldv4s9r1hHH2Ohse'});
const M = {name:'fldShiT60bmCxFxRu', nickname:'fld0maFkh4NHpsPxA', status:'fldRcAE3bL8dKmURH', folder:'fldcWVb2LDRxrQDmT'};
const tables={sessions:'tblC98mKWbzmPuNzX', jobs:'tbl0jxIjN8QYwGABX', models:'tblI4B0bI446vp9GX'};
const origins=new Set(['https://mmdbkk.com','https://www.mmdbkk.com']);
export const name = v => String(v?.name ?? v ?? '').trim();
const fail=(code,status=409)=>{throw Object.assign(Error(code),{status});};
export const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store, private','referrer-policy':'no-referrer'}});
export function isOwnerJobEditRequest(path){return path===EDIT_PAGE || path===EDIT_API || path===EDIT_API+'/models';}
export const validSession = id => /^sess_[A-Za-z0-9_-]{1,180}$/.test(id || '');
const literal=value=>JSON.stringify(String(value));
const recordId=id=>/^rec[A-Za-z0-9]{14}$/.test(id||'');
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10000000&&Math.abs(v*100-Math.round(v*100))<1e-6;
const round=v=>Math.round(v*100)/100;
export function marker(note,label){const line=String(note||'').split('\n').find(l=>l.trimStart().startsWith('['+label+']'));if(!line)return null;try{return JSON.parse(line.slice(line.indexOf(']')+1).trim());}catch{fail('pricing_review_required');}}
export async function at(env,table,{id='',formula='',fields=[],patch,complete=false}={}){
  if(!env.AIRTABLE_API_KEY||!env.AIRTABLE_BASE_ID)fail('edit_unavailable',503);
  const q=new URLSearchParams({returnFieldsByFieldId:'true'});
  if(formula){q.set('filterByFormula',formula);if(!complete)q.set('maxRecords','30');else q.set('pageSize','100');}
  if(!patch)for(const f of fields)q.append('fields[]',f);
  const records=[],seen=new Set();
  for(let page=0;page<50;page++){
  const url=`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tables[table]}${id?'/'+id:''}?${q}`;
  const request=new Request(url,{method:patch?'PATCH':'GET',headers:{authorization:`Bearer ${env.AIRTABLE_API_KEY}`,'content-type':'application/json'},...(patch?{body:JSON.stringify({fields:patch})}:{})});
  const response=await (env.AIRTABLE_HTTP?.fetch?env.AIRTABLE_HTTP.fetch(request):fetch(request));
  if(!response.ok)fail('edit_storage_unavailable',503);
  const data=await response.json();
  if(!complete||patch||id)return data;
  if(!Array.isArray(data.records))fail('edit_storage_unavailable',503);
  records.push(...data.records);
  if(!data.offset)return {records};
  if(typeof data.offset!=='string'||seen.has(data.offset))fail('edit_list_incomplete',503);
  seen.add(data.offset);q.set('offset',data.offset);
  }
  fail('edit_list_incomplete',503);
}
export async function loadJob(env,id){
  if(!validSession(id))fail('invalid_session',400);
  const [ss,jj]=await Promise.all([at(env,'sessions',{formula:`{${S.id}}="${id}"`,fields:Object.values(S)}),at(env,'jobs',{formula:`{${J.id}}="${id}"`,fields:Object.values(J)})]);
  if(ss.records?.length!==1||jj.records?.length!==1)fail('job_not_unique',404);
  return {session:ss.records[0],job:jj.records[0]};
}
export async function revision(data){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data, function(k,v){return v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v;})));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function assertEditable(data){
  const f=data.session.fields;
  if(/cancel|void|refund|complet|closed/i.test(name(f[S.status])) || (f[S.state]&&!['offered','confirmed','offer_declined','offer_expired'].includes(name(f[S.state]))))fail('job_already_started');
  if(f[S.source]){let src;try{src=JSON.parse(f[S.source]);}catch{fail('pricing_review_required');}if(src.partner_record_id||src.source_kind==='partner')fail('partner_settlement_review_required');}
  if(f[S.partner]||f[S.locked]||marker(f[S.note]||f[S.notes],'SIGIL Partner Snapshot v1'))fail('partner_settlement_review_required');
  const note=f[S.note]||f[S.notes]||'';
  // These jobs carry additional immutable financial components owned by separate workflows.
  if(/\[MMD_MEMBERSHIP_ACTION_V1\]|\[MMD MEMBERSHIP|\[SIGIL Membership/i.test(note))fail('pricing_review_required');
  const p=marker(note,'MMD SERVICE PRICING v1');
  if(!p||p.discount||!money(p.model_base_payout_thb)||!Array.isArray(p.addons)||!money(p.client_total_amount_thb)||!money(p.model_total_payout_thb)||round(p.client_total_amount_thb+Number(f[S.travel]||0))!==f[S.amount]||p.model_total_payout_thb!==f[S.payout])fail('pricing_review_required');
  const oldSummary=marker(note,'SIGIL Pricing v1');if(oldSummary?.discount_thb>0)fail('pricing_review_required');
  return p;
}
export function projectJob(data){
  const f=data.session.fields; let blocked=null,p=null;
  try{p=assertEditable(data);}catch(e){blocked=e.message;}
  const paid=Math.max(Number(f[S.deposit]||0),Number(f[S.received]||0));
  return {session_id:f[S.id],client:name(f[S.client]),model_id:f[S.model]?.[0]||'',model_name:name(f[S.name]),date:f[S.date],time:[f[S.start],f[S.end]],location:name(f[S.location]),amount:f[S.amount],payout:f[S.payout],paid,travel:f[S.travel]||0,model_travel:f[S.modelTravel]||0,pricing:p,blocked};
}
export function buildEdit(data,body,model,actor,now=new Date().toISOString()){
  const old=assertEditable(data),f=data.session.fields;
  const allowed=['session_id','revision','request_id','reason','model_id','client_base','model_base','addons','travel','model_travel'];
  if(!body||Object.keys(body).some(k=>!allowed.includes(k))||!recordId(body.model_id)||!/^[-\w]{16,80}$/.test(body.request_id||'')||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>300)fail('invalid_edit',400);
  const target=name(model.fields[M.name]||model.fields[M.nickname]);
  if(model.id!==body.model_id||!target||/review|archive|media|deleted/i.test(target)||/inactive|reject|block|deleted/i.test(name(model.fields[M.status])))fail('model_unavailable',400);
  if(![body.client_base,body.model_base,body.travel,body.model_travel].every(money)||body.client_base<=0||body.model_base<=0||!Array.isArray(body.addons)||body.addons.length>4)fail('invalid_amount',400);
  const options=new Set();
  for(const a of body.addons){if(!a||Object.keys(a).some(k=>!['option','client_amount_thb','model_payout_thb'].includes(k))||!['mk','burn','live','group'].includes(a.option)||options.has(a.option)||!money(a.client_amount_thb)||!money(a.model_payout_thb))fail('invalid_amount',400);options.add(a.option);}
  const service=round(body.client_base+body.addons.reduce((s,a)=>s+a.client_amount_thb,0));
  const amount=round(service+body.travel),payout=round(body.model_base+body.addons.reduce((s,a)=>s+a.model_payout_thb,0)+body.model_travel);
  const paid=Math.max(Number(f[S.deposit]||0),Number(f[S.received]||0));
  if(!Number.isFinite(paid)||paid<0||amount<paid||payout>amount)fail('settlement_review_required');
  const pricing={...old,client_base_amount_thb:body.client_base,model_base_payout_thb:body.model_base,addons:body.addons,client_total_amount_thb:service,model_total_payout_thb:payout,travel_fee_thb:body.travel,model_travel_fee_thb:body.model_travel};
  const sigil={...(marker(f[S.note]||f[S.notes],'SIGIL Pricing v1')||{}),full_price_thb:amount,net_price_thb:amount,balance_thb:round(amount-paid),deposit_received_thb:paid,deposit_percent:round(paid/amount*100),deposit_basis_thb:amount,deposit_minimum_percent:30,deposit_minimum_thb:Math.ceil(amount*.3),deposit_below_minimum:paid<Math.ceil(amount*.3),deposit_shortfall_thb:Math.max(0,round(Math.ceil(amount*.3)-paid))};
  const changedModel=f[S.model]?.[0]!==body.model_id;
  // Preserve the complete original notes in the durable audit. Replace only machine pricing markers;
  // operational remarks and model-only marker blocks remain intact.
  function note(source){return '[MMD SERVICE PRICING v1] '+JSON.stringify(pricing)+'\n[SIGIL Pricing v1] '+JSON.stringify(sigil)+'\n'+String(source||'').split('\n').filter(l=>!/^\s*\[(MMD SERVICE PRICING v1|SIGIL Pricing v1|MMD MODEL PAYOUT BREAKDOWN v1)\]/.test(l)).join('\n')+'\n[MMD JOB EDIT v1] '+JSON.stringify({request_id:body.request_id,at:now,by:actor.id,reason:body.reason.trim(),model_name:target,customer_total_thb:amount,model_total_thb:payout,received_unchanged_thb:paid});}
  const sessionPatch={[S.model]:[body.model_id],[S.name]:target,[S.assigned]:target,[S.amount]:amount,[S.payout]:payout,[S.due]:round(amount-paid),[S.travel]:body.travel,[S.modelTravel]:body.model_travel,[S.note]:note(f[S.note]),[S.notes]:note(f[S.notes]),[S.ack]:null,[S.ackIp]:'',[S.customerAck]:null,[S.customerAckIp]:'',[S.reconfirmAck]:null,[S.ready]:false};
  if(f[S.state]){sessionPatch[S.state]='offered';sessionPatch[S.stateAt]=now;}
  if(f[S.reconfirm])sessionPatch[S.reconfirm]='pending';
  if(changedModel&&f[S.source]){let src;try{src=JSON.parse(f[S.source]);}catch{fail('pricing_review_required');}if(src.partner_record_id||src.source_kind==='partner')fail('partner_settlement_review_required');sessionPatch[S.source]=JSON.stringify({...src,model_record_id:body.model_id,selected_at:now});}
  const jobPatch={[J.model]:[body.model_id],[J.name]:target,[J.amount]:amount,[J.travel]:body.travel,[J.modelTravel]:body.model_travel,[J.note]:note(data.job.fields[J.note])};
  if(Object.values(sessionPatch).some(v=>typeof v==='string'&&v.length>7000))fail('audit_capacity_reached');
  return {sessionPatch,jobPatch,pricing,amount,payout,paid,remaining:round(amount-paid),changedModel};
}
export async function handleOwnerJobEdit(request,env){
  const u=new URL(request.url),path=u.pathname;
  const actor=await readCredentialBoundAdminActor(request,env);
  if(!actor)return path===EDIT_PAGE?Response.redirect(new URL('/internal/admin/login?next='+encodeURIComponent(u.pathname+u.search),u),302):reply({ok:false,error:'unauthorized'},401);
  if(!['owner','admin'].includes(actor.role)||!origins.has(u.origin))return reply({ok:false,error:'forbidden'},403);
  try{
    if(path===EDIT_PAGE&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:renderOwnerJobEdit(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
    if(path===EDIT_API+'/models'&&request.method==='GET'){
      const q=(u.searchParams.get('q')||'').trim();if(q.length<2||q.length>60)return reply({ok:true,models:[]});
      const result=await at(env,'models',{formula:`OR(FIND(LOWER(${literal(q)}),LOWER({${M.name}})),FIND(LOWER(${literal(q)}),LOWER({${M.nickname}})))`,fields:Object.values(M)});
      const models=(result.records||[]).filter(r=>!/(review|archive|media|deleted)/i.test(name(r.fields[M.name]))&&!/inactive|reject|block|deleted/i.test(name(r.fields[M.status]))).map(r=>({id:r.id,name:name(r.fields[M.name]||r.fields[M.nickname])}));
      models.sort((a,b)=>Number(b.name.toLowerCase()===q.toLowerCase())-Number(a.name.toLowerCase()===q.toLowerCase())||a.name.localeCompare(b.name));
      return reply({ok:true,models});
    }
    if(path!==EDIT_API||!['GET','POST'].includes(request.method))return reply({ok:false,error:'method_not_allowed'},405);
    if(request.method==='GET'){
      if(u.searchParams.get('list')==='1'){
        const q=(u.searchParams.get('q')||'').trim().slice(0,60);
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
        const found=await at(env,'sessions',{complete:true,formula:`AND({${S.date}}>='${today}',${q?`FIND(LOWER(${literal(q)}),LOWER({${S.client}}&" "&{${S.name}}))`:'TRUE()'})`,fields:[S.id,S.client,S.name,S.date,S.amount,S.location]});
        return reply({ok:true,jobs:(found.records||[]).map(r=>({session_id:r.fields[S.id],client:r.fields[S.client],model:r.fields[S.name],date:r.fields[S.date],amount:r.fields[S.amount]})).filter(r=>validSession(r.session_id)).sort((a,b)=>String(a.date).localeCompare(String(b.date)))});
      }
      const id=u.searchParams.get('session_id');
      if(u.searchParams.get('history')==='1'){
        if(!validSession(id)||!env.JOB_EDIT_COORDINATOR?.getByName)fail('edit_unavailable',503);
        return env.JOB_EDIT_COORDINATOR.getByName(id).fetch(new Request('https://job-edit.internal/history'));
      }
      const data=await loadJob(env,id);
      return reply({ok:true,job:projectJob(data),revision:await revision(data)});
    }
    if(request.headers.get('origin')!==u.origin)return reply({ok:false,error:'forbidden_origin'},403);
    if(Number(request.headers.get('content-length')||0)>12000)return reply({ok:false,error:'invalid_edit'},400);
    const raw=await request.text();if(raw.length>12000)fail('invalid_edit',400);
    let body;try{body=JSON.parse(raw);}catch{fail('invalid_edit',400);}
    if(!validSession(body?.session_id)||!recordId(body?.model_id)||!/^[-\w]{16,80}$/.test(body?.request_id||'')||!env.JOB_EDIT_COORDINATOR?.getByName)fail('edit_unavailable',503);
    return env.JOB_EDIT_COORDINATOR.getByName(body.session_id).fetch(new Request('https://job-edit.internal/edit',{method:'POST',body:JSON.stringify({body,actor:{id:actor.id,role:actor.role}})}));
  }catch(e){return reply({ok:false,error:e.status?e.message:'edit_unavailable'},e.status||503);}
}
