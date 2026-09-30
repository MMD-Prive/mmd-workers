import test from "node:test";
import assert from "node:assert/strict";
import {
  isPresentationUiPath,
  isModelWishPath,
  isPresentationAssetPath,
  isPresentationRootRuntimePath,
  isWishStatusAssetPath,
  isTelegramConnectAssetPath,
  isModelHistoryAssetPath,
  isModelMediaUploadAssetPath,
  isModelPwaManifestPath,
  modelPwaManifest,
  presentationUrlForPage,
  modelWishPresentationUrl,
  presentationUrlForAsset,
  rewritePresentationHtml,
  rewritePresentationText,
  hasModelSessionCookie,
  hasLineRedirectContext,
  modelMiniAppHandoffUrl,
  resolveJobBoardContextFromRequest,
  authenticatedJobBoardResumeHtml,
  shouldHandoffToMiniApp,
  resolveLiffEnvironmentFromRequest,
  hasLiffPrimaryBootstrapCookie,
  shouldServeLiffPrimaryBootstrap,
  liffPrimaryBootstrapHtml,
  isPwaLaunchRequest,
  shouldServePwaLiffBootstrap,
  liffPwaBootstrapHtml,
} from "./src/index.js";

test("matches only Model Dashboard presentation namespace plus explicit runtime aliases", () => {
  assert.equal(isPresentationUiPath("/sigil/model/dashboard"), true);
  assert.equal(isPresentationUiPath("/sigil/model/dashboard/photos"), true);
  assert.equal(isPresentationUiPath("/sigil/model/console"), false);
  assert.equal(isModelWishPath("/sigil/model/wish"), true);
  assert.equal(isModelWishPath("/sigil/model/wish/"), true);
  assert.equal(isModelWishPath("/sigil/model/wish-extra"), false);
  assert.equal(isPresentationAssetPath("/sigil/model/dashboard-assets/_build/app.js"), true);
  assert.equal(isPresentationRootRuntimePath("/_build/app.js"), true);
  assert.equal(isPresentationRootRuntimePath("/_serverFn/abc"), true);
  assert.equal(isPresentationRootRuntimePath("/assets/routes-123.js"), true);
  assert.equal(isPresentationRootRuntimePath("/v1/model/profile"), false);
  assert.equal(isPresentationRootRuntimePath("/favicon.ico"), false);
  assert.equal(isWishStatusAssetPath("/sigil/model/dashboard-assets/wish-status-v1.js"), true);
  assert.equal(isWishStatusAssetPath("/sigil/model/dashboard-assets/wish-status-v1.css"), true);
  assert.equal(isWishStatusAssetPath("/sigil/model/dashboard-assets/_build/app.js"), false);
  assert.equal(isTelegramConnectAssetPath("/sigil/model/dashboard-assets/telegram-connect-v1.js"), true);
  assert.equal(isTelegramConnectAssetPath("/sigil/model/dashboard-assets/telegram-connect-v1.css"), true);
  assert.equal(isTelegramConnectAssetPath("/sigil/model/dashboard-assets/_build/app.js"), false);
  assert.equal(isModelHistoryAssetPath("/sigil/model/dashboard-assets/model-history-v1.js"), true);
  assert.equal(isModelHistoryAssetPath("/sigil/model/dashboard-assets/model-history-v1.css"), true);
  assert.equal(isModelMediaUploadAssetPath("/sigil/model/dashboard-assets/model-media-upload-v1.js"), true);
  assert.equal(isModelMediaUploadAssetPath("/sigil/model/dashboard-assets/model-media-upload-v1.css"), true);
  assert.equal(isModelPwaManifestPath("/sigil/model/dashboard/manifest.webmanifest"), true);
  assert.equal(isModelPwaManifestPath("/sigil/model/dashboard/profile"), false);
});

