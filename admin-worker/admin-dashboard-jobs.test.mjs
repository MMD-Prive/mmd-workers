import test from "node:test";
import assert from "node:assert/strict";

import { buildJobsPage, projectJobs, handleAdminDashboardJobsRequest } from "./src/admin-dashboard-jobs.js";

const CLIENT_A = "recAAAAAAAAAAAAAA";
const CLIENT_B = "recBBBBBBBBBBBBBB";

test("Console customer scope matches one canonical Client and retains the Session handoff", () => {
  const first = session("SESSION-A", "2026-10-04");
  first.fields.Client = [CLIENT_A];
  const second = session("SESSION-B", "2026-10-04");
  second.fields.Client = [CLIENT_B];
  const conflict = session("SESSION-C", "2026-10-04");
  conflict.fields.Client = [CLIENT_A];
  conflict.fields.client_id = CLIENT_B;
  const ambiguous = session("SESSION-D", "2026-10-04");
  ambiguous.fields.Client = [CLIENT_A, CLIENT_B];
  const page = buildJobsPage([first, second, conflict, ambiguous], { clientId: CLIENT_A });
  assert.equal(page.pagination.total, 1);
  assert.equal(page.items[0].session_id, "SESSION-A");
  assert.equal(page.items[0].client_id, CLIENT_A);
  assert.equal(page.items[0].customer_view_href, "/my-mmd/?session_id=SESSION-A");
  assert.equal(buildJobsPage([first, second], { sessionId: "SESSION-B", clientId: CLIENT_A }).items.length, 0);
  assert.equal(projectJobs([{ id: "recFallback", fields: { job_id: "JOB-FALLBACK" } }])[0].customer_view_href, null);
});

test("Console client selector requires admin auth and rejects invalid or repeated client IDs", async () => {
  const call = (query, actor) => handleAdminDashboardJobsRequest(new Request("https://www.mmdbkk.com/v1/admin/dashboard?view=jobs&" + query), {}, actor);
  assert.equal((await call("client_id=" + CLIENT_A, null)).status, 401);
  for (const query of ["client_id=customer-name", "client_id=", "client_id=" + CLIENT_A + "&client_id=" + CLIENT_B]) {
    assert.equal((await call(query, { role: "admin" })).status, 400);
  }
});

function session(id, jobDate, startTime = "19:00", status = "confirmed", jobId = "") {
  return {
    id: `rec_${id}`,
    fields: {
      session_id: id,
      ...(jobId ? { job_id: jobId } : {}),
      model_name: `Model ${id}`,
      client_name: `Client ${id}`,
      job_date: jobDate,
      start_time: startTime,
      status,
    },
  };
}

test("all-jobs view paginates the full projected set instead of six dashboard rows", () => {
  const records = Array.from({ length: 47 }, (_, index) => {
    const day = String(10 + (index % 10)).padStart(2, "0");
    return session(`job_${index + 1}`, `2026-09-${day}`);
  });

  const page = buildJobsPage(records, {
    now: new Date("2026-09-10T09:00:00.000Z"),
    page: 2,
    pageSize: 20,
  });

  assert.equal(page.pagination.total, 47);
  assert.equal(page.pagination.total_pages, 3);
  assert.equal(page.pagination.page, 2);
  assert.equal(page.pagination.page_size, 20);
  assert.equal(page.pagination.has_prev, true);
  assert.equal(page.pagination.has_next, true);
  assert.equal(page.items.length, 20);
  assert.equal(page.counts.all, 47);
});

test("job search matches the full projected set before pagination", () => {
  const records = Array.from({ length: 65 }, (_, index) => session(`SESSION-${index}`, "2026-11-08"));
  records[2].fields.client_name = "Needle customer";
  records[34].fields.model_name = "ＮＥＥＤＬＥ model";
  records[60].fields.job_id = "JOB-NEEDLE";
  const options = { now: new Date("2026-11-08T08:00:00Z"), query: "  ＮＥＥＤＬＥ  ", pageSize: 2 };

  const first = buildJobsPage(records, options);
  const second = buildJobsPage(records, { ...options, page: 2 });
  assert.deepEqual(first.items.map((job) => job.id), ["SESSION-2", "SESSION-34"]);
  assert.deepEqual(second.items.map((job) => job.id), ["SESSION-60"]);
  assert.equal(second.pagination.total, 3);
  assert.equal(second.pagination.total_pages, 2);
  assert.equal(second.pagination.has_prev, true);
  assert.equal(second.pagination.has_next, false);
  assert.equal(second.counts.all, 65);
  assert.equal(second.counts.today, 65);
  assert.equal(second.counts.filtered, 3);
  assert.equal(buildJobsPage(records, { ...options, query: "" }).pagination.total, 65);
});

