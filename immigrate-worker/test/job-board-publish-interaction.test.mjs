import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/internal-pages.ts", import.meta.url), "utf8");
const script = source.split("const jobBoardScript = `")[1].split("`;")[0];
const goodLink = "https://www.mmdbkk.com/sigil/model/login?job_id=demo-job";
const good = () => Response.json({ ok: true, broadcast_url: goodLink, board_destination: "https://sigil.mmdbkk.com/public/api/jobs/demo-job" });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const nodes = new Map();
  const timers = new Map();
  const calls = [], copied = [], opened = [];
  let counter = 0, respond = good, clipboard = () => Promise.resolve();
  const values = { board_text: "รายละเอียดงานตัวอย่าง", world: "public" };
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: id === "job-board-copy" ? "Copy Link" : "",
      hidden: id === "job-board-result", disabled: id === "job-board-copy",
      dataset: {}, handlers: {}, href: "",
      removeAttribute(name) { delete this[name]; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
    });
    return nodes.get(id);
  }
  vm.runInNewContext(script, {
    document: { getElementById: node },
    FormData: class { get(key) { return values[key]; } },
    fetch: async (...args) => { calls.push(args); return respond(...args); },
    navigator: { clipboard: { writeText: async (value) => { copied.push(value); return clipboard(value); } } },
    window: { open: (...args) => opened.push(args) },
    setTimeout(fn) { const id = ++counter; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    node, calls, copied, opened, timers, values,
    respond(fn) { respond = fn; }, clipboard(fn) { clipboard = fn; },
    publish: () => node("job-board-form").handlers.submit({ preventDefault() {} }),
    copy: () => node("job-board-copy").handlers.click(),
    open: () => node("job-board-open").handlers.click(),
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
  };
}

test("successful publish exposes a usable link and copy acknowledgement expires normally", async () => {
  const h = harness();
  await h.publish();
  assert.equal(h.node("job-board-link").href, goodLink);
  assert.equal(h.node("job-board-result").hidden, false);
  await h.copy();
  assert.deepEqual(h.copied, [goodLink]);
  assert.equal(h.node("job-board-copy").textContent, "คัดลอกแล้ว ✓");
  h.tick();
  assert.equal(h.node("job-board-copy").textContent, "Copy Link");
  assert.equal(h.node("job-board-copy").disabled, false);
  h.open();
  assert.equal(h.opened[0][0], "https://sigil.mmdbkk.com/public/api/jobs/demo-job");
});

test("copy then failed republish cancels old feedback and removes stale links", async () => {
  const h = harness();
  await h.publish();
  await h.copy();
  const oldCallback = [...h.timers.values()][0];
  h.respond(() => Response.json({ ok: false, error: "unavailable" }, { status: 503 }));
  await h.publish();
  assert.equal(h.timers.size, 0);
  oldCallback(); // A callback already queued before cancellation must also be harmless.
  h.tick();
  assert.equal(h.node("job-board-copy").disabled, true);
  assert.equal(h.node("job-board-copy").textContent, "Copy Link");
  assert.equal(h.node("job-board-open").disabled, true);
  assert.equal(h.node("job-board-result").hidden, true);
  assert.equal(h.node("job-board-link").href, undefined);
  await h.copy();
  h.open();
  assert.equal(h.copied.length, 1);
  assert.equal(h.opened.length, 0);
  assert.match(h.node("job-board-status").textContent, /ยังลง Job Board ไม่สำเร็จ/);
});

for (const outcome of ["resolve", "reject"]) {
  test("late clipboard " + outcome + " cannot overwrite a newer publish failure", async () => {
    const h = harness();
    await h.publish();
    const pending = deferred();
    h.clipboard(() => pending.promise);
    const copying = h.copy();
    h.respond(() => Response.json({ ok: false }, { status: 503 }));
    await h.publish();
    const message = h.node("job-board-status").textContent;
    if (outcome === "resolve") pending.resolve();
    else pending.reject(new Error("clipboard denied"));
    await copying;
    assert.equal(h.node("job-board-status").textContent, message);
    assert.equal(h.node("job-board-copy").disabled, true);
    assert.equal(h.timers.size, 0);
  });
}

test("repeated submit and copy clicks issue a single in-flight request", async () => {
  const h = harness();
  const pending = deferred();
  h.respond(() => pending.promise);
  const publishing = h.publish();
  await h.publish();
  assert.equal(h.calls.length, 1);
  pending.resolve(good());
  await publishing;
  const clipboard = deferred();
  h.clipboard(() => clipboard.promise);
  const copying = h.copy();
  await h.copy();
  assert.equal(h.copied.length, 1);
  clipboard.resolve();
  await copying;
});

test("clipboard failure permits retry for the same valid link", async () => {
  const h = harness();
  await h.publish();
  h.clipboard(() => Promise.reject(new Error("denied")));
  await h.copy();
  assert.equal(h.node("job-board-copy").disabled, false);
  h.clipboard(() => Promise.resolve());
  await h.copy();
  assert.equal(h.copied.length, 2);
  assert.equal(h.node("job-board-copy").textContent, "คัดลอกแล้ว ✓");
});

test("invalid broadcast response exposes no link and can be retried", async () => {
  const h = harness();
  h.respond(() => Response.json({ ok: true, broadcast_url: "https://example.com" }));
  await h.publish();
  h.open();
  await h.copy();
  assert.equal(h.opened.length, 0);
  assert.equal(h.copied.length, 0);
  assert.equal(h.node("job-board-result").hidden, true);
  assert.equal(h.node("job-board-publish").disabled, false);
  h.respond(good);
  await h.publish();
  assert.equal(h.node("job-board-copy").disabled, false);
});
