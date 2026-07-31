import test from "node:test";
import assert from "node:assert/strict";
import { assertSnapshotsImmutable } from "../src/airtable-claim-store.js";
import { createSerializedClaimOp } from "../src/claim-open-core.js";

const snapshot={identityHash:"a".repeat(64),claimCreatedAt:"2026-08-01T00:00:00Z",eligibilityReferenceDate:"2026-08-01",
  membershipTier:"standard",membershipStartSnapshot:"2026-01-01",membershipEndSnapshot:"2026-12-31",
  membershipHistorySnapshot:[{tier:"standard"}],eligibility:{status:"current_member"},status:"current_member",pointsAward:300};

test("first Claim snapshot cannot be overwritten",()=>{
  assert.doesNotThrow(()=>assertSnapshotsImmutable(snapshot,{...snapshot,claimStatus:"benefit_approved"}));
  for(const key of ["identityHash","membershipTier","membershipEndSnapshot","membershipHistorySnapshot","eligibility","pointsAward"]){
    const changed={...snapshot,[key]:key==="pointsAward"?200:"changed"};assert.throws(()=>assertSnapshotsImmutable(snapshot,changed),/immutable_snapshot/);
  }
});

test("campaign plus identity Claim resumes under simultaneous opens",async()=>{
  let saved=null;let creates=0;const store={async findByIdentity(){await new Promise(r=>setTimeout(r,2));return saved;},
    async create(claim){creates+=1;saved={...claim,claimId:"claim-1"};return saved;}};
  const open=createSerializedClaimOp(store);const audit={};const [first,second]=await Promise.all([open(snapshot,audit),open(snapshot,audit)]);
  assert.equal(creates,1);assert.ok(first.created);assert.equal(second.existing.claimId,"claim-1");
});
