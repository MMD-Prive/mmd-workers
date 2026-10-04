import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./model-welcome-v2.html", import.meta.url), "utf8");
const script = html.match(/^<script[^>]*>([\s\S]*)<\/script>\s*$/)?.[1];
assert.ok(script, "Webflow embed contains one script");
new vm.Script(script);

function fakeDocument() {
  const nodes = new Map();
  const makeNode = () => ({
    dataset: {},
    textContent: "",
    children: [],
    appendChild(child) { this.children.push(child); },
    removeAttribute(name) { delete this[name]; },
    setAttribute(name, value) { this[name] = value; },
  });
  const root = makeNode();
  let markup = "";
  root.querySelector = (selector) => root.childrenBySelector?.[selector];
  Object.defineProperty(root, "innerHTML", {
    get() { return markup; },
    set(value) {
      markup = value;
      root.childrenBySelector = Object.fromEntries(
        [".mw2-eyebrow", "h1", ".mw2-signature", ".mw2-body", ".mw2-verify", ".mw2-status"]
          .map((selector) => [selector, makeNode()]),
      );
      root.childrenBySelector[".mw2-verify"].href = "https://miniapp.line.me/2010864854-N34SgCqq/";
    },
  });
  return {
    readyState: "complete",
    head: makeNode(),
    body: { prepend(node) { nodes.set(node.id, node); } },
    createElement: (tag) => tag === "main" ? root : makeNode(),
    getElementById: (id) => nodes.get(id),
    querySelector: (selector) => selector.startsWith("#mmd-model-welcome-v2 ")
      ? root.querySelector(selector.replace("#mmd-model-welcome-v2 ", ""))
      : null,
    get root() { return root; },
  };
}

async function boot(response, options = {}) {
  const document = fakeDocument();
  let redirects = 0;
  const context = {
    document,
    window: { innerWidth: options.desktop === true ? 1280 : 390 },
    module: { exports: {} },
    URL,
    AbortController,
    fetch: async () => response,
    setTimeout: () => 1,
    clearTimeout: () => {},
    location: { replace: () => { redirects++; } },
  };
  vm.runInNewContext(script, context);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  return { document, redirects, api: context.module.exports };
}

test("desktop keeps the existing Webflow page and does not mount Welcome V2", async () => {
  const { document, redirects } = await boot({ status: 401 }, { desktop: true });
  assert.equal(redirects, 0);
  assert.equal(document.getElementById("mmd-model-welcome-v2"), undefined);
  assert.equal(document.getElementById("mmd-model-welcome-v2-style"), undefined);
});

test("verified invited Private Model sees Per's Welcome before choosing Dashboard", async () => {
  const { document, redirects } = await boot({
    ok: true,
    json: async () => ({ ok: true, welcome_context: {
      version: "model_welcome_v2", authority: "admin-worker", resolved: true,
      subject_bound: true, model_lane: "private", entry_source: "per_invite",
      invite_verified: true, invite_replay_safe: true,
    } }),
  });
  assert.equal(redirects, 0);
  assert.equal(document.root.dataset.lane, "private");
  assert.equal(document.root.dataset.entrySource, "per_invite");
  assert.match(document.root.innerHTML, /SĪGIL/);
  assert.match(document.root.querySelector("h1").innerHTML, /ยินดีต้อนรับอีกครั้ง/);
  assert.equal(document.root.querySelector(".mw2-verify").href, "/sigil/model/dashboard");
  assert.match(document.root.innerHTML, /ENTER/);
});

test("unauthenticated visitor sees Public self greeting and LINE Verify", async () => {
  const { document, redirects } = await boot({ status: 401 });
  assert.equal(redirects, 0);
  assert.equal(document.root.dataset.lane, "public");
  assert.equal(document.root.dataset.entrySource, "self");
  assert.match(document.root.innerHTML, /MY MODEL/);
  assert.match(document.root.querySelector(".mw2-verify").href, /miniapp\.line\.me/);
});

test("unresolved response cannot select Private variant", async () => {
  const { document } = await boot({ ok: true, json: async () => ({
    ok: false,
    welcome_context: { version: "model_welcome_v2", authority: "admin-worker", resolved: true,
      subject_bound: true, model_lane: "private" },
  }) });
  assert.equal(document.root.dataset.lane, "public");
});

test("unsafe invite does not select Per copy even when Private lane is trusted", async () => {
  const { document } = await boot({ ok: true, json: async () => ({
    ok: true,
    welcome_context: { version: "model_welcome_v2", authority: "admin-worker", resolved: true,
      subject_bound: true, model_lane: "private", entry_source: "per_invite",
      invite_verified: true, invite_replay_safe: false },
  }) });
  assert.equal(document.root.dataset.lane, "private");
  assert.equal(document.root.dataset.entrySource, "self");
});

test("Welcome uses the selected artwork and keeps the full Per letter", async () => {
  const { document } = await boot({ status: 401 });
  const markup = document.root.innerHTML;
  assert.match(markup, /MY MODEL/);
  assert.match(markup, /data:image\/webp;base64,/);
  assert.match(markup, /ENTER/);
  assert.equal(document.root.querySelector(".mw2-body").children.length, 3);
  assert.match(document.root.querySelector(".mw2-body").children[0].textContent, /ประสบการณ์กว่า 5 ปี/);
  assert.match(document.root.querySelector(".mw2-body").children[2].textContent, /ไม่มีลูกน้อง/);
});
