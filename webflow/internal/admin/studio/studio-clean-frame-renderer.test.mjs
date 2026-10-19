import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

const root = new URL("./", import.meta.url);
const source = await readFile(new URL("studio-clean-frame-renderer.js", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("frames/clean-v1/manifest.json", root), "utf8"));
const portrait = 'url("https://example.invalid/approved-original.jpg")';

test("all seven exact owner assets retain dimensions and source provenance", async () => {
  assert.equal(manifest.assets.length, 7);
  assert.equal(new Set(manifest.assets.map(a => a.library_file_id)).size, 7);
  for (const asset of manifest.assets) {
    const bytes = await readFile(new URL("frames/clean-v1/" + asset.asset_file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 1316);
    assert.equal(bytes.readUInt32BE(20), 1195);
    assert.equal(asset.width, 1316);
    assert.equal(asset.height, 1195);
  }
  assert.match(manifest.assets[5].file_name, /run-number-restored/);
  assert.match(manifest.assets[6].file_name, /run-number-restored/);
});

for (const asset of manifest.assets) {
  test(`asset ${asset.number}: opaque art behind unfiltered contained photo; no added logo`, () => {
    const dom = new JSDOM('<div id="card"></div>', { runScripts: "outside-only" });
    dom.window.eval(source);
    const card = dom.window.document.getElementById("card");
    const values = { model: "TEST MODEL", height: "178", weight: "66", run: "007" };
    const frame = { ...asset, url: "frames/clean-v1/" + asset.asset_file };
    dom.window.MMDStudioCleanFrame.render(card, frame, portrait, values);
    assert.equal(card.querySelector("img").getAttribute("src"), frame.url);
    assert.equal(card.firstElementChild.className, "mmd-studio-frame-art");
    assert.equal(card.children[1].className, "mmd-studio-frame-photo");
    assert.equal(card.children[1].style.backgroundImage, portrait);
    assert.equal(card.querySelectorAll("img").length, 1, "only the exact frame artwork is added");
    assert.equal(card.querySelectorAll('[class*="brand"], [class*="logo"]').length, 0);
    assert.deepEqual([...card.querySelectorAll(".mmd-studio-frame-metrics span")].map(e => e.textContent), ["178", "66"]);
    if (["EMs", "GWs"].includes(asset.field)) {
      assert.equal(card.querySelector(".mmd-studio-frame-run").textContent, "007");
      assert.equal(card.querySelector(".mmd-studio-frame-name"), null);
      dom.window.MMDStudioCleanFrame.render(card, frame, portrait, { ...values, run: asset.field + "42" });
      assert.equal(card.querySelector(".mmd-studio-frame-run").textContent, "042");
      dom.window.MMDStudioCleanFrame.render(card, frame, portrait, { ...values, run: "" });
      assert.equal(card.querySelector(".mmd-studio-frame-run").textContent, "", "blank number box is not fabricated as 000");
    } else {
      assert.equal(card.querySelector(".mmd-studio-frame-name").textContent, "TEST MODEL");
      assert.equal(card.querySelector(".mmd-studio-frame-run"), null);
    }
    assert.equal(card.querySelectorAll(".mmd-studio-frame-art").length, 1);
    assert.equal(dom.window.document.querySelectorAll("#mmd-studio-clean-frame-css-v1").length, 1);
    dom.window.close();
  });
}

test("source does not create publication, classification or paid generation side effects", () => {
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|XMLHttpRequest|profile_main|orientation_label|catalog_group/);
  assert.match(source, /background-size:contain/);
  assert.match(source, /filter:none/);
  assert.doesNotMatch(source, /brightness\(|contrast\(|saturate\(/);
});

test("unconfirmed purple variants remain unassigned; corrected exclusive mapping is explicit", () => {
  assert.equal(manifest.mapping_status, "awaiting_owner_3_4_5");
  assert.deepEqual(manifest.assets.map(a => a.field), ["EN", "EX", null, null, null, "EMs", "GWs"]);
  assert.deepEqual(manifest.assets.map(a => a.accent), ["cyan", "red", "purple", "purple", "purple", "purple", "gold"]);
});
