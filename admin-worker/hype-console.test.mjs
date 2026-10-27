import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";
import { handleHypeConsole, HYPE_CONSOLE_PAGE, HYPE_CONSOLE_API, isHypeConsoleRequest } from "./src/hype-console.js";
import worker from "./src/admin-login-hero-worker.js";
import { renderHypeConsole } from "./src/hype-console-page.js";

const ORIGIN = "https://mmdbkk.com";
const ID = "rec12345678901234";
const baseEnv = { ADMIN_SESSION_SECRET: "test-session-only", ADMIN_LOGIN_CREDENTIAL: "test-credential-only", AIRTABLE_BASE_ID: "appTest", AIRTABLE_API_KEY: "test-airtable-only" };
async function request(path, body, options = {}) {
  const token = options.unauthorized ? "invalid" : await createCredentialBoundAdminSession(new Request(ORIGIN), options.actor || { id: "per", role: "admin", auth_method: "credential" }, baseEnv);
  return new Request(`${options.host || ORIGIN}${path}`, {
    method: options.method || (body ? "POST" : "GET"),
    headers: { cookie: `mmd_admin_gate_v1=${token}`, origin: ORIGIN, "content-type": "application/json", ...options.headers },
    ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}
const search = (lane, query = "Test") => ({ lane, query });
const draft = (lane, topic = "next_step") => ({ lane, record_id: ID, topic });
function sourceEnv(records, inspect = () => {}) {
  return { ...baseEnv, AIRTABLE_HTTP: { async fetch(req) {
    inspect(req);
    assert.equal(req.method, "GET", "no Airtable mutation is possible");
    return Response.json({ records });
  } } };
}
const row = fields => ({ id: ID, fields });

test("exact HYPE namespaces only; no member/model/public paths are intercepted", () => {
  for (const path of [HYPE_CONSOLE_PAGE, HYPE_CONSOLE_PAGE + "/", HYPE_CONSOLE_API + "/search", HYPE_CONSOLE_API + "/draft"]) assert.equal(isHypeConsoleRequest(new Request(ORIGIN + path)), true);
  for (const path of ["/member/dashboard", "/member/liff", "/sigil/model/console", "/v1/admin/hype-admin", "/internal/admin/hypers"]) assert.equal(isHypeConsoleRequest(new Request(ORIGIN + path)), false);
});

test("production entrypoint serves all three lanes before unrelated background or payment handlers", async () => {
  const env = sourceEnv([row({ "Applicant Name": "Test", nickname: "Test", folder_name: "Test", status: "pending" })]);
  env.LINE_OFC_BACKFILL_COORDINATOR = { idFromName() { throw new Error("background_backfill_must_not_run"); } };
  const page = await worker.fetch(await request(HYPE_CONSOLE_PAGE), env, {});
  assert.equal(page.status, 200);
  assert.match(await page.text(), /HYPE/);
  for (const lane of ["member", "applicant", "model"]) {
    for (const [operation, body] of [["search", search(lane)], ["draft", draft(lane)]]) {
      const response = await worker.fetch(await request(HYPE_CONSOLE_API + "/" + operation, body), env, {});
      assert.equal(response.status, 200);
      assert.equal((await response.json()).read_only, true);
    }
  }
  const denied = await worker.fetch(await request(HYPE_CONSOLE_API + "/search", search("model"), { unauthorized: true }), env, {});
  assert.equal(denied.status, 401);
});

test("page and API require signed owner credentials, not member/partner/admin bearer headers", async () => {
  assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_PAGE, null, { unauthorized: true }), baseEnv)).status, 303);
  assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search("model"), { unauthorized: true, headers: { authorization: "Bearer test-credential-only" } }), baseEnv)).status, 401);
  for (const role of ["mms_partner", "member", "model", "staff", "admin"]) {
    assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_PAGE, null, { actor: { id: "other", role, auth_method: "credential" } }), baseEnv)).status, 403);
  }
});

