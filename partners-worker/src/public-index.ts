import app from "./index";
import { PARTNER_CONTROL_ROOM_CSS, PARTNER_CONTROL_ROOM_JS } from "./partner-control-room";

type PartnerPublicPage = {
  page: string;
  webflowPath?: string;
  injectFormBridge?: boolean;
  systemPage?: "review" | "recognized" | "dashboard";
};

const WORKER_NAME = "partners-worker";
const PARTNER_ROUTE_VERSION = "20260626-partner-route-lock";
const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const WEBFLOW_FORM_SCRIPT_URL = "https://partners-worker.malemodel-bkk.workers.dev/webflow-sigil-partner-form.js";
const PARTNER_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

const PUBLIC_PARTNER_PAGES: Record<string, PartnerPublicPage> = {
  "/partner": { page: "partner-gate", webflowPath: "/partner" },
  "/partner/apply": { page: "partner-apply", webflowPath: "/partner/apply", injectFormBridge: true },
  "/partner/model": { page: "partner-model", webflowPath: "/partner/model" },
  "/partner/model/preview": { page: "partner-model-preview", webflowPath: "/partner/model/preview" },
  "/partner/form": { page: "partner-form", webflowPath: "/partner/form", injectFormBridge: true },
  "/partner/terms": { page: "partner-terms", webflowPath: "/partner/terms" },
  "/partner/review": { page: "partner-review", systemPage: "review" },
  "/partner/recognized": { page: "partner-recognized", systemPage: "recognized" },
  "/partner/dashboard": { page: "partner-dashboard", systemPage: "dashboard" }
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
      if (route.systemPage) return renderPartnerSystemPage(request, url, route);
      if (route.webflowPath) return fetchPartnerWebflowPage(request, url, route);
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
  const upstreamUrl = new URL(route.webflowPath || "/partner", WEBFLOW_ORIGIN);
  upstreamUrl.search = url.search;

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: buildWebflowHeaders(request)
  });

  if (request.method.toUpperCase() === "HEAD") return withPartnerHeaders(upstreamResponse, route);

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return withPartnerHeaders(upstreamResponse, route);

  const source = await upstreamResponse.text();
  const html = normalizePartnerHtml(route.injectFormBridge ? injectFormBridge(source) : source, route);
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
  return injectBeforeBody(source, bridgeTag);
}

function normalizePartnerHtml(source: string, route: PartnerPublicPage): string {
  const designTag = "<style data-mmd-partner-design>" + PARTNER_DESIGN_CSS + PARTNER_CONTROL_ROOM_CSS + "</style>";
  const metaTag = "<meta name=\"mmd-partner-page\" content=\"" + escapeHtml(route.page) + "\">";
  const html = source.includes("data-mmd-partner-design") ? source : injectBeforeHead(source, metaTag + designTag);
  return html.replace(/<body([^>]*)>/i, "<body$1 data-mmd-partner-page=\"" + escapeHtml(route.page) + "\">");
}

function injectBeforeHead(source: string, tag: string): string {
  const headClosePattern = new RegExp("<\\/head>", "i");
  if (headClosePattern.test(source)) return source.replace(headClosePattern, tag + "</head>");
  return tag + source;
}

