// Application-level storage API only; never query Cloudflare's internal SQL tables.
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const PREFIX={invitations:'approval:invitation:',audit:'approval-audit:'};
export function validateInvitationRead(body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail('invalid_read_request');
 if(Object.keys(body).some(k=>!['action','actor_id','object_id','client_record_id','collection','cursor','limit'].includes(k)))fail('invalid_read_request');
 const collection=body.collection??'invitations',prefix=Object.hasOwn(PREFIX,collection)?PREFIX[collection]:null;if(!prefix)fail('invalid_read_collection');
 const limit=body.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)fail('invalid_read_limit');
 if(body.cursor!==undefined&&(typeof body.cursor!=='string'||!body.cursor.startsWith(prefix)||body.cursor.length>240))fail('invalid_read_cursor');
 return {collection,prefix,limit,cursor:body.cursor};
}
const pick=(row,fields)=>Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
export async function readInvitationPage(storage,body){
 const q=validateInvitationRead(body),rows=await storage.list({prefix:q.prefix,limit:q.limit+1,...(q.cursor?{startAfter:q.cursor}:{})});
 const entries=[...rows],page=entries.slice(0,q.limit),now=Date.now();
 const items=page.flatMap(([key,row])=>{
  if(!row||typeof row!=='object')fail('invalid_invitation_storage_record',503);
  if(q.collection==='audit')return typeof row.key==='string'&&row.key.startsWith(PREFIX.invitations)?[{key,...pick(row,['event','actor','at']),invitation_key:row.key}]:[];
  return [{key,...pick(row,['client_record_id','member_id','round_id','approval_id','status','starts_at','expires_at','approved_by','approved_at','revoked_by','revoked_at','revoke_reason']),window_state:!Number.isFinite(Date.parse(row.starts_at))||!Number.isFinite(Date.parse(row.expires_at))?'invalid':now<Date.parse(row.starts_at)?'upcoming':now>=Date.parse(row.expires_at)?'expired':'open'}];
 });
 return {ok:true,read_only:true,collection:q.collection,items,scanned_count:page.length,next_cursor:entries.length>q.limit?page.at(-1)[0]:null,history_limit:'Stored current records and retained invitation audit events only; overwritten/deleted history cannot be reconstructed.'};
}
