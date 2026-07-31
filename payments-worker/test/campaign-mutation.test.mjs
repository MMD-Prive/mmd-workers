import test from "node:test";
import assert from "node:assert/strict";
import { createSerializedMutationRunner, executeMutationGate, MutationError } from "../campaign-mutation-core.js";
import { isPrivatePromotionRequest } from "../campaign-auth.js";

const CAMPAIGN = "mmd_6th_anniversary_2026";
const HASH = "a".repeat(64);
const actor = { id: "per", sessionId: "admin-session-1" };

function item(type, payload = {}) { return { campaignId:CAMPAIGN, claimId:"claim-1", benefitType:type,
  idempotencyKey:`${CAMPAIGN}:${HASH}:${type}`, payload }; }
function input(overrides = {}) { return { campaignId:CAMPAIGN,claimId:"claim-1",identityHash:HASH,memberId:"member-1",
  membershipEndSnapshot:"2026-12-31",requestId:"request-1",actor,paymentRequired:false,upgradeRequired:false,paymentTruth:{},
  plan:[item("membership_extension",{months:6,newExpiry:"2027-06-30",tier:"standard"}),item("anniversary_points",{points:300,expiresAt:"2027-08-01"})],...overrides }; }

class FakeStore {
  constructor(){this.apps=new Map();this.membershipMutations=0;this.pointsMutations=0;this.writes=[];this.failPointsOnce=false;this.failMembership=false;}
  async getApplication(key){const value=this.apps.get(key);return value?{...value,wasExisting:true}:null;}
  async reserveApplication(benefit,context,previous){this.#context(context);const value={recordId:benefit.idempotencyKey,idempotencyKey:benefit.idempotencyKey,
    benefitType:benefit.benefitType,status:"applying",retryCount:Number(previous?.retryCount||0)+(previous?1:0),wasExisting:false};this.apps.set(benefit.idempotencyKey,value);this.writes.push(["reserve",benefit.benefitType]);return value;}
  async markApplication(current,status,mutation,context){this.#context(context);const value={...current,status,after:mutation,wasExisting:false};this.apps.set(current.idempotencyKey,value);this.writes.push(["mark",current.benefitType,status]);return value;}
  async applyMembershipAtomically(context,items){this.#context(context);if(this.failMembership)throw new MutationError("membership_failed",true);await new Promise(r=>setTimeout(r,5));this.membershipMutations+=1;
    this.writes.push(["membership_atomic",items.map(x=>x.benefitType).sort(),"tier_and_expiry_one_write"]);return {newExpiry:items[0].payload.newExpiry,newTier:items.some(x=>x.benefitType==="membership_upgrade")?"premium":"standard"};}
  async applyPoints(context,item){this.#context(context);if(this.failPointsOnce){this.failPointsOnce=false;throw new MutationError("points_failed",true);}this.pointsMutations+=1;this.writes.push(["points",item.payload.points]);return {points:item.payload.points};}
  #context(value){for(const field of [value.requestId,value.actor?.id,value.actor?.sessionId,value.claimId])assert.ok(field);}
}

test("unpaid expired/new Apply is rejected while current needs no payment", async()=>{
  await assert.rejects(()=>executeMutationGate(input({paymentRequired:true,paymentTruth:{}}),new FakeStore()),/verified_payment_required/);
  const store=new FakeStore();const result=await executeMutationGate(input(),store);assert.equal(result.status,"completed");assert.equal(store.membershipMutations,1);
});

test("renewal and Premium upgrade payment truths are both required",async()=>{
  const plan=[item("membership_extension",{newExpiry:"2027-06-30"}),item("membership_upgrade",{tier:"premium",newExpiry:"2027-06-30"}),item("anniversary_points",{points:200,expiresAt:"2027-08-01"})];
  await assert.rejects(()=>executeMutationGate(input({plan,paymentRequired:true,upgradeRequired:true,paymentTruth:{paymentVerified:true}}),new FakeStore()),/verified_upgrade_payment_required/);
  const store=new FakeStore();const result=await executeMutationGate(input({plan,paymentRequired:true,upgradeRequired:true,paymentTruth:{paymentVerified:true,upgradePaymentVerified:true}}),store);
  assert.equal(result.status,"completed");assert.equal(store.membershipMutations,1);assert.deepEqual(store.writes.find(x=>x[0]==="membership_atomic")[1],["membership_extension","membership_upgrade"]);
});

test("duplicate and simultaneous Apply mutate months and Points once",async()=>{
  const store=new FakeStore();const run=createSerializedMutationRunner(store);const [a,b]=await Promise.all([run(input()),run(input({requestId:"request-2"}))]);
  assert.equal(a.status,"completed");assert.equal(b.status,"completed");assert.equal(store.membershipMutations,1);assert.equal(store.pointsMutations,1);
  assert.ok(b.results.every(x=>x.status==="already_applied"));
});

test("failed Points retries without membership and failed membership never completes",async()=>{
  const store=new FakeStore();store.failPointsOnce=true;const first=await executeMutationGate(input(),store);assert.equal(first.status,"partial_failure");assert.equal(store.membershipMutations,1);assert.equal(store.pointsMutations,0);
  const second=await executeMutationGate(input({requestId:"request-2"}),store);assert.equal(second.status,"completed");assert.equal(store.membershipMutations,1);assert.equal(store.pointsMutations,1);
  const failed=new FakeStore();failed.failMembership=true;const result=await executeMutationGate(input(),failed);assert.equal(result.status,"partial_failure");assert.equal(failed.pointsMutations,0);
});

test("every write carries audit context and public host cannot use internal secret",async()=>{
  const store=new FakeStore();await executeMutationGate(input(),store);assert.ok(store.writes.length>=5);
  const env={INTERNAL_SERVICE_SECRET:"s".repeat(32)};const headers={"x-mmd-service-binding":"promotion-worker","x-mmd-internal-secret":"s".repeat(32)};
  assert.equal(await isPrivatePromotionRequest(new Request("https://mmdbkk.com/v1/internal/campaign-benefits/apply",{headers}),env),false);
  assert.equal(await isPrivatePromotionRequest(new Request("https://payments-worker.local/v1/internal/campaign-benefits/apply",{headers}),env),true);
});
