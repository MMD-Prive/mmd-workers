import test from "node:test";
import assert from "node:assert/strict";
import { handleShortlist, buildRecord, OWNER_API as O, PARTNER_API as P, PREFIX, hash } from "../src/index.js";

const ORIGIN = "https://mmdbkk.com";
const COOKIE = "mmd_admin_gate_v1=fixture.owner.credential";
const canonicalId = "recAAAAAAAAAAAAAA";
const photoSource = "recBBBBBBBBBBBBBB";
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 1, 2, 3, 255, 217]);
const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPfixture-preview");
const initial = () => ({ title: "Demo job", brief: { date: "2030-06-12", time: "", location: "", duration: "", budget: 24000, spec: "ลุคตามบรีฟตัวอย่าง", format: "งานตัวอย่าง", extra: "รายละเอียดตัวอย่าง" }, ownerOnly: { payoutCap: 8000 }, expiresAt: new Date(Date.now() + 86400000).toISOString() });
class Bucket {
  data = new Map(); serial = 0; reads = 0; writes = 0;
  async get(key) {
    this.reads++; const entry = this.data.get(key); if (!entry) return null;
    return { ...entry, size: entry.bytes.length, body: new Response(entry.bytes).body,
      json: async () => JSON.parse(new TextDecoder().decode(entry.bytes)) };
  }
  async put(key, value, options = {}) {
    const old = this.data.get(key), condition = options.onlyIf;
    if ((condition?.etagDoesNotMatch === "*" && old) || (condition?.etagMatches && condition.etagMatches !== old?.etag)) return null;
    const entry = { key, bytes: typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value),
      etag: "etag" + ++this.serial, httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} };
    this.data.set(key, entry); this.writes++; return { etag: entry.etag };
  }
  async list({ prefix, limit, cursor }) {
    const rows = [...this.data.values()].filter(item => item.key.startsWith(prefix)).sort((a,b) => a.key.localeCompare(b.key));
    const from = Number(cursor || 0), end = from + limit;
    return { objects: rows.slice(from, end), truncated: end < rows.length, cursor: end < rows.length ? String(end) : undefined };
  }
}
function fixture() {
  const calls = [], imageCalls = [], bucket = new Bucket();
  const env = { SHORTLIST_STORE: bucket, IMAGES: { input: stream => ({ transform: options => ({ output: async output => {
    imageCalls.push({ data: new Uint8Array(await new Response(stream).arrayBuffer()), options, output });
    return { response: () => new Response(webp, { headers: { "content-type": "image/webp" } }) };
  } }) }) }, ADMIN: { fetch: async request => {
    calls.push(request);
    assert.equal(request.headers.get("cookie"), COOKIE);
    assert.equal(request.headers.get("authorization"), null);
    assert.equal(request.headers.get("x-confirm-key"), null);
    assert.equal(request.headers.get("x-mmd-admin-role"), null);
    const path = new URL(request.url).pathname;
    if (path === "/v1/admin/compcards/config") return Response.json({ ok: true, drive_roots: [] });
    if (path === "/v1/admin/booking-models/" + canonicalId + "/media/" + photoSource ||
        path === "/v1/admin/booking-models/" + canonicalId + "/drive/drive-file-123") return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
    return Response.json({ ok: false }, { status: 404 });
  } } };
  const req = (path, method = "GET", value, headers = {}) => new Request(ORIGIN + path, { method,
    headers: { ...(["POST", "PATCH", "DELETE"].includes(method) ? { origin: ORIGIN, "content-type": "application/json" } : {}), ...headers },
    ...(value !== undefined ? { body: typeof value === "string" ? value : JSON.stringify(value) } : {}) });
  const owner = (path = O, method = "GET", value, headers) => handleShortlist(req(path, method, value, { cookie: COOKIE, ...headers }), env);
  const partner = (id, token, suffix = "view", method = "GET", value, headers) => handleShortlist(req(P + "/" + id + "/" + suffix, method, value, { authorization: "Bearer " + token, ...headers }), env);
  const create = async () => {
    const response = await owner(O, "POST", initial()); assert.equal(response.status, 201);
    const created = await response.json(), token = new URLSearchParams(new URL(created.url).hash.slice(1)).get("t");
    return { ...created, token, id: created.item.id };
  };
  const importInput = revision => ({ revision, canonicalModelId: canonicalId, historyReviewed: true,
    display: { name: "Test Model", code: "M01", height: 180, weight: 75, format: "รอยืนยัน", status: "pending", caption: "รูปที่คัดสำหรับงานนี้" },
    photos: [{ source: "media", assetId: photoSource, shareAllowed: true, downloadAllowed: false }] });
  const addModel = async (created, overrides = {}) => {
    const response = await owner(O + "/" + created.id + "/models", "POST", { ...importInput(created.item.revision), ...overrides });
    assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).item;
  };
  return { env, bucket, calls, imageCalls, req, owner, partner, create, importInput, addModel };
}

