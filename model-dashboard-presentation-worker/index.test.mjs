import test from "node:test";
import assert from "node:assert/strict";
import {
  isPresentationUiPath,
  isPresentationAssetPath,
  isPresentationRootRuntimePath,
  isWishStatusAssetPath,
  presentationUrlForPage,
  presentationUrlForAsset,
  rewritePresentationHtml,
  rewritePresentationText,
  hasModelSessionCookie,
  hasLineRedirectContext,
  modelMiniAppHandoffUrl,
  shouldHandoffToMiniApp,
  resolveLiffEnvironmentFromRequest,
  hasLiffPrimaryBootstrapCookie,
  shouldServeLiffPrimaryBootstrap,
  liffPrimaryBootstrapHtml,
} from "./src/index.js";

test("matches only Model Dashboard presentation namespace plus explicit runtime aliases", () => {
  assert.equal(isPresentationUiPath("/sigil/model/dashboard"), true);
  assert.equal(isPresentationUiPath("/sigil/model/dashboard/photos"), true);
  assert.equal(isPresentationUiPath("/sigil/model/console"), false);
  assert.equal(isPresentationAssetPath("/sigil/model/dashboard-assets/_build/app.js"), true);
  assert.equal(isPresentationRootRuntimePath("/_build/app.js"), true);
  assert.equal(isPresentationRootRuntimePath("/_serverFn/abc"), true);
  assert.equal(isPresentationRootRuntimePath("/assets/routes-123.js"), true);
  assert.equal(isPresentationRootRuntimePath("/v1/model/profile"), false);
  assert.equal(isPresentationRootRuntimePath("/favicon.ico"), false);
  assert.equal(isWishStatusAssetPath("/sigil/model/dashboard-assets/wish-status-v1.js"), true);
  assert.equal(isWishStatusAssetPath("/sigil/model/dashboard-assets/wish-status-v1.css"), true);
  assert.equal(isWishStatusAssetPath("/sigil/model/dashboard-assets/_build/app.js"), false);
});

test("anonymous dashboard entry hands off to the canonical LINE Mini App before LIFF init", async () => {
  const request = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?lang=th&flow=verify&activation=signed.token&unknown=drop-me",
  );
  assert.equal(hasModelSessionCookie(request), false);
  assert.equal(hasLineRedirectContext(request), false);
  assert.equal(
    modelMiniAppHandoffUrl(request),
    "https://miniapp.line.me/2010864854-N34SgCqq/?lang=th&flow=verify&activation=signed.token",
  );
  assert.equal(shouldHandoffToMiniApp(request), true);

  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(request);
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://miniapp.line.me/2010864854-N34SgCqq/?lang=th&flow=verify&activation=signed.token",
  );
  assert.equal(response.headers.get("x-mmd-model-entry"), "line-miniapp-handoff-v1");
});

test("LINE primary redirect is consumed before the SPA renders", async () => {
  const request = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?liff.state=%3Fflow%3Dverify%26lang%3Dth&access_token=opaque",
  );
  assert.equal(hasLineRedirectContext(request), true);
  assert.equal(hasLiffPrimaryBootstrapCookie(request), false);
  assert.equal(resolveLiffEnvironmentFromRequest(request), "published");
  assert.equal(shouldServeLiffPrimaryBootstrap(request), true);

  const html = liffPrimaryBootstrapHtml(request);
  assert.match(html, /https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
  assert.match(html, /2010864854-N34SgCqq/);
  assert.doesNotMatch(html, /liff\.login/);
  assert.doesNotMatch(html, /redirectUri/);
  assert.doesNotMatch(html, /location\.(?:reload|replace)\s*\(/);
  assert.doesNotMatch(html, /tanstack|react/i);

  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-entry"), "liff-primary-preboot-v1");
  assert.match(response.headers.get("set-cookie") || "", /mmd_liff_boot=1/);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
});

test("primary bootstrap honors safe review/developing liff_env including nested liff.state", () => {
  const review = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?liff.state=%3Fliff_env%3Dreview%26lang%3Den",
  );
  assert.equal(resolveLiffEnvironmentFromRequest(review), "review");
  assert.match(liffPrimaryBootstrapHtml(review), /2010864853-7SqCQVxy/);

  const developing = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?liff_env=developing&access_token=opaque",
  );
  assert.equal(resolveLiffEnvironmentFromRequest(developing), "developing");
  assert.match(liffPrimaryBootstrapHtml(developing), /2010864852-MuzunIKU/);
});

