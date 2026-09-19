import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withDashboardLiffChannelCompatibility } from "../src/liff-dashboard-channel-compat.js";

describe("Dashboard LIFF channel compatibility", () => {
  it("aliases the published Dashboard channel for LIFF start when the legacy login channel is absent", () => {
    const resolver = { fetch() {} };
    const kv = { get() {}, put() {} };
    const env = {
      LINE_LOGIN_CHANNEL_ID: "",
      LINE_DASHBOARD_CHANNEL_ID: "2010862595",
      MEMBER_STATUS_RESOLVER: resolver,
      LIFF_IDENTITY_KV: kv,
    };
    const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });

    const compatible = withDashboardLiffChannelCompatibility(request, env);

    assert.notEqual(compatible, env);
    assert.equal(compatible.LINE_LOGIN_CHANNEL_ID, "2010862595");
    assert.equal(compatible.LINE_DASHBOARD_CHANNEL_ID, "2010862595");
    assert.equal(compatible.MEMBER_STATUS_RESOLVER, resolver);
    assert.equal(compatible.LIFF_IDENTITY_KV, kv);
    assert.equal(env.LINE_LOGIN_CHANNEL_ID, "");
  });

  it("never replaces an explicitly configured legacy login channel", () => {
    const env = {
      LINE_LOGIN_CHANNEL_ID: "2000000000",
      LINE_DASHBOARD_CHANNEL_ID: "2010862595",
    };
    const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });

    const compatible = withDashboardLiffChannelCompatibility(request, env);

    assert.equal(compatible, env);
    assert.equal(compatible.LINE_LOGIN_CHANNEL_ID, "2000000000");
  });

  it("fails closed when neither server-owned LINE channel is configured", () => {
    const env = { LINE_LOGIN_CHANNEL_ID: "", LINE_DASHBOARD_CHANNEL_ID: "" };
    const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });

    const compatible = withDashboardLiffChannelCompatibility(request, env);

    assert.equal(compatible, env);
    assert.equal(compatible.LINE_LOGIN_CHANNEL_ID, "");
  });

  it("does not alter unrelated routes or methods", () => {
    const env = { LINE_LOGIN_CHANNEL_ID: "", LINE_DASHBOARD_CHANNEL_ID: "2010862595" };
    const requests = [
      new Request("https://mmdbkk.com/member/api/liff/status", { method: "GET" }),
      new Request("https://mmdbkk.com/member/api/liff/start", { method: "GET" }),
      new Request("https://mmdbkk.com/api/member/app/dashboard", { method: "GET" }),
    ];

    for (const request of requests) {
      assert.equal(withDashboardLiffChannelCompatibility(request, env), env);
    }
  });
});
