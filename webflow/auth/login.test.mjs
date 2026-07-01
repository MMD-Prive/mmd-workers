import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./login.js", import.meta.url), "utf8");

function loadLogin({ search = "" } = {}) {
  const window = {
    location: {
      origin: "https://mmdbkk.com",
      pathname: "/login",
      search,
      href: "https://mmdbkk.com/login" + search
    }
  };
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelector() {
      return null;
    }
  };
  const calls = [];
  const context = vm.createContext({
    URL,
    URLSearchParams,
    window,
    document,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true, message: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    },
    Response
  });
  vm.runInContext(source, context);
  return { calls, window };
}

function makeLoginRoot({ email = "CLIENT@Example.COM", code = "123456" } = {}) {
  const status = {
    textContent: "",
    state: "",
    setAttribute(name, value) {
      if (name === "data-state") this.state = value;
    }
  };
  const codePanel = { hidden: true };
  const codeInput = { value: code, disabled: true };
  const verifyButton = { disabled: true, addEventListener() {} };
  const requestButton = { addEventListener() {} };
  const nodes = new Map([
    ["[data-mmd-login-email]", { value: email }],
    ["[data-mmd-login-code]", codeInput],
    ["[data-mmd-login-code-panel]", codePanel],
    ["[data-mmd-login-verify]", verifyButton],
    ["[data-mmd-login-request]", requestButton],
    ["[data-mmd-login-status]", status]
  ]);
  return {
    status,
    codePanel,
    codeInput,
    verifyButton,
    querySelector(selector) {
      return nodes.get(selector) || null;
    }
  };
}

test("requestCode posts email to auth-worker request-code with credentials", async () => {
  const { calls, window } = loadLogin();
  const root = makeLoginRoot();

  const result = await window.MMDLogin.requestCode(root, { baseUrl: "https://auth.example.test/" });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://auth.example.test/v1/auth/request-code");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "client@example.com" });
  assert.equal(root.codePanel.hidden, false);
  assert.equal(root.codeInput.disabled, false);
  assert.equal(root.verifyButton.disabled, false);
});

test("verifyCode posts email and code, then redirects to sanitized next", async () => {
  const { calls, window } = loadLogin({ search: "?next=%2Fmember%2Fdashboard%3Ftab%3Dhome" });
  const root = makeLoginRoot();

  const result = await window.MMDLogin.verifyCode(root, { baseUrl: "https://auth.example.test" });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://auth.example.test/v1/auth/verify-code");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "client@example.com", code: "123456" });
  assert.equal(window.location.href, "/member/dashboard?tab=home");
});

test("safeNext allows same-origin member paths and blocks external URLs", () => {
  const { window } = loadLogin();

  assert.equal(window.MMDLogin.safeNext("/member/dashboard"), "/member/dashboard");
  assert.equal(window.MMDLogin.safeNext("https://evil.example/member/dashboard"), "/member/dashboard");
  assert.equal(window.MMDLogin.safeNext("//evil.example/member/dashboard"), "/member/dashboard");
});
