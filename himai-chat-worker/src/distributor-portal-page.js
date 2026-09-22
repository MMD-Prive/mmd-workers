export function renderDistributorPortalPage() {
  return new Response(HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    }
  });
}

const HTML = String.raw\`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#160609">
<title>Himai Shop · Supplier Dashboard</title>
<style>
:root{
  color-scheme:dark;
  --bg:#120507;--bg2:#1c080d;--panel:rgba(45,13,20,.82);--panel2:#210a10;
  --paper:#fff4ea;--muted:#ceb7b0;--line:rgba(232,202,154,.17);--line2:rgba(232,202,154,.34);
  --gold:#e6ca8c;--ember:#ff593d;--red:#b71931;--wine:#681027;--ok:#b8d7b2;--warn:#ffc49e;
  --shadow:0 24px 70px rgba(0,0,0,.28);
}
*{box-sizing:border-box}
html{background:var(--bg);scroll-behavior:smooth}
body{margin:0;min-height:100vh;color:var(--paper);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Thai","Noto Sans",sans-serif;background:
radial-gradient(900px 540px at 7% -5%,rgba(167,24,57,.34),transparent 68%),
radial-gradient(780px 500px at 105% 15%,rgba(255,89,61,.12),transparent 70%),
linear-gradient(150deg,#2c0912 0%,#120507 48%,#080304 100%);letter-spacing:.004em}
body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.22;background-image:
radial-gradient(circle at 1px 1px,rgba(255,255,255,.10) 1px,transparent 1.2px);background-size:5px 5px;mask-image:linear-gradient(#000,transparent 88%)}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
a{color:inherit}
.shell{width:min(1240px,100%);margin:auto;padding:20px 28px 54px;position:relative}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 0 20px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20;background:linear-gradient(180deg,rgba(18,5,7,.98),rgba(18,5,7,.84),transparent);backdrop-filter:blur(12px)}
.brand{display:flex;align-items:center;gap:12px}.mark{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--line2);border-radius:50%;font-family:Georgia,serif;color:var(--ember);font-size:21px;box-shadow:inset 0 0 22px rgba(183,25,49,.2)}
.brand b{display:block;font-size:12px;letter-spacing:.16em}.brand small{display:block;margin-top:3px;color:var(--muted);font-size:9px;letter-spacing:.16em;text-transform:uppercase}
.live{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase}.dot{width:7px;height:7px;border-radius:50%;background:var(--ember);box-shadow:0 0 0 5px rgba(255,89,61,.1),0 0 18px rgba(255,89,61,.55)}
.hidden{display:none!important}
.entrance{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(340px,.78fr);gap:clamp(34px,8vw,112px);align-items:center;min-height:calc(100vh - 100px);padding:56px 0 70px}
.kicker{color:var(--ember);font-size:10px;letter-spacing:.2em;text-transform:uppercase}
.hero h1{margin:15px 0 20px;max-width:700px;font:400 clamp(52px,7.3vw,96px)/.92 Georgia,"Times New Roman",serif;letter-spacing:-.06em}.hero h1 em{font-style:italic;color:#ffe8dc}
.hero p{max-width:600px;margin:0;color:#d2bbb5;font-size:16px;line-height:1.75}
.bubbles{display:flex;flex-wrap:wrap;gap:10px;margin-top:34px}.bubble{position:relative;padding:10px 14px;border:1px solid var(--line2);border-radius:18px;background:rgba(255,244,234,.05);color:#f0d9ce;font-size:12px}.bubble:after{content:"";position:absolute;bottom:-6px;left:20px;width:10px;height:10px;background:#281016;border-right:1px solid var(--line2);border-bottom:1px solid var(--line2);transform:rotate(45deg)}
.login{padding:28px;border:1px solid var(--line2);border-radius:24px;background:linear-gradient(145deg,rgba(61,16,28,.94),rgba(13,4,7,.96));box-shadow:var(--shadow)}
.login .gate{display:flex;justify-content:space-between;color:var(--muted);font-size:9px;letter-spacing:.16em;text-transform:uppercase}.login h2{margin:40px 0 9px;font-size:28px;letter-spacing:-.03em}.login p{margin:0 0 22px;color:var(--muted)}
label{display:block;margin:0 0 7px;color:#e8ccc3;font-size:11px;letter-spacing:.08em}
input,select,textarea{width:100%;border:1px solid #79434c;border-radius:12px;background:rgba(8,2,4,.58);color:var(--paper);outline:none;padding:12px 14px;transition:.2s}input:focus,select:focus,textarea:focus{border-color:var(--ember);box-shadow:0 0 0 4px rgba(255,89,61,.1)}
textarea{min-height:86px;resize:vertical}
.primary,.ghost,.tab{border-radius:11px;transition:.2s}
.primary{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:13px 15px;border:1px solid rgba(255,105,77,.75);background:linear-gradient(135deg,var(--ember),#df263c);color:#230508;font-weight:800}.primary:hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(199,34,48,.25)}
.ghost{padding:9px 12px;border:1px solid var(--line2);background:rgba(255,255,255,.025);color:var(--paper)}.ghost:hover{border-color:var(--ember);color:#ffd7c8}.ghost:disabled{opacity:.45;cursor:not-allowed}
.status{min-height:21px;margin-top:10px;color:var(--muted);font-size:11px}
.note{margin-top:22px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
.app{padding:34px 0}
.apphead{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}.apphead h1{margin:6px 0 0;font:400 clamp(34px,5vw,56px)/1 Georgia,serif;letter-spacing:-.05em}.apphead p{margin:8px 0 0;color:var(--muted)}
.appactions{display:flex;align-items:center;gap:10px}
.identity{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px 19px;border:1px solid var(--line);border-radius:17px;background:rgba(49,13,21,.65);margin-bottom:13px}.identity h2{margin:2px 0 0;font-size:19px}.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:99px;background:rgba(183,25,49,.22);color:var(--gold);font-size:10px}
.tabs{display:flex;gap:7px;overflow:auto;padding:3px 0 13px;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}.tab{flex:0 0 auto;padding:9px 13px;border:1px solid var(--line);background:rgba(255,255,255,.02);color:var(--muted)}.tab.active{border-color:rgba(255,89,61,.6);background:rgba(183,25,49,.24);color:#fff0e7}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}.metric{padding:17px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.metric span{display:block;color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.metric strong{display:block;margin-top:4px;font:400 30px/1.1 Georgia,serif}.metric small{display:block;margin-top:7px;color:#a98e88}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.panel{padding:20px;border:1px solid var(--line);border-radius:17px;background:var(--panel);box-shadow:0 12px 32px rgba(0,0,0,.08)}.panel+.panel{margin-top:10px}.grid2>.panel+.panel{margin-top:0}
.panelhead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.panel h3{margin:0;font-size:16px}.panel p{margin:4px 0 0;color:var(--muted);font-size:11px}
.scene{position:relative;overflow:hidden;padding:20px;border:1px dashed rgba(230,202,140,.3);border-radius:17px;background:linear-gradient(135deg,rgba(255,244,234,.055),rgba(104,16,39,.14));min-height:118px}.scene:before{content:"";position:absolute;right:-30px;bottom:-55px;width:170px;height:170px;border:1px solid rgba(230,202,140,.15);border-radius:50%;box-shadow:0 0 0 25px rgba(230,202,140,.025)}.scene .bubble{display:inline-block;margin-bottom:16px;background:#fff1e8;color:#351018;border-color:#fff1e8}.scene .bubble:after{background:#fff1e8;border-color:#fff1e8}.scene b{display:block;position:relative;font:400 22px Georgia,serif}.scene span{position:relative;color:var(--muted);font-size:11px}
.products{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:9px}.product{padding:16px;border:1px solid var(--line);border-radius:14px;background:rgba(10,3,5,.32)}.product h4{margin:0;font-size:14px}.product .sku{color:var(--muted);font-size:10px}.productrow{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.productrow span{color:var(--muted);font-size:10px}.productrow b{font-size:13px}.warn{color:var(--warn)!important}.ok{color:var(--ok)!important}
.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:13px}table{width:100%;border-collapse:collapse;min-width:680px}th,td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:9px;letter-spacing:.08em;text-transform:uppercase;background:rgba(11,3,5,.38)}td{font-size:12px}tr:last-child td{border-bottom:0}.money{font-variant-numeric:tabular-nums;white-space:nowrap}.subline{display:block;margin-top:3px;color:var(--muted);font-size:10px}
.formgrid{display:grid;grid-template-columns:1.4fr .6fr;gap:9px}.inline{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.inline .ghost{flex:0 0 auto}
.timeline{display:grid;gap:8px}.event{padding:13px 14px;border-left:2px solid var(--wine);background:rgba(10,3,5,.3);border-radius:0 11px 11px 0}.event b{font-size:12px}.event small{display:block;color:var(--muted);margin-top:3px}.event-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.event-actions .ghost{padding:7px 9px;font-size:10px}
.moneyhero{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.moneybox{padding:20px;border:1px solid var(--line2);border-radius:17px;background:linear-gradient(140deg,rgba(99,16,39,.38),rgba(16,5,8,.7))}.moneybox span{color:var(--muted);font-size:10px}.moneybox strong{display:block;margin-top:4px;font:400 clamp(30px,5vw,44px) Georgia,serif}
.assistant-form{display:grid;grid-template-columns:1fr auto;gap:8px}.assistant-form .primary{width:auto;margin:0}
.empty{padding:18px;color:var(--muted);text-align:center;border:1px dashed var(--line);border-radius:12px}
.footer{padding:24px 0 0;color:#856d68;font-size:9px;letter-spacing:.14em;text-align:center;text-transform:uppercase}
[data-view]{display:none}[data-view].active{display:block}
@media(max-width:850px){.entrance{grid-template-columns:1fr;min-height:auto;padding:42px 0}.login{max-width:620px}.grid4{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}.grid2>.panel+.panel{margin-top:10px}.apphead{display:block}.appactions{margin-top:14px}.moneyhero{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.shell{padding:14px 14px 38px}.topbar{padding-top:max(2px,env(safe-area-inset-top))}.live span:last-child{display:none}.hero h1{font-size:clamp(48px,16vw,70px)}.hero p{font-size:14px}.login{padding:21px}.grid4{grid-template-columns:1fr 1fr}.metric{padding:14px}.metric strong{font-size:26px}.identity{display:block}.identity .pill{margin-top:10px}.formgrid,.assistant-form{grid-template-columns:1fr}.assistant-form .primary{width:100%}.moneyhero{grid-template-columns:1fr}.panel{padding:16px}.app{padding-top:25px}}
</style>
</head>
<body>
<main class="shell">
<nav class="topbar">
  <div class="brand"><div class="mark">火</div><div><b>HIMAI SHOP</b><small>Supplier System · Bangkok</small></div></div>
  <div class="live"><i class="dot"></i><span>Private supplier workspace</span></div>
</nav>

<section id="login" class="entrance">
  <div class="hero">
    <div class="kicker">Himai / Supplier Dashboard</div>
    <h1>Your stock.<br><em>Your numbers.</em></h1>
    <p>พื้นที่กลางสำหรับ Supplier ของ Himai Shop ดูเฉพาะสินค้าของตัวเอง ตั้งแต่ของคงเหลือ ออเดอร์ คำขอเติมของ การส่งสินค้า ไปจนถึงยอดที่รอจ่ายและประวัติการจ่าย</p>
    <div class="bubbles"><span class="bubble">ของใกล้หมด เดี๋ยวรู้ก่อน</span><span class="bubble">ส่งแล้วก็บอกตรงนี้</span><span class="bubble">ยอดเงินดูได้ ไม่ต้องถามซ้ำ</span></div>
  </div>
  <section class="login">
    <div class="gate"><span>Private access / 01</span><span>Himai Shop</span></div>
    <h2>เข้าสู่ Supplier Dashboard</h2>
    <p>ใช้รหัสส่วนตัวที่ Himai / MMD ออกให้ ระบบจะแสดงเฉพาะข้อมูลที่ผูกกับ Supplier บัญชีนี้</p>
    <form id="login-form">
      <label for="token">Access token</label>
      <input id="token" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>
      <button class="primary" type="submit">เปิด Dashboard <span>↗</span></button>
    </form>
    <div id="login-status" class="status" role="status" aria-live="polite"></div>
    <div class="note">ข้อมูลลูกค้า Margin ต้นทุนภายใน และข้อมูลของ Supplier รายอื่นจะไม่แสดงในพื้นที่นี้</div>
  </section>
</section>

<section id="app" class="app hidden">
  <header class="apphead">
    <div><div class="kicker">Himai / Supplier workspace</div><h1 id="welcome">Supplier Dashboard</h1><p id="updated">ข้อมูลล่าสุด —</p></div>
    <div class="appactions"><span class="live"><i class="dot"></i><span>Live data</span></span><button id="refresh" class="ghost" type="button">อัปเดต</button><button id="logout" class="ghost" type="button">ออก</button></div>
  </header>

  <div class="identity"><div><div class="kicker">Signed in as</div><h2 id="identity">Supplier</h2></div><span class="pill">Scoped supplier access</span></div>

  <nav class="tabs" aria-label="Supplier Dashboard">
    <button class="tab active" data-tab="overview">ภาพรวม</button>
    <button class="tab" data-tab="stock">สต๊อก</button>
    <button class="tab" data-tab="orders">ออเดอร์</button>
    <button class="tab" data-tab="refill">เติมของ & ส่งของ</button>
    <button class="tab" data-tab="money">ยอดเงิน</button>
  </nav>

  <section data-view="overview" class="active">
    <div class="grid4">
      <article class="metric"><span>ของคงเหลือ</span><strong id="m-stock">—</strong><small>ชิ้นในสินค้าของคุณ</small></article>
      <article class="metric"><span>ขายออก</span><strong id="m-sold">—</strong><small>จาก movement ที่บันทึก</small></article>
      <article class="metric"><span>ออเดอร์</span><strong id="m-orders">—</strong><small>เฉพาะรายการของคุณ</small></article>
      <article class="metric"><span>ยอดรอจ่าย</span><strong id="m-open">—</strong><small>Supplier ledger</small></article>
    </div>
    <div class="grid2">
      <article class="scene"><span class="bubble">เห็นเงียบ ๆ แต่ระบบตามให้อยู่</span><b id="scene-copy">กำลังอ่าน stock ล่าสุด…</b><span>Stock alert จะดูรายการที่ต่ำกว่า threshold ของบัญชีนี้</span></article>
      <article class="panel">
        <div class="panelhead"><div><h3>Supplier Assistant</h3><p>ถามเฉพาะข้อมูลในสิทธิ์ของบัญชีนี้</p></div><span id="notify-channel" class="pill">แจ้งเตือน: —</span></div>
        <form id="assistant-form" class="assistant-form"><input id="assistant-message" maxlength="1600" placeholder="เช่น ของอะไรใกล้หมด / ยอดค้างเท่าไร"><button class="primary" type="submit">ถาม</button></form>
        <div id="assistant-reply" class="status" style="white-space:pre-line"></div>
        <div class="inline" style="margin-top:9px"><span style="color:var(--muted);font-size:10px">แจ้งเตือน:</span><button class="ghost notify" data-channel="line" type="button">LINE</button><button class="ghost notify" data-channel="telegram" type="button">Telegram</button><button class="ghost notify" data-channel="none" type="button">ปิด</button><span id="notify-status" class="status"></span></div>
      </article>
    </div>
    <article class="panel" style="margin-top:10px"><div class="panelhead"><div><h3>สินค้าที่ควรดูตอนนี้</h3><p>รายการคงเหลือและสัญญาณเติมสินค้า</p></div></div><div id="overview-products" class="products"></div></article>
  </section>

  <section data-view="stock">
    <article class="panel"><div class="panelhead"><div><h3>Stock ของคุณ</h3><p>จำนวนพร้อมใช้ ขายออก จอง และ movement ล่าสุด</p></div></div><div id="stock-products" class="products"></div></article>
  </section>

  <section data-view="orders">
    <article class="panel"><div class="panelhead"><div><h3>Orders ที่มีสินค้าของคุณ</h3><p>ไม่แสดงชื่อ เบอร์ หรือข้อมูลส่วนตัวของลูกค้า</p></div><span class="pill" id="orders-count">0 orders</span></div>
      <div class="tablewrap"><table><thead><tr><th>Order</th><th>วันที่ / ช่องทาง</th><th>สินค้า</th><th>สถานะ</th><th>ยอดรายการของคุณ</th></tr></thead><tbody id="orders-body"></tbody></table></div>
    </article>
  </section>

  <section data-view="refill">
    <div class="grid2">
      <article class="panel">
        <div class="panelhead"><div><h3>ขอเติมสินค้า</h3><p>ส่งคำขอให้ MMD ตรวจ ก่อนรับเข้าสต๊อกจริง</p></div></div>
        <form id="refill-form">
          <div class="formgrid"><div><label for="refill-product">สินค้า</label><select id="refill-product" required></select></div><div><label for="refill-qty">จำนวน</label><input id="refill-qty" type="number" min="1" max="10000" inputmode="numeric" required></div></div>
          <button class="primary" type="submit">ส่งคำขอเติมสินค้า</button>
        </form>
        <div id="refill-status" class="status"></div>
      </article>
      <article class="scene"><span class="bubble">เติมของ ≠ stock เพิ่มทันทีนะ</span><b>Supplier แจ้ง → MMD รับ → Stock ค่อยเพิ่ม</b><span>การกดยืนยันรับสินค้าเป็นสิทธิ์ของ MMD เพื่อให้ inventory truth ไม่เพี้ยน</span></article>
    </div>
    <article class="panel" style="margin-top:10px"><div class="panelhead"><div><h3>Refill & Delivery Timeline</h3><p>แจ้งกำลังเตรียม หรือแจ้งส่งของจากคำขอของคุณ</p></div><button id="workflow-refresh" class="ghost" type="button">อัปเดต</button></div><div id="workflow" class="timeline"></div></article>
  </section>

  <section data-view="money">
    <div class="moneyhero"><article class="moneybox"><span>ยอดที่รอจ่าย</span><strong id="open-balance">—</strong></article><article class="moneybox"><span>ยอดที่จ่ายแล้ว</span><strong id="paid-total">—</strong></article></div>
    <div class="grid2">
      <article class="panel"><div class="panelhead"><div><h3>Supplier Ledger</h3><p>รายการยอดค้าง/settled ของบัญชีนี้</p></div></div><div class="tablewrap"><table><thead><tr><th>วันที่</th><th>ยอด</th><th>สถานะ</th></tr></thead><tbody id="ledger-body"></tbody></table></div></article>
      <article class="panel"><div class="panelhead"><div><h3>Payout History</h3><p>ประวัติการจ่ายที่บันทึกแล้ว</p></div></div><div class="tablewrap"><table><thead><tr><th>วันที่</th><th>ยอด</th><th>วิธี / สถานะ</th></tr></thead><tbody id="payout-body"></tbody></table></div></article>
    </div>
  </section>
</section>
<div class="footer">HIMAI SHOP · SUPPLIER DASHBOARD · PRIVATE COMMERCE SYSTEM</div>
</main>
<script>
(function(){
  var storageKey="himai_distributor_token",token="",data=null,workflowData=null;
  var login=document.getElementById("login"),app=document.getElementById("app"),loginStatus=document.getElementById("login-status");
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0}
  function money(v){return "฿"+num(v).toLocaleString("th-TH",{maximumFractionDigits:2})}
  function dt(v){if(!v)return "—";var d=new Date(v);return Number.isNaN(d.getTime())?esc(v):d.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})}
  function authHeaders(extra){var h={Authorization:"Bearer "+token};Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});return h}
  async function api(path,options){var o=options||{};o.headers=authHeaders(o.headers||{});var r=await fetch(path,o);var j=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(j.error||"request_failed");return j}
  function productCard(p){
    var sig=p.low_stock?"<span class='warn'>ควรเช็กเติมสินค้า</span>":"<span class='ok'>Stock ปกติ</span>";
    return "<article class='product'><div class='pill'>"+esc(p.category||"Selected")+"</div><h4 style='margin-top:9px'>"+esc(p.product_name||"Product")+"</h4><div class='sku'>"+esc(p.sku||"")+"</div><div class='productrow'><div><span>คงเหลือ</span><b>"+esc(p.available==null?"—":p.available)+"</b></div><div><span>ขายออก</span><b>"+esc(p.sold_total||0)+"</b></div><div><span>จอง</span><b>"+esc(p.reserved_total||0)+"</b></div></div><div style='margin-top:10px'>"+sig+"</div></article>"
  }
  function renderProducts(){
    var ps=Array.isArray(data.products)?data.products:[];
    var html=ps.length?ps.map(productCard).join(""):"<div class='empty'>ยังไม่มีสินค้าที่ผูกกับบัญชีนี้</div>";
    document.getElementById("stock-products").innerHTML=html;
    var focus=ps.filter(function(p){return p.low_stock}).concat(ps.filter(function(p){return !p.low_stock})).slice(0,4);
    document.getElementById("overview-products").innerHTML=focus.length?focus.map(productCard).join(""):"<div class='empty'>ยังไม่มีสินค้า</div>";
    document.getElementById("refill-product").innerHTML=ps.length?ps.map(function(p){return "<option value='"+esc(p.id)+"'>"+esc(p.product_name)+" · เหลือ "+esc(p.available==null?"—":p.available)+"</option>"}).join(""):"<option value=''>ยังไม่มีสินค้า</option>";
    var low=ps.filter(function(p){return p.low_stock}).length;
    document.getElementById("scene-copy").textContent=low?low+" รายการกำลังเข้าเกณฑ์เช็กเติม":"ตอนนี้ Stock ในบัญชีนี้ยังอยู่ในระดับปกติ";
  }
  function renderOrders(){
    var rows=Array.isArray(data.orders)?data.orders:[];
    document.getElementById("orders-count").textContent=rows.length+" orders";
    document.getElementById("orders-body").innerHTML=rows.length?rows.map(function(o){
      var items=(o.items||[]).map(function(i){return esc(i.product_name)+" × "+esc(i.quantity)}).join("<br>");
      return "<tr><td><b>"+esc(o.order_id)+"</b></td><td>"+esc(o.order_date||"—")+"<span class='subline'>"+esc(o.channel||"Shop")+"</span></td><td>"+items+"</td><td>"+esc(o.order_status||"—")+"<span class='subline'>Payment: "+esc(o.payment_status||"—")+"</span></td><td class='money'>"+money(o.line_total_thb)+"</td></tr>";
    }).join(""):"<tr><td colspan='5' class='empty'>ยังไม่มี Order ที่เกี่ยวข้อง</td></tr>";
  }
  function renderFinance(){
    var f=data.finance||{},ledger=Array.isArray(f.ledger)?f.ledger:[],payouts=Array.isArray(f.payouts)?f.payouts:[];
    document.getElementById("open-balance").textContent=money(f.open_balance_thb);
    document.getElementById("paid-total").textContent=money(f.paid_total_thb);
    document.getElementById("ledger-body").innerHTML=ledger.length?ledger.map(function(x){return "<tr><td>"+esc(x.date||"—")+"</td><td class='money'>"+money(x.amount_owed_thb)+"</td><td>"+esc(x.status||"—")+"</td></tr>"}).join(""):"<tr><td colspan='3' class='empty'>ยังไม่มี Ledger</td></tr>";
    document.getElementById("payout-body").innerHTML=payouts.length?payouts.map(function(x){return "<tr><td>"+esc(x.payout_date||"—")+"</td><td class='money'>"+money(x.amount_thb)+"</td><td>"+esc(x.method||"—")+"<span class='subline'>"+esc(x.status||"—")+"</span></td></tr>"}).join(""):"<tr><td colspan='3' class='empty'>ยังไม่มีประวัติ Payout</td></tr>";
  }
  function render(){
    var s=data.summary||{},name=(data.supplier&&data.supplier.name)||(data.distributor&&data.distributor.name)||"Supplier";
    login.classList.add("hidden");app.classList.remove("hidden");document.getElementById("identity").textContent=name;document.getElementById("welcome").textContent="สวัสดี "+name;
    document.getElementById("updated").textContent="ข้อมูลล่าสุด "+dt(data.updated_at);
    document.getElementById("m-stock").textContent=num(s.stock_units).toLocaleString("th-TH");
    document.getElementById("m-sold").textContent=num(s.sold_units).toLocaleString("th-TH");
    document.getElementById("m-orders").textContent=num(s.orders).toLocaleString("th-TH");
    document.getElementById("m-open").textContent=money(s.open_balance_thb);
    renderProducts();renderOrders();renderFinance();refreshPreference();refreshWorkflow();
  }
  async function load(){
    loginStatus.textContent="กำลังตรวจสิทธิ์และโหลดข้อมูล…";
    try{data=await api("/shop/api/distributor/portal");render();loginStatus.textContent=""}
    catch(e){sessionStorage.removeItem(storageKey);token="";login.classList.remove("hidden");app.classList.add("hidden");loginStatus.textContent="เข้า Dashboard ไม่ได้ กรุณาตรวจ Access token"}
  }
  function showTab(name){
    document.querySelectorAll("[data-view]").forEach(function(el){el.classList.toggle("active",el.getAttribute("data-view")===name)});
    document.querySelectorAll("[data-tab]").forEach(function(el){el.classList.toggle("active",el.getAttribute("data-tab")===name)});
  }
  async function refreshPreference(){
    try{var r=await api("/shop/api/distributor/notification-preference");document.getElementById("notify-channel").textContent="แจ้งเตือน: "+(r.channel==="none"?"ปิด":String(r.channel||"—").toUpperCase())}
    catch(e){document.getElementById("notify-channel").textContent="แจ้งเตือน: —"}
  }
  async function setPreference(channel){
    var out=document.getElementById("notify-status");out.textContent="กำลังบันทึก…";
    try{var r=await api("/shop/api/distributor/notification-preference",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:channel})});out.textContent=r.message||"บันทึกแล้ว";refreshPreference()}
    catch(e){out.textContent=e.message==="notification_target_missing"?"บัญชีนี้ยังไม่ได้เชื่อมช่องทางดังกล่าว":"บันทึกไม่ได้"}
  }
  async function refreshWorkflow(){
    var root=document.getElementById("workflow");root.innerHTML="<div class='empty'>กำลังโหลด Timeline…</div>";
    try{workflowData=await api("/shop/api/distributor/workflow");renderWorkflow()}
    catch(e){root.innerHTML="<div class='empty'>ยังเปิด Timeline ไม่ได้</div>"}
  }
  function renderWorkflow(){
    var drafts=Array.isArray(workflowData&&workflowData.refill_requests)?workflowData.refill_requests:[],updates=Array.isArray(workflowData&&workflowData.delivery_updates)?workflowData.delivery_updates:[];
    var updateBy={};updates.forEach(function(u){if(!updateBy[u.refill_id])updateBy[u.refill_id]=u});
    document.getElementById("workflow").innerHTML=drafts.length?drafts.map(function(d){
      var u=updateBy[d.id],items=(d.items||[]).map(function(i){return esc(i.product_name)+" × "+esc(i.quantity)}).join(" · ");
      var st=u?u.status:d.status,tracking=u&&u.tracking_reference?("<small>Tracking: "+esc(u.tracking_reference)+"</small>"):"";
      return "<article class='event'><b>"+esc(items||"Refill request")+"</b><small>"+dt(d.created_at)+" · "+esc(st||"draft")+"</small>"+tracking+"<div class='event-actions'><button class='ghost delivery' data-id='"+esc(d.id)+"' data-status='preparing' type='button'>กำลังเตรียม</button><button class='ghost delivery' data-id='"+esc(d.id)+"' data-status='shipped' type='button'>แจ้งส่งของ</button></div></article>";
    }).join(""):"<div class='empty'>ยังไม่มีคำขอเติมสินค้า</div>";
  }
  async function deliveryUpdate(id,status){
    var tracking="",note="";
    if(status==="shipped")tracking=window.prompt("เลข Tracking / ข้อมูลการส่ง (ถ้ามี)","")||"";
    note=window.prompt("หมายเหตุ (เว้นว่างได้)","")||"";
    try{var r=await api("/shop/api/distributor/delivery-update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refill_id:id,status:status,tracking_reference:tracking,note:note})});document.getElementById("refill-status").textContent=r.message||"บันทึกแล้ว";await refreshWorkflow()}
    catch(e){document.getElementById("refill-status").textContent="บันทึกสถานะไม่ได้: "+e.message}
  }
  document.getElementById("login-form").addEventListener("submit",function(e){e.preventDefault();var v=document.getElementById("token").value.trim();if(!v)return;token=v;sessionStorage.setItem(storageKey,v);load()});
  document.getElementById("logout").addEventListener("click",function(){sessionStorage.removeItem(storageKey);location.reload()});
  document.getElementById("refresh").addEventListener("click",load);
  document.getElementById("workflow-refresh").addEventListener("click",refreshWorkflow);
  document.querySelectorAll("[data-tab]").forEach(function(b){b.addEventListener("click",function(){showTab(b.getAttribute("data-tab"))})});
  document.querySelectorAll(".notify").forEach(function(b){b.addEventListener("click",function(){setPreference(b.getAttribute("data-channel"))})});
  document.getElementById("assistant-form").addEventListener("submit",async function(e){e.preventDefault();var input=document.getElementById("assistant-message"),out=document.getElementById("assistant-reply"),m=input.value.trim();if(!m)return;out.textContent="กำลังดูข้อมูลล่าสุด…";try{var r=await api("/shop/api/distributor/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:m})});out.textContent=r.reply||"—"}catch(err){out.textContent="Assistant ยังตอบไม่ได้ในตอนนี้"}});
  document.getElementById("refill-form").addEventListener("submit",async function(e){e.preventDefault();var pid=document.getElementById("refill-product").value,q=Number(document.getElementById("refill-qty").value),out=document.getElementById("refill-status");if(!pid||!Number.isInteger(q)||q<1)return;out.textContent="กำลังส่งคำขอ…";try{var r=await api("/shop/api/distributor/refill-draft",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:[{product_id:pid,quantity:q}]})});out.textContent=r.message||"ส่งแล้ว";document.getElementById("refill-qty").value="";await refreshWorkflow()}catch(err){out.textContent="ส่งคำขอไม่ได้: "+err.message}});
  document.getElementById("workflow").addEventListener("click",function(e){var b=e.target.closest(".delivery");if(b)deliveryUpdate(b.getAttribute("data-id"),b.getAttribute("data-status"))});
  var q=new URLSearchParams(location.search).get("token")||"";token=q||sessionStorage.getItem(storageKey)||"";if(q){sessionStorage.setItem(storageKey,q);history.replaceState({},document.title,location.pathname)}
  if(token)load();
})();
</script>
</body>
</html>\`;
