import test from "node:test";
import assert from "node:assert/strict";
import { guardPointsDisplaySources, paymentRefsForPoints, sessionIdsForHistoricalPoints } from "../src/points-display-source-guard.js";
import { prepareMyMmdLifetimePointsContext, applyMyMmdLifetimePointsResponse, readMyMmdVerifiedPointsContext } from "../src/my-mmd-lifetime-points.js";

const ledger = (fields = {}) => ({ id:"rec-ledger", fields: { member_id:"member-fixture", transaction_status:"posted", points:10, amount_thb:1000, payment_ref:"pay-fixture", posted_at:new Date().toISOString(), ...fields } });
const payment = (fields = {}) => ({ id:"rec-payment", fields: { Client:["recFixtureClient"], "Payment Reference":"pay-fixture", "Payment Status":"Paid", "Verification Status":"verified", Amount:1000, ...fields } });
const historical = (fields = {}) => ledger({
  member_id:"member-fixture",
  source:"line_ofc_history", created_by:"member_history_recovery_v2_note_first",
  rate_policy:"historical_lifetime_total_100_thb_1_point_v2",
  idempotency_key:"historical_note_total_v2:recFixtureClient", payment_ref:"",
  expires_at:"2030-01-01T00:00:00.000Z", ...fields,
});
const materialized = (fields = {}) => historical({
  created_by:"history_materializer_v1", rate_policy:"historical_100_thb_1_pt_remainder",
  idempotency_key:"historical_base:pay-history", payment_ref:"pay-history", session_id:"session-history",
  amount_thb:150, eligible_amount_thb:150, points:2, prior_remainder_thb:50, pool_thb:200,
  remainder_after_thb:0, ...fields,
});
const companionPayment = (fields = {}) => ({id:"payment-history",fields:{
  "Payment Reference":"pay-history", session_id:"session-history", Client:["recFixtureClient"],
  "Payment Status":"Paid", ...fields,
}});
const companionSession = (fields = {}) => ({id:"session-history-row",fields:{
  session_id:"session-history", Client:["recFixtureClient"], ...fields,
}});
const historicalGuard = (rows, payments = [], sessions = []) => guardPointsDisplaySources(rows, payments, {clientId:"recFixtureClient",sessions});

test("posted historical note Points require no slip or Payments lookup", () => {
  const record = historical({ payment_ref:"old-optional-reference" });
  const value = historicalGuard([record]);
  assert.equal(value.state, "verified");
  assert.deepEqual(value.verifiedRecords, [record]);
  assert.deepEqual(paymentRefsForPoints([record]), []);
});

test("historical remainder writer retains its existing carry-forward arithmetic", () => {
  const record = materialized();
  const payments = [companionPayment()];
  const sessions = [companionSession()];
  assert.equal(historicalGuard([record], payments, sessions).state, "verified");
  assert.equal(sessionIdsForHistoricalPoints([record])[0], "session-history");
  assert.equal(paymentRefsForPoints([record])[0], "pay-history");
  assert.equal(historicalGuard([materialized({pool_thb:300})], payments, sessions).state, "review_required");
});

test("note-first aggregate validates against the reconciled group including carried remainder", () => {
  const carried = materialized();
  const aggregate = historical({amount_thb:900,eligible_amount_thb:900,points:8});
  const value = historicalGuard([carried,aggregate],[companionPayment()],[companionSession()]);
  assert.equal(value.state,"verified");
  assert.deepEqual(value.verifiedRecords,[carried,aggregate]);
  assert.equal(historicalGuard([carried,historical({amount_thb:900,eligible_amount_thb:900,points:9})],
    [companionPayment()],[companionSession()]).state,"review_required");
  assert.equal(historicalGuard([historical({amount_thb:900,eligible_amount_thb:900,points:8})]).state,"review_required");
});

