const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CLIENTS_TABLE,
  STAGING_TABLE,
  commitCanonicalIdentity,
} = require("./canonical-identity-commit-adapter.js");

const LINE_ID = "U5107dbdc87dbdd985ef5516b7f208fc3";
const CLIENT_ID = "recABCDEF1234567";
const OTHER_CLIENT_ID = "recZYXWVU7654321";
const IMPORT_ID = "line_ofc_console_line_123456789";
const NOW = "2026-09-02T12:00:00.000Z";

function reviewedStage(overrides = {}) {
  return {
    id: "recStageReviewed",
    fields: {
      import_id: IMPORT_ID,
      line_user_id: LINE_ID,
      decision: "link_existing_client",
      decision_source: "manual_review",
      reviewed_by: "per",
      reviewed_at: "2026-09-02T11:59:00.000Z",
      review_status: "review_required",
      matched_client_id: CLIENT_ID,
      dry_run_only: true,
      ...overrides,
    },
  };
}

function canonicalClient(overrides = {}) {
  return {
    id: CLIENT_ID,
    fields: {
      "Contact Email": "Member@Example.com",
      ...overrides,
    },
  };
}

function committedStage(overrides = {}) {
  return {
    id: "recStageCommitted",
    fields: {
      import_id: "line_ofc_console_line_committed",
      line_user_id: LINE_ID,
      match_type: "line_user_id_exact",
      decision: "link_existing_client",
      decision_source: "manual_review",
      reviewed_by: "per",
      reviewed_at: "2026-09-02T11:58:00.000Z",
      review_status: "committed",
      matched_client_id: CLIENT_ID,
      matched_client: [CLIENT_ID],
      dry_run_only: false,
      ...overrides,
    },
  };
}

test("dry-run plans canonical Client and committed staging link without writes", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient()],
    staging: [reviewedStage()],
  });

  const result = await commitCanonicalIdentity({
    importId: IMPORT_ID,
    apply: false,
    airtable: fake,
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.canonical_email_resolved, true);
  assert.equal(result.mutations.canonical_client_line_link, true);
  assert.equal(result.mutations.committed_staging_link, true);
  assert.equal(result.mutations.membership_or_entitlement_write, false);
  assert.equal(fake.writes.length, 0);
});

test("apply commits exact reviewed LINE link and verifies #467 contract", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient()],
    staging: [reviewedStage()],
  });

  const result = await commitCanonicalIdentity({
    importId: IMPORT_ID,
    apply: true,
    airtable: fake,
    now: NOW,
  });

  assert.equal(result.verified_contract, true);
  assert.equal(result.resolver_ready, true);
  assert.equal(result.drive_bootstrap_ready, true);
  assert.equal(result.member_retry_ready, true);
  assert.deepEqual(result.verification, {
    ok: true,
    direct_canonical_client: true,
    committed_staging_link: true,
  });

  const clientWrite = fake.writes.find((write) => write.table === CLIENTS_TABLE);
  assert.equal(clientWrite.body.records[0].id, CLIENT_ID);
  assert.equal(clientWrite.body.records[0].fields.line_user_id, LINE_ID);

  const stagingWrite = fake.writes.find((write) => write.table === STAGING_TABLE);
  const committed = stagingWrite.body.records[0].fields;
  assert.deepEqual(committed.matched_client, [CLIENT_ID]);
  assert.equal(committed.match_type, "line_user_id_exact");
  assert.equal(committed.decision, "link_existing_client");
  assert.equal(committed.review_status, "committed");
  assert.equal(committed.dry_run_only, false);
  assert.equal(committed.committed_at, NOW);
  assert.equal(committed.committed_by, "per");

  assert.equal(fake.writes.some((write) => /Member|Entitlement|Payment|Point/i.test(write.table)), false);
});

test("existing committed link to the same canonical Client is idempotent", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient({ line_user_id: LINE_ID })],
    staging: [reviewedStage(), committedStage()],
  });

  const result = await commitCanonicalIdentity({
    importId: IMPORT_ID,
    apply: true,
    airtable: fake,
    now: NOW,
  });

  assert.equal(result.already_committed, true);
  assert.equal(result.verified_contract, true);
  assert.equal(fake.writes.length, 0);
});

test("adapter rejects a link that lacks explicit manual-review evidence", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient()],
    staging: [reviewedStage({ decision_source: "auto_match" })],
  });

  await assert.rejects(
    () => commitCanonicalIdentity({ importId: IMPORT_ID, apply: false, airtable: fake, now: NOW }),
    /CANONICAL_MANUAL_REVIEW_REQUIRED/,
  );
  assert.equal(fake.writes.length, 0);
});

