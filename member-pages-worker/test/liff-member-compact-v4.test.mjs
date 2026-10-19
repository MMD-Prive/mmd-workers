import assert from "node:assert/strict";
import test from "node:test";
import { handleLiffMemberShell } from "../src/liff-member-shell.js";
import { MY_MMD_LIFF_COMPACT_V4_CSS } from "../src/liff-member-compact-v4-style.js";

async function shell(intent="status") {
  const response = handleLiffMemberShell(
    new Request("https://www.mmdbkk.com/member/liff?intent="+intent),
    { LINE_LIFF_ID: "2010862595-yT4DCEMc" },
  );
  assert.equal(response.status,200);
  assert.match(response.headers.get("cache-control")||"",/no-store/);
  return response.text();
}

test("LIFF V4 compact skin uses live Worker source without changing canonical entry or signup", async()=>{
  const status=await shell("status");
  const signup=await shell("signup");
  assert.match(status,/data-mmd-liff-digital="v3" data-mmd-liff-compact="v4"/);
  assert.match(status, /body\[data-mmd-liff-compact="v4"\]\.app-entered/);
  assert.match(status, /body\[data-mmd-liff-compact="v4"\]:not\(\.signup-mode\)/);
  assert.match(status, /\/member\/api\/liff\/start/);
  assert.match(status, /getIDToken\(\)/);
  assert.match(status, /"liffId":"2010862595-yT4DCEMc"/);
  assert.match(signup, /class="signup-mode app-entered world-public"/);
  assert.match(signup, /id="signup-packages"/);
  assert.match(signup, /id="signup-line-entry"/);
  assert.doesNotMatch(MY_MMD_LIFF_COMPACT_V4_CSS,/https?:\/\/|fetch\(|localStorage|sessionStorage|window\.liff/);
});

test("the partial history card is folded INSIDE the entered Home, never before login",async()=>{
  const html=await shell();
  const home=html.indexOf('id="home" class="panel digital-home"');
  const member=html.indexOf('class="digital-snapshot"');
  const review=html.indexOf('id="minimal-member-display"');
  const next=html.indexOf('id="digital-companion"');
  assert.ok(home>0 && home<member && member<review && review<next);
  assert.match(html,/<details id="minimal-member-display" class="digital-history-review"[^>]* hidden>/);
  assert.match(html, /<summary>ข้อมูลประวัติยังอยู่ระหว่างตรวจสอบ<\/summary>/);
  assert.equal((html.match(/id="minimal-member-display"/g)||[]).length,1);
  assert.equal((html.match(/id="minimal-member-expiry"/g)||[]).length,1);
  assert.equal((html.match(/id="minimal-member-points"/g)||[]).length,1);
  assert.match(html,/body\[data-mmd-liff-compact="v4"\]:not\(\.signup-mode\):not\(\.app-entered\) #minimal-member-display\{display:none!important\}/);
  assert.doesNotMatch(html,/class="card" aria-label="ข้อมูลสมาชิกที่มีหลักฐานแล้ว"/);
  assert.match(html,/const supportedExpiry = safeDate\(membership\.expiresAt \|\| membership\.renewalDueAt\);\n\s+if \(minimalExpiry && supportedExpiry\)/);
  // Only canonical history recovery causes the folded partial review note.
  assert.match(html,/if \(data\.historyState === "identity_review"\)/);
});

test("authorized existing LINE members can bypass redundant ENTER without auto LOGIN",async()=>{
  const html=await shell();
  assert.match(html,/const idToken = window\.liff\.getIDToken\(\)/);
  assert.match(html,/preflightVerifiedSession = true/);
  assert.match(html,/preflightVerifiedSession && document\.body\.dataset\.welcomeAudience === "existing"/);
  assert.match(html,/if \(profile \|\| \(preflightVerifiedSession && document\.body\.dataset\.welcomeAudience === "existing"\)\)/);
  const start=html.indexOf("async function preflightWelcomeIdentity()");
  const stop=html.indexOf("async function resolveInitialWelcomeContext()",start);
  assert.ok(start>0 && stop>start);
  assert.doesNotMatch(html.slice(start,stop),/liff\.login\(/);
  // Manual visitor ENTER remains possible and may run the existing LIFF handshake.
  assert.match(html,/introContinue\?\.addEventListener\("click", enterApp\)/);
  assert.match(html,/window\.liff\.login\(\{ redirectUri: window\.location\.href \}\)/);
});

test("opening progress remains indeterminate until the real entry decision completes",async()=>{
  const html=await shell();
  assert.doesNotMatch(html,/const progressTimer = window\.setInterval/);
  assert.doesNotMatch(html,/loadingPercent \+ \(loadingPercent/);
  assert.doesNotMatch(html,/setLoadingPercent\(|hype-progress-number|hype-loader-img/);
  assert.match(html,/<progress id="hype-progress" aria-label="กำลังเปิด MY MMD"><\/progress>/);
  assert.match(html,/role="status" aria-label="กำลังเปิด MY MMD"/);
});

test("MMD NOW folds natively while Worker-gated mission, quick links and Kenji remain",async()=>{
  const html=await shell();
  assert.match(html,/<details class="digital-news-disclosure" id="digital-news-disclosure">/);
  assert.match(html,/<summary class="digital-news-summary">/);
  assert.match(html,/id="digital-news-feed"/);
  assert.match(html,/id="digital-unread"/);
  assert.match(html,/id="digital-mission" class="digital-mission"/);
  assert.match(html,/id="digital-mission-eta"/);
  assert.match(html,/id="digital-needs-action"/);
  assert.match(html,/data-view="history"/);
  assert.match(html,/data-view="credits"/);
  assert.match(html,/href="\/member\/kenji"/);
  assert.match(html,/class="digital-bangkok-trace"[^>]*aria-hidden="true"/);
});

test("LIFF compact CSS has full safe area, contrast and reduced-motion without media identity",()=>{
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/#0b0e10/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/#c9b38b/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/#f3f0e8/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/min-height:44px/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/safe-area-inset-bottom/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/prefers-reduced-motion:reduce/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/:focus-visible/);
  assert.match(MY_MMD_LIFF_COMPACT_V4_CSS,/digital-history-review\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(MY_MMD_LIFF_COMPACT_V4_CSS,/\.signup-mode\)\s*\{[^}]*display:none/);
});

test("LIFF shell renders Compact V4 CSS exactly once after legacy travel styles", async()=>{
  const html = await shell();
  const occurrences = html.split("--v4-bg:#0b0e10").length - 1;
  assert.equal(occurrences, 1);
  assert.ok(html.indexOf("--v4-bg:#0b0e10") > html.indexOf(".mt9{padding:14px 0"));
});
