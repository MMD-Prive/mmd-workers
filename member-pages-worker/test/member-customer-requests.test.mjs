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

async function request(method, body) {
  return new Request("https://mmdbkk.com/member/api/liff/customer-requests", { method, headers:{ origin:"https://mmdbkk.com", cookie:`__Host-mmd_liff_session=${TOKEN}`, "content-type":"application/json" }, body: body ? JSON.stringify(body) : undefined });
}

async function runtime() {
  const sessionKey = await digest(SECRET, `session:${TOKEN}`);
  const records = [];
  return {
    env: {
      LIFF_SESSION_SECRET: SECRET,
      LIFF_IDENTITY_KV: new MemoryKv([[`liff:session:${sessionKey}`, JSON.stringify({ line_user_id:LINE_ID, member_exists:true, member_id:"member-1", member_profile:{ display_name:"Tester", membership_status:"active" }, expires_at:Date.now() + 60_000 })]]),
      AIRTABLE_API_KEY:"pat-test", AIRTABLE_BASE_ID:"app-test",
      AIRTABLE_HTTP: { async fetch(input) {
        const req = input instanceof Request ? input : new Request(input);
        const table = decodeURIComponent(new URL(req.url).pathname.split("/").at(-1));
        if (table === "Clients") return Response.json({ records:[{ id:CLIENT_ID, fields:{ line_user_id:LINE_ID } }] });
        if (table === "MMD — Console Inbox" && req.method === "GET") return Response.json({ records });
        if (table === "MMD — Console Inbox" && req.method === "POST") { const fields = (await req.json()).fields; records.push({ id:"recInbox1", fields }); return Response.json({ id:"recInbox1", fields }, { status:201 }); }
        return Response.json({ records:[] });
      } },
    }, records,
  };
}

test("customer request intake requires a verified same-origin member session", async () => {
  const response = await handleMemberCustomerRequest(new Request("https://mmdbkk.com/member/api/liff/customer-requests", { headers:{ origin:"https://mmdbkk.com" } }), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "VERIFIED_MEMBER_SESSION_REQUIRED");
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
