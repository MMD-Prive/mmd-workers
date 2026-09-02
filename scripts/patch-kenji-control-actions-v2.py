from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


# Wire admin-worker action and service-runtime handlers.
path = Path("admin-worker/src/admin-login-hero-worker.js")
text = path.read_text()
text = replace_once(
    text,
    'import { handleKenjiControlRequest, isKenjiControlRequest } from "./kenji-control-endpoints.js";\n',
    'import { handleKenjiControlRequest, isKenjiControlRequest } from "./kenji-control-endpoints.js";\nimport {\n  handleKenjiControlAction,\n  handleKenjiRuntimeStatusRpc,\n  isKenjiControlActionRequest,\n  isKenjiRuntimeStatusRpcRequest,\n} from "./kenji-control-actions.js";\n',
    "admin import",
)
text = replace_once(
    text,
    '''    if (path === KENJI_MODEL_ACCESS_RPC_PATH) {\n      return handleKenjiModelAccessRpc(request, env);\n    }\n\n    if (path === ADMIN_LOGIN_SESSION_PATH && method === "POST") {''',
    '''    if (path === KENJI_MODEL_ACCESS_RPC_PATH) {\n      return handleKenjiModelAccessRpc(request, env);\n    }\n\n    // Service-binding-only runtime controls. This is intentionally handled\n    // before the browser admin gate and performs its own strict service auth.\n    if (isKenjiRuntimeStatusRpcRequest(path, method)) {\n      return handleKenjiRuntimeStatusRpc(request, env);\n    }\n\n    if (path === ADMIN_LOGIN_SESSION_PATH && method === "POST") {''',
    "admin runtime rpc",
)
text = replace_once(
    text,
    '''    request = strictGate.request || request;\n\n    if (isKenjiControlRequest(path, method)) {''',
    '''    request = strictGate.request || request;\n\n    if (isKenjiControlActionRequest(path, method)) {\n      return handleKenjiControlAction(request, env, strictGate.actor);\n    }\n\n    if (isKenjiControlRequest(path, method)) {''',
    "admin action handler",
)
path.write_text(text)


