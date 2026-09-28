export function renderSupplierDashboardPage() {
  return new Response(HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

const HTML = String.raw`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Himai Shop · Supplier Dashboard</title>
<style>
:root{
  color-scheme:dark;
  --bg:#0e0507;--bg2:#1b080d;--panel:rgba(38,11,18,.84);--panel2:rgba(16,5,8,.72);
  --line:rgba(218,187,132,.18);--line2:rgba(218,187,132,.34);--text:#fff5ef;--muted:#c9ada9;
  --red:#b91f36;--red2:#ff5548;--gold:#d9bd83;--ivory:#f6eee7;--ok:#a8d8b6;--warn:#ffd0a0;
}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-height:100vh;color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Thai",sans-serif;background:
radial-gradient(900px 560px at 0% 0%,rgba(140,20,47,.36),transparent 66%),
radial-gradient(760px 520px at 100% 18%,rgba(255,85,72,.10),transparent 68%),
linear-gradient(145deg,#250910 0%,#0e0507 52%,#070304 100%)}
button,input{font:inherit}.shell{width:min(1180px,100%);margin:auto;padding:20px 18px 48px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:6px 0 20px;border-bottom:1px solid var(--line)}
.brand strong{display:block;font:500 17px/1.1 Georgia,serif;letter-spacing:.04em}.brand span{display:block;margin-top:4px;color:var(--muted);font-size:10px;letter-spacing:.16em;text-transform:uppercase}.live{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px}.dot{width:7px;height:7px;border-radius:50%;background:var(--red2);box-shadow:0 0 0 5px rgba(255,85,72,.10)}
.login{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(32px,7vw,90px);align-items:center;min-height:calc(100vh - 100px);padding:54px 0}.eyebrow{color:var(--gold);font-size:10px;letter-spacing:.18em;text-transform:uppercase}.hero h1{margin:14px 0 20px;max-width:660px;font:400 clamp(52px,7vw,88px)/.94 Georgia,serif;letter-spacing:-.05em}.hero h1 em{color:var(--ivory);font-weight:400}.hero p{max-width:560px;margin:0;color:var(--muted);font-size:16px}.feature-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:36px}.feature{padding:15px 0;border-top:1px solid var(--line2)}.feature b{display:block;color:var(--gold);font-size:10px;letter-spacing:.12em}.feature span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
.card{border:1px solid var(--line2);border-radius:24px;background:linear-gradient(145deg,rgba(55,13,24,.94),rgba(15,5,8,.95));box-shadow:0 30px 80px rgba(0,0,0,.28)}.login-card{padding:26px}.login-card h2{margin:9px 0 6px;font-size:28px}.login-card p{margin:0 0 22px;color:var(--muted);font-size:13px}.field label{display:block;margin-bottom:7px;color:#ebd6d1;font-size:11px;letter-spacing:.08em;text-transform:uppercase}.field input{width:100%;height:50px;padding:0 14px;border:1px solid #71404a;border-radius:12px;background:rgba(8,2,4,.58);color:var(--text);outline:none}.field input:focus{border-color:var(--red2);box-shadow:0 0 0 4px rgba(255,85,72,.09)}
.primary,.secondary{border-radius:12px;cursor:pointer}.primary{width:100%;height:50px;margin-top:12px;border:1px solid rgba(255,118,91,.55);background:linear-gradient(135deg,var(--red),#d93635);color:#fff;font-weight:700}.secondary{padding:9px 13px;border:1px solid var(--line2);background:transparent;color:var(--text)}.secondary:hover{border-color:var(--red2)}.status{min-height:22px;margin-top:10px;color:var(--muted);font-size:12px}.privacy{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
.app{padding:32px 0}.hidden{display:none!important}.app-head{display:flex;justify-content:space-between;gap:18px;align-items:end;margin-bottom:22px}.app-head h1{margin:5px 0 0;font:400 clamp(38px,5vw,62px)/1 Georgia,serif;letter-spacing:-.04em}.actions{display:flex;gap:10px;align-items:center}.identity{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:18px 20px;margin-bottom:12px;border:1px solid var(--line);border-radius:17px;background:var(--panel)}.identity h2{margin:2px 0;font-size:20px}.identity p{margin:0;color:var(--muted);font-size:12px}.pill{display:inline-flex;padding:5px 9px;border-radius:99px;background:rgba(185,31,54,.18);color:var(--gold);font-size:11px;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}.stat{padding:17px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.stat span{display:block;color:var(--muted);font-size:10px;letter-spacing:.09em;text-transform:uppercase}.stat strong{display:block;margin-top:5px;font:400 32px/1.1 Georgia,serif;color:var(--ivory)}.stat.warn strong{color:var(--warn)}
.grid{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.panel{padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}.panel+.panel{margin-top:12px}.grid>.panel+.panel{margin-top:0}.panel-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.panel h2{margin:0;font-size:18px}.panel p.sub{margin:4px 0 0;color:var(--muted);font-size:12px}.products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.product{padding:15px;border:1px solid var(--line);border-radius:14px;background:var(--panel2)}.product h3{margin:0 0 3px;font-size:15px}.muted{color:var(--muted);font-size:12px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:13px}.metric{padding:9px;border-radius:10px;background:rgba(255,255,255,.025)}.metric span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.metric b{display:block;margin-top:2px;font-size:15px}.refill-list,.activity{display:grid;gap:8px}.row{display:flex;justify-content:space-between;gap:14px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(7,2,4,.28)}.row strong{display:block;font-size:13px}.row span{display:block;color:var(--muted);font-size:11px}.row-right{text-align:right}.danger{color:#ffb0a7!important}.ok{color:var(--ok)!important}.assistant-form{display:flex;gap:8px}.assistant-form input{flex:1;min-width:0;height:44px;padding:0 12px;border:1px solid var(--line2);border-radius:11px;background:rgba(7,2,4,.5);color:var(--text);outline:none}.assistant-form .primary{width:auto;height:44px;margin:0;padding:0 16px}.notify{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.footer{padding:22px 0 0;color:#806a68;font-size:9px;letter-spacing:.13em;text-align:center;text-transform:uppercase}
@media(max-width:900px){.login{grid-template-columns:1fr;min-height:auto}.hero{padding-top:20px}.stats{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}.grid>.panel+.panel{margin-top:0}.products{grid-template-columns:1fr}}
@media(max-width:600px){.shell{padding:16px 14px 36px}.login{padding:34px 0}.feature-row{grid-template-columns:1fr}.feature{padding:10px 0}.app-head{display:block}.actions{margin-top:16px;justify-content:space-between}.identity{display:block}.identity .pill{margin-top:12px}.stats{grid-template-columns:1fr 1fr}.stats .stat:first-child{grid-column:span 2}.stat strong{font-size:28px}.panel{padding:16px}.assistant-form{display:block}.assistant-form .primary{width:100%;margin-top:8px}.row{display:block}.row-right{text-align:left;margin-top:7px}}
</style>
</head>
<body>
<main class="shell">
<header class="top"><div class="brand"><strong>HIMAI SHOP</strong><span>Supplier operating system</span></div><div class="live"><span class="dot"></span><span>Private supplier workspace</span></div></header>

<section id="login" class="login">
  <div class="hero">
    <div class="eyebrow">Himai / Supplier Network</div>
    <h1>One dashboard.<br><em>Your stock only.</em></h1>
    <p>พื้นที่กลางสำหรับ supplier และพ่อค้าคนกลางของ Himai Shop แต่ละบัญชีเห็นเฉพาะสินค้าของตัวเอง สต๊อกจริง ยอดออก การจอง และสัญญาณเติมสินค้า</p>
    <div class="feature-row">
      <div class="feature"><b>01 / PRIVATE</b><span>แยกสิทธิ์ supplier ต่อ supplier แบบ fail-closed</span></div>
      <div class="feature"><b>02 / LIVE</b><span>stock, sold, reserved และ refill signal ในหน้าเดียว</span></div>
      <div class="feature"><b>03 / CONNECTED</b><span>Assistant + LINE / Telegram notification preference</span></div>
    </div>
  </div>
  <section class="card login-card">
    <div class="eyebrow">Supplier access</div>
    <h2>เข้าสู่ Dashboard</h2>
    <p>ใช้ Access token ที่ Himai Shop ออกให้กับบัญชี supplier ของคุณ</p>
    <form id="login-form">
      <div class="field"><label for="token">Access token</label><input id="token" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required></div>
      <button class="primary" type="submit">เข้า Supplier Dashboard</button>
    </form>
    <div id="login-status" class="status" role="status"></div>
    <div class="privacy">Dashboard นี้ไม่เปิดเผยข้อมูลลูกค้า ต้นทุนภายใน margin บันทึกหลังบ้าน หรือข้อมูลของ supplier รายอื่น</div>
  </section>
</section>

<section id="app" class="app hidden">
  <div class="app-head">
    <div><div class="eyebrow">Himai / Supplier Dashboard</div><h1>Supply at a glance.</h1></div>
    <div class="actions"><div class="live"><span class="dot"></span><span id="updated">Live</span></div><button id="logout" class="secondary" type="button">ออกจากระบบ</button></div>
  </div>

  <section class="identity">
    <div><div class="eyebrow">Signed in as</div><h2 id="identity-name">Supplier</h2><p>ข้อมูลด้านล่างถูกกรองตามสิทธิ์บัญชีนี้เท่านั้น</p></div>
    <span class="pill">Supplier access</span>
  </section>

  <section class="stats" aria-label="Supplier summary">
    <div class="stat"><span>Products</span><strong id="s-products">—</strong></div>
    <div class="stat"><span>On hand</span><strong id="s-stock">—</strong></div>
    <div class="stat"><span>Sold</span><strong id="s-sold">—</strong></div>
    <div class="stat"><span>Reserved</span><strong id="s-reserved">—</strong></div>
    <div class="stat warn"><span>Need refill</span><strong id="s-refill">—</strong></div>
  </section>

  <section class="grid">
    <div>
      <section class="panel">
        <div class="panel-head"><div><h2>สินค้าของคุณ</h2><p class="sub">inventory view ที่อ่านจาก stock truth ของ Himai</p></div><span id="product-label" class="pill">0 products</span></div>
        <div id="products" class="products"></div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Activity ล่าสุด</h2><p class="sub">เฉพาะ movement ของสินค้าที่บัญชีนี้มีสิทธิ์เห็น</p></div></div>
        <div id="activity" class="activity"></div>
      </section>
    </div>
    <div>
      <section class="panel">
        <div class="panel-head"><div><h2>เติมสินค้า</h2><p class="sub">สินค้าที่ควรเช็กหรือเติมก่อน</p></div></div>
        <div id="refill" class="refill-list"></div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Supplier Assistant</h2><p class="sub">ถาม stock, ยอดออก, การจอง หรือสินค้าที่ควรเติม</p></div><span id="notify-channel" class="pill">แจ้งเตือน: —</span></div>
        <form id="assistant-form" class="assistant-form"><input id="assistant-message" maxlength="1600" placeholder="เช่น วันนี้อะไรควรเติม"><button class="primary" type="submit">ถาม</button></form>
        <div id="assistant-reply" class="status" role="status"></div>
        <div class="notify"><button class="secondary notify-button" data-channel="line" type="button">LINE</button><button class="secondary notify-button" data-channel="telegram" type="button">Telegram</button><button class="secondary notify-button" data-channel="none" type="button">ปิดแจ้งเตือน</button></div>
        <div id="notify-status" class="status" role="status"></div>
      </section>
    </div>
  </section>
</section>
<div class="footer">HIMAI SHOP · CENTRAL SUPPLIER DASHBOARD</div>
</main>
<script>
(function(){
  var storageKey="himai_supplier_token";
  var legacyKey="himai_distributor_token";
  var login=document.getElementById("login"),app=document.getElementById("app"),form=document.getElementById("login-form"),input=document.getElementById("token"),loginStatus=document.getElementById("login-status");
  var assistantForm=document.getElementById("assistant-form"),assistantMessage=document.getElementById("assistant-message"),assistantReply=document.getElementById("assistant-reply"),notifyChannel=document.getElementById("notify-channel"),notifyStatus=document.getElementById("notify-status");
  var currentToken="";
  var token=sessionStorage.getItem(storageKey)||sessionStorage.getItem(legacyKey)||new URLSearchParams(location.search).get("token")||"";
  if(token){sessionStorage.setItem(storageKey,token);sessionStorage.removeItem(legacyKey);history.replaceState({},document.title,location.pathname);}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function fmtDate(v){if(!v)return "—";var d=new Date(v);return isNaN(d)?String(v):d.toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"});}
  function refillLabel(v){return v==="refill_now"?"เติมทันที":v==="check_next_refill"?"ควรเช็กเติม":"ปกติ";}
  function allMovements(products){
    var seen={};var list=[];
    products.forEach(function(p){(p.movements||[]).forEach(function(m){var key=[m.movement_name,m.movement_date,p.id].join("|");if(seen[key])return;seen[key]=1;list.push(Object.assign({product_name:p.product_name},m));});});
    return list.sort(function(a,b){return String(b.movement_date||"").localeCompare(String(a.movement_date||""));}).slice(0,20);
  }
  function render(data){
    var products=Array.isArray(data.products)?data.products:[];
    var refills=products.filter(function(p){return p.refill_signal==="refill_now"||p.refill_signal==="check_next_refill"||p.low_stock;});
    var stock=products.reduce(function(a,p){return a+(Number(p.available)||0);},0);
    var sold=products.reduce(function(a,p){return a+(Number(p.sold_total)||0);},0);
    var reserved=products.reduce(function(a,p){return a+(Number(p.reserved_total)||0);},0);
    login.classList.add("hidden");app.classList.remove("hidden");
    document.getElementById("identity-name").textContent=(data.supplier&&data.supplier.name)||(data.distributor&&data.distributor.name)||"Supplier";
    document.getElementById("s-products").textContent=products.length;document.getElementById("s-stock").textContent=stock;document.getElementById("s-sold").textContent=sold;document.getElementById("s-reserved").textContent=reserved;document.getElementById("s-refill").textContent=refills.length;
    document.getElementById("product-label").textContent=products.length+" products";document.getElementById("updated").textContent=data.updated_at?"Updated "+fmtDate(data.updated_at):"Live";
    document.getElementById("products").innerHTML=products.length?products.map(function(p){
      var cls=p.low_stock?"danger":"ok";
      return "<article class='product'><div class='pill'>"+esc(p.sku||"SKU")+"</div><h3>"+esc(p.product_name||"Product")+"</h3><div class='muted'>"+esc(Array.isArray(p.supplier)?p.supplier.join(", "):(p.supplier||""))+"</div><div class='metrics'><div class='metric'><span>On hand</span><b>"+esc(p.available==null?"—":p.available)+"</b></div><div class='metric'><span>Sold</span><b>"+esc(p.sold_total||0)+"</b></div><div class='metric'><span>Reserved</span><b>"+esc(p.reserved_total||0)+"</b></div></div><div class='muted "+cls+"' style='margin-top:10px'>"+esc(refillLabel(p.refill_signal))+"</div></article>";
    }).join(""):"<div class='muted'>ยังไม่มีสินค้าที่บัญชีนี้ได้รับสิทธิ์</div>";
    document.getElementById("refill").innerHTML=refills.length?refills.map(function(p){return "<div class='row'><div><strong>"+esc(p.product_name)+"</strong><span>"+esc(p.sku||"")+"</span></div><div class='row-right'><strong class='danger'>"+esc(refillLabel(p.refill_signal))+"</strong><span>เหลือ "+esc(p.available==null?"—":p.available)+"</span></div></div>";}).join(""):"<div class='row'><div><strong class='ok'>Stock ปกติ</strong><span>ยังไม่มีสินค้าที่ต้องเติม</span></div></div>";
    var moves=allMovements(products);
    document.getElementById("activity").innerHTML=moves.length?moves.map(function(m){return "<div class='row'><div><strong>"+esc(m.product_name||m.movement_name||"Movement")+"</strong><span>"+esc(m.movement_type||m.reference_type||"Stock movement")+"</span></div><div class='row-right'><strong>"+esc(m.quantity==null?"—":m.quantity)+"</strong><span>"+esc(fmtDate(m.movement_date))+"</span></div></div>";}).join(""):"<div class='muted'>ยังไม่มี movement ล่าสุด</div>";
    refreshPreference();
  }
  async function load(value){
    currentToken=value;loginStatus.textContent="กำลังตรวจสอบสิทธิ์…";
    try{
      var response=await fetch("/shop/api/supplier/portal",{headers:{Authorization:"Bearer "+value}});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok)throw new Error(data.error||"access_denied");
      sessionStorage.setItem(storageKey,value);render(data);loginStatus.textContent="";
    }catch(error){sessionStorage.removeItem(storageKey);login.classList.remove("hidden");app.classList.add("hidden");loginStatus.textContent="ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบ Access token";input.value="";}
  }
  async function askAssistant(message){
    assistantReply.textContent="กำลังตรวจสอบข้อมูลล่าสุด…";
    try{
      var response=await fetch("/shop/api/distributor/assistant",{method:"POST",headers:{Authorization:"Bearer "+currentToken,"Content-Type":"application/json"},body:JSON.stringify({message:message})});
      var data=await response.json().catch(function(){return {};});if(!response.ok)throw new Error(data.error||"assistant_unavailable");
      assistantReply.textContent=data.reply||"ยังไม่มีคำตอบจาก Assistant";
    }catch(error){assistantReply.textContent="Assistant ยังใช้งานไม่ได้ในขณะนี้";}
  }
  async function refreshPreference(){
    try{var response=await fetch("/shop/api/distributor/notification-preference",{headers:{Authorization:"Bearer "+currentToken}});var data=await response.json().catch(function(){return {};});if(!response.ok)throw new Error();notifyChannel.textContent="แจ้งเตือน: "+(data.channel==="none"?"ปิด":String(data.channel||"—").toUpperCase());}
    catch(error){notifyChannel.textContent="แจ้งเตือน: —";}
  }
  async function setPreference(channel){
    notifyStatus.textContent="กำลังบันทึก…";
    try{var response=await fetch("/shop/api/distributor/notification-preference",{method:"POST",headers:{Authorization:"Bearer "+currentToken,"Content-Type":"application/json"},body:JSON.stringify({channel:channel})});var data=await response.json().catch(function(){return {};});if(!response.ok)throw new Error();notifyStatus.textContent=data.message||"บันทึกแล้ว";refreshPreference();}
    catch(error){notifyStatus.textContent="ช่องทางนี้ยังไม่ได้เชื่อมกับบัญชี supplier";}
  }
  form.addEventListener("submit",function(e){e.preventDefault();var v=input.value.trim();if(v)load(v);});
  document.getElementById("logout").addEventListener("click",function(){sessionStorage.removeItem(storageKey);sessionStorage.removeItem(legacyKey);location.reload();});
  assistantForm.addEventListener("submit",function(e){e.preventDefault();var m=assistantMessage.value.trim();if(m)askAssistant(m);});
  document.querySelectorAll(".notify-button").forEach(function(b){b.addEventListener("click",function(){setPreference(b.getAttribute("data-channel"));});});
  if(token)load(token);
})();
</script>
</body>
</html>`;
