// Navigation only. Destination pages retain their existing session and role gates.
const modules = [
  ["ลูกค้าและ MMD Memory", "ค้นตัวตน ชื่อที่เปอร์เรียก และประวัติที่มีหลักฐาน", "/internal/admin/member-intelligence", "ลูกค้า memory client customer LINE Per Rename"],
  ["งานทั้งหมด", "เลือกงานเดิมเพื่อตรวจรายละเอียดและขั้นตอนที่ค้าง", "/internal/admin/jobs/all", "งาน job session คอนเฟิร์ม confirmation"],
  ["สร้างงานใหม่", "เลือก Client และ Model ก่อนสร้างงาน", "/internal/admin/jobs/create-job", "สร้าง create booking จอง"],
  ["กล่องสลิป", "ตรวจหลักฐานและการจับคู่กับลูกค้าและงาน", "/internal/ceo/payment-slip-inbox", "สลิป slip inbox evidence"],
  ["ตรวจรับเงิน", "เปิดรายการเพื่อตรวจเงินและสถานะคอนเฟิร์ม", "/internal/admin/payments", "เงิน payment verify คอนเฟิร์ม confirmation"],
  ["หลักฐานรับเงินย้อนหลัง", "ตรวจรายการย้อนหลังที่ต้องเชื่อมหลักฐาน", "/internal/admin/payments/historical-backfill", "ย้อนหลัง historical backfill"],
  ["สมาชิกและสิทธิ์", "ดูสถานะที่ระบบยืนยันก่อนดำเนินการ", "/internal/admin/membership-access", "สมาชิก membership access entitlement"],
  ["Kenji Admin", "ดูความรู้ คำตอบ และรายการที่ต้องตรวจ", "/internal/admin/kenji", "kenji knowledge AI ความรู้"],
  ["Per Control", "เปิดเครื่องมือ Owner สำหรับข้อยกเว้นและการรับช่วง", "/internal/ceo/kenji-control", "owner per takeover exception"],
  ["MMS Operations", "ดูใบสมัครและงานฝั่ง MMS", "/internal/admin/mms", "mms therapist partner ใบสมัคร"],
] as const;

export function matchesAdminModule(label: string, description: string, keywords: string, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = `${label} ${description} ${keywords}`.toLocaleLowerCase();
  return terms.every(term => text.includes(term));
}

export const ADMIN_WORKSPACE_PANEL = `<section class="mmd-launcher" data-mmd-admin-launcher aria-labelledby="admin-launcher-title">
  <h2 id="admin-launcher-title">เปิดหน้าที่ต้องใช้</h2>
  <p>ค้นหาหน้าที่ทำงาน เช่น ลูกค้า สลิป คอนเฟิร์ม หรือสมาชิก แล้วเลือกหน้าต้นทาง</p>
  <label for="admin-module-search">ค้นหาเครื่องมือหลังบ้าน</label>
  <input id="admin-module-search" type="search" placeholder="พิมพ์ชื่อหน้าหรือสิ่งที่ต้องทำ" autocomplete="off" maxlength="100" aria-controls="admin-module-list">
  <p class="mmd-launcher__count" data-module-count role="status" aria-live="polite">${modules.length} เครื่องมือ</p>
  <nav id="admin-module-list" class="mmd-launcher__grid" aria-label="เครื่องมือหลังบ้าน">${modules.map(([label, description, href, keywords]) => `<a href="${href}" data-admin-module data-module-keywords="${keywords}"><strong>${label}</strong><span>${description}</span></a>`).join("")}</nav>
  <p data-module-empty hidden>ไม่พบเครื่องมือจากคำนี้ ลองคำสั้น ๆ เช่น งาน เงิน หรือ memory</p>
  <details class="mmd-launcher__references"><summary>เอกสารอ้างอิง · Google Drive / Notion / GitHub</summary>
    <p>เอกสารช่วยอธิบายระบบ สถานะลูกค้า เงิน และสิทธิ์ให้ตรวจในหน้าต้นทาง เอกสารอาจเก่ากว่าโค้ดหรือระบบที่ใช้อยู่</p>
    <a href="https://docs.google.com/document/d/1ufXXWi9HEaL65kAZCKXTMf_yOCekGnLt1aTSudjAZ2c/edit" target="_blank" rel="noopener noreferrer">Google Drive · MMD Core Knowledge ↗</a>
    <a href="https://app.notion.com/p/3e9581443cc281ca9414cd00aee80286" target="_blank" rel="noopener noreferrer">Notion · แผนผังหลังบ้านและขอบเขตระบบ ↗</a>
    <a href="https://app.notion.com/p/3e9581443cc281389451f43906e0d915" target="_blank" rel="noopener noreferrer">Notion · หลักฐานการนำขึ้นใช้งาน ↗</a>
    <a href="https://github.com/MMD-Prive/mmd-workers" target="_blank" rel="noopener noreferrer">GitHub · โค้ด MMD Workers ↗</a>
  </details>
</section>`;