# Wire LINE fail-closed runtime controls.
path = Path("member-dashboard-chat-worker/src/index.js")
text = path.read_text()
text = replace_once(
    text,
    'const KENJI_MODEL_ACCESS_RPC_URL = "https://admin-worker.local/v1/internal/kenji/model-access";\nconst KENJI_MODEL_ACCESS_TIMEOUT_MS = 900;\n',
    'const KENJI_MODEL_ACCESS_RPC_URL = "https://admin-worker.local/v1/internal/kenji/model-access";\nconst KENJI_MODEL_ACCESS_TIMEOUT_MS = 900;\nconst KENJI_RUNTIME_STATUS_RPC_URL = "https://admin-worker.local/v1/internal/kenji/control/runtime/status";\nconst KENJI_RUNTIME_STATUS_TIMEOUT_MS = 700;\n',
    "runtime constants",
)
insert_anchor = 'async function requestKenjiModelAccess(env = {}, lineUserId = "", query = "", verificationEmail = "") {'
runtime_fn = '''export async function requestKenjiRuntimeStatus(env = {}) {\n  const closed = {\n    ok: false,\n    controls: { line_oa_auto_reply: false, model_keyword_auto_reply: false, all_kenji_mutations: false },\n  };\n  if (!env.ADMIN_WORKER?.fetch || !asString(env.INTERNAL_TOKEN)) return closed;\n\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort("kenji_runtime_status_timeout"), KENJI_RUNTIME_STATUS_TIMEOUT_MS);\n  try {\n    const request = new Request(KENJI_RUNTIME_STATUS_RPC_URL, {\n      method: "POST",\n      headers: {\n        authorization: `Bearer ${asString(env.INTERNAL_TOKEN)}`,\n        "content-type": "application/json",\n        "x-mmd-internal-call": "true",\n        "x-mmd-service-binding": "member-dashboard-chat-worker",\n      },\n      body: "{}",\n      signal: controller.signal,\n    });\n    const response = await env.ADMIN_WORKER.fetch(request);\n    if (!response.ok) return closed;\n    const payload = await response.json().catch(() => null);\n    if (!payload || payload.ok !== true || !payload.controls || typeof payload.controls !== "object") return closed;\n    return {\n      ok: true,\n      controls: {\n        line_oa_auto_reply: payload.controls.line_oa_auto_reply === true,\n        model_keyword_auto_reply: payload.controls.model_keyword_auto_reply === true,\n        all_kenji_mutations: payload.controls.all_kenji_mutations === true,\n      },\n    };\n  } catch (_) {\n    return closed;\n  } finally {\n    clearTimeout(timer);\n  }\n}\n\n'''
text = replace_once(text, insert_anchor, runtime_fn + insert_anchor, "runtime function")
text = replace_once(
    text,
    '''  const capabilityDecision = decideKenjiCapability({ text: eventText, intent });\n\n  if (intent === "model_access_verification") {''',
    '''  const capabilityDecision = decideKenjiCapability({ text: eventText, intent });\n  const modelAccessAllowed = options.modelAccessAllowed !== false;\n\n  if (!modelAccessAllowed && (intent === "model_access_verification" || intent === "model_lookup")) {\n    return buildKenjiModelAccessDecision({ status: "silent" });\n  }\n\n  if (intent === "model_access_verification") {''',
    "model access runtime gate",
)
text = replace_once(
    text,
    '''  const events = Array.isArray(body.events) ? body.events : [];\n  const autoReplyEnabled = isEnabled(env.LINE_AUTO_REPLY_ENABLED);\n  const kenjiEnabled = isEnabled(env.LINE_KENJI_AI_ENABLED);\n  const saved = [];''',
    '''  const events = Array.isArray(body.events) ? body.events : [];\n  const runtimeStatus = await requestKenjiRuntimeStatus(env);\n  const runtimeControls = runtimeStatus.controls || {};\n  const runtimeAllKill = !runtimeStatus.ok || runtimeControls.all_kenji_mutations === true;\n  const runtimeLineKill = runtimeAllKill || runtimeControls.line_oa_auto_reply === true;\n  const runtimeModelKill = runtimeAllKill || runtimeControls.model_keyword_auto_reply === true;\n  const autoReplyEnabled = isEnabled(env.LINE_AUTO_REPLY_ENABLED) && !runtimeLineKill;\n  const kenjiEnabled = isEnabled(env.LINE_KENJI_AI_ENABLED);\n  const saved = [];''',
    "webhook runtime status",
)
text = replace_once(
    text,
    '    const needsModelPreflight = Boolean(canGenerateReply && capabilityDecision.capability === KENJI_CAPABILITIES.SAFE_CONVERSATION && isEnabled(env.LINE_KENJI_MODEL_ENABLED));',
    '    const needsModelPreflight = Boolean(canGenerateReply && !runtimeModelKill && capabilityDecision.capability === KENJI_CAPABILITIES.SAFE_CONVERSATION && isEnabled(env.LINE_KENJI_MODEL_ENABLED));',
    "model preflight kill",
)
text = replace_once(
    text,
    '      ? await resolveKenjiLineReply(event, {}, env, { forceReply: autoReplyEnabled, modelEligible: modelPreflight.eligible, deadlineAt: modelDeadlineAt })',
    '      ? await resolveKenjiLineReply(event, {}, env, { forceReply: autoReplyEnabled, modelEligible: modelPreflight.eligible, modelAccessAllowed: !runtimeModelKill, deadlineAt: modelDeadlineAt })',
    "resolve runtime options",
)
text = replace_once(
    text,
    '''      auto_reply_enabled: autoReplyEnabled,\n      per_voice_enabled: kenjiEnabled,''',
    '''      auto_reply_enabled: autoReplyEnabled,\n      per_voice_enabled: kenjiEnabled,\n      runtime_control_ok: runtimeStatus.ok === true,\n      runtime_line_kill: runtimeLineKill,\n      runtime_model_kill: runtimeModelKill,\n      runtime_all_kill: runtimeAllKill,''',
    "runtime telemetry",
)
text = replace_once(
    text,
    '''      replied: Boolean(replyResult?.ok),\n      line_user: Boolean(lineUserId),''',
    '''      replied: Boolean(replyResult?.ok),\n      runtime_control_ok: runtimeStatus.ok === true,\n      runtime_line_kill: runtimeLineKill,\n      runtime_model_kill: runtimeModelKill,\n      runtime_all_kill: runtimeAllKill,\n      line_user: Boolean(lineUserId),''',
    "runtime saved",
)
path.write_text(text)


