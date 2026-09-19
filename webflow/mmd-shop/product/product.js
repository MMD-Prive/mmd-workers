(function(){
"use strict";
var root=document.getElementById("mmdshop-product-v1");
if(!root||root.dataset.bound==="1")return;
root.dataset.bound="1";

var endpoint=(root.dataset.productEndpoint||"/mmd-shop/api/product").replace(/\/+$/,"");
var apiBase=(root.dataset.apiBase||"").replace(/\/+$/,"");
var shopUrl=root.dataset.shopUrl||"/mmd-shop";
var cartKey=root.dataset.cartKey||"mmd_shop_cart";
var loading=root.querySelector('[data-mmdp-state="loading"]');
var ready=root.querySelector('[data-mmdp-state="ready"]');
var errorState=root.querySelector('[data-mmdp-state="error"]');
var retry=root.querySelector("[data-retry]");
var qtyOut=root.querySelector("[data-qty]");
var qtyMinus=root.querySelector("[data-qty-minus]");
var qtyPlus=root.querySelector("[data-qty-plus]");
var addButton=root.querySelector("[data-add-cart]");
var buyButton=root.querySelector("[data-buy-now]");
var purchasePanel=root.querySelector("[data-purchase-panel]");
var restrictedPanel=root.querySelector("[data-restricted-panel]");
var feedback=root.querySelector("[data-feedback]");
var toast=root.querySelector("[data-toast]");
var product=null;
var qty=1;
var loadSeq=0;

function text(sel,value){
  var el=root.querySelector(sel);
  if(el)el.textContent=value==null?"":String(value);
}
function money(value){
  var n=Number(value);
  return Number.isFinite(n)&&n>0?n.toLocaleString("th-TH")+" บาท":"สอบถามราคา";
}
function getSlug(){
  var path=location.pathname.replace(/\/+$/,"");
  var prefix="/mmd-shop/product/";
  if(path.indexOf(prefix)===0){
    var value=path.slice(prefix.length);
    if(value)return decodeURIComponent(value);
  }
  var qs=new URLSearchParams(location.search);
  return qs.get("sku")||qs.get("slug")||"";
}
function setState(name){
  if(loading)loading.hidden=name!=="loading";
  if(ready)ready.hidden=name!=="ready";
  if(errorState)errorState.hidden=name!=="error";
}
function fallbackImage(item){
  var sku=String(item&&item.sku||"").toUpperCase();
  if(sku.indexOf("WGG-")===0)return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c2bc2521dbd91c40072a0_GG%20Water%2003.webp";
  if(sku.indexOf("PPP25-")===0)return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c2de261bf62d20a6d4a9e_Pod%20Plus%20MMD.webp";
  return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c1e2f03656a00250f4531_MMD%20Shop%20Luxury%20Gift%20Box.webp";
}
function showError(title,copy){
  text("[data-error-title]",title||"เปิดรายละเอียดสินค้าไม่ได้");
  text("[data-error-copy]",copy||"กรุณากลับไปที่ MMD Shop แล้วลองอีกครั้ง");
  setState("error");
}
function stockText(item){
  if(item.stock_status==="on_demand")return {label:"สั่งแบบ On-Demand · MMD ยืนยันกับ Supplier หลังได้รับออเดอร์",className:""};
  if(item.stock_status==="tracked"){
    var available=Number(item.available);
    if(Number.isFinite(available)&&available<=0)return {label:"สินค้าหมด",className:"is-out"};
    if(item.low_stock)return {label:"เหลือน้อย",className:"is-low"};
    if(Number.isFinite(available))return {label:"พร้อมสั่ง · "+available+" ชิ้น",className:""};
  }
  return {label:"กำลังตรวจสต๊อกก่อนเปิดรับรายการ",className:""};
}
function setQty(next){
  var max=20;
  if(product&&product.stock_status==="tracked"&&Number.isFinite(Number(product.available)))max=Math.max(1,Math.min(20,Number(product.available)));
  qty=Math.max(1,Math.min(max,Number(next)||1));
  if(qtyOut)qtyOut.textContent=String(qty);
  if(qtyMinus)qtyMinus.disabled=qty<=1;
  if(qtyPlus)qtyPlus.disabled=qty>=max;
}
function render(item){
  product=item;
  var image=root.querySelector("[data-product-image]");
  if(image){
    image.src=item.image_url||fallbackImage(item);
    image.alt=item.product_name||"MMD Shop product";
  }
  text("[data-curation-label]",item.curation_label||"MMD PICK");
  text("[data-product-sku]",item.sku||"Product");
  text("[data-product-category]",item.category||"Selected");
  text("[data-product-name]",item.product_name||"MMD Shop Item");
  text("[data-product-description]",item.description||"รายละเอียดสินค้ากำลังอัปเดต");
  text("[data-product-price]",money(item.selling_price_thb));
  text("[data-curator-note]",item.curator_note||item.description||"เปอร์คัดสินค้านี้ไว้ใน MMD Shop จากคุณภาพและความเหมาะสมกับลูกค้า MMD");

  var stock=root.querySelector("[data-stock-label]");
  var stockMeta=stockText(item);
  if(stock){
    stock.textContent=stockMeta.label;
    stock.classList.remove("is-low","is-out");
    if(stockMeta.className)stock.classList.add(stockMeta.className);
  }

  var priceOk=Number(item.selling_price_thb)>0;
  var trackedOut=item.stock_status==="tracked"&&Number(item.available)<=0;
  var allowed=item.checkout_eligible===true&&priceOk&&!trackedOut;
  if(purchasePanel)purchasePanel.hidden=!allowed;
  if(restrictedPanel)restrictedPanel.hidden=allowed;
  if(!allowed&&restrictedPanel){
    var strong=restrictedPanel.querySelector("strong");
    var para=restrictedPanel.querySelector("p");
    if(item.stock_status==="untracked"){
      if(strong)strong.textContent="กำลังตรวจสต๊อกก่อนเปิดรับรายการ";
      if(para)para.textContent="MMD จะเปิดปุ่มสั่งซื้อเมื่อมี Active Inventory Batch ที่ยืนยันแล้ว";
    }else if(trackedOut){
      if(strong)strong.textContent="สินค้าหมดชั่วคราว";
      if(para)para.textContent="ยังไม่สามารถสร้าง Order สำหรับสินค้านี้ได้ในขณะนี้";
    }else if(!priceOk){
      if(strong)strong.textContent="ยังไม่เปิดราคา Online Checkout";
      if(para)para.textContent="ดูรายละเอียดได้ก่อน และติดต่อ MMD หากต้องการสอบถามรายการนี้";
    }
  }

  setQty(1);
  document.title=(item.product_name||"MMD Shop Product")+" | MMD";
  setState("ready");
}
function readCart(){
  try{
    var parsed=JSON.parse(localStorage.getItem(cartKey)||"[]");
    return Array.isArray(parsed)?parsed.filter(function(x){return x&&x.product_id;}):[];
  }catch(e){return [];}
}
function saveCart(items){
  try{localStorage.setItem(cartKey,JSON.stringify(items));return true;}catch(e){return false;}
}
function addToCart(){
  if(!product||product.checkout_eligible!==true)return false;
  var items=readCart();
  var found=items.find(function(x){return x.product_id===product.id;});
  if(found)found.qty=Math.min(20,(Number(found.qty)||0)+qty);
  else items.push({
    product_id:product.id,
    key:product.id,
    name:product.product_name,
    sku:product.sku,
    unit_price_thb:Number(product.selling_price_thb)||0,
    qty:qty
  });
  if(!saveCart(items)){
    if(feedback)feedback.textContent="อุปกรณ์นี้ไม่อนุญาตให้บันทึก Cart";
    return false;
  }
  if(feedback)feedback.textContent="เพิ่ม "+qty+" ชิ้นลง Cart แล้ว";
  if(toast){
    toast.textContent="เพิ่มลง Cart แล้ว";
    toast.classList.add("is-show");
    window.setTimeout(function(){toast.classList.remove("is-show");},1400);
  }
  return true;
}
async function load(){
  var seq=++loadSeq;
  var slug=getSlug();
  if(!slug){
    showError("ยังไม่ได้เลือกสินค้า","เปิดหน้านี้จากสินค้าบน MMD Shop หรือใช้ URL ที่มี SKU ของสินค้า");
    return;
  }
  setState("loading");
  var controller=new AbortController();
  var timer=window.setTimeout(function(){controller.abort();},10000);
  try{
    var url=apiBase+endpoint+"/"+encodeURIComponent(slug);
    var response=await fetch(url,{method:"GET",headers:{"accept":"application/json"},cache:"no-store",signal:controller.signal});
    var data=await response.json().catch(function(){return null;});
    if(seq!==loadSeq)return;
    if(response.status===404){
      showError("ไม่พบสินค้านี้","สินค้านี้อาจถูกเปลี่ยนสถานะหรือ URL ไม่ถูกต้อง");
      return;
    }
    if(!response.ok||!data||data.ok!==true||data.schema!=="mmd_shop_product_v1"||!data.product)throw new Error(data&&data.error||"product_unavailable");
    render(data.product);
  }catch(e){
    if(seq!==loadSeq)return;
    showError("เปิดรายละเอียดสินค้าไม่ได้",e&&e.name==="AbortError"?"การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองอีกครั้ง":"กรุณาลองใหม่ หรือกลับไปที่ MMD Shop");
  }finally{
    window.clearTimeout(timer);
  }
}
if(qtyMinus)qtyMinus.addEventListener("click",function(){setQty(qty-1);});
if(qtyPlus)qtyPlus.addEventListener("click",function(){setQty(qty+1);});
if(addButton)addButton.addEventListener("click",function(){addToCart();});
if(buyButton)buyButton.addEventListener("click",function(){if(addToCart())location.href=shopUrl+"#cart";});
if(retry)retry.addEventListener("click",load);
load();
})();