(() => {
  "use strict";

  const root = document.querySelector("[data-mmd-create-session-pro]");
  if (!root) return;

  const ADMIN_GATE_SESSION_KEY = "mmd_admin_gate_v1";
  const qs = new URLSearchParams(window.location.search);
  const userConfig = window.MMD_CREATE_SESSION_CONFIG || {};
  const config = {
    adminBase:
      root.dataset.adminBase ||
      userConfig.adminBase ||
      "https://admin-worker.malemodel-bkk.workers.dev",
    mock: qs.has("mock") || userConfig.mock === true,
    debug: qs.has("debug") || userConfig.debug === true,
    endpoints: {
      authMe: "/v1/admin/auth/me",
      ping: "/v1/admin/ping",
      clientLookup: "/v1/admin/clients/lineage-lookup",
      recentClients: "/v1/admin/clients/recent",
      modelSearch: "/v1/admin/models/search",
      saveDraft: "/v1/admin/job/draft",
      createSession: "/v1/admin/job/create",
      pushLine: "/v1/admin/line/push",
      ...(userConfig.endpoints || {})
    }
  };

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));

  const state = {
    clients: [],
    selectedClient: null,
    workType: "",
    privateOrientation: "",
    modelFolder: "",
    models: [],
    selectedModel: null,
    draftId: "",
    created: null,
    lastPayload: null
  };

  const el = {
    connection: $("[data-op-connection]"),
    checkSession: $("[data-op-check-session]"),
    status: $("[data-op-status]"),
    query: $("[data-op-client-query]"),
    searchClient: $("[data-op-search-client]"),
    demoClient: $("[data-op-demo-client]"),
    loadRecent: $("[data-op-load-recent]"),
    clearClient: $("[data-op-clear-client]"),
    clientResults: $("[data-op-client-results]"),
    searchMode: $("[data-op-search-mode]"),
    nextAction: $("[data-op-next-action]"),
    nextCopy: $("[data-op-next-copy]"),
    statClient: $("[data-op-stat-client]"),
    statPackage: $("[data-op-stat-package]"),
    statWork: $("[data-op-stat-work]"),
    statFolder: $("[data-op-stat-folder]"),
    statModel: $("[data-op-stat-model]"),
    statGate: $("[data-op-stat-gate]"),
    statStatus: $("[data-op-stat-status]"),
    clientInitial: $("[data-op-client-initial]"),
    selectedClientName: $("[data-op-selected-client-name]"),
    selectedClientMeta: $("[data-op-selected-client-meta]"),
    selectedConfidence: $("[data-op-selected-confidence]"),
    lineageBadge: $("[data-op-lineage-badge]"),
    lineageNotice: $("[data-op-lineage-notice]"),
    clientName: $("[data-op-client-name]"),
    username: $("[data-op-username]"),
    package: $("[data-op-package]"),
    membershipStatus: $("[data-op-membership-status]"),
    lineDisplay: $("[data-op-line-display]"),
    lineUserId: $("[data-op-line-user-id]"),
    lineRecordId: $("[data-op-line-record-id]"),
    legacyTags: $("[data-op-legacy-tags]"),
    folderGrid: $("[data-op-folder-grid]"),
    folderHelper: $("[data-op-folder-helper]"),
    railFolder: $("[data-op-rail-folder]"),
    railFolderCopy: $("[data-op-rail-folder-copy]"),
    refreshModels: $("[data-op-refresh-models]"),
    modelRule: $("[data-op-model-rule]"),
    modelSelect: $("[data-op-model-select]"),
    modelLookupKey: $("[data-op-model-lookup-key]"),
    modelPool: $("[data-op-model-pool]"),
    modelPreview: $("[data-op-model-preview]"),
    customerTelegram: $("[data-op-customer-telegram]"),
    customerTelegramStatus: $("[data-op-customer-telegram-status]"),
    modelTelegram: $("[data-op-model-telegram]"),
    modelTelegramStatus: $("[data-op-model-telegram-status]"),
    gateLabel: $("[data-op-gate-label]"),
    gateNotice: $("[data-op-gate-notice]"),
    date: $("[data-op-date]"),
    start: $("[data-op-start]"),
    duration: $("[data-op-duration]"),
    end: $("[data-op-end]"),
    location: $("[data-op-location]"),
    map: $("[data-op-map]"),
    amount: $("[data-op-amount]"),
    paymentType: $("[data-op-payment-type]"),
    paymentMethod: $("[data-op-payment-method]"),
    pointsMode: $("[data-op-points-mode]"),
    humanAssistant: $("[data-op-human-assistant]"),
    escalationOwner: $("[data-op-escalation-owner]"),
    handlingNote: $("[data-op-handling-note]"),
    note: $("[data-op-note]"),
    saveDraft: $("[data-op-save-draft]"),
    fillDemoJob: $("[data-op-fill-demo-job]"),
    readyLabel: $("[data-op-ready-label]"),
    readyCopy: $("[data-op-ready-copy]"),
    debugToggle: $("[data-op-debug-toggle]"),
    debugPanel: $("[data-op-debug-panel]"),
    payload: $("[data-op-payload]"),
    create: $("[data-op-create]"),
    output: $("[data-op-output]"),
    outSessionId: $("[data-op-out-session-id]"),
    outPaymentRef: $("[data-op-out-payment-ref]"),
    outLineStatus: $("[data-op-out-line-status]"),
    outTelegramStatus: $("[data-op-out-telegram-status]"),
    outCustomerUrl: $("[data-op-out-customer-url]"),
    outModelUrl: $("[data-op-out-model-url]"),
    outMemberUrl: $("[data-op-out-member-url]"),
    outModelReturnUrl: $("[data-op-out-model-return-url]"),
    outCustomerMessage: $("[data-op-out-customer-message]"),
    outModelMessage: $("[data-op-out-model-message]"),
    copyCustomerLink: $("[data-op-copy-customer-link]"),
    copyModelLink: $("[data-op-copy-model-link]"),
    copyCustomerMsg: $("[data-op-copy-customer-msg]"),
    copyModelMsg: $("[data-op-copy-model-msg]"),
    pushLine: $("[data-op-push-line]"),
    newSession: $("[data-op-new]")
  };

  const folders = {
    public: [
      ["travel", "Travel Model", "แฟ้ม Public Work สำหรับ social / travel / public-facing session", "Choose Travel"],
      ["extreme", "Extreme Model", "แฟ้ม Public Work ที่ต้องใช้ energy / performance / intensity สูงกว่า", "Choose Extreme"]
    ],
    private: [
      ["standard", "Standard", "แฟ้ม Private Work สำหรับ membership Standard (active) ขึ้นไป", "Choose Standard"],
      ["premium", "Premium", "แฟ้ม Private Work สำหรับ membership Premium (active) ขึ้นไป", "Choose Premium"],
      ["vip", "VIP", "แฟ้ม Private Work สำหรับ membership VIP (active) ขึ้นไป", "Choose VIP"],
      ["exclusive", "Exclusive", "แฟ้ม Private Work สำหรับ Black Card (active) เท่านั้น", "Choose Exclusive"]
    ]
  };

  const durations = [
    ["01:30", "1.30 ชม."],
    ["02:00", "2.00 ชม."],
    ["02:30", "2.30 ชม."],
    ["03:00", "3.00 ชม."],
    ["03:30", "3.30 ชม."],
    ["04:00", "4.00 ชม."],
    ["05:00", "5.00 ชม."],
    ["06:00", "6.00 ชม."],
    ["06:00+", "มากกว่า 6 ชม."]
  ];

  const demoClients = [
    {
      client_id: "cli_ruch_001",
      member_id: "mmd_demo_ruch_001",
      member_email: "ruch.vip@demo.mmd",
      client_name: "รัช",
      username: "ruch vip",
      phone: "hidden",
      package_code: "VIP",
      tier: "vip",
      membership_status: "active",
      purchased_history: "purchased / private inquiry",
      line_record_id: "line_rec_ruch_vip_001",
      line_user_id: "U_ruch_vip_line",
      line_display_name: "รัช VIP",
      legacy_tags: ["#client", "#purchased", "-vip-", "private-inquiry"],
      last_line_message: "สอบถาม Private / VIP session จาก LINE ครับ",
      customer_telegram_username: "@ruch_vip",
      customer_telegram_status: "linked",
      confidence: 96
    },
    {
      client_id: "cli_man_001",
      member_id: "mmd_demo_man_001",
      member_email: "man.premium@demo.mmd",
      client_name: "Man",
      username: "man 24",
      phone: "hidden",
      package_code: "Premium",
      tier: "premium",
      membership_status: "active",
      purchased_history: "package signup / travel request",
      line_record_id: "line_rec_001",
      line_user_id: "U8a7b2f9c_man",
      line_display_name: "Man",
      legacy_tags: ["#client", "#purchased", "#mem2026"],
      last_line_message: "อยากจอง Travel Model คืนวันศุกร์ครับ",
      customer_telegram_username: "@man_mmd",
      customer_telegram_status: "linked",
      confidence: 91
    },
    {
      client_id: "cli_win_002",
      member_id: "mmd_demo_win_002",
      member_email: "win.vip@demo.mmd",
      client_name: "Win",
      username: "win vip",
      phone: "hidden",
      package_code: "VIP",
      tier: "vip",
      membership_status: "active",
      purchased_history: "private package inquiry",
      line_record_id: "line_rec_002",
      line_user_id: "U6d1c9a2b_win",
      line_display_name: "Win",
      legacy_tags: ["#client", "-vip-"],
      last_line_message: "สอบถาม private package ครับ",
      customer_telegram_username: "",
      customer_telegram_status: "missing",
      confidence: 84
    }
  ];

  const demoModels = [
    {
      model_id: "hito",
      model_name: "HITO",
      lookup_key: "TMIB-HITO-01",
      telegram_username: "@hito_sigil",
      telegram_status: "linked",
      folders: ["travel", "extreme", "premium", "vip", "exclusive"],
      orientation: "both",
      status: "available",
      note: "Steady route / calm personal assistant"
    },
    {
      model_id: "kenji",
      model_name: "Kenji",
      lookup_key: "TMIB-KJ-01",
      telegram_username: "@kenji_sigil",
      telegram_status: "linked",
      folders: ["travel", "standard", "premium", "vip"],
      orientation: "straight",
      status: "available",
      note: "Client continuity / premium lead"
    },
    {
      model_id: "tart",
      model_name: "TarT",
      lookup_key: "TMIB-TT-01",
      telegram_username: "@tart_sigil",
      telegram_status: "linked",
      folders: ["travel", "extreme", "standard"],
      orientation: "both",
      status: "available",
      note: "Scout / public work"
    },
    {
      model_id: "yuki",
      model_name: "Yuki",
      lookup_key: "TMIB-YUKI-01",
      telegram_username: "@yuki_sigil",
      telegram_status: "verified",
      folders: ["vip", "exclusive"],
      orientation: "gay",
      status: "approval",
      note: "Approval / partnership authority"
    }
  ];

  const api = (path) => config.adminBase.replace(/\/$/, "") + path;
  const val = (node) => (node ? node.value : "");
  const setVal = (node, value) => {
    if (node) node.value = value == null ? "" : String(value);
  };
  const text = (node, value) => {
    if (node) node.textContent = value == null ? "" : String(value);
  };
  const esc = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");

  function setStatus(message, tone) {
    text(el.status, message);
    if (!el.connection) return;
    el.connection.classList.remove("is-ok", "is-warn", "is-bad");
    el.connection.classList.add(tone === "ok" ? "is-ok" : tone === "warn" ? "is-warn" : "is-bad");
    const label = el.connection.querySelector("span");
    text(label, tone === "ok" ? "Connected" : tone === "warn" ? "Review" : "Unavailable");
  }

  function setHook(name, state) {
    const hook = root.querySelector(`[data-op-hook="${name}"]`);
    if (!hook) return;
    hook.classList.remove("is-ok", "is-warn", "is-bad");
    hook.classList.add(state === "ok" ? "is-ok" : state === "warn" ? "is-warn" : "is-bad");
  }

  function scrollToNode(node) {
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hasAdminGateSession() {
    try {
      return window.sessionStorage.getItem(ADMIN_GATE_SESSION_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function adminRequestHeaders(includeJson) {
    const headers = {};
    if (includeJson) headers["Content-Type"] = "application/json";
    return headers;
  }

  async function apiFetch(path, options) {
    const opts = options || {};
    const method = String(opts.method || "GET").toUpperCase();
    const headers = {
      ...adminRequestHeaders(Boolean(opts.body)),
      ...(opts.headers || {})
    };
    return fetch(api(path), {
      credentials: "same-origin",
      cache: "no-store",
      ...opts,
      method,
      headers
    });
  }

  function normalizeClient(record) {
    return {
      client_id: String(record.client_id || record.id || ""),
      member_id: String(record.member_id || ""),
      member_email: String(record.member_email || record.email || ""),
      remembered_name: String(record.remembered_name || ""),
      canonical_name: String(record.canonical_name || ""),
      aliases: Array.isArray(record.aliases) ? record.aliases.filter(Boolean) : [],
      matched_on: String(record.matched_on || ""),
      matched_value: String(record.matched_value || ""),
      lookup_chain: Array.isArray(record.lookup_chain) ? record.lookup_chain.filter(Boolean) : [],
      client_name: String(record.remembered_name || record.client_name || record.canonical_name || record.name || "Unknown client"),
      username: String(record.username || ""),
      phone: String(record.phone || ""),
      package_code: String(record.package_code || record.package || ""),
      tier: String(record.tier || ""),
      membership_status: String(record.membership_status || ""),
      purchased_history: String(record.purchased_history || record.history || ""),
      line_record_id: String(record.line_record_id || ""),
      line_user_id: String(record.line_user_id || ""),
      line_display_name: String(record.line_display_name || record.line_name || ""),
      legacy_tags: Array.isArray(record.legacy_tags)
        ? record.legacy_tags
        : String(record.legacy_tags || "")
            .split(/[\n,|]+/)
            .map((item) => item.trim())
            .filter(Boolean),
      last_line_message: String(record.last_line_message || record.last_message || ""),
      customer_telegram_username: String(record.customer_telegram_username || record.telegram_username || ""),
      customer_telegram_status: String(record.customer_telegram_status || "missing"),
      confidence: Number(record.confidence || 0)
    };
  }

  function lineageLabel(client) {
    if (!client) return "";
    const remembered = String(client.remembered_name || "").trim();
    const canonical = String(client.canonical_name || "").trim();
    if (remembered && canonical && remembered.toLowerCase() !== canonical.toLowerCase()) {
      return `${remembered} · canonical ${canonical}`;
    }
    return remembered || canonical || client.client_name || "";
  }

  function renderClients(records) {
    state.clients = records.map(normalizeClient);
    if (!el.clientResults) return;
    if (!state.clients.length) {
      el.clientResults.innerHTML = '<div class="mmdop__empty">No client lineage matched this search.</div>';
      return;
    }
    el.clientResults.innerHTML = state.clients
      .map((client, index) => {
        const tags = (client.legacy_tags || []).slice(0, 4).map((tag) => `<span class="mmdop__tag">${esc(tag)}</span>`).join("");
        const packageTag = client.package_code
          ? `<span class="mmdop__tag mmdop__tag--gold">${esc(client.package_code)}</span>`
          : "";
        const membershipTag = client.membership_status
          ? `<span class="mmdop__tag mmdop__tag--green">${esc(client.membership_status)}</span>`
          : "";
        const selected = state.selectedClient && state.selectedClient.client_id === client.client_id;
        const source = client.matched_on ? `match ${esc(client.matched_on)}` : "canonical lineage";
        return `
          <button type="button" class="mmdop__clientCard${selected ? " is-selected" : ""}" data-op-client-index="${index}">
            <span class="mmdop__clientAvatar">${esc((client.client_name || "C").charAt(0).toUpperCase())}</span>
            <span class="mmdop__clientMain">
              <strong>${esc(lineageLabel(client) || client.client_name)}</strong>
              <span>${esc(client.username || client.line_display_name || client.phone || "No public alias")}</span>
              <span>${esc(source)} · ${(client.confidence || 0)}% confidence</span>
            </span>
            <span class="mmdop__tags">${packageTag}${membershipTag}${tags}</span>
          </button>`;
      })
      .join("");

    $$("[data-op-client-index]").forEach((button) => {
      button.addEventListener("click", () => {
        selectClient(state.clients[Number(button.dataset.opClientIndex)] || null);
      });
    });
  }

  function renderSelectedClient() {
    const client = state.selectedClient;
    const name = client ? client.client_name || "Selected client" : "No client selected";
    text(el.selectedClientName, name);
    text(el.clientInitial, name.charAt(0).toUpperCase() || "C");
    text(el.selectedClientMeta, client
      ? [client.username, client.member_email, client.line_display_name].filter(Boolean).join(" · ") || "Canonical client lineage"
      : "Select a client from canonical lineage results.");
    text(el.selectedConfidence, client
      ? `${client.confidence || 0}% confidence${client.matched_on ? ` · ${client.matched_on}` : ""}`
      : "");
    text(el.lineageBadge, client ? "Canonical lineage" : "Not selected");
    text(el.lineageNotice, client
      ? `Selected ${name}. ${client.purchased_history || "No purchase summary exposed."}`
      : "Search and select a client before choosing a work type.");
    setVal(el.clientName, client?.client_name || "");
    setVal(el.username, client?.username || "");
    setVal(el.package, client?.package_code || "");
    setVal(el.membershipStatus, client?.membership_status || "");
    setVal(el.lineDisplay, client?.line_display_name || "");
    setVal(el.lineUserId, client?.line_user_id || "");
    setVal(el.lineRecordId, client?.line_record_id || "");
    setVal(el.legacyTags, (client?.legacy_tags || []).join(", "));
    setVal(el.customerTelegram, client?.customer_telegram_username || "");
    setVal(el.customerTelegramStatus, client?.customer_telegram_status || "missing");
  }

  async function loadRecentClients() {
    setStatus("Loading recent canonical clients…", "warn");
    setHook("lineage", "warn");
    if (config.mock) {
      renderClients(demoClients);
      setStatus("Demo clients loaded.", "ok");
      setHook("lineage", "ok");
      return;
    }
    try {
      const response = await apiFetch(config.endpoints.recentClients);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      renderClients(Array.isArray(data.records) ? data.records : []);
      setStatus(`Loaded ${state.clients.length} recent canonical clients.`, "ok");
      setHook("lineage", "ok");
    } catch (error) {
      renderClients([]);
      setStatus(`Recent clients unavailable: ${error.message}`, "bad");
      setHook("lineage", "bad");
    }
  }

  async function searchClients() {
    const query = val(el.query).trim();
    if (!query) {
      await loadRecentClients();
      return;
    }
    setStatus("Searching canonical client lineage…", "warn");
    setHook("lineage", "warn");
    if (config.mock) {
      const needle = query.toLowerCase();
      const filtered = demoClients.filter((client) =>
        JSON.stringify(client).toLowerCase().includes(needle)
      );
      renderClients(filtered.length ? filtered : demoClients);
      setStatus("Demo lineage search complete.", "ok");
      setHook("lineage", "ok");
      return;
    }
    try {
      const response = await apiFetch(config.endpoints.clientLookup, {
        method: "POST",
        body: JSON.stringify({ query })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      renderClients(Array.isArray(data.records) ? data.records : []);
      setStatus(`Found ${state.clients.length} canonical client match${state.clients.length === 1 ? "" : "es"}.`, "ok");
      setHook("lineage", "ok");
    } catch (error) {
      renderClients([]);
      setStatus(`Client lookup unavailable: ${error.message}`, "bad");
      setHook("lineage", "bad");
    }
  }

  function selectClient(client) {
    if (!client) return;
    state.selectedClient = normalizeClient(client);
    state.workType = "";
    state.privateOrientation = "";
    state.modelFolder = "";
    state.models = [];
    state.selectedModel = null;
    renderClients(state.clients);
    renderSelectedClient();
    renderFolders();
    renderModels();
    updateAll();
    setStatus("Client lineage selected.", "ok");
    scrollToNode($("#work-panel"));
  }

  function clearClient() {
    state.selectedClient = null;
    state.workType = "";
    state.privateOrientation = "";
    state.modelFolder = "";
    state.models = [];
    state.selectedModel = null;
    renderSelectedClient();
    renderFolders();
    renderModels();
    updateAll();
    scrollToNode($("#client-search"));
  }

  function selectWorkType(type) {
    if (!state.selectedClient) {
      setStatus("Select a client before choosing a work type.", "warn");
      return;
    }
    state.workType = type;
    state.privateOrientation = "";
    state.modelFolder = "";
    state.models = [];
    state.selectedModel = null;
    $$(`[data-op-work-type]`).forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.opWorkType === type);
    });
    renderFolders();
    renderModels();
    updateAll();
    scrollToNode(el.folderGrid);
  }

  function renderFolders() {
    if (!el.folderGrid) return;
    const type = state.workType;
    if (!type) {
      el.folderGrid.innerHTML = '<div class="mmdop__empty">Select Public or Private after choosing a client.</div>';
      text(el.folderHelper, "Client first → work type → folder → model.");
      return;
    }
    const items = folders[type] || [];
    el.folderGrid.innerHTML = items
      .map(([key, label, copy, cta]) => `
        <button type="button" class="mmdop__folder${state.modelFolder === key ? " is-selected" : ""}" data-op-folder="${esc(key)}">
          <span>${type === "private" ? "private lane" : "public lane"}</span>
          <strong>${esc(label)}</strong>
          <p>${esc(copy)}</p>
          <em>${esc(cta)}</em>
        </button>`)
      .join("");
    text(el.folderHelper, type === "private"
      ? "Private folders are shown only after a canonical client is selected. Backend eligibility still decides access."
      : "Public folders are available after client selection. Backend still validates model visibility.");
    $$("[data-op-folder]").forEach((button) => {
      button.addEventListener("click", () => selectFolder(button.dataset.opFolder || ""));
    });
  }

  async function selectFolder(folder) {
    state.modelFolder = folder;
    state.selectedModel = null;
    state.models = [];
    renderFolders();
    updateAll();
    await loadModels();
    scrollToNode($("#model-panel"));
  }

  function normalizeModel(record) {
    return {
      model_id: String(record.model_id || record.id || record.code || ""),
      model_name: String(record.model_name || record.name || record.code || "Unknown model"),
      lookup_key: String(record.lookup_key || record.code || record.model_id || ""),
      telegram_username: String(record.telegram_username || ""),
      telegram_status: String(record.telegram_status || "missing"),
      folders: Array.isArray(record.folders) ? record.folders : [],
      orientation: String(record.orientation || record.lane || "both"),
      status: String(record.status || "unknown"),
      note: String(record.note || record.operator_note || "")
    };
  }

  function renderModels() {
    if (el.modelSelect) {
      if (!state.modelFolder) {
        el.modelSelect.innerHTML = '<option value="">เลือกกลุ่มก่อน</option>';
        el.modelSelect.disabled = true;
      } else if (!state.models.length) {
        el.modelSelect.innerHTML = '<option value="">No models loaded</option>';
        el.modelSelect.disabled = true;
      } else {
        el.modelSelect.disabled = false;
        el.modelSelect.innerHTML = '<option value="">Select model</option>' + state.models
          .map((model, index) => `<option value="${index}"${state.selectedModel && state.selectedModel.model_id === model.model_id ? " selected" : ""}>${esc(model.model_name)} · ${esc(model.lookup_key)}</option>`)
          .join("");
      }
    }
    text(el.modelRule, state.modelFolder
      ? `Folder ${state.modelFolder} · backend eligibility enforced`
      : "Select a folder first");
    renderModelPreview();
  }

  async function loadModels() {
    if (!state.selectedClient || !state.modelFolder) return;
    setStatus("Loading entitlement-aware model pool…", "warn");
    setHook("models", "warn");
    if (config.mock) {
      state.models = demoModels.filter((model) => model.folders.includes(state.modelFolder));
      renderModels();
      setStatus(`Loaded ${state.models.length} demo models.`, "ok");
      setHook("models", "ok");
      return;
    }
    try {
      const url = new URL(api(config.endpoints.modelSearch));
      url.searchParams.set("client_id", state.selectedClient.client_id || "");
      if (state.selectedClient.member_id) url.searchParams.set("member_id", state.selectedClient.member_id);
      url.searchParams.set("work_type", state.workType);
      url.searchParams.set("folder", state.modelFolder);
      const lookupKey = val(el.modelLookupKey).trim();
      if (lookupKey) url.searchParams.set("q", lookupKey);
      const response = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      state.models = (Array.isArray(data.models) ? data.models : Array.isArray(data.records) ? data.records : []).map(normalizeModel);
      renderModels();
      setStatus(`Loaded ${state.models.length} eligible model${state.models.length === 1 ? "" : "s"}.`, "ok");
      setHook("models", "ok");
    } catch (error) {
      state.models = [];
      renderModels();
      setStatus(`Model pool unavailable: ${error.message}`, "bad");
      setHook("models", "bad");
    }
  }

  function selectModel(model) {
    if (!model) return;
    state.selectedModel = normalizeModel(model);
    setVal(el.modelTelegram, state.selectedModel.telegram_username);
    setVal(el.modelTelegramStatus, state.selectedModel.telegram_status || "missing");
    renderModelPreview();
    updateAll();
    scrollToNode($("#gate-panel"));
  }

  function renderModelPreview() {
    const model = state.selectedModel;
    if (!el.modelPreview) return;
    if (!model) {
      el.modelPreview.innerHTML = '<div class="mmdop__empty">No model selected yet.</div>';
      return;
    }
    el.modelPreview.innerHTML = `
      <div class="mmdop__modelCard">
        <span class="mmdop__modelIcon">${esc(model.model_name.charAt(0).toUpperCase())}</span>
        <div><strong>${esc(model.model_name)}</strong><span>${esc(model.lookup_key)} · ${esc(model.note || "backend selected")}</span></div>
        <b>${esc(model.status)}</b>
      </div>`;
  }

  function deriveGate() {
    if (state.workType !== "private") {
      return {
        ok: Boolean(state.selectedClient && state.modelFolder && state.selectedModel),
        label: state.selectedModel ? "Public ready" : "Public pending",
        copy: "Public work skips the private Telegram gate. Backend create still validates the payload."
      };
    }
    const clientTelegram = val(el.customerTelegram).trim();
    const modelTelegram = val(el.modelTelegram).trim();
    const clientStatus = val(el.customerTelegramStatus);
    const modelStatus = val(el.modelTelegramStatus);
    const clientOk = Boolean(clientTelegram) && ["linked", "verified"].includes(clientStatus);
    const modelOk = Boolean(modelTelegram) && ["linked", "verified"].includes(modelStatus);
    return {
      ok: clientOk && modelOk,
      label: clientOk && modelOk ? "Private Telegram gate ready" : "Private Telegram gate pending",
      copy: clientOk && modelOk
        ? "Customer and model Telegram status are linked/verified. Backend remains authoritative."
        : "Private create stays blocked until both customer and model Telegram statuses are linked/verified."
    };
  }

  function requiredReady() {
    const gate = deriveGate();
    return Boolean(
      state.selectedClient &&
      state.workType &&
      state.modelFolder &&
      state.selectedModel &&
      val(el.date) &&
      val(el.start) &&
      val(el.duration) &&
      val(el.location) &&
      Number(val(el.amount)) > 0 &&
      gate.ok
    );
  }

  function computeEndTime() {
    if (!el.start || !el.duration || !el.end) return;
    const start = val(el.start);
    const duration = val(el.duration);
    if (!start || !duration || duration.endsWith("+")) {
      setVal(el.end, "");
      return;
    }
    const [sh, sm] = start.split(":").map(Number);
    const [dh, dm] = duration.split(":").map(Number);
    if ([sh, sm, dh, dm].some((n) => Number.isNaN(n))) return;
    const minutes = sh * 60 + sm + dh * 60 + dm;
    const hh = String(Math.floor((minutes / 60) % 24)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    setVal(el.end, `${hh}:${mm}`);
  }

  function buildPayload() {
    computeEndTime();
    const gate = deriveGate();
    const payload = {
      client: {
        client_id: state.selectedClient?.client_id || "",
        member_id: state.selectedClient?.member_id || "",
        email: state.selectedClient?.member_email || "",
        name: val(el.clientName),
        username: val(el.username),
        package_code: val(el.package),
        membership_status: val(el.membershipStatus),
        lineage: {
          remembered_name: state.selectedClient?.remembered_name || "",
          canonical_name: state.selectedClient?.canonical_name || "",
          aliases: state.selectedClient?.aliases || [],
          matched_on: state.selectedClient?.matched_on || "",
          matched_value: state.selectedClient?.matched_value || "",
          lookup_chain: state.selectedClient?.lookup_chain || []
        },
        line: {
          display_name: val(el.lineDisplay),
          user_id: val(el.lineUserId),
          record_id: val(el.lineRecordId),
          legacy_tags: String(val(el.legacyTags) || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        },
        telegram: {
          username: val(el.customerTelegram),
          status: val(el.customerTelegramStatus)
        }
      },
      work_type: state.workType,
      job_visibility: state.workType === "private" ? "private" : state.workType === "public" ? "public" : "",
      private_orientation: state.privateOrientation,
      model_folder: state.modelFolder,
      model: {
        model_id: state.selectedModel?.model_id || "",
        model_name: state.selectedModel?.model_name || "",
        lookup_key: state.selectedModel?.lookup_key || "",
        telegram_username: val(el.modelTelegram),
        telegram_status: val(el.modelTelegramStatus)
      },
      schedule: {
        date: val(el.date),
        start: val(el.start),
        duration: val(el.duration),
        end: val(el.end)
      },
      location: {
        text: val(el.location),
        map_url: val(el.map)
      },
      payment: {
        amount_thb: Number(val(el.amount)) || 0,
        payment_type: String(val(el.paymentType) || "full"),
        payment_method: String(val(el.paymentMethod) || "promptpay"),
        points_mode: String(val(el.pointsMode) || "auto")
      },
      human_support: {
        assigned_assistant: String(val(el.humanAssistant) || "Boss Per"),
        escalation_owner: String(val(el.escalationOwner) || "Boss Per")
      },
      notes: {
        handling: val(el.handlingNote),
        internal: val(el.note)
      },
      gates: {
        private_telegram_ready: gate.ok,
        private_telegram_label: gate.label
      },
      source: "mmd-internal-create-session-v2"
    };
    state.lastPayload = payload;
    if (el.payload) el.payload.textContent = JSON.stringify(payload, null, 2);
    return payload;
  }

  function updateStats() {
    text(el.statClient, state.selectedClient?.client_name || "No client");
    text(el.statPackage, state.selectedClient?.package_code || "-");
    text(el.statWork, state.workType || "-");
    text(el.statFolder, state.modelFolder || "-");
    text(el.railFolder, state.modelFolder || "No folder selected");
    text(el.railFolderCopy, state.modelFolder ? `Folder ${state.modelFolder}` : "Select public/private folder after client selection.");
    text(el.statModel, state.selectedModel?.model_name || "-");
    const gate = deriveGate();
    text(el.statGate, gate.ok ? "Ready" : "Pending");
    text(el.statStatus, requiredReady() ? "Ready" : "Not ready");
  }

  function updateNextAction() {
    const gate = deriveGate();
    let next = "Find client";
    let copy = "Search a canonical client lineage record before doing anything else.";
    if (state.selectedClient && !state.workType) {
      next = "Choose Public or Private";
      copy = "Client selected. Choose the work type next.";
    } else if (state.workType && !state.modelFolder) {
      next = "Choose model folder";
      copy = "Pick Travel / Extreme or the allowed Private folder.";
    } else if (state.modelFolder && !state.selectedModel) {
      next = "Select model";
      copy = "Choose one model from the entitlement-aware pool.";
    } else if (state.selectedModel && state.workType === "private" && !gate.ok) {
      next = "Complete Telegram gate";
      copy = "Private create remains blocked until customer + model Telegram are linked/verified.";
    } else if (!requiredReady()) {
      next = "Complete job details";
      copy = "Add schedule, location and amount before create.";
    } else {
      next = "Create session";
      copy = "Required data is complete. Backend will re-validate on create.";
    }
    text(el.nextAction, next);
    text(el.nextCopy, copy);
  }

  function updateReadiness() {
    const gate = deriveGate();
    if (el.gateLabel) {
      el.gateLabel.classList.remove("is-ok", "is-warn", "is-bad");
      el.gateLabel.classList.add(gate.ok ? "is-ok" : "is-warn");
      text(el.gateLabel, gate.label);
    }
    text(el.gateNotice, gate.copy);
    const ready = requiredReady();
    text(el.readyLabel, ready ? "Ready to create" : "Not ready yet");
    text(el.readyCopy, ready
      ? "Frontend requirements are complete. Backend remains authoritative on create."
      : "Complete the next action shown above. Private work also requires the Telegram gate.");
    if (el.create) el.create.disabled = !ready;
  }

  function updateAll() {
    computeEndTime();
    updateStats();
    updateNextAction();
    updateReadiness();
    buildPayload();
  }

  async function checkSession() {
    setStatus("Checking admin session…", "warn");
    setHook("auth", "warn");
    if (config.mock) {
      setStatus("Mock mode · admin session accepted locally.", "ok");
      setHook("auth", "ok");
      return true;
    }
    if (!hasAdminGateSession()) {
      setStatus("Admin gate session is missing in this tab. Sign in again.", "bad");
      setHook("auth", "bad");
      return false;
    }
    try {
      const response = await apiFetch(config.endpoints.authMe);
      if (response.status === 404) {
        const fallback = await apiFetch(config.endpoints.ping);
        if (!fallback.ok) throw new Error(`HTTP ${fallback.status}`);
        setStatus("Admin session accepted by current runtime.", "ok");
        setHook("auth", "ok");
        return true;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      setStatus("Admin session verified.", "ok");
      setHook("auth", "ok");
      return true;
    } catch (error) {
      setStatus(`Admin session check failed: ${error.message}`, "bad");
      setHook("auth", "bad");
      return false;
    }
  }

  async function saveDraft() {
    const payload = buildPayload();
    setStatus("Saving draft…", "warn");
    if (config.mock) {
      state.draftId = `draft_${Date.now()}`;
      setStatus(`Mock draft saved · ${state.draftId}`, "ok");
      return;
    }
    try {
      const response = await apiFetch(config.endpoints.saveDraft, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      state.draftId = data.draft_id || data.id || "saved";
      setStatus(`Draft saved · ${state.draftId}`, "ok");
    } catch (error) {
      setStatus(`Draft failed: ${error.message}`, "bad");
    }
  }

  async function createSession() {
    updateAll();
    if (!requiredReady()) {
      setStatus("Create blocked. Complete the next action first.", "warn");
      return;
    }
    const payload = buildPayload();
    setStatus("Creating session…", "warn");
    setHook("create", "warn");
    if (config.mock) {
      const now = Date.now().toString(36).toUpperCase();
      renderCreated({
        ok: true,
        session_id: `SES-${now}`,
        payment_ref: `MMD-${now.slice(-6)}`,
        line_notification: "ready",
        telegram_dm: state.workType === "private" ? "ready" : "skipped",
        customer_confirmation_url: `/confirm/mmd-confirmation?session=SES-${now}`,
        model_confirmation_url: `/sigil/confirm/job-model?session=SES-${now}`,
        customer_message: `MMD session SES-${now} is ready for confirmation.`,
        model_message: `New MMD session SES-${now} is ready for model confirmation.`
      });
      setStatus("Mock session created.", "ok");
      setHook("create", "ok");
      return;
    }
    try {
      const response = await apiFetch(config.endpoints.createSession, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      renderCreated(data);
      setStatus("Session created.", "ok");
      setHook("create", "ok");
    } catch (error) {
      setStatus(`Create failed: ${error.message}`, "bad");
      setHook("create", "bad");
    }
  }

  function renderCreated(data) {
    state.created = data;
    if (el.output) el.output.hidden = false;
    text(el.outSessionId, data.session_id || data.id || "-");
    text(el.outPaymentRef, data.payment_ref || data.payment_reference || "-");
    text(el.outLineStatus, data.line_notification || data.line_status || "not sent");
    text(el.outTelegramStatus, data.telegram_dm || data.telegram_status || "not sent");
    setVal(el.outCustomerUrl, data.customer_confirmation_url || data.customer_url || "");
    setVal(el.outModelUrl, data.model_confirmation_url || data.model_url || "");
    setVal(el.outMemberUrl, data.member_return_url || "/member/dashboard");
    setVal(el.outModelReturnUrl, data.model_return_url || "/model/dashboard");
    setVal(el.outCustomerMessage, data.customer_message || "");
    setVal(el.outModelMessage, data.model_message || "");
    scrollToNode(el.output);
  }

  async function copy(textValue) {
    const value = String(textValue || "");
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setStatus("Copied.", "ok");
  }

  async function pushCustomerLine() {
    if (!state.created || !state.selectedClient?.line_user_id) {
      setStatus("Customer LINE push is not ready.", "warn");
      return;
    }
    setStatus("Pushing customer LINE message…", "warn");
    setHook("push", "warn");
    try {
      const response = config.mock
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : await apiFetch(config.endpoints.pushLine, {
            method: "POST",
            body: JSON.stringify({
              to: state.selectedClient.line_user_id,
              message: val(el.outCustomerMessage),
              session_id: state.created.session_id || state.created.id || ""
            })
          });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      setStatus("Customer LINE message sent.", "ok");
      setHook("push", "ok");
    } catch (error) {
      setStatus(`LINE push failed: ${error.message}`, "bad");
      setHook("push", "bad");
    }
  }

  function resetAll() {
    state.selectedClient = null;
    state.workType = "";
    state.privateOrientation = "";
    state.modelFolder = "";
    state.models = [];
    state.selectedModel = null;
    state.draftId = "";
    state.created = null;
    state.lastPayload = null;
    if (el.output) el.output.hidden = true;
    setVal(el.query, "");
    setVal(el.clientName, "");
    setVal(el.username, "");
    setVal(el.package, "");
    setVal(el.membershipStatus, "");
    setVal(el.lineDisplay, "");
    setVal(el.lineUserId, "");
    setVal(el.lineRecordId, "");
    setVal(el.legacyTags, "");
    setVal(el.customerTelegram, "");
    setVal(el.customerTelegramStatus, "missing");
    setVal(el.modelTelegram, "");
    setVal(el.modelTelegramStatus, "missing");
    setVal(el.date, "");
    setVal(el.start, "");
    setVal(el.end, "");
    setVal(el.location, "");
    setVal(el.map, "");
    setVal(el.amount, "");
    setVal(el.handlingNote, "");
    setVal(el.note, "");
    renderSelectedClient();
    renderClients(state.clients);
    renderFolders();
    renderModels();
    updateAll();
    setStatus("Reset complete.", "ok");
    scrollToNode($("#client-search"));
  }

  function fillDemoJob() {
    if (!config.mock) return;
    if (!state.selectedClient) selectClient(demoClients[0]);
    state.workType = "private";
    state.modelFolder = "vip";
    state.models = demoModels.filter((model) => model.folders.includes("vip"));
    state.selectedModel = state.models[0] || demoModels[0];
    setVal(el.modelTelegram, state.selectedModel.telegram_username);
    setVal(el.modelTelegramStatus, "linked");
    setVal(el.customerTelegram, state.selectedClient.customer_telegram_username || "@demo_client");
    setVal(el.customerTelegramStatus, "linked");
    setVal(el.date, new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    setVal(el.start, "19:30");
    setVal(el.duration, "02:00");
    setVal(el.location, "Bangkok · Sathorn");
    setVal(el.map, "https://maps.google.com/");
    setVal(el.amount, "5900");
    setVal(el.humanAssistant, "Boss Per");
    renderFolders();
    renderModels();
    updateAll();
    setStatus("Demo job filled. Review gate and create.", "ok");
  }

  function bind() {
    el.checkSession?.addEventListener("click", checkSession);
    el.searchClient?.addEventListener("click", searchClients);
    el.demoClient?.addEventListener("click", () => {
      if (!config.mock) return;
      renderClients(demoClients);
      selectClient(demoClients[0]);
      setStatus("Demo client selected.", "ok");
    });
    el.loadRecent?.addEventListener("click", loadRecentClients);
    el.clearClient?.addEventListener("click", clearClient);
    el.query?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchClients();
    });
    $$(`[data-op-work-type]`).forEach((button) => {
      button.addEventListener("click", () => selectWorkType(button.dataset.opWorkType));
    });
    el.refreshModels?.addEventListener("click", loadModels);
    el.modelLookupKey?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadModels();
    });
    el.modelSelect?.addEventListener("change", () => {
      const index = Number(val(el.modelSelect));
      if (Number.isInteger(index) && state.models[index]) selectModel(state.models[index]);
      else {
        state.selectedModel = null;
        renderModelPreview();
        updateAll();
      }
    });
    [
      el.customerTelegram,
      el.customerTelegramStatus,
      el.modelTelegram,
      el.modelTelegramStatus,
      el.date,
      el.start,
      el.duration,
      el.location,
      el.map,
      el.amount,
      el.paymentType,
      el.paymentMethod,
      el.pointsMode,
      el.humanAssistant,
      el.escalationOwner,
      el.handlingNote,
      el.note
    ].forEach((node) => {
      node?.addEventListener("input", updateAll);
      node?.addEventListener("change", updateAll);
    });
    el.saveDraft?.addEventListener("click", saveDraft);
    el.fillDemoJob?.addEventListener("click", fillDemoJob);
    el.create?.addEventListener("click", createSession);
    el.newSession?.addEventListener("click", resetAll);
    el.debugToggle?.addEventListener("click", () => {
      if (!el.debugPanel) return;
      el.debugPanel.hidden = !el.debugPanel.hidden;
      if (!el.debugPanel.hidden) buildPayload();
    });
    el.copyCustomerLink?.addEventListener("click", () => copy(val(el.outCustomerUrl)));
    el.copyModelLink?.addEventListener("click", () => copy(val(el.outModelUrl)));
    el.copyCustomerMsg?.addEventListener("click", () => copy(val(el.outCustomerMessage)));
    el.copyModelMsg?.addEventListener("click", () => copy(val(el.outModelMessage)));
    el.pushLine?.addEventListener("click", pushCustomerLine);
  }

  function boot() {
    if (el.duration && !val(el.duration)) {
      el.duration.innerHTML = durations.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
      setVal(el.duration, "02:00");
    }
    bind();
    renderSelectedClient();
    renderFolders();
    renderModels();
    updateAll();
    if (config.mock) {
      setStatus("Mock mode active. Backend writes are disabled.", "ok");
      setHook("auth", "ok");
      renderClients(demoClients);
    } else {
      checkSession();
      loadRecentClients();
    }
  }

  boot();
})();
