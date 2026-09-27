import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  isMmdRichMenuHidden,
  classifyMmdUsers,
  getMmdRichMenuActionMap,
  getMmdRichMenuTapFrames,
  getMmdRichMenuImageSources,
  getMmdRichMenuVersion,
  getMmdRichMenuFiveStateMatrix,
  isMmdRichMenuScheduledRequest,
  handleMmdRichMenuScheduledRequest,
  prepareMmdRichMenus,
} from "../src/mmd-rich-menu-scheduled-runtime.mjs";

function pngFixture(bytes, marker = 0) {
  const buffer = Buffer.alloc(bytes);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(1080, 16);
  buffer.writeUInt32BE(728, 20);
  buffer[buffer.length - 1] = marker;
  return buffer;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function bounds(width, height, frame, index) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const x0 = Math.round(width * frame.left);
  const x1 = Math.round(width * frame.right);
  const y0 = Math.round(height * frame.top);
  const y1 = Math.round(height * frame.bottom);
  const xs = x0 + Math.round((x1 - x0) * col / 3);
  const xe = x0 + Math.round((x1 - x0) * (col + 1) / 3);
  const ys = y0 + Math.round((y1 - y0) * row / 2);
  const ye = y0 + Math.round((y1 - y0) * (row + 1) / 2);
  return { x: xs, y: ys, width: Math.max(1, xe - xs), height: Math.max(1, ye - ys) };
}

function menuRow(id, spec) {
  return {
    richMenuId: id,
    size: { width: 1080, height: 728 },
    selected: false,
    name: spec.name,
    chatBarText: "MMD",
    areas: spec.actions.map((action, index) => ({ bounds: bounds(1080, 728, spec.frame, index), action })),
  };
}

function menuSpecs(canonical, expectedHash = sha256(canonical)) {
  const frame = { left: .43, top: .15, right: .99, bottom: .76 };
  const action = { type: "message", label: "TEST", text: "test" };
  return {
    guest: { name: "MMD Guest test", frame, images: ["https://assets.example/guest.png"], actions: [action] },
    public: { name: "MMD Public test", frame, images: ["https://assets.example/public.png"], actions: [action] },
    private: {
      name: "MMD Private test",
      repairName: "MMD Private test artwork-approved",
      frame,
      images: [{ url: "https://assets.example/private.png", bytes: canonical.byteLength, sha256: expectedHash }],
      actions: [action],
    },
  };
}

function installRichMenuFetch(specs, canonical, livePrivate) {
  const keys = ["guest", "public", "private"];
  const ids = { guest: "guest-id", public: "public-id", private: "private-old-id" };
  const rows = keys.map((key) => menuRow(ids[key], specs[key]));
  const sources = typeof canonical === "object" && !Buffer.isBuffer(canonical)
    ? canonical
    : { private: canonical };
  const images = new Map(keys.map((key) => [ids[key],
    typeof livePrivate === "object" && !Buffer.isBuffer(livePrivate)
      ? livePrivate[key]
      : key === "private" ? livePrivate : sources[key],
  ]).filter(([, image]) => image));
  const calls = [];
  let created = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.endsWith("/v2/bot/richmenu/list")) return Response.json({ richmenus: rows });
    for (const key of keys) {
      if (url === `https://assets.example/${key}.png` && sources[key]) {
        return new Response(sources[key], { status: 200 });
      }
    }
    if (url.includes("api-data.line.me/v2/bot/richmenu/") && method === "GET") {
      const id = decodeURIComponent(url.split("/richmenu/")[1].split("/content")[0]);
      return new Response(images.get(id) || Buffer.alloc(0), { status: images.has(id) ? 200 : 404 });
    }
    if (url.endsWith("/v2/bot/richmenu") && method === "POST") {
      created += 1;
      const richMenuId = `created-${created}`;
      rows.push({ richMenuId, ...JSON.parse(String(init.body)) });
      return Response.json({ richMenuId });
    }
    if (url.includes("api-data.line.me/v2/bot/richmenu/") && method === "POST") {
      const id = decodeURIComponent(url.split("/richmenu/")[1].split("/content")[0]);
      images.set(id, Buffer.from(init.body));
      return new Response("", { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  return {
    calls,
    rows,
    restore() { globalThis.fetch = originalFetch; },
  };
}

test("MMD Rich Menu remains available at every Bangkok hour", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    assert.equal(isMmdRichMenuHidden(new Date(Date.UTC(2026, 8, 8, hour))), false);
  }
});

