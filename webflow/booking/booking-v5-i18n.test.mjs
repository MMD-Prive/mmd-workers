import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(here,"booking-v4.html"),"utf8");
const block=source.slice(source.indexOf("<!-- BOOKING_V5_EDITORIAL_I18N_START -->"));

test("booking v5 keeps the existing booking-v4 runtime and adds one bounded enhancement",()=>{
  assert.match(source,/id="mmd-booking-v4"/);
  assert.match(source,/medicalRequestOnly = role === "medical_professional"/);
  assert.match(source,/window\.location\.replace\("\/public\/access\?"/);
  assert.equal((source.match(/BOOKING_V5_EDITORIAL_I18N_START/g)||[]).length,1);
  assert.equal((source.match(/BOOKING_V5_EDITORIAL_I18N_END/g)||[]).length,1);
});

test("booking v5 supports TH EN ZH and query language precedence",()=>{
  for(const lang of ["th","en","zh"])assert.match(block,new RegExp("\\\\b"+lang+":\\\\{"));
  assert.match(block,/qs\.get\('lang'\)/);
  assert.match(block,/localStorage\.getItem\('mmd_lang'\)/);
  assert.match(block,/document\.documentElement\.lang/);
  assert.match(block,/u\.searchParams\.set\('lang',lang\)/);
});

test("all canonical mood and service choices have localized copy",()=>{
  for(const mood of ["Easy Dinner","City & Travel","Sport & Daytime"])assert.ok(block.includes("'"+mood+"':{"));
  for(const service of [
    "Driver Companion","Culinary Companion","Everyday Companion","Night Life Companion",
    "Social Appearance","Bangkok Companion","Dinner","Travel","Sport Activity",
    "Wellness Companion","Business Companion","Creative Companion","Lifestyle / Sport","Let MMD advise"
  ])assert.ok(block.includes("'"+service+"':{"));
});

test("all role-specific booking heroes are localized",()=>{
  for(const role of [
    "driver_companion","culinary_companion","everyday_companion","sport_activity",
    "wellness_companion","business_companion","creative_companion","nightlife_companion",
    "social_appearance","bangkok_companion"
  ])assert.match(block,new RegExp("\\\\b"+role+":\\\\{"));
});

test("all package keys have localized visible detail without changing price truth",()=>{
  for(const key of [
    "pick_me_up","airport_please","wait_for_me","half_day_with_him","cook_with_me",
    "dinner_made_for_you","market_to_table","private_table","day_off_short","day_off_half_day",
    "day_off_full_day","move_with_me","game_day","active_day","reset_with_me","wellness_day",
    "slow_reset","business_lunch","smart_presence","context_day","gallery_with_me","creative_city",
    "creative_day","night_out","dinner_to_midnight","own_the_night","dinner_guest","event_partner",
    "formal_evening","bangkok_with_me","local_bangkok","your_bangkok_day"
  ])assert.match(block,new RegExp("\\\\b"+key+":\\\\{"));
  assert.doesNotMatch(block,/price\s*:/);
});

test("localized form includes summary status clipboard and reduced-motion handling",()=>{
  assert.match(block,/clipboard:\{title:/);
  assert.match(block,/translateSummary/);
  assert.match(block,/translateStatus/);
  assert.match(block,/installCopyHandler/);
  assert.match(block,/@media\(prefers-reduced-motion:reduce\)/);
});

test("booking v5 does not add network or payment behavior",()=>{
  assert.doesNotMatch(block,/fetch\(/);
  assert.doesNotMatch(block,/payment/i);
  assert.doesNotMatch(block,/entitlement/i);
});
