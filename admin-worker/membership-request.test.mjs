#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  handleMembershipRequest,
  normalizeMembershipPayload,
  normalizeUsername,
} from "./src/membershipRequest.js";

const env = {
  AIRTABLE_API_KEY: "test_key",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_TABLE_MEMBERSHIP_APPLICATIONS: "tbl8z2MQpIqcdylim",
  AIRTABLE_TABLE_MEMBERS: "tblgWc5VRon5o8Mhk",
  AIRTABLE_TABLE_CLIENTS: "tblVv58TCbwh5j1fS",
  AIRTABLE_TABLE_ACTIVITY_LOGS: "tblbUWRoFL6OI6QMJ",
  AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblFHmfpB2TTrzO2e",
};

assert.equal(normalizeUsername("max 24"), "max24");
assert.equal(normalizeMembershipPayload({ username: " @Max 24 " }).username, "max24");

async function runCase(name, payload, options = {}) {
  const writes = [];
  const reads = [];
  let createCount = 0;

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    const tableId = decodeURIComponent(new URL(url).pathname.split("/").pop());

    if (method === "GET") {
      reads.push({ url, tableId });
      const shouldMatchMember = options.existingMember && tableId === env.AIRTABLE_TABLE_MEMBERS;
      const shouldMatchClient = options.existingClient && tableId === env.AIRTABLE_TABLE_CLIENTS;
      return jsonResponse({
        records:
          shouldMatchMember || shouldMatchClient
            ? [{ id: shouldMatchMember ? "recMemberExisting" : "recClientExisting", fields: {} }]
            : [],
      });
    }

    createCount += 1;
    const body = JSON.parse(init.body);
    writes.push({ tableId, fields: body.records[0].fields });
    return jsonResponse({ records: [{ id: `recCreated${createCount}`, fields: body.records[0].fields }] });
  };

  const request = new Request("https://mmdbkk.com/v1/membership/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mmdbkk.com",
      "user-agent": "membership-smoke-test",
    },
    body: JSON.stringify(payload),
  });

  const response = await handleMembershipRequest(request, env);
  const body = await response.json();
  assert.equal(response.status, 200, name);
  assert.equal(body.ok, true, name);
  assert.match(body.request_id, /^memreq_/, name);
  assert.equal(body.access_granted, false, name);
  return { body, reads, writes };
}

const newRequest = await runCase("new membership request", {
  membership_action: "new",
  username: "max 24",
  email: "Max@example.com",
  mmd_client_name: "Max",
});
assert.equal(newRequest.body.membership_action, "new");
assert.equal(newRequest.body.status, "payment_pending");
assert.equal(newRequest.body.next_action, "show_payment_options");
assert(newRequest.writes.some((write) => write.tableId === env.AIRTABLE_TABLE_MEMBERSHIP_APPLICATIONS));
assert(newRequest.writes.some((write) => write.tableId === env.AIRTABLE_TABLE_ACTIVITY_LOGS));
assert(newRequest.writes.some((write) => write.tableId === env.AIRTABLE_TABLE_CONSOLE_INBOX_ID));

const renewalRequest = await runCase(
  "renewal request with existing member identifier",
  {
    membership_action: "new",
    memberstack_id: "mem_existing_123",
    username: "existing client",
  },
  { existingMember: true },
);
assert.equal(renewalRequest.body.requested_membership_action, "new");
assert.equal(renewalRequest.body.membership_action, "renewal");
assert.equal(renewalRequest.body.next_action, "renewal_payment_pending");
assert(!renewalRequest.writes.some((write) => write.tableId === env.AIRTABLE_TABLE_MEMBERSHIP_APPLICATIONS));

const recoverRequest = await runCase(
  "recover access request",
  {
    membership_action: "recover_access",
    email: "member@example.com",
    line_user_id: "U123",
  },
  { existingMember: true },
);
assert.equal(recoverRequest.body.membership_action, "recover_access");
assert.equal(recoverRequest.body.status, "access_recovery");
assert.equal(recoverRequest.body.next_action, "recover_access");

const upgradeRequest = await runCase(
  "upgrade request",
  {
    membership_action: "upgrade",
    email: "member@example.com",
    target_package: "black_card",
  },
  { existingMember: true },
);
assert.equal(upgradeRequest.body.membership_action, "upgrade");
assert.equal(upgradeRequest.body.status, "under_review");
assert.equal(upgradeRequest.body.next_action, "upgrade_under_review");

console.log("membership request smoke tests passed");

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
