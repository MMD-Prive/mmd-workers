import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import worker from "../src/index.js";

const publicArtifacts = [
  "../../webflow/member/apply/member-apply.html",
  "../../webflow/member/apply/member-apply.js",
  "../../webflow/member/apply/member-apply-os.js",
  "../../webflow/member/apply/member-application.contract.json",
];

describe("Public World / private boundary", () => {
  it("keeps public Member Application artifacts free of private-model and SIGIL destinations", () => {
    for (const relativePath of publicArtifacts) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      assert.doesNotMatch(source, /private[\s_-]*models?/i, relativePath);
      assert.doesNotMatch(source, /\/sigil\//i, relativePath);
      assert.doesNotMatch(source, /sigil\.mmdbkk\.com/i, relativePath);
    }
  });

  it("keeps public aliases on public destinations", async () => {
    for (const path of ["/trust/inme", "/inme", "/login", "/members", "/trust", "/membership", "/renew", "/renewal"]) {
      const response = await worker.fetch(new Request(`https://www.mmdbkk.com${path}?t=kept`));
      assert.equal(response.status, 301, path);
      assert.doesNotMatch(response.headers.get("location") || "", /\/sigil\//i, path);
    }
  });

  it("proxies the public application API without exposing a private browser route", async () => {
    const requests = [];
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/member/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route: "/member/apply" }),
    }), {
      SIGIL_WORKER: {
        fetch: async (request) => {
          requests.push(request);
          return new Response(JSON.stringify({ ok: true }), { status: 202 });
        },
      },
    });

    assert.equal(response.status, 202);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].url).pathname, "/v1/member/applications");
    assert.equal(response.headers.get("x-mmd-page"), "member-application-api");
    assert.doesNotMatch(response.headers.get("location") || "", /\/sigil\//i);
  });
});
