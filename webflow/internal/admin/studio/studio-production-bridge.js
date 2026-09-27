(function () {
  "use strict";

  var PAGE = (document.currentScript && document.currentScript.getAttribute("data-mmd-studio-page")) || "studio";
  var API = {
    intakeValidate: "/studio/api/intake/validate",
    intakeCommit: "/studio/api/intake/commit",
    reviewValidate: "/studio/api/review/validate",
    reviewCommit: "/studio/api/review/commit",
    publishPlan: "/studio/api/model-preview/publish-plan",
    finalCommit: "/studio/api/model-preview/commit",
    upload: "/studio/api/upload",
    myCardList: "/studio/api/compcard-requests/list",
    myCardImport: "/studio/api/compcard-requests/import",
    myCardMedia: "/studio/api/compcard-requests/media"
  };
  var SAFE_QUERY = {
    source: true,
    seed: true,
    run: true,
    run_number: true,
    model_id: true,
    review_id: true,
    studio_intake_id: true,
    studio_review_id: true,
    draft_id: true,
    compcard_request_id: true,
    my_card_request_id: true,
    view: true
  };
  var SECRET_QUERY = /token|secret|password|credential|cookie|authorization|bearer|confirm|line_user_id|^t$/i;

  if (PAGE !== "studio") ensureNoIndex();
  sanitizeUrl();
  purgeStoredPhotos();
  gate().then(function (ok) {
    if (!ok) return;
    bindStudioForms();
    installMyCardInbox();
    installAutoCardInbox();
    hydrateMyCardReviewContext();
    window.MMDStudioBridge = {
      api: API,
      validateIntake: function (payload) { return post(API.intakeValidate, payload); },
      commitIntake: function (payload) { return post(API.intakeCommit, withIdempotency(payload)); },
      uploadAsset: function (file, idempotencyKey) { return uploadAsset(file, idempotencyKey); },
      validateReview: function (payload) { return post(API.reviewValidate, payload); },
      commitReview: function (payload) { return post(API.reviewCommit, withIdempotency(payload)); },
      publishPlan: function (payload) { return post(API.publishPlan, payload); },
      listMyCardRequests: function () { return post(API.myCardList, {}); },
      importMyCardRequest: function (requestId) { return post(API.myCardImport, { compcard_request_id: requestId }); },
      getMyCardRequestMedia: function (requestId) { return postBlob(API.myCardMedia, { compcard_request_id: requestId }); },
      finalLedgerCommit: function (payload) {
        return post(API.finalCommit, withIdempotency(Object.assign({}, payload, {
          published: false,
          publish_mode: "ledger_only",
          ledger_commit_confirmed: true,
          ledger_confirmation_phrase: "COMMIT_LEDGER_ONLY"
        })));
      }
    };
  });


  var myCardPreviewUrl = "";

  function installAutoCardInbox() {
    if (PAGE !== "upload" && PAGE !== "studio-upload") return;
    var form = findIntakeForm();
    if (!form || document.getElementById("mmd-auto-card-inbox")) return;
    injectMyCardInboxStyles();
    var section = document.createElement("section");
    section.id = "mmd-auto-card-inbox";
    section.className = "mmd-my-card-inbox";
    section.innerHTML = '<div class="mmd-my-card-inbox__head"><h2>การ์ดจากรูปโปรไฟล์</h2><button type="button" data-refresh>รีเฟรช</button></div><p class="mmd-my-card-inbox__help">ร่างอัตโนมัติ 1322 × 1200 · รอตรวจภาพและข้อมูลก่อนนำไปใช้</p><div data-jobs aria-live="polite"></div><button type="button" data-more hidden>ดูต่อ</button><div data-preview></div>';
    form.parentNode.insertBefore(section, form);
    var cursor = null, previewUrl = "";
    var labels = { queued: "เข้าคิวแล้ว", preparing: "กำลังเตรียมข้อมูล", waiting_profile: "รอข้อมูลโปรไฟล์", waiting_configuration: "รอการตั้งค่าระบบ", generating: "กำลังสร้างภาพ", rendering: "กำลังจัดการ์ด", awaiting_owner_review: "รอตรวจการ์ด", source_changed: "รูปหลักหรือข้อมูลเปลี่ยนแล้ว", needs_review: "ต้องตรวจงาน", paused: "พักการสร้างภาพ" };
    function load(append) {
      var target = section.querySelector("[data-jobs]");
      if (!append) { cursor = null; target.textContent = "กำลังอ่านรายการ…"; }
      post("/studio/api/model-cards/list", cursor ? { cursor: cursor } : {}).then(function (data) {
        if (!append) target.textContent = "";
        (data.jobs || []).forEach(function (job) {
          var item = document.createElement("article"); item.className = "mmd-my-card-request";
          var copy = document.createElement("div"); copy.className = "mmd-my-card-request__copy";
          var name = document.createElement("strong"); name.textContent = job.model_name || "Model"; copy.appendChild(name);
          var state = document.createElement("span"); state.textContent = labels[job.state] || "ต้องตรวจงาน"; copy.appendChild(state);
          if ((job.missing || []).length) { var note = document.createElement("small"); note.textContent = "ข้อมูลที่ยังขาด: " + job.missing.join(", "); copy.appendChild(note); }
          item.appendChild(copy);
          var identity = { model_record_id: job.model_record_id, job_id: job.job_id };
          if (job.state === "awaiting_owner_review") {
            var view = document.createElement("button"); view.type = "button"; view.textContent = "ดูการ์ด";
            view.onclick = function () {
              view.disabled = true;
              postBlob("/studio/api/model-cards/preview", identity).then(function (blob) {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                previewUrl = URL.createObjectURL(blob);
                var area = section.querySelector("[data-preview]"); area.textContent = "";
                var image = document.createElement("img"); image.src = previewUrl; image.alt = "ร่างการ์ด " + job.model_name; image.style.cssText = "display:block;width:100%;height:auto;margin-top:16px";
                var link = document.createElement("a"); link.href = previewUrl; link.download = job.job_id + "-1322x1200.png"; link.textContent = "ดาวน์โหลดร่าง PNG";
                area.appendChild(image); area.appendChild(link);
              }).catch(function (error) { section.querySelector("[data-preview]").textContent = "เปิดการ์ดไม่ได้: " + error.message; }).finally(function () { view.disabled = false; });
            };
            item.appendChild(view);
          } else if (job.can_resume) {
            var resume = document.createElement("button"); resume.type = "button"; resume.textContent = "ตรวจข้อมูลแล้วดำเนินต่อ";
            resume.onclick = function () { resume.disabled = true; post("/studio/api/model-cards/resume", identity).then(function () { load(false); }).catch(function (error) { state.textContent = error.message; resume.disabled = false; }); };
            item.appendChild(resume);
          }
          target.appendChild(item);
        });
        if (!target.children.length) target.textContent = "ยังไม่มีร่างจากการเลือกรูปหลัก";
        cursor = data.cursor || null; section.querySelector("[data-more]").hidden = !cursor;
      }).catch(function () { target.textContent = "ยังอ่านร่างอัตโนมัติไม่ได้ กรุณาลองอีกครั้ง"; });
    }
    section.querySelector("[data-refresh]").onclick = function () { load(false); };
    section.querySelector("[data-more]").onclick = function () { load(true); };
    window.addEventListener("pagehide", function () { if (previewUrl) URL.revokeObjectURL(previewUrl); });
    load(false);
  }

  function installMyCardInbox() {
    if (PAGE !== "upload" && PAGE !== "studio-upload") return;
    var form = findIntakeForm();
    if (!form || document.getElementById("mmd-my-card-inbox")) return;

    injectMyCardInboxStyles();
    var inbox = document.createElement("section");
    inbox.id = "mmd-my-card-inbox";
    inbox.className = "mmd-my-card-inbox";
    inbox.innerHTML = [
      '<div class="mmd-my-card-inbox__head">',
      '<div><p class="mmd-my-card-inbox__eyebrow">MMD MODEL</p><h2>My Card requests</h2></div>',
      '<button class="mmd-my-card-inbox__refresh" type="button">Refresh</button>',
      '</div>',
      '<p class="mmd-my-card-inbox__help">Select a model-submitted public photo, then complete the normal Studio flow. Field, RUN NUMBER, template, and final design remain Studio decisions.</p>',
      '<div class="mmd-my-card-inbox__items" aria-live="polite"><p class="mmd-my-card-inbox__empty">Loading requests…</p></div>',
      '<div class="mmd-my-card-inbox__selected" hidden></div>'
    ].join("");
    form.parentNode.insertBefore(inbox, form);

    inbox.querySelector(".mmd-my-card-inbox__refresh").addEventListener("click", function () {
      loadMyCardInbox(inbox);
    });
    inbox.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-mmd-my-card-load]") : null;
      if (!button || button.disabled) return;
      loadMyCardIntoStudio(inbox, button.getAttribute("data-mmd-my-card-load"));
    });
    loadMyCardInbox(inbox);
  }

  function hydrateMyCardReviewContext() {
    if (PAGE !== "review" && PAGE !== "studio-review") return;
    var requestId = new URL(window.location.href).searchParams.get("compcard_request_id");
    if (!requestId) return;
    var reviewForm = document.querySelector('[data-mmd-studio-api="reviewCommit"]');
    if (!reviewForm) return;
    setHiddenValue(reviewForm, "compcard_request_id", requestId);
  }

  function findIntakeForm() {
    return document.querySelector('[data-mmd-studio-api="intakeCommit"]') || document.querySelector("form[data-mmd-studio-api]");
  }

  function loadMyCardInbox(inbox) {
    var items = inbox.querySelector(".mmd-my-card-inbox__items");
    items.innerHTML = '<p class="mmd-my-card-inbox__empty">Loading requests…</p>';
    post(API.myCardList, {}).then(function (data) {
      renderMyCardRequests(inbox, Array.isArray(data.requests) ? data.requests : []);
    }).catch(function (error) {
      items.innerHTML = "";
      var message = document.createElement("p");
      message.className = "mmd-my-card-inbox__empty";
      message.textContent = "Could not load My Card requests: " + error.message;
      items.appendChild(message);
    });
  }

  function renderMyCardRequests(inbox, requests) {
    var items = inbox.querySelector(".mmd-my-card-inbox__items");
    items.innerHTML = "";
    if (!requests.length) {
      var empty = document.createElement("p");
      empty.className = "mmd-my-card-inbox__empty";
      empty.textContent = "No My Card requests yet.";
      items.appendChild(empty);
      return;
    }
    requests.forEach(function (request) {
      var status = cleanMyCardStatus(request.status);
      var closed = ["studio_approved", "studio_preview_ready", "studio_rejected"].includes(status);
      var item = document.createElement("article");
      item.className = "mmd-my-card-request";
      item.innerHTML = [
        '<div class="mmd-my-card-request__copy">',
        '<strong>' + escapeHtml(request.model_name || "Model") + '</strong>',
        '<span>' + escapeHtml(formatMyCardProfile(request)) + '</span>',
        '<small>' + escapeHtml(formatMyCardStatus(status)) + ' · ' + escapeHtml(formatMyCardDate(request.submitted_at)) + '</small>',
        '</div>',
        '<button type="button" data-mmd-my-card-load="' + escapeHtml(request.request_id) + '"' + (closed ? " disabled" : "") + '>' + (closed ? "Closed" : "Use in Studio") + '</button>'
      ].join("");
      items.appendChild(item);
    });
  }

  function loadMyCardIntoStudio(inbox, requestId) {
    var button = inbox.querySelector('[data-mmd-my-card-load="' + cssEscape(requestId) + '"]');
    if (button) {
      button.disabled = true;
      button.textContent = "Loading…";
    }
    post(API.myCardImport, { compcard_request_id: requestId }).then(function (data) {
      if (!data || !data.draft) throw new Error("my_card_import_invalid");
      applyMyCardDraft(inbox, data.draft);
      return postBlob(API.myCardMedia, { compcard_request_id: data.draft.compcard_request_id });
    }).then(function (blob) {
      showMyCardPreview(inbox, blob);
      loadMyCardInbox(inbox);
    }).catch(function (error) {
      if (button) {
        button.disabled = false;
        button.textContent = "Use in Studio";
      }
      var selected = inbox.querySelector(".mmd-my-card-inbox__selected");
      selected.hidden = false;
      selected.textContent = "Could not load this request: " + error.message;
    });
  }

  function applyMyCardDraft(inbox, draft) {
    var form = findIntakeForm();
    if (!form) throw new Error("studio_intake_form_missing");
    setHiddenValue(form, "compcard_request_id", draft.compcard_request_id);
    setHiddenValue(form, "source_media_id", draft.source_media_id || "");
    setHiddenValue(form, "source_media_type", draft.source_media_type || "");
    setHiddenValue(form, "my_card_height_cm", draft.height_cm == null ? "" : draft.height_cm);
    setHiddenValue(form, "my_card_weight_kg", draft.weight_kg == null ? "" : draft.weight_kg);
    setNamedValue(form, ["model_name", "model", "name"], draft.model_name || "");
    setNamedValue(form, ["source_owner", "sourceOwner"], draft.source_owner || "");
    setNamedValue(form, ["category_path", "categoryPath"], draft.category_path || "");
    setNamedValue(form, ["direction", "per_direction", "note"], draft.direction || "");

    var url = new URL(window.location.href);
    url.searchParams.set("compcard_request_id", draft.compcard_request_id);
    window.history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString() + url.hash);

    inbox.dispatchEvent(new CustomEvent("mmd-studio:my-card-imported", {
      detail: { request: draft },
      bubbles: true
    }));
  }

  function showMyCardPreview(inbox, blob) {
    if (!(blob instanceof Blob)) throw new Error("my_card_media_invalid");
    if (myCardPreviewUrl) URL.revokeObjectURL(myCardPreviewUrl);
    myCardPreviewUrl = URL.createObjectURL(blob);
    var selected = inbox.querySelector(".mmd-my-card-inbox__selected");
    selected.hidden = false;
    selected.innerHTML = "";
    var image = document.createElement("img");
    image.src = myCardPreviewUrl;
    image.alt = "Selected My Card source";
    image.className = "mmd-my-card-inbox__preview";
    var copy = document.createElement("p");
    copy.textContent = "Source photo loaded. Continue below and let Studio choose field, RUN NUMBER, template, and final design.";
    selected.appendChild(image);
    selected.appendChild(copy);
  }

  function setHiddenValue(form, name, value) {
    var input = form.querySelector('input[name="' + cssEscape(name) + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = String(value == null ? "" : value);
  }

  function setNamedValue(form, names, value) {
    names.some(function (name) {
      var field = form.querySelector('[name="' + cssEscape(name) + '"]');
      if (!field) return false;
      field.value = String(value == null ? "" : value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
  }

  function cleanMyCardStatus(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatMyCardStatus(value) {
    var labels = {
      model_request_pending: "Awaiting Studio",
      studio_in_progress: "In Studio",
      studio_approved: "Approved",
      studio_revision_requested: "Revision requested",
      studio_rejected: "Closed",
      studio_preview_ready: "Preview ready"
    };
    return labels[value] || "Studio review";
  }

  function formatMyCardProfile(request) {
    var height = Number(request.height_cm);
    var weight = Number(request.weight_kg);
    var metrics = [];
    if (Number.isFinite(height) && height > 0) metrics.push(height + " cm");
    if (Number.isFinite(weight) && weight > 0) metrics.push(weight + " kg");
    return [request.media_type === "profile_photo" ? "Profile photo" : "Public gallery", metrics.join(" · ")].filter(Boolean).join(" · ");
  }

  function formatMyCardDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
    });
  }

  function cssEscape(value) {
    return window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
  }

  function injectMyCardInboxStyles() {
    if (document.getElementById("mmd-my-card-inbox-styles")) return;
    var style = document.createElement("style");
    style.id = "mmd-my-card-inbox-styles";
    style.textContent = [
      ".mmd-my-card-inbox{margin:0 0 20px;padding:18px;border:1px solid rgba(17,24,39,.14);border-radius:14px;background:#fff;color:#111827}",
      ".mmd-my-card-inbox__head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between}.mmd-my-card-inbox h2{margin:2px 0 0;font:600 18px/1.25 system-ui,sans-serif}.mmd-my-card-inbox__eyebrow{margin:0;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.12em;color:#6b7280}",
      ".mmd-my-card-inbox__help,.mmd-my-card-inbox__empty{margin:12px 0 0;color:#4b5563;font:400 13px/1.5 system-ui,sans-serif}.mmd-my-card-inbox__items{display:grid;gap:9px;margin-top:14px}",
      ".mmd-my-card-request{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px;border:1px solid rgba(17,24,39,.1);border-radius:10px}.mmd-my-card-request__copy{display:grid;gap:3px;min-width:0}.mmd-my-card-request__copy strong{font:600 14px/1.3 system-ui,sans-serif}.mmd-my-card-request__copy span,.mmd-my-card-request__copy small{color:#6b7280;font:400 12px/1.3 system-ui,sans-serif}",
      ".mmd-my-card-inbox button{border:1px solid #111827;border-radius:8px;background:#111827;color:#fff;padding:8px 10px;font:600 12px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer}.mmd-my-card-inbox button[disabled]{opacity:.45;cursor:not-allowed}.mmd-my-card-inbox__refresh{background:#fff!important;color:#111827!important}",
      ".mmd-my-card-inbox__selected{display:flex;gap:12px;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid rgba(17,24,39,.1)}.mmd-my-card-inbox__selected p{margin:0;color:#374151;font:400 13px/1.45 system-ui,sans-serif}.mmd-my-card-inbox__preview{width:60px;height:76px;object-fit:cover;border-radius:7px;background:#e5e7eb}@media(max-width:520px){.mmd-my-card-request{align-items:flex-start;flex-direction:column}.mmd-my-card-request button{width:100%}}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureNoIndex() {
    var existing = document.querySelector('meta[name="robots"]');
    if (!existing) {
      existing = document.createElement("meta");
      existing.setAttribute("name", "robots");
      document.head.appendChild(existing);
    }
    existing.setAttribute("content", "noindex,nofollow");
  }

  function sanitizeUrl() {
    var url = new URL(window.location.href);
    var safe = new URLSearchParams();
    url.searchParams.forEach(function (value, key) {
      if (SAFE_QUERY[key.toLowerCase()] && !SECRET_QUERY.test(key)) safe.append(key, value);
    });
    var cleanPath = url.pathname + (safe.toString() ? "?" + safe.toString() : "") + url.hash;
    if (cleanPath !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", cleanPath);
    }
  }

  function safeNext() {
    var url = new URL(window.location.href);
    var safe = new URLSearchParams();
    url.searchParams.forEach(function (value, key) {
      if (SAFE_QUERY[key.toLowerCase()] && !SECRET_QUERY.test(key)) safe.append(key, value);
    });
    return url.pathname + (safe.toString() ? "?" + safe.toString() : "");
  }

  function gate() {
    return fetch("/v1/admin/auth/me", {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json" }
    }).then(function (response) {
      if (response.ok) return true;
      redirectToLogin();
      return false;
    }).catch(function () {
      redirectToLogin();
      return false;
    });
  }

  function redirectToLogin() {
    var login = new URL("/internal/admin/login", window.location.origin);
    login.searchParams.set("next", safeNext());
    window.location.replace(login.toString());
  }

  function purgeStoredPhotos() {
    try {
      Object.keys(window.localStorage || {}).forEach(function (key) {
        var value = String(window.localStorage.getItem(key) || "");
        if (/mmdStudio|studio/i.test(key) && (/data:image\//i.test(value) || value.length > 200000)) {
          window.localStorage.removeItem(key);
        }
      });
    } catch (_) {}
  }

  function bindStudioForms() {
    document.querySelectorAll("[data-mmd-studio-api]").forEach(function (form) {
      if (form.__mmdStudioBound) return;
      form.__mmdStudioBound = true;
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var action = form.getAttribute("data-mmd-studio-api");
        var endpoint = API[action];
        if (!endpoint) return;
        prepareFormPayload(form, action).then(function (payload) {
          if (/Commit$/.test(action)) payload = withIdempotency(payload);
          return post(endpoint, payload);
        }).then(function (data) {
          form.dispatchEvent(new CustomEvent("mmd-studio:result", { detail: data, bubbles: true }));
        }).catch(function (error) {
          form.dispatchEvent(new CustomEvent("mmd-studio:error", { detail: { message: error.message }, bubbles: true }));
        });
      });
    });
  }

  function prepareFormPayload(form, action) {
    var payload = formPayload(form);
    var files = [];
    new FormData(form).forEach(function (value, key) {
      if (SECRET_QUERY.test(key) || /^line[_-]?user[_-]?id$/i.test(key)) return;
      if (value instanceof File && value.name) files.push({ file: value, field: key });
    });
    if (!files.length) return Promise.resolve(payload);
    return Promise.all(files.map(function (entry, index) {
      return uploadAsset(entry.file, "studio:upload:" + PAGE + ":" + action + ":" + Date.now() + ":" + index + ":" + crypto.randomUUID());
    })).then(function (assets) {
      payload.asset_ids = assets.map(function (asset) { return asset.asset_id; }).filter(Boolean);
      return payload;
    });
  }

  function formPayload(form) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      if (SECRET_QUERY.test(key) || /^line[_-]?user[_-]?id$/i.test(key)) return;
      if (value instanceof File) {
        if (value.name) payload.files = (payload.files || []).concat([{ name: value.name, size: value.size, type: value.type }]);
        return;
      }
      payload[key] = String(value || "");
    });
    return payload;
  }

  function withIdempotency(payload) {
    var copy = Object.assign({}, payload || {});
    if (!copy.idempotency_key) copy.idempotency_key = "studio:" + PAGE + ":" + Date.now() + ":" + crypto.randomUUID();
    return copy;
  }

  function postBlob(endpoint, payload) {
    return fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "image/*,application/json" },
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.error || "studio_request_failed");
        });
      }
      return response.blob();
    });
  }

  function post(endpoint, payload) {
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

  function uploadAsset(file, idempotencyKey) {
    if (!(file instanceof File) || !file.name) return Promise.reject(new Error("file_required"));
    var key = idempotencyKey || "studio:upload:" + PAGE + ":" + Date.now() + ":" + crypto.randomUUID();
    var form = new FormData();
    form.append("file", file, file.name);
    return fetch(API.upload, {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "Idempotency-Key": key },
      body: form
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || "studio_upload_failed");
        return data;
      });
    });
  }
})();
