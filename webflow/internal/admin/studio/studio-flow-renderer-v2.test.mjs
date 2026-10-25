import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const source = await readFile(new URL("./studio-flow-renderer-v2.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("./frames/clean-v1/manifest.json", import.meta.url), "utf8"));
const frames = new Map(await Promise.all(manifest.assets.map(async asset => [asset.asset_file,
  await readFile(new URL("./frames/clean-v1/" + asset.asset_file, import.meta.url))])));
const pinnedBase = "https://raw.githubusercontent.com/MMD-Prive/mmd-workers/e25f3dcdcccc48b29111a483fd3ab4ce2c26cd64/webflow/internal/admin/studio/frames/clean-v1/";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// The decoder is deliberately a browser stub: real PNG art bytes still pass through
// streaming, SHA-256 and dimensions checks. Browser QA covers native image decoding.
function photo(width = 200, height = 400) {
  const bytes = new Uint8Array(32);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}
function input(extra = {}) {
  return { model_name: "Ice T", field: "ST", run_number: "", height_cm: 175, weight_kg: 77,
    visual_variant_number: 1, title: "", photo: photo(), ...extra };
}
function canvas() {
  const attributes = {}, styles = {}, calls = [];
  const context = {
    font: "400 16px Georgia", filter: "none",
    measureText(text) { return { width: Array.from(text).length * Number(this.font.match(/([\d.]+)px/)[1]) * .53 }; },
    clearRect(...args) { calls.push({ kind: "clear", args }); },
    drawImage(image, ...args) { calls.push({ kind: "image", image, args, filter: this.filter }); },
    fillRect(...args) { calls.push({ kind: "rect", args, fill: this.fillStyle }); },
    fillText(text, ...args) { calls.push({ kind: "text", text, args, font: this.font, align: this.textAlign }); },
  };
  return { attributes, styles, calls, context, width: 0, height: 0,
    style: { setProperty(key, value, priority) { styles[key] = { value, priority }; } },
    setAttribute(key, value) { attributes[key] = String(value); },
    getContext(kind) { assert.equal(kind, "2d"); return context; },
  };
}
function environment(options = {}) {
  const urls = new Map(), created = [], revoked = [], requests = [];
  let sequence = 0;
  class ImageStub {
    set src(url) {
      if (!url) return;
      const blob = urls.get(url);
      assert.ok(blob instanceof Blob, "only in-memory object URLs reach the image decoder");
      if (options.imageNeverLoads) return;
      (async () => {
        if (blob.decodeDelay) await delay(blob.decodeDelay);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length < 24) { this.onerror?.(); return; }
        const header = new DataView(bytes.buffer);
        this.naturalWidth = header.getUint32(16); this.naturalHeight = header.getUint32(20);
        this.onload?.();
      })().catch(error => { this.onerror?.(error); });
    }
  }
  const context = {
    Blob, Uint8Array, DataView, AbortController, Image: ImageStub, crypto: webcrypto,
    URL: {
      createObjectURL(blob) { const id = "blob:https://studio.test/" + ++sequence; urls.set(id, blob); created.push(id); return id; },
      revokeObjectURL(id) { revoked.push(id); urls.delete(id); },
    },
    setTimeout: (callback, ms) => setTimeout(callback, (options.shortTimeouts && ms >= 15000) || (options.shortFontTimeouts && ms === 5000) ? 5 : ms),
    clearTimeout,
    async fetch(url, init) {
      requests.push({ url, init });
      assert.ok(url.startsWith(pinnedBase), "network access is restricted to pinned public artwork");
      if (options.fetch) return options.fetch(url, init, requests.length);
      const bytes = frames.get(url.slice(pinnedBase.length));
      assert.ok(bytes, "only registered assets are fetched");
      return new Response(bytes, { headers: { "content-type": "image/png", "content-length": String(bytes.length) } });
    },
  };
  if (options.fonts) context.document = { fonts: options.fonts };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "studio-flow-renderer-v2.js" });
  return { renderer: context.MMDStudioFlowRenderer, requests, created, revoked, urls };
}

