import test from "node:test";
import assert from "node:assert/strict";
import { collectReconfirmDecisions, runModelReconfirmSweep } from "./src/model-reconfirm-runtime.js";

const NOW = Date.parse("2026-10-17T16:00:00+07:00");
const M1 = "recMODELAAAAAAAAAA";
const M2 = "recMODELBBBBBBBBBB";
const LINE1 = `U${"a".repeat(32)}`;
const LINE2 = `U${"b".repeat(32)}`;
const OWNER = "-5500000009";
const ENV = {
  MODEL_RECONFIRM_ENABLED: "true",
  MODEL_RECONFIRM_GUARD_V2: "true",
  AIRTABLE_BASE_ID: "appFixture",
  AIRTABLE_API_KEY: "fixture-only",
  AIRTABLE_TABLE_SESSIONS: "sessions",
  AIRTABLE_TABLE_MODELS: "models",
  AT_SESSIONS__MODEL_RECORD_ID: "Assigned Model",
  MODEL_LINE_CHANNEL_ACCESS_TOKEN: "fixture-only",
  TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/send",
  AUTH_SERVICE_EVENTS_TO_TELEGRAM: "fixture-only",
  MODEL_RECONFIRM_OWNER_CHAT_ID: OWNER,
  TELEGRAM_CHAT_ID: OWNER,
};

// Synthetic version of the observed schema: canonical model linkage plus legacy
// Session Status, with the newer lifecycle fields and Assigned Model empty.
function session(overrides = {}) {
  return {
    id: "recSESSIONAAAAAAA",
    fields: {
      session_id: "sess_reconfirm_fixture",
      job_date: "2026-10-18",
      start_time: "2026-10-18T18:00:00+07:00",
      end_time: "2026-10-18T19:30:00+07:00",
      model_session_state: "",
      session_state: "",
      status: "",
      "Session Status": "Confirmed",
      "Canonical Model": [M1],
      "Assigned Model": [],
      model_name: "Fixture Model",
      location_name: "Private fixture location",
      customer_name: "Private fixture customer",
      paid_received_sum: 5400,
      ...overrides,
    },
  };
}

function harness(t, input = session()) {
  const record = structuredClone(input);
  const log = { line: [], telegram: [], patches: [], modelReads: [], retryKeys: [] };
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init.method || "GET";
    if (url.hostname === "api.airtable.com") {
      const [, , , table, id] = url.pathname.split("/");
      if (table === "sessions" && method === "GET") {
        const formula = url.searchParams.get("filterByFormula") || "";
        const date = formula.match(/="(\d{4}-\d{2}-\d{2})"/)?.[1];
        const sid = formula.match(/\{session_id\}="([^"]+)"/)?.[1];
        const matches = (!date || record.fields.job_date === date) && (!sid || record.fields.session_id === sid);
        return Response.json({ records: matches ? [structuredClone(record)] : [] });
      }
      if (table === "sessions" && id === record.id && method === "PATCH") {
        const fields = JSON.parse(init.body).fields;
        log.patches.push(fields);
        Object.assign(record.fields, fields);
        return Response.json(structuredClone(record));
      }
      if (table === "models" && method === "GET" && [M1, M2].includes(id)) {
        log.modelReads.push(id);
        return Response.json({ id, fields: { line_user_id: id === M1 ? LINE1 : LINE2 } });
      }
      if (table === "tblhQGfJc4GgiteZr" && method === "GET") return Response.json({ records: [] });
    }
    if (url.hostname === "api.line.me" && method === "POST") {
      log.line.push(JSON.parse(init.body));
      log.retryKeys.push(new Headers(init.headers).get("X-Line-Retry-Key"));
      return Response.json({});
    }
    if (url.hostname === "telegram.test" && method === "POST") {
      log.telegram.push(JSON.parse(init.body));
      return Response.json({ telegram: { ok: true } });
    }
    throw new Error(`UNEXPECTED_NETWORK ${method} ${url.origin}${url.pathname}`);
  });
  return { record, log };
}

test("canonical-linked legacy Confirmed record is a read-only preview candidate", async t => {
  const h = harness(t);
  const before = structuredClone(h.record);
  const result = await collectReconfirmDecisions(ENV, { now: NOW });
  assert.equal(result.target_date, "2026-10-18");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].decision.action, "send");
  assert.equal(result.items[0].decision.model_record_id, M1);
  assert.deepEqual(h.record, before);
  assert.equal(h.log.patches.length + h.log.line.length + h.log.telegram.length, 0);
});

for (const guard of ["false", "true"]) {
  test(`observed schema gets the 16:00 notice once, with no lifecycle writes (guard ${guard})`, async t => {
    const h = harness(t);
    const before = structuredClone(h.record.fields);
    const env = { ...ENV, MODEL_RECONFIRM_GUARD_V2: guard };
    await runModelReconfirmSweep(env, { now: NOW - 15 * 60_000 });
    assert.equal(h.log.line.length + h.log.telegram.length, 0);
    const result = await runModelReconfirmSweep(env, { now: NOW });
    assert.equal(result.notified, 1);
    assert.equal(h.log.line.length, 1);
    assert.equal(h.log.line[0].to, LINE1);
    const [notice, card] = h.log.line[0].messages;
    assert.equal(notice.type, "text");
    assert.match(notice.text, /งานวันที่ 2026-10-18/);
    assert.equal(card.type, "template");
    assert.equal(card.template.type, "buttons");
    assert.ok(card.template.text.length <= 160);
    assert.deepEqual(card.template.actions, [{
      type: "uri",
      label: "เปิด MY MODEL",
      uri: "https://www.mmdbkk.com/sigil/model/dashboard",
    }]);
    assert.equal(h.record.fields.reconfirm_acknowledged_at || null, null);
    assert.match(h.log.retryKeys[0], /^[a-f0-9-]{36}$/);
    assert.doesNotMatch(JSON.stringify(h.log.line[0]), /Private fixture|5400/);
    await runModelReconfirmSweep(env, { now: NOW + 15 * 60_000 });
    assert.equal(h.log.line.length, 1);
    for (const patch of h.log.patches) {
      assert.ok(Object.keys(patch).every(key => key.startsWith("reconfirm_")));
    }
    for (const [key, value] of Object.entries(before)) assert.deepEqual(h.record.fields[key], value, key);
  });
}

