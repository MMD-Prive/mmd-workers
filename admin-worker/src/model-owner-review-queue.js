import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

export const MODEL_OWNER_REVIEW_QUEUE_PATH = "/v1/admin/models/review-queue";
const ORIGINS = new Set(["https://mmdbkk.com","https://www.mmdbkk.com"]);

export function isModelOwnerReviewQueueRequest(request) {
  try {
    const u = new URL(request.url);
    const path = u.pathname.replace(/\/+$/,"");
    const method = String(request.method||"GET").toUpperCase();
    if (path === MODEL_OWNER_REVIEW_QUEUE_PATH) return ["GET","HEAD"].includes(method);
    if (/^\/v1\/admin\/models\/review-queue\/[^/]+\/decision$/.test(path)) return method === "POST";
    return false;
  } catch { return false; }
}

export async function handleModelOwnerReviewQueue(request, env = {}) {
  const url = new URL(request.url);
  if (!ORIGINS.has(url.origin)) return json({ok:false,error:"forbidden_origin"},403);
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return json({ok:false,error:"unauthorized"},401);
  if (!["owner","admin"].includes(actor.role)) return json({ok:false,error:"admin_required"},403);

  const decisionMatch = url.pathname.replace(/\/+$/,"").match(/^\/v1\/admin\/models\/review-queue\/([^/]+)\/decision$/);
  if (decisionMatch && request.method.toUpperCase() === "POST") {
    return decideReview(request, env, actor, decodeURIComponent(decisionMatch[1]));
  }

  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")||50)));
  const [reviews, media, models] = await Promise.all([
    listRecords(env, env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || "MMD — Model Review Requests", 250),
    listRecords(env, env.AIRTABLE_TABLE_MODEL_MEDIA || "MMD — Model Media Assets", 500),
    listRecords(env, env.AIRTABLE_TABLE_MODELS || "Models", 500),
  ]);
  if (!reviews.ok || !media.ok || !models.ok) return json({ok:false,error:"model_review_queue_unavailable"},503);

  const modelById = new Map(models.records.map(r => [r.id, r]));
  const names = new Map(models.records.map(r => [r.id, String(r.fields?.working_name || r.fields?.nickname || r.fields?.display_name || r.id)]));
  const mediaByModel = new Map();
  for (const record of media.records) {
    const modelId = Array.isArray(record.fields?.Model) && record.fields.Model.length === 1 ? record.fields.Model[0] : "";
    if (!modelId) continue;
    const item = {
      media_asset_id: record.id,
      media_id: String(record.fields?.media_id || ""),
      media_type: String(record.fields?.media_type || ""),
      file_name: String(record.fields?.file_name || ""),
      file_type: String(record.fields?.file_type || ""),
      uploaded_at: String(record.fields?.uploaded_at || ""),
      review_status: String(record.fields?.review_status || ""),
      asset_role: String(record.fields?.asset_role || ""),
    };
    const current = mediaByModel.get(modelId) || [];
    current.push(item);
    current.sort((a,b)=>Date.parse(b.uploaded_at||0)-Date.parse(a.uploaded_at||0));
    mediaByModel.set(modelId,current.slice(0,3));
  }

  const items = reviews.records
    .filter(r => String(r.fields?.request_type || "") === "model_self_service_update")
    .filter(r => !["approved","rejected","archived"].includes(String(r.fields?.request_status || "").toLowerCase()))
    .map(r => {
      const modelId = Array.isArray(r.fields?.Model) && r.fields.Model.length === 1 ? r.fields.Model[0] : "";
      let payload = {};
      try { payload = JSON.parse(String(r.fields?.payload_json || "{}")); } catch {}
      const modelFields = modelById.get(modelId)?.fields || {};
      const telegramConnected =
        String(modelFields.telegram_verification_status || "").toLowerCase() === "verified" &&
        /^\d{5,20}$/.test(String(modelFields.telegram_user_id || "").trim());
      return {
        request_id: String(r.fields?.request_id || r.id),
        request_status: String(r.fields?.request_status || "pending_review"),
        requested_at: String(r.fields?.requested_at || r.createdTime || ""),
        decision_by: String(r.fields?.decision_by || ""),
        decision_at: String(r.fields?.decision_at || ""),
        decision_note: String(r.fields?.decision_note || ""),
        model_id: modelId,
        model_name: names.get(modelId) || modelId,
        changed_fields: Array.isArray(payload.changed_fields) ? payload.changed_fields : [],
        availability: payload.availability || null,
        latest_media: mediaByModel.get(modelId) || [],
        telegram_connected: telegramConnected,
        telegram_status: telegramConnected ? "verified" : String(modelFields.telegram_verification_status || "not_connected"),
        missing: buildMissing(payload, mediaByModel.get(modelId) || [], telegramConnected),
      };
    })
    .sort((a,b)=>Date.parse(b.requested_at||0)-Date.parse(a.requested_at||0))
    .slice(0,limit);

  const response = {
    ok:true,
    source:"MMD — Model Review Requests + MMD — Model Media Assets + Models",
    authority:"backend",
    count:items.length,
    items,
  };
  if (request.method.toUpperCase()==="HEAD") return new Response(null,{status:200,headers:baseHeaders()});
  return json(response,200);
}


