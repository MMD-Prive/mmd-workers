/*
 * MMD MODEL My Card → Studio bridge for the existing Webflow Studio UI.
 *
 * This script deliberately carries only safe request metadata. It never exposes
 * an object key, stores media bytes, chooses a Field / RUN NUMBER,
 * or publishes a card. The model template preference is preserved as safe
 * metadata; Studio owns group, RUN NUMBER, and final implementation.
 */
(function () {
  "use strict";

  var CONTEXT_KEY = "mmdMyCardStudioContextV1";
  var REVIEW_SEED_KEY = "mmdStudioReviewSeed";
  var UPLOAD_PATH = "/internal/admin/studio/upload";
  var REVIEW_PATH = "/internal/admin/studio/review";
  var PREVIEW_PATH = "/internal/admin/studio/model-preview";
  var API = {
    list: "/studio/api/compcard-requests/list",
    importRequest: "/studio/api/compcard-requests/import",
    media: "/studio/api/compcard-requests/media",
    intake: "/studio/api/intake/commit",
    review: "/studio/api/review/commit"
  };
  var FIELD_MAP = { A: "ST", ST: "ST", B: "GY", GY: "GY", E: "FR", FR: "FR", C: "EN", EN: "EN", D: "EX", EX: "EX", GWs: "GWs", EMs: "EMs" };
  var previewUrl = "";
  var uploadBusy = false;
  var reviewBusy = false;

  function byId(id) { return document.getElementById(id); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function value(id) { var node = byId(id); return node ? clean(node.value) : ""; }
  function uuid() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : "mmd-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
  function safeParse(raw) { try { var parsed = JSON.parse(raw || ""); return parsed && typeof parsed === "object" ? parsed : null; } catch (_) { return null; } }
  function readStorage(storage, key) { try { return safeParse(storage.getItem(key)); } catch (_) { return null; } }
  function writeStorage(storage, key, data) { try { storage.setItem(key, JSON.stringify(data)); } catch (_) {} }

  function readContext() {
    var direct = readStorage(window.sessionStorage, CONTEXT_KEY);
    if (direct && direct.request_id) return direct;
    var seed = readStorage(window.localStorage, REVIEW_SEED_KEY);
    if (seed && seed.my_card === true && seed.compcard_request_id) {
      return {
        version: 1,
        request_id: clean(seed.compcard_request_id),
        studio_intake_id: clean(seed.studio_intake_id),
        studio_review_id: clean(seed.studio_review_id),
        model_name: clean(seed.model_name),
        height_cm: Number(seed.my_card_height_cm) || null,
        weight_kg: Number(seed.my_card_weight_kg) || null,
        media_id: clean(seed.source_media_id),
        media_type: clean(seed.source_media_type),
        source_owner: clean(seed.source_owner),
        category_path: clean(seed.category_path),
        ui_family: clean(seed.compcard_family),
        field: clean(seed.field),
        run_number: clean(seed.run_number),
        layer: clean(seed.layer),
        template_hint: clean(seed.template_hint),
        model_template_id: clean(seed.model_template_id),
        model_template_label: clean(seed.model_template_label)
      };
    }
    return null;
  }

  function saveContext(context) {
    if (!context || !context.request_id) return;
    writeStorage(window.sessionStorage, CONTEXT_KEY, context);
  }

  function seedForReview(context, upload) {
    var existing = readStorage(window.localStorage, REVIEW_SEED_KEY) || {};
    var output = Object.assign({}, existing, upload || {}, {
      my_card: true,
      compcard_request_id: context.request_id,
      studio_intake_id: context.studio_intake_id || "",
      studio_review_id: context.studio_review_id || "",
      model_name: context.model_name,
      my_card_height_cm: context.height_cm || "",
      my_card_weight_kg: context.weight_kg || "",
      source_media_id: context.media_id || "",
      source_media_type: context.media_type || "",
      source_owner: context.source_owner || "",
      category_path: context.category_path || "MMD MODEL / My Card",
      field: context.field || "",
      run_number: context.run_number || "",
      layer: context.layer || "",
      template_hint: context.template_hint || "",
      model_template_id: context.model_template_id || "",
      model_template_label: context.model_template_label || ""
    });
    writeStorage(window.localStorage, REVIEW_SEED_KEY, output);
    return output;
  }

  function withContext(path, context) {
    var url = new URL(path, window.location.origin);
    var current = new URL(window.location.href);
    var t = current.searchParams.get("t");
    if (t) url.searchParams.set("t", t);
    if (context && context.request_id) url.searchParams.set("compcard_request_id", context.request_id);
    return url.pathname + (url.search ? url.search : "");
  }

  function postJson(endpoint, payload) {
    return fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || "studio_request_failed");
        return data;
      });
    });
  }

  function postBlob(endpoint, payload) {
    return fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "image/*,application/json" },
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      if (response.ok) return response.blob();
      return response.json().catch(function () { return {}; }).then(function (data) { throw new Error(data.error || "studio_media_failed"); });
    });
  }

  function showToast(message) {
    var toast = byId("muToast") || byId("mmdReviewR5Toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-show");
    window.setTimeout(function () { toast.classList.remove("is-show"); }, 2600);
  }

  function canonicalField(raw) { return FIELD_MAP[clean(raw)] || ""; }
  function canonicalRun(field, raw) {
    if (field !== "GWs" && field !== "EMs") return "";
    var digits = clean(raw).replace(/\D/g, "").slice(-3);
    return digits ? field + ("000" + digits).slice(-3) : "";
  }
  function layerFor(field) {
    if (field === "GWs" || field === "EMs") return "Exclusive / Black Card Review";
    if (field === "EN" || field === "EX") return "Public / MMD Privé";
    return "Private / SIGIL";
  }
  function selectedTemplate() {
    return value("mmdSigilTemplate") || "";
  }
  function formatMetrics(item) {
    var parts = [];
    if (Number(item && item.height_cm) > 0) parts.push(Number(item.height_cm) + " cm");
    if (Number(item && item.weight_kg) > 0) parts.push(Number(item.weight_kg) + " kg");
    return parts.join(" · ") || "Profile complete";
  }
  function formatDate(raw) {
    var date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
  }
  function statusLabel(status) {
    return ({
      model_request_pending: "Awaiting Studio",
      studio_in_progress: "In Studio",
      studio_approved: "Approved",
      studio_revision_requested: "Revision requested",
      studio_rejected: "Closed",
      studio_preview_ready: "Preview ready"
    })[clean(status).toLowerCase()] || "Studio review";
  }
  function isClosed(status) { return ["studio_approved", "studio_preview_ready", "studio_rejected"].indexOf(clean(status).toLowerCase()) !== -1; }

  function installStyles() {
    if (byId("mmd-my-card-studio-bridge-css")) return;
    var style = document.createElement("style");
    style.id = "mmd-my-card-studio-bridge-css";
    style.textContent = [
      ".mmd-my-card-studio{margin:0 0 18px;padding:17px 18px;border:1px solid rgba(216,185,108,.28);border-radius:18px;background:linear-gradient(135deg,rgba(216,185,108,.08),rgba(10,9,8,.88));color:#f7f0e4}",
      ".mmd-my-card-studio *{box-sizing:border-box}.mmd-my-card-studio__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.mmd-my-card-studio__eyebrow{margin:0 0 4px;color:#d8b96c;font:700 9px/1.2 -apple-system,BlinkMacSystemFont,Arial,sans-serif;letter-spacing:.16em}.mmd-my-card-studio h2{margin:0;font:600 19px/1.25 -apple-system,BlinkMacSystemFont,Arial,sans-serif}.mmd-my-card-studio__copy{margin:8px 0 0;max-width:760px;color:rgba(247,240,228,.67);font:400 12px/1.55 -apple-system,BlinkMacSystemFont,Arial,sans-serif}",
      ".mmd-my-card-studio__refresh,.mmd-my-card-studio__use{appearance:none;border:1px solid rgba(216,185,108,.72);border-radius:10px;background:#d8b96c;color:#17130c;padding:9px 11px;font:700 11px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;cursor:pointer;white-space:nowrap}.mmd-my-card-studio__refresh{background:transparent;color:#f7f0e4;border-color:rgba(247,240,228,.28)}.mmd-my-card-studio button:disabled{opacity:.48;cursor:not-allowed}",
      ".mmd-my-card-studio__items{display:grid;gap:8px;margin-top:14px}.mmd-my-card-studio__item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px;border:1px solid rgba(255,255,255,.11);border-radius:12px;background:rgba(0,0,0,.18)}.mmd-my-card-studio__item-copy{display:grid;gap:3px;min-width:0}.mmd-my-card-studio__item-copy strong{font:650 14px/1.25 -apple-system,BlinkMacSystemFont,Arial,sans-serif}.mmd-my-card-studio__item-copy span,.mmd-my-card-studio__item-copy small{color:rgba(247,240,228,.6);font:400 11px/1.35 -apple-system,BlinkMacSystemFont,Arial,sans-serif}",
      ".mmd-my-card-studio__empty{margin:0;color:rgba(247,240,228,.62);font:400 12px/1.45 -apple-system,BlinkMacSystemFont,Arial,sans-serif}.mmd-my-card-studio__selected,.mmd-my-card-review-context,.mmd-my-card-preview-context{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1)}.mmd-my-card-studio__selected[hidden]{display:none}.mmd-my-card-studio__preview{width:54px;height:68px;flex:0 0 auto;border-radius:8px;object-fit:cover;background:#17130c}.mmd-my-card-studio__selected p,.mmd-my-card-review-context p,.mmd-my-card-preview-context p{margin:0;color:rgba(247,240,228,.74);font:400 12px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif}.mmd-my-card-review-context,.mmd-my-card-preview-context{margin:0 0 16px;padding:12px 14px;border:1px solid rgba(216,185,108,.24);border-radius:12px;background:rgba(216,185,108,.07)}.mmd-my-card-review-context b,.mmd-my-card-preview-context b{color:#d8b96c}",
      "@media(max-width:620px){.mmd-my-card-studio__head,.mmd-my-card-studio__item{align-items:flex-start;flex-direction:column}.mmd-my-card-studio__refresh,.mmd-my-card-studio__use{width:100%}}"
    ].join("");
    document.head.appendChild(style);
  }

  function installUploadInbox() {
    var root = byId("mmdStudioUploadR5");
    var form = byId("muUploadForm");
    if (!root || !form || byId("mmd-my-card-studio")) return;
    installStyles();

    var section = document.createElement("section");
    section.id = "mmd-my-card-studio";
    section.className = "mmd-my-card-studio";
    section.innerHTML = '<div class="mmd-my-card-studio__head"><div><p class="mmd-my-card-studio__eyebrow">MMD MODEL</p><h2>My Card requests</h2></div><button class="mmd-my-card-studio__refresh" type="button">Refresh</button></div><p class="mmd-my-card-studio__copy">Choose the model-submitted public photo and retain the model-selected template preference. Studio still chooses Group, RUN NUMBER, direction, and final implementation.</p><div class="mmd-my-card-studio__items" aria-live="polite"><p class="mmd-my-card-studio__empty">Loading requests…</p></div><div class="mmd-my-card-studio__selected" hidden></div>';
    form.parentNode.insertBefore(section, form);
    section.querySelector(".mmd-my-card-studio__refresh").addEventListener("click", function () { loadInbox(section); });
    section.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-my-card-request]") : null;
      if (!button || button.disabled) return;
      importRequest(section, clean(button.getAttribute("data-my-card-request")), button);
    });
    bindUploadCommit();
    loadInbox(section);
  }

  function loadInbox(section) {
    var host = section.querySelector(".mmd-my-card-studio__items");
    host.replaceChildren();
    var loading = document.createElement("p");
    loading.className = "mmd-my-card-studio__empty";
    loading.textContent = "Loading requests…";
    host.appendChild(loading);
    postJson(API.list, {}).then(function (data) {
      host.replaceChildren();
      var requests = Array.isArray(data.requests) ? data.requests : [];
      if (!requests.length) {
        var empty = document.createElement("p");
        empty.className = "mmd-my-card-studio__empty";
        empty.textContent = "No My Card requests yet.";
        host.appendChild(empty);
        return;
      }
      requests.forEach(function (request) { host.appendChild(renderRequest(request)); });
    }).catch(function (error) {
      host.replaceChildren();
      var message = document.createElement("p");
      message.className = "mmd-my-card-studio__empty";
      message.textContent = error.message === "unauthorized" ? "Studio sign-in is required to view My Card requests." : "Could not load My Card requests: " + error.message;
      host.appendChild(message);
    });
  }

  function renderRequest(request) {
    var row = document.createElement("article");
    row.className = "mmd-my-card-studio__item";
    var copy = document.createElement("div");
    copy.className = "mmd-my-card-studio__item-copy";
    var name = document.createElement("strong");
    name.textContent = request.model_name || "Model";
    var profile = document.createElement("span");
    profile.textContent = (request.media_type === "profile_photo" ? "Profile photo" : "Public gallery") + " · " + formatMetrics(request);
    var template = document.createElement("small");
    template.textContent = request.template_label ? "Template selected by model · " + request.template_label : "No template selected by model";
    var meta = document.createElement("small");
    meta.textContent = statusLabel(request.status) + " · " + formatDate(request.submitted_at);
    copy.append(name, profile, template, meta);
    var action = document.createElement("button");
    action.type = "button";
    action.className = "mmd-my-card-studio__use";
    action.setAttribute("data-my-card-request", clean(request.request_id));
    action.disabled = isClosed(request.status);
    action.textContent = isClosed(request.status) ? "Closed" : "Use in Studio";
    row.append(copy, action);
    return row;
  }

  function importRequest(section, requestId, button) {
    if (!requestId) return;
    button.disabled = true;
    button.textContent = "Loading…";
    postJson(API.importRequest, { compcard_request_id: requestId }).then(function (data) {
      if (!data || !data.draft) throw new Error("my_card_import_invalid");
      var draft = data.draft;
      var context = {
        version: 1,
        request_id: clean(draft.compcard_request_id || requestId),
        model_name: clean(draft.model_name),
        height_cm: Number(draft.height_cm) || null,
        weight_kg: Number(draft.weight_kg) || null,
        media_id: clean(draft.source_media_id),
        media_type: clean(draft.source_media_type),
        source_owner: clean(draft.source_owner),
        category_path: clean(draft.category_path) || "MMD MODEL / My Card",
        model_template_id: clean(draft.model_template_id),
        model_template_label: clean(draft.model_template_label),
        selected_at: new Date().toISOString()
      };
      if (!context.model_name || !context.media_id) throw new Error("my_card_import_incomplete");
      saveContext(context);
      applyModelSource(context);
      return postBlob(API.media, { compcard_request_id: context.request_id }).then(function (blob) { showSelectedSource(section, context, blob); });
    }).then(function () {
      loadInbox(section);
      showToast("My Card source and template preference loaded. Studio now chooses the group, RUN NUMBER, and final implementation.");
    }).catch(function (error) {
      button.disabled = false;
      button.textContent = "Use in Studio";
      var selected = section.querySelector(".mmd-my-card-studio__selected");
      selected.hidden = false;
      selected.textContent = "Could not load this request: " + error.message;
    });
  }

  function applyModelSource(context) {
    var model = byId("muModel");
    if (model) {
      model.value = context.model_name;
      model.readOnly = true;
      model.dispatchEvent(new Event("input", { bubbles: true }));
      model.dispatchEvent(new Event("change", { bubbles: true }));
    }
    [["mmdSigilHeight", context.height_cm], ["mmdSigilWeight", context.weight_kg]].forEach(function (pair) {
      var input = byId(pair[0]);
      if (!input || !pair[1]) return;
      input.value = String(pair[1]);
      input.readOnly = true;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    var upload = byId("muUpload");
    if (upload) upload.classList.add("is-has-file", "mmd-my-card-source");
    var count = byId("muFileCount");
    if (count) count.textContent = "1 MODEL-SELECTED PUBLIC PHOTO";
  }

  function showSelectedSource(section, context, blob) {
    var selected = section.querySelector(".mmd-my-card-studio__selected");
    selected.hidden = false;
    selected.replaceChildren();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    var image = document.createElement("img");
    image.className = "mmd-my-card-studio__preview";
    image.src = previewUrl;
    image.alt = "Model-selected public source";
    var copy = document.createElement("p");
    copy.textContent = context.model_name + " · " + formatMetrics(context) + ". Source photo loaded" + (context.model_template_label ? "; template selected by model: " + context.model_template_label : "") + ". Studio still chooses Group, RUN NUMBER, direction, and final implementation.";
    selected.append(image, copy);
  }

  function buildIntake(context) {
    var field = canonicalField(value("muCategory"));
    var template = selectedTemplate();
    if (!field) throw new Error("เลือก Field ก่อนส่ง Review");
    if (!template) throw new Error("เลือก Template ก่อนส่ง Review");
    var run = canonicalRun(field, value("muRun"));
    if ((field === "GWs" || field === "EMs") && !run) throw new Error(field + " ต้องมี RUN NUMBER");
    return {
      compcard_request_id: context.request_id,
      model_name: context.model_name,
      source_owner: context.source_owner,
      category_path: context.category_path || "MMD MODEL / My Card",
      field: field,
      ui_family: clean(value("muCategory")),
      run_number: run,
      layer: layerFor(field),
      template_hint: template,
      model_template_id: context.model_template_id || "",
      direction: value("muDirection"),
      source_media_id: context.media_id,
      source_media_type: context.media_type,
      checklist: { model_submitted: true, public_source_selected: true },
      idempotency_key: context.intake_idempotency_key || ("studio:my-card:intake:" + context.request_id + ":" + uuid())
    };
  }

  function bindUploadCommit() {
    var button = byId("muSendReview");
    if (!button || button.dataset.myCardBound) return;
    button.dataset.myCardBound = "1";
    button.addEventListener("click", function (event) {
      var context = readContext();
      if (!context) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (uploadBusy) return;
      uploadBusy = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("is-loading");
      var intake;
      try { intake = buildIntake(context); } catch (error) { uploadBusy = false; button.removeAttribute("aria-busy"); button.classList.remove("is-loading"); showToast(error.message); return; }
      context.intake_idempotency_key = intake.idempotency_key;
      saveContext(context);
      postJson(API.intake, intake).then(function (result) {
        context.studio_intake_id = clean(result.studio_intake_id || result.record_id);
        context.ui_family = intake.ui_family;
        context.field = intake.field;
        context.run_number = intake.run_number;
        context.layer = intake.layer;
        context.template_hint = intake.template_hint;
        saveContext(context);
        seedForReview(context, {
          model_name: context.model_name,
          compcard_family: context.ui_family,
          field: intake.field,
          run_number: intake.run_number,
          layer: intake.layer,
          template_id: intake.template_hint,
          template_hint: intake.template_hint,
          model_template_id: context.model_template_id || "",
          model_template_label: context.model_template_label || "",
          direction: intake.direction,
          source_files: [{ name: "model-selected-public-media", type: context.media_type || "image/*", size: 0 }]
        });
        window.location.href = withContext(REVIEW_PATH, context);
      }).catch(function (error) {
        showToast("Could not send My Card to Review: " + error.message);
      }).finally(function () {
        uploadBusy = false;
        button.removeAttribute("aria-busy");
        button.classList.remove("is-loading");
      });
    }, true);
  }

  function decisionFromReview() {
    var active = document.querySelector("[data-decision].is-active");
    return clean(active && active.getAttribute("data-decision")) || clean(byId("mmdReviewR5DecisionStatus") && byId("mmdReviewR5DecisionStatus").textContent) || "Needs Review";
  }
  function normalizedDecision(value) {
    if (value === "Approved for Preview") return "Approved Direction";
    return "Needs Review";
  }
  function reviewChecklist() {
    var score = 0;
    var checklist = {};
    document.querySelectorAll("[data-review-check]").forEach(function (input) {
      var key = clean(input.getAttribute("data-review-check"));
      checklist[key] = Boolean(input.checked);
      if (input.checked) score += 1;
    });
    return { checklist: checklist, score: score };
  }

  function installReviewContext() {
    var root = byId("mmdStudioReviewR5");
    var context = readContext();
    if (!root || !context || !context.request_id) return;
    installStyles();
    if (!byId("mmd-my-card-review-context")) {
      var notice = document.createElement("div");
      notice.id = "mmd-my-card-review-context";
      notice.className = "mmd-my-card-review-context";
      var copy = document.createElement("p");
      copy.innerHTML = "<b>MMD MODEL · My Card</b><br>";
      copy.append(document.createTextNode(context.model_name + " · " + formatMetrics(context) + ". This is a model-selected public source" + (context.model_template_label ? "; model-selected template: " + context.model_template_label : "") + ". Studio owns the group, RUN NUMBER, direction, and final implementation."));
      notice.appendChild(copy);
      var summary = root.querySelector(".mmd-review-r5__summary");
      if (summary && summary.parentNode) summary.parentNode.insertBefore(notice, summary);
    }
    wireReviewCommit(context);
  }

  function wireReviewCommit(context) {
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      var link = byId("mmdReviewNextLink");
      if (link && !link.dataset.myCardBound) {
        link.dataset.myCardBound = "1";
        link.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (reviewBusy) return;
          reviewBusy = true;
          var selected = decisionFromReview();
          var review = reviewChecklist();
          var payload = {
            compcard_request_id: context.request_id,
            studio_intake_id: context.studio_intake_id || "",
            model_name: context.model_name,
            field: context.field,
            run_number: context.run_number,
            layer: context.layer,
            decision: normalizedDecision(selected),
            checklist: review.checklist,
            checklist_score: review.score,
            ewvon_note: value("mmdReviewR5ReviewNote"),
            final_note: value("mmdReviewR5Output") || value("mmdReviewR5ReviewNote"),
            idempotency_key: context.review_idempotency_key || ("studio:my-card:review:" + context.request_id + ":" + uuid())
          };
          if (!payload.field || !payload.layer) { reviewBusy = false; showToast("My Card Studio context is incomplete. Return to Upload and send it again."); return; }
          context.review_idempotency_key = payload.idempotency_key;
          postJson(API.review, payload).then(function (result) {
            context.studio_review_id = clean(result.studio_review_id || result.record_id);
            saveContext(context);
            seedForReview(context, {});
            var destination = link.getAttribute("href") || (selected === "Approved for Preview" ? PREVIEW_PATH : UPLOAD_PATH);
            window.location.href = withContext(destination, context);
          }).catch(function (error) {
            showToast("Could not commit Studio review: " + error.message);
          }).finally(function () { reviewBusy = false; });
        }, true);
        window.clearInterval(timer);
      } else if (tries > 80) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function installPreviewContext() {
    var root = byId("mmdModelPreview");
    var context = readContext();
    if (!root || !context || !context.request_id || byId("mmd-my-card-preview-context")) return;
    installStyles();
    var notice = document.createElement("div");
    notice.id = "mmd-my-card-preview-context";
    notice.className = "mmd-my-card-preview-context";
    var copy = document.createElement("p");
    copy.innerHTML = "<b>MMD MODEL · My Card</b><br>";
    copy.append(document.createTextNode("Studio review is recorded for " + context.model_name + (context.model_template_label ? " · model-selected template: " + context.model_template_label : "") + ". This preview is still internal; publishing stays manual under the existing Studio final flow."));
    notice.appendChild(copy);
    root.insertBefore(notice, root.firstChild);
  }

  function boot() {
    installUploadInbox();
    installReviewContext();
    installPreviewContext();
  }

  if (document.readyState === "complete") window.setTimeout(boot, 0);
  else window.addEventListener("load", boot, { once: true });
})();
