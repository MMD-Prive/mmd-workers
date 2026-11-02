import { digest, reply } from './member-booking-flow.js';
// No production binding/migration is added by this local candidate.
export class MemberBookingCoordinator {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    if(request.method!=='POST'||new URL(request.url).pathname!=='/submit')return reply({ok:false},405);
    const input=await request.json().catch(()=>null);
    if(!input||!/^[a-f0-9]{64}$/.test(input.owner||'')||!/^mmdreq_[a-f0-9]{64}$/.test(input.reference||'')||!input.payload)return reply({ok:false},400);
    return this.state.blockConcurrencyWhile(async()=>{
      const fingerprint=await digest(JSON.stringify(input.payload));
      const prior=await this.state.storage.get('request');
      if(prior&&(prior.owner!==input.owner||prior.fingerprint!==fingerprint))return reply({ok:false,error:'request_conflict'},409);
      if(prior?.state==='rejected')return reply({ok:false,error:prior.error,outcome:'not_started',request_ref:input.reference},422);
      if(prior?.result)return reply({...prior.result,idempotent:true},200);
      // A prior in-flight/uncertain attempt may have written upstream: never repeat it.
      if(prior)return reply({ok:false,error:'submission_outcome_pending',request_ref:input.reference},409);
      await this.state.storage.put('request',{owner:input.owner,fingerprint,reference:input.reference,state:'pending'});
      try{
        const res=await this.env.SIGIL_BOOKING_WORKER.fetch(new Request('https://sigil-booking.internal/__internal/member-booking',{
          method:'POST',headers:{'content-type':'application/json','x-mmd-member-booking-secret':this.env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES,cookie:input.cookie || ''},
          body:JSON.stringify({operation:'submit',owner:input.owner,reference:input.reference,member_id:input.member_id,payload:input.payload}),signal:AbortSignal.timeout(10000)
        }));
        const body=await res.json().catch(()=>null);
        if(!res.ok&&body?.outcome==='not_started'&&body.request_ref===input.reference){
          await this.state.storage.put('request',{owner:input.owner,fingerprint,reference:input.reference,state:'rejected',error:body.error});
          return reply({ok:false,error:body.error,outcome:'not_started',request_ref:input.reference},res.status);
        }
        if(!res.ok||body?.ok!==true||body.request_ref!==input.reference)return reply({ok:false,error:'submission_outcome_pending',request_ref:input.reference},409);
        const result={ok:true,request_ref:input.reference,status:'request_pending_admin_review'};
        await this.state.storage.put('request',{owner:input.owner,fingerprint,reference:input.reference,state:'saved',result});
        return reply(result,201);
      }catch{return reply({ok:false,error:'submission_outcome_pending',request_ref:input.reference},409);}
    });
  }
}
