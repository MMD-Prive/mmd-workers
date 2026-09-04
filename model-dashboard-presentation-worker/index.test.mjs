import test from "node:test";
import assert from "node:assert/strict";
import {
  isPresentationUiPath,
  isPresentationAssetPath,
  presentationUrlForPage,
  presentationUrlForAsset,
  rewritePresentationHtml,
  rewritePresentationText,
} from "./src/index.js";

test("matches only Model Dashboard presentation namespace", () => {
  assert.equal(isPresentationUiPath("/sigil/model/dashboard"), true);
  assert.equal(isPresentationUiPath("/sigil/model/dashboard/photos"), true);
  assert.equal(isPresentationUiPath("/sigil/model/console"), false);
  assert.equal(isPresentationAssetPath("/sigil/model/dashboard-assets/_build/app.js"), true);
  assert.equal(isPresentationAssetPath("/v1/model/profile"), false);
});

test("maps canonical dashboard route to Lovable root and preserves LINE callback query", () => {
  const request = new Request("https://mmdbkk.com/sigil/model/dashboard?code=abc&state=xyz&liff_env=review");
  const upstream = presentationUrlForPage(request);
  assert.equal(upstream.origin, "https://mmd-model-dashboard.lovable.app");
  assert.equal(upstream.pathname, "/");
  assert.equal(upstream.searchParams.get("code"), "abc");
  assert.equal(upstream.searchParams.get("state"), "xyz");
  assert.equal(upstream.searchParams.get("liff_env"), "review");
});

test("maps nested dashboard pages and runtime assets to Lovable", () => {
  assert.equal(
    presentationUrlForPage(new Request("https://www.mmdbkk.com/sigil/model/dashboard/photos?liff_env=developing")).toString(),
    "https://mmd-model-dashboard.lovable.app/photos?liff_env=developing",
  );
  assert.equal(
    presentationUrlForAsset(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/_build/app.js?v=1")).toString(),
    "https://mmd-model-dashboard.lovable.app/_build/app.js?v=1",
  );
});

test("rewrites Lovable runtime paths and bounded app links to canonical same-origin paths", () => {
  const html = `<!doctype html><html data-mmd-ui-source="lovable-model-dashboard"><head>
    <link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/_build/styles.css">
    <script type="module" src="/_build/app.js"></script></head><body>
    <a href="/">Home</a><a href="/profile">Profile</a><a href="/photos/">Photos</a>
    <script>fetch('/v1/model/profile')</script>
    <aside id="lovable-badge">badge</aside><script src="/~flock.js"></script>
  </body></html>`;
  const out = rewritePresentationHtml(html);
  assert.match(out, /data-mmd-ui-source="lovable-model-dashboard"/);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/_build\/app\.js/);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/favicon\.ico/);
  assert.match(out, /href="\/sigil\/model\/dashboard"/);
  assert.match(out, /href="\/sigil\/model\/dashboard\/profile"/);
  assert.match(out, /href="\/sigil\/model\/dashboard\/photos"/);
  assert.match(out, /fetch\('\/v1\/model\/profile'\)/);
  assert.doesNotMatch(out, /lovable-badge/);
  assert.doesNotMatch(out, /~flock\.js/);
});

test("rewrites runtime paths without touching model API authority", () => {
  const js = `import('/_build/chunk.js');fetch('/_serverFn/abc');fetch('/v1/model/media');const a='/assets/x.png';`;
  const out = rewritePresentationText(js);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/_build\/chunk\.js/);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/_serverFn\/abc/);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/assets\/x\.png/);
  assert.match(out, /fetch\('\/v1\/model\/media'\)/);
});
