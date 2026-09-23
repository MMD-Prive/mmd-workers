import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const ORIGIN = "https://www.mmdbkk.com";
const VERSION = "mmd-rm3-20260923-v4.2";
const credential = String(process.env.ADMIN_LOGIN_CREDENTIAL || "").trim();
assert.ok(credential, "Canonical admin credential is missing");

function safeAdminHandoff(location) {
  if (!location) return false;
  try {
    const target = new URL(location, ORIGIN);
    return target.origin === ORIGIN && !target.username && !target.password && /^\/internal\/admin(?:\/|$)/.test(target.pathname);
  } catch {
    return false;
  }
}

const login = await fetch(`${ORIGIN}/internal/admin/login/session`, {
  method: "POST",
  redirect: "manual",
  signal: AbortSignal.timeout(20000),
  headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ credential, next: "/internal/admin" }),
});
const location = login.headers.get("location") || "";
const cookies = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
assert.equal(login.status, 303, "Canonical owner login failed");
assert.ok(safeAdminHandoff(location), "Unsafe or missing admin handoff");
assert.match(cookies, /(?:^|;\s*)mmd_admin_gate_v1=[^;\s]+/, "Canonical admin session cookie missing");

async function call(path, method = "GET") {
  let last = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await fetch(ORIGIN + path, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: {
        Cookie: cookies,
        Origin: ORIGIN,
        Accept: "application/json",
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      },
      ...(method === "GET" ? {} : { body: "{}" }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    last = { status: response?.status || 0, body };
    if (response?.ok && body?.ok === true) return body;
    const retryable = !response || [404, 409, 429, 502, 503, 504].includes(response.status);
    if (!retryable || attempt === 30) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`acceptance_call_failed:${path}:${last?.status || 0}:${String(last?.body?.error || "unknown").slice(0, 80)}`);
}

const prepare = await call("/v1/admin/line/rich-menu/three-level/prepare", "POST");
assert.equal(prepare.version, VERSION);
assert.equal(prepare.customer_assignments_changed, false);
assert.equal(prepare.default_menu_changed, false);

const audit = await call("/v1/admin/line/rich-menu/three-level/audit");
assert.equal(audit.version, VERSION);
assert.equal(audit.schedule_policy_match, true);
assert.equal(audit.five_state_matrix_match, true);
assert.deepEqual(audit.five_state_matrix, {
  guest: "guest",
  public: "public",
  private: "private",
  expired: "public",
  blocked: "public",
});
assert.equal(audit.physical_tap_verified, false);

for (const key of ["guest", "public", "private"]) {
  assert.equal(audit.menus?.[key]?.present, true, `${key}:missing`);
  assert.equal(audit.menus?.[key]?.object_match, true, `${key}:object_mismatch`);
  assert.equal(audit.menus?.[key]?.image_match, true, `${key}:image_mismatch`);
  assert.equal(audit.menus?.[key]?.action_labels?.length, 6, `${key}:action_count`);
}
assert.equal(audit.menus.guest.action_labels[4], "MMD STORIES");
assert.equal(audit.menus.guest.action_types[5], "postback");
assert.equal(audit.menus.public.action_types[5], "postback");
assert.equal(audit.menus.private.action_labels[0], "KENJI AI");
assert.equal(audit.menus.private.action_types[0], "postback");

const receipt = {
  ok: true,
  version: audit.version,
  prepared_without_customer_assignment: prepare.customer_assignments_changed === false,
  prepared_without_default_change: prepare.default_menu_changed === false,
  menu_checks: audit.menus,
  hidden_by_schedule: audit.hidden_by_schedule,
  default_state: audit.default_state,
  schedule_policy_match: audit.schedule_policy_match,
  five_state_matrix: audit.five_state_matrix,
  five_state_matrix_match: audit.five_state_matrix_match,
  physical_tap_verified: false,
  physical_tap_status: "requires_real_line_client",
  checked_at: new Date().toISOString(),
};
const output = `${process.env.RUNNER_TEMP || "/tmp"}/mmd-rich-menu-production-acceptance.json`;
await writeFile(output, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({
  ok: receipt.ok,
  version: receipt.version,
  schedule_policy_match: receipt.schedule_policy_match,
  five_state_matrix: receipt.five_state_matrix,
  object_image_checks: Object.fromEntries(Object.entries(receipt.menu_checks).map(([key, value]) => [key, {
    present: value.present,
    object_match: value.object_match,
    image_match: value.image_match,
  }])),
  physical_tap_verified: false,
}));
