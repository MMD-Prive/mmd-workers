import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { myMmdSessionPanel } from "../src/my-mmd-session-panel.js";

async function render(search, response) {
  const nodes = Object.fromEntries(["status", "summary", "eta", "login"].map(key => [key, {textContent:"",hidden:true,href:""}]));
  const panel = {hidden:true,querySelector(selector) {return nodes[selector.match(/data-session-(\w+)/)[1]];}};
  const calls = [];
  const script = myMmdSessionPanel().match(/<script[^>]*>([\s\S]*)<\/script>/)[1];
  runInNewContext(script, {
    document:{getElementById:() => panel}, location:{search}, URLSearchParams, encodeURIComponent,
    async fetch(url, options) {calls.push({url,options});return response;},
  });
  await new Promise(resolve => setImmediate(resolve));
  return {nodes,panel,calls};
}

test("MY MMD reads the selected Console Session and only renders the customer projection", async () => {
  const app = await render("?session_id=SESSION-A", Response.json({sessionId:"SESSION-A",lifecycle:"en_route",missionReady:true,model:{displayAllowed:true,displayName:"Model A"},etaLabel:"ถึงใน 20 นาที",internal_note:"secret",client_id:"private-client",payout_amount:9999}));
  assert.equal(app.calls[0].url, "/api/member/app/session/current?session_id=SESSION-A");
  assert.equal(app.calls[0].options.credentials, "same-origin");
  assert.equal(app.calls[0].options.method, undefined);
  assert.equal(app.panel.hidden, false);
  assert.equal(app.nodes.status.textContent, "กำลังเดินทาง");
  assert.match(app.nodes.summary.textContent, /Model A/);
  assert.doesNotMatch(JSON.stringify(app.nodes), /secret|private-client|9999/);
});

test("unpaid, foreign, unknown and failed responses never show customer details", async () => {
  for (const response of [
    Response.json({sessionId:"SESSION-B",missionReady:true,lifecycle:"en_route",model:{displayAllowed:true,displayName:"Foreign model"}}),
    Response.json({sessionId:"SESSION-A",missionReady:false,lifecycle:"confirmed",model:{displayAllowed:true,displayName:"Pending model"}}),
    Response.json({sessionId:"SESSION-A",missionReady:true,lifecycle:"unknown",model:{displayAllowed:true,displayName:"Unknown model"}}),
    Response.json({error:"secret server failure"},{status:503}),
  ]) {
    const app = await render("?session_id=SESSION-A", response);
    assert.equal(app.nodes.summary.textContent, "");
    assert.doesNotMatch(JSON.stringify(app.nodes), /Foreign model|Pending model|Unknown model|secret server/);
    assert.equal(app.calls.length, 1);
  }
});

test("unauthenticated selection returns through LINE without granting access or writing", async () => {
  const app = await render("?session_id=SESSION-A", Response.json({ok:false},{status:401}));
  assert.equal(app.nodes.login.href, "/member/liff?intent=status&session_id=SESSION-A");
  assert.equal(app.nodes.login.hidden, false);
  assert.equal(app.nodes.summary.textContent, "");
  const hidden = await render("", Response.json({ok:false},{status:401}));
  assert.equal(hidden.panel.hidden, true);
});

test("malformed and duplicate selectors never call the API or default to another job", async () => {
  for (const search of ["?session_id=", "?session_id=A&session_id=B", "?session_id=%27", "?session_id="+"x".repeat(161)]) {
    const app = await render(search, null);
    assert.equal(app.calls.length, 0);
    assert.equal(app.nodes.summary.textContent, "");
  }
});
