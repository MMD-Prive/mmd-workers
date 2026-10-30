import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleBookingModels, isBookingModelsRequest, BOOKING_MODELS_PAGE as PAGE, BOOKING_MODELS_API as API } from "./src/booking-models.js";
import { INTERNAL_PAGES } from "../webflow/global/sigil-internal-workspace-v3.mjs";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";

const env = { ADMIN_LOGIN_CREDENTIAL: "fixture-only-login", AIRTABLE_API_KEY: "fixture-only", AIRTABLE_BASE_ID: "appFixture", AIRTABLE_TABLE_MODELS_ID: "Models", AIRTABLE_TABLE_MODEL_MEDIA_ID: "Media" };
const id = "recPublic000000001", mediaId = "media_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const publicModel = { id, fields: { working_name: "Leo Test", nickname: "ลีโอ", unique_key: "LT01", can_work_public: true, height_cm: 180, weight_kg: 75, body_type: "athletic", skin_tone: "tan", phone: "LEAK_PHONE", private_real_name: "LEAK_REAL_NAME", notes: "LEAK_NOTES" } };
const approved = { id: "recMedia000001", fields: { Model: [id], media_id: mediaId, media_type: "profile_photo", asset_role: "profile_main", public_safe: true, private_safe: false, flash_safe: false, review_status: "approved", media_visibility: "public", r2_bucket: "mmd-models", private_original_key: "models/" + id + "/LEAK_OBJECT", file_type: "image/jpeg" } };
async function setup(t, role = "owner", state = {}) {
  const cookie = "mmd_admin_gate_v1=" + await createCredentialBoundAdminSession(new Request("https://mmdbkk.com"), { id: "fixture-owner", role }, env);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url); calls.push(req);
    assert.equal(url.hostname, "api.airtable.com");
    assert.equal(req.method, "GET", "Manager must never write canonical data");
    const table = url.pathname.split("/")[3];
    if (table === "Models") {
      if (state.modelError) return Response.json({}, { status: 503 });
      if (url.pathname.endsWith("/" + id)) return Response.json(state.model || publicModel);
      return Response.json({ records: state.models || [publicModel], ...(state.offset ? { offset: state.offset } : {}) });
    }
    if (table === "Media") {
      if (state.mediaError) return Response.json({}, {status:503});
      return Response.json({ records: state.media || [approved] });
    }
    throw new Error("unexpected read");
  });
  const request = (path = API, init = {}) => new Request("https://mmdbkk.com" + path, { ...init, headers: { cookie, ...init.headers } });
  return { request, calls };
}

