(function () {
  "use strict";
  function boot() {
    var root = document.getElementById("mmd-auto-card-inbox");
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "true";
    var q = function (selector) { return root.querySelector(selector); };
    var status = q("[data-status]"), jobs = q("[data-jobs]"), area = q("[data-image]");
    var login = q("[data-login]"), more = q("[data-more]");
    var busy = false, cursor = null, previewUrl = "", enabled = false, seen = new Set();
    var labels = { queued: "เข้าคิวแล้ว", preparing: "กำลังเตรียมข้อมูล", waiting_profile: "รอข้อมูลโปรไฟล์", waiting_configuration: "รอการตั้งค่าระบบ", generating: "กำลังสร้างภาพ", rendering: "กำลังจัดการ์ด", awaiting_owner_review: "รอตรวจการ์ด", source_changed: "รูปหลักหรือข้อมูลเปลี่ยนแล้ว", needs_review: "ต้องตรวจงาน", paused: "พักการสร้างภาพ" };
    function clearPreview() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = ""; area.replaceChildren();
    }
    function setBusy(value) {
      busy = value; root.setAttribute("aria-busy", String(value));
      root.querySelectorAll("button").forEach(function (button) { button.disabled = value; });
    }
    function errorMessage(error) {
      if (error.status === 401 || error.status === 403) {
        jobs.replaceChildren(); seen.clear(); clearPreview(); cursor = null; more.hidden = true;
        login.hidden = false;
        var next = window.location.pathname + window.location.search;
        login.setAttribute("href", "/internal/admin/login?next=" + encodeURIComponent(next));
        return error.status === 403 ? "บัญชีนี้ยังไม่มีสิทธิ์ตรวจการ์ด" : "กรุณาเข้าสู่ระบบแอดมินเพื่อดูการ์ด";
      }
      if (error.status === 404) return "ส่วนรับการ์ดยังไม่เปิดใช้งาน กรุณาลองอีกครั้งหลังระบบพร้อม";
      if (error.status === 409) return "รูปหรือข้อมูลเปลี่ยนแล้ว กรุณารีเฟรชและตรวจอีกครั้ง";
      return "เชื่อมต่อรายการการ์ดไม่ได้ กรุณากดรีเฟรชเพื่อลองอีกครั้ง";
    }
    async function request(action, body, image) {
      var expected = "/studio/api/model-cards/" + action;
      if (root.getAttribute("data-" + action) !== expected) throw new Error("invalid_endpoint");
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch(expected, { method: "POST", credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal, headers: { "content-type": "application/json", accept: image ? "image/png" : "application/json" }, body: JSON.stringify(body || {}) });
        if (!response.ok) throw Object.assign(new Error("request_failed"), { status: response.status });
        var type = response.headers.get("content-type") || "";
        if (image) {
          if (!/^image\/png(?:;|$)/i.test(type)) throw new Error("invalid_image");
          var blob = await response.blob();
          if (!blob.size) throw new Error("empty_image");
          return blob;
        }
        if (!/^application\/json(?:;|$)/i.test(type)) throw new Error("invalid_json");
        var data = await response.json();
        if (!data || data.ok !== true) throw new Error("invalid_response");
        return data;
      } finally { clearTimeout(timer); }
    }
    function text(tag, value) { var el = document.createElement(tag); el.textContent = value; return el; }
    async function preview(job) {
      if (busy) return;
      setBusy(true); clearPreview(); status.textContent = "กำลังเปิดการ์ด…";
      try {
        var blob = await request("preview", { model_record_id: job.model_record_id, job_id: job.job_id }, true);
        previewUrl = URL.createObjectURL(blob);
        var image = document.createElement("img"); image.src = previewUrl; image.alt = "ร่างการ์ด " + job.model_name;
        var link = text("a", "ดาวน์โหลดร่าง PNG"); link.href = previewUrl; link.download = job.job_id + "-1322x1200.png";
        area.append(image, link); status.textContent = "เปิดร่างแล้ว · กรุณาตรวจภาพและข้อมูลก่อนนำไปใช้";
      } catch (error) { status.textContent = errorMessage(error); }
      finally { setBusy(false); }
    }
    async function resume(job) {
      if (busy || !enabled) return;
      setBusy(true); clearPreview(); status.textContent = "กำลังตรวจข้อมูลเพื่อดำเนินต่อ…";
      var done = false;
      try { await request("resume", { model_record_id: job.model_record_id, job_id: job.job_id }); done = true; }
      catch (error) { status.textContent = errorMessage(error); }
      finally { setBusy(false); }
      if (done) load(false);
    }
    function render(job) {
      var item = document.createElement("article"), copy = document.createElement("div");
      copy.append(text("strong", job.model_name || "Model"), text("span", labels[job.state] || "ต้องตรวจงาน"));
      if (Array.isArray(job.missing) && job.missing.length) copy.append(text("small", "ข้อมูลที่ยังขาด: " + job.missing.join(", ")));
      item.append(copy);
      if (job.state === "awaiting_owner_review" || (enabled && job.can_resume === true)) {
        var button = text("button", job.state === "awaiting_owner_review" ? "ดูการ์ด" : "ตรวจข้อมูลแล้วดำเนินต่อ"); button.type = "button";
        button.addEventListener("click", function () { if (job.state === "awaiting_owner_review") preview(job); else resume(job); });
        item.append(button);
      }
      jobs.append(item);
    }
    async function load(append) {
      if (busy) return;
      setBusy(true); login.hidden = true; status.textContent = "กำลังอ่านรายการ…";
      if (!append) { cursor = null; more.hidden = true; jobs.replaceChildren(); seen.clear(); clearPreview(); }
      try {
        var data = await request("list", append && cursor ? { cursor: cursor } : {});
        if (!Array.isArray(data.jobs) || typeof data.enabled !== "boolean" || (data.cursor !== null && typeof data.cursor !== "string")) throw new Error("invalid_list");
        if (!data.jobs.every(function (job) { return job && /^card_[a-f0-9]{32}$/.test(job.job_id) && /^rec[A-Za-z0-9]{14,24}$/.test(job.model_record_id); })) throw new Error("invalid_jobs");
        enabled = data.enabled;
        data.jobs.forEach(function (job) { if (!seen.has(job.job_id)) { seen.add(job.job_id); render(job); } });
        cursor = data.cursor; more.hidden = !cursor;
        status.textContent = !enabled ? "ยังไม่ได้เปิดสร้างการ์ดอัตโนมัติ · ร่างที่มีอยู่ยังเปิดตรวจได้" : seen.size ? "เลือกร่างเพื่อดูการ์ด" : "ยังไม่มีร่างจากการเลือกรูปหลัก";
      } catch (error) { status.textContent = errorMessage(error); }
      finally { setBusy(false); }
    }
    q("[data-refresh]").addEventListener("click", function () { load(false); });
    more.addEventListener("click", function () { if (cursor) load(true); });
    window.addEventListener("pagehide", clearPreview);
    load(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