async function managedBase64Fixture() {
  const f = fixture(), c = await f.create(), input = f.importInput(1);
  input.photos[0].downloadAllowed = true;
  const item = await f.addModel(c, input), photoId = item.models[0].photos[0].id;
  const recordKey = PREFIX + "records/" + c.id + ".json";
  const record = await (await f.bucket.get(recordKey)).json(), photo = record.models[0].photos[0];
  photo.storageEncoding = "base64"; photo.preview.storageEncoding = "base64";
  const originalKey = PREFIX + "media/" + c.id + "/" + photoId, previewKey = PREFIX + "previews/" + c.id + "/" + photoId;
  for (const [key, data] of [[originalKey, jpeg], [previewKey, webp]]) {
    await f.bucket.put(key, Buffer.from(data).toString("base64"), { httpMetadata: { contentType: "application/x-mmd-base64" } });
    assert.deepEqual(f.bucket.data.get(key).customMetadata, {});
  }
  await f.bucket.put(recordKey, JSON.stringify(record));
  return { f, c, photoId, recordKey, record, photo, originalKey, previewKey };
}

test("owner authentication forwards only the credential-bound cookie and fails closed before storage", async () => {
  const f = fixture();
  for (const headers of [{}, { cookie: "mmd_model_session_v1=pretend" }, { "x-mmd-admin-role": "owner" }]) {
    const response = await handleShortlist(f.req(O, "GET", undefined, headers), f.env); assert.equal(response.status, 401);
  }
  assert.equal(f.bucket.reads, 0); assert.equal(f.calls.length, 0);
  assert.equal((await f.owner(O, "GET", undefined, { authorization: "Bearer fake" })).status, 403);
  assert.equal((await f.owner(O, "GET", undefined, { cookie: "irrelevant=sensitive; " + COOKIE, "x-mmd-admin-role": "ignored" })).status, 200);
  assert.equal(f.calls[0].headers.get("cookie"), COOKIE);
  f.env.ADMIN.fetch = async () => new Response("login", { headers: { "content-type": "text/html" } });
  assert.equal((await f.owner()).status, 503);
  f.env.ADMIN.fetch = async () => Response.json({ ok: true });
  assert.equal((await f.owner()).status, 503);
  f.env.ADMIN.fetch = async () => Response.json({ ok: false, drive_roots: [] });
  assert.equal((await f.owner()).status, 503);
});

test("foreign hosts, foreign/missing mutation Origin, unsupported methods and URL tokens are rejected", async () => {
  const f = fixture();
  const foreign = new Request("https://evil.example" + O, { headers: { cookie: COOKIE } });
  assert.equal((await handleShortlist(foreign, f.env)).status, 403);
  assert.equal((await f.owner(O, "POST", initial(), { origin: "https://evil.example" })).status, 403);
  const noOrigin = f.req(O, "POST", initial(), { cookie: COOKIE }); noOrigin.headers.delete("origin");
  assert.equal((await handleShortlist(noOrigin, f.env)).status, 403);
  assert.equal((await handleShortlist(f.req(O, "OPTIONS"), f.env)).status, 405);
  assert.equal((await f.owner(O + "?token=never-log-this")).status, 400);
  assert.equal(f.calls.length, 0); assert.equal(f.bucket.writes, 0);
});

test("creation uses opaque IDs, a 256-bit fragment token and stored hash only, preserving incomplete brief", async () => {
  const f = fixture(), c = await f.create();
  assert.match(c.id, /^[a-f0-9]{32}$/); assert.match(c.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(c.url).search, ""); assert.equal(c.item.brief.time, "");
  const entry = await (await f.bucket.get(PREFIX + "records/" + c.id + ".json")).json();
  assert.equal(entry.tokenHash, await hash(c.token)); assert.ok(!JSON.stringify(entry).includes(c.token));
  assert.ok(!JSON.stringify(c.item).includes("tokenHash")); assert.equal(entry.ownerOnly.payoutCap, 8000);
  const view = await (await f.partner(c.id, c.token)).json();
  assert.equal(view.brief.budget, 24000); assert.deepEqual(view.models, []);
  assert.ok(!JSON.stringify(view).includes("payoutCap")); assert.ok(!JSON.stringify(view).includes("ownerOnly"));
  const pure = await buildRecord(initial()); assert.equal(pure.record.tokenHash, await hash(pure.token));
});

