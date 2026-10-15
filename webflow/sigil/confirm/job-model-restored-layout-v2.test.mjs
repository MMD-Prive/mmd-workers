import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./job-model-restored-layout-v2.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./job-model-restored-bridge-v2.css", import.meta.url), "utf8");

function harness(path = "/sigil/confirm/job-model") {
  const classes = () => ({ set: new Set(), contains(x) { return this.set.has(x); }, add(x) { this.set.add(x); } });
  const wrap = { children: [], insertBefore(el, ref) { if (el.parentNode?.children) el.parentNode.children = el.parentNode.children.filter(x => x !== el); el.parentNode = this; const i = this.children.indexOf(ref); i < 0 ? this.children.push(el) : this.children.splice(i, 0, el); }, appendChild(el) { this.insertBefore(el, null); } };
  const payout = { textContent: "11,500 THB", dataset: { private: "retained" } };
  const confirm = { listener: () => "ack-current-revision" };
  const card = { children: [payout], nextSibling: confirm }; payout.parentNode = card;
  const nav = {}, map = { classList: classes() }, retry = { classList: classes() };
  wrap.children = [card, confirm];
  wrap.querySelector = () => card;
  const root = { dataset: {}, querySelector: s => ({ ".mm15__wrap": wrap, "[data-m-payout-card]": payout, "[data-mmd-model-work-nav]": nav, "[data-m-map]": map, "[data-m-retry]": retry })[s] };
  let update;
  vm.runInNewContext(source, { location: { pathname: path }, window: {}, document: { readyState: "complete", body: {}, getElementById: () => root }, MutationObserver: class { constructor(fn) { update = fn; } observe() {} } });
  return { wrap, card, payout, confirm, nav, root, map, update };
}
test("restored layout moves existing nodes without losing current payout or acknowledgement listeners", () => {
  const h = harness();
  assert.deepEqual(h.wrap.children, [h.card, h.payout, h.confirm, h.nav]);
  assert.equal(h.payout.textContent, "11,500 THB");
  assert.equal(h.confirm.listener(), "ack-current-revision");
  assert.equal(h.root.dataset.mmdRestoredDesign, "bridge-v2");
  h.update();
  assert.equal(h.wrap.children.length, 4);
});
test("customer route is not changed", () => {
  const h = harness("/sigil/confirm/job-confirmation");
  assert.equal(h.wrap.children.length, 2);
  assert.equal(h.root.dataset.mmdRestoredDesign, undefined);
});
test("presentation contains no API calls or token/identity mutations and supports responsive motion-safe design", () => {
  assert.doesNotMatch(source, /fetch\(|localStorage|searchParams|\.innerHTML|location\.(assign|replace)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media\(min-width:760px\)/);
  assert.match(css, /SIGIL%20JOBS\.webp/);
});
