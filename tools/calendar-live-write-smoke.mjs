import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const ORIGIN = "https://www.mmdbkk.com";
const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID = "appsV1ILPRfIjkaYg";
const SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const LINKS_TABLE = "tbl6saWYEQrEdnMIK";
const CAL_API = "https://api.cal.com/v2";

const clean = value => String(value || "").replace(/[\r\n\u2028\u2029]/g, "").trim();
const adminCredential = clean(process.env.ADMIN_LOGIN_CREDENTIAL);
const airtableToken = clean(process.env.AIRTABLE_API_KEY);
const calApiKey = clean(process.env.CAL_API_KEY);
assert.ok(adminCredential, "ADMIN_LOGIN_CREDENTIAL missing");
assert.ok(airtableToken, "AIRTABLE_API_KEY missing");
assert.ok(calApiKey, "CAL_API_KEY missing");

const stamp = Date.now().toString(36).toUpperCase();
const sessionId = `CAL-SMOKE-${stamp}`;
const jobId = `CAL-SMOKE-JOB-${stamp}`;
const round30 = ms => Math.ceil(ms / 1800000) * 1800000;
const startMs = round30(Date.now() + 36 * 60 * 60 * 1000);
const startAt = new Date(startMs).toISOString();
const endAt = new Date(startMs + 30 * 60 * 1000).toISOString();
let sessionRecordId = "";
let bookingUid = "";
let mappingRecordIds = [];
const events = [];

