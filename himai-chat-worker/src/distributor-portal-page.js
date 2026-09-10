export function renderDistributorPortalPage() {
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
<title>Himai Shop · Distributor Portal</title>
<style>
:root{
  color-scheme:dark;
  --ink:#0b1110;
  --ink-2:#101918;
  --panel:rgba(24,33,31,.82);
  --panel-strong:#17211f;
  --line:rgba(205,229,216,.16);
  --line-strong:rgba(205,229,216,.3);
  --text:#f4f6f1;
  --muted:#aebbb4;
  --mint:#9be0bd;
  --mint-2:#68c49b;
  --gold:#d7bd79;
  --warm:#f0eadc;
}
*{box-sizing:border-box}
html{background:var(--ink)}
body{
  margin:0;min-height:100vh;background:
    radial-gradient(900px 600px at 8% -10%,rgba(58,115,88,.32),transparent 68%),
    radial-gradient(700px 500px at 100% 15%,rgba(149,122,54,.12),transparent 64%),
    linear-gradient(135deg,#14231f 0%,#0b1110 44%,#0a0f0e 100%);
  color:var(--text);font:15px/1.55 "SF Pro Display","Noto Sans Thai","Noto Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  letter-spacing:.005em;
}
body:before{
  content:"";position:fixed;inset:0;pointer-events:none;opacity:.24;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:48px 48px;mask-image:linear-gradient(to bottom,black,transparent 78%);
}
body:after{
  content:"";position:fixed;width:420px;height:420px;right:-180px;bottom:-160px;border:1px solid rgba(155,224,189,.12);border-radius:50%;box-shadow:0 0 0 42px rgba(155,224,189,.025),0 0 0 84px rgba(155,224,189,.018);pointer-events:none;
}
button,input{font:inherit}
button{cursor:pointer}
.shell{width:min(1180px,100%);margin:auto;padding:24px 32px 42px;position:relative}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:4px 0 28px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px}
.brand-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid rgba(155,224,189,.6);border-radius:12px;color:var(--mint);font-family:Georgia,serif;font-size:21px;font-weight:700;box-shadow:inset 0 0 20px rgba(155,224,189,.08)}
.brand-copy{line-height:1.05}
.brand-copy strong{display:block;font-size:13px;letter-spacing:.17em}
.brand-copy span{display:block;margin-top:5px;color:var(--muted);font-size:10px;letter-spacing:.18em;text-transform:uppercase}
.top-status{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 5px rgba(155,224,189,.1),0 0 16px var(--mint)}
.entrance{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);gap:clamp(42px,8vw,118px);align-items:center;min-height:calc(100vh - 130px);padding:clamp(48px,9vh,110px) 0 72px}
.intro{max-width:620px}
.eyebrow{color:var(--mint);font-size:11px;letter-spacing:.2em;text-transform:uppercase}
.intro h1{max-width:610px;margin:18px 0 20px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(54px,7.2vw,94px);font-weight:400;letter-spacing:-.065em;line-height:.93}
.intro h1 em{color:var(--warm);font-style:italic}
.lede{max-width:510px;margin:0;color:#c2cec7;font-size:17px;line-height:1.65}
.signals{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:600px;margin-top:48px}
.signal{padding:15px 15px 14px;border-top:1px solid var(--line-strong);background:linear-gradient(180deg,rgba(255,255,255,.035),transparent);border-radius:2px}
.signal b{display:block;margin-bottom:9px;color:var(--gold);font-size:10px;font-weight:500;letter-spacing:.14em}
.signal strong{display:block;font-size:14px;font-weight:600}
.signal span{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.45}
.login-panel{position:relative;overflow:hidden;padding:30px;border:1px solid var(--line-strong);border-radius:26px;background:linear-gradient(145deg,rgba(31,46,42,.92),rgba(15,22,21,.92));box-shadow:0 30px 80px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.05)}
.login-panel:before{content:"";position:absolute;width:210px;height:210px;top:-130px;right:-70px;border:1px solid rgba(215,189,121,.28);border-radius:50%;box-shadow:0 0 0 25px rgba(215,189,121,.035),0 0 0 50px rgba(215,189,121,.025)}
.access-line{display:flex;justify-content:space-between;align-items:center;position:relative;margin-bottom:46px;color:var(--muted);font-size:10px;letter-spacing:.16em;text-transform:uppercase}
.access-line span:last-child{color:var(--gold)}
.login-panel h2{position:relative;margin:0 0 10px;font-size:29px;letter-spacing:-.03em}
.login-panel .sub{position:relative;margin:0 0 28px;color:var(--muted);line-height:1.6}
label{display:block;margin-bottom:8px;color:#cbd7d0;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.input-wrap{position:relative}
input{width:100%;height:52px;padding:0 15px;border:1px solid #52665e;border-radius:13px;background:rgba(5,10,9,.5);color:var(--text);outline:none;transition:border-color .25s,box-shadow .25s,background .25s}
input:focus{border-color:var(--mint);background:rgba(5,10,9,.75);box-shadow:0 0 0 4px rgba(155,224,189,.1)}
.primary{display:flex;align-items:center;justify-content:space-between;width:100%;height:52px;margin-top:13px;padding:0 17px 0 19px;border:1px solid rgba(155,224,189,.65);border-radius:13px;background:var(--mint);color:#10251b;font-weight:700;transition:transform .25s,background .25s,box-shadow .25s}
.primary:hover{background:#b5ebcf;box-shadow:0 12px 30px rgba(104,196,155,.17);transform:translateY(-2px)}
.arrow{font-size:20px;line-height:0}
.status{min-height:23px;margin-top:12px;color:var(--muted);font-size:12px}
.login-note{display:flex;gap:9px;margin-top:30px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.5}
.login-note i{width:16px;height:16px;flex:0 0 16px;border:1px solid var(--gold);border-radius:50%;color:var(--gold);font-size:10px;font-style:normal;text-align:center;line-height:15px}
.workspace{padding:48px 0 38px}
.workspace-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:28px}
.workspace-head h1{margin:8px 0 0;font-family:Georgia,serif;font-size:clamp(36px,5vw,60px);font-weight:400;letter-spacing:-.055em;line-height:1}
.workspace-actions{display:flex;align-items:center;gap:12px}
.online{display:flex;align-items:center;gap:8px;color:var(--mint);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.secondary{padding:10px 14px;border:1px solid var(--line-strong);border-radius:10px;background:transparent;color:var(--text);font-size:12px}
.secondary:hover{border-color:var(--mint);color:var(--mint)}
.workspace-intro{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:14px;padding:20px 22px;border:1px solid var(--line);border-radius:18px;background:rgba(24,33,31,.62)}
.workspace-intro h2{margin:4px 0 0;font-size:22px}
.workspace-intro p{margin:4px 0 0;color:var(--muted);font-size:12px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
.stat{padding:20px;border:1px solid var(--line);border-radius:17px;background:rgba(24,33,31,.64)}
.stat span{display:block;color:var(--muted);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.stat strong{display:block;margin-top:5px;color:var(--warm);font-family:Georgia,serif;font-size:36px;font-weight:400}
.panel{padding:22px;border:1px solid var(--line);border-radius:18px;background:rgba(24,33,31,.7)}
.panel h2{margin:0 0 17px;font-size:19px}
.products{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.product{padding:17px;border:1px solid var(--line);border-radius:14px;background:rgba(5,10,9,.24)}
.product h3{margin:0 0 4px;font-size:16px}
.product .muted{color:var(--muted);font-size:12px}
.pill{display:inline-block;padding:4px 9px;border-radius:99px;background:rgba(104,196,155,.15);color:var(--mint);font-size:11px}
.danger{color:#ffb9a9;font-size:12px}
.hidden{display:none!important}
.footer{padding-top:20px;color:#71817a;font-size:10px;letter-spacing:.12em;text-align:center;text-transform:uppercase}
@media(max-width:780px){
  .shell{padding:18px 18px 34px}
  .topbar{padding-bottom:20px}
  .top-status{font-size:10px}
  .entrance{display:block;min-height:auto;padding:54px 0 42px}
  .intro h1{font-size:clamp(52px,15vw,76px)}
  .lede{font-size:15px}
  .signals{margin-top:34px}
  .login-panel{margin-top:34px;padding:24px}
  .workspace{padding-top:34px}
  .workspace-head{display:block}
  .workspace-actions{justify-content:space-between;margin-top:18px}
}
@media(max-width:480px){
  .brand-copy strong{font-size:12px}
  .brand-copy span{font-size:8px}
  .signals{grid-template-columns:1fr;gap:0}
  .signal{padding:12px 0;border-top:1px solid var(--line)}
  .login-panel h2{font-size:26px}
  .workspace-intro{display:block}
  .stats{grid-template-columns:1fr 1fr}
  .stats .stat:last-child{grid-column:span 2}
  .stat{padding:16px}
  .stat strong{font-size:30px}
}
</style>
</head>
<body>
<main class="shell">
<nav class="topbar" aria-label="Himai Shop">
  <div class="brand">
    <div class="brand-mark" aria-hidden="true">H</div>
    <div class="brand-copy"><strong>HIMAI SHOP</strong><span>Selected commerce / Bangkok</span></div>
  </div>
  <div class="top-status"><span class="live-dot"></span><span>Private workspace</span></div>
</nav>

<section id="login" class="entrance">
  <div class="intro">
    <div class="eyebrow">Himai / Shop operations</div>
    <h1>Move product<br><em>with intention.</em></h1>
    <p class="lede">พื้นที่ทำงานสำหรับพ่อค้ากระจายสินค้า Himai Shop — เห็นเฉพาะสินค้า สต๊อก และสัญญาณการเติมสินค้าที่ได้รับสิทธิ์จาก MMD</p>
    <div class="signals" aria-label="Portal features">
      <div class="signal"><b>01 / CURATED</b><strong>Selected supply</strong><span>รายการสินค้าที่คัดไว้สำหรับช่องทางของคุณ</span></div>
      <div class="signal"><b>02 / LIVE</b><strong>Stock visibility</strong><span>ดูจำนวนคงเหลือและสัญญาณเติมสินค้า</span></div>
      <div class="signal"><b>03 / PRIVATE</b><strong>Role-based access</strong><span>ข้อมูลแยกสิทธิ์ ไม่เปิดข้อมูลลูกค้าหลังบ้าน</span></div>
    </div>
  </div>

  <section class="login-panel" aria-labelledby="login-title">
    <div class="access-line"><span>Access gate / 01</span><span>Himai Shop</span></div>
    <h2 id="login-title">เข้าสู่พื้นที่ทำงาน</h2>
    <p class="sub">ใช้รหัสเข้าถึงส่วนตัวที่ MMD ออกให้สำหรับบัญชี Distributor เท่านั้น</p>
    <form id="login-form">
      <label for="token">Access token</label>
      <div class="input-wrap"><input id="token" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required></div>
      <button class="primary" type="submit"><span>เข้า Distributor Portal</span><span class="arrow" aria-hidden="true">↗</span></button>
    </form>
    <div id="login-status" class="status" role="status" aria-live="polite"></div>
    <div class="login-note"><i>i</i><span>การเข้าถึงนี้ใช้สำหรับการทำงานด้านการกระจายสินค้าเท่านั้น ข้อมูลลูกค้า ต้นทุน และบันทึกภายในจะไม่แสดงใน Portal นี้</span></div>
  </section>
</section>

<section id="app" class="workspace hidden">
  <div class="workspace-head">
    <div><div class="eyebrow">Himai / Distributor workspace</div><h1>Good to see you.</h1></div>
    <div class="workspace-actions"><span class="online"><span class="live-dot"></span>Live view</span><button id="logout" class="secondary" type="button">ออกจากระบบ</button></div>
  </div>
  <div class="workspace-intro"><div><div class="eyebrow">Signed in as</div><h2 id="identity">Distributor</h2><p>ข้อมูลสินค้าที่ได้รับสิทธิ์สำหรับการกระจายสินค้า</p></div><span class="pill">Distributor access</span></div>
  <div class="stats">
    <div class="stat"><span>Products</span><strong id="product-count">—</strong></div>
    <div class="stat"><span>Sold</span><strong id="sold-total">—</strong></div>
    <div class="stat"><span>Reserved</span><strong id="reserved-total">—</strong></div>
  </div>
  <div class="panel"><h2>สินค้าที่ดูแล</h2><div id="products" class="products"></div></div>
</section>
<div class="footer">HIMAI SHOP · MMD PRIVATE COMMERCE SYSTEM</div>
</main>
<script>
(function(){
  var key="himai_distributor_token";
  var login=document.getElementById("login"),app=document.getElementById("app"),form=document.getElementById("login-form"),input=document.getElementById("token"),status=document.getElementById("login-status");
  var token=sessionStorage.getItem(key)||new URLSearchParams(location.search).get("token")||"";
  if(token){sessionStorage.setItem(key,token);history.replaceState({},document.title,location.pathname);}
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function money(value){return value==null?"สอบถามราคา":Number(value).toLocaleString("th-TH")+" บาท";}
  function render(data){
    login.classList.add("hidden");app.classList.remove("hidden");
    document.getElementById("identity").textContent=(data.distributor&&data.distributor.name)||"Distributor";
    var products=Array.isArray(data.products)?data.products:[];
    document.getElementById("product-count").textContent=products.length;
    document.getElementById("sold-total").textContent=products.reduce(function(a,p){return a+(Number(p.sold_total)||0);},0);
    document.getElementById("reserved-total").textContent=products.reduce(function(a,p){return a+(Number(p.reserved_total)||0);},0);
    document.getElementById("products").innerHTML=products.length?products.map(function(p){
      return "<article class='product'><h3>"+esc(p.product_name||"Product")+"</h3><div class='muted'>"+esc(p.sku||"")+"</div><p>"+(p.low_stock?"<span class='danger'>Low stock · "+esc(p.refill_signal)+"</span>":"<span class='pill'>"+esc(p.refill_signal||"stock")+"</span>")+"</p><div>คงเหลือ: <strong>"+esc(p.available==null?"—":p.available)+"</strong></div><div>ราคาขาย: "+esc(money(p.selling_price_thb))+"</div><div class='muted'>ขายแล้ว "+esc(p.sold_total||0)+" · จอง "+esc(p.reserved_total||0)+"</div></article>";
    }).join(""):"<div class='muted'>ยังไม่มีสินค้าที่ได้รับสิทธิ์</div>";
  }
  async function load(value){
    status.textContent="กำลังตรวจสอบสิทธิ์…";
    try{
      var response=await fetch("/shop/api/distributor/portal",{headers:{Authorization:"Bearer "+value}});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok)throw new Error(data.error||"access_denied");
      render(data);status.textContent="";
    }catch(error){
      sessionStorage.removeItem(key);login.classList.remove("hidden");app.classList.add("hidden");
      status.textContent="ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบ Access token";input.value="";
    }
  }
  form.addEventListener("submit",function(event){event.preventDefault();var value=input.value.trim();if(value){sessionStorage.setItem(key,value);load(value);}});
  document.getElementById("logout").addEventListener("click",function(){sessionStorage.removeItem(key);location.reload();});
  if(token)load(token);
})();
</script>
</body>
</html>`;
