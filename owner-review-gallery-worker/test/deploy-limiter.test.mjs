import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../src/deploy-entry.mjs";
import { REVIEW_HOST } from "../src/index.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ORIGIN = "https://" + REVIEW_HOST;
const CODE = "owner-gallery-32-character-fixture-value-2026";
const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CODE)));
const HASH = [...digest].map(x => x.toString(16).padStart(2,"0")).join("");
const ENV = {
  OWNER_REVIEW_CODE_SHA256: HASH,
  OWNER_REVIEW_SESSION_HMAC_KEY: "fixture-not-a-real-session-key-32-or-more-characters",
};
const req = (path, init={}) => new Request(ORIGIN + path, init);
const body = code => new URLSearchParams({ code }).toString();
const attempt = code => req("/unlock", {
  method: "POST",
  headers: { "origin": ORIGIN, "content-type": "application/x-www-form-urlencoded" },
  body: body(code)
});
const limiter = () => ({ limit: async () => ({ success: true }) });

test("deployment unlock is unavailable without limiter even with correct code and secrets", async () => {
  const r=await worker.fetch(attempt(CODE), ENV, {});
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("cache-control").includes("no-store"),true);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal((await r.json()).error, "review_rate_limit_unavailable");
});

test("rate limit exceptions fail closed without exposing internal exception", async () => {
  const r=await worker.fetch(attempt(CODE), {...ENV, OWNER_REVIEW_RATE_LIMIT: {limit: async()=>{throw Error("backend private text")}}}, {});
  assert.equal(r.status,503);
  assert.doesNotMatch(await r.text(),/backend private text/);
});

test("429 does not check code or produce auth cookie", async () => {
  let calls=0;
  const r=await worker.fetch(attempt(CODE), {...ENV, OWNER_REVIEW_RATE_LIMIT:{limit:async ({key})=>{calls++;assert.equal(key,"owner-review-unlock");return {success:false}}}}, {});
  assert.equal(calls,1);
  assert.equal(r.status,429);
  assert.equal(r.headers.get("retry-after"),"60");
  assert.equal(r.headers.get("set-cookie"),null);
});

test("successful limit continues through normal strong-code validation and signing", async () => {
  let calls=0;
  const env={...ENV, OWNER_REVIEW_RATE_LIMIT:{limit:async()=>{calls++;return {success:true}}}};
  const bad=await worker.fetch(attempt("very-wrong-password-that-is-long-enough"),env,{});
  assert.equal(bad.status,401);
  const good=await worker.fetch(attempt(CODE),env,{});
  assert.equal(good.status,303);
  assert.equal(good.headers.get("location"),"/");
  assert.match(good.headers.get("set-cookie"),/HttpOnly; SameSite=Strict/);
  assert.equal(calls,2);
});

test("LINE or Safari same-origin navigation may omit Origin but remains securely accepted", async () => {
  const env={...ENV, OWNER_REVIEW_RATE_LIMIT:limiter()};
  const metadataPost=req("/unlock",{
    method:"POST",
    headers:{
      "content-type":"application/x-www-form-urlencoded",
      "sec-fetch-site":"same-origin",
      "sec-fetch-mode":"navigate",
      "sec-fetch-dest":"document"
    },
    body:body(CODE)
  });
  const viaMetadata=await worker.fetch(metadataPost,env,{});
  assert.equal(viaMetadata.status,303);

  const refererPost=req("/unlock",{
    method:"POST",
    headers:{
      "content-type":"application/x-www-form-urlencoded",
      "referer":ORIGIN+"/"
    },
    body:body(CODE)
  });
  const viaReferer=await worker.fetch(refererPost,env,{});
  assert.equal(viaReferer.status,303);
});

test("absent proof and explicitly foreign Origin still fail closed", async () => {
  const env={...ENV, OWNER_REVIEW_RATE_LIMIT:limiter()};
  const noProof=await worker.fetch(req("/unlock",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:body(CODE)
  }),env,{});
  assert.equal(noProof.status,403);
  assert.equal((await noProof.json()).error,"origin_rejected");

  const foreign=await worker.fetch(req("/unlock",{
    method:"POST",
    headers:{
      "origin":"https://evil.example",
      "content-type":"application/x-www-form-urlencoded",
      "sec-fetch-site":"same-origin",
      "sec-fetch-mode":"navigate",
      "sec-fetch-dest":"document",
      "referer":ORIGIN+"/"
    },
    body:body(CODE)
  }),env,{});
  assert.equal(foreign.status,403);
  assert.equal((await foreign.json()).error,"origin_rejected");
});

test("root forms use same-origin referrer policy without leaking to external routes", async () => {
  const root=await worker.fetch(req("/"),ENV,{});
  assert.equal(root.status,200);
  assert.equal(root.headers.get("referrer-policy"),"same-origin");
  const view=await worker.fetch(req("/view/control-room"),ENV,{});
  assert.equal(view.status,200);
  assert.equal(view.headers.get("referrer-policy"),"no-referrer");
});

test("health and all non-unlock routes retain existing mock-only behavior", async () => {
  const h=await worker.fetch(req("/healthz"),ENV,{});
  assert.equal(h.status,200);
  assert.equal((await h.json()).production_authority,false);
  const mutation=await worker.fetch(req("/view/control-room",{method:"POST",headers:{origin:ORIGIN},body:"action=approve"}),ENV,{});
  assert.equal(mutation.status,405);
});
