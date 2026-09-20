import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const LINE_ID = `U${"a".repeat(32)}`;
const SECRET = "s".repeat(48);

function request(body = {}, headers = {}) {
  return worker.fetch(new Request("https://mmdbkk.com/member/api/liff/dashboard?t=safe&member_id=spoof&campaign_claim_id=spoof", {
    method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body),
  }), environment());
}

function environment(overrides = {}) {
  return {
    LINE_ID_HASH_SECRET:"h".repeat(48),INTERNAL_SERVICE_SECRET:SECRET,
    PROMOTION_MEMBER_STATUS_RESOLVER:{ fetch:async () => Response.json({ data:{
      memberId:"member-1",displayName:"เปอร์",pointsActive:366,membershipTier:"premium",
      membershipEndAt:"2099-12-31",membershipHistory:[{ verified:true }],
    } }) },
    PROMOTION_WORKER:{ fetch:async (upstream) => {
      const sent = await upstream.json();
      assert.match(sent.identityHash,/^[a-f0-9]{64}$/);
      assert.equal("memberId" in sent,false);
      assert.equal("campaign_claim_id" in sent,false);
      return Response.json({ ok:true,data:{ id:"mmd_6th_anniversary_2026",label:"6 YEARS · CARE BACK",status:"completed",
        title:"CARE BACK เรียบร้อยแล้ว",message:"เรียบร้อยแล้วครับ",benefit_summary:"เพิ่ม 300 Points",
        effective_until:"2099-12-31",action:{type:"none",label:null,href:null},updated_at:"2026-08-04T00:00:00.000Z" } });
    } },
    ...overrides,
  };
}

test("dashboard rejects missing and invalid LINE access token", async () => {
  assert.equal((await request()).status,401);
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({ error:"invalid" },{ status:401 });
  try { assert.equal((await request({}, { authorization:"Bearer expired" })).status,401); }
  finally { globalThis.fetch=original; }
});

test("verified identity selects readback server-side and response excludes internal identifiers", async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({ userId:LINE_ID });
  try {
    const response=await request({ member_id:"other",line_user_id:`U${"b".repeat(32)}`,campaign_claim_id:"claim-other" },{ authorization:"Bearer verified" });
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.data.member.display_name,"เปอร์");
    assert.equal(body.data.membership.tier,"premium");
    assert.equal(body.data.points.active_points,366);
    assert.equal(body.data.campaign.status,"completed");
    assert.doesNotMatch(JSON.stringify(body),/campaign_claim_id|claimReference|payment_reference|record_id|admin_actor|admin_session|audit|internal_reason|line_user_id/i);
  } finally { globalThis.fetch=original; }
});

test("dashboard read is fail-closed when campaign dependency fails", async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({ userId:LINE_ID });
  try {
    const response=await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/dashboard",{ method:"POST",headers:{ authorization:"Bearer verified" } }),environment({
      PROMOTION_WORKER:{ fetch:async()=>Response.json({ ok:false,error:"dependency_down" },{ status:503 }) },
    }));
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,"dependency_down");
  } finally { globalThis.fetch=original; }
});
