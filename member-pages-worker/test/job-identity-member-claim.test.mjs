import assert from "node:assert/strict";
import test from "node:test";

import { decorateMemberLiffJobClaim } from "../src/job-identity-member-claim.js";

function shell() {
  return new Response('<!doctype html><html><body><div id="message"></div><div id="actions"></div><script nonce="abc123">console.log("existing")</script></body></html>', {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "script-src 'nonce-abc123'" },
  });
}

test("customer LIFF shell injects claim bridge for direct job_claim", async () => {
  const response = await decorateMemberLiffJobClaim(shell(), new Request("https://mmdbkk.com/member/liff?job_claim=signed.claim"));
  const html = await response.text();
  assert.match(html, /operational_create_mode:'identity_claim'/);
  assert.match(html, /2010862595-yT4DCEMc/);
  assert.match(html, /\/v1\/admin\/job\/create/);
  assert.doesNotMatch(html, /signed\.claim/);
});

test("customer LIFF shell recognizes LINE liff.state forwarding", async () => {
  const state = encodeURIComponent("/?intent=status&view=jobs&job_claim=signed.claim");
  const response = await decorateMemberLiffJobClaim(shell(), new Request(`https://mmdbkk.com/member/liff?liff.state=${state}`));
  const html = await response.text();
  assert.match(html, /new URL\(s,'https:\/\/mmd\.invalid'\)/);
  assert.match(html, /window\.liff\.getIDToken\(\)/);
});

test("ordinary member LIFF shell is unchanged", async () => {
  const original = shell();
  const response = await decorateMemberLiffJobClaim(original, new Request("https://mmdbkk.com/member/liff?view=jobs"));
  const html = await response.text();
  assert.doesNotMatch(html, /identity_claim/);
});