test("page is private, no-store, frame-protected and supports HEAD", async () => {
  for (const method of ["GET", "HEAD"]) {
    const response = await handleHypeConsole(await request(HYPE_CONSOLE_PAGE, null, { method }), baseEnv);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    const html = await response.text();
    if (method === "HEAD") assert.equal(html, "");
    else for (const label of ["สมัครสมาชิก", "สมัครโมเดล", "โมเดลเดิม", "รอผู้ดูแลตรวจ"]) assert.ok(html.includes(label));
  }
});

test("rejects wrong hosts, cross-origin posts, query selectors, unknown operations and write methods", async () => {
  assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_PAGE, null, { host: "https://evil.example" }), baseEnv)).status, 403);
  for (const headers of [{ origin: "https://evil.example" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search("model"), { headers }), baseEnv)).status, 403);
  }
  assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search?token=not-accepted", search("model")), baseEnv)).status, 400);
  assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/approve", draft("model")), baseEnv)).status, 404);
  for (const method of ["PUT", "PATCH", "DELETE", "GET"]) assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", method === "GET" ? null : search("model"), { method }), baseEnv)).status, 405);
});

for (const [lane, table, fields] of [
  ["member", "tbl8z2MQpIqcdylim", { "Applicant Name": "Test Member", "Application Status": "In Review", "Application Date": "2026-10-27" }],
  ["applicant", "tblwUa8ySWln8OfaJ", { nickname: "Test Applicant", status: "pending_review" }],
  ["model", "tblI4B0bI446vp9GX", { folder_name: "Test Model Rename", status: "active" }],
]) {
  test(`${lane}: bounded, allowlisted GET search and a server-reloaded draft`, async () => {
    const reads = [];
    const env = sourceEnv([row({ ...fields, phone: "must-not-leak", internal_notes: "private-note", points: 999, ban: true })], req => reads.push(new URL(req.url)));
    const response = await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search(lane)), env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.read_only, true);
    assert.equal(data.items.length, 1);
    assert.deepEqual(Object.keys(data.items[0]).sort(), ["date", "id", "name", "status"]);
    assert.equal(reads[0].pathname.split("/").at(-1), table);
    assert.equal(reads[0].searchParams.get("maxRecords"), "21");
    assert.ok(reads[0].searchParams.getAll("fields[]").length <= 4);
    assert.doesNotMatch(JSON.stringify(data), /must-not-leak|private-note|points|ban/);
    const generated = await handleHypeConsole(await request(HYPE_CONSOLE_API + "/draft", draft(lane)), env);
    const result = await generated.json();
    assert.equal(generated.status, 200);
    assert.equal(result.review_required, true);
    assert.equal(reads.length, 2);
    assert.equal(reads[1].searchParams.get("filterByFormula"), `RECORD_ID()="${ID}"`);
    assert.ok(reads[1].searchParams.has("fields[]"));
    assert.doesNotMatch(result.draft, /test-airtable|อนุมัติแล้ว|รับเงินแล้ว|ยืนยันงานแล้ว|ทีมงาน|Kenji|บอท/);
  });
}

test("query formula is quoted, cannot select fields or inject Airtable syntax", async () => {
  const query = '") ,TRUE(), ("'; let formula;
  const response = await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search("member", query)), sourceEnv([], req => { formula = new URL(req.url).searchParams.get("filterByFormula"); }));
  assert.equal(response.status, 200);
  assert.equal(formula, `OR(FIND(${JSON.stringify(query.toLowerCase())},LOWER({Applicant Name}&"")))`);
  for (const query of ["", "x", "a".repeat(81), "ab\ncd"]) assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search("model", query)), baseEnv)).status, 400);
});