# Make LINE webhook tests runtime-control aware and add fail-closed coverage.
path = Path("member-dashboard-chat-worker/test/line-webhook.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    '''  LINE_AUTO_REPLY_ENABLED: "true",\n  LINE_KENJI_AI_ENABLED: "true",\n};''',
    '''  LINE_AUTO_REPLY_ENABLED: "true",\n  LINE_KENJI_AI_ENABLED: "true",\n  INTERNAL_TOKEN: "runtime-token",\n  ADMIN_WORKER: {\n    fetch: async () => new Response(JSON.stringify({\n      ok: true,\n      controls: { line_oa_auto_reply: false, model_keyword_auto_reply: false, all_kenji_mutations: false },\n    }), { status: 200, headers: { "content-type": "application/json" } }),\n  },\n};''',
    "line base env",
)
if 'runtime kill switch suppresses LINE replies' not in text:
    text += '''\n\ntest("runtime kill switch suppresses LINE replies", async () => {\n  const originalFetch = globalThis.fetch;\n  const calls = [];\n  globalThis.fetch = async (url, init) => {\n    calls.push({ url: String(url), init });\n    return new Response("{}", { status: 200 });\n  };\n  try {\n    const event = lineTextEvent("สวัสดี", { mode: "active" });\n    const response = await worker.fetch(await signedLineRequest({ events: [event] }), {\n      ...BASE_ENV,\n      LINE_KENJI_MODEL_ENABLED: "false",\n      LINE_KENJI_KNOWLEDGE_ENABLED: "false",\n      ADMIN_WORKER: {\n        fetch: async () => new Response(JSON.stringify({\n          ok: true,\n          controls: { line_oa_auto_reply: true, model_keyword_auto_reply: false, all_kenji_mutations: false },\n        }), { status: 200, headers: { "content-type": "application/json" } }),\n      },\n    });\n    assert.equal(response.status, 200);\n    const payload = await response.json();\n    assert.equal(payload.saved[0].runtime_control_ok, true);\n    assert.equal(payload.saved[0].runtime_line_kill, true);\n    assert.equal(payload.saved[0].replied, false);\n    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 0);\n  } finally {\n    globalThis.fetch = originalFetch;\n  }\n});\n\ntest("runtime control RPC failure fails LINE auto reply closed", async () => {\n  const originalFetch = globalThis.fetch;\n  const calls = [];\n  globalThis.fetch = async (url, init) => {\n    calls.push({ url: String(url), init });\n    return new Response("{}", { status: 200 });\n  };\n  try {\n    const event = lineTextEvent("สวัสดี", { mode: "active" });\n    const response = await worker.fetch(await signedLineRequest({ events: [event] }), {\n      ...BASE_ENV,\n      LINE_KENJI_MODEL_ENABLED: "false",\n      LINE_KENJI_KNOWLEDGE_ENABLED: "false",\n      ADMIN_WORKER: { fetch: async () => { throw new Error("admin unavailable"); } },\n    });\n    assert.equal(response.status, 200);\n    const payload = await response.json();\n    assert.equal(payload.saved[0].runtime_control_ok, false);\n    assert.equal(payload.saved[0].runtime_line_kill, true);\n    assert.equal(payload.saved[0].runtime_all_kill, true);\n    assert.equal(payload.saved[0].replied, false);\n    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 0);\n  } finally {\n    globalThis.fetch = originalFetch;\n  }\n});\n'''
path.write_text(text)


# Add focused CEO action/runtime tests.
Path("admin-worker/kenji-control-actions.test.mjs").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiControlAction,
  handleKenjiRuntimeStatusRpc,
  isKenjiControlActionRequest,
  isKenjiRuntimeStatusRpcRequest,
  KENJI_RUNTIME_STATUS_RPC_PATH,
} from "./src/kenji-control-actions.js";

const ENV = { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "airtable-token", INTERNAL_TOKEN: "internal-token" };
const OWNER = { id: "boss-per", role: "owner" };