test("materialized history requires exact Payment and Session Client ownership without payment verification", () => {
  const record=materialized();
  assert.equal(historicalGuard([record],[companionPayment({Client:["recOtherClient"]})],[companionSession()]).state,"review_required");
  assert.equal(historicalGuard([record],[companionPayment()],[companionSession({Client:["recOtherClient"]})]).state,"review_required");
  assert.equal(historicalGuard([record],[],[companionSession()]).state,"review_required");
  assert.equal(historicalGuard([record],[companionPayment(),companionPayment({id:"duplicate-payment"})],[companionSession()]).state,"review_required");
  assert.equal(historicalGuard([record],[companionPayment()],[companionSession(),companionSession()]).state,"review_required");
  const legacyPayment=companionPayment({"Verification Status":"pending_review"});
  assert.equal(historicalGuard([record],[legacyPayment],[companionSession()]).state,"verified");
});

test("shared payment references across historical/current rows fail closed in either order", () => {
  const old=materialized();
  const current=ledger({payment_ref:"pay-history",session_id:"session-history"});
  for(const rows of [[old,current],[current,old]]) {
    const value=historicalGuard(rows,[companionPayment()],[companionSession()]);
    assert.equal(value.state,"review_required");
    assert.ok(value.unresolvedRecords>0);
  }
});

for (const [label, invalid] of Object.entries({
  unknown_writer:{created_by:"browser"}, wrong_policy:{rate_policy:"new_payment"},
  missing_key:{idempotency_key:""}, wrong_key:{idempotency_key:"historical_note_total_v2:unknown"},
  negative:{points:-10}, fractional:{points:1.5}, wrong_ratio:{points:999},
  missing_amount:{amount_thb:undefined}, arbitrary_text:{amount_thb:"message 1000 บาท"},
  invalid_date:{posted_at:"invalid"}, missing_posted_date:{posted_at:""},
  unsafe_points:{points:Number.MAX_SAFE_INTEGER+1},
})) test(`historical Points fail closed for ${label}`, () => {
  assert.equal(historicalGuard([historical(invalid)]).state, "review_required");
});

for (const expiry of [undefined,"not-a-date","2026-02-30T00:00:00.000Z","2026-10-01T00:00:00"]) {
  test(`note aggregate fails closed for missing/malformed expiry ${String(expiry)}`,()=>{
    assert.equal(historicalGuard([historical({expires_at:expiry})]).state,"review_required");
  });
}

test("pending/reversed history never creates a spendable award", () => {
  for (const record of [historical({transaction_status:"pending"}),historical({reversed_at:"2026-10-01"})]) {
    assert.deepEqual(guardPointsDisplaySources([record], []).verifiedRecords, []);
  }
});

test("historical duplicates do not inflate and conflicting writer provenance fails closed", () => {
  const row = historical();
  assert.equal(historicalGuard([row,row]).verifiedRecords.length, 1);
  assert.equal(historicalGuard([row,historical({created_by:"other"})]).state, "review_required");
});

test("mixed historical/current awards retain current payment verification", () => {
  const old = historical();
  const current = {...ledger(),id:"current-ledger"};
  assert.deepEqual(paymentRefsForPoints([old,current]), ["pay-fixture"]);
  assert.equal(historicalGuard([old,current]).state, "review_required");
  assert.equal(historicalGuard([old,current], [payment()]).verifiedRecords.length, 2);
});

test("historical aggregate must belong to the unique current canonical Client", () => {
  assert.equal(guardPointsDisplaySources([historical()], []).state,"review_required");
  assert.equal(guardPointsDisplaySources([historical()], [], {clientId:"recOtherClient"}).state,"review_required");
});

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

