const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildReviewData,
  renderCss,
  renderControlRoomIntegration,
  renderHtml,
  renderJs,
  writeReviewPage,
} = require("./review-page.js");

function sampleRecord(overrides = {}) {
  const fields = {
    import_id: "line_ofc_console_line_123",
    import_batch_id: "batch_review",
    review_status: "review_required",
    match_type: "multiple_candidates",
    match_confidence: 0.5,
    parse_confidence: 0.72,
    line_display_name: "VIP Name",
    line_renamed_name: "VIP Name #client #memApr25",
    line_tags_raw: "#client #vip #purchased #memApr25",
    parsed_client_level: "vip",
    parsed_membership_status: "member",
    parsed_membership_tier: "vip",
    parsed_membership_package: "premium",
    parsed_member_since: "2025-04-01",
    parsed_member_since_raw: "#memApr25",
    parsed_has_purchased: true,
    phone_candidate: "+66812345678",
    email_candidate: "secret@example.com",
    membership_parse_json: JSON.stringify({
      membership_status: "member",
      client_level: "vip",
      client_level_raw: "#vip",
      client_level_tokens: [{ level: "vip", token: "#vip" }],
      membership_tier: "vip",
      membership_package: "premium",
      member_since: "2025-04",
      member_since_raw: "#memApr25",
      has_purchased: true,
      chosen_member_since_token: "#memApr25",
      all_member_tokens: ["#memJan24", "#memApr25"],
      parse_warnings: ["line_renamed_name_fallback:member_name"],
    }),
    proposed_entitlement_json: JSON.stringify({
      source: "line_ofc",
      client_level: "vip",
      membership_status: "member",
      membership_tier: "vip",
      membership_package: "premium",
      member_since: "2025-04",
      member_since_raw: "#memApr25",
      has_purchased: true,
      review_required: true,
    }),
    raw_row_json: JSON.stringify({
      member_email: "secret@example.com",
      member_phone: "+66812345678",
      line_user_id: "Uabc123",
      member_name: "VIP Name",
    }),
    ...overrides,
  };
  return { id: "recReview1", fields };
}

test("review page data redacts phone email and private identifiers", () => {
  const data = buildReviewData([sampleRecord()], "batch_review");
  const row = data.rows[0];
  assert.equal(Object.prototype.hasOwnProperty.call(row, "phone_candidate"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, "email_candidate"), false);
  assert.equal(row.raw_debug_redacted.member_email, "[redacted-email]");
  assert.equal(row.raw_debug_redacted.member_phone, "[redacted-phone]");
  assert.equal(row.raw_debug_redacted.line_user_id, "[redacted]");
});

test("review page redaction preserves membership dates", () => {
  const data = buildReviewData([sampleRecord({
    parsed_member_since: "2025-04-01",
    raw_row_json: JSON.stringify({
      member_since: "2025-04-01",
      member_phone: "+66812345678",
    }),
  })], "batch_review");
  assert.equal(data.rows[0].parsed_member_since, "2025-04-01");
  assert.equal(data.rows[0].raw_debug_redacted.member_since, "2025-04-01");
  assert.equal(data.rows[0].raw_debug_redacted.member_phone, "[redacted-phone]");
});

test("review page blocks unsafe rows and never marks rows committable", () => {
  const data = buildReviewData([
    sampleRecord({ review_status: "review_required", match_type: "exact_line_user_id" }),
    sampleRecord({ review_status: "review_required", match_type: "multiple_candidates" }),
    sampleRecord({ review_status: "staging_only", match_type: "no_match" }),
    sampleRecord({ review_status: "ready_to_review", match_type: "exact_line_user_id" }),
  ], "batch_review");
  assert.equal(data.rows.every((row) => row.committable === false), true);
  assert.equal(data.rows.every((row) => row.unsafe_to_commit === true), true);
  assert.equal(data.rows[0].safety_state, "Blocked until human review");
  assert.equal(data.rows[1].safety_state, "Choose client manually later");
  assert.equal(data.rows[2].safety_state, "Staging only");
  assert.equal(data.rows[3].safety_state, "Not executable on this page");
});

