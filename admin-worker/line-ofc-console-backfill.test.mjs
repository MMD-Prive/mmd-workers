import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientPatch,
  buildStagingRecordFields,
  extractLineOfcIdentityEvidence,
  isCanonicalLineUserId,
  mergeLineOfcIdentity,
  selectIdentitySnapshot,
} from "./src/line-ofc-console-backfill.js";

const LINE_A = "U62d21b4825bc642693494f312c8f6e2a";
const LINE_B = "U2d1e61210bb6f740f0f56b865374e63c";

test("accepts every real LINE identity regardless of #client tag", () => {
  assert.equal(isCanonicalLineUserId(LINE_A), true);
  assert.equal(isCanonicalLineUserId("Upricingfinal17786585150703"), false);
  assert.equal(isCanonicalLineUserId("img_4348eb30_mo2zumph"), false);

  const evidence = extractLineOfcIdentityEvidence({
    id: "rec_plain_customer",
    createdTime: "2026-09-14T01:00:00.000Z",
    fields: {
      line_user_id: LINE_A,
      member_name: "คุณเอ",
      admin_note: "ทั่วไป ไม่มีแท็ก client",
      legacy_tags: "line_webhook, event:message",
    },
  });

  assert.equal(evidence.line_user_id, LINE_A);
  assert.equal(selectIdentitySnapshot(evidence).display_name, "คุณเอ");
});

test("extracts structured and explicitly labelled contact details without copying raw chat", async () => {
  const evidence = extractLineOfcIdentityEvidence({
    id: "rec_contact",
    createdTime: "2026-09-14T02:00:00.000Z",
    fields: {
      line_user_id: LINE_B,
      member_name: "แมค VIP",
      member_email: "MAC@Example.com",
      member_phone: "+66 81 234 5678",
      telegram_username: "@mac_private",
      admin_note: "ชื่อไลน์: Meem\nTelegram: @mac_backup\nข้อความส่วนตัวที่ไม่ควรถูกคัดลอก",
    },
  });
  const snapshot = selectIdentitySnapshot(evidence);
  assert.equal(snapshot.email, "mac@example.com");
  assert.equal(snapshot.phone, "0812345678");
  assert.equal(snapshot.telegram_username, "mac_private");
  assert.ok(snapshot.aliases.includes("แมค VIP"));
  assert.ok(snapshot.aliases.includes("Meem"));

  const staging = await buildStagingRecordFields(evidence, { client: null, match_type: "unmatched", conflict_types: [] }, "2026-09-14T03:00:00.000Z");
  const serialized = JSON.stringify(staging.fields);
  assert.equal(staging.status, "review_required", "multiple Telegram candidates require review");
  assert.equal(serialized.includes("ข้อความส่วนตัว"), false);
  assert.equal(serialized.includes("raw conversation omitted"), true);
});

test("merges repeated messages into one deterministic LINE identity", () => {
  const first = extractLineOfcIdentityEvidence({
    id: "rec_1",
    createdTime: "2026-09-01T00:00:00.000Z",
    fields: { line_user_id: LINE_A, member_name: "เจ", member_email: "j@example.com" },
  });
  const second = extractLineOfcIdentityEvidence({
    id: "rec_2",
    createdTime: "2026-09-02T00:00:00.000Z",
    fields: { line_user_id: LINE_A, line_renamed_name: "เจ SVIP", member_phone: "098-550-1084" },
  });
  const merged = mergeLineOfcIdentity(first, second);
  const snapshot = selectIdentitySnapshot(merged);

  assert.equal(snapshot.message_count, 2);
  assert.equal(snapshot.line_user_id, LINE_A);
  assert.equal(snapshot.email, "j@example.com");
  assert.equal(snapshot.phone, "0985501084");
  assert.equal(snapshot.display_name, "เจ SVIP");
  assert.deepEqual(snapshot.aliases.slice(0, 2), ["เจ SVIP", "เจ"]);
});

test("uses an internal fallback name only when LINE OFC has no usable customer name", () => {
  const evidence = extractLineOfcIdentityEvidence({
    id: "rec_no_name",
    createdTime: "2026-09-14T01:00:00.000Z",
    fields: {
      line_user_id: LINE_B,
      member_name: "line_webhook, event:message, message:text, has_text",
      legacy_tags: "#client #purchased",
    },
  });
  const snapshot = selectIdentitySnapshot(evidence);
  assert.equal(snapshot.display_name, `LINE OFC • ${LINE_B.slice(-6)}`);
  assert.equal(snapshot.has_customer_name, false);
  assert.ok(snapshot.conflict_types.includes("missing_customer_name"));
});

test("fills blank canonical contact fields but never overwrites existing truth", () => {
  const snapshot = {
    line_user_id: LINE_A,
    display_name: "คุณเอ",
    has_customer_name: true,
    email: "new@example.com",
    email_candidates: ["new@example.com"],
    phone: "0812345678",
    phone_candidates: ["0812345678"],
    telegram_username: "new_user",
    telegram_username_candidates: ["new_user"],
  };

  const blank = buildClientPatch({ id: "rec_client", fields: {} }, snapshot);
  assert.equal(blank.conflict, "");
  assert.equal(blank.fields.fld5HfSGChKFbd4uh, LINE_A);
  assert.equal(blank.fields.fldQ8TKFjyxs0Cjrk, "new@example.com");
  assert.equal(blank.fields.fldNI0R5d9Y3ILPcO, "0812345678");
  assert.equal(blank.fields.fldLPIcKLrZBQr9iU, "new_user");

  const existing = buildClientPatch({
    id: "rec_client",
    fields: {
      line_user_id: LINE_A,
      "Contact Email": "keep@example.com",
      "Phone Number": "0899999999",
      telegram_username: "keep_user",
      line_display_name: "ชื่อเดิม",
      mmd_client_name: "ชื่อเดิม",
      nickname: "ชื่อเดิม",
      source: "manual",
      primary_channel: "LINE",
    },
  }, snapshot);
  assert.equal(existing.conflict, "");
  assert.equal(Object.keys(existing.fields).length, 0);
});

test("blocks canonical write when an existing Client has another LINE user id", () => {
  const snapshot = {
    line_user_id: LINE_A,
    display_name: "คุณเอ",
    has_customer_name: true,
    email: "",
    email_candidates: [],
    phone: "",
    phone_candidates: [],
    telegram_username: "",
    telegram_username_candidates: [],
  };
  const planned = buildClientPatch({ id: "rec_client", fields: { line_user_id: LINE_B } }, snapshot);
  assert.equal(planned.conflict, "client_line_user_id_conflict");
  assert.deepEqual(planned.fields, {});
});
