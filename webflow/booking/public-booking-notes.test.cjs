const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname,'public-booking-notes.js'),'utf8');
const copy = JSON.parse(fs.readFileSync(path.join(__dirname,'public-booking-notes.copy.json'),'utf8'));
test('page-scoped note enhancement is valid and within the inline script cap',()=>{
  new vm.Script(src);
  assert.ok(src.length <= 2000);
  assert.match(src,/textarea\[name="note"\]/);
  assert.match(src,/f\.maxLength=1000/);
  assert.match(src,/f\.required=false/);
  assert.match(src,/f\.rows=4/);
});
test('existing value, submit, authority and storage paths are not replaced',()=>{
  assert.doesNotMatch(src,/f\.value\s*=(?!=)|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|outerHTML|submit\s*\(/);
  assert.match(src,/aria-describedby/);
  assert.match(src,/window\.__mmdBN/);
});
test('canonical copy snapshot matches all inline translations',()=>{
  for(const lang of ['th','en','zh']) for(const key of ['label','placeholder']) assert.ok(src.includes(copy[lang][key]));
  assert.equal(copy.scope,'/booking');
  assert.equal(copy.field,'note');
  assert.doesNotMatch(src,/ครับ/);
});