test("MMD 3-level Rich Menu actions match the canonical customer labels", () => {
  const map = getMmdRichMenuActionMap();

  assert.deepEqual(map.guest, [
    { type: "uri", label: "START HERE", uri: "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup" },
    { type: "uri", label: "PUBLIC MODELS", uri: "https://mmdbkk.com/profiles?source=line&entry_route=rich_menu_guest_models" },
    { type: "uri", label: "BOOKING", uri: "https://mmdbkk.com/booking?source=line&entry_route=rich_menu_guest_booking" },
    { type: "uri", label: "PUBLIC SERVICES", uri: "https://mmdbkk.com/services/companion?source=line&entry_route=rich_menu_guest_services" },
    { type: "uri", label: "MMD STORIES", uri: "https://mmdbkk.com/tmib?source=line&entry_route=rich_menu_guest_stories" },
    { type: "postback", label: "SUPPORT", data: "mmd_action=support&audience=guest&intent=ใช้บริการยังไง" },
  ]);

  assert.deepEqual(map.public, [
    { type: "message", label: "คุยกับ PER", text: "Hi Per" },
    { type: "uri", label: "PUBLIC MODELS", uri: "https://mmdbkk.com/profiles?source=line&entry_route=rich_menu_public_models" },
    { type: "uri", label: "BOOKING", uri: "https://mmdbkk.com/booking?source=line&entry_route=rich_menu_public_booking" },
    { type: "uri", label: "MY MMD", uri: "https://liff.line.me/2010862595-yT4DCEMc?intent=status&view=profile" },
    { type: "uri", label: "PRIVE ACCESS", uri: "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup" },
    { type: "postback", label: "SUPPORT", data: "mmd_action=support&audience=public&intent=ใช้บริการยังไง" },
  ]);

  assert.deepEqual(map.private, [
    { type: "postback", label: "KENJI AI", data: "mmd_action=kenji_ai&audience=private&source=private_rich_menu" },
    { type: "uri", label: "MODEL CARDS", uri: "https://mmdbkk.com/member/private?source=line&entry_route=rich_menu_model_cards#detail-model" },
    { type: "uri", label: "BOOKING", uri: "https://mmdbkk.com/find?source=line&entry_route=rich_menu_private_booking" },
    { type: "uri", label: "MY MMD", uri: "https://liff.line.me/2010862595-yT4DCEMc?intent=status&view=profile" },
    { type: "uri", label: "PRIVE UPDATE", uri: "https://mmdbkk.com/member/private?source=line&entry_route=rich_menu_prive_update#access" },
    { type: "postback", label: "SUPPORT", data: "mmd_action=kenji_ai&entry=support&audience=private&source=private_rich_menu" },
  ]);
});

test("LV1 v4.1 uses the MMD Stories image and never falls back to the ABOUT MMD asset", () => {
  const images = getMmdRichMenuImageSources();
  assert.equal(images.guest.length, 1);
  assert.ok(images.guest.every((url) => url.includes("6ab373e94a52accb54062a99")));
  assert.equal(images.guest.some((url) => url.includes("6a9ef89d2b35f4308fb3de8e")), false);
});

test("Guest and Public support stay Kenji-invisible while Private keeps a typed Kenji entry", () => {
  const map = getMmdRichMenuActionMap();
  assert.equal(map.guest[5].type, "postback");
  assert.equal(map.public[5].type, "postback");
  assert.equal(JSON.stringify(map.guest[5]).includes("Hi Kenji"), false);
  assert.equal(JSON.stringify(map.public[5]).includes("Hi Kenji"), false);
  assert.deepEqual(map.private[0], { type: "postback", label: "KENJI AI", data: "mmd_action=kenji_ai&audience=private&source=private_rich_menu" });
  assert.deepEqual(map.private[5], { type: "postback", label: "SUPPORT", data: "mmd_action=kenji_ai&entry=support&audience=private&source=private_rich_menu" });
});

test("Private tap grid excludes the character artwork", () => {
  assert.deepEqual(getMmdRichMenuTapFrames().private, { left: .43, top: .15, right: .99, bottom: .76 });
});

test("verified customer stays Public without active private entitlement", () => {
  const clients = [{ fields: { line_user_id: "U-public", "Verification Status": "verified" } }];
  const result = classifyMmdUsers(clients, [], new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: [], public: ["U-public"], private: [] });
});