test("keeps Model Wish on apex while fetching only presentation HTML from Webflow", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    return new Response(
      '<!doctype html><html><head></head><body><main id="mmd-wish">MMD APP</main></body></html>',
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "set-cookie": "_cfuvid=upstream-only; Domain=webflow.io; Secure",
        },
      },
    );
  };

  try {
    const request = new Request(
      "https://mmdbkk.com/sigil/model/wish?line_return=1&lang=th",
      {
        headers: {
          cookie: "mmd_model_session_v1=opaque-session",
          authorization: "Bearer must-not-leak",
          accept: "text/html",
        },
      },
    );
    assert.equal(
      modelWishPresentationUrl(request).toString(),
      "https://mmdprive.webflow.io/sigil/model/wish?line_return=1&lang=th",
    );

    const worker = (await import("./src/index.js")).default;
    const response = await worker.fetch(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-mmd-route-owner"), "model-dashboard-presentation-worker");
    assert.equal(response.headers.get("x-mmd-ui-source"), "webflow-apex-proxy");
    assert.equal(response.headers.get("x-mmd-page"), "model-wish");
    assert.match(await response.text(), /id="mmd-wish"/);

    assert.equal(upstreamRequests.length, 1);
    assert.equal(
      upstreamRequests[0].url,
      "https://mmdprive.webflow.io/sigil/model/wish?line_return=1&lang=th",
    );
    assert.equal(upstreamRequests[0].headers.get("cookie"), null);
    assert.equal(upstreamRequests[0].headers.get("authorization"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Model Wish front gate allows only GET and HEAD", async () => {
  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(new Request(
    "https://mmdbkk.com/sigil/model/wish",
    { method: "POST" },
  ));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(response.headers.get("x-mmd-page"), "model-wish");
});

test("exposes an installable MMD APP standalone PWA manifest", async () => {
  assert.deepEqual(modelPwaManifest(), {
    id: "/sigil/model/dashboard",
    name: "MMD APP",
    short_name: "MMD APP",
    description: "MMD Privé onboarding, dashboard, Wish and model-side services",
    lang: "th",
    start_url: "/sigil/model/dashboard?launch=pwa",
    scope: "/sigil/model/dashboard",
    display: "standalone",
    background_color: "#090909",
    theme_color: "#090909",
    icons: [
      {
        src: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa586601bf3d46fb15c5699_05-tiny-mark-512px.webp",
        sizes: "512x512",
        type: "image/webp",
        purpose: "any",
      },
    ],
  });

  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(
    new Request("https://mmdbkk.com/sigil/model/dashboard/manifest.webmanifest"),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/manifest\+json/);
  assert.equal(response.headers.get("x-mmd-dashboard-addon"), "pwa-manifest-v1");
  assert.deepEqual(await response.json(), modelPwaManifest());

  const blocked = await worker.fetch(
    new Request("https://mmdbkk.com/sigil/model/dashboard/manifest.webmanifest", { method: "POST" }),
  );
  assert.equal(blocked.status, 405);
});

test("bare MMD APP entry keeps the exact published Mini App base URL", () => {
  const request = new Request("https://mmdbkk.com/sigil/model/dashboard");
  assert.equal(
    modelMiniAppHandoffUrl(request),
    "https://miniapp.line.me/2010864854-N34SgCqq",
  );
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

test("Job Board Mini App callback exchanges LINE session then opens the exact job instead of a blank dashboard", () => {
  const jobId = "JOB-20260928-3DE86201F471";
  const next = `https://sigil.mmdbkk.com/public/api/jobs/${jobId}`;
  const entry = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?intent=job_board&source=line_model_group&return_to=public_job_board&next=${encodeURIComponent(next)}&job_id=${jobId}`,
  );
  const handoff = new URL(modelMiniAppHandoffUrl(entry));
  assert.equal(handoff.origin, "https://miniapp.line.me");
  assert.equal(handoff.pathname, "/2010864854-N34SgCqq/");
  assert.equal(handoff.searchParams.get("intent"), "job_board");
  assert.equal(handoff.searchParams.get("job_id"), jobId);
  assert.equal(handoff.searchParams.get("next"), next);

  const nested = new URLSearchParams({
    intent: "job_board",
    source: "line_model_group",
    return_to: "public_job_board",
    next,
    job_id: jobId,
  });
  const callback = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?liff.state=${encodeURIComponent("?" + nested.toString())}&access_token=opaque`,
  );
  const context = resolveJobBoardContextFromRequest(callback);
  assert.equal(context?.job_id, jobId);
  assert.equal(context?.next, next);

  const html = liffPrimaryBootstrapHtml(callback);
  assert.match(html, /ที่นี่พี่เปอร์ดูแลงานให้ครับ/);
  assert.match(html, /ส่งรูปและข้อมูลเพิ่มเติมให้พี่เปอร์ดูหน่อยน้า/);
  assert.match(html, /t\.me\/per_mmd/);
  assert.match(html, /\/apply\/public-model/);
  assert.doesNotMatch(html, /ลูกค้าเลือกคุณสำหรับงานนี้|ยืนยันตัวตน|กำลังตรวจสอบตัวตน/);
  assert.match(html, /\/v1\/model\/liff\/exchange/);
  assert.match(html, /\/v1\/model\/job-board\/handoff/);
  assert.match(html, /id_token_missing/);
  assert.match(html, /JOB-20260928-3DE86201F471/);
  assert.match(html, /https:\/\/sigil\.mmdbkk\.com\/public\/api\/jobs/);
  assert.match(html, /window\.location\.replace\(destination\.toString\(\)\)/);
});

test("existing Model session resumes Job Board handoff instead of falling through to the dashboard", async () => {
  const jobId = "JOB-20260928-3DE86201F471";
  const next = `https://sigil.mmdbkk.com/public/api/jobs/${jobId}`;
  const request = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?intent=job_board&source=x_campaign&return_to=public_job_board&next=${encodeURIComponent(next)}&job_id=${jobId}`,
    { headers: { cookie: "mmd_model_session_v1=existing-model-session" } },
  );

  const html = authenticatedJobBoardResumeHtml(request);
  assert.match(html, /data-mmd-authenticated-job-board-resume="v1"/);
  assert.match(html, /\/v1\/model\/job-board\/handoff\?/);
  assert.match(html, /JOB-20260928-3DE86201F471/);
  assert.match(html, /credentials:"include"/);
  assert.match(html, /window\.location\.replace\(destination\.toString\(\)\)/);
  assert.match(html, /https:\/\/miniapp\.line\.me\/2010864854-N34SgCqq/);

  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-entry"), "authenticated-job-board-resume-v1");
  assert.match(await response.text(), /กำลังเปิดงานนี้/);
});

test("existing Model session Job Board resume keeps hostile next targets on canonical SIGIL jobs only", () => {
  const request = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?intent=job_board&job_id=JOB-20260928-3DE86201F471&next=https%3A%2F%2Fevil.example%2Fpwn",
    { headers: { cookie: "mmd_model_session_v1=existing-model-session" } },
  );
  const html = authenticatedJobBoardResumeHtml(request);
  assert.doesNotMatch(html, /evil\.example/);
  assert.match(html, /next=https%3A%2F%2Fsigil\.mmdbkk\.com%2Fpublic%2Fapi%2Fjobs%2FJOB-20260928-3DE86201F471/);
});

test("Job Board callback rejects a hostile next target and falls back to the canonical job URL", () => {
  const callback = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?intent=job_board&job_id=JOB-20260928-3DE86201F471&next=https%3A%2F%2Fevil.example%2Fpwn",
  );
  const context = resolveJobBoardContextFromRequest(callback);
  assert.equal(context?.next, "https://sigil.mmdbkk.com/public/api/jobs/JOB-20260928-3DE86201F471");
});

test("approved Model job link enters the published Mini App before opening signed confirmation", () => {
  const target = "/sigil/confirm/job-model?t=abc.DEF_123";
  const request = new Request(`https://mmdbkk.com/sigil/model/dashboard?return_to=${encodeURIComponent(target)}`);
  const handoff = new URL(modelMiniAppHandoffUrl(request));
  assert.equal(handoff.origin, "https://miniapp.line.me");
  assert.equal(handoff.pathname, "/2010864854-N34SgCqq/");
  assert.equal(handoff.searchParams.get("return_to"), target);

  const lineRedirect = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?liff.state=${encodeURIComponent("?return_to=" + encodeURIComponent(target))}&access_token=opaque`,
  );
  const html = liffPrimaryBootstrapHtml(lineRedirect);
  assert.ok(html.includes('window.location.replace("/sigil/confirm/job-model?t=abc.DEF_123")'));

  const hostile = new Request("https://mmdbkk.com/sigil/model/dashboard?return_to=%2Finternal%2Fadmin%3Ft%3Dabc");
  assert.equal(new URL(modelMiniAppHandoffUrl(hostile)).searchParams.has("return_to"), false);
});

test("Telegram selected-job entry pauses on MMD and opens LINE with only the short Session id", async () => {
  const worker = (await import("./src/index.js")).default;
  const payload = Buffer.from(JSON.stringify({
    kind:"model_confirm",
    role:"model",
    session_id:"sess_mu8oo9ao_a97c529604a34602",
    payment_ref:"pay_fixture",
    exp:2_000_000_000,
  })).toString("base64url");
  const token = payload + ".fake-signature";
  const target = "/sigil/confirm/job-model?t=" + token;
  const entry = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?handoff=job-confirmed&return_to=${encodeURIComponent(target)}`,
    { headers:{ "user-agent":"TelegramBot (like TwitterBot) Telegram iOS" } },
  );

  const response = await worker.fetch(entry);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-entry"), "external-selected-job-handoff-v1");
  const html = await response.text();
  assert.match(html, /เปิดงานนี้ใน LINE/);
  assert.match(html, /ไม่ต้องสมัครใหม่/);
  assert.match(html, /session_id=sess_mu8oo9ao_a97c529604a34602/);
  assert.doesNotMatch(html, /fake-signature/);
  assert.doesNotMatch(html, /return_to=/);
});

test("LINE selected-job entry skips the external handoff page and carries only Session id", async () => {
  const worker = (await import("./src/index.js")).default;
  const payload = Buffer.from(JSON.stringify({
    kind:"model_confirm",
    role:"model",
    session_id:"sess_mu8oo9ao_a97c529604a34602",
    payment_ref:"pay_fixture",
    exp:2_000_000_000,
  })).toString("base64url");
  const token = payload + ".fake-signature";
  const target = "/sigil/confirm/job-model?t=" + token;
  const entry = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?handoff=job-confirmed&return_to=${encodeURIComponent(target)}`,
    { headers:{ "user-agent":"LINE/15.0.0 LIFF" } },
  );

  const response = await worker.fetch(entry);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://miniapp.line.me");
  assert.equal(location.searchParams.get("handoff"), "job-confirmed");
  assert.equal(location.searchParams.get("session_id"), "sess_mu8oo9ao_a97c529604a34602");
  assert.equal(location.searchParams.has("return_to"), false);
  assert.equal(location.toString().includes("fake-signature"), false);
});

test("selected Session survives LINE OAuth and resolves through the Model-only backend handoff", async () => {
  const worker = (await import("./src/index.js")).default;
  const state = "?handoff=job-confirmed&session_id=sess_mu8oo9ao_a97c529604a34602";
  const first = await worker.fetch(new Request(
    `https://mmdbkk.com/sigil/model/dashboard?liff.state=${encodeURIComponent(state)}&access_token=opaque`,
  ));
  assert.equal(first.status, 200);
  const cookies = first.headers.get("set-cookie") || "";
  assert.match(cookies, /mmd_model_selected_job_session=/);

  const html = await first.text();
  assert.match(html, /ลูกค้าเลือกคุณสำหรับงานนี้/);
  assert.doesNotMatch(html, /\/v1\/model\/liff\/exchange/);
  assert.match(html, /\/v1\/model\/selected-job\/handoff/);
  assert.match(html, /idToken:idToken,environment:"published"/);
  assert.match(html, /sess_mu8oo9ao_a97c529604a34602/);
  assert.doesNotMatch(html, /MODEL ONBOARDING/);

  const second = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard", {
    headers:{
      cookie:"mmd_liff_boot=1; mmd_model_selected_job_session=sess_mu8oo9ao_a97c529604a34602",
    },
  }));
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("x-mmd-model-entry"), "liff-primary-preboot-v1");
  const resumed = await second.text();
  assert.match(resumed, /\/v1\/model\/selected-job\/handoff/);
  assert.doesNotMatch(resumed, /MODEL ONBOARDING/);
});

