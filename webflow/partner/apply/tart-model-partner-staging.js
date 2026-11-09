(() => {
  "use strict";
  if (location.hostname !== "mmdprive.webflow.io") return;
  const destination = "/partner/apply?partner_type=modeling&source=tart-model-partner";
  function mount() {
    if (location.pathname === "/sigil/model/dashboard") {
      const dashboard = document.querySelector("[data-mmd-sigil-dashboard-v2]") || document.querySelector(".mmd-mdash");
      if (!dashboard || dashboard.querySelector("[data-tart-partner-entry]")) return;
      const entry = document.createElement("a");
      entry.href = destination;
      entry.dataset.tartPartnerEntry = "";
      entry.textContent = "TarT · หาโมเดลเพิ่ม";
      entry.style.cssText = "display:inline-flex;align-items:center;min-height:44px;padding:0 16px;margin:12px 0;border:1px solid #c9b38b;border-radius:10px;color:#f3f0e8;background:#171b1d";
      dashboard.prepend(entry);
      return;
    }
    const params = new URLSearchParams(location.search);
    if (location.pathname !== "/partner/apply" || params.get("source") !== "tart-model-partner") return;
    const root = document.getElementById("mmdPartnerApplyV2");
    const form = root?.querySelector("form[name='mmd-prive-partner-intake']");
    if (!form || document.getElementById("tart-partner-preview")) return;
    const panel = document.createElement("section");
    panel.id = "tart-partner-preview";
    panel.style.cssText = "display:grid;gap:12px;padding:18px;margin:16px 0;border:1px solid #756343;border-radius:14px;color:#f3f0e8;background:#171b1d";
    panel.innerHTML = `<h2 style="margin:0">สมัครเป็น Model Partner</h2>
      <p style="margin:0">TarT · หาโมเดลเพิ่ม · ทดลอง flow บน staging</p>
      <label for="tart-work-type">ต้องการหาโมเดลสำหรับงานแบบไหน</label>
      <select id="tart-work-type" required style="min-height:44px;background:#232729;color:#f3f0e8"><option value="">เลือกประเภทงาน</option><option value="public">Public</option><option value="private">Private</option></select>
      <label for="tart-work-timing">ตอนนี้อยู่ช่วงไหน</label>
      <select id="tart-work-timing" required style="min-height:44px;background:#232729;color:#f3f0e8"><option value="">เลือกช่วงเวลา</option><option value="planned">หาล่วงหน้า</option><option value="in_job">อยู่ในงานแล้ว</option></select>
      <button type="button" style="min-height:44px;background:#c9b38b;color:#171b1d;border:0;border-radius:9px">ตรวจคำขอ</button>
      <p role="status" aria-live="polite" style="margin:0"></p>`;
    form.hidden = true;
    form.style.setProperty("display", "none", "important");
    form.before(panel);
    const work = panel.querySelector("#tart-work-type");
    const timing = panel.querySelector("#tart-work-timing");
    const status = panel.querySelector("[role=status]");
    panel.querySelector("button").onclick = () => {
      if (!work.reportValidity() || !timing.reportValidity()) return;
      const workLabel = {public:"Public", private:"Private"}[work.value];
      const timingLabel = {planned:"หาล่วงหน้า", in_job:"อยู่ในงานแล้ว"}[timing.value];
      if (!workLabel || !timingLabel) return;
      status.textContent = workLabel + " · " + timingLabel + " · ตรวจคำขอจำลองเรียบร้อย";
    };
    for (const field of [work, timing]) field.addEventListener("change", () => { status.textContent = ""; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, {once:true});
  else mount();
})();
