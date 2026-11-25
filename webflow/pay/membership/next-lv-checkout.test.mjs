import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const html=fs.readFileSync(new URL("./next-lv-footer.html",import.meta.url),"utf8");
const js=html.split("<script>")[1].split("</script>")[0];
const codes=["mmd_member","elite","red_card"];
const packageFor=(package_code,duration_days=package_code==="mmd_member"?365:730)=>({package_code,duration_days,amount_thb:[690,4990,11499][codes.indexOf(package_code)]});
const flush=()=>new Promise(setImmediate);
async function run(code,{url="/pay/checkout?t=fixture",days=730,orderDays=730,error,statusCode=200,hostname="www.mmdbkk.com",catalogFailure=false,click=true}={}){
  const requests=[], navigations=[], catalogRequests=[];
  const buttons=codes.map(c=>({dataset:{buyPackage:c},setAttribute(){},addEventListener(_event,fn){this.click=fn;}}));
  const status={setAttribute(){},removeAttribute(){},append(){},focus(){}},note={hidden:true};
  const root={dataset:{},classList:{add(){}},getAttribute(){return null;},querySelector(s){return s==="[data-public-status]"?status:s==="[data-red-note]"?note:null;},querySelectorAll(s){return s==="[data-buy-package]"?buttons:[];}};
  const outer={querySelector:()=>root};
  const document={getElementById:id=>id==="mmd-public-membership"?outer:null,querySelector:()=>null,createElement:()=>({}),createTextNode:()=>({})};
  vm.runInNewContext(js,{document,URL,URLSearchParams,window:{},location:{hostname,search:"",assign:u=>navigations.push(u)},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},fetch:async(path,opts)=>{
    if(path.endsWith("/catalog")){catalogRequests.push({path,credentials:opts.credentials});if(catalogFailure)throw Error("fixture catalog failure");return {ok:true,json:async()=>({ok:true,packages:codes.map(c=>packageFor(c,c==="red_card"?days:undefined))})};}
    requests.push(JSON.parse(opts.body));
    return {ok:statusCode===200,status:statusCode,json:async()=>error?{ok:false,error:{code:error}}:{ok:true,redirect_to:url,package:packageFor(code,orderDays)}};
  }});
  await flush();
  if(click)buttons[codes.indexOf(code)].click();
  await flush();
  return {requests,navigations,buttons,status,note,catalogRequests};
}
for(const code of codes)test(code+" accepts backend signed checkout",async()=>{
  const r=await run(code);
  assert.deepEqual(r.requests,[{package_code:code}]);
  assert.deepEqual(r.navigations,["https://mmdbkk.com/pay/checkout?t=fixture"]);
});
for(const url of ["https://other.example/pay/checkout?t=x","https://www.mmdbkk.com/pay/checkout?t=x","http://mmdbkk.com/pay/checkout?t=x","https://u@mmdbkk.com/pay/checkout?t=x","https://mmdbkk.com:8443/pay/checkout?t=x","/sigil/pay?t=x","/pay/checkout?t=x&t=y","/pay/checkout?t=x&amount=1","/pay/checkout?t=x#x","/pay/checkout?t=%20"])
  test("rejects "+url,async()=>assert.deepEqual((await run("elite",{url})).navigations,[]));
test("does not start 365-day Red Card",async()=>{const r=await run("red_card",{days:365});assert.deepEqual(r.requests,[]);assert.equal(r.note.hidden,false);});
test("does not open mismatched Red Card checkout",async()=>{const r=await run("red_card",{orderDays:365});assert.deepEqual(r.navigations,[]);assert.equal(r.buttons[2].disabled,true);});
test("Red Card identity gate and prior proof stay in place",async()=>{for(const error of ["RED_CARD_ACCOUNT_VERIFICATION_REQUIRED","red_card_order_proof_already_received"]){const r=await run("red_card",{error,statusCode:409});assert.deepEqual(r.navigations,[]);assert.match(r.status.textContent,/ยืนยันบัญชี|ได้รับหลักฐาน/);}});
test("Member LINE handoff preserves package",async()=>{const r=await run("mmd_member",{error:"LINE_SESSION_REQUIRED",statusCode:401});assert.equal(new URL(r.navigations[0]).searchParams.get("return_to"),"/pay/membership?package=mmd_member");});

test("staging reads catalog without credentials and leaves checkout relative",async()=>{const r=await run("red_card",{hostname:"mmdprive.webflow.io",click:false});assert.equal(r.catalogRequests[0].path,"https://mmdbkk.com/member/api/liff/public-membership/catalog");assert.equal(r.catalogRequests[0].credentials,"omit");assert.equal(r.buttons[2].disabled,false);assert.deepEqual(r.requests,[]);});
test("failed staging catalog disables Red Card and keeps two-year fallback",async()=>{const r=await run("red_card",{hostname:"mmdprive.webflow.io",catalogFailure:true});assert.equal(r.buttons[2].disabled,true);assert.deepEqual(r.requests,[]);const redMarkup=html.match(/<article class="lv-card lv-red_card"[\s\S]*?<\/article>/)[0];assert.match(redMarkup,/data-card-term>2 ปี/);assert.match(redMarkup,/479 THB \/ เดือน/);assert.match(redMarkup,/data-buy-package="red_card" disabled/);});
test("production catalog retains relative authenticated read",async()=>{const r=await run("red_card",{click:false});assert.equal(r.catalogRequests[0].path,"/member/api/liff/public-membership/catalog");assert.equal(r.catalogRequests[0].credentials,"include");});
