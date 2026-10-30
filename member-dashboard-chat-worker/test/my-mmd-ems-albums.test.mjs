import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {emsAlbumsPage,isEmsAlbumQuestion,isEmsAlbumsPage,EMS_ALBUMS_URL} from '../src/my-mmd-ems-albums.mjs';
import {createLineSignature} from "../src/index.js";
import {resolveKenjiSeedDecision,handleKenjiSeedLineRequest} from '../src/kenji-seed-line-runtime.mjs';
test('customer album request returns direct button and no entitlement claims',async()=>{const r=await resolveKenjiSeedDecision({type:'message',source:{type:'user'},message:{type:'text',text:'ขอดูอัลบั้ม EMS ได้มั้ยครับ'}});assert.equal(r.reply_button.uri,EMS_ALBUMS_URL);assert.doesNotMatch(r.text,/VIP|ดูได้ครบ|ทุกคน/);assert.equal(r.reply_source,'my_mmd_ems_albums_v1')});
test('specific bounded EMS intent',()=>{assert.equal(isEmsAlbumQuestion('EMS album'),true);assert.equal(isEmsAlbumQuestion('ขอดู EMS'),true);assert.equal(isEmsAlbumQuestion('EMS ส่งพัสดุ'),false);assert.equal(isEmsAlbumQuestion('ขอดูอัลบั้มคนอื่น'),false)});
test('index/detail retain login return and render valid script',async()=>{for(const path of ['/my-mmd/ems','/my-mmd/ems/ems16-123456789abc']){const request=new Request('https://www.mmdbkk.com'+path);assert.equal(isEmsAlbumsPage(request),true);const response=emsAlbumsPage(request);const html=await response.text();assert.match(html,/miniapp.line.me/);assert.match(html,/view=ems_albums/);assert.match(html,/data\.photos/);const script=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];new vm.Script(script);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/)}});

for (const mode of ["send", "takeover", "stop", "redelivery"]) test(`signed recheck delivery boundary: ${mode}`, async () => {
  const f = {env:{AIRTABLE_API_KEY:"test",AIRTABLE_BASE_ID:"test"}}; let sent = 0, runtimeReads = 0;
  const env = { ...f.env, LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test-token", INTERNAL_TOKEN: "test-internal",
    LINE_AUTO_REPLY_ENABLED: "true", LINE_KENJI_AI_ENABLED: "true", KENJI_LINE_CONTINUITY_ENABLED: "true",
    ADMIN_WORKER: { fetch: async () => { runtimeReads++; return Response.json({ ok: true, controls: { line_oa_auto_reply: mode === "stop" && runtimeReads > 1, all_kenji_mutations: false } }); } } };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api.line.me") { sent++; const message=(await request.json()).messages[0]; assert.equal(message.quickReply.items[0].action.uri, EMS_ALBUMS_URL); return Response.json({}); }
    assert.equal(url.hostname, "api.airtable.com");
    if (request.method !== "GET") return Response.json({ id: "telemetry", records: [] });
    if ((url.searchParams.get("filterByFormula") || "").includes("processing")) return Response.json({ records: mode === "takeover" ? [{ id: "owner" }] : [] });
    if (url.pathname.endsWith("tblS6iRgPjYLBqZJh")) return Response.json({ records: [] });
    return Response.json({ records: [] });
  };
  try {
    const raw = JSON.stringify({ events: [{ type:"message",source:{type:"user",userId:"U"+"a".repeat(32)},message:{type:"text",text:"ขอดูอัลบั้ม EMS ได้มั้ยครับ"}, mode: "active", replyToken: "test-reply", deliveryContext: { isRedelivery: mode === "redelivery" } }] });
    const request = new Request("https://mmdbkk.com/webhooks/line", { method: "POST", body: raw, headers: { "x-line-signature": await createLineSignature(raw, env.LINE_CHANNEL_SECRET) } });
    const response = await handleKenjiSeedLineRequest(request, env, {}, { fetch: async () => Response.json({ saved: [{}] }) });
    assert.equal(response.status, 200);
    assert.equal(sent, mode === "send" ? 1 : 0);
  } finally { globalThis.fetch = original; }
});
test('login uses registered MINI App and preserves album identifier',async()=>{
 const path='/my-mmd/ems/ems23-b2854abc264c';const html=await emsAlbumsPage(new Request('https://www.mmdbkk.com'+path)).text();
 const script=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
 let click, destination;
 const node={hidden:false,textContent:'',addEventListener(type,handler){click=handler}};
 const context={document:{getElementById:()=>node},location:{assign:url=>destination=url},fetch:async()=>Response.json({ok:false},{status:401})};
 vm.runInNewContext(script,context);await new Promise(setImmediate);click();
 assert.equal(destination,'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=ems_albums&album=ems23-b2854abc264c');
 assert.doesNotMatch(html,/liff.login|sdk.js/);
});