test("canonical model wins over a different valid legacy model and stale env mapping", async t => {
  const h = harness(t, session({ "Assigned Model": [M2] }));
  await runModelReconfirmSweep(ENV, { now: NOW });
  assert.deepEqual([...new Set(h.log.modelReads)], [M1]);
  assert.equal(h.log.line.length, 1);
  assert.equal(h.log.line[0].to, LINE1);
});

test("legacy model link is used only when Canonical Model is absent", async t => {
  const r = session({ "Assigned Model": [M2] });
  delete r.fields["Canonical Model"];
  const h = harness(t, r);
  await runModelReconfirmSweep(ENV, { now: NOW });
  assert.equal(h.log.line.length, 1);
  assert.equal(h.log.line[0].to, LINE2);
});

test("empty, ambiguous, or malformed canonical link never falls through to a valid legacy model", async t => {
  for (const canonical of [[], null, "", M1, [M1, M2], [M1, "invalid"], [{ id: M1 }], [M1, ""]]) {
    await t.test(JSON.stringify(canonical), async sub => {
      const h = harness(sub, session({ "Canonical Model": canonical, "Assigned Model": [M2] }));
      const result = await runModelReconfirmSweep(ENV, { now: NOW });
      assert.equal(h.log.line.length, 0);
      assert.ok(!h.log.modelReads.includes(M2));
      assert.equal(result.review_required, 1);
      assert.equal(h.log.telegram.length, 1);
      assert.equal(h.log.telegram[0].chat_id, OWNER);
      await runModelReconfirmSweep(ENV, { now: NOW + 15 * 60_000 });
      assert.equal(h.log.telegram.length, 1);
    });
  }
});

test("malformed canonical linkage also cannot select a model in the legacy sweep", async t => {
  const h = harness(t, session({ "Canonical Model": [M1, M2], "Assigned Model": [M2] }));
  await runModelReconfirmSweep({ ...ENV, MODEL_RECONFIRM_GUARD_V2: "false" }, { now: NOW });
  assert.equal(h.log.line.length, 0);
  assert.equal(h.log.modelReads.length, 0);
});

test("newer terminal or noneligible states take precedence over legacy Confirmed", async t => {
  const cases = [
    { model_session_state: "closed", session_state: "confirmed", status: "confirmed" },
    { model_session_state: "work_started", session_state: "confirmed" },
    { model_session_state: "offer_declined", session_state: "confirmed" },
    { model_session_state: "unknown_state", session_state: "confirmed" },
    { session_state: "cancelled", status: "confirmed" },
    { status: "completed" },
  ];
  for (const fields of cases) {
    await t.test(JSON.stringify(fields), async sub => {
      const h = harness(sub, session(fields));
      await runModelReconfirmSweep(ENV, { now: NOW });
      assert.equal(h.log.line.length + h.log.telegram.length + h.log.patches.length, 0);
    });
  }
});

test("canonical confirmed wins over stale legacy status without rewriting either field", async t => {
  const h = harness(t, session({ model_session_state: "confirmed", session_state: "cancelled", "Session Status": "Cancelled" }));
  await runModelReconfirmSweep(ENV, { now: NOW });
  assert.equal(h.log.line.length, 1);
  assert.equal(h.record.fields.model_session_state, "confirmed");
  assert.equal(h.record.fields.session_state, "cancelled");
  assert.equal(h.record.fields["Session Status"], "Cancelled");
});

test("18:00 and 19:00 remain deduped after canonical initial delivery", async t => {
  const h = harness(t);
  await runModelReconfirmSweep(ENV, { now: NOW });
  await runModelReconfirmSweep(ENV, { now: NOW + 2 * 3_600_000 });
  await runModelReconfirmSweep(ENV, { now: NOW + 2 * 3_600_000 + 15 * 60_000 });
  assert.equal(h.log.line.length, 2);
  const [reminder, card] = h.log.line[1].messages;
  assert.match(reminder.text, /MY MODEL · Reminder/);
  assert.deepEqual(card, h.log.line[0].messages[1]);
  assert.equal(h.record.fields.reconfirm_acknowledged_at || null, null);
  assert.notEqual(h.log.retryKeys[0], h.log.retryKeys[1]);
  await runModelReconfirmSweep(ENV, { now: NOW + 3 * 3_600_000 });
  await runModelReconfirmSweep(ENV, { now: NOW + 3 * 3_600_000 + 15 * 60_000 });
  assert.equal(h.log.line.length, 2);
  assert.equal(h.log.telegram.length, 1);
  assert.equal(h.log.telegram[0].intent, "model_reconfirm_overdue");
});

test("canonical acknowledgement suppresses later reminder and escalation", async t => {
  const h = harness(t);
  await runModelReconfirmSweep(ENV, { now: NOW });
  h.record.fields.reconfirm_acknowledged_at = new Date(NOW + 60_000).toISOString();
  await runModelReconfirmSweep(ENV, { now: NOW + 3 * 3_600_000 });
  assert.equal(h.log.line.length, 1);
  assert.equal(h.log.telegram.length, 0);
});

