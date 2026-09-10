export function renderDistributorPortalPage() {
  return new Response(HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

const HTML = String.raw`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/png" href="data:image/png;base64,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">
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
.brand-wordmark{display:block;width:46px;height:46px;object-fit:contain;filter:drop-shadow(0 7px 14px rgba(0,0,0,.18))}
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
  .brand-wordmark{width:40px;height:40px}
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
    <img class="brand-wordmark" src="data:image/png;base64,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" alt="Himai Shop logo">
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
