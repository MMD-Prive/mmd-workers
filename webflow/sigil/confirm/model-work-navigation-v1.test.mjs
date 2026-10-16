import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./model-work-navigation-v1.js", import.meta.url), "utf8");

class El {
  constructor() { this.attrs = {}; this.children = []; this.hidden = false; this.textContent = ""; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(child) { this.children.push(child); }
  querySelector() { return this.children.find(c => c.attrs["data-mmd-model-work-nav"]); }
  querySelectorAll() { return this.links || []; }
}
function run({ path = "/sigil/confirm/job-model", first = false, mounted = true } = {}) {
  const root = new El(), head = new El();
  const links = ["/sigil/pay?t=model-secret", "/my-mmd/payments", "/internal/admin/payments", "https://elsewhere.test/pay", "/sigil/model/dashboard"]
    .map(href => { const e = new El(); e.setAttribute("href", href); return e; });
  root.links = links;
  const jobDay = first ? new El() : null;
  if (jobDay) jobDay.setAttribute("href", "/rules/model/private/job-day?t=signed&return_to=job");
  let observer, visible = mounted;
  const document = {
    readyState: "complete", head, body: new El(),
    createElement: () => new El(),
    getElementById: () => visible ? root : null,
    querySelector: () => jobDay,
  };
  const location = { pathname: path, hostname: "www.mmdbkk.com", origin: "https://www.mmdbkk.com", href: `https://www.mmdbkk.com${path}?t=secret&lang=en` };
  vm.runInNewContext(source, { window: {}, document, location, URL, MutationObserver: class { constructor(fn) { observer = fn; } observe() {} } });
  return { root, links, jobDay, update() { visible = true; observer?.(); } };
}

test("model gets only work destinations; signed confirmation token is never copied into navigation", () => {
  const x = run();
  const nav = x.root.children[0];
  assert.deepEqual(nav.children.map(a => a.textContent), ["Jobs", "Model Console", "Rule/model"]);
  assert.deepEqual(nav.children.map(a => a.href), ["/sigil/model/dashboard/jobs?lang=en", "/sigil/model/console?lang=en", "/rules/model?lang=en"]);
  x.update();
  assert.equal(x.root.children.length, 1);
});
test("customer checkout is hidden only in the model root; payout/admin/unrelated links are preserved", () => {
  assert.deepEqual(run().links.map(a => a.hidden), [true, true, false, false, false]);
});
test("Job Day appears only through the server gate and keeps signed acknowledgement context", () => {
  const x = run({ first: true });
  assert.equal(x.jobDay.textContent, "Job Day · คู่มือวันทำงาน");
  assert.equal(x.jobDay.getAttribute("href"), "/rules/model/private/job-day?t=signed&return_to=job");
  assert.equal(run().jobDay, null);
});
test("late-mounted model root is handled while customer confirmation is untouched", () => {
  const x = run({ mounted: false });
  assert.equal(x.root.children.length, 0);
  x.update();
  assert.equal(x.root.children.length, 1);
  const customer = run({ path: "/sigil/confirm/job-confirmation" });
  assert.equal(customer.root.children.length, 0);
  assert.equal(customer.links[0].hidden, false);
});
