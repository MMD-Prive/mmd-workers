import app from "./index";

type PartnerPublicPage = {
  page: string;
  webflowPath: string;
  injectFormBridge: boolean;
};

const WORKER_NAME = "partners-worker";
const PARTNER_ROUTE_VERSION = "20260626-partner-route-lock";
const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const WEBFLOW_FORM_SCRIPT_URL = "https://partners-worker.malemodel-bkk.workers.dev/webflow-sigil-partner-form.js";
const PARTNER_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

const PUBLIC_PARTNER_PAGES: Record<string, PartnerPublicPage> = {
  "/partner": { page: "partner-gate", webflowPath: "/partner", injectFormBridge: false },
  "/partner/apply": { page: "partner-apply", webflowPath: "/partner/apply", injectFormBridge: true },
  "/partner/model": { page: "partner-model", webflowPath: "/partner/model", injectFormBridge: false },
  "/partner/model/preview": { page: "partner-model-preview", webflowPath: "/partner/model/preview", injectFormBridge: false },
  "/partner/form": { page: "partner-form", webflowPath: "/partner/form", injectFormBridge: true },
  "/partner/terms": { page: "partner-terms", webflowPath: "/partner/terms", injectFormBridge: false }
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const route = resolvePublicPartnerPage(url);
    const method = request.method.toUpperCase();

    if (method === "GET" && isPartnerBridgeScriptPath(url)) {
      return javascriptResponse(PARTNER_FORM_BRIDGE_JS);
    }

    if ((method === "GET" || method === "HEAD") && route) {
      return fetchPartnerWebflowPage(request, url, route);
    }

    return app.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;

function resolvePublicPartnerPage(url: URL): PartnerPublicPage | null {
  if (!PARTNER_HOSTS.has(url.hostname)) return null;
  return PUBLIC_PARTNER_PAGES[normalizePartnerPath(url.pathname)] || null;
}

function normalizePartnerPath(pathname: string): string {
  let path = String(pathname || "/").replace(/\/{2,}/g, "/").toLowerCase();
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

function isPartnerBridgeScriptPath(url: URL): boolean {
  return url.pathname === "/webflow-sigil-partner-form.js" || url.pathname === "/assets/webflow-sigil-partner-form.js";
}

async function fetchPartnerWebflowPage(request: Request, url: URL, route: PartnerPublicPage): Promise<Response> {
  const upstreamUrl = new URL(route.webflowPath, WEBFLOW_ORIGIN);
  upstreamUrl.search = url.search;

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: buildWebflowHeaders(request)
  });

  if (request.method.toUpperCase() === "HEAD") return withPartnerHeaders(upstreamResponse, route);

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return withPartnerHeaders(upstreamResponse, route);

  const source = await upstreamResponse.text();
  const html = route.injectFormBridge ? injectFormBridge(source) : source;
  const headers = new Headers(upstreamResponse.headers);

  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
  addPartnerHeaders(headers, route);

  return new Response(html, { status: upstreamResponse.status, statusText: upstreamResponse.statusText, headers });
}

function buildWebflowHeaders(request: Request): Headers {
  const headers = new Headers();
  const accept = request.headers.get("accept");
  const acceptLanguage = request.headers.get("accept-language");
  const userAgent = request.headers.get("user-agent");

  headers.set("accept", accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);
  if (userAgent) headers.set("user-agent", userAgent);
  return headers;
}

function injectFormBridge(source: string): string {
  if (source.includes(WEBFLOW_FORM_SCRIPT_URL)) return source;

  const openTag = "<" + "script defer src=\"" + WEBFLOW_FORM_SCRIPT_URL + "\">";
  const closeTag = "</" + "script>";
  const bridgeTag = openTag + closeTag;
  const bodyClosePattern = new RegExp("<\\/body>", "i");

  if (bodyClosePattern.test(source)) return source.replace(bodyClosePattern, bridgeTag + "</body>");
  return source + bridgeTag;
}

function withPartnerHeaders(response: Response, route: PartnerPublicPage): Response {
  const headers = new Headers(response.headers);
  addPartnerHeaders(headers, route);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function addPartnerHeaders(headers: Headers, route: PartnerPublicPage): void {
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-page", route.page);
  headers.set("x-mmd-origin", WEBFLOW_ORIGIN + route.webflowPath);
  headers.set("x-mmd-partner-bridge", "edge");
  headers.set("x-mmd-front-gate", WORKER_NAME);
  headers.set("x-mmd-front-version", PARTNER_ROUTE_VERSION);
}

function javascriptResponse(source: string): Response {
  return new Response(source, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-page": "partner-form-bridge",
      "x-mmd-front-version": PARTNER_ROUTE_VERSION
    }
  });
}