export const ADMIN_WORKSPACE_STYLE = `<style data-mmd-admin-launcher-style>
#mmd-os-v1 .mmd-launcher{margin:16px 0;padding:20px;border:1px solid #514126;border-radius:16px;background:#100e0b}
#mmd-os-v1 .mmd-launcher h2{margin:0;font-size:24px;line-height:1.4}
#mmd-os-v1 .mmd-launcher p{color:#c1b8aa;font-size:14px;line-height:1.7}
#mmd-os-v1 .mmd-launcher label{display:block;margin-bottom:8px;font-size:14px}
#mmd-os-v1 .mmd-launcher input{width:100%;min-height:48px;padding:12px;border:1px solid #79603b;border-radius:10px;background:#080706;color:#f2ece1}
#mmd-os-v1 .mmd-launcher input{font-family:inherit;font-size:16px}
#mmd-os-v1 .mmd-launcher input::placeholder{color:#bfb5a6}
#mmd-os-v1 .mmd-launcher__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#mmd-os-v1 .mmd-launcher__grid a{min-width:0;padding:16px;border:1px solid #403426;border-radius:12px;min-height:96px}
#mmd-os-v1 .mmd-launcher__grid strong,#mmd-os-v1 .mmd-launcher__grid span{display:block}
#mmd-os-v1 .mmd-launcher__grid strong{color:#e8c782;font-size:16px}
#mmd-os-v1 .mmd-launcher__grid span{margin-top:7px;color:#c1b8aa;font-size:13px;line-height:1.6}
#mmd-os-v1 .mmd-launcher [hidden]{display:none!important}
#mmd-os-v1 .mmd-launcher a:hover{background:#211a10}
#mmd-os-v1 .mmd-launcher :focus-visible{outline:2px solid #f4d99c;outline-offset:4px}
#mmd-os-v1 .mmd-launcher__references{margin-top:18px;border-top:1px solid #403426;padding-top:10px}
#mmd-os-v1 .mmd-launcher summary{min-height:44px;padding:12px 0;cursor:pointer;font-size:14px}
#mmd-os-v1 .mmd-launcher__references a{display:block;min-height:44px;padding:12px 0;color:#e8c782;font-size:14px;overflow-wrap:anywhere}
@media(max-width:900px){#mmd-os-v1 .mmd-launcher__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){#mmd-os-v1 .mmd-launcher{padding:16px}#mmd-os-v1 .mmd-launcher__grid{grid-template-columns:1fr}}
</style>`;

export const ADMIN_WORKSPACE_SCRIPT = `<script data-mmd-admin-launcher-script>(function(){'use strict';var root=document.querySelector('[data-mmd-admin-launcher]');if(!root)return;var input=root.querySelector('input'),cards=Array.from(root.querySelectorAll('[data-admin-module]')),count=root.querySelector('[data-module-count]'),empty=root.querySelector('[data-module-empty]');var matches=${matchesAdminModule.toString()};function filter(){var visible=0;cards.forEach(function(card){card.hidden=!matches(card.querySelector('strong').textContent,card.querySelector('span').textContent,card.dataset.moduleKeywords,input.value);if(!card.hidden)visible++});count.textContent=visible+' เครื่องมือ';empty.hidden=visible!==0}input.addEventListener('input',filter);input.addEventListener('search',filter);filter()})();</script>`;
