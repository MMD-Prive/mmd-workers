// Standalone preview data. No production credentials, connections or records.
export const FIXTURE_STATES = ['offered','confirmed','en_route','nearby','arrived','met_customer','final_payment_pending','final_payment_confirmed','work_started','work_finished','separated','empty','auth','review','error'];
const allowed = {offered:['accept_job','decline_job'],confirmed:['start_travel'],en_route:['mark_nearby','mark_arrived','send_eta'],nearby:['mark_arrived','send_eta'],arrived:['mark_met_customer'],met_customer:[],final_payment_pending:[],final_payment_confirmed:['start_work'],work_started:['mark_work_finished'],work_finished:['confirm_separated'],separated:[]};
const next={accept_job:'confirmed',decline_job:'offer_declined',start_travel:'en_route',mark_nearby:'nearby',mark_arrived:'arrived',mark_met_customer:'met_customer',start_work:'work_started',mark_work_finished:'work_finished',confirm_separated:'separated'};
export function makeFixture(world, state='confirmed') {
 return {world,state,revision:1,etaMinutes:45,submissions:[],gps:false,profile:{model_id:'model_LOCAL_FIXTURE_ONLY',working_name:'MODEL PREVIEW · ข้อมูลจำลอง',height_cm:180,weight_kg:72,languages:['thai','english'],skills_summary:'ข้อมูลจำลองสำหรับลองฟอร์มในเครื่อง',experience_summary:'ไม่มีข้อมูลโมเดลจริง',availability_status:'available',available_now:true,minimum_rate_90m:null,telegram_connected:true,readiness:{line_identity_verified:true}}};
}
export function fixtureSession(f) {
 if(f.state==='empty')return null;
 return {session_id:'sess_LOCAL_FIXTURE_'+f.world.toUpperCase(),normalized_state:f.state,state:f.state,revision:f.revision,model_work_lane:f.world==='private'?'private_model':'public_model',allowed_actions:allowed[f.state]||[],job_type:'LOCAL FIXTURE · ไม่ใช่งานจริง',start_time:'2030-11-12T18:00:00+07:00',location_name:'สถานที่ตัวอย่างในเครื่อง · Bangkok',pay_model_thb:null,payout_terms:{money_lane:f.world==='private'?'private_model':'public_model'},reconfirm:{reconfirm_status:'confirmed'}};
}
export function applyFixtureAction(f,body){
 if(body.session_id!=null&&body.session_id!=='sess_LOCAL_FIXTURE_'+f.world.toUpperCase())return {ok:false,error:'fixture_session_mismatch'};
 if(body.action==='send_eta'&&['en_route','nearby'].includes(f.state)){f.etaMinutes=Number(body.eta_minutes)||45;return {ok:true,local_fixture_only:true};}
 if(!(allowed[f.state]||[]).includes(body.action))return {ok:false,error:'fixture_action_not_allowed'};
 f.state=next[body.action]||f.state;f.revision++;return {ok:true,local_fixture_only:true,session:fixtureSession(f)};
}
export function fixtureTravel(f){const now=Date.now();return {ok:true,local_fixture_only:true,session_id:'sess_LOCAL_FIXTURE_'+f.world.toUpperCase(),state:f.state,revision:f.revision,binding:'local-fixture',server_now:new Date(now).toISOString(),can_send:['en_route','nearby'].includes(f.state),messages_remaining:3,photos_remaining:3,text_max:500,image_max_bytes:5242880,submissions:f.submissions,eta:{status:'active',arrival_at:new Date(now+f.etaMinutes*60000).toISOString(),updated_at:new Date(now).toISOString()}};}
