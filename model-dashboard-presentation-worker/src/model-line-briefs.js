export const MODEL_LINE_BRIEFS_JS = `(() => {
  "use strict";
  const ROOT_ID = "mmd-model-line-briefs-v1";
  const DICT_URL = "https://cdn.jsdelivr.net/gh/mmdprive/mmd-i18n@main/assets/i18n/pages/model-line-job-briefs.js";
  const LIFF_IDS = { developing: "2010864852-MuzunIKU", review: "2010864853-7SqCQVxy", published: "2010864854-N34SgCqq" };
  const ENDPOINT = "/v1/model/line-briefs";
  const KEYS = {
    title: "jobBrief.title", intro: "jobBrief.intro", refresh: "jobBrief.refresh", hidden: "jobBrief.hidden",
    open: "jobBrief.open", close: "jobBrief.close", date: "jobBrief.date", area: "jobBrief.area",
    format: "jobBrief.format", duties: "jobBrief.duties", customers: "jobBrief.customers", hours: "jobBrief.hours",
    models: "jobBrief.models", note: "jobBrief.note", interest: "jobBrief.interest", decline: "jobBrief.decline",
    saved: "jobBrief.saved", interestPending: "jobBrief.interestPending", error: "jobBrief.error", empty: "jobBrief.empty", expired: "jobBrief.expired",
    apply: "jobBrief.apply", loading: "jobBrief.loading", status: "jobBrief.status", hiddenLabel: "jobBrief.hiddenLabel",
  };
  const EN = {
    title: "Available assignments", intro: "Review the brief and tell MMD whether you are interested.", refresh: "Refresh",
    hidden: "Include hidden briefs", open: "View details", close: "Close", date: "Date and time", area: "Area",
    format: "Format", duties: "Duties", customers: "Customers", hours: "Hours", models: "Models needed",
    note: "Note", interest: "I'm interested", decline: "Not interested", saved: "Your response was saved.", interestPending: "Interest sent. MMD will review it. This does not confirm the job.",
    error: "We could not load this brief. Please try again.", empty: "No available briefs at this time.", expired: "This brief has expired.",
    apply: "Continue model application", loading: "Loading briefs…", status: "Status", hiddenLabel: "Hidden",
  };
  const LANG = new URLSearchParams(location.search).get("lang") || "th";
  const params = new URLSearchParams(location.search);
  const nested = new URLSearchParams((params.get("liff.state") || params.get("liff_state") || "").split("?").pop());
  const DEEP_BRIEF_ID = params.get("brief_id") || nested.get("brief_id") || "";
  const requestedEnv = params.get("liff_env") || nested.get("liff_env") || "published";
  const ENV = Object.hasOwn(LIFF_IDS, requestedEnv) ? requestedEnv : "published";
  let token = "", busy = false, hidden = false;
  function t(name) {
    const table = window.I18N_DICT && window.I18N_DICT[LANG];
    const value = table && table[KEYS[name]];
    return typeof value === "string" && value.trim() ? value : EN[name];
  }
  function el(tag, cls, value) { const n = document.createElement(tag); if (cls) n.className = cls; if (value != null) n.textContent = String(value); return n; }
  function mount() {
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
    const root = el("section", "mmd-line-briefs"); root.id = ROOT_ID; root.setAttribute("aria-labelledby", ROOT_ID + "-title");
    const head = el("header", "mmd-line-briefs__head");
    const title = el("h1", "", t("title")); title.id = ROOT_ID + "-title"; head.append(title);
    head.append(el("p", "", t("intro")));
    const tools = el("div", "mmd-line-briefs__tools");
    const hiddenLabel = el("label", "mmd-line-briefs__toggle"); const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.addEventListener("change", () => { hidden = toggle.checked; load(); }); hiddenLabel.append(toggle, document.createTextNode(" " + t("hidden")));
    const refresh = el("button", "mmd-line-briefs__button", t("refresh")); refresh.type = "button"; refresh.addEventListener("click", load); tools.append(hiddenLabel, refresh); head.append(tools);
    const status = el("p", "mmd-line-briefs__status", t("loading")); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const list = el("div", "mmd-line-briefs__list"); list.setAttribute("aria-live", "polite"); root.append(head, status, list);
    document.body.prepend(root); return root;
  }
  function request(action, briefId, extra) {
    return fetch(ENDPOINT, { method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(Object.assign({ action, idToken: token, environment: ENV, brief_id: briefId || undefined, include_hidden: hidden }, extra || {})) });
  }
  function safeText(value) { return typeof value === "string" ? value : ""; }
  function dateText(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? safeText(value) : new Intl.DateTimeFormat(LANG, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(d); }
  function field(card, label, value) { if (value == null || value === "") return; const row = el("p", "mmd-line-briefs__field"); row.append(el("strong", "", label + ": "), document.createTextNode(String(value))); card.append(row); }
  function applyLink(id) { const link = el("a", "mmd-line-briefs__button mmd-line-briefs__button--secondary", t("apply")); const url = new URL("/sigil/model/dashboard", location.origin); url.searchParams.set("flow", "apply"); if (id) url.searchParams.set("brief_id", id); if (ENV !== "published") url.searchParams.set("liff_env", ENV); link.href = url.toString(); return link; }
  function cardFor(item) {
    const card = el("article", "mmd-line-briefs__card"); card.dataset.briefId = safeText(item.brief_id);
    card.append(el("h2", "", safeText(item.title) || "Assignment"));
    field(card, t("date"), dateText(item.starts_at)); field(card, t("area"), item.area); field(card, t("format"), item.format);
    if (item.hidden) card.append(el("span", "mmd-line-briefs__badge", t("hiddenLabel")));
    const details = el("details", "mmd-line-briefs__details"); const summary = el("summary", "", t("open")); details.append(summary);
    const body = el("div", "mmd-line-briefs__detail");
    field(body, t("duties"), item.duties); field(body, t("customers"), item.customer_count); field(body, t("hours"), item.hours);
    field(body, t("models"), item.model_count); field(body, t("note"), item.public_note); field(body, t("status"), item.status);
    details.append(body); details.addEventListener("toggle", async () => {
      summary.textContent = details.open ? t("close") : t("open");
      if (details.open && !details.dataset.loaded) {
        try { const response = await request("detail", item.brief_id); if (response.ok) { const payload = await response.json(); const full = payload.item || payload.brief || payload; body.replaceChildren(); field(body, t("duties"), full.duties); field(body, t("customers"), full.customer_count); field(body, t("hours"), full.hours); field(body, t("models"), full.model_count); field(body, t("note"), full.public_note); field(body, t("status"), full.status); details.dataset.loaded = "1"; } } catch (_) { showError(); }
      }
    }); card.append(details);
    const actions = el("div", "mmd-line-briefs__actions");
    const interest = el("button", "mmd-line-briefs__button", t("interest")); interest.type = "button";
    const decline = el("button", "mmd-line-briefs__button mmd-line-briefs__button--secondary", t("decline")); decline.type = "button";
    if (item.my_interest === "interested" || item.my_interest === "not_interested") {
      const interested = item.my_interest === "interested";
      interest.setAttribute("aria-pressed", interested ? "true" : "false");
      decline.setAttribute("aria-pressed", interested ? "false" : "true");
      if (interested) interest.classList.add("is-selected"); else decline.classList.add("is-selected");
    }
    if (item.status !== "published") { interest.disabled = true; decline.disabled = true; }
    for (const [button, value] of [[interest, "interested"], [decline, "not_interested"]]) button.addEventListener("click", async () => {
      if (busy) return; busy = true; button.disabled = true;
      try { const response = await request("respond", item.brief_id, { interest: value }); if (!response.ok) throw new Error("response_failed"); const result = await response.json(); if (!result.ok) throw new Error("response_failed"); await load(); statusText(value === "interested" ? t("interestPending") : t("saved")); } catch (_) { showError(); } finally { busy = false; button.disabled = false; }
    });
    actions.append(interest, decline); if (item.status === "published" && item.identity_stage === "application_required" && item.my_interest === "interested") actions.append(applyLink(item.brief_id)); card.append(actions); return card;
  }
  let root, statusNode, listNode;
  function readyMount() { if (root) return; root = mount(); statusNode = root.querySelector(".mmd-line-briefs__status"); listNode = root.querySelector(".mmd-line-briefs__list"); }
  function statusText(value) { statusNode.textContent = value; }
  function showError() { statusText(t("error")); }
  async function load() {
    if (!token) return; statusText(t("loading")); listNode.replaceChildren();
    try { const response = await request("list"); if (!response.ok) throw new Error("list_failed"); const payload = await response.json(); const items = Array.isArray(payload.items) ? payload.items : [];
      if (DEEP_BRIEF_ID && !items.some(item => item.brief_id === DEEP_BRIEF_ID)) {
        const detail = await request("detail", DEEP_BRIEF_ID);
        if (detail.ok) { const data = await detail.json(); if (data.brief) items.unshift({ ...data.brief, my_interest: data.my_interest, identity_stage: data.identity_stage }); }
      }
      if (!items.length) { statusText(t("empty")); return; }
      statusText(""); items.sort((a, b) => (a.brief_id === DEEP_BRIEF_ID ? -1 : b.brief_id === DEEP_BRIEF_ID ? 1 : 0)); items.forEach(item => { const card = cardFor(item); listNode.append(card); if (item.status !== "published") { card.classList.add("is-expired"); card.append(el("p", "mmd-line-briefs__expired", t("expired"))); } });
    } catch (_) { showError(); }
  }
  function withScript(url, id) { return new Promise((resolve, reject) => { if (document.getElementById(id)) return resolve(); const script = document.createElement("script"); script.id = id; script.src = url; script.onload = resolve; script.onerror = reject; document.head.append(script); }); }
  async function start() {
    try { await withScript(DICT_URL, "mmd-line-briefs-i18n").catch(() => {}); readyMount(); await withScript("https://static.line-scdn.net/liff/edge/2/sdk.js", "mmd-line-briefs-liff");
      if (!window.liff) throw new Error("liff_unavailable"); await window.liff.init({ liffId: LIFF_IDS[ENV], withLoginOnExternalBrowser: true });
      if (!window.liff.isLoggedIn()) { window.liff.login({ redirectUri: location.href }); return; }
      token = window.liff.getIDToken(); if (!token) throw new Error("id_token_unavailable"); load();
    } catch (_) { readyMount(); showError(); }
  }
  start();
})();`;

