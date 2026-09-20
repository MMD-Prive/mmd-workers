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
var variantWrap=root.querySelector("[data-variant-wrap]");
var variantSelect=root.querySelector("[data-variant-select]");
var variantLabel=root.querySelector("[data-variant-label]");
var product=null;
var variants=[];
var qty=1;
var loadSeq=0;

function i18n(){return window.MMDShopI18n||null}
function t(key,vars){
  var x=i18n();
  if(x&&typeof x.t==="function")return x.t(key,vars);
  var fallback={
    ask_price:"สอบถามราคา",stockOnDemand:"สั่งแบบ On-Demand · MMD ยืนยันกับ Supplier หลังได้รับออเดอร์",
    stockOut:"สินค้าหมด",stockLow:"เหลือน้อย",stockReady:"พร้อมสั่ง · "+(vars&&vars.n||0)+" ชิ้น",
    stockChecking:"กำลังตรวจสต๊อกก่อนเปิดรับรายการ",variantSize:"เลือกขนาด",variantFlavour:"เลือก Flavour",
    stockUntrackedTitle:"กำลังตรวจสต๊อกก่อนเปิดรับรายการ",stockUntrackedCopy:"พอมีสต๊อกจริงที่ยืนยันแล้ว ปุ่มสั่งจะเปิดให้เองครับ",
    outStock:"สินค้าหมดชั่วคราว",stockOutCopy:"ตอนนี้ยังรับออเดอร์ชิ้นนี้ไม่ได้ครับ",priceClosed:"ยังไม่เปิดราคา Online Checkout",
    priceClosedCopy:"ดูรายละเอียดได้ก่อน ถ้าอยากถามเพิ่มคุยกับ MMD ได้ครับ",productRestricted:"ชิ้นนี้ยังไม่เปิดให้กดสั่งออนไลน์ครับ",
    productRestrictedCopy:"ดูรายละเอียดได้ก่อน ถ้าพร้อมเมื่อไร MMD จะเปิดปุ่มสั่งให้ตามสถานะจริง",cartStorage:"อุปกรณ์นี้ไม่อนุญาตให้บันทึก Cart",
    cartSaved:"เพิ่ม "+(vars&&vars.n||0)+" ชิ้นลง Cart แล้ว",addedCart:"เพิ่มลง Cart แล้ว",noProduct:"ยังไม่ได้เลือกสินค้า",
    noProductCopy:"เปิดหน้านี้จากสินค้าบน MMD Shop หรือใช้ URL ที่มี SKU ของสินค้า",productNotFound:"ไม่พบสินค้านี้",
    productNotFoundCopy:"สินค้านี้อาจถูกเปลี่ยนสถานะหรือ URL ไม่ถูกต้อง",productLoadError:"เปิดรายละเอียดสินค้าไม่ได้",
    productLoadErrorCopy:"กรุณาลองใหม่ หรือกลับไปที่ MMD Shop",timeout:"การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองอีกครั้ง"
  };
  return fallback[key]||key;
}
function money(value){
  var x=i18n();
  if(x&&typeof x.money==="function")return x.money(value);
  var n=Number(value);
  return Number.isFinite(n)&&n>0?n.toLocaleString("th-TH")+" บาท":"สอบถามราคา";
}
function text(sel,value){
  var el=root.querySelector(sel);
  if(el)el.textContent=value==null?"":String(value);
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
  if(sku.indexOf("GLEN-POP")===0)return "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a8a7881b18c863ef26b9b64_Shop%20Pop%20Plus.webp";
  return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c1e2f03656a00250f4531_MMD%20Shop%20Luxury%20Gift%20Box.webp";
}
function showError(title,copy){
  text("[data-error-title]",title||t("productLoadError"));
  text("[data-error-copy]",copy||t("productLoadErrorCopy"));
  setState("error");
  if(i18n())i18n().apply(root);
}
function stockText(item){
  if(item.stock_status==="on_demand")return {label:t("stockOnDemand"),className:""};
  if(item.stock_status==="tracked"){
    var available=Number(item.available);
    if(Number.isFinite(available)&&available<=0)return {label:t("stockOut"),className:"is-out"};
    if(item.low_stock)return {label:t("stockLow"),className:"is-low"};
    if(Number.isFinite(available))return {label:t("stockReady",{n:available}),className:""};
  }
  return {label:t("stockChecking"),className:""};
}
function setQty(next){
  var max=20;
  if(product&&product.stock_status==="tracked"&&Number.isFinite(Number(product.available))){
    max=Math.max(1,Math.min(20,Number(product.available)));
  }
  qty=Math.max(1,Math.min(max,Number(next)||1));
  if(qtyOut)qtyOut.textContent=String(qty);
  if(qtyMinus)qtyMinus.disabled=qty<=1;
  if(qtyPlus)qtyPlus.disabled=qty>=max;
}
function variantOptionLabel(item){
  var label=item.variant_value||item.sku||"Variant";
  return label+" · "+money(item.selling_price_thb);
}
function renderVariantControl(){
  if(!variantWrap||!variantSelect)return;
  var available=Array.isArray(variants)?variants.filter(function(x){return x&&x.id;}):[];
  if(!product||!product.variant_group||available.length<=1){
    variantWrap.hidden=true;
    variantSelect.innerHTML="";
    return;
  }
  variantWrap.hidden=false;
  if(variantLabel)variantLabel.textContent=product.variant_type==="flavour"?t("variantFlavour"):t("variantSize");
  variantSelect.innerHTML=available.map(function(item){
    return '<option value="'+String(item.id).replace(/"/g,"&quot;")+'">'+variantOptionLabel(item)+'</option>';
  }).join("");
  variantSelect.value=product.id;
}
function updateVariantUrl(item){
  if(!item||!item.product_url)return;
  try{
    var u=new URL(location.href);
    u.pathname=item.product_url;
    u.searchParams.delete("sku");
    u.searchParams.delete("slug");
    history.replaceState(history.state,"",u.pathname+u.search+u.hash);
  }catch(_){}
}
function render(item,options){
  options=options||{};
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
  text("[data-product-description]",item.description||"");
  text("[data-product-price]",money(item.selling_price_thb));
  text("[data-curator-note]",item.curator_note||item.description||"");

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
      if(strong)strong.textContent=t("stockUntrackedTitle");
      if(para)para.textContent=t("stockUntrackedCopy");
    }else if(trackedOut){
      if(strong)strong.textContent=t("outStock");
      if(para)para.textContent=t("stockOutCopy");
    }else if(!priceOk){
      if(strong)strong.textContent=t("priceClosed");
      if(para)para.textContent=t("priceClosedCopy");
    }else{
      if(strong)strong.textContent=t("productRestricted");
      if(para)para.textContent=t("productRestrictedCopy");
    }
  }

  renderVariantControl();
  if(options.resetQty===false)setQty(qty);else setQty(1);
  document.title=(item.product_name||"MMD Shop Product")+" | MMD";
  setState("ready");
  if(i18n())i18n().apply(root);
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
  var max=20;
  if(product.stock_status==="tracked"&&Number.isFinite(Number(product.available)))max=Math.max(0,Math.min(20,Number(product.available)));
  if(max<=0)return false;
  var target=Math.min(max,(found?Number(found.qty)||0:0)+qty);
  if(found)found.qty=target;
  else items.push({
    product_id:product.id,
    key:product.id,
    name:product.product_name,
    sku:product.sku,
    unit_price_thb:Number(product.selling_price_thb)||0,
    qty:Math.min(qty,max)
  });
  if(!saveCart(items)){
    if(feedback)feedback.textContent=t("cartStorage");
    return false;
  }
  if(feedback)feedback.textContent=t("cartSaved",{n:Math.min(qty,max)});
  if(toast){
    toast.textContent=t("addedCart");
    toast.classList.add("is-show");
    window.setTimeout(function(){toast.classList.remove("is-show");},1400);
  }
  return true;
}
async function load(){
  var seq=++loadSeq;
  var slug=getSlug();
  if(!slug){
    showError(t("noProduct"),t("noProductCopy"));
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
      showError(t("productNotFound"),t("productNotFoundCopy"));
      return;
    }
    if(!response.ok||!data||data.ok!==true||data.schema!=="mmd_shop_product_v1"||!data.product){
      throw new Error(data&&data.error||"product_unavailable");
    }
    variants=Array.isArray(data.variants)&&data.variants.length?data.variants:[data.product];
    render(data.product,{resetQty:true});
  }catch(e){
    if(seq!==loadSeq)return;
    showError(t("productLoadError"),e&&e.name==="AbortError"?t("timeout"):t("productLoadErrorCopy"));
  }finally{
    window.clearTimeout(timer);
  }
}
if(qtyMinus)qtyMinus.addEventListener("click",function(){setQty(qty-1);});
if(qtyPlus)qtyPlus.addEventListener("click",function(){setQty(qty+1);});
if(addButton)addButton.addEventListener("click",function(){addToCart();});
if(buyButton)buyButton.addEventListener("click",function(){if(addToCart()){var suffix=i18n()?"?lang="+encodeURIComponent(i18n().lang):"";location.href=shopUrl+suffix+"#cart";}});
if(retry)retry.addEventListener("click",load);
if(variantSelect)variantSelect.addEventListener("change",function(){
  var selected=variants.find(function(item){return item.id===variantSelect.value;});
  if(!selected||selected.id===(product&&product.id))return;
  render(selected,{resetQty:true});
  updateVariantUrl(selected);
  if(feedback)feedback.textContent="";
});
document.addEventListener("mmd:shop-language-change",function(){
  if(product)render(product,{resetQty:false});
});
load();
})();
