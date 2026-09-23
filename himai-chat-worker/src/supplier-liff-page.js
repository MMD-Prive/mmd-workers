const DEFAULT_SUPPLIER_LIFF_ID = "2011701290-xBE3CirT";
const SUPPLIER_SNAPSHOT_PATH = "/shop/api/supplier/liff-portal";
const SUPPLIER_BIND_PATH = "/shop/api/supplier/liff-bind";

export function renderSupplierLiffPage(env = {}) {
  const liffId = cleanInline(env.HIMAI_SUPPLIER_LIFF_ID || DEFAULT_SUPPLIER_LIFF_ID);
  const html = HTML
    .replaceAll("__LIFF_ID__", liffId)
    .replaceAll("__SNAPSHOT_PATH__", SUPPLIER_SNAPSHOT_PATH)
    .replaceAll("__BIND_PATH__", SUPPLIER_BIND_PATH);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": [
        "default-src 'none'",
        "script-src 'unsafe-inline' https://static.line-scdn.net",
        "style-src 'unsafe-inline'",
        "connect-src 'self' https://api.line.me https://liff.line.me https://access.line.me",
        "frame-src https://access.line.me https://liff.line.me",
        "img-src 'self' data: https:",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

function cleanInline(value) {
  return String(value || "")
    .replace(/[<>"'\u0000-\u001F\u007F]/g, "")
    .slice(0, 200);
}

const HTML = String.raw`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f7f2e8">
<meta name="color-scheme" content="light">
<title>Himai Supplier</title>
<style>
:root{
  --bg:#f7f2e8;--surface:#fffdf8;--surface2:#f0e9dc;--ink:#2d261f;--muted:#74695f;
  --line:#ded4c4;--line2:#c9bca9;--espresso:#493a30;--taupe:#9d8d7d;--ok:#55755f;
  --low:#8d6b3e;--out:#6f6258;--shadow:0 14px 34px rgba(58,46,37,.08);--r:18px
}
*{box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;min-height:100vh;background:
  radial-gradient(circle at 100% -10%,rgba(157,141,125,.16),transparent 34%),
  linear-gradient(180deg,#fbf8f1 0%,var(--bg) 42%,#f4eee4 100%);
  color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Noto Sans Thai","IBM Plex Sans Thai",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;overflow-x:hidden
}
button{font:inherit}
button:focus-visible,summary:focus-visible{outline:3px solid rgba(73,58,48,.2);outline-offset:3px}
.shell{width:min(520px,100%);margin:0 auto;padding:0 16px 38px}
.top{position:sticky;top:0;z-index:20;margin:0 -16px;padding:max(12px,env(safe-area-inset-top)) 16px 11px;
  border-bottom:1px solid rgba(222,212,196,.76);background:rgba(247,242,232,.9);backdrop-filter:blur(16px)}
.toprow{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{min-width:0}.wordmark{font:700 15px/1.1 Georgia,"Times New Roman",serif;letter-spacing:.12em;text-transform:uppercase}
.brand small{display:block;margin-top:4px;color:var(--muted);font-size:11px;letter-spacing:.08em}
.state{flex:0 0 auto;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,253,248,.72);color:var(--muted);font-size:12px}
.hero{padding:24px 0 15px}
.kicker{margin:0 0 6px;color:var(--taupe);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.hero h1{margin:0;font:500 clamp(31px,9vw,43px)/1.08 Georgia,"Times New Roman",serif;letter-spacing:-.035em}
.hero p{margin:10px 0 0;color:var(--muted);font-size:14px}
.stack{display:grid;gap:14px}
.card{border:1px solid var(--line);border-radius:var(--r);background:rgba(255,253,248,.9);box-shadow:var(--shadow)}
.statecard{padding:22px}
.statecard h2{margin:0;font-size:22px;letter-spacing:-.02em}
.statecard p{margin:8px 0 0;color:var(--muted);font-size:14px}
.pulse{display:grid;gap:9px;margin-top:18px}.pulse i{display:block;height:11px;border-radius:999px;background:linear-gradient(90deg,#eee6d9,#f9f5ed,#eee6d9);background-size:220% 100%;animation:shimmer 1.5s linear infinite}.pulse i:nth-child(1){width:76%}.pulse i:nth-child(2){width:54%}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.metric{min-height:104px;padding:14px}
.label{color:var(--muted);font-size:12px}
.value{display:block;margin-top:5px;font:600 28px/1.15 Georgia,"Times New Roman",serif;font-variant-numeric:tabular-nums}
.section{display:grid;gap:9px}.sectionhead{display:flex;align-items:end;justify-content:space-between;gap:12px}
.sectionhead h2{margin:0;font-size:16px}.sectionhead small{color:var(--muted);font-size:11px}
.list{display:grid;gap:9px}
.product{padding:15px}.prodtop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.product h3{margin:0;font-size:16px}.sub{margin-top:3px;color:var(--muted);font-size:12px}
.tag{flex:0 0 auto;padding:6px 9px;border-radius:999px;background:var(--surface2);font-size:11px}
.tag.ok{color:var(--ok)}.tag.low{color:var(--low)}.tag.out{color:var(--out)}
.prodnums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px;padding:10px;border-radius:14px;background:#f5efe5}
.prodnums span{display:block;color:var(--muted);font-size:10px}.prodnums b{display:block;margin-top:2px;font-size:16px;font-variant-numeric:tabular-nums}
.order{padding:14px}.orderrow{display:flex;justify-content:space-between;gap:12px}.order b{font-size:14px}.right{text-align:right}.amount{font-weight:700;font-variant-numeric:tabular-nums}
.reserve{padding:13px 14px;background:#efe8dc;color:var(--muted);font-size:13px;box-shadow:none}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.action{min-height:46px;border:1px solid var(--line);border-radius:14px;background:#f0e9de;color:#887b70}.action:disabled{opacity:1}
.soon{margin-top:6px;color:var(--muted);font-size:11px}
details{overflow:hidden}summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;font-weight:600}summary::-webkit-details-marker{display:none}
summary:after{content:"+";color:var(--muted);font-size:20px;font-weight:400}details[open] summary:after{content:"−"}
.audit{border-top:1px solid var(--line);padding:4px 15px 14px}.audititem{padding:10px 0;border-bottom:1px solid rgba(222,212,196,.65)}.audititem:last-child{border-bottom:0}.audititem b{display:block;font-size:13px}.audititem small{display:block;margin-top:3px;color:var(--muted);font-size:11px}
.empty{padding:17px;color:var(--muted);font-size:13px;text-align:center}
.hidden{display:none!important}
.fadein{animation:enter .34s cubic-bezier(.2,.8,.2,1) both}
.footer{padding:22px 0 0;text-align:center;color:#998b7d;font-size:10px;letter-spacing:.12em;text-transform:uppercase}
@keyframes shimmer{to{background-position:-220% 0}}
@keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.fadein,.pulse i{animation:none!important}}
@media(min-width:700px){.shell{padding-left:20px;padding-right:20px}.top{margin-left:-20px;margin-right:-20px;padding-left:20px;padding-right:20px}}
</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <div class="toprow">
      <div class="brand"><div class="wordmark">Himai Shop</div><small>Supplier workspace</small></div>
      <div id="state" class="state">กำลังเชื่อม</div>
    </div>
  </header>

  <main>
    <section class="hero">
      <p class="kicker">Private supplier access</p>
      <h1 id="hello">ข้อมูลสินค้าของคุณ</h1>
      <p id="updated">เชื่อมกับสต๊อกจริงของ Himai Shop ผ่าน LINE</p>
    </section>

    <section id="loading" class="card statecard">
      <h2>กำลังตรวจสิทธิ์ผ่าน LINE</h2>
      <p>ระบบจะเปิดเฉพาะสินค้า สต๊อก และออเดอร์ที่ผูกกับบัญชีของคุณเท่านั้น</p>
      <div class="pulse" aria-hidden="true"><i></i><i></i></div>
    </section>

    <section id="denied" class="card statecard hidden">
      <h2>ยังเข้าใช้งานไม่ได้</h2>
      <p id="denied-copy">หน้านี้เปิดให้เฉพาะ Supplier ที่ผูก LINE ไว้กับ Himai Shop แล้ว</p>
    </section>

    <div id="app" class="stack hidden">
      <section class="metrics" aria-label="สรุปภาพรวม">
        <article class="card metric"><span class="label">พร้อมขาย</span><strong id="m-available" class="value">—</strong></article>
        <article class="card metric"><span class="label">กำลังจอง</span><strong id="m-reserved" class="value">—</strong></article>
        <article class="card metric"><span class="label">ขายแล้ว</span><strong id="m-sold" class="value">—</strong></article>
        <article class="card metric"><span class="label">ยอดค้างจ่าย</span><strong id="m-payout" class="value">—</strong></article>
      </section>

      <section class="section">
        <div class="sectionhead"><h2>สินค้าของคุณ</h2><small id="product-count">—</small></div>
        <div id="products" class="list"></div>
      </section>

      <section class="section">
        <div class="sectionhead"><h2>ออเดอร์ล่าสุด</h2><small id="order-count">—</small></div>
        <div id="orders" class="list"></div>
      </section>

      <section aria-label="การแจ้งเตือน">
        <div class="actions">
          <button class="action" type="button" disabled>แจ้งเติมสินค้า</button>
          <button class="action" type="button" disabled>ส่งของแล้ว</button>
        </div>
        <div class="soon">กำลังเปิดใช้งานใน LIFF รอบถัดไป</div>
      </section>

      <div id="reservation" class="card reserve">ระบบกันสินค้าให้ลูกค้า 45 นาที</div>

      <details class="card">
        <summary>ประวัติการเปลี่ยนแปลง</summary>
        <div id="audit" class="audit"></div>
      </details>
    </div>
  </main>
  <div class="footer">Himai Shop · Supplier</div>
</div>

<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script>
(function(){
  "use strict";
  var LIFF_ID="__LIFF_ID__";
  var API="__SNAPSHOT_PATH__";
  var BIND_API="__BIND_PATH__";
  var $=function(id){return document.getElementById(id)};
  var state=$("state"),loading=$("loading"),denied=$("denied"),app=$("app");

  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0}
  function count(v){return num(v).toLocaleString("th-TH",{maximumFractionDigits:0})}
  function money(v){return "฿"+num(v).toLocaleString("th-TH",{maximumFractionDigits:0})}
  function dt(v){if(!v)return "—";var d=new Date(v);if(Number.isNaN(d.getTime()))return esc(v);return d.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})}
  function setState(text){state.textContent=text}
  function showDenied(message){
    loading.classList.add("hidden");app.classList.add("hidden");denied.classList.remove("hidden");denied.classList.add("fadein");
    if(message)$("denied-copy").textContent=message;setState("จำกัดสิทธิ์")
  }
  function signal(p){
    var s=String(p.refill_signal||"").toLowerCase();
    if(s==="refill_now"||num(p.available)<=0)return {c:"out",t:"หมดแล้ว"};
    if(s==="check_next_refill"||p.low_stock)return {c:"low",t:"ใกล้หมด"};
    return {c:"ok",t:"สต๊อกเพียงพอ"}
  }
  function renderProducts(data){
    var rows=Array.isArray(data.products)?data.products:[];
    $("product-count").textContent=count(rows.length)+" รายการ";
    $("products").innerHTML=rows.length?rows.map(function(p){
      var sig=signal(p);
      return "<article class='card product'><div class='prodtop'><div><h3>"+esc(p.product_name||"สินค้า")+"</h3><div class='sub'>"+esc(p.sku||"")+(p.selling_price_thb?" · "+money(p.selling_price_thb):"")+"</div></div><span class='tag "+sig.c+"'>"+sig.t+"</span></div><div class='prodnums'><div><span>พร้อมขาย</span><b>"+count(p.available)+"</b></div><div><span>กำลังจอง</span><b>"+count(p.reserved_total)+"</b></div><div><span>ขายแล้ว</span><b>"+count(p.sold_total)+"</b></div></div></article>"
    }).join(""):"<div class='card empty'>ยังไม่มีสินค้าในความดูแลของคุณ</div>";
  }
  function renderOrders(data){
    var rows=Array.isArray(data.orders)?data.orders:[];
    $("order-count").textContent=count(rows.length)+" รายการ";
    $("orders").innerHTML=rows.length?rows.slice(0,12).map(function(o){
      return "<article class='card order'><div class='orderrow'><div><b>"+esc(o.order_id||"Order")+"</b><div class='sub'>"+esc(o.order_date||"—")+" · "+esc(o.order_status||"—")+" · "+esc(o.payment_status||"—")+"</div></div><div class='right'><div class='amount'>"+money(o.line_total_thb)+"</div><div class='sub'>"+count(o.quantity)+" ชิ้น</div></div></div></article>"
    }).join(""):"<div class='card empty'>ยังไม่มีออเดอร์ที่เกี่ยวข้อง</div>";
  }
  function renderAudit(data){
    var entries=[];
    (Array.isArray(data.products)?data.products:[]).forEach(function(p){
      (Array.isArray(p.movements)?p.movements:[]).forEach(function(m){
        entries.push({at:m.movement_date,label:(p.product_name||"สินค้า")+" · "+(m.movement_type||"movement"),detail:count(Math.abs(num(m.quantity)))+" ชิ้น"})
      })
    });
    var finance=data.finance||{};
    (Array.isArray(finance.payouts)?finance.payouts:[]).forEach(function(x){entries.push({at:x.payout_date,label:"บันทึกยอดจ่าย",detail:money(x.amount_thb)+" · "+(x.status||"—")})});
    entries.sort(function(a,b){return String(b.at||"").localeCompare(String(a.at||""))});
    $("audit").innerHTML=entries.length?entries.slice(0,20).map(function(e){return "<div class='audititem'><b>"+esc(e.label)+"</b><small>"+dt(e.at)+(e.detail?" · "+esc(e.detail):"")+"</small></div>"}).join(""):"<div class='empty'>ยังไม่มีรายการบันทึก</div>";
  }
  function render(data){
    var s=data.summary||{},supplier=data.supplier||data.distributor||{},ttl=data.reservation_policy&&data.reservation_policy.ttl_minutes||45;
    $("hello").textContent=supplier.name?"สวัสดี "+supplier.name:"ข้อมูลสินค้าของคุณ";
    $("updated").textContent="ข้อมูลล่าสุด "+dt(data.updated_at);
    $("m-available").textContent=count(s.stock_units);
    $("m-reserved").textContent=count(s.reserved_units);
    $("m-sold").textContent=count(s.sold_units);
    $("m-payout").textContent=money(s.open_balance_thb);
    $("reservation").textContent="ระบบกันสินค้าให้ลูกค้า "+count(ttl)+" นาที";
    renderProducts(data);renderOrders(data);renderAudit(data);
    loading.classList.add("hidden");denied.classList.add("hidden");app.classList.remove("hidden");app.classList.add("fadein");setState("ใช้งานอยู่")
  }
  async function boot(){
    try{
      if(!window.liff||!LIFF_ID)throw new Error("liff_not_ready");
      await window.liff.init({liffId:LIFF_ID});
      if(!window.liff.isLoggedIn()){
        window.liff.login({redirectUri:location.href});
        return;
      }
      var token=window.liff.getAccessToken();
      if(!token)throw new Error("line_access_token_required");
      var invite=new URLSearchParams(location.search).get("invite")||"";
      if(invite){
        setState("กำลังยืนยัน");
        var bind=await fetch(BIND_API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({access_token:token,invite_token:invite})});
        var bindData=await bind.json().catch(function(){return {}});
        if(!bind.ok||bindData.ok!==true){
          if(bind.status===409){showDenied("บัญชี Supplier นี้ผูกกับ LINE อื่นอยู่แล้ว");return}
          if(bind.status===403){showDenied("ลิงก์เชิญนี้หมดอายุหรือถูกใช้ไปแล้ว");return}
          throw new Error(bindData.error||"supplier_bind_failed");
        }
        try{
          var clean=new URL(location.href);
          clean.searchParams.delete("invite");
          history.replaceState(null,"",clean.pathname+clean.search+clean.hash);
        }catch(_){}
      }
      setState("กำลังโหลด");
      var r=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({access_token:token})});
      var data=await r.json().catch(function(){return {}});
      if(r.status===401){showDenied("เซสชัน LINE หมดอายุ กรุณาปิดหน้านี้แล้วเปิดจาก LINE อีกครั้ง");return}
      if(r.status===403){showDenied("บัญชี LINE นี้ยังไม่ได้ผูกกับ Supplier ที่เปิดใช้งาน");return}
      if(!r.ok||data.ok!==true)throw new Error(data.error||"supplier_snapshot_unavailable");
      render(data);
    }catch(error){
      console.error("Himai Supplier LIFF:",error);
      showDenied("ระบบกำลังเชื่อมข้อมูล Supplier กรุณาลองเปิดจาก LINE อีกครั้ง")
    }
  }
  boot();
})();
</script>
</body>
</html>`;