test("job search covers Thai snapshot names and case-normalized job/session IDs only", () => {
  const target = session("SESSION-KONG", "2026-11-08", "19:00", "confirmed", "JOB-KONG");
  target.fields.client_name = "คุณก้อง (ต่ออายุ 01/11/69)";
  target.fields.model_name = "Brew";
  target.fields.notes = "PRIVATE-NOTE-NOT-SEARCHABLE";
  const records = [target, session("UNRELATED", "2026-11-08")];
  for (const query of ["ก้อง", "  ｂｒｅｗ  ", "session-kong", "job-kong"]) {
    assert.deepEqual(buildJobsPage(records, { query }).items.map((job) => job.id), ["SESSION-KONG"], query);
  }
  assert.equal(buildJobsPage(records, { query: "PRIVATE-NOTE-NOT-SEARCHABLE" }).pagination.total, 0);
  assert.equal(buildJobsPage(records, { query: "ไม่พบชื่อนี้" }).pagination.total, 0);
});

test("job search normalizes composed, compatibility and folded name spellings", () => {
  const target = session("UNICODE", "2026-11-08");
  target.fields.client_name = "Café คุณกำ Straße";
  target.fields.model_name = "ΟΣ";
  for (const query of ["CAFE\u0301", "คุณก\u0e4d\u0e32", "STRASSE", "οσ"]) {
    assert.equal(buildJobsPage([target], { query }).pagination.total, 1, query);
  }
});

test("job search intersects canonical customer, session, job and date scopes", () => {
  const target = session("SELECTED", "2026-11-08", "19:00", "confirmed", "JOB-SELECTED");
  const otherClient = session("OTHER-CLIENT", "2026-11-08");
  const otherDate = session("OTHER-DATE", "2026-11-09");
  for (const row of [target, otherClient, otherDate]) row.fields.client_name = "คุณก้อง";
  target.fields.Client = [CLIENT_A];
  otherClient.fields.Client = [CLIENT_B];
  otherDate.fields.Client = [CLIENT_A];
  const records = [target, otherClient, otherDate];
  const options = { query: "ก้อง", jobDate: "2026-11-08", clientId: CLIENT_A, sessionId: "SELECTED", jobId: "JOB-SELECTED" };
  assert.deepEqual(buildJobsPage(records, options).items.map((job) => job.id), ["SELECTED"]);
  for (const change of [{ query: "missing" }, { clientId: CLIENT_B }, { sessionId: "OTHER-CLIENT" }, { jobId: "OTHER" }, { jobDate: "2026-11-09" }]) {
    assert.equal(buildJobsPage(records, { ...options, ...change }).pagination.total, 0, JSON.stringify(change));
  }
});

test("invalid repeated, oversized and control-character queries fail before reading records", async (t) => {
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => { reads += 1; throw new Error("must not read"); });
  const queries = [
    "q=a&q=b", "q=&q=", "q=" + "a".repeat(161),
    ...["\u0000", "\n", "\t", "\u007f", "\u0085", "\u202e"].map((control) => "q=" + encodeURIComponent("name" + control)),
    "q=" + encodeURIComponent("\ufb03".repeat(54)),
  ];
  for (const query of queries) {
    const response = await handleAdminDashboardJobsRequest(new Request("https://mmdbkk.com/v1/admin/dashboard?view=jobs&" + query), {}, { role: "admin" });
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error, "invalid_query");
  }
  assert.equal(reads, 0);
});

test("jobs API reports normalized search and keeps query text out of Airtable requests", async (t) => {
  const target = session("API-SEARCH", "2026-11-08");
  target.fields.model_name = "Brew";
  target.fields.client_name = "OR({status},TRUE())";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    calls.push(url);
    assert.equal(url.hostname, "api.airtable.com");
    assert.equal(url.searchParams.has("filterByFormula"), false);
    assert.equal(url.searchParams.has("q"), false);
    return Response.json({ records: url.searchParams.has("returnFieldsByFieldId") ? [] : [target] });
  });
  const env = { AIRTABLE_API_KEY: "test-only", AIRTABLE_BASE_ID: "appTest", AIRTABLE_TABLE_SESSIONS: "tblTest" };
  for (const [query, expectedQuery, count] of [
    ["  ＢＲＥＷ  ", "brew", 1],
    ["OR({status},TRUE())", "or({status},true())", 1],
    ["", null, 1],
    ["   ", null, 1],
    ["a".repeat(160), "a".repeat(160), 0],
  ]) {
    const response = await handleAdminDashboardJobsRequest(new Request("https://mmdbkk.com/v1/admin/dashboard?view=jobs&q=" + encodeURIComponent(query)), env, { role: "admin" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.filters.q, expectedQuery);
    assert.equal(body.counts.filtered, count);
    assert.equal(body.jobs.length, count);
  }
  assert.equal(calls.length, 10);
});

