import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PUBLIC_PROMOTION_EVIDENCE_SCHEMA,
  selectPublishedPromotionEvidence,
} from "../src/kenji-public-promotion-evidence.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const digestCopy = async (copy) => sha(copy);
const LIVE_NOW = Date.parse("2026-11-20T18:30:00+07:00");
const ENDED_NOW = Date.parse("2026-12-01T00:00:00+07:00");
const COPY = "CARE BACK รอบประกาศพฤศจิกายนดูรายละเอียดได้จากประกาศของ MMD ครับ สิทธิ์เฉพาะสมาชิกต้องให้ MY MMD ตรวจสอบ";

function fixture(now = LIVE_NOW) {
  return {
    schema_version: PUBLIC_PROMOTION_EVIDENCE_SCHEMA,
    authority: "mmd_promotion_evidence_registry",
    read_only: true,
    observed_at: new Date(now - 1000).toISOString(),
    campaigns: [{
      campaign_id: "care-back-november-2026",
      audience: "public",
      approval: {
        state: "approved",
        approved_by: "Boss Per",
        approved_at: "2026-11-18T16:00:00+07:00",
        approval_ref: "review-copy-20261118",
        copy_th: COPY,
        copy_sha256: sha(COPY),
      },
      publication: {
        state: "published",
        public_url: "https://www.mmdbkk.com/promotion/6-years-care-back",
        published_at: "2026-11-19T23:00:00+07:00",
        publish_ref: "webflow-publish-event-reviewed",
        revision: "webflow-matched-revision",
        copy_sha256: sha(COPY),
      },
      display_window: {
        starts_at: "2026-11-01T00:00:00+07:00",
        ends_before: "2026-12-01T00:00:00+07:00",
      },
      source_revision: {
        policy_git_blob_sha: "36c09b80beeadd3afab3f9355422e7034b8eb56e",
        approval_revision: "review-copy-20261118",
        publication_revision: "webflow-matched-revision",
        approved_copy_sha256: sha(COPY),
        published_copy_sha256: sha(COPY),
      },
    }],
  };
}

const select = (record, now = LIVE_NOW) =>
  selectPublishedPromotionEvidence(record, { now, digestCopy });

test("only an attested, current public promotion can become a deterministic reply", async () => {
  const candidate = fixture();
  candidate.campaigns[0].member_id = "not-for-public";
  const result = await select(candidate);
  assert.equal(result.ok, true);
  assert.equal(result.state, "published");
  assert.equal(result.campaign_id, "care-back-november-2026");
  assert.equal(result.reply, COPY);
  assert.equal(result.public_url, "https://www.mmdbkk.com/promotion/6-years-care-back");
  assert.equal(JSON.stringify(result).includes("member_id"), false);
});

test("announcement expiry never inherits payment-honor expiry", async () => {
  const expired = await select(fixture(ENDED_NOW), ENDED_NOW);
  assert.equal(expired.ok, true);
  assert.equal(expired.state, "announcement_expired");
  assert.equal(expired.reply, null);
  const wrongWindow = fixture();
  wrongWindow.campaigns[0].display_window.ends_before = "2027-01-01T00:00:00+07:00";
  assert.equal((await select(wrongWindow)).reason, "canonical_policy_mismatch");
});

test("missing, stale, ambiguous or untrusted registry evidence fails closed", async () => {
  assert.equal((await select(null)).ok, false);
  const stale = fixture();
  stale.observed_at = "2026-11-19T00:00:00+07:00";
  assert.equal((await select(stale)).reason, "evidence_not_fresh");
  const multiple = fixture();
  multiple.campaigns.push(structuredClone(multiple.campaigns[0]));
  assert.equal((await select(multiple)).reason, "unambiguous_campaign_required");
  const fakeAuthority = fixture();
  fakeAuthority.authority = "legacy_knowledge_card";
  assert.equal((await select(fakeAuthority)).reason, "contract_unavailable");
});

test("missing owner approval, source revisions, publication, or integrity fails closed", async () => {
  const cases = [
    (s) => { s.campaigns[0].approval.state = "review"; },
    (s) => { s.campaigns[0].approval.approval_ref = ""; },
    (s) => { s.campaigns[0].publication.state = "draft"; },
    (s) => { s.campaigns[0].publication.public_url = "https://evil.example/promotion/care-back"; },
    (s) => { s.campaigns[0].publication.public_url = "https://www.mmdbkk.com/promotion/6-years-care-back-preview"; },
    (s) => { s.campaigns[0].source_revision.policy_git_blob_sha = "a".repeat(40); },
    (s) => { s.campaigns[0].source_revision.approved_copy_sha256 = "a".repeat(64); },
    (s) => { s.campaigns[0].publication.copy_sha256 = "a".repeat(64); },
    (s) => { s.campaigns[0].approval.copy_th = COPY + " เปลี่ยนข้อมูลโดยไม่ขออนุมัติ"; },
    (s) => { s.campaigns[0].display_window.ends_before = "2026-10-31T23:59:59+07:00"; },
    (s) => { s.campaigns[0].audience = "member"; },
  ];
  for (const mutation of cases) {
    const candidate = fixture();
    mutation(candidate);
    const result = await select(candidate);
    assert.equal(result.ok, false, JSON.stringify(candidate.campaigns[0]));
  }
});
