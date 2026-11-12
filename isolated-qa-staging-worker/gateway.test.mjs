import assert from "node:assert/strict";
import test from "node:test";
import { createGateway, origin } from "./gateway.mjs";

function setup() {
  const objects = new Map();
  const subject = "U" + "a".repeat(32);
  const env = {
    QA_ENABLED: "true", QA_LIFF_ID: "12345-qa", QA_LINE_CHANNEL_ID: "12345",
    QA_LINE_SUBJECT: subject, QA_AUTH_RESOLVER_SECRET: "x".repeat(32),
    QA_AUTH: { async fetch(url, options) {
      assert.equal(url, "https://qa-auth.invalid/__internal/member-status/resolve");
      assert.equal(JSON.parse(options.body).line_user_id, "U00000000000000000000000000000001");
      assert.equal(options.headers["x-mmd-member-resolver-secret"], env.QA_AUTH_RESOLVER_SECRET);
      return Response.json({ data: { member_exists: true } });
    } },
    QA_STORAGE: {
      async get(key) { return objects.has(key) ? new Response(objects.get(key)) : null; },
      async head(key) { return objects.has(key) ? {} : null; },
      async put(key, value, options) {
        if (options?.onlyIf?.etagDoesNotMatch === "*" && objects.has(key)) return null;
        objects.set(key, value);
        return {};
      },
      async delete(key) { objects.delete(key); },
    },
  };
  const app = createGateway(async (token, channel) => {
    assert.equal(channel, "12345");
    return token === "test" ? subject : "U" + "b".repeat(32);
  });
  const send = (path, options, overrides = env) => app.fetch(new Request(origin + path, options), overrides);
  return { app, env, send, objects };
}

const login = token => ({ method: "POST", headers: { Origin: origin },
  body: JSON.stringify({ idToken: token }) });

test("closed configuration, unrelated hosts, wrong LINE subject and cross-site POST fail closed", async () => {
  const { app, env, send, objects } = setup();
  assert.equal((await app.fetch(new Request("https://mmdbkk.com/member/liff"), env)).status, 421);
  assert.equal((await send("/member/liff", {}, { ...env, QA_ENABLED: "" })).status, 503);
  assert.equal((await send("/qa/member")).status, 401);
  assert.equal((await send("/qa/session", login("wrong"))).status, 403);
  assert.equal((await send("/qa/session", { ...login("test"), headers: { Origin: "https://unrelated.invalid" } })).status, 403);
  assert.equal(objects.size, 0);
});

test("test session reads synthetic member, deduplicates payment evidence and revokes access on logout", async () => {
  const { send, objects } = setup();
  const page = await send("/member/liff");
  assert.match(await page.text(), /MY MMD · QA Staging/);
  const response = await send("/qa/session", login("test"));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie");
  assert.match(cookie, /^__Host-mmd-qa=.*HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/i);
  const headers = { Cookie: cookie.split(";")[0], Origin: origin };
  const member = await send("/qa/member", { headers });
  assert.deepEqual(await member.json(), { member: "MMD-STAGING-CURRENT-01", fixture: true });

  const fixture = await (await send("/qa/fixture/evidence", { headers })).text();
  const proof = body => ({ method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body });
  assert.equal((await send("/qa/payment", proof("x".repeat(129)))).status, 400);
  assert.equal((await send("/qa/payment", proof("unapproved file"))).status, 400);
  const attempts = await Promise.all([send("/qa/payment", proof(fixture)), send("/qa/payment", proof(fixture))]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 201]);
  assert.equal((await (await send("/qa/payment", { headers })).json()).status, "qa_received");
  assert.equal([...objects.keys()].filter(key => key.startsWith("payment/")).length, 1);

  const kenji = await send("/qa/kenji", { method: "POST", headers, body: "KENJI-QA-001" });
  assert.deepEqual(await kenji.json(), { reply: "KENJI-QA-001 · fixture reply", fixture: true });
  assert.equal((await send("/v1/pay/slip/evidence", proof(fixture))).status, 404);
  assert.equal((await send("/qa/logout", { method: "POST", headers })).status, 200);
  assert.equal((await send("/qa/member", { headers })).status, 401);
});

test("member resolver rejects redirects without following them", async () => {
  const { env, send } = setup();
  let calls = 0;
  env.QA_AUTH.fetch = async (_url, options) => {
    calls++;
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 307, headers: { Location: "https://unrelated.invalid/" } });
  };
  const session = await send("/qa/session", login("test"));
  assert.equal(session.status, 200);
  const Cookie = session.headers.get("Set-Cookie").split(";")[0];
  const response = await send("/qa/member", { headers: { Cookie } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "qa_fixture_unavailable" });
  assert.equal(calls, 1);
});

test("real verifier sends only the ID token and QA audience to the fixed LINE endpoint", async () => {
  const { env } = setup();
  const app = createGateway();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.line.me/oauth2/v2.1/verify");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.deepEqual(Object.fromEntries(options.body), { id_token: "test", client_id: "12345" });
    calls++;
    return Response.json({ aud: calls === 1 ? "another-channel" : "12345", sub: env.QA_LINE_SUBJECT,
      exp: Math.floor(Date.now() / 1000) + 60 });
  };
  try {
    const send = () => app.fetch(new Request(origin + "/qa/session", login("test")), env);
    assert.equal((await send()).status, 403);
    assert.equal((await send()).status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