test("all-jobs view filters one canonical job date and resets pagination to valid bounds", () => {
  const records = [
    session("today_a", "2026-09-10", "18:00"),
    session("today_b", "2026-09-10", "20:00", "pending"),
    session("future", "2026-09-11", "19:00"),
    session("past", "2026-09-09", "21:00", "finished"),
  ];

  const page = buildJobsPage(records, {
    now: new Date("2026-09-10T09:00:00.000Z"),
    page: 99,
    pageSize: 20,
    jobDate: "2026-09-10",
  });

  assert.equal(page.pagination.total, 2);
  assert.equal(page.pagination.page, 1);
  assert.deepEqual(page.items.map((item) => item.id), ["today_a", "today_b"]);
  assert.equal(page.counts.today, 2);
  assert.equal(page.counts.upcoming, 1);
  assert.equal(page.counts.past, 1);
});

test("all-jobs projection preserves date/time fallback rules from the dashboard", () => {
  const jobs = projectJobs([
    {
      id: "rec_iso",
      fields: {
        session_id: "iso",
        model_name: "ISO Model",
        client_name: "ISO Client",
        scheduled_at: "2026-09-11T12:15:00.000Z",
        status: "confirmed",
      },
    },
    {
      id: "rec_missing",
      fields: {
        session_id: "missing",
        model_name: "Missing Model",
        client_name: "Missing Client",
        status: "pending",
      },
    },
  ], new Date("2026-09-10T09:00:00.000Z"));

  assert.equal(jobs[0].id, "iso");
  assert.equal(jobs[0].href, "/internal/admin/jobs/all?session_id=iso");
  assert.equal(jobs[0].job_date, "2026-09-11");
  assert.equal(jobs[0].time_only, "19:15");
  assert.match(jobs[0].time, /19:15$/);

  assert.equal(jobs[1].id, "missing");
  assert.equal(jobs[1].href, "/internal/admin/jobs/all?session_id=missing");
  assert.equal(jobs[1].job_date, "");
  assert.equal(jobs[1].time, "ยังไม่มีวันเวลา");
});


test("owner handoff selects the exact canonical Session across job dates and pages", () => {
  const records = Array.from({ length: 75 }, (_, index) => session(`job_${index + 1}`, "2026-09-11"));
  const page = buildJobsPage(records, { now: new Date("2026-09-10T09:00:00.000Z"), sessionId: "job_74", pageSize: 20 });
  assert.deepEqual(page.items.map((item) => item.id), ["job_74"]);
  assert.equal(page.pagination.total, 1);
});

test("owner handoff accepts job_id deep links without losing the canonical session", () => {
  const records = [
    session("sess_alpha", "2026-09-11", "18:00", "pending", "JOB-ALPHA"),
    session("sess_target", "2026-09-12", "19:00", "pending", "JOB-8B799C2387-C1BC84"),
    session("sess_other", "2026-09-12", "20:00", "confirmed", "JOB-OTHER"),
  ];
  const page = buildJobsPage(records, {
    now: new Date("2026-09-10T09:00:00.000Z"),
    jobId: "JOB-8B799C2387-C1BC84",
    pageSize: 20,
  });

  assert.equal(page.pagination.total, 1);
  assert.equal(page.items[0].id, "sess_target");
  assert.equal(page.items[0].session_id, "sess_target");
  assert.equal(page.items[0].job_id, "JOB-8B799C2387-C1BC84");
  assert.equal(page.items[0].href, "/internal/admin/jobs/all?job_id=JOB-8B799C2387-C1BC84");
});

import { parsePricingHistory, projectFinance, JOB_FINANCE_FIELD_IDS as FIN } from "./src/admin-dashboard-jobs.js";

const NOTE = '[MMD SERVICE PRICING v1] ' + JSON.stringify({ version: 1, currency: "THB", settlement_mode: "direct",
  client_base_amount_thb: 20000, model_base_payout_thb: 11500, addons: [{ option: "mk", client_amount_thb: 1000, model_payout_thb: 500 }],
  client_total_amount_thb: 18900, model_total_payout_thb: 11750, client_gross_amount_thb: 21000, model_gross_payout_thb: 12000,
  discount: { mode: "promotion", type: "percent", value: 10, amount_thb: 2100, mmd_share_thb: 1050, model_share_thb: 1050, reason: "OCT promo" } })
  + '\n[object Object]\n[SIGIL Pricing v1] ' + JSON.stringify({ deposit_due_thb: 5700, deposit_received_thb: 0, balance_thb: 13200 });

