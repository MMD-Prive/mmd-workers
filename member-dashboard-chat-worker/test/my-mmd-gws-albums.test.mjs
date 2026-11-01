import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import gate from '../src/my-mmd-lovable-app-front-gate.js';
import {handleLiffMemberShell} from '../../member-pages-worker/src/liff-member-shell.js';
import {gwsAlbumsPage,isGwsAlbumQuestion,isGwsAlbumsPage,GWS_ALBUMS_URL} from '../src/my-mmd-gws-albums.mjs';
import {createLineSignature} from "../src/index.js";
import {resolveKenjiSeedDecision,handleKenjiSeedLineRequest} from '../src/kenji-seed-line-runtime.mjs';
test('GWs login bridge resumes its album, index or safe fallback on the current LINE shell',async()=>{
 for(const [album,target] of [['','/my-mmd/gws'],['gws1-123456789abc','/my-mmd/gws/gws1-123456789abc'],['https://evil.example','/my-mmd/gws']]){
 const r=await gate.fetch(new Request('https://www.mmdbkk.com/member/liff?intent=status&view=gws_albums&album='+encodeURIComponent(album)),{MEMBER_PAGES_WORKER:{fetch:req=>handleLiffMemberShell(req,{})}});
 assert.equal(r.headers.get('x-mmd-liff-return-target'),target);const html=await r.text();assert.match(html,/fetch\('\/api\/member\/app\/gws-albums'/);assert.ok(html.includes('const target='+JSON.stringify(target)));
 }
});
test('customer album request returns direct button and no entitlement claims',async()=>{const r=await resolveKenjiSeedDecision({type:'message',source:{type:'user'},message:{type:'text',text:'ขอดูอัลบั้ม GWS ได้มั้ยครับ'}});assert.equal(r.reply_button.uri,GWS_ALBUMS_URL);assert.doesNotMatch(r.text,/VIP|ดูได้ครบ|ทุกคน/);assert.equal(r.reply_source,'my_mmd_gws_albums_v1')});
test('specific bounded GWS intent',()=>{assert.equal(isGwsAlbumQuestion('GWS album'),true);assert.equal(isGwsAlbumQuestion('ขอดู GWS'),true);assert.equal(isGwsAlbumQuestion('GWS ส่งพัสดุ'),false);assert.equal(isGwsAlbumQuestion('ขอดูอัลบั้มคนอื่น'),false)});
test('index/detail retain login return and render valid script',async()=>{for(const path of ['/my-mmd/gws','/my-mmd/gws/gws16-123456789abc']){const request=new Request('https://www.mmdbkk.com'+path);assert.equal(isGwsAlbumsPage(request),true);const response=gwsAlbumsPage(request);const html=await response.text();assert.match(html,/miniapp.line.me/);assert.ok(html.includes('"kind":"gws"'));assert.match(html,/data\.photos/);const script=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];new vm.Script(script);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/)}});

for (const mode of ["send", "takeover", "stop", "redelivery"]) test(`signed recheck delivery boundary: ${mode}`, async () => {
  const f = {env:{AIRTABLE_API_KEY:"test",AIRTABLE_BASE_ID:"test"}}; let sent = 0, runtimeReads = 0;
  const env = { ...f.env, LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test-token", INTERNAL_TOKEN: "test-internal",
    LINE_AUTO_REPLY_ENABLED: "true", LINE_KENJI_AI_ENABLED: "true", KENJI_LINE_CONTINUITY_ENABLED: "true",
    ADMIN_WORKER: { fetch: async () => { runtimeReads++; return Response.json({ ok: true, controls: { line_oa_auto_reply: mode === "stop" && runtimeReads > 1, all_kenji_mutations: false } }); } } };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api.line.me") { sent++; const message=(await request.json()).messages[0]; assert.equal(message.quickReply.items[0].action.uri, GWS_ALBUMS_URL); return Response.json({}); }
    assert.equal(url.hostname, "api.airtable.com");
    if (request.method !== "GET") return Response.json({ id: "telemetry", records: [] });
    if ((url.searchParams.get("filterByFormula") || "").includes("processing")) return Response.json({ records: mode === "takeover" ? [{ id: "owner" }] : [] });
    if (url.pathname.endsWith("tblS6iRgPjYLBqZJh")) return Response.json({ records: [] });
    return Response.json({ records: [] });
  };
  try {
    const raw = JSON.stringify({ events: [{ type:"message",source:{type:"user",userId:"U"+"a".repeat(32)},message:{type:"text",text:"ขอดูอัลบั้ม GWS ได้มั้ยครับ"}, mode: "active", replyToken: "test-reply", deliveryContext: { isRedelivery: mode === "redelivery" } }] });
    const request = new Request("https://mmdbkk.com/webhooks/line", { method: "POST", body: raw, headers: { "x-line-signature": await createLineSignature(raw, env.LINE_CHANNEL_SECRET) } });
    const response = await handleKenjiSeedLineRequest(request, env, {}, { fetch: async () => Response.json({ saved: [{}] }) });
    assert.equal(response.status, 200);
    assert.equal(sent, mode === "send" ? 1 : 0);
  } finally { globalThis.fetch = original; }
});
test('login uses registered MINI App and preserves album identifier',async()=>{
 const path='/my-mmd/gws/gws23-b2854abc264c';const html=await gwsAlbumsPage(new Request('https://www.mmdbkk.com'+path)).text();
 const script=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
 let click, destination;
 const nodes=new Map(); const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',value:'',children:[],append(...els){this.children.push(...els)},replaceChildren(...els){this.children=els},setAttribute(){},addEventListener(type,handler){if(id==='login'&&type==='click')click=handler}});return nodes.get(id)};
 const context={document:{body:{classList:{add(){},remove(){}}},getElementById:get,createElement:()=>({setAttribute(){}})},location:{assign:url=>destination=url},fetch:async()=>Response.json({ok:false},{status:401})};
 vm.runInNewContext(script,context);await new Promise(setImmediate);click();
 assert.equal(destination,'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=gws_albums&album=gws23-b2854abc264c');
 assert.doesNotMatch(html,/liff.login|sdk.js/);
});