function injectBeforeBody(source: string, tag: string): string {
  const bodyClosePattern = new RegExp("<\\/body>", "i");
  if (bodyClosePattern.test(source)) return source.replace(bodyClosePattern, tag + "</body>");
  return source + tag;
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
  headers.set("x-mmd-origin", route.webflowPath ? WEBFLOW_ORIGIN + route.webflowPath : "partners-worker:system-page");
  headers.set("x-mmd-partner-bridge", "edge");
  headers.set("x-mmd-front-gate", WORKER_NAME);
  headers.set("x-mmd-front-version", PARTNER_ROUTE_VERSION);
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
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

function renderPartnerSystemPage(request: Request, url: URL, route: PartnerPublicPage): Response {
  const query = url.search || "";
  const token = url.searchParams.get("t") || "";
  const page = route.systemPage || "review";
  const copy = systemPageCopy(page, Boolean(token));
  const tokenQuery = token ? "?t=" + encodeURIComponent(token) : "";
  const dashboardHref = "/partner/dashboard" + tokenQuery;
  const termsHref = "/partner/terms" + tokenQuery;
  const reviewHref = "/partner/review" + query;
  const html = "<!doctype html>" +
    "<html lang=\"th\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"referrer\" content=\"no-referrer\">" +
    "<meta name=\"robots\" content=\"noindex,nofollow\"><title>" + escapeHtml(copy.title) + "</title>" +
    "<style data-mmd-partner-design>" + PARTNER_DESIGN_CSS + PARTNER_CONTROL_ROOM_CSS + "</style></head>" +
    "<body data-mmd-partner-page=\"" + escapeHtml(route.page) + "\"><main class=\"mmd-partner-system\" data-system-page=\"" + escapeHtml(page) + "\">" +
    "<nav class=\"mmdp-nav\"><a class=\"mmdp-brand\" href=\"/partner\"><b>SĪGIL</b><span>Partner Division</span></a>" +
    "<div><a href=\"/partner/model\">Model Partner</a><a href=\"/partner/apply\">Apply</a><a href=\"/partner/terms\">Terms</a></div></nav>" +
    "<section class=\"mmdp-hero\"><div><p class=\"mmdp-eyebrow\">SĪGIL Partner Lane</p><h1>" + escapeHtml(copy.heading) + "</h1>" +
    "<p class=\"mmdp-lead\">" + escapeHtml(copy.lead) + "</p><p>" + escapeHtml(copy.body) + "</p>" +
    renderSystemActions(page, tokenQuery, reviewHref, termsHref, dashboardHref) + "</div>" +
    "<aside class=\"mmdp-card\"><small>YUKI REVIEW</small><strong>" + escapeHtml(copy.card) + "</strong><span>Partner Control Layer</span></aside></section>" +
    renderDashboardPanel(page, token) +
    "<section class=\"mmdp-grid\"><article><span>01</span><h2>Submit</h2><p>ส่งข้อมูลให้ชัดพอสำหรับการพิจารณา ไม่ต้องเปิดข้อมูลส่วนตัวเกินจำเป็น</p></article>" +
    "<article><span>02</span><h2>Review</h2><p>Yuki ตรวจบทบาท แหล่งที่มา ความพร้อม และความเหมาะสมของ partner lane</p></article>" +
    "<article><span>03</span><h2>Recognize</h2><p>เมื่อได้รับการรับรองแล้ว เข้าสู่พื้นที่ Partner ด้วยบัญชี LINE ที่เชื่อมไว้</p></article></section>" +
    "</main>" + renderDashboardScript(page) + "</body></html>";

  const response = new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
  addPartnerHeaders(response.headers, route);
  return response;
}

function systemPageCopy(page: string, hasToken: boolean): { title: string; heading: string; lead: string; body: string; card: string } {
  if (page === "recognized") {
    return {
      title: "MMD Partner Recognized",
      heading: hasToken ? "Recognized access is ready." : "Recognition link required.",
      lead: hasToken ? "สถานะ partner ได้รับการยอมรับแล้ว ขั้นต่อไปคืออ่าน terms และเปิด dashboard ด้วย private token." : "หน้านี้ต้องเปิดจากลิงก์ที่มี t เท่านั้น เพื่อป้องกันไม่ให้ partner access ถูกเดาสุ่มหรือส่งต่อผิดชั้น.",
      body: hasToken ? "ระบบจะใช้ token นี้สำหรับ verify, accept terms และ dashboard โดยไม่เปิดเผย secret ฝั่ง Airtable หรือ Telegram." : "ถ้าเพิ่งได้รับอนุมัติ ให้เปิดจากลิงก์ที่ส่งโดยทีม MMD Privé เท่านั้น.",
      card: hasToken ? "RECOGNIZED" : "TOKEN REQUIRED"
    };
  }

  if (page === "dashboard") {
    return {
      title: "SĪGIL Partner Dashboard",
      heading: "Partner control room.",
      lead: hasToken ? "จัดการคิว โมเดล เรท การมองเห็น และรายได้ของโมเดลในสังกัดจากพื้นที่เดียว." : "เข้าสู่ระบบด้วย LINE บัญชีเดิมที่เชื่อมกับ Partner.",
      body: hasToken ? "ข้อมูลส่วนตัวเริ่มต้นเป็น Private และจะถูกแชร์กับ MMD เฉพาะรายการที่ Partner ยืนยันอย่างชัดเจน." : "จากนั้นเชื่อม Telegram เพื่อรับแจ้งงานและส่งคำตอบให้ MMD.",
      card: "CONTROL ROOM"
    };
  }

  return {
    title: "MMD Partner Review",
    heading: "Request received for review.",
    lead: "ข้อมูลถูกส่งเข้าสู่ Partner Division แล้ว ขั้นตอนนี้ยังไม่ใช่การอนุมัติหรือการเปิดสิทธิ์ทันที.",
    body: "Yuki จะตรวจแหล่งที่มา ความเหมาะสม บทบาท และคุณภาพข้อมูลก่อนจัดชั้น partner lane ต่อไป.",
    card: "UNDER REVIEW"
  };
}

function renderSystemActions(page: string, tokenQuery: string, reviewHref: string, termsHref: string, dashboardHref: string): string {
  if (page === "recognized") {
    return "<p class=\"mmdp-actions\"><a class=\"mmdp-btn\" href=\"" + escapeHtml(termsHref) + "\">Read Partner Terms</a><a class=\"mmdp-btn ghost\" href=\"" + escapeHtml(dashboardHref) + "\">Open Dashboard</a></p>";
  }
  if (page === "dashboard") {
    if (!tokenQuery) return "<p class=\"mmdp-actions\"><a class=\"mmdp-btn\" href=\"https://mmdbkk.com/sigil/model/dashboard/partner-login\">เข้าสู่ระบบด้วย LINE</a></p>";
    return "<p class=\"mmdp-actions\"><a class=\"mmdp-btn\" href=\"" + escapeHtml(termsHref) + "\">Partner Terms</a><a class=\"mmdp-btn ghost\" href=\"/partner\">Partner Gate</a></p>";
  }
  return "<p class=\"mmdp-actions\"><a class=\"mmdp-btn\" href=\"/partner\">Back to Partner Gate</a><a class=\"mmdp-btn ghost\" href=\"" + escapeHtml(reviewHref) + "\">Review Status</a></p>" + (tokenQuery ? "<p><a href=\"" + escapeHtml(dashboardHref) + "\">Open token dashboard</a></p>" : "");
}

function renderDashboardPanel(page: string, token: string): string {
  if (page !== "dashboard") return "";
  if (!token) return "<section class=\"mmdp-dashboard\"><h2>บัญชี Partner ของคุณ</h2><p>ใช้บัญชี LINE ที่เคยส่งคำขอไว้ สถานะและสิทธิ์จะตรวจสอบจากบัญชีเดิม</p></section>";
  const audiences = ["Public Member","Elite","Red Card","Standard","Premium","VIP / Black Card","SVIP","Per Review"];
  const audienceHtml = audiences.map((value) => "<label><input type=\"checkbox\" name=\"audience_scope\" value=\"" + escapeHtml(value) + "\"><span>" + escapeHtml(value) + "</span></label>").join("");
  const sharedFields = "<label><span>ชื่อที่ใช้แสดง</span><input name=\"display_name\" maxlength=\"120\"></label><label><span>อายุ</span><input name=\"age\" type=\"number\" min=\"18\" max=\"70\"></label><label><span>ส่วนสูง (cm)</span><input name=\"height_cm\" type=\"number\" min=\"120\" max=\"230\"></label><label><span>น้ำหนัก (kg)</span><input name=\"weight_kg\" type=\"number\" min=\"35\" max=\"250\"></label><label class=\"wide\"><span>ข้อมูลแนะนำตัว</span><textarea name=\"profile_summary\"></textarea></label><label class=\"wide\"><span>ทักษะ / จุดแข็ง</span><textarea name=\"skills_summary\"></textarea></label><label class=\"wide\"><span>ประสบการณ์ / ผลงาน</span><textarea name=\"experience_summary\"></textarea></label><label class=\"wide\"><span>ข้อความสำหรับขาย</span><textarea name=\"sales_copy\"></textarea></label><label class=\"wide\"><span>URL ข่าวหรือผลงาน 1</span><input name=\"portfolio_url_1\" type=\"url\" placeholder=\"https://\"></label><label class=\"wide\"><span>URL ข่าวหรือผลงาน 2</span><input name=\"portfolio_url_2\" type=\"url\" placeholder=\"https://\"></label><label class=\"wide\"><span>URL ข่าวหรือผลงาน 3</span><input name=\"portfolio_url_3\" type=\"url\" placeholder=\"https://\"></label>";
  return "<section data-partner-control-room>" +
    "<a class=\"mmdp-btn\" data-reconnect-line hidden href=\"https://mmdbkk.com/sigil/model/dashboard/partner-login\">เข้าสู่ระบบด้วย LINE อีกครั้ง</a>" +
    "<p class=\"pcr-flash\" data-flash hidden></p>" +
    "<div class=\"pcr-privacy\"><span aria-hidden=\"true\">🔒</span><div><b>Partner Private by default</b><p>ข้อมูลส่วนตัวและโน้ตภายในเป็นความลับของ Partner; MMD ไม่มีสิทธิ์อ่าน ข้อมูลจะส่งให้ MMD เฉพาะเมื่อกด Share with MMD เท่านั้น</p></div></div>" +
    "<div class=\"pcr-shell\"><aside class=\"pcr-side\"><small>Control Room</small><button type=\"button\" data-view=\"home\" aria-current=\"page\">Home & Jobs</button><button type=\"button\" data-view=\"models\">Models</button><button type=\"button\" data-view=\"earnings\">Earnings</button><button type=\"button\" data-view=\"privacy\">Private Vault</button></aside>" +
    "<div class=\"pcr-main\"><p class=\"pcr-loading\" data-loading></p>" +
    "<section data-view-panel=\"home\"><header class=\"pcr-top\"><div><p class=\"mmdp-eyebrow\">TODAY · ASIA/BANGKOK</p><h2 data-partner-name>Partner</h2><p>คิวงานและสถานะโมเดลในสังกัด</p></div></header><div class=\"pcr-metrics\" data-metrics></div><div class=\"pcr-telegram\" data-telegram></div><div class=\"pcr-section\"><div class=\"pcr-section-head\"><h3>ตารางงาน</h3></div><div class=\"pcr-jobs\" data-jobs></div></div></section>" +
    "<section data-view-panel=\"models\" hidden><header class=\"pcr-top\"><div><p class=\"mmdp-eyebrow\">PARTNER ROSTER</p><h2>Models</h2><p>โปรไฟล์ เรท และกลุ่มลูกค้าที่มองเห็น</p></div><button type=\"button\" data-open-add>+ Add model</button></header><div class=\"pcr-models\" data-models></div></section>" +
    "<section data-view-panel=\"earnings\" hidden><header class=\"pcr-top\"><div><p class=\"mmdp-eyebrow\">PAYOUT LEDGER</p><h2>Earnings</h2><p>รายการค่าตอบแทนจากข้อมูลจริง</p></div></header><div class=\"pcr-section\" data-earnings></div></section>" +
    "<section data-view-panel=\"privacy\" hidden><header class=\"pcr-top\"><div><p class=\"mmdp-eyebrow\">END-TO-END PRIVATE</p><h2>Private Vault</h2><p>รหัสถอดข้อมูลอยู่กับ Partner และไม่ถูกส่งให้ MMD</p></div></header><div class=\"pcr-vault\"><div class=\"pcr-vault-card\" data-vault-locked><h3>Unlock Private Vault</h3><p>ใส่ Vault PIN อย่างน้อย 8 ตัวอักษร หากเปิดครั้งแรก PIN นี้จะใช้สร้างกุญแจเข้ารหัสใน browser</p><input data-vault-pin type=\"password\" autocomplete=\"off\" placeholder=\"Vault PIN\"><div class=\"pcr-vault-actions\"><button type=\"button\" data-unlock-vault>Unlock / Create</button></div></div><div class=\"pcr-vault-card pcr-vault-open\" data-vault-open hidden><h3>Partner private notes</h3><p>ข้อความนี้ถูกเข้ารหัสก่อนออกจาก browser</p><textarea data-general-note placeholder=\"บันทึกภายในของ Partner เท่านั้น\"></textarea><div class=\"pcr-vault-actions\"><button type=\"button\" data-save-vault>Encrypt & Save</button></div></div></div></section>" +
    "</div></div>" +
    "<dialog class=\"pcr-dialog\" data-model-dialog><div class=\"pcr-dialog-head\"><h2>Edit model</h2><button type=\"button\" data-close-dialog>×</button></div><form class=\"pcr-form\" data-model-form><div class=\"pcr-form-grid\">" + sharedFields +
    "<label class=\"wide pcr-private-field\"><span>Private model note · MMD อ่านไม่ได้</span><textarea name=\"private_note\" placeholder=\"ต้องปลดล็อก Private Vault ก่อน\"></textarea></label>" +
    "<fieldset><legend>Sales Control · ส่งให้ Boss Per ตรวจ</legend><div class=\"pcr-form-grid\"><label><span>เรทถึงตัว (THB)</span><input name=\"partner_source_rate_thb\" type=\"number\" min=\"0\"></label><label><span>เรทขายที่เสนอ (THB)</span><input name=\"customer_sell_rate_thb\" type=\"number\" min=\"0\"></label><label><span>Visibility</span><select name=\"sales_visibility\"><option value=\"off\">OFF</option><option value=\"on\">ON</option></select></label><div class=\"wide pcr-checks\">" + audienceHtml + "</div><button type=\"button\" data-save-sales>Submit sales control</button></div></fieldset>" +
    "<fieldset><legend>Profile media · Shared with MMD</legend><input name=\"model_file\" type=\"file\" accept=\"image/jpeg,image/png,image/webp,application/pdf\"><button type=\"button\" data-upload-model>Upload for review</button></fieldset>" +
    "<label class=\"wide pcr-consent\"><input name=\"share_with_mmd\" type=\"checkbox\"><span>ฉันเลือกแชร์ข้อมูลโปรไฟล์และไฟล์ชุดนี้กับ MMD เพื่อใช้ตรวจสอบและดำเนินงาน</span></label></div><div class=\"pcr-form-actions\"><button type=\"submit\" data-save-profile>Save profile</button><button type=\"button\" class=\"danger\" data-remove-model>Remove from roster</button></div></form></dialog>" +
    "<dialog class=\"pcr-dialog\" data-add-dialog><div class=\"pcr-dialog-head\"><h2>Add model</h2><button type=\"button\" data-close-dialog>×</button></div><form class=\"pcr-form\" data-add-form><div class=\"pcr-form-grid\">" + sharedFields + "<label class=\"wide pcr-consent\"><input name=\"share_with_mmd\" type=\"checkbox\"><span>ฉันเลือกแชร์ข้อมูลชุดนี้กับ MMD เพื่อสร้างคำขอเพิ่มโมเดล</span></label></div><div class=\"pcr-form-actions\"><button type=\"submit\">Submit model</button></div></form></dialog>" +
    "</section>";
}

function renderDashboardScript(page: string): string {
  if (page !== "dashboard") return "";
  return "<script>" + PARTNER_CONTROL_ROOM_JS + "</script>";
}

function escapeHtml(value: string): string {
  return String(value || "").replace(/[&<>\"]/g, function (char) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" } as Record<string, string>)[char] || char;
  });
}