function airHeaders() {
  return { authorization:`Bearer ${airtableToken}`, "content-type":"application/json", accept:"application/json" };
}
async function airtable(path, init = {}) {
  const response = await fetch(`${AIRTABLE_API}/${BASE_ID}/${path}`, {
    ...init,
    headers:{...airHeaders(),...(init.headers||{})},
    signal:AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`airtable_${response.status}`);
    error.body = body;
    throw error;
  }
  return body;
}
async function login() {
  const response = await fetch(ORIGIN + "/internal/admin/login/session", {
    method:"POST",
    redirect:"manual",
    headers:{Origin:ORIGIN,"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({credential:adminCredential,next:"/internal/admin/calendar"}),
    signal:AbortSignal.timeout(20000),
  });
  assert.equal(response.status,303,"owner login failed");
  const cookie=response.headers.getSetCookie().map(x=>x.split(";",1)[0]).join("; ");
  assert.match(cookie,/mmd_admin_gate_v1=.+/,"admin session missing");
  return cookie;
}
async function findMappings() {
  const query=new URLSearchParams({
    maxRecords:"10",
    filterByFormula:`{Session ID}='${sessionId.replace(/'/g,"\\'")}'`,
  });
  const body=await airtable(`${LINKS_TABLE}?${query}`);
  return Array.isArray(body.records)?body.records:[];
}
async function cancelBooking(uid) {
  if (!uid) return {attempted:false};
  const response=await fetch(`${CAL_API}/bookings/${encodeURIComponent(uid)}`,{
    method:"DELETE",
    headers:{
      authorization:`Bearer ${calApiKey}`,
      "content-type":"application/json",
      accept:"application/json",
      "cal-api-version":"2024-08-13",
    },
    body:JSON.stringify({cancellationReason:"MMD Calendar live-write production smoke cleanup"}),
    signal:AbortSignal.timeout(25000),
  });
  const text=await response.text();
  if (!response.ok) return {attempted:true,ok:false,status:response.status,body:text.slice(0,500)};
  return {attempted:true,ok:true,status:response.status};
}
async function cleanup() {
  const result={cancel:null,session_deleted:false,mappings_deleted:0};
  try { result.cancel=await cancelBooking(bookingUid); } catch(error) { result.cancel={attempted:true,ok:false,error:error.message}; }
  if (bookingUid) await new Promise(r=>setTimeout(r,3000));
  try {
    if(sessionRecordId){
      await airtable(`${SESSIONS_TABLE}/${sessionRecordId}`,{method:"DELETE"});
      result.session_deleted=true;
    }
  } catch(error){ result.session_delete_error=error.message; }
  try {
    const records=await findMappings();
    for(const record of records){
      await airtable(`${LINKS_TABLE}/${record.id}`,{method:"DELETE"});
      result.mappings_deleted+=1;
    }
  } catch(error){ result.mapping_delete_error=error.message; }
  return result;
}

let receipt;
try {
  const created=await airtable(SESSIONS_TABLE,{
    method:"POST",
    body:JSON.stringify({
      fields:{
        session_id:sessionId,
        job_id:jobId,
        model_name:"CAL LIVE WRITE SMOKE",
        start_time:startAt,
        end_time:endAt,
        duration_hours:0.5,
        payment_status:"pending",
        model_session_state:"confirmed",
      },
      typecast:true,
    }),
  });
  sessionRecordId=created.id || "";
  assert.ok(sessionRecordId,"fixture Session record missing");
  events.push({step:"session_fixture_created",record_id:sessionRecordId,session_id:sessionId,start_at:startAt});

  const cookie=await login();
  const response=await fetch(ORIGIN+"/v1/admin/calendar/reconcile",{
    method:"POST",
    headers:{
      Cookie:cookie,
      Origin:ORIGIN,
      Accept:"application/json",
      "content-type":"application/json",
    },
    body:JSON.stringify({session_id:sessionId}),
    redirect:"manual",
    signal:AbortSignal.timeout(30000),
  });
  const body=await response.json().catch(() => ({}));
  assert.ok(response.ok,`targeted reconcile failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  assert.equal(body.ok,true,"targeted reconcile did not return ok");
  assert.ok(["created","existing"].includes(body.state),`unexpected hold state: ${body.state}`);
  bookingUid=clean(body.booking_uid);
  assert.ok(bookingUid,"booking UID missing from reconcile");
  events.push({step:"hold_ensured",state:body.state,booking_uid:bookingUid});

  const mappings=await findMappings();
  mappingRecordIds=mappings.map(r=>r.id);
  const linked=mappings.find(r=>clean(r.fields?.["Cal Booking UID"])===bookingUid);
  assert.ok(linked,"Cal booking UID not persisted in mapping ledger");
  assert.equal(clean(linked.fields?.["Session ID"]),sessionId);
  assert.equal(clean(linked.fields?.["Job ID"]),jobId);
  events.push({step:"ledger_verified",record_id:linked.id,mapping_status:clean(linked.fields?.["Mapping Status"])});

  receipt={
    checked_at:new Date().toISOString(),
    status:"cal_live_write_verified",
    session_id:sessionId,
    booking_uid:bookingUid,
    start_at:startAt,
    event_type_id:7057823,
    route:"/v1/admin/calendar/reconcile",
    events,
    financial_mutations:false,
    customer_notifications_expected:false,
  };
} catch(error) {
  receipt={
    checked_at:new Date().toISOString(),
    status:"cal_live_write_failed",
    session_id:sessionId,
    booking_uid:bookingUid||null,
    start_at:startAt,
    error:error.message,
    error_detail:error.body||null,
    events,
    financial_mutations:false,
  };
} finally {
  const cleanupResult=await cleanup();
  receipt={...receipt,cleanup:cleanupResult};
  const path=(process.env.RUNNER_TEMP||"/tmp")+"/calendar-live-write-receipt.json";
  writeFileSync(path,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
}

assert.equal(receipt.status,"cal_live_write_verified");
assert.equal(receipt.cleanup?.session_deleted,true,"smoke Session cleanup failed");
assert.ok(receipt.cleanup?.cancel?.ok===true,"smoke Cal booking cancellation failed");
assert.ok((receipt.cleanup?.mappings_deleted||0)>=1,"smoke mapping cleanup failed");