function fixture(records = [ledger()], payments = [payment()], fail = "", sessions = []) {
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
      if (table === "tblVv58TCbwh5j1fS") return Response.json({records:[{
        id:"recFixtureClient",fields:{line_user_id:`U${"a".repeat(32)}`},
      }]});
      return Response.json({ records:table === "tblgWc5VRon5o8Mhk" ? [{id:"rec-member", fields:{ member_id:"member-fixture", Clients:["recFixtureClient"], email:"fixture@example.test" }}]
        : table === "tbl5dfnwjUFMLbnWL" ? records
        : table === "tblC98mKWbzmPuNzX" ? sessions : payments });
    } },
  };
  return {env, methods};
}
test("internal cache-miss recovery still reads the guarded ledger rather than preload Points", async () => {
  for (const verified of [true, false]) {
    const { env, methods } = fixture(undefined, [payment({ "Verification Status": verified ? "verified" : "pending_review" })]);
    env.LIFF_IDENTITY_KV.get = async () => null;
    const fetch = env.AIRTABLE_HTTP.fetch;
    env.AIRTABLE_HTTP.fetch = async request => {
      const table = new URL(request.url).pathname.split("/").pop();
      if (table === "tblNV1b5sMC2fQPxt") {
        assert.equal(request.method, "GET");
        return Response.json({ records: [{ id: "recProjectionFixture", fields: { projection_json: JSON.stringify({
          schema: "my_mmd_batch_preload_v1", computed_at: new Date().toISOString(),
          client_id: "recFixtureClient", member_id: "member-fixture", identity: { state: "ready", member_linked: true },
          history_backfill_status: "reconciled", current_points_confirmed: 999,
          points_policy: { mode: "expiring_lots", expires: true },
        }) } }] });
      }
      return fetch(request);
    };
    const context = await readMyMmdVerifiedPointsContext(env, {
      memberId: "member-fixture", lineUserId: `U${"a".repeat(32)}`, strictIdentity: true,
    });
    assert.equal(context.sourceVerified === true, verified);
    if (verified) assert.equal(context.confirmedBalance, 10);
    assert.notEqual(context.confirmedBalance, 999);
    assert.ok(methods.every(method => method === "GET"));
  }
});

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

test("LIFF reads historical Points without payments/slips and never changes membership/payment", async () => {
  const {env,methods} = fixture([historical()], [], "tblWGGJJOx5eBvBZJ");
  const req = request("/member/api/liff/profile");
  const context = await prepareMyMmdLifetimePointsContext(req,env);
  assert.equal(context.sourceVerified,true);
  assert.equal(context.serviceSpendVerified,false);
  assert.equal(context.serviceSpend365Thb,null);
  const response = await applyMyMmdLifetimePointsResponse(req,Response.json({
    ...profile(),data:{...profile().data,payment_status:"unavailable"},
  }),context);
  const value=(await response.json()).data;
  assert.equal(value.points,10);
  assert.equal(value.membership_status,"active");
  assert.equal(value.tier,"SVIP");
  assert.equal(value.payment_status,"unavailable");
  assert.ok(methods.every(method=>method==="GET"));
});

for (const [label,clients] of Object.entries({
  missing:[],ambiguous:[
    {id:"recFixtureClient",fields:{line_user_id:`U${"a".repeat(32)}`}},
    {id:"recOtherClient",fields:{line_user_id:`U${"a".repeat(32)}`}},
  ],foreign:[{id:"recFixtureClient",fields:{line_user_id:`U${"b".repeat(32)}`}}],
})) test(`LIFF historical Points fail closed for ${label} canonical Client`, async () => {
  const {env,methods}=fixture([historical()]);
  const fetch=env.AIRTABLE_HTTP.fetch;
  env.AIRTABLE_HTTP.fetch=async req=>new URL(req.url).pathname.endsWith("/tblVv58TCbwh5j1fS")
    ? Response.json({records:clients}) : fetch(req);
  const context=await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.notEqual(context.sourceVerified,true);
  assert.equal(context.pointsRecoveryPending,true);
  assert.ok(methods.every(method=>method==="GET"));
});

test("LIFF email fallback cannot accept another member's historical award", async () => {
  const {env}=fixture([historical({member_id:"another-member"})]);
  const context=await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.notEqual(context.sourceVerified,true);
});

