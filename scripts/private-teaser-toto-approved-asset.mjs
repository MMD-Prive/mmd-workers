import process from "node:process";

const env = process.env;
for (const key of ["ADMIN_LOGIN_CREDENTIAL", "AIRTABLE_API_KEY", "GITHUB_TOKEN", "GITHUB_REPOSITORY"]) {
  if (!String(env[key] || "").trim()) throw new Error(`${key} is required`);
}
for (const secret of [env.ADMIN_LOGIN_CREDENTIAL, env.AIRTABLE_API_KEY, env.GITHUB_TOKEN]) {
  console.log(`::add-mask::${secret}`);
}

const ORIGIN = env.ORIGIN || "https://mmdbkk.com";
const BASE = env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const MODELS = env.MODELS_TABLE || "tblI4B0bI446vp9GX";
const MEDIA = env.MEDIA_TABLE || "tblrpQXhHnbTU9RhW";
const GRANTS = env.GRANTS_TABLE || "tblbP1csaTYfffS01";
const CONSUMPTION = env.CONSUMPTION_TABLE || "tblcjjCW0pXvlhNQQ";
const INGEST_CAPABILITIES = env.INGEST_CAPABILITIES_TABLE || "tbldR4n2KP5fF0Zxk";
const MODEL_KEY = env.MODEL_UNIQUE_KEY || "toto";

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
async function airtable(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable HTTP ${response.status}`);
  return body;
}
async function listByFormula(table, formula, fields=[]) {
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize","100");
  url.searchParams.set("filterByFormula",formula);
  for (const field of fields) url.searchParams.append("fields[]",field);
  return (await airtable(url)).records || [];
}
async function allRecords(table, fields=[]) {
  const records=[];
  let offset="";
  for(let page=0;page<25;page+=1){
    const url=new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize","100");
    for(const field of fields) url.searchParams.append("fields[]",field);
    if(offset) url.searchParams.set("offset",offset);
    const body=await airtable(url);
    records.push(...(body.records||[]));
    offset=String(body.offset||"");
    if(!offset) break;
  }
  return records;
}
async function readRecord(table,id) {
  return airtable(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
}
function getCookie(response) {
  const rows = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  for (const row of rows) {
    const first = String(row).split(";")[0].trim();
    if (first.startsWith("mmd_admin_gate_v1=")) return first;
  }
  return "";
}
async function adminLogin() {
  const response = await fetch(`${ORIGIN}/internal/admin/login/session`, {
    method:"POST",
    redirect:"manual",
    headers:{
      Origin:ORIGIN,
      "Content-Type":"application/x-www-form-urlencoded",
    },
    body:new URLSearchParams({
      credential:env.ADMIN_LOGIN_CREDENTIAL,
      next:"/internal/admin/mmd-review",
    }),
  });
  if (response.status !== 303) throw new Error(`owner login failed HTTP ${response.status}`);
  const cookie=getCookie(response);
  if (!cookie) throw new Error("owner admin cookie missing");
  console.log(`::add-mask::${cookie}`);
  return cookie;
}
async function postJson(path,cookie,payload) {
  const response=await fetch(`${ORIGIN}${path}`,{
    method:"POST",
    headers:{
      Origin:ORIGIN,
      Cookie:cookie,
      Accept:"application/json",
      "Content-Type":"application/json",
    },
    body:JSON.stringify(payload),
  });
  const body=await response.json().catch(()=>({}));
  return {response,body};
}
async function postReceipt(result) {
  const body = [
    "## ✅ Private Teaser Viewer V1 — TOTO APPROVED ASSET READY",
    "",
    `- source_sha: \`${env.GITHUB_SHA}\``,
    `- checked_at: \`${new Date().toISOString()}\``,
    "- canonical model: `toto`",
    `- import action: \`${result.action}\``,
    "- source: approved Model Drive folder + owner consent note",
    "- private R2: verified",
    "- review_status: `approved`",
    "- private_safe: `true`",
    "- teaser_safe: `true`",
    "- public_safe: `false`",
    "- grants created by asset operation: `0`",
    "- consumption rows created by asset operation: `0`",
    "- filename, Drive IDs, R2 key, media bytes: not recorded in receipt",
  ].join("\n");
  const response=await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/325/comments`,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${env.GITHUB_TOKEN}`,
      Accept:"application/vnd.github+json",
      "Content-Type":"application/json",
    },
    body:JSON.stringify({body}),
  });
  if(!response.ok) throw new Error(`receipt failed HTTP ${response.status}`);
}

const models=await listByFormula(
  MODELS,
  `{unique_key}='${escapeFormula(MODEL_KEY)}'`,
  ["working_name","unique_key","notes","drive_folder_id","folder_approval_status"]
);
if(models.length!==1) throw new Error(`canonical model lookup must resolve exactly one record; got ${models.length}`);
const model=models[0], mf=model.fields||{};
console.log(`::add-mask::${model.id}`);
if(String(mf.folder_approval_status||"")!=="Approved Folder Inventory") throw new Error("model Drive folder is not approved inventory");
if(!/^[A-Za-z0-9_-]{10,180}$/.test(String(mf.drive_folder_id||""))) throw new Error("canonical model Drive folder ID missing");

const notes=String(mf.notes||"");
if(!/private\s+teaser/i.test(notes) || !/verified\s*line|line[-\s]*verified/i.test(notes)) {
  throw new Error("canonical owner consent note is incomplete");
}
const filenameMatch=notes.match(/\bfile\s+(.+?):\s*verified\s*line/i);
if(!filenameMatch?.[1]) throw new Error("approved source filename is not recoverable from owner consent note");
const fileName=filenameMatch[1].trim();
if(!fileName || /[\x00-\x1f/\\]/.test(fileName)) throw new Error("approved source filename is invalid");
console.log(`::add-mask::${fileName}`);

