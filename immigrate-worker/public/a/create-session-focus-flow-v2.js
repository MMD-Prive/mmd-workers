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
    if (step === "client") return meaningful(stat("client")) ? [stat("client"), stat("package")].filter(meaningful).join(" · ") : "ค้นจากชื่อ / LINE / package / legacy tag";
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
})();
