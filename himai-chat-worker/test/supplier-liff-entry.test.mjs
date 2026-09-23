import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/entry.js";

const env = {
  HIMAI_SUPPLIER_LIFF_ID: "2011701290-xBE3CirT",
};

test("direct supplier invite enters through canonical LIFF URL", async () => {
  const response = await worker.fetch(
    new Request("https://mmdbkk.com/shop/supplier/liff?invite=invite-nin"),
    env,
    {},
  );

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://liff.line.me");
  assert.equal(location.pathname, "/2011701290-xBE3CirT");
  assert.equal(location.searchParams.get("invite"), "invite-nin");
  assert.equal(location.searchParams.get("_liff"), "1");
});

test("LINE primary redirect restores invite from liff.state", async () => {
  const state = encodeURIComponent("?invite=invite-nin&_liff=1");
  const response = await worker.fetch(
    new Request(`https://mmdbkk.com/shop/supplier/liff?liff.state=${state}`),
    env,
    {},
  );

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://mmdbkk.com");
  assert.equal(location.pathname, "/shop/supplier/liff");
  assert.equal(location.searchParams.get("invite"), "invite-nin");
  assert.equal(location.searchParams.get("_liff"), "1");
});

test("normalized LIFF entry renders the supplier app", async () => {
  const response = await worker.fetch(
    new Request("https://mmdbkk.com/shop/supplier/liff?invite=invite-nin&_liff=1"),
    env,
    {},
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /2011701290-xBE3CirT/);
  assert.match(html, /\/shop\/api\/supplier\/liff-bind/);
});
