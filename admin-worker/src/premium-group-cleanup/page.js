// Owner control page shell for Telegram rooms (#2141). Static HTML; data comes from the owner-only JSON endpoint.
// Phase: read-only. HYPE action buttons are shown disabled until the action endpoints ship behind their own flag.
export function renderControlPage(base = "/internal/admin/premium-group-cleanup") {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Telegram Rooms</title>
<style>
:root{--bg:#f7f5f2;--card:#fff;--ink:#1a1a1f;--mute:#6b6b73;--line:#e3dfd8;--red:#8a1f2d;--ok:#1f6b45;--warn:#9a5b00}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--card:#1c1c20;--ink:#f1efe9;--mute:#9a9aa3;--line:#2c2c32;--red:#e07a86;--ok:#6fcf9a;--warn:#e6b35a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Noto Sans Thai",sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}h1{font-size:20px;margin:8px 0 4px}p.sub{color:var(--mute);margin:0 0 16px;font-size:13px}
.banner{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
.card h2{font-size:16px;margin:0 0 8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.pill{font-size:11px;border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--mute);white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.cell{border:1px solid var(--line);border-radius:8px;padding:8px}.cell b{display:block;font-size:20px}.cell span{font-size:12px;color:var(--mute)}
.ok b{color:var(--ok)}.warn b{color:var(--warn)}.bad b{color:var(--red)}
.item{border-top:1px solid var(--line);padding:10px 0}.item:first-child{border-top:0}.row{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.reason{font-size:12px;color:var(--mute)}button{font:inherit;font-size:13px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--mute);padding:6px 10px;margin:6px 6px 0 0}
button[disabled]{opacity:.55;cursor:not-allowed}.empty{color:var(--mute);font-size:13px}
</style></head><body><main>
<h1>Telegram Rooms</h1><p class="sub">ดูสถานะห้อง Telegram และคนที่ควรเข้า/ออก (อ่านอย่างเดียว)</p>
<div class="banner" id="banner">กำลังโหลด…</div>
<div id="rooms"></div><div id="items"></div>
</main>
<script>
const BASE=${JSON.stringify(base)};
const STATE={ok:"ถูกต้อง",grace_promo:"ช่วงผ่อนผันโปร",remove_candidate:"ควรเอาออก",review_required:"รอเปอร์ตัดสิน",view_only:"ดูอย่างเดียว"};
const REASON={expired_not_renewed:"หมดอายุ ไม่ได้ต่อ",guest_pass_ended:"Guest Pass ครบ 7 วัน",tier_below_room:"ระดับต่ำกว่าห้องนี้",vip_class_expired_owner_decides:"VIP/Black Card/SVIP หมดอายุ เปอร์ตัดสินรายคน",owner_grant_or_override:"เปอร์ให้สิทธิ์เอง",membership_blocked:"สมาชิกถูกระงับ",payment_pending_review:"รอตรวจการชำระเงิน",expired_in_promo_grace:"หมดอายุ อยู่ในช่วงผ่อนผันโปร",not_a_member:"ไม่พบสิทธิ์สมาชิก"};
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const cell=(cls,n,l)=>{const c=el("div","cell "+cls);c.append(el("b","",String(n)),el("span","",l));return c};
fetch(BASE+"/rooms",{credentials:"same-origin",headers:{accept:"application/json"}}).then(r=>r.json()).then(d=>{
  if(!d.ok){document.getElementById("banner").textContent="โหลดไม่สำเร็จ: "+(d.error||"error");return}
  document.getElementById("banner").textContent=(d.dry_run?"โหมดทดสอบ (dry-run) ":"")+"ยังไม่ส่งข้อความหรือเอาใครออก"+(d.promo_grace_until?" · ผ่อนผัน Premium หมดอายุถึง "+d.promo_grace_until.slice(0,10):"");
  const rooms=document.getElementById("rooms");
  for(const r of d.rooms){const card=el("section","card");const h=el("h2","",r.label);h.append(el("span","pill",r.view_only?"ดูอย่างเดียว":"จัดการได้"));card.append(h);
    if(r.policy){const n=s=>d.items.filter(i=>i.room===r.room&&i.state===s).length;const g=el("div","grid");g.append(cell("ok",r.policy.ok,"มีสิทธิ์เข้าห้องนี้"),cell("bad",n("remove_candidate"),"อยู่ในห้อง แต่ควรเอาออก"),cell("warn",n("review_required"),"อยู่ในห้อง รอเปอร์ตัดสิน"),cell("warn",n("grace_promo"),"อยู่ในห้อง ช่วงผ่อนผันโปร"));card.append(g);card.append(el("p","reason","ตรวจในห้องนี้ไม่ได้เพราะยังผูก Telegram ไม่ได้: "+r.unlinked_non_entitled+" คน"))}
    else card.append(el("p","empty","ดูสถานะช่อง (ไม่มีปุ่มเอาออก)"));
    rooms.append(card)}
  const box=document.getElementById("items");const card=el("section","card");card.append(el("h2","","คนที่ต้องจัดการ ("+d.items.length+")"));
  if(!d.items.length)card.append(el("p","empty","ไม่มีคนที่ยืนยันว่าอยู่ในห้องและไม่ตรงกติกา"));
  for(const i of d.items){const row=el("div","item");const top=el("div","row");top.append(el("b","",i.room_label+" · …"+i.member_ref.slice(-4)),el("span","pill",STATE[i.state]||i.state));row.append(top,el("div","reason",(REASON[i.reason]||i.reason)+(i.expired_at?" · หมด "+i.expired_at:"")+(i.days_since_expiry!=null?" ("+i.days_since_expiry+" วัน)":"")));
    const a=el("button","","เอาออก (HYPE)");a.disabled=true;const b=el("button","","คงไว้");b.disabled=true;row.append(a,b);card.append(row)}
  if(d.lookups_truncated||d.items_truncated)card.append(el("p","reason","รายการยังไม่ครบ (ตัดตามขีดจำกัดต่อครั้ง)"));
  card.append(el("p","reason","ปุ่มสั่ง HYPE จะเปิดใช้ในขั้นถัดไป หลังเปอร์อนุมัติ"));box.append(card)
}).catch(()=>{document.getElementById("banner").textContent="โหลดไม่สำเร็จ"});
</script></body></html>`;
}
