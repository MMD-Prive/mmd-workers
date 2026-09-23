import test from "node:test";
import assert from "node:assert/strict";
import {
  isMemberModelWishDashboardRequest,
  linkedSessionIdsForClient,
  projectPastClientModelWish,
} from "./src/member-model-wish-notes.js";

const MODEL_ID = "recModel12345678";

function wishRecord(payload = {}, fields = {}) {
  return {
    id: "recWish123456789",
    fields: {
      campaign_id: "mmd_year_6_model_direct_wish",
      wish_status: "completed",
      submitted_at: "2026-09-18T01:00:00.000Z",
      updated_at: "2026-09-18T02:00:00.000Z",
      payload_json: JSON.stringify({
        wish_kind: "model_direct_wish",
        model_record_id: MODEL_ID,
        model_display_name: "Tart",
        birthday_wish: "สุขสันต์วันเกิด 6 ปี MMD ครับ",
        mmd_message: "ข้อความถึง MMD ที่ลูกค้าไม่ควรเห็น",
        private_note_per: "ข้อความส่วนตัวถึงพี่เปอร์",
        private_note_scope: "per_only",
        past_clients_consent: true,
        telegram_consent: true,
        review: { decision: "approve", reviewed_at: "2026-09-18T02:00:00.000Z" },
        media_ids: ["media_secret"],
        ...payload,
      }),
      ...fields,
    },
  };
}

test("private Model notes augment only the canonical MY MMD dashboard read", () => {
  assert.equal(isMemberModelWishDashboardRequest(new Request("https://mmdbkk.com/api/member/app/dashboard")), true);
  assert.equal(isMemberModelWishDashboardRequest(new Request("https://mmdbkk.com/api/member/app/profile")), false);
  assert.equal(isMemberModelWishDashboardRequest(new Request("https://mmdbkk.com/api/member/app/dashboard", { method: "POST" })), false);
});

test("approved past-client Wish projects only safe birthday text and display name", () => {
  const note = projectPastClientModelWish(wishRecord(), new Set([MODEL_ID]));
  assert.deepEqual(note, {
    type: "model_wish",
    visibility: "past_client_private",
    model_name: "Tart",
    text: "สุขสันต์วันเกิด 6 ปี MMD ครับ",
    submitted_at: "2026-09-18T01:00:00.000Z",
    approved_at: "2026-09-18T02:00:00.000Z",
  });
  assert.equal(JSON.stringify(note).includes("ข้อความถึง MMD"), false);
  assert.equal(JSON.stringify(note).includes("ข้อความส่วนตัวถึงพี่เปอร์"), false);
  assert.equal(JSON.stringify(note).includes(MODEL_ID), false);
  assert.equal(JSON.stringify(note).includes("media_secret"), false);
});

test("past-client projection fails closed without exact canonical Model linkage", () => {
  assert.equal(projectPastClientModelWish(wishRecord(), new Set()), null);
  assert.equal(projectPastClientModelWish(wishRecord(), new Set(["recOther1234567"])), null);
});

test("past-client projection requires explicit consent and completed direct campaign", () => {
  assert.equal(projectPastClientModelWish(wishRecord({ past_clients_consent: false }), new Set([MODEL_ID])), null);
  assert.equal(projectPastClientModelWish(wishRecord({}, { wish_status: "manual_review" }), new Set([MODEL_ID])), null);
  assert.equal(projectPastClientModelWish(wishRecord({}, { campaign_id: "mmd_year_6_model_wish" }), new Set([MODEL_ID])), null);
});

test("Per-only note never becomes the customer note when birthday Wish is missing", () => {
  assert.equal(projectPastClientModelWish(wishRecord({ birthday_wish: "" }), new Set([MODEL_ID])), null);
});


test("Past Clients can resolve exact canonical Sessions without email or display-name anchors", () => {
  const ids = linkedSessionIdsForClient({
    id: "recClient1234567",
    fields: {
      Sessions: ["recSessA123456789", "recSessB123456789"],
      Sessions_v2: [{ id: "recSessB123456789" }, { id: "recSessC123456789" }],
      "Sessions V2": ["recSessD123456789"],
    },
  });
  assert.deepEqual(ids, [
    "recSessA123456789",
    "recSessB123456789",
    "recSessC123456789",
    "recSessD123456789",
  ]);
});
