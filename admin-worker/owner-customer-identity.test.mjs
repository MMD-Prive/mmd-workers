import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  normalizeOwnerIdentityInput,
  upsertOwnerCustomerIdentity,
} from "./src/owner-customer-identity.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const env = { AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "appTest" };
const uid = "U1234567890abcdef1234567890abcdef";

test("accepts a LINE OA chat URL but rejects a public LINE ID", () => {
  assert.equal(normalizeOwnerIdentityInput({
    line_identity: "https://chat.line.biz/account/chat/" + uid,
    per_rename: "ตั้ว 18 กย 69",
  }).line_user_id, uid.toUpperCase());
  assert.throws(() => normalizeOwnerIdentityInput({
    line_identity: "gateaubkk",
    per_rename: "ตั้ว 18 กย 69",
  }), /valid_line_uid_or_chat_url_required/);
});

test("registers a new MMD client once and retains Per Rename history", async () => {
  const original = globalThis.fetch;
  const state = { clients: [], aliases: [], posts: [] };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const parts = url.pathname.split("/");
    const table = decodeURIComponent(parts[parts.length - (init.method === "PATCH" ? 2 : 1)]);
    if (!init.method || init.method === "GET") {
      const rows = table === "tblVv58TCbwh5j1fS" ? state.clients : state.aliases;
      return Response.json({ records: rows });
    }
    const fields = JSON.parse(init.body).fields;
    const record = { id: init.method === "PATCH" ? decodeURIComponent(parts.at(-1)) : (table === "tblVv58TCbwh5j1fS" ? "recClient123456789" : "recAlias" + String(state.aliases.length + 1).padEnd(14, "0")), fields };
    state.posts.push({ table, method: init.method, fields });
    const bucket = table === "tblVv58TCbwh5j1fS" ? state.clients : state.aliases;
    if (init.method === "PATCH") {
      const current = bucket.find(x => x.id === record.id);
      Object.assign(current.fields, fields);
      record.fields = current.fields;
    } else bucket.push(record);
    return Response.json(record);
  };
  try {
    const first = await upsertOwnerCustomerIdentity(env, {
      line_user_id: uid, per_rename: "ตั้ว 18 กย 69", line_display_name: "GT",
      canonical_name: "ตั้ว", create_if_missing: true, purpose: "new_customer",
    }, { actor: { id: "per" } });
    assert.equal(first.client_created, true);
    assert.equal(first.searchable_in_create_job, true);
    assert.equal(state.clients.length, 1);
    assert.equal(state.aliases.length, 1);
    assert.equal(state.aliases[0].fields.source_type, "line_ofc_staging");
    assert.deepEqual(state.aliases[0].fields.linked_client, ["recClient123456789"]);

    const again = await upsertOwnerCustomerIdentity(env, {
      line_user_id: uid, per_rename: "ตั้ว 18 กย 69", line_display_name: "GT",
      create_if_missing: true, canonical_name: "ignored",
    }, { actor: { id: "per" } });
    assert.equal(again.client_created, false);
    assert.equal(state.clients.length, 1);
    assert.equal(state.aliases.length, 1);
    assert.equal(state.posts.filter(x => x.method === "POST").length, 2);

    await upsertOwnerCustomerIdentity(env, {
      line_user_id: uid, per_rename: "ตั้ว 23 ตค 69", line_display_name: "GT",
    }, { actor: { id: "per" } });
    assert.equal(state.clients.length, 1);
    assert.equal(state.aliases.length, 2);
    assert.deepEqual(state.aliases.map(x => x.fields.preferred_name), ["ตั้ว 18 กย 69", "ตั้ว 23 ตค 69"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("fails closed when one LINE UID points at multiple canonical clients", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const table = decodeURIComponent(url.pathname.split("/").pop());
    if (table === "tblVv58TCbwh5j1fS") {
      return Response.json({ records: [
        { id: "recClient111111111", fields: { line_user_id: uid } },
        { id: "recClient222222222", fields: { line_user_id: uid } },
      ] });
    }
    return Response.json({ records: [] });
  };
  try {
    await assert.rejects(upsertOwnerCustomerIdentity(env, {
      line_user_id: uid, per_rename: "ตั้ว 18 กย 69",
    }), /line_uid_linked_to_multiple_clients/);
  } finally {
    globalThis.fetch = original;
  }
});