test("active private entitlement maps to Private", () => {
  const clients = [{ fields: { line_user_id: "U-private", "Verification Status": "verified" } }];
  const entitlements = [{ fields: { line_user_id: "U-private", capability: "private_premium", member_lifecycle_status: "active", expire_at: "2026-12-01T00:00:00Z" } }];
  const result = classifyMmdUsers(clients, entitlements, new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: [], public: [], private: ["U-private"] });
});

test("expired/grace private entitlement falls back to Public, not Guest", () => {
  const clients = [{ fields: { line_user_id: "U-grace", "Verification Status": "verified" } }];
  const entitlements = [{ fields: { line_user_id: "U-grace", capability: "private_standard", member_lifecycle_status: "grace", expire_at: "2026-09-07T00:00:00Z" } }];
  const result = classifyMmdUsers(clients, entitlements, new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: [], public: ["U-grace"], private: [] });
});

test("unverified known customer maps to Guest", () => {
  const clients = [{ fields: { line_user_id: "U-guest", "Verification Status": "pending" } }];
  const result = classifyMmdUsers(clients, [], new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: ["U-guest"], public: [], private: [] });
});

test("current production object version preserves the approved LV1 v4.1 artwork", () => {
  assert.equal(getMmdRichMenuVersion(), "mmd-rm3-20260924-v4.6");
  assert.ok(getMmdRichMenuImageSources().guest.every((url) => url.includes("Guest%20v4.1%20LINE.png")));
});

test("Guest, Public, and Private artwork sources pin their approved S3 versions", () => {
  const sources = getMmdRichMenuImageSources();
  const versions = {
    guest: "_NVnI6XjyjYKc2WXR.0RjR34IkKj75eA",
    public: "vZj_Lsl1geNEDlhqsXC4b4iaFEZ5uzKk",
    private: "pf8SCzdglxtzEEhD1obnZYhmsY.7rzvJ",
  };
  for (const [key, version] of Object.entries(versions)) {
    assert.equal(sources[key].length, 1);
    assert.equal(new URL(sources[key][0]).searchParams.get("versionId"), version);
  }
});

test("prepare repairs wrong Guest and Public artwork once, leaving Private, default, and links untouched", async () => {
  const canonical = pngFixture(4096, 1);
  const wrong = pngFixture(4096, 2);
  const specs = menuSpecs(canonical);
  for (const key of ["guest", "public"]) {
    specs[key].repairName = `${specs[key].name} artwork-${sha256(canonical).slice(0, 8)}`;
    specs[key].images = [{
      url: `https://assets.example/${key}.png`,
      bytes: canonical.byteLength,
      sha256: sha256(canonical),
    }];
  }
  const mock = installRichMenuFetch(specs, { guest: canonical, public: canonical, private: canonical }, {
    guest: wrong, public: wrong, private: canonical,
  });
  try {
    const first = await prepareMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test" }, { menuSpecs: specs });
    assert.equal(first.menu_names.guest, specs.guest.repairName);
    assert.equal(first.menu_names.public, specs.public.repairName);
    assert.equal(first.menu_names.private, specs.private.name);
    assert.equal(first.customer_assignments_changed, false);
    assert.equal(first.default_menu_changed, false);
    assert.deepEqual(mock.rows.filter((row) => row.name.endsWith(`artwork-${sha256(canonical).slice(0, 8)}`))
      .map((row) => row.name), [specs.guest.repairName, specs.public.repairName]);
    assert.equal(mock.calls.filter((call) => call.method === "POST" && call.url.endsWith("/v2/bot/richmenu")).length, 2);
    assert.equal(mock.calls.some((call) => call.url.includes("/user/") || call.url.includes("/bulk/")), false);

    await prepareMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test" }, { menuSpecs: specs });
    assert.equal(mock.calls.filter((call) => call.method === "POST" && call.url.endsWith("/v2/bot/richmenu")).length, 2);
  } finally {
    mock.restore();
  }
});

for (const key of ["guest", "public"]) {
  test(`prepare fails closed before creating a ${key} object if its pinned source has drifted`, async () => {
    const canonical = pngFixture(4096, 1);
    const wrong = pngFixture(4096, 2);
    const specs = menuSpecs(canonical);
    specs[key].repairName = `${specs[key].name} artwork-approved`;
    specs[key].images = [{
      url: `https://assets.example/${key}.png`,
      bytes: canonical.byteLength,
      sha256: sha256(wrong),
    }];
    const mock = installRichMenuFetch(specs, { [key]: canonical, private: canonical }, {
      [key]: wrong, private: canonical,
    });
    try {
      await assert.rejects(
        prepareMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test" }, { menuSpecs: specs }),
        /image_integrity_mismatch/,
      );
      assert.equal(mock.calls.some((call) => call.method === "POST"), false);
    } finally {
      mock.restore();
    }
  });
}