test("real validation rejects impossible dates, invalid time/expiry, body size and JSON type", async () => {
  const f = fixture();
  for (const input of [
    { ...initial(), brief: { ...initial().brief, date: "2030-02-31" } },
    { ...initial(), brief: { ...initial().brief, time: "29:80" } },
    { ...initial(), expiresAt: new Date(Date.now() - 1000).toISOString() },
    { ...initial(), expiresAt: new Date(Date.now() + 40 * 86400000).toISOString() },
    { ...initial(), brief: { ...initial().brief, budget: "24000" } },
  ]) assert.equal((await f.owner(O, "POST", input)).status, 400);
  assert.equal((await f.owner(O, "POST", "{" + "x".repeat(33000))).status, 413);
  assert.equal((await f.owner(O, "POST", initial(), { "content-type": "text/plain" })).status, 415);
  assert.equal(f.bucket.writes, 0);
});

test("model import requires history review and per-photo consent before any image read", async () => {
  const f = fixture(), c = await f.create(), endpoint = O + "/" + c.id + "/models";
  const missingHistory = f.importInput(1); delete missingHistory.historyReviewed;
  assert.equal((await f.owner(endpoint, "POST", missingHistory)).status, 400);
  const missingConsent = f.importInput(1); missingConsent.photos[0].shareAllowed = false;
  assert.equal((await f.owner(endpoint, "POST", missingConsent)).status, 400);
  const unspecifiedDownload = f.importInput(1); delete unspecifiedDownload.photos[0].downloadAllowed;
  assert.equal((await f.owner(endpoint, "POST", unspecifiedDownload)).status, 400);
  assert.ok(f.calls.every(request => new URL(request.url).pathname.endsWith("/config")));
  assert.equal([...f.bucket.data.keys()].filter(key => key.includes("/media/")).length, 0);
});

test("approved imports preserve originals privately; partner previews are resized WebP and downloads require permission", async () => {
  const f = fixture(), c = await f.create(), input = f.importInput(1);
  input.display.phone = "NEVER_PHONE"; input.display.lineId = "NEVER_LINE"; input.display.payout = "NEVER_PAYOUT";
  input.photos.push({ source: "drive", assetId: "drive-file-123", shareAllowed: true, downloadAllowed: true });
  const item = await f.addModel(c, input), view = await (await f.partner(c.id, c.token)).json(), model = view.models[0];
  assert.equal(item.models[0].canonicalModelId, canonicalId); assert.ok(item.models[0].historyReviewedAt);
  assert.match(model.id, /^[a-f0-9]{32}$/); assert.equal(model.status, "pending"); assert.equal(model.photos.length, 2);
  const serialized = JSON.stringify(view);
  for (const secret of [canonicalId, photoSource, "drive-file-123", "NEVER_", "payoutCap", "historyReviewed", "tokenHash", "sha256", "assetId"]) assert.ok(!serialized.includes(secret), secret);
  assert.equal(model.photos[0].downloadAllowed, false); assert.equal(model.photos[0].downloadPath, undefined);
  const mediaPath = "media/" + model.photos[0].id;
  const response = await f.partner(c.id, c.token, mediaPath); assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), webp);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(f.imageCalls.length, 2);
  for (const call of f.imageCalls) {
    assert.deepEqual(call.data, jpeg);
    assert.deepEqual(call.options, { width: 720, height: 960, fit: "scale-down" });
    assert.deepEqual(call.output, { format: "image/webp", quality: 80, anim: false });
  }
  const ownerOriginal = await f.owner(O + "/" + c.id + "/media/" + model.photos[0].id);
  assert.deepEqual(new Uint8Array(await ownerOriginal.arrayBuffer()), jpeg);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal((await f.partner(c.id, c.token, mediaPath + "/download")).status, 403);
  const allowed = await f.partner(c.id, c.token, "media/" + model.photos[1].id + "/download");
  assert.equal(allowed.status, 200); assert.match(allowed.headers.get("content-disposition"), /^attachment/);
  assert.deepEqual(new Uint8Array(await allowed.arrayBuffer()), jpeg);
});

