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
:root{color-scheme:dark;--bg:#101313;--panel:#191e1e;--line:#303838;--text:#f1f4f2;--muted:#a9b3b0;--accent:#8bd7b1}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#22332d 0,#101313 42%);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(960px,100%);margin:auto;padding:28px 18px 56px}header{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:24px}h1{font-size:clamp(26px,5vw,44px);line-height:1.05;margin:6px 0}h2{font-size:20px;margin:0 0 14px}.eyebrow{color:var(--accent);letter-spacing:.14em;text-transform:uppercase;font-size:11px}.muted{color:var(--muted)}.panel{background:rgba(25,30,30,.9);border:1px solid var(--line);border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 18px 45px #0004}.login{max-width:520px}label{display:block;color:var(--muted);margin-bottom:7px}input{width:100%;padding:13px 14px;border:1px solid #52605c;border-radius:11px;background:#0c1010;color:var(--text);font:inherit}button{margin-top:12px;border:0;border-radius:11px;padding:12px 17px;background:var(--accent);color:#0b1712;font-weight:700;cursor:pointer}button.secondary{background:transparent;color:var(--text);border:1px solid var(--line);margin-left:8px}.status{min-height:24px;margin-top:10px;color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat{border:1px solid var(--line);border-radius:13px;padding:14px}.stat strong{display:block;font-size:25px}.products{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.product{border:1px solid var(--line);border-radius:14px;padding:15px}.product h3{margin:0 0 6px}.pill{display:inline-block;border-radius:99px;padding:3px 9px;background:#294438;color:var(--accent);font-size:12px}.danger{color:#ffb4a7}.hidden{display:none}@media(max-width:560px){main{padding:20px 14px 42px}.stats{grid-template-columns:1fr 1fr}.stats .stat:last-child{grid-column:span 2}}
</style>
</head>
<body>
<main>
<header><div><div class="eyebrow">Himai Shop</div><h1>Distributor Portal</h1><div class="muted">พื้นที่ปฏิบัติงานสำหรับพ่อค้ากระจายสินค้า</div></div><div class="pill">Private access</div></header>
<section id="login" class="panel login"><h2>เข้าสู่ระบบ</h2><div class="muted">ใช้รหัสเข้าถึงที่ MMD ออกให้เท่านั้น</div><form id="login-form"><label for="token">Access token</label><input id="token" type="password" autocomplete="current-password" required><button type="submit">เข้า Portal</button></form><div id="login-status" class="status"></div></section>
<section id="app" class="hidden">
<div class="panel"><div class="eyebrow">Signed in</div><h2 id="identity">Distributor</h2><div class="muted">ข้อมูลนี้เป็นข้อมูลการขายและสต๊อกที่ได้รับสิทธิ์เท่านั้น</div><button id="logout" class="secondary">ออกจากระบบ</button></div>
<div class="stats"><div class="stat"><span class="muted">Products</span><strong id="product-count">—</strong></div><div class="stat"><span class="muted">Sold</span><strong id="sold-total">—</strong></div><div class="stat"><span class="muted">Reserved</span><strong id="reserved-total">—</strong></div></div>
<div class="panel"><h2>สินค้าที่ดูแล</h2><div id="products" class="products"></div></div>
</section>
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
      return "<article class='product'><h3>"+esc(p.product_name||"Product")+"</h3><div class='muted'>"+esc(p.sku||"")+"</div><p>"+(p.low_stock?"<span class='danger'>Low stock · "+esc(p.refill_signal)+"</span>":"<span class='pill'>"+esc(p.refill_signal||"stock")+"<\/span>")+"</p><div>คงเหลือ: <strong>"+esc(p.available==null?"—":p.available)+"</strong></div><div>ราคาขาย: "+esc(money(p.selling_price_thb))+"</div><div class='muted'>ขายแล้ว "+esc(p.sold_total||0)+" · จอง "+esc(p.reserved_total||0)+"</div></article>";
    }).join(""):"<div class='muted'>ยังไม่มีสินค้าที่ได้รับสิทธิ์</div>";
  }
  async function load(value){
    status.textContent="กำลังตรวจสอบสิทธิ์…";
    try{
      var response=await fetch("/shop/api/distributor/portal",{headers:{Authorization:"Bearer "+value}});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok)throw new Error(data.error||"access_denied");
      render(data);status.textContent="";
    }catch(error){sessionStorage.removeItem(key);login.classList.remove("hidden");app.classList.add("hidden");status.textContent="ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบ Access token";input.value="";}
  }
  form.addEventListener("submit",function(event){event.preventDefault();var value=input.value.trim();if(value){sessionStorage.setItem(key,value);load(value);}});
  document.getElementById("logout").addEventListener("click",function(){sessionStorage.removeItem(key);location.reload();});
  if(token)load(token);
})();
</script>
</body>
</html>`;

