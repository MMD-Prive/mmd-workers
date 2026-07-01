import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./dashboard.js", import.meta.url), "utf8");

function loadDashboard({ gate, fetchImpl, location = {} } = {}) {
  const window = {
    MMDGate: gate,
    location: {
      origin: "https://mmdbkk.com",
      pathname: "/member/dashboard",
      search: "",
      href: "https://mmdbkk.com/member/dashboard",
      ...location
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
    window,
    document,
    fetch: fetchImpl || (async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }),
    Response
  });
  vm.runInContext(source, context);
  return { calls, window };
}

function makeDashboardRoot() {
  const fields = new Map();
  const lists = new Map();
  const logoutButton = {
    handler: null,
    addEventListener(_eventName, handler) {
      this.handler = handler;
    }
  };
  return {
    authenticated: false,
    fields,
    lists,
    logoutButton,
    setAttribute(name, value) {
      if (name === "data-authenticated") this.authenticated = value;
    },
    querySelector(selector) {
      const field = selector.match(/^\[data-mmd-member-field='([^']+)'\]$/);
      if (field) {
        if (!fields.has(field[1])) fields.set(field[1], { textContent: "" });
        return fields.get(field[1]);
      }
      const list = selector.match(/^\[data-mmd-member-list='([^']+)'\]$/);
      if (list) {
        if (!lists.has(list[1])) lists.set(list[1], { innerHTML: "" });
        return lists.get(list[1]);
      }
      if (selector === "[data-mmd-member-logout]") return logoutButton;
      return null;
    }
  };
}

test("boot redirects to login when shared gate is unavailable", async () => {
  const { window } = loadDashboard();
  const root = makeDashboardRoot();

  const result = await window.MMDMemberDashboard.boot(root);

  assert.equal(result, null);
  assert.equal(window.location.href, "/login?next=%2Fmember%2Fdashboard");
});

test("boot requires auth through MMDGate and renders profile, entitlements, and grants", async () => {
  const authPayload = {
    profile: {
      name: "MMD Client",
      email: "client@example.com",
      phone: "+66000000000",
      tier: "gold",
      status: "active",
      expire_at: "2026-12-31",
      package_code: "PKG-GOLD",
      entitlements: [{ resource_key: "dashboard", min_tier: "gold", expires_at: "2026-12-31" }],
      grants: [{ access_key: "renewal", tier: "gold", expires_at: "2026-12-31" }]
    },
    session: { expires_at: "2026-07-02T00:00:00Z" }
  };
  const root = makeDashboardRoot();
  const { window } = loadDashboard({
    gate: {
      requireMmdAuth: async () => authPayload
    }
  });

  const result = await window.MMDMemberDashboard.boot(root);

  assert.equal(result, authPayload);
  assert.equal(root.authenticated, "true");
  assert.equal(root.fields.get("email").textContent, "client@example.com");
  assert.equal(root.fields.get("status").textContent, "active");
  assert.match(root.lists.get("entitlements").innerHTML, /dashboard/);
  assert.match(root.lists.get("grants").innerHTML, /renewal/);
  assert.equal(typeof root.logoutButton.handler, "function");
});

test("logout posts to auth-worker logout with credentials and returns to login", async () => {
  const { calls, window } = loadDashboard();

  await window.MMDMemberDashboard.logout({ baseUrl: "https://auth.example.test/" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://auth.example.test/v1/auth/logout");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(window.location.href, "/login");
});
