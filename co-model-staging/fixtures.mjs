import {notificationDigest} from '../shared/payment-notification-outbox.mjs';
import {travelBinding} from '../shared/model-travel-store.mjs';
export const IDS={A:'recAAAAAAAAAAAAAA',B:'recBBBBBBBBBBBBBB',model:'recMMMMMMMMMMMMMM',partnerA:'recPPPPPPPPPPPPPP',partnerB:'recQQQQQQQQQQQQQQ'};
const b64=s=>btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function fixtureToken(secret,lane){
 if(typeof secret!=='string'||secret.length<32)throw Error('staging_token_secret_required');
 const day=Math.floor(Date.now()/86400000)*86400000;
 const body='sigil_'+b64(JSON.stringify({pid:lane==='A'?IDS.partnerA:IDS.partnerB,iat:day,exp:day+86400000}));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));
 return body+'.'+b64(String.fromCharCode(...bytes));
}
export function session(lane){const id='sess_fixture_'+lane;return {id:IDS[lane],fields:{session_id:id,'Canonical Model':[IDS.model],member_id:['recFixtureMember'],job_id:'job_fixture_'+lane,confirmation_revision:1,
 fldLTq2kZbyRv22IA:id,fldrXQAyOMPCvbOaY:[IDS.model],flddVz6eoWRHrzIQr:'Model Fixture '+lane,fld0jkscGAtyX7i2J:'partner_'+lane,fld57fhdWqIcOy4Jp:'confirmed',fldpnqoIsUMfN7y3c:'2099-01-01',fldhwC79ndbnEXSZz:0}};}
export async function createFixtures(secret){
 const sessions=['A','B'].map(session),partners=[];
 for(const lane of ['A','B'])partners.push({id:lane==='A'?IDS.partnerA:IDS.partnerB,fields:{fldXb55aiAjNPOUWc:'partner_'+lane,fldpJWfASq7PfkMgC:'Partner Fixture '+lane,fldajmg66pf2ifGPu:'active',fldwRzdtIoPbHKr7n:'recognized',fldoaCF4k4YqyuQ7Q:secret?await notificationDigest(await fixtureToken(secret,lane)):''}});
 const objects=new Map();
 for(const record of sessions){
  const binding=await travelBinding(record),entries={};
  for(const [index,role] of ['model','model','customer','model','model'].entries()){
   const id=String(index+1).repeat(64),photos=(index===0?['a','b']:index===1?['a']:[]).map(h=>({sha256:h.repeat(64),type:'image/jpeg'}));
   entries[id]={id,binding:index===4?'old-binding':binding,state:index===3?'reserved':'saved',expires_at:0,sender_role:role,sender_id:role==='model'?IDS.model:'customer:'+binding,text:'SYNTHETIC PRIVATE TEXT',photos,saved_at:'2026-11-15T00:0'+index+':00Z'};
   if(index<2){const rid=await notificationDigest('model-travel:'+record.fields.session_id+':'+binding+':'+id);objects.set('payment-notifications/v1/model-travel/receipts/'+rid+'.json',{schema:'payment_notification_v1',id:rid,status:index===0?'delivered':'pending',payload:{session_id:record.fields.session_id,binding,kind:'submission'}});}
  }
  objects.set('job-travel/v1/'+await notificationDigest(record.fields.session_id)+'/ledger.json',{version:1,revision:1,entries});
 }
 const storage={async get(key){const data=objects.get(key);if(!data)return null;const text=JSON.stringify(data);return {size:new TextEncoder().encode(text).length,text:async()=>text};}};
 const http=async(input,init)=>{
  const req=new Request(input,init),u=new URL(req.url);
  if(req.method!=='GET')return Response.json({error:'fixture_read_only'},{status:405});
  if(u.hostname!=='api.airtable.com'||!u.pathname.startsWith('/v0/appCoModelFixture/'))return Response.json({error:'fixture_external_denied'},{status:403});
  const [, , ,table,id]=u.pathname.split('/');
  let rows=table==='Partners'?partners:table==='Sessions'||table==='tblC98mKWbzmPuNzX'?sessions:[];
  if(!['Partners','Sessions','tblC98mKWbzmPuNzX','Jobs','Models','Referrals','Payments','Rules','Changes','Assets','Commissions'].includes(table))return Response.json({error:'fixture_table_denied'},{status:403});
  if(id){const row=rows.find(r=>r.id===id);return Response.json(row||{error:'missing'},{status:row?200:404});}
  const formula=u.searchParams.get('filterByFormula')||'';
  const exact=/^\{([^}]+)\}=['"]([^'"]*)['"]$/.exec(formula);
  if(exact)rows=rows.filter(r=>r.fields[exact[1]]===exact[2]);
  else if(formula&&!formula.startsWith('AND(')&&!formula.startsWith('OR('))return Response.json({error:'fixture_query_denied'},{status:400});
  return Response.json({records:rows});
 };
 return {storage,http,env:{AIRTABLE_API_KEY:'fixture-only',AIRTABLE_BASE_ID:'appCoModelFixture',AIRTABLE_TABLE_SESSIONS:'Sessions',AIRTABLE_TABLE_MODEL_PARTNERS:'Partners',AIRTABLE_TABLE_MODELS:'Models',AIRTABLE_TABLE_MODEL_REFERRALS:'Referrals',AIRTABLE_TABLE_PAYMENTS:'Payments',AIRTABLE_TABLE_MODEL_OFFER_RULES:'Rules',AIRTABLE_TABLE_PARTNER_MODEL_CHANGES:'Changes',AIRTABLE_TABLE_PARTNER_ASSETS:'Assets',AIRTABLE_TABLE_PARTNER_COMMISSIONS:'Commissions',AIRTABLE_HTTP:{fetch:http}}};
}