test("all seven exact approved artworks render through integrity verification with no credentials", async () => {
  const env = environment();
  for (const asset of manifest.assets) {
    const view = canvas();
    const field = asset.field || "FR";
    const data = input({ field, visual_variant_number: asset.number,
      run_number: asset.field ? asset.field + "19" : "", title: asset.field ? "พร้อมสำหรับทุกวันใหม่" : "" });
    assert.equal(await env.renderer.render(view, data), view);
    assert.equal(view.width, 1316); assert.equal(view.height, 1195);
    assert.equal(view.attributes["data-studio-frame"], String(asset.number));
    assert.equal(view.attributes["data-studio-render-ready"], "true");
    assert.equal(view.attributes["aria-busy"], "false");
    assert.deepEqual(view.calls.find(call => call.kind === "image").args, [0, 0, 1316, 1195]);
    assert.equal(data.field, field, "drawing never reclassifies a model");
  }
  assert.equal(env.requests.length, 7);
  for (const request of env.requests) {
    assert.equal(request.init.credentials, "omit");
    assert.equal(request.init.redirect, "error");
    assert.equal(request.init.mode, "cors");
    assert.ok(request.init.signal instanceof AbortSignal);
  }
  assert.equal(env.urls.size, 0, "decoded image URLs are released");
  assert.deepEqual(new Set(env.revoked), new Set(env.created));
});

test("canonical names including spaces, suffixes and Thai are preserved rather than reformatted", async () => {
  const env = environment();
  for (const name of ["Ice T", "Todd TR", "ทดสอบ ชื่อไทย", "MODEL WITH A LONG CANONICAL NAME AB"]) {
    const view = canvas();
    await env.renderer.render(view, Object.freeze(input({ model_name: name })));
    const rendered = view.calls.filter(call => call.kind === "text").slice(0, -2).map(call => call.text).join("");
    assert.equal(rendered, name);
    assert.equal(view.attributes["aria-label"], name + " · 175 / 77");
  }
  assert.equal(env.requests.length, 1, "only integrity-verified artwork is cached");
});

test("Thai names and titles wait for browser fonts before measurement and use the installed Thai fallback", async () => {
  let releaseFonts, settled = false;
  const ready = new Promise(resolve => { releaseFonts = () => { settled = true; resolve(); }; });
  const env = environment({ fonts: { ready } }), view = canvas();
  const measure = view.context.measureText;
  view.context.measureText = function (text) { assert.equal(settled, true, "font metrics must be final before fitting text"); return measure.call(this, text); };
  const pending = env.renderer.render(view, input({ model_name: "ทดสอบ ชื่อไทย" }));
  await delay(10);
  assert.equal(view.attributes["data-studio-render-ready"], "false");
  assert.equal(view.calls.filter(call => call.kind === "image" || call.kind === "text").length, 0);
  releaseFonts(); await pending;
  const thaiTexts = view.calls.filter(call => call.kind === "text").slice(0, -2);
  assert.equal(thaiTexts.map(call => call.text).join(""), "ทดสอบ ชื่อไทย");
  assert.ok(thaiTexts.every(call => call.font.includes('Georgia,"LINE Seed Sans TH","Noto Sans Thai"')));
  const titleView = canvas(), title = "พร้อมสำหรับทุกวันใหม่";
  await env.renderer.render(titleView, input({ field: "EMs", run_number: "EMs11", title }));
  const titles = titleView.calls.filter(call => call.kind === "text").slice(1, -2);
  assert.equal(titles.map(call => call.text).join(""), title);
  assert.ok(titles.every(call => call.font.includes('"LINE Seed Sans TH","Noto Sans Thai"')));
});

