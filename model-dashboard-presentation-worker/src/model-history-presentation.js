export const MODEL_HISTORY_JS = String.raw`(() => {
  "use strict";
  const ID = "mmd-model-history-v1";
  if (document.getElementById(ID)) return;
  const money = value => value == null ? "ยังไม่มีจำนวนเงินในบันทึก" : new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(Number(value)) + " บาท";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[ch]));
  const date = value => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "วันที่ยังไม่ระบุ"; return new Intl.DateTimeFormat("th-TH", { dateStyle:"medium" }).format(new Date(value + "T00:00:00+07:00")); };
  const node = document.createElement("section");
  node.id = ID;
  node.className = "mmd-model-history-v1 is-loading";
  node.innerHTML = '<div class="mmd-model-history-v1__head"><div><small>WORK & EARNINGS</small><h2>ประวัติงานและรายได้กับ MMD</h2></div><button type="button" data-history-toggle aria-expanded="false">ดูประวัติ</button></div>' +
    '<div class="mmd-model-history-v1__summary"><div><span>รายได้จากงานที่ยืนยัน</span><strong data-earned>กำลังโหลด…</strong></div><div><span>จ่ายแล้วที่ยืนยัน</span><strong data-paid>—</strong></div><div><span>งานที่ทำแล้ว</span><strong data-count>—</strong></div></div>' +
    '<p class="mmd-model-history-v1__note" data-backfill hidden></p><div class="mmd-model-history-v1__details" data-details hidden></div>';
  document.body.prepend(node);
  const details = node.querySelector("[data-details]");
  node.querySelector("[data-history-toggle]").addEventListener("click", event => {
    const open = details.hidden;
    details.hidden = !open;
    event.currentTarget.setAttribute("aria-expanded", String(open));
    event.currentTarget.textContent = open ? "ซ่อนประวัติ" : "ดูประวัติ";
  });
  fetch("/v1/model/history", { credentials:"include", cache:"no-store", headers:{ accept:"application/json" } })
    .then(response => response.ok ? response.json() : Promise.reject(new Error("history_unavailable")))
    .then(payload => {
      if (payload?.ok !== true) throw new Error("history_unavailable");
      const summary = payload.summary || {};
      node.querySelector("[data-earned]").textContent = money(summary.earned_total_thb);
      node.querySelector("[data-paid]").textContent = money(summary.paid_confirmed_total_thb);
      node.querySelector("[data-count]").textContent = String(Number(summary.completed_job_count || 0)) + " งาน";
      if (summary.backfill_status === "canonical_only_backfill_not_started") {
        const note = node.querySelector("[data-backfill]");
        note.hidden = false;
        note.textContent = "กำลังรวบรวมประวัติจากแชทสำรองและ LINE ย้อนหลัง · ยอดนี้แสดงเฉพาะรายการที่เชื่อมและตรวจแล้ว";
      } else if (Number(summary.history_items_waiting_review || 0) > 0) {
        const note = node.querySelector("[data-backfill]");
        note.hidden = false;
        note.textContent = "มีประวัติย้อนหลังบางรายการอยู่ระหว่างตรวจสอบ";
      }
      const jobs = Array.isArray(payload.items) ? payload.items : [];
      const earnings = Array.isArray(payload.earnings) ? payload.earnings : [];
      details.innerHTML = '<h3>งานที่ทำแล้ว</h3>' + (jobs.length ? '<div class="mmd-model-history-v1__list">' + jobs.map(item => '<article><div><b>' + esc(date(item.work_date)) + '</b><span>' + esc(item.work_type || "งานผ่าน MMD") + '</span></div><div><b>' + esc(money(item.earned_amount_thb)) + '</b><span>' + esc(item.payment_evidence === "paid_confirmed" ? "จ่ายแล้ว · ยืนยัน" : item.payment_evidence === "not_recorded" ? "ยังไม่มีบันทึกสถานะจ่าย" : "ตรวจจากบันทึก MMD") + '</span></div></article>').join("") + '</div>' : '<p>ยังไม่มีประวัติงานที่ยืนยันแล้ว</p>') +
        '<h3>รายการรับเงินที่ยืนยัน</h3>' + (earnings.length ? '<div class="mmd-model-history-v1__list">' + earnings.map(item => '<article><div><b>' + esc(item.evidence_labels?.[0] || "รายการรายได้") + '</b><span>' + esc(item.work_date ? date(item.work_date) : "วันที่รับเงินยังไม่ระบุ") + '</span></div><div><b>' + esc(money(item.amount_thb)) + '</b><span>' + esc(item.payment_evidence === "paid_confirmed_no_slip" ? "ยืนยันจ่ายแล้ว · ไม่มีสลิปแนบ" : item.payment_evidence === "paid_confirmed_with_slip" ? "ยืนยันจ่ายแล้ว · มีสลิป" : "บันทึกย้อนหลังที่ MMD ตรวจแล้ว") + '</span></div></article>').join("") + '</div>' : '<p>ยังไม่มีรายการจ่ายที่ยืนยันแล้ว</p>');
      node.classList.remove("is-loading");
    }).catch(() => { node.remove(); });
})();`;

