<script>
(function () {
  const root = document.getElementById("sigil-recovery-room-v2");
  if (!root || root.__srr2Ready) return;
  root.__srr2Ready = true;

  const qs = new URLSearchParams(window.location.search);
  const config = {
    apiBase: root.dataset.apiBase || "https://sigil-complaint-worker.malemodel-bkk.workers.dev",
    endpoint: root.dataset.recoveryEndpoint || "/member/api/recovery/complaint-evidence",
    aftercareUrl: root.dataset.aftercareUrl || "/sigil/aftercare",
    dashboardUrl: root.dataset.dashboardUrl || "/sigil/member/dashboard",
    bookingUrl: root.dataset.bookingUrl || "/sigil/booking"
  };

  const $ = (selector) => root.querySelector(selector);
  const form = $("#srr2FormCard");
  const result = $("#srr2Result");
  const submit = $("#srr2Submit");
  const clientFiles = $("#srr2ClientFiles");
  const modelFiles = $("#srr2ModelFiles");
  const clientInput = $("#srr2ClientEvidence");
  const modelInput = $("#srr2ModelEvidence");
  const MAX_FILES = 12;
  const MAX_SIZE = 15 * 1024 * 1024;
  const allowedExt = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);

  const aliases = {
    token: ["t", "token", "access"],
    session_id: ["session_id", "session"],
    sid: ["sid"],
    job_id: ["job_id", "job"],
    payment_ref: ["payment_ref", "payment", "ref"],
    model_id: ["model_id", "model", "mid"],
    client_name: ["client", "name"],
    model_name: ["model_name"]
  };

  function getParam(keys) {
    for (const key of keys) {
      const value = qs.get(key);
      if (value) return value.trim();
    }
    return "";
  }

  function setValue(id, value) {
    const el = $(id);
    if (el && value) el.value = value;
  }

  function buildUrl(base) {
    const url = new URL(base, window.location.origin);
    ["t", "token", "session_id", "sid", "job_id", "payment_ref", "model_id", "code", "promo", "source", "invite"].forEach((key) => {
      const value = qs.get(key);
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    return url.pathname + url.search + url.hash;
  }

  function hydrate() {
    setValue("#srr2Token", getParam(aliases.token));
    setValue("#srr2SessionId", getParam(aliases.session_id));
    setValue("#srr2Sid", getParam(aliases.sid));
    setValue("#srr2JobId", getParam(aliases.job_id));
    setValue("#srr2PaymentRef", getParam(aliases.payment_ref));
    setValue("#srr2ModelId", getParam(aliases.model_id));
    setValue("#srr2ClientName", getParam(aliases.client_name));
    setValue("#srr2ModelName", getParam(aliases.model_name));

    root.querySelectorAll("[data-srr2-link]").forEach((link) => {
      const type = link.dataset.srr2Link;
      const target = type === "aftercare" ? config.aftercareUrl : type === "dashboard" ? config.dashboardUrl : config.bookingUrl;
      link.href = buildUrl(target);
    });
  }

  function fileExt(file) {
    return (file.name.split(".").pop() || "").toLowerCase();
  }

  function validateFiles(input, label) {
    const files = Array.from(input.files || []);
    if (files.length > MAX_FILES) throw new Error(`${label}: เลือกได้สูงสุด ${MAX_FILES} ไฟล์`);
    for (const file of files) {
      if (file.size > MAX_SIZE) throw new Error(`${file.name}: ไฟล์ใหญ่เกิน 15MB`);
      if (!allowedExt.has(fileExt(file))) throw new Error(`${file.name}: ประเภทไฟล์ยังไม่รองรับ`);
    }
    return files;
  }

  function renderFileList(input, target) {
    const files = Array.from(input.files || []);
    if (!files.length) {
      target.textContent = "ยังไม่มีไฟล์";
      return;
    }
    target.innerHTML = files.map((file) => {
      const mb = (file.size / 1024 / 1024).toFixed(2);
      return `<div>${escapeHtml(file.name)} · ${mb}MB</div>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function endpointUrl() {
    return config.apiBase.replace(/\/$/, "") + config.endpoint;
  }

  function buildFormData() {
    const fd = new FormData(form);
    fd.set("brand", "MMD_PRIVÉ_SIGIL");
    fd.set("page", "/sigil/recovery");
    fd.set("route", window.location.pathname);
    fd.set("referrer", document.referrer || "");
    fd.set("user_agent", navigator.userAgent || "");
    fd.set("timestamp", new Date().toISOString());
    fd.set("workflow_status", "new_recovery_report");
    fd.set("next_step", "internal_review");
    fd.set("final_approver", "MMD");
    return fd;
  }

  function setStatus(message, mode) {
    result.textContent = message || "";
    result.dataset.mode = mode || "";
    const chip = $("#srr2StatusChip");
    if (chip && message) chip.textContent = mode === "success" ? "Report sent" : mode === "error" ? "Check required" : "Sending report";
  }

  async function submitRecovery(event) {
    event.preventDefault();
    setStatus("", "");

    try {
      if (!form.reportValidity()) return;
      validateFiles(clientInput, "Customer evidence");
      validateFiles(modelInput, "Model evidence");

      submit.disabled = true;
      submit.textContent = "Sending...";
      setStatus("กำลังส่งรายงานให้ MMD ตรวจสอบครับ", "loading");

      const response = await fetch(endpointUrl(), {
        method: "POST",
        body: buildFormData(),
        headers: { "X-MMD-Client": "sigil-recovery-room-v2", "X-MMD-Route": "/sigil/recovery" },
        credentials: "omit"
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || data.error || `ส่งไม่สำเร็จ (${response.status})`);
      }

      const id = data?.complaint?.complaint_id || data?.complaint_id || "received";
      setStatus(`ส่งเรื่องเรียบร้อยครับ Case: ${id}`, "success");
      form.reset();
      renderFileList(clientInput, clientFiles);
      renderFileList(modelInput, modelFiles);
      hydrate();
    } catch (error) {
      setStatus(error.message || "ส่งไม่สำเร็จ กรุณาตรวจข้อมูลอีกครั้ง", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Send Report";
    }
  }

  clientInput && clientInput.addEventListener("change", () => {
    try { validateFiles(clientInput, "Customer evidence"); renderFileList(clientInput, clientFiles); }
    catch (error) { clientInput.value = ""; renderFileList(clientInput, clientFiles); setStatus(error.message, "error"); }
  });

  modelInput && modelInput.addEventListener("change", () => {
    try { validateFiles(modelInput, "Model evidence"); renderFileList(modelInput, modelFiles); }
    catch (error) { modelInput.value = ""; renderFileList(modelInput, modelFiles); setStatus(error.message, "error"); }
  });

  form && form.addEventListener("submit", submitRecovery);
  hydrate();
})();
</script>