test("selected-job browser entry keeps the signed token off access.line.me", async () => {
  const worker = (await import("./src/index.js")).default;
  const target = "/sigil/confirm/job-model?t=abc.DEF_123";
  const entry = new Request(
    `https://mmdbkk.com/sigil/model/dashboard?handoff=job-confirmed&return_to=${encodeURIComponent(target)}`,
  );
  const response = await worker.fetch(entry);
  assert.equal(response.status, 302);

  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://miniapp.line.me");
  assert.equal(location.pathname, "/2010864854-N34SgCqq/");
  assert.equal(location.searchParams.get("handoff"), "job-confirmed");
  assert.equal(location.searchParams.has("return_to"), false);
  assert.equal(location.toString().includes("abc.DEF_123"), false);
  assert.ok(location.toString().length < 180);

  const cookies = response.headers.get("set-cookie") || "";
  assert.match(cookies, /mmd_model_selected_job=/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /Secure/);
  assert.match(cookies, /Path=\/sigil\/model\/dashboard/);
  assert.match(cookies, /Max-Age=180/);
});

test("first LIFF callback can recover selected job from the secure handoff cookie", async () => {
  const worker = (await import("./src/index.js")).default;
  const target = "/sigil/confirm/job-model?t=abc.DEF_123";
  const callback = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?liffClientId=2010864854-N34SgCqq",
    {
      headers: {
        cookie: `mmd_model_selected_job=${encodeURIComponent(target)}`,
      },
    },
  );
  const response = await worker.fetch(callback);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-entry"), "liff-primary-preboot-v1");

  const html = await response.text();
  assert.match(html, /ลูกค้าเลือกคุณสำหรับงานนี้/);
  assert.match(html, /ไม่ใช่หน้าสมัครงาน/);
  assert.match(html, /window\.location\.replace\("\/sigil\/confirm\/job-model\?t=abc\.DEF_123"\)/);
  assert.doesNotMatch(html, /MODEL ONBOARDING/);
  assert.doesNotMatch(html, /return_to=%2Fsigil%2Fconfirm%2Fjob-model/);
});

