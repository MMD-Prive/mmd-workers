import assert from "node:assert/strict";
import test from "node:test";

import {
  KENJI_FOLDER_ASSESSMENT_CANARY_ENV,
  KENJI_FOLDER_ASSESSMENT_ENABLED_ENV,
  findFolderMentionInText,
  runKenjiFolderHistoryAssessment,
} from "../src/kenji-folder-history-adapter.mjs";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeAirtableFetch(calls) {
  return async (url, init = {}) => {
    const decoded = decodeURIComponent(String(url));
    calls.push({ url: String(url), decoded, init });
    if (init.method === "POST") return response({ records: [{ id: "recAssessment123" }] });
    if (decoded.includes("MMD — Model Keyword Profiles")) {
      return response({
        records: [{
          id: "recKeyword1",
          fields: {
            model_key: "kenji-01",
            folder_name: "Kenji Model 01",
            working_name: "Kenji",
            search_aliases: "KJ01",
            status: "active",
            include_in_public_kenji: "Yes",
          },
        }],
      });
    }
    if (decoded.includes("MMD — Console Inbox")) {
      return response({
        records: [
          {
            id: "recInbox1",
            fields: {
              line_id: "msg-1",
              inbox_id: "line_msg-1",
              source: "line",
              created_at: "2026-09-02T10:00:00.000Z",
              admin_note: "อยากจอง Kenji Model 01 คืนนี้ ราคาเท่าไร ติดต่อ 0812345678",
              payload_json: JSON.stringify({
                raw_text: "อยากจอง Kenji Model 01 คืนนี้ ราคาเท่าไร ติดต่อ test@example.com",
              }),
            },
          },
        ],
      });
    }
    throw new Error("unexpected Airtable request");
  };
}

test("feature flag is fail-closed and performs no reads when disabled", async () => {
  const calls = [];
  const result = await runKenjiFolderHistoryAssessment({
    env: {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_BASE_ID: "appTest",
      [KENJI_FOLDER_ASSESSMENT_ENABLED_ENV]: "false",
      [KENJI_FOLDER_ASSESSMENT_CANARY_ENV]: await hash(LINE_USER_ID),
    },
    event: { source: { userId: LINE_USER_ID }, message: { type: "text", text: "Kenji Model 01" } },
    fetchImpl: fakeAirtableFetch(calls),
  });
  assert.equal(result.reason, "feature_flag_off");
  assert.equal(calls.length, 0);
});

test("canary allowlist prevents non-canary customer history reads", async () => {
  const calls = [];
  const result = await runKenjiFolderHistoryAssessment({
    env: {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_BASE_ID: "appTest",
      [KENJI_FOLDER_ASSESSMENT_ENABLED_ENV]: "true",
      [KENJI_FOLDER_ASSESSMENT_CANARY_ENV]: await hash("U00000000000000000000000000000000"),
    },
    event: { source: { userId: LINE_USER_ID }, message: { type: "text", text: "Kenji Model 01" } },
    fetchImpl: fakeAirtableFetch(calls),
  });
  assert.equal(result.reason, "not_in_canary");
  assert.equal(calls.length, 0);
});

test("folder matching is deterministic and reports collisions", () => {
  const catalog = [
    { model_key: "a", folder_name: "Kenji Model 01", aliases: [] },
    { model_key: "b", folder_name: "Kenji Model 01", aliases: [] },
  ];
  assert.equal(findFolderMentionInText("ขอ Kenji Model 01 ครับ", catalog).status, "ambiguous");
});

test("canary adapter reads same-customer history and persists only redacted assessment fields", async () => {
  const calls = [];
  const result = await runKenjiFolderHistoryAssessment({
    env: {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_BASE_ID: "appTest",
      [KENJI_FOLDER_ASSESSMENT_ENABLED_ENV]: "true",
      [KENJI_FOLDER_ASSESSMENT_CANARY_ENV]: await hash(LINE_USER_ID),
    },
    event: {
      type: "message",
      source: { userId: LINE_USER_ID },
      message: { id: "msg-current", type: "text", text: "ขอจอง Kenji Model 01 คืนนี้ครับ" },
    },
    fetchImpl: fakeAirtableFetch(calls),
    now: new Date("2026-09-02T12:00:00.000Z"),
  });

  assert.equal(result.persisted, true);
  assert.equal(result.folder_status, "matched");
  assert.equal(result.model_key, "kenji-01");
  assert.equal(result.decision, "backend_check_required");

  const getCalls = calls.filter((call) => call.init.method === "GET");
  assert.equal(getCalls.length, 2);
  assert.match(getCalls[1].decoded, /line_user_id/);
  assert.match(getCalls[1].decoded, /source/);

  const post = calls.find((call) => call.init.method === "POST");
  assert.ok(post);
  const body = JSON.parse(post.init.body);
  const fields = body.records[0].fields;
  assert.equal(fields.rollout_stage, "internal_canary");
  assert.equal(fields.redaction_status, "redacted");
  assert.equal(fields.customer_reply_safe, "true");
  assert.doesNotMatch(JSON.stringify(fields), /0812345678|test@example.com|U1234567890|อยากจอง/);
  assert.doesNotMatch(JSON.stringify(fields), /raw_text|admin_note|payload_json/);
});