test("a font readiness deadline fails closed without painting or marking the export ready", async () => {
  const env = environment({ fonts: { ready: new Promise(() => {}) }, shortFontTimeouts: true }), view = canvas();
  await assert.rejects(env.renderer.render(view, input({ model_name: "ทดสอบ" })), error => error.code === "studio_font_timeout");
  assert.equal(view.attributes["data-studio-render-ready"], "false");
  assert.equal(view.attributes["aria-busy"], "false");
  assert.equal(view.calls.filter(call => call.kind === "image" || call.kind === "text").length, 0);
});

test("general frame choices remain independent of field and photo is fully contained without cropping or filters", async () => {
  const env = environment();
  for (const field of ["ST", "GY", "FR", "EN", "EX"]) {
    const view = canvas();
    await env.renderer.render(view, input({ field, visual_variant_number: 3 }));
    assert.equal(view.attributes["data-studio-frame"], "3");
    const images = view.calls.filter(call => call.kind === "image");
    assert.equal(images.length, 2, "one exact frame plus one supplied photo, with no extra image layers");
    assert.equal(images[1].args.length, 4, "no source crop rectangle is used");
    const [x, y, width, height] = images[1].args;
    assert.equal(width / height, .5);
    assert.ok(x >= 1316 * .07 && x + width <= 1316 * .71 + .001);
    assert.ok(y >= 1195 * .12 && y + height <= 1195 * .88 + .001);
    assert.equal(images[1].filter, "none");
    assert.deepEqual(view.styles.filter, { value: "none", priority: "important" });
  }
});

test("exclusive cards preserve every assigned RUN digit and title, never draw the model name", async () => {
  const env = environment();
  for (const [field, run] of [["EMs", "EMs123456"], ["GWs", "GWs0019"], ["GWs", "GWs19"]]) {
    const view = canvas();
    await env.renderer.render(view, input({ field, run_number: run, title: "A quiet confidence\nReady for tomorrow", model_name: "PRIVATE NAME", visual_variant_number: 2 }));
    const texts = view.calls.filter(call => call.kind === "text").map(call => call.text);
    assert.equal(texts[0], run.slice(field.length));
    assert.deepEqual(texts.slice(1, -2), ["A quiet confidence", "Ready for tomorrow"]);
    assert.ok(!texts.some(text => text.includes("PRIVATE NAME")));
    assert.equal(view.attributes["data-studio-frame"], field === "EMs" ? "6" : "7");
    assert.equal(view.attributes["aria-label"], run + " · 175 / 77");
    const photoCall = view.calls.filter(call => call.kind === "image")[1];
    const titleBox = view.calls.find(call => call.kind === "rect");
    assert.ok(photoCall.args[1] + photoCall.args[3] <= titleBox.args[1], "title does not cover the source photo");
  }
});

test("a 120-character exclusive title fits at most two complete lines without truncation", async () => {
  const env = environment(), view = canvas(), title = "A".repeat(120);
  await env.renderer.render(view, input({ field: "EMs", run_number: "EMs11", title }));
  const lines = view.calls.filter(call => call.kind === "text").slice(1, -2).map(call => call.text);
  assert.ok(lines.length <= 2); assert.equal(lines.join(""), title);
});

test("missing identity, invalid family/frame/RUN/title/metrics and external photo URLs never fetch or produce a card", async () => {
  const cases = [
    [{ model_name: "" }, "studio_name_required"],
    [{ model_name: "name\nspoof" }, "studio_name_required"],
    [{ field: "A" }, "studio_family_required"],
    [{ visual_variant_number: 0 }, "studio_frame_required"],
    [{ field: "EMs", run_number: "", title: "Title" }, "studio_assigned_run_required"],
    [{ field: "GWs", run_number: "EMs123", title: "Title" }, "studio_assigned_run_required"],
    [{ field: "EMs", run_number: "EMs11", title: "" }, "studio_title_required"],
    [{ field: "EMs", run_number: "EMs11", title: "a\nb\nc" }, "studio_title_required"],
    [{ field: "EMs", run_number: "EMs11", title: "a".repeat(121) }, "studio_title_required"],
    [{ height_cm: "" }, "studio_metrics_required"],
    [{ weight_kg: NaN }, "studio_metrics_required"],
    [{ photo: "https://private.example/photo.png" }, "studio_photo_required"],
    [{ photo: new Blob(["<svg></svg>"], { type: "image/svg+xml" }) }, "studio_photo_required"],
    [{ photo: new Blob(["not a png"], { type: "image/png" }) }, "studio_photo_invalid"],
  ];
  for (const [patch, code] of cases) {
    const env = environment(), view = canvas();
    await assert.rejects(env.renderer.render(view, input(patch)), error => error.code === code);
    assert.equal(env.requests.length, 0); assert.equal(view.attributes["data-studio-render-ready"], "false");
    assert.equal(view.calls.filter(call => call.kind === "image").length, 0);
    assert.equal(view.attributes["aria-busy"], "false");
  }
});

