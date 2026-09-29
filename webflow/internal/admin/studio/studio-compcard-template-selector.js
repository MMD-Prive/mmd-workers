/*
 * MMD Studio — Master Frame V2 card template selector
 * Presentation/local-draft only. It does not publish, upload, or grant access.
 */
(function () {
  "use strict";

  var ROOT_ID = "mmdStudioUploadR5";
  var FORM_ID = "muUploadForm";
  var TEMPLATE_STATE_KEY = "mmdStudioTemplateState";
  var UPLOAD_SEED_KEY = "mmdStudioUploadSeed";
  var STYLE_ID = "mmd-sigil-compcard-template-css";
  var PICKER_ID = "mmdSigilCompcardPicker";
  var CARD_ID = "mmdSigilCompcardPreview";

  var TEMPLATES = [
    {
      id: "sigil-ems-aureate",
      uiFamily: "EMs",
      field: "EMs",
      label: "EMs",
      title: "Master Frame V2 · EMs",
      kind: "exclusive",
      accent: "#d3b45c",
      accentSoft: "rgba(211,180,92,.22)",
      needsRun: true,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "run",
      note: "RUN NUMBER · HEIGHT / WEIGHT"
    },
    {
      id: "sigil-gws-nightwave",
      uiFamily: "GWs",
      field: "GWs",
      label: "GWs",
      title: "Master Frame V2 · GWs",
      kind: "exclusive",
      accent: "#36c4c7",
      accentSoft: "rgba(54,196,199,.20)",
      needsRun: true,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "run",
      note: "RUN NUMBER · HEIGHT / WEIGHT"
    },
    {
      id: "sigil-straight-bronze",
      uiFamily: "A",
      field: "ST",
      label: "Straight",
      title: "Master Frame V2 · Silver",
      kind: "standard",
      accent: "#a7adb4",
      accentSoft: "rgba(167,173,180,.20)",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "name",
      note: "MODEL NAME · HEIGHT / WEIGHT"
    },
    {
      id: "sigil-gay-plum",
      uiFamily: "B",
      field: "GY",
      label: "Gay",
      title: "Master Frame V2 · Rose",
      kind: "standard",
      accent: "#d96aa8",
      accentSoft: "rgba(217,106,168,.20)",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "name",
      note: "MODEL NAME · HEIGHT / WEIGHT"
    },
    {
      id: "sigil-foreigner-emerald",
      uiFamily: "E",
      field: "FR",
      label: "Foreigner",
      title: "Master Frame V2 · Emerald",
      kind: "standard",
      accent: "#45bd7a",
      accentSoft: "rgba(69,189,122,.20)",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "name",
      note: "MODEL NAME · HEIGHT / WEIGHT"
    },
    {
      id: "mmd-prive-travel",
      uiFamily: "C",
      field: "EN",
      label: "Travel",
      title: "MMD PRIVÉ · Blue Edge",
      kind: "public",
      accent: "#4aa9d8",
      accentSoft: "rgba(74,169,216,.18)",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: true,
      identity: "name",
      note: "BLUE EDGE CUE · NO TRAVEL LABEL"
    },
    {
      id: "mmd-prive-extreme",
      uiFamily: "D",
      field: "EX",
      label: "Extreme",
      title: "MMD PRIVÉ · Red Edge",
      kind: "public",
      accent: "#d83a48",
      accentSoft: "rgba(216,58,72,.18)",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: true,
      identity: "name",
      note: "RED EDGE CUE · NO EXTREME LABEL"
    }
  ];

  function boot() {
    if (document.getElementById(PICKER_ID)) return;
    var root = document.getElementById(ROOT_ID);
    var form = document.getElementById(FORM_ID);
    if (!root || !form) return;

    installStyles();
    addFields(form);
    var picker = buildPicker();
    var grid = root.querySelector(".mu-grid");
    if (grid && grid.parentNode) grid.parentNode.insertBefore(picker, grid);

    var state = readState(TEMPLATE_STATE_KEY) || readState(UPLOAD_SEED_KEY) || {};
    var initial = findTemplate(state.template_id) || findByFamily(state.field_code || state.field || state.compcard_family) || TEMPLATES[2];
    wire(initial);
  }

  function wire(initial) {
    var root = document.getElementById(ROOT_ID);
    var model = byId("muModel");
    var run = byId("muRun");
    var height = byId("mmdSigilHeight");
    var weight = byId("mmdSigilWeight");
    var title = byId("mmdSigilTitle");
    var direction = byId("muDirection");
    var category = byId("muCategory");
    var selected = initial;
    var scheduled = 0;

    function currentValues() {
      return {
        model: valueOf(model),
        run: valueOf(run),
        height: valueOf(height),
        weight: valueOf(weight),
        title: valueOf(title),
        direction: valueOf(direction)
      };
    }

    function refresh() {
      renderPreview(selected, currentValues());
      persist(selected, currentValues());
    }

    function schedule() {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(refresh, 40);
    }

    function select(template) {
      selected = template;
      applyTemplate(template, category, model, run, height, weight, title);
      markSelected(template.id);
      window.setTimeout(refresh, 0);
    }

    root.querySelectorAll("[data-mmd-sigil-template]").forEach(function (button) {
      button.addEventListener("click", function () {
        var template = findTemplate(button.getAttribute("data-mmd-sigil-template"));
        if (template) select(template);
      });
    });

    [model, run, height, weight, title, direction, category].filter(Boolean).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", function () {
        var matched = findByFamily(valueOf(category));
        if (matched && matched.id !== selected.id) selected = matched;
        markSelected(selected.id);
        schedule();
      });
    });

    [byId("muBuild"), byId("muSendReview")].filter(Boolean).forEach(function (button) {
      button.addEventListener("click", function () { window.setTimeout(refresh, 160); }, true);
    });

    select(initial);
  }

  function addFields(form) {
    if (byId("mmdSigilHeight")) return;
    var anchor = byId("muRun");
    var host = anchor && anchor.closest ? anchor.closest(".mu-field") : null;
    if (!host || !host.parentNode) return;
    var group = host.parentNode;
    group.appendChild(makeField("mmdSigilHeight", "Height (CM)", "number", "e.g. 180"));
    group.appendChild(makeField("mmdSigilWeight", "Weight (KG)", "number", "e.g. 72"));
    var titleField = makeField("mmdSigilTitle", "Title Bar (1–2 lines)", "text", "ข้อความสั้นสำหรับ EMs / GWs");
    titleField.classList.add("mmd-sigil-title-field");
    group.appendChild(titleField);
    var input = document.createElement("input");
    input.type = "hidden";
    input.id = "mmdSigilTemplate";
    input.name = "template_id";
    form.appendChild(input);
  }

  function makeField(id, label, type, placeholder) {
    var container = document.createElement("label");
    container.className = "mu-field mmd-sigil-extra";
    var caption = document.createElement("span");
    caption.textContent = label;
    var input = document.createElement("input");
    input.id = id;
    input.name = id === "mmdSigilTitle" ? "presentation_title" : id === "mmdSigilHeight" ? "height_cm" : "weight_kg";
    input.type = type;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    if (type === "number") {
      input.min = "1";
      input.max = "999";
      input.inputMode = "numeric";
    }
    container.appendChild(caption);
    container.appendChild(input);
    return container;
  }

  function buildPicker() {
    var section = document.createElement("section");
    section.id = PICKER_ID;
    section.className = "mmd-sigil-picker";
    var heading = document.createElement("div");
    heading.className = "mmd-sigil-picker-head";
    var eyebrow = document.createElement("span");
    eyebrow.textContent = "MMD STUDIO / MASTER FRAME V2";
    var title = document.createElement("h2");
    title.textContent = "เลือกกรอบใหม่ก่อน Build Draft";
    var copy = document.createElement("p");
    copy.textContent = "กรอบหลักเป็น metallic silver / graphite เหมือนกันทุกกลุ่ม ใช้ accent เล็ก ๆ บอก category โดยไม่พิมพ์ role หรือชื่อกลุ่มบนการ์ด; Travel = ฟ้า, Extreme = แดง.";
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    heading.appendChild(copy);
    var grid = document.createElement("div");
    grid.className = "mmd-sigil-template-grid";
    TEMPLATES.forEach(function (template) { grid.appendChild(buildTile(template)); });
    section.appendChild(heading);
    section.appendChild(grid);
    return section;
  }

  function buildTile(template) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "mmd-sigil-template-tile mmd-sigil-kind-" + template.kind + " mmd-sigil-tile-" + template.field.toLowerCase();
    button.setAttribute("data-mmd-sigil-template", template.id);
    button.style.setProperty("--sigil-accent", template.accent);
    button.style.setProperty("--sigil-accent-soft", template.accentSoft);
    var art = document.createElement("span");
    art.className = "mmd-sigil-tile-art";
    var cut = document.createElement("span");
    cut.className = "mmd-sigil-tile-cut";
    var mark = document.createElement("span");
    mark.className = "mmd-sigil-tile-mark";
    mark.textContent = template.field;
    art.appendChild(cut);
    art.appendChild(mark);
    var text = document.createElement("span");
    text.className = "mmd-sigil-tile-copy";
    var label = document.createElement("b");
    label.textContent = template.label;
    var small = document.createElement("small");
    small.textContent = template.title;
    var note = document.createElement("em");
    note.textContent = template.note;
    text.appendChild(label);
    text.appendChild(small);
    text.appendChild(note);
    button.appendChild(art);
    button.appendChild(text);
    return button;
  }

  function applyTemplate(template, category, model, run, height, weight, title) {
    var hidden = byId("mmdSigilTemplate");
    if (hidden) hidden.value = template.id;
    selectValue(category, [template.uiFamily, template.field], template.uiFamily);
    setVisible(byId("muRun") && byId("muRun").closest(".mu-field"), template.needsRun);
    setVisible(height && height.closest(".mu-field"), template.needsMetrics);
    setVisible(weight && weight.closest(".mu-field"), template.needsMetrics);
    setVisible(title && title.closest(".mu-field"), template.needsTitle);
    if (run) {
      run.required = template.needsRun;
      run.placeholder = template.needsRun ? "001" : "";
      if (!template.needsRun) run.value = "";
    }
    if (height) height.required = template.needsMetrics;
    if (weight) weight.required = template.needsMetrics;
    if (title) {
      title.required = template.needsTitle;
      if (!template.needsTitle) title.value = "";
    }
    if (model) {
      model.readOnly = false;
      model.removeAttribute("aria-label");
      if (model.value === "MMD PRIVÉ") model.value = "";
      model.placeholder = "Model name";
    }
    if (category) dispatch(category, "change");
  }

  function renderPreview(template, values) {
    renderCard(byId("muCard"), byId("muCardPhoto"), template, values, CARD_ID);
  }

  function renderCard(host, source, template, values, cardId) {
    if (!host) return;
    var old = byId(cardId);
    if (!old) {
      old = document.createElement("div");
      old.id = cardId;
      host.appendChild(old);
    }
    old.className = "mmd-sigil-card mmd-sigil-card-" + template.field.toLowerCase() + " mmd-sigil-card-" + template.kind;
    old.style.setProperty("--sigil-accent", template.accent);
    old.style.setProperty("--sigil-accent-soft", template.accentSoft);
    old.setAttribute("data-master-frame", "mmd-v2");
    old.replaceChildren();

    var photoStyle = source ? window.getComputedStyle(source).backgroundImage : "";
    var photo = document.createElement("div");
    photo.className = "mmd-sigil-card-photo";
    if (photoStyle && photoStyle !== "none") photo.style.backgroundImage = photoStyle;

    var shade = document.createElement("div");
    shade.className = "mmd-sigil-card-shade";
    var frameOuter = document.createElement("div");
    frameOuter.className = "mmd-sigil-card-frame-outer";
    var frameInner = document.createElement("div");
    frameInner.className = "mmd-sigil-card-frame-inner";
    var accent = document.createElement("div");
    accent.className = "mmd-sigil-card-accent";

    var panel = document.createElement("div");
    panel.className = "mmd-sigil-card-panel";
    var identity = document.createElement("strong");
    identity.className = "mmd-sigil-card-identity";
    identity.textContent = identityText(template, values);
    panel.appendChild(identity);

    if (template.needsMetrics) {
      var metrics = document.createElement("div");
      metrics.className = "mmd-sigil-card-metrics";
      metrics.appendChild(metric("", values.height || "—", ""));
      metrics.appendChild(metric("", values.weight || "—", ""));
      panel.appendChild(metrics);
    }

    var brand = document.createElement("span");
    brand.className = "mmd-sigil-card-brand";
    brand.textContent = template.publicCollection ? "MMD PRIVÉ" : "SĪGIL";

    old.appendChild(photo);
    old.appendChild(shade);
    old.appendChild(frameOuter);
    old.appendChild(frameInner);
    old.appendChild(accent);
    old.appendChild(panel);
    old.appendChild(brand);
  }

  function bootFinalPreview() {
    var root = byId("mmdModelPreview");
    var host = byId("mpCard");
    if (!root || !host || byId("mmdSigilCompcardFinal")) return;
    installStyles();
    var state = readState(TEMPLATE_STATE_KEY) || readState(UPLOAD_SEED_KEY) || {};
    var template = findTemplate(state.template_id) || findByFamily(state.field_code || state.field || state.compcard_family);
    if (!template) return;
    renderCard(host, byId("mpCardPhoto"), template, {
      model: state.model_name || "",
      run: state.run_number || "",
      height: state.height_cm || "",
      weight: state.weight_kg || "",
      title: state.presentation_title || state.compcard_title || "",
      direction: state.direction || ""
    }, "mmdSigilCompcardFinal");
  }

  function metric(label, value, unit) {
    var item = document.createElement("span");
    var small = document.createElement("small");
    small.textContent = label;
    var number = document.createElement("b");
    number.textContent = value;
    var suffix = document.createElement("em");
    suffix.textContent = unit;
    item.appendChild(small);
    item.appendChild(number);
    item.appendChild(suffix);
    return item;
  }

  function identityText(template, values) {
    if (template.needsRun) {
      var digits = String(values.run || "").replace(/\D/g, "").slice(-3);
      return template.field + (digits ? digits.padStart(3, "0") : "000");
    }
    return values.model || "MODEL NAME";
  }

  function persist(template, values) {
    var state = Object.assign({}, readState(UPLOAD_SEED_KEY) || {}, {
      template_id: template.id,
      template_title: template.title,
      template_version: template.publicCollection ? "mmd-prive-compcard-v1" : "sigil-compcard-v1",
      compcard_family: template.uiFamily,
      field: template.field,
      field_code: template.field,
      layer: template.publicCollection ? "Public / MMD Privé" : "Private / SIGIL",
      model_name: template.publicCollection ? "MMD PRIVÉ" : values.model,
      run_number: canonicalRun(template, values.run),
      height_cm: template.needsMetrics ? values.height : "",
      weight_kg: template.needsMetrics ? values.weight : "",
      presentation_title: template.needsTitle ? values.title : "",
      compcard_title: template.needsTitle ? values.title : "",
      direction: values.direction || "",
      output_kind: template.publicCollection ? "mmd_prive_collection" : "model_compcard"
    });
    writeState(TEMPLATE_STATE_KEY, state);
    writeState(UPLOAD_SEED_KEY, state);
    exposeFamily(template.uiFamily);
  }

  function canonicalRun(template, value) {
    if (!template.needsRun) return "";
    var digits = String(value || "").replace(/\D/g, "").slice(-3);
    return digits ? template.field + digits.padStart(3, "0") : "";
  }

  function exposeFamily(value) {
    try {
      if (window.MMDCompcardFamily && typeof window.MMDCompcardFamily.set === "function") {
        window.MMDCompcardFamily.set(value);
        return;
      }
      window.MMDCompcardFamily = window.MMDCompcardFamily || {};
      window.MMDCompcardFamily.get = function () { return value; };
    } catch (_) {}
  }

  function markSelected(id) {
    document.querySelectorAll("[data-mmd-sigil-template]").forEach(function (button) {
      var selected = button.getAttribute("data-mmd-sigil-template") === id;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("mmd-sigil-hidden", !visible);
  }

  function selectValue(select, candidates, fallback) {
    if (!select) return;
    var options = Array.prototype.slice.call(select.options || []);
    var candidate = candidates.find(function (raw) {
      return options.some(function (option) { return option.value === raw || option.textContent.trim() === raw; });
    });
    if (!candidate) {
      var option = document.createElement("option");
      option.value = fallback;
      option.textContent = fallback;
      select.appendChild(option);
      candidate = fallback;
    }
    select.value = candidate;
  }

  function dispatch(element, type) {
    try { element.dispatchEvent(new Event(type, { bubbles: true })); } catch (_) {}
  }

  function findTemplate(id) {
    var legacyId = id === "sigil-travel-prive" ? "mmd-prive-travel" : id === "sigil-extreme-prive" ? "mmd-prive-extreme" : id;
    return TEMPLATES.find(function (template) { return template.id === legacyId; }) || null;
  }

  function findByFamily(value) {
    var clean = String(value || "").trim();
    return TEMPLATES.find(function (template) { return template.uiFamily === clean || template.field === clean; }) || null;
  }

  function valueOf(input) { return input ? String(input.value || "").trim() : ""; }
  function byId(id) { return document.getElementById(id); }

  function readState(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function writeState(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function installStyles() {
    if (byId(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "#" + PICKER_ID + "{margin:16px 0;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:18px;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(7,7,8,.9));box-shadow:0 20px 56px rgba(0,0,0,.26)}#" + PICKER_ID + " *{box-sizing:border-box;font-family:inherit}.mmd-sigil-picker-head{display:grid;gap:7px;margin-bottom:14px}.mmd-sigil-picker-head>span{color:#d8b96c;font-size:9px;letter-spacing:.16em}.mmd-sigil-picker-head h2{margin:0;color:#f7f0e4;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(27px,3vw,38px);font-weight:500;letter-spacing:-.045em}.mmd-sigil-picker-head p{max-width:820px;margin:0;color:rgba(247,240,228,.66);font-size:12px;line-height:1.6}.mmd-sigil-template-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.mmd-sigil-template-tile{--sigil-accent:#a7adb4;appearance:none;min-height:176px;padding:0;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:#0b0c0d;color:#f7f0e4;text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.mmd-sigil-template-tile:hover{transform:translateY(-2px);border-color:rgba(230,233,236,.46)}.mmd-sigil-template-tile.is-selected{border-color:rgba(235,238,240,.76);box-shadow:inset 0 0 0 1px rgba(50,53,57,.9),0 15px 34px rgba(0,0,0,.32)}.mmd-sigil-tile-art{position:relative;display:block;height:84px;margin:9px;border:2px solid rgba(230,233,236,.72);box-shadow:0 0 0 1px rgba(55,58,62,.9),inset 0 0 0 8px rgba(20,21,22,.65);background:linear-gradient(145deg,#34373a,#0a0b0c 72%)}.mmd-sigil-tile-art:before{content:\"\";position:absolute;left:9px;top:12px;width:5px;height:38px;border:0;background:var(--sigil-accent);box-shadow:0 0 12px var(--sigil-accent);transform:none}.mmd-sigil-tile-art:after{display:none}.mmd-sigil-tile-cut{display:none}.mmd-sigil-tile-mark{position:absolute;left:20px;bottom:12px;color:rgba(247,240,228,.72);font-size:9px;font-weight:800;letter-spacing:.12em;line-height:1}.mmd-sigil-kind-public .mmd-sigil-tile-art{background:linear-gradient(145deg,#f3f2ee,#b6b8ba 72%)}.mmd-sigil-kind-public .mmd-sigil-tile-mark{color:#26282b}.mmd-sigil-tile-copy{display:grid;gap:4px;padding:6px 12px 12px}.mmd-sigil-tile-copy b{font-size:13px;line-height:1.15}.mmd-sigil-tile-copy small{color:rgba(247,240,228,.61);font-size:9px;line-height:1.25}.mmd-sigil-tile-copy em{color:var(--sigil-accent);font-size:7px;font-style:normal;letter-spacing:.07em;line-height:1.35}.mmd-sigil-extra{display:block}.mmd-sigil-title-field{grid-column:span 2}.mmd-sigil-hidden{display:none!important}#muCard{isolation:isolate}.mmd-sigil-card{position:absolute;z-index:9;inset:0;overflow:hidden;border-radius:inherit;background:#0c0d0e;color:#f4f0e8;--sigil-accent:#a7adb4;--sigil-accent-soft:rgba(167,173,180,.2)}.mmd-sigil-card-photo{position:absolute;inset:0;background:radial-gradient(circle at 54% 28%,rgba(255,255,255,.13),transparent 42%),linear-gradient(155deg,#3a342d,#101010 66%);background-size:cover;background-position:center 22%;filter:brightness(.9) contrast(1.03) saturate(.94)}.mmd-sigil-card-shade{position:absolute;inset:0;background:linear-gradient(90deg,transparent 48%,rgba(13,14,16,.12) 60%,rgba(13,14,16,.88) 100%)}.mmd-sigil-card-frame-outer,.mmd-sigil-card-frame-inner{position:absolute;pointer-events:none}.mmd-sigil-card-frame-outer{inset:15px;border:2px solid rgba(238,241,243,.76);box-shadow:0 0 0 1px rgba(58,61,65,.9),inset 0 0 0 1px rgba(255,255,255,.12)}.mmd-sigil-card-frame-inner{inset:23px;border:1px solid rgba(70,73,77,.85)}.mmd-sigil-card-accent{position:absolute;left:23px;top:38px;width:7px;height:66px;background:var(--sigil-accent);box-shadow:0 0 15px var(--sigil-accent)}.mmd-sigil-kind-exclusive .mmd-sigil-card-accent{width:9px;height:96px}.mmd-sigil-card-panel{position:absolute;right:36px;top:44px;width:43%;display:flex;flex-direction:column;align-items:flex-end;gap:18px;text-align:right}.mmd-sigil-card-identity{max-width:100%;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(38px,5.2vw,74px);font-weight:500;line-height:.92;letter-spacing:-.055em;overflow-wrap:anywhere}.mmd-sigil-card-metrics{display:flex;justify-content:flex-end;gap:18px;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(31px,4vw,58px);font-variant-numeric:tabular-nums}.mmd-sigil-card-metrics>span{display:flex;align-items:baseline}.mmd-sigil-card-metrics small,.mmd-sigil-card-metrics em{display:none}.mmd-sigil-card-brand{position:absolute;right:36px;bottom:32px;color:rgba(247,240,228,.76);font-size:9px;font-weight:800;letter-spacing:.17em}.mmd-sigil-card-public{color:#222428;background:#f2f1ed}.mmd-sigil-card-public .mmd-sigil-card-photo{filter:brightness(.96) contrast(1.01) saturate(.94)}.mmd-sigil-card-public .mmd-sigil-card-shade{background:linear-gradient(90deg,transparent 48%,rgba(246,245,239,.10) 60%,rgba(246,245,239,.9) 100%)}.mmd-sigil-card-public .mmd-sigil-card-frame-outer{border-color:rgba(255,255,255,.85);box-shadow:0 0 0 1px rgba(52,55,59,.78)}.mmd-sigil-card-public .mmd-sigil-card-frame-inner{border-color:rgba(72,75,79,.68)}.mmd-sigil-card-public .mmd-sigil-card-brand{color:rgba(31,33,36,.76)}@media(max-width:1100px){.mmd-sigil-template-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:720px){#" + PICKER_ID + "{padding:15px}.mmd-sigil-template-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mmd-sigil-template-tile{min-height:154px}.mmd-sigil-tile-art{height:66px}.mmd-sigil-card-panel{right:26px;top:34px;width:52%}.mmd-sigil-card-identity{font-size:38px}.mmd-sigil-card-metrics{font-size:31px}.mmd-sigil-title-field{grid-column:span 1}}";
    document.head.appendChild(style);
  }

  function bootAll() {
    boot();
    bootFinalPreview();
  }

  if (document.readyState === "complete") window.setTimeout(bootAll, 0);
  else window.addEventListener("load", bootAll, { once: true });
})();
