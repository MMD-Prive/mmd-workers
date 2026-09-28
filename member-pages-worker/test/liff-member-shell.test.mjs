import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";
import { handleCareBackLiffOrchestrator } from "../src/care-back-liff-orchestrator.js";
import { resolveTrustedWelcomeWorld } from "../src/liff-member-shell.js";

function env(overrides = {}) {
  return {
    LINE_LIFF_ID: "2000000000-AbCdEfGh",
    LIFF_SESSION_SECRET: "must-not-render-secret",
    AIRTABLE_API_KEY: "must-not-render-airtable-key",
    ...overrides,
  };
}

async function shell(path = "/member/liff", { method = "GET", runtime = env() } = {}) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, { method }), runtime);
}

async function stagingShell(hostname, path, runtime) {
  return worker.fetch(new Request(`https://${hostname}${path}`), runtime);
}

describe("same-site /member/liff shell", () => {
 it("keeps browser hints fail-closed and renders both trusted customer welcome copies", async () => {
    for (const query of ["?world=private", "?audience=private", "?world=sigil", "?world=private&welcome_context=forged", "?welcome_context=expired", "?welcome_context=replayed", "?welcome_context=ambiguous", "?intent=signup&view=signup"]) {
      const response = await shell(`/member/liff${query}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /world-public/);
      assert.match(html, /id="intro-screen" class="intro-screen my-mmd-welcome"/);
      assert.match(html, /dataset\.welcomeAudience = audience/);
      assert.match(html, /canonical_member_profile/);
      assert.match(html, /audience === "existing"/);
      assert.match(html, /MY MMD คือ APP ที่เปอร์สร้างขึ้นจากประสบการณ์การทำงานที่ผ่านมา/);
      assert.match(html, /ฮายยย เปอร์เองครับ เปอร์กลับมาแว้วว/);
      assert.match(html, /ไม่ได้หายไปติดผู้ชายนะครับ 5555/);
      assert.match(html, /ถามไป หายไม่มีคนตอบ/);
      assert.match(html, /AI เปอร์ก็รำคาญนะ 555/);
      assert.match(html, /กด Verify เพื่อรับสิทธิ์ต่ออายุสมาชิก 1 ปี/);
      assert.match(html, /ระบบจะรวมสิทธิ์ให้เป็น 2 ปี/);
      assert.match(html, /MMD%20Academy%20fback%20inside\.webp/);
      assert.match(html, /SIGIL%20Apply%20Hero\.webp/);
      assert.match(html, /data-welcome-audience="existing"/);
      assert.match(html, /width="31" height="31"/);
      assert.match(html, /aria-label="เข้าสู่บอร์ดสมาชิก MY MMD"/);
      assert.match(html, /ENTER →/);
      assert.match(html, /"world":"public"/);
      assert.match(html, /context-resolving/);
      assert.doesNotMatch(html, /<details id="per-letter"/);
    }
  });

  it("selects Private only from canonical active protected entitlement evidence", () => {
    const trusted = "my_mmd_entitlement_resolver_v1";
    assert.equal(resolveTrustedWelcomeWorld({ tier: "VIP", membership_status: "active" }, trusted), "private");
    assert.equal(resolveTrustedWelcomeWorld({ tier: "Black Card", membership_status: "grace" }, trusted), "private");
    assert.equal(resolveTrustedWelcomeWorld({ tier: "Premium", membership_status: "active" }, trusted), "public");
    assert.equal(resolveTrustedWelcomeWorld({ tier: "VIP", membership_status: "expired" }, trusted), "public");
    assert.equal(resolveTrustedWelcomeWorld({ tier: "VIP", membership_status: "active" }, "member_profile_resolver"), "public");
    assert.equal(resolveTrustedWelcomeWorld({ tier: "VIP", membership_status: "active" }, ""), "public");
  });

  it("renders the dedicated published Member Dashboard LIFF ID", async () => {
    const response = await shell("/member/liff?intent=status&view=profile", {
      runtime: env({ LINE_LIFF_ID: "2010862595-yT4DCEMc" }),
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"liffId":"2010862595-yT4DCEMc"/);
    assert.doesNotMatch(html, /2010298002-mbx9kqQn/);
  });

  it("serves a no-store same-site LIFF shell that bootstraps only through the LIFF start API", async () => {
    const response = await shell("/member/liff?intent=renew&code=KJ-PRV-ABC123");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/html/);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.match(response.headers.get("content-security-policy") || "", /static\.line-scdn\.net/);
    assert.match(html, /https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
    assert.match(html, /\/member\/api\/liff\/start/);
    assert.match(html, /"liffId":"2000000000-AbCdEfGh"/);
    assert.match(html, /"intent":"renew"/);
    assert.match(html, /"promoCode":"kj-prv-abc123"/);
    assert.match(html, /credentials:\s*"same-origin"/);
    assert.match(html, /window\.liff\.getIDToken\(\)/);
    assert.match(html, /\/member\/api\/liff\/care-back\/state/);
    assert.match(html, /\/member\/api\/liff\/care-back\/wallet/);
    assert.match(html, /\/member\/api\/liff\/care-back\/wish/);
    assert.match(html, /\/member\/api\/liff\/customer-requests/);
    assert.match(html, /\/member\/api\/liff\/customer-request-evidence/);
    assert.match(html, /YOUR REQUEST/);
    assert.match(html, /window\.MMD_LIFF_SAVE_MODEL/);
    assert.doesNotMatch(html, /line_user_id|lineUserId|decodedIDToken|getProfile\(/);
    assert.doesNotMatch(html, /must-not-render-secret|must-not-render-airtable-key/);
    assert.doesNotMatch(html, /https:\/\/mmdprive\.webflow\.io/);
  });

  it("offers server-priced Public Membership signup after LINE verification and guards checkout", async () => {
    const response = await shell("/member/liff?intent=signup&view=signup");
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /"intent":"signup"/);
    assert.match(html, /"view":"signup"/);
    assert.match(html, /id="signup-packages"/);
    assert.match(html, /href="https:\/\/miniapp\.line\.me\/2000000000-AbCdEfGh\/\?intent=signup&amp;view=signup"/);
    assert.match(html, /CONFIG\.intent === "signup" && !window\.liff\.isInClient\(\)/);
    assert.match(html, /\/sigil\/member\/membership\?source=line&amp;intent=signup/);
    assert.match(html, /\/member\/api\/liff\/public-membership\/catalog/);
    assert.match(html, /\/member\/api\/liff\/public-membership\/purchase/);
    assert.match(html, /JSON\.stringify\(\{ package_code: packageCode \}\)/);
    assert.match(html, /payload\?\.official_verification_required === true/);
    assert.match(html, /payload\?\.entitlement_granted === false/);
    assert.match(html, /url\.hostname === "mmdbkk\.com"/);
    assert.match(html, /welcomeContextPromise = resolveInitialWelcomeContext\(\)/);
    assert.match(html, /MY MMD คือ APP ที่เปอร์สร้างขึ้นจากประสบการณ์การทำงานที่ผ่านมา/);
    assert.doesNotMatch(html, /MMD PRIVÉ · LINE MEMBERSHIP|สมัครสมาชิก MMD|เลือกแพ็กเกจที่เหมาะกับคุณได้ใน LINE/);
    assert.ok(html.indexOf("const started = await call(CONFIG.startEndpoint, body)") < html.indexOf("await readSignupCatalog();", html.indexOf("const started = await call(CONFIG.startEndpoint, body)")));
    assert.doesNotMatch(html, /amount_thb:\s*690|amount_thb:\s*4990|amount_thb:\s*11499/);
  });

  it("checks the existing same-site member session before any LIFF init or login", async () => {
    const response = await shell("/member/liff?intent=promo&campaign=care_back&view=care_back");
    const html = await response.text();

    assert.equal(response.status, 200);
    const sessionCheck = html.indexOf("const existingProfile = await readProfile()");
    const liffInit = html.indexOf("await window.liff.init({ liffId: CONFIG.liffId })");
    const liffLogin = html.indexOf("window.liff.login({ redirectUri: window.location.href })");
    assert.ok(sessionCheck >= 0, "same-site session check must be rendered");
    assert.ok(liffInit > sessionCheck, "LIFF init must happen only after same-site session check");
    assert.ok(liffLogin > liffInit, "LIFF login must remain a fallback after LIFF init");
    assert.match(html, /if \(existingProfile\) \{ signupLineEntry\?\.classList\.add\("hidden"\); await readSignupCatalog\(\); return; \}/);
  });

  it("binds the canonical CARE BACK campaign to guarded same-site state and wish APIs", async () => {
    const response = await shell("/member/liff?intent=promo&campaign=care_back");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"intent":"promo"/);
    assert.match(html, /"campaign":"care_back"/);
    assert.match(html, /body\.campaign = CONFIG\.campaign/);
    assert.match(html, /crypto\.randomUUID\(\)/);
    assert.match(html, /final_display/);
    assert.match(html, /CONFIG\.intent === "promo" && CONFIG\.campaign === "care_back"/);
    assert.match(html, /กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ/);
    assert.doesNotMatch(html, /localStorage|line_user_id|claim_id/);
    assert.match(html, /window\.sessionStorage/);
    assert.match(html, /mmd\.customer_request\.pending\.v1\./);
  });

  it("normalizes untrusted query intent and promo values before embedding them", async () => {
    const response = await shell("/member/liff?intent=admin_override&code=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"intent":"unknown"/);
    assert.match(html, /"promoCode":""/);
    assert.match(html, /"campaign":""/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it("fails safely in rendered copy when the public LIFF id is not configured", async () => {
    const response = await shell("/member/liff", { runtime: env({ LINE_LIFF_ID: "" }) });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"liffId":""/);
    assert.match(html, /ช่องทางนี้ยังไม่พร้อมใช้งานครับ/);
  });

  it("renders only bounded member expiry and payment states", async () => {
    const response = await shell("/member/liff?intent=status");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="profile-expiry"/);
    assert.match(html, /id="profile-payment"/);
    assert.match(html, /id="expiry-card" class="card hidden"/);
    assert.match(html, /classList\.toggle\("hidden", !expiry\)/);
    assert.match(html, /verified:"Verified"/);
    assert.match(html, /pending_review:"Pending review"/);
    assert.match(html, /unavailable:"Unavailable"/);
    assert.match(html, /\|\| "Unavailable"/);
    assert.match(html, /function safeDate\(value\)/);
    assert.doesNotMatch(html, /payment_ref|receipt_url|member_email|Verification Status/);
  });

  it("renders the Customer 360 shell plus Coupon Wallet with TH, EN, and ZH fallbacks", async () => {
    const response = await shell("/member/liff?intent=status&view=jobs&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    for (const section of ["home", "points", "package", "jobs", "history-panel", "care", "coupons"]) {
      assert.match(html, new RegExp(`id="${section}"`));
    }
    for (const view of ["home", "points", "package", "jobs", "history", "care", "coupons"]) {
      assert.match(html, new RegExp(`data-view="${view}"`));
    }
    assert.match(html, /scroll-snap-type:x mandatory/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /"LINE Seed Sans TH"/);
    assert.match(html, /data-mmd-liff-digital="v3"/);
    assert.doesNotMatch(html, /data-design-source|lovable/i);
    assert.match(html, /--digital-surface:#1c1d1b/);
    assert.match(html, /--digital-gold:#d8b26a/);
    assert.match(html, /--digital-radius:8px/);
    assert.match(html, /data-view="history" aria-current="false"><i>▤<\/i>HISTORY/);
    assert.match(html, /id="digital-companion"[\s\S]*hidden/);
    assert.match(html, /id="digital-tmib-story"[\s\S]*hidden/);
    assert.doesNotMatch(html, /data-view="jobs" aria-current="false"><i>▤<\/i>งาน/);
    assert.match(html, /customer_360/);
    assert.match(html, /points\.status === "verified"/);
    assert.match(html, /membership\.levelVerified === true/);
    assert.match(html, /svip:"SVIP"/);
    assert.match(html, /dashboard\.points\?\.confirmedBalance/);
    assert.match(html, /membershipStatus\(status\)/);
    assert.match(html, /membership\.expiresAt \|\| membership\.renewalDueAt/);
    assert.match(html, /id="points-lifetime-spend"/);
    assert.match(html, /id="points-365-spend"/);
    assert.match(html, /Points มีอายุ 365 วัน · หมดอายุเป็นราย lot จากวันที่เข้าระบบ/);
    assert.match(html, /formatThb\(points\.lifetime_service_spend_thb\)/);
    assert.match(html, /navHome:"👤 HOME"/);
    assert.match(html, /navHome:"👤 HOME"[\s\S]*navPackage:"📦 PACKAGE"/);
    assert.match(html, /const CANONICAL_POINTS_PATH = "\/my-mmd\/points"/);
    assert.match(html, /if \(view === "points"\) \{[\s\S]*window\.location\.assign\(CANONICAL_POINTS_PATH\);[\s\S]*return;[\s\S]*\}/);
    assert.match(html, /const targetId = view === "history" \? "history-panel" : view/);
    assert.match(html, /"historyEndpoint":"\/api\/member\/app\/history"/);
    assert.match(html, /"historyRecoveryEndpoint":"\/api\/member\/app\/history\/recovery"/);
    assert.match(html, /async function readCanonicalHistory\(\)/);
    assert.match(html, /fetch\(CONFIG\.historyEndpoint/);
    assert.match(html, /fetch\(CONFIG\.historyRecoveryEndpoint/);
    assert.match(html, /credentials:"same-origin"/);
    assert.match(html, /await readCreditWallet\(\);\s*await readCanonicalHistory\(\);\s*await readCustomerRequests\(\);/);
    assert.match(html, /recoveryPayload\?\.history_recovery\?\.state/);
    assert.match(html, /pointsTitle:"⭐ 积分"/);
    assert.doesNotMatch(html, /payment_ref|provider_transaction_id|line_user_id|telegram_user_id|Airtable|R2 key|slip_url/i);
    const scriptStart = html.lastIndexOf("<script nonce=");
    const scriptBodyStart = html.indexOf(">", scriptStart) + 1;
    const scriptBodyEnd = html.indexOf("</script>", scriptBodyStart);
    assert.ok(scriptStart >= 0 && scriptBodyStart > scriptStart && scriptBodyEnd > scriptBodyStart);
    assert.doesNotThrow(() => new Function(html.slice(scriptBodyStart, scriptBodyEnd)));
  });

  it("keeps Customer Requests retry state opaque, stable, and bounded to session storage", async () => {
    const response = await shell("/member/liff?intent=status&view=my-requests");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /pendingRequestId\("profile_update"\)/);
    assert.match(html, /pendingRequestId\("your_request"\)/);
    assert.match(html, /pendingRequestId\("saved_model", token\)/);
    assert.match(html, /opaqueStorageToken\(action \+ ":" \+ modelId\)/);
    assert.match(html, /opaqueStorageToken\(\[file\.type, file\.size, file\.lastModified/);
    assert.match(html, /\^evidence_\[a-f0-9\]\{32\}\$/);
    assert.match(html, /terminalClientError\(response\)/);
    assert.match(html, /contact\.telegramUsername \|\| contact\.telegram_username \|\| contact\.telegram/);
    assert.doesNotMatch(html, /sessionStorage\.setItem\([^\n]*(?:email|phone|telegram|line_user_id|entitlement|preferences)/i);
  });

  it("renders MMD TODAY and MMD ROTATION while keeping personalization backend-bounded", async () => {
    const response = await shell("/member/liff?intent=status&view=home&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<p class="digital-eyebrow">MMD TODAY<\/p>/);
    assert.match(html, /<small>PRIVATE FEED<\/small>MMD ROTATION/);
    assert.match(html, /let digitalPersonalizedFeed = \[\]/);
    assert.match(html, /homeFeed\.authority === "member_app_dashboard_v1"/);
    assert.match(html, /homeFeed\.state === "resolved"/);
    assert.match(html, /Array\.isArray\(homeFeed\.items\)/);
    assert.match(html, /if \(personalized\) return "FOR YOU"/);
    assert.match(html, /return "MMD UPDATE"/);
    assert.match(html, /return "EDITORIAL"/);
    assert.match(html, /const allowedViews = new Set\(\["history","package","care","jobs","points","credits","coupons"\]\)/);
    assert.match(html, /renderDigitalNews\(digitalPersonalizedFeed, response\.ok \? items : \[\],/);
    assert.match(html, /fetch\("\/api\/v1\/member\/updates\/list\?limit=10"/);
    assert.match(html, /data-feed-view/);
    assert.doesNotMatch(html, /internal_note|provider_transaction_id|slip_url/);

    const todayIndex = html.indexOf("MMD TODAY");
    const missionIndex = html.indexOf("MMD MISSION", todayIndex);
    const rotationIndex = html.indexOf("MMD ROTATION", missionIndex);
    const quickIndex = html.indexOf("QUICK ACCESS", rotationIndex);
    const kenjiIndex = html.indexOf('class="digital-kenji"', quickIndex);
    assert.ok(todayIndex >= 0 && missionIndex > todayIndex && rotationIndex > missionIndex && quickIndex > rotationIndex && kenjiIndex > quickIndex);
  });

  it("keeps MMD MISSION payment-gated, lifecycle-exact, and view-only", async () => {
    const response = await shell("/member/liff?intent=status&view=home&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="digital-mission" class="digital-mission"[^>]*hidden/);
    assert.match(html, /<small>CURRENT JOB<\/small>MMD MISSION/);
    assert.match(html, /fetch\("\/api\/member\/app\/session\/current"/);
    assert.match(html, /session\?\.missionReady !== true/);
    assert.match(html, /MISSION_VISIBLE_STATES = new Set\(\["confirmed","preparing","en_route","nearby","arrived","met_customer","final_payment_pending","final_payment_confirmed","work_started","in_progress","work_finished"\]\)/);
    assert.match(html, /final_payment_pending:"PAYMENT CHECK"/);
    assert.match(html, /final_payment_confirmed:"PAYMENT CONFIRMED"/);
    assert.match(html, /work_started:"SESSION STARTED"/);
    assert.match(html, /work_finished:"SESSION FINISHED"/);
    assert.match(html, /missionToggle\.addEventListener\("click"/);
    assert.match(html, /missionDetail\.hidden = expanded/);

    const clickStart = html.indexOf('missionToggle.addEventListener("click"');
    const hydrateStart = html.indexOf("async function hydrateDigitalMission", clickStart);
    assert.ok(clickStart >= 0 && hydrateStart > clickStart);
    const clickOnly = html.slice(clickStart, hydrateStart);
    assert.doesNotMatch(clickOnly, /fetch\(|method:\s*"POST"|eta_minutes|acknowledge_reconfirm/);
  });

  it("keeps MY MMD welcome and request surfaces readable at the approved fixture breakpoints", async () => {
    const response = await shell("/member/liff");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /@media\(max-width:340px\)/);
    assert.match(html, /@media\(max-width:390px\)/);
    assert.match(html, /@media\(max-width:430px\)/);
    assert.match(html, /@media\(min-width:700px\)/);
    assert.match(html, /body:not\(\.app-entered\) main,\s*body\.world-public:not\(\.signup-mode\):not\(\.app-entered\) main,\s*body\.world-private:not\(\.signup-mode\):not\(\.app-entered\) main\{[^}]*width:100%[^}]*max-width:none/);
    assert.match(html, /overflow-x:hidden/);
    assert.match(html, /\.my-mmd-welcome \.per-letter-copy\{[^}]*max-height:none[^}]*overflow:visible/);
    assert.doesNotMatch(html, /line-clamp|-webkit-line-clamp/);
  });

  it("keeps MY MMD signup shell full-screen without changing membership package sizing", async () => {
    const response = await shell("/member/liff?intent=signup");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /body\.signup-mode\{[^}]*width:100%[^}]*max-width:100%[^}]*min-height:100dvh[^}]*padding:0[^}]*overflow-x:clip/);
    assert.match(html, /body\.signup-mode main\{[^}]*width:100%[^}]*max-width:none[^}]*min-height:100dvh[^}]*margin:0/);
    assert.match(html, /padding:calc\(26px \+ env\(safe-area-inset-top\)\) max\(18px,env\(safe-area-inset-right\)\) calc\(34px \+ env\(safe-area-inset-bottom\)\) max\(18px,env\(safe-area-inset-left\)\)/);
    assert.match(html, /@media\(min-width:600px\)\{body\.signup-mode\{padding:0\}body\.signup-mode main\{[^}]*min-height:100dvh[^}]*border:0[^}]*border-radius:0/);
    assert.match(html, /body\.signup-mode #signup[^}]*width:min\(100%,760px\);margin-left:auto;margin-right:auto/);
    assert.doesNotMatch(html, /body\.signup-mode main\{[^}]*560px/);
    assert.doesNotMatch(html, /body\.signup-mode\{padding:24px\}/);
    assert.match(html, /body\.signup-mode \.signup-package\{position:relative;gap:10px;padding:18px;border-radius:16px/);
  });

  it("keeps the entered MY MMD LIFF shell edge-to-edge with safe areas and unchanged member snapshot sizing", async () => {
    const response = await shell("/member/liff?intent=status&view=home");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /html,body\{margin:0;padding:0;width:100%;min-width:100%;min-height:100%;overflow-x:hidden\}/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\)\{[^}]*min-height:100dvh[^}]*width:100%[^}]*max-width:100%[^}]*overflow-x:clip/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) main\{[^}]*width:100%[^}]*max-width:none[^}]*min-height:100dvh/);
    assert.match(html, /padding:calc\(16px \+ env\(safe-area-inset-top\)\) 16px calc\(90px \+ env\(safe-area-inset-bottom\)\)/);
    assert.match(html, /padding-left:max\(16px,env\(safe-area-inset-left\)\)/);
    assert.match(html, /padding-right:max\(16px,env\(safe-area-inset-right\)\)/);
    assert.match(html, /\.digital-dock\{[^}]*left:0;right:0;[^}]*width:100%;[^}]*max-width:none;[^}]*transform:none/);
    assert.match(html, /\.digital-dock\{[^}]*env\(safe-area-inset-right\)[^}]*env\(safe-area-inset-bottom\)[^}]*env\(safe-area-inset-left\)/);
    assert.match(html, /@media\(max-width:699px\)\{[^}]*width:100vw;max-width:100vw;min-height:100dvh/);
    assert.match(html, /@media\(min-width:700px\)\{[^}]*#profile[^}]*width:min\(100%,760px\);margin-left:auto;margin-right:auto/);
    assert.match(html, /\.digital-snapshot\{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;margin-top:14px;padding:12px;border:1px solid var\(--digital-line\);border-radius:var\(--digital-radius\);background:var\(--digital-surface\)\}/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) #status\{display:none!important;margin:0\}/);
    assert.doesNotMatch(html, /data-design-source|lovable|DESIGN PREVIEW/i);
    assert.doesNotMatch(html, /LIFF HOME|Member LIFF|>LIFF</i);
    assert.match(html, /MY MMD · MEMBER APP/);
    assert.doesNotMatch(html, /body\.app-entered:not\(\.signup-mode\) main\{[^}]*520px/);
    assert.doesNotMatch(html, /\.digital-dock\{[^}]*520px/);
  });

  it("keeps inner member views compact and native to the digital shell without changing their routes", async () => {
    const response = await shell("/member/liff?intent=status&view=history");
    const html = await response.text();

    assert.equal(response.status, 200);
    for (const id of ["points", "credits", "package", "jobs", "history-panel", "coupons"]) {
      assert.match(html, new RegExp('id="' + id + '" class="panel digital-view"'));
    }
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) \.digital-view>\.card[^}]*border-radius:0[^}]*background:transparent/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) #credits \.detail-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) #points \.detail-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
    assert.match(html, /id="care" class="panel digital-care"/);
    assert.match(html, /id="my-requests" class="panel digital-requests"/);
    assert.doesNotMatch(html, /id="care" class="panel digital-view"/);
    assert.doesNotMatch(html, /id="my-requests" class="panel digital-view"/);
    assert.match(html, /const CANONICAL_POINTS_PATH = "\/my-mmd\/points"/);
    assert.match(html, /data-view="history"/);
    assert.match(html, /data-view="credits"/);
  });

  it("keeps CARE BACK and My Requests compact without changing form or claim contracts", async () => {
    const response = await shell("/member/liff?intent=status&view=my-requests");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="care" class="panel digital-care"/);
    assert.match(html, /id="my-requests" class="panel digital-requests"/);
    assert.match(html, /class="card details digital-request-block"/);
    assert.match(html, /id="customer-profile-form" class="form-stack"/);
    assert.match(html, /id="your-request-form" class="form-stack"/);
    assert.match(html, /id="customer-request-list" class="history"/);
    assert.match(html, /id="saved-model-list" class="history"/);
    assert.match(html, /id="care-button"/);
    assert.match(html, /id="wish-text"/);
    assert.match(html, /id="wish-submit"/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) \.digital-care>\.care[^}]*border:0[^}]*background:transparent/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) \.digital-request-block>summary::after\{content:"\+"/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) \.digital-requests input[^}]*background:var\(--digital-surface\)/);
  });

  it("renders a verified-only Credit Wallet through the same-site credit API", async () => {
    const response = await shell("/member/liff?intent=status&view=credits&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"creditWalletEndpoint":"\/api\/member\/app\/credits"/);
    assert.match(html, /data-view="credits"/);
    assert.match(html, /id="credits" class="panel digital-view"/);
    assert.match(html, /id="credit-available"/);
    assert.match(html, /id="credit-reserved"/);
    assert.match(html, /id="credit-used"/);
    assert.match(html, /await readCouponWallet\(\);\s*await readCreditWallet\(\);/);
    assert.match(html, /credentials:"same-origin"/);
    assert.match(html, /payload\.state !== "resolved" \|\| payload\.verificationState !== "verified_only"/);
    assert.match(html, /item\.verified !== true \|\| item\.verificationState !== "verified"/);
    assert.match(html, /\["available", "partially_used", "used", "refunded", "expired"\]/);
    assert.match(html, /items\.slice\(0, 3\)/);
    assert.match(html, /กำลังตรวจสอบเครดิตบริการของคุณครับ/);
    assert.match(html, /ยังไม่มีเครดิตบริการที่ยืนยันแล้วสำหรับบัญชีนี้ครับ/);
    assert.doesNotMatch(html, /credit_id|Campaign Claim ID|Verification Snapshot|payment_authority/i);
  });

  it("supports HEAD without a response body and rejects unsupported shell methods", async () => {
    const head = await shell("/member/liff", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");

    const put = await shell("/member/liff", { method: "PUT" });
    assert.equal(put.status, 405);
    assert.equal(put.headers.get("allow"), "GET, HEAD");
  });

  it("keeps LIFF API routing delegated to the guarded foundation", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/not-a-route", {
      method: "GET",
      headers: { origin: "https://mmdbkk.com" },
    }), env());
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error.code, "LIFF_ROUTE_NOT_FOUND");
  });

  it("renders bounded current-member and returning-member synthetic launch cases without requiring real customer data", async () => {
    const runtime = env({ CARE_BACK_STAGING_MODE: "synthetic" });
    const current = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=current",
      runtime,
    );
    const returning = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=returning",
      runtime,
    );

    assert.equal(current.status, 200);
    assert.equal(returning.status, 200);
    assert.match(await current.text(), /"stagingScenario":"current"/);
    assert.match(await returning.text(), /"stagingScenario":"returning"/);
  });

  it("enables bounded synthetic scenarios only on the staging workers.dev host", async () => {
    const runtime = env({ CARE_BACK_STAGING_MODE: "synthetic" });
    const staging = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=current",
      runtime,
    );
    const production = await stagingShell(
      "mmdbkk.com",
      "/member/liff?intent=promo&campaign=care_back&scenario=current",
      runtime,
    );
    const invalid = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=admin",
      runtime,
    );

    assert.match(await staging.text(), /"stagingScenario":"current"/);
    assert.match(await production.text(), /"stagingScenario":""/);
    assert.match(await invalid.text(), /"stagingScenario":""/);
  });
});

describe("POST /member/liff CARE BACK orchestration", () => {
  it("saves Wish before Claim/link and surfaces the canonical coupon in My MMD", async () => {
    const order = [];
    const request = new Request("https://www.mmdbkk.com/member/liff", {
      method: "POST",
      headers: {
        origin: "https://www.mmdbkk.com",
        "content-type": "application/json",
        cookie: "__Host-mmd_liff_session=session-original",
      },
      body: JSON.stringify({
        wish_text: "สุขสันต์วันเกิด MMD ครับ",
        request_id: "wish-orchestrator-0001",
        language: "th",
      }),
    });

    const response = await handleCareBackLiffOrchestrator(request, {}, undefined, {
      async publicWishHandler(publicRequest) {
        order.push("wish_save");
        assert.equal(new URL(publicRequest.url).pathname, "/member/api/care-back/public-wish");
        return Response.json({
          ok: true,
          state: "completed",
          wish: { text: "สุขสันต์วันเกิด MMD ครับ" },
          wish_link_token: "pw_abcdefghijklmnopqrstuvwxyz012345",
        }, {
          headers: { "set-cookie": "mmd_care_back_wish_link=pw_abcdefghijklmnopqrstuvwxyz012345; Path=/; Secure; SameSite=Lax" },
        });
      },
      async canonicalLinkHandler(linkRequest) {
        order.push("claim_link_coupon");
        assert.equal(new URL(linkRequest.url).pathname, "/member/api/care-back/link-wish");
        assert.deepEqual(await linkRequest.json(), { wish_link_token: "pw_abcdefghijklmnopqrstuvwxyz012345" });
        return Response.json({
          ok: true,
          linked: true,
          wish: { text: "สุขสันต์วันเกิด MMD ครับ" },
          claim: { claim_reference: "CB6-2026-TEST", claim_status: "benefit_approved" },
          coupon: {
            state: "ready",
            code: "ABC234",
            approved_discount_percent: 7,
            activated_at: "2026-09-15T00:00:00.000Z",
            expires_at: "2026-11-15T00:00:00.000Z",
          },
          benefits: { coupon: true },
        }, {
          headers: { "set-cookie": "__Host-mmd_liff_session=session-rotated; Path=/; Secure; HttpOnly; SameSite=Lax" },
        });
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(order, ["wish_save", "claim_link_coupon"]);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.coupon.state, "ready");
    assert.equal(payload.coupon.approved_discount_percent, 7);
    assert.equal(payload.my_mmd.coupons_endpoint, "/api/member/app/coupons");
    assert.equal(response.headers.get("x-mmd-care-back-orchestrator"), "v1");
  });

  it("rejects browser member/coupon authority before any write", async () => {
    let called = false;
    const request = new Request("https://www.mmdbkk.com/member/liff", {
      method: "POST",
      headers: { origin: "https://www.mmdbkk.com", "content-type": "application/json" },
      body: JSON.stringify({
        wish_text: "test",
        request_id: "wish-orchestrator-reject-0001",
        member_id: "mem_fake",
        approved_discount_percent: 10,
      }),
    });
    const response = await handleCareBackLiffOrchestrator(request, {}, undefined, {
      async publicWishHandler() { called = true; return Response.json({ ok: true }); },
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BROWSER_AUTHORITY_REJECTED");
    assert.equal(called, false);
  });
});
