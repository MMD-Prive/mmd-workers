const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildStagingFields, duplicateImportIds, runDryRunImport } = require("./dry-run-import.js");
const {
  isNeverCommittableWithoutReview,
  isPotentiallyReadyAfterManualReview,
  normalizeRow,
  summarizeRows,
} = require("./review-report.js");
const { buildBackfillPlan } = require("./member-token-backfill-plan.js");
const { buildBackfillUpdates, runBackfill } = require("./member-token-backfill.js");

function tempCsv(content) {
  const file = path.join(os.tmpdir(), `line-ofc-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(file, content);
  return file;
}

test("dry-run writes staging only and never patches Clients", async () => {
  const file = tempCsv("nickname,line_user_id,tags\nPaul #client #mem24,U1,#client\n");
  const calls = [];
  const airtable = {
    list: async (table, query) => {
      calls.push({ action: "list", table, query });
      if (table === "tblVv58TCbwh5j1fS") {
        return [{ id: "recClient1", fields: { line_user_id: "U1", "Client Name": "Paul" } }];
      }
      return [];
    },
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return null;
    },
    requestWithFieldFallback: async (table, init) => {
      calls.push({ action: "requestWithFieldFallback", table, init });
      return { id: "stg1", fields: init.body.fields };
    },
  };

  const result = await runDryRunImport({ file, batchId: "batch_test", airtable });
  assert.equal(result.count, 1);
  assert.equal(result.results[0].match_type, "exact_line_user_id");
  assert.equal(
    calls.some((call) => call.table === "tblVv58TCbwh5j1fS" && ["PATCH", "POST"].includes(call.init?.method)),
    false,
  );
  assert.ok(calls.some((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST"));
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(stagingCall.init.body.fields.dry_run_only, true);
  assert.equal(stagingCall.init.body.fields.parsed_client_level, "premium");
  assert.equal(stagingCall.init.body.fields.parsed_membership_status, "member");
  const membershipParse = JSON.parse(stagingCall.init.body.fields.membership_parse_json);
  assert.equal(membershipParse.client_level, "premium");
  assert.ok(membershipParse.parse_warnings.includes("inferred_premium_from_member_signal"));
  assert.deepEqual(membershipParse.all_member_tokens, ["#mem24"]);
  assert.equal(membershipParse.chosen_member_since_token, "#mem24");
  assert.equal(membershipParse.chosen_member_since_strategy, "only_valid_member_token");
  assert.deepEqual(membershipParse.member_since_candidates, [{ token: "#mem24", member_since: "2024", warning: "" }]);
  assert.equal(stagingCall.init.body.fields.proposed_points, 0);
  assert.equal(stagingCall.init.body.fields.points_review_required, "false");
  assert.match(stagingCall.init.body.fields.created_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("duplicate import_id remains impossible before staging writes", async () => {
  const { airtable, calls } = consoleInboxAirtable({
    sourceRecords: [
      { id: "recDup1", fields: { inbox_id: "same", member_name: "One" } },
      { id: "recDup2", fields: { inbox_id: "same", member_name: "Two" } },
    ],
  });

  await assert.rejects(
    () => runDryRunImport({ source: "console-inbox", batchId: "batch_dupe", airtable }),
    /duplicate_import_id:line_ofc_console_same/,
  );
  assert.equal(calls.some((call) => call.table === "tbl1u0foFBvgFpT9G" && ["POST", "PATCH"].includes(call.init?.method)), false);
  assert.deepEqual(duplicateImportIds([{ import_id: "a" }, { import_id: "b" }, { import_id: "a" }]), ["a"]);
});

test("dry-run staging fields do not introduce a field named token", () => {
  const fields = buildStagingFields({
    row: { __row: 1, nickname: "Paul #client", line_renamed_name: "Paul #client", tags: "#client" },
    rowIndex: 0,
    sourceFile: "sample.csv",
    batchId: "batch_no_token",
    parsed: {
      line_user_id: "",
      line_display_name: "",
      line_renamed_name: "Paul #client",
      line_tags_raw: "#client",
      detected_tags: ["#client"],
      normalized_name: "paul",
      client_level: "premium",
      client_level_raw: "#client",
      client_level_tokens: [],
      membership_status: "member",
      membership_tier: "none",
      membership_package: "none",
      member_since: "",
      member_since_raw: "",
      has_purchased: false,
      parse_confidence: 0.8,
    },
    match: { matchedClient: "", matchType: "no_match", matchConfidence: 0, reviewStatus: "staging_only" },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(fields, "token"), false);
});

test("dry-run omits empty parsed_member_since date field", async () => {
  const file = tempCsv("nickname,line_user_id,tags\nVisitor,U-empty,\n");
  const calls = [];
  const airtable = {
    list: async (table, query) => {
      calls.push({ action: "list", table, query });
      return [];
    },
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return null;
    },
    requestWithFieldFallback: async (table, init) => {
      calls.push({ action: "requestWithFieldFallback", table, init });
      return { id: "stgEmptyDate", fields: init.body.fields };
    },
  };

  await runDryRunImport({ file, batchId: "batch_empty_date", airtable });
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(Object.prototype.hasOwnProperty.call(stagingCall.init.body.fields, "parsed_member_since"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stagingCall.init.body.fields, "parsed_membership_status"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stagingCall.init.body.fields, "parsed_membership_tier"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stagingCall.init.body.fields, "parsed_membership_package"), false);
  assert.equal(stagingCall.init.body.fields.parsed_client_level, "guest");
  assert.equal(stagingCall.init.body.fields.parsed_member_since_raw, "");
});

test("dry-run stages historical note points evidence only", async () => {
  const file = tempCsv("nickname,line_user_id,tags,note\nPaul #client,U1,#client,\"Booking service 12,000 THB plus MMD tip 1,000 THB\"\n");
  const calls = [];
  const airtable = {
    list: async (table) => {
      calls.push({ action: "list", table });
      if (table === "tblVv58TCbwh5j1fS") return [{ id: "recClient1", fields: { line_user_id: "U1" } }];
      return [];
    },
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return null;
    },
    requestWithFieldFallback: async (table, init) => {
      calls.push({ action: "requestWithFieldFallback", table, init });
      return { id: "stgNote", fields: init.body.fields };
    },
  };

  await runDryRunImport({ file, batchId: "batch_note", airtable });
  assert.equal(
    calls.some((call) => ["tbl5dfnwjUFMLbnWL", "tblWGGJJOx5eBvBZJ", "tblgWc5VRon5o8Mhk"].includes(call.table)),
    false,
  );
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(stagingCall.init.body.fields.raw_note, "Booking service 12,000 THB plus MMD tip 1,000 THB");
  assert.equal(stagingCall.init.body.fields.service_amount, 12000);
  assert.equal(stagingCall.init.body.fields.tip_amount_mmd, 1000);
  assert.equal(stagingCall.init.body.fields.points_eligible_amount, 12000);
  assert.equal(stagingCall.init.body.fields.proposed_points, 120);
});

test("dry-run preserves raw note exactly in staging", async () => {
  const file = tempCsv("nickname,line_user_id,tags,note\nPaul,U1,,\"  Booking service 1,000 THB\nsecond line  \"\n");
  const calls = [];
  const airtable = {
    list: async (table) => {
      calls.push({ action: "list", table });
      return [];
    },
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return null;
    },
    requestWithFieldFallback: async (table, init) => {
      calls.push({ action: "requestWithFieldFallback", table, init });
      return { id: "stgRawNote", fields: init.body.fields };
    },
  };

  await runDryRunImport({ file, batchId: "batch_raw_note", airtable });
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(stagingCall.init.body.fields.raw_note, "  Booking service 1,000 THB\nsecond line  ");
  assert.equal(stagingCall.init.body.fields.service_amount, 1000);
});

test("fuzzy and multiple matches are review only", async () => {
  const fuzzyFile = tempCsv("nickname,line_user_id,tags\nPaul #client,,#client\n");
  const fuzzyCalls = [];
  const fuzzyAirtable = {
    list: async (table, query) => {
      fuzzyCalls.push({ table, query });
      if (table === "tblVv58TCbwh5j1fS") return [{ id: "recFuzzy", fields: { "Client Name": "Paul" } }];
      return [];
    },
    findOne: async () => null,
    requestWithFieldFallback: async (_table, init) => ({ id: "stgFuzzy", fields: init.body.fields }),
  };
  const fuzzy = await runDryRunImport({ file: fuzzyFile, batchId: "batch_fuzzy", airtable: fuzzyAirtable });
  assert.equal(fuzzy.results[0].match_type, "fuzzy_name");
  assert.equal(fuzzy.results[0].review_status, "review_required");

  const multiFile = tempCsv("nickname,line_user_id,tags\nPaul #client,U2,#client\n");
  const multiAirtable = {
    list: async (table) => {
      if (table === "tblVv58TCbwh5j1fS") {
        return [
          { id: "rec1", fields: { line_user_id: "U2" } },
          { id: "rec2", fields: { line_user_id: "U2" } },
        ];
      }
      return [];
    },
    findOne: async () => null,
    requestWithFieldFallback: async (_table, init) => ({ id: "stgMulti", fields: init.body.fields }),
  };
  const multiple = await runDryRunImport({ file: multiFile, batchId: "batch_multi", airtable: multiAirtable });
  assert.equal(multiple.results[0].match_type, "multiple_candidates");
  assert.equal(multiple.results[0].review_status, "review_required");
});

function consoleInboxAirtable({ sourceRecords, clientRecords = [] } = {}) {
  const calls = [];
  return {
    calls,
    airtable: {
      list: async (table, query) => {
        calls.push({ action: "list", table, query });
        if (table === "tblFHmfpB2TTrzO2e") return sourceRecords;
        if (table === "tblVv58TCbwh5j1fS") return clientRecords;
        return [];
      },
      findOne: async (table, formula) => {
        calls.push({ action: "findOne", table, formula });
        return null;
      },
      requestWithFieldFallback: async (table, init) => {
        calls.push({ action: "requestWithFieldFallback", table, init });
        return { id: `stg${calls.length}`, fields: init.body.fields };
      },
    },
  };
}

test("console-inbox mode writes staging only and never patches Clients", async () => {
  const { airtable, calls } = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInbox1",
        fields: {
          inbox_id: "inbox-001",
          member_name: "Paul #client #memMay24",
          member_email: "paul@example.com",
          member_phone: "0812345678",
          line_user_id: "U1",
          line_id: "paul_line",
          legacy_tags: "#client #purchased",
          admin_note: "console note",
          payload_json: "{\"phone\":\"0812345678\"}",
          "Canonical Client": ["recClient1"],
        },
      },
    ],
    clientRecords: [{ id: "recClient1", fields: { line_user_id: "U1", "Client Name": "Paul" } }],
  });

  const result = await runDryRunImport({ source: "console-inbox", batchId: "batch_console", airtable });

  assert.equal(result.source, "console-inbox");
  assert.equal(result.count, 1);
  assert.equal(result.results[0].match_type, "exact_line_user_id");
  assert.equal(
    calls.some((call) => call.table === "tblVv58TCbwh5j1fS" && ["PATCH", "POST"].includes(call.init?.method)),
    false,
  );
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.ok(stagingCall);
  assert.equal(stagingCall.init.body.fields.import_id, "line_ofc_console_inbox-001");
  assert.equal(stagingCall.init.body.fields.import_batch_id, "batch_console");
  assert.equal(stagingCall.init.body.fields.source_file_title, "airtable_console_inbox");
  assert.equal(stagingCall.init.body.fields.line_user_id, "U1");
  assert.equal(stagingCall.init.body.fields.line_display_name, "Paul #client #memMay24");
  assert.equal(stagingCall.init.body.fields.line_renamed_name, "Paul #client #memMay24");
  assert.equal(stagingCall.init.body.fields.line_tags_raw, "#client #purchased");
  assert.equal(stagingCall.init.body.fields.phone_candidate, "+66812345678");
  assert.equal(stagingCall.init.body.fields.email_candidate, "paul@example.com");
  assert.equal(stagingCall.init.body.fields.parsed_membership_status, "member");
  assert.equal(stagingCall.init.body.fields.parsed_client_level, "premium");
  assert.equal(stagingCall.init.body.fields.parsed_has_purchased, true);
  assert.equal(stagingCall.init.body.fields.parsed_member_since, "2024-05");
  const raw = JSON.parse(stagingCall.init.body.fields.raw_row_json);
  assert.equal(raw.member_email, "[redacted]");
  assert.equal(raw.member_phone, "[redacted]");
  assert.equal(raw.payload_json, "[redacted_payload_json]");
});

test("console-inbox legacy_tags client and purchased tags parse correctly", async () => {
  const { airtable, calls } = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInboxTags",
        fields: {
          inbox_id: "inbox-tags",
          member_name: "Nok",
          legacy_tags: "#client #purchased",
        },
      },
    ],
  });

  await runDryRunImport({ source: "console-inbox", batchId: "batch_tags", airtable });
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(stagingCall.init.body.fields.parsed_membership_status, "member");
  assert.equal(stagingCall.init.body.fields.parsed_has_purchased, true);
});

test("console-inbox member_name mem month-year tag parses member_since", async () => {
  const { airtable, calls } = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInboxMem",
        fields: {
          inbox_id: "inbox-mem",
          member_name: "Mint #memJun25",
        },
      },
    ],
  });

  await runDryRunImport({ source: "console-inbox", batchId: "batch_mem", airtable });
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(stagingCall.init.body.fields.parsed_member_since, "2025-06");
  assert.equal(stagingCall.init.body.fields.parsed_membership_status, "member");
  assert.ok(stagingCall.init.body.fields.parse_confidence <= 0.72);
});

test("console-inbox missing renamed name uses legacy tags and lowers confidence", async () => {
  const { airtable, calls } = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInboxMissingRename",
        fields: {
          inbox_id: "inbox-missing-rename",
          legacy_tags: "#client #memMay24",
        },
      },
    ],
  });

  await runDryRunImport({ source: "console-inbox", batchId: "batch_missing_rename", airtable });
  const stagingCall = calls.find((call) => call.table === "tbl1u0foFBvgFpT9G" && call.init?.method === "POST");
  assert.equal(stagingCall.init.body.fields.parsed_member_since, "2024-05");
  assert.ok(stagingCall.init.body.fields.parse_confidence <= 0.45);
  assert.match(stagingCall.init.body.fields.membership_parse_json, /line_renamed_name_fallback:missing/);
});

test("console-inbox fuzzy and multiple matches are review only", async () => {
  const fuzzy = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInboxFuzzy",
        fields: {
          inbox_id: "inbox-fuzzy",
          member_name: "Paul #client",
          legacy_tags: "#client",
        },
      },
    ],
    clientRecords: [{ id: "recFuzzy", fields: { "Client Name": "Paul" } }],
  });
  const fuzzyResult = await runDryRunImport({
    source: "console-inbox",
    batchId: "batch_console_fuzzy",
    airtable: fuzzy.airtable,
  });
  assert.equal(fuzzyResult.results[0].match_type, "fuzzy_name");
  assert.equal(fuzzyResult.results[0].review_status, "review_required");

  const multiple = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInboxMulti",
        fields: {
          inbox_id: "inbox-multi",
          member_name: "Paul #client",
          line_user_id: "U2",
          legacy_tags: "#client",
        },
      },
    ],
    clientRecords: [
      { id: "rec1", fields: { line_user_id: "U2" } },
      { id: "rec2", fields: { line_user_id: "U2" } },
    ],
  });
  const multipleResult = await runDryRunImport({
    source: "console-inbox",
    batchId: "batch_console_multi",
    airtable: multiple.airtable,
  });
  assert.equal(multipleResult.results[0].match_type, "multiple_candidates");
  assert.equal(multipleResult.results[0].review_status, "review_required");
});

test("console-inbox line_id is not treated as a high-confidence exact match", async () => {
  const { airtable } = consoleInboxAirtable({
    sourceRecords: [
      {
        id: "recInboxLineId",
        fields: {
          inbox_id: "inbox-line-id",
          line_id: "paul_line",
          legacy_tags: "#client",
        },
      },
    ],
    clientRecords: [{ id: "recLineId", fields: { line_id: "paul_line" } }],
  });

  const result = await runDryRunImport({ source: "console-inbox", batchId: "batch_console_line_id", airtable });
  assert.equal(result.results[0].match_type, "no_match");
  assert.equal(result.results[0].review_status, "staging_only");
});

test("review report marks review-only queues as never committable", () => {
  const records = [
    {
      id: "recReview",
      fields: {
        import_id: "line_ofc_console_review",
        import_batch_id: "batch_review",
        review_status: "review_required",
        match_type: "fuzzy_name",
        membership_parse_json: JSON.stringify({ membership_status: "member", membership_tier: "vip", membership_package: "premium" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", review_required: true }),
      },
    },
    {
      id: "recNoMatch",
      fields: {
        import_id: "line_ofc_console_no_match",
        import_batch_id: "batch_review",
        review_status: "staging_only",
        match_type: "no_match",
        membership_parse_json: JSON.stringify({ membership_status: "none", membership_tier: "none", membership_package: "none" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", review_required: true }),
      },
    },
    {
      id: "recMultiple",
      fields: {
        import_id: "line_ofc_console_multiple",
        import_batch_id: "batch_review",
        review_status: "review_required",
        match_type: "multiple_candidates",
        membership_parse_json: JSON.stringify({ membership_status: "none", membership_tier: "none", membership_package: "none" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", review_required: true }),
      },
    },
    {
      id: "recReady",
      fields: {
        import_id: "line_ofc_console_ready",
        import_batch_id: "batch_review",
        review_status: "ready_to_review",
        match_type: "exact_line_user_id",
        membership_parse_json: JSON.stringify({ membership_status: "none", membership_tier: "none", membership_package: "none" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", review_required: false }),
      },
    },
  ];

  const summary = summarizeRows(records);
  assert.equal(summary.review_required_rows, 2);
  assert.equal(summary.multiple_match_review_rows, 1);
  assert.equal(summary.member_vip_premium_rows, 1);
  assert.equal(summary.no_match_rows, 1);
  assert.equal(summary.rows_potentially_ready_after_manual_review, 1);
  assert.equal(summary.rows_unsafe_to_commit_now, 4);
  assert.equal(isNeverCommittableWithoutReview(summary.redacted_samples.review_required[0]), true);

  const normalized = records.map(normalizeRow);
  assert.equal(isPotentiallyReadyAfterManualReview(normalized[0]), false);
  assert.equal(isPotentiallyReadyAfterManualReview(normalized[1]), false);
  assert.equal(isPotentiallyReadyAfterManualReview(normalized[2]), false);
  assert.equal(isPotentiallyReadyAfterManualReview(normalized[3]), true);
  assert.equal(isNeverCommittableWithoutReview(normalized[0]), true);
  assert.equal(isNeverCommittableWithoutReview(normalized[1]), true);
  assert.equal(isNeverCommittableWithoutReview(normalized[2]), true);
});

test("member token backfill plan is dry-run and preserves raw token evidence", () => {
  const plan = buildBackfillPlan([
    {
      id: "recLegacy",
      fields: {
        import_id: "line_ofc_console_draft_jjeune_identity_immigration_20260512",
        membership_parse_json: JSON.stringify({
          membership_status: "member",
          member_since: "2025-04",
          member_since_raw: "#memjan24",
        }),
        parsed_member_since_raw: "#memjan24",
        raw_row_json: JSON.stringify({
          record_id: "recSource",
          inbox_id: "draft_jjeune_identity_immigration_20260512",
          member_name: "เจ - SVIP - (Jjeune)",
          line_id: "jjeune16",
          legacy_tags: "#client #vip #purchased #memjan24 #mem2024 #mem2025 #memApr25",
          line_renamed_name_source: "member_name",
        }),
        line_renamed_name: "เจ - SVIP - (Jjeune)",
        line_display_name: "เจ - SVIP - (Jjeune)",
        line_tags_raw: "#client #vip #purchased #memjan24 #mem2024 #mem2025 #memApr25",
      },
    },
  ]);

  assert.equal(plan.dry_run_only, true);
  assert.equal(plan.rows_needing_backfill, 1);
  assert.equal(plan.redacted_samples[0].next_member_since, "2025-04");
  assert.equal(plan.redacted_samples[0].next_member_since_raw, "#memApr25");
  assert.deepEqual(plan.redacted_samples[0].all_member_tokens, ["#memjan24", "#mem2024", "#mem2025", "#memApr25"]);
  assert.equal(plan.redacted_samples[0].chosen_member_since_token, "#memApr25");
  assert.equal(plan.redacted_samples[0].chosen_member_since_strategy, "latest_valid_member_token");
});

test("member token backfill updates only allowed staging fields", () => {
  const updates = buildBackfillUpdates([
    {
      id: "recLegacy",
      fields: {
        import_id: "line_ofc_console_draft",
        review_status: "review_required",
        match_type: "name_fuzzy_review",
        matched_client: ["recClient"],
        membership_parse_json: JSON.stringify({ member_since: "2025-04", member_since_raw: "#memjan24" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", member_since_raw: "#memjan24", review_required: true }),
        parsed_member_since: "2025-04-01",
        parsed_member_since_raw: "#memjan24",
        line_renamed_name: "เจ - SVIP - (Jjeune)",
        line_display_name: "เจ - SVIP - (Jjeune)",
        line_tags_raw: "#client #vip #purchased #memjan24 #mem2024 #mem2025 #memApr25",
      },
    },
  ]);

  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0].fields).sort(), [
    "membership_parse_json",
    "parsed_member_since",
    "parsed_member_since_raw",
    "proposed_entitlement_json",
  ]);
  assert.equal(updates[0].fields.parsed_member_since, "2025-04-01");
  assert.equal(updates[0].fields.parsed_member_since_raw, "#memApr25");
  const parse = JSON.parse(updates[0].fields.membership_parse_json);
  assert.equal(parse.chosen_member_since_token, "#memApr25");
  assert.deepEqual(parse.all_member_tokens, ["#memjan24", "#mem2024", "#mem2025", "#memApr25"]);
  const proposed = JSON.parse(updates[0].fields.proposed_entitlement_json);
  assert.equal(proposed.source, "line_ofc");
  assert.equal(proposed.member_since_raw, "#memApr25");
  assert.equal(proposed.review_required, true);
});

test("member token backfill patches staging only and keeps review status untouched", async () => {
  const calls = [];
  const records = [
    {
      id: "recrwS2H0Qr61RSqf",
      fields: {
        import_id: "line_ofc_console_draft",
        import_batch_id: "batch_backfill",
        review_status: "review_required",
        membership_parse_json: JSON.stringify({ member_since: "2025-04", member_since_raw: "#memjan24" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", member_since_raw: "#memjan24", review_required: true }),
        parsed_member_since: "2025-04-01",
        parsed_member_since_raw: "#memjan24",
        line_renamed_name: "เจ - SVIP - (Jjeune)",
        line_display_name: "เจ - SVIP - (Jjeune)",
        line_tags_raw: "#client #vip #purchased #memjan24 #mem2024 #mem2025 #memApr25",
      },
    },
  ];
  const airtable = {
    list: async (table, query) => {
      calls.push({ action: "list", table, query });
      return records;
    },
    requestBatchWithFieldFallback: async (table, init) => {
      calls.push({ action: "requestBatchWithFieldFallback", table, init });
      Object.assign(records[0].fields, init.body.records[0].fields);
      return { records: [{ id: records[0].id, fields: records[0].fields }] };
    },
    request: async (table, init) => {
      calls.push({ action: "request", table, init });
      return records[0];
    },
  };

  const result = await runBackfill({ batchId: "batch_backfill", airtable });
  assert.equal(result.rows_updated, 1);
  assert.equal(result.verification.review_status, "review_required");
  assert.equal(result.verification.parsed_member_since, "2025-04-01");
  assert.equal(result.verification.parsed_member_since_raw, "#memApr25");
  assert.equal(result.verification.chosen_member_since_token, "#memApr25");
  assert.equal(calls.every((call) => call.table === "tbl1u0foFBvgFpT9G"), true);
  const patchCall = calls.find((call) => call.action === "requestBatchWithFieldFallback");
  assert.equal(patchCall.init.method, "PATCH");
  assert.equal(Object.prototype.hasOwnProperty.call(patchCall.init.body.records[0].fields, "review_status"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patchCall.init.body.records[0].fields, "matched_client"), false);
});
