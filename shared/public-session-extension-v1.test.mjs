import test from "node:test";
import assert from "node:assert/strict";
import { pricePublicExtension, extensionIdentity, PUBLIC_EXTENSION_POLICY_VERSION } from "./public-session-extension-v1.mjs";

test("DAY OFF extension prices daytime and after-midnight minutes without prebook premium",()=>{
  const daytime=pricePublicExtension({
    packageCode:"day_off_short",
    originalEndAt:"2026-09-22T13:00:00.000Z", // 20:00 BKK
    requestedEndAt:"2026-09-22T15:00:00.000Z", // 22:00
  });
  assert.equal(daytime.ok,true);
  assert.equal(daytime.customer_amount_thb,1980);
  assert.equal(daytime.model_payout_thb,1300);
  assert.equal(daytime.prebook_after_midnight_premium_applied,false);

  const midnight=pricePublicExtension({
    packageCode:"night_out",
    originalEndAt:"2026-09-22T16:00:00.000Z", // 23:00
    requestedEndAt:"2026-09-22T19:00:00.000Z", // 02:00
  });
  assert.equal(midnight.ok,true);
  assert.equal(midnight.customer_amount_thb,3970); // 1h*990 + 2h*1490
  assert.equal(midnight.model_payout_thb,2650);
});

test("Sport Activity extension follows its public package matrix",()=>{
  const result=pricePublicExtension({
    packageCode:"move_with_me",
    originalEndAt:"2026-09-22T06:00:00.000Z", // 13:00 BKK
    requestedEndAt:"2026-09-22T07:30:00.000Z", // 14:30 BKK
  });
  assert.equal(result.ok,true);
  assert.equal(result.customer_amount_thb,1485);
  assert.equal(result.model_payout_thb,975);
  assert.equal(result.official_end_changes_only_after,"model_approved+payment_verified+mmd_confirmed");
});

test("Wellness Companion extension protects the qualified-rate floor",()=>{
  const result=pricePublicExtension({
    packageCode:"reset_with_me",
    originalEndAt:"2026-09-22T06:00:00.000Z",
    requestedEndAt:"2026-09-22T07:30:00.000Z",
  });
  assert.equal(result.ok,true);
  assert.equal(result.customer_amount_thb,2535);
  assert.equal(result.model_payout_thb,1500);
  assert.equal(result.requested_minutes,90);
  assert.equal(result.policy_version,PUBLIC_EXTENSION_POLICY_VERSION);
  assert.equal(result.official_end_changes_only_after,"model_approved+payment_verified+mmd_confirmed");
});

test("after 03:00 changes band and after 06:00 fails closed",()=>{
  const priced=pricePublicExtension({
    packageCode:"formal_evening",
    originalEndAt:"2026-09-22T19:00:00.000Z", // 02:00
    requestedEndAt:"2026-09-22T22:00:00.000Z", // 05:00
  });
  assert.equal(priced.ok,true);
  assert.equal(priced.customer_amount_thb,5970); // 1h 1790 + 2h 2090
  assert.equal(priced.model_payout_thb,4000); // 1h 1200 + 2h 1400

  const blocked=pricePublicExtension({
    packageCode:"own_the_night",
    originalEndAt:"2026-09-22T21:00:00.000Z", // 04:00
    requestedEndAt:"2026-09-23T00:00:00.000Z", // 07:00
  });
  assert.equal(blocked.ok,false);
  assert.equal(blocked.review_required,true);
  assert.equal(blocked.reason,"after_0600_requires_mmd_review");
});

test("driver and culinary midnight extension fail closed until a midnight policy exists",()=>{
  for(const packageCode of ["pick_me_up","cook_with_me"]){
    const result=pricePublicExtension({
      packageCode,
      originalEndAt:"2026-09-22T16:30:00.000Z", // 23:30
      requestedEndAt:"2026-09-22T17:30:00.000Z", // 00:30
    });
    assert.equal(result.ok,false);
    assert.equal(result.review_required,true);
    assert.equal(result.reason,"package_midnight_extension_requires_mmd_review");
  }
});

test("flat daytime packages and 30-minute proration are deterministic",()=>{
  const driver=pricePublicExtension({
    packageCode:"pick_me_up",
    originalEndAt:"2026-09-22T06:00:00.000Z",
    requestedEndAt:"2026-09-22T07:30:00.000Z",
  });
  assert.equal(driver.ok,true);
  assert.equal(driver.customer_amount_thb,1185);
  assert.equal(driver.model_payout_thb,825);

  const culinary=pricePublicExtension({
    packageCode:"cook_with_me",
    originalEndAt:"2026-09-22T06:00:00.000Z",
    requestedEndAt:"2026-09-22T06:30:00.000Z",
  });
  assert.equal(culinary.ok,true);
  assert.equal(culinary.customer_amount_thb,345);
  assert.equal(culinary.model_payout_thb,225);
});

test("change-plan is review-only and invalid duration is rejected",()=>{
  const change=pricePublicExtension({
    requestKind:"change_plan",
    packageCode:"night_out",
    originalEndAt:"2026-09-22T15:00:00Z",
    requestedEndAt:"2026-09-22T16:00:00Z",
  });
  assert.equal(change.ok,false);
  assert.equal(change.review_required,true);
  assert.equal(change.reason,"change_plan_requires_mmd_requote");

  const bad=pricePublicExtension({
    packageCode:"night_out",
    originalEndAt:"2026-09-22T15:00:00Z",
    requestedEndAt:"2026-09-22T15:45:00Z",
  });
  assert.equal(bad.ok,false);
  assert.equal(bad.reason,"extension_must_be_30_to_360_minutes_in_30_minute_steps");
});

test("request identity is stable and distinct by requested end",async()=>{
  const a=await extensionIdentity({sessionId:"sess-1",originalEndAt:"2026-09-22T15:00:00Z",requestedEndAt:"2026-09-22T16:00:00Z"});
  const b=await extensionIdentity({sessionId:"sess-1",originalEndAt:"2026-09-22T15:00:00Z",requestedEndAt:"2026-09-22T16:00:00Z"});
  const c=await extensionIdentity({sessionId:"sess-1",originalEndAt:"2026-09-22T15:00:00Z",requestedEndAt:"2026-09-22T17:00:00Z"});
  assert.deepEqual(a,b);
  assert.notEqual(a.request_id,c.request_id);
  assert.match(a.payment_ref,/^pay_ext_/);
  assert.equal(PUBLIC_EXTENSION_POLICY_VERSION,"mmd_public_session_extension_v1_20260922");
});