const DASHBOARD_JS = String.raw`
(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get("t") || "";
  var status = document.querySelector("[data-dashboard-status]");
  var metrics = document.querySelector("[data-dashboard-metrics]");
  var lists = document.querySelector("[data-dashboard-lists]");
  var telegram = document.querySelector("[data-dashboard-telegram]");
  if (!token || !status || !metrics || !lists || !telegram) return;

  function money(value) {
    var number = Number(value || 0);
    return number.toLocaleString("th-TH") + " THB";
  }

  function metric(label, value) {
    return "<article><span>" + label + "</span><strong>" + value + "</strong></article>";
  }

  fetch("/v1/partner/dashboard?t=" + encodeURIComponent(token), { headers: { "accept": "application/json" } })
    .then(function (response) { return response.json().then(function (payload) { return { ok: response.ok, payload: payload }; }); })
    .then(function (result) {
      if (!result.ok || !result.payload || !result.payload.ok) throw new Error("Unable to verify partner dashboard.");
      var summary = result.payload.summary || {};
      status.textContent = "Verified partner dashboard loaded.";
      metrics.innerHTML = [
        metric("Tier", summary.tier || "Trusted"),
        metric("Active Models", summary.activeModels || 0),
        metric("Pending", money(summary.pendingAmount)),
        metric("Paid", money(summary.paidAmount))
      ].join("");
      var partner = result.payload.partner || {};
      telegram.innerHTML = partner.telegram_connected
        ? "<p><b>Telegram connected</b>" + (partner.telegram_username ? " · @" + partner.telegram_username : "") + "</p>"
        : "<p><b>Telegram Job Confirm</b> · เชื่อม Telegram เพื่อรับงานและกดยืนยันจาก MMD ได้ทันที</p><button class=\"mmdp-btn\" type=\"button\" data-connect-telegram>Connect Telegram</button><p data-telegram-status></p>";
      lists.innerHTML = "<p>Referrals: " + ((result.payload.referrals || []).length) + " / Commissions: " + ((result.payload.commissions || []).length) + "</p>";
      var connect = telegram.querySelector("[data-connect-telegram]");
      if (connect) connect.addEventListener("click", function () {
        connect.disabled = true;
        var tgStatus = telegram.querySelector("[data-telegram-status]");
        if (tgStatus) tgStatus.textContent = "กำลังเตรียม Telegram link…";
        fetch("/v1/partner/telegram/connect?t=" + encodeURIComponent(token), {
          method:"POST",
          headers:{ "accept":"application/json", "content-type":"application/json" },
          body:"{}"
        }).then(function (response) {
          return response.json().then(function (payload) { return { ok:response.ok, payload:payload }; });
        }).then(function (bind) {
          if (!bind.ok || !bind.payload || !bind.payload.ok) throw new Error("Unable to connect Telegram.");
          if (bind.payload.telegram_connected) {
            window.location.reload();
            return;
          }
          if (!bind.payload.connect_url) throw new Error("Telegram link unavailable.");
          window.location.href = bind.payload.connect_url;
        }).catch(function (error) {
          connect.disabled = false;
          if (tgStatus) tgStatus.textContent = error && error.message ? error.message : "Telegram connection unavailable.";
        });
      });
    })
    .catch(function (error) {
      status.textContent = error && error.message ? error.message : "Dashboard unavailable.";
    });
})();
`;

