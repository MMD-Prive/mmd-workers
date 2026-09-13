import test from "node:test";
import assert from "node:assert/strict";
import { isPrivatePreviewRequest, PrivatePreviewGate } from "./src/private-preview.js";

test("private preview routes are narrowly matched", () => {
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/status"), true);
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/consume"), true);
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/other"), false);
});

function stateMock() {
  const values = new Map();
  return {
    storage: {
      get: key => values.get(key),
      transaction: fn => fn({
        get: key => values.get(key),
        put: (key, value) => values.set(key, value),
      }),
    },
  };
}

test("private preview gate consumes exactly once", async () => {
  const gate = new PrivatePreviewGate(stateMock());
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const first = await gate.fetch(new Request("https://private-preview.internal/consume", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ expiresAt }),
  }));
  assert.equal(first.status, 204);
  const second = await gate.fetch(new Request("https://private-preview.internal/consume", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ expiresAt }),
  }));
  assert.equal(second.status, 410);
  assert.equal((await gate.fetch("https://private-preview.internal/status")).status, 410);
});

test("expired preview cannot be consumed", async () => {
  const gate = new PrivatePreviewGate(stateMock());
  const response = await gate.fetch(new Request("https://private-preview.internal/consume", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ expiresAt:"2020-01-01T00:00:00.000Z" }),
  }));
  assert.equal(response.status, 410);
});
