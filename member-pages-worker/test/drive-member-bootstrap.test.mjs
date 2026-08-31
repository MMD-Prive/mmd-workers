import test from "node:test";
import assert from "node:assert/strict";

import {
  isDriveBootstrapCandidate,
  packageAccessLayers,
  resolveDrivePackageForEmail,
} from "../src/drive-member-bootstrap.js";

test("Premium package inherits Standard access", () => {
  assert.deepEqual(packageAccessLayers("premium"), ["standard", "premium"]);
});

test("Standard package never inherits Premium access", () => {
  assert.deepEqual(packageAccessLayers("standard"), ["standard"]);
  assert.deepEqual(packageAccessLayers("unknown"), []);
});

test("only unresolved LIFF start responses are Drive bootstrap candidates", () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST", body: "{}" });
  assert.equal(isDriveBootstrapCandidate(request, {
    ok: true,
    data: { member_resolved: false, pending_identity: true },
  }), true);
  assert.equal(isDriveBootstrapCandidate(request, {
    ok: true,
    data: { member_resolved: true, pending_identity: false },
  }), false);
});

test("Drive permission resolver checks Premium first and returns Premium", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    if (url === "https://oauth2.googleapis.com/token") {
      return json({ access_token: "access-token" });
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "malemodel.bkk@gmail.com" } });
    }
    if (url.includes("/files/premium-folder/permissions")) {
      return json({ permissions: [{ type: "user", emailAddress: "member@example.com", role: "reader", deleted: false }] });
    }
    if (url.includes("/files/standard-folder/permissions")) {
      throw new Error("standard should not be queried after premium match");
    }
    throw new Error(`unexpected fetch ${url} ${init.method || "GET"}`);
  };
  try {
    const result = await resolveDrivePackageForEmail("MEMBER@example.com", env());
    assert.deepEqual(result, { package_code: "premium", folder_id: "premium-folder" });
    assert.equal(seen.some((url) => url.includes("standard-folder")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive permission resolver falls back to Standard only", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "access-token" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "malemodel.bkk@gmail.com" } });
    }
    if (url.includes("/files/premium-folder/permissions")) return json({ permissions: [] });
    if (url.includes("/files/standard-folder/permissions")) {
      return json({ permissions: [{ type: "user", emailAddress: "member@example.com", role: "reader" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const result = await resolveDrivePackageForEmail("member@example.com", env());
    assert.deepEqual(result, { package_code: "standard", folder_id: "standard-folder" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive OAuth identity must be malemodel.bkk@gmail.com", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "access-token" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "someone-else@example.com" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    await assert.rejects(() => resolveDrivePackageForEmail("member@example.com", env()), /drive_owner_mismatch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function env() {
  return {
    GOOGLE_DRIVE_CLIENT_ID: "client",
    GOOGLE_DRIVE_CLIENT_SECRET: "secret",
    GOOGLE_DRIVE_REFRESH_TOKEN: "refresh",
    DRIVE_MEMBERSHIP_OWNER_EMAIL: "malemodel.bkk@gmail.com",
    DRIVE_PREMIUM_PACKAGE_FOLDER_ID: "premium-folder",
    DRIVE_STANDARD_PACKAGE_FOLDER_ID: "standard-folder",
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