function actionRequest(path, body, key = "idem-1") {
  return new Request(`https://mmdbkk.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  });
}

function airtableJson(records = []) {
  return new Response(JSON.stringify({ records }), { status: 200, headers: { "content-type": "application/json" } });
}

function emptyAirtableFetch(extra = {}) {
  return async (url, init = {}) => {
    const value = String(url);
    if (extra.handler) {
      const result = await extra.handler(value, init);
      if (result) return result;
    }
    if ((init.method || "GET") === "GET") return airtableJson([]);
    return new Response(JSON.stringify({ id: "rec-created", fields: {} }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("CEO action and runtime RPC route detection stays narrow", () => {
  assert.equal(isKenjiControlActionRequest("/v1/admin/kenji/control/messages/draft", "POST"), true);
  assert.equal(isKenjiControlActionRequest("/v1/admin/kenji/control/messages/draft", "GET"), false);
  assert.equal(isKenjiControlActionRequest("/v1/admin/kenji/control/runtime", "POST"), false);
  assert.equal(isKenjiRuntimeStatusRpcRequest(KENJI_RUNTIME_STATUS_RPC_PATH, "POST"), true);
  assert.equal(isKenjiRuntimeStatusRpcRequest("/v1/internal/kenji/control/runtime", "POST"), false);
});

test("missing idempotency key fails before Airtable", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return airtableJson([]); };
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "สวัสดีครับ", reason: "review", expected_version: 0 }, ""), ENV, OWNER);
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("unauthorized kill-switch role fails before Airtable", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return airtableJson([]); };
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/runtime/kill-switch", { scope: "line_oa_auto_reply", enabled: true, expected_version: 0, reason: "incident" }), ENV, { id: "reviewer-1", role: "reviewer" });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("runtime status RPC requires service-bound bearer", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return airtableJson([]); };
  try {
    const request = new Request(`https://admin-worker.local${KENJI_RUNTIME_STATUS_RPC_PATH}`, { method: "POST", headers: { authorization: "Bearer wrong", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" } });
    const response = await handleKenjiRuntimeStatusRpc(request, ENV);
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("runtime status RPC projects latest scope booleans only", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const formula = new URL(String(url)).searchParams.get("filterByFormula") || "";
    const enabled = formula.includes("line_oa_auto_reply");
    return airtableJson([{ id: "rec-runtime", fields: { scope: enabled ? "line_oa_auto_reply" : "other", enabled_state: enabled ? "enabled" : "disabled", version: 2, updated_at: "2026-09-02T00:00:00.000Z" } }]);
  };
  try {
    const request = new Request(`https://admin-worker.local${KENJI_RUNTIME_STATUS_RPC_PATH}`, { method: "POST", headers: { authorization: "Bearer internal-token", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" } });
    const response = await handleKenjiRuntimeStatusRpc(request, ENV);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).controls, { line_oa_auto_reply: true, model_keyword_auto_reply: false, all_kenji_mutations: false });
  } finally { globalThis.fetch = originalFetch; }
});

test("same idempotency key with a different payload is a conflict", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes("tblUzZ8ImRZOkks4c") && (init.method || "GET") === "GET") {
      return airtableJson([{ id: "rec-audit", fields: { action_id: "audit-1", idempotency_key: "idem-1", payload_hash: "different", operation: "message_draft", result: "accepted" } }]);
    }
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "สวัสดีครับ", reason: "review", expected_version: 0 }), ENV, OWNER);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "idempotency_conflict");
  } finally { globalThis.fetch = originalFetch; }
});

test("global mutation kill switch blocks mutations fail-closed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch({ handler: async (url, init) => {
    if (url.includes("tblPRUGp6AxWMM5gQ") && (init.method || "GET") === "GET") return airtableJson([{ id: "rec-runtime", fields: { scope: "all_kenji_mutations", enabled_state: "enabled", version: 1 } }]);
    return null;
  }});
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "สวัสดีครับ", reason: "review", expected_version: 0 }), ENV, OWNER);
    assert.equal(response.status, 423);
    assert.equal((await response.json()).error, "kill_switch_active");
  } finally { globalThis.fetch = originalFetch; }
});