const PARTNER_DESIGN_CSS = String.raw`
:root{color-scheme:dark;--mmdp-bg:#050403;--mmdp-ink:#fff8e8;--mmdp-muted:rgba(255,248,232,.68);--mmdp-soft:rgba(255,248,232,.1);--mmdp-line:rgba(218,174,91,.22);--mmdp-gold:#e6bd72;--mmdp-gold-2:#ffe6ad;--mmdp-panel:rgba(16,12,8,.78);--mmdp-wine:#2a0d14}html{background:var(--mmdp-bg);scroll-behavior:smooth}body[data-mmd-partner-page]{margin:0;background:radial-gradient(circle at 12% -8%,rgba(230,189,114,.18),transparent 34%),radial-gradient(circle at 86% 10%,rgba(78,33,45,.22),transparent 30%),linear-gradient(145deg,#050403 0%,#100b07 52%,#030202 100%);color:var(--mmdp-ink);font-family:Inter,Outfit,"DM Sans","Noto Sans Thai",Arial,sans-serif;letter-spacing:-.01em}body[data-mmd-partner-page] *{box-sizing:border-box}body[data-mmd-partner-page] a{color:inherit}body[data-mmd-partner-page] .pa18-shell,body[data-mmd-partner-page] .sigil-partner-form,body[data-mmd-partner-page] .mmd-partner-system{font-family:Inter,Outfit,"DM Sans","Noto Sans Thai",Arial,sans-serif}.mmdp-nav{position:sticky;top:0;z-index:20;width:min(1180px,calc(100% - 32px));margin:0 auto;min-height:74px;display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(to bottom,rgba(5,4,3,.88),rgba(5,4,3,.5),transparent);backdrop-filter:blur(18px)}.mmdp-nav a{text-decoration:none;color:rgba(255,248,232,.72);font-weight:850}.mmdp-nav div{display:flex;gap:16px;flex-wrap:wrap}.mmdp-brand{display:flex;align-items:baseline;gap:10px}.mmdp-brand b{color:#fff;font-size:26px;letter-spacing:-.07em}.mmdp-brand span{color:var(--mmdp-gold);font-size:13px;text-transform:uppercase;letter-spacing:.16em}.mmd-partner-system{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:0 0 70px}.mmdp-hero{min-height:calc(100vh - 90px);display:grid;grid-template-columns:minmax(0,1.05fr) minmax(280px,.72fr);align-items:center;gap:clamp(28px,6vw,76px);padding:52px 0}.mmdp-eyebrow{margin:0 0 18px;color:var(--mmdp-gold);font-size:12px;font-weight:950;letter-spacing:.3em;text-transform:uppercase}.mmdp-hero h1{margin:0 0 22px;max-width:880px;color:#fff;font-size:clamp(54px,9.6vw,112px);line-height:.86;letter-spacing:-.085em}.mmdp-lead{color:rgba(255,248,232,.86);font-size:clamp(19px,2.2vw,25px);line-height:1.62}.mmdp-hero p,.mmdp-grid p,.mmdp-dashboard p{color:var(--mmdp-muted);line-height:1.78}.mmdp-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.mmdp-btn{min-height:52px;display:inline-flex;align-items:center;justify-content:center;padding:0 22px;border:1px solid rgba(255,230,173,.5);border-radius:999px;background:linear-gradient(135deg,#fff0c4,var(--mmdp-gold) 52%,#9a6828);color:#120c05!important;text-decoration:none;font-weight:950}.mmdp-btn.ghost{color:var(--mmdp-ink)!important;background:rgba(255,255,255,.055);border-color:var(--mmdp-line)}.mmdp-card{min-height:330px;border:1px solid var(--mmdp-line);border-radius:34px;padding:30px;background:radial-gradient(circle at 24% 14%,rgba(255,255,255,.12),transparent 25%),linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 40px 120px rgba(0,0,0,.45)}.mmdp-card small,.mmdp-card span{color:rgba(255,230,173,.72);font-weight:900;letter-spacing:.2em;text-transform:uppercase}.mmdp-card strong{display:block;margin:70px 0 18px;color:#fff;font-size:clamp(42px,5vw,68px);line-height:.86;letter-spacing:-.07em}.mmdp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:22px}.mmdp-grid article,.mmdp-dashboard{border:1px solid rgba(255,255,255,.08);border-radius:28px;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025));padding:28px;backdrop-filter:blur(16px)}.mmdp-grid span{color:var(--mmdp-gold);font-weight:950}.mmdp-grid h2,.mmdp-dashboard h2{margin:10px 0;color:#fff;font-size:24px}.mmdp-dashboard{margin:0 0 28px}.mmdp-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.mmdp-metrics article{padding:18px;border:1px solid var(--mmdp-line);border-radius:22px;background:rgba(0,0,0,.2)}.mmdp-metrics span{display:block;color:var(--mmdp-muted);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.14em}.mmdp-metrics strong{display:block;margin-top:10px;color:#fff;font-size:22px}body[data-mmd-partner-page] .pa18-card,body[data-mmd-partner-page] .pa18-panel,body[data-mmd-partner-page] .sigil-form-card{border-color:var(--mmdp-line)!important;box-shadow:0 26px 90px rgba(0,0,0,.32)!important}body[data-mmd-partner-page] button,body[data-mmd-partner-page] input,body[data-mmd-partner-page] textarea,body[data-mmd-partner-page] select{font-family:Inter,Outfit,"DM Sans","Noto Sans Thai",Arial,sans-serif!important}@media(max-width:820px){.mmdp-nav{align-items:flex-start;flex-direction:column;padding:16px 0}.mmdp-hero{grid-template-columns:1fr;min-height:auto;padding:36px 0}.mmdp-grid,.mmdp-metrics{grid-template-columns:1fr}.mmdp-hero h1{font-size:clamp(46px,18vw,76px)}}
`;

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