test("selected-job intent survives a LIFF OAuth reload that strips the query string", async () => {
  const worker = (await import("./src/index.js")).default;
  const target = "/sigil/confirm/job-model?t=abc.DEF_123";
  const state = "?return_to=" + encodeURIComponent(target);
  const first = await worker.fetch(new Request(
    `https://mmdbkk.com/sigil/model/dashboard?liff.state=${encodeURIComponent(state)}&access_token=opaque`,
  ));

  assert.equal(first.status, 200);
  const cookies = first.headers.get("set-cookie") || "";
  assert.match(cookies, /mmd_liff_boot=1/);
  assert.match(cookies, /mmd_model_selected_job=/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /Path=\/sigil\/model\/dashboard/);

  const second = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard", {
    headers: {
      cookie: `mmd_liff_boot=1; mmd_model_selected_job=${encodeURIComponent(target)}`,
    },
  }));
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("x-mmd-model-entry"), "liff-primary-preboot-v1");
  const html = await second.text();
  assert.match(html, /ลูกค้าเลือกคุณสำหรับงานนี้/);
  assert.match(html, /ไม่ใช่หน้าสมัครงาน/);
  assert.match(html, /window\.location\.replace\("\/sigil\/confirm\/job-model\?t=abc\.DEF_123"\)/);
  assert.doesNotMatch(html, /MODEL ONBOARDING/);
  assert.doesNotMatch(html, /เปิดจาก LINE Mini App เพื่อเริ่มสมัครโมเดล/);
});

