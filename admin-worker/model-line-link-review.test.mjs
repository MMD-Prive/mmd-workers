import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODEL_IDENTITY_FIRST_POLICY,
  normalizeLinePictureUrl,
} from "./src/model-liff-worker.js";
import {
  MODEL_LINE_LINK_BIND_MODE,
  isModelLineLinkBindPayload,
  isModelLineLinkCandidatesRequest,
  isModelLineLinkClaimsRequest,
  isModelLineLinkPage,
} from "./src/model-line-link-review.js";
import {
  renderModelLineLinkPageWithAvatar,
  safeClaimSummaryWithAvatar,
  safePictureUrl,
} from "./src/model-line-avatar-review.js";
import {
  CANONICAL_MODEL_LINE_LINK_PATH,
  isCanonicalModelLineLinkPage,
  modelLineLinkCanonicalLocation,
  modelLineLinkLoginLocation,
} from "./src/admin-model-line-link-worker.js";

test("first-time MMD MODEL identity requires owner review", () => {
  assert.equal(MODEL_IDENTITY_FIRST_POLICY, "owner_review_required");
});

test("canonical owner link page is an exact queryless admin route", () => {
  assert.equal(CANONICAL_MODEL_LINE_LINK_PATH, "/internal/admin/model-link");
  assert.equal(isCanonicalModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/model-link")), true);
  assert.equal(isCanonicalModelLineLinkPage(new Request("https://www.mmdbkk.com/internal/admin/model-link")), true);
  assert.equal(isCanonicalModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/model-link/")), true);
  assert.equal(isCanonicalModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/model-link", { method: "POST" })), false);
  assert.equal(isCanonicalModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/model-link-other")), false);
});

test("legacy Kenji query view remains compatibility-only", () => {
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/kenji?view=model-link")), true);
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/kenji")), false);
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/studio?view=model-link")), false);
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/kenji?view=model-link", { method: "POST" })), false);
});

test("unauthenticated owner login restores to the canonical model-link route on both production hosts", () => {
  const expectedApex = "https://mmdbkk.com/internal/admin/login?next=%2Finternal%2Fadmin%2Fmodel-link";
  const expectedWww = "https://www.mmdbkk.com/internal/admin/login?next=%2Finternal%2Fadmin%2Fmodel-link";
  assert.equal(modelLineLinkLoginLocation(new Request("https://mmdbkk.com/internal/admin/model-link")), expectedApex);
  assert.equal(modelLineLinkLoginLocation(new Request("https://www.mmdbkk.com/internal/admin/model-link")), expectedWww);
  assert.equal(modelLineLinkLoginLocation(new Request("https://mmdbkk.com/internal/admin/kenji?view=model-link")), expectedApex);
  assert.equal(modelLineLinkLoginLocation(new Request("https://www.mmdbkk.com/internal/admin/kenji?view=model-link")), expectedWww);
});

test("legacy owner view canonicalizes to the exact model-link path", () => {
  assert.equal(
    modelLineLinkCanonicalLocation(new Request("https://mmdbkk.com/internal/admin/kenji?view=model-link")),
    "https://mmdbkk.com/internal/admin/model-link",
  );
  assert.equal(
    modelLineLinkCanonicalLocation(new Request("https://www.mmdbkk.com/internal/admin/kenji?view=model-link")),
    "https://www.mmdbkk.com/internal/admin/model-link",
  );
});

test("pending claims use only the explicit activation-candidates queue mode", () => {
  assert.equal(isModelLineLinkClaimsRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?mode=line-link-claims")), true);
  assert.equal(isModelLineLinkClaimsRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates")), false);
  assert.equal(isModelLineLinkClaimsRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?mode=line-link-candidates")), false);
});

test("candidate search uses only the explicit line-link candidate mode", () => {
  assert.equal(isModelLineLinkCandidatesRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?mode=line-link-candidates&q=Mek")), true);
  assert.equal(isModelLineLinkCandidatesRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?q=Mek")), false);
});

test("owner bind mutation requires the explicit bind mode", () => {
  assert.equal(isModelLineLinkBindPayload({ mode: MODEL_LINE_LINK_BIND_MODE }), true);
  assert.equal(isModelLineLinkBindPayload({ mode: "issue" }), false);
  assert.equal(isModelLineLinkBindPayload(null), null);
});

test("LINE picture snapshot accepts HTTPS only", () => {
  assert.equal(normalizeLinePictureUrl("https://profile.line-scdn.net/avatar/abc"), "https://profile.line-scdn.net/avatar/abc");
  assert.equal(normalizeLinePictureUrl("http://example.com/avatar.jpg"), "");
  assert.equal(normalizeLinePictureUrl("data:image/png;base64,abc"), "");
  assert.equal(normalizeLinePictureUrl("javascript:alert(1)"), "");
  assert.equal(normalizeLinePictureUrl("not a url"), "");
  assert.equal(normalizeLinePictureUrl(""), "");
});

test("admin-safe avatar summary never exposes raw LINE User ID", () => {
  const item = safeClaimSummaryWithAvatar({
    fields: {
      claim_id: "model_line_0123456789abcdef01234567",
      line_user_id: "U0123456789abcdef0123456789abcdef",
      line_user_id_hash: "abcdef0123456789",
      line_display_name: "Jirakit 42",
      line_picture_url: "https://profile.line-scdn.net/avatar/abc",
      line_environment: "published",
      claim_status: "verified_unlinked",
      verified_at: "2026-09-11T07:00:00.000Z",
    },
  });
  assert.equal(item.line_picture_url, "https://profile.line-scdn.net/avatar/abc");
  assert.equal(item.line_ref, "abcdef01");
  assert.equal(Object.hasOwn(item, "line_user_id"), false);
});

test("admin picture sanitizer drops invalid or overlong URLs", () => {
  assert.equal(safePictureUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(safePictureUrl("http://example.com/a.jpg"), "");
  assert.equal(safePictureUrl(`https://example.com/${"a".repeat(2050)}`), "");
});

test("owner review HTML provides lazy avatar and initials fallback without changing explicit LINK", async () => {
  const response = renderModelLineLinkPageWithAvatar();
  const html = await response.text();
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /class="initial"/);
  assert.match(html, /onerror="this\.remove\(\)"/);
  assert.match(html, /confirm:true/);
  assert.match(html, /ไม่เดาจากชื่อหรือรูป LINE/);
});
