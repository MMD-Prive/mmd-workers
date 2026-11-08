// Owner control page shell for Telegram rooms (#2141). Static HTML; data comes from the owner-only JSON endpoint.
// Layout: a tree (room > group > person) built from <details>, desktop-first. On phones every room is collapsed so the
// whole overview fits one screen; on desktop rooms that need attention open by default.
// Phase: read-only. HYPE action buttons are shown disabled until the action endpoints ship behind their own flag.
export function renderControlPage(base = "/internal/admin/premium-group-cleanup") {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Telegram Rooms</title>
<style>
:root{--bg:#f7f5f2;--card:#fff;--ink:#1a1a1f;--mute:#6b6b73;--line:#e3dfd8;--red:#8a1f2d;--ok:#1f6b45;--warn:#9a5b00;--chip:#f1eee9}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--card:#1c1c20;--ink:#f1efe9;--mute:#9a9aa3;--line:#2c2c32;--red:#e07a86;--ok:#6fcf9a;--warn:#e6b35a;--chip:#26262b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Noto Sans Thai",sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
h1{font-size:20px;margin:6px 0 2px}p.sub{color:var(--mute);margin:0 0 10px;font-size:13px}
.banner{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:10px;padding:8px 12px;margin:8px 0 12px;font-size:13px}
.join-title{font-size:17px;margin:22px 0 6px}.join-card{display:block;padding:11px 14px}.join-card .ref{display:block}.join-card .why{display:block}.join-matches{margin:6px 0 0;padding-left:18px;color:var(--mute);font-size:13px}.join-muted{padding:14px;font-size:13px;color:var(--mute)}
.tree{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
details{border-top:1px solid var(--line)}details:first-child{border-top:0}
summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:48px}
summary::-webkit-details-marker{display:none}summary::before{content:"▸";color:var(--mute);font-size:12px;width:12px;transition:transform .12s}
details[open]>summary::before{transform:rotate(90deg)}
.name{font-weight:600;font-size:15px}.chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.chip{background:var(--chip);border-radius:999px;padding:1px 9px;font-size:12px;color:var(--mute);white-space:nowrap}
.chip.ok{color:var(--ok)}.chip.bad{color:var(--red)}.chip.warn{color:var(--warn)}.chip.zero{opacity:.55}
.sub2{margin-left:18px;border-left:1px solid var(--line)}.sub2 summary{padding:8px 12px;min-height:40px;font-size:14px}
.people{margin:0 0 6px 18px;border-left:1px solid var(--line)}
.person{display:grid;grid-template-columns:150px 1fr 150px auto;gap:10px;align-items:center;padding:8px 12px;border-top:1px dashed var(--line);font-size:14px}
.person:first-child{border-top:0}.ref{font-weight:600}.why{color:var(--mute);font-size:13px}.when{color:var(--mute);font-size:13px}
button{font:inherit;font-size:13px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--mute);padding:5px 10px;margin-left:6px}
button[disabled]{opacity:.55;cursor:not-allowed}.note{color:var(--mute);font-size:12px;padding:6px 14px 10px}.empty{color:var(--mute);font-size:13px;padding:8px 14px}
@media (max-width:700px){main{padding:12px}.chips{margin-left:22px;width:100%}.sub2,.people{margin-left:10px}
.person{grid-template-columns:1fr auto;gap:2px 8px}.person .why,.person .when{grid-column:1/-1}.person .acts{grid-column:1/-1;margin-top:4px}button{margin:0 6px 0 0}}
</style></head><body><main>
<header><div><h1>Telegram Rooms</h1><p class="sub">สถานะห้อง Telegram และคนที่ควรเข้า/ออก (อ่านอย่างเดียว)</p></div></header>
<div class="banner" id="banner">กำลังโหลด…</div>
<div class="tree" id="tree"></div>
<h2 class="join-title">Standard · คำขอเข้ากลุ่มที่ยังรอตรวจ</h2>
<p class="sub">ข้อเสนอจับคู่จากข้อมูล LINE OA เป็นเพียงเบาะแส ไม่ใช่การยืนยันตัวตน</p>
<div class="tree" id="standard-join-queue"><p class="join-muted">กำลังตรวจคิว…</p></div>
<p class="note" id="foot"></p>
</main>
<script>
const BASE=${JSON.stringify(base)};
const GROUPS=[["remove_candidate","ควรเอาออก","bad"],["review_required","รอเปอร์ตัดสิน","warn"],["grace_promo","ช่วงผ่อนผันโปร","warn"]];
const REASON={expired_not_renewed:"หมดอายุ ไม่ได้ต่อ",guest_pass_ended:"Guest Pass ครบ 7 วัน",tier_below_room:"ระดับต่ำกว่าห้องนี้",vip_class_expired_owner_decides:"VIP/Black Card/SVIP หมดอายุ เปอร์ตัดสินรายคน",owner_grant_or_override:"เปอร์ให้สิทธิ์เอง",membership_blocked:"สมาชิกถูกระงับ",payment_pending_review:"รอตรวจการชำระเงิน",expired_in_promo_grace:"หมดอายุ อยู่ในช่วงผ่อนผันโปร",not_a_member:"ไม่พบสิทธิ์สมาชิก"};
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const chip=(cls,n,l)=>el("span","chip "+cls+(n?"":" zero"),l+" "+n);
const wide=window.matchMedia&&window.matchMedia("(min-width:900px)").matches;
fetch(BASE+"/rooms",{credentials:"same-origin",headers:{accept:"application/json"}}).then(r=>r.json()).then(d=>{
  if(!d.ok){document.getElementById("banner").textContent="โหลดไม่สำเร็จ: "+(d.error||"error");return}
  document.getElementById("banner").textContent=(d.dry_run?"โหมดทดสอบ (dry-run) · ":"")+"ยังไม่ส่งข้อความหรือเอาใครออก"+(d.promo_grace_until?" · ผ่อนผัน Premium ถึง "+d.promo_grace_until.slice(0,10):"");
  const tree=document.getElementById("tree");
  for(const r of d.rooms){
    const mine=d.items.filter(i=>i.room===r.room);const n=s=>mine.filter(i=>i.state===s).length;
    const room=el("details");const sum=el("summary");sum.append(el("span","name",r.label));
    const chips=el("span","chips");
    if(r.policy){chips.append(chip("ok",r.policy.ok,"มีสิทธิ์"),chip("bad",n("remove_candidate"),"ควรเอาออก"),chip("warn",n("review_required"),"รอตัดสิน"),chip("warn",n("grace_promo"),"ผ่อนผัน"))}
    else chips.append(el("span","chip","ดูอย่างเดียว"));
    sum.append(chips);room.append(sum);
    if(!r.policy)room.append(el("p","empty","ช่องสาธารณะ ไม่มีปุ่มเอาออก"));
    else{
      for(const [state,label,cls] of GROUPS){const rows=mine.filter(i=>i.state===state);if(!rows.length)continue;
        const g=el("details","sub2");const gs=el("summary");gs.append(el("span","name",label),el("span","chip "+cls,String(rows.length)));g.append(gs);
        const list=el("div","people");
        for(const i of rows){const p=el("div","person");p.append(el("span","ref","…"+i.member_ref.slice(-4)),el("span","why",REASON[i.reason]||i.reason),el("span","when",i.expired_at?"หมด "+i.expired_at+(i.days_since_expiry!=null?" ("+i.days_since_expiry+" วัน)":""):""));
          const a=el("span","acts");const x=el("button","","เอาออก (HYPE)");x.disabled=true;const k=el("button","","คงไว้");k.disabled=true;a.append(x,k);p.append(a);list.append(p)}
        g.append(list);if(wide&&state!=="grace_promo")g.open=true;room.append(g)}
      if(!mine.length)room.append(el("p","empty","ไม่มีคนที่ยืนยันว่าอยู่ในห้องและไม่ตรงกติกา"));
      room.append(el("p","note","ตรวจในห้องนี้ไม่ได้เพราะยังผูก Telegram ไม่ได้: "+r.unlinked_non_entitled+" คน"));
    }
    if(wide&&(n("remove_candidate")||n("review_required")))room.open=true;
    tree.append(room)}
  document.getElementById("foot").textContent="ปุ่มสั่ง HYPE จะเปิดใช้ในขั้นถัดไป หลังเปอร์อนุมัติ"+((d.lookups_truncated||d.items_truncated)?" · รายการยังไม่ครบ (ตัดตามขีดจำกัดต่อครั้ง)":"")
}).catch(()=>{document.getElementById("banner").textContent="โหลดไม่สำเร็จ"});

fetch(BASE+"/join-requests",{credentials:"same-origin",headers:{accept:"application/json"}}).then(r=>r.json()).then(d=>{
  const panel=document.getElementById("standard-join-queue");
  panel.replaceChildren();
  if(!d.ok){panel.append(el("p","join-muted","ยังอ่านคิว Standard ไม่ได้ (ตรวจการตั้งค่า Airtable/สิทธิ์ Owner)"));return}
  if(!d.items.length){panel.append(el("p","join-muted","ยังไม่มีคำขอ Standard ที่ระบบบันทึกไว้ ไม่ได้หมายความว่ากลุ่มไม่มีสมาชิก"));return}
  panel.append(el("p","note","พบ "+d.count+" คำขอ · ระบบไม่อนุมัติ ไม่ส่งข้อความ และไม่เอาใครออก"));
  for(const item of d.items){
    const card=el("div","join-card");const who=el("span","ref",(item.telegram_display_name||"ไม่ระบุชื่อ")+" · "+(item.telegram_username?"@"+item.telegram_username:"ไม่มี username"));
    card.append(who,el("span","why","Telegram ID "+item.telegram_user_id_masked+" · "+(item.requested_at||"ไม่พบวันที่คำขอ")+" · "+item.review_status));
    const hypeText={
      canonical_verified:"HYPE · พบตัวตน Telegram ที่ยืนยันใน MY MMD",
      needs_telegram_link:"HYPE · ยังไม่ได้เชื่อม Telegram กับบัญชีลูกค้า",
      review_required:"HYPE · ข้อมูลสมาชิกยังไม่ครบ ต้องตรวจเพิ่ม",
      blocked_review:"HYPE · พบสถานะระงับสิทธิ์ ต้องให้เปอร์ตรวจ",
      authority_unavailable:"HYPE · ระบบตรวจสิทธิ์ไม่พร้อม",
      not_checked:"HYPE · ยังไม่ได้ตรวจ",
    };
    const h=hypeText[item.hype_check_state]||hypeText.not_checked;
    card.append(el("span","why",h+(item.hype_membership_level?" · "+item.hype_membership_level:"")+(item.hype_membership_lifecycle?" · "+item.hype_membership_lifecycle:"")));
    card.append(el("span","why","ผล HYPE เป็นหลักฐานประกอบ ไม่ใช่สิทธิ์อนุมัติเข้ากลุ่ม หรือยืนยันว่าอยู่ห้อง Standard แล้ว"));
    const matches=el("ul","join-matches");
    if(!item.possible_matches.length){matches.append(el("li","","ยังจับคู่กับ LINE OA ไม่ได้ ต้องให้เปอร์ตรวจเอง"))}
    else{for(const c of item.possible_matches){
      const confidence=c.evidence==="numeric_id_exact"?"ID ตรงกัน":c.evidence==="username_exact"?"username ตรงกัน":"ชื่อคล้ายกันเท่านั้น";
      matches.append(el("li","",c.customer_ref+(c.nickname?" · "+c.nickname:"")+" — "+confidence+(c.possible_duplicate?" · ชื่อซ้ำ/เสี่ยงซ้ำ":"")));
    }}
    card.append(matches,el("p","note","รอเปอร์ยืนยันผ่านหลักฐานเพิ่มเติมเท่านั้น · ไม่มีปุ่มอนุมัติอัตโนมัติ"));panel.append(card)
  }
  if(d.rows_truncated||d.source_truncated)panel.append(el("p","note","ผลบางส่วนถูกจำกัดจำนวน ต้องตรวจข้อมูลทั้งหมดก่อนตัดสิน"));
}).catch(()=>{const panel=document.getElementById("standard-join-queue");panel.replaceChildren(el("p","join-muted","ไม่สามารถอ่านคิว Standard ได้"));});
</script></body></html>`;
}
