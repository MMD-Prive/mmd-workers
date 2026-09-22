import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config=JSON.parse(await readFile(new URL("./social-appearance-packages-v1.json",import.meta.url),"utf8"));

test("Social Appearance prices and payouts are locked",()=>{
  assert.deepEqual(config.public_packages.map(x=>[x.key,x.price_thb,x.worker_payout_thb]),[
    ["dinner_guest",5500,3300],
    ["event_partner",6900,4200],
    ["formal_evening",9500,5800],
  ]);
});

test("commercial usage is never implied by a normal Social Appearance booking",()=>{
  assert.equal(config.custom_quote.commercial_usage_rights_included,false);
  assert.equal(config.custom_quote.media_usage_requires_separate_consent,true);
  assert.equal(config.custom_quote.quote_required,true);
});

test("Social Appearance extension rules are explicit and Public-only",()=>{
  const r=config.public_extension_rules;
  assert.equal(r.overtime_before_midnight_client_thb_per_hour,1290);
  assert.equal(r.overtime_after_midnight_client_thb_per_hour,1790);
  assert.equal(r.overtime_after_0300_client_thb_per_hour,2090);
  assert.equal(r.no_double_charge_same_minute,true);
  assert.equal(config.money_lane,"public_model");
  assert.match(config.private_money_separation,/never apply automatically/);
});
