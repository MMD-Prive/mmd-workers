import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { buildStudioFrames, validateStudioFrameManifest } from "../../../../scripts/build-studio-clean-frame-release.mjs";

const release = await buildStudioFrames({ allowPendingAssets: true });
const sourceKeys = ["mmdStudioTemplateState", "mmdStudioUploadSeed"];
const categories = [
  ["A", "ST", "sigil-straight-bronze"], ["B", "GY", "sigil-gay-plum"],
  ["E", "FR", "sigil-foreigner-emerald"], ["C", "EN", "mmd-prive-travel"], ["D", "EX", "mmd-prive-extreme"], ["", "", ""],
];
const upload = (family) => `<main id="mmdStudioUploadR5"><form id="muUploadForm"><div class="mu-grid"><div>
<label class="mu-field"><input id="muModel" value="TEST MODEL ID"></label>
<label>Compcard Family<select id="muCategory"><option value="">Unconfirmed</option>${["A", "B", "E", "C", "D", "EMs", "GWs"].map(v => `<option value="${v}" ${family === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
<label class="mu-field"><input id="muRun" value="007"></label><input id="mmdSigilHeight" value="178"><input id="mmdSigilWeight" value="66"><textarea id="muDirection">owner review only</textarea>
<button type="button" id="muBuild">Build Draft</button><a id="muSendReview" href="/internal/admin/studio/review">Review</a>
</div><div id="muCard"><div id="muCardPhoto" style="background-image:url(https://example.invalid/original.jpg)"></div></div></div></form></main>`;
const final = '<main id="mmdModelPreview"><div id="mpCard"><div id="mpCardPhoto" style="background-image:url(https://example.invalid/original.jpg)"></div></div></main>';
async function start(html, states, path = "upload") {
  const dom = new JSDOM(html, { url: "https://studio.invalid/internal/admin/studio/" + path, runScripts: "outside-only" });
  let writes = 0;
  dom.window.fetch = () => { writes++; throw new Error("unexpected_network"); };
  for (const key of sourceKeys) dom.window.localStorage.setItem(key, JSON.stringify(states[key] || states));
  const before = Object.fromEntries(sourceKeys.map(key => [key, dom.window.localStorage.getItem(key)]));
  dom.window.eval(release.code);
  await new Promise(resolve => dom.window.setTimeout(resolve, 10));
  return { dom, document: dom.window.document, before, writes: () => writes };
}
function statesOf(h) { return Object.fromEntries(sourceKeys.map(key => [key, JSON.parse(h.dom.window.localStorage.getItem(key))])); }

for (const [family, field, template_id] of categories) {
  test(`${field || "blank"}: choosing each general color visual leaves category and stable ID unchanged through Final Preview`, async () => {
    const original = { compcard_family: family, field, field_code: field, template_id, model_name: "TEST MODEL ID", height_cm: "178", weight_kg: "66", run_number: "", layer: "Private / SIGIL", studio_review_id: "review-fixture", decision: "use_real_photo", approval: "owner_pending", unknown_context: { retained: true } };
    const h = await start(upload(family), original);
    for (const key of sourceKeys) assert.equal(h.dom.window.localStorage.getItem(key), h.before[key], "boot must not assign a category or write state");
    assert.equal(h.document.querySelector("#muCategory").value, family);
    for (const number of [1, 2, 3, 4, 5]) {
      h.document.querySelector(`[data-mmd-visual-frame="${number}"]`).click();
      for (const state of Object.values(statesOf(h))) {
        const { visual_frame_number, visual_variant_number, visual_frame_version, ...rest } = state;
        assert.deepEqual(rest, original);
        assert.equal(visual_frame_number, number); assert.equal(visual_variant_number, number);
        assert.equal(visual_frame_version, "studio-clean-frames-v1");
      }
      assert.equal(h.document.querySelector("#muCategory").value, family);
      assert.equal(h.document.querySelector("#mmdSigilTemplate").value, template_id);
      assert.equal(h.document.querySelector("#mmdSigilCompcardPreview").dataset.frameAsset, String(number));
      assert.equal(h.document.querySelectorAll(".mmd-studio-frame-art").length, 1);
      const f = await start(final, statesOf(h), "model-preview");
      assert.equal(f.document.querySelector("#mmdSigilCompcardFinal").dataset.frameAsset, String(number));
      assert.equal(f.document.querySelector(".mmd-studio-frame-name").textContent, original.model_name);
      for (const key of sourceKeys) assert.equal(f.dom.window.localStorage.getItem(key), f.before[key], "Final Preview is read-only");
      assert.equal(f.document.querySelectorAll("button,input,select,a").length, 0);
      assert.equal(f.writes(), 0); f.dom.window.close();
    }
    assert.equal(h.writes(), 0); h.dom.window.close();
  });
}

for (const [family, field, template_id, number] of [
  ["EMs", "EMs", "sigil-ems-aureate", 6], ["GWs", "GWs", "sigil-gws-nightwave", 7],
]) {
  test(`${field}: exact labeled/category asset survives Build → Review state → read-only Final Preview`, async () => {
    const original = { compcard_family: family, field, field_code: field, template_id, model_name: "TEST MODEL ID", height_cm: "178", weight_kg: "66", run_number: field + "007", visual_variant_number: 4, decision: "use_real_photo", studio_review_id: "review-fixture" };
    const h = await start(upload(family), original);
    assert.equal(h.document.querySelector("#mmdSigilCompcardPreview").dataset.frameAsset, String(number));
    h.document.querySelector('[data-mmd-visual-frame="3"]').click();
    for (const key of sourceKeys) assert.equal(h.dom.window.localStorage.getItem(key), h.before[key], "incompatible frame cannot change category or state");
    if (["EMs", "GWs"].includes(field)) {
      const run = h.document.querySelector("#muRun"); run.value = "42";
      run.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
      assert.equal(h.document.querySelector(".mmd-studio-frame-run").textContent, "042");
      assert.equal(statesOf(h).mmdStudioTemplateState.run_number, field + "042");
      assert.equal(h.document.querySelector(".mmd-studio-frame-name"), null, "baked exclusive label must not be duplicated");
    }
    h.document.querySelector("#muBuild").click();
    assert.equal(statesOf(h).mmdStudioUploadSeed.visual_frame_number, number);
    const f = await start(final, statesOf(h), "model-preview");
    assert.equal(f.document.querySelector("#mmdSigilCompcardFinal").dataset.frameAsset, String(number));
    for (const key of sourceKeys) assert.equal(f.dom.window.localStorage.getItem(key), f.before[key]);
    assert.equal(f.writes(), 0); f.dom.window.close(); h.dom.window.close();
  });
}

test("a reloaded Upload restores visual choice, and a changed source photo refreshes without persisting media", async () => {
  const state = { template_id: "sigil-gay-plum", compcard_family: "B", field: "GY", visual_variant_number: 5, visual_frame_number: 5 };
  const h = await start(upload("B"), state);
  const photo = h.document.querySelector("#muCardPhoto"); photo.style.backgroundImage = 'url("https://example.invalid/reviewed-photo.jpg")';
  await new Promise(resolve => h.dom.window.setTimeout(resolve, 0));
  assert.match(h.document.querySelector(".mmd-studio-frame-photo").style.backgroundImage, /reviewed-photo/);
  assert.equal(h.document.querySelector("#mmdSigilCompcardPreview").dataset.frameAsset, "5");
  for (const key of sourceKeys) assert.equal(h.dom.window.localStorage.getItem(key), h.before[key]);
  h.dom.window.close();
});

test("missing independent visual choice fails visibly instead of guessing a frame or category", async () => {
  const h = await start(upload(""), { compcard_family: "", field: "", template_id: "" });
  assert.match(h.document.querySelector("#mmdSigilCompcardPreview").textContent, /เลือกสีกรอบภาพ 1–5/);
  assert.equal(h.document.querySelector(".mmd-studio-frame-art"), null);
  assert.equal(h.document.querySelector("#muCategory").value, "");
  for (const key of sourceKeys) assert.equal(h.dom.window.localStorage.getItem(key), h.before[key]);
  h.dom.window.close();
});

test("release packaging refuses pending or superseded artwork and wrong palette order", () => {
  assert.throws(() => validateStudioFrameManifest({ ...release.manifest, release_ready: false }), /studio_frame_registry_not_ready/);
  const invalid = structuredClone(release.manifest); invalid.release_ready = true; invalid.assets[0].accent = "purple";
  assert.throws(() => validateStudioFrameManifest(invalid), /studio_frame_palette_not_ready/);
});
