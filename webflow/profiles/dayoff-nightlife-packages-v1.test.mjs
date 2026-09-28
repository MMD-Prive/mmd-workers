import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./dayoff-nightlife-packages-v1.json", import.meta.url), "utf8"));

test("Day Off and Night Life public prices are locked", () => {
  const got = Object.values(config.products).flatMap((product) => product.packages).map((item) => [item.key,item.price_thb]);
  assert.deepEqual(got, [
    ["day_off_short",3500],["day_off_half_day",5500],["day_off_full_day",8500],
    ["night_out",4500],["dinner_to_midnight",6500],["own_the_night",8900],
  ]);
});

test("after-midnight rules are explicit and non-stacking", () => {
  const r=config.public_extension_rules;
  assert.equal(r.overtime_before_midnight_client_thb_per_hour,990);
  assert.equal(r.prebook_after_midnight_client_thb_per_hour,500);
  assert.equal(r.overtime_after_midnight_client_thb_per_hour,1490);
  assert.equal(r.overtime_after_0300_client_thb_per_hour,1790);
  assert.equal(r.after_0600,"manual_review_required");
  assert.equal(r.no_double_charge_same_minute,true);
  assert.deepEqual(r.extension_flow,["MY_MMD_request","MMD_MODEL_approve","payment_verified","MMD_confirmed"]);
});

test("Public money remains separated from Private money", () => {
  assert.equal(config.money_lane,"public_model");
  assert.match(config.private_money_separation,/never apply automatically/);
});