const PARTNER_FORM_BRIDGE_JS = String.raw`
(function () {
  "use strict";

  var CONFIG = {
    workerBaseUrl: "https://partners-worker.malemodel-bkk.workers.dev",
    formSelector: "form.sigil-form-card[name='sigil-partner-request'], form.pa18-form[name='mmd-partner-introduction']"
  };

  var roleMap = {
    model: { access_source: "model_referral", talent_type: "model" },
    client: { access_source: "client_referral", talent_type: "client_lead" },
    service: { access_source: "other", talent_type: "company" },
    strategic: { access_source: "other", talent_type: "other" }
  };

  var fileCategories = {
    photo: true,
    portfolio: true,
    comp_card: true,
    company_profile: true,
    identity: true,
    rate_card: true,
    proof: true,
    other: true
  };

  function clean(value) {
    return String(value || "").trim();
  }

  function randomPart() {
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(36).padStart(2, "0");
    }).join("").slice(0, 11);
  }

  function requestId() {
    var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return "prq_" + stamp + "_" + randomPart();
  }

  function fieldValue(form, name) {
    var field = form.elements && form.elements[name];
    if (!field) return "";
    if (typeof field.value === "string") return clean(field.value);
    if (field.length) {
      for (var i = 0; i < field.length; i += 1) {
        if (field[i] && field[i].checked) return clean(field[i].value);
      }
    }
    return "";
  }

  function valueByLabel(form, needles) {
    var fields = Array.prototype.slice.call(form.querySelectorAll(".pa18-field"));
    for (var i = 0; i < fields.length; i += 1) {
      var label = fields[i].querySelector("label");
      var labelText = clean(label && label.textContent).toLowerCase();
      if (!labelText) continue;

      for (var j = 0; j < needles.length; j += 1) {
        if (labelText.indexOf(String(needles[j]).toLowerCase()) === -1) continue;
        var control = fields[i].querySelector("input, textarea, select");
        return control && "value" in control ? clean(control.value) : "";
      }
    }
    return "";
  }

  function selectedRole() {
    var checked = document.querySelector("input[name='pa18Role']:checked");
    return checked ? clean(checked.value) : "";
  }

  function selectedRoleLabel() {
    var checked = document.querySelector("input[name='pa18Role']:checked");
    var card = checked && checked.closest ? checked.closest(".pa18-role-card") : null;
    var strong = card && card.querySelector("strong");
    return clean(strong && strong.textContent) || selectedRole();
  }

  function mappedRole() {
    var role = selectedRole();
    return roleMap[role] || { access_source: "other", talent_type: "other" };
  }

  function composeContact(form) {
    var direct = fieldValue(form, "contact") || valueByLabel(form, ["ช่องทางติดต่อ", "contact"]);
    var line = fieldValue(form, "line_id") || valueByLabel(form, ["line id", "line"]);
    return [direct, line ? "LINE: " + line : ""].filter(Boolean).join(" / ");
  }

  function readPayload(form, id, files) {
    var role = mappedRole();
    var valueBring = fieldValue(form, "value_bring") || valueByLabel(form, ["คุณอยากแนะนำอะไร", "แนะนำอะไร"]);
    var whyConsider = fieldValue(form, "why_consider") || valueByLabel(form, ["ทำไมคุณคิด", "เหมาะกับ"]);
    var readiness = valueByLabel(form, ["ความพร้อม"]);
    var yukiNote = valueByLabel(form, ["yuki", "เพิ่มเติม"]);

    return {
      request_id: id,
      name_alias: fieldValue(form, "name_alias") || valueByLabel(form, ["ชื่อของคุณ", "บริษัท", "ทีม"]),
      access_source: fieldValue(form, "access_source") || role.access_source,
      value_bring: valueBring || (selectedRoleLabel() ? "Partner direction: " + selectedRoleLabel() : "Partner introduction"),
      why_consider: whyConsider || "Submitted from partner introduction page for Yuki review.",
      experience: fieldValue(form, "experience") || [readiness, yukiNote].filter(Boolean).join(" / "),
      contact: composeContact(form),
      talent_name: fieldValue(form, "talent_name"),
      talent_type: fieldValue(form, "talent_type") || role.talent_type,
      portfolio_url: fieldValue(form, "portfolio_url") || valueByLabel(form, ["portfolio", "social", "website", "reference"]),
      talent_location: fieldValue(form, "talent_location") || valueByLabel(form, ["พื้นที่", "location"]),
      talent_details: fieldValue(form, "talent_details") || [readiness, yukiNote].filter(Boolean).join(" / "),
      source_path: window.location.pathname,
      files: files
    };
  }

  function fileCategory(input) {
    var raw = input.dataset.fileCategory || input.name || "other";
    return fileCategories[raw] ? raw : "other";
  }

  function ensureStatus(form) {
    var root = form.closest(".sigil-partner-form") || form.closest(".pa18-panel") || form;
    var status = root.querySelector("[data-eval-status], [data-partner-status], .pa18-submit-status");
    if (status) return status;

    status = document.createElement("p");
    status.className = "pa18-submit-status";
    status.setAttribute("role", "status");
    status.style.marginTop = "12px";
    status.style.color = "rgba(255,248,226,.78)";
    status.style.fontSize = "14px";
    form.appendChild(status);
    return status;
  }

  function setStatus(form, text) {
    var status = ensureStatus(form);
    if (status) status.textContent = text || "";
  }

  function setSubmitting(form, isSubmitting) {
    var buttons = Array.prototype.slice.call(form.querySelectorAll("button[type='submit'], input[type='submit']"));
    buttons.forEach(function (button) {
      button.disabled = isSubmitting;
      if (button.tagName === "BUTTON") {
        if (isSubmitting) {
          button.dataset.idleText = button.textContent || "Submit";
          button.textContent = "Submitting to Yuki Review...";
        } else if (button.dataset.idleText) {
          button.textContent = button.dataset.idleText;
        }
      }
    });
  }

  function errorMessage(payload, fallback) {
    if (!payload) return fallback;
    if (payload.error && payload.error.message) return payload.error.message;
    if (payload.error && typeof payload.error === "string") return payload.error;
    return fallback;
  }

  async function uploadFiles(form, id) {
    var inputs = Array.prototype.slice.call(form.querySelectorAll("input[type='file']"));
    var uploads = [];

    for (var inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
      var input = inputs[inputIndex];
      var files = Array.prototype.slice.call(input.files || []);

      for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        var data = new FormData();
        data.set("request_id", id);
        data.set("file_category", fileCategory(input));
        data.set("file", files[fileIndex]);

        var response = await fetch(CONFIG.workerBaseUrl + "/v1/partner/upload", {
          method: "POST",
          body: data
        });
        var payload = await response.json().catch(function () { return null; });
        if (!response.ok || !payload || !payload.ok) throw new Error(errorMessage(payload, "File upload failed."));
        uploads.push(payload.upload || payload);
      }
    }

    return uploads;
  }

  function validatePayload(payload) {
    return Boolean(payload.name_alias && payload.access_source && payload.value_bring && payload.why_consider && payload.contact);
  }

  async function submitPartnerRequest(form) {
    var id = form.dataset.requestId || requestId();
    form.dataset.requestId = id;
    var files = await uploadFiles(form, id);
    var payload = readPayload(form, id, files);

    if (!validatePayload(payload)) {
      throw new Error("กรุณากรอกชื่อ ช่องทางติดต่อ และรายละเอียดหลักให้ครบก่อนส่งครับ");
    }

    var response = await fetch(CONFIG.workerBaseUrl + "/v1/partner/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    var result = await response.json().catch(function () { return null; });
    if (!response.ok || !result || !result.ok) throw new Error(errorMessage(result, "Request submission failed."));
    return result;
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches(CONFIG.formSelector)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.dataset.sigilSubmitting === "true") return;

    form.dataset.sigilSubmitting = "true";
    setSubmitting(form, true);
    setStatus(form, "Submitting to private review / กำลังส่งข้อมูลให้ Yuki Review");

    submitPartnerRequest(form)
      .then(function () {
        setStatus(form, "Submission received / ส่งข้อมูลให้ Yuki Review แล้วครับ");
        form.dataset.sigilSubmitted = "true";
      })
      .catch(function (error) {
        setStatus(form, error && error.message ? error.message : "Unable to submit this request right now.");
      })
      .finally(function () {
        form.dataset.sigilSubmitting = "false";
        setSubmitting(form, false);
      });
  }, true);
})();
`;
