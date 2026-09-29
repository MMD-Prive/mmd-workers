import test from "node:test";
import assert from "node:assert/strict";
import {
  handleModelDirectFirstJobGate,
  MODEL_DIRECT_JOB_GATE_RULES_VERSION,
} from "./src/model-direct-first-job-gate.js";

const SECRET="model-session-secret";
const MODEL="recModel123456789";
const OTHER="recModel987654321";
const SESSION_ID="sess-direct-1";
const JOB_ID="JOB-DIRECT-1";

async function hmacHex(message, secret){
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,enc.encode(message));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function sessionToken(modelId=MODEL){
  const payload={kind:"model_session",role:"model",model_record_id:modelId,exp:Math.floor(Date.now()/1000)+3600};
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded+"."+await hmacHex(encoded,SECRET);
}
function memoryEnv({lane="private_model",modelId=MODEL,partner=false,acks=[]}={}){
  const writes=[];
  const session={id:"recSession123456",fields:{
    fldLTq2kZbyRv22IA:SESSION_ID,
    fldHw5HdDDdkHXMhG:JOB_ID,
    fldzYGziqLqTQaoaK:lane,
    fldrXQAyOMPCvbOaY:[modelId],
    fld0jkscGAtyX7i2J:partner?"partner-1":"",
    fldorSqZ8baZEs4NL:"",
    fldxyZ7S3tjF8chGR:partner?JSON.stringify({partner_relationship:{settlement_method:"included_in_rate"}}):"",
  }};
  const env={
    MODEL_SESSION_SIGNING_SECRET:SECRET,
    AIRTABLE_BASE_ID:"appTest",
    AIRTABLE_API_KEY:"patTest",
    AIRTABLE_TABLE_SESSIONS:"Sessions",
    AIRTABLE_TABLE_MODEL_JOB_DAY_RULES_ACKS:"Acks",
    PAYMENTS_WORKER:{async fetch(request){
      assert.equal(new URL(request.url).pathname,"/v1/confirm/details");
      const body=await request.json();
      assert.equal(body.expected_role,"model");
      assert.equal(body.t,"signed-model-confirm-token");
      return Response.json({ok:true,session_id:SESSION_ID,role:"model"});
    }},
    AIRTABLE_HTTP:{async fetch(request){
      const url=new URL(request.url);
      const table=decodeURIComponent(url.pathname.split("/").at(-1));
      if(request.method==="GET"&&table==="Sessions") return Response.json({records:[session]});
      if(request.method==="GET"&&table==="Acks") return Response.json({records:acks});
      if(request.method==="POST"&&table==="Acks"){
        const body=await request.json();
        writes.push(body.records[0].fields);
        const record={id:"recAck1234567890",fields:body.records[0].fields};
        acks.push(record);
        return Response.json({records:[record]});
      }
      throw new Error("unexpected Airtable request "+request.method+" "+table);
    }},
  };
  return {env,writes,acks};
}
async function request(path,{body={},modelId=MODEL,cookie=true}={}){
  const headers={"content-type":"application/json",origin:"https://mmdbkk.com"};
  if(cookie) headers.cookie="mmd_model_session_v1="+await sessionToken(modelId);
  return new Request("https://mmdbkk.com"+path,{method:"POST",headers,body:JSON.stringify({t:"signed-model-confirm-token",...body})});
}

test("requires verified model session before consulting job truth",async()=>{
  const {env}=memoryEnv();
  let calls=0; env.PAYMENTS_WORKER.fetch=async()=>{calls++;return Response.json({ok:true})};
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/status",{cookie:false}),env);
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,"model_session_required");
  assert.equal(calls,0);
});

test("public Model job is outside the Direct Private first-job gate",async()=>{
  const {env}=memoryEnv({lane:"public_model"});
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/status"),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.applies,false);
  assert.equal(body.required,false);
  assert.equal(body.reason,"not_private_model");
});

test("partner-managed Private job is outside the direct-job gate",async()=>{
  const {env}=memoryEnv({partner:true});
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/status"),env);
  const body=await response.json();
  assert.equal(body.applies,false);
  assert.equal(body.reason,"partner_managed_private_job");
});

test("first direct Private job requires current-version acknowledgement without exposing job details",async()=>{
  const {env}=memoryEnv();
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/status"),env);
  const body=await response.json();
  assert.equal(body.applies,true);
  assert.equal(body.required,true);
  assert.equal(body.source,"direct_first_job");
  assert.equal(body.rules_version,MODEL_DIRECT_JOB_GATE_RULES_VERSION);
  assert.equal(body.job_id,JOB_ID);
  assert.equal(body.job_state_changed,false);
  assert.deepEqual(Object.keys(body).sort(),[
    "acknowledged_at","applies","authority","job_id","job_state_changed","ok","reason","required","rules_url","rules_version","schema","source"
  ].sort());
});

test("ack writes the structured ledger once and does not mutate Session",async()=>{
  const {env,writes}=memoryEnv();
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/ack",{body:{completed:true,rules_version:MODEL_DIRECT_JOB_GATE_RULES_VERSION}}),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.required,false);
  assert.equal(body.reason,"acknowledged");
  assert.equal(writes.length,1);
  assert.equal(writes[0].model_record_id,MODEL);
  assert.deepEqual(writes[0].Model,[MODEL]);
  assert.equal(writes[0].job_id,JOB_ID);
  assert.equal(writes[0].session_id,SESSION_ID);
  assert.equal(writes[0].source,"direct_first_job");
  assert.equal(writes[0].rules_url,"https://mmdbkk.com/rules/model/private/job-day");
  assert.equal(writes[0].rules_version,MODEL_DIRECT_JOB_GATE_RULES_VERSION);
  assert.match(writes[0].ack_id,/^mjdack_[a-f0-9]{24}$/);
  assert.match(writes[0].acknowledged_at,/^\d{4}-\d{2}-\d{2}T/);
});

test("current-version acknowledgement makes later direct Private jobs skip the gate",async()=>{
  const existing={id:"recAckExisting001",fields:{acknowledged_at:"2026-09-29T08:00:00.000Z"}};
  const {env,writes}=memoryEnv({acks:[existing]});
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/status"),env);
  const body=await response.json();
  assert.equal(body.applies,true);
  assert.equal(body.required,false);
  assert.equal(body.reason,"already_acknowledged_current_version");
  assert.equal(writes.length,0);
});

test("identity mismatch fails closed",async()=>{
  const {env}=memoryEnv({modelId:OTHER});
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/status"),env);
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,"job_model_identity_mismatch");
});

test("ack refuses a stale rules version",async()=>{
  const {env,writes}=memoryEnv();
  const response=await handleModelDirectFirstJobGate(await request("/v1/model/direct-job-gate/ack",{body:{completed:true,rules_version:"job-day-v1"}}),env);
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,"job_day_rules_version_mismatch");
  assert.equal(writes.length,0);
});
