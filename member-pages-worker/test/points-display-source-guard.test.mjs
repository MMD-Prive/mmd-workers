import test from "node:test";
import assert from "node:assert/strict";
import { guardPointsDisplaySources } from "../src/points-display-source-guard.js";
import { prepareMyMmdLifetimePointsContext, applyMyMmdLifetimePointsResponse } from "../src/my-mmd-lifetime-points.js";
const ledger = (fields = {}) => ({ id:"rec-ledger", fields: { transaction_status:"posted", points:10, amount_thb:1000, payment_ref:"pay-fixture", posted_at:new Date().toISOString(), ...fields } });
const payment = (fields = {}) => ({ id:"rec-payment", fields: { "Payment Reference":"pay-fixture", "Payment Status":"Paid", "Verification Status":"verified", Amount:1000, ...fields } });

test("posted ledger requires exact unique paid+verified money truth and matching amount", () => {
  for (const payments of [[], [payment({ "Payment Status":"Pending" })], [payment({ "Verification Status":"pending_review" })], [payment({ Amount:2000 })], [payment(), payment()]]) {
    const value = guardPointsDisplaySources([ledger()], payments);
    assert.equal(value.state, "review_required");
    assert.equal(value.verifiedRecords.length, 0);
    assert.equal(value.historicalPoints.grossPoints, 10);
    assert.equal(value.historicalPoints.usable, false);
  }
});

test("known false 6,132,082 amount / 61,320 points is an unverified stored estimate only", () => {
  const value = guardPointsDisplaySources([ledger({ points:61320, amount_thb:6132082, payment_ref:"" })], []);
  assert.equal(value.state, "review_required");
  assert.equal(value.verifiedRecords.length, 0);
  assert.equal(value.historicalPoints.grossPoints, 61320);
  assert.equal(value.historicalPoints.state, "unverified_estimate");
});

test("UID/message-number amount text never generates gross or spendable points", () => {
  for (const fields of [{ points:undefined, amount_thb:6132082 }, { points:undefined, amount_thb:"U6132082abcdef" }, { points:undefined, amount_thb:"message 6132082 บาท" }]) {
    const value = guardPointsDisplaySources([ledger(fields)], [payment()]);
    assert.equal(value.state, "review_required");
    assert.equal(value.historicalPoints.grossPoints, 0);
    assert.equal(value.verifiedRecords.length, 0);
  }
});

test("valid money-truth points survive and gross stays before expiry/redemption", () => {
  const record = ledger();
  const value = guardPointsDisplaySources([record], [payment()]);
  assert.equal(value.state, "verified");
  assert.deepEqual(value.verifiedRecords, [record]);
  assert.equal(value.historicalPoints.grossPoints, 10);
  assert.equal(guardPointsDisplaySources([record, {...ledger({ points:-2 }), id:"rec-debit"}], [payment()]).state, "review_required");
  assert.equal(guardPointsDisplaySources([ledger({ session_id:"other" })], [payment({ session_id:"fixture" })]).state, "review_required");
});

function fixture(records = [ledger()], payments = [payment()], fail = "") {
  const methods = [];
  const env = {
    AIRTABLE_API_KEY:"fixture", AIRTABLE_BASE_ID:"app-fixture", LIFF_SESSION_SECRET:"s".repeat(32),
    LIFF_IDENTITY_KV: { get: async key => key.startsWith("liff:session:")
      ? { expires_at:Date.now()+60000, line_user_id:`U${"a".repeat(32)}`, member_id:"member-fixture", member_exists:true, member_profile:{tier:"SVIP"} }
      : { state:"reconciled" } },
    AIRTABLE_HTTP: { fetch: async request => {
      methods.push(request.method);
      const table = new URL(request.url).pathname.split("/").pop();
      if (table === fail) throw new Error("fixture_read_failure");
      return Response.json({ records:table === "tblgWc5VRon5o8Mhk" ? [{id:"rec-member", fields:{ member_id:"member-fixture", email:"fixture@example.test" }}] : table === "tbl5dfnwjUFMLbnWL" ? records : payments });
    } },
  };
  return {env, methods};
}
const request = path => new Request(`https://mmdbkk.com${path}`, { headers:{cookie:"__Host-mmd_liff_session=fixture"} });
const profile = () => ({ ok:true, data:{tier:"SVIP", membership_status:"active", points:61320, points_records_count:1, customer_360:{member:{tier:"SVIP"},points:{status:"verified",active_points:61320}}} });