const existing=(await allRecords(
  MEDIA,
  ["Model","file_name","review_status","teaser_safe","private_safe","flash_safe","public_safe","r2_bucket","media_id"]
)).filter((record)=>Array.isArray(record.fields?.Model) &&
  record.fields.Model.length===1 &&
  record.fields.Model[0]===model.id &&
  String(record.fields?.file_name||"")===fileName);
if(existing.length>1) throw new Error(`duplicate exact private-media candidates exist; got ${existing.length}`);

let mediaRecord=existing[0]||null;
let action="existing";
const alreadyReady=mediaRecord &&
  mediaRecord.fields?.review_status==="approved" &&
  mediaRecord.fields?.teaser_safe===true &&
  mediaRecord.fields?.private_safe===true &&
  mediaRecord.fields?.flash_safe===true &&
  mediaRecord.fields?.public_safe!==true &&
  mediaRecord.fields?.r2_bucket==="mmd-private-model-media";

let cookie="";
if(!alreadyReady){
  cookie=await adminLogin();

  if(!mediaRecord){
    const caps=(await allRecords(
      INGEST_CAPABILITIES,
      ["capability_id","model_record_id","file_name","status","expires_at","source_attachment"]
    )).filter((record)=>{
      const cf=record.fields||{};
      return cf.model_record_id===model.id &&
        cf.file_name===fileName &&
        cf.status==="ready" &&
        Date.parse(String(cf.expires_at||""))>Date.now() &&
        Array.isArray(cf.source_attachment) &&
        cf.source_attachment.length===1;
    });
    if(caps.length>1) throw new Error(`multiple ready staged ingest capabilities exist; got ${caps.length}`);
    if(caps.length===1){
      const capabilityId=String(caps[0].fields?.capability_id||"");
      console.log(`::add-mask::${capabilityId}`);
      const staged=await postJson("/v1/admin/private-media/ingest-staged",cookie,{capability_id:capabilityId});
      if(staged.response.status!==200 || staged.body?.ok!==true || !/^rec[A-Za-z0-9]+$/.test(String(staged.body?.media_asset_id||""))) {
        throw new Error(`staged private ingest failed HTTP ${staged.response.status} ${JSON.stringify(staged.body)}`);
      }
      mediaRecord=await readRecord(MEDIA,staged.body.media_asset_id);
      action="staged_imported_and_approved";
    }else{
      const imported=await postJson("/v1/admin/private-media/import-approved-drive",cookie,{
        model_id:model.id,
        file_name:fileName,
      });
      if(imported.response.status!==200 || imported.body?.ok!==true || !/^rec[A-Za-z0-9]+$/.test(String(imported.body?.media_asset_id||""))) {
        throw new Error(`approved Drive import failed HTTP ${imported.response.status} ${JSON.stringify(imported.body)}`);
      }
      mediaRecord=await readRecord(MEDIA,imported.body.media_asset_id);
      action="imported_and_approved";
    }
  } else {
    action="existing_pending_approved";
  }

  const state=String(mediaRecord.fields?.review_status||"");
  if(state!=="pending_review") throw new Error(`existing exact media is not reviewable: ${state}`);

  const reviewResponse=await fetch(`${ORIGIN}/v1/admin/private-media/file`,{
    method:"POST",
    headers:{
      Origin:ORIGIN,
      Cookie:cookie,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({model_id:model.id,media_asset_id:mediaRecord.id}),
  });
  const bytes=new Uint8Array(await reviewResponse.arrayBuffer());
  const digest=reviewResponse.headers.get("x-mmd-media-sha256")||"";
  if(reviewResponse.status!==200 || bytes.length<1 || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("owner review read-back failed");

  const decision=await postJson("/v1/admin/private-media/decision",cookie,{
    model_id:model.id,
    media_asset_id:mediaRecord.id,
    expected_status:"pending_review",
    media_sha256:digest,
    decision:"approve",
    teaser_safe:true,
    note:"Owner-approved canonical Private Teaser asset from approved Model Drive consent record.",
  });
  if(decision.response.status!==200 || decision.body?.ok!==true || decision.body?.teaser_safe!==true) {
    throw new Error(`Private Teaser approval failed HTTP ${decision.response.status} ${JSON.stringify(decision.body)}`);
  }
}

mediaRecord=await readRecord(MEDIA,mediaRecord.id);
const f=mediaRecord.fields||{};
const expected = {
  model: Array.isArray(f.Model)&&f.Model.length===1&&f.Model[0]===model.id,
  file: String(f.file_name||"")===fileName,
  approved: f.review_status==="approved",
  teaser: f.teaser_safe===true,
  private: f.private_safe===true,
  flash: f.flash_safe===true,
  publicLocked: f.public_safe!==true,
  privateBucket: f.r2_bucket==="mmd-private-model-media",
};
for(const [key,value] of Object.entries(expected)) if(!value) throw new Error(`post-approval verification failed: ${key}`);

const grants=(await allRecords(GRANTS,["Media Asset","grant_status"]))
  .filter((record)=>Array.isArray(record.fields?.["Media Asset"]) && record.fields["Media Asset"].includes(mediaRecord.id));
const logs=(await allRecords(CONSUMPTION,["Media Asset","outcome"]))
  .filter((record)=>Array.isArray(record.fields?.["Media Asset"]) && record.fields["Media Asset"].includes(mediaRecord.id));
if(grants.length!==0) throw new Error(`asset preparation unexpectedly has grants: ${grants.length}`);
if(logs.length!==0) throw new Error(`asset preparation unexpectedly has consumption rows: ${logs.length}`);

await postReceipt({action});
console.log(`PRIVATE_TEASER_TOTO_ASSET=READY action=${action}`);
