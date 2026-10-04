// Same-origin, read-only customer projection of the Console's canonical Session.
export function myMmdSessionPanel() {
  return `<section id="mmd-session-panel" hidden aria-live="polite" style="margin:16px;padding:18px;border:1px solid #e6ddd0;border-radius:18px;background:#fffaf3;color:#2b2723;font-family:system-ui,sans-serif">
<h2 style="font-size:18px;margin:0 0 10px">งานของคุณ</h2><p data-session-status></p><p data-session-summary></p><p data-session-eta></p><a data-session-login hidden>เข้าสู่ MY MMD ผ่าน LINE</a>
</section><script id="mmd-session-panel-runtime">
(() => {
  const panel = document.getElementById("mmd-session-panel");
  if (!panel) return;
  const status = panel.querySelector("[data-session-status]");
  const summary = panel.querySelector("[data-session-summary]");
  const eta = panel.querySelector("[data-session-eta]");
  const login = panel.querySelector("[data-session-login]");
  const refs = new URLSearchParams(location.search).getAll("session_id");
  const selected = refs.length === 1 ? refs[0] : null;
  if (refs.length && (selected === null || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(selected))) {
    status.textContent = "ลิงก์งานไม่ถูกต้อง กรุณาเปิดลิงก์จาก MMD อีกครั้ง";
    panel.hidden = false;
    return;
  }
  const endpoint = "/api/member/app/session/current" + (selected ? "?session_id=" + encodeURIComponent(selected) : "");
  const labels = {pending_confirmation:"รอยืนยันงาน",confirmed:"ยืนยันงานแล้ว",preparing:"กำลังเตรียมตัว",en_route:"กำลังเดินทาง",nearby:"ใกล้ถึงแล้ว",arrived:"ถึงแล้ว",met_customer:"พบกันแล้ว",final_payment_pending:"กำลังตรวจสอบการชำระเงิน",final_payment_confirmed:"ยืนยันการชำระเงินแล้ว",work_started:"เริ่มงานแล้ว",in_progress:"กำลังทำงาน",work_finished:"งานเสร็จแล้ว",separated:"จบงานแล้ว",completed:"จบงานแล้ว",cancelled:"ยกเลิกงานแล้ว"};
  (async () => {
    try {
      const response = await fetch(endpoint, {credentials:"same-origin",cache:"no-store",headers:{accept:"application/json"}});
      if (response.status === 204 && !selected) return;
      if (response.status === 401) {
        if (!selected) return;
        status.textContent = "เข้าสู่ LINE ของเจ้าของงานเพื่อดูรายละเอียด";
        login.href = "/member/liff?intent=status&session_id=" + encodeURIComponent(selected);
        login.hidden = false;
        panel.hidden = false;
        return;
      }
      const session = await response.json().catch(() => null);
      if (!response.ok || !session || (selected && session.sessionId !== selected)) throw new Error("session_unavailable");
      if (session.missionReady !== true || !labels[session.lifecycle]) {
        if (!selected) return;
        status.textContent = "งานนี้ยังอยู่ระหว่างการตรวจสอบโดย MMD";
      } else {
        status.textContent = labels[session.lifecycle];
        const model = session.model?.displayAllowed === true ? session.model.displayName : "";
        summary.textContent = [model,session.jobDate,session.jobTimeLabel,session.locationDisplay].filter(value => typeof value === "string" && value).join(" · ");
        eta.textContent = typeof session.etaLabel === "string" ? session.etaLabel : "";
      }
      panel.hidden = false;
    } catch {
      status.textContent = "ยังอ่านงานนี้ไม่ได้ กรุณาเปิด MY MMD อีกครั้ง";
      panel.hidden = false;
    }
  })();
})();
</script>`;
}
