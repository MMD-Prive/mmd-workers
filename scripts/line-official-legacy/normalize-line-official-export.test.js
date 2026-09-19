const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeRow,
  parseContactProfileNote,
} = require("./normalize-line-official-export.js");

const NOTE = [
  "🔺 email google drive : bhutorn@gmail.com",
  "🔺 Mob no : 0869972737",
  "🔺 Line ID : Bhutorn",
  "🔺 Telegram : @username",
  "@garry23892",
  "🔺 Telegram First - Last Name : Garry",
].join("\n");

test("extracts contact-profile evidence from LINE OFC note", () => {
  const profile = parseContactProfileNote(NOTE);
  assert.equal(profile.email_candidate, "bhutorn@gmail.com");
  assert.equal(profile.phone_candidate, "0869972737");
  assert.equal(profile.line_handle_candidate, "Bhutorn");
  assert.equal(profile.telegram_username_candidate, "garry23892");
  assert.equal(profile.telegram_name_candidate, "Garry");
  assert.equal(profile.has_contact_evidence, true);
});

test("human LINE ID from note never replaces canonical LINE user subject", () => {
  const canonicalLineUserId = "Uc4688a9f8aa41e1f5aefc4b71f3bee79";
  const record = normalizeRow({
    label: "เอ็ม 10 กย 69",
    line_user_id: canonicalLineUserId,
    tags: "#client #purchased #memSep26",
    note: NOTE,
  }, "line-ofc.json", 0);

  assert.equal(record.line_user_id, canonicalLineUserId);
  assert.equal(record.line_id, "");
  assert.equal(record.line_handle_candidate, "Bhutorn");
  assert.equal(record.email_candidate, "bhutorn@gmail.com");
  assert.equal(record.phone_candidate, "0869972737");
  assert.equal(record.telegram_username_candidate, "garry23892");
  assert.ok(record.recommended_actions.includes("stage_contact_profile_review"));
});
