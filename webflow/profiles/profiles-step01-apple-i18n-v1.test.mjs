import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const js=fs.readFileSync(path.join(here,"profiles-step01-apple-i18n-v1.js"),"utf8");
const css=fs.readFileSync(path.join(here,"profiles-step01-apple-i18n-v1.css"),"utf8");

test("Step 01 uses the approved Midnight Penthouse portrait",()=>{
  assert.match(js,/6abe21bf8b4385f0a73a7635_Midnight%20Penthouse%20Fashion%20Portrait\.webp/);
});

test("Step 01 i18n includes TH EN ZH and every role key",()=>{
  for(const lang of ["th","en","zh"])assert.match(js,new RegExp("\\b"+lang+":\\{"));
  for(const role of [
    "everyday_companion","driver_companion","culinary_companion","social_appearance",
    "bangkok_companion","sport_activity","wellness_companion","business_companion",
    "nightlife_companion","creative_companion","medical_professional"
  ]) assert.match(js,new RegExp(role+":\\["));
  assert.match(js,/maleMassage:\[/);
  assert.match(js,/customBrief:\[/);
});

test("language state follows query document lang and storage safely",()=>{
  const query=js.indexOf("new URLSearchParams(location.search).get('lang')");
  const html=js.indexOf("document.documentElement.lang");
  const storage=js.indexOf("localStorage.getItem('mmd_lang')");
  assert.ok(query>=0);
  assert.ok(html>query);
  assert.ok(storage>html);
  assert.match(js,/x==='zh'\|\|x\.startsWith\('zh-'\)\|\|x==='cn'/);
  assert.match(js,/x==='en'\|\|x\.startsWith\('en-'\)/);
  assert.match(js,/x==='th'\|\|x\.startsWith\('th-'\)/);
});

test("Apple-style motion is presentation-only and respects reduced motion",()=>{
  assert.match(css,/cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css,/filter:blur\(8px\) saturate\(\.9\)/);
  assert.match(css,/letter-spacing:-\.065em/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(js,/IntersectionObserver/);
});

test("patch targets only Profiles Step 01 presentation surfaces",()=>{
  assert.match(js,/\.mp8-role-first/);
  assert.match(js,/\.mp8-role-grid/);
  assert.doesNotMatch(js,/fetch\(/);
  assert.doesNotMatch(js,/entitlement/i);
  assert.doesNotMatch(js,/price_thb/i);
  assert.doesNotMatch(js,/payment/i);
});
