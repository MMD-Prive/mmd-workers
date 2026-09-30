import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_RECONFIRM_OWNER_BASE, SMOKE_CONFIRM, buildPreview, buildStatus, handleModelReconfirmOwnerRequest, isModelReconfirmOwnerRequest,
} from "./src/model-reconfirm-owner.js";
import entry from "./src/admin-login-hero-worker.js";

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`REAL_NETWORK_CALL_BLOCKED ${String(url?.url || url)}`); };
test.after(() => { globalThis.fetch = realFetch; });

const NOW = Date.parse("2026-09-30T16:05:00+07:00");
const CHAT = "-5500000009"; // synthetic
const BASE = `https://mmdbkk.com${MODEL_RECONFIRM_OWNER_BASE}`;
const owner = async () => ({ id: "per", role: "owner" });
const admin = async () => ({ id: "staff", role: "admin" });
const nobody = async () => null;
const env = (o = {}) => ({ MODEL_RECONFIRM_GUARD_V2: "false", MODEL_RECONFIRM_OWNER_CHAT_ID: CHAT, TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/send", AUTH_SERVICE_EVENTS_TO_TELEGRAM: "svc", ...o });
const call = (action, method, envv, deps, body) => handleModelReconfirmOwnerRequest(new Request(`${BASE}/${action}`, { method, body: body ? JSON.stringify(body) : undefined }), envv, { now: NOW, ...deps });

test("route matcher accepts only the three owner paths", () => {
  for (const a of ["status", "preview", "smoke"]) assert.equal(isModelReconfirmOwnerRequest(`${MODEL_RECONFIRM_OWNER_BASE}/${a}`), true);
  assert.equal(isModelReconfirmOwnerRequest(`${MODEL_RECONFIRM_OWNER_BASE}/run`), false);
  assert.equal(isModelReconfirmOwnerRequest("/v1/admin/job/create"), false);
});

test("auth: no session 401, non-owner 403, wrong method 405", async () => {
  for (const [action, method] of [["status", "GET"], ["preview", "GET"], ["smoke", "POST"]]) {
    assert.equal((await call(action, method, env(), { readActor: nobody })).status, 401, `${action} unauth`);
    assert.equal((await call(action, method, env(), { readActor: admin })).status, 403, `${action} admin`);
  }
  assert.equal((await call("status", "POST", env(), { readActor: owner })).status, 405);
  assert.equal((await call("smoke", "GET", env(), { readActor: owner })).status, 405);
});

test("the real entry worker routes the path and rejects an unauthenticated caller", async () => {
  const res = await entry.fetch(new Request(`${BASE}/status`), env(), { waitUntil() {} });
  assert.equal(res.status, 401);
});

test("status is read-only, masks the chat id, and warns when guard is off / destination missing", async () => {
  const res = await call("status", "GET", env(), { readActor: owner });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.read_only, true);
  assert.equal(body.owner_destination.chat_id_masked, "…0009");
  assert.ok(!JSON.stringify(body).includes(CHAT));
  assert.ok(body.warnings.some((w) => /GUARD_V2 is off/.test(w)));
  const empty = buildStatus({}, NOW);
  assert.equal(empty.owner_destination.configured, false);
  assert.ok(empty.warnings.some((w) => /owner_destination_missing/.test(w)));
  assert.equal(buildStatus(env({ MODEL_RECONFIRM_OWNER_CHAT_ID: "", TELEGRAM_CHAT_ID: "-111" }), NOW).owner_destination.configured, false, "generic chat is never used");
});

test("preview is a dry run: tallies decisions, shows owner messages, sends and writes nothing", async () => {
  const items = [
    { record: { id: "rec1", fields: { session_id: "S-OK", job_date: "2026-10-01", model_name: "Ok" } }, decision: { action: "send", reason: "connected" } },
    { record: { id: "rec2", fields: { session_id: "S-NC", job_date: "2026-10-01", model_name: "No Line" } }, decision: { action: "owner_action", reason: "model_not_connected" } },
    { record: { id: "rec3", fields: { session_id: "S-AMB", job_date: "2026-10-01" } }, decision: { action: "review_required", reason: "assigned_model_ambiguous" } },
  ];
  let seen = null;
  const res = await call("preview", "GET", env(), { readActor: owner, collect: async (_e, opts) => { seen = opts; return { ok: true, target_date: "2026-10-01", items }; } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.sends_nothing, true);
  assert.equal(body.writes_nothing, true);
  assert.deepEqual(body.counts, { send: 1, skip: 0, owner_action: 1, review_required: 1 });
  assert.equal(seen.lineTransportReady, true);
  assert.equal(body.items.filter((i) => i.owner_message).length, 2);
  assert.ok(body.items.every((i) => i.session_id_masked.startsWith("…")));
  assert.ok(body.items.every((i) => i.session_id_masked.length <= 5), "list rows carry masked ids; only the owner-only message body holds the full id");
});

test("preview through the real collector uses only GET reads (no PATCH, no LINE, no Telegram)", async () => {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input?.url || input));
    const method = String(init.method || "GET").toUpperCase();
    calls.push(`${method} ${url.hostname}`);
    if (url.hostname !== "api.airtable.com") throw new Error(`UNEXPECTED_FETCH ${url}`);
    if (url.pathname.endsWith("/sessions")) return Response.json({ records: [{ id: "recSESSION0000001", fields: { session_id: "S1", session_state: "confirmed", job_date: "2026-10-01", "Assigned Model": ["recMODELAAAAAAAAAA"] } }] });
    return Response.json({ id: "recMODELAAAAAAAAAA", fields: { line_user_id: "" } });
  };
  const body = await buildPreview({ ...env(), AIRTABLE_BASE_ID: "appTEST", AIRTABLE_API_KEY: "k", AIRTABLE_TABLE_SESSIONS: "sessions", AIRTABLE_TABLE_MODELS: "models" }, NOW);
  assert.equal(body.ok, true);
  assert.equal(body.counts.owner_action, 1);
  assert.ok(calls.every((c) => c.startsWith("GET api.airtable.com")), calls.join(", "));
  globalThis.fetch = async (url) => { throw new Error(`REAL_NETWORK_CALL_BLOCKED ${String(url?.url || url)}`); };
});

test("smoke requires confirm, needs a destination, and sends one short line with no business data", async () => {
  assert.equal((await call("smoke", "POST", env(), { readActor: owner }, {})).status, 400);
  assert.equal((await call("smoke", "POST", env({ MODEL_RECONFIRM_OWNER_CHAT_ID: "" }), { readActor: owner }, { confirm: SMOKE_CONFIRM })).status, 409);
  const sent = [];
  const res = await call("smoke", "POST", env(), { readActor: owner, send: async (dest, payload) => { sent.push({ dest, payload }); return { ok: true }; } }, { confirm: SMOKE_CONFIRM });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dest.chat_id, CHAT);
  assert.doesNotMatch(sent[0].payload.text, /THB|฿|@|https?:|S-\d|rec[A-Za-z0-9]{14}/);
  assert.equal(sent[0].payload.text.split("\n").length, 3, "one short message");
  assert.equal(body.destination.chat_id_masked, "…0009");
  assert.ok(!JSON.stringify(body).includes(CHAT));
  const failed = await call("smoke", "POST", env(), { readActor: owner, send: async () => ({ ok: false, error: "telegram_http_500" }) }, { confirm: SMOKE_CONFIRM });
  assert.equal(failed.status, 502);
});