test("job finance exposes pre-discount history, discount split and deposit, never tokens", () => {
  const h = parsePricingHistory(NOTE);
  assert.equal(h.client_gross_thb, 21000); assert.equal(h.client_net_thb, 18900);
  assert.equal(h.model_gross_thb, 12000); assert.equal(h.model_net_thb, 11750);
  assert.deepEqual(h.addons, [{ option: "mk", client_thb: 1000, model_thb: 500 }]);
  assert.equal(h.discount.mode, "promotion"); assert.equal(h.discount.model_share_thb, 1050); assert.equal(h.discount.reason, "OCT promo");
  const f = projectFinance({ [FIN.noteA]: NOTE, [FIN.paymentStatus]: { name: "pending" }, [FIN.amount]: 18900, [FIN.paymentRef]: "pay_x",
    [FIN.sessionStatus]: "Pending", "https://x/?t=secret": "ignored" });
  assert.equal(f.payment_status, "pending"); assert.equal(f.deposit_due_thb, 5700); assert.equal(f.balance_thb, 13200); assert.equal(f.amount_thb, 18900);
  assert.equal(JSON.stringify(f).includes("secret"), false);
});

test("job finance is null-safe without extras, malformed notes or a discount", () => {
  assert.equal(projectFinance(undefined), null);
  assert.equal(parsePricingHistory("[MMD SERVICE PRICING v1] {not json"), null);
  assert.equal(parsePricingHistory("hello"), null);
  const noDiscount = parsePricingHistory('[MMD SERVICE PRICING v1] {"version":1,"client_base_amount_thb":5000,"client_total_amount_thb":5000,"addons":[]}');
  assert.equal(noDiscount.discount, null); assert.equal(noDiscount.client_gross_thb, 5000);
  const page = buildJobsPage([{ id: "recS1", fields: { session_id: "S1", job_date: "2026-10-10" } }], { extrasById: { recS1: { [FIN.noteA]: NOTE } } });
  assert.equal(page.items[0].finance.pricing.discount.type, "percent");
  assert.equal(buildJobsPage([{ id: "recS2", fields: { session_id: "S2" } }]).items[0].finance, null);
});

test("missing or invalid money stays unknown while explicit zero is retained", () => {
  const unknown = projectFinance({});
  for (const key of ["amount_thb", "model_payout_thb", "deposit_due_thb", "deposit_received_thb", "balance_thb"]) {
    assert.equal(unknown[key], null, key);
  }
  for (const value of [undefined, null, "", "   ", false, true, {}, [], [0], { valueOf: () => 100 }, "not money", NaN, Infinity, -1, 1e308]) {
    const finance = projectFinance({ [FIN.amount]: value, [FIN.modelPayout]: value });
    assert.equal(finance.amount_thb, null, String(value));
    assert.equal(finance.model_payout_thb, null, String(value));
  }
  for (const value of [0, "0", " 0.00 "]) {
    const finance = projectFinance({ [FIN.amount]: value, [FIN.modelPayout]: value });
    assert.equal(finance.amount_thb, 0);
    assert.equal(finance.model_payout_thb, 0);
  }
  assert.equal(projectFinance({ [FIN.amount]: "2500.125" }).amount_thb, 2500.13);
});

test("missing amount uses recorded pricing without replacing an explicit zero", () => {
  for (const value of [undefined, null, "", " "]) {
    const finance = projectFinance({ [FIN.amount]: value, [FIN.noteA]: NOTE });
    assert.equal(finance.amount_thb, 18900);
    assert.equal(finance.model_payout_thb, null);
    assert.equal(finance.deposit_received_thb, 0);
  }
  assert.equal(projectFinance({ [FIN.amount]: 0, [FIN.noteA]: NOTE }).amount_thb, 0);
  const incomplete = parsePricingHistory('[MMD SERVICE PRICING v1] {"version":1,"client_total_amount_thb":4500}');
  assert.equal(incomplete.client_base_thb, null);
  assert.equal(incomplete.model_base_thb, null);
  assert.equal(incomplete.client_net_thb, 4500);
});

test("projectFinance exposes customer/model acknowledgement times only", async () => {
  const { projectFinance, JOB_FINANCE_FIELD_IDS: F } = await import("./src/admin-dashboard-jobs.js");
  const f = projectFinance({ [F.customerAck]: "2026-10-09T01:00:00.000Z", [F.modelAck]: "not-a-date" });
  assert.equal(f.customer_ack_at, "2026-10-09T01:00:00.000Z");
  assert.equal(f.model_ack_at, null);
});