test("LIFF can read materialized history by canonical Client links without re-verifying payment",async()=>{
  const record=materialized();
  const {env,methods}=fixture([record],[companionPayment({member_id:undefined,"Verification Status":"pending_review"})],"",[companionSession()]);
  const context=await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.equal(context.sourceVerified,true);
  assert.equal(context.confirmedBalance,2);
  assert.equal(context.serviceSpendVerified,false);
  const response=await applyMyMmdLifetimePointsResponse(request("/member/api/liff/profile"),Response.json(profile()),context);
  const publicBody=await response.text();
  for(const privateValue of [`U${"a".repeat(32)}`,"recFixtureClient","pay-history","session-history","fixture@example.test"]) {
    assert.equal(publicBody.includes(privateValue),false);
  }
  assert.ok(methods.every(method=>method==="GET"));
});

test("LIFF materialized history fails closed for missing or foreign companion Client",async()=>{
  for(const sessions of [[],[companionSession({Client:["recOtherClient"]})]]) {
    const {env}=fixture([materialized()],[companionPayment()],"",sessions);
    const context=await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
    assert.notEqual(context.sourceVerified,true);
    assert.equal(context.pointsRecoveryPending,true);
  }
});

test("historical expiry stays unchanged; no expired award is reactivated", async () => {
  const {env}=fixture([historical({expires_at:"2020-01-01T00:00:00Z"})]);
  const context=await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.equal(context.sourceVerified,true);
  assert.equal(context.confirmedBalance,0);
  assert.equal(context.expiredPoints,10);
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


test("canonical Points reader scopes by member ID only and accepts the Payments Client link without a member_id field", async () => {
  const { env } = fixture();
  const original = env.AIRTABLE_HTTP.fetch;
  const formulas = [];
  env.AIRTABLE_HTTP.fetch = async req => {
    const url = new URL(req.url);
    if (url.pathname.endsWith("tbl5dfnwjUFMLbnWL")) formulas.push(url.searchParams.get("filterByFormula"));
    return original(req);
  };
  for (const strictIdentity of [false,true]) {
    const result = await readMyMmdVerifiedPointsContext(env, {memberId:"member-fixture",lineUserId:`U${"a".repeat(32)}`,strictIdentity});
    assert.equal(result.sourceVerified, true);
    assert.equal(result.confirmedBalance, 10);
  }
  assert.deepEqual(formulas, ["{member_id}='member-fixture'","{member_id}='member-fixture'"]);
});

for (const [label, alter, expectedReason] of [
  ["shared-email foreign ledger", (table, payload) => { if(table === "tbl5dfnwjUFMLbnWL") payload.records[0].fields.member_id = "foreign"; }, "ledger_owner_mismatch"],
  ["Member linked to other Client", (table, payload) => { if(table === "tblgWc5VRon5o8Mhk") payload.records[0].fields.Clients = ["recOtherClient"]; }, "member_client_mismatch"],
  ["Member with no Client", (table, payload) => { if(table === "tblgWc5VRon5o8Mhk") delete payload.records[0].fields.Clients; }, "member_client_mismatch"],
  ["ambiguous canonical Client", (table, payload) => { if(table === "tblVv58TCbwh5j1fS") payload.records.push({...payload.records[0],id:"recOtherClient"}); }, "canonical_client_unresolved"],
  ["Payment linked to other Client", (table, payload) => { if(table === "tblWGGJJOx5eBvBZJ") payload.records[0].fields.Client = ["recOtherClient"]; }, undefined],
  ["Member linked to multiple Clients", (table, payload) => { if(table === "tblgWc5VRon5o8Mhk") payload.records[0].fields.Clients = ["recFixtureClient","recOtherClient"]; }, "member_client_mismatch"],
  ["Payment missing Client", (table, payload) => { if(table === "tblWGGJJOx5eBvBZJ") delete payload.records[0].fields.Client; }, undefined],
  ["non-string ledger owner", (table, payload) => { if(table === "tbl5dfnwjUFMLbnWL") payload.records[0].fields.member_id = ["member-fixture"]; }, "ledger_owner_mismatch"],
]) test(`Points reader fails closed for ${label}`, async () => {
  const {env} = fixture();
  const original = env.AIRTABLE_HTTP.fetch;
  env.AIRTABLE_HTTP.fetch = async req => {
    const payload = await (await original(req)).json();
    alter(new URL(req.url).pathname.split("/").pop(), payload);
    return Response.json(payload);
  };
  const result = await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"), env);
  assert.notEqual(result.sourceVerified, true);
  assert.equal(result.pointsRecoveryPending, true);
  if(expectedReason) assert.equal(result.reason, expectedReason);
});

test("current Phase 1 posted Points preserve the writer's carried remainder", async () => {
  const row = ledger({amount_thb:150,eligible_amount_thb:150,points:2,prior_remainder_thb:50,pool_thb:200,remainder_after_thb:0,
    source:"system",points_bucket:"base_phase1",rate_policy:"phase1_100_thb_1_pt_remainder",idempotency_key:"base_phase1:pay-fixture"});
  const paid = payment({Amount:150});
  assert.equal(guardPointsDisplaySources([row],[paid],{clientId:"recFixtureClient"}).state,"verified");
  const {env} = fixture([row],[paid]);
  const result = await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.equal(result.sourceVerified,true);
  assert.equal(result.confirmedBalance,2);
  for(const change of [{prior_remainder_thb:100},{pool_thb:201},{remainder_after_thb:1},{points:3},{idempotency_key:"forged"}]) {
    assert.equal(guardPointsDisplaySources([{...row,fields:{...row.fields,...change}}],[paid]).state,"review_required");
  }
});

test("missing ledger status keeps the balance unresolved instead of certifying zero", async () => {
  const row = ledger({transaction_status:undefined});
  assert.equal(guardPointsDisplaySources([row],[payment()]).state,"review_required");
  const {env} = fixture([row]);
  const context = await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.notEqual(context.sourceVerified,true);
  assert.equal(context.pointsRecoveryPending,true);
});

test("Members lookup must return the exact canonical member ID requested by the session", async () => {
  for(const id of [undefined,"other-member",["member-fixture"]]) {
    const {env} = fixture();
    const original = env.AIRTABLE_HTTP.fetch;
    env.AIRTABLE_HTTP.fetch = async req => {
      const payload = await (await original(req)).json();
      if(new URL(req.url).pathname.endsWith("tblgWc5VRon5o8Mhk")) payload.records[0].fields.member_id=id;
      return Response.json(payload);
    };
    const context = await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
    assert.notEqual(context.sourceVerified,true);
  }
});

test("ordinary LIFF reads reject conflicting payment member identity despite a matching Client link", async () => {
  const {env} = fixture(undefined,[payment({member_id:"other-member"})]);
  const context = await prepareMyMmdLifetimePointsContext(request("/member/api/liff/profile"),env);
  assert.notEqual(context.sourceVerified,true);
  assert.equal(context.pointsRecoveryPending,true);
});

test("unknown ledger states cannot be silently converted into a verified zero", () => {
  assert.equal(guardPointsDisplaySources([ledger({transaction_status:"unexpected"})],[payment()]).state,"review_required");
});

test("Phase 1 bucket cannot downgrade to generic arithmetic by losing its writer policy", () => {
  const row = ledger({points_bucket:"base_phase1",rate_policy:"unknown",source:"system",idempotency_key:"base_phase1:pay-fixture",
    eligible_amount_thb:1000,prior_remainder_thb:50,pool_thb:1050,remainder_after_thb:50});
  assert.equal(guardPointsDisplaySources([row],[payment()]).state,"review_required");
  row.fields.rate_policy="phase1_100_thb_1_pt_remainder";
  assert.equal(guardPointsDisplaySources([row],[payment()]).state,"verified");
});
