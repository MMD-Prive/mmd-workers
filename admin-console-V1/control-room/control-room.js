(function () {
  const root = document.querySelector("[data-mmd-ops-room]");
  if (!root) return;

  const config = {
    adminBase: cleanBase(root.getAttribute("data-admin-base")),
    aiBase: cleanBase(root.getAttribute("data-ai-base")),
    chatBase: cleanBase(root.getAttribute("data-chat-base")),
    paymentsBase: cleanBase(root.getAttribute("data-payments-base")),
    eventsBase: cleanBase(root.getAttribute("data-events-base")),
    telegramBase: cleanBase(root.getAttribute("data-telegram-base"))
  };

  const els = {
    global: root.querySelector("[data-global-status]"),
    adminMessage: root.querySelector("[data-admin-message]"),
    log: root.querySelector("[data-check-log]"),
    runButtons: root.querySelectorAll("[data-run-checks]"),
    clearLog: root.querySelector("[data-clear-log]")
  };

  const workerCards = {
    admin: root.querySelector('[data-worker-card="admin"]'),
    chat: root.querySelector('[data-worker-card="chat"]'),
    ai: root.querySelector('[data-worker-card="ai"]'),
    payments: root.querySelector('[data-worker-card="payments"]'),
    events: root.querySelector('[data-worker-card="events"]'),
    telegram: root.querySelector('[data-worker-card="telegram"]')
  };

  const workerLabels = {
    admin: root.querySelector('[data-worker-label="admin"]'),
    chat: root.querySelector('[data-worker-label="chat"]'),
    ai: root.querySelector('[data-worker-label="ai"]'),
    payments: root.querySelector('[data-worker-label="payments"]'),
    events: root.querySelector('[data-worker-label="events"]'),
    telegram: root.querySelector('[data-worker-label="telegram"]')
  };

  function cleanBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function nowTime() {
    return new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function friendlyName(name) {
    return {
      admin: "Admin",
      chat: "Per AI",
      ai: "AI Route",
      payments: "Payment",
      events: "Reminder",
      telegram: "Telegram"
    }[name] || name;
  }

  function addLog(message, kind) {
    if (!els.log) return;

    if (els.log.textContent.trim() === "Waiting for system check.") {
      els.log.innerHTML = "";
    }

    const p = document.createElement("p");
    p.className = kind || "";
    p.textContent = "[" + nowTime() + "] " + message;
    els.log.prepend(p);
  }

  function setGlobal(type, label) {
    if (!els.global) return;

    els.global.classList.remove("is-ok", "is-bad", "is-warn");
    if (type) els.global.classList.add("is-" + type);

    const strong = els.global.querySelector("strong");
    if (strong) strong.textContent = label || "Unknown";
  }

  function setWorker(name, type, label) {
    const card = workerCards[name];
    const labelNode = workerLabels[name];

    if (card) {
      card.classList.remove("is-ok", "is-bad", "is-warn");
      if (type) card.classList.add("is-" + type);
    }

    if (labelNode) labelNode.textContent = label || "Unknown";
  }

  function setAdminMessage(message) {
    if (els.adminMessage) els.adminMessage.textContent = message;
  }

  async function readEndpoint(url, options) {
    const opts = options || {};
    const res = await fetch(url, {
      method: "GET",
      credentials: opts.credentials || "omit",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  }

  async function checkWithFallback(name, base, paths, options) {
    const label = friendlyName(name);

    if (!base) {
      setWorker(name, "bad", "Missing URL");
      addLog(label + ": ยังไม่ได้ตั้งค่า URL", "bad");
      return { name, ok: false, status: 0, label: "Missing URL" };
    }

    setWorker(name, "", "Checking");

    for (const path of paths) {
      try {
        const result = await readEndpoint(base + path, options);

        if (result.ok) {
          setWorker(name, "ok", "Ready");
          addLog(label + ": พร้อมใช้งาน", "ok");
          return { name, ok: true, status: result.status, path, data: result.data, label: "Ready" };
        }

        if (name === "admin" && (result.status === 401 || result.status === 403)) {
          setWorker(name, "warn", "Login needed");
          addLog(label + ": ต้อง Login ก่อน", "warn");
          return { name, ok: true, authRequired: true, status: result.status, path, data: result.data, label: "Login needed" };
        }

        if (result.status !== 404) {
          setWorker(name, "warn", "Check needed");
          addLog(label + ": ต้องให้ dev เช็ก", "warn");
          return { name, ok: false, status: result.status, path, data: result.data, label: "Check needed" };
        }
      } catch (err) {
        setWorker(name, "bad", "Offline");
        addLog(label + ": ติดต่อไม่ได้", "bad");
        return { name, ok: false, status: 0, error: err, label: "Offline" };
      }
    }

    setWorker(name, "bad", "Not ready");
    addLog(label + ": ยังไม่พร้อม", "bad");
    return { name, ok: false, status: 404, label: "Not ready" };
  }

  async function checkAdmin() {
    const result = await checkWithFallback("admin", config.adminBase, [
      "/v1/admin/auth/me",
      "/v1/admin/ping",
      "/health",
      "/"
    ], { credentials: "include" });

    if (result.ok && result.authRequired) {
      setAdminMessage("ระบบหลักติดต่อได้แล้ว แต่ต้อง Login ก่อนสร้างงานค่ะ");
      return result;
    }

    if (result.ok) {
      setAdminMessage("ระบบหลักพร้อมใช้งาน เริ่ม Create Job ได้ค่ะ");
      return result;
    }

    setAdminMessage("ระบบหลักยังไม่พร้อม แจ้ง Per หรือ dev ให้เช็ก connection ค่ะ");
    return result;
  }

  async function checkAll() {
    setGlobal("", "Checking");
    addLog("เริ่มตรวจระบบ...", "");

    const checks = await Promise.all([
      checkAdmin(),
      checkWithFallback("chat", config.chatBase, ["/health", "/"]),
      checkWithFallback("ai", config.aiBase, ["/health", "/"]),
      checkWithFallback("payments", config.paymentsBase, ["/health", "/v1/pay/health", "/"]),
      checkWithFallback("events", config.eventsBase, ["/health", "/v1/events/health", "/"]),
      checkWithFallback("telegram", config.telegramBase, ["/health", "/telegram/health", "/"])
    ]);

    const hardFailures = checks.filter(item => !item.ok && item.name !== "events");
    const warnings = checks.filter(item => item.authRequired || (item.ok && item.status >= 300));

    if (hardFailures.length === 0 && warnings.length === 0) {
      setGlobal("ok", "Ready");
      addLog("ระบบพร้อมใช้งาน", "ok");
      return;
    }

    if (hardFailures.length === 0 && warnings.length > 0) {
      setGlobal("warn", "Login needed");
      addLog("ระบบติดต่อได้ แต่ต้อง Login หรือให้ Per ตรวจอีกครั้ง", "warn");
      return;
    }

    setGlobal("bad", "Need check");
    addLog("มีบางระบบยังไม่พร้อม แจ้ง Per หรือ dev ให้เช็กค่ะ", "bad");
  }

  function bind() {
    els.runButtons.forEach(function (btn) {
      btn.addEventListener("click", checkAll);
    });

    if (els.clearLog) {
      els.clearLog.addEventListener("click", function () {
        els.log.innerHTML = "<p>Waiting for system check.</p>";
      });
    }
  }

  function init() {
    Object.keys(workerCards).forEach(function (name) {
      if (workerCards[name]) setWorker(name, "", "Checking");
    });

    setGlobal("", "Checking");
    setAdminMessage("กำลังตรวจสอบระบบ...");
    bind();
    window.setTimeout(checkAll, 500);
  }

  init();
})();
