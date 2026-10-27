import { createHypeLoaderMotion, APPROVED_ENTRY_CSS } from "../src/liff-approved-entry.js";
import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { runInNewContext } from "node:vm";

import worker from "../src/index.js";
import { handleCareBackLiffOrchestrator } from "../src/care-back-liff-orchestrator.js";
import { resolveTrustedWelcomeWorld, handleLiffMemberShell } from "../src/liff-member-shell.js";
import { MY_MMD_LOVABLE_DESIGN_CSS as css } from "../src/liff-lovable-design.js";

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
  it("LINE return retains the Console Session and suppresses mismatched or malformed selection", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("async function hydrateDigitalMission()");
    const end = html.indexOf("function digitalFeedCategory", start);
    const hydrate = html.slice(start, end);
    for (const [search, returnedId, expectedReads, expectedRenders] of [
      ["?session_id=SESSION-A", "SESSION-A", 1, 1],
      ["?session_id=SESSION-A", "SESSION-B", 1, 0],
      ["?session_id=A&session_id=B", "SESSION-A", 0, 0],
      ["?session_id=", "SESSION-A", 0, 0],
    ]) {
      const calls = [], rendered = [];
      await runInNewContext(hydrate + "hydrateDigitalMission()", {
        document:{getElementById:() => ({hidden:false})}, location:{search}, URLSearchParams, encodeURIComponent,
        async memberApiFetch(url) {calls.push(url);return Response.json({sessionId:returnedId});},
        renderDigitalMission(session) {rendered.push(session);},
      });
      assert.equal(calls.length, expectedReads, search);
      assert.equal(rendered.length, expectedRenders, search);
      if (expectedReads) assert.equal(calls[0], "/api/member/app/session/current?session_id=SESSION-A");
    }
  });
 it("keeps browser hints fail-closed and renders both trusted customer welcome copies", async () => {
    for (const query of ["?world=private", "?audience=private", "?world=sigil", "?world=private&welcome_context=forged", "?welcome_context=expired", "?welcome_context=replayed", "?welcome_context=ambiguous", "?intent=signup&view=signup"]) {
      const response = await shell(`/member/liff${query}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /world-public/);
      assert.match(html, /id="intro-screen" class="intro-screen my-mmd-welcome"/);
      assert.match(html, /dataset\.welcomeAudience = audience/);
      assert.match(html, /canonical_member_profile/);
      assert.match(html, /canonical_client/);
      assert.match(html, /canonical_member_client_absence/);
      assert.match(html, /audience === "existing"/);
      assert.match(html, /checking: \{ title: "MY MMD", subtitle: "กำลังเตรียมพื้นที่ของคุณ"/);
      assert.match(html, /MY MMD คือ APP ที่เปอร์สร้างขึ้นจากประสบการณ์การทำงานที่ผ่านมา/);
      assert.match(html, /ฮายยย เปอร์เองครับ เปอร์กลับมาแล้ววว/);
      assert.match(html, /ไม่ได้หายไปติดผู้ชายนะครับ 5555/);
      assert.match(html, /ถามไป หายไม่มีคนตอบ/);
      assert.match(html, /AI เปอร์ก็รำคาญนะ 555/);
      assert.match(html, /กด Verify เพื่อรับสิทธิ์ต่ออายุสมาชิก 1 ปี/);
      assert.match(html, /ระบบจะรวมสิทธิ์ให้เป็น 2 ปี/);
      assert.match(html, /MMD%20Academy%20fback%20inside\.webp/);
      assert.match(html, /SIGIL%20Apply%20Hero\.webp/);
      assert.match(html, /data-welcome-audience="existing"/);
      assert.match(html, /entry-brand-footer/);
      assert.match(html, /sigil-primary-logo/);
      assert.match(html, /aria-label="ยืนยันตัวตนผ่าน LINE"/);
      assert.match(html, /ยืนยันผ่าน LINE/);
      assert.match(html, /ระบบจำการเข้าสู่ระบบในอุปกรณ์นี้ 30 วัน/);
      assert.match(html, /id="member-logout"/);
      assert.match(html, /\/member\/api\/liff\/logout/);
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
    assert.match(html, /https:\/\/miniapp\.line\.me\/2000000000-AbCdEfGh\/\?intent=signup&amp;view=signup/);
    assert.doesNotMatch(html, /href="\/sigil\/member\/membership/);
    assert.match(html, /\/member\/api\/liff\/public-membership\/catalog/);
    assert.match(html, /\/member\/api\/liff\/public-membership\/purchase/);
    assert.match(html, /JSON\.stringify\(\{ package_code: packageCode \}\)/);
    assert.match(html, /payload\?\.official_verification_required === true/);
    assert.match(html, /payload\?\.entitlement_granted === false/);
    assert.match(html, /url\.hostname === "mmdbkk\.com"/);
    assert.match(html, /welcomeContextPromise = resolveInitialWelcomeContext\(\)/);
    assert.match(html, /MY MMD คือ APP ที่เปอร์สร้างขึ้นจากประสบการณ์การทำงานที่ผ่านมา/);
    assert.doesNotMatch(html, /MMD PRIVÉ · LINE MEMBERSHIP|สมัครสมาชิก MMD|เลือกแพ็กเกจที่เหมาะกับคุณได้ใน LINE/);
    assert.ok(html.indexOf("const started = await call(CONFIG.startEndpoint, body)") < html.indexOf("void readSignupCatalog();", html.indexOf("const started = await call(CONFIG.startEndpoint, body)")));
    assert.doesNotMatch(html, /amount_thb:\s*690|amount_thb:\s*4990|amount_thb:\s*11499/);
  });

  it("resolves Welcome audience before rendering customer-specific copy and never auto-logins", async () => {
    const response = await shell("/member/liff?intent=promo&campaign=care_back&view=care_back");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /async function readWelcomeContext\(\)/);
    assert.match(html, /async function preflightWelcomeIdentity\(\)/);
    assert.match(html, /let resolvedAudience = await readWelcomeContext\(\)/);
    assert.match(html, /const sessionReady = await preflightWelcomeIdentity\(\)/);
    assert.match(html, /if \(!window\.liff\.isLoggedIn\(\)\) return false/);
    assert.match(html, /const idToken = window\.liff\.getIDToken\(\)/);
    assert.match(html, /existingProfilePromise = readProfile\(\{ hydrate: false, silent: true \}\)\.catch\(\(\) => null\)/);
    const preflightStart = html.indexOf("async function preflightWelcomeIdentity()");
    const preflightEnd = html.indexOf("async function resolveInitialWelcomeContext()", preflightStart);
    const preflightCode = html.slice(preflightStart, preflightEnd);
    assert.doesNotMatch(preflightCode, /liff\.login/);
    assert.match(html, /void boot\(\{ existingProfileChecked: true \}\)/);
    assert.match(html, /if \(!existingProfileChecked\) \{[\s\S]*readProfile\(\{ hydrate: false \}\)/);
  });

  it("keeps MY MMD entry latency bounded and defers secondary hydration", async () => {
    const response = await shell("/member/liff?intent=status");
    const html = await response.text();

    assert.equal(response.status, 200);
    const firstProfileBootstrap = html.indexOf("existingProfilePromise = readProfile({ hydrate: false, silent: true })");
    assert.ok(firstProfileBootstrap > html.indexOf("let memberApiChain = Promise.resolve()"));
    assert.ok(firstProfileBootstrap > html.indexOf("let profileGeneration = 0"));
    assert.match(html, /setTimeout\(\(\) => controller\.abort\(\), 4500\)/);
    assert.match(html, /existingProfilePromise = readProfile\(\{ hydrate: false, silent: true \}\)\.catch\(\(\) => null\)/);
    const entered = html.indexOf('document.body.classList.add("app-entered")');
    const hydrate = html.indexOf("void hydrateMemberHome()", entered);
    assert.ok(entered >= 0 && hydrate > entered, "secondary member hydration must start only after the app surface is entered");
    assert.match(html, /const secondaryReads = new Map\(\)/);
    assert.match(html, /if \(profileReady\) void hydrateMemberHome\(target\.id === "history-panel" \? "history" : target\.id\)/);
    assert.match(html, /if \(!profileReady \|\| !read\) return/);
    assert.doesNotMatch(html, /const hydrationReads = \[/);
    assert.match(html, /id="hype-progress" class="loading-bar" role="progressbar"/);
    assert.match(html, /class="hype-sprite"[^>]+width="38" height="57"/);
    assert.doesNotMatch(html, /hype-loader-img|hype-progress-number|setLoadingPercent/);
    assert.match(html, /void readSignupCatalog\(\)/);
    assert.match(html, /readProfile\(\{ hydrate: false \}\)/);
  });

  it("loads secondary member panels only after selection and reuses a successful read", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("async function hydrateMemberHome(");
    const end = html.indexOf("// Member session cookies rotate", start);
    assert.ok(start > 0 && end > start);
    const calls = [];
    const read = (name) => async () => { calls.push(name); return { ok:true }; };
    const context = {
      initialView:"home", profileReady:true, secondaryReads:new Map(),
      CONFIG:{ intent:"status", campaign:"" },
      readCouponWallet:read("coupons"), readCreditWallet:read("credits"),
      readCanonicalHistory:read("history"), readCustomerRequests:read("requests"),
      readCareBackState:read("care"), Promise,
    };
    await runInNewContext(html.slice(start, end) + `(async () => {
      await hydrateMemberHome("home");
      await hydrateMemberHome("credits");
      await hydrateMemberHome("credits");
      await hydrateMemberHome("history");
    })()`, context);
    assert.deepEqual(calls, ["credits", "history"]);
  });

  it("queues the canonical profile before supplemental status and history reads", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("async function readProfile(");
    const end = html.indexOf("function requestId()", start);
    assert.ok(start > 0 && end > start);
    const calls = [];
    const data = { customer_360: {} };
    const result = await runInNewContext(html.slice(start, end) + "readProfile({ hydrate: false })", {
      CONFIG: { profileEndpoint: "/member/api/liff/profile" },
      profileGeneration: 0,
      hideMemberProfile() {}, personalMainUI:{load(){},reset(){}},
      memberApiFetch(url) { calls.push(url); return Promise.resolve(Response.json({ ok: true, data })); },
      readQuickMembershipStatus() { calls.push("membership"); },
      readOwnHistoryPreview() { calls.push("history"); },
      renderProfile() {}, renderCustomerContact() {}, hydrateMemberHome() {},
      Promise,
    });
    assert.deepEqual(calls, ["/member/api/liff/profile", "membership", "history"]);
    assert.equal(JSON.stringify(result), JSON.stringify(data));
  });

  it("hides the previous Client profile immediately and keeps stale profile responses from restoring it", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("function hideMemberProfile()");
    const end = html.indexOf("function requestId()", start);
    assert.ok(start > 0 && end > start);
    const hidden = new Set();
    const profile = { classList:{ add(value){hidden.add(value);}, remove(value){hidden.delete(value);} }, inert:false };
    const appStatus = { dataset:{} };
    const messages = [];
    const context = {
      resetCustomerBrand(){}, accountUI:{reset(){}}, personalMainUI:{load(){},reset(){}},
      CONFIG:{profileEndpoint:"/member/api/liff/profile"}, profile, appStatus,
      profileGeneration:0, profileReady:true, secondaryReads:new Map(),
      digitalPersonalizedFeed:[{title:"old client"}], digitalUpdatesGeneration:0, digitalUpdatesPending:null,
      show(message){messages.push(message);},
      document:{getElementById:() => null},
      hydrateDigitalHome(){}, hydrateDigitalMission(){}, loadRenewalCard(){},
      renderProfile(){profile.classList.remove("hidden");profile.inert=false;},
      renderCustomerContact(){}, readQuickMembershipStatus(){}, readOwnHistoryPreview(){}, hydrateMemberHome(){},
      Promise, Response,
    };
    let releaseOld;
    let calls = 0;
    context.memberApiFetch = () => {
      calls++;
      if (calls === 1) return new Promise(resolve => { releaseOld = resolve; });
      return Promise.resolve(Response.json({ok:false},{status:401}));
    };
    const code = html.slice(start, end);
    const pendingOld = runInNewContext(code + "readProfile({hydrate:false})", context);
    assert.equal(hidden.has("hidden"), true, "the old profile is hidden while identity is rechecked");
    await runInNewContext(code + "readProfile({hydrate:false, silent:true})", context);
    assert.deepEqual(messages, [], "an expected bootstrap 401 must preserve welcome copy");
    const failedNew = await runInNewContext(code + "readProfile({hydrate:false})", context);
    assert.equal(failedNew, null);
    assert.equal(hidden.has("hidden"), true, "a failed identity check leaves private content hidden");
    assert.equal(profile.inert, true);
    assert.equal(context.profileReady, false);
    assert.equal(context.digitalPersonalizedFeed.length, 0);
    assert.deepEqual(messages, ["กรุณาเปิด MY MMD อีกครั้งเพื่อตรวจสอบบัญชีของคุณครับ"]);
    releaseOld(Response.json({ok:true,data:{customer_360:{member:{display_name:"stale"}}}}));
    assert.equal(await pendingOld, null);
    assert.equal(hidden.has("hidden"), true, "an old successful response cannot restore a newer Client");
  });

  it("invalidates pending Dashboard, Mission and renewal results and clears lazy account views on profile recheck", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const fragment = (startText, endText) => html.slice(html.indexOf(startText), html.indexOf(endText, html.indexOf(startText)));
    const nodes = new Map();
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, {hidden:false, textContent:"previous Client", classList:{add(){}}, inert:false});
      return nodes.get(id);
    };
    const pending = [], rendered = [];
    const context = {
      resetCustomerBrand(){}, accountUI:{reset(){}}, personalMainUI:{load(){},reset(){}},
      document:{getElementById:node}, profile:node("profile"), profileReady:true,
      secondaryReads:new Map(), digitalPersonalizedFeed:[], digitalUpdatesGeneration:0, digitalUpdatesPending:null,
      locale:"th", location:{search:""}, URLSearchParams, encodeURIComponent,
      memberApiFetch:() => new Promise(resolve => pending.push(resolve)),
      renderDigitalMission:() => rendered.push("mission"),
      renderRenewalCard:() => rendered.push("renewal"),
      setDigitalPointsDisplay:() => rendered.push("dashboard"),
      Promise,
    };
    const code = fragment("async function hydrateDigitalMission()", "function digitalFeedCategory")
      + fragment("async function hydrateDigitalHome(", "async function loadDigitalUpdates()")
      + fragment("async function loadRenewalCard()", "function renewalDate")
      + fragment("function hideMemberProfile()", "function clearMemberProfile(");
    const running = runInNewContext(code + "Promise.all([hydrateDigitalHome({}), loadRenewalCard()])", context);
    assert.equal(pending.length, 3);
    runInNewContext("hideMemberProfile()", context);
    assert.equal(node("digital-mission").hidden, true);
    assert.equal(node("renewal-card").hidden, true);
    assert.equal(node("coupon-wallet").textContent.includes("previous Client"), false);
    assert.equal(node("credit-available").textContent, "—");
    pending[0](Response.json({data:{points:{confirmedBalance:9}}}));
    pending[1](Response.json({sessionId:"old"}));
    pending[2](Response.json({ok:true}));
    await running;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(rendered, []);
  });

  it("renders Dashboard before a slow Mission while serializing session reads through the response body", async (t) => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const fragment = (startText, endText) => {
      const start = html.indexOf(startText), end = html.indexOf(endText, start);
      assert.ok(start > 0 && end > start);
      return html.slice(start, end);
    };
    const queue = fragment("function memberApiFetch(url, init = {})", "async function readOwnHistoryPreview(");
    const mission = fragment("async function hydrateDigitalMission()", "function digitalFeedCategory");
    const home = fragment("async function hydrateDigitalHome(", "async function loadDigitalUpdates()");
    const calls = [], points = [], nodes = new Map();
    let dashboardBody, releaseMission, missionStarted, missionRendered;
    const missionResponse = new Promise((resolve) => { releaseMission = resolve; });
    const startedMission = new Promise((resolve) => { missionStarted = resolve; });
    const renderedMission = new Promise((resolve) => { missionRendered = resolve; });
    const dashboardResponse = new Response(new ReadableStream({ start(controller) { dashboardBody = controller; } }));
    t.after(() => {
      try { dashboardBody.close(); } catch {}
      releaseMission(Response.json({}));
    });
    const homeReady = runInNewContext("let memberApiChain = Promise.resolve();\n" + queue + mission + home + "hydrateDigitalHome({})", {
      document: { getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { hidden:false, textContent:"" });
        return nodes.get(id);
      } },
      location:{ search:"" }, locale:"th", digitalPersonalizedFeed:[],
      Response, Promise, AbortController, Uint8Array, URLSearchParams, encodeURIComponent, setTimeout, clearTimeout,
      setDigitalPointsDisplay(...args) { points.push(args); },
      renderDigitalMission() { missionRendered(); },
      fetch(url) {
        calls.push(url);
        if (url === "/api/member/app/dashboard") return Promise.resolve(dashboardResponse);
        if (url === "/api/member/app/session/current") { missionStarted(); return missionResponse; }
        throw new Error("Unexpected external fetch blocked");
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([...calls], ["/api/member/app/dashboard"], "Mission must not start while Dashboard's response body is pending");
    dashboardBody.enqueue(new TextEncoder().encode(JSON.stringify({ data:{ points:{ confirmedBalance:7 } } })));
    dashboardBody.close();
    await homeReady;
    await startedMission;
    assert.deepEqual(calls, ["/api/member/app/dashboard", "/api/member/app/session/current"]);
    assert.deepEqual(points, [[7, true]], "Home must render canonical Dashboard data before Mission responds");
    releaseMission(Response.json({}));
    await renderedMission;
  });

  it("ignores a secondary response after the canonical profile changes", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("async function readCouponWallet()");
    const end = html.indexOf("async function readCreditWallet()", start);
    assert.ok(start > 0 && end > start);
    let release;
    const response = new Promise((resolve) => { release = resolve; });
    const rendered = [];
    const context = {
      profileGeneration:1, CONFIG:{ couponWalletEndpoint:"/coupon" },
      memberApiFetch:() => response, renderCouponWallet:(wallet) => rendered.push(wallet),
    };
    const pending = runInNewContext(html.slice(start, end) + "readCouponWallet()", context);
    context.profileGeneration = 2;
    release(Response.json({ ok:true, wallet:{ customer:"old" } }));
    assert.equal(await pending, null);
    assert.deepEqual(rendered, []);
  });

  it("loads MMD NOW only when opened and does not duplicate an in-flight read", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("async function loadDigitalUpdates()");
    const end = html.indexOf("function renderProfile(", start);
    assert.ok(start > 0 && end > start);
    const calls = [], rendered = [];
    const details = { open:false, addEventListener(_event, listener) { this.listener = listener; } };
    const feed = { textContent:"" };
    await runInNewContext(html.slice(start, end) + `(async () => {
      details.listener.call(details);
      details.open = true;
      details.listener.call(details);
      await loadDigitalUpdates();
      await loadDigitalUpdates();
    })()`, {
      details, feed, document:{ getElementById:(id) => id === "digital-news-disclosure" ? details : feed },
      profileReady:true, digitalUpdatesLoaded:false, digitalUpdatesPending:null,
      digitalUpdatesGeneration:0, digitalHomeReady:Promise.resolve(), digitalPersonalizedFeed:[],
      async memberApiFetch(url) { calls.push(url); return Response.json({ items:[], unread_count:0 }); },
      renderDigitalNews(...args) { rendered.push(args); },
      Promise, Number,
    });
    assert.deepEqual(calls, ["/api/v1/member/updates/list?limit=10"]);
    assert.equal(rendered.length, 1);
  });

  it("keeps MMD NOW failures visible and retries only after another open", async () => {
    const html = await (await shell("/member/liff?intent=status")).text();
    const start = html.indexOf("async function loadDigitalUpdates()");
    const end = html.indexOf("function renderProfile(", start);
    const details = { open:false, addEventListener(_event, listener) { this.listener = listener; } };
    const feed = { textContent:"" };
    let attempts = 0;
    const rendered = [];
    await runInNewContext(html.slice(start, end) + `(async () => {
      details.open = true;
      details.listener.call(details);
      await loadDigitalUpdates();
      if (!feed.textContent.includes("ยังโหลดอัปเดตไม่ได้")) throw new Error("missing_retry_message");
      details.open = false;
      details.listener.call(details);
      details.open = true;
      details.listener.call(details);
      await loadDigitalUpdates();
    })()`, {
      details, feed, document:{ getElementById:(id) => id === "digital-news-disclosure" ? details : feed },
      profileReady:true, digitalUpdatesLoaded:false, digitalUpdatesPending:null,
      digitalUpdatesGeneration:0, digitalHomeReady:Promise.resolve(), digitalPersonalizedFeed:[],
      async memberApiFetch() { attempts++; return attempts === 1 ? Response.json({}, { status:503 }) : Response.json({ items:[] }); },
      renderDigitalNews(...args) { rendered.push(args); },
      Promise, Number,
    });
    assert.equal(attempts, 2);
    assert.equal(rendered.length, 1);
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
    assert.match(html, /data-view="history" aria-current="false"><i><span class="customer-icon" data-mmd-icon="icon-history"/);
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
    assert.match(html, /memberApiFetch\(CONFIG\.historyEndpoint/);
    assert.match(html, /memberApiFetch\(CONFIG\.historyRecoveryEndpoint/);
    assert.match(html, /credentials:"same-origin"/);
    assert.match(html, /async function hydrateMemberHome\(view = initialView\)/);
    assert.match(html, /coupons: readCouponWallet/);
    assert.match(html, /credits: readCreditWallet/);
    assert.match(html, /history: readCanonicalHistory/);
    assert.match(html, /"my-requests": readCustomerRequests/);
    assert.match(html, /async function readProfile\(\{ hydrate = true, silent = false \} = \{\}\)/);
    assert.match(html, /if \(hydrate\) await hydrateMemberHome\(\)/);
    assert.doesNotMatch(html, /await readCouponWallet\(\);\s*await readCreditWallet\(\);/);
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

  it("renders MMD TODAY and MMD NOW while keeping personalization backend-bounded", async () => {
    const response = await shell("/member/liff?intent=status&view=home&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<p class="digital-eyebrow">MMD TODAY<\/p>/);
    assert.match(html, /<details class="digital-news-disclosure" id="digital-news-disclosure">/);
    assert.match(html, /<summary class="digital-news-summary">/);
    assert.match(html, /data-view="home" data-pm-dock/);
    assert.doesNotMatch(html, /href="\/member\/kenji-ai-20"/);
    assert.match(html, /let digitalPersonalizedFeed = \[\]/);
    assert.match(html, /homeFeed\.authority === "member_app_dashboard_v1"/);
    assert.match(html, /homeFeed\.state === "resolved"/);
    assert.match(html, /Array\.isArray\(homeFeed\.items\)/);
    assert.match(html, /if \(personalized\) return "FOR YOU"/);
    assert.match(html, /return "MMD UPDATE"/);
    assert.match(html, /return "EDITORIAL"/);
    assert.match(html, /rank: digitalFeedCategory\(item, false\) === "EDITORIAL" \? 1 : 0/);
    assert.match(html, /\.sort\(\(a, b\) => a\.rank - b\.rank \|\| a\.index - b\.index\)/);
    assert.match(html, /const allowedViews = new Set\(\["history","package","care","jobs","points","credits","coupons"\]\)/);
    assert.match(html, /if \(this\.open\) void loadDigitalUpdates\(\)/);
    assert.match(html, /renderDigitalNews\(digitalPersonalizedFeed, items,/);
    assert.match(html, /memberApiFetch\("\/api\/v1\/member\/updates\/list\?limit=10"/);
    assert.match(html, /data-feed-view/);
    assert.doesNotMatch(html, /internal_note|provider_transaction_id|slip_url/);

    const todayIndex = html.indexOf("MMD TODAY");
    const missionIndex = html.indexOf("MMD MISSION", todayIndex);
    const rotationIndex = html.indexOf("MMD NOW", todayIndex);
    const quickIndex = html.indexOf("QUICK ACCESS", rotationIndex);
    const personalMainIndex = html.indexOf('id="personal-main"');
    assert.ok(todayIndex >= 0 && rotationIndex > todayIndex && missionIndex > rotationIndex && quickIndex > missionIndex && personalMainIndex > todayIndex && personalMainIndex < missionIndex);
  });

  it("orders MMD NOW updates as MMD UPDATE before EDITORIAL, keeping API order within each group", async () => {
    const response = await shell("/member/liff?intent=status&view=home&lang=th");
    const html = await response.text();
    const start = html.indexOf("function digitalFeedCategory(");
    const end = html.indexOf("function renderDigitalNews(");
    assert.ok(start >= 0 && end > start, "feed helper functions must exist in the shell");
    const { orderDigitalUpdates } = runInNewContext(
      html.slice(start, end) + "\n({ orderDigitalUpdates });",
    );

    const items = [
      { id: "e1", category: "TMIB" },
      { id: "u1", category: "promotion" },
      { id: "e2", tag: "City Guide" },
      { id: "u2" },
      { id: "e3", category: "Academy" },
      { id: "u3", category: "event" },
    ];
    const ordered = [...orderDigitalUpdates(items)].map((item) => item.id);
    assert.deepEqual(ordered, ["u1", "u2", "u3", "e1", "e2", "e3"]);
    assert.deepEqual(items.map((item) => item.id), ["e1", "u1", "e2", "u2", "e3", "u3"], "input must not be mutated");
    assert.deepEqual([...orderDigitalUpdates(null)], []);
    assert.deepEqual([...orderDigitalUpdates([])], []);
  });

  it("session-bound reads run one at a time so a rotated cookie is never reused in parallel", async () => {
    const response = await shell("/member/liff?intent=status");
    const html = await response.text();
    const start = html.indexOf("function memberApiFetch(url, init = {})");
    const end = html.indexOf("async function readOwnHistoryPreview(", start);
    assert.ok(start >= 0 && end > start, "memberApiFetch must exist in the shell");
    let active = 0;
    let maxActive = 0;
    const order = [];
    const fakeFetch = async (url) => {
      active += 1; maxActive = Math.max(maxActive, active); order.push(url);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (url === "fail") { active -= 1; throw new Error("network"); }
      active -= 1;
      return url;
    };
    const { memberApiFetch } = runInNewContext("let memberApiChain = Promise.resolve();\n" + html.slice(start, end) + "\n({ memberApiFetch });", { fetch: fakeFetch, setTimeout, clearTimeout, AbortController, Response, Uint8Array });
    const results = await Promise.allSettled([memberApiFetch("a"), memberApiFetch("fail"), memberApiFetch("c")]);
    assert.equal(maxActive, 1);
    assert.deepEqual(order, ["a", "fail", "c"]);
    assert.equal(results[2].status, "fulfilled", "a failed read must not block later reads");
  });

  it("keeps MMD MISSION payment-gated, lifecycle-exact, and view-only", async () => {
    const response = await shell("/member/liff?intent=status&view=home&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="digital-mission" class="digital-mission"[^>]*hidden/);
    assert.match(html, /<small>CURRENT JOB<\/small>MMD MISSION/);
    assert.match(html, /const endpoint = "\/api\/member\/app\/session\/current"/);
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
    assert.match(html, /html,body,#root\{margin:0;padding:0;width:100%;min-width:0;min-height:100%\}/);
    assert.match(html, /html,body\{overflow-x:clip\}/);
    assert.match(html, /body,#root\{min-height:100vh;min-height:100dvh;background:#090909\}/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\)\{[^}]*--digital-gutter:16px[^}]*--digital-reading-max:760px[^}]*--digital-shell-max:792px[^}]*min-height:100dvh[^}]*width:100%[^}]*max-width:100%[^}]*overflow-x:clip/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) main\{[^}]*width:100%[^}]*max-width:none[^}]*min-width:0[^}]*min-height:100dvh/);
    assert.match(html, /padding:calc\(var\(--digital-gutter\) \+ env\(safe-area-inset-top\)\) 0 calc\(90px \+ env\(safe-area-inset-bottom\)\)/);
    assert.match(html, /padding-left:max\(var\(--digital-gutter\),env\(safe-area-inset-left\)\)/);
    assert.match(html, /padding-right:max\(var\(--digital-gutter\),env\(safe-area-inset-right\)\)/);
    assert.match(html, /\.digital-dock\{[^}]*left:0;right:0;width:100%;max-width:none;min-width:0[^}]*transform:none/);
    assert.match(html, /\.digital-dock\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[^}]*max\(16px,env\(safe-area-inset-right\)\)[^}]*env\(safe-area-inset-bottom\)[^}]*max\(16px,env\(safe-area-inset-left\)\)/);
    assert.match(html, /@media\(max-width:699px\)\{body\.app-entered:not\(\.signup-mode\),body\.app-entered:not\(\.signup-mode\) main\{width:100%;max-width:100%;min-height:100dvh\}/);
    assert.match(html, /@media\(min-width:700px\)\{body\.app-entered:not\(\.signup-mode\) #app-status,body\.app-entered:not\(\.signup-mode\) #actions,body\.app-entered:not\(\.signup-mode\) #profile,body\.app-entered:not\(\.signup-mode\) #status\{width:min\(100%,var\(--digital-shell-max\)\);margin-left:auto;margin-right:auto\}/);

    // Membership snapshot dimensions remain byte-for-byte locked while only the shell viewport changes.
    assert.match(html, /\.digital-snapshot\{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;margin-top:14px;padding:12px;border:1px solid var\(--digital-line\);border-radius:var\(--digital-radius\);background:var\(--digital-surface\)\}/);
    assert.match(html, /class="digital-snapshot-member"/);
    assert.match(html, /class="digital-snapshot-points"[^>]*><span class="digital-snapshot-label">Points<\/span><strong id="profile-points"/);
    assert.match(html, /id="profile-points-note" class="digital-points-note">กำลังตรวจสอบยอด/);
    assert.match(html, /setDigitalPointsDisplay\(dashboard\.points\?\.confirmedBalance, true\)/);
    assert.match(html, /setDigitalPointsDisplay\(points\.active_points, points\.status === "verified"\)/);
    assert.match(html, /body\.app-entered:not\(\.signup-mode\) #status\{display:none!important;margin:0\}/);

    // Width contracts mirror the requested inspection breakpoints, including simulated iPhone side insets.
    const cases = [
      { width: 360, left: 0, right: 0, expectedContent: 328 },
      { width: 390, left: 0, right: 0, expectedContent: 358 },
      { width: 430, left: 0, right: 0, expectedContent: 398 },
      { width: 390, left: 20, right: 20, expectedContent: 350 },
      { width: 1280, left: 0, right: 0, expectedContent: 760 },
    ];
    for (const item of cases) {
      const shellWidth = item.width >= 700 ? Math.min(item.width, 792) : item.width;
      const contentWidth = shellWidth - Math.max(16, item.left) - Math.max(16, item.right);
      assert.equal(contentWidth, item.expectedContent, `viewport contract failed at ${item.width}px`);
      assert.ok(contentWidth <= item.width, `horizontal overflow contract failed at ${item.width}px`);
    }

    assert.doesNotMatch(html, /\.digital-dock\{[^}]*width:100vw/);
    assert.doesNotMatch(html, /body\.app-entered:not\(\.signup-mode\),body\.app-entered:not\(\.signup-mode\) main\{width:100vw/);
    assert.doesNotMatch(html, /data-design-source|lovable|DESIGN PREVIEW|\bDEMO\b|DEMO DATA|SAMPLE DATA|SOURCE LABEL/i);
    assert.doesNotMatch(html, /LIFF HOME|Member LIFF|>LIFF</i);
    assert.match(html, /id="customer-brand-v6"[^>]*data-audience="unresolved"/);
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
    assert.match(html, /credits: readCreditWallet/);
    assert.match(html, /if \(!profileReady \|\| !read\) return/);
    assert.doesNotMatch(html, /await readCouponWallet\(\);\s*await readCreditWallet\(\);/);
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

describe("signup intent shell entry", () => {
  it("loads the public package catalog and enters without the welcome ENTER tap", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), { LIFF_ID: "2010862595-yT4DCEMc" });
    const html = await response.text();
    assert.match(html, /if \(CONFIG\.intent === "signup"\) \{\s*\/\/ The package catalog is public/);
    assert.match(html, /void readSignupCatalog\(\);\s*void enterSignupDirect\(\);/);
    assert.match(html, /signupCatalogState === "loading" \|\| signupCatalogState === "loaded"/);
  });
});

describe("signup package card art", () => {
  it("maps each public package to its card image and hides it if it fails to load", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), { LIFF_ID: "2010862595-yT4DCEMc" });
    const html = await response.text();
    assert.ok(html.includes("Public%20Member.webp"));
    assert.match(html, /mmd_member: "https:\/\/cdn\.prod\.website-files\.com\//);
    assert.match(html, /art\.addEventListener\("error", \(\) => art\.remove\(\)\)/);
  });
});

describe("signup intent skips the MY MMD welcome screen", () => {
  it("renders the signup body already entered while other intents keep the welcome screen", async () => {
    const env = { LIFF_ID: "2010862595-yT4DCEMc" };
    const signupHtml = await (await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), env)).text();
    const statusHtml = await (await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status"), env)).text();
    assert.match(signupHtml, /<body class="signup-mode app-entered /);
    assert.doesNotMatch(statusHtml, /<body class="[^"]*app-entered/);
  });
});

describe("signup intent script ordering", () => {
  it("declares signup state before the early catalog call (no temporal dead zone)", async () => {
    const html = await (await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), { LIFF_ID: "2010862595-yT4DCEMc" })).text();
    const decl = html.indexOf('let signupCatalogState = "idle"');
    const art = html.indexOf("const SIGNUP_CARD_IMAGES");
    const call = html.indexOf("void readSignupCatalog();\n    void enterSignupDirect();");
    assert.ok(decl > 0 && art > 0 && call > 0);
    assert.ok(decl < call && art < call);
  });
});

describe("signup crest logo", () => {
  it("uses the new mark with a text fallback", async () => {
    const html = await (await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), { LIFF_ID: "2010862595-yT4DCEMc" })).text();
    assert.ok(html.includes("05-tiny-mark-512px.webp"));
    assert.match(html, /class="signup-crest-logo"[^>]*>/);
    assert.doesNotMatch(html, /signup-crest-logo[^>]*onerror=/);
    assert.ok(html.includes("crestLogo.addEventListener(\"error\""));
  });
});

describe("signup offers the basic Member package only", () => {
  it("filters the public catalog to mmd_member and requires exactly one package", async () => {
    const html = await (await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), { LIFF_ID: "2010862595-yT4DCEMc" })).text();
    assert.ok(html.includes('item?.package_code === "mmd_member"'));
    assert.ok(html.includes("packages.length !== 1"));
    assert.ok(!html.includes("Elite%20Card.webp") && !html.includes("Red%20Card.webp"));
  });

  it("hands Standard and Premium interest to the existing MMD chat without looping or claiming submission", async () => {
    const html = await (await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=signup&view=signup"), { LIFF_ID: "2010862595-yT4DCEMc" })).text();
    assert.match(html, /Standard \/ Premium \/ Private Access/);
    const card = html.match(/<div class="card signup-private">(.*?)<\/div>/s)[1];
    assert.match(card, /href="https:\/\/lin\.ee\/xRqsALs"/);
    assert.match(card, /ขอคุยกับเปอร์ สนใจ Standard \/ Premium/);
    assert.match(card, /ยังไม่ใช่การสมัคร ชำระเงิน หรือเปิดสิทธิ์/);
    assert.doesNotMatch(card, /miniapp\.line\.me|ส่งเรื่องแล้ว|ได้รับคำขอแล้ว/);
    assert.doesNotMatch(html, /href="\/sigil\/member\/membership/);
  });
});


describe("renewal card in the PACKAGE view", () => {
  it("renders hidden markup, server-driven script and never lets the browser send an amount", async () => {
    const html = await (await shell("/member/liff?intent=renew&view=package")).text();
    assert.match(html, /id="renewal-card"[^>]*hidden/);
    assert.match(html, /\/member\/api\/liff\/renewal\/offer/);
    const purchase = html.slice(html.indexOf("async function purchaseRenewal"), html.indexOf("async function purchaseRenewal") + 1800);
    assert.match(purchase, /body: JSON\.stringify\(\{ package_code: packageCode \}\)/);
    assert.doesNotMatch(purchase, /amount/);
    assert.match(purchase, /verifiedCheckoutUrl\(payload\.customer_payment_url\)/);
    assert.match(purchase, /entitlement_granted === false/);
  });
});

describe("renewal card hidden parts", () => {
  it("price box stays hidden when the offer has no price (no stray THB)", async () => {
    const html = await (await shell("/member/liff?intent=renew&view=package")).text();
    assert.match(html, /\.renewal-price\[hidden\][^{]*\{display:none!important\}/);
  });
});

it('Lovable adapter is inert scoped CSS without external resources or hidden-state overrides', () => {
  assert.doesNotMatch(css, /url\s*\(|@import|<script|fetch\s*\(|localStorage|sessionStorage|\[hidden\]|display\s*:\s*none|visibility\s*:\s*hidden/i);
  for (const rule of css.split('}')) {
    if (!rule.includes('{')) continue;
    const selector = rule.slice(0, rule.lastIndexOf('{'));
    assert.match(selector, /body\.app-entered:not\(\.signup-mode\)/);
  }
});

it('shows only verified nonnegative Points and keeps unknown balances under review', async () => {
  const html = await (await shell('/member/liff?intent=status')).text();
  const start = html.indexOf('function setDigitalPointsDisplay(');
  const end = html.indexOf('async function hydrateDigitalHome(', start);
  assert.ok(start > 0 && end > start);
  const value = { textContent: '' };
  const note = { textContent: '' };
  const document = { getElementById: (id) => id === 'profile-points' ? value : id === 'profile-points-note' ? note : null };
  for (const [balance, verified, expected, expectedNote] of [
    [0, true, '0', 'ยอดที่ยืนยันจากระบบ'],
    [12, true, '12', 'ยอดที่ยืนยันจากระบบ'],
    [null, true, '—', 'กำลังตรวจสอบยอด'],
    [-1, true, '—', 'กำลังตรวจสอบยอด'],
    [12, false, '—', 'กำลังตรวจสอบยอด'],
  ]) {
    await runInNewContext(html.slice(start, end) + `setDigitalPointsDisplay(${JSON.stringify(balance)}, ${verified});`, { document, Intl, Number, locale: 'th' });
    assert.equal(value.textContent, expected);
    assert.equal(note.textContent, expectedNote);
  }
});

it('desktop dock centers controls while retaining full-width existing chrome', () => {
  assert.match(css, /--digital-reading-max: 520px/);
  assert.match(css, /@media \(min-width: 700px\)/);
  assert.match(css, /padding-left: max\(16px, env\(safe-area-inset-left\), calc\(\(100% - 520px\) \/ 2\)\)/);
  assert.match(css, /padding-right: max\(16px, env\(safe-area-inset-right\), calc\(\(100% - 520px\) \/ 2\)\)/);
});

it('shell embeds design as style only and retains no-store and same-origin API configuration', async () => {
  const response = handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?world=private'), {});
  const html = await response.text();
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(html.slice(html.indexOf('<style>'), html.indexOf('</style>')).includes(css));
  assert.match(html, /"world":"public"/);
  assert.match(html, /"startEndpoint":"\/member\/api\/liff\/start"/);
  assert.doesNotMatch(html, /https:\/\/[^"\s]*lovable/);
});


// Customer Graphics V4: runtime tests live in this CI entrypoint.

import { CUSTOMER_GRAPHICS } from "../src/liff-customer-graphics.js";
import { createCustomerProgress, renderCustomerProgress } from "../src/liff-customer-progress.js";
import { createHash } from "node:crypto";

test("serialized browser startup supplies keepNames helper before progress initialization", async () => {
  const html = await (await shell('/member/liff?intent=status')).text();
  const start = html.indexOf('(() => {', html.indexOf('<script nonce='));
  const end = html.indexOf('  const CANONICAL_POINTS_PATH', start);
  const prefix = html.slice(start, end);
  assert.ok(prefix.indexOf('const __name =') < prefix.indexOf('const customerLoading ='));
  // Reproduce keepNames instrumentation without providing the Worker's helper
  // as a VM global. Production bundling also inserts calls in nested callbacks.
  const instrumented = prefix.replace('let generation =', '__name(() => {}, "publish"); let generation =');
  assert.notEqual(instrumented, prefix);
  const calls = [];
  const context = {window:{fetch:async (url, init) => {calls.push({url,method:init.method});return Response.json({ok:false},{status:401});}},
    document:{getElementById:()=>null},AbortController,Response,Uint8Array,setTimeout,clearTimeout};
  const probe = '\nreturn {fetch, waitFor:customerLoading.waitFor}; })()';
  assert.throws(()=>runInNewContext(instrumented.replace(/  const __name =[^\n]+\n/, '') + probe,context), /__name is not defined/);
  const browser = runInNewContext(instrumented + probe, context);
  const response = await browser.fetch('/member/api/liff/profile', {method:'GET'});
  assert.equal(response.status,401);
  assert.deepEqual(calls,[{url:'/member/api/liff/profile',method:'GET'}]);
  assert.equal(await browser.waitFor(async()=> 'sdk-ready'),'sdk-ready');
  assert.equal(calls.length,1); // no session creation, login or business write
});

test("customer SVG pack is decorative, hash-pinned, bounded and all installed assets are used", async () => {
  const html = await handleLiffMemberShell(new Request("https://www.mmdbkk.com/member/liff?intent=status"), {}).text();
  let total = 0;
  for (const [name, asset] of Object.entries(CUSTOMER_GRAPHICS)) {
    const bytes = Buffer.byteLength(asset.svg); total += bytes;
    assert.equal(bytes, asset.bytes); assert.ok(bytes <= 2048);
    assert.equal(createHash('sha256').update(asset.svg).digest('hex'), asset.sha256);
    assert.doesNotMatch(asset.svg, /<(?:script|text|image|foreignObject|filter)\b|\bon\w+\s*=|(?:href|src)\s*=/i);
    assert.match(asset.svg, /currentColor/);
    assert.ok(html.includes('data-mmd-graphic="' + name + '" aria-hidden="true"'));
  }
  assert.ok(total <= 24576);
  assert.match(html, /customerLoading.fetch/);
  assert.match(html, /0% · กำลังรอข้อมูล/);
  assert.doesNotMatch(html, /setInterval\([^)]*(?:progress|percent)/i);
});

const deferredProgress = () => { let resolve, reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
test("request progress counts overlapping tasks and waits for the streamed body", async () => {
  const one=deferredProgress(), two=deferredProgress(), states=[];
  let count=0, stream;
  const p=createCustomerProgress({render:(panel,s)=>states.push({panel,...s}), request:()=>++count===1?one.promise:two.promise});
  const a=p.fetch('/api/member/app/dashboard'), b=p.fetch('/api/member/app/dashboard');
  assert.equal(states.at(-1).pending,2);
  one.resolve(new Response(new ReadableStream({start(c){stream=c;}})));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(states.at(-1).pending,2);
  assert.equal(states.at(-1).confirmedPercent,0); // the second request has no response yet
  stream.enqueue(new TextEncoder().encode('{}'));stream.close();await a;
  assert.equal(states.at(-1).pending,1);
  two.resolve(new Response('{}'));await b;assert.equal(states.at(-1).pending,0);
});
test("reset ignores old account progress completion without cancelling or replaying a mutation",async()=>{
 const old=deferredProgress(), fresh=deferredProgress(), states=[];let calls=0;
 const p=createCustomerProgress({render:(panel,s)=>states.push(s),request:()=>++calls===1?old.promise:fresh.promise});
 const a=p.fetch('/member/api/customer/requests',{method:'POST'});p.reset();
 const b=p.fetch('/member/api/customer/requests');old.resolve(new Response('{}'));await assert.rejects(a,/customer_response_stale/);
 assert.equal(states.at(-1).pending,1);assert.equal(calls,2);
 fresh.resolve(new Response('{}'));await b;assert.equal(states.at(-1).pending,0);
});
test("HTTP and network failure stop loading without automatic mutation retries",async()=>{
 for(const fail of ['http','network']) {let calls=0;const states=[];
 const p=createCustomerProgress({render:(panel,s)=>states.push(s),request:async()=>{calls++;if(fail==='network')throw Error('offline');return new Response('{}',{status:503});}});
 await p.fetch('/member/api/customer/requests',{method:'POST'}).catch(()=>{});
 assert.equal(calls,1);assert.equal(states.at(-1).pending,0);assert.equal(states.at(-1).error,true);
 }
});
test("timeout aborts the actual request and removes its progress task",async()=>{
 const states=[];let aborted=false;
 const p=createCustomerProgress({timeoutMs:5,render:(panel,s)=>states.push(s),request:(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('abort'));}))});
 await assert.rejects(p.fetch('/api/member/app/dashboard'));assert.equal(aborted,true);assert.equal(states.at(-1).pending,0);
});
test("no-booking artwork is revealed only by a successful 204, never initial/loading/error",async()=>{
 const html=await handleLiffMemberShell(new Request('https://www.mmdbkk.com/member/liff'),{}).text();
 assert.match(html, /id="customer-no-booking"[^>]* hidden>/);
 const start=html.indexOf('async function hydrateDigitalMission()');const stop=html.indexOf('function digitalFeedCategory',start);
 const source=html.slice(start,stop);
 assert.match(source,/generation !== hydrateDigitalMission.generation/);
 assert.match(source,/response.status === 204/);
 assert.match(source,/if \(empty\) empty.hidden = false/);
 assert.match(html,/\["digital-mission", "customer-no-booking", "digital-needs", "renewal-card"\]/);
});

test("confirmed loading milestone advances only after response headers, not elapsed time",async()=>{
 const states=[];let stream;const p=createCustomerProgress({render:(panel,s)=>states.push(s),request:async()=>new Response(new ReadableStream({start(c){stream=c;}}))});
 const pending=p.fetch('/api/member/app/dashboard');
 assert.equal(states.at(-1).confirmedPercent,0);await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(states.at(-1).confirmedPercent,50);assert.ok(states.every(s=>s.confirmedPercent<100));
 stream.close();await pending;assert.equal(states.at(-1).pending,0);
});

test("LIFF SDK loading times out without accepting a late identity result or replaying the SDK call",async()=>{
 const gate=deferredProgress(), states=[];let calls=0;
 const p=createCustomerProgress({timeoutMs:5,render:(panel,s)=>states.push(s),request:()=>{throw Error('unexpected fetch');}});
 await assert.rejects(p.waitFor(()=>{calls++;return gate.promise;}),/customer_step_timeout/);
 assert.equal(states.at(-1).error,true);assert.equal(states.at(-1).pending,0);gate.resolve(true);
 assert.equal(calls,1);
});

test("reset clears completed error panels and coupon wallet progress stays in the coupon panel",async()=>{
 const states=[];const p=createCustomerProgress({render:(panel,s)=>states.push({panel,...s}),request:async()=>new Response('{}',{status:503})});
 await p.fetch('/member/api/liff/care-back/wallet');assert.equal(states.at(-1).panel,'coupons');assert.equal(states.at(-1).error,true);
 p.reset();assert.equal(states.at(-1).error,false);assert.equal(states.at(-1).pending,0);
});

test("member profile reset preserves concurrent welcome context and LIFF preflight",async()=>{
 const welcome=deferredProgress(), sdk=deferredProgress(), profileRead=deferredProgress(), states=[];
 const p=createCustomerProgress({render:(panel,s)=>states.push(s),request:url=>url.endsWith('welcome-context')?welcome.promise:profileRead.promise});
 const a=p.fetch('/member/api/liff/welcome-context');const sdkRead=p.waitFor(()=>sdk.promise);
 const oldMember=p.fetch('/member/api/liff/profile');p.reset({memberOnly:true});
 welcome.resolve(new Response('{}'));assert.equal((await a).status,200);
 sdk.resolve('sdk-ready');assert.equal(await sdkRead,'sdk-ready');
 profileRead.resolve(new Response('{}'));await assert.rejects(oldMember,/customer_response_stale/);
 assert.equal(states.at(-1).pending,0);
 const html=await handleLiffMemberShell(new Request('https://www.mmdbkk.com/member/liff'),{}).text();
 assert.match(html,/customerLoading.reset\(\{ memberOnly:true \}\)/);
});

test("entry progress is outside the hidden profile and moves with the visible profile state",async()=>{
 const html=await handleLiffMemberShell(new Request('https://www.mmdbkk.com/member/liff'),{}).text();
 assert.ok(html.indexOf('id="customer-entry-progress"')<html.indexOf('id="profile"'));
 const span={},progress={},button={addEventListener(){}};let hidden=true;
 const node={querySelector:s=>s==='span'?span:s==='progress'?progress:button};
 const makeHost=()=>({setAttribute(){},prepend(n){n.parentElement=this;}});
 const entry=makeHost(),home=makeHost();
 const doc={getElementById:id=>id==='profile'?{classList:{contains:()=>hidden}}:id==='customer-entry-progress'?entry:id==='home'?home:node,createElement:()=>node};
 runInNewContext('('+renderCustomerProgress.toString()+') ("home", {pending:1,confirmedPercent:0})',{document:doc});assert.equal(node.parentElement,entry);
 hidden=false;runInNewContext('('+renderCustomerProgress.toString()+') ("home", {pending:1,confirmedPercent:50})',{document:doc});assert.equal(node.parentElement,home);assert.match(span.textContent,/50%/);
});

test("overlapping success cannot erase another task failure; only its subsequent retry clears it",async()=>{
 const slow=deferredProgress(), states=[];let calls=0;
 const p=createCustomerProgress({render:(panel,s)=>states.push(s),request:async()=>++calls===1?new Response('{}',{status:503}):calls===2?slow.promise:new Response('{}')});
 const failed=p.fetch('/api/member/app/dashboard'), other=p.fetch('/api/member/app/membership');await failed;
 assert.equal(states.at(-1).error,true);slow.resolve(new Response('{}'));await other;
 assert.equal(states.at(-1).error,true);assert.equal(states.at(-1).pending,0);
 await p.fetch('/api/member/app/dashboard');assert.equal(states.at(-1).error,false);
});
test("boot overlay follows confirmed loading state and retains failure recovery",()=>{
 const boot={dataset:{confirmedPercent:'0'}},bar={},retry={dataset:{},addEventListener(){}};
 const document={getElementById:id=>id==='customer-boot-progress'?boot:id==='hype-progress'?bar:id==='customer-boot-retry'?retry:null};
 const run=state=>runInNewContext('('+renderCustomerProgress.toString()+') ("home", '+JSON.stringify(state)+')',{document});
 run({overallPending:1,overallPercent:50,overallError:false});assert.match(boot.textContent,/50%/);assert.equal(retry.hidden,true);
 run({overallPending:0,overallPercent:0,overallError:false});assert.match(boot.textContent,/50%/);assert.doesNotMatch(boot.textContent,/100%/);
 run({overallPending:0,overallPercent:0,overallError:true});assert.equal(retry.hidden,false);assert.equal(bar.hidden,true);
 run({overallPending:0,overallPercent:0,overallError:false,reset:true});assert.match(boot.textContent,/0%/);
});

test("signed-out profile miss cannot invalidate concurrent public signup catalog",async()=>{
 const catalog=deferredProgress(),profileRead=deferredProgress();
 const p=createCustomerProgress({render(){},request:url=>url.endsWith('/catalog')?catalog.promise:profileRead.promise});
 const a=p.fetch('/member/api/liff/public-membership/catalog');const b=p.fetch('/member/api/liff/profile');
 profileRead.resolve(new Response('{}',{status:401}));await b;p.reset({memberOnly:true});
 catalog.resolve(new Response('{"ok":true,"items":[]}'));assert.equal((await a).status,200);
});

test("logout request survives member-panel cleanup from an older profile read",async()=>{
 const logout=deferredProgress();const p=createCustomerProgress({render(){},request:()=>logout.promise});
 p.reset();const request=p.fetch('/member/api/liff/logout',{method:'POST'});p.reset({memberOnly:true});
 logout.resolve(new Response('{}'));assert.equal((await request).status,200);
});

test("native evidence FormData and mutations receive a longer bounded deadline without retries",async()=>{
 const delays=[], bodies=[];
 const create=runInNewContext('('+createCustomerProgress.toString()+')',{AbortController,Response,Uint8Array,setTimeout:(_fn,ms)=>{delays.push(ms);return delays.length;},clearTimeout(){}});
 const p=create({render(){},request:async(_url,init)=>{bodies.push(init.body);return new Response('{}');}});
 const form=new FormData();form.append('file',new Blob(['fixture'],{type:'image/png'}),'fixture.png');
 await p.fetch('/member/api/liff/customer-request-evidence',{method:'POST',body:form});
 await p.fetch('/member/api/liff/renewal/purchase',{method:'POST',body:'fixture-only'});
 await p.fetch('/api/member/app/dashboard');
 assert.deepEqual(delays,[120000,120000,15000]);assert.equal(bodies[0],form);assert.equal(bodies.length,3);
});

// V6 display-only additions. The Worker does not yet project a separate brand audience.
import { CUSTOMER_ICONS_V6 } from '../src/liff-customer-graphics.js';
import { resolveVerifiedCustomerBrand, createCustomerBrand, renderCustomerBrand, V6_BRAND_ASSETS, CUSTOMER_V6_CSS } from '../src/liff-customer-brand-v6.js';

test('V6 preserves original logo/font bytes and does not distort either aspect ratio',()=>{
 const expected={public:'4084a3ab23756f6090a3a4012f594b8f61ebb64a95ea9759225c01a0fd61985c',private:'ff87e2467cd1c9125bbe9b1e674582f39a5d66c3a1059298ee983dd856f96da7'};
 for(const [key,value] of Object.entries(V6_BRAND_ASSETS))assert.equal(createHash('sha256').update(Buffer.from(value.split(',')[1],'base64')).digest('hex'),expected[key]);
 const font=CUSTOMER_V6_CSS.match(/data:font\/woff2;base64,([^\)]+)/)[1];assert.equal(createHash('sha256').update(Buffer.from(font,'base64')).digest('hex'),'caf74c95ba957707253e40747d8364c937970df80551ab0766afc073d1fd90d6');
 assert.match(renderCustomerBrand(),/width="256" height="172"/);assert.match(CUSTOMER_V6_CSS,/object-fit:contain;height:auto/);assert.match(CUSTOMER_V6_CSS,/filter:none;transform:none/);
});

test('V6 installs only eight new bounded decorative icons while keeping existing art',async()=>{
 const html=await(await shell('/member/liff?intent=status')).text();let bytes=0;
 assert.equal(Object.keys(CUSTOMER_ICONS_V6).length,8);
 for(const [name,asset] of Object.entries(CUSTOMER_ICONS_V6)){assert.equal(Buffer.byteLength(asset.svg),asset.bytes);assert.equal(createHash('sha256').update(asset.svg).digest('hex'),asset.sha256);assert.ok(asset.bytes<=2048);bytes+=asset.bytes;assert.doesNotMatch(asset.svg,/<(?:script|text|image|foreignObject|filter)\b|\bon\w+\s*=|(?:href|src)\s*=/i);assert.match(asset.svg,/currentColor/);assert.ok(html.includes('data-mmd-icon="'+name+'"'));}
 assert.ok(bytes+Object.values(CUSTOMER_GRAPHICS).reduce((n,a)=>n+a.bytes,0)<=24576);
 assert.match(html,/data-mmd-liff-compact="v4" data-mmd-graphics="v6" data-brand-audience="unresolved"/);
});

function brandFixture(){
 const errors=[];const panels=['neutral','public','private'].map(name=>({hidden:name!=='neutral',getAttribute:()=>name,querySelector:()=>name==='neutral'?null:{addEventListener:(_event,fn)=>errors.push(fn)}}));
 const root={dataset:{},ownerDocument:{body:{dataset:{}}},querySelectorAll:()=>panels};return {panels,root,errors,brand:createCustomerBrand(root)};
}
test('V6 unresolved -> public -> reset -> private -> error never leaves another audience logo visible',()=>{
 const {brand,panels,errors}=brandFixture();const visible=()=>panels.map((p,i)=>p.hidden?null:['neutral','public','private'][i]).filter(Boolean);
 brand.reset();assert.deepEqual(visible(),['neutral']);brand.render('public');assert.deepEqual(visible(),['public']);brand.reset();assert.deepEqual(visible(),['neutral']);brand.render('private');assert.deepEqual(visible(),['private']);errors[1]();assert.deepEqual(visible(),['neutral']);
 for(const hint of ['svip','premium','standard','existing','?world=private',{},null]){brand.render(hint);assert.deepEqual(visible(),['neutral']);}
});

test('V6 production does not infer brand identity from tier/world/query and requires Worker brand authority',async()=>{
 const html=await(await shell('/member/liff?intent=status&world=private&audience=private')).text();
 assert.match(html,/data-brand-audience="unresolved"/);assert.match(html,/function applyWorldTheme\([^]*?resetCustomerBrand\(\)/);assert.match(html,/function hideMemberProfile\(\) \{\s+personalMainUI\.reset\(\);\s+resetCustomerBrand\(\)/);
 assert.match(html,/customerBrand\.render\(resolveVerifiedCustomerBrand\(data, brandAuthority\)\)/);assert.doesNotMatch(createCustomerBrand.toString(),/tier|membership|location|fetch|cookie|localStorage|sessionStorage/);
 const markup=renderCustomerBrand();assert.match(markup,/data-brand-panel="public" hidden/);assert.match(markup,/data-brand-panel="private" hidden/);assert.match(markup,/Discreet by desire,<br>Elegance by choice\./);
});

test('V6 font CSP and progressive UI remain scoped, accessible and reduced-motion safe',async()=>{
 const response=handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?intent=status'),{});
 assert.match(response.headers.get('content-security-policy'),/font-src 'self' data:/);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.match(CUSTOMER_V6_CSS,/\[data-brand-audience="public"\]/);assert.match(CUSTOMER_V6_CSS,/font-family:MmdV6Thai[^}]+!important/);assert.match(CUSTOMER_V6_CSS,/\.signup-mode/);assert.match(CUSTOMER_V6_CSS,/prefers-reduced-motion/);assert.doesNotMatch(CUSTOMER_V6_CSS,/\.customer-graphic[^}]*opacity:(?:\.5|1)/);
});


test('V6 hidden logo error cannot erase the active audience and failed assets stay neutral on re-selection', () => {
  const { brand, root, panels, errors } = brandFixture();
  brand.render('public');
  brand.render('private');
  errors[0](); // Late Public image error after the account/audience switched.
  assert.equal(root.dataset.audience, 'private');
  assert.equal(root.ownerDocument.body.dataset.brandAudience, 'private');
  assert.equal(panels[2].hidden, false);
  assert.equal(brand.render('public'), 'unresolved');
  assert.equal(root.ownerDocument.body.dataset.brandAudience, 'unresolved');
  brand.render('private');
  errors[1]();
  assert.equal(root.dataset.audience, 'unresolved');
  assert.equal(root.ownerDocument.body.dataset.brandAudience, 'unresolved');
  brand.reset();
  assert.equal(brand.render('private'), 'unresolved');
  assert.deepEqual(panels.map(p => p.hidden), [false, true, true]);
});


test('welcome reads accept the current backend authority for returning copy without granting brand identity', async () => {
  const html = await (await shell('/member/liff?intent=status')).text();
  const resolver = html.slice(html.indexOf('function resolveWelcomeAudience('), html.indexOf('function applyWorldTheme('));
  const reader = html.slice(html.indexOf('async function readWelcomeContext('), html.indexOf('async function preflightWelcomeIdentity('));
  const { brand, root } = brandFixture();
  let audience = 'checking';
  let payload = { ok:true, data:{ audience:'existing', tier:'SVIP' } };
  let authority = 'member_profile_resolver';
  const context = {
    AbortController, CONFIG:{welcomeContextEndpoint:'/member/api/liff/welcome-context'},
    setTimeout:()=>1, clearTimeout:()=>{},
    fetch:async()=>new Response(JSON.stringify(payload), {headers:{'x-mmd-welcome-audience-authority':authority}}),
    applyWorldTheme:(data, _display, source)=>{ brand.reset(); audience = context.resolveWelcomeAudience(data, source); }
  };
  runInNewContext(resolver + reader, context);
  assert.equal(await context.readWelcomeContext(), true);
  assert.equal(audience, 'existing');
  assert.equal(root.dataset.audience, 'unresolved');
  assert.equal(root.ownerDocument.body.dataset.brandAudience, 'unresolved');
  for (const source of ['member_profile_resolver', 'canonical_member_profile', 'canonical_client']) {
    assert.equal(context.resolveWelcomeAudience({audience:'existing'},source),'existing');
    for (const value of ['public','private','new']) assert.equal(context.resolveWelcomeAudience({audience:value},source),'checking');
  }
  authority = 'untrusted';
  assert.equal(await context.readWelcomeContext(), false);
  assert.equal(audience, 'checking');
  assert.equal(root.dataset.audience, 'unresolved');
  assert.equal(context.resolveWelcomeAudience({audience:'new'},'canonical_member_client_absence'),'new');
  payload = {ok:false};
  assert.equal(await context.readWelcomeContext(),false);
});


test('V6 already-failed logo stays neutral even when error preceded initialization', () => {
  const panels = ['neutral','public','private'].map(name => ({hidden:name!=='neutral',getAttribute:()=>name,querySelector:()=>name==='neutral'?null:{complete:true,naturalWidth:name==='public'?0:350,addEventListener(){}}}));
  const root = {dataset:{},ownerDocument:{body:{dataset:{}}},querySelectorAll:()=>panels};
  const brand = createCustomerBrand(root);
  assert.equal(brand.render('public'),'unresolved');
  assert.deepEqual(panels.map(p=>p.hidden),[false,true,true]);
  assert.equal(brand.render('private'),'private');
  assert.equal(root.ownerDocument.body.dataset.brandAudience,'private');
});

test('V6 Public overrides the existing cream foreground used by request and CARE controls', () => {
  const publicRule = CUSTOMER_V6_CSS.split('\n').find(rule=>rule.includes('[data-brand-audience="public"]:not(.signup-mode){'));
  assert.ok(publicRule);
  assert.match(publicRule,/--digital-cream:#171b1d;/);
  assert.match(publicRule,/--digital-surface:#fffefa;/);
});


test('V6 uses SIGIL only with the Worker projection, irrespective of tier hints', () => {
  for (const tier of ['Standard', 'Premium', 'VIP', 'SVIP', 'Black Card']) {
    assert.equal(resolveVerifiedCustomerBrand({tier, brand_audience:'sigil'}, 'canonical_member_account_v1'), 'private');
    assert.equal(resolveVerifiedCustomerBrand({tier}, 'canonical_member_account_v1'), 'unresolved');
    assert.equal(resolveVerifiedCustomerBrand({tier, brand_audience:'sigil'}, 'member_profile_resolver'), 'unresolved');
  }
  for (const data of [null, {}, {brand_audience:'private'}, {brand_audience:'unresolved'}]) {
    assert.equal(resolveVerifiedCustomerBrand(data, 'canonical_member_account_v1'), 'unresolved');
  }
});

test('late welcome preserves a verified brand while startup remains neutral', async () => {
  const html=await(await shell('/member/liff?intent=status')).text();
  const start=html.indexOf('function applyWorldTheme(');
  const end=html.indexOf('  applyWorldTheme();',start);
  let resets=0;
  const element={textContent:'',classList:{toggle(){}}};
  const context={profileReady:true,resetCustomerBrand(){resets++;},detectWorld:()=> 'public',resolveWelcomeAudience:()=> 'existing',
    WELCOME_COPY:{existing:{title:'',subtitle:'',note:'',letter:''}},message:element,introContinue:element,
    document:{body:{dataset:{},classList:{toggle(){}}},querySelector:()=>element,getElementById:()=>element}};
  runInNewContext(html.slice(start,end)+'applyWorldTheme({});',context);
  assert.equal(resets,0);
  context.profileReady=false;
  runInNewContext('applyWorldTheme({});',context);
  assert.equal(resets,1);
});

test('profile reads pass the dedicated Worker brand authority to rendering', async () => {
  const html=await(await shell('/member/liff?intent=status')).text();
  const start=html.indexOf('async function readProfile('),end=html.indexOf('function requestId()',start);
  let received;
  const data={member_id:'recMemberA',brand_audience:'sigil'};
  await runInNewContext(html.slice(start,end)+'readProfile({hydrate:false})',{
    CONFIG:{profileEndpoint:'/member/api/liff/profile'},profileGeneration:0,hideMemberProfile(){},personalMainUI:{load(){},reset(){}},
    memberApiFetch:async()=>Response.json({ok:true,data},{headers:{'x-mmd-brand-authority':'canonical_member_account_v1'}}),
    renderProfile(...args){received=args;},renderCustomerContact(){},readQuickMembershipStatus(){},readOwnHistoryPreview(){},hydrateMemberHome(){},Promise
  });
  assert.equal(received[2],'canonical_member_account_v1');
  assert.equal(resolveVerifiedCustomerBrand(received[0],received[2]),'private');
});

test('assistant dock activates Home before opening and scrolling to Personal Main',async()=>{
 const html=await(await shell('/member/liff')).text();
 const start=html.indexOf('for (const button of document.querySelectorAll("[data-view]"))');
 const end=html.indexOf('\n\n  function show(text)',start);
 let click;const calls=[];
 runInNewContext(html.slice(start,end),{document:{querySelectorAll:()=>[{addEventListener:(_,handler)=>{click=handler;},hasAttribute:()=>true,getAttribute:()=> 'home'}]},showView:(...args)=>calls.push(args),personalMainUI:{open:()=>calls.push('open')}});
 click();assert.deepEqual(calls,[['home',false],'open']);
});


test("approved HYPE loader lands during a wait, resumes, and never creates percentage progress from timers", () => {
 let now=0,nextId=0;const queue=new Map(),percentages=[];
 const setTimeout=(fn,ms)=>{queue.set(++nextId,{at:now+ms,fn});return nextId;};
 const tick=ms=>{const end=now+ms;for(;;){const next=[...queue].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;queue.delete(next[0]);now=next[1].at;next[1].fn();}now=end;};
 const create=runInNewContext('('+createHypeLoaderMotion.toString()+')',{setTimeout,clearTimeout:id=>queue.delete(id)});
 const motion=create({onProgress:value=>percentages.push(value)});
 motion.open();tick(6000);assert.equal(motion.state().phase,'landing');
 tick(900);assert.equal(motion.state().phase,'standing');
 tick(2600);assert.equal(motion.state().phase,'flying');
 assert.deepEqual(percentages,[0]);
 motion.stall();tick(900);motion.progress(50);assert.equal(motion.state().phase,'flying');
 assert.equal(motion.progress(25),false);
 motion.progress(100);assert.equal(queue.size,0);tick(60000);assert.equal(motion.state().phase,'standing');
 motion.close();assert.equal(queue.size,0);assert.equal(motion.state().phase,'idle');
 motion.open();assert.equal(motion.state().percent,0);motion.close();
});

test("approved entry has no demo audience controls and keeps branding on the verified projection", async () => {
 const html=await (await shell('/member/liff?world=private&audience=sigil')).text();
 assert.match(html,/data-brand-audience="unresolved"/);
 assert.match(html,/SĪGIL System/);
 assert.match(APPROVED_ENTRY_CSS,/linear-gradient\(110deg,#a42138/);
 assert.doesNotMatch(html,/preview-mode|hypeLoadingPreview|preview-hype|ขั้นตอนถัดไป \+25%/);
 const loader=html.slice(html.indexOf('<div id="hype-loader"'),html.indexOf('<main>'));
 assert.doesNotMatch(loader,/hype-loader-text|verification-logo|<svg/);
 assert.match(loader,/data-confirmed-percent="0">0%/);
 const script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
 assert.doesNotThrow(()=>new Function(script));
});


test("approved entry artwork follows the chosen world before verification without assigning identity", () => {
 for(const world of ['public','private']) {
  assert.ok(APPROVED_ENTRY_CSS.includes('body:is([data-brand-audience="'+world+'"],[data-brand-audience="unresolved"][data-world="'+world+'"])'));
 }
});
