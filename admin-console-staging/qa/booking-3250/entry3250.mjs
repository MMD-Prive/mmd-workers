import base,{qaActor} from './qa-bundle.mjs';
import {adminPrivate,privateEnabled} from './private-handoff/served-adapter.mjs';
export {CreateJobFixtureRun} from './qa-bundle.mjs';
import {readCreateJobPublicRequest} from './reader3250.mjs';
const origin='https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev', endpoint='/internal/admin/jobs/create-job/public-request', test='/qa/3250/white';
export default {async fetch(req,env,ctx){
 const url=new URL(req.url);
 const privatePage=await adminPrivate(req,env,qaActor);if(privatePage)return privatePage;
 if(![endpoint,test,'/internal/admin/jobs/create-job/public-booking-qa'].includes(url.pathname))return base.fetch(req,env,ctx);
 if(url.origin!==origin)return new Response(null,{status:421});
 const actor=await qaActor(req,env);if(actor?.role!=='owner')return new Response(null,{status:403});
 if(url.pathname==='/internal/admin/jobs/create-job/public-booking-qa'){
 const headers={'Content-Type':'text/html;charset=utf-8','Cache-Control':'private,no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"};
 if(req.method==='GET')return new Response('<html lang="th"><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1"><h1>Create Job · Booking QA</h1><p>Boss Y · dining · กรุงเทพฯ · 4 ชั่วโมง · ลูกค้า 6,000 บาท · โมเดล 3,500 บาท</p><form method=post><label>รหัสลูกค้า <input required name=client></label><label>รหัสคำขอ <input required name=ref></label><button>ตรวจแล้ว สร้างงานจากคำขอ</button></form>'+ (privateEnabled(env) && env.PRIVATE_BOOKING_QA ? '<p><a href="/internal/admin/jobs/create-job/private-booking-qa">Private Booking QA</a></p>' : ''),{headers});
 if(req.method!=='POST'||req.headers.get('Origin')!==origin)return new Response(null,{status:403});
 const form=await req.formData();try{const r=await env.CREATE_PUBLIC_JOB_QA.create(form.get('client'),form.get('ref'));return Response.json(r,{headers:{'Cache-Control':'private,no-store'}})}catch{return Response.json({error:'job_unavailable'},{status:409,headers:{'Cache-Control':'private,no-store'}})}
 }
 const call=async method=>{const response=await env.BOOKING_3250_QA.fetch('https://booking-3250.invalid/qa/3250/fixture',{method,headers:{'x-qa-service':env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES},redirect:'manual'}); if(response.status>=300 && response.status<400) throw new Error('fixture_redirect_rejected'); return response;};
 const read=r=>readCreateJobPublicRequest(r,env,actor,()=>call('GET'));
 if(url.pathname===endpoint)return req.method==='GET'?read(req):new Response(null,{status:405});
 if(req.method==='GET')return new Response('<meta charset=utf-8><form method=post><button>ทดสอบ White · dining · 10,000 บาท</button></form>',{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
 if(req.method!=='POST'||req.headers.get('Origin')!==origin)return new Response(null,{status:403});
 const unavailable = stage => Response.json(
   { ok: false, error: 'booking_fixture_unavailable', stage },
   { status: 503, headers: { 'cache-control': 'no-store' } }
 );
 let response;
 try {
   response = await call('POST');
 } catch {
   return unavailable('seed_service_request');
 }
 if (!response.ok) {
   if (response.status === 503) {
     const fault = await response.json().catch(() => null);
     if (fault?.error === 'booking_fixture_unavailable' &&
         ['fixture_seed_build', 'fixture_seed_r2_write'].includes(fault.stage)) {
       return unavailable(fault.stage);
     }
   }
   return unavailable('seed_response');
 }

 let seeded;
 try {
   seeded = await response.json();
 } catch {
   return unavailable('seed_response_json');
 }
 if (!/^mmdreq_[a-f0-9]{64}$/.test(seeded?.ref) || typeof seeded.created !== 'boolean') {
   return unavailable('seed_contract');
 }
 const { ref, created } = seeded;
 const check=client=>read(new Request(origin+endpoint+'?'+new URLSearchParams({client_id:client,ref})));
 const yes = await check('recPublicClient0001');
 const no = await check('recPublicClient0002');
 if (yes.status === 503 || no.status === 503) return unavailable('readback');
 const y = await yes.json();
 const result={ref,created,match:yes.status,other:no.status,format:y.work_type,model:y.model_name,budget:y.budget_thb,duration:y.duration_minutes};

 return Response.json(result,{headers:{'cache-control':'no-store'}});
}};
