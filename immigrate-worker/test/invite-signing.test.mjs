import assert from "node:assert/strict";
import test from "node:test";

import {
  generateInviteLink,
  getConfirmSecret,
  signInviteToken,
  verifyInviteToken,
} from "../src/lib/invite.ts";

function payload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: "customer_invite",
    role: "customer",
    lane: "customer_onboarding",
    invite_id: "invite_security_test",
    username: "test_ab",
    mmd_client_name: "Test",
    nickname: "Test",
    suffix_code: "ab",
    iat: now,
    exp: now + 600,
    ...overrides,
  };
}

test("LINK_SIGNING_SECRET takes precedence and rejects legacy fallback signatures", async () => {
  const env = {
    LINK_SIGNING_SECRET: "dedicated-link-secret",
    CONFIRM_KEY: "legacy-confirm-key",
    INTERNAL_TOKEN: "legacy-internal-token",
  };
  const claims = payload();
  const dedicated = await signInviteToken(claims, env.LINK_SIGNING_SECRET);
  const legacy = await signInviteToken(claims, env.CONFIRM_KEY);

  assert.equal(getConfirmSecret(env), env.LINK_SIGNING_SECRET);
  assert.deepEqual(await verifyInviteToken(dedicated, getConfirmSecret(env)), claims);
  await assert.rejects(verifyInviteToken(legacy, getConfirmSecret(env)), /invalid_token_signature/);
});

test("invite verification rejects expired and tampered tokens", async () => {
  const secret = "dedicated-link-secret";
  const expired = await signInviteToken(payload({ iat: 1, exp: 2 }), secret);
  await assert.rejects(verifyInviteToken(expired, secret), /expired_invite_token/);

  const valid = await signInviteToken(payload(), secret);
  const [encoded, signature] = valid.split(".");
  const tampered = `${encoded}.${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;
  await assert.rejects(verifyInviteToken(tampered, secret), /invalid_token_signature/);
});

test("generated invite links use the dedicated signing domain", async () => {
  const env = {
    LINK_SIGNING_SECRET: "dedicated-link-secret",
    CONFIRM_KEY: "legacy-confirm-key",
    PUBLIC_WEB_BASE_URL: "https://mmdbkk.com",
  };
  const result = await generateInviteLink(env, {
    invite_id: "invite_security_test",
    username: "test_ab",
    nickname: "Test",
    suffix_code: "ab",
    mmd_client_name: "Test",
  });

  assert.match(result.onboarding_url, /^https:\/\/mmdbkk\.com\/member\/onboarding\?t=/);
  await verifyInviteToken(result.customer_invite_t, env.LINK_SIGNING_SECRET);
  await assert.rejects(
    verifyInviteToken(result.customer_invite_t, env.CONFIRM_KEY),
    /invalid_token_signature/,
  );
});