test("review_required rows are blocked", () => {
  const data = buildReviewData([
    sampleRecord({ review_status: "review_required", match_type: "exact_line_user_id" }),
  ], "batch_review");
  assert.equal(data.rows[0].queue_flags.review_required, true);
  assert.equal(data.rows[0].safety_state, "Blocked until human review");
  assert.equal(data.rows[0].committable, false);
});

test("multiple_match rows are blocked", () => {
  const data = buildReviewData([
    sampleRecord({ review_status: "review_required", match_type: "multiple_candidates" }),
  ], "batch_review");
  assert.equal(data.rows[0].queue_flags.multiple_match, true);
  assert.equal(data.rows[0].safety_state, "Choose client manually later");
  assert.equal(data.rows[0].committable, false);
});

test("no_match rows are blocked as staging only", () => {
  const data = buildReviewData([
    sampleRecord({ review_status: "staging_only", match_type: "no_match" }),
  ], "batch_review");
  assert.equal(data.rows[0].queue_flags.no_match_staging, true);
  assert.equal(data.rows[0].safety_state, "Staging only");
  assert.equal(data.rows[0].committable, false);
});

test("review page exposes member token evidence when present", () => {
  const data = buildReviewData([sampleRecord()], "batch_review");
  assert.equal(data.rows[0].chosen_member_since_token, "#memApr25");
  assert.deepEqual(data.rows[0].all_member_tokens, ["#memJan24", "#memApr25"]);
  assert.equal(data.rows[0].parsed_client_level, "vip");
  assert.equal(data.rows[0].proposed_entitlement_summary.client_level, "vip");
  assert.equal(data.summary.member_vip_premium_count, 1);
});

test("generated UI includes required filters and scoped CSS", () => {
  const js = renderJs();
  const css = renderCss();
  assert.equal(js.includes('data-filter="status"'), true);
  assert.equal(js.includes('data-filter="tier"'), true);
  assert.equal(js.includes('data-filter="package"'), true);
  assert.equal(js.includes('data-filter="match"'), true);
  assert.equal(js.includes("parsed_membership_tier"), true);
  assert.equal(js.includes("parsed_membership_package"), true);
  assert.equal(js.includes("Review Required"), true);
  assert.equal(js.includes("Multiple Match"), true);
  assert.equal(js.includes("Member / VIP / Premium Evidence"), true);
  assert.equal(js.includes("No Match Staging"), true);
  assert.equal(js.includes("Ready After Manual Review"), true);
  assert.equal(js.includes("All Staging"), true);
  assert.equal(css.includes(":root"), false);
  assert.equal(css.includes(".line-ofc-review-page{color-scheme:dark"), true);
});

test("generated review assets contain no secrets or Airtable write endpoints", () => {
  const data = buildReviewData([sampleRecord()], "batch_review");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "line-ofc-review-"));
  writeReviewPage(data, tempDir);
  const html = fs.readFileSync(path.join(tempDir, "index.html"), "utf8");
  const js = fs.readFileSync(path.join(tempDir, "line-ofc-review.js"), "utf8");
  const renderedHtml = renderHtml(data);
  const renderedJs = renderJs();
  for (const content of [html, js, renderedHtml, renderedJs]) {
    assert.equal(content.includes("AIRTABLE_API_KEY"), false);
    assert.equal(content.includes("api.airtable.com"), false);
    assert.equal(content.includes("tblVv58TCbwh5j1fS"), false);
    assert.equal(content.includes("tblNImdF9PKAxhXGi"), false);
    assert.equal(/\b(PATCH|POST|DELETE)\b/.test(content), false);
    assert.equal(content.includes("/commit"), false);
    assert.equal(content.includes("commitEndpoint"), false);
    assert.equal(content.includes("api/commit"), false);
  }
});

test("control room integration note keeps commit separate and guarded", () => {
  const data = buildReviewData([sampleRecord()], "batch_review");
  const note = renderControlRoomIntegration(data);
  assert.equal(note.includes("/control-room/line-ofc-review"), true);
  assert.equal(note.includes("LINE OFC Review"), true);
  assert.equal(note.includes("internal/admin only"), true);
  assert.equal(note.includes("review-only"), true);
  assert.equal(note.includes("No commit action on this page"), true);
  assert.equal(note.includes("separate guarded worker endpoint requiring `t`"), true);
});