test("tampered public artwork fails integrity, clears the card, and is not retained in cache", async () => {
  const name = manifest.assets[0].asset_file, original = frames.get(name), corrupted = Buffer.from(original);
  corrupted[corrupted.length - 1] ^= 1;
  const env = environment({ fetch: async (_url, _init, count) => new Response(count === 1 ? corrupted : original) });
  const view = canvas();
  await assert.rejects(env.renderer.render(view, input()), error => error.code === "studio_frame_integrity");
  assert.equal(view.attributes["data-studio-render-ready"], "false");
  assert.equal(view.calls.filter(call => call.kind === "image").length, 0);
  await env.renderer.render(view, input());
  assert.equal(env.requests.length, 2); assert.equal(view.attributes["data-studio-render-ready"], "true");
});

test("failed HTTP, oversized header and oversized streamed responses never paint unverified artwork", async () => {
  const cases = [
    [() => new Response("missing", { status: 404 }), "studio_frame_unavailable"],
    [() => new Response("", { headers: { "content-length": "5000000" } }), "studio_frame_too_large"],
    [() => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); controller.enqueue(new Uint8Array(2 * 1024 * 1024)); controller.close(); } })), "studio_frame_too_large"],
  ];
  for (const [fetch, code] of cases) {
    const env = environment({ fetch }), view = canvas();
    await assert.rejects(env.renderer.render(view, input()), error => error.code === code);
    assert.equal(view.calls.filter(call => call.kind === "image").length, 0);
    assert.equal(view.attributes["data-studio-render-ready"], "false");
  }
});

test("network and image decode deadlines release busy state and object URLs", async () => {
  const network = environment({ shortTimeouts: true, fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) });
  const first = canvas();
  await assert.rejects(network.renderer.render(first, input()), error => error.code === "studio_frame_timeout");
  assert.equal(first.attributes["aria-busy"], "false");
  const image = environment({ shortTimeouts: true, imageNeverLoads: true }), second = canvas();
  await assert.rejects(image.renderer.render(second, input()), error => error.code === "studio_image_timeout");
  await delay(20);
  assert.equal(second.attributes["aria-busy"], "false"); assert.equal(image.urls.size, 0);
});

test("a slow superseded render cannot overwrite or clear a newer successful card", async () => {
  const env = environment(), view = canvas(), slowPhoto = photo(); slowPhoto.decodeDelay = 40;
  const previous = env.renderer.render(view, input({ model_name: "Old model", photo: slowPhoto }));
  const rejected = assert.rejects(previous, error => error.code === "studio_render_superseded");
  await env.renderer.render(view, input({ model_name: "New model" }));
  await rejected;
  assert.equal(view.attributes["data-studio-render-ready"], "true");
  assert.equal(view.attributes["aria-label"], "New model · 175 / 77");
  assert.ok(view.calls.some(call => call.kind === "text" && call.text === "New model"));
  assert.ok(!view.calls.some(call => call.kind === "text" && call.text === "Old model"));
  assert.equal(view.calls.filter(call => call.kind === "clear").length, 1, "stale completion never clears the newer result");
  assert.equal(env.urls.size, 0);
});