test("only exact manager paths are handled", () => {
  for (const path of [PAGE,PAGE+"/",API,API+"/"+id+"/cover"]) assert.equal(isBookingModelsRequest(new Request("https://mmdbkk.com"+path)), true);
  for (const path of [PAGE+"-other",API+"-other","/internal/admin/jobs"]) assert.equal(isBookingModelsRequest(new Request("https://mmdbkk.com"+path)), false);
});
test("anonymous, forged identity and Model sessions cannot read inventory or media", async t => {
  const {calls} = await setup(t);
  for (const path of [API, API+"/"+id+"/cover?media_id="+mediaId]) for (const headers of [{},{"x-mmd-admin-role":"owner"},{cookie:"mmd_model_session_v1=forged"}]) {
    const r = await handleBookingModels(new Request("https://mmdbkk.com"+path,{headers}),env); assert.equal(r.status,401);
  }
  const page = await handleBookingModels(new Request("https://mmdbkk.com"+PAGE+"?q=private"),env);
  assert.equal(page.status,303); assert.equal(page.headers.get("location"),"/internal/admin/login?next="+encodeURIComponent(PAGE));
  assert.equal(calls.length,0);
});
test("valid non-admin roles, foreign origins and service credentials are rejected without backend reads", async t => {
  const {request,calls} = await setup(t,"model");
  assert.equal((await handleBookingModels(request(),env)).status,403);
  const owner = await setup(t);
  for (const [name,value] of [["Origin","https://evil.example"],["Authorization","Bearer guessed"],["X-Confirm-Key","guessed"]]) assert.equal((await handleBookingModels(owner.request(API,{headers:{[name]:value}}),env)).status,403);
  assert.equal((await handleBookingModels(new Request("https://preview.example"+API),env)).status,403);
  assert.equal(calls.length,0); assert.equal(owner.calls.length,0);
});
test("owner page is protected, no-store and uses nonced scripts with no embedded customer data", async t => {
  const {request,calls} = await setup(t); const r=await handleBookingModels(request(PAGE),env), html=await r.text();
  assert.equal(r.status,200);assert.match(r.headers.get("content-security-policy"),/frame-ancestors 'none'/);assert.match(r.headers.get("cache-control"),/no-store/);assert.match(html,/<html lang="th">/);assert.match(html,/nonce="/);assert.doesNotMatch(html,/localStorage|sessionStorage|LEAK_/);
  assert.equal(calls.length,0); const head=await handleBookingModels(request(PAGE,{method:"HEAD"}),env);assert.equal(await head.text(),"");
});
test("admin search returns only bounded profile fields and protected cover IDs", async t => {
  const {request}=await setup(t);const r=await handleBookingModels(request(),env), b=await r.json();
  assert.equal(r.status,200);assert.equal(b.items[0].name,"Leo Test");assert.equal(b.items[0].height_cm,180);
  assert.equal(b.items[0].cover_media_id,mediaId);assert.equal(b.items[0].public_profile_allowed,true);
  assert.equal(b.checks,"profile_only"); assert.doesNotMatch(JSON.stringify(b),/LEAK_|api_key|private_original_key|https?:\/\//);
});
test("search escapes formula literals and carries the next page without scanning unrelated fields", async t => {
  const {request,calls}=await setup(t,"owner",{offset:"itrNext/recNext"});
  const q='ลีโอ"},{phone}';
  const b=await(await handleBookingModels(request(API+"?q="+encodeURIComponent(q)),env)).json();
  const formula=new URL(calls[0].url).searchParams.get("filterByFormula");
  assert.ok(formula.includes(JSON.stringify(q.toLowerCase())));assert.match(formula,/LOWER\(\{unique_key\}\)/);assert.equal(b.next_cursor,"itrNext/recNext");
  const next=await handleBookingModels(request(API+"?cursor=itrOther%2FrecOther"),env);assert.equal(next.status,200);
  assert.equal(new URL(calls.at(-2).url).searchParams.get("offset"),"itrOther/recOther");
});
test("invalid query, cursor and mutation requests never reach Airtable", async t => {
  const {request,calls}=await setup(t);
  for(const query of ["q="+"x".repeat(81),"audience=secret","attention=secret","cursor=%3Cscript%3E","q=%00"]) assert.equal((await handleBookingModels(request(API+"?"+query),env)).status,400);
  assert.equal((await handleBookingModels(request(API,{method:"POST",body:"{}"}),env)).status,405);assert.equal(calls.length,0);
});
test("visibility and withheld Models stay diagnostic-only; no cover is disclosed", async t => {
  const hidden={...publicModel,fields:{...publicModel.fields,status:"hidden",can_work_private:true,private_tier:"premium"}};
  const {request}=await setup(t,"owner",{models:[hidden]});const b=await(await handleBookingModels(request(),env)).json();
  assert.equal(b.items[0].public_profile_allowed,false);assert.equal(b.items[0].cover_media_id,"");assert.ok(b.items[0].reasons.includes("inactive"));assert.ok(b.items[0].reasons.includes("private_delivery_pending"));
});
test("Private inventory is visible only to admin and never presented as customer access", async t => {
  const privateModel={id:"recPrivate000001",fields:{working_name:"Private Test",can_work_private:true,private_tier:"premium"}};
  const {request}=await setup(t,"owner",{models:[publicModel,privateModel]});const b=await(await handleBookingModels(request(API+"?audience=private"),env)).json();
  assert.equal(b.items.length,1);assert.equal(b.items[0].name,"Private Test");assert.equal(b.items[0].cover_media_id,"");assert.ok(b.items[0].reasons.includes("private_delivery_pending"));assert.equal(Object.hasOwn(b.items[0],"can_search_private_models"),false);
});
test("missing-cover and policy filters preserve the pagination cursor even on empty pages", async t => {
  const {request}=await setup(t,"owner",{offset:"itrNext/recNext"});
  for(const attention of ["missing_cover","policy_review"]) {const b=await(await handleBookingModels(request(API+"?attention="+attention),env)).json();assert.deepEqual(b.items,[]);assert.equal(b.next_cursor,"itrNext/recNext");}
});
test("unavailable media is distinct from no approved cover; profile failure never becomes an empty success", async t => {
  const a=await setup(t,"owner",{mediaError:true});const b=await(await handleBookingModels(a.request(),env)).json();assert.equal(b.media_status,"unavailable");assert.equal(b.items[0].cover_status,"unavailable");
  const z=await setup(t,"owner",{modelError:true});assert.equal((await handleBookingModels(z.request(),env)).status,503);
});
test("looping model cursors fail instead of appending duplicate inventory", async t => {
  const {request}=await setup(t,"owner",{offset:"itrLoop"});assert.equal((await handleBookingModels(request(API+"?cursor=itrLoop"),env)).status,503);
});
test("cover rechecks current visibility and refuses a changed main photo without reading R2", async t => {
  const hidden={...publicModel,fields:{...publicModel.fields,status:"hidden"}};
  const a=await setup(t,"owner",{model:hidden});assert.equal((await handleBookingModels(a.request(API+"/"+id+"/cover?media_id="+mediaId),env)).status,404);
  const b=await setup(t,"owner",{media:[]});assert.equal((await handleBookingModels(b.request(API+"/"+id+"/cover?media_id="+mediaId),env)).status,404);
});
test("the deployed entry and exact route list include both manager surfaces", async()=>{
  const [entry,config,workflow]=await Promise.all(["admin-worker/src/admin-login-hero-worker.js","admin-worker/wrangler.toml",".github/workflows/deploy-admin-worker.yml"].map(path=>readFile(new URL("../"+path,import.meta.url),"utf8")));
  assert.match(entry,/isBookingModelsRequest\(request\).*handleBookingModels\(request, runtimeEnv\)/);
  for(const path of [PAGE+"*",API+"*"]) {for(const host of ["mmdbkk.com","www.mmdbkk.com"]) assert.ok(config.includes('pattern = "'+host+path+'"'));assert.ok(workflow.includes('"'+path+'"'));}
});

test("approved cover streams only after current policy and object metadata verification", async t => {
  const asset={...approved,fields:{...approved.fields,file_size_bytes:3}};
  const {request}=await setup(t,"owner",{media:[asset]});
  let reads=0;
  const runtime={...env,MMD_MODEL_ASSETS:{get:async()=>{reads++;return {size:3,body:new Response("jpg").body,httpMetadata:{contentType:"image/jpeg"},customMetadata:{media_id:mediaId,model_record_id:id,sha256:"a".repeat(64)}};}}};
  const response=await handleBookingModels(request(API+"/"+id+"/cover?media_id="+mediaId),runtime);
  assert.equal(response.status,200);assert.equal(await response.text(),"jpg");assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(reads,1);
});
test("a pending or private-marked primary asset cannot be shown as a Public cover", async t => {
  for(const fields of [{review_status:"pending_review"},{private_safe:true},{media_visibility:"private"}]){
    const {request}=await setup(t,"owner",{media:[{...approved,fields:{...approved.fields,...fields}}]});
    const b=await(await handleBookingModels(request(),env)).json();assert.equal(b.items[0].cover_media_id,"");
    assert.equal((await handleBookingModels(request(API+"/"+id+"/cover?media_id="+mediaId),env)).status,404);
  }
});

test("the admin directory exposes one searchable entry and login can return to the manager", async()=>{
  assert.equal(INTERNAL_PAGES.filter(item=>item.path===PAGE).length,1);
  const core=await readFile(new URL("./src/admin-login-hero-worker-core.js",import.meta.url),"utf8");
  const allowlist=core.slice(core.indexOf("const ALLOWED_NEXT_PATHS = ["),core.indexOf("export function normalizeNext"));
  assert.ok(allowlist.includes('"'+PAGE+'"'));
});
