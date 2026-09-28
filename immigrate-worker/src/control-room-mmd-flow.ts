// Navigation only: decisions stay in each authenticated canonical workflow.
export const MMD_OPERATIONS_FLOW = String.raw`
<section class="mmd-workflow" aria-labelledby="mmd-workflow-title" data-mmd-workflow="20260922">
  <div class="mmd-workflow__heading"><div><p class="k">MMD · DAILY OPERATIONS</p><h2 id="mmd-workflow-title">เริ่มจากลูกค้า แล้วทำต่อให้จบงาน</h2><p>เลือกขั้นที่ค้างอยู่ เปิดงานเดิมเพื่อตรวจรายละเอียดก่อนดำเนินการ</p></div><a class="primary" href="/internal/admin/jobs/all">ดูงานล่าสุด ↗</a></div>
  <ol class="mmd-workflow__steps">
    <li><span>01 · ลูกค้าและงาน</span><h3>หาคนให้ถูก งานให้ตรง</h3><p>ค้นชื่อ Per Rename, ชื่อ LINE หรือประวัติลูกค้า แล้วเทียบโมเดล วันที่ และงานล่าสุดก่อนเลือก</p><a href="/internal/admin/customer-data">ค้นลูกค้า / MMD Memory ↗</a><a href="/internal/admin/jobs/all">หาจากงานล่าสุด ↗</a></li>
    <li><span>02 · หลักฐาน</span><h3>รับสลิปเข้ารายการ</h3><p>ลูกค้าส่งผ่านหน้าชำระเงินของงานหรือ LINE OFC ทางใดทางหนึ่ง สลิปจาก LINE เข้า Slip Intake ก่อนตรวจว่าผูกกับลูกค้าและงานถูกต้อง</p><a href="/internal/ceo/payment-slip-inbox">เปิดกล่องสลิป / ตรวจการจับคู่ ↗</a></li>
    <li><span>03 · ตรวจเงิน</span><h3>ตรวจบัญชี แล้วรับรองยอด</h3><p>เปิดสลิป เทียบยอดที่ต้องรับ และตรวจเงินเข้าจริง สลิปที่รับมาแล้วอาจยังรอตรวจเงิน</p><a href="/internal/admin/payments">ตรวจรับเงิน ↗</a></li>
    <li><span>04 · คอนเฟิร์ม</span><h3>ติดตามลูกค้าและโมเดล</h3><p>เปิดรายการรับเงินแล้ว ตรวจผลส่งลิงก์และสถานะยืนยันของแต่ละคน รวมถึงคำขอแก้ไขที่ยังค้าง</p><a href="/internal/admin/payments">ติดตามคอนเฟิร์มของงาน ↗</a></li>
    <li><span>05 · ก่อนเริ่มงาน</span><h3>ตรวจความพร้อมอีกครั้ง</h3><p>ตรวจวัน เวลา สถานที่ การยืนยันก่อนงาน และบรีฟเดินทางจากงานที่เลือก ให้ผู้เกี่ยวข้องเห็นรายละเอียดเดียวกัน</p><a href="/internal/admin/jobs/all">เปิดงานและเตรียมก่อนงาน ↗</a></li>
  </ol>
  <div class="mmd-workflow__memory"><div><h3>MMD Memory ช่วยจำคนและประวัติ</h3><p>ชื่อที่เปอร์เรียก ชื่อ LINE และประวัติงานช่วยค้นหา เมื่อตรงกันหลายคนให้ตรวจตัวตนก่อนผูกสลิป การแจ้งเตือน Telegram ช่วยตามเรื่อง ส่วนผลรับเงินและคอนเฟิร์มให้ดูในรายการงาน</p></div><a class="primary" href="/internal/admin/jobs/create-job">สร้างงานใหม่ ↗</a></div>
</section>`;

export const MMD_OPERATIONS_STYLE = String.raw`<style data-mmd-workflow-style>
#mmd-os-v1 .mmd-workflow{margin:18px 0 22px;padding:22px;border:1px solid #514126;border-radius:16px;background:linear-gradient(135deg,#19140d,#0e0d0b 65%);color:#f2ece1}
#mmd-os-v1 .mmd-workflow__heading,#mmd-os-v1 .mmd-workflow__memory{display:flex;align-items:center;justify-content:space-between;gap:20px}
#mmd-os-v1 .mmd-workflow h2{margin:7px 0;font-size:clamp(22px,3vw,30px);line-height:1.3}
#mmd-os-v1 .mmd-workflow p{margin:7px 0;color:#c1b8aa;font-size:14px;line-height:1.7}
#mmd-os-v1 .mmd-workflow__steps{list-style:none;padding:0;margin:22px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
#mmd-os-v1 .mmd-workflow__steps li{padding:17px;border:1px solid #3e3427;border-radius:12px;background:#100e0b;min-width:0}
#mmd-os-v1 .mmd-workflow__steps span{color:#dfbd78;font-size:12px;font-weight:700}
#mmd-os-v1 .mmd-workflow h3{margin:10px 0 4px;color:#f2ece1;font-size:18px;line-height:1.45}
#mmd-os-v1 .mmd-workflow__steps a{display:block;padding:10px 0;color:#e8c782;font-size:14px;font-weight:700;line-height:1.5}
#mmd-os-v1 .mmd-workflow__memory{border-top:1px solid #403426;padding-top:14px}
#mmd-os-v1 .mmd-workflow__memory>div{max-width:850px}
#mmd-os-v1 .mmd-workflow a:focus-visible{outline:2px solid #f4d99c;outline-offset:4px}
#mmd-os-v1 .mmd-workflow a:hover{text-decoration:underline}
/* Final scoped contrast and legibility for the operator's existing surface. */
#mmd-os-v1 .heading p,#mmd-os-v1 .queue p,#mmd-os-v1 .mini p,#mmd-os-v1 .system small,#mmd-os-v1 .brief p{color:#bfb5a6;font-size:13px;line-height:1.65}
#mmd-os-v1 .tabs button,#mmd-os-v1 .primary{font-size:13px;min-height:42px}
#mmd-os-v1 .queue h3,#mmd-os-v1 .mini h3,#mmd-os-v1 .system strong{font-size:16px;color:#f2ece1}
#mmd-os-v1 .queue b,#mmd-os-v1 .mini b,#mmd-os-v1 .k{font-size:11px;color:#dfbd78}
@media(max-width:1050px){#mmd-os-v1 .mmd-workflow__steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){#mmd-os-v1 .mmd-workflow{padding:16px}#mmd-os-v1 .mmd-workflow__steps{grid-template-columns:1fr}#mmd-os-v1 .mmd-workflow__heading,#mmd-os-v1 .mmd-workflow__memory{align-items:stretch;flex-direction:column}#mmd-os-v1 .tabs button{padding:0 9px}}
</style>`;
