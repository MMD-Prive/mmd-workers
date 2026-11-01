import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require(process.env.MMD_TEST_JSDOM_PATH || "jsdom");
const source = await fs.readFile(new URL("./index.html", import.meta.url), "utf8");
const id = "a".repeat(32), token = "A".repeat(43), mid = "b".repeat(32), other = "c".repeat(32);
const p1 = "d".repeat(32), p2 = "e".repeat(32), p3 = "f".repeat(32), receiptId = "9".repeat(32);
const base = "/v1/partner/model-selections/" + id;
const brief = { date: "2031-06-15", time: "", location: "", duration: "", budget: 2400, spec: "ลุคเรียบง่าย", format: "งานถ่ายภาพทดสอบ", extra: "ข้อมูลสมมติสำหรับทดสอบ" };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const photo = (photoId, allowed = true) => ({ id: photoId, previewPath: base + "/media/" + photoId, downloadAllowed: allowed, ...(allowed ? { downloadPath: base + "/media/" + photoId + "/download" } : {}) });
const model = (modelId, name, photos) => ({ id: modelId, name, code: "", height: 181, weight: 74, format: "รอยืนยัน", status: "pending", caption: "", photos });
const view = (extra = {}) => ({ jobId: id, title: "Demo Partner · งานสมมติสำหรับทดสอบ", revision: "r1", expiresAt: new Date(Date.now() + 86400000).toISOString(), brief: { ...brief }, models: [], selection: null, ...extra });
const settle = async (predicate, label = "condition") => {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Timed out: " + label);
};

function page(fetcher, { credentials = true, html = source } = {}) {
  const calls = [], created = [], revoked = [], downloads = [], errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", e => { if (e.type !== "css parsing") errors.push(e.message); });
  const dom = new JSDOM(html, {
    url: "https://www.mmdbkk.com/partner/model-selection" + (credentials ? "#s=" + id + "&t=" + token : ""),
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.Headers = Headers;
      window.AbortController = AbortController;
      window.crypto.randomUUID = randomUUID;
      window.URL.createObjectURL = () => { const value = "blob:https://www.mmdbkk.com/" + randomUUID(); created.push(value); return value; };
      window.URL.revokeObjectURL = value => revoked.push(value);
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
      window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
      window.HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, filename: this.download }); };
      window.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return fetcher(String(url), options);
      };
    },
  });
  return { dom, w: dom.window, d: dom.window.document, calls, created, revoked, downloads, errors, close() { dom.window.close(); } };
}

