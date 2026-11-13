const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { JSDOM } = require(require.resolve("jsdom", { paths: [process.env.MMD_UI_TEST_MODULES || process.cwd()] }));

const source = readFileSync(join(__dirname, "customer-confirmation-v10.js"), "utf8");
const token = "fixture.job+opaque";
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, options = {}) {
  const query = options.query ?? new URLSearchParams({ t: token, lang: options.lang ?? "en", amount: "1" });
  const dom = new JSDOM('<div data-mmd-confirm-mount></div><script data-mmd-customer-session-tracker></script>', {
    url: "https://www.mmdbkk.com/sigil/confirm/job-confirmation?" + query,
    runScripts: "outside-only",
  });
  const w = dom.window;
  t.after(() => w.close());
  const calls = [];
  const navigation = [];
  const mockWindow = Object.create(w);
  Object.defineProperties(mockWindow, {
    location: { value: { ...w.location, assign: target => navigation.push(target) } },
    addEventListener: { value: w.addEventListener.bind(w) },
    setInterval: { value: w.setInterval.bind(w) },
  });
  let payment = { stage: "deposit", amount_due_thb: 1200, ...options.payment };
  w.fetch = async (url, request) => {
    const endpoint = new URL(url).pathname.split("/").pop();
    calls.push({ endpoint, body: JSON.parse(request.body) });
    const data = endpoint === "details"
      ? { role: "customer", confirmation_revision: "revision-fixture", payment, ...options.details }
      : endpoint === "context"
        ? { confirmation: { acknowledged_at: options.acknowledged ? "fixture" : null } }
        : { ok: !options.ackFails };
    return { ok: data.ok !== false, text: async () => JSON.stringify(data) };
  };
  const boot = () => w.Function("window", source)(mockWindow);
  boot();
  await settle();
  const q = selector => w.document.querySelector(selector);
  return { calls, navigation, boot, w, setPayment: value => { payment = value; },
    pay: q("[data-c-paycta-link]"), check: q("[data-c-paycta-check]") };
}

function assertTarget(href, lang = "en") {
  const url = new URL(href);
  assert.equal(url.origin + url.pathname, "https://www.mmdbkk.com/sigil/pay");
  assert.deepEqual([...url.searchParams], lang ? [["t", token], ["lang", lang]] : [["t", token]]);
}

test("deposit click ACKs the current revision and navigates to checkout", async t => {
  const ui = await setup(t);
  assert.equal(ui.pay.hidden, false);
  assertTarget(ui.pay.href);
  ui.pay.click();
  await settle();
  assert.deepEqual(ui.calls.at(-1), { endpoint: "ack", body: {
    t: token, expected_role: "customer", confirmation_revision: "revision-fixture",
  } });
  assert.deepEqual(ui.navigation, [ui.pay.href]);
});

test("ACK failure prevents navigation", async t => {
  const ui = await setup(t, { ackFails: true });
  ui.pay.click();
  await settle();
  assert.equal(ui.calls.at(-1).endpoint, "ack");
  assert.deepEqual(ui.navigation, []);
});

test("already acknowledged can navigate without another ACK or duplicate listener", async t => {
  const ui = await setup(t, { acknowledged: true });
  ui.boot();
  await settle();
  ui.pay.click();
  assert.deepEqual(ui.calls.map(call => call.endpoint), ["details", "context"]);
  assert.deepEqual(ui.navigation, [ui.pay.href]);
});

for (const stage of ["balance", "final"]) {
  test(stage + " retains the checkout target and omits unsupported language", async t => {
    const ui = await setup(t, { payment: { stage }, lang: "invalid" });
    assert.equal(ui.pay.hidden, false);
    assertTarget(ui.pay.href, null);
  });
}

test("focus refresh swaps deposit for status when proof arrives", async t => {
  const ui = await setup(t);
  ui.setPayment({ stage: "deposit", amount_due_thb: 1200, proof_received: true });
  ui.w.dispatchEvent(new ui.w.Event("focus"));
  await settle();
  assert.equal(ui.pay.hidden, true);
  assert.equal(ui.pay.hasAttribute("href"), false);
  assertTarget(ui.check.href);
  assert.equal(ui.check.referrerPolicy, "no-referrer");
  assert.deepEqual(ui.navigation, []);
});

for (const [state, options] of Object.entries({
  verified: { payment: { verified: true } },
  cancelled: { details: { session_status: "cancelled" } },
  expired: { payment: { status: "expired" } },
  refunded: { payment: { status: "refunded" } },
  "wrong role": { details: { role: "model" } },
  "pending revision": { details: { confirmation_change_pending: true } },
  "missing token": { query: "" },
  "duplicate token": { query: "t=one&t=two" },
})) {
  test(state + " exposes no payment or status target", async t => {
    const ui = await setup(t, options);
    assert.equal(ui.pay.hidden, true);
    assert.equal(ui.pay.hasAttribute("href"), false);
    assert.equal(ui.check.hasAttribute("href"), false);
    if (state.endsWith("token")) assert.deepEqual(ui.calls, []);
  });
}
