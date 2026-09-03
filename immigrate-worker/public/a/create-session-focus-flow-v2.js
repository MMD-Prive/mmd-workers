(() => {
  "use strict";

  const root = document.querySelector("[data-focus-flow-v2]");
  if (!root) return;

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  const clean = (value) => String(value || "").trim();
  const meaningful = (value) => {
    const v = clean(value);
    return Boolean(v && v !== "-" && v.toLowerCase() !== "not selected" && v.toLowerCase() !== "not ready");
  };

  function lockServerGateIndicator() {
    const source = $("[data-op-connection]");
    if (!source) return;

    // Focus Flow is rendered only after the canonical server-side admin gate
    // has already returned an authorized HTML response. Keep that fact visible
    // instead of leaving a redundant client-side probe stuck on "Checking".
    const visible = source.cloneNode(true);
    visible.removeAttribute("data-op-connection");
    visible.setAttribute("data-focus-server-gate", "verified");
    visible.classList.remove("is-warn", "is-bad");
    visible.classList.add("is-ok");
    visible.style.color = "var(--ok)";
    const dot = visible.querySelector("i");
    if (dot) {
      dot.style.background = "var(--ok)";
      dot.style.boxShadow = "0 0 12px rgba(121,215,162,.55)";
    }
    const label = visible.querySelector("span");
    if (label) label.textContent = "Secure Session";
    source.replaceWith(visible);

    // The server gate already verified this page request. Disable the redundant
    // browser auth-check button so it cannot reintroduce a misleading state.
    const checkButton = $("[data-op-check-session]");
    if (checkButton) {
      checkButton.textContent = "Session Verified";
      checkButton.disabled = true;
      checkButton.setAttribute("aria-disabled", "true");
    }
  }

  lockServerGateIndicator();

  const stats = {
    client: $("[data-op-stat-client]"),
    package: $("[data-op-stat-package]"),
    work: $("[data-op-stat-work]"),
    folder: $("[data-op-stat-folder]"),
    model: $("[data-op-stat-model]"),
    gate: $("[data-op-stat-gate]"),
    status: $("[data-op-stat-status]")
  };
  const createButton = $("[data-op-create]");
  const output = $("[data-op-output]");
  const privateDetails = $("[data-focus-private-details]");
  let forcedStep = "";

  function stat(name) {
    return clean(stats[name]?.textContent);
  }

  function installClientFirstUx() {
    const clientStage = $("[data-focus-section=\"client\"]");
    if (!clientStage) return null;

    if (!document.getElementById("mmd-client-first-ux")) {
      const style = document.createElement("style");
      style.id = "mmd-client-first-ux";
      style.textContent = `
        .ff2__search{grid-template-columns:minmax(0,1fr) auto auto;align-items:stretch}
        .ff2__search [data-op-load-recent]{min-width:118px;background:rgba(255,255,255,.045);border-color:rgba(214,183,111,.22)}
        .ff2__clientMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px}
        .ff2__lineageState{display:inline-flex;align-items:center;min-height:29px;padding:0 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:8px;font-weight:850;background:rgba(255,255,255,.018)}
        .ff2__lineageState.is-connected{border-color:rgba(121,215,162,.24);color:var(--ok);background:rgba(121,215,162,.035)}
        .ff2__lineageState.is-retry{border-color:rgba(234,145,156,.24);color:var(--bad);background:rgba(234,145,156,.035)}
        .ff2__clientFilters{position:relative;color:var(--muted)}
        .ff2__clientFilters summary{list-style:none;cursor:pointer;min-height:29px;padding:0 10px;border:1px solid var(--line);border-radius:999px;display:inline-flex;align-items:center;font-size:8px;font-weight:850;background:rgba(255,255,255,.018)}
        .ff2__clientFilters summary::-webkit-details-marker{display:none}
        .ff2__clientFilters[open] summary{border-color:rgba(214,183,111,.28);color:var(--gold2)}
        .ff2__clientFilters .ff2__chips{margin-top:7px;justify-content:flex-end}
        .ff2__clientFilters .ff2__chip{color:var(--muted);background:rgba(255,255,255,.018)}
        .ff2--awaiting-client .ff2__summaryRow:nth-child(n+2){display:none}
        .ff2--awaiting-client .ff2__summary{opacity:.84}
        .ff2--awaiting-client .ff2__summaryHead b{font-size:18px}
        .ff2--awaiting-client [data-focus-section="client"]{box-shadow:0 14px 48px rgba(0,0,0,.14)}
        .ff2--awaiting-client [data-focus-section="client"] .ff2__stageBody{padding-bottom:24px}
        @media(max-width:767px){
          .ff2__search{grid-template-columns:minmax(0,1fr) auto}
          .ff2__search [data-op-load-recent]{grid-column:1/-1;width:100%}
          .ff2__clientMeta{align-items:flex-start}
        }
      `;
      document.head.appendChild(style);
    }

    const title = clientStage.querySelector(".ff2__stageTitle b");
    if (title) title.textContent = "เลือกลูกค้า";
    const stageSummary = clientStage.querySelector('[data-focus-stage-summary="client"]');
    if (stageSummary) stageSummary.textContent = "ลูกค้าล่าสุดจะแสดงให้อัตโนมัติ หรือค้นหาจากชื่อ / LINE / เบอร์ / Package";

    const query = $("[data-op-client-query]");
    if (query) {
      query.placeholder = "ชื่อ / LINE / เบอร์ / Package";
      query.setAttribute("aria-label", "ค้นหาลูกค้า");
    }

    const searchButton = $("[data-op-search-client]");
    if (searchButton) searchButton.textContent = "ค้นหา";

    const searchRow = clientStage.querySelector(".ff2__search");
    const recent = $("[data-op-load-recent]");
    if (recent && searchRow) {
      recent.textContent = "ลูกค้าล่าสุด";
      recent.className = "ff2__btn ff2__recent";
      searchRow.appendChild(recent);
    }

    const demo = $("[data-op-demo-client]");
    if (demo) demo.remove();

    const chips = clientStage.querySelector(".ff2__chips");
    const mode = $("[data-op-search-mode]");
    const quickButtons = $$('[data-op-quick-query]');
    if (chips) {
      const meta = document.createElement("div");
      meta.className = "ff2__clientMeta";

      if (mode) {
        mode.className = "ff2__lineageState";
        mode.textContent = "Client Lineage";
        meta.appendChild(mode);
      }

      if (quickButtons.length) {
        const details = document.createElement("details");
        details.className = "ff2__clientFilters";
        const summary = document.createElement("summary");
        summary.textContent = "ตัวกรองเพิ่มเติม";
        const filterRow = document.createElement("div");
        filterRow.className = "ff2__chips";
        quickButtons.forEach((button) => filterRow.appendChild(button));
        details.append(summary, filterRow);
        meta.appendChild(details);
      }

      chips.replaceWith(meta);
    }

    const results = $("[data-op-client-results]");
    const status = $("[data-op-status]");

    function setLineageState(kind) {
      if (!mode) return;
      mode.classList.toggle("is-connected", kind === "connected");
      mode.classList.toggle("is-retry", kind === "retry");
      if (kind === "connected") mode.textContent = "● Connected";
      else if (kind === "retry") mode.textContent = "● Retry";
      else mode.textContent = "Client Lineage";
    }

    function normalizeClientStatus() {
      if (!status) return;
      const text = clean(status.textContent);
      if (!text) return;

      if (/Demo|lineage จริงไม่ได้|lineage_lookup_failed|lineage_storage_not_ready/i.test(text)) {
        status.textContent = "เชื่อม Client Lineage ไม่สำเร็จ · กด ‘ลูกค้าล่าสุด’ อีกครั้ง หรือค้นหาด้วยชื่อ / LINE / เบอร์";
        setLineageState("retry");
        return;
      }

      if (/lineage loaded|client lineage loaded|canonical_client_lineage|พบลูกค้า|loaded/i.test(text)) {
        setLineageState("connected");
      }
    }

    if (status) {
      const statusObserver = new MutationObserver(normalizeClientStatus);
      statusObserver.observe(status, { childList: true, subtree: true, characterData: true });
      normalizeClientStatus();
    }

    function autoLoadRecentClients() {
      if (!recent || recent.dataset.autoloaded === "true") return;
      if (meaningful(stat("client"))) return;
      recent.dataset.autoloaded = "true";
      if (results) results.innerHTML = '<div class="ff2__notice">กำลังโหลดลูกค้าล่าสุด…</div>';
      window.setTimeout(() => recent.click(), 80);
    }

    return { autoLoadRecentClients };
  }

  const clientUx = installClientFirstUx();

  function readiness() {
    const client = meaningful(stat("client"));
    const work = meaningful(stat("work"));
    const folder = meaningful(stat("folder"));
    const model = meaningful(stat("model"));
    const createReady = Boolean(createButton && !createButton.disabled);
    const created = Boolean(output && !output.hidden);
    return { client, work, folder, model, createReady, created };
  }

  function naturalStep() {
    const r = readiness();
    if (!r.client) return "client";
    if (!r.work || !r.folder) return "work";
    if (!r.model) return "model";
    if (!r.createReady) return "details";
    return "review";
  }

  function unlockedSteps() {
    const r = readiness();
    return {
      client: true,
      work: r.client,
      model: r.client && r.work && r.folder,
      details: r.client && r.work && r.folder && r.model,
      review: r.client && r.work && r.folder && r.model && r.createReady
    };
  }

  function stageSummary(step) {
    if (step === "client") return meaningful(stat("client")) ? [stat("client"), stat("package")].filter(meaningful).join(" · ") : "ลูกค้าล่าสุดจะแสดงอัตโนมัติ หรือค้นหาจากชื่อ / LINE / เบอร์ / Package";
    if (step === "work") return meaningful(stat("work")) ? [stat("work"), stat("folder")].filter(meaningful).join(" · ") : "เลือก Public หรือ Private แล้วค่อยเลือก lane";
    if (step === "model") return meaningful(stat("model")) ? stat("model") : "ระบบจะแสดงเฉพาะ pool ที่ตรงกับ lane";
    if (step === "details") return readiness().createReady ? "ข้อมูลหลักครบแล้ว พร้อม Review" : "วัน เวลา สถานที่ ราคา — technical gates พับไว้ด้านล่าง";
    if (step === "review") return readiness().createReady ? "พร้อมตรวจและ Create Session" : "ปุ่ม Create จะเปิดเมื่อข้อมูลที่จำเป็นครบเท่านั้น";
    return "";
  }

  function copyReview() {
    const map = {
      client: ["client", "package"],
      work: ["work", "folder"],
      model: ["model"],
      gate: ["gate"]
    };
    Object.entries(map).forEach(([target, names]) => {
      const node = $(`[data-focus-review="${target}"]`);
      if (!node) return;
      const value = names.map(stat).filter(meaningful).join(" · ") || "-";
      node.textContent = value;
    });
  }

  function syncPrivateDetails() {
    if (!privateDetails) return;
    const isPrivate = /private/i.test(stat("work"));
    if (isPrivate && naturalStep() === "details") privateDetails.open = true;
    if (!isPrivate) privateDetails.open = false;
  }

  function sync() {
    const unlocked = unlockedSteps();
    const natural = naturalStep();
    const r = readiness();
    root.classList.toggle("ff2--awaiting-client", !r.client);
    if (forcedStep && !unlocked[forcedStep]) forcedStep = "";
    const current = forcedStep || natural;
    const order = ["client", "work", "model", "details", "review"];
    const naturalIndex = order.indexOf(natural);

    $$('[data-focus-goto]').forEach((button) => {
      const step = button.dataset.focusGoto;
      const index = order.indexOf(step);
      button.classList.toggle("is-active", step === current);
      button.classList.toggle("is-complete", index >= 0 && index < naturalIndex);
      button.classList.toggle("is-locked", !unlocked[step]);
      button.disabled = !unlocked[step];
    });

    $$('[data-focus-section]').forEach((section) => {
      const step = section.dataset.focusSection;
      const index = order.indexOf(step);
      const isCurrent = step === current;
      const complete = index >= 0 && index < naturalIndex;
      section.classList.toggle("is-current", isCurrent);
      section.classList.toggle("is-complete", complete);
      section.classList.toggle("is-locked", !unlocked[step]);
      if (isCurrent) section.classList.remove("is-expanded");
      const summary = section.querySelector(`[data-focus-stage-summary="${step}"]`);
      if (summary) summary.textContent = stageSummary(step);
    });

    copyReview();
    syncPrivateDetails();
  }

  function go(step) {
    const unlocked = unlockedSteps();
    if (!unlocked[step]) return;
    forcedStep = step;
    sync();
    const section = $(`[data-focus-section="${step}"]`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $$('[data-focus-goto]').forEach((button) => button.addEventListener("click", () => go(button.dataset.focusGoto)));
  $$('[data-focus-change]').forEach((button) => button.addEventListener("click", () => {
    const step = button.dataset.focusChange;
    const unlocked = unlockedSteps();
    if (!unlocked[step]) return;
    forcedStep = step;
    const section = $(`[data-focus-section="${step}"]`);
    section?.classList.add("is-expanded");
    sync();
  }));

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-op-select-client],[data-op-work-type],[data-op-folder],[data-op-private-orientation]");
    if (!target) return;
    forcedStep = "";
    setTimeout(sync, 0);
    setTimeout(sync, 120);
  });
  root.addEventListener("change", () => {
    forcedStep = "";
    setTimeout(sync, 0);
  });
  root.addEventListener("input", () => setTimeout(sync, 0));

  const observer = new MutationObserver(() => sync());
  Object.values(stats).forEach((node) => node && observer.observe(node, { childList: true, subtree: true, characterData: true }));
  if (createButton) observer.observe(createButton, { attributes: true, attributeFilter: ["disabled"] });
  if (output) observer.observe(output, { attributes: true, attributeFilter: ["hidden"] });

  sync();
  clientUx?.autoLoadRecentClients();
})();