import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(
  new URL("./model-wish-line-return-bridge-v1.js", import.meta.url),
  "utf8",
);

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function setup({
  href = "https://mmdbkk.com/sigil/model/wish?lang=th",
  pathname = "/sigil/model/wish",
  session = {},
  local = {},
  liff,
  now = 1_790_165_000_000,
} = {}) {
  const sessionStorage = storage(session);
  const localStorage = storage(local);
  const assignments = [];
  const location = {
    href,
    pathname,
    assign(value) {
      assignments.push(String(value));
    },
  };
  const document = { documentElement: { lang: "th" } };
  const window = { liff };
  const DateFixture = class extends Date {
    static now() {
      return now;
    }
  };

  const context = {
    window,
    document,
    location,
    sessionStorage,
    localStorage,
    URL,
    JSON,
    Date: DateFixture,
  };
  runInNewContext(source, context);
  return { window, location, sessionStorage, localStorage, assignments, now };
}

test("Wish installs a Mini App handoff instead of using location.href as redirectUri", () => {
  const f = setup();
  assert.equal(typeof f.window.liff.login, "function");
  f.window.liff.login({ redirectUri: "https://www.mmdbkk.com/sigil/model/wish" });
  assert.equal(f.assignments.length, 1);
  const target = new URL(f.assignments[0]);
  assert.equal(target.origin, "https://miniapp.line.me");
  assert.equal(target.pathname, "/2010864854-N34SgCqq/");
  assert.equal(target.searchParams.get("flow"), "verify");
  assert.equal(target.searchParams.get("return_to"), "wish");
  assert.equal(target.searchParams.get("source"), "model_wish");
  assert.equal(target.searchParams.get("lang"), "th");
  assert.equal(target.searchParams.has("redirectUri"), false);
});

test("handoff preserves the existing Wish draft without storing identity or tokens", () => {
  const draft = JSON.stringify({ birthday: "สุขสันต์วันครบรอบ", private_note: "เปอร์อ่านเท่านั้น" });
  const f = setup({ session: { mmd_model_wish_draft_v5: draft } });
  f.window.liff.login();
  const raw = f.localStorage.getItem("mmd_model_wish_line_return_v1");
  const saved = JSON.parse(raw);
  assert.equal(saved.draft, draft);
  assert.equal(saved.saved_at, f.now);
  assert.deepEqual(Object.keys(saved).sort(), ["draft", "saved_at"]);
});

test("fresh return draft restores once into sessionStorage and is removed", () => {
  const draft = JSON.stringify({ birthday: "กลับมาแล้ว" });
  const f = setup({
    local: {
      mmd_model_wish_line_return_v1: JSON.stringify({
        saved_at: 1_790_164_999_000,
        draft,
      }),
    },
  });
  assert.equal(f.sessionStorage.getItem("mmd_model_wish_draft_v5"), draft);
  assert.equal(f.localStorage.getItem("mmd_model_wish_line_return_v1"), null);
});

test("expired return draft is discarded", () => {
  const f = setup({
    local: {
      mmd_model_wish_line_return_v1: JSON.stringify({
        saved_at: 1_790_000_000_000,
        draft: "stale",
      }),
    },
  });
  assert.equal(f.sessionStorage.getItem("mmd_model_wish_draft_v5"), null);
  assert.equal(f.localStorage.getItem("mmd_model_wish_line_return_v1"), null);
});

test("existing session draft wins over return storage", () => {
  const f = setup({
    session: { mmd_model_wish_draft_v5: "current" },
    local: {
      mmd_model_wish_line_return_v1: JSON.stringify({
        saved_at: 1_790_164_999_000,
        draft: "older",
      }),
    },
  });
  assert.equal(f.sessionStorage.getItem("mmd_model_wish_draft_v5"), "current");
  assert.equal(f.localStorage.getItem("mmd_model_wish_line_return_v1"), null);
});

test("review and developing environments use their matching registered Mini App IDs", () => {
  for (const [environment, expected] of [
    ["review", "2010864853-7SqCQVxy"],
    ["developing", "2010864852-MuzunIKU"],
  ]) {
    const f = setup({ href: `https://mmdbkk.com/sigil/model/wish?liff_env=${environment}&lang=en` });
    f.window.liff.login();
    const target = new URL(f.assignments[0]);
    assert.equal(target.pathname, `/${expected}/`);
    assert.equal(target.searchParams.get("liff_env"), environment);
    assert.equal(target.searchParams.get("lang"), "en");
  }
});

test("non-Wish pages are untouched", () => {
  const originalLogin = () => {};
  const liff = { login: originalLogin };
  const f = setup({
    href: "https://mmdbkk.com/sigil/model/dashboard",
    pathname: "/sigil/model/dashboard",
    liff,
  });
  assert.equal(f.window.liff.login, originalLogin);
  assert.equal(f.window.__mmdWishReturnBridge, undefined);
});
