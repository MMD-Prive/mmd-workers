"""Generated-document Chromium tests. Network, storage and navigation are fixtures."""
from pathlib import Path
import asyncio, json, os, re, hashlib
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
HELPER=(ROOT/'webflow/shared/shop-checkout-safety.head.html').read_text()
HIMAI=(ROOT/'webflow/himai-shop/shop-v3.html').read_text()
MMD_SCRIPT=(ROOT/'webflow/mmd-shop/mmd-shop-commerce-footer.html').read_text()
MMD_SHELL='<main id="mmdshop-final"><div class="mmd-toplinks"></div><div id="mmdGrid"></div><button id="mmdCartBubble">Cart <span id="mmdCartCount">0</span></button><aside id="mmdCartDrawer"><div class="mmd-panel"><div id="mmdCartList"></div><strong id="mmdCartTotal"></strong><div class="mmd-cartactions"><button id="mmdClearCart">Clear</button><button id="mmdCopyCart">Copy</button></div></div></aside><div id="mmdToast"></div></main>'
PRODUCT={'id':'recAAAAAAAAAAAAAA','sku':'POUCH-01','product_name':'Cotton Travel Pouch','status':'active','selling_price_thb':800,'checkout_eligible':True,'stock_status':'tracked','available':5,'description':'Synthetic browser fixture'}
CART=[{'product_id':PRODUCT['id'],'name':PRODUCT['product_name'],'sku':PRODUCT['sku'],'unit_price_thb':800,'qty':1}]
RESULTS=[]

