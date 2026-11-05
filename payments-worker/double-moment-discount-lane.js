export async function beginDoubleMomentDiscount(env,fields,sessionId,operation){
 if(!env.DOUBLE_MOMENT_COORDINATOR){if(env.DOUBLE_MOMENT_PURCHASE_ENABLED==='true')throw Error('double_moment_coordinator_missing');return null;}
 const clients=fields.Client||fields.fld6P6if0vDZCeV0C,job=fields.job_id||fields.fldHw5HdDDdkHXMhG;
 if(!Array.isArray(clients)||clients.length!==1||!/^rec[A-Za-z0-9]{14}$/.test(clients[0])||!job||!env.AUTH_SERVICE_MEMBER_TO_PAYMENTS)throw Error('discount_identity_or_coordinator_auth_unproven');
 const expected=env.DOUBLE_MOMENT_EXPECTED_DISCOUNT_OWNER;if(expected&&(expected.client!==clients[0]||expected.job!==job||expected.session!==sessionId))throw Error('discount_execution_owner_mismatch');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(operation));const op=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const stub=env.DOUBLE_MOMENT_COORDINATOR.get(env.DOUBLE_MOMENT_COORDINATOR.idFromName(clients[0]));
 async function call(action,extra={}){const payload={action,client_record_id:clients[0],job_id:job,session_id:sessionId,operation_id:op,...extra};const r=env.DOUBLE_MOMENT_DISCOUNT_EXECUTOR?await env.DOUBLE_MOMENT_DISCOUNT_EXECUTOR(payload):await stub.fetch(new Request('https://double-moment.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS},body:JSON.stringify({action,client_record_id:clients[0],job_id:job,session_id:sessionId,operation_id:op,...extra})}));const p=await r.json();if(!r.ok)throw Object.assign(new Error(p.error||'discount_lane_failed'),{status:r.status});return p;}
 const lease=await call('discount-begin');return {complete:()=>call('discount-complete',{lease_id:lease.lease_id})};
}

export async function executeDoubleMomentMutation(env,fields,sessionId,request,kind){
 const clients=fields.Client||fields.fld6P6if0vDZCeV0C,job=fields.job_id||fields.fldHw5HdDDdkHXMhG;
 if(!Array.isArray(clients)||clients.length!==1||!/^rec[A-Za-z0-9]{14}$/.test(clients[0])||!job||!env.AUTH_SERVICE_MEMBER_TO_PAYMENTS)throw Error('discount_identity_or_coordinator_auth_unproven');
 const stub=env.DOUBLE_MOMENT_COORDINATOR.get(env.DOUBLE_MOMENT_COORDINATOR.idFromName(clients[0]));
 const headers={};for(const name of ['content-type','origin','x-internal-token'])if(request.headers.has(name))headers[name]=request.headers.get(name);
 return stub.fetch(new Request('https://double-moment.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS},body:JSON.stringify({action:'execute-'+kind,job_id:job,client_record_id:clients[0],session_id:sessionId,request:{url:request.url,method:request.method,headers,body:await request.clone().text()}})}));
}
