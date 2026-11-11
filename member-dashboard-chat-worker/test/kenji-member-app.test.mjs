import test from "node:test";
import assert from "node:assert/strict";
import { handleKenjiMemberChat, renderKenjiMemberPage } from "../src/kenji-member-app.js";

test("KENJI page is a compact chat app and not the old AI 2.0 landing dialogue", async () => {
  const response = renderKenjiMemberPage();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, />KENJI</);
  assert.match(html, /\/api\/member\/kenji\/chat/);
  assert.match(html, /มีอะไรให้ผมจัดการครับ/);
  assert.doesNotMatch(html, /KENJI AI 2\.0|YOUR NEXT STEP, QUIETLY HANDLED/);
});

test("member chat BFF resolves verified session truth before calling AI_WORKER", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({ kind: "truth", url: request.url, cookie: request.headers.get("cookie") });
        return Response.json({
          ok: true,
          authority: "my_mmd_entitlement_resolver_v1",
          identity_status: "resolved",
          display_name: "Per Test",
          membership: { level: "private_premium", label: "Premium", lifecycle: "active", expire_at: "2027-09-28T00:00:00Z" },
          points: { status: "verified", active_points: 12 },
          resolver_snapshot: {
            schema_version: "my_mmd_entitlement_resolver_v1",
            evaluated_at: "2026-09-28T13:00:00Z",
            fail_closed: true,
            member_blocked: false,
            capability_state: { active: ["private_premium"], expiring_soon: [], grace: [], inactive: [], recognized: ["private_premium"] },
            access: { public_service_access: true, guest_pass_access: false, red_card_request_lane: false, private_visibility_envelope: "premium", protected_allowlist_required: false, protected_capabilities_active: [], new_model_reveals_allowed: true },
          },
        });
      },
    },
    AI_WORKER: {
      async fetch(request) {
        const body = await request.json();
        calls.push({ kind: "ai", url: request.url, body });
        return Response.json({
          ok: true,
          data: {
            schema_version: "mmd.kenji_member_chat.v1",
            reply: "Per Test · Points ที่ระบบยืนยันตอนนี้ 12 แต้มครับ",
            intent: "points_status",
            action: { label: "เปิด Points", url: "/my-mmd/points" },
            safety: { review_required: false },
          },
        });
      },
    },
  };
  const request = new Request("https://mmdbkk.com/api/member/kenji/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://mmdbkk.com", cookie: "__Host-mmd_liff_session=test" },
    body: JSON.stringify({ message: "เช็ก Points" }),
  });
  const response = await handleKenjiMemberChat(request, env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.authority, "ai-worker");
  assert.match(payload.reply, /12/);
  assert.equal(calls[0].kind, "truth");
  assert.equal(calls[0].cookie, "__Host-mmd_liff_session=test");
  assert.equal(calls[1].kind, "ai");
  assert.equal(calls[1].body.context_bundle.identity.source, "verified_member_session");
  assert.equal(calls[1].body.member_truth.points.active_points, 12);
});

test('Personal Main comes only from server truth, never a browser persona hint', async()=>{
 for(const id of ['hito','hiei','hiro','hima']){
  const response=await handleKenjiMemberChat(new Request('https://mmdbkk.com/api/member/kenji/chat',{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify({message:'สวัสดี',personal_main:'forged'})}),{
   MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({ok:true,personal_main:{id,source:'member-pages-worker'}})},
   AI_WORKER:{fetch:async()=>Response.json({ok:true,data:{schema_version:'mmd.kenji_member_chat.v1',reply:'ข้อมูลที่ยืนยันแล้ว',intent:'general'}})}
  });
  const data=await response.json();assert.equal(data.personal_main.id,id);assert.match(data.reply,/ข้อมูลที่ยืนยันแล้ว/);assert.doesNotMatch(data.reply,/forged/);
 }
});


