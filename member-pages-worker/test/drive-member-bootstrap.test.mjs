import test from "node:test";
import assert from "node:assert/strict";

import {
  isDriveBootstrapCandidate,
  packageAccessLayers,
  resolveDrivePackageForEmail,
  resolveTrustedBootstrapEmail,
} from "../src/drive-member-bootstrap.js";

const LINE_ID = "U5107dbdc87dbdd985ef5516b7f208fc3";
const SECRET = "0123456789abcdef0123456789abcdef";

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

test("trusted email fallback accepts only service-resolved canonical email", async () => {
  const seen = [];
  const result = await resolveTrustedBootstrapEmail(LINE_ID, {
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    MEMBER_STATUS_RESOLVER: {
      async fetch(request) {
        seen.push({ url: request.url, body: await request.clone().json() });
        return json({ ok: true, data: { resolved: true, email: "Member@Example.com" } });
      },
    },
  });
  assert.deepEqual(result, { ok: true, email: "member@example.com" });
  assert.equal(seen[0].url, "https://mmd-auth-worker.internal/__internal/member-drive/identity");
  assert.deepEqual(seen[0].body, {
    purpose: "liff_drive_identity_resolution",
    line_user_id: LINE_ID,
  });
});

test("trusted email fallback fails closed on canonical ambiguity", async () => {
  const result = await resolveTrustedBootstrapEmail(LINE_ID, {
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    MEMBER_STATUS_RESOLVER: {
      async fetch() {
        return json({ ok: false, error: { code: "DRIVE_IDENTITY_AMBIGUOUS" } }, 409);
      },
    },
  });
  assert.deepEqual(result, { ok: false, reason: "trusted_email_ambiguous" });
});

test("trusted email fallback does not accept unresolved or malformed identity", async () => {
  const unresolved = await resolveTrustedBootstrapEmail(LINE_ID, {
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    MEMBER_STATUS_RESOLVER: {
      async fetch() {
        return json({ ok: true, data: { resolved: false } });
      },
    },
  });
  assert.deepEqual(unresolved, { ok: false, reason: "trusted_email_unresolved" });
  assert.deepEqual(await resolveTrustedBootstrapEmail("not-a-line-id", {}), {
    ok: false,
    reason: "trusted_email_identity_invalid",
  });
});

test("primary Drive checks Premium first and stops after Premium match", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "primary-token" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "malemodel.bkk@gmail.com" } });
    }
    if (isFolderMetadata(url, "premium-folder")) {
      return json({ owners: [{ emailAddress: "malemodel.bkk@gmail.com" }] });
    }
    if (url.includes("/files/premium-folder/permissions")) {
      return json({ permissions: [{ type: "user", emailAddress: "member@example.com", role: "reader", deleted: false }] });
    }
    throw new Error(`unexpected fetch ${url} ${init.method || "GET"}`);
  };
  try {
    const result = await resolveDrivePackageForEmail("MEMBER@example.com", env());
    assert.deepEqual(result, { package_code: "premium", folder_id: "premium-folder" });
    assert.equal(seen.some((url) => url.includes("standard-folder")), false);
    assert.equal(seen.some((url) => url.includes("fallback-")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("primary Drive falls back from Premium to Standard", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "primary-token" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "malemodel.bkk@gmail.com" } });
    }
    if (isFolderMetadata(url, "premium-folder") || isFolderMetadata(url, "standard-folder")) {
      return json({ owners: [{ emailAddress: "malemodel.bkk@gmail.com" }] });
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

test("verified email checks mmdprive fallback only after primary has no access", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "primary-token" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "malemodel.bkk@gmail.com" } });
    }
    if (isFolderMetadata(url, "premium-folder") || isFolderMetadata(url, "standard-folder")) {
      return json({ owners: [{ emailAddress: "malemodel.bkk@gmail.com" }] });
    }
    if (url.includes("/files/premium-folder/permissions") || url.includes("/files/standard-folder/permissions")) {
      return json({ permissions: [] });
    }
    if (isFolderMetadata(url, "fallback-premium")) {
      return json({ owners: [{ emailAddress: "mmdprive@gmail.com" }] });
    }
    if (url.includes("/files/fallback-premium/permissions")) {
      return json({ permissions: [{ type: "user", emailAddress: "member@example.com", role: "reader" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const result = await resolveDrivePackageForEmail("member@example.com", env({
      DRIVE_FALLBACK_PREMIUM_PACKAGE_FOLDER_ID: "fallback-premium",
      DRIVE_FALLBACK_STANDARD_PACKAGE_FOLDER_ID: "fallback-standard",
    }));
    assert.deepEqual(result, { package_code: "premium", folder_id: "fallback-premium" });
    assert.ok(seen.findIndex((url) => url.includes("standard-folder/permissions")) < seen.findIndex((url) => url.includes("fallback-premium/permissions")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fallback folder must actually be owned by mmdprive@gmail.com", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "primary-token" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/about")) {
      return json({ user: { emailAddress: "malemodel.bkk@gmail.com" } });
    }
    if (isFolderMetadata(url, "premium-folder") || isFolderMetadata(url, "standard-folder")) {
      return json({ owners: [{ emailAddress: "malemodel.bkk@gmail.com" }] });
    }
    if (url.includes("/files/premium-folder/permissions") || url.includes("/files/standard-folder/permissions")) {
      return json({ permissions: [] });
    }
    if (isFolderMetadata(url, "fallback-premium")) {
      return json({ owners: [{ emailAddress: "someone-else@example.com" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    await assert.rejects(() => resolveDrivePackageForEmail("member@example.com", env({
      DRIVE_FALLBACK_PREMIUM_PACKAGE_FOLDER_ID: "fallback-premium",
    })), /drive_folder_owner_mismatch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("primary Drive OAuth identity must be malemodel.bkk@gmail.com", async () => {
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

function env(overrides = {}) {
  return {
    GOOGLE_DRIVE_CLIENT_ID: "client",
    GOOGLE_DRIVE_CLIENT_SECRET: "secret",
    GOOGLE_DRIVE_REFRESH_TOKEN: "refresh",
    DRIVE_MEMBERSHIP_OWNER_EMAIL: "malemodel.bkk@gmail.com",
    DRIVE_PREMIUM_PACKAGE_FOLDER_ID: "premium-folder",
    DRIVE_STANDARD_PACKAGE_FOLDER_ID: "standard-folder",
    DRIVE_FALLBACK_MEMBERSHIP_OWNER_EMAIL: "mmdprive@gmail.com",
    ...overrides,
  };
}

function isFolderMetadata(url, folderId) {
  return url.includes(`/files/${folderId}?`) && !url.includes("/permissions");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
