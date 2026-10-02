// Isolated owner-device harness. No canonical intake or production data writes.
import { handleLineRightsCheck } from "./kenji-line-rights-check.mjs";
import { verifyLineSignature } from "./index.js";
import { KenjiModelIdempotency } from "./kenji-model-idempotency.js";

const clean = value => String(value ?? "").trim();
const json = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const stopped = env => clean(env.LINE_FIXTURE_EMERGENCY_STOP) !== "false";
const SCENARIOS = new Set(["active", "expired", "new_signup", "unknown", "vip", "svip", "black_card"]);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");

export function fixtureTruth(scenario = "unknown") {
  if (!SCENARIOS.has(scenario) || scenario === "unknown") return {};
  const expired = scenario === "expired" || scenario === "new_signup";
  return {
    ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
    membership: { level: ["vip", "svip", "black_card"].includes(scenario) ? scenario : "private_standard", lifecycle: expired ? "expired" : "active", expire_at: scenario === "new_signup" ? "2024-01-01" : expired ? "2026-09-01" : "2028-01-01", member_blocked: false },
    points: { status: "verified", authority: "canonical_paid_points_source_guard_v1", active_points: 123 },
    renewal: scenario === "new_signup" ? { status: "review_required", classification: "new_signup" } : { status: "ready", package_code: "standard", amount_thb: 2500, membership_years: 1, history_status: "verified", discount_verified: true },
  };
}

export function fixtureEnvironmentSafe(env = {}) {
  return env.MMD_FIXTURE_ONLY === "true" && env.LINE_FIXTURE_CHANNEL_ID === "2011839389" && env.LINE_FIXTURE_PROVIDER_ID === "2004492377"
    && !Object.keys(env).some(key => /AIRTABLE|MEMBER_PAGES|ADMIN_WORKER|PAYMENTS_WORKER|TELEGRAM|MMS_WORKER|R2|LINE_SLIP/.test(key));
}

// Shares the production durable claim algorithm, with a dedicated class/namespace.
// Stores synthetic review state and counts only; no raw UID, text or reply token.
export class LineRightsFixtureState extends KenjiModelIdempotency {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/campaign-lead/claim") return super.fetch(request);
    if (request.method !== "POST") return json({ ok: false }, 405);
    const current = await this.state.storage.get("fixture-control") || { scenario: "unknown", all_kenji_mutations: true, line_oa_auto_reply: true, owner_takeover: true };
    if (path === "/fixture/read") return json({ control: current, matrix: await this.state.storage.get("fixture-matrix") || {}, delivered_count: await this.state.storage.get("fixture-delivered") || 0 });
    const body = await request.json().catch(() => null);
    if (!body) return json({ ok: false }, 400);
    if (path === "/fixture/control") {
      const keys = ["scenario", "all_kenji_mutations", "line_oa_auto_reply", "owner_takeover"];
      if (Object.keys(body).some(key => !keys.includes(key)) || !SCENARIOS.has(body.scenario)
        || keys.slice(1).some(key => typeof body[key] !== "boolean")) return json({ ok: false }, 400);
      await this.state.storage.put("fixture-control", body);
      return json({ ok: true, fixture_only: true });
    }
    if (path === "/fixture/matrix") {
      const reason = clean(body.reason);
      if (!reason.startsWith("rights_check:missing:")) return json({ ok: false }, 400);
      await this.state.storage.put("fixture-matrix", { handoff_required: true, handoff_reason: reason.slice(0, 500) });
      return json({ id: "synthetic-owner-review" });
    }
    if (path === "/fixture/delivered") {
      await this.state.storage.transaction(async txn => txn.put("fixture-delivered", (await txn.get("fixture-delivered") || 0) + 1));
      return json({ ok: true });
    }
    return json({ ok: false }, 404);
  }
}

