import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_MEDIA_SOURCE_ROOTS, MODEL_MEDIA_SOURCE_EMAIL,
  MODEL_MEDIA_FLUSH_PREVIEW_PATH, handleModelMediaFlushPreview,
} from "./src/model-media-flush-preview.js";

const root = "https://mmdbkk.com" + MODEL_MEDIA_FLUSH_PREVIEW_PATH;
const request = (input = { action: "preview_all" }, origin = "https://mmdbkk.com") =>
  new Request(root, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input) });
const access = { readActor: async () => ({ id: "per", role: "owner" }), getAccessToken: async () => "fixture-token" };
const response = data => Response.json(data);

function googleFixture({ account = MODEL_MEDIA_SOURCE_EMAIL, badRoot = "", allOwned = true } = {}) {
  const calls = [];
  const http = async value => {
    const url = new URL(value); calls.push(url);
    if (url.pathname.endsWith("/about")) return response({ user: { emailAddress: account } });
    const id = url.pathname.match(/\/files\/([^/]+)$/)?.[1];
    if (id) {
      return response({ id, name: "source", mimeType: "application/vnd.google-apps.folder", trashed: false,
        owners: [{ emailAddress: badRoot === id ? "not-our-account@example.com" : account }] });
    }
    const parent = url.searchParams.get("q")?.match(/^'([^']+)' in parents/)?.[1];
    if (!parent) throw Error("unexpected_drive_query");
    const file = (suffix, name, mimeType, owner = account) =>
      ({ id: parent + suffix, name, mimeType, parents: [parent], trashed: false, owners: [{ emailAddress: owner }] });
    return response({
      files: [
        file("-p", "cover.webp", "image/webp"),
        file("-h", "Review", "application/vnd.google-apps.folder"),
        file("-x", "other.jpg", "image/jpeg", allOwned ? account : "somebody@example.com"),
      ],
    });
  };
  return { http, calls };
}

test("source list is exactly eight Catalogue lanes and two Drive-owned MMD NOW lanes", () => {
  const catalogue = MODEL_MEDIA_SOURCE_ROOTS.filter(x => x.lane === "catalogue");
  const now = MODEL_MEDIA_SOURCE_ROOTS.filter(x => x.lane === "mmd_now");
  assert.deepEqual(catalogue.map(x => x.key), ["standard","premium","ems","gws","travel","extreme","farang","up_country"]);
  assert.deepEqual(now.map(x => x.key), ["new_entry","hot_cha"]);
  assert.equal(new Set(MODEL_MEDIA_SOURCE_ROOTS.map(x => x.id)).size, 10);
});

test("the flush preview is restricted to Per and same-origin POST", async () => {
  let called = 0;
  const deps = { ...access, getAccessToken: async () => { called++; return "token"; } };
  const wrongOrigin = await handleModelMediaFlushPreview(request(undefined, "https://evil.example"), {}, deps);
  assert.equal(wrongOrigin.status, 403);
  const notOwner = await handleModelMediaFlushPreview(request(), {}, { ...deps, readActor: async () => ({ role: "member" }) });
  assert.equal(notOwner.status, 403);
  const missingOrigin = await handleModelMediaFlushPreview(new Request(root, { method: "POST", body: "{}" }), {}, deps);
  assert.equal(missingOrigin.status, 403);
  const wrongMode = await handleModelMediaFlushPreview(request({ action: "publish_all" }), {}, deps);
  assert.equal(wrongMode.status, 400);
  const wrongMethod = await handleModelMediaFlushPreview(new Request(root, {method:"GET",headers:{origin:"https://mmdbkk.com"}}), {}, deps);
  assert.equal(wrongMethod.status, 405);
  assert.equal(called, 0);
});

test("source identity is locked to malemodel.bkk@gmail.com, without fallback", async () => {
  const bad = googleFixture({ account: "different-owner@example.com" });
  const res = await handleModelMediaFlushPreview(request(), {}, { ...access, http: bad.http });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "source_account_mismatch");
  const blocked = await handleModelMediaFlushPreview(request(), { COMPCARD_DRIVE_OWNER_EMAIL: "other@example.com" }, { ...access, http: bad.http });
  assert.equal(blocked.status, 503);
});

test("manual flush checks each verified source, skips Review, and never writes or publishes", async () => {
  const { http, calls } = googleFixture({ allOwned: false });
  const result = await handleModelMediaFlushPreview(request(), {}, { ...access, http });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.mode, "preview_only");
  assert.equal(data.catalogue.length, 8);
  assert.equal(data.mmd_now.length, 3); // New Release, Hot Cha, pending Telegram Standard topic
  assert.equal(data.mmd_now.at(-1).state, "topic_id_unresolved");
  assert.equal(data.catalogue[0].images, 1);
  assert.equal(data.catalogue[0].excluded_folders, 1);
  assert.equal(data.catalogue[0].unverified_owner_items, 1);
  assert.deepEqual(data.writes, {drive:false,r2:false,airtable:false,cms:false,website:false});
  assert.equal(calls.filter(x => x.pathname.endsWith("/about")).length, 1);
  assert.equal(calls.some(x => x.href.includes("alt=media")), false);
  assert.equal(calls.some(x => x.searchParams.get("q")?.includes("-h")), false);
});

test("unverified category roots stay unscanned and fail closed", async () => {
  const {http} = googleFixture({badRoot:MODEL_MEDIA_SOURCE_ROOTS[0].id});
  const result = await handleModelMediaFlushPreview(request(), {}, {...access,http});
  const data = await result.json();
  assert.equal(data.state,"partial");
  assert.equal(data.catalogue[0].state,"source_unverified");
  assert.equal(data.catalogue[0].images,undefined);
});
