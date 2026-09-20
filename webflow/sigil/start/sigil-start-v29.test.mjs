import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("./sigil-start-v29.html",import.meta.url),"utf8");

test("exact three-lane product shape is preserved",()=>{
  assert.equal((html.match(/data-lane="/g)||[]).length,3);
  assert.match(html,/01 · MEMBER CARD/);
  assert.match(html,/02 · MODEL CARDS/);
  assert.match(html,/03 · PARTNER/);
  assert.match(html,/KENJI/);
  assert.match(html,/TarT/);
  assert.match(html,/YUKI/);
});

test("new Kenji asset is locked",()=>{
  assert.match(html,/6ab030ae56be7bcca053d2cd_Kenji%20sigil%20start\.webp/);
  assert.doesNotMatch(html,/Kenji%20-%20Inme\.webp/);
});

test("TH EN ZH share one i18n runtime",()=>{
  assert.match(html,/data-lang="th"/);
  assert.match(html,/data-lang="en"/);
  assert.match(html,/data-lang="zh"/);
  assert.match(html,/\bth:\{/);
  assert.match(html,/\ben:\{/);
  assert.match(html,/\bzh:\{/);
  assert.match(html,/searchParams\.set\("lang",lang\)/);
});

test("mobile page stays compact",()=>{
  assert.match(html,/role="tablist"/);
  assert.match(html,/data-tab="member"/);
  assert.match(html,/data-tab="model"/);
  assert.match(html,/data-tab="partner"/);
  assert.match(html,/card\.hidden=mobile\?card\.dataset\.lane!==name:false/);
  assert.match(html,/class="st29__detail"/);
  assert.doesNotMatch(html,/\b(swiper|slick|splide|carousel)\b/i);
});

test("Apple-like transitions and font color regression locks remain",()=>{
  assert.match(html,/cubic-bezier\(\.22,1,.36,1\)/);
  assert.match(html,/IntersectionObserver/);
  assert.match(html,/filter:blur\(7px\)/);
  assert.match(html,/prefers-reduced-motion:reduce/);
  assert.match(html,/-webkit-text-fill-color:currentColor!important/);
  assert.match(html,/"Noto Sans SC"/);
  assert.match(html,/@media\(max-width:420px\)/);
});

test("canonical lane destinations remain intact",()=>{
  for(const route of [
    "/sigil/inme",
    "/sigil/member/membership",
    "/apply/public-model",
    "/sigil/apply/model",
    "/sigil/travel-model",
    "/sigil/apply/partner",
    "/partner"
  ]) assert.ok(html.includes(route),route);
});

test("context handoff is preserved on outgoing lane links",()=>{
  for(const key of ["t","code","promo","liff.state","from","payment_ref","session_id"]){
    assert.ok(html.includes('"'+key+'"'),key);
  }
  assert.match(html,/data-preserve-link/);
});

test("visible copy avoids internal authority language",()=>{
  const visible=html.replace(/<script>[\s\S]*?<\/script>/g,"").replace(/<style>[\s\S]*?<\/style>/g,"");
  assert.doesNotMatch(visible,/\b(token|worker|backend|router|routing|staff|admin)\b/i);
});