test("NEXT LV remains member-only, mobile-first and CSP-nonced", async () => {
  const response = renderKenjiMemberPage();
  const html = await response.text();
  assert.match(html, /<meta name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html, /data-mode="qa"/);
  assert.match(html, /data-mode="promo"/);
  assert.match(html, /id="kenji-input"[^>]*maxlength="800"/);
  assert.ok(html.includes('<picture class="hero-picture">'));
  assert.ok(html.includes('media="(max-width: 920px)"'));
  // Approved Kenji-04 Public art: the owner ZIP was uploaded to Webflow and not replaced by older CC portraits.
  assert.ok(html.includes("Kenji04%20Member%20NEXT%20LV%20Desktop%2016x9.webp"));
  assert.ok(html.includes("Kenji04%20Member%20NEXT%20LV%20Mobile%209x16.webp"));
  assert.ok(html.includes("Kenji04%20Member%20NEXT%20LV%20Chat%20Avatar.webp"));
  assert.ok(!html.includes("Kenji%20CC%2002.webp"));
  assert.ok(!html.includes("Kenji%20Alove.webp"));
  const qaStart = html.indexOf('data-mode-panel="qa"');
  const promoStart = html.indexOf('data-mode-panel="promo"', qaStart);
  assert.ok(qaStart >= 0 && promoStart > qaStart);
  const qaPanel = html.slice(qaStart, promoStart);
  assert.deepEqual([...qaPanel.matchAll(/data-prompt="([^"]+)"/g)].map(([, prompt]) => prompt), [
    "GWs คืออะไร",
    "EMs คืออะไร",
    "สมัครสมาชิกแล้วได้อะไรบ้าง",
    "Black Card คืออะไร",
    "MMD คืออะไร",
    "ชำระเงินอย่างไร",
  ]);
  const promptStart = html.indexOf('document.querySelectorAll("[data-prompt]").forEach(function (button) {');
  const modesStart = html.indexOf("  modes.forEach(function (button) {", promptStart);
  assert.ok(promptStart >= 0 && modesStart > promptStart);
  const promptHandler = html.slice(promptStart, modesStart);
  assert.ok(promptHandler.includes('input.value = button.getAttribute("data-prompt") || "";'));
  assert.ok(!promptHandler.includes("ask()"));
  // Official two-brand mapping: MMD = Curated, SIGIL = Private; no local access grant is possible.
  // Logos are exact Webflow-approved marks, embedded as content-addressed image data
  // to work in standalone Worker HTML and offline review (not text or broken CDN URLs).
  const headerLogo = html.match(/<img class="brand-mark" src="data:image\/webp;base64,([^"]+)"/);
  const privateLogo = html.match(/class="world-link world-link--private"[\s\S]*?<img src="data:image\/png;base64,([^"]+)"/);
  assert.ok(headerLogo?.[1], "Curated mark must render as an embedded image");
  assert.ok(privateLogo?.[1], "SIGIL mark must render as an embedded image");
  assert.equal(Buffer.from(headerLogo[1], "base64").subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(Buffer.from(privateLogo[1], "base64").subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(!html.includes("__KENJI_MMD_MARK__"));
  assert.ok(!html.includes("__KENJI_SIGIL_MARK__"));
  assert.match(html, /@font-face/);
  assert.ok(html.includes("LINESeedSansTH_W_Rg.woff2"));
  assert.ok(html.includes("Canela-Regular-Trial.otf"));
  assert.ok(html.includes("Inter_18pt-Regular.ttf"));
  assert.ok(html.includes("font-family:Canela,Georgia,serif"));
  assert.ok(html.includes("font-family:Inter"));
  assert.ok(html.includes('class="world-link world-link--curated"'));
  assert.ok(html.includes('class="world-link world-link--private"'));
  assert.ok(html.includes('href="/member/private"'));
  assert.ok(html.includes("PRIVATE<br>ตรวจสิทธิ์"));
  assert.ok(!html.includes("grantPrivateAccess"));
  assert.match(html, /@media\(min-width:921px\)/);
  assert.match(html, /grid-template-rows:clamp\(146px,22dvh,190px\)/);
  assert.ok(html.includes('alt="MMD Privé"'));
  assert.ok(html.includes('href="/my-mmd/"'));
  assert.ok(!html.includes('href="/member/my-mmd"'));
  assert.match(html, /ดูโปรโมชั่นจากประกาศของ MMD/);
  assert.doesNotMatch(html, /localStorage\.|sessionStorage\.|javascript:/);
  assert.match(response.headers.get("content-security-policy") || "", /connect-src 'self'/);
  assert.ok((response.headers.get("content-security-policy") || "").includes("https://s3.amazonaws.com"));
  assert.ok((response.headers.get("content-security-policy") || "").includes("font-src 'self' https://cdn.prod.website-files.com"));
  assert.doesNotMatch(response.headers.get("content-security-policy") || "", /unsafe-inline/);
  assert.equal(response.headers.get("x-mmd-kenji"), "member-app-next-lv");
});

test("NEXT LV uses fresh CSP nonces per request without changing its chat BFF", async () => {
  const [a, b] = [renderKenjiMemberPage(), renderKenjiMemberPage()];
  const [htmlA, htmlB] = await Promise.all([a.text(), b.text()]);
  const nonceA = htmlA.match(/<script nonce="([a-f0-9]{32})">/)?.[1];
  const nonceB = htmlB.match(/<script nonce="([a-f0-9]{32})">/)?.[1];
  assert.ok(nonceA);
  assert.ok(nonceB);
  assert.notEqual(nonceA, nonceB);
  assert.match(a.headers.get("content-security-policy"), new RegExp("nonce-" + nonceA));
  assert.match(htmlA, /fetch\("\/api\/member\/kenji\/chat",/);
  assert.match(htmlA, /credentials: "same-origin"/);
});
