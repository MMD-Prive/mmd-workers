import test from "node:test";
import assert from "node:assert/strict";
import { handleKenjiMemberChat, renderKenjiMemberPage } from "../src/kenji-member-app.js";

function memberTruth(overrides = {}) {
  return {
    ok: true,
    authority: "my_mmd_entitlement_resolver_v1",
    identity_status: "resolved",
    display_name: "Per Test",
    membership: { level: "public", label: "Member", lifecycle: "active", expire_at: "2027-09-28T00:00:00Z" },
    points: { status: "verified", active_points: 12 },
    resolver_snapshot: {
      schema_version: "my_mmd_entitlement_resolver_v1",
      evaluated_at: "2026-09-28T13:00:00Z",
      fail_closed: true,
      member_blocked: false,
      capability_state: { active: ["public"], expiring_soon: [], grace: [], inactive: [], recognized: ["public"] },
      access: { public_service_access: true, guest_pass_access: false, red_card_request_lane: false, private_visibility_envelope: "none", protected_allowlist_required: false, protected_capabilities_active: [], new_model_reveals_allowed: false },
    },
    ...overrides,
  };
}

function request(message, headers = {}) {
  return new Request("https://mmdbkk.com/api/member/kenji/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mmdbkk.com",
      cookie: "__Host-mmd_liff_session=test",
      ...headers,
    },
    body: JSON.stringify({ message }),
  });
}

test("KENJI page is a compact chat app and not the old AI 2.0 landing dialogue", async () => {
  const response = renderKenjiMemberPage();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, />KENJI</);
  assert.match(html, /\/api\/member\/kenji\/chat/);
  assert.match(html, /มีอะไรให้ผมจัดการครับ/);
  assert.doesNotMatch(html, /KENJI AI 2\.0|YOUR NEXT STEP, QUIETLY HANDLED/);
});

test("general Q&A resolves verified session truth before calling AI_WORKER", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({ kind: "truth", url: request.url, cookie: request.headers.get("cookie") });
        return Response.json(memberTruth());
      },
    },
    AI_WORKER: {
      async fetch(request) {
        const body = await request.json();
        calls.push({
          kind: "ai",
          url: request.url,
          capability: request.headers.get("x-mmd-kenji-capability"),
          body,
        });
        return Response.json({
          ok: true,
          data: {
            schema_version: "mmd.kenji_member_chat.v1",
            reply: "MMD เป็นบริการสมาชิกที่ผมช่วยอธิบายข้อมูลทั่วไปได้ครับ",
            intent: "general",
            action: { label: "เปิด Points", url: "/my-mmd/points" },
            safety: { review_required: false },
          },
        });
      },
    },
  };
  const response = await handleKenjiMemberChat(request("MMD คืออะไร"), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.authority, "ai-worker");
  assert.equal(payload.intent, "general");
  assert.equal(payload.capability, "general_qna");
  assert.equal(payload.action, null, "a general answer cannot surface a restricted Worker-selected action");
  assert.deepEqual(payload.allowed_capabilities, ["general_qna", "published_promotions"]);
  assert.equal(response.headers.get("x-mmd-kenji-policy"), "public-general-promotions-v1");
  assert.equal(calls[0].kind, "truth");
  assert.equal(calls[0].cookie, "__Host-mmd_liff_session=test");
  assert.equal(calls[1].kind, "ai");
  assert.equal(calls[1].capability, "general_qna");
  assert.equal(calls[1].body.context_bundle.identity.source, "verified_member_session");
  assert.equal(calls[1].body.requested_capability, "general_qna");
  assert.deepEqual(calls[1].body.allowed_capabilities, ["general_qna", "published_promotions"]);
  assert.deepEqual(calls[1].body.member_truth, { display_name: "Per Test" });
  assert.deepEqual(calls[1].body.context_bundle.customer_context, { rename: "Per Test" });
  assert.equal("points" in calls[1].body.member_truth, false);
  assert.equal("membership" in calls[1].body.member_truth, false);
  assert.equal("resolver_snapshot" in calls[1].body.context_bundle.customer_context, false);
  assert.equal("latest_cycle" in calls[1].body.context_bundle.customer_context, false);
});

test("restricted Public capabilities fail closed after session resolution and never call AI", async () => {
  const messages = [
    ["เช็ก Points", "points"],
    ["ใครว่างคืนนี้", "availability"],
    ["ช่วยจองให้หน่อย", "booking"],
    ["ขอเปิด Black Card", "private_access"],
    ["เช็กยอดโอนเงิน", "payment"],
    ["ดูประวัติของฉัน", "history"],
    ["ส่งเรื่องหลังบริการ", "care"],
    ["สถานะสมาชิกของฉัน", "member_record"],
    ["คูปองของฉันใช้ได้ไหม", "member_coupon"],
    ["ขอเบอร์โทรลูกค้าคนอื่น", "customer_record"],
  ];

  for (const [message, capability] of messages) {
    let aiCalls = 0;
    const response = await handleKenjiMemberChat(request(message), {
      MEMBER_PAGES_WORKER: { fetch: async () => Response.json(memberTruth()) },
      AI_WORKER: { fetch: async () => { aiCalls++; return Response.json({ ok: true }); } },
    });
    const payload = await response.json();
    assert.equal(response.status, 403, message);
    assert.equal(payload.error, "capability_not_allowed", message);
    assert.equal(payload.capability, capability, message);
    assert.equal(aiCalls, 0, message);
  }
});