export async function handleFixtureRequest(request, env = {}, transports = {}) {
  if (!fixtureEnvironmentSafe(env)) return json({ ok: false, reason: "fixture_environment_required" }, 503);
  const path = new URL(request.url).pathname;
  if (request.method !== "POST" || !["/webhooks/line", "/fixture/control", "/fixture/receipt"].includes(path)) return json({ ok: false }, 404);
  if (!env.KENJI_MODEL_DEDUPE?.idFromName || !env.KENJI_MODEL_DEDUPE?.get) return json({ ok: false, reason: "fixture_storage_missing" }, 503);
  const hashes = clean(env.KENJI_LINE_RIGHTS_CHECK_PILOT_HASHES).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (hashes.length !== 1 || !/^[a-f0-9]{64}$/.test(hashes[0])) return json({ ok: false, reason: "one_reviewed_owner_required" }, 503);
  const state = env.KENJI_MODEL_DEDUPE.get(env.KENJI_MODEL_DEDUPE.idFromName("fixture-owner-state-v1"));
  const rpc = async (route, body = {}) => {
    const response = await state.fetch(new Request(`https://fixture.internal${route}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(2000) }));
    if (!response.ok) throw new Error("fixture_state_unavailable");
    return response.json();
  };
  const raw = await request.text();
  if (raw.length > 65536) return json({ ok: false }, 413);
  if (path !== "/webhooks/line") {
    // Separate owner control credential; LINE credentials never grant operator access.
    if (!env.LINE_FIXTURE_OPERATOR_TOKEN || request.headers.get("authorization") !== `Bearer ${env.LINE_FIXTURE_OPERATOR_TOKEN}`) return json({ ok: false }, 401);
    if (path === "/fixture/receipt") return json(await rpc("/fixture/read"));
    const body = JSON.parse(raw || "{}");
    return json(await rpc("/fixture/control", body));
  }
  if (!env.LINE_CHANNEL_SECRET || !await verifyLineSignature(raw, request.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET)) return json({ ok: false }, 401);
  const payload = JSON.parse(raw);
  if (!/^U[a-f0-9]{32}$/i.test(clean(env.LINE_FIXTURE_DESTINATION_ID)) || payload.destination !== env.LINE_FIXTURE_DESTINATION_ID) return json({ ok: false, reason: "test_oa_destination_mismatch" }, 403);
  if (!Array.isArray(payload.events) || payload.events.length > 10) return json({ ok: false }, 400);
  const runtime = async () => {
    const { control } = await rpc("/fixture/read");
    return { ok: true, controls: { all_kenji_mutations: stopped(env) || control.all_kenji_mutations !== false, line_oa_auto_reply: stopped(env) || control.line_oa_auto_reply !== false } };
  };
  const services = {
    runtime,
    continuity: async () => ({ matrix: (await rpc("/fixture/read")).matrix }),
    takeover: async () => ({ ok: true, active: (await rpc("/fixture/read")).control.owner_takeover !== false }),
    truth: async () => fixtureTruth((await rpc("/fixture/read")).control.scenario),
    matrix: async ({ decision }) => rpc("/fixture/matrix", { reason: decision.handoff_reason }),
    history: async () => rpc("/fixture/delivered"),
    deliver: async (_, event, text) => {
      if (stopped(env) || !env.LINE_CHANNEL_ACCESS_TOKEN) return false;
      const fresh = await runtime();
      if (fresh.controls.all_kenji_mutations || fresh.controls.line_oa_auto_reply || (await services.takeover()).active) return false;
      const response = await (transports.line || fetch)("https://api.line.me/v2/bot/message/reply", { method: "POST", headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: "text", text: `[STAGING — ข้อมูลจำลอง ไม่ใช่สิทธิ์จริง]\n${text}`.slice(0, 1600) }] }), signal: AbortSignal.timeout(3000) });
      return response.ok;
    },
  };
  for (const event of payload.events) {
    if (event.source?.type !== "user" || await hash(clean(event.source.userId)) !== hashes[0]) continue;
    await handleLineRightsCheck({ env, event, runtime: await runtime(), services });
  }
  return json({ ok: true, fixture_only: true });
}

export default { async fetch(request, env) {
  try { return await handleFixtureRequest(request, env); }
  catch { return json({ ok: false, reason: "fixture_failed_closed" }, 503); }
} };
