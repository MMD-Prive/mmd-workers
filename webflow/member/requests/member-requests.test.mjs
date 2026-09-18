import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html=fs.readFileSync(new URL("./member-requests.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("./member-requests.css",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("./member-requests.js",import.meta.url),"utf8");

test("member requests split page keeps one scoped root and verified endpoints",()=>{
  assert.equal((html.match(/id="mrq1"/g)||[]).length,1);
  assert.match(html,/data-profile-endpoint="\/member\/api\/liff\/profile"/);
  assert.match(html,/data-requests-endpoint=""/);
  assert.match(html,/data-mms-booking-url="\/member\/mms-booking"/);
  assert.doesNotMatch(html,/<style|<script/i);
  assert.match(css,/#mrq1/);
  assert.doesNotMatch(css,/(^|})\s*(body|html|h1|button|input)\s*[{,]/m);
  assert.match(js,/document\.getElementById\("mrq1"\)/);
  assert.match(js,/credentials:"same-origin"/);
  assert.match(js,/response\.status===401\|\|response\.status===403/);
  assert.doesNotMatch(js,/Bearer|api[_-]?key|demo request/i);
});

test("member requests UI includes loading, empty, locked, error and filtered list states",()=>{
  for(const id of ["mrq-loading","mrq-gate","mrq-error","mrq-empty","mrq-list","mrq-filter-empty"]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  for(const filter of ["all","mmd","mms","membership"]){
    assert.match(html,new RegExp(`data-filter="${filter}"`));
  }
  assert.match(js,/function showLoading/);
  assert.match(js,/function showGate/);
  assert.match(js,/function showError/);
  assert.match(js,/function showEmpty/);
});

test("editorial redesign uses the complete five-image member request series",()=>{
  for(const asset of [
    "6a8cf30a394297ff68529d44_01%20Member%20Request%20-%20Kenji.webp",
    "6a8cf30a68fd3218b6211a12_02%20Member%20Request%20-%20Hito.webp",
    "6a8cf30a6f75e5e157bc1edd_03%20Member%20Request%20-%20Hima.webp",
    "6a8cf30a08479ce19960b235_04%20Member%20Request%20-%20Hiro.webp",
    "6a8cf30a08479ce19960b249_05%20Member%20Request%20-%20Boss%20Per.webp"
  ]) assert.match(html,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(html,/class="mrq-journey mrq-shell"/);
  assert.match(html,/id="mrq-story-track"/);
  assert.match(html,/data-mrq-reveal/);
  assert.match(css,/\.mrq-story-card/);
  assert.match(css,/\.mrq-swipe-hint span\.is-active/);
  assert.doesNotMatch(css,/\.mrq-status-track/);
  assert.doesNotMatch(html,/mrq-meaning/);
  assert.match(js,/function setupEditorialMotion/);
  assert.match(js,/function setupStoryTrack/);
});
