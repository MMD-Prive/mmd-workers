import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import vm from "node:vm";
import worker from "../src/index.js";
import { buildMmsHistoryItems, readMmsCustomerHistory } from "../src/mms-customer-history.js";
import { isMmsCustomerHistoryPage } from "../../shared/mms-customer-history-route.mjs";

const CLIENT = "recCLIENT1234567", OTHER = "recOTHER12345678", LINE = `U${"a".repeat(32)}`;
const NOW = new Date("2026-09-10T00:00:00Z");
const session = (id, fields = {}) => ({ id: `rec${id}`, fields: { Client: [CLIENT], session_id: id, job_type: "MMS", job_date: "2026-07-01", "Session Status": "Completed", ...fields } });
const payment = (id, fields = {}) => ({ id: `recPay${id}`, fields: { Client: [CLIENT], session_id: id, "Payment Status": "Paid", import_review_status: "approved", ...fields } });

function envFor(tables = {}) {
  return { AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test-base", AIRTABLE_HTTP: { async fetch(request) {
    const url = new URL(request.url), table = decodeURIComponent(url.pathname.split("/").at(-1));
    const value = tables[table];
    if (typeof value === "function") return value(url);
    return Response.json({ records: value || [] });
  } } };
}

async function authenticatedEnv(tables = {}, overrides = {}) {
  const secret = "test-secret-at-least-thirty-two-characters", token = "a".repeat(64);
  const key = `liff:session:${createHmac("sha256", secret).update(`session:${token}`).digest("hex")}`;
  const data = new Map([[key, JSON.stringify({ line_user_id: LINE, expires_at: Date.now() + 60000, member_exists: false, ...overrides })]]);
  return { token, env: { ...envFor(tables), LINE_LOGIN_CHANNEL_ID: "test-channel",
    MEMBER_STATUS_RESOLVER_SECRET: "test-resolver-secret-at-least-thirty-two-characters", MEMBER_STATUS_RESOLVER: { fetch() { throw Error("unused"); } },
    LIFF_SESSION_SECRET: secret, LIFF_IDENTITY_KV: { async get(k, type) { const v=data.get(k); return !v?null:type==='json'?JSON.parse(v):v; }, async put(k,v) { data.set(k,v); }, async delete(k) { data.delete(k); } } } };
}
const request = (token, suffix="") => new Request(`https://www.mmdbkk.com/member/api/liff/mms/history${suffix}`, { headers: { cookie: `__Host-mmd_liff_session=${token}`, origin: "https://www.mmdbkk.com" } });
const clients = [{ id: CLIENT, fields: { line_user_id: LINE, email: "customer@example.com" } }];

test("MMS history requires exact Client ownership, completed service, approved imports and separate payment verification", () => {
  const items = buildMmsHistoryItems({ clientId: CLIENT, now: NOW,
    sessions: [session("job_one"), session("job_two"), session("job_one"), session("wrong_client", { Client: [OTHER] }),
      session("shared_client", { Client: [CLIENT,OTHER] }), session("no_link", { Client: [] }), session("mmd_job", { job_type: "historical_service" }),
      session("hist_sess_pending", { import_review_status: "pending" }), session("hist_sess_unreviewed"),
      session("future_job", { job_date: "2030-01-01" }), session("cancelled_job", { "Session Status": "Cancelled" }),
      session("hist_sess_old", { job_date: "2021-02-01", import_review_status: "approved" })],
    payments: [payment("job_one"), payment("job_two", { import_review_status: "pending", payment_evidence_source: "imported_history" })] });
  assert.equal(items.length,3);
  assert.equal(items[0].id,"job_one");
  assert.equal(items[0].paymentStatus,"verified");
  assert.equal(items[1].paymentStatus,"checking");
  assert.equal(items[2].occurredAt,"2021-02-01");
  assert.ok(items.every(item => !('Client' in item) && !('notes' in item) && !('email' in item)));
});