test("invalid remembered selected-job cookie cannot suppress normal onboarding", async () => {
  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard", {
    headers: {
      cookie: `mmd_liff_boot=1; mmd_model_selected_job=${encodeURIComponent("/internal/admin?t=bad")}`,
    },
  }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /MODEL ONBOARDING/);
  assert.match(html, /เปิดจาก LINE Mini App เพื่อเริ่มสมัครโมเดล/);
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
  assert.match(html, /data-mmd-app-digital="v1"/);
  assert.match(html, /DIGITAL MODEL WORKSPACE/);
  assert.match(html, /--mmd-bg:#080907/);
  assert.match(html, /<span class="mmd-digital-pill" id="session-pill">MMD APP<\/span>/);
  assert.match(html, /กำลังเปิดพื้นที่ทำงาน/);
  assert.doesNotMatch(html, /LINE · CHECKING|กำลังตรวจสอบตัวตน|ยืนยันตัวตน/);

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

test("installed PWA uses external-browser LIFF bootstrap instead of sending its own window to a raw URL", async () => {
  const request = new Request("https://mmdbkk.com/sigil/model/dashboard?launch=pwa&lang=th");
  assert.equal(isPwaLaunchRequest(request), true);
  assert.equal(shouldServePwaLiffBootstrap(request), true);
  assert.equal(shouldHandoffToMiniApp(request), false);

  const html = liffPwaBootstrapHtml(request);
  assert.match(html, /withLoginOnExternalBrowser:true/);
  assert.match(html, /2010864854-N34SgCqq/);
  assert.doesNotMatch(html, /liff\.login/);
  assert.doesNotMatch(html, /redirectUri/);
  assert.doesNotMatch(html, /location\.(?:reload|replace)\s*\(/);

  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-entry"), "pwa-liff-bootstrap-v1");
  assert.match(response.headers.get("content-type") || "", /text\/html/);
});

test("PWA launch becomes the normal dashboard only after the LINE primary bootstrap", () => {
  const request = new Request(
    "https://mmdbkk.com/sigil/model/dashboard?launch=pwa",
    { headers: { cookie: "mmd_liff_boot=1" } },
  );
  assert.equal(shouldServePwaLiffBootstrap(request), false);
  assert.equal(shouldHandoffToMiniApp(request), false);
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

test("authenticated dashboard is worker-rendered digital LIFF and does not fetch Lovable", async () => {
  const worker = (await import("./src/index.js")).default;
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("unexpected_upstream_fetch");
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard", {
      headers: { cookie: "mmd_model_session_v1=opaque-session" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-ui-source"), "worker-rendered-liff-digital");
    assert.equal(response.headers.get("x-mmd-ui-app"), "mmd-app-digital-v3");
    const html = await response.text();
    assert.match(html, /data-mmd-app-digital="v3"/);
    assert.match(html, /data-design-source="lovable-vnext"/);
    assert.match(html, /--mmd-content-max:520px/);
    assert.match(html, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    assert.match(html, /HOME/);
    assert.match(html, /JOBS/);
    assert.match(html, /CONSOLE/);
    assert.match(html, /YOU/);
    assert.match(html, /TART · MODEL GUIDE/);
    assert.match(html, /\/v1\/model\/history/);
    assert.match(html, /ค่าตัวที่ยืนยันในระบบ/);
    assert.match(html, /จ่ายแล้วที่ MMD รับรอง/);
    assert.doesNotMatch(html, /mmdmodel\.lovable\.app/);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native digital dashboard keeps non-GET methods blocked", async () => {
  const worker = (await import("./src/index.js")).default;
  const response = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard", {
    method: "POST",
    headers: { cookie: "mmd_model_session_v1=opaque-session" },
  }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
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
  assert.match(out, /rel="manifest" href="\/sigil\/model\/dashboard\/manifest\.webmanifest"/);
  assert.match(out, /apple-mobile-web-app-capable/);
  assert.match(out, /apple-mobile-web-app-title" content="MMD APP"/);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/_build\/app\.js/);
  assert.match(out, /\/sigil\/model\/dashboard-assets\/favicon\.ico/);
  assert.match(out, /href="\/sigil\/model\/dashboard"/);
  assert.match(out, /href="\/sigil\/model\/dashboard\/profile"/);
  assert.match(out, /href="\/sigil\/model\/dashboard\/photos"/);
  assert.match(out, /fetch\('\/v1\/model\/profile'\)/);
  assert.match(out, /wish-status-v1\.css/);
  assert.match(out, /wish-status-v1\.js/);
  assert.match(out, /data-mmd-wish-status-assets="v1"/);
  assert.match(out, /telegram-connect-v1\.css/);
  assert.match(out, /telegram-connect-v1\.js/);
  assert.match(out, /data-mmd-telegram-connect-assets="v1"/);
  assert.match(out, /model-history-v1\.css/);
  assert.match(out, /model-history-v1\.js/);
  assert.match(out, /data-mmd-model-history-assets="v1"/);
  assert.match(out, /data-mmd-model-media-upload-assets="v1"/);
  assert.doesNotMatch(out, /lovable-badge/);
  assert.doesNotMatch(out, /~flock\.js/);
});

test("serves mobile model media upload assets with review-first limits and retry", async () => {
  const worker = (await import("./src/index.js")).default;
  const js = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/model-media-upload-v1.js"));
  assert.equal(js.status, 200);
  assert.equal(js.headers.get("x-mmd-dashboard-addon"), "model-media-upload-v1");
  const source = await js.text();
  assert.match(source, /MAX_PHOTOS=8,MAX_CLIPS=1/);
  assert.match(source, /Private: รูปสูงสุด 2 รูป · คลิปสูงสุด 1 คลิป/);
  assert.match(source, /private-upload-plan/);
  assert.match(source, /mmd-private-media-v1-20260927/);
  assert.match(source, /25\*1024\*1024/);
  assert.match(source, /\/v1\/model\/media\/upload-url/);
  assert.match(source, /pending_review/);
  assert.match(source, /ลองอีกครั้ง/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /readBack/);
  const css = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/model-media-upload-v1.css"));
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
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


test("serves the Model Telegram readiness add-on locally and keeps LINE as authority", async () => {
  const worker = (await import("./src/index.js")).default;
  const js = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/telegram-connect-v1.js"));
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  const source = await js.text();
  assert.match(source, /\/v1\/model\/profile/);
  assert.match(source, /\/v1\/model\/telegram\/bind/);
  assert.match(source, /telegram_connected/);
  assert.match(source, /LINE ยังเป็นบัญชีหลัก/);
  assert.doesNotMatch(source, /telegram_user_id\s*=/);

  const css = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/telegram-connect-v1.css"));
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  assert.match(await css.text(), /#mmd-model-telegram-connect-v1/);
});

test("serves the MMD APP history add-on with no customer-facing or raw-chat content", async () => {
  const worker = (await import("./src/index.js")).default;
  const js = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/model-history-v1.js"));
  assert.equal(js.status, 200);
  const source = await js.text();
  assert.match(source, /\/v1\/model\/history/);
  assert.match(source, /ค่าตัวที่ยืนยันในระบบ/);
  assert.match(source, /จ่ายแล้ว · MMD รับรอง/);
  assert.doesNotMatch(source, /client_name|location_name|raw_text|customer_reference/);
  const css = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/model-history-v1.css"));
  assert.equal(css.status, 200);
  assert.match(await css.text(), /#mmd-model-history-v1/);
});