test("explicit managed base64 variants verify actual decoded preview and original bytes without R2 custom metadata", async () => {
  const { f, c, photoId, originalKey, previewKey } = await managedBase64Fixture();
  const preview = await f.partner(c.id, c.token, "media/" + photoId);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.equal(preview.headers.get("content-length"), String(webp.length));
  assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), webp);
  const download = await f.partner(c.id, c.token, "media/" + photoId + "/download");
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "image/jpeg");
  assert.equal(download.headers.get("content-length"), String(jpeg.length));
  assert.match(download.headers.get("content-disposition"), /^attachment/);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), jpeg);
  const owner = await f.owner(O + "/" + c.id + "/media/" + photoId);
  assert.equal(owner.status, 200); assert.deepEqual(new Uint8Array(await owner.arrayBuffer()), jpeg);
  const head = await f.partner(c.id, c.token, "media/" + photoId, "HEAD");
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  assert.equal(f.bucket.data.get(originalKey).bytes.length, 4 * Math.ceil(jpeg.length / 3));
  assert.equal(f.bucket.data.get(previewKey).bytes.length, 4 * Math.ceil(webp.length / 3));
  const view = JSON.stringify(await (await f.partner(c.id, c.token)).json());
  assert.ok(!view.includes("storageEncoding")); assert.ok(!view.includes("sha256"));
});

test("managed base64 hash, physical size, transport MIME and declared image corruption fail closed", async () => {
  const mutations = [
    ({ stored }) => { const data = Buffer.from(new TextDecoder().decode(stored.bytes), "base64"); data[data.length - 1] ^= 1; stored.bytes = new TextEncoder().encode(data.toString("base64")); },
    ({ stored }) => { stored.bytes = new Uint8Array([...stored.bytes, 65]); },
    ({ stored }) => { stored.httpMetadata.contentType = "text/plain"; },
    ({ variant }) => { variant.sha256 = "0".repeat(64); },
    ({ variant }) => { variant.bytes = 0; },
    ({ variant }) => { variant.bytes = 10 * 1024 * 1024 + 1; },
    ({ variant }) => { variant.contentType = "image/svg+xml"; },
    ({ variant }) => { delete variant.storageEncoding; },
  ];
  for (const which of ["original", "preview"]) for (const mutate of mutations) {
    const t = await managedBase64Fixture(), isPreview = which === "preview";
    const key = isPreview ? t.previewKey : t.originalKey, variant = isPreview ? t.photo.preview : t.photo;
    mutate({ stored: t.f.bucket.data.get(key), variant });
    await t.f.bucket.put(t.recordKey, JSON.stringify(t.record));
    const suffix = "media/" + t.photoId + (isPreview ? "" : "/download");
    const response = await t.f.partner(t.c.id, t.c.token, suffix);
    assert.equal(response.status, 503, which + " " + mutate.toString());
    assert.match(response.headers.get("content-type"), /application\/json/);
    const head = await t.f.partner(t.c.id, t.c.token, suffix, "HEAD");
    assert.equal(head.status, 503); assert.equal(await head.text(), "");
  }
});

test("managed base64 requires canonical padding and bounds the actual stream even when advertised size is correct", async () => {
  const t = await managedBase64Fixture(), stored = t.f.bucket.data.get(t.originalKey);
  const canonical = new TextDecoder().decode(stored.bytes), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  assert.ok(canonical.endsWith("=="));
  const nonCanonical = canonical.slice(0, -3) + alphabet[alphabet.indexOf(canonical.at(-3)) + 1] + "==";
  assert.deepEqual(Buffer.from(nonCanonical, "base64"), Buffer.from(canonical, "base64"), "fixture changes only unused padding bits");
  stored.bytes = new TextEncoder().encode(nonCanonical);
  assert.equal((await t.f.partner(t.c.id, t.c.token, "media/" + t.photoId + "/download")).status, 503);
  stored.bytes = new TextEncoder().encode(canonical);
  const get = t.f.bucket.get.bind(t.f.bucket);
  t.f.bucket.get = async key => {
    const object = await get(key);
    if (key === t.originalKey) object.body = new Response(canonical + "A").body;
    return object;
  };
  assert.equal((await t.f.partner(t.c.id, t.c.token, "media/" + t.photoId + "/download")).status, 503);
});