test("reader paginates and never displays another Client sharing the same email", async () => {
  let pages=0;
  const env=envFor({ Clients:clients, Sessions:url=>{pages++;return Response.json(url.searchParams.has('offset')
    ?{records:[session('job_own')]}:{records:[session('job_foreign',{Client:[OTHER]})],offset:'page2'});}, Payments:[payment('job_own')] });
  const result=await readMmsCustomerHistory(env,LINE,NOW);
  assert.equal(pages,2);assert.equal(result.state,'ready');assert.deepEqual(result.items.map(x=>x.id),['job_own']);
});

test("a conflicting committed Client on a later identity page fails closed", async () => {
  const env = envFor({ Clients: [], tbl1u0foFBvgFpT9G: (url) => Response.json(url.searchParams.has('offset')
    ? { records: [{ fields: { matched_client: [OTHER] } }] }
    : { records: [{ fields: { matched_client: [CLIENT] } }], offset: 'next' }) });
  const result = await readMmsCustomerHistory(env, LINE, NOW);
  assert.equal(result.state, 'checking');
  assert.deepEqual(result.items, []);
});

test("unmatched identities, pending evidence and upstream errors do not become empty confirmed history",async()=>{
  assert.equal((await readMmsCustomerHistory(envFor({}),LINE,NOW)).state,'checking');
  const env=envFor({Clients:clients,tbl1u0foFBvgFpT9G:[{fields:{import_id:'pending',raw_row_json:JSON.stringify({source_ref:'mms:line_ofc:note-1',raw_note:'PRIVATE NOTE'})}}]});
  const result=await readMmsCustomerHistory(env,LINE,NOW);assert.equal(result.state,'checking');assert.equal(result.pendingReview,true);assert.doesNotMatch(JSON.stringify(result),/PRIVATE NOTE/);
  await assert.rejects(readMmsCustomerHistory(envFor({Clients:clients,Sessions:()=>new Response('{}',{status:503})}),LINE,NOW),/MMS_HISTORY_UNAVAILABLE/);
});

test("authenticated customer needs no paid membership; history rotates session and rejects browser identity",async()=>{
  const {env,token}=await authenticatedEnv({Clients:clients,Sessions:[session('own_history')],Payments:[payment('own_history')]});
  const injected=await worker.fetch(request(token,'?member_ref=someone-else'),env);assert.equal(injected.status,400);
  const response=await worker.fetch(request(token),env);assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.data.items[0].id,'own_history');
  assert.match(response.headers.get('set-cookie'),/__Host-mmd_liff_session=/);assert.match(response.headers.get('cache-control'),/no-store/);
  const replay=await worker.fetch(request(token),env);assert.equal(replay.status,401);
});

test("API fails closed for missing session, foreign Origin, blocked state and upstream failures",async()=>{
  const {env,token}=await authenticatedEnv({Clients:clients});
  assert.equal((await worker.fetch(request('missing'),env)).status,401);
  assert.equal((await worker.fetch(new Request(request(token),{headers:{origin:'https://evil.invalid'}}),env)).status,403);
  const blocked=await authenticatedEnv({Clients:clients},{member_profile:{membership_status:'blocked'}});
  assert.equal((await worker.fetch(request(blocked.token),blocked.env)).status,403);
  const failing=await authenticatedEnv({Clients:clients,Sessions:()=>new Response('{}',{status:503})});
  const response=await worker.fetch(request(failing.token),failing.env);assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'MMS_HISTORY_UNAVAILABLE');
});

test("MMS history shell supports direct and LIFF state entry with no inline customer data",async()=>{
  for(const suffix of ['?view=mms-history','?liff.state=%3Fview%3Dmms-history']){
    const req=new Request(`https://www.mmdbkk.com/member/liff${suffix}`);assert.equal(isMmsCustomerHistoryPage(req),true);
    const response=await worker.fetch(req,{LINE_LIFF_ID:'1234-abcd'});assert.equal(response.status,200);
    const html=await response.text();assert.match(html,/ประวัติการใช้บริการ/);assert.match(html,/credentials:'include'/);
    const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
    for(const source of scripts)new vm.Script(source);
    assert.match(response.headers.get('content-security-policy'),/nonce-/);
  }
  assert.equal(isMmsCustomerHistoryPage(new Request('https://www.mmdbkk.com/my-mmd?view=mms-history')),false);
});
