import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const { parseHTML } = await import(process.env.MMD_CARD_DOM_MODULE || "linkedom");
const source = await readFile(new URL("./auto-card-inbox.js", import.meta.url), "utf8");
const html = await readFile(new URL("./auto-card-inbox.html", import.meta.url), "utf8");
const job = { job_id: "card_" + "a".repeat(32), model_record_id: "recModel000000001", model_name: "Jasper OP", state: "awaiting_owner_review" };
const list = (jobs = [], enabled = true, cursor = null) => Response.json({ ok: true, jobs, enabled, cursor });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); }
function setup(handler, markup = html) {
  const { document, Event } = parseHTML("<html><body>" + markup + "</body></html>");
  document.readyState = "complete";
  const calls = [], revoked = [], events = {};
  const context = vm.createContext({ document, AbortController, setTimeout, clearTimeout, Set,
    URL: { createObjectURL: () => "blob:private-card", revokeObjectURL: value => revoked.push(value) },
    window: { location: { pathname: "/internal/admin/studio/upload", search: "?t=preserve%2Bexact&view=cards" }, addEventListener: (name, callback) => { events[name] = callback; } },
    fetch: async (path, options) => { calls.push({ path, options }); return handler(path, options, calls.length); },
  });
  const run = () => vm.runInContext(source, context);
  const q = selector => document.querySelector(selector);
  const click = selector => q(selector).dispatchEvent(new Event("click"));
  run();
  return { document, q, calls, revoked, events, run, click };
}

test("mounts only once, sends cookies to the fixed endpoint and shows disabled automation truthfully", async () => {
  const h = setup(() => list([], false)); h.run(); await settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].path, "/studio/api/model-cards/list");
  assert.equal(h.calls[0].options.credentials, "include");
  assert.equal(h.calls[0].options.redirect, "error");
  assert.match(h.q("[data-status]").textContent, /ยังไม่ได้เปิด/);
  assert.equal(h.q("[data-refresh]").disabled, false);
  const absent = setup(() => list(), "<p>Other page</p>"); await settle(); assert.equal(absent.calls.length, 0);
});
test("auth expiry clears private previews and preserves the original query in the login return", async () => {
  let expired = false;
  const h = setup(path => expired ? new Response(null, { status: 401 }) : path.endsWith("preview") ? new Response("png", { headers: { "content-type": "image/png" } }) : list([job]));
  await settle(); h.click("article button"); await settle();
  assert.equal(h.q("[data-image] a").download, job.job_id + "-1322x1200.png");
  expired = true; h.click("[data-refresh]"); await settle();
  assert.equal(h.q("[data-image]").children.length, 0); assert.equal(h.q("[data-jobs]").children.length, 0);
  assert.equal(h.q("[data-login]").hidden, false);
  assert.equal(new URL(h.q("[data-login]").getAttribute("href"), "https://mmdbkk.com").searchParams.get("next"), "/internal/admin/studio/upload?t=preserve%2Bexact&view=cards");
  assert.deepEqual(h.revoked, ["blob:private-card"]);
});
test("concurrent refresh, pagination and preview clicks cannot duplicate requests", async () => {
  let resolve;
  const h = setup(() => new Promise(r => { resolve = r; }));
  h.click("[data-refresh]"); h.run(); assert.equal(h.calls.length, 1);
  resolve(list([job], true, "page-two")); await settle();
  h.click("[data-more]"); h.click("[data-more]"); h.click("article button");
  assert.equal(h.calls.length, 2); assert.deepEqual(JSON.parse(h.calls[1].options.body), { cursor: "page-two" });
  resolve(list([job], true)); await settle();
  assert.equal(h.q("[data-jobs]").children.length, 1); assert.equal(h.q("[data-more]").hidden, true);
});
test("safe resume refreshes status; a disabled backend never offers resume", async () => {
  const held = { ...job, state: "waiting_profile", can_resume: true };
  const h = setup(path => path.endsWith("resume") ? Response.json({ ok: true }) : list([held]));
  await settle(); h.click("article button"); h.click("article button"); await settle();
  assert.equal(h.calls.filter(c => c.path.endsWith("resume")).length, 1);
  assert.deepEqual(JSON.parse(h.calls[1].options.body), { model_record_id: job.model_record_id, job_id: job.job_id });
  assert.equal(h.calls.filter(c => c.path.endsWith("list")).length, 2);
  const off = setup(() => list([held], false)); await settle(); assert.equal(off.q("article button"), null);
});
test("missing backend and malformed responses remain visible errors with retry", async () => {
  for (const response of [new Response(null, { status: 404 }), new Response("<html>login</html>", { headers: { "content-type": "text/html" } }), Response.json({ ok: true, jobs: "wrong" }), list([{ job_id: "invalid" }])]) {
    const h = setup(() => response); await settle();
    assert.match(h.q("[data-status]").textContent, /ยังไม่เปิด|เชื่อมต่อรายการการ์ดไม่ได้/);
    assert.equal(h.q("[data-refresh]").disabled, false); assert.equal(h.q("article"), null);
  }
});
test("HTML masquerading as a preview is rejected and model text cannot create markup", async () => {
  const h = setup(path => path.endsWith("preview") ? new Response("<html>login</html>", { headers: { "content-type": "text/html" } }) : list([{ ...job, model_name: '<img src=x onerror=alert(1)>' }]));
  await settle(); assert.equal(h.q("article img"), null);
  h.click("article button"); await settle(); assert.equal(h.q("[data-image] a"), null);
  assert.match(h.q("[data-status]").textContent, /เชื่อมต่อรายการการ์ดไม่ได้/);
});
test("modified cross-origin configuration never receives credentials", async () => {
  const h = setup(() => list(), html.replace('data-list="/studio/api/model-cards/list"', 'data-list="https://example.com/list"'));
  await settle(); assert.equal(h.calls.length, 0); assert.match(h.q("[data-status]").textContent, /เชื่อมต่อรายการการ์ดไม่ได้/);
});