test("adapter fails closed when the canonical Client already has another LINE identity", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient({ line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })],
    staging: [reviewedStage()],
  });

  await assert.rejects(
    () => commitCanonicalIdentity({ importId: IMPORT_ID, apply: true, airtable: fake, now: NOW }),
    /CANONICAL_CLIENT_LINE_CONFLICT/,
  );
  assert.equal(fake.writes.length, 0);
});

test("adapter fails closed when another canonical Client already owns the LINE id", async () => {
  const fake = fakeAirtable({
    clients: [
      canonicalClient(),
      { id: OTHER_CLIENT_ID, fields: { line_user_id: LINE_ID, "Contact Email": "other@example.com" } },
    ],
    staging: [reviewedStage()],
  });

  await assert.rejects(
    () => commitCanonicalIdentity({ importId: IMPORT_ID, apply: true, airtable: fake, now: NOW }),
    /CANONICAL_LINE_ALREADY_LINKED_ELSEWHERE/,
  );
  assert.equal(fake.writes.length, 0);
});

test("adapter blocks conflicting reviewed links for the same LINE id", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient()],
    staging: [
      reviewedStage(),
      reviewedStage({
        import_id: "line_ofc_console_line_other",
        matched_client_id: OTHER_CLIENT_ID,
      }),
    ],
  });

  await assert.rejects(
    () => commitCanonicalIdentity({ importId: IMPORT_ID, apply: true, airtable: fake, now: NOW }),
    /CANONICAL_REVIEWED_LINK_CONFLICT/,
  );
  assert.equal(fake.writes.length, 0);
});

test("adapter refuses a canonical Client with two different email identities", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient({ email: "other@example.com" })],
    staging: [reviewedStage()],
  });

  await assert.rejects(
    () => commitCanonicalIdentity({ importId: IMPORT_ID, apply: false, airtable: fake, now: NOW }),
    /CANONICAL_CLIENT_EMAIL_AMBIGUOUS/,
  );
});

test("LINE-id lookup refuses multiple reviewed staging links instead of choosing one", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient()],
    staging: [
      reviewedStage(),
      reviewedStage({ import_id: "line_ofc_console_line_duplicate" }),
    ],
  });

  await assert.rejects(
    () => commitCanonicalIdentity({ lineUserId: LINE_ID, apply: false, airtable: fake, now: NOW }),
    /CANONICAL_REVIEWED_LINK_AMBIGUOUS/,
  );
});

function fakeAirtable({ clients = [], staging = [] } = {}) {
  const state = {
    clients: structuredClone(clients),
    staging: structuredClone(staging),
  };
  const writes = [];

  function extractQuoted(formula, field) {
    const escaped = String(field).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(formula || "").match(new RegExp(`\\{${escaped}\\}=\\"([^\\"]*)\\"`));
    return match?.[1] || "";
  }

  function isCommitted(row) {
    const fields = row.fields || {};
    return fields.match_type === "line_user_id_exact"
      && fields.decision === "link_existing_client"
      && fields.review_status === "committed";
  }

  return {
    writes,
    async findOne(table, formula) {
      assert.equal(table, STAGING_TABLE);
      const importId = extractQuoted(formula, "import_id");
      return state.staging.find((row) => row.fields?.import_id === importId) || null;
    },
    async list(table, query = {}) {
      const formula = String(query.filterByFormula || "");
      if (table === CLIENTS_TABLE) {
        const recordMatch = formula.match(/RECORD_ID\(\)=\"([^\"]+)\"/);
        if (recordMatch) return state.clients.filter((row) => row.id === recordMatch[1]);
        const lineUserId = extractQuoted(formula, "line_user_id");
        if (lineUserId) return state.clients.filter((row) => row.fields?.line_user_id === lineUserId);
        return state.clients;
      }
      if (table === STAGING_TABLE) {
        const lineUserId = extractQuoted(formula, "line_user_id");
        let rows = lineUserId ? state.staging.filter((row) => row.fields?.line_user_id === lineUserId) : state.staging;
        if (formula.includes("{match_type}")) rows = rows.filter(isCommitted);
        if (formula.includes("{decision_source}")) {
          rows = rows.filter((row) => row.fields?.decision === "link_existing_client" && row.fields?.decision_source === "manual_review");
        }
        return rows;
      }
      throw new Error(`unexpected_list_table:${table}`);
    },
    async request(table, init = {}) {
      assert.equal(init.method, "PATCH");
      writes.push({ table, method: init.method, body: structuredClone(init.body) });
      const patches = init.body?.records || [];
      const rows = table === CLIENTS_TABLE ? state.clients : table === STAGING_TABLE ? state.staging : null;
      if (!rows) throw new Error(`unexpected_patch_table:${table}`);
      for (const patch of patches) {
        const row = rows.find((item) => item.id === patch.id);
        if (!row) throw new Error(`missing_patch_record:${patch.id}`);
        row.fields = { ...(row.fields || {}), ...(patch.fields || {}) };
      }
      return { records: patches };
    },
  };
}
