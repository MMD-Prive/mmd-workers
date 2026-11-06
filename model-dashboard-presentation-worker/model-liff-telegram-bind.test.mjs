import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function script(opts = {}) {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq", fallback: "https://miniapp.line.me/x",
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js", environment: "published", ...opts,
  });
  assert.match(html, /\/v1\/model\/telegram\/bind/);
  return html.match(/<script>([\s\S]*?)<\/script>/)[1];
}

function run(opts, bindReply) {
  const redirects = [], urls = [], clicks = {};
  const mk = (id) => ({ id, textContent: "", hidden: false, href: "", addEventListener(t, f) { clicks[id + ":" + t] = f; }, style: {}, appendChild() {}, remove() {}, parentNode: { insertBefore(n) { urls.push("card"); (n.children || []).forEach(() => {}); globalThis.__box = n; } } });
  const nodes = Object.fromEntries(["status", "session-pill", "fallback", "detail", "loading-meter"].map(i => [i, mk(i)]));
  const buttons = [];
  const document = {
    getElementById: (i) => nodes[i],
    createElement: (tag) => { const e = { tag, style: {}, children: [], textContent: "", listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, appendChild(c) { this.children.push(c); }, remove() {} }; buttons.push(e); return e; },
    head: { appendChild() {} },
  };
  const fetched = [];
  const fetch = async (url) => {
    fetched.push(url);
    if (url === "/v1/model/liff/exchange") return reply(200, { ok: true });
    if (url === "/v1/model/telegram/bind") return bindReply;
    return reply(200, { ok: true });
  };
  const window = { location: { origin: "https://mmdbkk.com", replace: (u) => redirects.push(u) }, liff: { init: async () => {}, getIDToken: () => "TOKEN", openWindow() {} }, open() {} };
  const ctx = { window, document, fetch, URL, URLSearchParams, Promise, setTimeout, clearTimeout, AbortController, JSON, Error, String, console, Date };
  runInNewContext(script(opts), ctx);
  const done = (async () => { for (let i = 0; i < 100 && !redirects.length; i++) await new Promise((res) => setTimeout(res, 5)); })();
  return { redirects, fetched, buttons, done };
}

test("already connected: bind is checked, redirect is immediate", async () => {
  const r = run({}, reply(200, { telegram_connected: true }));
  await r.done;
  assert.ok(r.fetched.includes("/v1/model/telegram/bind"));
  assert.equal(r.redirects.length, 1);
});

test("bind endpoint failure never blocks the redirect", async () => {
  const r = run({}, reply(500, { ok: false }));
  await r.done;
  assert.equal(r.redirects.length, 1);
});

test("non-t.me connect_url is ignored", async () => {
  const r = run({}, reply(200, { telegram_connected: false, connect_url: "https://evil.example/?start=bind_x" }));
  await r.done;
  assert.equal(r.redirects.length, 1);
  assert.equal(r.buttons.length, 0);
});

test("not connected: shows connect + later, redirects only after later", async () => {
  const r = run({}, reply(200, { telegram_connected: false, connect_url: "https://t.me/mmd_bot?start=bind_abc" }));
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(r.redirects.length, 0, "waits for the user");
  const later = r.buttons.find((b) => b.textContent === "ไว้ทีหลัง");
  assert.ok(later, "later button present");
  later.listeners.click();
  await r.done;
  assert.equal(r.redirects.length, 1);
});