test("read errors/missing context and reload cannot revive stale profile points", async () => {
  for (const failedTable of ["tblgWc5VRon5o8Mhk", "tbl5dfnwjUFMLbnWL", "tblWGGJJOx5eBvBZJ"]) {
    const {env, methods} = fixture(undefined, undefined, failedTable);
    for (let reload = 0; reload < 2; reload++) {
      const req = request("/member/api/liff/profile");
      const context = await prepareMyMmdLifetimePointsContext(req, env);
      const response = await applyMyMmdLifetimePointsResponse(req, Response.json(profile()), context);
      const value = (await response.json()).data;
      assert.equal(value.points, null);
      assert.equal(value.customer_360.points.active_points, null);
      assert.equal(value.customer_360.points.status, "checking");
      assert.equal(value.tier, "SVIP");
      assert.equal(value.membership_status, "active");
    }
    assert.ok(methods.every(method => method === "GET"));
  }
  const response = await applyMyMmdLifetimePointsResponse(request("/member/api/liff/profile"), Response.json(profile()), null);
  assert.equal((await response.json()).data.points, null);
});

test("valid fixture lookup displays the verified amount-derived points without any writes", async () => {
  const {env, methods} = fixture();
  const req = request("/member/api/liff/profile");
  const context = await prepareMyMmdLifetimePointsContext(req, env);
  assert.equal(context.sourceVerified, true);
  const value = (await (await applyMyMmdLifetimePointsResponse(req, Response.json(profile()), context)).json()).data;
  assert.equal(value.points, 10);
  assert.equal(value.customer_360.points.active_points, 10);
  assert.equal(value.tier, "SVIP");
  assert.ok(methods.every(method => method === "GET"));
});

test("unknown source or blocked recovery masks every customer points shape", async () => {
  for (const path of ["/api/member/app/points", "/api/member/app/dashboard", "/api/member/app/profile", "/api/member/dashboard", "/member/api/liff/profile"]) {
    for (const context of [null, {state:"blocked",recoveryState:"blocked"}]) {
      const response = await applyMyMmdLifetimePointsResponse(request(path), Response.json({ ...profile(), points_confirmed:61320, summary:{confirmedBalance:61320}, points:{confirmedBalance:61320}, data:{...profile().data,points:{status:"verified",value:61320,active_points:61320}} }), context);
      const value = await response.json();
      if (path === "/api/member/app/points") assert.equal(value.summary.confirmedBalance, null);
      if (path === "/api/member/app/dashboard") assert.equal(value.points.confirmedBalance, null);
      if (path === "/api/member/app/profile") assert.equal(value.points_confirmed, null);
      if (path === "/api/member/dashboard") assert.equal(value.data.points.value, null);
      if (path === "/member/api/liff/profile") assert.equal(value.data.points, null);
    }
  }
});

test("duplicate payment awards, conflicting idempotency rows and missing dates never inflate balance", () => {
  assert.equal(guardPointsDisplaySources([ledger(), {...ledger(),id:"rec-duplicate"}], [payment()]).state, "review_required");
  assert.equal(guardPointsDisplaySources([ledger(),ledger({points:20})], [payment()]).state, "review_required");
  assert.equal(guardPointsDisplaySources([ledger({posted_at:"",created_at:""})], [payment()]).state, "review_required");
});