export const MODEL_LINE_BRIEFS_CSS = `
.mmd-line-briefs{box-sizing:border-box;width:min(100% - 24px,820px);margin:24px auto;padding:20px;color:#f7f5f0;background:#111;border:1px solid #393631;border-radius:20px;font:16px/1.6 "IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif}
.mmd-line-briefs *{box-sizing:border-box}.mmd-line-briefs__head h1{margin:0;font-size:clamp(24px,6vw,34px);line-height:1.3}.mmd-line-briefs__head p{margin:8px 0;color:#d0cbc1}.mmd-line-briefs__tools,.mmd-line-briefs__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}.mmd-line-briefs__toggle{display:flex;align-items:center;gap:8px;min-height:44px}.mmd-line-briefs__status{min-height:1.6em;color:#e4d3a7}.mmd-line-briefs__list{display:grid;gap:14px}.mmd-line-briefs__card{min-width:0;padding:18px;border:1px solid #4a463e;border-radius:16px;background:#1b1a18}.mmd-line-briefs__card h2{margin:0 0 8px;font-size:20px;line-height:1.4}.mmd-line-briefs__field{margin:5px 0;overflow-wrap:anywhere;color:#e1ddd6}.mmd-line-briefs__field strong{color:#c5a765}.mmd-line-briefs__badge{display:inline-block;padding:2px 9px;border:1px solid #8f7747;border-radius:999px;color:#f1d797;font-size:13px}.mmd-line-briefs__details{margin-top:12px}.mmd-line-briefs__details summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:#f1d797;text-decoration:underline;text-underline-offset:3px}.mmd-line-briefs__detail{padding:8px 0}.mmd-line-briefs__button{display:inline-flex;justify-content:center;align-items:center;min-height:46px;padding:9px 16px;border:1px solid #d3b66f;border-radius:12px;background:#d3b66f;color:#15130f;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.mmd-line-briefs__button--secondary{background:transparent;color:#f7f5f0;border-color:#81775f}.mmd-line-briefs__button.is-selected{box-shadow:inset 0 0 0 2px #fff}.mmd-line-briefs__button:disabled{opacity:.6;cursor:wait}.mmd-line-briefs__button:focus-visible,.mmd-line-briefs__toggle input:focus-visible,.mmd-line-briefs__details summary:focus-visible{outline:3px solid #fff;outline-offset:3px}.mmd-line-briefs__card.is-expired{opacity:.72}.mmd-line-briefs__expired{color:#ffce8b;font-weight:700}@media(max-width:480px){.mmd-line-briefs{width:100%;margin:12px auto;padding:16px;border-radius:0}.mmd-line-briefs__actions{display:grid;grid-template-columns:1fr}.mmd-line-briefs__actions>*{width:100%}}
`;
