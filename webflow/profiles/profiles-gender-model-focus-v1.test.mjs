import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const js=fs.readFileSync(path.join(here,"profiles-gender-model-focus-v1.js"),"utf8");
const css=fs.readFileSync(path.join(here,"profiles-gender-model-focus-v1.css"),"utf8");

test("customer gender is fail-closed until male or female is selected",()=>{
  assert.match(js,/SUPPORTED_GENDERS=\['male','female'\]/);
  assert.match(js,/is-visibility-pending/);
  assert.match(css,/is-visibility-pending \.mp8-profile-focus/);
  assert.match(css,/\[data-gender-value="all"\]\{\s*display:none!important/);
});

test("query gender is restored through the existing gender buttons",()=>{
  assert.match(js,/new URLSearchParams\(location\.search\)\.get\('gender'\)/);
  assert.match(js,/button\.click\(\)/);
  assert.match(js,/u\.searchParams\.set\('gender',gender\)/);
});

test("role selection focuses visible profiles rather than packages",()=>{
  assert.match(js,/focus\.scrollIntoView/);
  assert.match(js,/moveOffersBelowProfiles/);
  assert.match(js,/focus\.insertAdjacentElement\('afterend',holder\)/);
  assert.match(js,/window\.setTimeout\(\(\)=>\{\s*applyCopy\(root,gate,focus\);\s*focusProfiles/);
});

test("visibility gate and profile focus support TH EN ZH",()=>{
  for(const locale of ["th","en","zh"])assert.match(js,new RegExp("\\b"+locale+":\\{"));
  assert.match(js,/PROFILE VISIBILITY/);
  assert.match(js,/VISIBLE TO YOU/);
});

test("patch does not recompute canonical visibility or fetch catalog data",()=>{
  assert.doesNotMatch(js,/fetch\(/);
  assert.doesNotMatch(js,/accepted_customer_genders/);
  assert.doesNotMatch(js,/approved_roles/);
  assert.doesNotMatch(js,/entitlement/i);
  assert.doesNotMatch(js,/price_thb/i);
});
