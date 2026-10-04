import test from "node:test";
import assert from "node:assert/strict";
import { computePhase1Points } from "./points-phase1.js";

test("100 THB = 1 point and no remainder", () => {
  assert.deepEqual(computePhase1Points(0, 100), {
    prior_remainder_thb: 0,
    eligible_amount_thb: 100,
    pool_thb: 100,
    points: 1,
    remainder_after_thb: 0,
    rate_thb_per_point: 100,
  });
});

test("remainder carries across eligible payments", () => {
  assert.deepEqual(computePhase1Points(60, 50), {
    prior_remainder_thb: 60,
    eligible_amount_thb: 50,
    pool_thb: 110,
    points: 1,
    remainder_after_thb: 10,
    rate_thb_per_point: 100,
  });
});

test("sub-100 payment still produces a remainder state", () => {
  const result = computePhase1Points(0, 99);
  assert.equal(result.points, 0);
  assert.equal(result.remainder_after_thb, 99);
});

test("whole THB math never produces negative wallet input", () => {
  assert.deepEqual(computePhase1Points(-40, 250.9), {
    prior_remainder_thb: 0,
    eligible_amount_thb: 250,
    pool_thb: 250,
    points: 2,
    remainder_after_thb: 50,
    rate_thb_per_point: 100,
  });
});

