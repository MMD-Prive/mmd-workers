import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleModelWorkHistoryRequest, isModelVisibleApprovedImport, isVerifiedPaidPayout, projectSession } from "./src/model-work-history.js";

const MODEL_ID = "recModelABC123456789";
const SECRET = "model-history-test-secret";
const SF = { id: "fldLTq2kZbyRv22IA", job: "fldHw5HdDDdkHXMhG", model: "flddVz6eoWRHrzIQr", date: "fldpnqoIsUMfN7y3c", type: "fldjK3U9bghnj7xUe", state: "fld57fhdWqIcOy4Jp", payout: "fldlTO5aNfqUmlNWm", relation: "fldrXQAyOMPCvbOaY" };
const PF = { session: "fldwmqaIq9QubX9Uy", model: "fldO4HSMEN7fYe0vh", type: "fldgITP2xFiS2YHCG", amount: "fldTNf4UOoqc0KobP", status: "fldy2TgwO7Ayp6uhh", slip: "fldzONvJF4NWV7Izc", slipUrl: "fldx8ekePcfFmUjND", verification: "fldbnm3clTmwhGiNu" };
const IF = { source: "fldQcbid1LhEKRIdV", model: "fld5SqqQLHu3ZdLhT", date: "fldfWlJoU43pYwGDY", amount: "fldtqPkAQb5a6pmBU", type: "fldMmwoqdVH7M5yQj", workType: "fldbl5j76dXNd8onO", review: "fldkb2BHx8GE46Obb", linkedType: "fldExiECUkKXCWvZ6", linkedId: "fldqDftyQUwY3xWVI", privacy: "fldhqunGErKHO3NVz" };

