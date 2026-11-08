// Self-contained browser boot. The Worker serializes this function and supplies
// its Thai copy as an argument; do not add references to module-scope helpers.
export function adminConsoleClient(copy, toConsole) {
  "use strict";
  const root = document.querySelector("[data-admin-console]");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  const $ = id => document.getElementById(`ac-${id}`);
  const t = (key, values = {}) => {
    const canonicalKey = `admin.console.${key}`;
    let value = String(copy[canonicalKey] || "");
    try {
      const translated = window.MMD_I18N?.t?.(canonicalKey);
      if (typeof translated === "string" && translated && translated !== canonicalKey) value = translated;
    } catch (_) { /* The bundled Thai text is always available. */ }
    return value.replace(/\{([a-z]+)\}/gi, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  };
  const PAGE_PATH = "/internal/admin/console";
  const API_PATH = "/v1/admin/dashboard";
  const PAGE_SIZE = 20;
  const REQUEST_TIMEOUT_MS = 20000;
  const scopeKeys = ["session_id", "job_id", "client_id"];
  const allowedKeys = ["date", "job_date", "q", "page", "lang", ...scopeKeys];
  const numberFormat = new Intl.NumberFormat("th-TH");
  const moneyFormat = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  let state = null;
  let lastHomeUrl;
  let payload = null;
  let activeController = null;
  let requestNumber = 0;
  let busy = false;
  let renderedLanguage = document.documentElement.lang || "th";

  function today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = key => parts.find(item => item.type === key)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function isDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function dateLabel(value, full = false) {
    if (!isDate(value)) return t("noDate");
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok", day: "numeric", month: full ? "long" : "short",
      ...(full ? { year: "numeric", weekday: "short" } : {}),
    }).format(new Date(`${value}T12:00:00Z`));
  }

  function timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return "";
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(value));
  }

  function searchQuery(value) {
    const raw = String(value || "");
    if (raw.length > 160 || /[\p{Cc}\p{Cf}]/u.test(raw)) throw new Error("invalid");
    const normalized = raw.normalize("NFKC").toLowerCase().replaceAll("ß", "ss").replaceAll("ς", "σ").trim();
    if (normalized.length > 160 || /[\p{Cc}\p{Cf}]/u.test(normalized)) throw new Error("invalid");
    return normalized;
  }

  function safeId(value, max = 139) {
    return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value);
  }

  function clientId(value) {
    return typeof value === "string" && /^rec[A-Za-z0-9]{14,30}$/.test(value);
  }

  function locationLanguage() {
    const values = new URL(window.location.href).searchParams.getAll("lang");
    if (values.length !== 1) return "";
    const language = values[0].trim().toLowerCase();
    return ["th", "en", "zh"].includes(language) ? language : "";
  }

  function readLocation() {
    const params = new URL(window.location.href).searchParams;
    for (const key of allowedKeys) if (params.getAll(key).length > 1) throw new Error("invalid");
    if (params.has("date") && params.has("job_date")) throw new Error("invalid");
    const scope = {};
    for (const key of scopeKeys) {
      if (!params.has(key)) continue;
      const value = params.get(key).trim();
      if (!(key === "client_id" ? clientId(value) : safeId(value, key === "session_id" ? 119 : 139))) throw new Error("invalid");
      scope[key] = value;
    }
    const rawDate = params.get("date") ?? params.get("job_date");
    const date = rawDate === null ? (Object.keys(scope).length ? "all" : today()) : rawDate;
    if (date !== "all" && !isDate(date)) throw new Error("invalid");
    const rawPage = params.get("page") || "1";
    if (!/^[1-9]\d{0,6}$/.test(rawPage)) throw new Error("invalid");
    return { date, q: searchQuery(params.get("q")), page: Number(rawPage), scope, lang: locationLanguage() };
  }

  function pageUrl(value = state) {
    if (!value) return PAGE_PATH;
    const params = new URLSearchParams({ date: value.date });
    if (["th", "en", "zh"].includes(value.lang)) params.set("lang", value.lang);
    if (value.q) params.set("q", value.q);
    for (const key of scopeKeys) if (value.scope[key]) params.set(key, value.scope[key]);
    if (value.page > 1) params.set("page", String(value.page));
    return `${PAGE_PATH}?${params}`;
  }

  function apiUrl() {
    const params = new URLSearchParams({ view: "jobs", page: String(state.page), page_size: String(PAGE_SIZE) });
    if (state.date !== "all") params.set("date", state.date);
    if (state.q) params.set("q", state.q);
    for (const key of scopeKeys) if (state.scope[key]) params.set(key, state.scope[key]);
    return `${API_PATH}?${params}`;
  }

  function loginUrl() {
    return `/internal/admin/login?${new URLSearchParams({ next: pageUrl() })}`;
  }

  function storeHistory(mode) {
    try {
      if (mode === "push" && window.location.pathname + window.location.search !== pageUrl()) window.history.pushState({ consoleBack: true }, "", pageUrl());
      else if (mode === "replace") window.history.replaceState(window.history.state, "", pageUrl());
      lastHomeUrl = window.location.href;
    } catch (_) {
      // History can be unavailable in an embedded browser. It must not block a
      // read-only job request; the explicit login link still keeps the filters.
    }
  }

  function syncFilters() {
    if (!state) return;
    for (const id of ["date", "query", "search-button", "today", "all-dates"]) $(id).disabled = false;
    $("date").value = state.date === "all" ? "" : state.date;
    $("query").value = state.q;
    $("today").setAttribute("aria-pressed", String(state.date === today()));
    $("all-dates").setAttribute("aria-pressed", String(state.date === "all"));
    $("period-label").textContent = state.date === "all" ? t("allDates") : state.date === today() ? t("today") : dateLabel(state.date);
    const scoped = Object.keys(state.scope).length > 0;
    $("scope").hidden = !scoped;
    $("scope-text").textContent = scopeKeys.filter(key => state.scope[key]).map(key => `${t({ session_id: "scopeSession", job_id: "scopeJob", client_id: "scopeClient" }[key])}: ${state.scope[key]}`).join(" · ");
    $("clear-filters").hidden = !scoped && !state.q && state.date === "all";
    $("sign-in").href = loginUrl();
  }

  function setBusy(value) {
    busy = value;
    $("board").setAttribute("aria-busy", String(value));
    $("refresh").disabled = value;
    $("retry").disabled = value;
    $("previous").disabled = value || !payload?.pagination.has_prev;
    $("next").disabled = value || !payload?.pagination.has_next;
  }

  function clearData() {
    payload = null;
    $("jobs").replaceChildren();
    for (const value of root.querySelectorAll("[data-count]")) value.textContent = "—";
    $("empty").hidden = true;
    $("error").hidden = true;
    $("pagination").hidden = true;
    $("page-label").textContent = "";
    $("updated").textContent = t("notUpdated");
  }

  function showError(kind = "error") {
    clearData();
    const recognized = ["expired", "forbidden", "invalid", "timeout"].includes(kind) ? kind : "error";
    root.dataset.state = recognized;
    $("loading").hidden = true;
    $("progress").hidden = true;
    $("error").hidden = false;
    $("error-title").textContent = t(`${recognized}Title`);
    $("error-body").textContent = t(`${recognized}Body`);
    $("results-summary").textContent = "—";
    $("status").textContent = t(`${recognized}Title`);
    $("sign-in").hidden = !["expired", "forbidden"].includes(recognized);
    $("sign-in").href = loginUrl();
    $("retry").hidden = ["expired", "forbidden", "invalid"].includes(recognized);
    if (recognized === "invalid") {
      $("clear-filters").hidden = false;
      // An invalid incoming identity selector must never turn into an unscoped
      // request when a date/search button is used. Only explicit Clear Filters
      // can discard an invalid URL and establish a new unscoped selection.
      if (!state) for (const id of ["date", "query", "search-button", "today", "all-dates"]) $(id).disabled = true;
    }
    setBusy(false);
  }

  function node(tag, className, value) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined) item.textContent = String(value);
    return item;
  }

  function translatedNode(tag, className, key) {
    const item = node(tag, className, t(key));
    item.dataset.i18nText = `admin.console.${key}`;
    return item;
  }

  function glyph(kind = "arrow") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20"); svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", "ac-icon"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", kind === "chevron" ? "m8 10 4 4 4-4" : "M5 12h14m-6-6 6 6-6 6");
    svg.append(path);
    return svg;
  }

  function cleanText(value, fallback = "", max = 240) {
    return typeof value === "string" && value.trim() ? value.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, max) : fallback;
  }

  function amount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? `฿${moneyFormat.format(value)}` : "—";
  }

  function jobStatus(value) {
    const raw = cleanText(value, "", 100);
    const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
    const keys = {
      new: ["jobNew", "warm"], draft: ["jobDraft", "neutral"], pending: ["jobPending", "warm"],
      pending_review: ["jobReview", "warm"], awaiting_review: ["jobReview", "warm"], review: ["jobReview", "warm"],
      confirmed: ["jobConfirmed", "green"], ready: ["jobReady", "green"], active: ["jobActive", "green"],
      travel: ["jobTravel", "warm"], en_route: ["jobTravel", "warm"], on_the_way: ["jobTravel", "warm"],
      arrived: ["jobArrived", "green"], working: ["jobWorking", "green"], live: ["jobWorking", "green"],
      finished: ["jobFinished", "neutral"], done: ["jobFinished", "neutral"], closed: ["jobFinished", "neutral"], completed: ["jobFinished", "neutral"],
      cancelled: ["jobCancelled", "neutral"], canceled: ["jobCancelled", "neutral"], void: ["jobCancelled", "neutral"],
      hold: ["jobHold", "warm"], paused: ["jobHold", "warm"], blocked: ["jobHold", "red"],
      declined: ["jobDeclined", "neutral"], rejected: ["jobDeclined", "neutral"], expired: ["jobExpired", "neutral"], inactive: ["jobInactive", "neutral"],
      pending_payment: ["jobPayment", "warm"], awaiting_payment: ["jobPayment", "warm"],
    };
    const known = Object.hasOwn(keys, normalized) ? keys[normalized] : null;
    return known ? { text: t(known[0]), tone: known[1] } : { text: raw || t("noStatus"), tone: "neutral" };
  }

  function paymentStatus(value) {
    const raw = cleanText(value, "", 100);
    const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
    const keys = {
      paid: "paymentPaid", verified: "paymentVerified", approved: "paymentVerified", pending: "paymentPending",
      pending_review: "paymentReview", review: "paymentReview", unpaid: "paymentUnpaid", partial: "paymentPartial",
      partially_paid: "paymentPartial", deposit_paid: "paymentDeposit", refunded: "paymentRefunded", rejected: "paymentRejected",
    };
    return raw ? t("paymentPrefix", { status: Object.hasOwn(keys, normalized) ? t(keys[normalized]) : raw }) : t("unknownPayment");
  }

  function jobHref(job) {
    const key = safeId(job.job_id) ? "job_id" : safeId(job.session_id, 119) ? "session_id" : "";
    return key ? toConsole(`/internal/admin/jobs/all?${new URLSearchParams({ [key]: job[key] })}`) : "";
  }

  function fact(list, key, value, reference = false) {
    const wrapper = node("div", "ac-fact");
    wrapper.append(translatedNode("dt", "", key), node("dd", reference ? "ac-reference" : "", value || "—"));
    list.append(wrapper);
  }

  function detailLink(key, href) {
    const link = translatedNode("a", "", key);
    link.href = toConsole(href);
    return link;
  }

  function renderJob(job, index) {
    const customer = cleanText(job.customer_name, t("noName"));
    const model = cleanText(job.model_name, t("noName"));
    const row = node("li", "ac-job");
    const headline = node("div", "ac-job-row");
    const when = node("div", "ac-job-time");
    const hasTime = typeof job.time_only === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(job.time_only);
    const time = hasTime ? job.time_only : t("noTime");
    when.append(node("strong", hasTime ? "" : "ac-time-unknown", time), node("span", "", dateLabel(job.job_date)));

    const people = node("div", "ac-job-people");
    for (const [key, name] of [["customerLabel", customer], ["modelLabel", model]]) {
      const person = node("div", "ac-person");
      const title = node("strong", "", name);
      if (key === "customerLabel") title.id = `ac-job-name-${index}`;
      person.append(translatedNode("span", "ac-field-label", key), title);
      people.append(person);
    }

    const finance = job.finance && typeof job.finance === "object" && !Array.isArray(job.finance) ? job.finance : null;
    const status = jobStatus(job.raw_status);
    const statusCell = node("div", "ac-job-state");
    const badge = node("span", "ac-status-pill", status.text);
    badge.dataset.tone = status.tone;
    statusCell.append(badge, node("span", "ac-payment-state", paymentStatus(finance?.payment_status)));

    const total = node("div", "ac-job-amount");
    total.append(translatedNode("span", "ac-field-label", "amountLabel"), node("strong", "", amount(finance?.amount_thb)), node("small", "", `${t("payoutLabel")} ${amount(finance?.model_payout_thb)}`));
    const action = node("div", "ac-job-go");
    const href = jobHref(job);
    if (href) {
      const link = node("a", "ac-button ac-open-job");
      link.href = href;
      link.setAttribute("aria-label", `${t("openJob")} · ${customer} · ${model}`);
      link.append(translatedNode("span", "", "openJob"), glyph());
      action.append(link);
    } else action.append(translatedNode("span", "ac-unavailable-link", "cannotOpenJob"));
    headline.append(when, people, statusCell, total, action);

    const details = node("details", "ac-job-details");
    const summary = node("summary");
    summary.append(translatedNode("span", "", "details"), glyph("chevron"));
    const body = node("div", "ac-job-detail-body");
    const facts = node("dl", "ac-facts");
    fact(facts, "jobId", cleanText(job.job_id, "", 139), true);
    fact(facts, "sessionId", cleanText(job.session_id, "", 119), true);
    fact(facts, "rawStatus", cleanText(job.raw_status, t("noStatus"), 100));
    if (clientId(job.client_id)) fact(facts, "clientId", job.client_id, true);
    fact(facts, "customerAck", timestamp(finance?.customer_ack_at) || t("unknownAck"));
    fact(facts, "modelAck", timestamp(finance?.model_ack_at) || t("unknownAck"));
    fact(facts, "paymentRef", cleanText(finance?.payment_ref, "", 120), true);
    fact(facts, "depositDue", amount(finance?.deposit_due_thb));
    fact(facts, "depositReceived", amount(finance?.deposit_received_thb));
    fact(facts, "balance", amount(finance?.balance_thb));
    body.append(facts);
    const links = node("nav", "ac-detail-actions");
    if (clientId(job.client_id)) links.append(detailLink("openCustomer", `/internal/admin/customer-data?${new URLSearchParams({ client_id: job.client_id })}`));
    const paymentQuery = safeId(job.session_id, 119) ? "?" + new URLSearchParams({ session_id: job.session_id }) : "";
    links.append(detailLink("reviewPayment", "/internal/admin/payments" + paymentQuery));
    body.append(links);
    details.append(summary, body);
    row.append(headline, details);
    row.setAttribute("aria-labelledby", `ac-job-name-${index}`);
    return row;
  }

  function validatePayload(data, requested) {
    const integer = value => Number.isSafeInteger(value) && value >= 0;
    if (!data || data.ok !== true || data.view !== "jobs" || !Array.isArray(data.jobs) || !data.filters || !data.pagination || !data.counts || !timestamp(data.generated_at)) throw new Error("error");
    const page = data.pagination;
    if (![page.page, page.page_size, page.total, page.total_pages].every(integer) || page.page < 1 || page.page_size !== PAGE_SIZE || page.total_pages !== Math.max(1, Math.ceil(page.total / page.page_size)) || page.page > page.total_pages) throw new Error("error");
    if (page.has_prev !== (page.page > 1) || page.has_next !== (page.page < page.total_pages) || data.jobs.length !== Math.min(page.page_size, page.total - (page.page - 1) * page.page_size)) throw new Error("error");
    for (const key of ["today", "upcoming", "undated", "all"]) if (!integer(data.counts[key]) || data.counts[key] > data.counts.all) throw new Error("error");
    if (data.counts.filtered !== page.total || page.total > data.counts.all) throw new Error("error");
    if ((data.filters.job_date || null) !== (requested.date === "all" ? null : requested.date) || (data.filters.q || null) !== (requested.q || null)) throw new Error("error");
    for (const key of scopeKeys) if ((data.filters[key] || null) !== (requested.scope[key] || null)) throw new Error("error");
    for (const job of data.jobs) {
      if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("error");
      if (requested.date !== "all" && job.job_date !== requested.date) throw new Error("error");
      if (requested.scope.client_id && job.client_id !== requested.scope.client_id) throw new Error("error");
      if (requested.scope.session_id && job.session_id !== requested.scope.session_id && job.id !== requested.scope.session_id) throw new Error("error");
      if (requested.scope.job_id && job.job_id !== requested.scope.job_id && job.id !== requested.scope.job_id) throw new Error("error");
    }
    return data;
  }

  function render(data) {
    renderedLanguage = document.documentElement.lang || "th";
    payload = data;
    state.page = data.pagination.page;
    storeHistory("replace");
    syncFilters();
    for (const value of root.querySelectorAll("[data-count]")) value.textContent = numberFormat.format(data.counts[value.dataset.count]);
    const fragment = document.createDocumentFragment();
    data.jobs.forEach((job, index) => fragment.append(renderJob(job, index)));
    $("jobs").replaceChildren(fragment);
    const start = data.pagination.total ? (data.pagination.page - 1) * data.pagination.page_size + 1 : 0;
    const end = start + data.jobs.length - 1;
    $("results-summary").textContent = data.pagination.total ? t("results", { total: numberFormat.format(data.pagination.total), start: numberFormat.format(start), end: numberFormat.format(end) }) : t("zeroResults");
    $("page-label").textContent = t("page", { page: numberFormat.format(data.pagination.page), pages: numberFormat.format(data.pagination.total_pages) });
    $("pagination").hidden = data.pagination.total_pages < 2;
    $("updated").textContent = t("updated", { time: timestamp(data.generated_at) });
    $("status").textContent = t("loaded", { count: numberFormat.format(data.jobs.length) });
    $("loading").hidden = true;
    $("error").hidden = true;
    $("progress").value = 100;
    $("progress").hidden = true;
    if (!data.jobs.length) {
      const filtered = Boolean(state.q || Object.keys(state.scope).length);
      $("empty-title").textContent = t(filtered ? "noJobsSearch" : state.date === today() ? "noJobsToday" : state.date === "all" ? "noJobsAll" : "noJobsDate");
      $("empty-body").textContent = t(filtered ? "noJobsFilteredDescription" : "noJobsDescription");
      $("empty-all").hidden = state.date === "all";
      $("empty").hidden = false;
    }
    root.dataset.state = data.jobs.length ? "ready" : "empty";
  }

  async function load() {
    if (!state) return;
    const current = ++requestNumber;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const requested = { ...state, scope: { ...state.scope } };
    clearData();
    setBusy(true);
    root.dataset.state = "loading";
    $("loading").hidden = false;
    $("progress").hidden = false;
    $("progress").removeAttribute("value");
    $("status").textContent = t("loading");
    $("results-summary").textContent = t("loading");
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(apiUrl(), {
        method: "GET", credentials: "include", cache: "no-store", redirect: "manual",
        headers: { accept: "application/json" }, signal: controller.signal,
      });
      if (response.status === 401 || response.type === "opaqueredirect" || response.redirected || (response.status >= 300 && response.status < 400)) throw new Error("expired");
      if (response.status === 403) throw new Error("forbidden");
      if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("error");
      const body = await response.text();
      if (body.length > 524288) throw new Error("error");
      const data = validatePayload(JSON.parse(body), requested);
      if (current !== requestNumber) return;
      render(data);
    } catch (error) {
      if (current !== requestNumber) return;
      showError(timedOut ? "timeout" : error.message);
    } finally {
      window.clearTimeout(timeout);
      if (current === requestNumber) { activeController = null; setBusy(false); }
    }
  }

  function navigate(next, historyMode = "push") {
    if (!Object.hasOwn(next, "lang")) next.lang = state?.lang || locationLanguage();
    state = next;
    syncFilters();
    storeHistory(historyMode);
    void load();
  }

  function clearFilters() {
    $("query").setCustomValidity("");
    $("date").setCustomValidity("");
    navigate({ date: "all", q: "", page: 1, scope: {} });
  }

  function readAndLoad(historyMode = "replace") {
    try {
      state = readLocation();
      syncFilters();
      storeHistory(historyMode);
      void load();
    } catch (_) {
      requestNumber++;
      activeController?.abort();
      activeController = null;
      state = null;
      showError("invalid");
    }
  }

  $("today-label").textContent = dateLabel(today(), true);
  $("today-label").dateTime = today();
  $("filters").addEventListener("submit", event => {
    event.preventDefault();
    if (!state) return;
    try {
      const date = $("date").value || "all";
      if (date !== "all" && !isDate(date)) throw new Error("invalid");
      navigate({ date, q: searchQuery($("query").value), page: 1, scope: { ...(state?.scope || {}) } });
    } catch (_) {
      requestNumber++;
      activeController?.abort();
      showError("invalid");
    }
  });
  $("query").addEventListener("input", () => $("query").setCustomValidity(""));
  $("date").addEventListener("change", () => {
    if (!state) return;
    const date = $("date").value || "all";
    if (date !== "all" && !isDate(date)) return;
    navigate({ date, q: state?.q || "", page: 1, scope: { ...(state?.scope || {}) } });
  });
  $("today").addEventListener("click", () => { if (state) navigate({ date: today(), q: state.q, page: 1, scope: { ...state.scope } }); });
  $("all-dates").addEventListener("click", () => { if (state) navigate({ date: "all", q: state.q, page: 1, scope: { ...state.scope } }); });
  $("clear-filters").addEventListener("click", clearFilters);
  $("clear-scope").addEventListener("click", () => { if (state) navigate({ ...state, page: 1, scope: {} }); });
  $("empty-all").addEventListener("click", () => { if (state) navigate({ ...state, date: "all", page: 1 }); });
  $("refresh").addEventListener("click", () => state ? void load() : readAndLoad());
  $("retry").addEventListener("click", () => state ? void load() : readAndLoad());
  $("previous").addEventListener("click", () => {
    if (!busy && payload?.pagination.has_prev) navigate({ ...state, page: state.page - 1 });
  });
  $("next").addEventListener("click", () => {
    if (!busy && payload?.pagination.has_next) navigate({ ...state, page: state.page + 1 });
  });
  window.addEventListener("pagehide", () => {
    requestNumber++;
    activeController?.abort();
    activeController = null;
    clearData();
    lastHomeUrl = null;
  });
  const repaintLanguage = () => {
    if (payload && !busy) render(payload);
    else if (["error", "expired", "forbidden", "invalid", "timeout"].includes(root.dataset.state)) showError(root.dataset.state);
    renderedLanguage = document.documentElement.lang || "th";
    syncFilters();
  };
  // The canonical core dispatches non-bubbling events on document.
  document.addEventListener("mmd:i18n:ready", repaintLanguage);
  document.addEventListener("mmd:i18n:applied", () => {
    if ((document.documentElement.lang || "th") !== renderedLanguage) repaintLanguage();
  });
  const menu = root.querySelector(".ac-mobile-tools");
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
  });
  document.addEventListener("click", event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  readAndLoad();
  return () => {
    if (lastHomeUrl !== window.location.href) readAndLoad("none");
  };
}
