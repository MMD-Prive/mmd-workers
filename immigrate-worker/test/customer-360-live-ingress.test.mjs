import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "customer-360-live-"));
const outfile = join(tmp, "entry.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  await build({
    entryPoints: [join(workerRoot, "src/customer-360-live-ingress-wrapper.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const { decorateCustomer360Page, enforceExactCanonicalClientScope, redactCustomerQueueResponse, resolveRequestedClientId } = await import(pathToFileURL(outfile).href);

  assert.equal(resolveRequestedClientId(new URLSearchParams("client_id=recCanonical123")), "recCanonical123");
  assert.equal(resolveRequestedClientId(new URLSearchParams("client_id=%20recCanonical123%20")), "recCanonical123");
  assert.equal(resolveRequestedClientId(new URLSearchParams("")), "");
  assert.equal(resolveRequestedClientId(new URLSearchParams("client_id=recCanonical123&client_id=recDifferent456")), "");

  const page = await decorateCustomer360Page(new Response('<html><body><main class="c360"><button data-backfill>นำเข้าจาก LINE</button><strong data-client>Not linked</strong></main></body></html>', {
    headers: { "content-type": "text/html; charset=utf-8", "x-mmd-customer-data-ui": "readable-v2", "x-mmd-customer-data-authority": "identity-context-staging-only" },
  }));
  const html = await page.text();
  assert.equal(page.headers.get("x-mmd-customer-360"), "live-v1");
  assert.equal(page.headers.get("x-mmd-customer-intelligence"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-customer-identity-alignment"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-verified-identity-readiness"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-identity-evidence-recovery"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-identity-evidence-owner-review"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-customer-data-ui"), "readable-v2");
  assert.match(html, /data-mmd-customer-360-live-client="v1"/);
  assert.match(html, /data-mmd-customer-identity-alignment-client="v1"/);
  assert.match(html, /data-mmd-customer-identity-evidence-protocol-client="v1"/);
  assert.match(html, /MY MMD \/ LIFF/);
  assert.match(html, /VERIFIED MATCH/);
  assert.match(html, /Verified Identity Readiness/);
  assert.match(html, /READY FOR PER REVIEW/);
  assert.match(html, /mmd\.kenji_verified_identity_readiness\.v1/);
  assert.match(html, /automatic_verification_allowed===false/);
  assert.match(html, /Readiness contract ไม่ครบ · ห้ามตัดสิน Verified จากหน้านี้/);
  assert.match(html, /ขั้นตอนเก็บหลักฐานและ Owner Review/);
  assert.match(html, /mmd\.kenji_identity_evidence_owner_review_protocol\.v1/);
  assert.match(html, /evidence_written===false/);
  assert.match(html, /reread_identity_evidence/);
  assert.match(html, /เปิดจาก Member Intelligence · อ่านอย่างเดียว/);
  assert.match(html, /revealDirectClient/);
  assert.match(html, /decisionNode\.hidden=true/);
  assert.match(html, /\/v1\/admin\/customer-data\/backfill\/continue/);
  assert.match(html, /\/v1\/admin\/clients\/intelligence/);
  assert.match(html, /Pause/);
  assert.match(html, /Resume/);
  assert.match(html, /Create Job/);
  assert.match(html, /Member Intelligence/);
  assert.match(html, /credentials:'include'/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.doesNotMatch(html, /Authorization|X-Confirm-Key|CONFIRM_KEY/);

  const scopedPage = await decorateCustomer360Page(new Response('<html><head></head><body><main class="c360"><section class="summary"></section><nav class="memory-guide"></nav><section class="work"><aside></aside><article><div data-empty></div><div data-detail hidden><section class="decision"></section></div></article></section><button data-backfill></button><button data-refresh></button><span data-state></span><div data-list></div><script>(function(){function q(s){return document.querySelector(s)}function load(){}function summary(){}load(\'review_required\');summary()})();</script></main></body></html>', {
    headers: { "content-type": "text/html; charset=utf-8" },
  }), "recCanonical123");
  const scopedHtml = await scopedPage.text();
  assert.equal(scopedPage.status, 200);
  assert.match(scopedHtml, /validClientScope/);
  assert.match(scopedHtml, /requestedIds\.length===1/);
  assert.match(scopedHtml, /\[hidden\]\{display:none!important\}/);
  assert.match(scopedHtml, /if\(directScope\)\{if\(txt\(d\.client_id\)!==id\|\|d\.identity\?\.status!=='canonical'\)throw Error\('client_scope_unresolved'\);revealDirectClient\(\)\}/);
  assert.match(scopedHtml, /if\(backfill\)backfill.disabled=imp.running\|\|directScope/);
  assert.match(scopedHtml, /const directScope=true/);
  assert.match(scopedHtml, /getAll\('client_id'\),directClient=clientIds\.length===1/);
  assert.match(scopedHtml, /String\(clientIds\[0\]\|\|''\)\.trim\(\)/);
  assert.match(scopedHtml, /INTEL\+'\?client_id='\+encodeURIComponent\(id\)/);
  const emptyScopedPage = await decorateCustomer360Page(new Response('<html><head></head><body><script>load(\'review_required\');summary()})();</script></body></html>', { headers: { 'content-type': 'text/html' } }), '');
  assert.equal(emptyScopedPage.status, 200);
  const emptyScopedHtml = await emptyScopedPage.text();
  assert.doesNotMatch(emptyScopedHtml, /load\('review_required'\);summary\(\)/);
  assert.match(emptyScopedHtml, /CLIENT SCOPE LOCKED/);
  assert.match(emptyScopedHtml, /client_id ไม่ถูกต้องหรือไม่ชัดเจน/);
  assert.match(emptyScopedHtml, /const directScope=true/);
  assert.match(scopedHtml, /CLIENT SCOPE LOCKED/);
  assert.match(scopedHtml, /เปิดเฉพาะ Canonical Client ที่เลือก/);
  assert.doesNotMatch(scopedHtml, /load\('review_required'\);summary\(\)/);

  const exactScope = await enforceExactCanonicalClientScope(Response.json({
    ok: true,
    client_id: "recCanonical123",
    identity: { status: "canonical" },
  }), "recCanonical123");
  assert.equal(exactScope.status, 200);

  const mismatchScope = await enforceExactCanonicalClientScope(Response.json({
    ok: true,
    client_id: "recDifferent456",
    identity: { status: "canonical" },
  }), "recCanonical123");
  assert.equal(mismatchScope.status, 409);
  assert.deepEqual(await mismatchScope.json(), { ok: false, error: "client_scope_unresolved" });

  const ambiguousScope = await enforceExactCanonicalClientScope(Response.json({
    ok: true,
    client_id: "recCanonical123",
    identity: { status: "ambiguous" },
  }), "recCanonical123");
  assert.equal(ambiguousScope.status, 409);

  const invalidScope = await enforceExactCanonicalClientScope(Response.json({ ok: true }), "not-a-client");
  assert.equal(invalidScope.status, 400);
  const missingScope = await enforceExactCanonicalClientScope(Response.json({ ok: true }), "");
  assert.equal(missingScope.status, 400);
  const repeatedScope = await enforceExactCanonicalClientScope(
    Response.json({ ok: true, client_id: "recCanonical123", identity: { status: "canonical" } }),
    resolveRequestedClientId(new URLSearchParams("client_id=recCanonical123&client_id=recDifferent456")) || "",
  );
  assert.equal(repeatedScope.status, 400);
  const unavailableScope = await enforceExactCanonicalClientScope(new Response('{"ok":false,"error":"source_unavailable"}', {
    status: 503,
    headers: { "content-type": "application/json" },
  }), "recCanonical123");
  assert.equal(unavailableScope.status, 503);

  const queue = await redactCustomerQueueResponse(Response.json({
    ok: true,
    records: [{ record_id: "rec1", display_name: "Test", summary: "raw private note", raw_note: "secret", raw_line_notes: "secret2" }],
  }));
  const data = await queue.json();
  assert.equal(queue.headers.get("x-mmd-customer-queue-redaction"), "raw-summary-removed-v1");
  assert.equal(data.records[0].display_name, "Test");
  assert.equal("summary" in data.records[0], false);
  assert.equal("raw_note" in data.records[0], false);
  assert.equal("raw_line_notes" in data.records[0], false);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
