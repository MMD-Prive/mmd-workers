import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config=JSON.parse(await readFile(new URL("./bangkok-companion-packages-v1.json",import.meta.url),"utf8"));

test("Bangkok Companion public prices and payouts are locked",()=>{
  assert.deepEqual(config.public_packages.map(x=>[x.key,x.price_thb,x.worker_payout_thb]),[
    ["bangkok_with_me",5900,3600],
    ["local_bangkok",7900,4800],
    ["your_bangkok_day",10500,6400],
  ]);
});

test("licensed guide is a separate verified request",()=>{
  assert.equal(config.positioning,"local_companion_not_tour_guide");
  assert.equal(config.licensed_guide_request.quote_required,true);
  assert.equal(config.licensed_guide_request.guide_license_verification_required,true);
  assert.equal(config.licensed_guide_request.general_bangkok_companion_must_not_be_marketed_as_licensed_guide,true);
});

test("Bangkok Companion extension rules and money lane are Public-only",()=>{
  const r=config.public_extension_rules;
  assert.equal(r.overtime_before_midnight_client_thb_per_hour,1190);
  assert.equal(r.overtime_after_midnight_client_thb_per_hour,1690);
  assert.equal(r.overtime_after_0300_client_thb_per_hour,1990);
  assert.equal(r.no_double_charge_same_minute,true);
  assert.equal(config.money_lane,"public_model");
  assert.equal(config.geography.outside_bangkok,"re_quote_required");
  assert.match(config.private_money_separation,/never apply automatically/);
});