test("approval decisions enforce optimistic version and non-final transitions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch({ handler: async (url, init) => {
    if (url.includes("tblJ52hVu0f4uhEmS/recReview") && (init.method || "GET") === "GET") return new Response(JSON.stringify({ id: "recReview", fields: { request_status: "pending_review", version: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    return null;
  }});
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/approvals/recReview/decision", { decision: "approve", expected_version: 1, reason: "reviewed" }), ENV, OWNER);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "version_conflict");
  } finally { globalThis.fetch = originalFetch; }
});

test("final approval state cannot be mutated again", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch({ handler: async (url, init) => {
    if (url.includes("tblJ52hVu0f4uhEmS/recReview") && (init.method || "GET") === "GET") return new Response(JSON.stringify({ id: "recReview", fields: { request_status: "approved", version: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    return null;
  }});
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/approvals/recReview/decision", { decision: "reject", expected_version: 2, reason: "second decision" }), ENV, OWNER);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, "transition_not_allowed");
  } finally { globalThis.fetch = originalFetch; }
});

test("unsafe customer draft stays blocked and send remains unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch();
  try {
    const unsafe = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "Authorization Bearer secret", reason: "review", expected_version: 0 }), ENV, OWNER);
    assert.equal(unsafe.status, 422);
    const send = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft-1/send", { expected_version: 1, reason: "approved" }, "idem-send"), ENV, OWNER);
    assert.equal(send.status, 503);
    assert.equal((await send.json()).error, "mutation_not_ready");
  } finally { globalThis.fetch = originalFetch; }
});
''')


# Root CI includes the new action contract and syntax checks.
path = Path("package.json")
text = path.read_text()
text = replace_once(
    text,
    'node --check admin-worker/src/kenji-model-access-rpc.js && node --check admin-worker/src/kenji-control-endpoints.js',
    'node --check admin-worker/src/kenji-model-access-rpc.js && node --check admin-worker/src/kenji-control-endpoints.js && node --check admin-worker/src/kenji-control-actions.js',
    "root check",
)
text = replace_once(
    text,
    'admin-worker/admin-login-regression-guard.test.mjs"',
    'admin-worker/admin-login-regression-guard.test.mjs admin-worker/kenji-control-actions.test.mjs"',
    "admin tests",
)
path.write_text(text)


# Declare narrow public action route ownership. Approval/conversation actions are
# already covered by the existing query-safe endpoint companions.
path = Path("admin-worker/wrangler.toml")
text = path.read_text()
route_anchor = '# Create Job Link Issuer API. Exact route only so Webflow-owned admin pages stay\n'
route_block = '''# Kenji CEO Control mutation routes not covered by the approval/conversation read companions.\n# Worker handlers remain method/path exact and all browser mutations stay behind admin auth.\n[[routes]]\npattern = "mmdbkk.com/v1/admin/kenji/control/messages*"\nzone_name = "mmdbkk.com"\n\n[[routes]]\npattern = "www.mmdbkk.com/v1/admin/kenji/control/messages*"\nzone_name = "mmdbkk.com"\n\n[[routes]]\npattern = "mmdbkk.com/v1/admin/kenji/control/runtime/kill-switch*"\nzone_name = "mmdbkk.com"\n\n[[routes]]\npattern = "www.mmdbkk.com/v1/admin/kenji/control/runtime/kill-switch*"\nzone_name = "mmdbkk.com"\n\n'''
if 'pattern = "mmdbkk.com/v1/admin/kenji/control/messages*"' not in text:
    text = replace_once(text, route_anchor, route_block + route_anchor, "action routes")
path.write_text(text)


# Mark the contract as implementation-candidate, not production-complete yet.
path = Path("docs/architecture/KENJI_CEO_CONTROL_ACTIONS_CONTRACT_V1.md")
text = path.read_text()
text = text.replace("**Status:** Proposed contract (not yet a production mutation path)", "**Status:** Implementation candidate — production activation requires merged code, QA, deploy and smoke")
if "`expected_version`: `0` for a new draft" not in text:
    text = text.replace("### 5.3 Message draft", "### 5.3 Message draft\n\nFor a new draft, `expected_version` MUST be `0`; the created draft begins at version `1`.")
path.write_text(text)
