import assert from "node:assert/strict";
import test from "node:test";

import {
  enrichLineageWithPerRename,
  PER_RENAME_CLIENT_SEARCH_VERSION,
  resolvePerRenameAlias,
} from "./src/per-rename-client-search.js";

const env = {
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID: "pre_session",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
};

function lookupRequest(query) {
  return new Request("https://admin-worker.internal/v1/admin/clients/lineage-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

function fallbackResponse() {
  return new Response(JSON.stringify({
    ok: true,
    records: [{ client_id: "", client_name: "fallback", manual_public_only: true }],
    items: [{ client_id: "", client_name: "fallback", manual_public_only: true }],
    count: 1,
    manual_fallback: true,
    lineage_warnings: ["manual_public_only_pending_reconcile"],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const kongIndex = {
  id: "recPerRenameKong",
  fields: {
    identity_key: "line_ofc_per_rename:u64e58603b56a881f48da2236f8036b18",
    source_type: "line_ofc_staging",
    source_record_id: "recrkjHpPpheTIprk",
    preferred_name: "ก้อง - SVIP -",
    line_user_id: "U64e58603b56a881f48da2236f8036b18",
    line_display_name: "KKKsk",
    linked_client: ["recAcTMLy1teHWMp1"],
    resolution_status: "linked",
    session_lookup_status: "canonical_ready",
    confidence: "verified",
    current_rights_source: "my_mmd_entitlement_resolver_v1",
  },
};

const otherKongIndex = {
  id: "recOtherKong",
  fields: {
    identity_key: "line_ofc_per_rename:u3c779cd79247ece116509ec78e3957fa",
    source_type: "line_ofc_staging",
    source_record_id: "recOtherSource",
    preferred_name: "ก้อง 12 กย 68",
    line_user_id: "U3c779cd79247ece116509ec78e3957fa",
    line_display_name: "A",
    linked_client: ["recOtherClient"],
    resolution_status: "linked",
    session_lookup_status: "canonical_ready",
    confidence: "verified",
  },
};

const kongClient = {
  id: "recAcTMLy1teHWMp1",
  fields: {
    "Client Name": "KKKsk",
    "Client Name (Display)": "KKKsk",
    username: "KKKsk",
    line_user_id: "U64e58603b56a881f48da2236f8036b18",
  },
};

const otherKongClient = {
  id: "recOtherClient",
  fields: {
    "Client Name": "A",
    "Client Name (Display)": "A",
    username: "A",
    line_user_id: "U3c779cd79247ece116509ec78e3957fa",
  },
};

function installResolverMock(indexRows, clients = { recAcTMLy1teHWMp1: kongClient }) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(url);
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith("/pre_session")) {
      return new Response(JSON.stringify({ records: indexRows }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const clientId = path.split("/").pop();
    if (path.includes("/clients/") && clients[clientId]) {
      return new Response(JSON.stringify(clients[clientId]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected Airtable call ${url}`);
  };
  return () => {
    globalThis.fetch = original;
    return calls;
  };
}

test("Per nickname resolves exact linked canonical Client and remains display-first", async () => {
  const restore = installResolverMock([kongIndex]);
  try {
    const response = await enrichLineageWithPerRename(
      lookupRequest("ก้อง SVIP"),
      fallbackResponse(),
      env,
    );
    const body = await response.json();
    assert.equal(response.headers.get("x-mmd-per-rename-search"), "resolved");
    assert.equal(response.headers.get("x-mmd-per-rename-search-version"), PER_RENAME_CLIENT_SEARCH_VERSION);
    assert.equal(body.manual_fallback, false);
    assert.equal(body.per_rename_alias, true);
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].client_id, "recAcTMLy1teHWMp1");
    assert.equal(body.records[0].client_name, "ก้อง - SVIP -");
    assert.equal(body.records[0].current_line_rename, "ก้อง - SVIP -");
    assert.equal(body.records[0].per_rename, "ก้อง - SVIP -");
    assert.equal(body.records[0].canonical_name, "KKKsk");
    assert.equal(body.records[0].line_user_id, "U64e58603b56a881f48da2236f8036b18");
    assert.equal(body.records[0].matched_on, "per_rename");
    assert.equal(body.records[0].manual_public_only, false);
    assert.equal(body.records[0].membership_status, "");
    assert.equal(body.records[0].tier, "");
    assert.equal(body.records[0].entitlement_snapshot_source, "none");
  } finally {
    restore();
  }
});

test("Per nickname lookup may combine renamed name and LINE display tokens", async () => {
  const restore = installResolverMock([kongIndex]);
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง SVIP KKKsk");
    assert.equal(result.state, "resolved");
    assert.equal(result.record.client_id, "recAcTMLy1teHWMp1");
    assert.equal(result.record.client_name, "ก้อง - SVIP -");
  } finally {
    restore();
  }
});

test("broad Per nickname returns linked canonical choices without guessing", async () => {
  const restore = installResolverMock(
    [kongIndex, otherKongIndex],
    {
      recAcTMLy1teHWMp1: kongClient,
      recOtherClient: otherKongClient,
    },
  );
  try {
    const response = await enrichLineageWithPerRename(
      lookupRequest("ก้อง"),
      fallbackResponse(),
      env,
    );
    const body = await response.json();
    assert.equal(response.headers.get("x-mmd-per-rename-search"), "multiple");
    assert.equal(body.per_rename_alias, true);
    assert.equal(body.per_rename_alias_multiple, true);
    assert.equal(body.manual_fallback, false);
    assert.equal(body.records.length, 2);
    assert.deepEqual(
      new Set(body.records.map((record) => record.client_id)),
      new Set(["recAcTMLy1teHWMp1", "recOtherClient"]),
    );
    assert.ok(body.records.every((record) => record.matched_on === "per_rename"));
    assert.ok(body.records.every((record) => record.manual_public_only === false));
    assert.match(body.lineage_warnings.join(" "), /operator_selection_required/);
    assert.doesNotMatch(body.lineage_warnings.join(" "), /manual_public_only_pending_reconcile/);
  } finally {
    restore();
  }
});

test("LINE User ID disambiguates the same broad Per Rename across canonical Clients", async () => {
  const restore = installResolverMock(
    [kongIndex, otherKongIndex],
    {
      recAcTMLy1teHWMp1: kongClient,
      recOtherClient: otherKongClient,
    },
  );
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง", {
      line_user_id: "U3c779cd79247ece116509ec78e3957fa",
    });
    assert.equal(result.state, "resolved");
    assert.equal(result.record.client_id, "recOtherClient");
    assert.equal(result.record.line_user_id, "U3c779cd79247ece116509ec78e3957fa");
  } finally {
    restore();
  }
});

test("Per Rename and LINE User ID disagreement fails closed", async () => {
  const restore = installResolverMock([kongIndex]);
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง SVIP", {
      line_user_id: "U3c779cd79247ece116509ec78e3957fa",
    });
    assert.equal(result.state, "ambiguous");
    assert.equal(result.reason, "per_rename_line_identity_mismatch");
  } finally {
    restore();
  }
});

test("canonical Client LINE identity conflict fails closed even when index row matches", async () => {
  const conflictingClient = {
    ...kongClient,
    fields: {
      ...kongClient.fields,
      line_user_id: "U3c779cd79247ece116509ec78e3957fa",
    },
  };
  const restore = installResolverMock([kongIndex], {
    recAcTMLy1teHWMp1: conflictingClient,
  });
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง SVIP", {
      line_user_id: "U64e58603b56a881f48da2236f8036b18",
    });
    assert.equal(result.state, "ambiguous");
    assert.equal(result.reason, "canonical_line_identity_conflict");
  } finally {
    restore();
  }
});

test("same canonical Client prefers the newest valid date suffix", async () => {
  const oldRename = {
    ...kongIndex,
    id: "recKongOld",
    fields: {
      ...kongIndex.fields,
      preferred_name: "ก้อง 12 กย 68",
    },
  };
  const newestRename = {
    ...kongIndex,
    id: "recKongNew",
    fields: {
      ...kongIndex.fields,
      preferred_name: "ก้อง 28 กย 69",
    },
  };
  const restore = installResolverMock([oldRename, newestRename]);
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง");
    assert.equal(result.state, "resolved");
    assert.equal(result.record.client_id, "recAcTMLy1teHWMp1");
    assert.equal(result.record.per_rename, "ก้อง 28 กย 69");
    assert.equal(result.record.per_rename_base_name, "ก้อง");
    assert.equal(result.record.per_rename_date_iso, "2026-09-28");
    assert.equal(result.record.per_rename_date_source, "per_rename_suffix");
  } finally {
    restore();
  }
});

test("exact LINE display does not hide other broad Per Rename canonical choices", async () => {
  const exactLineDisplay = {
    ...kongIndex,
    fields: {
      ...kongIndex.fields,
      line_display_name: "ก้อง",
    },
  };
  const restore = installResolverMock(
    [exactLineDisplay, otherKongIndex],
    {
      recAcTMLy1teHWMp1: kongClient,
      recOtherClient: otherKongClient,
    },
  );
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง");
    assert.equal(result.state, "multiple");
    assert.deepEqual(
      new Set(result.records.map((record) => record.client_id)),
      new Set(["recAcTMLy1teHWMp1", "recOtherClient"]),
    );
  } finally {
    restore();
  }
});

test("exact Per Rename collision across canonical Clients still fails closed", async () => {
  const exactOther = {
    ...otherKongIndex,
    fields: {
      ...otherKongIndex.fields,
      preferred_name: "ก้อง - SVIP -",
    },
  };
  const restore = installResolverMock(
    [kongIndex, exactOther],
    {
      recAcTMLy1teHWMp1: kongClient,
      recOtherClient: otherKongClient,
    },
  );
  try {
    const response = await enrichLineageWithPerRename(
      lookupRequest("ก้อง - SVIP -"),
      fallbackResponse(),
      env,
    );
    const body = await response.json();
    assert.equal(response.headers.get("x-mmd-per-rename-search"), "ambiguous");
    assert.equal(body.per_rename_alias_ambiguous, true);
    assert.equal(body.manual_fallback, true);
    assert.equal(body.records.length, 0);
    assert.match(body.lineage_warnings.join(" "), /per_rename_alias_ambiguous_refine_search/);
  } finally {
    restore();
  }
});

test("non-authoritative or unlinked index rows never become canonical Client authority", async () => {
  const unsafe = [
    { ...kongIndex, id: "a", fields: { ...kongIndex.fields, identity_key: "line_ofc_contact_v1:u64" } },
    { ...kongIndex, id: "b", fields: { ...kongIndex.fields, resolution_status: "review_required" } },
    { ...kongIndex, id: "c", fields: { ...kongIndex.fields, session_lookup_status: "searchable_candidate" } },
    { ...kongIndex, id: "d", fields: { ...kongIndex.fields, linked_client: [] } },
  ];
  const restore = installResolverMock(unsafe);
  try {
    const result = await resolvePerRenameAlias(env, "ก้อง SVIP");
    assert.equal(result.state, "none");
  } finally {
    restore();
  }
});
