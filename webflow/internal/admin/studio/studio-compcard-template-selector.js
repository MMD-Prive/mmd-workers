/* MMD Studio — Master Frame V2. Local presentation only; no publication authority. */
(function () {
  "use strict";
  var ROOT_ID = "mmdStudioUploadR5";
  var PICKER_ID = "mmdSigilCompcardPicker";
  var CARD_ID = "mmdSigilCompcardPreview";
  var TEMPLATE_STATE_KEY = "mmdStudioTemplateState";
  var UPLOAD_SEED_KEY = "mmdStudioUploadSeed";
  // These are category identities, not visual variant identities. Keep stable.
  var TEMPLATES = [
    { id: "sigil-ems-aureate", uiFamily: "EMs", field: "EMs", needsRun: true },
    { id: "sigil-gws-nightwave", uiFamily: "GWs", field: "GWs", needsRun: true },
    { id: "sigil-straight-bronze", uiFamily: "A", field: "ST" },
    { id: "sigil-gay-plum", uiFamily: "B", field: "GY" },
    { id: "sigil-foreigner-emerald", uiFamily: "E", field: "FR" },
    { id: "mmd-prive-travel", uiFamily: "C", field: "EN", publicCollection: true },
    { id: "mmd-prive-extreme", uiFamily: "D", field: "EX", publicCollection: true }
  ];
  var assets = window.MMDStudioFrameAssets || [];
  function variant(value) { return [1, 2, 3, 4, 5].indexOf(Number(value)) >= 0 ? Number(value) : null; }
  function fixedFrame(template) { return template ? ({ EMs: 6, GWs: 7 })[template.field] || null : null; }
  function frameFor(template, choice) {
    var number = fixedFrame(template) || variant(choice);
    return assets.find(function (asset) { return asset.number === number; }) || null;
  }
  function byId(id) { return document.getElementById(id); }
  function valueOf(input) { return input ? String(input.value || "").trim() : ""; }
  function findTemplate(id) {
    var legacy = id === "sigil-travel-prive" ? "mmd-prive-travel" : id === "sigil-extreme-prive" ? "mmd-prive-extreme" : id;
    return TEMPLATES.find(function (template) { return template.id === legacy; }) || null;
  }
  function findByFamily(value) {
    return TEMPLATES.find(function (template) { return template.uiFamily === value || template.field === value; }) || null;
  }
  function readState(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function writeState(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function updateState(patch) {
    [TEMPLATE_STATE_KEY, UPLOAD_SEED_KEY].forEach(function (key) {
      writeState(key, Object.assign({}, readState(UPLOAD_SEED_KEY) || {}, readState(key) || {}, patch));
    });
  }
  function makeField(id, label, type) {
    var field = document.createElement("label"); field.className = "mu-field";
    var caption = document.createElement("span"); caption.textContent = label;
    var input = document.createElement("input"); input.id = id; input.type = type;
    input.name = id === "mmdSigilHeight" ? "height_cm" : "weight_kg";
    input.min = "1"; input.max = "999"; input.inputMode = "numeric";
    field.append(caption, input); return field;
  }
  function addFields(form) {
    var run = byId("muRun"); var host = run && run.closest(".mu-field");
    if (host && host.parentNode) {
      if (!byId("mmdSigilHeight")) host.parentNode.appendChild(makeField("mmdSigilHeight", "Height (CM)", "number"));
      if (!byId("mmdSigilWeight")) host.parentNode.appendChild(makeField("mmdSigilWeight", "Weight (KG)", "number"));
    }
    if (!byId("mmdSigilTemplate")) {
      var hidden = document.createElement("input"); hidden.type = "hidden";
      hidden.id = "mmdSigilTemplate"; hidden.name = "template_id"; form.appendChild(hidden);
    }
  }
  function buildPicker() {
    var section = document.createElement("section"); section.id = PICKER_ID;
    var heading = document.createElement("h2"); heading.textContent = "MASTER FRAME V2 · เลือกกรอบภาพ";
    var copy = document.createElement("p");
    copy.textContent = "ใช้ชื่อ Model ID จริงจาก working_name บนการ์ด · กรอบ 1–5 เป็นตัวเลือกสีอิสระ ไม่เปลี่ยน Family หรือประเภทนายแบบ · EMs ใช้กรอบ 6 และ GWs ใช้กรอบ 7 ตาม Family ที่มีอยู่";
    var grid = document.createElement("div"); grid.className = "mmd-studio-frame-grid";
    assets.forEach(function (asset) {
      var button = document.createElement("button"); button.type = "button";
      button.setAttribute("data-mmd-visual-frame", String(asset.number));
      var image = document.createElement("img"); image.src = asset.url; image.alt = "";
      var label = document.createElement("span");
      label.textContent = "กรอบ " + asset.number + " · " + asset.accent + (asset.field ? " · " + asset.field : "");
      button.append(image, label); grid.appendChild(button);
    });
    var status = document.createElement("p"); status.id = "mmdStudioFrameStatus"; status.setAttribute("role", "status");
    section.append(heading, copy, grid, status); return section;
  }
  function configureFields(template) {
    var hidden = byId("mmdSigilTemplate"); if (hidden) hidden.value = template ? template.id : "";
    var run = byId("muRun");
    if (run) {
      run.required = !!(template && template.needsRun);
      if (run.closest(".mu-field")) run.closest(".mu-field").classList.toggle("mmd-sigil-hidden", !run.required);
    }
    var title = byId("mmdSigilTitle");
    if (title && title.closest(".mu-field")) title.closest(".mu-field").classList.add("mmd-sigil-hidden");
  }
  function renderCard(host, source, frame, values, cardId) {
    if (!host) return;
    host.style.position = "relative"; host.style.aspectRatio = "1316 / 1195"; host.style.height = "auto";
    var card = byId(cardId);
    if (!card) { card = document.createElement("div"); card.id = cardId; host.appendChild(card); }
    card.style.position = "absolute"; card.style.inset = "0"; card.style.zIndex = "9";
    card.setAttribute("data-master-frame", "mmd-v2");
    if (!frame || !window.MMDStudioCleanFrame) {
      card.className = "mmd-studio-frame-empty"; card.replaceChildren();
      card.textContent = frame ? "ไม่สามารถโหลดตัวแสดงกรอบภาพได้" : "เลือกสีกรอบภาพ 1–5 ก่อนตรวจร่าง";
      return;
    }
    var photoStyle = source ? window.getComputedStyle(source).backgroundImage : "";
    window.MMDStudioCleanFrame.render(card, frame, photoStyle, values);
  }
  function boot() {
    var root = byId(ROOT_ID), form = byId("muUploadForm");
    if (!root || !form || byId(PICKER_ID)) return;
    installStyles(); addFields(form);
    var picker = buildPicker(); var grid = root.querySelector(".mu-grid");
    if (grid && grid.parentNode) grid.parentNode.insertBefore(picker, grid); else form.prepend(picker);
    var category = byId("muCategory");
    var saved = readState(TEMPLATE_STATE_KEY) || readState(UPLOAD_SEED_KEY) || {};
    var choice = variant(saved.visual_variant_number) || variant(saved.visual_frame_number);
    function template() { return category ? findByFamily(valueOf(category)) : findTemplate(saved.template_id); }
    function values() { return { model: valueOf(byId("muModel")), run: valueOf(byId("muRun")), height: valueOf(byId("mmdSigilHeight")), weight: valueOf(byId("mmdSigilWeight")) }; }
    function refresh() {
      var current = template(), frame = frameFor(current, choice), fixed = fixedFrame(current);
      configureFields(current);
      picker.querySelectorAll("[data-mmd-visual-frame]").forEach(function (button) {
        var number = Number(button.getAttribute("data-mmd-visual-frame"));
        button.disabled = fixed ? number !== fixed : !variant(number);
        button.setAttribute("aria-pressed", frame && frame.number === number ? "true" : "false");
      });
      byId("mmdStudioFrameStatus").textContent = fixed ? "กรอบตรงกับ Family ที่เลือกไว้ · ไม่เปลี่ยนประเภทนายแบบ" : "กรอบ 1–5 เปลี่ยนเฉพาะสีภาพ · Family คงเดิม";
      renderCard(byId("muCard"), byId("muCardPhoto"), frame, values(), CARD_ID);
    }
    function persistVisual() {
      var frame = frameFor(template(), choice);
      updateState({ visual_variant_number: choice, visual_frame_number: frame ? frame.number : null, visual_frame_version: "studio-clean-frames-v1" });
    }
    function persistValues() {
      var current = template(), v = values();
      var digits = v.run.replace(/\D/g, "").slice(-3);
      updateState({ model_name: v.model, height_cm: v.height, weight_kg: v.weight, direction: valueOf(byId("muDirection")), run_number: current && current.needsRun && digits ? current.field + digits.padStart(3, "0") : "" });
    }
    picker.querySelectorAll("[data-mmd-visual-frame]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.disabled) return;
        var number = Number(button.getAttribute("data-mmd-visual-frame"));
        if (variant(number)) choice = number;
        // A visual click writes only visual keys: never category, template ID or family.
        persistVisual(); refresh();
      });
    });
    ["muModel", "muRun", "mmdSigilHeight", "mmdSigilWeight", "muDirection"].forEach(function (id) {
      var input = byId(id); if (!input) return;
      input.addEventListener("input", function () {
        persistValues(); refresh();
      });
    });
    if (category) category.addEventListener("change", function () {
      var current = template();
      updateState({ template_id: current ? current.id : "", template_version: "mmd-master-frame-v2", compcard_family: valueOf(category), field: current ? current.field : "", field_code: current ? current.field : "", layer: current ? (current.publicCollection ? "Public / MMD Privé" : "Private / SIGIL") : "", output_kind: current && current.publicCollection ? "mmd_prive_collection" : "model_compcard" });
      persistVisual(); refresh();
    });
    ["muBuild", "muSendReview"].forEach(function (id) {
      var button = byId(id); if (button) button.addEventListener("click", function () { persistValues(); persistVisual(); window.setTimeout(refresh, 160); }, true);
    });
    var source = byId("muCardPhoto");
    if (source) new MutationObserver(refresh).observe(source, { attributes: true, attributeFilter: ["style"] });
    refresh();
  }
  function bootFinalPreview() {
    if (!byId("mmdModelPreview") || !byId("mpCard") || byId("mmdSigilCompcardFinal")) return;
    installStyles();
    var state = readState(TEMPLATE_STATE_KEY) || readState(UPLOAD_SEED_KEY) || {};
    var template = findTemplate(state.template_id) || findByFamily(state.field_code || state.field || state.compcard_family);
    var frame = frameFor(template, variant(state.visual_variant_number) || variant(state.visual_frame_number));
    renderCard(byId("mpCard"), byId("mpCardPhoto"), frame, { model: state.model_name || "", run: state.run_number || "", height: state.height_cm || "", weight: state.weight_kg || "" }, "mmdSigilCompcardFinal");
  }
  function installStyles() {
    if (byId("mmd-studio-visual-picker-css")) return;
    var style = document.createElement("style"); style.id = "mmd-studio-visual-picker-css";
    style.textContent = "#mmdSigilCompcardPicker{padding:18px;margin:16px 0;background:#111;border:1px solid #655139;border-radius:18px;color:#f7edda}#mmdSigilCompcardPicker h2{font:600 22px/1.3 system-ui;margin:0 0 10px}#mmdSigilCompcardPicker p{font:13px/1.6 system-ui;margin:10px 0}.mmd-studio-frame-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}.mmd-studio-frame-grid button{padding:5px;background:#171717;border:1px solid #777;border-radius:8px;color:#fff;font:12px/1.4 system-ui;cursor:pointer}.mmd-studio-frame-grid button[aria-pressed=true]{outline:2px solid #f3d192;outline-offset:2px}.mmd-studio-frame-grid button:disabled{opacity:.4;cursor:default}.mmd-studio-frame-grid img{display:block;width:100%;aspect-ratio:1316/1195;object-fit:contain}.mmd-studio-frame-grid span{display:block;padding:6px}.mmd-sigil-hidden{display:none!important}.mmd-studio-frame-empty{display:flex;align-items:center;justify-content:center;background:#111;color:#f7edda;padding:20px;font:16px/1.5 system-ui}@media(max-width:900px){.mmd-studio-frame-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:520px){.mmd-studio-frame-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}";
    document.head.appendChild(style);
  }
  function bootAll() { boot(); bootFinalPreview(); }
  if (document.readyState === "complete") window.setTimeout(bootAll, 0);
  else window.addEventListener("load", bootAll, { once: true });
})();