for (const [lane, fields, expected, label] of [
  ["member", { "Applicant Name": "Test Member", "Application Status": "Waitlisted" }, "waitlisted", "รอคิวพิจารณา"],
  ["applicant", { nickname: "Test Applicant", status: "new_review" }, "new_review", "รายการใหม่รอตรวจ"],
]) {
  test(`${expected}: preserve source status and translate without implying approval`, async () => {
    const env = sourceEnv([row(fields)]);
    const found = await (await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search(lane)), env)).json();
    assert.equal(found.items[0].status, expected);
    const reply = await (await handleHypeConsole(await request(HYPE_CONSOLE_API + "/draft", draft(lane)), env)).json();
    assert.equal(reply.item.status, expected);
    assert.equal(reply.review_required, true);
    assert.equal(reply.read_only, true);
    assert.doesNotMatch(reply.draft, /อนุมัติแล้ว|สมาชิกใช้งานอยู่|รับเงินแล้ว/);
    assert.ok(renderHypeConsole().includes(`${expected}: "${label}"`));
  });
}

test("no-match and multiple-match results never auto-select or infer rights", async () => {
  const none = await (await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search("member")), sourceEnv([]))).json();
  assert.deepEqual(none.items, []);
  assert.equal(none.draft, undefined);
  const records = Array.from({ length: 21 }, (_, i) => ({ id: `rec${String(i).padStart(14, "0")}`, fields: { folder_name: "Test Model" } }));
  const data = await (await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", search("model")), sourceEnv(records))).json();
  assert.equal(data.items.length, 20);
  assert.equal(data.truncated, true);
  assert.equal(data.selected, undefined);
});

test("missing/malformed/unavailable source returns no draft and no zero/expiry fallback", async () => {
  for (const env of [{ AIRTABLE_BASE_ID: "" }, sourceEnv([]), { ...baseEnv, AIRTABLE_HTTP: { fetch: async () => new Response("private provider details", { status: 500 }) } }, { ...baseEnv, AIRTABLE_HTTP: { fetch: async () => Response.json({ records: "malformed" }) } }]) {
    const response = await handleHypeConsole(await request(HYPE_CONSOLE_API + "/draft", draft("member")), { ...baseEnv, ...env });
    assert.ok([404, 503].includes(response.status));
    const data = await response.json(); assert.equal(data.draft, undefined);
    assert.doesNotMatch(JSON.stringify(data), /private provider details|expired|points/);
  }
});

test("draft rejects browser-supplied status/name, unsupported topics and cross-lane topics", async () => {
  for (const body of [{ ...draft("model"), name: "spoof" }, { ...draft("member"), status: "approved" }, draft("model", "approve"), draft("member", "availability"), { ...draft("model"), record_id: "invalid" }, { lane: "__proto__", query: "Test" }]) {
    const response = await handleHypeConsole(await request(HYPE_CONSOLE_API + "/draft", body), baseEnv);
    assert.equal(response.status, 400);
  }
});

test("bounded JSON, malformed JSON and wrong content type fail before any provider read", async () => {
  for (const [body, headers, status] of [["{", {}, 400], ["x".repeat(2049), {}, 413], [JSON.stringify(search("model")), { "content-type": "text/plain" }, 415]]) {
    assert.equal((await handleHypeConsole(await request(HYPE_CONSOLE_API + "/search", body, { headers }), baseEnv)).status, status);
  }
});

test("UI has explicit selection, safe text rendering, stale-response invalidation, clipboard fallback and no persistence/send", async () => {
  const page = await readFile(new URL("./src/hype-console-page.js", import.meta.url), "utf8");
  assert.match(page, /epoch !== current/);
  assert.match(page, /name\.textContent = item\.name/);
  assert.match(page, /draft.*\.select\(\)/);
  assert.match(page, /window\.addEventListener\("pagehide", reset\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|innerHTML|sendMessage|\/telegram|\/webhooks/);
  const entry = await readFile(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
  assert.ok(entry.indexOf("if (isHypeConsoleRequest(request))") < entry.indexOf("if (isMyMmdOperationsRequest(request))"));
});
