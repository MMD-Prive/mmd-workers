import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveDeterministicLinks } from "../functions/line-payment-slip-intake.mjs";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const CLIENT_ID = "recWvkmwiNDuZ44mu";

function env() {
  return {
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_API_KEY: "test-token",
    AIRTABLE_TABLE_CLIENTS: "Clients",
    AIRTABLE_TABLE_MEMBERS: "Members",
  };
}

function fetchWithClientRows(clientRows = [{ id: CLIENT_ID, fields: {} }]) {
  return async (input) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if (table === "Clients") return Response.json({ records: clientRows });
    if (table === "Members") return Response.json({ records: [] });
    return Response.json({ records: [] });
  };
}

test("LINE slip identity resolves a canonical Client even when no Member exists", async () => {
  const result = await resolveDeterministicLinks({
    env: env(),
    identity: { lineUserId: LINE_USER_ID },
    extraction: { session_id: "", payment_ref: "", amount_thb: null },
    fetchImpl: fetchWithClientRows(),
  });
  assert.equal(result.client, CLIENT_ID);
  assert.equal(result.member, "");
  assert.equal(result.ambiguous, false);
});

test("ambiguous canonical Client resolution fails closed", async () => {
  const result = await resolveDeterministicLinks({
    env: env(),
    identity: { lineUserId: LINE_USER_ID },
    extraction: { session_id: "", payment_ref: "", amount_thb: null },
    fetchImpl: fetchWithClientRows([
      { id: "recAAAAAAAAAAAAAA", fields: {} },
      { id: "recBBBBBBBBBBBBBB", fields: {} },
    ]),
  });
  assert.equal(result.client, "");
  assert.equal(result.member, "");
  assert.equal(result.ambiguous, true);
});

test("Payment Proof persistence includes the canonical Client link", async () => {
  const source = await readFile(new URL("../functions/line-payment-slip-intake.mjs", import.meta.url), "utf8");
  assert.match(source, /fields\.Client\s*=\s*\[links\.client\]/);
  assert.match(source, /links\.client\s*\|\|\s*links\.member/);
});
