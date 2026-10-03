import test from "node:test";
import assert from "node:assert/strict";
import {
  isTmibStoryAccessPath,
  membershipGrantsTmib,
  paymentGrantsTmib,
  handleTmibStoryAccess,
  TMIB_STORY_INTERNALS,
} from "../src/tmib-story-access.js";
import { getTmibEpisode, publicTmibEpisodeMetadata, TMIB_RELEASE_POLICY } from "../src/tmib-episode-catalog.js";

test("recognizes catalog-driven TMIB protected routes", () => {
  assert.equal(isTmibStoryAccessPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/catalog"), true);
  assert.equal(isTmibStoryAccessPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/access"), true);
  assert.equal(isTmibStoryAccessPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/purchase"), true);
  assert.equal(isTmibStoryAccessPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/media/04"), true);
  assert.equal(isTmibStoryAccessPath("https://mmdbkk.com/tmib/act-001"), false);
});

test("ACT 001 catalog is the single pricing/package source", () => {
  const episode = getTmibEpisode("act-001");
  assert.ok(episode);
  assert.equal(episode.priceThb, 0);
  assert.equal(episode.packageCode, "tmib_act_001_public");
  assert.equal(episode.storyPath, "/tmib/act-001");
  assert.equal(episode.checkoutPath, "");
  assert.equal(episode.publicFree, true);
  assert.equal(episode.accessMode, "public_free");
  const pub = publicTmibEpisodeMetadata(episode);
  assert.equal(pub.price_thb, 0);
  assert.equal(pub.purchasable, false);
  assert.equal(pub.public_free, true);
  assert.equal(pub.member_gate_starts_at_episode, 11);
  assert.equal(TMIB_RELEASE_POLICY.publicFreeEpisodesThrough, 10);
  assert.equal(pub.membership_included, false);
});

test("catalog endpoint is public metadata only", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/catalog"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.schema, "tmib_episode_catalog_v1");
  assert.equal(payload.episode_id, "act-001");
  assert.equal(payload.price_thb, 0);
  assert.equal(payload.purchase_path, "");
});

test("unknown episode fails closed", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-999/catalog"), {});
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, "TMIB_EPISODE_NOT_FOUND");
});

test("grants active verified MMD Member through Black Card but not display-only or expired", () => {
  for (const level of ["public_member", "elite", "red_card", "standard", "premium", "vip", "svip", "black_card"]) {
    assert.equal(membershipGrantsTmib({ level, levelVerified: true, displayOnly: false, status: "active", lifecycle: "active", access: "checking" }), true, level);
  }
  assert.equal(membershipGrantsTmib({ level: "guest", levelVerified: true, status: "active", lifecycle: "active" }), false);
  assert.equal(membershipGrantsTmib({ level: "public_member", levelVerified: false, status: "active", lifecycle: "active" }), false);
  assert.equal(membershipGrantsTmib({ level: "public_member", levelVerified: true, displayOnly: true, status: "active", lifecycle: "active" }), false);
  assert.equal(membershipGrantsTmib({ level: "black_card", levelVerified: true, status: "expired", lifecycle: "expired" }), false);
});

test("released public episode is not purchasable", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/purchase", {
    method: "POST",
    headers: { origin: "https://mmdbkk.com" },
  }), {});
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error.code, "EPISODE_NOT_PURCHASABLE");
});

test("released TMIB reader is public without a verified LINE session", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/access"), { LIFF_SESSION_SECRET: "test-only-tmib-media-secret-12345678901234567890" });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.granted, true);
  assert.equal(payload.access_source, "public_free");
  assert.equal(payload.watermark, "MMD · PUBLIC STORY");
  assert.ok(payload.media["04"]);
});

test("purchase requires same-origin browser request", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/purchase", {
    method: "POST",
    headers: { origin: "https://evil.example" },
  }), {});
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.error.code, "SAME_ORIGIN_REQUIRED");
});


test("TMIB payment URL validator accepts public checkout and rejects SIGIL surface", () => {
  assert.equal(
    TMIB_STORY_INTERNALS.canonicalPayUrl("https://mmdbkk.com/pay/checkout?t=signed"),
    "https://mmdbkk.com/pay/checkout?t=signed",
  );
  assert.equal(TMIB_STORY_INTERNALS.canonicalPayUrl("https://mmdbkk.com/sigil/pay?t=signed"), "");
});

test("TMIB restores an expired member session from the remembered-login cookie and forwards its rotated session cookie", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-011/access", {
    headers: { cookie: "__Host-mmd_liff_remember=device-proof; theme=dark" },
  });
  const readSession = async (currentRequest) => {
    const cookie = currentRequest.headers.get("cookie") || "";
    return cookie.includes("__Host-mmd_liff_session=fresh-token")
      ? { lineUserId: "U0123456789abcdef0123456789abcdef" }
      : null;
  };
  let renewCalls = 0;
  const context = await TMIB_STORY_INTERNALS.resolveMemberContext(request, {}, {
    readSession,
    renewMembership: async () => {
      renewCalls += 1;
      return {
        membership: { level: "public_member", levelVerified: true, status: "active", lifecycle: "active" },
        cookies: ["__Host-mmd_liff_session=fresh-token; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800"],
      };
    },
  });
  assert.equal(renewCalls, 1);
  assert.equal(context.session.lineUserId, "U0123456789abcdef0123456789abcdef");
  assert.equal(context.membershipCheck.membership.level, "public_member");
  assert.deepEqual(context.cookies, ["__Host-mmd_liff_session=fresh-token; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800"]);
  assert.match(context.request.headers.get("cookie"), /__Host-mmd_liff_remember=device-proof/);
  assert.match(context.request.headers.get("cookie"), /__Host-mmd_liff_session=fresh-token/);
});

test("TMIB does not attempt remembered-session recovery when no remembered cookie exists", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-011/access");
  let renewCalls = 0;
  const context = await TMIB_STORY_INTERNALS.resolveMemberContext(request, {}, {
    readSession: async () => null,
    renewMembership: async () => {
      renewCalls += 1;
      return { membership: null, cookies: [] };
    },
  });
  assert.equal(renewCalls, 0);
  assert.equal(context.session, null);
});