test("managed base64 preserves token, explicit download, revocation and separate-preview gates", async () => {
  const t = await managedBase64Fixture(), { f, c, photoId } = t;
  const other = await f.create();
  assert.equal((await f.partner(c.id, other.token, "media/" + photoId)).status, 401);
  assert.equal((await handleShortlist(f.req(P + "/" + c.id + "/media/" + photoId), f.env)).status, 401);
  assert.equal((await f.partner(other.id, other.token, "media/" + photoId)).status, 404);
  t.photo.downloadAllowed = false; await f.bucket.put(t.recordKey, JSON.stringify(t.record));
  assert.equal((await f.partner(c.id, c.token, "media/" + photoId + "/download")).status, 403);
  f.bucket.data.delete(t.previewKey);
  assert.equal((await f.partner(c.id, c.token, "media/" + photoId)).status, 503);
  assert.equal((await f.owner(O + "/" + c.id + "/media/" + photoId)).status, 200);
  t.record.state = "revoked"; await f.bucket.put(t.recordKey, JSON.stringify(t.record));
  assert.equal((await f.partner(c.id, c.token, "media/" + photoId)).status, 410);
  t.record.state = "active"; t.record.expiresAt = new Date(Date.now() - 1000).toISOString();
  await f.bucket.put(t.recordKey, JSON.stringify(t.record));
  assert.equal((await f.partner(c.id, c.token, "media/" + photoId)).status, 410);
});

test("missing or failed preview transforms prevent publishing and never fall back to originals", async () => {
  for (const broken of [null, { input: () => { throw new Error("transform unavailable"); } },
    { input: () => ({ transform: () => ({ output: async () => ({ response: () => new Response(jpeg, { headers: { "content-type": "image/jpeg" } }) }) }) }) },
    { input: () => ({ transform: () => ({ output: async () => ({ response: () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { "content-type": "image/webp" } }) }) }) }) },
  ]) {
    const f = fixture(), c = await f.create(); f.env.IMAGES = broken;
    const response = await f.owner(O + "/" + c.id + "/models", "POST", f.importInput(c.item.revision));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "preview_unavailable");
    assert.deepEqual((await (await f.partner(c.id, c.token)).json()).models, []);
    assert.ok([...f.bucket.data.keys()].every(key => !key.includes("/media/") && !key.includes("/previews/")));
  }
  const f = fixture(), c = await f.create(), item = await f.addModel(c), photo = item.models[0].photos[0];
  f.bucket.data.delete(PREFIX + "previews/" + c.id + "/" + photo.id);
  assert.equal((await f.partner(c.id, c.token, "media/" + photo.id)).status, 503);
  assert.equal((await f.owner(O + "/" + c.id + "/media/" + photo.id)).status, 200);
  assert.equal((await f.partner(c.id, c.token, "media/" + photo.id + "/download")).status, 403);
});

test("invalid source paths and wrong-model source fail without sharing; unsupported bytes are rejected", async () => {
  const f = fixture(), c = await f.create(), endpoint = O + "/" + c.id + "/models";
  const bad = f.importInput(1); bad.photos[0].assetId = "../../other-model";
  assert.equal((await f.owner(endpoint, "POST", bad)).status, 400);
  bad.photos[0].assetId = "recCCCCCCCCCCCCCC";
  assert.equal((await f.owner(endpoint, "POST", bad)).status, 404);
  const original = f.env.ADMIN.fetch;
  f.env.ADMIN.fetch = async request => new URL(request.url).pathname.endsWith("/config") ? original(request)
    : new Response("<svg onload=alert(1)>", { headers: { "content-type": "image/jpeg" } });
  assert.equal((await f.owner(endpoint, "POST", f.importInput(1))).status, 415);
  assert.deepEqual((await (await f.partner(c.id, c.token)).json()).models, []);
});

