import assert from "node:assert/strict";
import test from "node:test";
import {
  isRenewalRoute,
  renderRenewalHtml,
  renderRenewalResponse,
  resolveRenewalRedirect,
} from "../src/renderers/single-renewal-renderer.js";

const ENTRY = "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=renew&view=package&world=private";

for (const host of ["mmdbkk.com", "www.mmdbkk.com", "sigil.mmdbkk.com"]) {
  test(`unsigned renewal on ${host} goes directly into MY MMD without payment HTML`, async () => {
    for (const path of ["/sigil/pay/renewal", "/pay/renewal", "/sigil/pay/renewal/", "/pay/renewal/"]) {
      assert.equal(isRenewalRoute(path), true);
      for (const method of ["GET", "HEAD"]) {
        const response = renderRenewalResponse(new Request(`https://${host}${path}`, { method }));
        assert.equal(response.status, 307);
        assert.equal(response.headers.get("location"), ENTRY);
        assert.match(response.headers.get("cache-control"), /no-store/);
        assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
        assert.equal(await response.text(), "");
      }
    }
  });
}

test("routing, price, identity, session and return overrides do not reach MY MMD", () => {
  const source = new URL("https://mmdbkk.com/sigil/pay/renewal");
  for (const [key, value] of Object.entries({
    intent: "signup", view: "home", world: "public", amount: "799", amount_thb: "1999",
    member_id: "OTHER", line_user_id: "OTHER", session_id: "OTHER", payment_ref: "OTHER",
    return_to: "https://example.invalid", redirect: "https://example.invalid", liffId: "BAD",
    "liff.state": "/?intent=signup&amount=1", access_token: "DO_NOT_FORWARD",
  })) source.searchParams.set(key, value);
  assert.equal(resolveRenewalRedirect(source), ENTRY);
});

test("safe package and campaign context is only a hint and remains encoded", () => {
  const source = new URL("https://mmdbkk.com/sigil/pay/renewal");
  source.searchParams.set("package", "premium");
  source.searchParams.set("source", "line");
  source.searchParams.set("promo", "CARE&amount=799?x=1");
  const target = new URL(resolveRenewalRedirect(source));
  assert.equal(target.origin, "https://miniapp.line.me");
  assert.equal(target.searchParams.get("package"), "premium");
  assert.equal(target.searchParams.get("source"), "line");
  assert.equal(target.searchParams.get("promo"), "CARE&amount=799?x=1");
  assert.equal(target.searchParams.has("amount"), false);
  assert.equal(target.searchParams.get("intent"), "renew");
  assert.equal(target.searchParams.get("view"), "package");
});

test("existing signed payment links never expose the token to LINE or change the payment", () => {
  const source = new URL("https://www.mmdbkk.com/sigil/pay/renewal");
  source.searchParams.set("t", "signed+/token==");
  source.searchParams.set("package", "standard");
  source.searchParams.set("amount", "1");
  const target = new URL(resolveRenewalRedirect(source));
  assert.equal(target.origin, "https://mmdbkk.com");
  assert.equal(target.pathname, "/sigil/pay");
  assert.deepEqual([...target.searchParams.keys()], ["t"]);
  assert.equal(target.searchParams.get("t"), "signed+/token==");
});

test("blank tokens use renewal entry and fragments are not propagated", () => {
  assert.equal(resolveRenewalRedirect("https://mmdbkk.com/sigil/pay/renewal?t=%20#payment-secret"), ENTRY);
});

test("renewal entry cannot submit a payment, upload a proof or render a fallback", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal", { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(response.headers.get("location"), null);
  }
  assert.equal(renderRenewalHtml(), "");
  assert.equal(isRenewalRoute("/member/payments"), false);
});
