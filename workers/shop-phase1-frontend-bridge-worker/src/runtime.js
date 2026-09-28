export const SHOP_EDGE_RUNTIME = String.raw`(function(){
"use strict";
if(window.__MMD_SHOP_PHASE1_EDGE_BRIDGE_V1__)return;
window.__MMD_SHOP_PHASE1_EDGE_BRIDGE_V1__=true;
var path=(location.pathname||"").replace(/\\/+$/,"");
var shop=path==="/shop"?"shop":path==="/mmd-shop"?"mmd-shop":"";
if(!shop)return;
var cfg=shop==="shop"?{
 cartKey:"himai_shop_cart_v2",catalog:"/shop/api/products",checkout:"/shop/api/checkout",
 button:"hsCheckout",status:"hsStatus",count:"hsCount",total:"hsTotal",rows:"#hsList .hs-item",
 add:"[data-add]",remove:"[data-remove]",clear:"#hsClear",langKey:"himai_shop_lang"
}:{
 cartKey:"mmd_shop_cart",catalog:"/mmd-shop/api/products",checkout:"/mmd-shop/api/checkout",
 button:"mmdShopCheckoutBtn",status:"mmdShopCheckoutStatus",count:"mmdCartCount",total:"mmdCartTotal",rows:"#mmdCartList .mmd-cartitem",
 add:"[data-shop-add]",remove:"[data-shop-remove]",clear:"#mmdClearCart",langKey:"mmd_shop_lang"
};
var nativeFetch=window.fetch.bind(window);
var attemptKey="mmd_shop_edge_attempt_v1:"+shop;
var M={
 th:{changed:"ราคา/สต๊อกเปลี่ยนแล้ว กรุณาตรวจ Cart อีกครั้งก่อนสั่งซื้อ",pending:"มี Order เดิมที่ผลยังไม่ชัดเจน กรุณากดสั่งอีกครั้งเพื่อเช็กรายการเดิม ห้ามเริ่มรายการใหม่",load:"ตรวจราคาและสต๊อกไม่ได้ กรุณาลองใหม่",empty:"กรุณาเพิ่มสินค้าลง Cart ก่อน"},
 en:{changed:"Price or stock changed. Please review the cart before ordering.",pending:"A previous order is unresolved. Retry to check the same order; do not start a new one.",load:"Could not refresh price and stock. Please try again.",empty:"Please add an item to the cart first."},
 zh:{changed:"价格或库存已变化，请重新检查购物车后再下单。",pending:"上一笔订单结果尚未确认，请重试同一订单，不要新建订单。",load:"无法更新价格和库存，请重试。",empty:"请先将商品加入购物车。"}
};
function language(){try{var v=(localStorage.getItem(cfg.langKey)||"th").toLowerCase();return v.indexOf("zh")===0?"zh":v.indexOf("en")===0?"en":"th"}catch(_){return"th"}}
function msg(k){return(M[language()]||M.th)[k]||k}
function status(v){var e=document.getElementById(cfg.status);if(e)e.textContent=v}
function money(v){var n=Number(v);return Number.isFinite(n)?"฿"+n.toLocaleString("th-TH",{maximumFractionDigits:2}):"—"}
function readCart(){try{var x=JSON.parse(localStorage.getItem(cfg.cartKey)||"[]");return Array.isArray(x)?x:[]}catch(_){return[]}}
function writeCart(rows){try{localStorage.setItem(cfg.cartKey,JSON.stringify(rows));return true}catch(_){return false}}
function readAttempt(){try{var x=JSON.parse(sessionStorage.getItem(attemptKey)||"null");return x&&typeof x==="object"?x:null}catch(_){return{state:"storage_unavailable"}}}
function writeAttempt(x){var s=JSON.stringify(x);sessionStorage.setItem(attemptKey,s);if(sessionStorage.getItem(attemptKey)!==s)throw new Error("checkout_storage_required")}
function clearAttempt(){try{sessionStorage.removeItem(attemptKey)}catch(_){}}
function unresolved(){var a=readAttempt();return !!a&&(a.state==="sending"||a.state==="uncertain")}
function hex(bytes){return Array.from(bytes,function(b){return b.toString(16).padStart(2,"0")}).join("")}
function newKey(){if(!crypto||!crypto.getRandomValues)throw new Error("checkout_crypto_required");return"sc1_"+hex(crypto.getRandomValues(new Uint8Array(16)))}
async function digest(value){if(!crypto||!crypto.subtle)throw new Error("checkout_crypto_required");return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
function sameRows(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function renderCart(rows){
 var count=document.getElementById(cfg.count),total=document.getElementById(cfg.total);
 var qty=rows.reduce(function(s,x){return s+(Number(x.qty)||0)},0);
 var sum=rows.reduce(function(s,x){return s+(Number(x.unit_price_thb)||0)*(Number(x.qty)||0)},0);
 if(count)count.textContent=String(qty);if(total)total.textContent=sum?money(sum):"—";
 var els=Array.from(document.querySelectorAll(cfg.rows));
 els.forEach(function(row,i){var x=rows[i],small=row.querySelector("small");if(!x||!small)return;small.textContent=(shop==="shop"?(String(x.sku||"")+" · "):"")+(Number(x.qty)||1)+" · "+money(x.unit_price_thb)});
}
async function loadCatalog(){
 var r=await nativeFetch(cfg.catalog,{cache:"no-store",credentials:"include"});
 var d=await r.json().catch(function(){return null});
 if(!r.ok||!d||d.ok!==true||!Array.isArray(d.products)||d.shop!==shop)throw new Error("catalog_unavailable");
 return d.products;
}
function reconcile(rows,products){
 var by=new Map(products.map(function(p){return[p.id,p]})),out=[];
 rows.forEach(function(x){
  if(!x||!x.product_id)return;
  var p=by.get(x.product_id);
  if(!p||String(p.status||"").toLowerCase()!=="active"||p.checkout_eligible!==true||!(Number(p.selling_price_thb)>0))return;
  var q=Math.max(1,Math.min(20,Math.floor(Number(x.qty)||1)));
  if(String(p.stock_status||"").toLowerCase()==="tracked"){
   var available=Math.max(0,Math.floor(Number(p.available)||0));
   q=Math.min(q,available);
  }
  if(q<1)return;
  var n=Object.assign({},x,{product_id:p.id,name:p.product_name,sku:p.sku,unit_price_thb:Number(p.selling_price_thb),qty:q});
  if(Object.prototype.hasOwnProperty.call(x,"key"))n.key=p.id;
  if(Object.prototype.hasOwnProperty.call(x,"price"))n.price=money(p.selling_price_thb);
  out.push(n);
 });
 return out;
}
async function preflight(){
 var before=readCart();if(!before.length){status(msg("empty"));return false}
 var products;
 try{products=await loadCatalog()}catch(_){status(msg("load"));return false}
 var after=reconcile(before,products);
 if(!sameRows(before,after)){
  writeCart(after);renderCart(after);status(msg("changed"));return false;
 }
 return true;
}
function checkoutUrl(input){try{return new URL(typeof input==="string"?input:input.url,location.href)}catch(_){return null}}
window.fetch=async function(input,init){
 var u=checkoutUrl(input),method=String(init&&init.method||(typeof input!=="string"&&input.method)||"GET").toUpperCase();
 if(!u||u.pathname!==cfg.checkout||method!=="POST")return nativeFetch(input,init);
 var raw=init&&typeof init.body==="string"?init.body:"";
 var body;try{body=JSON.parse(raw)}catch(_){return nativeFetch(input,init)}
 if(!body||typeof body!=="object"||Array.isArray(body))return nativeFetch(input,init);
 var cart=readCart(),priceBy=new Map(cart.map(function(x){return[x.product_id,Number(x.unit_price_thb)]}));
 body.items=(Array.isArray(body.items)?body.items:[]).map(function(x){
  var n=Object.assign({},x),p=priceBy.get(x.product_id);if(Number.isFinite(p)&&p>0)n.expected_unit_price_thb=p;return n
 });
 var semantic=JSON.stringify(body),hash=await digest(semantic),a=readAttempt();
 if(a&&a.state==="storage_unavailable"){
  return new Response(JSON.stringify({ok:false,error:"checkout_storage_required",new_attempt_allowed:false}),{status:503,headers:{"content-type":"application/json"}});
 }
 if(a&&unresolved()&&a.hash!==hash){
  return new Response(JSON.stringify({ok:false,error:"checkout_previous_attempt_pending",order_id:a.order_id||null,new_attempt_allowed:false}),{status:409,headers:{"content-type":"application/json"}});
 }
 if(!a||a.state==="complete"||a.state==="expired")a={key:newKey(),hash:hash,state:"sending",created_at:Date.now(),order_id:null};
 else a=Object.assign({},a,{state:"sending"});
 try{writeAttempt(a)}catch(_){
  return new Response(JSON.stringify({ok:false,error:"checkout_storage_required",new_attempt_allowed:false}),{status:503,headers:{"content-type":"application/json"}});
 }
 body.checkout_key=a.key;
 var headers=new Headers(init&&init.headers||(typeof input!=="string"?input.headers:undefined)||{});
 headers.set("content-type","application/json");headers.set("idempotency-key",a.key);
 var next=Object.assign({},init||{},{method:"POST",headers:headers,body:JSON.stringify(body)});
 try{
  var response=await nativeFetch(input,next),copy=response.clone(),data=await copy.json().catch(function(){return{}});
  if(response.ok&&data&&data.ok===true){
   writeAttempt({key:a.key,hash:hash,state:"complete",created_at:a.created_at,order_id:data.order_id||null});
  }else if(data&&data.new_attempt_allowed===true)clearAttempt();
  else writeAttempt(Object.assign({},a,{state:"uncertain",order_id:data&&data.order_id||a.order_id||null}));
  return response;
 }catch(e){
  try{writeAttempt(Object.assign({},a,{state:"uncertain"}))}catch(_){}
  throw e;
 }
};
document.addEventListener("click",function(e){
 var checkout=e.target&&e.target.closest?e.target.closest("#"+cfg.button):null;
 if(checkout){
  if(checkout.dataset.mmdEdgePass==="1"){delete checkout.dataset.mmdEdgePass;return}
  e.preventDefault();e.stopImmediatePropagation();
  (async function(){
   if(!unresolved()&&!(await preflight()))return;
   if(unresolved())status(msg("pending"));
   checkout.dataset.mmdEdgePass="1";checkout.click();
  })().catch(function(){status(msg("load"))});
  return;
 }
 if(unresolved()&&e.target&&e.target.closest&&(e.target.closest(cfg.add)||e.target.closest(cfg.remove)||e.target.closest(cfg.clear))){
  e.preventDefault();e.stopImmediatePropagation();status(msg("pending"));
 }
},true);
})();`;