test("token, cross-shortlist, expiry and revoke gates protect views and actual bytes, including HEAD", async () => {
  const f = fixture(), c = await f.create(), item = await f.addModel(c), photo = item.models[0].photos[0].id;
  const other = await f.create();
  assert.equal((await f.partner(c.id, other.token)).status, 401);
  assert.equal((await f.partner(other.id, other.token, "media/" + photo)).status, 404);
  assert.equal((await handleShortlist(f.req(P + "/" + c.id + "/media/" + photo), f.env)).status, 401);
  assert.equal((await f.partner(c.id, c.token, "media/" + photo, "HEAD")).status, 200);
  const expired = await (await f.bucket.get(PREFIX + "records/" + other.id + ".json")).json();
  expired.expiresAt = new Date(Date.now() - 1000).toISOString(); await f.bucket.put(PREFIX + "records/" + other.id + ".json", JSON.stringify(expired));
  assert.equal((await f.partner(other.id, other.token)).status, 410);
  const revoked = await f.owner(O + "/" + c.id, "PATCH", { revision: item.revision, state: "revoked" }); assert.equal(revoked.status, 200);
  for (const suffix of ["view", "media/" + photo, "media/" + photo + "/download"]) {
    assert.equal((await f.partner(c.id, c.token, suffix)).status, 410);
    const head = await f.partner(c.id, c.token, suffix, "HEAD"); assert.equal(head.status, 410); assert.equal(await head.text(), "");
  }
});

test("rotation invalidates the old link and is the required way to reopen a revoked selection", async () => {
  const f = fixture(), c = await f.create();
  await f.owner(O + "/" + c.id, "PATCH", { revision: 1, state: "revoked" });
  assert.equal((await f.owner(O + "/" + c.id, "PATCH", { revision: 2, state: "active" })).status, 409);
  const rotation = await (await f.owner(O + "/" + c.id + "/rotate", "POST", { revision: 2 })).json();
  const token = new URLSearchParams(new URL(rotation.url).hash.slice(1)).get("t");
  assert.notEqual(c.token, token); assert.equal((await f.partner(c.id, c.token)).status, 401);
  assert.equal((await f.partner(c.id, token)).status, 200);
});

test("brief updates persist after refresh and stale revisions cannot overwrite them", async () => {
  const f = fixture(), c = await f.create(), complete = { ...initial().brief, time: "18:00", duration: "2 ชั่วโมง", location: "สุขุมวิท" };
  const response = await f.partner(c.id, c.token, "brief", "POST", { revision: 1, brief: complete }); assert.equal(response.status, 200);
  const view = await (await f.partner(c.id, c.token)).json(); assert.deepEqual(view.brief, complete); assert.equal(view.revision, 2);
  assert.equal((await f.partner(c.id, c.token, "brief", "POST", { revision: 1, brief: initial().brief })).status, 409);
  assert.deepEqual((await (await f.owner(O + "/" + c.id)).json()).item.brief, complete);
});

test("selection validates membership, persists order/photos and atomically deduplicates retries", async () => {
  const f = fixture(), c = await f.create(), item = await f.addModel(c), model = item.models[0];
  const payload = { revision: item.revision, modelIds: [model.id], photoIds: [model.photos[0].id], note: "เช็กคิวให้หน่อยค่ะ", idempotencyKey: crypto.randomUUID() };
  const response = await f.partner(c.id, c.token, "selection", "POST", payload); assert.equal(response.status, 200);
  const first = await response.json(), duplicate = await (await f.partner(c.id, c.token, "selection", "POST", payload)).json();
  assert.equal(duplicate.receiptId, first.receiptId); assert.equal(duplicate.duplicate, true);
  assert.equal((await f.partner(c.id, c.token, "selection", "POST", { ...payload, note: "changed" })).status, 409);
  const view = await (await f.partner(c.id, c.token)).json();
  assert.deepEqual(view.selection.modelIds, payload.modelIds); assert.deepEqual(view.selection.photoIds, payload.photoIds); assert.equal(view.selection.note, payload.note);
  const foreign = "f".repeat(32);
  assert.equal((await f.partner(c.id, c.token, "selection", "POST", { ...payload, revision: view.revision, modelIds: [foreign], idempotencyKey: crypto.randomUUID() })).status, 409);
  assert.equal((await f.partner(c.id, c.token, "selection", "POST", { ...payload, revision: view.revision, photoIds: [foreign], idempotencyKey: crypto.randomUUID() })).status, 403);
});

test("R2 conditional writes resolve actual concurrent changes without silently overwriting", async () => {
  const f = fixture(), c = await f.create(), original = f.bucket.put.bind(f.bucket); let race = true;
  f.bucket.put = async (key, value, options) => {
    if (race && options?.onlyIf?.etagMatches) {
      race = false; const current = await (await f.bucket.get(key)).json();
      await original(key, JSON.stringify({ ...current, revision: current.revision + 1, title: "Concurrent edit" }));
    }
    return original(key, value, options);
  };
  const response = await f.partner(c.id, c.token, "brief", "POST", { revision: 1, brief: { ...initial().brief, location: "Old editor" } });
  assert.equal(response.status, 409);
  assert.equal((await (await f.owner(O + "/" + c.id)).json()).item.title, "Concurrent edit");
});