export const MODEL_HISTORY_CSS = String.raw`
#mmd-model-history-v1{position:relative;z-index:2147479990;width:min(calc(100% - 24px),1180px);margin:14px auto;padding:16px;border:1px solid rgba(214,194,141,.28);border-radius:18px;background:linear-gradient(145deg,rgba(29,27,23,.97),rgba(12,12,13,.97));color:#f6f0e2;box-shadow:0 12px 36px rgba(0,0,0,.2);font:inherit}
#mmd-model-history-v1 .mmd-model-history-v1__head{display:flex;justify-content:space-between;align-items:center;gap:12px}
#mmd-model-history-v1 small{display:block;color:#d6c28d;font-size:9px;font-weight:800;letter-spacing:.16em}
#mmd-model-history-v1 h2{margin:3px 0 0;color:#f5f2e9;font-size:16px;line-height:1.3}
#mmd-model-history-v1 h3{margin:18px 0 8px;color:#d6c28d;font-size:13px}
#mmd-model-history-v1 button{flex:none;border:1px solid rgba(214,194,141,.45);border-radius:999px;padding:8px 13px;background:#211e17;color:#f5e6b6;font:inherit;font-size:12px;font-weight:700}
#mmd-model-history-v1 .mmd-model-history-v1__summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
#mmd-model-history-v1 .mmd-model-history-v1__summary>div{min-width:0;padding:11px;border:1px solid #302d27;border-radius:12px;background:#101011}
#mmd-model-history-v1 .mmd-model-history-v1__summary span,#mmd-model-history-v1 .mmd-model-history-v1__list span{display:block;color:#aaa59a;font-size:10px;line-height:1.45}
#mmd-model-history-v1 .mmd-model-history-v1__summary strong{display:block;margin-top:5px;color:#f3ead1;font-size:clamp(13px,3vw,20px);overflow-wrap:anywhere}
#mmd-model-history-v1 .mmd-model-history-v1__note{margin:11px 0 0;color:#d6c28d;font-size:11px;line-height:1.55}
#mmd-model-history-v1 .mmd-model-history-v1__details[hidden],#mmd-model-history-v1 [hidden]{display:none!important}
#mmd-model-history-v1 .mmd-model-history-v1__list{display:grid;gap:7px}
#mmd-model-history-v1 .mmd-model-history-v1__list article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px;border:1px solid #2b2924;border-radius:12px;background:#101011}
#mmd-model-history-v1 .mmd-model-history-v1__list article>div:last-child{text-align:right}
#mmd-model-history-v1 .mmd-model-history-v1__list b{display:block;color:#f5f2e9;font-size:12px;line-height:1.4}
#mmd-model-history-v1 .mmd-model-history-v1__details p{color:#aaa59a;font-size:12px}
@media(max-width:520px){#mmd-model-history-v1{padding:13px}#mmd-model-history-v1 .mmd-model-history-v1__summary{grid-template-columns:1fr 1fr}#mmd-model-history-v1 .mmd-model-history-v1__summary>div:first-child{grid-column:span 2}}
`;
