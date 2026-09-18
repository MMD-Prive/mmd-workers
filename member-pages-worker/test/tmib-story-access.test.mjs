import test from "node:test";
import assert from "node:assert/strict";
import {
  isTmibStoryAccessPath,
  membershipGrantsTmib,
  paymentGrantsTmib,
  handleTmibStoryAccess,
} from "../src/tmib-story-access.js";
import { getTmibEpisode, publicTmibEpisodeMetadata } from "../src/tmib-episode-catalog.js";

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
  assert.equal(episode.priceThb, 299);
  assert.equal(episode.packageCode, "tmib_act_001");
  assert.equal(episode.storyPath, "/tmib/act-001");
  assert.equal(episode.checkoutPath, "/pay/tmib?episode=act-001");
  const pub = publicTmibEpisodeMetadata(episode);
  assert.equal(pub.price_thb, 299);
  assert.equal(pub.purchasable, true);
  assert.equal(pub.membership_included, true);
});

test("catalog endpoint is public metadata only", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/catalog"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.schema, "tmib_episode_catalog_v1");
  assert.equal(payload.episode_id, "act-001");
  assert.equal(payload.price_thb, 299);
  assert.equal(payload.purchase_path, "/member/api/liff/tmib/episodes/act-001/purchase");
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

test("episode purchase requires exact verified paid catalog price/package", () => {
  const good = { fields: {
    "Payment Status": "Paid",
    "Verification Status": "Verified",
    package_code: "tmib_act_001",
    amount_thb: 299,
    notes: "session_id=tmib_x; stage=tmib_story; created_at=2026-09-16T00:00:00Z",
  } };
  assert.equal(paymentGrantsTmib(good, "act-001"), true);
  assert.equal(paymentGrantsTmib({ fields: { ...good.fields, amount_thb: 298 } }, "act-001"), false);
  assert.equal(paymentGrantsTmib({ fields: { ...good.fields, "Verification Status": "Pending" } }, "act-001"), false);
  assert.equal(paymentGrantsTmib({ fields: { ...good.fields, package_code: "other" } }, "act-001"), false);
  assert.equal(paymentGrantsTmib(good, "act-999"), false);
});

test("access fails closed without verified LINE session", async () => {
  const response = await handleTmibStoryAccess(new Request("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/access"), {});
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.granted, false);
  assert.equal(payload.error.code, "LINE_SESSION_REQUIRED");
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