test("removing a model revokes access to its copied bytes immediately without deleting original sources", async () => {
  const f = fixture(), c = await f.create(), item = await f.addModel(c), model = item.models[0];
  const submitted = await (await f.partner(c.id, c.token, "selection", "POST", { revision: item.revision,
    modelIds: [model.id], photoIds: [model.photos[0].id], idempotencyKey: crypto.randomUUID() })).json();
  const response = await f.owner(O + "/" + c.id + "/models/" + model.id, "DELETE", { revision: submitted.revision }); assert.equal(response.status, 200);
  assert.equal((await f.partner(c.id, c.token, "media/" + model.photos[0].id)).status, 404);
  assert.equal((await (await f.partner(c.id, c.token)).json()).selection, null);
  const saved = await (await f.bucket.get(PREFIX + "records/" + c.id + ".json")).json();
  assert.equal(saved.receipts.length, 1, "idempotency history remains private");
  assert.ok(f.calls.every(request => request.method === "GET"));
  assert.ok([...f.bucket.data.keys()].every(key => key.startsWith(PREFIX)));
});

test("replacing selected photos clears stale selection and revokes previous image paths", async () => {
  const f = fixture(), c = await f.create(), item = await f.addModel(c), model = item.models[0];
  const submitted = await (await f.partner(c.id, c.token, "selection", "POST", { revision: item.revision,
    modelIds: [model.id], photoIds: [model.photos[0].id], idempotencyKey: crypto.randomUUID() })).json();
  const replacement = await f.addModel({ ...c, item: { revision: submitted.revision } });
  assert.equal(replacement.selection, null); assert.equal(replacement.models[0].id, model.id);
  assert.notEqual(replacement.models[0].photos[0].id, model.photos[0].id);
  assert.equal((await f.partner(c.id, c.token, "media/" + model.photos[0].id)).status, 404);
  assert.equal((await (await f.partner(c.id, c.token)).json()).selection, null);
});

test("corrupt expiry or token hashes fail closed for views and media", async () => {
  const f = fixture(), c = await f.create(), key = PREFIX + "records/" + c.id + ".json";
  const original = await (await f.bucket.get(key)).json();
  for (const changed of [{ expiresAt: "bad-date" }, { expiresAt: null }, { tokenHash: "" }]) {
    await f.bucket.put(key, JSON.stringify({ ...original, ...changed }));
    assert.equal((await f.partner(c.id, c.token)).status, 503);
    assert.equal((await f.partner(c.id, c.token, "media/" + "a".repeat(32))).status, 503);
  }
});

test("job-scoped Benz exclusion survives owner brief edits and rejects imported excluded model", async () => {
  const f=fixture(), c=await f.create();
  const excluded="recBBBBBBBBBBBBBB";
  const patch=await f.owner(O+"/"+c.id,"PATCH",{revision:c.item.revision,ownerOnly:{payoutCap:8000,excludedCanonicalModelIds:[excluded]},brief:{...c.item.brief,format:"PN"}});
  assert.equal(patch.status,200,await patch.clone().text());
  const p=await patch.json();
  assert.deepEqual(p.item.ownerOnly.excludedCanonicalModelIds,[excluded]);
  assert.equal(p.item.brief.format,"PN");
  const later=await f.owner(O+"/"+c.id,"PATCH",{revision:p.item.revision,ownerOnly:{payoutCap:9000}});
  assert.equal(later.status,200);
  const row=(await later.json()).item;
  assert.deepEqual(row.ownerOnly.excludedCanonicalModelIds,[excluded]);
  const blocked=await f.owner(O+"/"+c.id+"/models","POST",{...f.importInput(row.revision),canonicalModelId:excluded});
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json()).error,"model_excluded");
  const partnerView=await f.partner(c.id,c.token,"view");
  assert.equal(partnerView.status,200);
  const safe=await partnerView.json();
  assert.equal(safe.brief.format,"PN");
  assert.ok(!("ownerOnly" in safe));
  assert.doesNotMatch(JSON.stringify(safe),/excludedCanonicalModelIds|9000/);
});