test("primary bootstrap is bypassed after the short-lived bootstrap cookie", () => {
  const request = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?liff.state=%3Fflow%3Dverify&access_token=opaque",
    { headers: { cookie: "mmd_liff_boot=1" } },
  );
  assert.equal(hasLiffPrimaryBootstrapCookie(request), true);
  assert.equal(shouldServeLiffPrimaryBootstrap(request), false);
});

test("post-primary bootstrap cookie prevents a Mini App redirect loop", () => {
  const request = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?lang=th",
    { headers: { cookie: "mmd_liff_boot=1" } },
  );
  assert.equal(shouldServeLiffPrimaryBootstrap(request), false);
  assert.equal(shouldHandoffToMiniApp(request), false);
});

test("primary bootstrap never intercepts assets, APIs, or non-navigation methods", () => {
  const asset = new Request(
    "https://mmdbkk.com/sigil/model/dashboard-assets/_build/app.js?access_token=opaque",
  );
  const api = new Request("https://mmdbkk.com/v1/model/profile?access_token=opaque");
  const post = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?access_token=opaque",
    { method: "POST" },
  );
  assert.equal(shouldServeLiffPrimaryBootstrap(asset), false);
  assert.equal(shouldServeLiffPrimaryBootstrap(api), false);
  assert.equal(shouldServeLiffPrimaryBootstrap(post), false);
});

test("dashboard stays on presentation when a Model session or real LINE redirect context is present", () => {
  const sessionRequest = new Request("https://mmdbkk.com/sigil/model/dashboard", {
    headers: { cookie: "mmd_model_session_v1=opaque-session" },
  });
  assert.equal(hasModelSessionCookie(sessionRequest), true);
  assert.equal(shouldHandoffToMiniApp(sessionRequest), false);

  const liffState = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?liff.state=%3Fflow%3Dverify&access_token=opaque",
  );
  assert.equal(hasLineRedirectContext(liffState), true);
  assert.equal(shouldHandoffToMiniApp(liffState), false);

  const oauth = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?code=callback-code&state=callback-state",
  );
  assert.equal(hasLineRedirectContext(oauth), true);
  assert.equal(shouldHandoffToMiniApp(oauth), false);
});

test("maps canonical dashboard route to current Model Hub root and preserves LINE callback query", () => {
  const request = new Request("https://mmdbkk.com/sigil/model/dashboard?code=abc&state=xyz&liff_env=review");
  const upstream = presentationUrlForPage(request);
  assert.equal(upstream.origin, "https://mmdmodel.lovable.app");
  assert.equal(upstream.pathname, "/");
  assert.equal(upstream.searchParams.get("code"), "abc");
  assert.equal(upstream.searchParams.get("state"), "xyz");
  assert.equal(upstream.searchParams.get("liff_env"), "review");
});

test("maps nested dashboard pages and runtime assets to current Model Hub", () => {
  assert.equal(
    presentationUrlForPage(new Request("https://www.mmdbkk.com/sigil/model/dashboard/photos?liff_env=developing")).toString(),
    "https://mmdmodel.lovable.app/photos?liff_env=developing",
  );
  assert.equal(
    presentationUrlForAsset(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/_build/app.js?v=1")).toString(),
    "https://mmdmodel.lovable.app/_build/app.js?v=1",
  );
  assert.equal(
    presentationUrlForAsset(new Request("https://mmdbkk.com/assets/routes-123.js?v=2")).toString(),
    "https://mmdmodel.lovable.app/assets/routes-123.js?v=2",
  );
  assert.equal(
    presentationUrlForAsset(new Request("https://www.mmdbkk.com/_build/app.js?v=3")).toString(),
    "https://mmdmodel.lovable.app/_build/app.js?v=3",
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
  assert.match(out, /wish-status-v1\.css/);
  assert.match(out, /wish-status-v1\.js/);
  assert.match(out, /data-mmd-wish-status-assets="v1"/);
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


test("serves the Model Wish pending status add-on locally instead of proxying it to Lovable", async () => {
  const worker = (await import("./src/index.js")).default;
  const js = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/wish-status-v1.js"));
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  const source = await js.text();
  assert.match(source, /year6_direct_wish/);
  assert.match(source, /manual_review/);
  assert.match(source, /รอยืนยัน/);

  const css = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/wish-status-v1.css"));
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  assert.match(await css.text(), /#f1c75b/);
});