function b64url(value) { return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function signedToken() {
  const payload = b64url(JSON.stringify({ kind: "model_session", role: "model", model_record_id: MODEL_ID, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))].map(v => v.toString(16).padStart(2, "0")).join("");
  return `${payload}.${signature}`;
}
function session(id, state, date, payout, type = "Dinner") {
  return { id: `rec${id}123456789012`, fields: { [SF.id]: id, [SF.job]: `job-${id}`, [SF.model]: "EMs16 Gohan", [SF.date]: date, [SF.type]: type, [SF.state]: state, [SF.payout]: payout, [SF.relation]: [MODEL_ID] } };
}
function payout(id, sessionId, amount, { status = "payout_paid", verification = "verified", slip = false } = {}) {
  return { id, fields: { [PF.session]: sessionId, [PF.model]: MODEL_ID, [PF.type]: "session_payout", [PF.amount]: amount, [PF.status]: status, [PF.verification]: verification, [PF.slip]: slip ? [{ id: "att1" }] : [], [PF.slipUrl]: "" } };
}
function imported(id, review, { amount = 0, source = "line_model_group", paymentType = "payout", linkedType = "session", linkedId = `old-${id}`, privacy = "model_summary_allowed", date = "2022-04-03", workType = "MMD job" } = {}) {
  return { id, fields: { [IF.source]: source, [IF.model]: MODEL_ID, [IF.date]: date, [IF.amount]: amount, [IF.type]: paymentType, [IF.workType]: workType, [IF.review]: review, [IF.linkedType]: linkedType, [IF.linkedId]: linkedId, [IF.privacy]: privacy } };
}

test("historical job and income totals include approved chat history while separating verified paid total", async () => {
  const originalFetch = globalThis.fetch;
  const token = await signedToken();
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(input.url || input);
    requests.push(url);
    if (url.pathname.endsWith("/tblC98mKWbzmPuNzX")) return Response.json({ records: [
      session("s1", "closed", "2026-01-05", 10000),
      session("s2", "work_finished", "2025-02-04", 5000),
      session("s3", "cancelled", "2024-03-03", 8000),
    ] });
    if (url.pathname.endsWith("/tblMvsl7qYozD05e5")) return Response.json({ records: [payout("p1", "s1", 10000)] });
    if (url.pathname.endsWith("/tbljrlOK5m4iBXgST")) return Response.json({ records: [
      imported("i1", "approved", { amount: 3000 }),
      imported("i2", "needs_review", { amount: 9000 }),
      imported("i3", "approved", { amount: 7000, privacy: "admin_only" }),
    ] });
    throw new Error(`unexpected Airtable request: ${url}`);
  };
  try {
    const response = await handleModelWorkHistoryRequest(new Request("https://mmdbkk.com/v1/model/history", { headers: { cookie: `mmd_model_session_v1=${token}`, origin: "https://mmdbkk.com" } }), { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "test", MODEL_SESSION_SIGNING_SECRET: SECRET });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.completed_job_count, 3);
    assert.equal(body.summary.earned_total_thb, 18000);
    assert.equal(body.summary.paid_confirmed_total_thb, 10000);
    assert.equal(body.summary.payouts_without_slip_count, 1);
    assert.equal(body.summary.history_items_waiting_review, 1);
    assert.equal(body.items.some(item => item.id.includes("s3")), false);
    assert.equal(body.items.some(item => item.id === "import:i3"), false);
    assert.equal(body.items.some(item => item.id === "import:i2"), false);
    assert.equal(JSON.stringify(body).includes("client_name"), false);
    assert.equal(requests.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test("Gaz-style owner-approved history keeps fee and paid totals separate without an old slip", async () => {
  const originalFetch = globalThis.fetch;
  const token = await signedToken();
  globalThis.fetch = async input => {
    const url = new URL(input.url || input);
    if (url.pathname.endsWith("/tblC98mKWbzmPuNzX")) return Response.json({ records: [] });
    if (url.pathname.endsWith("/tblMvsl7qYozD05e5")) {
      return Response.json({ records: [payout("recRIlWBbhqC4rpas", "", 25000, { slip: false })] });
    }
    if (url.pathname.endsWith("/tbljrlOK5m4iBXgST")) {
      return Response.json({ records: [
        imported("recxHkkc9PKRMDlh7", "approved", {
          amount: 25000,
          source: "line_model_group",
          paymentType: "payout",
          linkedType: "historical_job",
          linkedId: "LINEOA-0164-011296",
          date: "2026-03-18",
          workType: "MMD job",
        }),
      ] });
    }
    throw new Error(`unexpected Airtable request: ${url}`);
  };
  try {
    const response = await handleModelWorkHistoryRequest(
      new Request("https://mmdbkk.com/v1/model/history", {
        headers: { cookie: `mmd_model_session_v1=${token}`, origin: "https://mmdbkk.com" },
      }),
      { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "test", MODEL_SESSION_SIGNING_SECRET: SECRET },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.completed_job_count, 1);
    assert.equal(body.summary.earned_total_thb, 25000);
    assert.equal(body.summary.paid_confirmed_total_thb, 25000);
    assert.notEqual(body.summary.earned_total_thb + body.summary.paid_confirmed_total_thb, body.summary.earned_total_thb);
    assert.equal(body.summary.payouts_without_slip_count, 1);
    assert.equal(body.items[0].earned_amount_thb, 25000);
    assert.equal(body.earnings.length, 1);
    assert.equal(body.earnings[0].amount_thb, 25000);
    assert.equal(body.earnings[0].payment_evidence, "paid_confirmed_no_slip");
    assert.equal(JSON.stringify(body).includes("38000"), false);
    assert.equal(JSON.stringify(body).includes("client_name"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("session lookup matches linked record IDs, not Airtable display names", async () => {
  const originalFetch = globalThis.fetch;
  const token = await signedToken();
  const owned = session("owned", "closed", "2026-01-05", 2500);
  owned.fields[SF.relation] = [{ id: MODEL_ID, name: "Gaz" }];
  const foreign = session("foreign", "closed", "2026-01-06", 9999);
  foreign.fields[SF.relation] = [{ id: "recOtherABC12345678", name: MODEL_ID }];
  globalThis.fetch = async input => {
    const url = new URL(input.url || input);
    if (url.pathname.endsWith("/tblC98mKWbzmPuNzX")) {
      assert.equal(url.searchParams.has("filterByFormula"), false);
      return Response.json({ records: [owned, foreign] });
    }
    return Response.json({ records: [] });
  };
  try {
    const response = await handleModelWorkHistoryRequest(new Request("https://mmdbkk.com/v1/model/history", { headers: { cookie: `mmd_model_session_v1=${token}`, origin: "https://mmdbkk.com" } }), { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "test", MODEL_SESSION_SIGNING_SECRET: SECRET });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.completed_job_count, 1);
    assert.deepEqual(body.items.map(item => item.id), ["session:owned"]);
    assert.equal(body.summary.earned_total_thb, 2500);
  } finally { globalThis.fetch = originalFetch; }
});

test("a truncated session scan fails closed instead of showing partial earnings", async () => {
  const originalFetch = globalThis.fetch;
  const token = await signedToken();
  globalThis.fetch = async input => {
    const url = new URL(input.url || input);
    if (url.pathname.endsWith("/tblC98mKWbzmPuNzX")) return Response.json({ records: [session("partial", "closed", "2026-01-05", 2500)], offset: "another-page" });
    return Response.json({ records: [] });
  };
  try {
    const response = await handleModelWorkHistoryRequest(new Request("https://mmdbkk.com/v1/model/history", { headers: { cookie: `mmd_model_session_v1=${token}`, origin: "https://mmdbkk.com" } }), { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "test", MODEL_SESSION_SIGNING_SECRET: SECRET });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "history_unavailable");
  } finally { globalThis.fetch = originalFetch; }
});

test("work history endpoint requires a verified model session and same-site origin", async () => {
  const noCookie = await handleModelWorkHistoryRequest(new Request("https://mmdbkk.com/v1/model/history"), {});
  assert.equal(noCookie.status, 401);
  const badOrigin = await handleModelWorkHistoryRequest(new Request("https://mmdbkk.com/v1/model/history", { headers: { origin: "https://evil.example" } }), {});
  assert.equal(badOrigin.status, 403);
});

test("slip is optional to recognize an owner-verified payout", () => {
  assert.equal(isVerifiedPaidPayout(payout("p1", "s1", 2500)), true);
  assert.equal(isVerifiedPaidPayout(payout("p2", "s2", 2500, { verification: "pending" })), false);
});

test("only owner-approved history marked for model summary is visible", () => {
  assert.equal(isModelVisibleApprovedImport(imported("i1", "approved")), true);
  assert.equal(isModelVisibleApprovedImport(imported("i2", "needs_review")), false);
  assert.equal(isModelVisibleApprovedImport(imported("i3", "approved", { privacy: "admin_only" })), false);
});

test("canonical job projection does not treat absent payment evidence as unpaid", () => {
  const item = projectSession(session("s9", "closed", "2025-01-02", 4500));
  assert.equal(item.earned_amount_thb, 4500);
  assert.equal(item.paid_amount_thb, null);
  assert.equal(item.payment_evidence, "not_recorded");
});

test("production routes send both canonical hosts to the work history endpoint", () => {
  const wrangler = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  const deployWorkflow = readFileSync(new URL("../.github/workflows/deploy-admin-worker.yml", import.meta.url), "utf8");
  assert.match(wrangler, /pattern = "mmdbkk\.com\/v1\/model\/history"/);
  assert.match(wrangler, /pattern = "www\.mmdbkk\.com\/v1\/model\/history"/);
  assert.match(deployWorkflow, /"\/v1\/model\/history"/);
});