test("prepare replaces a same-name Private menu with wrong artwork without touching Guest or Public", async () => {
  const canonical = pngFixture(4096, 1);
  const wrong = pngFixture(4096, 2);
  const specs = menuSpecs(canonical);
  const mock = installRichMenuFetch(specs, canonical, wrong);
  try {
    const first = await prepareMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test" }, { menuSpecs: specs });
    assert.equal(first.menu_names.private, specs.private.repairName);
    assert.equal(mock.rows.filter((row) => row.name === specs.private.repairName).length, 1);
    assert.equal(mock.rows.filter((row) => row.name === specs.guest.name).length, 1);
    assert.equal(mock.rows.filter((row) => row.name === specs.public.name).length, 1);
    assert.equal(mock.calls.filter((call) => call.method === "POST" && call.url.endsWith("/v2/bot/richmenu")).length, 1);
    assert.equal(mock.calls.some((call) => call.url.endsWith("/user/all/richmenu")), false);
    assert.equal(mock.calls.some((call) => call.url.includes("/bulk/")), false);

    await prepareMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test" }, { menuSpecs: specs });
    assert.equal(mock.calls.filter((call) => call.method === "POST" && call.url.endsWith("/v2/bot/richmenu")).length, 1);
  } finally {
    mock.restore();
  }
});

test("prepare fails closed when a pinned Private source changes bytes", async () => {
  const canonical = pngFixture(4096, 1);
  const wrong = pngFixture(4096, 2);
  const specs = menuSpecs(canonical, sha256(wrong));
  const mock = installRichMenuFetch(specs, canonical, wrong);
  try {
    await assert.rejects(
      prepareMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test" }, { menuSpecs: specs }),
      /image_integrity_mismatch/,
    );
    assert.equal(mock.calls.some((call) => call.method === "POST" && call.url.endsWith("/v2/bot/richmenu")), false);
  } finally {
    mock.restore();
  }
});

test("five-state resolver matrix never grants Private to expired or blocked users", () => {
  assert.deepEqual(getMmdRichMenuFiveStateMatrix(new Date("2026-09-23T09:35:00Z")), {
    guest: "guest",
    public: "public",
    private: "private",
    expired: "public",
    blocked: "public",
  });
});

test("verified blocked customer maps to Public and never Private", () => {
  const clients = [{ fields: { line_user_id: "U-blocked", "Verification Status": "verified" } }];
  const entitlements = [{
    fields: {
      line_user_id: "U-blocked",
      capability: "private_premium",
      member_lifecycle_status: "blocked",
      expire_at: "2099-12-31T00:00:00Z",
    },
  }];
  const result = classifyMmdUsers(clients, entitlements, new Date("2026-09-23T09:35:00Z"));
  assert.deepEqual(result, { guest: [], public: ["U-blocked"], private: [] });
});

test("three-level prepare and audit routes are recognized but remain internal-token protected", async () => {
  const prepare = new Request("https://worker/v1/internal/line/rich-menu/three-level/prepare", { method: "POST" });
  const activate = new Request("https://worker/v1/internal/line/rich-menu/three-level/activate", { method: "POST" });
  const audit = new Request("https://worker/v1/internal/line/rich-menu/three-level/audit", { method: "GET" });
  assert.equal(isMmdRichMenuScheduledRequest(prepare), true);
  assert.equal(isMmdRichMenuScheduledRequest(activate), true);
  assert.equal(isMmdRichMenuScheduledRequest(audit), true);

  const prepareResponse = await handleMmdRichMenuScheduledRequest(prepare, { INTERNAL_TOKEN: "secret" });
  const activateResponse = await handleMmdRichMenuScheduledRequest(activate, { INTERNAL_TOKEN: "secret" });
  const auditResponse = await handleMmdRichMenuScheduledRequest(audit, { INTERNAL_TOKEN: "secret" });
  assert.equal(prepareResponse.status, 401);
  assert.equal(activateResponse.status, 401);
  assert.equal(auditResponse.status, 401);
  assert.deepEqual(await prepareResponse.json(), { ok: false, error: "internal_auth_required" });
  assert.deepEqual(await activateResponse.json(), { ok: false, error: "internal_auth_required" });
  assert.deepEqual(await auditResponse.json(), { ok: false, error: "internal_auth_required" });
});