test("published promotion questions stay locked until an authoritative evidence contract exists", async () => {
  let aiCalls = 0;
  const response = await handleKenjiMemberChat(request("โปรโมชั่นล่าสุดมีอะไรบ้าง"), {
    MEMBER_PAGES_WORKER: { fetch: async () => Response.json(memberTruth()) },
    AI_WORKER: { fetch: async () => { aiCalls++; return Response.json({ ok: true }); } },
  });
  const payload = await response.json();
  assert.equal(response.status, 423);
  assert.equal(payload.error, "published_promotion_contract_unavailable");
  assert.equal(payload.capability, "published_promotions");
  assert.equal(payload.source_route, "/my-mmd/coupons");
  assert.equal(aiCalls, 0);
});

test("bare CARE BACK and Double Moment cannot reach AI without verified publication evidence", async () => {
  for (const message of ["CARE BACK", "Double Moment", "แคร์แบ็ก 6 ปี", "ส่วนลดล่าสุด"]) {
    let aiCalls = 0;
    const response = await handleKenjiMemberChat(request(message), {
      MEMBER_PAGES_WORKER: { fetch: async () => Response.json(memberTruth()) },
      AI_WORKER: { fetch: async () => { aiCalls++; return Response.json({ ok: true }); } },
    });
    const body = await response.json();
    assert.equal(response.status, 423, message);
    assert.equal(body.error, "published_promotion_contract_unavailable", message);
    assert.equal(aiCalls, 0, message);
  }
});

test("feature flag alone cannot unlock public promotions or forward member cookies", async () => {
  let requests = [];
  let aiCalls = 0;
  const response = await handleKenjiMemberChat(request("โปรโมชั่นล่าสุดมีอะไรบ้าง"), {
    KENJI_PUBLIC_PROMOTIONS_ENABLED: "true",
    MEMBER_PAGES_WORKER: { fetch: async () => Response.json(memberTruth()) },
    KENJI_PROMOTION_EVIDENCE_WORKER: {
      fetch: async (req) => {
        requests.push(req);
        return Response.json({
          schema_version: "mmd.public_promotion_evidence.v1",
          authority: "legacy_knowledge_card",
          read_only: true,
          campaigns: [],
        });
      },
    },
    AI_WORKER: { fetch: async () => { aiCalls++; return Response.json({ ok: true }); } },
  });
  const payload = await response.json();
  assert.equal(response.status, 423);
  assert.equal(payload.error, "published_promotion_contract_unavailable");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].headers.get("cookie"), null);
  assert.equal(requests[0].headers.get("authorization"), null);
  assert.equal(aiCalls, 0);
});

test("session truth is checked before capability details are disclosed", async () => {
  let aiCalls = 0;
  const response = await handleKenjiMemberChat(request("เช็ก Points"), {
    MEMBER_PAGES_WORKER: { fetch: async () => Response.json({ ok: false, error: "session_required" }, { status: 401 }) },
    AI_WORKER: { fetch: async () => { aiCalls++; return Response.json({ ok: true }); } },
  });
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error, "session_required");
  assert.equal(payload.capability, undefined);
  assert.equal(aiCalls, 0);
});

test("a broad AI intent cannot escape the server capability boundary", async () => {
  const response = await handleKenjiMemberChat(request("ช่วยอธิบายบริการหน่อย"), {
    MEMBER_PAGES_WORKER: { fetch: async () => Response.json(memberTruth()) },
    AI_WORKER: {
      fetch: async () => Response.json({
        ok: true,
        data: {
          schema_version: "mmd.kenji_member_chat.v1",
          reply: "12 แต้มครับ",
          intent: "points_status",
          action: { label: "เปิด Points", url: "/my-mmd/points" },
          safety: { review_required: false },
        },
      }),
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error, "ai_worker_capability_mismatch");
  assert.equal(payload.expected_intent, "general");
  assert.equal(payload.received_intent, "points_status");
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
    "MMD คืออะไร",
    "MY MMD คืออะไร",
    "Kenji ช่วยอะไรได้บ้าง",
    "บริการ Companion คืออะไร",
    "เริ่มต้นใช้งานเว็บไซต์อย่างไร",
    "ติดต่อ MMD ได้ทางไหน",
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
  assert.match(html, /published_promotion_contract_unavailable/);
  assert.match(html, /เปิดคูปองใน MY MMD/);
  assert.match(html, /"member_coupon"/);
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
