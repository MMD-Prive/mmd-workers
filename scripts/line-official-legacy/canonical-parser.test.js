const assert = require("node:assert/strict");
const test = require("node:test");

const { parseCanonicalLineOfc } = require("./canonical-parser.js");

test("#client parses member status", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul #client" });
  assert.equal(parsed.membership_status, "member");
});

test("#purchased parses has_purchased", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul #purchased" });
  assert.equal(parsed.has_purchased, true);
  assert.equal(parsed.membership_status, "purchased");
});

test("#memYY, #memYYYY, and #memMonYY parse member_since", () => {
  assert.equal(parseCanonicalLineOfc({ nickname: "Paul #mem24" }).member_since, "2024");
  assert.equal(parseCanonicalLineOfc({ nickname: "Paul #mem2025" }).member_since, "2025");
  assert.equal(parseCanonicalLineOfc({ nickname: "Paul #memJan24" }).member_since, "2024-01");
});

test("guest variants parse guest", () => {
  assert.equal(parseCanonicalLineOfc({ nickname: "Guest visitor" }).client_level, "guest");
  assert.equal(parseCanonicalLineOfc({ nickname: "no membership" }).client_level, "guest");
});

test("contact evidence without membership signal parses guest", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Known contact", line_user_id: "U1" });
  assert.equal(parsed.client_level, "guest");
});

test("7 Days variants parse 7_days", () => {
  for (const label of ["7 days", "7days", "7-day", "7d", "trial", "7 วัน"]) {
    assert.equal(parseCanonicalLineOfc({ nickname: label }).client_level, "7_days");
  }
});

test("lite and standard parse standard client level", () => {
  assert.equal(parseCanonicalLineOfc({ nickname: "Paul lite #client" }).client_level, "standard");
  assert.equal(parseCanonicalLineOfc({ nickname: "Paul standard" }).client_level, "standard");
});

test("premium parses premium client level", () => {
  assert.equal(parseCanonicalLineOfc({ nickname: "Paul premium" }).client_level, "premium");
});

test("multiple client levels choose highest by MMD hierarchy", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Guest 7 days standard premium -vip- black card -svip-" });
  assert.equal(parsed.client_level, "svip");
  assert.deepEqual(parsed.client_level_tokens.map((item) => item.level), ["guest", "7_days", "standard", "premium", "vip", "blackcard", "svip"]);
  assert.equal(parsed.client_level_raw, "-svip-");
});

test("member signal without explicit level defaults premium with warning", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul #client #mem2025" });
  assert.equal(parsed.client_level, "premium");
  assert.ok(parsed.parse_warnings.includes("inferred_premium_from_member_signal"));
});

test("ambiguous client level becomes review_required", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul maybe vip?" });
  assert.equal(parsed.client_level, "review_required");
  assert.ok(parsed.parse_warnings.includes("ambiguous_client_level_review_required"));
});

test("multiple #mem tokens preserve evidence and select latest valid token clearly", () => {
  const parsed = parseCanonicalLineOfc({
    nickname: "เจ - SVIP - (Jjeune)",
    tags: "#client #vip #purchased #memjan24 #mem2024 #mem2025 #memApr25",
  });
  assert.deepEqual(parsed.all_member_tokens, ["#memjan24", "#mem2024", "#mem2025", "#memApr25"]);
  assert.equal(parsed.member_since, "2025-04");
  assert.equal(parsed.member_since_raw, "#memApr25");
  assert.equal(parsed.chosen_member_since_token, "#memApr25");
  assert.equal(parsed.chosen_member_since_strategy, "latest_valid_member_token");
  assert.ok(parsed.member_since_candidates.some((item) => item.token === "#memjan24" && item.member_since === "2024-01"));
  assert.ok(parsed.member_since_candidates.some((item) => item.token === "#memApr25" && item.member_since === "2025-04"));
  assert.deepEqual(parsed.parse_warnings, []);
});

test("single valid #mem token is marked as only valid token", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul #client #memJan24" });
  assert.equal(parsed.member_since, "2024-01");
  assert.equal(parsed.member_since_raw, "#memJan24");
  assert.equal(parsed.chosen_member_since_token, "#memJan24");
  assert.equal(parsed.chosen_member_since_strategy, "only_valid_member_token");
});

test("-vip- parses vip", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul -vip- #client" });
  assert.equal(parsed.client_level, "vip");
  assert.equal(parsed.membership_tier, "vip");
});

test("-svip- parses svip", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul -svip- #client" });
  assert.equal(parsed.client_level, "svip");
  assert.equal(parsed.membership_tier, "svip");
});

test("blackcard parses blackcard", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul blackcard #client" });
  assert.equal(parsed.client_level, "blackcard");
  assert.equal(parsed.membership_tier, "blackcard");
});

test("lite with date parses standard_lite", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul lite 12/05/24 #client" });
  assert.equal(parsed.client_level, "standard");
  assert.equal(parsed.membership_package, "standard_lite");
});

test("no lite with member signal parses premium", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul #client #mem2025" });
  assert.equal(parsed.client_level, "premium");
  assert.equal(parsed.membership_package, "premium");
});

test("ambiguous member tokens become review_required with raw token preserved", () => {
  const parsed = parseCanonicalLineOfc({ nickname: "Paul #memFoo24" });
  assert.equal(parsed.membership_status, "review_required");
  assert.equal(parsed.member_since_raw, "#memFoo24");
  assert.deepEqual(parsed.all_member_tokens, ["#memFoo24"]);
  assert.equal(parsed.chosen_member_since_token, "");
  assert.equal(parsed.chosen_member_since_strategy, "review_required");
  assert.ok(parsed.member_since_candidates.some((item) => item.token === "#memFoo24" && item.warning));
  assert.ok(parsed.parse_warnings.some((warning) => warning.includes("#memFoo24")));
});
