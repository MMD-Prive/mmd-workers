(function () {
  const root = document.querySelector(".kenji-knowledge-room");
  if (!root) return;

  const config = {
    apiBase: root.dataset.apiBase || "",
    listPath: root.dataset.listPath || "",
    draftPath: root.dataset.draftPath || "",
    itemPath: root.dataset.itemPath || "",
    metaPath: root.dataset.metaPath || "",
  };
  const lanes = ["Membership", "Renewal", "Payment", "Booking", "Guide", "Travel", "Support", "Apply Routing", "Privacy", "Rules", "Escalation"];
  const audiences = ["public", "public_member", "member", "premium", "vip_review", "blackcard_review", "internal_only"];
  const languages = ["th", "en", "zh", "jp"];
  const state = {
    key: sessionStorage.getItem("kenjiKnowledgeAdminKey") || "",
    cards: [],
    activeId: "",
    connected: false,
  };

  const el = {
    key: root.querySelector("[data-kkr-key]"),
    connect: root.querySelector("[data-kkr-connect]"),
    clearKey: root.querySelector("[data-kkr-clear-key]"),
    status: root.querySelector("[data-kkr-status]"),
    refresh: root.querySelector("[data-kkr-refresh]"),
    search: root.querySelector("[data-kkr-search]"),
    filterStatus: root.querySelector("[data-kkr-filter-status]"),
    counts: root.querySelector("[data-kkr-counts]"),
    list: root.querySelector("[data-kkr-list]"),
    form: root.querySelector("[data-kkr-form]"),
    editorTitle: root.querySelector("[data-kkr-editor-title]"),
    id: root.querySelector("[data-kkr-id]"),
    title: root.querySelector("[data-kkr-title]"),
    lane: root.querySelector("[data-kkr-lane]"),
    audience: root.querySelector("[data-kkr-audience]"),
    language: root.querySelector("[data-kkr-language]"),
    statusField: root.querySelector("[data-kkr-status-field]"),
    questions: root.querySelector("[data-kkr-questions]"),
    answer: root.querySelector("[data-kkr-answer]"),
    doRules: root.querySelector("[data-kkr-do]"),
    dontRules: root.querySelector("[data-kkr-dont]"),
    escalation: root.querySelector("[data-kkr-escalation]"),
    routes: root.querySelector("[data-kkr-routes]"),
    save: root.querySelector("[data-kkr-save]"),
    preview: root.querySelector("[data-kkr-preview]"),
    publish: root.querySelector("[data-kkr-publish]"),
    archive: root.querySelector("[data-kkr-archive]"),
    newCard: root.querySelector("[data-kkr-new]"),
    previewBox: root.querySelector("[data-kkr-preview-box]"),
    previewText: root.querySelector("[data-kkr-preview-text]"),
    toast: root.querySelector("[data-kkr-toast]"),
  };

  init();

  function init() {
    fillSelect(el.lane, lanes);
    fillSelect(el.audience, audiences);
    fillSelect(el.language, languages);
    el.key.value = state.key;
    bindEvents();
    resetForm();
    renderList();
  }

  function bindEvents() {
    el.connect.addEventListener("click", connectWorker);
    el.clearKey.addEventListener("click", clearKey);
    el.refresh.addEventListener("click", refreshAll);
    el.search.addEventListener("input", renderList);
    el.filterStatus.addEventListener("change", renderList);
    el.form.addEventListener("submit", saveCard);
    el.preview.addEventListener("click", previewReply);
    el.publish.addEventListener("click", publishCard);
    el.archive.addEventListener("click", archiveCard);
    el.newCard.addEventListener("click", resetForm);
  }

  async function connectWorker() {
    const key = el.key.value.trim();
    if (!key) {
      setStatus("ใส่ Admin Key แล้วกดเชื่อมต่อ Worker เพื่อโหลดคลังความรู้ของ Kenji", false);
      return;
    }
    state.key = key;
    sessionStorage.setItem("kenjiKnowledgeAdminKey", key);
    await refreshAll();
  }

  function clearKey() {
    state.key = "";
    state.connected = false;
    sessionStorage.removeItem("kenjiKnowledgeAdminKey");
    el.key.value = "";
    state.cards = [];
    renderList();
    setStatus("ใส่ Admin Key แล้วกดเชื่อมต่อ Worker เพื่อโหลดคลังความรู้ของ Kenji", false);
    toast("ล้างการเชื่อมต่อแล้ว");
  }

  async function refreshAll() {
    if (!state.key) {
      setStatus("ใส่ Admin Key แล้วกดเชื่อมต่อ Worker เพื่อโหลดคลังความรู้ของ Kenji", false);
      return;
    }
    try {
      const [listData, metaData] = await Promise.all([
        api(config.listPath),
        api(config.metaPath),
      ]);
      state.cards = Array.isArray(listData.cards) ? listData.cards : [];
      state.connected = true;
      setStatus(`เชื่อมต่อ Worker แล้ว: ${state.cards.length} cards`, true);
      renderCounts(metaData.meta);
      renderList();
      toast("โหลดคลังความรู้ Kenji แล้ว");
    } catch (error) {
      state.connected = false;
      setStatus(safeError(error), false);
      toast(safeError(error));
    }
  }

  async function saveCard(event) {
    event.preventDefault();
    if (!state.key) return setStatus("ใส่ Admin Key ก่อนบันทึก", false);
    const payload = formPayload();
    const id = el.id.value.trim();
    const isPatch = Boolean(id);
    const path = isPatch ? `${config.itemPath}/${encodeURIComponent(id)}` : config.draftPath;
    const method = isPatch ? "PATCH" : "POST";
    try {
      const data = await api(path, { method, body: payload });
      upsertCard(data.card);
      loadCard(data.card);
      renderList();
      toast(isPatch ? "บันทึกการแก้ไขแล้ว" : "สร้างการ์ดใหม่แล้ว");
    } catch (error) {
      toast(safeError(error));
    }
  }

  async function publishCard() {
    const id = el.id.value.trim();
    if (!id) return toast("เลือกการ์ดก่อน publish");
    try {
      const data = await api(`${config.itemPath}/${encodeURIComponent(id)}/publish`, { method: "POST", body: { updated_by: "webflow_admin" } });
      upsertCard(data.card);
      loadCard(data.card);
      renderList();
      toast("Publish แล้ว");
    } catch (error) {
      toast(safeError(error));
    }
  }

  async function archiveCard() {
    const id = el.id.value.trim();
    if (!id) return toast("เลือกการ์ดก่อน archive");
    try {
      const data = await api(`${config.itemPath}/${encodeURIComponent(id)}/archive`, { method: "POST", body: { updated_by: "webflow_admin" } });
      upsertCard(data.card);
      loadCard(data.card);
      renderList();
      toast("Archive แล้ว");
    } catch (error) {
      toast(safeError(error));
    }
  }

  async function api(path, options) {
    const init = options || {};
    const response = await fetch(`${config.apiBase}${path}`, {
      method: init.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.key}`,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    let data = {};
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `worker_http_${response.status}`);
    }
    return data;
  }

  function formPayload() {
    return {
      title: el.title.value.trim(),
      lane: el.lane.value,
      audience: el.audience.value,
      language: el.language.value,
      status: el.statusField.value,
      customer_question_examples: lines(el.questions.value),
      kenji_safe_answer: el.answer.value.trim(),
      do_rules: lines(el.doRules.value),
      dont_rules: lines(el.dontRules.value),
      escalation_rule: el.escalation.value.trim(),
      related_routes: lines(el.routes.value),
      updated_by: "webflow_admin",
    };
  }

  function loadCard(card) {
    state.activeId = card.id;
    el.editorTitle.textContent = card.title || "แก้ไขการ์ด";
    el.id.value = card.id || "";
    el.title.value = card.title || "";
    el.lane.value = card.lane || "Membership";
    el.audience.value = card.audience || "public";
    el.language.value = card.language || "th";
    el.statusField.value = card.status === "published" ? "review" : card.status || "draft";
    el.questions.value = (card.customer_question_examples || []).join("\n");
    el.answer.value = card.kenji_safe_answer || "";
    el.doRules.value = (card.do_rules || []).join("\n");
    el.dontRules.value = (card.dont_rules || []).join("\n");
    el.escalation.value = card.escalation_rule || "";
    el.routes.value = (card.related_routes || []).join("\n");
    el.previewBox.hidden = true;
    renderList();
  }

  function resetForm() {
    state.activeId = "";
    el.editorTitle.textContent = "สร้างการ์ดใหม่";
    el.form.reset();
    el.id.value = "";
    el.lane.value = "Membership";
    el.audience.value = "public";
    el.language.value = "th";
    el.statusField.value = "draft";
    el.previewBox.hidden = true;
    renderList();
  }

  function renderList() {
    const q = el.search.value.trim().toLowerCase();
    const status = el.filterStatus.value;
    const cards = state.cards.filter((card) => {
      const statusOk = status === "all" || card.status === status;
      const text = [card.title, card.lane, card.audience, card.language, card.kenji_safe_answer, ...(card.customer_question_examples || [])].join(" ").toLowerCase();
      return statusOk && (!q || text.includes(q));
    });
    el.list.innerHTML = "";
    if (!cards.length) {
      el.list.innerHTML = '<p class="kkr-status">ยังไม่มีการ์ดในมุมมองนี้</p>';
      return;
    }
    cards.forEach((card) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `kkr-card-row${card.id === state.activeId ? " is-active" : ""}`;
      row.innerHTML = `<strong></strong><span></span><span></span><span></span>`;
      row.querySelector("strong").textContent = card.title || card.id;
      const spans = row.querySelectorAll("span");
      spans[0].textContent = card.status || "draft";
      spans[1].textContent = card.lane || "";
      spans[2].textContent = card.language || "";
      row.addEventListener("click", () => loadCard(card));
      el.list.appendChild(row);
    });
  }

  function renderCounts(meta) {
    const status = meta && meta.status ? meta.status : {};
    const chips = ["draft", "review", "published", "archived"].map((name) => `${name}: ${status[name] || 0}`);
    el.counts.innerHTML = chips.map((chip) => `<span class="kkr-chip">${chip}</span>`).join("");
  }

  function previewReply() {
    const answer = el.answer.value.trim();
    el.previewText.textContent = answer || "ยังไม่มีคำตอบสำหรับ preview";
    el.previewBox.hidden = false;
  }

  function upsertCard(card) {
    const index = state.cards.findIndex((item) => item.id === card.id);
    if (index >= 0) state.cards.splice(index, 1, card);
    else state.cards.unshift(card);
  }

  function fillSelect(select, values) {
    select.innerHTML = values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("");
  }

  function lines(value) {
    return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function setStatus(message, ok) {
    el.status.textContent = message;
    el.status.style.color = ok ? "#d7b35a" : "";
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.toast.classList.remove("is-visible"), 2800);
  }

  function safeError(error) {
    const message = error && error.message ? error.message : "worker_error";
    return `Worker ตอบกลับไม่สำเร็จ: ${message}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
