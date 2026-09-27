import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberCustomerRequest } from "../src/member-customer-requests.js";

const SECRET = "customer-request-test-secret-0123456789";
const TOKEN = "customer-request-session-token";
const LINE_ID = `U${"a".repeat(32)}`;
const CLIENT_ID = "recCustomerRequest001";

async function digest(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

class MemoryKv { constructor(entries) { this.entries = new Map(entries); } async get(key, type) { const value = this.entries.get(key); return value == null ? null : type === "json" ? JSON.parse(value) : value; } }

async function request(method, body, { origin = "https://mmdbkk.com", url = "https://mmdbkk.com/member/api/liff/customer-requests" } = {}) {
  const headers = { cookie:`__Host-mmd_liff_session=${TOKEN}`, "content-type":"application/json" };
  if (origin !== null) headers.origin = origin;
  return new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function runtime() {
  const sessionKey = await digest(SECRET, `session:${TOKEN}`);
  const records = [];
  const airtableQueries = [];
  return {
    env: {
      LIFF_SESSION_SECRET: SECRET,
      LIFF_IDENTITY_KV: new MemoryKv([[`liff:session:${sessionKey}`, JSON.stringify({ line_user_id:LINE_ID, member_exists:true, member_id:"member-1", member_profile:{ display_name:"Tester", membership_status:"active" }, expires_at:Date.now() + 60_000 })]]),
      AIRTABLE_API_KEY:"pat-test", AIRTABLE_BASE_ID:"app-test",
      AIRTABLE_HTTP: { async fetch(input) {
        const req = input instanceof Request ? input : new Request(input);
        airtableQueries.push(new URL(req.url));
        const table = decodeURIComponent(new URL(req.url).pathname.split("/").at(-1));
        if (table === "Clients") return Response.json({ records:[{ id:CLIENT_ID, fields:{ line_user_id:LINE_ID } }] });
        if (table === "MMD — Console Inbox" && req.method === "GET") {
          const filter = new URL(req.url).searchParams.get("filterByFormula") || "";
          return Response.json({ records:records.filter((record) => filter.includes(`'${record.fields.line_user_id}'`)) });
        }
        if (table === "MMD — Console Inbox" && req.method === "POST") { const fields = (await req.json()).fields; records.push({ id:"recInbox1", fields }); return Response.json({ id:"recInbox1", fields }, { status:201 }); }
        return Response.json({ records:[] });
      } },
    }, records, airtableQueries,
  };
}

test("customer request intake requires a verified same-origin member session", async () => {
  const response = await handleMemberCustomerRequest(new Request("https://mmdbkk.com/member/api/liff/customer-requests", { headers:{ origin:"https://mmdbkk.com" } }), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "VERIFIED_MEMBER_SESSION_REQUIRED");
});

test("canonical origin-less GET is allowed while writes and non-canonical hosts remain same-origin only", async () => {
  const { env } = await runtime();
  const read = await handleMemberCustomerRequest(await request("GET", null, { origin:null }), env);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store, private");
  const head = await handleMemberCustomerRequest(await request("HEAD", null, { origin:null }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const write = await handleMemberCustomerRequest(await request("POST", { request_id:"req_originlesswrite", request_type:"profile_update", email:"member@example.com" }, { origin:null }), env);
  assert.equal(write.status, 403);
  const foreign = await handleMemberCustomerRequest(await request("GET", null, { origin:null, url:"https://example.com/member/api/liff/customer-requests" }), env);
  assert.equal(foreign.status, 403);
  const injected = await handleMemberCustomerRequest(await request("GET", null, { origin:null, url:"https://mmdbkk.com/member/api/liff/customer-requests?line_user_id=forged" }), env);
  assert.equal(injected.status, 400);
});

test("Airtable applies the customer-request namespace before the bounded result limit", async () => {
  const { env, airtableQueries } = await runtime();
  const response = await handleMemberCustomerRequest(await request("GET", null, { origin:null }), env);
  assert.equal(response.status, 200);
  const inboxQuery = airtableQueries.find((url) => decodeURIComponent(url.pathname).includes("MMD — Console Inbox"));
  const formula = inboxQuery?.searchParams.get("filterByFormula") || "";
  assert.match(formula, /\{line_user_id\}/);
  assert.match(formula, /\{source\}='my_mmd_liff'/);
  assert.match(formula, /\{intent\}='your_request'/);
  assert.match(formula, /\{intent\}='saved_model'/);
  assert.match(formula, /\{intent\}='profile_update'/);
  assert.equal(inboxQuery?.searchParams.get("maxRecords"), "50");
});

test("Your Request queues private metadata once and returns a customer-safe projection", async () => {
  const { env, records } = await runtime();
  const payload = { request_id:"req_abcdefghijkl", request_type:"your_request", model_name:"Example model", model_social:"https://instagram.com/example https://tiktok.com/@example", audience:"private", reason:"อยากให้ช่วยตามหา" };
  const first = await handleMemberCustomerRequest(await request("POST", payload), env);
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.idempotent, false);
  assert.deepEqual({ ...firstBody.item, created_at:Boolean(firstBody.item.created_at) }, { request_id:"req_abcdefghijkl", request_type:"your_request", status:"received", created_at:true, model_name:"Example model", audience:"private", action:null });
  assert.equal(records.length, 1);
  const stored = JSON.parse(records[0].fields.payload_json);
  assert.equal(stored.visibility, "internal_only");
  assert.equal(stored.customer.line_user_id, undefined);
  assert.match(stored.model.social, /instagram/);
  const second = await handleMemberCustomerRequest(await request("POST", payload), env);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).idempotent, true);
  assert.equal(records.length, 1);
});

test("profile updates are review requests and reject empty writes", async () => {
  const { env, records } = await runtime();
  const empty = await handleMemberCustomerRequest(await request("POST", { request_id:"req_abcdefghijkm", request_type:"profile_update" }), env);
  assert.equal(empty.status, 400);
  const response = await handleMemberCustomerRequest(await request("POST", { request_id:"req_abcdefghijkm", request_type:"profile_update", email:"member@example.com", telegram_username:"member_test", preferences:"ชอบงานเช้า" }), env);
  assert.equal(response.status, 201);
  const stored = JSON.parse(records[0].fields.payload_json);
  assert.equal(stored.status, "reviewing");
  assert.equal(stored.customer.email, "member@example.com");
  assert.equal(stored.visibility, "internal_only");
});

test("internal handoff stays service-bound and exposes only the customer-safe projection", async () => {
  const { env, records } = await runtime();
  const otherLineId = `U${"b".repeat(32)}`;
  records.push({ id:"recInboxSafe", fields:{
    line_user_id:LINE_ID, source:"my_mmd_liff", intent:"your_request",
    payload_json:JSON.stringify({ schema:"mmd_customer_request_v1", request_id:"req_internalhandoff", request_type:"your_request", status:"received", created_at:new Date().toISOString(), canonical_client_id:CLIENT_ID, visibility:"internal_only", customer:{ email:"private@example.com" }, model:{ display_name:"Requested model", audience:"private", reason:"private reason" }, evidence_ids:[] }),
  } });
  records.push({ id:"recInboxOther", fields:{
    line_user_id:otherLineId, source:"my_mmd_liff", intent:"your_request",
    payload_json:JSON.stringify({ schema:"mmd_customer_request_v1", request_id:"req_othercustomer", request_type:"your_request", status:"received", created_at:new Date().toISOString(), canonical_client_id:"recOtherClient0001", visibility:"internal_only", customer:{}, model:{ display_name:"Other customer model", audience:"public", reason:"must not cross scope" }, evidence_ids:[] }),
  } });
  const url = "https://member-pages-worker.internal/__internal/admin/my-mmd/customer-requests";
  const denied = await handleMemberCustomerRequest(new Request(url, { method:"POST", body:JSON.stringify({ line_user_id:LINE_ID }) }), env);
  assert.equal(denied.status, 404);
  const allowed = await handleMemberCustomerRequest(new Request(url, { method:"POST", headers:{ "content-type":"application/json", "x-mmd-internal-call":"true", "x-mmd-service-binding":"admin-worker" }, body:JSON.stringify({ line_user_id:LINE_ID }) }), env);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("cache-control"), "no-store, private");
  const body = await allowed.json();
  assert.deepEqual(body.items.map((item) => item.request_id), ["req_internalhandoff"]);
  assert.doesNotMatch(JSON.stringify(body), /req_othercustomer|Other customer model/);
  assert.doesNotMatch(JSON.stringify(body), /private@example\.com|private reason|canonical_client_id|evidence_ids/);
});

test("missing private evidence fails closed without creating an inbox record", async () => {
  const { env, records } = await runtime();
  env.CUSTOMER_REQUEST_EVIDENCE = { async head() { return null; }, async get() { return null; } };
  const response = await handleMemberCustomerRequest(await request("POST", { request_id:"req_missingevidence", request_type:"your_request", model_name:"Example", reason:"Please find him", evidence_ids:[`evidence_${"a".repeat(32)}`] }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "EVIDENCE_UNAVAILABLE");
  assert.equal(records.length, 0);
});
