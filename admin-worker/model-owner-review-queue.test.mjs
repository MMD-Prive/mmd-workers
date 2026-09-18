import test from "node:test";
import assert from "node:assert/strict";
import { handleModelOwnerReviewQueue, MODEL_OWNER_REVIEW_QUEUE_PATH } from "./src/model-owner-review-queue.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";

test("unified owner queue joins changes, availability and latest media", async () => {
  const env={AIRTABLE_API_KEY:"x",AIRTABLE_BASE_ID:"appTest0000000000",ADMIN_LOGIN_CREDENTIAL:"admin"};
  const cookie="mmd_admin_gate_v1="+await createCredentialBoundAdminSession(new Request("https://mmdbkk.com"),{id:"per",role:"owner"},env);
  const original=globalThis.fetch;
  globalThis.fetch=async (input)=>{
    const url=new URL(input);
    const table=decodeURIComponent(url.pathname.split("/").pop());
    if(table==="MMD — Model Review Requests") return Response.json({records:[{id:"recReview000000001",fields:{request_id:"rq1",Model:["recModel000000001"],request_type:"model_self_service_update",request_status:"pending_review",requested_at:"2026-09-19T01:00:00.000Z",payload_json:JSON.stringify({changed_fields:[{field:"weight_kg",before:70,after:72}],availability:{available_now:true,availability_status:"available"}})}}]});
    if(table==="MMD — Model Media Assets") return Response.json({records:[{id:"recMedia000000001",fields:{Model:["recModel000000001"],media_id:"media_1",media_type:"profile_photo",file_name:"new.webp",file_type:"image/webp",uploaded_at:"2026-09-19T01:05:00.000Z",review_status:"active",asset_role:"profile_candidate"}}]});
    if(table==="Models") return Response.json({records:[{id:"recModel000000001",fields:{working_name:"Simba"}}]});
    return Response.json({}, {status:404});
  };
  try{
    const res=await handleModelOwnerReviewQueue(new Request("https://mmdbkk.com"+MODEL_OWNER_REVIEW_QUEUE_PATH,{headers:{cookie}}),env);
    const body=await res.json();
    assert.equal(res.status,200);
    assert.equal(body.items[0].model_name,"Simba");
    assert.equal(body.items[0].changed_fields[0].field,"weight_kg");
    assert.equal(body.items[0].availability.availability_status,"available");
    assert.equal(body.items[0].latest_media[0].media_id,"media_1");
  } finally { globalThis.fetch=original; }
});

test("queue requires credential-bound owner/admin session", async()=>{
  const res=await handleModelOwnerReviewQueue(new Request("https://mmdbkk.com"+MODEL_OWNER_REVIEW_QUEUE_PATH),{});
  assert.equal(res.status,401);
});


test("owner decision records actor, timestamp and status", async()=>{
  const env={AIRTABLE_API_KEY:"x",AIRTABLE_BASE_ID:"appTest0000000000",ADMIN_LOGIN_CREDENTIAL:"admin"};
  const cookie="mmd_admin_gate_v1="+await createCredentialBoundAdminSession(new Request("https://mmdbkk.com"),{id:"per",role:"owner"},env);
  const original=globalThis.fetch; let patchBody=null;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input); const table=decodeURIComponent(url.pathname.split("/").pop());
    if((init.method||"GET")==="PATCH"){patchBody=JSON.parse(init.body);return Response.json({records:patchBody.records});}
    if(table==="MMD — Model Review Requests") return Response.json({records:[{id:"recReview000000001",fields:{request_id:"rq1",request_type:"model_self_service_update",request_status:"pending_review",version:1}}]});
    return Response.json({records:[]});
  };
  try{
    const res=await handleModelOwnerReviewQueue(new Request("https://mmdbkk.com"+MODEL_OWNER_REVIEW_QUEUE_PATH+"/rq1/decision",{method:"POST",headers:{cookie,origin:"https://mmdbkk.com","content-type":"application/json"},body:JSON.stringify({decision:"approve"})}),env);
    const body=await res.json();
    assert.equal(res.status,200); assert.equal(body.decision_by,"per"); assert.equal(body.request_status,"approved");
    assert.equal(patchBody.records[0].fields.decision_by,"per"); assert.ok(patchBody.records[0].fields.decision_at);
  } finally {globalThis.fetch=original;}
});