test("uncredentialed landing contains no job or model data and makes no API call", async () => {
  const app = page(() => { throw new Error("must not fetch"); }, { credentials: false });
  try {
    assert.equal(app.d.getElementById("workspace").hidden, true);
    assert.equal(app.d.getElementById("gate").hidden, false);
    assert.equal(app.calls.length, 0);
    assert.equal(app.d.getElementById("grid").children.length, 0);
    assert.doesNotMatch(app.d.body.textContent, /Demo Partner|ข้อมูลสมมติสำหรับทดสอบ|งานถ่ายภาพทดสอบ|2,400/);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("empty shortlist loads a real editable brief; bearer fragment is removed before scripts continue", async () => {
  let saved = view(), post;
  const app = page((url, options) => {
    if (url.endsWith("/view")) return response(saved);
    if (url.endsWith("/brief")) { post = JSON.parse(options.body); saved = { ...saved, brief: post.brief, revision: "r2" }; return response({ ok: true, revision: "r2", brief: saved.brief }); }
    throw new Error(url);
  });
  try {
    await settle(() => !app.d.getElementById("workspace").hidden);
    assert.equal(app.w.location.hash, "#s=" + id);
    assert.equal(app.w.sessionStorage.getItem("mmd-shortlist:" + id), token);
    assert.match(app.d.getElementById("grid").textContent, /เปอร์กำลังคัดรูป/);
    assert.equal(app.d.getElementById("reviewSelection").disabled, true);
    app.d.getElementById("editBrief").click();
    const form = app.d.getElementById("briefForm");
    assert.equal(form.elements.time.value, "");
    form.elements.time.value = "18:30"; form.elements.location.value = "อโศก"; form.elements.duration.value = "2 ชั่วโมง";
    form.dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
    await settle(() => post && !app.d.getElementById("briefDialog").open);
    assert.equal(post.revision, "r1");
    assert.equal(post.brief.location, "อโศก");
    app.d.getElementById("refreshView").click();
    await settle(() => app.calls.filter(c => c.url.endsWith("/view")).length >= 2);
    assert.match(app.d.getElementById("briefValues").textContent, /อโศก/);
    for (const call of app.calls) {
      assert.equal(call.options.headers.get("Authorization"), "Bearer " + token);
      assert.equal(call.options.credentials, "omit");
      assert.equal(call.options.redirect, "error");
      assert.ok(!call.url.includes(token));
    }
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("photos are individually selectable; downloading always uses current approved photo", async () => {
  let submitted;
  const data = view({ models: [model(mid, "ตัวเลือกหนึ่ง", [photo(p1), photo(p2, false)]), model(other, "ตัวเลือกสอง", [photo(p3)])] });
  const app = page((url, options) => {
    if (url.endsWith("/view")) return response(data);
    if (url.includes("/media/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
    if (url.endsWith("/selection")) { submitted = JSON.parse(options.body); return response({ ok: true, receiptId, revision: "r2" }); }
    throw new Error(url);
  });
  try {
    await settle(() => app.d.querySelectorAll(".model").length === 2);
    app.d.querySelector('[data-open="' + mid + '"]').click();
    const check = app.d.getElementById("pickPhoto"); check.checked = true; check.dispatchEvent(new app.w.Event("change", { bubbles: true }));
    assert.equal(app.d.getElementById("footerCount").textContent, "1");
    app.d.querySelector('[data-photo-step="1"]').click();
    assert.equal(app.d.getElementById("downloadImage").disabled, true);
    assert.equal(app.d.getElementById("pickPhoto").checked, false);
    app.d.querySelector('[data-photo-step="-1"]').click();
    app.d.getElementById("downloadImage").click();
    await settle(() => app.downloads.length === 1);
    assert.ok(app.calls.some(c => c.url === base + "/media/" + p1 + "/download"));
    assert.ok(!app.calls.some(c => c.url === base + "/media/" + p2 + "/download"));
    assert.match(app.downloads[0].filename, /-1\.webp$/);
    app.d.getElementById("modelDialog").close();
    app.d.querySelector('[data-pick="' + other + '"]').click();
    app.d.getElementById("reviewSelection").click();
    app.d.querySelector('[data-up="' + other + '"]').click();
    app.d.getElementById("submitSelection").click();
    await settle(() => submitted && !app.d.getElementById("submissionResult").hidden);
    assert.deepEqual(submitted.modelIds, [other, mid]);
    assert.deepEqual(submitted.photoIds, [p1]);
    assert.match(app.d.getElementById("submissionResult").textContent, /เปอร์ได้รับตัวเลือกแล้ว/);
    assert.equal(app.d.getElementById("submitSelection").disabled, true);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("revocation wipes details and cached blobs; a delayed media response cannot restore them", async () => {
  let revoked = false, finishImage;
  const data = view({ models: [model(mid, "ชื่อที่ต้องล้าง", [photo(p1)])] });
  const app = page(url => {
    if (url.endsWith("/view")) return revoked ? response({ ok: false, error: "link_closed" }, 410) : response(data);
    return new Promise(resolve => { finishImage = () => resolve(new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } })); });
  });
  try {
    await settle(() => Boolean(finishImage));
    app.d.querySelector('[data-open="' + mid + '"]').click();
    revoked = true;
    app.d.getElementById("refreshView").click();
    await settle(() => app.d.getElementById("workspace").hidden);
    finishImage();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(app.d.querySelectorAll("img[data-photo-id]").length, 0);
    assert.equal(app.created.length, 0);
    assert.equal(app.w.sessionStorage.getItem("mmd-shortlist:" + id), null);
    assert.doesNotMatch(app.d.body.textContent, /ชื่อที่ต้องล้าง|Demo Partner|งานสมมติสำหรับทดสอบ/);
    assert.equal(app.d.getElementById("modelDialog").open, false);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("timed-out submission retains the same idempotency key and payload for retry", async () => {
  let attempts = [];
  const app = page((url, options) => {
    if (url.endsWith("/view")) return response(view({ models: [model(mid, "หนึ่ง", [])] }));
    if (url.endsWith("/selection")) {
      attempts.push(JSON.parse(options.body));
      if (attempts.length === 1) return Promise.reject(new DOMException("timeout", "AbortError"));
      return response({ ok: true, receiptId, revision: "r2", duplicate: true });
    }
    throw new Error(url);
  });
  try {
    await settle(() => app.d.querySelector(".model"));
    app.d.querySelector('[data-pick="' + mid + '"]').click();
    app.d.getElementById("reviewSelection").click();
    app.d.getElementById("submitSelection").click();
    await settle(() => !app.d.getElementById("selectionError").hidden);
    app.d.getElementById("submitSelection").click();
    await settle(() => attempts.length === 2 && !app.d.getElementById("submissionResult").hidden);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("background refresh cannot silently advance an open brief form revision; explicit refresh preserves edits", async () => {
  let data = view(), attempts = [];
  const app = page((url, options) => {
    if (url.endsWith("/view")) return response(data);
    if (url.endsWith("/brief")) {
      const input = JSON.parse(options.body); attempts.push(input);
      if (input.revision !== data.revision) return response({ ok: false, error: "revision_conflict" }, 409);
      data = { ...data, brief: input.brief, revision: "r3" };
      return response({ ok: true, revision: "r3" });
    }
    throw new Error(url);
  });
  try {
    await settle(() => !app.d.getElementById("workspace").hidden);
    app.d.getElementById("editBrief").click();
    app.d.getElementById("briefForm").elements.location.value = "รายละเอียดที่กำลังกรอก";
    data = { ...data, revision: "r2", brief: { ...brief, location: "รายละเอียดจากเปอร์" } };
    app.d.getElementById("refreshView").click();
    await settle(() => app.d.getElementById("briefValues").textContent.includes("รายละเอียดจากเปอร์"));
    app.d.getElementById("briefForm").dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle(() => !app.d.getElementById("briefConflict").hidden);
    assert.equal(attempts[0].revision, "r1");
    app.d.getElementById("readLatestBrief").click();
    await settle(() => !app.d.getElementById("latestBrief").hidden);
    assert.equal(app.d.getElementById("briefForm").elements.location.value, "รายละเอียดที่กำลังกรอก");
    app.d.getElementById("briefForm").dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle(() => attempts.length === 2 && !app.d.getElementById("briefDialog").open);
    assert.equal(attempts[1].revision, "r2");
    assert.equal(data.brief.location, "รายละเอียดที่กำลังกรอก");
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("selection note cannot change while submitting, and the recorded snapshot matches the request", async () => {
  let complete, input;
  const app = page((url, options) => {
    if (url.endsWith("/view")) return response(view({ models: [model(mid, "หนึ่ง", [])] }));
    if (url.endsWith("/selection")) { input = JSON.parse(options.body); return new Promise(resolve => { complete = () => resolve(response({ ok: true, receiptId, revision: "r2" })); }); }
    throw new Error(url);
  });
  try {
    await settle(() => app.d.querySelector(".model"));
    app.d.querySelector('[data-pick="' + mid + '"]').click();
    app.d.getElementById("reviewSelection").click();
    const note = app.d.getElementById("selectionNote"); note.value = "บรีฟที่ส่ง"; note.dispatchEvent(new app.w.Event("input"));
    app.d.getElementById("submitSelection").click();
    await settle(() => Boolean(complete));
    assert.equal(note.disabled, true);
    note.dispatchEvent(new app.w.Event("input"));
    complete();
    await settle(() => !app.d.getElementById("submissionResult").hidden);
    assert.equal(input.note, "บรีฟที่ส่ง");
    assert.equal(note.disabled, false);
    assert.equal(app.d.getElementById("submitSelection").disabled, true);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test("Webflow generated halves reconstruct the exact page and remain inside both code-block limits", async () => {
  const head = await fs.readFile(new URL("./head.html", import.meta.url), "utf8");
  const footer = await fs.readFile(new URL("./footer.html", import.meta.url), "utf8");
  const min = (await fs.readFile(new URL("./page.min.html", import.meta.url), "utf8")).trim();
  assert.ok(head.length < 50000);
  assert.ok(footer.length < 50000);
  const app = page(() => response(view()), { html: "<!doctype html><html><head>" + head + "</head><body>" + footer + "</body></html>" });
  try {
    assert.equal(app.w.location.hash, "#s=" + id);
    const frame = app.d.getElementById("mmd-pero-shortlist-frame");
    assert.equal(frame.srcdoc, min);
    assert.equal(app.w.__MMD_SHORTLIST_SOURCE__, undefined);
    assert.ok(!frame.srcdoc.includes(token));
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});