async function decideReview(request, env, actor, requestId) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ok:false,error:"forbidden_origin"},403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ok:false,error:"json_required"},415);
  const body=await request.json().catch(()=>null);
  if(!body || !["approve","reject","hold"].includes(String(body.decision||""))) return json({ok:false,error:"invalid_decision"},400);
  const note=String(body.note||"").trim();
  if(body.decision!=="approve" && !note) return json({ok:false,error:"decision_note_required"},400);

  const loaded=await findReviewByRequestId(env,requestId);
  if(!loaded.ok) return json({ok:false,error:"model_review_queue_unavailable"},503);
  if(!loaded.record) return json({ok:false,error:"review_not_found"},404);
  const f=loaded.record.fields||{};
  if(String(f.request_type||"")!=="model_self_service_update") return json({ok:false,error:"review_type_mismatch"},409);
  if(["approved","rejected"].includes(String(f.request_status||"").toLowerCase())) return json({ok:false,error:"review_already_closed"},409);

  const now=new Date().toISOString();
  const nextStatus=body.decision==="approve"?"approved":body.decision==="reject"?"rejected":"hold";
  const version=Number(f.version||0)+1;
  const patched=await patchRecord(env, env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || "MMD — Model Review Requests", loaded.record.id, {
    request_status:nextStatus,
    decision_by:actor.id,
    decision_at:now,
    decision_note:note || "Approved by owner/admin.",
    version,
  });
  if(!patched.ok) return json({ok:false,error:"review_decision_write_failed"},503);
  return json({ok:true,request_id:requestId,request_status:nextStatus,decision_by:actor.id,decision_at:now,version});
}

async function findReviewByRequestId(env, requestId) {
  const all=await listRecords(env, env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || "MMD — Model Review Requests", 500);
  if(!all.ok) return all;
  const matches=all.records.filter(r=>String(r.fields?.request_id||"")===requestId);
  if(matches.length>1) return {ok:false,conflict:true};
  return {ok:true,record:matches[0]||null};
}

async function patchRecord(env, table, recordId, fields) {
  const apiKey=String(env.AIRTABLE_API_KEY||"").trim(), baseId=String(env.AIRTABLE_BASE_ID||"").trim();
  if(!apiKey||!baseId||!table||!recordId) return {ok:false};
  try{
    const res=await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`,{
      method:"PATCH",
      headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},
      body:JSON.stringify({records:[{id:recordId,fields}],typecast:false}),
    });
    return {ok:res.ok};
  }catch{return {ok:false};}
}

function buildMissing(payload, media, telegramConnected = false) {
  const missing = [];
  if (!Array.isArray(payload.changed_fields) || !payload.changed_fields.length) missing.push("changed_fields");
  if (!payload.availability || !payload.availability.availability_status) missing.push("availability_status");
  if (!media.length) missing.push("latest_media");
  if (!telegramConnected) missing.push("telegram_connection");
  return missing;
}

async function listRecords(env, table, maxRecords) {
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  if (!apiKey || !baseId || !table) return {ok:false,records:[]};
  const records=[]; let offset="";
  try {
    do {
      const params=new URLSearchParams({pageSize:"100"});
      if (offset) params.set("offset",offset);
      const res=await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`,{headers:{authorization:`Bearer ${apiKey}`}});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) return {ok:false,records:[]};
      records.push(...(Array.isArray(data.records)?data.records:[]));
      offset=String(data.offset||"");
    } while(offset && records.length<maxRecords);
    return {ok:true,records:records.slice(0,maxRecords)};
  } catch { return {ok:false,records:[]}; }
}

function baseHeaders(){return {"cache-control":"private, no-store","content-type":"application/json; charset=utf-8","x-content-type-options":"nosniff"};}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:baseHeaders()});}