async def one(browser,shop,case):
 context=await browser.new_context(viewport={'width':390,'height':844},locale='th-TH')
 h=shop=='shop';key='himai_shop_cart_v2' if h else 'mmd_shop_cart'
 ids={'cart':'hsCart','name':'hsName','phone':'hsPhone','method':'hsMethod','checkout':'hsCheckout','status':'hsStatus','grid':'hsGrid'} if h else {'cart':'mmdCartBubble','name':'mmdShopName','phone':'mmdShopPhone','method':'mmdShopDeliveryMethod','checkout':'mmdShopCheckoutBtn','status':'mmdShopCheckoutStatus','grid':'mmdGrid'}
 state={'catalog':0,'posts':[],'orders':{},'lost':False};catalog_ready=asyncio.Event();post_ready=asyncio.Event();errors=[]
 async def server(url,options):
  if '/api/products' in url:
   state['catalog']+=1
   if case=='loading-cart' and state['catalog']==1:await catalog_ready.wait()
   if case=='retry' and state['catalog']==1:return {'status':503,'data':{'ok':True}}
   product=dict(PRODUCT)
   if case=='price-refresh' and state['catalog']>=2:product['selling_price_thb']=900
   return {'status':200,'data':{'ok':True,'shop':('mmd-shop' if h else 'shop') if case=='wrong-brand' else shop,'pricing_source':'Himai Selling Price THB' if h else 'MMD Shop Selling Price THB','products':[] if case=='empty' else [product]}}
  if '/api/checkout' in url:
   state['posts'].append({'key':options['headers'].get('idempotency-key'),'body':json.loads(options['body'])});k=state['posts'][-1]['key']
   state['orders'].setdefault(k,{'ok':True,'shop':shop,'order_id':('HIMAI-' if h else 'MMD-')+'FIXTURE','payment_url':'https://mmdbkk.com/pay/checkout?t=signed-browser-fixture','payment_ref':'shop_fixture'})
   if case=='double-click':await post_ready.wait()
   if case=='lost-response-reload' and not state['lost']:state['lost']=True;return {'network_lost':True}
   return {'status':200,'data':state['orders'][k]}
  raise AssertionError('unexpected fixture request')
 async def open_page(storage=None):
  page=await context.new_page();page.set_default_timeout(4000);page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/*',lambda route:route.abort())
  await page.expose_function('__phase1MockFetch',server)
  await page.expose_function('__phase1Hash',lambda data:list(hashlib.sha256(bytes(data)).digest()))
  storage=storage or {'local':{key:json.dumps(CART)},'session':{}}
  fixture='<script>window.__stores='+json.dumps(storage)+';function fixtureStore(data){return{getItem:k=>data[k]||null,setItem:(k,v)=>{data[k]=String(v)},removeItem:k=>{delete data[k]}}}Object.defineProperty(window,"localStorage",{configurable:true,value:fixtureStore(__stores.local)});Object.defineProperty(window,"sessionStorage",{configurable:true,value:fixtureStore(__stores.session)});window.fetch=async function(url,options){const r=await __phase1MockFetch(String(url),{method:options.method||"GET",headers:options.headers||{},body:options.body||""});if(r.network_lost)throw new Error("fixture_connection_lost");return new Response(JSON.stringify(r.data),{status:r.status,headers:{"content-type":"application/json"}})};</script>'
  fixture+='<script>if(!crypto.subtle)Object.defineProperty(crypto,"subtle",{configurable:true,value:{digest:async function(algorithm,bytes){return new Uint8Array(await __phase1Hash(Array.from(bytes))).buffer}}});</script>'
  adapter='<script>const actualSafety=window.MMDShopCheckoutSafety;window.MMDShopCheckoutSafety=Object.freeze({...actualSafety,bindFlow:config=>actualSafety.bindFlow({...config,navigate:url=>{window.__phase1Destination=url}})});</script>'
  html='<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+fixture+HELPER+adapter+'</head><body>'+(HIMAI if h else MMD_SHELL+MMD_SCRIPT)+'</body></html>'
  await page.set_content(html,wait_until='domcontentloaded')
  return page
 try:
  page=await open_page()
  if case=='loading-cart':
   await page.locator('#'+ids['cart']).click();assert len(await page.evaluate('JSON.parse(localStorage.getItem('+json.dumps(key)+'))'))==1
   catalog_ready.set();await page.wait_for_function('document.querySelector("#'+ids['grid']+' article")!==null');assert len(await page.evaluate('JSON.parse(localStorage.getItem('+json.dumps(key)+'))'))==1
  elif case in ['empty','retry','wrong-brand']:
   await page.wait_for_timeout(150)
   if case=='empty':assert (await page.locator('#'+ids['grid']).inner_text()).strip();assert await page.locator('#'+ids['grid']+' article').count()==0
   elif case=='retry':await page.locator('#'+ids['grid']+' button').click();await page.wait_for_function('document.querySelector("#'+ids['grid']+' article")!==null')
   else:assert await page.locator('#'+ids['grid']+' button').count()==1;assert len(await page.evaluate('JSON.parse(localStorage.getItem('+json.dumps(key)+'))'))==1
   assert not state['posts']
  else:
   await page.wait_for_function('document.querySelector("#'+ids['grid']+' article")!==null')
   await page.locator('#'+ids['cart']).click();await page.locator('#'+ids['name']).fill('Fixture Buyer');await page.locator('#'+ids['phone']).fill('1' if case=='invalid-contact' else '0800000000');await page.locator('#'+ids['method']).select_option('pickup')
   if case=='double-click':
    await page.evaluate('document.querySelector("#'+ids['checkout']+'").click();document.querySelector("#'+ids['checkout']+'").click()');await page.wait_for_timeout(250);assert len(state['posts'])==1;post_ready.set()
   else:await page.locator('#'+ids['checkout']).click()
   if case=='price-refresh':
    await page.wait_for_timeout(250);assert not state['posts'];stored=await page.evaluate('JSON.parse(localStorage.getItem('+json.dumps(key)+'))');assert stored[0]['unit_price_thb']==900;await page.locator('#'+ids['checkout']).click()
   elif case=='lost-response-reload':
    await page.wait_for_timeout(250);assert len(state['posts'])==1;storage=await page.evaluate('window.__stores');await page.close();page=await open_page(storage);await page.wait_for_function('document.querySelector("#'+ids['grid']+' article")!==null');await page.locator('#'+ids['cart']).click();await page.locator('#'+ids['checkout']).click()
   if case=='invalid-contact':await page.wait_for_timeout(150);assert not state['posts'];assert await page.locator('#'+ids['status']).inner_text()
   else:
    await page.wait_for_function('window.__phase1Destination!==undefined');assert await page.evaluate('window.__phase1Destination')=='https://mmdbkk.com/pay/checkout?t=signed-browser-fixture';assert len(state['orders'])==1
    if case=='lost-response-reload':assert len(state['posts'])==2;assert state['posts'][0]==state['posts'][1]
    assert re.fullmatch(r'sc1_[a-f0-9]{32}',state['posts'][0]['key']);assert await page.evaluate('JSON.parse(localStorage.getItem('+json.dumps(key)+'))')==[]
  assert not errors,errors
  RESULTS.append({'shop':shop,'case':case,'passed':True})
 except Exception as e:RESULTS.append({'shop':shop,'case':case,'passed':False,'error':str(e)[:500],'page_errors':errors,'post_count':len(state['posts'])})
 finally:catalog_ready.set();post_ready.set();await context.close()

async def main():
 async with async_playwright() as p:
  launch={'headless':True,'args':['--no-sandbox']}
  if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  browser=await p.chromium.launch(**launch)
  for shop in ['shop','mmd-shop']:
   for case in ['loading-cart','price-refresh','double-click','lost-response-reload','empty','retry','wrong-brand','invalid-contact']:await one(browser,shop,case)
  await browser.close()
 out={'schema':'shop_phase1_browser_regression_v1','environment':'Chromium generated documents; network/storage/navigation fixtures and SHA-256 bridge for the non-secure generated document; no production access','himai_markup':'actual repository storefront embed','mmd_markup':'DOM-contract fixture with actual repository scripts','results':RESULTS,'passed':sum(x['passed'] for x in RESULTS),'failed':sum(not x['passed'] for x in RESULTS),'source_sha256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['webflow/himai-shop/shop-v3.html','webflow/mmd-shop/mmd-shop-commerce-footer.html','webflow/shared/shop-checkout-safety.js']}}
 path=Path(os.environ.get('SHOP_BROWSER_REPORT','shop-phase1-browser-report.json'));path.write_text(json.dumps(out,indent=2));print(json.dumps({'passed':out['passed'],'failed':out['failed'],'report':str(path)}))
 if out['failed']:raise SystemExit(1)
if __name__=='__main__':asyncio.run(main())
