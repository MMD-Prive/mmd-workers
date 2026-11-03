import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const fixtures = [
  "webflow/sigil/member/login-existing-member-dialog.html",
  "webflow/sigil/member/existing-member-dialog.html",
];

function executeLoginSnippet({ loggedIn = false, subject = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", draft = null, ready = Promise.resolve() } = {}) {
  const html = fs.readFileSync(fixtures[0], "utf8");
  const source = html.match(/<script id="sigil-member-recovery-runtime">([\s\S]*?)<\/script>/)[1];
  const listeners = new Map();
  const session = new Map(draft ? [["mmd.member.recovery.draft.v2", JSON.stringify(draft)]] : []);
  const trigger = { addEventListener(type, fn) { listeners.set("trigger:" + type, fn); } };
  const children = new Map();
  const dialog = {
    open: false, hidden: false, children,
    setAttribute() {}, showModal() { this.open = true; }, close() { this.open = false; listeners.get("dialog:close")?.(); },
    addEventListener(type, fn) { listeners.set("dialog:" + type, fn); },
    querySelector(selector) { return children.get(selector); },
    set innerHTML(_) {
      const form = { hidden: false, elements: { phone: { value: "" }, email: { value: "" } }, addEventListener(type, fn) { listeners.set("form:" + type, fn); }, querySelector() { return submit; } };
      const status = { textContent: "" }, login = { hidden: true, disabled: false, addEventListener(type, fn) { listeners.set("login:" + type, fn); } }, dashboard = { hidden: true }, submit = { disabled: false };
      children.set("form", form); children.set("[role=status]", status); children.set("[data-recovery-login]", login); children.set("[data-recovery-dashboard]", dashboard); children.set("[type=submit]", submit); children.set("[data-recovery-close]", { addEventListener(type, fn) { listeners.set("close:" + type, fn); } });
    },
  };
  const root = { append(node) { this.dialog = node; }, querySelector() { return trigger; }, dialog: null };
  const liff = { ready, init: async () => {}, isLoggedIn: () => loggedIn, getDecodedIDToken: () => ({ sub: subject }), getIDToken: () => "id-token", login() { throw new Error("unexpected_login"); } };
  const context = { window: { liff }, document: { readyState: "complete", getElementById(id) { return id === "mmd-member-login-lvmaxx" ? root : null; }, createElement() { return dialog; }, addEventListener() {} }, sessionStorage: { getItem: (key) => session.get(key) || null, setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key) }, location: { origin: "https://mmdbkk.com", hash: "#existing-member" }, fetch: async () => { throw new Error("unexpected_fetch"); }, setTimeout, clearTimeout, AbortController, Date, JSON, String, Error, Promise, console };
  vm.runInNewContext(source, context);
  return { listeners, dialog, session, liff };
}

test("executes fresh callback with a cold LIFF SDK without login loop or recovery POST", async () => {
  const { listeners, dialog, session } = executeLoginSnippet({ draft: { phone: "0812345678", lineSub: "", createdAt: Date.now() } });
  await Promise.resolve();
  assert.equal(dialog.querySelector("[data-recovery-login]").hidden, false);
  assert.equal(session.has("mmd.member.recovery.draft.v2"), true);
  assert.equal(Boolean(listeners.get("login:click")), true);
});

test("cancel during delayed LIFF readiness clears draft and cannot resume recovery", async () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const { listeners, session } = executeLoginSnippet({ ready, draft: { phone: "0812345678", lineSub: "", createdAt: Date.now() } });
  listeners.get("dialog:cancel")?.();
  release();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.has("mmd.member.recovery.draft.v2"), false);
});

for (const file of fixtures) {
  test(`${file} resumes recovery without putting contact data in the URL`, () => {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /mmd\.member\.recovery\.draft\.v2/);
    assert.match(html, /DRAFT_TTL=10\*60\*1000/);
    assert.match(html, /sessionStorage\.setItem\(DRAFT_KEY/);
    assert.match(html, /sessionStorage\.removeItem\(DRAFT_KEY/);
    assert.match(html, /getDecodedIDToken/);
    assert.match(html, /static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js|window\.liff/);
    assert.match(html, /allowLogin/);
    assert.match(html, /dialog\.addEventListener\('cancel'/);
    assert.match(html, /data-recovery-close/);
    assert.match(html, /login\.hidden=false/);
    assert.match(html, /บัญชี LINE เปลี่ยนไปจากตอนเริ่มคำขอ/);
    assert.match(html, /member\/api\/liff\/start/);
    assert.match(html, /member\/api\/liff\/recovery/);
    assert.match(html, /generation=0,sessionReady=false,recoveryBinding=''/);
    assert.match(html, /function stale\(token\)/);
    assert.match(html, /path\.endsWith\('\/recovery'\)\)\{if\(!sessionReady\|\|!recoveryBinding/);
    assert.ok(html.indexOf("/member/api/liff/start") < html.indexOf("/member/api/liff/recovery"), "server session binding must precede recovery POST");
    assert.match(html, /login\.hidden=false/);
    assert.match(html, /merge_request_id/);
    assert.doesNotMatch(html, /[?&](?:phone|email)=/i);
    assert.doesNotMatch(html, /redirectUri:[^}]*phone|redirectUri:[^}]*email/i);
  });
}
