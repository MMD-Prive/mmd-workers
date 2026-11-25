const lineId=/^U[a-f0-9]{32}$/i;
export async function verifyLineToken(token,channel,transport=fetch){
 const response=await transport('https://api.line.me/oauth2/v2.1/verify',{method:'POST',body:new URLSearchParams({id_token:token,client_id:channel}),redirect:'manual',signal:AbortSignal.timeout(5000)});
 let data;try{data=await response.json();}catch{return {subject:null,reason:'token_verify_response_invalid'};}
 if(!response.ok){
  const reasons={'IdToken expired.':'token_expired','Invalid IdToken Audience.':'token_audience_mismatch','Invalid IdToken.':'token_invalid','Invalid IdToken Issuer.':'token_issuer_invalid'};
  return {subject:null,reason:reasons[data?.error_description]||'token_verify_rejected'};
 }
 if(data?.aud!==channel)return {subject:null,reason:'token_audience_mismatch'};
 if(!Number.isFinite(data?.exp)||data.exp<=Date.now()/1000)return {subject:null,reason:'token_expired'};
 if(!lineId.test(data?.sub||''))return {subject:null,reason:'token_claims_invalid'};
 return {subject:data.sub,reason:null};
}
export async function checkIdentity(token,channel,expected,verify){
 if(typeof token!=='string'||!token)return {allowed:false,reason:'token_missing',tokenVerified:false,subjectMatched:false};
 const result=await verify(token,channel);
 const subject=typeof result==='string'?result:result?.subject;
 if(!subject)return {allowed:false,reason:result?.reason||'token_verify_rejected',tokenVerified:false,subjectMatched:false};
 if(subject!==expected)return {allowed:false,reason:'identity_mismatch',tokenVerified:true,subjectMatched:false};
 return {allowed:true,reason:'identity_verified',tokenVerified:true,subjectMatched:true};
}
export async function identityEvent(request,store,result){
 const raw=request.headers.get('X-QA-Run')||'',w=request.headers.get('X-QA-World');
 const rawSource=request.headers.get('X-QA-Login-Source'),rawRequest=request.headers.get('X-QA-Login-Request');
 const loginSource=['button','callback'].includes(rawSource)?rawSource:'unknown';
 const clientRequestId=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(rawRequest||'')?rawRequest:null;
 const event={version:2,loginSource,clientRequestId,attemptId:crypto.randomUUID(),at:new Date().toISOString(),run:/^[a-zA-Z0-9_-]{1,64}$/.test(raw)?raw:'unlabelled',world:['curated','sigil'].includes(w)?w:'unknown',reason:result.reason,tokenVerified:result.tokenVerified,subjectMatched:result.subjectMatched,fixture:true};
 await store.put('booking-identity/v1/'+event.run+'/'+event.attemptId,JSON.stringify(event),{httpMetadata:{contentType:'application/json'}});
 return event.attemptId;
}