// Exercise the actual writer/coordinator boundary with fixture Airtable only.
import { awardBasePointsPhase1, PointsPhase1Coordinator } from "./points-phase1.js";
function identityFixture(t, { rows = [{id:"fixture-member-row",fields:{member_id:"canonical-fixture"}}], rowsForFormula, readError } = {}) {
  const originalFetch = globalThis.fetch;
  const reads = [], writes = [], coordinatorCalls = [], names = [];
  const ledger = [];
  t.after(()=>{globalThis.fetch=originalFetch;});
  globalThis.fetch = async (raw, init={}) => {
    const url=new URL(raw), method=init.method || "GET";
    if (method === "POST") {
      const fields=JSON.parse(init.body).records[0].fields;
      const row={id:`fixture-ledger-${ledger.length+1}`,fields}; ledger.push(row); writes.push(fields);
      return Response.json({records:[row]});
    }
    reads.push(url);
    const formula=url.searchParams.get("filterByFormula") || "";
    if (url.pathname.endsWith("/Members")) {
      assert.equal(url.searchParams.get("maxRecords"),"2");
      if(readError) return Response.json(readError.body || {},{status:readError.status});
      return Response.json({records:rowsForFormula ? rowsForFormula(formula) : rows});
    }
    assert.ok(url.pathname.endsWith("/tbl5dfnwjUFMLbnWL"));
    if(formula.startsWith("{payment_ref}")) return Response.json({records:ledger.filter(r=>formula.includes(`"${r.fields.payment_ref}"`))});
    return Response.json({records:ledger.filter(r=>formula.includes(`"${r.fields.member_id}"`)).slice(-1)});
  };
  const env={AIRTABLE_API_KEY:"fixture-token",AIRTABLE_BASE_ID:"fixture-base"};
  const coordinator = new PointsPhase1Coordinator({},env);
  env.POINTS_PHASE1_COORDINATOR={idFromName:name=>{names.push(name);return name;},get:()=>({fetch:async(url,init)=>{coordinatorCalls.push(JSON.parse(init.body));return coordinator.fetch(new Request(url,init));}})};
  return {env,reads,writes,coordinatorCalls,names,ledger};
}
const payment = extra=>({payment_ref:"fixture-payment",stage:"full",session_id:"fixture-session",amount_thb:160,member_email:"fixture@example.invalid",...extra});
for(const fields of [{member_id:"canonical-fixture"},{"Member ID":"canonical-fixture"},{member_id:" canonical-fixture ","Member ID":"canonical-fixture",memberstack_id:"legacy-different"}]) test(`canonical row alias accepted ${JSON.stringify(fields)}`,async t=>{
 const f=identityFixture(t,{rows:[{id:"fixture-member-row",fields}]});const r=await awardBasePointsPhase1(f.env,payment());assert.equal(r.member_id,"canonical-fixture");assert.equal(r.points,1);assert.equal(r.remainder_after_thb,60);assert.equal(f.writes.length,1);assert.deepEqual(f.names,["member:canonical-fixture"]);assert.equal(f.reads.filter(u=>u.pathname.endsWith("/Members")).length,3);
});
for(const rows of [[{id:"fixture-row",fields:{memberstack_id:"legacy-only"}}],[{id:"fixture-row",fields:{member_id:"a","Member ID":"b"}}],[{id:"fixture-row",fields:{member_id:["a"]}}],[{id:"fixture-row",fields:{member_id:{id:"a"}}}],[{id:"fixture-row",fields:{member_id:123}}],[{id:"one",fields:{member_id:"a"}},{id:"two",fields:{member_id:"a"}}],[]]) test(`unresolved canonical identity never reaches coordinator ${JSON.stringify(rows)}`,async t=>{
 const f=identityFixture(t,{rows});const r=await awardBasePointsPhase1(f.env,payment());assert.equal(r.reason,"canonical_member_id_required");assert.equal(r.awarded,false);assert.equal(f.coordinatorCalls.length,0);assert.equal(f.writes.length,0);assert.ok(f.reads.every(u=>u.pathname.endsWith("/Members")));
});
test("email aliases pointing to different Member rows fail closed",async t=>{const f=identityFixture(t,{rowsForFormula:formula=>[{id:formula.includes("{email}")?"one":"two",fields:{member_id:"canonical-fixture"}}]});assert.equal((await awardBasePointsPhase1(f.env,payment())).reason,"canonical_member_id_required");assert.equal(f.names.length,0);assert.equal(f.writes.length,0);});
test("supplied canonical ID conflicting with email match cannot award either account",async t=>{const f=identityFixture(t);assert.equal((await awardBasePointsPhase1(f.env,payment({member_id:"other-canonical"}))).reason,"canonical_member_id_required");assert.equal(f.names.length,0);assert.equal(f.writes.length,0);});
for(const supplied of [{member_id:"canonical-fixture","Member ID":"other"},{member_id:["canonical-fixture"]},{member_id:{id:"canonical-fixture"}},{memberstack_id:"legacy-only"}]) test(`direct malformed/conflicting/legacy-only input blocked ${JSON.stringify(supplied)}`,async t=>{const f=identityFixture(t);const r=await awardBasePointsPhase1(f.env,payment({member_email:"",...supplied}));assert.equal(r.reason,"canonical_member_id_required");assert.equal(f.reads.length,0);assert.equal(f.names.length,0);assert.equal(f.writes.length,0);});
for(const status of [401,403,429,500,422]) test(`read failure ${status} cannot fall through to another email alias`,async t=>{const f=identityFixture(t,{readError:{status,body:{error:{type:"FIXTURE_ERROR",message:"read unavailable"}}}});assert.equal((await awardBasePointsPhase1(f.env,payment())).reason,"canonical_member_id_required");assert.equal(f.reads.length,1);assert.equal(f.names.length,0);assert.equal(f.writes.length,0);});
test("missing schema email alias can use an unambiguous existing canonical alias",async t=>{const f=identityFixture(t);const original=globalThis.fetch;globalThis.fetch=async(raw,init)=>new URL(raw).searchParams.get("filterByFormula")?.startsWith("LOWER({email})")?Response.json({error:{type:"INVALID_FILTER_BY_FORMULA",message:"Unknown field names: email"}},{status:422}):original(raw,init);const r=await awardBasePointsPhase1(f.env,payment());assert.equal(r.member_id,"canonical-fixture");assert.equal(f.writes.length,1);});
test("canonical ID without email keeps serialization, replay and remainder accounting",async t=>{const f=identityFixture(t);const p=payment({member_id:"canonical-fixture",member_email:""});const first=await awardBasePointsPhase1(f.env,p);const replay=await awardBasePointsPhase1(f.env,p);assert.equal(first.points,1);assert.equal(first.remainder_after_thb,60);assert.equal(replay.duplicate,true);assert.equal(replay.awarded,false);assert.equal(f.writes.length,1);const second=await awardBasePointsPhase1(f.env,{...p,payment_ref:"fixture-next",amount_thb:50});assert.equal(second.prior_remainder_thb,60);assert.equal(second.points,1);assert.equal(second.remainder_after_thb,10);assert.equal(f.writes.length,2);assert.equal(f.writes[0].idempotency_key,"base_phase1:fixture-payment");assert.equal(Date.parse(f.writes[0].expires_at)-Date.parse(f.writes[0].posted_at),365*86400000);});
test("replay payment ref bound to a different canonical account fails without another write",async t=>{const f=identityFixture(t);const p=payment({member_id:"canonical-fixture",member_email:""});await awardBasePointsPhase1(f.env,p);await assert.rejects(awardBasePointsPhase1(f.env,{...p,member_id:"other-canonical"}),/canonical_member_id_required/);assert.equal(f.writes.length,1);});
test("coordinator rejects conflicting canonical aliases before any ledger read",async t=>{const f=identityFixture(t);const c=new PointsPhase1Coordinator({},f.env);const r=await c.fetch(new Request("https://points.internal/award",{method:"POST",body:JSON.stringify(payment({member_id:"a","Member ID":"b"}))}));assert.equal(r.status,500);assert.equal((await r.json()).error,"canonical_member_id_required");assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);});
for(const input of [{"Member ID":"canonical-fixture",member_email:""},{member_id:"canonical-fixture"}]) test(`supplied valid canonical alias remains accepted ${JSON.stringify(input)}`,async t=>{const f=identityFixture(t);const r=await awardBasePointsPhase1(f.env,payment(input));assert.equal(r.member_id,"canonical-fixture");assert.equal(f.writes.length,1);});
test("paginated Member matches are ambiguous and cannot reach coordinator",async t=>{const f=identityFixture(t);globalThis.fetch=async()=>Response.json({records:[{id:"one",fields:{member_id:"canonical-fixture"}}],offset:"another-page"});assert.equal((await awardBasePointsPhase1(f.env,payment())).reason,"canonical_member_id_required");assert.equal(f.names.length,0);assert.equal(f.writes.length,0);});
test("network failure cannot award to supplied ID with unresolved email",async t=>{const f=identityFixture(t);globalThis.fetch=async()=>{throw new Error("fixture-network-unavailable");};assert.equal((await awardBasePointsPhase1(f.env,payment({member_id:"canonical-fixture"}))).reason,"canonical_member_id_required");assert.equal(f.names.length,0);assert.equal(f.writes.length,0);});
test("ineligible stage still exits without reading identity or writing points",async t=>{const f=identityFixture(t);assert.equal((await awardBasePointsPhase1(f.env,payment({stage:"refund"}))).reason,"stage_not_eligible");assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);});
