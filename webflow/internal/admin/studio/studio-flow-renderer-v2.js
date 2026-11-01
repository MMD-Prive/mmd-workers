/* Studio canvas only. Exact approved artwork; no storage, publication or generation. */
(function () {
  "use strict";
  var WIDTH = 1316, HEIGHT = 1195;
  var BASE = "https://raw.githubusercontent.com/MMD-Prive/mmd-workers/e25f3dcdcccc48b29111a483fd3ab4ce2c26cd64/webflow/internal/admin/studio/frames/clean-v1/";
  var ART = [
    ["frame-1-dc1ae630c2c6.png", "dc1ae630c2c694bde00171bcb4d9c73498ff986831931698cf568f2b1d8f3e3d"],
    ["frame-2-e56e268deb2a.png", "e56e268deb2a41f7a951e042949491d64c5885cd50e72cf62243ca5b6085e5da"],
    ["frame-3-a53eec77c6e0.png", "a53eec77c6e0fd4aac375d1d62cd230ca77b30ebb9b2d9167bce1e0a7fab12f8"],
    ["frame-4-1a66f180af60.png", "1a66f180af607d2f57f6444aeadab38872b04abf794d57f2daa5f178ec8a9eac"],
    ["frame-5-29de6b65d6d5.png", "29de6b65d6d5d330f19b2f1ecc052e638c3df473ffe13e6acb18325143c97595"],
    ["frame-6-c4422924b44f.png", "c4422924b44fdf570c0b99c47daa99e6e66c6585d21fc6ccb274c6351611d0a8"],
    ["frame-7-1f673fd77a78.png", "1f673fd77a7809f5ea000a76f613b4719c631f550de4ea01aa937483a6a3b1bd"]
  ];
  var fields = new Set(["ST", "GY", "FR", "EN", "EX", "EMs", "GWs"]);
  var jobs = new WeakMap(), artCache = new Map();
  var FONT = 'Georgia,"LINE Seed Sans TH","Noto Sans Thai","Noto Serif Thai",serif';
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function metric(value, min, max) {
    if (!/^(?:\d+)(?:\.\d+)?$/.test(String(value == null ? "" : value))) fail("studio_metrics_required");
    var n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) fail("studio_metrics_required");
    return String(n);
  }
  function project(input) {
    if (!input || !fields.has(input.field)) fail("studio_family_required");
    var special = input.field === "EMs" || input.field === "GWs";
    var name = String(input.model_name == null ? "" : input.model_name);
    var run = String(input.run_number == null ? "" : input.run_number);
    var title = String(input.title == null ? "" : input.title).trim().replace(/\r\n/g, "\n");
    var number = special ? (input.field === "EMs" ? 6 : 7) : Number(input.visual_variant_number);
    if (!special && ![1, 2, 3, 4, 5].includes(number)) fail("studio_frame_required");
    if (!special && (!name.trim() || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))) fail("studio_name_required");
    var match = special && run.match(new RegExp("^" + input.field + "(\\d{1,6})$"));
    if (special && !match) fail("studio_assigned_run_required");
    if (special && (!title || Array.from(title).length > 120 || title.split("\n").length > 2 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(title))) fail("studio_title_required");
    if (!(input.photo instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(input.photo.type) || input.photo.size < 1 || input.photo.size > 12 * 1024 * 1024) fail("studio_photo_required");
    return { number: number, name: name, field: input.field, special: special, identity: special ? run : name,
      digits: special ? match[1] : "", title: special ? title : "", photo: input.photo,
      height: metric(input.height_cm, 130, 230), weight: metric(input.weight_kg, 35, 200) };
  }
  function signature(bytes) {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every(function (v, i) { return bytes[i] === v; })) return "image/png";
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
    if (bytes.length >= 16 && [82,73,70,70].every(function (v, i) { return bytes[i] === v; }) &&
      [87,69,66,80,86,80,56].every(function (v, i) { return bytes[i + 8] === v; }) && [32,76,88].includes(bytes[15])) return "image/webp";
    return "";
  }
  async function artBlob(number) {
    if (artCache.has(number)) return artCache.get(number);
    var task = (async function () {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
      var limit = 4 * 1024 * 1024;
      try {
        var response = await fetch(BASE + ART[number - 1][0], { credentials: "omit", mode: "cors", redirect: "error", cache: "force-cache", signal: controller.signal });
        if (!response.ok) fail("studio_frame_unavailable");
        if (Number(response.headers.get("content-length")) > limit) { controller.abort(); fail("studio_frame_too_large"); }
        var bytes;
        if (response.body && response.body.getReader) {
          var reader = response.body.getReader(), parts = [], size = 0;
          try {
            while (true) {
              var part = await reader.read(); if (part.done) break;
              size += part.value.byteLength;
              if (size > limit) { controller.abort(); await reader.cancel().catch(function () {}); fail("studio_frame_too_large"); }
              parts.push(part.value);
            }
          } finally { reader.releaseLock(); }
          bytes = new Uint8Array(size); var at = 0;
          parts.forEach(function (part) { bytes.set(part, at); at += part.byteLength; });
        } else {
          bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength > limit) fail("studio_frame_too_large");
        }
        if (bytes.length < 24 || signature(bytes) !== "image/png") fail("studio_frame_invalid");
        var header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (header.getUint32(16) !== WIDTH || header.getUint32(20) !== HEIGHT) fail("studio_frame_invalid");
        var hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
        if (hash !== ART[number - 1][1]) fail("studio_frame_integrity");
        return new Blob([bytes], { type: "image/png" });
      } catch (error) {
        if (error.name === "AbortError") fail("studio_frame_timeout");
        throw error;
      } finally { clearTimeout(timer); }
    })();
    artCache.set(number, task);
    try { return await task; } catch (error) { artCache.delete(number); throw error; }
  }
  function decode(blob) {
    return new Promise(function (resolve, reject) {
      var image = new Image(), url = URL.createObjectURL(blob), finished = false;
      var timer = setTimeout(function () { finish("studio_image_timeout"); }, 15000);
      function finish(code) {
        if (finished) return; finished = true;
        clearTimeout(timer); image.onload = null; image.onerror = null; URL.revokeObjectURL(url);
        if (code) { image.src = ""; var error = new Error(code); error.code = code; reject(error); } else resolve(image);
      }
      image.onload = function () {
        var w = image.naturalWidth, h = image.naturalHeight;
        finish(!w || !h || w > 16384 || h > 16384 || w * h > 64000000 ? "studio_image_invalid" : "");
      };
      image.onerror = function () { finish("studio_image_invalid"); };
      image.src = url;
    });
  }
  async function fontsReady() {
    if (typeof document === "undefined" || !document.fonts || !document.fonts.ready) return;
    var timer;
    try {
      await Promise.race([document.fonts.ready, new Promise(function (_, reject) {
        timer = setTimeout(function () { reject(Object.assign(new Error("studio_font_timeout"), { code: "studio_font_timeout" })); }, 5000);
      })]);
    } finally { clearTimeout(timer); }
  }
  function font(ctx, size) { ctx.font = "400 " + size + "px " + FONT; }
  function graphemes(text) {
    return typeof Intl.Segmenter === "function" ? Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text), function (s) { return s.segment; }) : Array.from(text);
  }
  function lines(ctx, text, width) {
    var out = [];
    text.split(/\r?\n/).forEach(function (paragraph) {
      var line = "";
      graphemes(paragraph).forEach(function (character) {
        if (line && ctx.measureText(line + character).width > width) { out.push(line); line = ""; }
        line += character;
      });
      out.push(line);
    });
    return out;
  }
  function fittedLines(ctx, text, width, count, start) {
    for (var size = start; size >= 12; size--) {
      font(ctx, size); var result = lines(ctx, text, width);
      if (result.length <= count) return { size: size, lines: result };
    }
    fail("studio_text_does_not_fit");
  }
  function paint(canvas, ctx, art, photo, data) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(art, 0, 0, WIDTH, HEIGHT);
    var box = { x: WIDTH * .07, y: HEIGHT * .12, w: WIDTH * .64, h: HEIGHT * (data.special ? .64 : .76) };
    var scale = Math.min(box.w / photo.naturalWidth, box.h / photo.naturalHeight);
    var w = photo.naturalWidth * scale, h = photo.naturalHeight * scale;
    ctx.drawImage(photo, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    ctx.fillStyle = "#f7edda"; ctx.textBaseline = "top"; ctx.textAlign = "right";
    if (data.special) {
      var runBox = data.field === "EMs" ? [.765, .199, .184, .04] : [.764, .215, .168, .055];
      var runSize = 42;
      do { font(ctx, runSize--); } while (ctx.measureText(data.digits).width > WIDTH * runBox[2] - 18 && runSize >= 12);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(data.digits, WIDTH * (runBox[0] + runBox[2] / 2), HEIGHT * (runBox[1] + runBox[3] / 2));
      var tx = box.x, ty = HEIGHT * .78, tw = box.w, th = HEIGHT * .10;
      ctx.fillStyle = "#f3f0e8"; ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = "#25262a"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      var title = fittedLines(ctx, data.title, tw - 36, 2, 28), lh = title.size * 1.4;
      title.lines.forEach(function (line, i) { ctx.fillText(line, tx + 18, ty + (th - title.lines.length * lh) / 2 + i * lh); });
    } else {
      var name = fittedLines(ctx, data.name, WIDTH * .20, 3, 48);
      name.lines.forEach(function (line, i) { ctx.fillText(line, WIDTH * .94, HEIGHT * .14 + i * name.size * 1.2); });
    }
    ctx.fillStyle = "#f7edda"; ctx.textAlign = "right"; ctx.textBaseline = "top";
    var size = 45, gap = WIDTH * .015;
    do { font(ctx, size--); } while (ctx.measureText(data.height).width + ctx.measureText(data.weight).width + gap > WIDTH * .20 && size >= 12);
    ctx.fillText(data.weight, WIDTH * .94, HEIGHT * .38);
    ctx.fillText(data.height, WIDTH * .94 - ctx.measureText(data.weight).width - gap, HEIGHT * .38);
  }
  async function render(canvas, input) {
    if (!canvas || typeof canvas.getContext !== "function") fail("studio_canvas_required");
    var ticket = {}; jobs.set(canvas, ticket);
    canvas.width = WIDTH; canvas.height = HEIGHT;
    canvas.setAttribute("aria-busy", "true"); canvas.setAttribute("data-studio-render-ready", "false");
    canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "กำลังเตรียมการ์ด");
    if (canvas.style) {
      canvas.style.setProperty("filter", "none", "important"); canvas.style.setProperty("aspect-ratio", WIDTH + "/" + HEIGHT);
      canvas.style.setProperty("display", "block"); canvas.style.setProperty("width", "100%"); canvas.style.setProperty("height", "auto");
    }
    var ctx;
    try {
      ctx = canvas.getContext("2d");
      if (!ctx) fail("studio_canvas_unavailable");
      var data = project(input);
      if (signature(new Uint8Array(await data.photo.slice(0, 16).arrayBuffer())) !== data.photo.type) fail("studio_photo_invalid");
      var loaded = await Promise.all([artBlob(data.number).then(decode), decode(data.photo), fontsReady()]);
      if (jobs.get(canvas) !== ticket) fail("studio_render_superseded");
      paint(canvas, ctx, loaded[0], loaded[1], data);
      canvas.setAttribute("data-studio-frame", String(data.number));
      canvas.setAttribute("aria-label", data.identity + " · " + data.height + " / " + data.weight);
      canvas.setAttribute("data-studio-render-ready", "true");
      return canvas;
    } catch (error) {
      if (jobs.get(canvas) === ticket) { if (ctx) ctx.clearRect(0, 0, WIDTH, HEIGHT); canvas.setAttribute("aria-label", "ยังเตรียมการ์ดไม่สำเร็จ"); }
      throw error;
    } finally { if (jobs.get(canvas) === ticket) canvas.setAttribute("aria-busy", "false"); }
  }
  window.MMDStudioFlowRenderer = Object.freeze({ render: render, width: WIDTH, height: HEIGHT, version: "studio-flow-renderer-v2" });
})();
