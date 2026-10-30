import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
const { renderBookingModelsPage, bookingModelsCopy: copy } = await import(process.env.BOOKING_MODELS_PAGE_MODULE || "./src/booking-models-page.js");
const { parseHTML } = await import(process.env.BOOKING_MODELS_DOM_MODULE || "/tmp/booking-models-dom/node_modules/linkedom/esm/index.js");

const item = {model_id:"recFixture000001",name:"Leo Test",code:"LT01",height_cm:180,weight_kg:75,offers_public:true,offers_private:false,public_profile_allowed:true,private_profile_allowed:false,cover_status:"missing",cover_media_id:"",reasons:["missing_cover"],body_type:"athletic",skin_tone:"tan"};
async function flush(){for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));}
function setup(t, handler) {
 const {document,window}=parseHTML(renderBookingModelsPage("fixture-nonce"));
 const originals = ["document","window"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 Object.defineProperty(globalThis,"document",{configurable:true,value:document});Object.defineProperty(globalThis,"window",{configurable:true,value:window});
 t.after(()=>{for(const [key,descriptor] of originals) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const dialog=document.getElementById("model-detail");dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 const setSelect=(id,value)=>{const select=document.getElementById(id);Object.defineProperty(select,"value",{configurable:true,writable:true,value});};
 setSelect("audience","all");setSelect("attention","all");
 document.getElementById("query").value="";
 document.getElementById("model-search").reset=()=>{document.getElementById("query").value="";setSelect("audience","all");setSelect("attention","all");};
 const calls=[];t.mock.method(globalThis,"fetch",async(input,init)=>{calls.push({input,init});return handler(input,init,calls.length);});
 // Execute the script actually delivered in HTML, including when the server module is bundled.
 const inline = document.querySelector("script").textContent;
 runInNewContext(inline, {document,window,fetch:globalThis.fetch,AbortController,URLSearchParams,setTimeout,clearTimeout,Error});
 const event=(id,type)=>document.getElementById(id).dispatchEvent(new window.Event(type,{cancelable:true,bubbles:true}));
 return {document,window,event,calls,setSelect};
}

test("search renders safe text, useful detail and an existing admin review link",async t=>{
 const u=setup(t,async()=>Response.json({ok:true,items:[{...item,name:'<img src=x onerror=alert(1)>'}],next_cursor:null,media_status:"available"}));
 await flush();assert.equal(u.document.querySelectorAll("article.model").length,1);assert.equal(u.document.querySelectorAll("img").length,0);
 assert.equal(u.document.querySelector("h2").textContent,'<img src=x onerror=alert(1)>');
 u.document.querySelector("article button").click();assert.equal(u.document.getElementById("model-detail").open,true);
 assert.ok(u.document.getElementById("detail-content").textContent.includes(copy.reasons.missing_cover));
 assert.equal(u.document.querySelector("#detail-content a").getAttribute("href"),"/internal/admin/mmd-review");
 u.event("close-detail","click");assert.equal(u.document.getElementById("detail-content").children.length,0);
});
test("query, filters and pagination reach the API; expired sessions clear profiles and hide pagination",async t=>{
 let mode="ok";
 const u=setup(t,async()=>mode==="expired"?Response.json({}, {status:401}):Response.json({ok:true,items:[item],next_cursor:"itrNext/recNext",media_status:"available"}));
 await flush();u.document.getElementById("query").value="ลีโอ LT01";u.event("model-search","submit");await flush();
 assert.equal(new URL(u.calls.at(-1).input,"https://mmdbkk.com").searchParams.get("q"),"ลีโอ LT01");
 u.setSelect("audience","private");u.event("audience","change");await flush();
 assert.equal(new URL(u.calls.at(-1).input,"https://mmdbkk.com").searchParams.get("audience"),"private");
 u.event("load-more","click");await flush();assert.equal(new URL(u.calls.at(-1).input,"https://mmdbkk.com").searchParams.get("cursor"),"itrNext/recNext");
 mode="expired";u.event("model-search","submit");await flush();assert.equal(u.document.querySelectorAll("article.model").length,0);
 assert.equal(u.document.getElementById("load-more").hidden,true);assert.ok(u.document.querySelector("#model-results a").getAttribute("href").startsWith("/internal/admin/login?"));
 assert.ok(u.calls.every(call=>call.init.credentials==="same-origin" && call.init.cache==="no-store"));
});
test("late search results cannot replace a newer search",async t=>{
 let resolveOld;const old=new Promise(resolve=>resolveOld=resolve);
 const u=setup(t,async(input,init,n)=>n===1?old:Response.json({ok:true,items:[{...item,name:"New query"}],next_cursor:null}));
 await flush();u.document.getElementById("query").value="new";u.event("model-search","submit");await flush();
 resolveOld(Response.json({ok:true,items:[{...item,name:"Old query"}],next_cursor:null}));await flush();
 assert.equal(u.document.querySelector("article h2").textContent,"New query");
});
test("an empty filtered page retains load-more and media lookup failure is explained",async t=>{
 const u=setup(t,async()=>Response.json({ok:true,items:[],next_cursor:"itrNext/recNext",media_status:"unavailable"}));
 await flush();assert.equal(u.document.getElementById("load-more").hidden,false);assert.equal(u.document.getElementById("media-warning").hidden,false);
 assert.ok(u.document.getElementById("media-warning").textContent.includes(copy.mediaDegraded));
 u.event("clear","click");await flush();assert.equal(new URL(u.calls.at(-1).input,"https://mmdbkk.com").searchParams.get("q"),"");
});
