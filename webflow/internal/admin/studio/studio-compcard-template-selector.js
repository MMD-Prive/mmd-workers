/*
 * MMD Studio — SIGIL Comp Card template selector
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
      title: "Aureate Vault",
      kind: "exclusive",
      accent: "#d7b05f",
      accentSoft: "rgba(215,176,95,.23)",
      line: "Actor / Artist · Private SIGIL",
      needsRun: true,
      needsMetrics: true,
      needsTitle: true,
      publicCollection: false,
      identity: "run",
      note: "RUN NUMBER · CM / KG · 2-line Title Bar"
    },
    {
      id: "sigil-gws-nightwave",
      uiFamily: "GWs",
      field: "GWs",
      label: "GWs",
      title: "Nightwave Dossier",
      kind: "exclusive",
      accent: "#1bb7b0",
      accentSoft: "rgba(27,183,176,.23)",
      line: "Exclusive Model · Private SIGIL",
      needsRun: true,
      needsMetrics: true,
      needsTitle: true,
      publicCollection: false,
      identity: "run",
      note: "RUN NUMBER · CM / KG · 2-line Title Bar"
    },
    {
      id: "sigil-straight-bronze",
      uiFamily: "A",
      field: "ST",
      label: "Straight",
      title: "Bronze Study",
      kind: "standard",
      accent: "#a77a4d",
      accentSoft: "rgba(167,122,77,.22)",
      line: "Private Model · SIGIL",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "name",
      note: "MODEL NAME · CM / KG"
    },
    {
      id: "sigil-gay-plum",
      uiFamily: "B",
      field: "GY",
      label: "Gay",
      title: "Plum Study",
      kind: "standard",
      accent: "#92557f",
      accentSoft: "rgba(146,85,127,.23)",
      line: "Private Model · SIGIL",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "name",
      note: "MODEL NAME · CM / KG"
    },
    {
      id: "sigil-foreigner-emerald",
      uiFamily: "E",
      field: "FR",
      label: "Foreigner",
      title: "Emerald Study",
      kind: "standard",
      accent: "#2d926b",
      accentSoft: "rgba(45,146,107,.23)",
      line: "Private Model · SIGIL",
      needsRun: false,
      needsMetrics: true,
      needsTitle: false,
      publicCollection: false,
      identity: "name",
      note: "MODEL NAME · CM / KG"
    },
    {
      id: "sigil-travel-prive",
      uiFamily: "C",
      field: "EN",
      label: "Travel",
      title: "MMD Privé Travel",
      kind: "public",
      accent: "#426fa9",
      accentSoft: "rgba(66,111,169,.24)",
      line: "MMD Privé · Public Collection",
      needsRun: false,
      needsMetrics: false,
      needsTitle: false,
      publicCollection: true,
      identity: "prive",
      collection: "TRAVEL MODELS",
      note: "MMD PRIVÉ · PUBLIC COLLECTION"
    },
    {
      id: "sigil-extreme-prive",
      uiFamily: "D",
      field: "EX",
      label: "Extreme",
      title: "MMD Privé Extreme",
      kind: "public",
      accent: "#b64c58",
      accentSoft: "rgba(182,76,88,.24)",
      line: "MMD Privé · Public Collection",
      needsRun: false,
      needsMetrics: false,
      needsTitle: false,
      publicCollection: true,
      identity: "prive",
      collection: "EXTREME MODELS",
      note: "MMD PRIVÉ · PUBLIC COLLECTION"
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
    eyebrow.textContent = "SIGIL COMP CARD / TEMPLATE PACK";
    var title = document.createElement("h2");
    title.textContent = "เลือก Template ก่อน Build Draft";
    var copy = document.createElement("p");
    copy.textContent = "EMs และ GWs เป็นรุ่น signature; ที่เหลือเป็นระบบเดียวกันด้วย accent color และ field rule ที่ถูกล็อกไว้.";
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
    if (title) title.required = template.needsTitle;
    if (template.publicCollection) {
      if (model) {
        model.value = "MMD PRIVÉ";
        model.readOnly = true;
        model.setAttribute("aria-label", "MMD Privé collection card");
      }
      if (height) height.value = "";
      if (weight) weight.value = "";
      if (title) title.value = "";
    } else if (model) {
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
    old.replaceChildren();

    var photoStyle = source ? window.getComputedStyle(source).backgroundImage : "";
    var photo = document.createElement("div");
    photo.className = "mmd-sigil-card-photo";
    if (photoStyle && photoStyle !== "none") photo.style.backgroundImage = photoStyle;
    var panel = document.createElement("div");
    panel.className = "mmd-sigil-card-panel";
    var kicker = document.createElement("span");
    kicker.className = "mmd-sigil-card-kicker";
    kicker.textContent = template.kind === "exclusive" ? "PRIVATE SIGIL / SIGNATURE" : template.kind === "public" ? "MMD PRIVÉ / PUBLIC COLLECTION" : "PRIVATE SIGIL / MODEL CARD";
    var identity = document.createElement("strong");
    identity.className = "mmd-sigil-card-identity";
    identity.textContent = identityText(template, values);
    var family = document.createElement("span");
    family.className = "mmd-sigil-card-family";
    family.textContent = template.kind === "public" ? template.collection : template.line;
    panel.appendChild(kicker);
    panel.appendChild(identity);
    panel.appendChild(family);
    if (template.needsMetrics) {
      var metrics = document.createElement("div");
      metrics.className = "mmd-sigil-card-metrics";
      metrics.appendChild(metric("HT", values.height || "—", "CM"));
      metrics.appendChild(metric("WT", values.weight || "—", "KG"));
      panel.appendChild(metrics);
    }
    if (template.needsTitle) {
      var bar = document.createElement("div");
      bar.className = "mmd-sigil-card-titlebar";
      bar.textContent = values.title || "ใส่ Title Bar 1–2 บรรทัดที่นี่";
      panel.appendChild(bar);
    }
    var seam = document.createElement("div");
    seam.className = "mmd-sigil-card-seam";
    old.appendChild(photo);
    old.appendChild(panel);
    old.appendChild(seam);
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
    if (template.publicCollection) return "MMD PRIVÉ";
    if (template.needsRun) {
      var digits = String(values.run || "").replace(/\D/g, "").slice(-3);
      return template.field + "-" + (digits ? digits.padStart(3, "0") : "000");
    }
    return values.model || "MODEL NAME";
  }

  function persist(template, values) {
    var state = Object.assign({}, readState(UPLOAD_SEED_KEY) || {}, {
      template_id: template.id,
      template_title: template.title,
      template_version: "sigil-compcard-v1",
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
    return TEMPLATES.find(function (template) { return template.id === id; }) || null;
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
    style.textContent = "#" + PICKER_ID + "{margin:16px 0;border:1px solid rgba(255,255,255,.12);border-radius:25px;padding:20px;background:linear-gradient(145deg,rgba(255,255,255,.04),rgba(8,7,6,.82));box-shadow:0 20px 56px rgba(0,0,0,.26)}#" + PICKER_ID + " *{box-sizing:border-box;font-family:inherit}.mmd-sigil-picker-head{display:grid;gap:7px;margin-bottom:15px}.mmd-sigil-picker-head>span{color:#d8b96c;font-size:9px;letter-spacing:.16em}.mmd-sigil-picker-head h2{margin:0;color:#f7f0e4;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(28px,3vw,39px);font-weight:500;letter-spacing:-.045em}.mmd-sigil-picker-head p{max-width:760px;margin:0;color:rgba(247,240,228,.64);font-size:12px;line-height:1.6}.mmd-sigil-template-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.mmd-sigil-template-tile{--sigil-accent:#d8b96c;appearance:none;min-height:190px;padding:0;overflow:hidden;border:1px solid rgba(255,255,255,.11);border-radius:17px;background:#0c0b0a;color:#f7f0e4;text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.mmd-sigil-template-tile:hover{transform:translateY(-2px);border-color:var(--sigil-accent);box-shadow:0 15px 34px rgba(0,0,0,.31)}.mmd-sigil-template-tile.is-selected{border-color:var(--sigil-accent);box-shadow:inset 0 0 0 1px var(--sigil-accent),0 15px 34px rgba(0,0,0,.32)}.mmd-sigil-tile-art{position:relative;display:block;height:92px;overflow:hidden;background:radial-gradient(circle at 28% 18%,var(--sigil-accent-soft),transparent 42%),linear-gradient(135deg,#22211e,#080807 66%)}.mmd-sigil-tile-art:before{content:\"\";position:absolute;left:-14%;top:-32%;width:76%;height:170%;border-right:2px solid var(--sigil-accent);border-radius:50%;opacity:.82;transform:skewX(-22deg)}.mmd-sigil-tile-art:after{content:\"\";position:absolute;right:12px;top:13px;width:25px;height:25px;border:1px solid var(--sigil-accent);transform:rotate(45deg);opacity:.88}.mmd-sigil-tile-cut{position:absolute;right:0;bottom:0;width:54%;height:54%;background:#0c0b0a;clip-path:polygon(44% 0,100% 0,100% 100%,0 100%)}.mmd-sigil-tile-mark{position:absolute;left:12px;bottom:10px;color:#f7f0e4;font-family:Georgia,\"Times New Roman\",serif;font-size:26px;letter-spacing:-.06em;line-height:1}.mmd-sigil-kind-exclusive .mmd-sigil-tile-art{background:linear-gradient(125deg,#2a271f,#060707 62%)}.mmd-sigil-tile-ems .mmd-sigil-tile-art:after{border-radius:50%;transform:none}.mmd-sigil-tile-gws .mmd-sigil-tile-art:before{border-right-width:4px;filter:drop-shadow(0 0 7px var(--sigil-accent))}.mmd-sigil-kind-public .mmd-sigil-tile-art{background:linear-gradient(145deg,#18191c,#070707 70%)}.mmd-sigil-tile-copy{display:grid;gap:4px;padding:12px}.mmd-sigil-tile-copy b{font-size:13px;line-height:1.15}.mmd-sigil-tile-copy small{color:rgba(247,240,228,.6);font-size:9px;line-height:1.25}.mmd-sigil-tile-copy em{color:var(--sigil-accent);font-size:7px;font-style:normal;letter-spacing:.08em;line-height:1.35}.mmd-sigil-extra{display:block}.mmd-sigil-title-field{grid-column:span 2}.mmd-sigil-hidden{display:none!important}#muCard{isolation:isolate}.mmd-sigil-card{position:absolute;z-index:9;inset:0;display:grid;grid-template-columns:51% 49%;overflow:hidden;border-radius:inherit;background:#080808;color:#f6eee1;--sigil-accent:#d8b96c;--sigil-accent-soft:rgba(216,185,108,.2)}.mmd-sigil-card-photo{position:relative;min-width:0;background:radial-gradient(circle at 54% 28%,rgba(255,255,255,.13),transparent 42%),linear-gradient(155deg,#3a342d,#101010 66%);background-size:cover;background-position:center 22%;filter:brightness(.88) contrast(1.03) saturate(.94)}.mmd-sigil-card-photo:after{content:\"\";position:absolute;inset:0;background:linear-gradient(90deg,transparent 46%,rgba(4,4,4,.58)),linear-gradient(180deg,transparent 57%,rgba(0,0,0,.42))}.mmd-sigil-card-panel{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:10px;min-width:0;padding:clamp(20px,3vw,42px);padding-left:clamp(32px,4vw,64px);background:radial-gradient(circle at 100% 0,var(--sigil-accent-soft),transparent 36%),linear-gradient(140deg,#10100f,#050505 72%)}.mmd-sigil-card-panel:before{content:\"\";position:absolute;inset:16px 16px auto auto;width:42px;height:42px;border:1px solid var(--sigil-accent);transform:rotate(45deg);opacity:.72}.mmd-sigil-card-seam{position:absolute;z-index:3;top:-6%;bottom:-8%;left:48.8%;width:3px;background:var(--sigil-accent);box-shadow:0 0 28px var(--sigil-accent);transform:rotate(7.4deg);opacity:.88}.mmd-sigil-card-kicker{position:relative;color:var(--sigil-accent);font-size:8px;font-weight:700;letter-spacing:.16em}.mmd-sigil-card-identity{position:relative;max-width:100%;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(37px,5.5vw,78px);font-weight:500;line-height:.88;letter-spacing:-.07em;overflow-wrap:anywhere}.mmd-sigil-card-family{position:relative;color:rgba(246,238,225,.66);font-size:9px;letter-spacing:.13em;line-height:1.4}.mmd-sigil-card-metrics{position:relative;display:flex;gap:20px;padding-top:12px;border-top:1px solid rgba(255,255,255,.16)}.mmd-sigil-card-metrics>span{display:grid;grid-template-columns:auto auto;align-items:baseline;column-gap:4px}.mmd-sigil-card-metrics small{grid-column:1/-1;color:var(--sigil-accent);font-size:7px;letter-spacing:.15em}.mmd-sigil-card-metrics b{font-family:Georgia,\"Times New Roman\",serif;font-size:23px;font-weight:500}.mmd-sigil-card-metrics em{color:rgba(246,238,225,.58);font-size:8px;font-style:normal;letter-spacing:.1em}.mmd-sigil-card-titlebar{position:relative;align-self:stretch;margin-top:8px;padding:10px 12px;border-left:3px solid var(--sigil-accent);background:#f1e8d8;color:#191714;font-size:11px;font-weight:650;line-height:1.4}.mmd-sigil-card-exclusive .mmd-sigil-card-panel:after{content:\"SIGNATURE\";position:absolute;right:19px;bottom:15px;color:var(--sigil-accent);font-size:7px;letter-spacing:.16em;writing-mode:vertical-rl}.mmd-sigil-card-ems .mmd-sigil-card-titlebar{background:linear-gradient(100deg,#eee1c8,#cba85d);color:#171007}.mmd-sigil-card-gws .mmd-sigil-card-panel{background:radial-gradient(circle at 100% 0,rgba(27,183,176,.25),transparent 43%),linear-gradient(140deg,#071313,#040707 72%)}.mmd-sigil-card-gws .mmd-sigil-card-titlebar{border-left-width:5px;background:rgba(239,244,239,.93)}.mmd-sigil-card-public .mmd-sigil-card-identity{font-size:clamp(32px,5vw,66px);letter-spacing:-.055em}.mmd-sigil-card-public .mmd-sigil-card-panel{justify-content:center}.mmd-sigil-card-public .mmd-sigil-card-family{color:var(--sigil-accent);font-size:10px}.mmd-sigil-card-public .mmd-sigil-card-photo{filter:brightness(.72) contrast(1.04) saturate(.82)}@media(max-width:1100px){.mmd-sigil-template-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:720px){#" + PICKER_ID + "{padding:16px;border-radius:20px}.mmd-sigil-template-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mmd-sigil-template-tile{min-height:160px}.mmd-sigil-tile-art{height:70px}.mmd-sigil-card{grid-template-columns:1fr;grid-template-rows:44% 56%}.mmd-sigil-card-seam{left:-8%;right:-8%;top:42%;bottom:auto;width:auto;height:3px;transform:rotate(-3deg)}.mmd-sigil-card-panel{padding:22px}.mmd-sigil-card-identity{font-size:39px}.mmd-sigil-title-field{grid-column:span 1}}";
    document.head.appendChild(style);
  }

  function bootAll() {
    boot();
    bootFinalPreview();
  }

  if (document.readyState === "complete") window.setTimeout(bootAll, 0);
  else window.addEventListener("load", bootAll, { once: true });
})();
